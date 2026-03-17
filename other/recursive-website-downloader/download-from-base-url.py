#!/usr/bin/env python3
"""
Recursive Website Downloader

Downloads all reachable content from a website, staying within the same domain/subdomains.
No code is executed — files are fetched via HTTP and written to disk (./downloads/[domainname]/) only.
Parallel, with live progress, ANSI colours, and relative-URL rewriting so
saved sites open correctly from the local filesystem.

Requirements:
    pip install requests beautifulsoup4
"""

import os
import re
import sys
import time
import shutil
import hashlib
import threading
import queue as queue_module
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse, urljoin, urldefrag

import requests
from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# ANSI colours
# ---------------------------------------------------------------------------

if sys.platform == "win32":
    os.system("")          # enable VT-100 processing in Windows Terminal

class C:
    RST    = "\033[0m"
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    GREEN  = "\033[32m"
    RED    = "\033[31m"
    YELLOW = "\033[33m"
    CYAN   = "\033[36m"
    WHITE  = "\033[97m"


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR    = Path(__file__).parent.resolve()
DOWNLOADS_DIR = SCRIPT_DIR / "downloads"

MAX_WORKERS      = 8
REQUEST_TIMEOUT  = 20         # seconds
CHUNK_SIZE       = 65_536     # bytes per streaming chunk

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; RecursiveWebDownloader/1.0)"}

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
              ".ico", ".bmp", ".tiff", ".tif", ".avif"}
JS_EXTS    = {".js", ".mjs", ".cjs"}
CSS_EXTS   = {".css"}
HTML_EXTS  = {".html", ".htm", ".xhtml"}
JSON_EXTS  = {".json", ".jsonld"}
PDF_EXTS   = {".pdf"}
FONT_EXTS  = {".woff", ".woff2", ".ttf", ".eot", ".otf"}


# ---------------------------------------------------------------------------
# Per-thread HTTP session  (thread-safe; no shared state inside Session)
# ---------------------------------------------------------------------------

_tls = threading.local()

def _session() -> requests.Session:
    if not hasattr(_tls, "s"):
        s = requests.Session()
        s.headers.update(HEADERS)
        _tls.s = s
    return _tls.s


# ---------------------------------------------------------------------------
# CLI helpers
# ---------------------------------------------------------------------------

def ask_yes_no(prompt: str, default: bool = True) -> bool:
    tag = "[Y/n]" if default else "[y/N]"
    while True:
        raw = input(f"{prompt} {tag}: ").strip().lower()
        if raw == "":      return default
        if raw in ("y", "yes"): return True
        if raw in ("n", "no"):  return False
        print("  Please enter y or n.")


def ask_positive_float(prompt: str) -> float:
    while True:
        try:
            v = float(input(f"{prompt}: ").strip())
            if v > 0:
                return v
            print("  Must be greater than 0.")
        except ValueError:
            print("  Enter a number, e.g. 10 or 2.5.")


def prompt_settings() -> dict:
    print(f"\n{C.BOLD}{C.CYAN}=== Recursive Website Downloader ==={C.RST}")
    print(f"{C.DIM}HTML, CSS, and JSON are always saved.{C.RST}\n")

    s: dict = {}
    s["save_images"] = ask_yes_no("Save images and ICO files?",   default=True)
    s["save_js"]     = ask_yes_no("Save JavaScript (.js) files?", default=True)
    s["save_pdf"]    = ask_yes_no("Save PDF files?",               default=True)

    s["max_file_bytes"] = None
    if ask_yes_no("Limit maximum individual file size?", default=False):
        mb = ask_positive_float("  Max file size in MB (e.g. 10)")
        s["max_file_bytes"] = int(mb * 1_048_576)

    s["save_other"] = ask_yes_no(
        "Save 'other' files (fonts, archives, unknown types)?", default=False
    )

    print()
    raw = input("Enter website URL (e.g. https://example.com): ").strip()
    if not raw:
        print("No URL entered. Exiting.")
        sys.exit(1)
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    s["start_url"] = raw
    return s


# ---------------------------------------------------------------------------
# URL utilities
# ---------------------------------------------------------------------------

def normalize_url(url: str, base: str) -> str | None:
    """Resolve url against base, strip fragment. Returns None for unusable URLs."""
    if not url or not isinstance(url, str):
        return None
    url = url.strip()
    if url.startswith(("javascript:", "mailto:", "tel:", "data:", "#", "blob:")):
        return None
    try:
        resolved, _ = urldefrag(urljoin(base, url))
        parsed = urlparse(resolved)
        if parsed.scheme not in ("http", "https"):
            return None
        return resolved
    except Exception:
        return None


