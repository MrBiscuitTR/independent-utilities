"""
deepseekocr-outpdf.py

Runs DeepSeek OCR (via Ollama) on a PDF or image and saves a PDF output.
At startup you choose a mode:

  1. OCR reconstruct  — clean white PDF, text/LaTeX placed at detected bounding boxes
  2. Describe         — plain prose description of the image, written into a PDF
  3. Locate / custom  — original image kept; bounding boxes drawn over it with labels
                        (works for "Locate <|ref|>X<|/ref|>",
                                    "Identify all objects ...",
                                    or any custom grounding prompt)

Requirements:
    pip install pymupdf pillow reportlab matplotlib ollama
    ollama pull deepseek-ocr:latest
"""

import io
import re
import sys
import textwrap
from pathlib import Path
from typing import List, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from ollama import generate

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
MODEL_NAME = "deepseek-ocr:latest"
KEEPALIVE  = 5          # DO NOT CHANGE
PDF_ZOOM   = 2.0        # rasterise input PDFs at 2× for accuracy

OUTPUT_DIR = Path(__file__).parent / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ─────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────
PROMPT_OCR      = "<|grounding|>Convert the document to markdown."
PROMPT_DESCRIBE = "Describe this image in detail."
# Locate / identify prompts are entered interactively by the user.
# They follow these patterns (model expects the image token to already be
# injected by the Ollama multimodal pipeline):
#   Locate <|ref|>the teacher<|/ref|> in the image.
#   Locate <|ref|>11-2 =<|/ref|> in the image.
#   Identify all objects in the image and output them in bounding boxes.

# ─────────────────────────────────────────────
# MODES
# ─────────────────────────────────────────────
MODE_OCR      = "ocr"       # reconstruct clean PDF from detected layout
MODE_DESCRIBE = "describe"  # prose description → PDF text
MODE_OVERLAY  = "overlay"   # keep original image, draw bbox overlays

# ─────────────────────────────────────────────
# PDF → IMAGES
# ─────────────────────────────────────────────

def pdf_to_images(pdf_path: Path, zoom: float = PDF_ZOOM) -> List[Image.Image]:
    import fitz
    doc = fitz.open(str(pdf_path))
    mat = fitz.Matrix(zoom, zoom)
    images = []
    for page in doc:
        pix = page.get_pixmap(matrix=mat)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        images.append(img)
    doc.close()
    return images

# ─────────────────────────────────────────────
# OLLAMA CALL
# ─────────────────────────────────────────────

def _cap_image(img: Image.Image, max_side: int = 2000) -> Image.Image:
    """Resize so the longest side is at most max_side, preserving aspect ratio."""
    w, h = img.size
    if max(w, h) <= max_side:
        return img
    scale = max_side / max(w, h)
    return img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def run_model(img: Image.Image, prompt: str) -> Tuple[str, Image.Image]:
    """
    Send img to the model and return (raw_response, resized_img).
    resized_img is the exact image the model saw — use its dimensions for coord mapping.
    """
    img = _cap_image(img)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    img_bytes = buf.getvalue()

    full = ""
    sys.stdout.write("  > model")
    sys.stdout.flush()
    for chunk in generate(
        model=MODEL_NAME,
        prompt=prompt,
        images=[img_bytes],
        keep_alive=KEEPALIVE,
        stream=True,
    ):
        full += chunk.get("response", "")
        sys.stdout.write(".")
        sys.stdout.flush()
    sys.stdout.write(" done\n")
    sys.stdout.flush()
    return full, img

# ─────────────────────────────────────────────
# PARSER  (bounding-box output)
# ─────────────────────────────────────────────
#
# Output format (one block per detected element):
#
#   <|ref|>label<|/ref|><|det|>[[x1,y1,x2,y2],[x1,y1,x2,y2],...]<|/det|>
#   optional content text / LaTeX on the following line(s)
#
# A single <|det|> block may contain MULTIPLE boxes — each becomes its own entry
# sharing the same label and content.
# Coordinates are pixel values in the input image (top-left origin).

