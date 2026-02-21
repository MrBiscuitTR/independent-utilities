/* ssl-checker.js
   Backend: http://localhost:5501/api/ssl-cert (Flask, pure socket/ssl — no external API)
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const API_BASE    = "http://localhost:5501";
const API_SSL     = `${API_BASE}/api/ssl-cert`;

// ── DOM ──────────────────────────────────────────────────────────────────────
const hostInput     = document.getElementById("hostInput");
const checkBtn      = document.getElementById("checkBtn");
const resultArea    = document.getElementById("resultArea");
const backendBanner = document.getElementById("backendBanner");

checkBtn.addEventListener("click", doCheck);
hostInput.addEventListener("keydown", e => { if (e.key === "Enter") doCheck(); });

async function doCheck() {
    const host = hostInput.value.trim();
    if (!host) { hostInput.focus(); return; }

    resultArea.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.9rem">Connecting to ${host}:443…</p>`;
    checkBtn.disabled = true;

    try {
        const resp = await fetch(`${API_SSL}?host=${encodeURIComponent(host)}`, {
            signal: AbortSignal.timeout(12000),
        });

        if (!resp.ok && resp.status >= 500) {
            backendBanner.classList.remove("hidden");
            throw new Error("Backend offline. Start the Flask server to use this tool.");
        }
        backendBanner.classList.add("hidden");

        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        renderCert(data);
    } catch (e) {
        resultArea.innerHTML = `<div class="ssl-error">Error: ${e.message}</div>`;
    } finally {
        checkBtn.disabled = false;
    }
}

function daysUntil(dateStr) {
    // Python's ssl returns dates like "Nov 20 00:00:00 2025 GMT"
    const d = new Date(dateStr);
    return Math.floor((d - Date.now()) / 86400000);
}

function renderCert(d) {
    const expDays = daysUntil(d.notAfter);
    let badgeClass = "ok";
    let badgeText  = `Valid · ${expDays}d left`;
    if (expDays < 0)  { badgeClass = "expired"; badgeText = "Expired!"; }
    else if (expDays < 30) { badgeClass = "warning"; badgeText = `Expires in ${expDays}d`; }

    const valClass = expDays < 0 ? "expired" : expDays < 30 ? "expiring" : "ok";

    const fields = [
        ["Common Name",    d.subject?.commonName       || "—"],
        ["Organisation",   d.subject?.organizationName || "—"],
        ["Issued By",      d.issuer?.organizationName  || "—"],
        ["Issuer CN",      d.issuer?.commonName        || "—"],
        ["Serial #",       d.serialNumber              || "—"],
        ["Cert Version",   d.version !== undefined ? `v${d.version + 1}` : "—"],
        ["TLS Version",    d.tlsVersion                || "—"],
        ["Cipher",         d.cipher                    || "—"],
        ["Valid From",     d.notBefore                 || "—"],
        ["Valid Until",    d.notAfter                  || "—"],
    ];

    const fieldHtml = fields.map(([k, v]) => `
        <div class="ssl-field">
            <div class="ssl-field-key">${k}</div>
            <div class="ssl-field-val ${k === "Valid Until" ? valClass : ""}">${v}</div>
        </div>`).join("");

    const sansHtml = d.sans && d.sans.length
        ? `<div class="ssl-sans">
               <div class="ssl-sans-title">Subject Alt Names (${d.sans.length})</div>
               <div class="sans-list">${d.sans.map(s => `<span class="san-chip">${s}</span>`).join("")}</div>
           </div>`
        : "";

    resultArea.innerHTML = `
        <div class="ssl-card">
            <div class="ssl-card-header">
                <span class="ssl-hostname">${d.host}</span>
                <span class="ssl-valid-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="ssl-grid">${fieldHtml}</div>
            ${sansHtml}
        </div>`;
}