def netloc_of(url: str) -> str:
    return urlparse(url).netloc.lower()


def is_same_site(url: str, base_netloc: str) -> bool:
    """True if url is on the same host or a subdomain. Port is ignored."""
    host = urlparse(url).netloc.lower().split(":")[0]
    base = base_netloc.split(":")[0]
    return host == base or host.endswith("." + base)


_BAD_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

def _sanitize(name: str) -> str:
    return _BAD_CHARS.sub("_", name).strip(". ") or "_"


def url_to_local_path(url: str, output_dir: Path) -> Path:
    """
    Deterministically map a URL to a safe path under output_dir.

    - Every path segment is sanitised.
    - Segments without a dot (directory-like) receive an 'index.html' suffix.
    - A trailing slash also produces 'index.html'.
    - Result is always verified to stay inside output_dir.
    """
    url_path = urlparse(url).path
    segments = [_sanitize(s) for s in url_path.split("/") if s]

    if not segments:
        segments = ["index.html"]
    else:
        last = segments[-1]
        if url_path.endswith("/") or "." not in last:
            segments.append("index.html")

    candidate = output_dir
    for seg in segments:
        if seg in (".", ".."):
            continue
        candidate = candidate / seg

    # Path-traversal guard
    try:
        candidate.resolve().relative_to(output_dir.resolve())
    except ValueError:
        fallback = hashlib.sha256(url.encode()).hexdigest()[:16]
        candidate = output_dir / f"file_{fallback}"

    return candidate


def _rel_url(from_file: Path, to_file: Path) -> str:
    """Relative URL with forward slashes, from from_file's directory to to_file."""
    rel = os.path.relpath(str(to_file), str(from_file.parent))
    return rel.replace("\\", "/")


# ---------------------------------------------------------------------------
# Download gate
# ---------------------------------------------------------------------------

def should_download(url: str, s: dict) -> bool:
    ext = Path(urlparse(url).path).suffix.lower()
    if ext in HTML_EXTS or ext == "":  return True
    if ext in CSS_EXTS:                return True
    if ext in JSON_EXTS:               return True
    if ext in IMAGE_EXTS:              return s["save_images"]
    if ext in JS_EXTS:                 return s["save_js"]
    if ext in PDF_EXTS:                return s["save_pdf"]
    if ext in FONT_EXTS:               return s["save_other"]
    return s["save_other"]


def category_of(path: Path, ct: str) -> str:
    ext = path.suffix.lower()
    if ext in IMAGE_EXTS:  return "image"
    if ext in JS_EXTS:     return "javascript"
    if ext in CSS_EXTS:    return "css"
    if ext in HTML_EXTS:   return "html"
    if ext in JSON_EXTS:   return "json"
    if ext in PDF_EXTS:    return "pdf"
    if ext in FONT_EXTS:   return "font"
    b = ct.split(";")[0].strip().lower()
    if "html" in b:        return "html"
    if "css" in b:         return "css"
    if "javascript" in b:  return "javascript"
    if "json" in b:        return "json"
    if "pdf" in b:         return "pdf"
    if "image" in b:       return "image"
    if "font" in b:        return "font"
    return "other"


# ---------------------------------------------------------------------------
# Link extraction  (always from original, unmodified content)
# ---------------------------------------------------------------------------

_TAG_ATTRS = [
    ("a",      "href"), ("link",   "href"), ("script", "src"),
    ("img",    "src"),  ("source", "src"),  ("video",  "src"),
    ("video",  "poster"), ("audio", "src"), ("iframe", "src"),
    ("embed",  "src"),  ("object", "data"), ("form",   "action"),
    ("input",  "src"),  ("use",    "href"), ("use",    "xlink:href"),
    ("track",  "src"),  ("area",   "href"),
]
_LAZY_ATTRS = (
    "data-src", "data-href", "data-url", "data-original",
    "data-lazy-src", "data-lazy", "data-image",
)


