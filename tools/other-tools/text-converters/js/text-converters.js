/* text-converters.js — Binary/Hex/RGB-Hex — pure JS, no dependencies */
"use strict";

// ── Binary ↔ Text ─────────────────────────────────────────────────────────────
function textToBinary(text) {
    return [...text].map(ch =>
        ch.charCodeAt(0).toString(2).padStart(8, "0")
    ).join(" ");
}

function binaryToText(bin) {
    return bin.trim().split(/\s+/).map(b => {
        const code = parseInt(b, 2);
        if (isNaN(code)) return "?";
        return String.fromCodePoint(code);
    }).join("");
}

const binText   = document.getElementById("binText");
const binOutput = document.getElementById("binOutput");

document.getElementById("textToBinBtn").addEventListener("click", () => {
    binOutput.value = textToBinary(binText.value);
});
document.getElementById("binToTextBtn").addEventListener("click", () => {
    binText.value = binaryToText(binOutput.value);
});

// ── Hex ↔ Text ────────────────────────────────────────────────────────────────
function textToHex(text) {
    return [...text].map(ch =>
        ch.charCodeAt(0).toString(16).padStart(2, "0")
    ).join(" ");
}

function hexToText(hex) {
    return hex.trim().split(/\s+/).map(h => {
        const code = parseInt(h, 16);
        if (isNaN(code)) return "?";
        return String.fromCodePoint(code);
    }).join("");
}

const hexText   = document.getElementById("hexText");
const hexOutput = document.getElementById("hexOutput");

document.getElementById("textToHexBtn").addEventListener("click", () => {
    hexOutput.value = textToHex(hexText.value);
});
document.getElementById("hexToTextBtn").addEventListener("click", () => {
    hexText.value = hexToText(hexOutput.value);
});

// ── Copy buttons ──────────────────────────────────────────────────────────────
document.querySelectorAll(".copy-btn[data-target]").forEach(btn => {
    btn.addEventListener("click", () => {
        const el = document.getElementById(btn.dataset.target);
        if (!el || !el.value) return;
        navigator.clipboard.writeText(el.value).then(() => {
            btn.textContent = "Copied!";
            btn.classList.add("copied");
            setTimeout(() => { btn.textContent = btn.dataset.label || "Copy"; btn.classList.remove("copied"); }, 1500);
        });
    });
    // Store original label
    btn.dataset.label = btn.textContent;
});

// ── RGB ↔ Hex ─────────────────────────────────────────────────────────────────
const rEl      = document.getElementById("rgbR");
const gEl      = document.getElementById("rgbG");
const bEl      = document.getElementById("rgbB");
const pickerEl = document.getElementById("colorPicker");
const hexEl    = document.getElementById("hexColor");
const preview  = document.getElementById("colorPreview");
const infoEl   = document.getElementById("colorInfoText");
const colorCopyBtn = document.getElementById("colorCopyBtn");

function clamp(v) { return Math.max(0, Math.min(255, parseInt(v) || 0)); }

function updatePreview(r, g, b, hex) {
    const hx = "#" + hex;
    preview.style.background = hx;
    infoEl.textContent = `#${hex} — rgb(${r}, ${g}, ${b})`;
}

function rgbToHex(r, g, b) {
    return [r, g, b].map(v => clamp(v).toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex) {
    const h = hex.replace(/^#/, "");
    if (h.length === 3) {
        return [
            parseInt(h[0] + h[0], 16),
            parseInt(h[1] + h[1], 16),
            parseInt(h[2] + h[2], 16),
        ];
    }
    if (h.length !== 6) return null;
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

document.getElementById("rgbToHexBtn").addEventListener("click", () => {
    const r = clamp(rEl.value), g = clamp(gEl.value), b = clamp(bEl.value);
    const hex = rgbToHex(r, g, b);
    hexEl.value = hex;
    pickerEl.value = "#" + hex;
    updatePreview(r, g, b, hex);
});

document.getElementById("hexToRgbBtn").addEventListener("click", () => {
    const rgb = hexToRgb(hexEl.value);
    if (!rgb) return;
    rEl.value = rgb[0]; gEl.value = rgb[1]; bEl.value = rgb[2];
    pickerEl.value = "#" + hexEl.value.replace(/^#/, "").slice(0, 6);
    updatePreview(rgb[0], rgb[1], rgb[2], hexEl.value.replace(/^#/, "").padEnd(6, "0"));
});

// Live update from color picker
pickerEl.addEventListener("input", () => {
    const hex = pickerEl.value.replace("#", "");
    hexEl.value = hex;
    const rgb = hexToRgb(hex);
    if (rgb) {
        rEl.value = rgb[0]; gEl.value = rgb[1]; bEl.value = rgb[2];
        updatePreview(rgb[0], rgb[1], rgb[2], hex);
    }
});

// Live update from RGB inputs
[rEl, gEl, bEl].forEach(el => {
    el.addEventListener("input", () => {
        const r = clamp(rEl.value), g = clamp(gEl.value), b = clamp(bEl.value);
        const hex = rgbToHex(r, g, b);
        hexEl.value = hex;
        pickerEl.value = "#" + hex;
        updatePreview(r, g, b, hex);
    });
});

// Live update from hex input
hexEl.addEventListener("input", () => {
    const raw = hexEl.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    hexEl.value = raw;
    if (raw.length === 6) {
        const rgb = hexToRgb(raw);
        if (rgb) {
            rEl.value = rgb[0]; gEl.value = rgb[1]; bEl.value = rgb[2];
            pickerEl.value = "#" + raw;
            updatePreview(rgb[0], rgb[1], rgb[2], raw);
        }
    }
});

colorCopyBtn.addEventListener("click", () => {
    const hex = "#" + hexEl.value;
    navigator.clipboard.writeText(hex).then(() => {
        colorCopyBtn.textContent = "Copied!";
        colorCopyBtn.classList.add("copied");
        setTimeout(() => { colorCopyBtn.textContent = "Copy hex"; colorCopyBtn.classList.remove("copied"); }, 1500);
    });
});

// Init preview
updatePreview(74, 144, 226, "4a90e2");
