/* ip-location.js
   Proxied through Flask backend → ip-api.com (free, no key, ≤45 req/min).
   External API endpoint: http://ip-api.com/json/{ip}  (via Flask proxy)
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const API_BASE    = "http://localhost:5501";
const API_IP_LOC  = `${API_BASE}/api/ip-location`;
const API_MY_IP   = `${API_BASE}/api/my-ip`;

// ── DOM ─────────────────────────────────────────────────────────────────────
const ipInput      = document.getElementById("ipInput");
const lookupBtn    = document.getElementById("lookupBtn");
const resultArea   = document.getElementById("resultArea");
const backendBanner= document.getElementById("backendBanner");

// ── Country code → flag emoji ────────────────────────────────────────────────
function flagEmoji(cc) {
    if (!cc || cc.length !== 2) return "🌐";
    return [...cc.toUpperCase()].map(c => String.fromCodePoint(0x1F1E0 - 65 + c.charCodeAt(0))).join("");
}

// ── Main lookup ───────────────────────────────────────────────────────────────
async function doLookup() {
    let ip = ipInput.value.trim();
    resultArea.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.9rem">Looking up…</p>`;
    lookupBtn.disabled = true;

    try {
        // If blank, resolve own IP first
        if (!ip) {
            const myResp = await fetch(API_MY_IP, { signal: AbortSignal.timeout(5000) });
            if (!myResp.ok) throw new Error("Backend offline. Start the Flask server to use this tool.");
            const myData = await myResp.json();
            ip = myData.ipv4 || myData.ipv6;
            if (!ip) throw new Error("Could not determine your public IP.");
        }

        const resp = await fetch(`${API_IP_LOC}?ip=${encodeURIComponent(ip)}`, {
            signal: AbortSignal.timeout(8000),
        });

        if (!resp.ok && resp.status !== 404) {
            backendBanner.classList.remove("hidden");
            throw new Error("Backend offline. Start the Flask server to use this tool.");
        }
        backendBanner.classList.add("hidden");

        const data = await resp.json();
        if (data.error) throw new Error(data.error);

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
        ["IP",          d.query],
        ["Country",     `${d.country} (${d.countryCode})`],
        ["Region",      d.regionName],
        ["City",        d.city],
        ["ZIP",         d.zip],
        ["Latitude",    d.lat],
        ["Longitude",   d.lon],
        ["Timezone",    d.timezone],
        ["ISP",         d.isp],
        ["Organisation",d.org],
        ["ASN",         d.as],
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
