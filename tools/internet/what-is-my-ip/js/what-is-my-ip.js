/* what-is-my-ip.js
 *
 * Nothing on this page contacts anything until you press the button. Opening
 * the page makes zero outbound requests, so merely visiting it does not hand
 * your address to anyone.
 *
 * Where the address comes from (chains live in /js/ip-sources.js):
 *   IPv4  ipv4.icanhazip.com  ->  api.ipify.org   ->  cloudflare.com/cdn-cgi/trace
 *   IPv6  ipv6.icanhazip.com  ->  api6.ipify.org  ->  cloudflare.com/cdn-cgi/trace
 * The two families are resolved independently, so having no IPv6 does not cost
 * you the IPv4 answer. The tool reports which provider actually replied.
 *
 * The optional local backend is preferred when present: it answers both
 * families in one request and nothing leaves the machine. It is only tried
 * when this page is itself served over http:// (local development) — on the
 * public https:// site a localhost request would trip the browser's "access
 * devices on your local network" prompt for no benefit.
 */

"use strict";

const S = window.IPSources;

const API_MY_IP = "http://localhost:5501/api/my-ip";
const BACKEND_USABLE = location.protocol === "http:";

const ipv4Val        = document.getElementById("ipv4Val");
const ipv6Val        = document.getElementById("ipv6Val");
const showBtn        = document.getElementById("showBtn");
const lookupBtn      = document.getElementById("lookupBtn");
const locationResult = document.getElementById("locationResult");
const backendBanner  = document.getElementById("backendBanner");
const sourceLine     = document.getElementById("sourceLine");

let currentIp = null;

function setCell(el, text, state) {
    el.textContent = text;
    el.className = "ip-value" + (state ? " " + state : "");
}

function setBanner(type, html) {
    backendBanner.classList.remove("hidden", "info-banner", "warn-banner");
    backendBanner.classList.add(type === "warn" ? "warn-banner" : "info-banner");
    backendBanner.innerHTML = html;
}

function setSource(html) {
    sourceLine.innerHTML = html;
    sourceLine.classList.toggle("hidden", !html);
}

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Load IPs — only ever reached from a click ───────────────────────────────
async function loadIPs() {
    showBtn.disabled = true;
    showBtn.textContent = "Looking up…";
    setCell(ipv4Val, "looking up…", "loading");
    setCell(ipv6Val, "looking up…", "loading");
    locationResult.classList.add("hidden");
    backendBanner.classList.add("hidden");
    setSource("");
    currentIp = null;

    try {
        // 1 — local backend, when this page is itself running locally
        if (BACKEND_USABLE) {
            try {
                const resp = await fetch(API_MY_IP, { signal: AbortSignal.timeout(4000) });
                if (resp.ok) {
                    const data = await resp.json();
                    render(data.ipv4 || null, data.ipv6 || null);
                    setSource("Answered by your local backend on port 5501 — nothing left this machine.");
                    return;
                }
            } catch (_) { /* backend not running — fall through to the public chain */ }
        }

        // 2 — public chains, each family independently
        const [v4, v6] = await Promise.all([
            S.detectIP("v4").catch(e => e),
            S.detectIP("v6").catch(e => e)
        ]);

        const v4ok = v4 && v4.value;
        const v6ok = v6 && v6.value;
        render(v4ok ? v4.value : null, v6ok ? v6.value : null);

        const bits = [];
        if (v4ok) bits.push("IPv4 via <code>" + esc(v4.provider.host) + "</code>");
        if (v6ok) bits.push("IPv6 via <code>" + esc(v6.provider.host) + "</code>");
        setSource(bits.join(" &nbsp;·&nbsp; "));

        if (v4ok && !v6ok) {
            setBanner("info",
                "ℹ️ No IPv6 address found. That usually just means your network is IPv4-only — " +
                "plenty of home connections still are.");
        } else if (!v4ok && v6ok) {
            setBanner("info", "ℹ️ No IPv4 address found — your connection appears to be IPv6-only.");
        } else if (!v4ok && !v6ok) {
            const why = (v4 && v4.details ? v4.details : []).concat(v6 && v6.details ? v6.details : []);
            setBanner("warn",
                "⚠️ Every provider failed. That is usually a tracking-blocker extension or a network " +
                "filter rather than an outage — these endpoints are commonly on blocklists." +
                (why.length ? "<br><small>" + esc(why.join(" · ")) + "</small>" : ""));
        }
    } finally {
        showBtn.disabled = false;
        showBtn.textContent = "Refresh";
    }
}

function render(v4, v6) {
    if (v4) { setCell(ipv4Val, v4); currentIp = v4; }
    else    { setCell(ipv4Val, "Not available", "unavail"); }

    if (v6) { setCell(ipv6Val, v6); if (!currentIp) currentIp = v6; }
    else    { setCell(ipv6Val, "Not available", "unavail"); }

    lookupBtn.disabled = !currentIp;
}

// ── Copy buttons ─────────────────────────────────────────────────────────────
document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const val = document.getElementById(btn.dataset.target).textContent;
        if (!val || !S.isIP(val)) return;
        navigator.clipboard.writeText(val).then(() => {
            btn.textContent = "Copied!";
            btn.classList.add("copied");
            setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1500);
        }).catch(() => { /* clipboard permission denied */ });
    });
});

// ── Country flag emoji ───────────────────────────────────────────────────────
function flagEmoji(cc) {
    if (!cc || cc.length !== 2) return "";
    // Regional indicator letters: 'A'=U+1F1E6 … 'Z'=U+1F1FF
    return [...cc.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join("");
}

// ── Location lookup — a second, separate click ──────────────────────────────
lookupBtn.addEventListener("click", async () => {
    if (!currentIp) return;

    locationResult.classList.remove("hidden");
    locationResult.innerHTML = "<p class='net-source'>Looking up location…</p>";
    lookupBtn.disabled = true;

    try {
        const res = await S.lookupGeo(currentIp);
        renderLocation(res.value, res.provider);
    } catch (e) {
        locationResult.innerHTML =
            "<p class='loc-error'>Location lookup failed: " + esc(e.message) +
            (e.details ? "<br><small>" + esc(e.details.join(" · ")) + "</small>" : "") + "</p>";
    } finally {
        lookupBtn.disabled = false;
    }
});

function renderLocation(d, provider) {
    const flag = flagEmoji(d.countryCode);
    const country = d.country
        ? flag + " " + d.country + (d.countryCode ? " (" + d.countryCode + ")" : "")
        : null;
    const latlon = (d.lat !== undefined && d.lon !== undefined) ? d.lat + ", " + d.lon : null;

    const rows = [
        ["IP",       d.ip],
        ["Country",  country],
        ["Region",   d.region],
        ["City",     d.city],
        ["Postcode", d.postal],
        ["Timezone", d.timezone],
        ["ISP",      d.isp],
        ["Org",      d.org],
        ["ASN",      d.asn],
        ["Lat/Lon",  latlon]
    ];

    const items = rows
        .filter(r => r[1] !== undefined && r[1] !== null && r[1] !== "")
        .map(r => '<div class="loc-row"><div class="loc-key">' + esc(r[0]) +
                  '</div><div class="loc-val">' + esc(r[1]) + "</div></div>")
        .join("");

    locationResult.innerHTML =
        '<div class="loc-grid">' + items + "</div>" +
        '<p class="net-source">Answered by <code>' + esc(provider.host) + "</code>.</p>";
}

// ── Wiring. There is deliberately no loadIPs() call here: the page must make
//    no network request until the user asks for one. ─────────────────────────
showBtn.addEventListener("click", loadIPs);
lookupBtn.disabled = true;
