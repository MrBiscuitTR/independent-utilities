/* email-header.js
   Pure browser JS — no external requests, no API keys.
   Parses raw email headers and presents structured analysis.
*/
"use strict";

// ── Sample headers ────────────────────────────────────────────────────────────
const SAMPLE_HEADERS = `Delivered-To: user@example.com
Received: by 2002:a17:906:f14a:b0:9e2:3b0d:b6c3 with SMTP id gn10csp2345678oab;
        Mon, 20 Jan 2025 09:12:34 -0800 (PST)
Received: from mail-ot1-f52.google.com (mail-ot1-f52.google.com [209.85.210.52])
        by mx.example.com with ESMTPS id y23-20020a170906451700b00a2c3b0d9f5si123456otr.5.2025.01.20.09.12.33
        for <user@example.com>
        (version=TLS1_3 cipher=TLS_AES_128_GCM_SHA256 bits=128/128);
        Mon, 20 Jan 2025 09:12:33 -0800 (PST)
Received: from sender-pc.corp.example.org (unknown [10.20.30.40])
        by mail.sender.example.org (Postfix) with ESMTPA id 4B3D21C008A
        for <user@example.com>; Mon, 20 Jan 2025 17:12:25 +0000 (UTC)
Authentication-Results: mx.example.com;
       dkim=pass header.i=@sender.example.org header.s=mail2024 header.b="Zm9v";
       spf=pass (google.com: domain of sender@sender.example.org designates 10.20.30.40 as permitted sender) smtp.mailfrom=sender@sender.example.org;
       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=sender.example.org
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
        d=sender.example.org; s=mail2024;
        h=from:to:subject:date:message-id;
        bh=abc123==; b=Zm9v...signature...
X-Google-DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
        d=1e100.net; s=20230601; h=x-gm-message-state:from:to:subject;
From: Alice Sender <sender@sender.example.org>
To: user@example.com
Subject: Hello from example sender
Date: Mon, 20 Jan 2025 17:12:20 +0000
Message-ID: <abc123def456@sender.example.org>
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
X-Mailer: Thunderbird 115.0
X-Spam-Status: No, score=-2.4`;

// ── Parse headers into key-value pairs ────────────────────────────────────────
function parseHeaders(raw) {
    // Unfold multi-line headers (continuation lines start with whitespace)
    const unfolded = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
                        .replace(/\n([ \t]+)/g, " $1");
    const headers = [];
    const lines = unfolded.split("\n");
    for (const line of lines) {
        if (!line.trim()) continue;
        const colonIdx = line.indexOf(":");
        if (colonIdx < 1) continue;
        const key = line.substring(0, colonIdx).trim();
        const val = line.substring(colonIdx + 1).trim();
        if (key && !/\s/.test(key)) {
            headers.push({ key, val });
        }
    }
    return headers;
}

function getHeader(headers, name) {
    const n = name.toLowerCase();
    const found = headers.find(h => h.key.toLowerCase() === n);
    return found ? found.val : null;
}

function getAllHeaders(headers, name) {
    const n = name.toLowerCase();
    return headers.filter(h => h.key.toLowerCase() === n).map(h => h.val);
}

// ── Parse Received headers (delivery hops) ────────────────────────────────────
function parseReceived(val) {
    const hop = { from: "", by: "", with: "", date: null, raw: val };

    const fromMatch = val.match(/from\s+(\S+)\s*\(([^)]*)\)/i);
    if (fromMatch) {
        hop.from = fromMatch[1];
        // Extract IP from parentheses if present
        const ipMatch = fromMatch[2].match(/\[?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]?/);
        if (ipMatch) hop.fromIP = ipMatch[1];
        else hop.from = fromMatch[2] || fromMatch[1];
    } else {
        const simpleFrom = val.match(/from\s+(\S+)/i);
        if (simpleFrom) hop.from = simpleFrom[1];
    }

    const byMatch = val.match(/by\s+(\S+)/i);
    if (byMatch) hop.by = byMatch[1];

    const withMatch = val.match(/with\s+(\S+)/i);
    if (withMatch) hop.with = withMatch[1];

    // Extract date from the semicolon-separated part
    const semiIdx = val.lastIndexOf(";");
    if (semiIdx !== -1) {
        const dateStr = val.substring(semiIdx + 1).trim();
        const parsed = new Date(dateStr);
        if (!isNaN(parsed)) hop.date = parsed;
    }

    return hop;
}

