/* punycode.js
   Uses the browser's built-in URL API for Punycode conversion.
   No external library needed — modern browsers handle IDN natively.
*/
"use strict";

const unicodeEl = document.getElementById("unicodeDomain");
const punyEl    = document.getElementById("punyDomain");
const resultEl  = document.getElementById("pnyResult");

function showResult(msg, type) {
    resultEl.textContent = msg;
    resultEl.className   = "pny-result " + type;
}

function toPunycode(domain) {
    // Use URL to convert IDN → ACE
    try {
        const url  = new URL("https://" + domain);
        return url.hostname;
    } catch (e) {
        throw new Error("Invalid domain: " + e.message);
    }
}

function toUnicode(puny) {
    // Use URL to convert ACE → IDN (some browsers decode xn--)
    try {
        // Some environments expose a native toUnicode via URL, but
        // the safest universal approach is to use URL and read .hostname
        const url = new URL("https://" + puny);
        // Modern browsers return decoded hostname for display
        // but .hostname on URL always returns ASCII for xn--
        // We use the href display trick:
        const anchor = document.createElement("a");
        anchor.href = url.href;
        // The anchor.href will keep puny form, so use URL API
        // Actually, URL API gives ACE. For visual Unicode, use display:
        // There's no universal JS built-in to decode punycode.
        // Fall back to our own decoder:
        return decodePunycodeHostname(puny);
    } catch (e) {
        throw new Error("Invalid Punycode: " + e.message);
    }
}

// ── Punycode decoder (RFC 3492) ───────────────────────────────────────────────
// Minimal pure-JS Punycode decoder for labels (no encoder needed — URL API handles that)
const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;

function adapt(delta, numPoints, firstTime) {
    delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > ((BASE - TMIN) * TMAX) >> 1) { delta = Math.floor(delta / (BASE - TMIN)); k += BASE; }
    return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function decodeLabel(input) {
    if (!input.startsWith("xn--")) return input;
    const s = input.slice(4);

    const basic = [];
    const extStart = s.lastIndexOf("-");
    if (extStart > 0) {
        for (let i = 0; i < extStart; i++) basic.push(s.charCodeAt(i));
    }
    const output = [...basic];

    let i = 0, n = INITIAL_N, bias = INITIAL_BIAS;
    let idx = extStart < 0 ? 0 : extStart + 1;

    while (idx < s.length) {
        const oldi = i;
        let w = 1;
        for (let k = BASE; ; k += BASE) {
            const cp = s.charCodeAt(idx++);
            const digit = cp - 48 < 10 ? cp - 48 : cp - 87 < 26 ? cp - 87 : cp - 65;
            i += digit * w;
            const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
            if (digit < t) break;
            w *= BASE - t;
        }
        bias = adapt(i - oldi, output.length + 1, oldi === 0);
        n += Math.floor(i / (output.length + 1));
        i %= output.length + 1;
        output.splice(i, 0, n);
        i++;
    }
    return String.fromCodePoint(...output);
}

function decodePunycodeHostname(hostname) {
    return hostname.split(".").map(decodeLabel).join(".");
}

// ── Events ────────────────────────────────────────────────────────────────────
document.getElementById("toPunyBtn").addEventListener("click", () => {
    const domain = unicodeEl.value.trim();
    if (!domain) return;
    try {
        const result = toPunycode(domain);
        punyEl.value = result;
        if (result !== domain) {
            showResult(`Converted: ${domain} → ${result}`, "success");
        } else {
            showResult("Domain is already ASCII — no Punycode encoding needed.", "success");
        }
    } catch (e) {
        showResult(e.message, "error");
    }
});

document.getElementById("toUnicodeBtn").addEventListener("click", () => {
    const domain = punyEl.value.trim();
    if (!domain) return;
    try {
        const result = toUnicode(domain);
        unicodeEl.value = result;
        showResult(`Decoded: ${domain} → ${result}`, "success");
    } catch (e) {
        showResult(e.message, "error");
    }
});

// Live encode as user types
unicodeEl.addEventListener("input", () => {
    resultEl.className = "pny-result hidden";
});
punyEl.addEventListener("input", () => {
    resultEl.className = "pny-result hidden";
});

// Example buttons
document.querySelectorAll(".example-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        unicodeEl.value = btn.dataset.unicode;
        punyEl.value    = btn.dataset.puny;
        resultEl.className = "pny-result hidden";
    });
});