def extract_links_html(html: str, base: str) -> set[str]:
    urls: set[str] = set()
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        return urls

    for tag_name, attr in _TAG_ATTRS:
        for tag in soup.find_all(tag_name, **{attr: True}):
            raw = tag.get(attr, "")
            if attr == "srcset":
                for part in raw.split(","):
                    bits = part.strip().split()
                    if bits:
                        u = normalize_url(bits[0], base)
                        if u: urls.add(u)
            else:
                u = normalize_url(raw, base)
                if u: urls.add(u)

    for tag in soup.find_all(srcset=True):
        for part in tag["srcset"].split(","):
            bits = part.strip().split()
            if bits:
                u = normalize_url(bits[0], base)
                if u: urls.add(u)

    for meta in soup.find_all("meta", attrs={"http-equiv": re.compile("refresh", re.I)}):
        m = re.search(r"url\s*=\s*['\"]?([^'\";\s]+)", meta.get("content", ""), re.I)
        if m:
            u = normalize_url(m.group(1), base)
            if u: urls.add(u)

    for tag in soup.find_all(style=True):
        for m in re.finditer(r'url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)', tag["style"]):
            u = normalize_url(m.group(1), base)
            if u: urls.add(u)

    for st in soup.find_all("style"):
        for m in re.finditer(r'url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)', st.get_text()):
            u = normalize_url(m.group(1), base)
            if u: urls.add(u)

    for tag in soup.find_all(True):
        for attr in _LAZY_ATTRS:
            val = tag.get(attr)
            if val:
                u = normalize_url(val, base)
                if u: urls.add(u)

    return urls


def extract_links_css(css: str, base: str) -> set[str]:
    urls: set[str] = set()
    for m in re.finditer(r'url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)', css):
        u = normalize_url(m.group(1).strip(), base)
        if u: urls.add(u)
    for m in re.finditer(r'@import\s+["\']([^"\']+)["\']', css):
        u = normalize_url(m.group(1).strip(), base)
        if u: urls.add(u)
    return urls


# ---------------------------------------------------------------------------
# URL rewriting  (internal absolute → relative, before saving)
# ---------------------------------------------------------------------------

def _rewrite_css_text(
    css: str, page_url: str, local_file: Path,
    output_dir: Path, base_netloc: str
) -> str:
    """Replace url(...) values that point to the same site with relative paths."""
    def sub(m: re.Match) -> str:
        raw = m.group(1).strip().strip("'\"")
        abs_u = normalize_url(raw, page_url)
        if abs_u and is_same_site(abs_u, base_netloc):
            target = url_to_local_path(abs_u, output_dir)
            return f"url('{_rel_url(local_file, target)}')"
        return m.group(0)

    return re.sub(r'url\s*\(\s*([^)]+)\s*\)', sub, css)


def rewrite_html(
    raw_bytes: bytes, page_url: str, local_file: Path,
    output_dir: Path, base_netloc: str
) -> bytes:
    """
    Parse HTML with BeautifulSoup, replace every internal URL with a
    relative path, and return re-serialised bytes.

    - External URLs are not touched.
    - <base> tags are removed (they would break relative resolution).
    - No content is interpreted or executed — only attribute strings are
      rewritten.
    """
    try:
        text = raw_bytes.decode("utf-8", errors="replace")
        soup = BeautifulSoup(text, "html.parser")
    except Exception:
        return raw_bytes

    # <base href> would override our relative paths → remove it
    for tag in soup.find_all("base"):
        tag.decompose()

    # Rewrite standard URL-bearing attributes
    for tag_name, attr in _TAG_ATTRS:
        for tag in soup.find_all(tag_name, **{attr: True}):
            raw_val = tag.get(attr, "")
            abs_u = normalize_url(raw_val, page_url)
            if abs_u and is_same_site(abs_u, base_netloc):
                target = url_to_local_path(abs_u, output_dir)
                tag[attr] = _rel_url(local_file, target)

    # Rewrite srcset (comma-separated "url descriptor" pairs)
    for tag in soup.find_all(srcset=True):
        new_parts = []
        for part in tag["srcset"].split(","):
            part = part.strip()
            if not part:
                continue
            bits = part.split(None, 1)
            raw_url    = bits[0]
            descriptor = bits[1] if len(bits) > 1 else ""
            abs_u = normalize_url(raw_url, page_url)
            if abs_u and is_same_site(abs_u, base_netloc):
                target = url_to_local_path(abs_u, output_dir)
                new_parts.append(f"{_rel_url(local_file, target)} {descriptor}".strip())
            else:
                new_parts.append(part)
        tag["srcset"] = ", ".join(new_parts)

    # Rewrite inline style= attributes
    for tag in soup.find_all(style=True):
        tag["style"] = _rewrite_css_text(
            tag["style"], page_url, local_file, output_dir, base_netloc
        )

    # Rewrite <style> blocks
    for st in soup.find_all("style"):
        original  = st.get_text()
        rewritten = _rewrite_css_text(
            original, page_url, local_file, output_dir, base_netloc
        )
        st.clear()
        st.append(rewritten)

    return soup.encode("utf-8")


