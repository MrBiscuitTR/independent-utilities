/* http-headers.js
   Backend: http://localhost:5501/api/http-headers (Flask, no external API)
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const API_BASE        = "http://localhost:5501";
const API_HTTP_HEADERS= `${API_BASE}/api/http-headers`;

// ── Security headers to highlight ───────────────────────────────────────────
const SECURITY_HEADERS = new Set([
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "x-xss-protection",
]);

// ── DOM ──────────────────────────────────────────────────────────────────────
const urlInput      = document.getElementById("urlInput");
const checkBtn      = document.getElementById("checkBtn");
const resultArea    = document.getElementById("resultArea");
const backendBanner = document.getElementById("backendBanner");

checkBtn.addEventListener("click", doCheck);
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") doCheck(); });

async function doCheck() {
    const url = urlInput.value.trim();
    if (!url) { urlInput.focus(); return; }

    resultArea.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.9rem">Fetching headers…</p>`;
    checkBtn.disabled = true;

    try {
        const resp = await fetch(`${API_HTTP_HEADERS}?url=${encodeURIComponent(url)}`, {
            signal: AbortSignal.timeout(12000),
        });

        if (!resp.ok && resp.status >= 500) {
            backendBanner.classList.remove("hidden");
            throw new Error("Backend offline. Start the Flask server to use this tool.");
        }
        backendBanner.classList.add("hidden");

        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        renderHeaders(data);
    } catch (e) {
        resultArea.innerHTML = `<div class="hh-error">Error: ${e.message}</div>`;
    } finally {
        checkBtn.disabled = false;
    }
}

function statusClass(code) {
    if (code >= 500) return "status-5xx";
    if (code >= 400) return "status-4xx";
    if (code >= 300) return "status-3xx";
    return "status-2xx";
}

function renderHeaders(data) {
    const missing = [...SECURITY_HEADERS].filter(h => !Object.keys(data.headers).map(k => k.toLowerCase()).includes(h));

    const rows = Object.entries(data.headers).sort(([a],[b])=>a.localeCompare(b)).map(([k, v]) => {
        const isSec = SECURITY_HEADERS.has(k.toLowerCase());
        return `<tr><td>${k}</td><td>${v}${isSec ? ' <span class="security-ok">✓</span>' : ""}</td></tr>`;
    }).join("");

    const missingHtml = missing.length
        ? `<p class="security-warn" style="margin-top:0.75rem;font-size:0.85rem">⚠️ Missing security headers: ${missing.join(", ")}</p>`
        : `<p class="security-ok" style="margin-top:0.75rem;font-size:0.85rem">✓ All common security headers present</p>`;

    resultArea.innerHTML = `
        <div class="hh-status-bar">
            <span class="status-code ${statusClass(data.status)}">${data.status}</span>
            <span class="hh-url">${data.url}</span>
        </div>
        <table class="hh-table">
            <thead><tr><th>Header</th><th>Value</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        ${missingHtml}`;
}
