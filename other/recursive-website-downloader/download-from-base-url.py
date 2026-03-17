#!/usr/bin/env python3
"""
Recursive Website Downloader
Downloads all reachable content from a website, staying within the same domain/subdomains.
No code is executed — files are fetched via HTTP and written to disk only.

Requirements:
    pip install requests beautifulsoup4
"""

import os
import re
import sys
import time
import hashlib
import mimetypes
from pathlib import Path
from urllib.parse import urlparse, urljoin, urldefrag
from collections import defaultdict, deque

import requests
from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent.resolve()
DOWNLOADS_DIR = SCRIPT_DIR / "downloads"

REQUEST_TIMEOUT = 20          # seconds per request
REQUEST_DELAY = 0.3           # seconds between requests (be polite)
CHUNK_SIZE = 65_536           # bytes per streaming chunk

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; RecursiveWebDownloader/1.0)"
    )
}

# MIME type → preferred file extension
MIME_TO_EXT: dict[str, str] = {
    "text/html": ".html",
    "text/css": ".css",
    "application/javascript": ".js",
    "text/javascript": ".js",
    "application/json": ".json",
    "application/ld+json": ".jsonld",
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "image/bmp": ".bmp",
    "image/avif": ".avif",
    "font/woff": ".woff",
    "font/woff2": ".woff2",
    "application/font-woff": ".woff",
    "application/font-woff2": ".woff2",
    "font/ttf": ".ttf",
    "font/otf": ".otf",
    "text/plain": ".txt",
    "application/xml": ".xml",
    "text/xml": ".xml",
}

IMAGE_EXTS  = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
               ".ico", ".bmp", ".tiff", ".tif", ".avif"}
JS_EXTS     = {".js", ".mjs", ".cjs"}
CSS_EXTS    = {".css"}
HTML_EXTS   = {".html", ".htm", ".xhtml"}
JSON_EXTS   = {".json", ".jsonld"}
PDF_EXTS    = {".pdf"}
FONT_EXTS   = {".woff", ".woff2", ".ttf", ".eot", ".otf"}


# ---------------------------------------------------------------------------
# CLI helpers
# ---------------------------------------------------------------------------

def ask_yes_no(prompt: str, default: bool = True) -> bool:
    """Prompt for a y/n answer with a default."""
    indicator = "[Y/n]" if default else "[y/N]"
    while True:
        raw = input(f"{prompt} {indicator}: ").strip().lower()
        if raw == "":
            return default
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no"):
            return False
        print("  Please enter 'y' or 'n'.")


def ask_positive_float(prompt: str) -> float:
    """Prompt for a positive floating-point number."""
    while True:
        raw = input(f"{prompt}: ").strip()
        try:
            val = float(raw)
            if val > 0:
                return val
            print("  Value must be greater than 0.")
        except ValueError:
            print("  Please enter a valid number (e.g. 10 or 2.5).")


def prompt_settings() -> dict:
    """Interactively collect all user preferences. Returns a settings dict."""
    print("\n=== Recursive Website Downloader ===")
    print("HTML, CSS, and JSON are always saved.\n")

    settings: dict = {}

    settings["save_images"] = ask_yes_no("Save images and ICO files?",   default=True)
    settings["save_js"]     = ask_yes_no("Save JavaScript (.js) files?", default=True)
    settings["save_pdf"]    = ask_yes_no("Save PDF files?",               default=True)

    settings["max_file_bytes"] = None
    if ask_yes_no("Limit maximum individual file size?", default=False):
        mb = ask_positive_float("  Maximum file size in MB (e.g. 10)")
        settings["max_file_bytes"] = int(mb * 1_048_576)

    settings["save_other"] = ask_yes_no(
        "Save 'other' files (fonts, archives, unknown types, …)?",
        default=False,
    )

    print()
    raw_url = input("Enter the website URL (e.g. https://example.com): ").strip()
    if not raw_url:
        print("No URL entered. Exiting.")
        sys.exit(1)
    if not raw_url.startswith(("http://", "https://")):
        raw_url = "https://" + raw_url

    settings["start_url"] = raw_url
    return settings


# ---------------------------------------------------------------------------
# URL / path utilities
# ---------------------------------------------------------------------------

def normalize_url(url: str, base: str) -> str | None:
    """
    Resolve url against base, strip fragment.
    Returns None for non-http(s) schemes and un-parseable values.
    """
    if not url or not isinstance(url, str):
        return None
    url = url.strip()
    # Ignore non-navigable schemes
    if url.startswith(("javascript:", "mailto:", "tel:", "data:", "#", "blob:")):
        return None
    try:
        resolved = urljoin(base, url)
        resolved, _ = urldefrag(resolved)
        parsed = urlparse(resolved)
        if parsed.scheme not in ("http", "https"):
            return None
        return resolved
    except Exception:
        return None