// ── Parse Authentication-Results ─────────────────────────────────────────────
function parseAuthResults(val) {
    const result = { spf: null, dkim: null, dmarc: null, raw: val };
    const spfMatch  = val.match(/spf=(\S+)/i);
    const dkimMatch = val.match(/dkim=(\S+)/i);
    const dmarcMatch= val.match(/dmarc=(\S+)/i);
    if (spfMatch)   result.spf   = spfMatch[1].replace(/;$/, "");
    if (dkimMatch)  result.dkim  = dkimMatch[1].replace(/;$/, "");
    if (dmarcMatch) result.dmarc = dmarcMatch[1].replace(/;$/, "");
    return result;
}

// ── Main analyze function ─────────────────────────────────────────────────────
function analyze() {
    const raw = document.getElementById("headerInput").value.trim();
    if (!raw) {
        showResult('<div class="eh-error">Please paste some email headers first.</div>');
        return;
    }

    let headers;
    try {
        headers = parseHeaders(raw);
    } catch (e) {
        showResult(`<div class="eh-error">Failed to parse headers: ${escHtml(e.message)}</div>`);
        return;
    }

    if (headers.length === 0) {
        showResult('<div class="eh-error">No valid headers found. Make sure you pasted the raw headers (not the email body).</div>');
        return;
    }

    // Extract key fields
    const from        = getHeader(headers, "From");
    const to          = getHeader(headers, "To");
    const subject     = getHeader(headers, "Subject");
    const date        = getHeader(headers, "Date");
    const messageId   = getHeader(headers, "Message-ID");
    const replyTo     = getHeader(headers, "Reply-To");
    const returnPath  = getHeader(headers, "Return-Path");
    const xMailer     = getHeader(headers, "X-Mailer") || getHeader(headers, "User-Agent");
    const xSpam       = getHeader(headers, "X-Spam-Status") || getHeader(headers, "X-Spam-Flag");
    const contentType = getHeader(headers, "Content-Type");

    // Received headers (hops)
    const receivedVals = getAllHeaders(headers, "Received");
    const hops = receivedVals.map(parseReceived).reverse(); // oldest first

    // Auth results
    const authVal = getHeader(headers, "Authentication-Results");
    const auth = authVal ? parseAuthResults(authVal) : { spf: null, dkim: null, dmarc: null };

    // Anomaly detection
    const anomalies = detectAnomalies(headers, from, replyTo, returnPath, auth, hops, messageId);

    // Build HTML
    const html = [
        buildSummaryCard(from, to, subject, date, messageId, replyTo, returnPath, xMailer, xSpam, contentType),
        buildAuthCard(auth),
        buildHopsCard(hops),
        anomalies.length > 0 ? buildAnomalyCard(anomalies) : buildCleanCard(),
        buildAllHeadersCard(headers),
    ].join("");

    showResult(html);
}

// ── Summary card ──────────────────────────────────────────────────────────────
function buildSummaryCard(from, to, subject, date, messageId, replyTo, returnPath, xMailer, xSpam, contentType) {
    const rows = [
        { k: "From",         v: from },
        { k: "To",           v: to },
        { k: "Subject",      v: subject },
        { k: "Date",         v: date },
        { k: "Message-ID",   v: messageId },
        { k: "Reply-To",     v: replyTo },
        { k: "Return-Path",  v: returnPath },
        { k: "X-Mailer",     v: xMailer },
        { k: "Spam Status",  v: xSpam },
        { k: "Content-Type", v: contentType },
    ].filter(r => r.v !== null);

    return `<div class="eh-card">
        <div class="eh-card-title">📋 Summary</div>
        <div class="eh-summary-grid">
            ${rows.map(r => `
                <div class="eh-summary-row">
                    <span class="eh-summary-key">${escHtml(r.k)}</span>
                    <span class="eh-summary-val">${escHtml(r.v)}</span>
                </div>`).join("")}
        </div>
    </div>`;
}

// ── Auth card ─────────────────────────────────────────────────────────────────
function buildAuthCard(auth) {
    function badge(label, result) {
        if (!result) return `<div class="eh-auth-badge eh-badge-unknown"><span class="eh-auth-label">${label}</span> not found</div>`;
        const r = result.toLowerCase();
        const cls = r === "pass" ? "eh-badge-pass" :
                    r === "fail" ? "eh-badge-fail" :
                    r === "softfail" ? "eh-badge-softfail" :
                    r === "neutral" ? "eh-badge-neutral" :
                    r === "none" ? "eh-badge-none" : "eh-badge-unknown";
        const icon = r === "pass" ? "✓" : r === "fail" ? "✗" : "~";
        return `<div class="eh-auth-badge ${cls}"><span class="eh-auth-label">${label}</span> ${icon} ${escHtml(result)}</div>`;
    }

    return `<div class="eh-card">
        <div class="eh-card-title">🔐 Authentication Results</div>
        <div class="eh-auth-row">
            ${badge("SPF", auth.spf)}
            ${badge("DKIM", auth.dkim)}
            ${badge("DMARC", auth.dmarc)}
        </div>
        ${auth.raw ? `<div style="padding:0.4rem 1rem 0.8rem; font-size:0.78rem; color:var(--color-text-muted); font-family:var(--font-mono); word-break:break-all;">${escHtml(auth.raw)}</div>` : ""}
    </div>`;
}

