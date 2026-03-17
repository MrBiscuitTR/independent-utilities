#!/usr/bin/env python3
"""
Recursive Website Downloader

Downloads all reachable content from a website, staying within the same domain/subdomains.
No code is executed — files are fetched via HTTP and written to disk (./downloads/[domain]/) only.
Parallel, with live progress, ANSI colours, relative-URL rewriting, and subdomain isolation.

Subdomains are placed in sub_<name>/ folders inside the root.
A .site-downloader-metadata.txt log is written alongside all downloads.
External CDN assets go into external/<cdn-name>/.

Requirements:
    pip install requests beautifulsoup4
"""

import os
import re
import sys
import shutil
import hashlib
import threading
import datetime
import queue as queue_module
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse, urljoin, urldefrag, unquote

import requests
from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# ANSI colours
# ---------------------------------------------------------------------------

if sys.platform == "win32":
    os.system("")   # enable VT-100 processing in Windows Terminal

class C:
    RST    = "\033[0m"
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    GREEN  = "\033[32m"
    RED    = "\033[31m"
    YELLOW = "\033[33m"
    CYAN   = "\033[36m"
    BLUE   = "\033[34m"
    MAGENTA= "\033[35m"
    WHITE  = "\033[97m"


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR    = Path(__file__).parent.resolve()
DOWNLOADS_DIR = SCRIPT_DIR / "downloads"

MAX_WORKERS     = 8
REQUEST_TIMEOUT = 20        # seconds
CHUNK_SIZE      = 65_536    # bytes per streaming chunk

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

REQUEST_DELAY = 0.3   # seconds between requests to the same host - ADDED DELIBERATELY TO AVOID RATE LIMITS

META_FILENAME = ".site-downloader-metadata.txt"

# ---- file-type extension sets ----
IMAGE_EXTS   = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
                ".ico", ".bmp", ".tiff", ".tif", ".avif"}
JS_EXTS      = {".js", ".mjs", ".cjs"}
CSS_EXTS     = {".css"}
HTML_EXTS    = {".html", ".htm", ".xhtml"}
JSON_EXTS    = {".json", ".jsonld"}
PDF_EXTS     = {".pdf"}
FONT_EXTS    = {".woff", ".woff2", ".ttf", ".eot", ".otf"}
CODE_EXTS    = {".py", ".cpp", ".c", ".h", ".cs", ".java", ".rb", ".go",
                ".ts", ".sh", ".bat", ".ps1", ".sql", ".php", ".rs", ".kt"}
DOC_EXTS     = {".txt", ".md", ".csv", ".yaml", ".yml", ".toml", ".ini", ".log"}
ARCHIVE_EXTS = {".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
                ".exe", ".dll", ".so", ".dylib", ".bin"}

# ---- blocked analytics / tracking / ad domains ----
BLOCKED_DOMAINS: frozenset = frozenset({
    "google-analytics.com", "googletagmanager.com", "googletagservices.com",
    "adservice.google.com", "pagead2.googlesyndication.com",
    "doubleclick.net", "analytics.google.com",
    "facebook.net", "connect.facebook.net",
    "bat.bing.com", "clarity.ms", "snap.licdn.com", "px.ads.linkedin.com",
    "static.ads-twitter.com", "analytics.twitter.com",
    "analytics.tiktok.com", "ads.tiktok.com",
    "plausible.io", "simpleanalytics.io", "goatcounter.com",
    "mixpanel.com", "amplitude.com", "segment.com", "cdn.segment.com",
    "heap.io", "fullstory.com", "logrocket.io",
    "hotjar.com", "static.hotjar.com",
    "adroll.com", "taboola.com", "outbrain.com", "criteo.com",
    "adsrvr.org", "pubmatic.com", "rubiconproject.com",
    "intercom.io", "drift.com", "zendesk.com", "freshchat.com",
    "hubspot.com", "hs-scripts.com", "hs-analytics.net",
})

# ---- allowed external CDN domains ----
ALL_CDN_DOMAINS: frozenset = frozenset({
    "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com",
    "esm.sh", "skypack.dev", "fonts.googleapis.com", "fonts.gstatic.com",
    "stackpath.bootstrapcdn.com", "cdn.tailwindcss.com", "registry.npmjs.org",
})

# Hosts that serve CSS without a .css extension in their URL paths
_FONT_CSS_HOSTS: frozenset = frozenset({
    "fonts.googleapis.com",
    "fonts.gstatic.com",
})

CDN_FOLDER_MAP: dict[str, str] = {
    "cdnjs.cloudflare.com":       "cdnjs",
    "cdn.jsdelivr.net":           "jsdelivr",
    "unpkg.com":                  "unpkg",
    "esm.sh":                     "esm-sh",
    "skypack.dev":                "skypack",
    "fonts.googleapis.com":       "fonts-googleapis",
    "fonts.gstatic.com":          "fonts-gstatic",
    "stackpath.bootstrapcdn.com": "bootstrapcdn",
    "cdn.tailwindcss.com":        "tailwindcss",
    "registry.npmjs.org":         "npmjs",
}


