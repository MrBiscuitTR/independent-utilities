/* morse-code.js — pure JS, no dependencies */
"use strict";

// ── Morse code table ────────────────────────────────────────────────────────
const MORSE = {
    "A":".-",    "B":"-...",  "C":"-.-.",  "D":"-..",   "E":".",
    "F":"..-.",  "G":"--.",   "H":"....",  "I":"..",    "J":".---",
    "K":"-.-",   "L":".-..",  "M":"--",    "N":"-.",    "O":"---",
    "P":".--.",  "Q":"--.-",  "R":".-.",   "S":"...",   "T":"-",
    "U":"..-",   "V":"...-",  "W":".--",   "X":"-..-",  "Y":"-.--",
    "Z":"--..",
    "0":"-----", "1":".----", "2":"..---", "3":"...--", "4":"....-",
    "5":".....", "6":"-...." ,"7":"--...", "8":"---..", "9":"----.",
    ".":".-.-.-", ",":"--..--", "?":"..--..", "'":".----.",
    "!":"-.-.--", "/":"-..-.", "(":"-.--.", ")":"-.--.-",
    "&":".-...", ":":"---...", ";":"-.-.-.", "=":"-...-",
    "+":".-.-.",  "-":"-....-", "_":"..-.-.", "\"":".-..-.",
    "$":"...-..-","@":".--.-.","¿":"..-.--","¡":"--...-",
};

// Build reverse table
const REVERSE = {};
for (const [ch, code] of Object.entries(MORSE)) REVERSE[code] = ch;

// ── DOM ─────────────────────────────────────────────────────────────────────
const inputEl      = document.getElementById("morseInput");
const outputEl     = document.getElementById("morseOutput");
const translateBtn = document.getElementById("translateBtn");
const swapBtn      = document.getElementById("swapBtn");
const copyBtn      = document.getElementById("morseCopyBtn");
const inputLabel   = document.getElementById("inputLabel");
const outputLabel  = document.getElementById("outputLabel");
const modeTabs     = document.querySelectorAll(".mode-tab");
const refGrid      = document.getElementById("morseRefGrid");

let currentMode = "text-to-morse";

// ── Reference chart ──────────────────────────────────────────────────────────
function buildRefChart() {
    const entries = [...Object.entries(MORSE)].filter(([ch]) => /[A-Z0-9]/.test(ch));
    refGrid.innerHTML = entries.map(([ch, code]) => `
        <div class="morse-ref-item">
            <span class="ref-char">${ch}</span>
            <span class="ref-morse">${code}</span>
        </div>`).join("");
}
buildRefChart();

// ── Mode switching ───────────────────────────────────────────────────────────
modeTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        modeTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentMode = tab.dataset.mode;
        if (currentMode === "text-to-morse") {
            inputLabel.textContent  = "Text";
            outputLabel.textContent = "Morse Code";
            inputEl.placeholder  = "Type text here…";
            outputEl.placeholder = "Morse code appears here…";
        } else {
            inputLabel.textContent  = "Morse Code";
            outputLabel.textContent = "Text";
            inputEl.placeholder  = "Enter morse code (dots, dashes, spaces, / for word break)…";
            outputEl.placeholder = "Decoded text appears here…";
        }
        translate();
    });
});

// ── Translation ──────────────────────────────────────────────────────────────
function textToMorse(text) {
    return text.toUpperCase().split("").map(ch => {
        if (ch === " ") return "/";
        return MORSE[ch] || "?";
    }).join(" ");
}

function morseToText(morse) {
    return morse.trim().split(/\s*\/\s*/).map(word => {
        return word.trim().split(/\s+/).map(code => {
            return REVERSE[code] || "?";
        }).join("");
    }).join(" ");
}

function translate() {
    const input = inputEl.value;
    if (!input.trim()) { outputEl.value = ""; return; }
    outputEl.value = currentMode === "text-to-morse"
        ? textToMorse(input)
        : morseToText(input);
}

inputEl.addEventListener("input", translate);
translateBtn.addEventListener("click", translate);

swapBtn.addEventListener("click", () => {
    const tmp     = inputEl.value;
    inputEl.value  = outputEl.value;
    outputEl.value = tmp;
    // Flip mode
    const other = currentMode === "text-to-morse" ? "morse-to-text" : "text-to-morse";
    modeTabs.forEach(t => {
        const isOther = t.dataset.mode === other;
        t.classList.toggle("active", isOther);
        if (isOther) t.click(); // triggers mode change
    });
});

copyBtn.addEventListener("click", () => {
    if (!outputEl.value) return;
    navigator.clipboard.writeText(outputEl.value).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => { copyBtn.textContent = "Copy output"; copyBtn.classList.remove("copied"); }, 1500);
    });
});
