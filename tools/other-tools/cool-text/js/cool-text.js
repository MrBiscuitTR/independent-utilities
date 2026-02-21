/* cool-text.js — Unicode stylized text transforms, pure JS */
"use strict";

// ── Unicode character maps ────────────────────────────────────────────────────
// Each map: [normalChar] → unicodeReplacement (letters A-Z, a-z, 0-9)

function makeMap(lowerStart, upperStart, digitStart) {
    const map = {};
    for (let i = 0; i < 26; i++) {
        map[String.fromCharCode(97 + i)]  = String.fromCodePoint(lowerStart + i);
        map[String.fromCharCode(65 + i)]  = String.fromCodePoint(upperStart + i);
    }
    if (digitStart != null) {
        for (let i = 0; i < 10; i++) {
            map[String.fromCharCode(48 + i)] = String.fromCodePoint(digitStart + i);
        }
    }
    return map;
}

const MAPS = {
    "Bold":                makeMap(0x1D41A, 0x1D400, 0x1D7CE),
    "Italic":              makeMap(0x1D44E, 0x1D434, null),
    "Bold Italic":         makeMap(0x1D482, 0x1D468, null),
    "Script":              makeMap(0x1D4B6, 0x1D49C, null),
    "Bold Script":         makeMap(0x1D4EA, 0x1D4D0, null),
    "Fraktur":             makeMap(0x1D51E, 0x1D504, null),
    "Bold Fraktur":        makeMap(0x1D586, 0x1D56C, null),
    "Double-Struck":       makeMap(0x1D552, 0x1D538, 0x1D7D8),
    "Monospace":           makeMap(0x1D68A, 0x1D670, 0x1D7F6),
    "Sans-Serif":          makeMap(0x1D5BA, 0x1D5A0, 0x1D7E2),
    "Sans Bold":           makeMap(0x1D5EE, 0x1D5D4, 0x1D7EC),
    "Sans Italic":         makeMap(0x1D622, 0x1D608, null),
    "Sans Bold Italic":    makeMap(0x1D656, 0x1D63C, null),
    "Circled":             makeMap(0x24D0,  0x24B6,  0x2460),
    "Squared":             (() => {
        const m = {};
        for (let i = 0; i < 26; i++) {
            m[String.fromCharCode(97 + i)] = String.fromCodePoint(0x1F130 + i);
            m[String.fromCharCode(65 + i)] = String.fromCodePoint(0x1F130 + i);
        }
        return m;
    })(),
};

// Subscript digits/letters
const SUBSCRIPT_MAP = {
    "0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉",
    "a":"ₐ","e":"ₑ","o":"ₒ","x":"ₓ","h":"ₕ","k":"ₖ","l":"ₗ","m":"ₘ","n":"ₙ","p":"ₚ",
    "s":"ₛ","t":"ₜ","i":"ᵢ","r":"ᵣ","u":"ᵤ","v":"ᵥ",
};

const SUPERSCRIPT_MAP = {
    "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹",
    "a":"ᵃ","b":"ᵇ","c":"ᶜ","d":"ᵈ","e":"ᵉ","f":"ᶠ","g":"ᵍ","h":"ʰ","i":"ⁱ","j":"ʲ",
    "k":"ᵏ","l":"ˡ","m":"ᵐ","n":"ⁿ","o":"ᵒ","p":"ᵖ","r":"ʳ","s":"ˢ","t":"ᵗ","u":"ᵘ",
    "v":"ᵛ","w":"ʷ","x":"ˣ","y":"ʸ","z":"ᶻ",
    "A":"ᴬ","B":"ᴮ","D":"ᴰ","E":"ᴱ","G":"ᴳ","H":"ᴴ","I":"ᴵ","J":"ᴶ","K":"ᴷ","L":"ᴸ",
    "M":"ᴹ","N":"ᴺ","O":"ᴼ","P":"ᴾ","R":"ᴿ","T":"ᵀ","U":"ᵁ","V","ᵛ":"ᵛ","W":"ᵂ",
};

// Full-width (vaporwave aesthetic)
function toFullWidth(str) {
    return [...str].map(ch => {
        const code = ch.charCodeAt(0);
        if (code >= 33 && code <= 126) return String.fromCharCode(code + 0xFF01 - 33);
        if (ch === " ") return "\u3000";
        return ch;
    }).join("");
}

// Small caps
const SMALL_CAPS = {
    a:"ᴀ",b:"ʙ",c:"ᴄ",d:"ᴅ",e:"ᴇ",f:"ꜰ",g:"ɢ",h:"ʜ",i:"ɪ",j:"ᴊ",k:"ᴋ",l:"ʟ",
    m:"ᴍ",n:"ɴ",o:"ᴏ",p:"ᴘ",q:"Q",r:"ʀ",s:"ꜱ",t:"ᴛ",u:"ᴜ",v:"ᴠ",w:"ᴡ",x:"x",
    y:"ʏ",z:"ᴢ",
};