# ---------------------------------------------------------------------------
# Per-thread HTTP session
# ---------------------------------------------------------------------------

_tls = threading.local()

# Per-host rate limiting: track time of last request per host
import time as _time_mod
_host_last_req: dict[str, float] = {}
_host_req_lock = threading.Lock()


def _wait_for_host(host: str) -> None:
    """Enforce REQUEST_DELAY seconds between successive requests to the same host."""
    if REQUEST_DELAY <= 0:
        return
    with _host_req_lock:
        last = _host_last_req.get(host, 0.0)
        now  = _time_mod.monotonic()
        wait = REQUEST_DELAY - (now - last)
        _host_last_req[host] = now + max(0.0, wait)
    if wait > 0:
        _time_mod.sleep(wait)


def _session() -> requests.Session:
    if not hasattr(_tls, "s"):
        s = requests.Session()
        s.headers.update(HEADERS)
        _tls.s = s
    return _tls.s


# ---------------------------------------------------------------------------
# Formatting helpers  (defined early; used by both MetaLog and Display)
# ---------------------------------------------------------------------------

def _fmt_bytes(n: int) -> str:
    if n < 1_024:           return f"{n} B"
    if n < 1_048_576:       return f"{n / 1_024:.1f} KB"
    if n < 1_073_741_824:   return f"{n / 1_048_576:.1f} MB"
    return f"{n / 1_073_741_824:.1f} GB"


def _settings_summary(s: dict) -> str:
    parts = []
    if s.get("save_images"):     parts.append("images")
    if s.get("save_js"):         parts.append("js")
    if s.get("save_cdn_js"):     parts.append("cdn-js")
    if s.get("save_cdn_fonts"):  parts.append("cdn-fonts")
    if s.get("save_pdf"):        parts.append("pdf")
    if s.get("save_other"):      parts.append("other")
    if s.get("save_subdomains"): parts.append("subdomains=full")
    else:                        parts.append("subdomains=assets-only")
    mb = s.get("max_file_bytes")
    if mb:                       parts.append(f"max-size={mb // 1_048_576}MB")
    return ", ".join(parts)


# ---------------------------------------------------------------------------
# CLI helpers
# ---------------------------------------------------------------------------

def ask_yes_no(prompt: str, default: bool = True) -> bool:
    tag = "[Y/n]" if default else "[y/N]"
    while True:
        raw = input(f"{prompt} {tag}: ").strip().lower()
        if raw == "":           return default
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

    # --- URL first ---
    raw = input("Enter website URL (e.g. https://example.com): ").strip()
    if not raw:
        print("No URL entered. Exiting.")
        sys.exit(1)
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    s["start_url"] = raw
    base = urlparse(raw).netloc.lower()

    # --- Subdomain question (contextual: shows the actual domain) ---
    print()
    print(f"  {C.DIM}Subdomains of {C.RST}{C.BOLD}{base}{C.RST}{C.DIM} are always followed for"
          f" linked assets (CSS, JS, images).{C.RST}")
    s["save_subdomains"] = ask_yes_no(
        f"  Also crawl subdomain pages fully (recurse into their HTML)?",
        default=False,
    )

    # --- File-type options ---
    print()
    s["save_images"]    = ask_yes_no("Save images and ICO files?",               default=True)
    s["save_js"]        = ask_yes_no("Save JavaScript (.js/.mjs) files?",        default=True)
    s["save_cdn_js"]    = ask_yes_no("Download JS/MJS from external CDNs?",      default=False)
    s["save_cdn_fonts"] = ask_yes_no("Download fonts/CSS from external CDNs?",   default=False)
    s["save_pdf"]       = ask_yes_no("Save PDF files?",                          default=True)

    s["max_file_bytes"] = None
    if ask_yes_no("Limit maximum individual file size?", default=False):
        mb = ask_positive_float("  Max file size in MB (e.g. 10)")
        s["max_file_bytes"] = int(mb * 1_048_576)

    s["save_other"] = ask_yes_no(
        "Save 'other' files (fonts, source code, docs, archives, unknown types)?",
        default=False,
    )

    return s


# ---------------------------------------------------------------------------
# URL utilities
# ---------------------------------------------------------------------------

def normalize_url(url: str, base: str) -> str | None:
    """Resolve url against base, strip fragment. Returns None for unusable schemes."""
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


def is_blocked(host: str) -> bool:
    """
    Return True if the host is an analytics, tracking, or ad domain.
    Checks exact match, subdomain match, and keyword heuristics.
    """
    h = host.split(":")[0].lower()
    for bd in BLOCKED_DOMAINS:
        if h == bd or h.endswith("." + bd):
            return True
    # "ads" as a complete dot-segment  →  catches ads.google.com, not adserver.com
    if "ads" in h.split("."):
        return True
    if "analytics" in h:
        return True
    return False