# Captures: label | full det body | trailing content
_BLOCK_RE = re.compile(
    r"<\|ref\|>(.*?)<\|/ref\|>"
    r"\s*<\|det\|>(.*?)<\|/det\|>"
    r"([^\n<]*(?:\n(?!<\|ref\|>)[^\n<]*)*)",
    re.DOTALL,
)

# Extracts each [x1,y1,x2,y2] from the det body
_BOX_RE = re.compile(r"\[(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]")


def parse_bbox_output(raw: str) -> List[Tuple[Tuple[int,int,int,int], str, str]]:
    """
    Returns list of (bbox, label, content).
    bbox    = (x1,y1,x2,y2) pixel coords relative to input image
    label   = text inside <|ref|>…<|/ref|>
    content = text on the line(s) after <|/det|>, stripped (may be empty)
    Each box in a multi-box det block becomes a separate entry.
    """
    results = []
    for m in _BLOCK_RE.finditer(raw):
        label   = m.group(1).strip()
        det_body = m.group(2)
        content = m.group(3).strip()
        for bm in _BOX_RE.finditer(det_body):
            x1, y1, x2, y2 = int(bm.group(1)), int(bm.group(2)), int(bm.group(3)), int(bm.group(4))
            if x2 > x1 and y2 > y1:
                results.append(((x1, y1, x2, y2), label, content))
    return results

# ─────────────────────────────────────────────
# LATEX DETECTION & RENDERING
# ─────────────────────────────────────────────

_LATEX_RE = re.compile(r"\\\[|\\\]|\$\$|\\\(|\\\)|\\[a-zA-Z]")

def is_latex(text: str) -> bool:
    return bool(_LATEX_RE.search(text))


def render_latex_to_png(latex: str, box_w_pt: float, box_h_pt: float,
                        dpi: int = 150) -> Image.Image:
    r"""
    Render LaTeX/mathtext to a white-background PNG matching the bbox dimensions.
    Strips \[…\] / $$…$$ delimiters and wraps in $…$ for matplotlib mathtext.
    Falls back to plain monospace on parse failure.
    """
    fig_w = max(box_w_pt / dpi, 0.4)
    fig_h = max(box_h_pt / dpi, 0.2)

    cleaned = latex.strip()
    # Strip known display-math wrappers
    for s, e in [(r"\[", r"\]"), ("$$", "$$"), (r"\(", r"\)")]:
        if cleaned.startswith(s) and cleaned.endswith(e):
            cleaned = cleaned[len(s):-len(e)].strip()
            break
    cleaned = cleaned.strip("$").strip()
    display_str = f"${cleaned}$"

    def _fig():
        fig, ax = plt.subplots(figsize=(fig_w, fig_h))
        fig.patch.set_facecolor("white")
        ax.set_axis_off()
        ax.set_position([0, 0, 1, 1])
        return fig, ax

    fig, ax = _fig()
    try:
        ax.text(0.5, 0.5, display_str,
                ha="center", va="center",
                fontsize=12, color="black",
                transform=ax.transAxes, usetex=False)
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=dpi,
                    facecolor="white", bbox_inches="tight", pad_inches=0.03)
        plt.close(fig)
        buf.seek(0)
        return Image.open(buf).convert("RGBA")
    except Exception:
        plt.close(fig)

    # Fallback — raw monospace
    fig, ax = _fig()
    ax.text(0.5, 0.5, latex.strip(),
            ha="center", va="center",
            fontsize=9, fontfamily="monospace", color="black",
            transform=ax.transAxes, wrap=True)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi,
                facecolor="white", bbox_inches="tight", pad_inches=0.03)
    plt.close(fig)
    buf.seek(0)
    return Image.open(buf).convert("RGBA")

# ─────────────────────────────────────────────
# FONT SIZE HELPER
# ─────────────────────────────────────────────

