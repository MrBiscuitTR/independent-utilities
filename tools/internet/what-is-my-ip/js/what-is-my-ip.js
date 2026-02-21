/* what-is-my-ip.js
   Backend: http://localhost:5501/api/my-ip (Flask)
   Fallback: Cloudflare /cdn-cgi/trace  (direct browser fetch, no key)
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const API_BASE       = "http://localhost:5501";
const API_MY_IP      = `${API_BASE}/api/my-ip`;
const API_IP_LOC     = `${API_BASE}/api/ip-location`;
// 1.1.1.1/cdn-cgi/trace returns CORS headers — www.cloudflare.com does not
const CF_TRACE       = "https://1.1.1.1/cdn-cgi/trace";

// ── DOM refs ────────────────────────────────────────────────────────────────
const ipv4Val        = document.getElementById("ipv4Val");
const ipv6Val        = document.getElementById("ipv6Val");
const refreshBtn     = document.getElementById("refreshBtn");
const lookupBtn      = document.getElementById("lookupBtn");
const locationResult = document.getElementById("locationResult");
const backendBanner  = document.getElementById("backendBanner");

let currentIp = null;

// ── Load IPs ────────────────────────────────────────────────────────────────
async function loadIPs() {
    ipv4Val.textContent = "loading…";
    ipv4Val.className   = "ip-value loading";
    ipv6Val.textContent = "loading…";
    ipv6Val.className   = "ip-value loading";
    locationResult.classList.add("hidden");

    // Try Flask backend first (gives both IPv4 + IPv6)
    try {
        const resp = await fetch(API_MY_IP, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error("non-200");
        const data = await resp.json();
        backendBanner.classList.add("hidden");
        renderIPs(data.ipv4, data.ipv6);
        return;
    } catch (_) { /* fall through to Cloudflare */ }

    // Fallback: parse Cloudflare trace directly in browser (no backend needed)
    try {
        const resp = await fetch(CF_TRACE, { signal: AbortSignal.timeout(6000) });
        const text = await resp.text();
        const ip   = (text.match(/^ip=(.+)$/m) || [])[1] || null;
        // Browser can only get the IP used for this connection (likely IPv4 or IPv6 depending on system)
        const isV6 = ip && ip.includes(":");
        renderIPs(isV6 ? null : ip, isV6 ? ip : null);
        // Show soft notice (not an error) that backend would give more info
        backendBanner.classList.remove("hidden");
        backendBanner.classList.add("info-banner");
    } catch (e) {
        renderIPs(null, null);
        backendBanner.classList.remove("hidden");
    }
}

function renderIPs(v4, v6) {
    if (v4) {
        ipv4Val.textContent = v4;
        ipv4Val.className   = "ip-value";
        currentIp = v4;
    } else {
        ipv4Val.textContent = "Not available";
        ipv4Val.className   = "ip-value unavail";
    }
    if (v6) {
        ipv6Val.textContent = v6;
        ipv6Val.className   = "ip-value";
        if (!currentIp) currentIp = v6;
    } else {
        ipv6Val.textContent = "Not available";
        ipv6Val.className   = "ip-value unavail";
    }
}

// ── Copy buttons ─────────────────────────────────────────────────────────────
document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const val = document.getElementById(btn.dataset.target).textContent;
        if (!val || val === "—" || val === "Not available" || val === "loading…") return;
        navigator.clipboard.writeText(val).then(() => {
            btn.textContent = "Copied!";
            btn.classList.add("copied");
            setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1500);
        });
    });
});

// ── Location lookup ──────────────────────────────────────────────────────────
lookupBtn.addEventListener("click", async () => {
    if (!currentIp) { alert("No IP address available to look up."); return; }

    locationResult.classList.remove("hidden");
    locationResult.innerHTML = "<p style='color:var(--color-text-muted)'>Looking up location…</p>";

    try {
        const resp = await fetch(`${API_IP_LOC}?ip=${encodeURIComponent(currentIp)}`, {
            signal: AbortSignal.timeout(8000)
        });
        const data = await resp.json();
        if (data.error) throw new Error(data.error);
        renderLocation(data);
    } catch (e) {
        locationResult.innerHTML = `<p class="loc-error">Location lookup failed: ${e.message}</p>`;
    }
});

function renderLocation(d) {
    const rows = [
        ["IP",       d.query],
        ["Country",  `${d.country} (${d.countryCode})`],
        ["Region",   d.regionName],
        ["City",     d.city],
        ["ZIP",      d.zip],
        ["Timezone", d.timezone],
        ["ISP",      d.isp],
        ["Org",      d.org],
        ["AS",       d.as],
        ["Lat/Lon",  `${d.lat}, ${d.lon}`],
    ];
    const items = rows
        .filter(([, v]) => v && v !== " ()")
        .map(([k, v]) => `
            <div class="loc-row">
                <div class="loc-key">${k}</div>
                <div class="loc-val">${v}</div>
            </div>`).join("");
    locationResult.innerHTML = `<div class="loc-grid">${items}</div>`;
}

refreshBtn.addEventListener("click", loadIPs);

// Auto-load on page open
loadIPs();