def is_allowed_external_url(url: str, settings: dict) -> bool:
    """
    Return True if this external CDN URL should be downloaded given settings.
    Only allows known CDN domains and safe file types; always blocks analytics.
    """
    parsed = urlparse(url)
    host   = parsed.netloc.split(":")[0].lower()
    if is_blocked(host):
        return False
    if host not in ALL_CDN_DOMAINS:
        return False
    if host in _FONT_CSS_HOSTS:
        return settings.get("save_cdn_fonts", False)
    ext = Path(parsed.path).suffix.lower()
    if ext in JS_EXTS:   return settings.get("save_cdn_js",    False)
    if ext in CSS_EXTS:  return settings.get("save_cdn_fonts", False)
    if ext in FONT_EXTS: return settings.get("save_cdn_fonts", False)
    if ext in JSON_EXTS: return True
    return False


# ---------------------------------------------------------------------------
# Path utilities
# ---------------------------------------------------------------------------

_BAD_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

def _sanitize(name: str) -> str:
    return _BAD_CHARS.sub("_", name).strip(". ") or "_"


def host_sub_folder(host: str, base_netloc: str) -> str | None:
    """
    Return the 'sub_<name>' folder for a subdomain of base_netloc,
    or None if host IS the apex (base_netloc).

    Examples:
      host='utilities.example.com', base='example.com'  → 'sub_utilities'
      host='a.b.example.com',       base='example.com'  → 'sub_a-b'
      host='example.com',           base='example.com'  → None  (apex)
    """
    h = host.split(":")[0].lower()
    b = base_netloc.split(":")[0].lower()
    if h == b:
        return None
    # Strip the ".base" suffix to get the subdomain label(s)
    sub_part = h[:-(len(b) + 1)]          # "utilities.example.com" → "utilities"
    folder   = "sub_" + sub_part.replace(".", "-")
    return _sanitize(folder)


def url_to_local_path(url: str, target_dir: Path) -> Path:
    """
    Deterministically map a URL path to a safe path under target_dir.

    - Segments are sanitised.
    - Extension-less segments become <segment>/index.html.
    - Trailing slash produces index.html.
    - Path-traversal guard: result is always inside target_dir.
    """
    url_path = urlparse(url).path
    segments = [_sanitize(unquote(s)) for s in url_path.split("/") if s]

    if not segments:
        segments = ["index.html"]
    else:
        last = segments[-1]
        if url_path.endswith("/") or "." not in last:
            segments.append("index.html")

    candidate = target_dir
    for seg in segments:
        if seg in (".", ".."):
            continue
        candidate = candidate / seg

    try:
        candidate.resolve().relative_to(target_dir.resolve())
    except ValueError:
        fallback  = hashlib.sha256(url.encode()).hexdigest()[:16]
        candidate = target_dir / f"file_{fallback}"

    return candidate


def url_to_site_path(url: str, output_dir: Path, base_netloc: str) -> Path:
    """
    Route a same-site URL to the correct local path:
    - Apex domain  →  output_dir/<url-path>
    - Subdomain    →  output_dir/sub_<name>/<url-path>
    """
    host   = urlparse(url).netloc.lower().split(":")[0]
    folder = host_sub_folder(host, base_netloc)
    if folder is None:
        target_dir = output_dir
    else:
        target_dir = output_dir / folder
    return url_to_local_path(url, target_dir)


def url_to_external_path(url: str, output_dir: Path) -> Path:
    """
    Map an external CDN URL to output_dir/external/<cdn-name>/<url-path>.

    - Query strings are hashed into the filename for stable, unique filenames.
    - fonts.googleapis.com paths without an extension receive .css.
    - Path-traversal guard applied.
    """
    parsed     = urlparse(url)
    host       = parsed.netloc.split(":")[0].lower()
    query      = parsed.query
    cdn_folder = CDN_FOLDER_MAP.get(host) or _sanitize(host)
    ext_base   = output_dir / "external"

    raw_segs = [s for s in parsed.path.split("/") if s]
    if not raw_segs:
        raw_segs = ["index"]
    segments = [_sanitize(s) for s in raw_segs]
    last     = segments[-1]

    if host in _FONT_CSS_HOSTS and "." not in last:
        last = last + ".css"
        segments[-1] = last

    if query:
        q_hash = hashlib.sha256(query.encode()).hexdigest()[:8]
        dot = last.rfind(".")
        if dot >= 0:
            segments[-1] = last[:dot] + "_" + q_hash + last[dot:]
        else:
            segments[-1] = last + "_" + q_hash

    candidate = ext_base / cdn_folder
    for seg in segments:
        if seg in (".", ".."):
            continue
        candidate = candidate / seg

    try:
        candidate.resolve().relative_to(output_dir.resolve())
    except ValueError:
        fallback  = hashlib.sha256(url.encode()).hexdigest()[:16]
        candidate = ext_base / cdn_folder / f"file_{fallback}"

    return candidate


def _rel_url(from_file: Path, to_file: Path) -> str:
    """Relative URL (forward slashes) from from_file's directory to to_file."""
    rel = os.path.relpath(str(to_file), str(from_file.parent))
    return rel.replace("\\", "/")


# ---------------------------------------------------------------------------
# Download gate
# ---------------------------------------------------------------------------