// Upside down / flipped
const FLIP_MAP = {
    "a":"ɐ","b":"q","c":"ɔ","d":"p","e":"ǝ","f":"ɟ","g":"ƃ","h":"ɥ","i":"ᴉ","j":"ɾ",
    "k":"ʞ","l":"l","m":"ɯ","n":"u","o":"o","p":"d","q":"b","r":"ɹ","s":"s","t":"ʇ",
    "u":"n","v":"ʌ","w":"ʍ","x":"x","y":"ʎ","z":"z",
    "A":"∀","B":"q","C":"Ɔ","D":"p","E":"Ǝ","F":"Ⅎ","G":"פ","H":"H","I":"I","J":"ſ",
    "K":"ʞ","L":"˥","M":"W","N":"N","O":"O","P":"Ԁ","Q":"Q","R":"ɹ","S":"S","T":"┴",
    "U":"∩","V":"Λ","W":"M","X":"X","Y":"⅄","Z":"Z",
    "0":"0","1":"Ɩ","2":"ᄅ","3":"Ɛ","4":"ᔭ","5":"ϛ","6":"9","7":"ㄥ","8":"8","9":"6",
    ",":"'","!":"¡","?":"¿",".":"˙","'":","," ":" ",
};

function applyFlip(str) {
    return [...str].reverse().map(ch => FLIP_MAP[ch] || ch).join("");
}

// Strikethrough
function strikeThrough(str) {
    return [...str].map(ch => ch === " " ? " " : ch + "\u0336").join("");
}

// Underline
function underline(str) {
    return [...str].map(ch => ch === " " ? " " : ch + "\u0332").join("");
}

// Double underline
function doubleUnderline(str) {
    return [...str].map(ch => ch === " " ? " " : ch + "\u0333").join("");
}

// Zalgo / glitch
function zalgo(str) {
    const ABOVE = ["\u0300","\u0301","\u0302","\u0306","\u0308","\u030A","\u030B","\u030C","\u031A","\u033D","\u033E","\u033F","\u0340","\u0341","\u0342","\u0343"];
    const BELOW = ["\u0316","\u0317","\u0318","\u0319","\u031C","\u031D","\u031E","\u031F","\u0320","\u0321","\u0322","\u0323","\u0324","\u0325","\u0326","\u0327","\u0328"];
    return [...str].map(ch => {
        if (ch === " ") return " ";
        let r = ch;
        for (let i = 0; i < 3; i++) r += ABOVE[Math.floor(Math.random() * ABOVE.length)];
        for (let i = 0; i < 2; i++) r += BELOW[Math.floor(Math.random() * BELOW.length)];
        return r;
    }).join("");
}

// Apply any code-point map
function applyMap(str, map) {
    return [...str].map(ch => map[ch] || ch).join("");
}

// Small caps
function toSmallCaps(str) {
    return [...str].map(ch => {
        const lc = ch.toLowerCase();
        return SMALL_CAPS[lc] || (ch === ch.toUpperCase() ? ch : lc);
    }).join("");
}

// Subscript / superscript
function applyPartialMap(str, map) {
    return [...str].map(ch => map[ch] || ch).join("");
}

// ── Styles list ───────────────────────────────────────────────────────────────
function buildStyles(input) {
    const styles = [];

    for (const [name, map] of Object.entries(MAPS)) {
        styles.push({ name, text: applyMap(input, map) });
    }

    styles.push({ name: "Full-Width (Vaporwave)", text: toFullWidth(input) });
    styles.push({ name: "Small Caps",             text: toSmallCaps(input) });
    styles.push({ name: "Flipped / Upside-Down",  text: applyFlip(input) });
    styles.push({ name: "Strikethrough",           text: strikeThrough(input) });
    styles.push({ name: "Underline",               text: underline(input) });
    styles.push({ name: "Double Underline",        text: doubleUnderline(input) });
    styles.push({ name: "Superscript",             text: applyPartialMap(input, SUPERSCRIPT_MAP) });
    styles.push({ name: "Subscript",               text: applyPartialMap(input, SUBSCRIPT_MAP) });
    styles.push({ name: "Zalgo (glitch)",          text: zalgo(input) });

    return styles;
}

// ── DOM ───────────────────────────────────────────────────────────────────────
const ctInput   = document.getElementById("ctInput");
const ctResults = document.getElementById("ctResults");

function render(input) {
    if (!input.trim()) {
        ctResults.innerHTML = '<p class="ct-placeholder">Type above to see transformations.</p>';
        return;
    }
    const styles = buildStyles(input);
    ctResults.innerHTML = styles.map((s, i) => `
        <div class="ct-item">
            <div class="ct-left">
                <div class="ct-style-name">${s.name}</div>
                <div class="ct-text" id="ct-text-${i}">${s.text}</div>
            </div>
            <button class="ct-copy-btn" data-idx="${i}">Copy</button>
        </div>`).join("");

    ctResults.querySelectorAll(".ct-copy-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const text = document.getElementById(`ct-text-${btn.dataset.idx}`).textContent;
            navigator.clipboard.writeText(text).then(() => {
                btn.textContent = "Copied!";
                btn.classList.add("copied");
                setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1500);
            });
        });
    });
}

ctInput.addEventListener("input", () => render(ctInput.value));
