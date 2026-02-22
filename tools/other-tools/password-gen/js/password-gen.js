/* password-gen.js — pure JS, Web Crypto API, no external APIs */

"use strict";

// ── Character pools ────────────────────────────────────────────────────────
const POOLS = {
    upper:   "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lower:   "abcdefghijklmnopqrstuvwxyz",
    digits:  "0123456789",
    symbols: "!@#$%^&*()-_=+[]|;:,.<>?~{}/",
};
const AMBIG = new Set([..."0O1lI"]);

// ── DOM refs ───────────────────────────────────────────────────────────────
const pgOutput      = document.getElementById("pgOutput");
const pgLength      = document.getElementById("pgLength");
const pgLenVal      = document.getElementById("pgLenVal");
const pgGenBtn      = document.getElementById("pgGenBtn");
const pgCopy        = document.getElementById("pgCopy");
const pgRegen       = document.getElementById("pgRegen");
const pgBatchArea   = document.getElementById("pgBatchArea");
const strengthInput = document.getElementById("strengthInput");
const strengthFill  = document.getElementById("strengthFill");
const strengthLabel = document.getElementById("strengthLabel");
const strengthDetails = document.getElementById("strengthDetails");
const strengthTips  = document.getElementById("strengthTips");

// ── Secure random int [0, max) ─────────────────────────────────────────────
function randInt(max) {
    const arr = new Uint32Array(1);
    let n;
    // Rejection sampling to avoid modulo bias
    const limit = Math.floor(0x100000000 / max) * max;
    do { crypto.getRandomValues(arr); n = arr[0]; } while (n >= limit);
    return n % max;
}

// ── Build character pool from checkboxes ──────────────────────────────────
function buildPool() {
    const excl = document.getElementById("pgExcludeAmbig").checked;
    let pool = "";
    if (document.getElementById("pgUpper").checked)   pool += POOLS.upper;
    if (document.getElementById("pgLower").checked)   pool += POOLS.lower;
    if (document.getElementById("pgDigits").checked)  pool += POOLS.digits;
    if (document.getElementById("pgSymbols").checked) pool += POOLS.symbols;
    if (excl) pool = [...pool].filter(c => !AMBIG.has(c)).join("");
    return pool;
}

// ── Generate one password ─────────────────────────────────────────────────
function generateOne(length, pool) {
    if (!pool) return "";
    let pw = "";
    for (let i = 0; i < length; i++) pw += pool[randInt(pool.length)];
    return pw;
}

// ── Ensure at least one char from each chosen category ───────────────────
function ensureRequirements(pw, pool) {
    const checks = [
        { id: "pgUpper",   p: POOLS.upper },
        { id: "pgLower",   p: POOLS.lower },
        { id: "pgDigits",  p: POOLS.digits },
        { id: "pgSymbols", p: POOLS.symbols },
    ];
    const excl = document.getElementById("pgExcludeAmbig").checked;
    const arr = [...pw];

    for (const { id, p } of checks) {
        if (!document.getElementById(id).checked) continue;
        let filtered = excl ? [...p].filter(c => !AMBIG.has(c)).join("") : p;
        if (!filtered) continue;
        const hasOne = arr.some(c => filtered.includes(c));
        if (!hasOne) {
            // Replace a random position
            const pos = randInt(arr.length);
            arr[pos] = filtered[randInt(filtered.length)];
        }
    }
    return arr.join("");
}

function generate(count = 1) {
    const length = parseInt(pgLength.value, 10);
    const pool   = buildPool();
    if (!pool) { alert("Select at least one character type."); return []; }
    return Array.from({ length: count }, () => ensureRequirements(generateOne(length, pool), pool));
}

// ── Render ─────────────────────────────────────────────────────────────────
pgGenBtn.addEventListener("click", () => {
    const count = parseInt(document.getElementById("pgCount").value, 10);
    const pws   = generate(count);
    if (!pws.length) return;

    pgOutput.value = pws[0];
    checkStrength(pws[0]);

    if (count === 1) {
        pgBatchArea.classList.add("hidden");
    } else {
        pgBatchArea.innerHTML = "";
        pws.forEach(pw => {
            const wrapper = document.createElement("div");
            wrapper.className = "pg-batch-item";

            const span = document.createElement("span");
            span.textContent = pw; // SAFE

            const btn = document.createElement("button");
            btn.className = "pg-batch-copy";
            btn.textContent = "Copy";
            btn.dataset.pw = pw; // SAFE

            wrapper.appendChild(span);
            wrapper.appendChild(btn);
            pgBatchArea.appendChild(wrapper);
        });
        pgBatchArea.classList.remove("hidden");
    }
});

pgRegen.addEventListener("click", () => {
    const pw = generate(1)[0];
    if (!pw) return;
    pgOutput.value = pw;
    checkStrength(pw);
    pgBatchArea.classList.add("hidden");
});

pgLength.addEventListener("input", () => { pgLenVal.textContent = pgLength.value; });

