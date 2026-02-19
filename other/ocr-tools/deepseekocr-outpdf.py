import os
import io
import re
import fitz  # PyMuPDF
from pathlib import Path
from typing import List, Tuple, Union
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import ImageReader
import matplotlib.pyplot as plt
from ollama import generate

# ------------------------
# CONFIGURATION
# ------------------------
MODEL_NAME = "deepseek-ocr:latest"
KEEPALIVE = 5
RENDER_DPI = 300 
OUTPUT_DIR = Path(__file__).parent / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------
# UTILITY FUNCTIONS
# ------------------------

def pdf_to_images(pdf_path: Path, zoom: float = 2.0) -> List[Image.Image]:
    """Convert PDF to high-res images."""
    doc = fitz.open(pdf_path)
    images = []
    mat = fitz.Matrix(zoom, zoom)
    for page in doc:
        pix = page.get_pixmap(matrix=mat)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        images.append(img)
    return images

def render_latex_to_image(latex_str: str, dpi: int = 300) -> Image.Image:
    """Render LaTeX/Text to a high-quality transparent PNG."""
    fig = plt.figure(figsize=(0.01, 0.01))
    fig.patch.set_alpha(0)
    plt.axis('off')
    
    content = latex_str.strip()
    # If it looks like pure text, we don't force math mode, 
    # but DeepSeek often mixes them. Let's try to render as is first.
    # If it fails, we wrap in $...$
    if not content.startswith('$') and '\\' in content:
         content = f"${content}$"

    # Use a basic serif font to mimic LaTeX look
    plt.text(0, 0, content, fontsize=12, va='bottom', ha='left', fontname='DejaVu Serif')
    
    buf = io.BytesIO()
    try:
        plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0.05, transparent=True, dpi=dpi)
    except Exception:
        # Retry with forced math mode if first attempt failed (often due to missing $ for math symbols)
        plt.clf()
        plt.axis('off')
        plt.text(0, 0, f"${content}$", fontsize=12, va='bottom', ha='left')
        try:
            plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0.05, transparent=True, dpi=dpi)
        except Exception:
            plt.close(fig)
            return Image.new('RGBA', (1, 1), (0, 0, 0, 0))
            
    plt.close(fig)
    buf.seek(0)
    return Image.open(buf)

def deepseek_ocr_call(image_bytes: bytes) -> str:
    """Call Ollama with bytes."""
    prompt = "<|grounding|>OCR this image."
    full_response = ""
    print("  > Sending to Ollama...")
    
    for response in generate(
        model=MODEL_NAME,
        prompt=prompt,
        images=[image_bytes],
        keep_alive=KEEPALIVE,
        stream=True
    ):
        full_response += response.get("response", "")
        
    return full_response

def parse_model_output(raw_text: str) -> List[Tuple[List[int], str]]:
    """
    Parse DeepSeek output format:
    <|ref|>Content...<|/ref|><|det|>[[x1,y1,x2,y2]]<|/det|>
    """
    results = []
    
    # Updated Regex to match the format in your logs
    # 1. Capture content inside <|ref|>...</ref>
    # 2. Capture coords inside <|det|>[[...]]</det>
    pattern = re.compile(
        r"<\|ref\|>(.*?)<\|/ref\|>\s*<\|det\|>\[\[\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\]\]<\|/det\|>", 
        re.DOTALL
    )
    
    matches = pattern.findall(raw_text)
    for match in matches:
        try:
            # match structure: (content, x1, y1, x2, y2)
            content = match[0].strip()
            x1, y1, x2, y2 = map(int, match[1:])
            
            if not content: continue
            
            # Append as (bbox, content)
            results.append(([x1, y1, x2, y2], content))
        except ValueError:
            continue
            
    return results

# ------------------------
# MAIN PROCESSING
# ------------------------

def process_file(input_path: str):
    input_path = Path(input_path.strip().replace('"', '').replace("'", ""))
    
    if not input_path.exists():
        print("File not found.")
        return

    base_name = input_path.stem
    pdf_out_path = OUTPUT_DIR / f"{base_name}_reconstructed.pdf"
    md_out_path = OUTPUT_DIR / f"{base_name}_extracted.md"
    
    c = canvas.Canvas(str(pdf_out_path), pagesize=letter)
    rl_w, rl_h = letter
    
    pages = []
    if input_path.suffix.lower() == ".pdf":
        print("Converting PDF pages to images...")
        pages = pdf_to_images(input_path, zoom=2.0)
    else:
        pages = [Image.open(input_path)]

    all_markdown_text = []

    for i, img in enumerate(pages):
        print(f"\n--- Processing Page {i+1}/{len(pages)} ---")
        
        # 1. OCR
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        img_bytes = buf.getvalue()
        
        raw_output = deepseek_ocr_call(img_bytes)
        all_markdown_text.append(f"## Page {i+1}\n\n{raw_output}\n")
        
        # 2. Parse
        elements = parse_model_output(raw_output)
        
        if not elements:
            print("  ! No bounding boxes detected. (Regex mismatch or empty output)")
            c.drawString(50, rl_h - 50, f"Page {i+1}: No layout detected. See Markdown.")
            c.showPage()
            continue
            
        print(f"  > Found {len(elements)} items. Rendering...")

        # 3. Calculate Scale
        max_coord_val = max([max(bbox) for bbox, _ in elements])
        img_w, img_h = img.size
        
        # DeepSeek typically uses 1000x1000 normalization
        if max_coord_val <= 1000:
            scale_x = rl_w / 1000
            scale_y = rl_h / 1000
            print(f"  > Mode: 0-1000 Normalized. Scale: {scale_x:.3f}")
        else:
            scale_x = rl_w / img_w
            scale_y = rl_h / img_h
            print(f"  > Mode: Pixel Coordinates. Scale: {scale_x:.3f}")

        # 4. Render
        for bbox, content in elements:
            x1, y1, x2, y2 = bbox
            
            latex_img = render_latex_to_image(content, dpi=RENDER_DPI)
            
            # Map coords
            pdf_x = x1 * scale_x
            pdf_y1 = y1 * scale_y
            pdf_y2 = y2 * scale_y
            
            pdf_width = (x2 - x1) * scale_x
            pdf_height = abs(pdf_y2 - pdf_y1)
            
            # Flip Y (DeepSeek y1 is top, PDF y is bottom-up)
            # We want the top of the image to be at (PageHeight - y_top)
            # In normalized coords, y1 is top.
            draw_y = rl_h - pdf_y2 
            
            try:
                c.drawImage(
                    ImageReader(latex_img), 
                    pdf_x, 
                    draw_y, 
                    width=pdf_width, 
                    height=pdf_height, 
                    mask='auto'
                )
            except Exception as e:
                print(f"    Error drawing item: {e}")

        c.showPage()

    c.save()
    
    with open(md_out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(all_markdown_text))
        
    print(f"\nDONE.\nPDF: {pdf_out_path}\nMD: {md_out_path}")

if __name__ == "__main__":
    try:
        f_path = input("Enter path to PDF: ").strip().replace('"', '').replace("'", "")
        process_file(f_path)
    except KeyboardInterrupt:
        print("\nAborted.")