def fit_font_size(c: canvas.Canvas, text: str, max_w: float, max_h: float,
                  font: str = "Helvetica") -> float:
    """
    Return the largest font size (pts) such that:
      - text fits within max_w horizontally, AND
      - font size ≤ max_h * 0.85  (leave a small margin inside the box)
    Floor is 5pt.
    """
    # Start from bbox height — one text line should fill ~85 % of box height
    size = max(5.0, max_h * 0.85)
    while size > 5.0 and c.stringWidth(text, font, size) > max_w:
        size = max(5.0, size - 0.5)
    return size

# ─────────────────────────────────────────────
# MODE 1: OCR RECONSTRUCT — clean white PDF
# ─────────────────────────────────────────────

def build_ocr_page(c: canvas.Canvas,
                   elements: List[Tuple[Tuple[int,int,int,int], str, str]],
                   pdf_w: float, pdf_h: float):
    """White page, each element placed at its bbox."""
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, pdf_w, pdf_h, fill=1, stroke=0)

    # Model outputs coordinates in [0, 1000) normalized space
    sx = pdf_w / 1000.0
    sy = pdf_h / 1000.0

    for (x1, y1, x2, y2), label, content in elements:
        # Coords are [0,1000) normalized — clamp to that range
        x1 = max(0, min(x1, 1000)); x2 = max(0, min(x2, 1000))
        y1 = max(0, min(y1, 1000)); y2 = max(0, min(y2, 1000))

        bw = (x2 - x1) * sx
        bh = (y2 - y1) * sy
        if bw < 2 or bh < 2:
            continue

        pdf_x     = x1 * sx
        pdf_y_bot = pdf_h - y2 * sy   # PDF y is bottom-up; y2 is the bottom of the box

        # Use content if present, otherwise fall back to label
        text = content if content else label

        if is_latex(text):
            # ── visible rendered math image ──
            img_png = render_latex_to_png(text, bw, bh)
            buf = io.BytesIO(); img_png.save(buf, format="PNG"); buf.seek(0)
            c.drawImage(ImageReader(buf), pdf_x, pdf_y_bot,
                        width=bw, height=bh,
                        preserveAspectRatio=False, mask="auto")
            # hidden selectable LaTeX source
            c.saveState()
            c.setFont("Courier", max(1.0, min(bh * 0.4, 12)))
            to = c.beginText(pdf_x, pdf_y_bot + bh * 0.3)
            to.setTextRenderMode(3)
            to.textLine(text)
            c.drawText(to); c.restoreState()

        else:
            # ── visible plain / title text ──
            c.saveState()
            c.setFillColorRGB(0, 0, 0)
            font_size = fit_font_size(c, text, bw, bh)
            c.setFont("Helvetica", font_size)
            # vertically centre baseline inside box
            baseline = pdf_y_bot + (bh - font_size) * 0.5
            to = c.beginText(pdf_x, baseline)
            to.setTextRenderMode(0)
            to.textLine(text)
            c.drawText(to); c.restoreState()

    c.showPage()

# ─────────────────────────────────────────────
# MODE 2: DESCRIBE — prose text into PDF
# ─────────────────────────────────────────────

def build_describe_page(c: canvas.Canvas, raw_text: str,
                        pdf_w: float, pdf_h: float):
    """Flow the description text onto a white page with word-wrap."""
    c.setFillColorRGB(1, 1, 1)
    c.rect(0, 0, pdf_w, pdf_h, fill=1, stroke=0)

    margin    = 50
    font_size = 11
    leading   = font_size * 1.4
    col_w     = pdf_w - 2 * margin
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica", font_size)

    # Wrap each paragraph
    y = pdf_h - margin
    for para in raw_text.split("\n"):
        para = para.strip()
        if not para:
            y -= leading * 0.5
            continue
        # chars per line estimate
        avg_char_w = c.stringWidth("x", "Helvetica", font_size)
        chars_per_line = max(1, int(col_w / avg_char_w))
        for line in textwrap.wrap(para, width=chars_per_line) or [""]:
            if y < margin + leading:
                c.showPage()
                c.setFillColorRGB(1, 1, 1)
                c.rect(0, 0, pdf_w, pdf_h, fill=1, stroke=0)
                c.setFillColorRGB(0, 0, 0)
                c.setFont("Helvetica", font_size)
                y = pdf_h - margin
            c.drawString(margin, y, line)
            y -= leading

    c.showPage()

