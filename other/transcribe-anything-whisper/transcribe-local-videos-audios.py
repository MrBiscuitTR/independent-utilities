# transcribe_long_audio_whisper_v3.py
import os
import sys
import time
from datetime import datetime
from pathlib import Path
import torch
import librosa
from transformers import pipeline
import warnings

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# ---------------- CONFIG ----------------
MODEL_NAME = "openai/whisper-large-v3"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CHUNK_LENGTH_SEC = 300           # 5 minutes — good balance of context & memory
OVERLAP_SEC = 30                 # helps continuity between chunks
SAMPLE_RATE = 16000

SAVE_DIR = Path(__file__).parent / "transcriptions"
SAVE_DIR.mkdir(parents=True, exist_ok=True)

# ----------------------------------------

def get_timestamp():
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

def seconds_to_hhmmss(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"
    return f"{minutes:02d}:{secs:02d}.{millis:03d}"

def load_model():
    print(f"Loading {MODEL_NAME} on {DEVICE} ...")
    t0 = time.time()

    pipe = pipeline(
        "automatic-speech-recognition",
        model=MODEL_NAME,
        device=0 if DEVICE == "cuda" else -1,
        torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32,
    )

    print(f"Model loaded in {time.time() - t0:.1f} seconds\n")
    return pipe

def chunk_audio(audio_path: str, chunk_sec: int, overlap_sec: int, sr: int = SAMPLE_RATE):
    """Yield (start_sec, audio_chunk_numpy)"""
    duration = librosa.get_duration(path=audio_path)
    step = chunk_sec - overlap_sec

    pos = 0.0
    while pos < duration:
        chunk_duration = min(chunk_sec, duration - pos)
        offset = pos
        y, _ = librosa.load(
            audio_path,
            sr=sr,
            offset=offset,
            duration=chunk_duration,
            mono=True
        )
        yield pos, y
        pos += step
        if pos >= duration:
            break

def main():
    if len(sys.argv) < 2:
        print("Usage: python transcribe_long_audio_whisper_v3.py \"path/to/video_or_audio\"")
        sys.exit(1)

    input_path = sys.argv[1].strip('"')
    if not os.path.isfile(input_path):
        print(f"File not found: {input_path}")
        sys.exit(1)

    abs_path = os.path.abspath(input_path)
    print(f"Input file: {abs_path}")

    output_filename = f"{get_timestamp()}.txt"
    output_path = SAVE_DIR / output_filename
    print(f"Transcription will be saved to: {output_path}\n")

    pipe = load_model()

    try:
        duration = librosa.get_duration(path=abs_path)
        print(f"Duration: {seconds_to_hhmmss(duration)} ({duration:.1f} s)\n")

        chunks = list(chunk_audio(abs_path, CHUNK_LENGTH_SEC, OVERLAP_SEC))
        total_chunks = len(chunks)

        print(f"Will process {total_chunks} chunks (~{CHUNK_LENGTH_SEC//60} min each)\n")

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"File: {abs_path}\n")
            f.write(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Model: {MODEL_NAME}\n")
            f.write(f"Device: {DEVICE}\n\n")
            f.flush()

            for i, (start_sec, audio_chunk) in enumerate(chunks, 1):
                chunk_start_str = seconds_to_hhmmss(start_sec)
                print(f"[{i}/{total_chunks}] {chunk_start_str} → ", end="", flush=True)

                try:
                    result = pipe(
                        audio_chunk,
                        return_timestamps=True,
                        generate_kwargs={
                            "language": None,       # auto-detect
                            "task": "transcribe",   # NOT translate
                        }
                    )

                    text = result["text"].strip()

                    # Write full chunk text with start time
                    f.write(f"[{chunk_start_str}]\n{text}\n\n")

                    # If sentence-level timestamps are available, write them too
                    if "chunks" in result:
                        f.write("Detailed chunks:\n")
                        for c in result["chunks"]:
                            ts = c.get("timestamp", (None, None))
                            if ts[0] is not None and ts[1] is not None:
                                s = start_sec + ts[0]
                                e = start_sec + ts[1]
                                ts_str = f"{seconds_to_hhmmss(s)} → {seconds_to_hhmmss(e)}"
                                f.write(f"[{ts_str}] {c['text'].strip()}\n")
                            else:
                                f.write(f"{c['text'].strip()}\n")
                        f.write("\n")

                    f.flush()

                    preview = text[:80] + ("..." if len(text) > 80 else "")
                    print(preview)

                except Exception as e:
                    print(f"ERROR: {str(e)}")
                    f.write(f"[ERROR at {chunk_start_str}] {str(e)}\n\n")
                    f.flush()

        print(f"\nDone! Transcription saved to: {output_path}")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user. Partial transcription saved.")
        sys.exit(130)
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()