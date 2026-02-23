/* smtp-test.js
   Calls the local Flask backend at /api/smtp-test.
   Backend dependency: tools/internet/python/app.py (port 5501)
*/
"use strict";

const API_BASE = "http://127.0.0.1:5501";

function onPortSelChange() {
    const sel = document.getElementById("smtpPortSel");
    document.getElementById("customPortField").style.display =
        sel.value === "custom" ? "" : "none";
}

function getPort() {
    const sel = document.getElementById("smtpPortSel").value;
    if (sel === "custom") {
        return parseInt(document.getElementById("smtpPortCustom").value) || 587;
    }
    return parseInt(sel);
}

async function runTest() {
    const host = document.getElementById("smtpHost").value.trim();
    const port = getPort();
    const tls  = document.getElementById("smtpTLS").value;
    const ehlo = document.getElementById("smtpEhlo").value.trim() || "test.local";

    if (!host) return;

    const btn = document.getElementById("testBtn");
    btn.textContent = "Testing…";
    btn.disabled = true;

    const resultSection = document.getElementById("resultSection");
    resultSection.innerHTML = '<div style="padding:1rem;color:var(--color-text-muted);font-size:0.9rem">Connecting to backend…</div>';
    resultSection.classList.remove("hidden");

    try {
        const resp = await fetch(`${API_BASE}/api/smtp-test`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ host, port, tls, ehlo }),
        });

        document.getElementById("backendWarning").classList.add("hidden");

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
            showError(err.error || `HTTP ${resp.status}`);
            return;
        }

        const data = await resp.json();
        showResult(host, port, tls, data);
    } catch (e) {
        document.getElementById("backendWarning").classList.remove("hidden");
        showError("Could not reach backend. Make sure Flask is running on port 5501.");
    } finally {
        btn.textContent = "Test SMTP Connection";
        btn.disabled = false;
    }
}

function showError(msg) {
    document.getElementById("resultSection").innerHTML =
        `<div class="smtp-result-card"><div class="smtp-result-header">
            <span class="smtp-status-badge smtp-badge-fail">✗ Error</span>
        </div><div style="padding:0.8rem 1rem;font-size:0.88rem;color:#c00">${escHtml(msg)}</div></div>`;
}

function showResult(host, port, tls, data) {
    const connected = data.connected === true;
    const rtt       = data.rtt_ms != null ? `${data.rtt_ms} ms` : "—";
    const banner    = data.banner || "";
    const ehloLines = data.ehlo || [];
    const tlsOk     = data.tls_ok;
    const tlsVer    = data.tls_version || "";
    const tlsCipher = data.tls_cipher || "";
    const errorMsg  = data.error || "";

    // Status badge
    const badgeCls  = connected ? "smtp-badge-ok" : "smtp-badge-fail";
    const badgeTxt  = connected ? "✓ Connected" : "✗ Failed";

    // Info rows
    const infoRows = [
        { k: "Host",       v: host },
        { k: "Port",       v: String(port) },
        { k: "TLS Mode",   v: tls },
        { k: "RTT",        v: rtt },
        { k: "Banner",     v: banner || "(none)" },
    ];

    if (tlsOk != null) {
        infoRows.push({ k: "TLS",     v: tlsOk ? `✓ Established` : "✗ Failed" });
        if (tlsVer)    infoRows.push({ k: "TLS Version", v: tlsVer });
        if (tlsCipher) infoRows.push({ k: "Cipher",      v: tlsCipher });
    }

    if (errorMsg) {
        infoRows.push({ k: "Error", v: errorMsg });
    }

    // EHLO capabilities
    let capHtml = "";
    if (ehloLines.length > 0) {
        const caps = ehloLines.map(line => {
            const cap = line.replace(/^250[-\s]/, "").trim();
            const lc = cap.toLowerCase();
            const cls = lc.startsWith("starttls") ? "smtp-cap-starttls" :
                        lc.startsWith("auth")     ? "smtp-cap-auth" : "smtp-cap";
            return `<span class="${cls}">${escHtml(cap)}</span>`;
        });
        capHtml = `<div class="smtp-result-card">
            <div class="smtp-result-header">EHLO Capabilities (${ehloLines.length})</div>
            <div class="smtp-cap-list">${caps.join("")}</div>
        </div>`;
    }

    // Raw conversation
    const rawLines = data.raw_conversation || [];
    let rawHtml = "";
    if (rawLines.length > 0) {
        rawHtml = `<div class="smtp-result-card">
            <div class="smtp-raw-header">
                <span>Raw SMTP Conversation</span>
                <button class="smtp-copy-btn" id="rawCopyBtn">Copy</button>
            </div>
            <pre class="smtp-raw-box" id="rawBox">${escHtml(rawLines.join("\n"))}</pre>
        </div>`;
    }

    document.getElementById("resultSection").innerHTML = `
        <div class="smtp-result-card">
            <div class="smtp-result-header">
                <span class="smtp-status-badge ${badgeCls}">${badgeTxt}</span>
                <span style="font-size:0.85rem;font-weight:400">${escHtml(host)}:${port}</span>
            </div>
            <table class="smtp-info-table">
                ${infoRows.map(r => `<tr>
                    <td class="smtp-info-key">${escHtml(r.k)}</td>
                    <td class="smtp-info-val">${escHtml(r.v)}</td>
                </tr>`).join("")}
            </table>
        </div>
        ${capHtml}
        ${rawHtml}`;

    // Wire copy button
    const rawCopyBtn = document.getElementById("rawCopyBtn");
    if (rawCopyBtn) {
        rawCopyBtn.addEventListener("click", () => {
            const box = document.getElementById("rawBox");
            if (!box) return;
            navigator.clipboard.writeText(box.textContent).then(() => {
                rawCopyBtn.textContent = "Copied!";
                rawCopyBtn.classList.add("copied");
                setTimeout(() => { rawCopyBtn.textContent = "Copy"; rawCopyBtn.classList.remove("copied"); }, 1800);
            });
        });
    }
}

function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Guide toggle ──────────────────────────────────────────────────────────────
document.getElementById("smtpGuideToggle").addEventListener("click", () => {
    document.getElementById("smtpGuideBody").classList.toggle("open");
    document.querySelector(".smtp-guide-arrow").classList.toggle("open");
});

// ── Wiring ────────────────────────────────────────────────────────────────────
document.getElementById("testBtn").addEventListener("click", runTest);
document.getElementById("smtpHost").addEventListener("keydown", e => {
    if (e.key === "Enter") runTest();
});
