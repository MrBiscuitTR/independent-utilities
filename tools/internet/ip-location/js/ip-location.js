/* ip-location.js
   Calls ip-api.com directly from the browser — no backend needed.
   ip-api.com: free, no key, ≤45 req/min, Access-Control-Allow-Origin: *

   "My IP" auto-detection (when input is blank):
     1. cloudflare.com/cdn-cgi/trace  — CORS-enabled Cloudflare edge endpoint
     2. icanhazip.com                 — Cloudflare-operated plain-text echo
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const IP_API_URL = "http://ip-api.com/json/{ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query";
const CF_TRACE   = "https://cloudflare.com/cdn-cgi/trace";
const ICANHAZIP  = "https://icanhazip.com";

// ── DOM ─────────────────────────────────────────────────────────────────────
const ipInput    = document.getElementById("ipInput");
const lookupBtn  = document.getElementById("lookupBtn");
const resultArea = document.getElementById("resultArea");

// Hide the backend banner — this tool no longer needs the backend
const backendBanner = document.getElementById("backendBanner");
if (backendBanner) backendBanner.classList.add("hidden");

// ── Country code → flag emoji ─────────────────────────────────────────────
function flagEmoji(cc) {
    if (!cc || cc.length !== 2) return "🌐";
    // Regional indicator letters: 'A'=U+1F1E6 … 'Z'=U+1F1FF
    return [...cc.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join("");
}

// ── Resolve own public IP (used when input is blank) ──────────────────────
async function getMyIp() {
    try {
        const r = await fetch(CF_TRACE, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        const body = await r.text();
        if (body.includes("ip=")) {
            const ip = (body.match(/^ip=(.+)$/m) || [])[1]?.trim();
            if (ip) return ip;
        }
    } catch (_) {}

    try {
        const r = await fetch(ICANHAZIP, { signal: AbortSignal.timeout(5000), cache: "no-store" });
        const ip = (await r.text()).trim();
        if (ip && /^[\d:.a-fA-F]+$/.test(ip)) return ip;
    } catch (_) {}

    return null;
}

// ── Main lookup ───────────────────────────────────────────────────────────
async function doLookup() {
    let ip = ipInput.value.trim();
    resultArea.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.9rem">Looking up…</p>`;
    lookupBtn.disabled = true;

    try {
        if (!ip) {
            ip = await getMyIp();
            if (!ip) throw new Error("Could not detect your public IP. Check your connection or enter an IP manually.");
        }

        const url = IP_API_URL.replace("{ip}", encodeURIComponent(ip));
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) throw new Error(`ip-api.com returned HTTP ${resp.status}`);

        const data = await resp.json();
        if (data.status === "fail") throw new Error(data.message || "Lookup failed");

        renderResult(data);
    } catch (e) {
        resultArea.innerHTML = `<div class="loc-error">Error: ${e.message}</div>`;
    } finally {
        lookupBtn.disabled = false;
    }
}

function renderResult(d) {
    const flag = flagEmoji(d.countryCode);
    const fields = [
        ["IP",           d.query],
        ["Country",      `${d.country} (${d.countryCode})`],
        ["Region",       d.regionName],
        ["City",         d.city],
        ["ZIP",          d.zip],
        ["Latitude",     d.lat],
        ["Longitude",    d.lon],
        ["Timezone",     d.timezone],
        ["ISP",          d.isp],
        ["Organisation", d.org],
        ["ASN",          d.as],
    ].filter(([, v]) => v !== undefined && v !== null && v !== "");

    const fieldHtml = fields.map(([k, v]) => `
        <div class="loc-field">
            <div class="loc-field-key">${k}</div>
            <div class="loc-field-val">${v}</div>
        </div>`).join("");

    const mapUrl = `https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}&zoom=10`;

    resultArea.innerHTML = `
        <div class="loc-card">
            <div class="loc-card-header">
                <span class="loc-flag">${flag}</span>
                <div>
                    <div class="loc-ip-big">${d.query}</div>
                    <div class="loc-city-line">${[d.city, d.regionName, d.country].filter(Boolean).join(", ")}</div>
                </div>
            </div>
            <div class="loc-grid">${fieldHtml}</div>
            <div class="loc-map-row">
                <a href="${mapUrl}" target="_blank" rel="noopener">📍 View on OpenStreetMap</a>
            </div>
        </div>`;
}

lookupBtn.addEventListener("click", doLookup);
ipInput.addEventListener("keydown", e => { if (e.key === "Enter") doLookup(); });