// Copy main
pgCopy.addEventListener("click", () => {
    if (!pgOutput.value) return;
    navigator.clipboard.writeText(pgOutput.value).then(() => {
        pgCopy.textContent = "Copied!";
        pgCopy.classList.add("copied");
        setTimeout(() => { pgCopy.textContent = "Copy"; pgCopy.classList.remove("copied"); }, 1500);
    });
});

// Copy from batch
pgBatchArea.addEventListener("click", e => {
    if (!e.target.classList.contains("pg-batch-copy")) return;
    navigator.clipboard.writeText(e.target.dataset.pw).then(() => {
        e.target.textContent = "✓";
        setTimeout(() => { e.target.textContent = "Copy"; }, 1400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Strength checker
// ─────────────────────────────────────────────────────────────────────────────
const LEVELS = [
    { label: "Very Weak",  color: "#dc3545", pct: 12 },
    { label: "Weak",       color: "#fd7e14", pct: 30 },
    { label: "Fair",       color: "#ffc107", pct: 52 },
    { label: "Good",       color: "#4aaaff", pct: 72 },
    { label: "Strong",     color: "#28a745", pct: 88 },
    { label: "Very Strong",color: "#1a7d44", pct: 100 },
];

function entropy(pw) {
    // Shannon entropy as proxy: also incorporate pool size estimate
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/[0-9]/.test(pw)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
    return pool > 0 ? pw.length * Math.log2(pool) : 0;
}

function crackEstimate(bits) {
    const GUESSES_PER_SECOND = 1e15; // 1 quadrillion/s | OLD (too pessimistic): 1 quintillion/sec (gov/datacenter-level cluster)
    if (bits <= 0) return "< 1 second";
    // seconds = 2^bits / guessesPerSecond
    const seconds = Math.pow(2, bits) / GUESSES_PER_SECOND;
    if (!isFinite(seconds) || seconds <= 0) return "> trillions of years";
    const minute = 60;
    const hour   = 3600;
    const day    = 86400;
    const year   = 31536000;
    if (seconds < 1)
        return "< 1 second";
    if (seconds < minute)
        return `~${seconds.toFixed(0)} seconds`;
    if (seconds < hour)
        return `~${(seconds / minute).toFixed(0)} minutes`;
    if (seconds < day)
        return `~${(seconds / hour).toFixed(0)} hours`;
    if (seconds < year)
        return `~${(seconds / day).toFixed(0)} days`;
    const years = seconds / year;
    if (years < 1e6)
        return `~${years.toFixed(0)} years`;
    return `~${years.toExponential(2)} years`;
}

function checkStrength(pw) {
    if (!pw) {
        strengthFill.style.width = "0%";
        strengthLabel.textContent = "";
        strengthDetails.classList.add("hidden");
        strengthTips.classList.add("hidden");
        return;
    }

    const bits = entropy(pw);
    const tips = [];

    // Score 0–5
    let score = 0;
    if (bits >= 28) score++;
    if (bits >= 40) score++;
    if (bits >= 56) score++;
    if (bits >= 72) score++;
    if (bits >= 90) score++;
    if (pw.length >= 16) score = Math.max(score, 2);
    score = Math.min(score, 5);

    const lvl = LEVELS[score];
    strengthFill.style.width = lvl.pct + "%";
    strengthFill.style.background = lvl.color;
    strengthLabel.textContent = lvl.label;
    strengthLabel.style.color = lvl.color;

    // Pool
    let pool = 0;
    if (/[a-z]/.test(pw)) pool += 26;
    if (/[A-Z]/.test(pw)) pool += 26;
    if (/[0-9]/.test(pw)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;

    document.getElementById("sdEntropy").textContent = `${bits.toFixed(1)} bits`;
    document.getElementById("sdPool").textContent    = `~${pool} characters`;
    document.getElementById("sdLength").textContent  = `${pw.length} characters`;
    document.getElementById("sdCrack").textContent   = crackEstimate(bits);
    strengthDetails.classList.remove("hidden");

    // Tips
    if (pw.length < 12) tips.push("Use at least 12 characters.");
    if (!/[A-Z]/.test(pw)) tips.push("Add uppercase letters.");
    if (!/[0-9]/.test(pw)) tips.push("Add digits.");
    if (!/[^a-zA-Z0-9]/.test(pw)) tips.push("Add symbols (!, @, #, …).");
    if (/(.)\1{2,}/.test(pw)) tips.push("Avoid repeating characters (aaa, 111…).");
    if (/^[a-z]+$/i.test(pw)) tips.push("Mix character types.");

    if (tips.length) {
        strengthTips.innerHTML = `<strong>Suggestions:</strong><ul>${tips.map(t => `<li>${t}</li>`).join("")}</ul>`;
        strengthTips.classList.remove("hidden");
    } else {
        strengthTips.classList.add("hidden");
    }
}

strengthInput.addEventListener("input", () => checkStrength(strengthInput.value));
