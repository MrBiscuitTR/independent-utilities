/* ping-traceroute.js
   Backend: http://localhost:5501/api/ping  and  /api/traceroute (Flask, no external API)
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const API_BASE       = "http://localhost:5501";
const API_PING       = `${API_BASE}/api/ping`;
const API_TRACEROUTE = `${API_BASE}/api/traceroute`;

// ── DOM ──────────────────────────────────────────────────────────────────────
const hostInput     = document.getElementById("hostInput");
const modeSelect    = document.getElementById("modeSelect");
const pingOpts      = document.getElementById("pingOpts");
const pingCount     = document.getElementById("pingCount");
const runBtn        = document.getElementById("runBtn");
const resultArea    = document.getElementById("resultArea");
const backendBanner = document.getElementById("backendBanner");

modeSelect.addEventListener("change", () => {
    pingOpts.style.display = modeSelect.value === "ping" ? "flex" : "none";
});

runBtn.addEventListener("click", doRun);
hostInput.addEventListener("keydown", e => { if (e.key === "Enter") doRun(); });

async function doRun() {
    const host = hostInput.value.trim();
    if (!host) { hostInput.focus(); return; }
    const mode = modeSelect.value;

    resultArea.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.9rem">Running ${mode} to ${host}…</p>`;
    runBtn.disabled = true;

    const url     = mode === "ping" ? API_PING : API_TRACEROUTE;
    const body    = mode === "ping"
        ? { host, count: parseInt(pingCount.value, 10) }
        : { host };

    try {
        const resp = await fetch(url, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(body),
            signal:  AbortSignal.timeout(65000),
        });

        if (!resp.ok && resp.status >= 500) {
            backendBanner.classList.remove("hidden");
            throw new Error("Backend offline. Start the Flask server to use this tool.");
        }
        backendBanner.classList.add("hidden");

        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        renderOutput(data, mode);
    } catch (e) {
        resultArea.innerHTML = `<div class="pt-error">Error: ${e.message}</div>`;
    } finally {
        runBtn.disabled = false;
    }
}

function colorLine(line) {
    if (/request timed out|\*\s*\*\s*\*/i.test(line))
        return `<span class="line-fail">${escHtml(line)}</span>`;
    if (/ms|bytes from|traceroute to/i.test(line))
        return `<span class="line-ok">${escHtml(line)}</span>`;
    if (/pinging|tracing route|over a maximum/i.test(line))
        return `<span class="line-header">${escHtml(line)}</span>`;
    return escHtml(line);
}

function escHtml(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function renderOutput(data, mode) {
    const lines = data.output.split("\n").map(colorLine).join("\n");
    const rc    = data.returncode;
    const rcHtml = rc !== undefined
        ? `<p class="${rc === 0 ? "rc-ok" : "rc-fail"}">Exit code: ${rc} (${rc === 0 ? "success" : "unreachable / error"})</p>`
        : "";

    resultArea.innerHTML = `<div class="pt-output">${lines}</div>${rcHtml}`;
}
