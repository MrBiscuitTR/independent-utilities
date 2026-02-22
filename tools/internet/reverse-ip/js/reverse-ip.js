/* reverse-ip.js
   Two tools in one page:
     1. Reverse IP Lookup — IP → hostname (requires backend /api/hostname)
     2. Website to IP    — domain → IPs via DNS-over-HTTPS (browser-direct)

   External API endpoints:
     - http://localhost:5501/api/hostname?ip={ip}  (local backend, reverse DNS)
     - https://cloudflare-dns.com/dns-query        (Cloudflare DoH, forward lookup)
     - https://dns.google/resolve                  (Google DoH, forward lookup)
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const BACKEND_HOSTNAME = "http://localhost:5501/api/hostname";
const DOH_CF = "https://cloudflare-dns.com/dns-query";
const DOH_GG = "https://dns.google/resolve";

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function dohUrl(name, type) {
    const provider = document.querySelector('input[name="doh"]:checked')?.value || "cloudflare";
    const base = provider === "google" ? DOH_GG : DOH_CF;
    return `${base}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
}

async function dohQuery(name, type) {
    const resp = await fetch(dohUrl(name, type), {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`DoH HTTP ${resp.status}`);
    return resp.json();
}

function showEl(id)  { document.getElementById(id).classList.remove("hidden"); }
function hideEl(id)  { document.getElementById(id).classList.add("hidden"); }
function setErr(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove("hidden");
}
function clearErr(id) { document.getElementById(id).classList.add("hidden"); }

function resultRow(label, value, mono) {
    return `<div class="rip-row">
        <span class="rip-key">${esc(label)}</span>
        <span class="rip-val${mono ? " mono" : ""}">${esc(value)}</span>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// Section 1 — Reverse IP Lookup
// ════════════════════════════════════════════════════════════════════════════
const ripInput  = document.getElementById("ripInput");
const ripBtn    = document.getElementById("ripBtn");
const ripResult = document.getElementById("ripResult");

ripBtn.addEventListener("click", doReverseIP);
ripInput.addEventListener("keydown", e => { if (e.key === "Enter") doReverseIP(); });

async function doReverseIP() {
    const ip = ripInput.value.trim();
    if (!ip) { ripInput.focus(); return; }

    clearErr("ripError");
    ripResult.innerHTML = `<p class="rip-loading">Looking up hostname&#x2026;</p>`;
    showEl("ripResult");
    ripBtn.disabled = true;

    try {
        const resp = await fetch(`${BACKEND_HOSTNAME}?ip=${encodeURIComponent(ip)}`,
            { signal: AbortSignal.timeout(8000) });

        if (!resp.ok) {
            if (resp.status === 0 || resp.status === undefined) throw new Error("backend_offline");
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        const hostname = data.hostname;
        ripResult.innerHTML = `<div class="rip-card">
            ${resultRow("IP Address", ip, true)}
            ${resultRow("Hostname", hostname || "No PTR record found", true)}
        </div>`;
    } catch(e) {
        if (e.message === "backend_offline" || e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
            ripResult.innerHTML = `<div class="rip-offline">
                <strong>&#x26A0;&#xFE0F; Backend offline</strong><br>
                Reverse DNS lookup requires the local backend. Start <code>python app.py</code> to use this feature.
            </div>`;
        } else {
            ripResult.innerHTML = `<div class="rip-error">${esc(e.message)}</div>`;
        }
    } finally {
        ripBtn.disabled = false;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// Section 2 — Website to IP
// ════════════════════════════════════════════════════════════════════════════
const w2ipInput  = document.getElementById("w2ipInput");
const w2ipBtn    = document.getElementById("w2ipBtn");
const w2ipResult = document.getElementById("w2ipResult");

w2ipBtn.addEventListener("click", doWebsiteToIP);
w2ipInput.addEventListener("keydown", e => { if (e.key === "Enter") doWebsiteToIP(); });

async function doWebsiteToIP() {
    let domain = w2ipInput.value.trim();
    // Strip scheme and path
    domain = domain.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0].trim();
    if (!domain) { w2ipInput.focus(); return; }

    clearErr("w2ipError");
    w2ipResult.innerHTML = `<p class="rip-loading">Resolving &#x201C;${esc(domain)}&#x201D;&#x2026;</p>`;
    showEl("w2ipResult");
    w2ipBtn.disabled = true;

    try {
        const [aData, aaaaData] = await Promise.all([
            dohQuery(domain, "A").catch(() => ({})),
            dohQuery(domain, "AAAA").catch(() => ({})),
        ]);

        const aRecs    = (aData.Answer    || []).filter(r => r.type === 1).map(r => r.data);
        const aaaaRecs = (aaaaData.Answer || []).filter(r => r.type === 28).map(r => r.data);

        if (aRecs.length === 0 && aaaaRecs.length === 0) {
            const status = aData.Status;
            if (status === 3) {
                w2ipResult.innerHTML = `<div class="rip-error">NXDOMAIN &#x2014; domain does not exist.</div>`;
            } else {
                w2ipResult.innerHTML = `<div class="rip-error">No A or AAAA records found for <strong>${esc(domain)}</strong>.</div>`;
            }
            return;
        }

        const aRows    = aRecs.map(ip => resultRow("IPv4 (A)", ip, true)).join("");
        const aaaaRows = aaaaRecs.map(ip => resultRow("IPv6 (AAAA)", ip, true)).join("");

        w2ipResult.innerHTML = `<div class="rip-card">
            ${resultRow("Domain", domain, false)}
            ${aRows}
            ${aaaaRows}
            ${aRecs.length === 0    ? resultRow("IPv4 (A)",    "No A records",    false) : ""}
            ${aaaaRecs.length === 0 ? resultRow("IPv6 (AAAA)", "No AAAA records", false) : ""}
        </div>`;
    } catch(e) {
        w2ipResult.innerHTML = `<div class="rip-error">${esc(e.message)}</div>`;
    } finally {
        w2ipBtn.disabled = false;
    }
}
