/* what-is-my-ip.js
   Detection priority (highest to lowest):
     1. Flask backend  http://localhost:5501/api/my-ip
        — returns both IPv4 + IPv6 via server-side Cloudflare trace; no browser extension can block it.
     2. cloudflare.com/cdn-cgi/trace  (no www — this variant sends CORS headers)
        — Cloudflare's own edge, no key, no account, returns plain key=value text.
     3. icanhazip.com  (operated by Cloudflare since 2021)
        — plain-text IP echo, CORS-enabled, no key, no tracking, no fingerprinting.
        — Different domain from cloudflare.com so blocked by a different set of rules.
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const API_BASE    = "http://localhost:5501";
const API_MY_IP   = `${API_BASE}/api/my-ip`;
const API_IP_LOC  = `${API_BASE}/api/ip-location`;
const CF_TRACE    = "https://cloudflare.com/cdn-cgi/trace"; // CORS: Access-Control-Allow-Origin: *
const ICANHAZIP   = "https://icanhazip.com";               // Cloudflare-operated plain-text echo

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

    // 1 — Try Flask backend (returns both IPv4 + IPv6, immune to browser extensions)
    try {
        const resp = await fetch(API_MY_IP, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) throw new Error("non-200");
        const data = await resp.json();
        backendBanner.classList.add("hidden");
        renderIPs(data.ipv4, data.ipv6);
        return;
    } catch (_) { /* backend offline — try browser-side fallbacks */ }

    // 2 — Cloudflare trace (cloudflare.com, no www — this variant has CORS headers)
    try {
        const resp = await fetch(CF_TRACE, { signal: AbortSignal.timeout(6000), cache: "no-store" });
        if (!resp.ok) throw new Error("non-200");
        const body = await resp.text();
        if (!body.includes("ip=")) throw new Error("unexpected response"); // catches data: URI redirects
        const ip   = (body.match(/^ip=(.+)$/m) || [])[1]?.trim() || null;
        if (!ip) throw new Error("no ip");
        const isV6 = ip.includes(":");
        renderIPs(isV6 ? null : ip, isV6 ? ip : null);
        setBanner("info",
            "ℹ️ Showing your IP via <strong>Cloudflare trace</strong> (cloudflare.com/cdn-cgi/trace). " +
            "Only one IP shown — start <code>python app.py</code> for both IPv4 + IPv6.");
        return;
    } catch (_) { /* Cloudflare blocked — try icanhazip */ }

    // 3 — icanhazip.com (operated by Cloudflare since 2021, plain-text echo, no tracking)
    try {
        const resp = await fetch(ICANHAZIP, { signal: AbortSignal.timeout(6000), cache: "no-store" });
        if (!resp.ok) throw new Error("non-200");
        const ip = (await resp.text()).trim();
        if (!ip || !/^[\d:.a-fA-F]+$/.test(ip)) throw new Error("bad response");
        const isV6 = ip.includes(":");
        renderIPs(isV6 ? null : ip, isV6 ? ip : null);
        setBanner("info",
            "ℹ️ Showing your IP via <strong>icanhazip.com</strong> (Cloudflare-operated plain-text echo). " +
            "Only one IP shown — start <code>python app.py</code> for both IPv4 + IPv6.");
        return;
    } catch (_) { /* all browser-side options exhausted */ }

    // All fallbacks blocked — explain clearly
    renderIPs(null, null);
    setBanner("warn",
        "⚠️ IP detection was blocked by a browser extension (Tracking Prevention or similar). " +
        "Start <code>python app.py</code> to detect your IP via the local backend — it cannot be blocked by extensions.");
}

function setBanner(type, html) {
    backendBanner.classList.remove("hidden", "info-banner", "warn-banner");
    backendBanner.classList.add(type === "warn" ? "warn-banner" : "info-banner");
    backendBanner.innerHTML = html;
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
        locationResult.innerHTML = `<p class="loc-error">Location lookup failed: ${e.message}. Is <code> python app.py </code> running?</p>`;
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