def rewrite_css(
    raw_bytes: bytes, css_url: str, local_file: Path,
    output_dir: Path, base_netloc: str
) -> bytes:
    """Rewrite url(...) and @import references in CSS to relative paths."""
    text = raw_bytes.decode("utf-8", errors="replace")

    text = _rewrite_css_text(text, css_url, local_file, output_dir, base_netloc)

    def sub_import(m: re.Match) -> str:
        raw_val = m.group(1).strip()
        abs_u = normalize_url(raw_val, css_url)
        if abs_u and is_same_site(abs_u, base_netloc):
            target = url_to_local_path(abs_u, output_dir)
            return f'@import "{_rel_url(local_file, target)}"'
        return m.group(0)

    text = re.sub(r'@import\s+["\']([^"\']+)["\']', sub_import, text)
    return text.encode("utf-8")


# ---------------------------------------------------------------------------
# HTTP fetch
# ---------------------------------------------------------------------------

def fetch(
    url: str, max_bytes: int | None
) -> tuple[bytes | None, str, str | None]:
    """
    GET url using the thread-local session.
    Returns (body, content_type, error_or_None).
    Streams the response and enforces the size limit.
    Nothing is executed — raw bytes are returned as-is.
    """
    try:
        resp = _session().get(
            url, timeout=REQUEST_TIMEOUT,
            stream=True, allow_redirects=True
        )
        resp.raise_for_status()
        ct = resp.headers.get("Content-Type", "")

        if max_bytes is not None:
            cl = resp.headers.get("Content-Length")
            if cl and int(cl) > max_bytes:
                resp.close()
                return None, ct, f"skipped: {int(cl) // 1024} KB > limit"

        chunks: list[bytes] = []
        total = 0
        for chunk in resp.iter_content(chunk_size=CHUNK_SIZE):
            if not chunk:
                continue
            total += len(chunk)
            if max_bytes is not None and total > max_bytes:
                resp.close()
                return None, ct, f"skipped: exceeded {max_bytes // 1024} KB limit"
            chunks.append(chunk)

        return b"".join(chunks), ct, None

    except requests.exceptions.TooManyRedirects:
        return None, "", "too many redirects"
    except requests.exceptions.Timeout:
        return None, "", "timeout"
    except requests.exceptions.ConnectionError as e:
        short = str(e)[:80]
        return None, "", f"connection error: {short}"
    except requests.exceptions.HTTPError as e:
        return None, "", f"HTTP {e.response.status_code}"
    except Exception as e:
        return None, "", f"error: {e}"


# ---------------------------------------------------------------------------
# Safe file write
# ---------------------------------------------------------------------------

def write_file(path: Path, data: bytes, output_dir: Path) -> None:
    """
    Write data verbatim to path under output_dir.
    Raises ValueError on path-traversal attempt.
    If path is an existing directory, writes to path/index.html.
    Nothing is executed.
    """
    # Traversal guard — raises ValueError if path escapes output_dir
    path.resolve().relative_to(output_dir.resolve())

    if path.is_dir():
        path = path / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


# ---------------------------------------------------------------------------
# Progress display  (thread-safe)
# ---------------------------------------------------------------------------

def _fmt_bytes(n: int) -> str:
    if n < 1_024:           return f"{n} B"
    if n < 1_048_576:       return f"{n / 1_024:.1f} KB"
    if n < 1_073_741_824:   return f"{n / 1_048_576:.1f} MB"
    return f"{n / 1_073_741_824:.1f} GB"


def _short_path(url: str) -> str:
    p = urlparse(url).path or "/"
    p = p.rstrip("/") or "/"
    if len(p) > 58:
        p = "…" + p[-57:]
    return p