# ─────────────────────────────────────────────
# MODE 3: OVERLAY — original image + bbox boxes
# ─────────────────────────────────────────────

# Cycle through distinct colours for multiple boxes
_BOX_COLOURS = [
    (220,  50,  50),   # red
    ( 50, 160,  50),   # green
    ( 50,  80, 220),   # blue
    (200, 120,  20),   # orange
    (160,  40, 200),   # purple
    ( 20, 180, 180),   # teal
]


def draw_overlay(img: Image.Image,
                 boxes: List[Tuple[Tuple[int,int,int,int], str, str]]) -> Image.Image:
    """
    Draw coloured bounding boxes + label chips on a copy of the image.
    Each box: thick outline rectangle + filled label badge at top-left.
    Coords are in [0,1000) normalized space — scaled to image pixels here.
    """
    out = img.copy().convert("RGB")
    draw = ImageDraw.Draw(out, "RGBA")
    iw, ih = img.size
    sx, sy = iw / 1000.0, ih / 1000.0

    # Try to get a reasonable font; fall back to default
    try:
        font = ImageFont.truetype("arial.ttf", size=max(14, ih // 40))
    except Exception:
        font = ImageFont.load_default()

    for idx, ((nx1, ny1, nx2, ny2), label, _) in enumerate(boxes):
        # Scale from normalized [0,1000) to image pixels
        x1, y1 = int(nx1 * sx), int(ny1 * sy)
        x2, y2 = int(nx2 * sx), int(ny2 * sy)
        colour = _BOX_COLOURS[idx % len(_BOX_COLOURS)]
        fill_a = colour + (40,)    # semi-transparent fill
        line_c = colour + (220,)

        # Rectangle fill + border
        draw.rectangle([x1, y1, x2, y2], fill=fill_a,
                       outline=line_c, width=3)

        # Label badge
        badge_text = label if label else f"box {idx+1}"
        try:
            tw = font.getlength(badge_text)
        except AttributeError:
            tw = len(badge_text) * 8   # fallback estimate
        th = max(14, ih // 40)
        pad = 4
        bx1, by1 = x1, max(0, y1 - th - pad * 2)
        bx2, by2 = int(x1 + tw + pad * 2), y1
        draw.rectangle([bx1, by1, bx2, by2],
                       fill=colour + (200,), outline=colour + (255,))
        draw.text((bx1 + pad, by1 + pad), badge_text,
                  fill=(255, 255, 255), font=font)

    return out


def build_overlay_page(c: canvas.Canvas,
                       img: Image.Image,
                       boxes: List[Tuple[Tuple[int,int,int,int], str, str]],
                       pdf_w: float, pdf_h: float):
    """Draw the annotated image filling the page."""
    annotated = draw_overlay(img, boxes)
    buf = io.BytesIO(); annotated.save(buf, format="PNG"); buf.seek(0)
    c.drawImage(ImageReader(buf), 0, 0, width=pdf_w, height=pdf_h)
    c.showPage()

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def choose_mode() -> Tuple[str, str]:
    """
    Interactive prompt.  Returns (mode, prompt_string).
    """
    print()
    print("Select mode:")
    print("  1) OCR reconstruct   — clean PDF from detected layout")
    print("  2) Describe          — prose description of the image")
    print("  3) Locate            — locate a specific thing  (draws boxes over image)")
    print("  4) Identify objects  — identify all objects     (draws boxes over image)")
    print("  5) Custom prompt     — enter your own prompt    (draws boxes if model returns them)")
    print()
    choice = input("Choice [1-5]: ").strip()

    if choice == "1":
        return MODE_OCR, PROMPT_OCR

    if choice == "2":
        return MODE_DESCRIBE, PROMPT_DESCRIBE

    if choice == "3":
        thing = input("What to locate? e.g. 'the teacher' or '11-2 ='\n> ").strip()
        prompt = f"Locate <|ref|>{thing}<|/ref|> in the image."
        return MODE_OVERLAY, prompt

    if choice == "4":
        return MODE_OVERLAY, "Identify all objects in the image and output them in bounding boxes."

    if choice == "5":
        prompt = input("Enter prompt:\n> ").strip()
        # If it contains <|ref|> or "bounding box" language treat as overlay
        if "<|ref|>" in prompt or "bounding box" in prompt.lower() or "locate" in prompt.lower():
            return MODE_OVERLAY, prompt
        return MODE_DESCRIBE, prompt   # plain text answer

    # default
    print("Unrecognised — defaulting to OCR reconstruct.")
    return MODE_OCR, PROMPT_OCR


def process_file(input_path: str, mode: str, prompt: str):
    p = Path(input_path.strip().strip('"').strip("'"))
    if not p.exists():
        print(f"Error: file not found: {p}")
        return

    suffix = p.suffix.lower()
    if suffix == ".pdf":
        print("Rasterising PDF...")
        pages = pdf_to_images(p)
    elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"}:
        pages = [Image.open(p).convert("RGB")]
    else:
        print(f"Unsupported file type: {suffix}")
        return

    base    = p.stem
    pdf_out = OUTPUT_DIR / f"{base}_ocr.pdf"
    md_out  = OUTPUT_DIR / f"{base}_ocr.md"

    md_parts: List[str] = []
    page_data = []

    for i, img in enumerate(pages):
        print(f"\n--- Page {i+1}/{len(pages)} ({img.width}×{img.height}px) ---")
        raw, model_img = run_model(img, prompt)
        print(f"  Model saw: {model_img.width}×{model_img.height}px")
        md_parts.append(f"## Page {i+1}\n\n{raw}\n")
        boxes = parse_bbox_output(raw)
        print(f"  {len(boxes)} bbox(es) detected")
        # Store model_img — bbox coords are in model_img's pixel space
        page_data.append((model_img, boxes, raw))

    c = canvas.Canvas(str(pdf_out))

    for i, (img, boxes, raw) in enumerate(page_data):
        img_w, img_h = img.size
        # Set PDF page to exactly the image pixel dimensions (1 pt per px).
        # This means bbox pixel coords map 1:1 to PDF points — no DPI guessing.
        pdf_w = float(img_w)
        pdf_h = float(img_h)
        c.setPageSize((pdf_w, pdf_h))

        if mode == MODE_OCR:
            if not boxes:
                print(f"  Page {i+1}: no bboxes — raw text fallback")
                build_describe_page(c, raw, pdf_w, pdf_h)
            else:
                build_ocr_page(c, boxes, pdf_w, pdf_h)

        elif mode == MODE_DESCRIBE:
            build_describe_page(c, raw, pdf_w, pdf_h)

        elif mode == MODE_OVERLAY:
            if not boxes:
                print(f"  Page {i+1}: no bboxes in response — embedding image only")
                buf = io.BytesIO(); img.save(buf, format="PNG"); buf.seek(0)
                c.drawImage(ImageReader(buf), 0, 0, width=pdf_w, height=pdf_h)
                c.showPage()
            else:
                build_overlay_page(c, img, boxes, pdf_w, pdf_h)

    c.save()

    with open(md_out, "w", encoding="utf-8") as f:
        f.write("\n".join(md_parts))

    print(f"\nDone.")
    print(f"  PDF: {pdf_out}")
    print(f"  MD:  {md_out}")


if __name__ == "__main__":
    try:
        file_path = input("Enter path to PDF or image: ").strip()
        mode, prompt = choose_mode()
        process_file(file_path, mode, prompt)
    except KeyboardInterrupt:
        print("\nAborted.")