def should_download(url: str, s: dict) -> bool:
    """Type-based filter for same-site URLs."""
    ext = Path(urlparse(url).path).suffix.lower()
    if ext in HTML_EXTS or ext == "":  return True
    if ext in CSS_EXTS:                return True
    if ext in JSON_EXTS:               return True
    if ext in IMAGE_EXTS:              return s["save_images"]
    if ext in JS_EXTS:                 return s["save_js"]
    if ext in PDF_EXTS:                return s["save_pdf"]
    if ext in FONT_EXTS:               return s["save_other"]
    if ext in CODE_EXTS:               return s["save_other"]
    if ext in DOC_EXTS:                return s["save_other"]
    if ext in ARCHIVE_EXTS:            return s["save_other"]
    return s["save_other"]


def will_download(url: str, settings: dict, base_netloc: str) -> bool:
    """
    Decide whether url would be downloaded under the current settings.
    Used during HTML/CSS rewriting: only rewrite links to files that will
    actually exist on disk; leave others as absolute URLs.
    """
    parsed = urlparse(url)
    host   = parsed.netloc.lower().split(":")[0]
    base   = base_netloc.split(":")[0]

    if host == base:
        return should_download(url, settings)

    if host.endswith("." + base):
        # Subdomain — HTML pages are only fetched when save_subdomains is True
        if not settings.get("save_subdomains", False):
            ext = Path(parsed.path).suffix.lower()
            if ext in HTML_EXTS or ext == "":
                return False
        return should_download(url, settings)

    return is_allowed_external_url(url, settings)


def category_of(path: Path, ct: str) -> str:
    ext = path.suffix.lower()
    if ext in IMAGE_EXTS:   return "image"
    if ext in JS_EXTS:      return "javascript"
    if ext in CSS_EXTS:     return "css"
    if ext in HTML_EXTS:    return "html"
    if ext in JSON_EXTS:    return "json"
    if ext in PDF_EXTS:     return "pdf"
    if ext in FONT_EXTS:    return "font"
    if ext in CODE_EXTS:    return "code"
    if ext in DOC_EXTS:     return "document"
    if ext in ARCHIVE_EXTS: return "archive"
    b = ct.split(";")[0].strip().lower()
    if "html" in b:         return "html"
    if "css" in b:          return "css"
    if "javascript" in b:   return "javascript"
    if "json" in b:         return "json"
    if "pdf" in b:          return "pdf"
    if "image" in b:        return "image"
    if "font" in b:         return "font"
    return "other"


# ---------------------------------------------------------------------------
# Link extraction  (always from original, unmodified content)
# ---------------------------------------------------------------------------