// ── Hops card ─────────────────────────────────────────────────────────────────
function buildHopsCard(hops) {
    if (hops.length === 0) {
        return `<div class="eh-card">
            <div class="eh-card-title">📬 Delivery Path</div>
            <div style="padding:0.8rem 1rem; font-size:0.88rem; color:var(--color-text-muted); font-style:italic;">No Received headers found.</div>
        </div>`;
    }

    const rows = hops.map((hop, i) => {
        let delayCls = "", delayStr = "";
        if (i > 0 && hops[i-1].date && hop.date) {
            const diffSec = Math.round((hop.date - hops[i-1].date) / 1000);
            if (diffSec >= 0) {
                delayCls = diffSec < 5 ? "eh-delay-fast" : diffSec < 60 ? "eh-delay-ok" : "eh-delay-slow";
                delayStr = diffSec < 60 ? `+${diffSec}s` : `+${Math.round(diffSec/60)}m`;
            }
        }

        const isFirst = i === 0;
        const server = hop.from || hop.by || "unknown";
        const dateStr = hop.date ? hop.date.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") : "";

        return `<tr>
            <td class="eh-hop-num">${i + 1}</td>
            <td class="eh-hop-server">${escHtml(server)}${isFirst ? ' <span class="eh-hop-origin">origin</span>' : ""}
                ${hop.fromIP ? `<br><span style="color:var(--color-text-muted);font-size:0.75rem">${escHtml(hop.fromIP)}</span>` : ""}
            </td>
            <td class="eh-hop-server">${escHtml(hop.by || "")}</td>
            <td class="eh-hop-server" style="font-size:0.75rem">${escHtml(hop.with || "")}</td>
            <td class="eh-hop-delay ${delayCls}">${delayStr || (i === 0 ? "—" : "")}</td>
            <td class="eh-hop-date">${escHtml(dateStr)}</td>
        </tr>`;
    });

    return `<div class="eh-card">
        <div class="eh-card-title">📬 Delivery Path (${hops.length} hop${hops.length !== 1 ? "s" : ""})</div>
        <div style="overflow-x:auto">
        <table class="eh-hop-table">
            <thead><tr>
                <th>#</th><th>From (sender)</th><th>By (receiver)</th><th>Protocol</th><th>Delay</th><th>Timestamp</th>
            </tr></thead>
            <tbody>${rows.join("")}</tbody>
        </table>
        </div>
    </div>`;
}