def netloc_of(url: str) -> str:
    """Return lowercase netloc (host[:port]) of a URL."""
    return urlparse(url).netloc.lower()


def is_same_site(url: str, base_netloc: str) -> bool:
    """
    Return True when url belongs to the same host or a subdomain of base_netloc.
    Port is ignored in the domain comparison.
    """
    host = urlparse(url).netloc.lower().split(":")[0]
    base_host = base_netloc.split(":")[0]
    return host == base_host or host.endswith("." + base_host)


_INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

def _sanitize_component(name: str) -> str:
    """Replace filesystem-invalid characters in a single path component."""
    cleaned = _INVALID_CHARS.sub("_", name)
    cleaned = cleaned.strip(". ")
    return cleaned or "_"


def url_to_local_path(url: str, output_dir: Path) -> Path:
    """
    Map a URL to a safe local path beneath output_dir.

    Rules
    -----
    - Each URL path segment is sanitised.
    - A trailing slash, or a segment with no extension, gets an 'index.html'
      appended so that directory index pages are stored as files.
    - The final path is validated to stay inside output_dir (path-traversal guard).
    - Falls back to a hash-derived name if any check fails.
    """
    parsed = urlparse(url)
    url_path = parsed.path  # e.g. /blog/post/

    segments = [s for s in url_path.split("/") if s]
    safe_segments = [_sanitize_component(s) for s in segments]

    # Determine whether we need to append 'index.html'
    if not safe_segments:
        # Root URL
        safe_segments = ["index.html"]
    else:
        last = safe_segments[-1]
        if url_path.endswith("/") or "." not in last:
            safe_segments.append("index.html")

    candidate = output_dir
    for seg in safe_segments:
        if seg in (".", ".."):
            continue
        candidate = candidate / seg

    # Guards against traversal
    try:
        candidate.resolve().relative_to(output_dir.resolve())
    except ValueError:
        fallback = hashlib.sha256(url.encode()).hexdigest()[:16]
        candidate = output_dir / f"file_{fallback}"

    return candidate


def ensure_unique_path(path: Path) -> Path:
    """If path already exists as a file, append _{n} before the extension."""
    if not path.exists():
        return path
    stem, suffix, parent = path.stem, path.suffix, path.parent
    for i in range(1, 100_000):
        candidate = parent / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
    # Extreme fallback
    return parent / f"{stem}_{hashlib.md5(str(path).encode()).hexdigest()[:8]}{suffix}"


def category_of(local_path: Path, content_type: str) -> str:
    """Classify a file into a reporting category."""
    ext = local_path.suffix.lower()
    if ext in IMAGE_EXTS:               return "image"
    if ext in JS_EXTS:                  return "javascript"
    if ext in CSS_EXTS:                 return "css"
    if ext in HTML_EXTS:                return "html"
    if ext in JSON_EXTS:                return "json"
    if ext in PDF_EXTS:                 return "pdf"
    if ext in FONT_EXTS:                return "font"
    # Fall back to content-type hints
    ct = content_type.split(";")[0].strip().lower()
    if "html" in ct:                    return "html"
    if "css" in ct:                     return "css"
    if "javascript" in ct:              return "javascript"
    if "json" in ct:                    return "json"
    if "pdf" in ct:                     return "pdf"
    if "image" in ct:                   return "image"
    if "font" in ct:                    return "font"
    return "other"


# ---------------------------------------------------------------------------
# Download gate
# ---------------------------------------------------------------------------

def should_download(url: str, settings: dict) -> bool:
    """
    Return True if this URL's file type should be downloaded given user settings.
    HTML, CSS, and JSON are always included.
    """
    ext = Path(urlparse(url).path).suffix.lower()

    # Always-on types
    if ext in HTML_EXTS or ext == "":   return True   # no ext → likely HTML
    if ext in CSS_EXTS:                 return True
    if ext in JSON_EXTS:                return True

    if ext in IMAGE_EXTS:   return settings["save_images"]
    if ext in JS_EXTS:      return settings["save_js"]
    if ext in PDF_EXTS:     return settings["save_pdf"]
    if ext in FONT_EXTS:    return settings["save_other"]

    return settings["save_other"]


# ---------------------------------------------------------------------------
# Link extraction
# ---------------------------------------------------------------------------