class Display:
    """Thread-safe console with a persistent progress bar at the bottom."""

    def __init__(self) -> None:
        self._lock    = threading.Lock()
        self._done    = 0
        self._failed  = 0
        self._skipped = 0
        self._active  = 0
        self._queued  = 0
        self._bytes   = 0
        self._bar_up  = False   # whether the bar is currently the last output

    # -- internal --

    def _width(self) -> int:
        return min(shutil.get_terminal_size(fallback=(100, 24)).columns, 120)

    def _erase_bar(self) -> None:
        if self._bar_up:
            sys.stdout.write("\r" + " " * self._width() + "\r")
            sys.stdout.flush()
            self._bar_up = False

    def _draw_bar(self) -> None:
        total  = max(self._done + self._active + self._queued, 1)
        pct    = int(self._done / total * 100)
        bw     = 26
        filled = int(bw * self._done / total)
        bar    = C.GREEN + "█" * filled + C.DIM + "░" * (bw - filled) + C.RST

        line = (
            f" [{bar}] "
            f"{C.BOLD}{pct:3d}%{C.RST}  "
            f"{C.GREEN}{self._done} ✓{C.RST}  "
            f"{C.RED}{self._failed} ✗{C.RST}  "
            f"{C.YELLOW}{self._skipped} ⊘{C.RST}  "
            f"{C.DIM}{self._active} active  │  {_fmt_bytes(self._bytes)}{C.RST}"
        )
        sys.stdout.write("\r" + line)
        sys.stdout.flush()
        self._bar_up = True

    def _log(self, line: str) -> None:
        """Print a permanent line, keeping the bar at the bottom."""
        self._erase_bar()
        print(line)
        self._draw_bar()

    # -- public --

    def header(self, start_url: str, output_dir: Path) -> None:
        with self._lock:
            print(f"\n{C.BOLD}{C.CYAN}Target  :{C.RST} {start_url}")
            print(f"{C.BOLD}{C.CYAN}Saving  :{C.RST} {output_dir}")
            print(f"{C.BOLD}{C.CYAN}Workers :{C.RST} {MAX_WORKERS}\n")
            self._draw_bar()

    def enqueue(self, n: int = 1) -> None:
        with self._lock:
            self._queued += n
            self._draw_bar()

    def start_item(self) -> None:
        with self._lock:
            self._active += 1
            self._queued  = max(0, self._queued - 1)
            self._draw_bar()

    def success(self, url: str, cat: str, size: int) -> None:
        with self._lock:
            self._done   += 1
            self._active  = max(0, self._active - 1)
            self._bytes  += size
            self._log(
                f"  {C.GREEN}✓{C.RST}  {C.WHITE}{_short_path(url):<60}{C.RST}"
                f"  {C.DIM}{cat}, {_fmt_bytes(size)}{C.RST}"
            )

    def fail(self, url: str, reason: str) -> None:
        with self._lock:
            self._done   += 1
            self._failed += 1
            self._active  = max(0, self._active - 1)
            self._log(
                f"  {C.RED}✗{C.RST}  {C.WHITE}{_short_path(url):<60}{C.RST}"
                f"  {C.RED}{reason}{C.RST}"
            )

    def skip(self, url: str, reason: str) -> None:
        with self._lock:
            self._done    += 1
            self._skipped += 1
            self._active   = max(0, self._active - 1)
            self._log(
                f"  {C.YELLOW}⊘{C.RST}  {C.WHITE}{_short_path(url):<60}{C.RST}"
                f"  {C.DIM}{reason}{C.RST}"
            )

    def summary(self, stats: dict, output_dir: Path) -> None:
        with self._lock:
            self._erase_bar()

        total_files = sum(len(v) for v in stats.values())
        total_size  = sum(sum(v) for v in stats.values())
        c1, c2, c3  = 18, 8, 14

        print()
        print(C.BOLD + C.CYAN + "═" * 52 + C.RST)
        print(C.BOLD + "  DOWNLOAD COMPLETE" + C.RST)
        print(C.BOLD + C.CYAN + "═" * 52 + C.RST)
        print(f"  {C.DIM}Directory :{C.RST} {output_dir}")
        print()
        print(f"  {C.BOLD}{'Category':<{c1}} {'Files':>{c2}} {'Size':>{c3}}{C.RST}")
        print(f"  {C.DIM}{'─' * (c1 + c2 + c3 + 2)}{C.RST}")
        for cat in sorted(stats):
            sizes = stats[cat]
            print(f"  {C.GREEN}{cat:<{c1}}{C.RST} {len(sizes):>{c2}} {_fmt_bytes(sum(sizes)):>{c3}}")
        print(f"  {C.DIM}{'─' * (c1 + c2 + c3 + 2)}{C.RST}")
        print(f"  {C.BOLD}{'TOTAL':<{c1}} {total_files:>{c2}} {_fmt_bytes(total_size):>{c3}}{C.RST}")
        print()


