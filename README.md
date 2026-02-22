# Independent Utilities by [Cagan](https://cagancalidag.com)

## This is a collection of independent utilities that do not rely on third-party services or external APIs (except for a few that are necessary for specific functionality, such as DNS lookups or IP tracing, even then the dependencies are extremely secure and reliable for long term use)

### For tools that require backend, run

`python tools/internet/python/app.py`
  
This project was designed so that anyone can clone the git repo and and start using it immediately without any setup. Maintained occasionally based on author's mood and needs.
  

  

# External Dependencies

This document lists all third-party services, bundled libraries, browser APIs, and backend requirements referenced in the Utilities Hub.

---

## 🌐 External APIs / Online Services

### IP & Network Detection
- https://cloudflare.com/cdn-cgi/trace  
  (Cloudflare trace endpoint for IP detection fallback)

- https://icanhazip.com  
  (Cloudflare-operated IP detection service)

- https://ip-api.com/json/{ip}  
  (IP geolocation lookup — free tier, no API key)

---

### DNS-over-HTTPS (DoH)
- https://cloudflare-dns.com/dns-query  
  (Cloudflare DNS-over-HTTPS endpoint)

- https://dns.google/resolve  
  (Google DNS-over-HTTPS endpoint)

---

### RDAP (WHOIS via Regional Internet Registries)
- https://rdap.arin.net  
- https://rdap.db.ripe.net  
- https://rdap.apnic.net  
- https://rdap.lacnic.net  
- https://rdap.afrinic.net  

(RDAP endpoints for IP / ASN / Domain WHOIS lookups)

---

### MAC Address Lookup API
- https://api.maclookup.app/v2/macs/{mac}  
  (Used via backend proxy)

---

## 📦 Bundled Third-Party JavaScript Libraries (Served Locally)

These libraries are downloaded and hosted locally. No CDN requests occur at runtime.

- `qrcode.min.js` (QR code generation)
- `jsQR.js` (QR code scanning)
- `pica.min.js` (High-quality image resizing)
- `jszip.min.js` (ZIP file generation)
- `marked.js` (Markdown → HTML conversion)

---

## 🖥 Browser-Native APIs (No External Requests)

These are built-in browser APIs used by tools:

- MediaDevices API (webcam access)
- URL API (encoding / decoding)
- Web Crypto API (secure randomness)
- `navigator.userAgent`
- `window.open`
- `localStorage`

---

## 🧩 Local Backend Dependency

Local backend server:

- http://localhost:5501/api/health  
  (Health check endpoint polled by hub)

### Tools Requiring Local Backend
- Reverse IP hostname resolution
- MAC Address Lookup (proxies to maclookup.app)
- Port Checker
- HTTP Headers & Server OS detection
- SSL Certificate Checker
- Ping & Traceroute
- Website Link Analyzer & Sitemap generator

---

# Summary

- External online services: 10 endpoints
- Bundled third-party JS libraries: 5
- Browser-native APIs: 6
- Local backend dependency: 1 (Flask server on port 5501)