def extract_links_html(html_text: str, base_url: str) -> set[str]:
    """Extract every URL referenced inside an HTML document."""
    urls: set[str] = set()

    try:
        soup = BeautifulSoup(html_text, "html.parser")
    except Exception:
        return urls

    # (tag-name, attribute) pairs that carry URLs
    tag_attr_pairs = [
        ("a",       "href"),
        ("link",    "href"),
        ("script",  "src"),
        ("img",     "src"),
        ("img",     "srcset"),
        ("source",  "src"),
        ("source",  "srcset"),
        ("video",   "src"),
        ("video",   "poster"),
        ("audio",   "src"),
        ("iframe",  "src"),
        ("embed",   "src"),
        ("object",  "data"),
        ("form",    "action"),
        ("input",   "src"),
        ("use",     "href"),
        ("use",     "xlink:href"),
        ("track",   "src"),
        ("area",    "href"),
    ]

    for tag_name, attr in tag_attr_pairs:
        for tag in soup.find_all(tag_name, **{attr: True}):
            raw = tag.get(attr, "")
            if attr == "srcset":
                # "img.png 1x, img@2x.png 2x" — extract the URL part only
                for descriptor in raw.split(","):
                    candidate = descriptor.strip().split()[0] if descriptor.strip() else ""
                    u = normalize_url(candidate, base_url)
                    if u:
                        urls.add(u)
            else:
                u = normalize_url(raw, base_url)
                if u:
                    urls.add(u)

    # <meta http-equiv="refresh" content="0; url=...">
    for meta in soup.find_all("meta", attrs={"http-equiv": re.compile(r"refresh", re.I)}):
        content = meta.get("content", "")
        m = re.search(r"url\s*=\s*['\"]?([^'\";\s]+)", content, re.I)
        if m:
            u = normalize_url(m.group(1), base_url)
            if u:
                urls.add(u)

    # url(...) inside inline style attributes
    for tag in soup.find_all(style=True):
        for m in re.finditer(r'url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)', tag["style"]):
            u = normalize_url(m.group(1), base_url)
            if u:
                urls.add(u)

    # url(...) inside <style> blocks
    for style_tag in soup.find_all("style"):
        for m in re.finditer(r'url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)', style_tag.get_text()):
            u = normalize_url(m.group(1), base_url)
            if u:
                urls.add(u)

    # Lazy-load data-* attributes
    lazy_attrs = ("data-src", "data-href", "data-url", "data-original",
                  "data-lazy-src", "data-lazy", "data-image")
    for tag in soup.find_all(True):
        for attr in lazy_attrs:
            val = tag.get(attr)
            if val:
                u = normalize_url(val, base_url)
                if u:
                    urls.add(u)

    return urls


def extract_links_css(css_text: str, base_url: str) -> set[str]:
    """Extract every URL referenced inside a CSS document."""
    urls: set[str] = set()

    # url("…"), url('…'), url(…)
    for m in re.finditer(r'url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)', css_text):
        u = normalize_url(m.group(1).strip(), base_url)
        if u:
            urls.add(u)

    # @import "…" or @import '…'
    for m in re.finditer(r'@import\s+["\']([^"\']+)["\']', css_text):
        u = normalize_url(m.group(1).strip(), base_url)
        if u:
            urls.add(u)

    return urls


# ---------------------------------------------------------------------------
# HTTP fetching
# ---------------------------------------------------------------------------

def fetch(session: requests.Session, url: str, max_bytes: int | None) -> tuple[bytes | None, str]:
    """
    GET url. Returns (body_bytes, content_type) or (None, '') on any failure.
    Streams the response; aborts early if max_bytes is exceeded.
    No content is executed — bytes are returned as-is.
    """
    try:
        resp = session.get(
            url,
            timeout=REQUEST_TIMEOUT,
            stream=True,
            allow_redirects=True
        )
        resp.raise_for_status()

        content_type: str = resp.headers.get("Content-Type", "")

        # Honour Content-Length pre-check
        if max_bytes is not None:
            cl = resp.headers.get("Content-Length")
            if cl and int(cl) > max_bytes:
                print(f"  [SKIP-SIZE] {url}  ({int(cl) // 1024} KB > limit)")
                resp.close()
                return None, content_type

        # Stream and accumulate
        chunks: list[bytes] = []
        total = 0
        for chunk in resp.iter_content(chunk_size=CHUNK_SIZE):
            if not chunk:
                continue
            total += len(chunk)
            if max_bytes is not None and total > max_bytes:
                print(f"  [SKIP-SIZE] {url}  (exceeded limit during download)")
                resp.close()
                return None, content_type
            chunks.append(chunk)

        return b"".join(chunks), content_type

    except requests.exceptions.TooManyRedirects:
        print(f"  [ERROR] Too many redirects: {url}")
    except requests.exceptions.Timeout:
        print(f"  [ERROR] Timeout: {url}")
    except requests.exceptions.ConnectionError as e:
        print(f"  [ERROR] Connection error: {url}  ({e})")
    except requests.exceptions.HTTPError as e:
        print(f"  [ERROR] HTTP {e.response.status_code}: {url}")
    except Exception as e:
        print(f"  [ERROR] Unexpected error for {url}: {e}")

    return None, ""