_TAG_ATTRS = [
    ("a",     "href"), ("link",   "href"), ("script", "src"),
    ("img",   "src"),  ("source", "src"),  ("video",  "src"),
    ("video", "poster"),("audio", "src"),  ("iframe", "src"),
    ("embed", "src"),  ("object", "data"), ("form",   "action"),
    ("input", "src"),  ("use",    "href"), ("use",    "xlink:href"),
    ("track", "src"),  ("area",   "href"),
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
    """Extract url() and @import references from CSS (internal and external)."""
    urls: set[str] = set()
    for m in re.finditer(r'url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)', css):
        u = normalize_url(m.group(1).strip(), base)
        if u: urls.add(u)
    for m in re.finditer(r'@import\s+["\']([^"\']+)["\']', css):
        u = normalize_url(m.group(1).strip(), base)
        if u: urls.add(u)
    return urls


# ---------------------------------------------------------------------------
# URL rewriting  (absolute → relative, before saving)
# ---------------------------------------------------------------------------

def _resolve_to_local(
    abs_u: str, local_file: Path, output_dir: Path,
    base_netloc: str, settings: dict,
) -> str | None:
    """
    Return a relative path string if abs_u will be saved locally,
    or None to leave the URL unchanged (external, won't be downloaded,
    or would be a subdomain HTML page that isn't being crawled).
    """
    if is_same_site(abs_u, base_netloc):
        if not will_download(abs_u, settings, base_netloc):
            return None   # e.g. subdomain HTML when save_subdomains=False
        target = url_to_site_path(abs_u, output_dir, base_netloc)
        return _rel_url(local_file, target)
    if is_allowed_external_url(abs_u, settings):
        target = url_to_external_path(abs_u, output_dir)
        return _rel_url(local_file, target)
    return None


def _rewrite_css_text(
    css: str, page_url: str, local_file: Path,
    output_dir: Path, base_netloc: str, settings: dict,
) -> str:
    """Replace url(...) values for locally-mirrored resources with relative paths."""
    def sub(m: re.Match) -> str:
        raw   = m.group(1).strip().strip("'\"")
        abs_u = normalize_url(raw, page_url)
        if abs_u:
            rel = _resolve_to_local(abs_u, local_file, output_dir, base_netloc, settings)
            if rel is not None:
                return f"url('{rel}')"
        return m.group(0)
    return re.sub(r'url\s*\(\s*([^)]+)\s*\)', sub, css)


def rewrite_html(
    raw_bytes: bytes, page_url: str, local_file: Path,
    output_dir: Path, base_netloc: str, settings: dict,
) -> bytes:
    """
    Parse HTML, replace every locally-mirrored URL with a relative path.

    - External URLs not being downloaded are NOT rewritten (stay absolute).
    - Subdomain HTML links stay absolute when save_subdomains=False.
    - <base> tags are removed.
    - No content is interpreted or executed; only attribute strings change.
    """
    try:
        text = raw_bytes.decode("utf-8", errors="replace")
        soup = BeautifulSoup(text, "html.parser")
    except Exception:
        return raw_bytes

    for tag in soup.find_all("base"):
        tag.decompose()

    for tag_name, attr in _TAG_ATTRS:
        for tag in soup.find_all(tag_name, **{attr: True}):
            raw_val = tag.get(attr, "")
            abs_u   = normalize_url(raw_val, page_url)
            if abs_u:
                rel = _resolve_to_local(
                    abs_u, local_file, output_dir, base_netloc, settings
                )
                if rel is not None:
                    tag[attr] = rel

    for tag in soup.find_all(srcset=True):
        new_parts = []
        for part in tag["srcset"].split(","):
            part = part.strip()
            if not part:
                continue
            bits       = part.split(None, 1)
            raw_url    = bits[0]
            descriptor = bits[1] if len(bits) > 1 else ""
            abs_u      = normalize_url(raw_url, page_url)
            rel        = None
            if abs_u:
                rel = _resolve_to_local(
                    abs_u, local_file, output_dir, base_netloc, settings
                )
            new_parts.append(f"{rel} {descriptor}".strip() if rel else part)
        tag["srcset"] = ", ".join(new_parts)

    for tag in soup.find_all(style=True):
        tag["style"] = _rewrite_css_text(
            tag["style"], page_url, local_file, output_dir, base_netloc, settings
        )

    for st in soup.find_all("style"):
        rewritten = _rewrite_css_text(
            st.get_text(), page_url, local_file, output_dir, base_netloc, settings
        )
        st.clear()
        st.append(rewritten)

    return soup.encode("utf-8", formatter="html")


def rewrite_css(
    raw_bytes: bytes, css_url: str, local_file: Path,
    output_dir: Path, base_netloc: str, settings: dict,
) -> bytes:
    """Rewrite url(...) and @import references in CSS to relative paths."""
    text = raw_bytes.decode("utf-8", errors="replace")
    text = _rewrite_css_text(text, css_url, local_file, output_dir, base_netloc, settings)

    def sub_import(m: re.Match) -> str:
        abs_u = normalize_url(m.group(1).strip(), css_url)
        if abs_u:
            rel = _resolve_to_local(
                abs_u, local_file, output_dir, base_netloc, settings
            )
            if rel is not None:
                return f'@import "{rel}"'
        return m.group(0)

    text = re.sub(r'@import\s+["\']([^"\']+)["\']', sub_import, text)
    return text.encode("utf-8")


# ---------------------------------------------------------------------------
# HTTP fetch
# ---------------------------------------------------------------------------

def fetch(
    url: str, max_bytes: int | None,
) -> tuple[bytes | None, str, str, str | None]:
    """
    GET url. Returns (body, content_type, final_url, error_or_None).
    final_url is the URL after any HTTP redirects (used as base for relative links).
    Streams response; enforces size limit. Nothing is executed.
    """
    host = urlparse(url).netloc.lower().split(":")[0]
    _wait_for_host(host)
    try:
        resp = _session().get(
            url, timeout=REQUEST_TIMEOUT,
            stream=True, allow_redirects=True,
        )
        resp.raise_for_status()
        ct        = resp.headers.get("Content-Type", "")
        final_url = resp.url   # URL after all redirects

        if max_bytes is not None:
            cl = resp.headers.get("Content-Length")
            if cl and int(cl) > max_bytes:
                resp.close()
                return None, ct, final_url, f"skipped: {int(cl) // 1024} KB > limit"

        chunks: list[bytes] = []
        total = 0
        for chunk in resp.iter_content(chunk_size=CHUNK_SIZE):
            if not chunk:
                continue
            total += len(chunk)
            if max_bytes is not None and total > max_bytes:
                resp.close()
                return None, ct, final_url, f"skipped: exceeded {max_bytes // 1024} KB limit"
            chunks.append(chunk)

        return b"".join(chunks), ct, final_url, None

    except requests.exceptions.TooManyRedirects:
        return None, "", url, "too many redirects"
    except requests.exceptions.Timeout:
        return None, "", url, "timeout"
    except requests.exceptions.ConnectionError as e:
        return None, "", url, f"connection error: {str(e)[:80]}"
    except requests.exceptions.HTTPError as e:
        return None, "", url, f"HTTP {e.response.status_code}"
    except Exception as e:
        return None, "", url, f"error: {e}"


# ---------------------------------------------------------------------------
# Safe file write
# ---------------------------------------------------------------------------

def write_file(path: Path, data: bytes, output_dir: Path) -> None:
    """
    Write data verbatim to path under output_dir.
    Raises ValueError on path-traversal attempt.
    Nothing is executed — bytes are written as-is.
    """
    path.resolve().relative_to(output_dir.resolve())   # traversal guard
    if path.is_dir():
        path = path / "index.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


# ---------------------------------------------------------------------------
# Metadata log  (thread-safe, written incrementally to disk)
# ---------------------------------------------------------------------------

class MetaLog:
    """
    Writes a plain-text session log to output_dir/.site-downloader-metadata.txt.
    All public methods are thread-safe and append-only during the crawl.
    finalize() is called from the main thread after all workers complete.
    """

    def __init__(
        self, output_dir: Path, settings: dict, start_url: str,
    ) -> None:
        self._path         = output_dir / META_FILENAME
        self._lock         = threading.Lock()
        self._start_time   = datetime.datetime.now()
        # Track blocked hosts for deduplication in the summary
        self._blocked: dict[str, int] = defaultdict(int)   # host → count
        self._blocked_logged: set[str] = set()             # hosts already printed

        ts = self._start_time.strftime("%Y-%m-%d %H:%M:%S")
        with open(self._path, "w", encoding="utf-8", errors="replace") as f:
            f.write("=" * 72 + "\n")
            f.write("  SITE DOWNLOADER SESSION LOG\n")
            f.write("=" * 72 + "\n")
            f.write(f"Started    : {ts}\n")
            f.write(f"Target URL : {start_url}\n")
            f.write(f"Output dir : {output_dir}\n")
            f.write(f"Workers    : {MAX_WORKERS}\n")
            f.write(f"Settings   : {_settings_summary(settings)}\n")
            f.write("\n" + "-" * 72 + "\n")
            f.write("  DOWNLOAD LOG\n")
            f.write("-" * 72 + "\n")

    # ---- internal ----

    def _append(self, line: str) -> None:
        with self._lock:
            with open(self._path, "a", encoding="utf-8", errors="replace") as f:
                f.write(line + "\n")

    # ---- public (called from worker threads) ----

    def log_success(
        self, url: str, local: Path, cat: str, size: int, is_ext: bool,
    ) -> None:
        tag  = "[CDN] " if is_ext else "[OK]  "
        self._append(
            f"{tag} {url}\n"
            f"       -> {local}  ({cat}, {_fmt_bytes(size)})"
        )

    def log_fail(self, url: str, reason: str) -> None:
        self._append(f"[ERR]  {url}\n       -> {reason}")

    def log_skip(self, url: str, reason: str) -> None:
        self._append(f"[SKIP] {url}\n       -> {reason}")

    def log_blocked(self, url: str, reason: str) -> None:
        host = urlparse(url).netloc.lower().split(":")[0]
        with self._lock:
            self._blocked[host] += 1
            first_time = host not in self._blocked_logged
            if first_time:
                self._blocked_logged.add(host)
            with open(self._path, "a", encoding="utf-8", errors="replace") as f:
                if first_time:
                    f.write(f"[BLCK] {url}\n       -> {reason}\n")
                # Subsequent references to the same host are silent in the log body;
                # the count is captured in finalize().

    # ---- called from main thread after all workers finish ----

    def finalize(
        self, stats_int: dict, stats_ext: dict,
    ) -> None:
        end_time  = datetime.datetime.now()
        duration  = end_time - self._start_time
        total_sec = int(duration.total_seconds())
        mins, secs = divmod(total_sec, 60)

        lines: list[str] = []
        lines.append("\n" + "-" * 72)
        lines.append("  BLOCKED DOMAINS SUMMARY")
        lines.append("-" * 72)
        if self._blocked:
            for host in sorted(self._blocked):
                lines.append(f"  {host:<50}  {self._blocked[host]} URL(s) blocked")
        else:
            lines.append("  (none)")

        def _text_table(title: str, stats: dict) -> None:
            if not stats:
                return
            tot_f = sum(len(v) for v in stats.values())
            tot_s = sum(sum(v) for v in stats.values())
            lines.append(f"\n  {title}")
            lines.append(f"  {'Category':<18} {'Files':>8} {'Size':>14}")
            lines.append("  " + "─" * 42)
            for cat in sorted(stats):
                sz = stats[cat]
                lines.append(
                    f"  {cat:<18} {len(sz):>8} {_fmt_bytes(sum(sz)):>14}"
                )
            lines.append("  " + "─" * 42)
            lines.append(f"  {'TOTAL':<18} {tot_f:>8} {_fmt_bytes(tot_s):>14}")

        lines.append("\n" + "-" * 72)
        lines.append("  FINAL SUMMARY")
        lines.append("-" * 72)
        _text_table("INTERNAL  (same-site)", stats_int)
        _text_table("EXTERNAL  (CDN)",       stats_ext)

        lines.append("\n" + "-" * 72)
        lines.append(f"  Completed : {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"  Duration  : {mins}m {secs}s")
        lines.append("=" * 72)

        with open(self._path, "a", encoding="utf-8", errors="replace") as f:
            f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# Progress display  (thread-safe)
# ---------------------------------------------------------------------------

def _short_label(url: str) -> str:
    parsed = urlparse(url)
    host   = parsed.netloc
    path   = (parsed.path or "/").rstrip("/") or "/"
    label  = host + path if host else path
    if len(label) > 62:
        label = "…" + label[-61:]
    return label


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
        self._bar_up  = False

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
        self._erase_bar()
        print(line)
        self._draw_bar()

    # -- public --

    def header(self, start_url: str, output_dir: Path, subdomain_mode: str) -> None:
        with self._lock:
            print(f"\n{C.BOLD}{C.CYAN}Target    :{C.RST} {start_url}")
            print(f"{C.BOLD}{C.CYAN}Saving    :{C.RST} {output_dir}")
            print(f"{C.BOLD}{C.CYAN}Subdomains:{C.RST} {subdomain_mode}")
            print(f"{C.BOLD}{C.CYAN}Workers   :{C.RST} {MAX_WORKERS}\n")
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

    def success(self, url: str, cat: str, size: int, marker: str) -> None:
        with self._lock:
            self._done   += 1
            self._active  = max(0, self._active - 1)
            self._bytes  += size
            self._log(
                f"  {C.GREEN}✓{C.RST}  {marker}{C.WHITE}{_short_label(url):<62}{C.RST}"
                f"  {C.DIM}{cat}, {_fmt_bytes(size)}{C.RST}"
            )

    def fail(self, url: str, reason: str) -> None:
        with self._lock:
            self._done   += 1
            self._failed += 1
            self._active  = max(0, self._active - 1)
            self._log(
                f"  {C.RED}✗{C.RST}        {C.WHITE}{_short_label(url):<62}{C.RST}"
                f"  {C.RED}{reason}{C.RST}"
            )

    def skip(self, url: str, reason: str) -> None:
        with self._lock:
            self._done    += 1
            self._skipped += 1
            self._active   = max(0, self._active - 1)
            self._log(
                f"  {C.YELLOW}⊘{C.RST}        {C.WHITE}{_short_label(url):<62}{C.RST}"
                f"  {C.DIM}{reason}{C.RST}"
            )

    def summary(self, stats_int: dict, stats_ext: dict, output_dir: Path) -> None:
        with self._lock:
            self._erase_bar()

        c1, c2, c3 = 18, 8, 14
        div = "  " + C.DIM + "─" * (c1 + c2 + c3 + 2) + C.RST

        def _table(title: str, stats: dict, colour: str) -> None:
            if not stats:
                return
            tot_f = sum(len(v) for v in stats.values())
            tot_s = sum(sum(v) for v in stats.values())
            print(f"\n  {C.BOLD}{colour}{title}{C.RST}")
            print(f"  {C.BOLD}{'Category':<{c1}} {'Files':>{c2}} {'Size':>{c3}}{C.RST}")
            print(div)
            for cat in sorted(stats):
                sz = stats[cat]
                print(f"  {colour}{cat:<{c1}}{C.RST} {len(sz):>{c2}} {_fmt_bytes(sum(sz)):>{c3}}")
            print(div)
            print(f"  {C.BOLD}{'TOTAL':<{c1}} {tot_f:>{c2}} {_fmt_bytes(tot_s):>{c3}}{C.RST}")

        print()
        print(C.BOLD + C.CYAN + "═" * 52 + C.RST)
        print(C.BOLD + "  DOWNLOAD COMPLETE" + C.RST)
        print(C.BOLD + C.CYAN + "═" * 52 + C.RST)
        print(f"  {C.DIM}Directory :{C.RST} {output_dir}")
        print(f"  {C.DIM}Log file  :{C.RST} {output_dir / META_FILENAME}")

        _table("INTERNAL  (same-site)", stats_int, C.GREEN)
        _table("EXTERNAL  (CDN)",       stats_ext, C.BLUE)
        print()


# ---------------------------------------------------------------------------
# Crawler
# ---------------------------------------------------------------------------

class Crawler:
    def __init__(
        self, settings: dict, output_dir: Path,
        base_netloc: str, display: Display, meta: MetaLog,
    ) -> None:
        self._settings    = settings
        self._output_dir  = output_dir
        self._base_netloc = base_netloc
        self._display     = display
        self._meta        = meta
        self._max_bytes   = settings["max_file_bytes"]

        # Work queue items: (url: str, is_external: bool)
        self._todo         = queue_module.Queue()
        self._visited_lock = threading.Lock()
        self._visited: set[str] = set()

        self._in_flight      = 0
        self._in_flight_lock = threading.Lock()

        self._stats_lock = threading.Lock()
        self.stats_int: dict[str, list[int]] = defaultdict(list)   # same-site
        self.stats_ext: dict[str, list[int]] = defaultdict(list)   # CDN

    # ---- queue helpers ----

    def _enqueue(self, url: str) -> bool:
        """
        Classify url, apply all filters and the block-list, and add to queue.
        Returns True if actually enqueued.
        """
        url, _ = urldefrag(url)
        host   = urlparse(url).netloc.lower().split(":")[0]

        is_external: bool

        if is_same_site(url, self._base_netloc):
            base = self._base_netloc.split(":")[0]

            # Subdomain HTML pages: skip unless save_subdomains is on
            if host != base and host.endswith("." + base):
                if not self._settings.get("save_subdomains", False):
                    ext = Path(urlparse(url).path).suffix.lower()
                    if ext in HTML_EXTS or ext == "":
                        return False    # not crawling subdomain pages

            if not should_download(url, self._settings):
                return False
            is_external = False

        elif is_allowed_external_url(url, self._settings):
            is_external = True

        else:
            # Log blocked analytics/tracking domains; silently drop everything else
            if is_blocked(host):
                self._meta.log_blocked(url, "blocked: analytics/tracking domain")
            return False

        with self._visited_lock:
            if url in self._visited:
                return False
            self._visited.add(url)

        self._todo.put((url, is_external))
        return True

    # ---- worker ----

    def _process(self, item: tuple) -> None:
        url, is_external = item
        self._display.start_item()
        try:
            self._do(url, is_external)
        except Exception as exc:
            self._display.fail(url, f"unexpected: {exc}")
            self._meta.log_fail(url, f"unexpected exception: {exc}")
        finally:
            with self._in_flight_lock:
                self._in_flight -= 1

    def _do(self, url: str, is_external: bool) -> None:
        body, ct, final_url, err = fetch(url, self._max_bytes)

        if err is not None:
            if err.startswith("skipped"):
                self._display.skip(url, err)
                self._meta.log_skip(url, err)
            else:
                self._display.fail(url, err)
                self._meta.log_fail(url, err)
            return

        if body is None:
            self._display.fail(url, "empty response")
            self._meta.log_fail(url, "empty response")
            return

        ct_base = ct.split(";")[0].strip().lower()

        # If the server redirected to a different URL, mark final_url as visited too
        # so we don't re-fetch the same resource via its canonical trailing-slash URL
        norm_final, _ = urldefrag(final_url)
        if norm_final != url:
            with self._visited_lock:
                self._visited.add(norm_final)

        # --- Determine local path ---
        if is_external:
            local = url_to_external_path(url, self._output_dir)
        else:
            local = url_to_site_path(url, self._output_dir, self._base_netloc)

        # --- Extract links from ORIGINAL content (before any rewriting) ---
        # HTML: full link scan (internal + subdomain pages). CDNs never serve HTML.
        # CSS: url() / @import (both internal and external CSS).
        # JS: not scanned (per spec — avoids false positives in comments/strings).
        new_links: set[str] = set()
        if "text/html" in ct_base and not is_external:
            orig_text = body.decode("utf-8", errors="replace")
            new_links = extract_links_html(orig_text, final_url)
        elif "text/css" in ct_base:
            orig_text = body.decode("utf-8", errors="replace")
            new_links = extract_links_css(orig_text, final_url)

        # --- Rewrite URLs to relative paths before saving ---
        if "text/html" in ct_base and not is_external:
            body = rewrite_html(
                body, final_url, local, self._output_dir, self._base_netloc, self._settings
            )
        elif "text/css" in ct_base:
            body = rewrite_css(
                body, final_url, local, self._output_dir, self._base_netloc, self._settings
            )

        # --- Save (bytes written verbatim; nothing executed) ---
        try:
            write_file(local, body, self._output_dir)
        except ValueError:
            reason = "blocked: path traversal"
            self._display.fail(url, reason)
            self._meta.log_fail(url, reason)
            return
        except OSError as e:
            reason = f"write error: {e}"
            self._display.fail(url, reason)
            self._meta.log_fail(url, reason)
            return

        cat = category_of(local, ct)
        with self._stats_lock:
            if is_external:
                self.stats_ext[cat].append(len(body))
            else:
                self.stats_int[cat].append(len(body))

        # Build display marker: [cdn] / [sub] / (space)
        host = urlparse(url).netloc.lower().split(":")[0]
        base = self._base_netloc.split(":")[0]
        if is_external:
            marker = f"{C.BLUE}[cdn]{C.RST} "
        elif host != base:
            marker = f"{C.MAGENTA}[sub]{C.RST} "
        else:
            marker = "      "

        self._display.success(url, cat, len(body), marker)
        self._meta.log_success(url, local, cat, len(body), is_external)

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
                    item = self._todo.get(timeout=1.0)
                except queue_module.Empty:
                    with self._in_flight_lock:
                        if self._in_flight == 0 and self._todo.empty():
                            break
                    continue

                with self._in_flight_lock:
                    self._in_flight += 1
                exe.submit(self._process, item)


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

        subdomain_mode = (
            "full crawl" if settings["save_subdomains"]
            else "assets-only (no HTML crawl)"
        )

        meta    = MetaLog(output_dir, settings, start_url)
        display = Display()
        display.header(start_url, output_dir, subdomain_mode)

        crawler = Crawler(settings, output_dir, base_netloc, display, meta)
        crawler.run()

        display.summary(crawler.stats_int, crawler.stats_ext, output_dir)
        meta.finalize(crawler.stats_int, crawler.stats_ext)

        print(f"{C.DIM}Full log written to: {output_dir / META_FILENAME}{C.RST}\n")

    except KeyboardInterrupt:
        print(f"\n\n{C.YELLOW}Interrupted.{C.RST}")
        sys.exit(0)


if __name__ == "__main__":
    main()
