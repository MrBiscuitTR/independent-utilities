/* mac-lookup.js
   Proxied through Flask backend → maclookup.app (free, no key).
   External API endpoint: https://api.maclookup.app/v2/macs/{mac}  (via Flask proxy)
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const API_BASE       = "http://localhost:5501";
const API_MAC_LOOKUP = `${API_BASE}/api/mac-lookup`;

// ── DOM ──────────────────────────────────────────────────────────────────────
const macInput     = document.getElementById("macInput");
const lookupBtn    = document.getElementById("lookupBtn");
const resultArea   = document.getElementById("resultArea");
const backendBanner= document.getElementById("backendBanner");

// ── Format MAC for display ────────────────────────────────────────────────────
function formatMac(raw) {
    const hex = raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
    const pairs = hex.match(/.{1,2}/g) || [];
    return pairs.join(":").slice(0, 17);
}

// ── Main lookup ───────────────────────────────────────────────────────────────
async function doLookup() {
    const raw = macInput.value.trim();
    if (!raw) { macInput.focus(); return; }

    resultArea.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.9rem">Looking up…</p>`;
    lookupBtn.disabled = true;

    try {
        const resp = await fetch(`${API_MAC_LOOKUP}?mac=${encodeURIComponent(raw)}`, {
            signal: AbortSignal.timeout(8000),
        });

        if (!resp.ok && resp.status >= 500) {
            backendBanner.classList.remove("hidden");
            throw new Error("Backend offline. Start the Flask server to use this tool.");
        }
        backendBanner.classList.add("hidden");

        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        renderResult(raw, data);
    } catch (e) {
        resultArea.innerHTML = `<div class="mac-error">Error: ${e.message}</div>`;
    } finally {
        lookupBtn.disabled = false;
    }
}

function renderResult(raw, d) {
    const displayMac = formatMac(raw);
    const fields = [
        ["Vendor / Company", d.company      || d.companyName || "Unknown"],
        ["OUI Prefix",       d.macPrefix    || d.oui         || "—"],
        ["Address",          d.companyAddress|| d.address     || "—"],
        ["Country",          d.countryCode  || "—"],
        ["Type",             d.type         || "—"],
        ["Private",          d.private      ? "Yes" : "No"],
    ];

    const fieldHtml = fields.map(([k, v]) => `
        <div class="mac-field">
            <div class="mac-field-key">${k}</div>
            <div class="mac-field-val">${v}</div>
        </div>`).join("");

    resultArea.innerHTML = `
        <div class="mac-card">
            <div class="mac-card-header">${displayMac || raw.toUpperCase()}</div>
            <div class="mac-fields">${fieldHtml}</div>
        </div>`;
}

lookupBtn.addEventListener("click", doLookup);
macInput.addEventListener("keydown", e => { if (e.key === "Enter") doLookup(); });