// ── Anomaly detection ─────────────────────────────────────────────────────────
function detectAnomalies(headers, from, replyTo, returnPath, auth, hops, messageId) {
    const issues = [];

    // SPF/DKIM/DMARC failures
    if (auth.spf && auth.spf.toLowerCase() === "fail") {
        issues.push({ icon: "⚠️", label: "SPF Fail", detail: "The sending server is not authorized by the domain's SPF record. Possible spoofing.", severity: "warn" });
    }
    if (auth.spf && auth.spf.toLowerCase() === "softfail") {
        issues.push({ icon: "⚠️", label: "SPF Softfail", detail: "SPF returned softfail (~all). The domain policy suggests rejecting but doesn't require it.", severity: "info" });
    }
    if (auth.dkim && auth.dkim.toLowerCase() === "fail") {
        issues.push({ icon: "⚠️", label: "DKIM Fail", detail: "DKIM signature verification failed. The message may have been tampered with in transit.", severity: "warn" });
    }
    if (auth.dmarc && auth.dmarc.toLowerCase() === "fail") {
        issues.push({ icon: "🚨", label: "DMARC Fail", detail: "DMARC alignment check failed. Both SPF and DKIM failed to align with the From domain.", severity: "error" });
    }

    // Reply-To mismatch
    if (from && replyTo) {
        const fromDomain   = extractDomain(from);
        const replyDomain  = extractDomain(replyTo);
        if (fromDomain && replyDomain && fromDomain.toLowerCase() !== replyDomain.toLowerCase()) {
            issues.push({ icon: "⚠️", label: "Reply-To Domain Mismatch", detail: `From domain: ${fromDomain} — Reply-To domain: ${replyDomain}. Replies will go to a different domain.`, severity: "warn" });
        }
    }

    // Return-Path mismatch with From
    if (from && returnPath) {
        const fromDomain   = extractDomain(from);
        const rpDomain     = extractDomain(returnPath);
        if (fromDomain && rpDomain && fromDomain.toLowerCase() !== rpDomain.toLowerCase()) {
            issues.push({ icon: "ℹ️", label: "Return-Path Domain Differs from From", detail: `From: ${fromDomain}, Return-Path: ${rpDomain}. Bounce messages go to a different domain.`, severity: "info" });
        }
    }

    // Missing Message-ID
    if (!messageId) {
        issues.push({ icon: "⚠️", label: "Missing Message-ID", detail: "No Message-ID header found. Legitimate mailers always add one. This could indicate spam or a misconfigured server.", severity: "warn" });
    }

    // X-Spam flag
    const xSpamFlag = getHeader(headers, "X-Spam-Flag");
    if (xSpamFlag && xSpamFlag.toUpperCase().includes("YES")) {
        issues.push({ icon: "🚨", label: "Spam Flag Set", detail: `X-Spam-Flag: ${xSpamFlag} — this message was flagged as spam by the receiving server.`, severity: "error" });
    }

    const xSpamStatus = getHeader(headers, "X-Spam-Status");
    if (xSpamStatus && xSpamStatus.toLowerCase().startsWith("yes")) {
        issues.push({ icon: "🚨", label: "Spam Score Positive", detail: `X-Spam-Status: ${xSpamStatus}`, severity: "error" });
    }

    // Large time gap between hops
    for (let i = 1; i < hops.length; i++) {
        if (hops[i-1].date && hops[i].date) {
            const diffMin = (hops[i].date - hops[i-1].date) / 60000;
            if (diffMin > 60) {
                issues.push({ icon: "ℹ️", label: `Slow Hop #${i+1}`, detail: `Hop ${i} to ${i+1} took ${Math.round(diffMin)} minutes. Could indicate a queue delay or misconfigured server.`, severity: "info" });
            }
        }
    }

    return issues;
}

function buildAnomalyCard(anomalies) {
    return `<div class="eh-card">
        <div class="eh-card-title">🔍 Anomaly Detection (${anomalies.length} found)</div>
        <div class="eh-anomaly-list">
            ${anomalies.map(a => `
                <div class="eh-anomaly-item">
                    <span class="eh-anomaly-icon">${a.icon}</span>
                    <div class="eh-anomaly-info">
                        <span class="eh-anomaly-label">${escHtml(a.label)}</span>
                        <span class="eh-anomaly-detail">${escHtml(a.detail)}</span>
                    </div>
                </div>`).join("")}
        </div>
    </div>`;
}

function buildCleanCard() {
    return `<div class="eh-card">
        <div class="eh-card-title">🔍 Anomaly Detection</div>
        <div class="eh-no-anomalies">✓ No anomalies detected. SPF, DKIM, DMARC pass and headers look normal.</div>
    </div>`;
}

// ── All headers card ──────────────────────────────────────────────────────────
function buildAllHeadersCard(headers) {
    const rows = headers.map(h => `
        <tr>
            <td class="eh-all-key">${escHtml(h.key)}</td>
            <td class="eh-all-val">${escHtml(h.val)}</td>
        </tr>`).join("");

    return `<div class="eh-card">
        <div class="eh-card-title">📄 All Headers (${headers.length})</div>
        <div style="overflow-x:auto">
        <table class="eh-all-table">
            <tbody>${rows}</tbody>
        </table>
        </div>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractDomain(str) {
    const emailMatch = str.match(/<([^>]+)>/) || str.match(/\S+@(\S+)/);
    if (emailMatch) {
        const addr = emailMatch[1] || emailMatch[0];
        const atIdx = addr.lastIndexOf("@");
        if (atIdx !== -1) return addr.substring(atIdx + 1).replace(/[>]$/, "");
    }
    return null;
}

function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function showResult(html) {
    const section = document.getElementById("resultSection");
    section.innerHTML = html;
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── Wiring ────────────────────────────────────────────────────────────────────
document.getElementById("analyzeBtn").addEventListener("click", analyze);

document.getElementById("loadSample").addEventListener("click", () => {
    document.getElementById("headerInput").value = SAMPLE_HEADERS;
});

document.getElementById("headerInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze();
});
