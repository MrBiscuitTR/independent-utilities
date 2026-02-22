/* http-headers.js
   Backend: http://localhost:5501/api/http-headers (Flask, no external API)
   Two tabs:
     1. HTTP Headers — full response header dump with security analysis
     2. Website OS / Server — fingerprint OS + server software from headers
*/

"use strict";

// ── Tab switching ─────────────────────────────────────────────────────────────
document.getElementById("hhTabs").addEventListener("click", e => {
    const btn = e.target.closest(".hhtab");
    if (!btn) return;
    document.querySelectorAll(".hhtab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".hh-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
});

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

function esc(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function renderHeaders(data) {
    const missing = [...SECURITY_HEADERS].filter(h => !Object.keys(data.headers).map(k => k.toLowerCase()).includes(h));

    const rows = Object.entries(data.headers).sort(([a],[b])=>a.localeCompare(b)).map(([k, v]) => {
        const isSec = SECURITY_HEADERS.has(k.toLowerCase());
        return `<tr><td>${esc(k)}</td><td>${esc(v)}${isSec ? ' <span class="security-ok">\u2713</span>' : ""}</td></tr>`;
    }).join("");

    const missingHtml = missing.length
        ? `<p class="security-warn" style="margin-top:0.75rem;font-size:0.85rem">\u26a0\ufe0f Missing security headers: ${missing.join(", ")}</p>`
        : `<p class="security-ok" style="margin-top:0.75rem;font-size:0.85rem">\u2713 All common security headers present</p>`;

    resultArea.innerHTML = `
        <div class="hh-status-bar">
            <span class="status-code ${statusClass(data.status)}">${data.status}</span>
            <span class="hh-url">${esc(data.url)}</span>
        </div>
        <table class="hh-table">
            <thead><tr><th>Header</th><th>Value</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        ${missingHtml}`;
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2 — Website OS / Server Fingerprint
// ════════════════════════════════════════════════════════════════════════════
const osUrlInput = document.getElementById("osUrlInput");
const osCheckBtn = document.getElementById("osCheckBtn");
const osResult   = document.getElementById("osResult");

osCheckBtn.addEventListener("click", doOsCheck);
osUrlInput.addEventListener("keydown", e => { if (e.key === "Enter") doOsCheck(); });

// Known fingerprints — case-insensitive substring matching
const OS_SIGS = [
    { pattern: /ubuntu/i,    label: "Ubuntu Linux" },
    { pattern: /debian/i,    label: "Debian Linux" },
    { pattern: /centos/i,    label: "CentOS Linux" },
    { pattern: /fedora/i,    label: "Fedora Linux" },
    { pattern: /red\s*hat|rhel/i, label: "Red Hat Linux" },
    { pattern: /freebsd/i,   label: "FreeBSD" },
    { pattern: /win32|windows\s*nt|iis/i, label: "Windows Server" },
    { pattern: /darwin|macos|mac\s*os\s*x/i, label: "macOS / Darwin" },
    { pattern: /linux/i,     label: "Linux" },
    { pattern: /unix/i,      label: "Unix" },
];

const SERVER_SIGS = [
    { pattern: /nginx/i,        label: "nginx" },
    { pattern: /apache/i,       label: "Apache" },
    { pattern: /microsoft-iis/i,label: "Microsoft IIS" },
    { pattern: /lighttpd/i,     label: "lighttpd" },
    { pattern: /cloudflare/i,   label: "Cloudflare" },
    { pattern: /openresty/i,    label: "OpenResty (nginx)" },
    { pattern: /gunicorn/i,     label: "Gunicorn (Python)" },
    { pattern: /uwsgi/i,        label: "uWSGI (Python)" },
    { pattern: /werkzeug/i,     label: "Werkzeug / Flask" },
    { pattern: /express/i,      label: "Express.js (Node)" },
    { pattern: /node/i,         label: "Node.js" },
    { pattern: /caddy/i,        label: "Caddy" },
    { pattern: /tomcat/i,       label: "Apache Tomcat (Java)" },
    { pattern: /jetty/i,        label: "Jetty (Java)" },
    { pattern: /jboss|wildfly/i,label: "JBoss / WildFly (Java)" },
    { pattern: /cherokee/i,     label: "Cherokee" },
    { pattern: /envoy/i,        label: "Envoy" },
    { pattern: /traefik/i,      label: "Traefik" },
    { pattern: /python/i,       label: "Python" },
    { pattern: /php/i,          label: "PHP" },
    { pattern: /ruby/i,         label: "Ruby" },
];

const LANG_SIGS = [
    { pattern: /php\/?([\d.]+)?/i, label: "PHP" },
    { pattern: /asp\.net/i,        label: "ASP.NET" },
    { pattern: /java/i,            label: "Java" },
    { pattern: /python/i,          label: "Python" },
    { pattern: /ruby/i,            label: "Ruby" },
    { pattern: /node(?:\.js)?/i,   label: "Node.js" },
    { pattern: /perl/i,            label: "Perl" },
    { pattern: /coldfusion/i,      label: "ColdFusion" },
];

function detectFromHeaders(headers) {
    // Normalise: lowercase keys, preserve values
    const norm = {};
    for (const [k, v] of Object.entries(headers)) norm[k.toLowerCase()] = v;

    const allText = [
        norm["server"] || "",
        norm["x-powered-by"] || "",
        norm["x-generator"] || "",
        norm["via"] || "",
        norm["x-aspnet-version"] || "",
        norm["x-aspnetmvc-version"] || "",
        norm["x-drupal-cache"] || "",
        norm["x-wp-total"] || "",
    ].join(" ");

    const os     = OS_SIGS.find(s => s.pattern.test(allText));
    const server = SERVER_SIGS.find(s => s.pattern.test(allText));
    const lang   = LANG_SIGS.find(s => s.pattern.test(allText));

    // Version extraction from Server header
    let serverVersion = null;
    if (norm["server"]) {
        const m = norm["server"].match(/(nginx|apache|iis|lighttpd|gunicorn|caddy)[\/\s]([\d.]+)/i);
        if (m) serverVersion = m[2];
    }
    let phpVersion = null;
    if (norm["x-powered-by"]) {
        const m = norm["x-powered-by"].match(/php\/([\d.]+)/i);
        if (m) phpVersion = m[1];
    }

    // CMS hints
    const cms = [];
    if (norm["x-wp-total"] || norm["x-pingback"]) cms.push("WordPress");
    if (norm["x-drupal-cache"] || norm["x-generator"]?.toLowerCase().includes("drupal")) cms.push("Drupal");
    if (norm["x-joomla-version"] || allText.toLowerCase().includes("joomla")) cms.push("Joomla");

    // CDN / proxy
    const cdn = [];
    if (norm["cf-ray"]) cdn.push("Cloudflare");
    if (norm["x-cache"]?.toLowerCase().includes("hit") || norm["x-cache"]) cdn.push("Caching proxy");
    if (norm["x-varnish"]) cdn.push("Varnish");
    if (norm["x-amz-cf-id"]) cdn.push("AWS CloudFront");
    if (norm["x-azure-ref"]) cdn.push("Azure CDN");
    if (norm["x-fastly-request-id"]) cdn.push("Fastly");

    // Privacy check — is server/version disclosed?
    const discloses = [];
    if (norm["server"]) discloses.push(`Server: ${norm["server"]}`);
    if (norm["x-powered-by"]) discloses.push(`X-Powered-By: ${norm["x-powered-by"]}`);

    return {
        os: os?.label || null,
        server: server ? (server.label + (serverVersion ? " " + serverVersion : "")) : null,
        lang: lang ? (lang.label + (phpVersion ? " " + phpVersion : "")) : null,
        cms: cms,
        cdn: cdn,
        discloses,
        serverRaw: norm["server"] || null,
        poweredBy: norm["x-powered-by"] || null,
    };
}

async function doOsCheck() {
    const url = osUrlInput.value.trim();
    if (!url) { osUrlInput.focus(); return; }

    osResult.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.9rem">Fetching headers&#x2026;</p>`;
    osCheckBtn.disabled = true;

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

        const info = detectFromHeaders(data.headers);
        renderOsResult(url, data, info);
    } catch(e) {
        osResult.innerHTML = `<div class="hh-error">${esc(e.message)}</div>`;
    } finally {
        osCheckBtn.disabled = false;
    }
}

function renderOsResult(url, data, info) {
    const badges = [];
    if (info.os)     badges.push(info.os);
    if (info.server) badges.push(info.server);
    if (info.lang)   badges.push(info.lang);
    info.cdn.forEach(c => badges.push(c));
    info.cms.forEach(c => badges.push(c));

    const badgesHtml = badges.length
        ? badges.map(b => `<span class="os-badge">${esc(b)}</span>`).join("")
        : `<span class="os-badge" style="background:#f0f0f0;color:#666;border-color:#ddd">No fingerprint detected</span>`;

    const rows = [
        ["URL",          esc(data.url)],
        ["HTTP Status",  String(data.status)],
        ["OS",           info.os ? esc(info.os) : '<em style="color:var(--color-text-muted)">Not detected</em>'],
        ["Server",       info.server ? esc(info.server) : '<em style="color:var(--color-text-muted)">Not detected</em>'],
        ["Language",     info.lang   ? esc(info.lang)   : '<em style="color:var(--color-text-muted)">Not detected</em>'],
        ["CMS",          info.cms.length ? esc(info.cms.join(", ")) : '<em style="color:var(--color-text-muted)">None detected</em>'],
        ["CDN / Proxy",  info.cdn.length ? esc(info.cdn.join(", ")) : '<em style="color:var(--color-text-muted)">None detected</em>'],
        ["Server header",info.serverRaw ? esc(info.serverRaw) : '<em style="color:var(--color-text-muted)">Not present</em>'],
        ["X-Powered-By", info.poweredBy ? esc(info.poweredBy) : '<em style="color:var(--color-text-muted)">Not present</em>'],
    ].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");

    const privacyNote = info.discloses.length
        ? `<p class="security-warn" style="padding:0.6rem 1rem;margin:0;font-size:0.83rem">
               \u26a0\ufe0f Version info disclosed in headers: ${info.discloses.map(esc).join(", ")} &#x2014; consider hiding these in server config.
           </p>`
        : `<p class="security-ok" style="padding:0.6rem 1rem;margin:0;font-size:0.83rem">
               \u2713 Server and X-Powered-By headers not present &#x2014; good privacy practice.
           </p>`;

    osResult.innerHTML = `
        <div class="os-card">
            <div class="os-card-header">\ud83d\udda5\ufe0f Server fingerprint: <strong>${esc(url)}</strong></div>
            <div class="os-summary">${badgesHtml}</div>
            <table class="os-table"><tbody>${rows}</tbody></table>
            ${privacyNote}
        </div>`;
}
