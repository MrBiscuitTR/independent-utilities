import os
import tempfile
from pathlib import Path
from datetime import datetime
import torch
from transformers import AutoProcessor, AutoModelForSpeechSeq2Seq
import torchaudio
import yt_dlp

# Directory for saving transcriptions
TRANSCRIPTION_DIR = Path("./transcriptions")
TRANSCRIPTION_DIR.mkdir(exist_ok=True)

# Absolute path to your FFmpeg
FFMPEG_PATH = r"C:\Users\cagan\Desktop\Apps\ffmpeg-master-latest-win64-gpl-shared\ffmpeg-master-latest-win64-gpl-shared\bin\ffmpeg.exe"

def download_media(url: str, mode: int) -> str:
    """
    mode=1: direct audio / YouTube / RSS page
    mode=2: DASH manifest URL
    Returns local path to downloaded audio file.
    Requires FFmpeg to merge DASH streams.
    """
    temp_dir = tempfile.mkdtemp()
    output_path = os.path.join(temp_dir, "audio.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "quiet": True,
        "ignoreerrors": True,
        "noplaylist": True,
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "m4a"}],
        "ffmpeg_location": FFMPEG_PATH  # Use the absolute path to ffmpeg.exe
    }

    if mode == 1:
        # Direct audio / YouTube / RSS
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise ValueError(f"Could not download media from {url}")
            ext = info.get("ext", "m4a")
            return os.path.join(temp_dir, f"audio.{ext}")
    elif mode == 2:
        # DASH manifest URL
        ydl_opts.update({"merge_output_format": "m4a"})
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise ValueError(f"Could not download DASH media from {url}")
            ext = info.get("ext", "m4a")
            return os.path.join(temp_dir, f"audio.{ext}")
    else:
        raise ValueError("Invalid mode, must be 1 or 2")

def chunk_audio(waveform, sample_rate, max_duration=30):
    num_samples = max_duration * sample_rate
    chunks = []
    total_samples = waveform.shape[1]
    for start in range(0, total_samples, num_samples):
        end = min(start + num_samples, total_samples)
        chunks.append(waveform[:, start:end])
    return chunks

def transcribe_audio(audio_path: str) -> str:
    device = "cuda" if torch.cuda.is_available() else "cpu"

    processor = AutoProcessor.from_pretrained("openai/whisper-large-v3", local_files_only=True)
    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        "openai/whisper-large-v3",
        dtype=torch.float16 if device=="cuda" else torch.float32,
        local_files_only=True
    ).to(device)

    waveform, sample_rate = torchaudio.load(audio_path)
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    waveform = waveform.to(torch.float32)

    chunks = chunk_audio(waveform, sample_rate, max_duration=30)
    transcription = ""

    for i, chunk in enumerate(chunks):
        inputs = processor(chunk, sampling_rate=sample_rate, return_tensors="pt").to(device)
        with torch.no_grad():
            generated_ids = model.generate(**inputs)
            text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
            transcription += text.strip() + "\n"

    return transcription

if __name__ == "__main__":
    print("Choose media type:")
    print("1 = Direct audio / YouTube / RSS page")
    print("2 = DASH manifest URL")
    mode = int(input("Enter 1 or 2: ").strip())
    url = input("Enter the media URL: ").strip()

    try:
        audio_file = download_media(url, mode)
        print(f"Downloaded audio to: {audio_file}")

        transcription = transcribe_audio(audio_file)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = TRANSCRIPTION_DIR / f"{timestamp}.txt"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(transcription)

        print(f"Transcription saved to: {output_file}")

    except Exception as e:
        print(f"Error: {e}")
        if "DASH" in str(e):
            print("Note: For fully fragmented DASH manifests, merging requires FFmpeg.")