# ---------------------------------------------------------------------------
# Safe file writing
# ---------------------------------------------------------------------------

def write_file(path: Path, data: bytes) -> None:
    """
    Write data to path, creating parent directories as needed.
    If path is an existing directory (e.g. from an earlier index.html),
    writes as path/index.html instead.
    No data is executed — bytes are written verbatim.
    """
    if path.is_dir():
        path = path / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


# ---------------------------------------------------------------------------
# Core crawler
# ---------------------------------------------------------------------------

def fmt_bytes(n: int) -> str:
    """Human-readable byte size."""
    if n < 1_024:               return f"{n} B"
    if n < 1_048_576:           return f"{n / 1_024:.1f} KB"
    if n < 1_073_741_824:       return f"{n / 1_048_576:.1f} MB"
    return f"{n / 1_073_741_824:.1f} GB"


def run(settings: dict) -> None:
    start_url: str = settings["start_url"]
    base_netloc: str = netloc_of(start_url)
    max_bytes: int | None = settings["max_file_bytes"]

    domain_folder = _sanitize_component(base_netloc)
    output_dir = DOWNLOADS_DIR / domain_folder
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nTarget  : {start_url}")
    print(f"Saving  : {output_dir}")
    print(f"Delay   : {REQUEST_DELAY}s between requests\n")

    session = requests.Session()
    session.headers.update(HEADERS)

    visited: set[str] = set()
    queue: deque[str] = deque([start_url])
    stats: dict[str, list[int]] = defaultdict(list)   # category → [file_sizes]

    counter = 0

    while queue:
        raw_url = queue.popleft()
        url, _ = urldefrag(raw_url)

        if url in visited:
            continue
        visited.add(url)

        if not is_same_site(url, base_netloc):
            continue

        if not should_download(url, settings):
            continue

        counter += 1
        print(f"[{counter}] {url}")

        body, content_type = fetch(session, url, max_bytes)
        if body is None:
            continue

        # Determine local path
        local_path = url_to_local_path(url, output_dir)

        # If the server says this is HTML but the URL has no extension, append .html
        ct_base = content_type.split(";")[0].strip().lower()
        if "text/html" in ct_base and local_path.suffix == "":
            local_path = local_path.with_suffix(".html")

        local_path = ensure_unique_path(local_path)

        # Final path-traversal guard
        try:
            local_path.resolve().relative_to(output_dir.resolve())
        except ValueError:
            print(f"  [SECURITY] Path traversal blocked for: {url}")
            continue

        try:
            write_file(local_path, body)
        except OSError as exc:
            print(f"  [ERROR] Could not write {local_path}: {exc}")
            continue

        cat = category_of(local_path, content_type)
        stats[cat].append(len(body))

        # Extract links from HTML and CSS to continue crawling
        new_links: set[str] = set()
        if "text/html" in ct_base:
            text = body.decode("utf-8", errors="replace")
            new_links = extract_links_html(text, url)
        elif "text/css" in ct_base:
            text = body.decode("utf-8", errors="replace")
            new_links = extract_links_css(text, url)

        for link in new_links:
            link, _ = urldefrag(link)
            if link not in visited and is_same_site(link, base_netloc):
                queue.append(link)

        time.sleep(REQUEST_DELAY)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print()
    print("=" * 54)
    print("  DOWNLOAD COMPLETE")
    print("=" * 54)
    print(f"  Directory : {output_dir}")
    print()

    total_files = sum(len(v) for v in stats.values())
    total_size  = sum(sum(v) for v in stats.values())

    col1, col2, col3 = 20, 8, 14
    header = f"  {'Category':<{col1}} {'Files':>{col2}} {'Size':>{col3}}"
    print(header)
    print("  " + "-" * (col1 + col2 + col3 + 2))
    for cat in sorted(stats):
        sizes = stats[cat]
        print(f"  {cat:<{col1}} {len(sizes):>{col2}} {fmt_bytes(sum(sizes)):>{col3}}")
    print("  " + "-" * (col1 + col2 + col3 + 2))
    print(f"  {'TOTAL':<{col1}} {total_files:>{col2}} {fmt_bytes(total_size):>{col3}}")
    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    try:
        settings = prompt_settings()
        run(settings)
    except KeyboardInterrupt:
        print("\n\nInterrupted. Exiting.")
        sys.exit(0)


if __name__ == "__main__":
    main()
