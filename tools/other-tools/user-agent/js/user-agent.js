/* user-agent.js — pure JS, no dependencies */
"use strict";

// ── Parser ────────────────────────────────────────────────────────────────────
function parseUA(ua) {
    const result = {
        raw:        ua,
        browser:    "Unknown",
        browserVer: "",
        engine:     "Unknown",
        engineVer:  "",
        os:         "Unknown",
        osVer:      "",
        device:     "Desktop",
        mobile:     false,
        bot:        false,
    };

    if (!ua) return result;

    // ── Bot detection ──
    if (/bot|crawl|spider|slurp|search|headless|prerender/i.test(ua)) {
        result.bot    = true;
        result.device = "Bot/Crawler";
    }

    // ── Mobile / Tablet ──
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
        result.mobile = false;
        result.device = "Tablet";
    } else if (/mobile|iphone|ipod|android.*mobile|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
        result.mobile = true;
        result.device = "Mobile";
    }

    // ── OS ──
    const osPatterns = [
        [/Windows NT 10\.0/,         "Windows 10/11"],
        [/Windows NT 6\.3/,          "Windows 8.1"],
        [/Windows NT 6\.2/,          "Windows 8"],
        [/Windows NT 6\.1/,          "Windows 7"],
        [/Windows NT 6\.0/,          "Windows Vista"],
        [/Windows NT 5\.1/,          "Windows XP"],
        [/Windows/,                  "Windows"],
        [/iPhone OS ([\d_]+)/,       "iOS"],
        [/iPad.*OS ([\d_]+)/,        "iPadOS"],
        [/Mac OS X ([\d_]+)/,        "macOS"],
        [/Android ([\d.]+)/,         "Android"],
        [/Linux/,                    "Linux"],
        [/CrOS/,                     "ChromeOS"],
        [/FreeBSD/,                  "FreeBSD"],
    ];
    for (const [rx, name] of osPatterns) {
        const m = ua.match(rx);
        if (m) {
            result.os    = name;
            result.osVer = (m[1] || "").replace(/_/g, ".");
            break;
        }
    }

    // ── Engine ──
    let em;
    if ((em = ua.match(/Gecko\/(\S+).*rv:([\d.]+)/))) {
        result.engine    = "Gecko";
        result.engineVer = em[2];
    } else if ((em = ua.match(/AppleWebKit\/([\d.]+)/))) {
        result.engine    = "WebKit/Blink";
        result.engineVer = em[1];
    } else if ((em = ua.match(/Trident\/([\d.]+)/))) {
        result.engine    = "Trident";
        result.engineVer = em[1];
    } else if ((em = ua.match(/Presto\/([\d.]+)/))) {
        result.engine    = "Presto";
        result.engineVer = em[1];
    }

    // ── Browser ──
    const browserPatterns = [
        [/Edg\/([\d.]+)/,               "Edge (Chromium)"],
        [/EdgA\/([\d.]+)/,              "Edge Android"],
        [/Edge\/([\d.]+)/,              "Edge (Legacy)"],
        [/OPR\/([\d.]+)/,               "Opera"],
        [/Opera.*Version\/([\d.]+)/,    "Opera"],
        [/Opera\/([\d.]+)/,             "Opera"],
        [/Vivaldi\/([\d.]+)/,           "Vivaldi"],
        [/Brave\/([\d.]+)/,             "Brave"],
        [/YaBrowser\/([\d.]+)/,         "Yandex Browser"],
        [/SamsungBrowser\/([\d.]+)/,    "Samsung Browser"],
        [/UCBrowser\/([\d.]+)/,         "UC Browser"],
        [/DuckDuckGo\/([\d.]+)/,        "DuckDuckGo"],
        [/Firefox\/([\d.]+)/,           "Firefox"],
        [/FxiOS\/([\d.]+)/,             "Firefox iOS"],
        [/CriOS\/([\d.]+)/,             "Chrome iOS"],
        [/Chrome\/([\d.]+)/,            "Chrome"],
        [/Safari\/([\d.]+)/,            "Safari"],
        [/MSIE ([\d.]+)/,               "Internet Explorer"],
        [/Trident.*rv:([\d.]+)/,        "Internet Explorer"],
    ];
    for (const [rx, name] of browserPatterns) {
        const m = ua.match(rx);
        if (m) {
            result.browser    = name;
            result.browserVer = m[1];
            break;
        }
    }

    return result;
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderDetails(parsed, container) {
    const fields = [
        ["Browser",        parsed.browser + (parsed.browserVer ? " " + parsed.browserVer : "")],
        ["Engine",         parsed.engine  + (parsed.engineVer  ? " " + parsed.engineVer  : "")],
        ["OS",             parsed.os      + (parsed.osVer      ? " " + parsed.osVer      : "")],
        ["Device Type",    parsed.bot ? "Bot/Crawler" : parsed.device],
        ["Mobile",         parsed.mobile ? "Yes" : "No"],
        ["Bot / Crawler",  parsed.bot    ? "Yes" : "No"],
    ];
    container.innerHTML = fields.map(([label, val]) => `
        <div class="ua-item">
            <div class="ua-item-label">${label}</div>
            <div class="ua-item-value${val === "Unknown" ? " unknown" : ""}">${val || "Unknown"}</div>
        </div>`).join("");
}

// ── Init ──────────────────────────────────────────────────────────────────────
const ua      = navigator.userAgent;
const parsed  = parseUA(ua);

document.getElementById("uaRaw").textContent = ua;
renderDetails(parsed, document.getElementById("uaDetails"));

document.getElementById("uaCopyBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(ua).then(() => {
        const btn = document.getElementById("uaCopyBtn");
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1500);
    });
});

document.getElementById("parseBtn").addEventListener("click", () => {
    const custom = document.getElementById("uaCustomInput").value.trim();
    const result = document.getElementById("customResult");
    if (!custom) { result.classList.add("hidden"); return; }
    result.classList.remove("hidden");
    renderDetails(parseUA(custom), result);
});
