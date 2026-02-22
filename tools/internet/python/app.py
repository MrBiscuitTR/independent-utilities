"""
Flask backend for internet tools — port 5501.
All endpoints live here; ip-tools.py provides helper functions.

External dependencies (none require API keys):
  - maclookup.app       : /api/mac-lookup     (free, no key)
  - Cloudflare DoH      : DNS queries via fetch in JS (no server call needed)
  - All other endpoints : pure Python / socket / ssl

Note: /api/ip-location was removed — ip-api.com has CORS headers so the browser
      calls it directly now. /api/my-ip is still used by what-is-my-ip (backend-on
      path, returns both IPv4 + IPv6 via forced-stack connections).
"""

import ipaddress
import json
import re
import socket
import ssl
import subprocess
import sys
import urllib.request
import urllib.error
import concurrent.futures
from flask import Flask, jsonify, request
from flask_cors import CORS

# ── Import existing ip-tools helpers ──────────────────────────────────────────
from ip_tools import get_public_ipv4, get_public_ipv6

app = Flask(__name__)
CORS(app, origins=["http://localhost:*", "http://127.0.0.1:*", "null"])

# ─────────────────────────────────────────────────────────────────────────────
# External API endpoints — stored here for easy auditing
# ─────────────────────────────────────────────────────────────────────────────
_API_MAC_LOOKUP = "https://api.maclookup.app/v2/macs/{mac}"

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_json(url, timeout=8):
    """Simple HTTP GET → parsed JSON dict. Raises on error."""
    req = urllib.request.Request(url, headers={"User-Agent": "utilities-hub/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _is_valid_host(host):
    """Reject empty, obviously malformed, or private hosts to prevent SSRF."""
    host = host.strip().rstrip(".")
    if not host or len(host) > 253:
        return False
    # Allow IPs and hostnames; block localhost variants
    blocked = {"localhost", "0.0.0.0", "::1", "127.0.0.1"}
    if host.lower() in blocked:
        return False
    try:
        addr = ipaddress.ip_address(host)
        if addr.is_private or addr.is_loopback or addr.is_link_local:
            return False
    except ValueError:
        pass  # It's a hostname, not an IP — allow
    return True


# ─────────────────────────────────────────────────────────────────────────────
# /api/my-ip  — returns caller's IPv4 and IPv6 as seen by the server
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/my-ip")
def api_my_ip():
    ipv4 = get_public_ipv4()
    ipv6 = get_public_ipv6()
    return jsonify({"ipv4": ipv4, "ipv6": ipv6})


# ─────────────────────────────────────────────────────────────────────────────
# /api/mac-lookup?mac=<address>
# Uses maclookup.app (free, no key)
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/mac-lookup")
def api_mac_lookup():
    mac = request.args.get("mac", "").strip()
    # Normalise separators
    mac_clean = re.sub(r"[^0-9A-Fa-f]", "", mac)
    if len(mac_clean) < 6:
        return jsonify({"error": "Provide at least the first 3 octets (OUI)"}), 400

    oui = ":".join(mac_clean[i:i+2] for i in range(0, min(12, len(mac_clean)), 2))
    url = _API_MAC_LOOKUP.format(mac=oui)
    try:
        data = _fetch_json(url)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return jsonify({"error": "OUI not found in database"}), 404
        return jsonify({"error": f"HTTP {e.code}"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    return jsonify(data)


# ─────────────────────────────────────────────────────────────────────────────
# /api/port-check  POST
# { "host": "...", "ports": [{"port":80,"proto":"tcp"}, ...] }
# TCP: connect scan.  UDP: send empty datagram, listen for ICMP unreachable.
# (UDP is best-effort — firewalls silently drop → shown as "open|filtered")
# Cap: 30 ports total.
# ─────────────────────────────────────────────────────────────────────────────

def _check_tcp(host, port, timeout=2):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def _check_udp(host, port, timeout=2):
    """
    Send a zero-byte UDP datagram and wait for a response.
      - ICMP port-unreachable (ConnectionRefusedError) → closed
      - Timeout                                         → open|filtered
      - Data received                                   → open
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        sock.sendto(b"", (host, port))
        sock.recvfrom(1024)
        sock.close()
        return "open"
    except socket.timeout:
        try: sock.close()
        except: pass
        return "open|filtered"
    except ConnectionRefusedError:
        try: sock.close()
        except: pass
        return "closed"
    except Exception:
        try: sock.close()
        except: pass
        return "closed"

def _scan_worker(host, port, proto):
    """Worker function to be executed in a thread."""
    if proto == "udp":
        status = _check_udp(host, port, timeout=2)
        return {"port": port, "proto": "udp", "status": status, "open": status != "closed"}
    else:
        is_open = _check_tcp(host, port, timeout=2)
        return {"port": port, "proto": "tcp", "status": "open" if is_open else "closed", "open": is_open}

@app.route("/api/port-check", methods=["POST"])
def api_port_check():
    body = request.get_json(force=True, silent=True) or {}
    host = body.get("host", "").strip() or get_public_ipv4()
    # Validation
    if not host or not _is_valid_host(host):
        return jsonify({"error": "Invalid host"}), 400
    ports_raw = body.get("ports", [])
    if not isinstance(ports_raw, list) or not ports_raw:
        return jsonify({"error": "ports list required"}), 400
    # Sanitize entries (Cap at 30)
    entries = []
    for p in ports_raw[:30]:
        if isinstance(p, dict):
            entries.append((host, int(p.get("port", 0)), str(p.get("proto", "tcp")).lower()))
        else:
            entries.append((host, int(p), "tcp"))

    # Filter valid ports
    entries = [e for e in entries if 1 <= e[1] <= 65535]
    results = []

    # --- Parallel Execution Block ---
    # max_workers=30 ensures all ports scan at the same time
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(entries)) as executor:
        # Map the worker function to our list of port tuples
        future_to_port = {executor.submit(_scan_worker, *e): e for e in entries}

        for future in concurrent.futures.as_completed(future_to_port):
            try:
                data = future.result()
                results.append(data)
            except Exception as exc:
                # Handle unexpected thread errors (e.g. DNS failure during scan)
                port_info = future_to_port[future]
                results.append({"port": port_info[1], "error": str(exc)})
    return jsonify({"host": host, "results": results})


# ─────────────────────────────────────────────────────────────────────────────
# /api/http-headers?url=<url>
# Fetches the response headers of a URL and returns them (no body)
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/http-headers")
def api_http_headers():
    url = request.args.get("url", "").strip()
    if not url:
        return jsonify({"error": "url parameter required"}), 400
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "utilities-hub/1.0"},
            method="HEAD"
        )
        # Don't follow redirects — show headers of the first response
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
        with opener.open(req, timeout=8) as resp:
            headers = dict(resp.headers)
            status  = resp.status
            final_url = resp.url
    except urllib.error.HTTPError as e:
        headers   = dict(e.headers)
        status    = e.code
        final_url = url
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"url": final_url, "status": status, "headers": headers})


# ─────────────────────────────────────────────────────────────────────────────
# /api/ssl-cert?host=<hostname>
# Retrieves SSL certificate details (no external API — pure socket/ssl)
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/ssl-cert")
def api_ssl_cert():
    host = request.args.get("host", "").strip().rstrip("/")
    # Strip any scheme the user might have typed
    host = re.sub(r"^https?://", "", host).split("/")[0]

    if not host:
        return jsonify({"error": "host parameter required"}), 400
    if not _is_valid_host(host):
        return jsonify({"error": "Invalid or private host"}), 400

    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=8) as raw:
            with ctx.wrap_socket(raw, server_hostname=host) as tls:
                cert = tls.getpeercert()
                cipher = tls.cipher()
                version = tls.version()
    except ssl.SSLCertVerificationError as e:
        return jsonify({"error": f"SSL verification failed: {e}"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    # Parse subject / issuer into dicts
    def _rdn(rdn_seq):
        d = {}
        for rdn in rdn_seq:
            for k, v in rdn:
                d[k] = v
        return d

    subject = _rdn(cert.get("subject", ()))
    issuer  = _rdn(cert.get("issuer", ()))
    sans    = [v for t, v in cert.get("subjectAltName", []) if t == "DNS"]

    return jsonify({
        "host":        host,
        "subject":     subject,
        "issuer":      issuer,
        "notBefore":   cert.get("notBefore"),
        "notAfter":    cert.get("notAfter"),
        "sans":        sans,
        "serialNumber":cert.get("serialNumber"),
        "version":     cert.get("version"),
        "tlsVersion":  version,
        "cipher":      cipher[0] if cipher else None,
    })


# ─────────────────────────────────────────────────────────────────────────────
# /api/ping  POST  { "host": "...", "count": 4 }
# Runs system ping; returns RTT lines (Windows & Unix compatible)
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/ping", methods=["POST"])
def api_ping():
    body  = request.get_json(force=True, silent=True) or {}
    host  = body.get("host", "").strip()
    try:
        count = min(int(body.get("count", 4)), 10)
    except (ValueError, TypeError):
        count = 4

    if not host:
        return jsonify({"error": "host required"}), 400
    if not _is_valid_host(host):
        return jsonify({"error": "Invalid or private host"}), 400

    flag = "-n" if sys.platform == "win32" else "-c"
    try:
        proc = subprocess.run(
            ["ping", flag, str(count), host],
            capture_output=True, text=True, timeout=30
        )
        output = proc.stdout + proc.stderr
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Ping timed out"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"host": host, "output": output, "returncode": proc.returncode})


# ─────────────────────────────────────────────────────────────────────────────
# /api/traceroute  POST  { "host": "..." }
# Runs tracert (Windows) or traceroute (Unix)
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/traceroute", methods=["POST"])
def api_traceroute():
    body = request.get_json(force=True, silent=True) or {}
    host = body.get("host", "").strip()

    if not host:
        return jsonify({"error": "host required"}), 400
    if not _is_valid_host(host):
        return jsonify({"error": "Invalid or private host"}), 400

    cmd = ["tracert", "-d", "-h", "20", host] if sys.platform == "win32" \
        else ["traceroute", "-n", "-m", "20", host]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        output = proc.stdout + proc.stderr
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Traceroute timed out"}), 504
    except FileNotFoundError:
        return jsonify({"error": "traceroute not installed on server"}), 501
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"host": host, "output": output})


# ─────────────────────────────────────────────────────────────────────────────
# /api/hostname?ip=<ip>  — reverse DNS
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/hostname")
def api_hostname():
    ip = request.args.get("ip", "").strip()
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        return jsonify({"error": "Invalid IP address"}), 400

    try:
        hostname = socket.gethostbyaddr(ip)[0]
    except socket.herror:
        hostname = None
    except Exception as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"ip": ip, "hostname": hostname})


# ─────────────────────────────────────────────────────────────────────────────
# /api/health  — quick liveness check used by the frontend to grey tools
# ─────────────────────────────────────────────────────────────────────────────
@app.route("/api/health")
def api_health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5501, debug=False)