# ---------------------------------------------------------------------------
# Crawler
# ---------------------------------------------------------------------------

class Crawler:
    def __init__(
        self, settings: dict, output_dir: Path,
        base_netloc: str, display: Display
    ) -> None:
        self._settings    = settings
        self._output_dir  = output_dir
        self._base_netloc = base_netloc
        self._display     = display
        self._max_bytes   = settings["max_file_bytes"]

        self._todo         = queue_module.Queue()
        self._visited_lock = threading.Lock()
        self._visited: set[str] = set()

        self._in_flight      = 0
        self._in_flight_lock = threading.Lock()

        self._stats_lock = threading.Lock()
        self.stats: dict[str, list[int]] = defaultdict(list)

    # ---- queue helpers ----

    def _enqueue(self, url: str) -> bool:
        """
        Add url to the work queue if it is new, same-site, and downloadable.
        Returns True when actually enqueued.
        """
        url, _ = urldefrag(url)
        if not is_same_site(url, self._base_netloc):
            return False
        if not should_download(url, self._settings):
            return False
        with self._visited_lock:
            if url in self._visited:
                return False
            self._visited.add(url)
        self._todo.put(url)
        return True

    # ---- worker ----

    def _process(self, url: str) -> None:
        """Download one URL, rewrite its links, save it, and enqueue new URLs."""
        self._display.start_item()
        try:
            self._do(url)
        except Exception as exc:
            self._display.fail(url, f"unexpected: {exc}")
        finally:
            with self._in_flight_lock:
                self._in_flight -= 1

    def _do(self, url: str) -> None:
        body, ct, err = fetch(url, self._max_bytes)

        if err is not None:
            if err.startswith("skipped"):
                self._display.skip(url, err)
            else:
                self._display.fail(url, err)
            return

        if body is None:
            self._display.fail(url, "empty response")
            return

        ct_base = ct.split(";")[0].strip().lower()
        local   = url_to_local_path(url, self._output_dir)

        # --- Extract links from ORIGINAL content before any rewriting ---
        new_links: set[str] = set()
        if "text/html" in ct_base:
            orig_text = body.decode("utf-8", errors="replace")
            new_links = extract_links_html(orig_text, url)
        elif "text/css" in ct_base:
            orig_text = body.decode("utf-8", errors="replace")
            new_links = extract_links_css(orig_text, url)

        # --- Rewrite internal URLs to relative paths before saving ---
        if "text/html" in ct_base:
            body = rewrite_html(
                body, url, local, self._output_dir, self._base_netloc
            )
        elif "text/css" in ct_base:
            body = rewrite_css(
                body, url, local, self._output_dir, self._base_netloc
            )

        # --- Save (only bytes written, nothing executed) ---
        try:
            write_file(local, body, self._output_dir)
        except ValueError:
            self._display.fail(url, "blocked: path traversal")
            return
        except OSError as e:
            self._display.fail(url, f"write error: {e}")
            return

        cat = category_of(local, ct)
        with self._stats_lock:
            self.stats[cat].append(len(body))

        self._display.success(url, cat, len(body))

        # --- Enqueue newly discovered URLs ---
        newly_added = 0
        for link in new_links:
            if self._enqueue(link):
                newly_added += 1
        if newly_added:
            self._display.enqueue(newly_added)

    # ---- main loop ----

    def run(self) -> None:
        if self._enqueue(self._settings["start_url"]):
            self._display.enqueue(1)

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as exe:
            while True:
                try:
                    url = self._todo.get(timeout=1.0)
                except queue_module.Empty:
                    # Only stop when nothing is active and the queue is empty
                    with self._in_flight_lock:
                        if self._in_flight == 0 and self._todo.empty():
                            break
                    continue

                with self._in_flight_lock:
                    self._in_flight += 1
                exe.submit(self._process, url)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    try:
        settings    = prompt_settings()
        start_url   = settings["start_url"]
        base_netloc = netloc_of(start_url)
        output_dir  = DOWNLOADS_DIR / _sanitize(base_netloc)
        output_dir.mkdir(parents=True, exist_ok=True)

        display = Display()
        display.header(start_url, output_dir)

        crawler = Crawler(settings, output_dir, base_netloc, display)
        crawler.run()

        display.summary(crawler.stats, output_dir)

    except KeyboardInterrupt:
        print(f"\n\n{C.YELLOW}Interrupted.{C.RST}")
        sys.exit(0)


if __name__ == "__main__":
    main()
