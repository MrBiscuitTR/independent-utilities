/* credit-card.js — Luhn algorithm, pure JS, no dependencies */
"use strict";

// ── Luhn algorithm ────────────────────────────────────────────────────────────
function luhn(digits) {
    let sum = 0;
    let alternate = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = parseInt(digits[i], 10);
        if (alternate) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alternate = !alternate;
    }
    return sum % 10 === 0;
}

// ── Network detection ─────────────────────────────────────────────────────────
function detectNetwork(digits) {
    if (/^4/.test(digits) && (digits.length === 13 || digits.length === 16 || digits.length === 19))
        return { name: "Visa", cls: "visa" };
    if (/^5[1-5]/.test(digits) && digits.length === 16)
        return { name: "Mastercard", cls: "mastercard" };
    if (/^2[2-7]/.test(digits) && digits.length === 16)
        return { name: "Mastercard", cls: "mastercard" };
    if (/^3[47]/.test(digits) && digits.length === 15)
        return { name: "Amex", cls: "amex" };
    if (/^6(?:011|5)/.test(digits) && (digits.length === 16 || digits.length === 19))
        return { name: "Discover", cls: "discover" };
    if (/^3(?:0[0-5]|[68])/.test(digits) && digits.length === 14)
        return { name: "Diners", cls: "diners" };
    if (/^(?:2131|1800|35\d{3})/.test(digits) && digits.length === 16)
        return { name: "JCB", cls: "jcb" };
    if (/^62/.test(digits) && (digits.length >= 16 && digits.length <= 19))
        return { name: "UnionPay", cls: "unionpay" };
    if (/^(?:6304|6759|6761|6763)/.test(digits) && (digits.length >= 12 && digits.length <= 19))
        return { name: "Maestro", cls: "maestro" };
    return null;
}

// ── Format for display (groups of 4, except Amex 4-6-5) ──────────────────────
function formatNumber(digits, network) {
    if (network && network.cls === "amex" && digits.length >= 4) {
        return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10)].filter(Boolean).join(" ");
    }
    if (network && network.cls === "diners" && digits.length >= 4) {
        return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10)].filter(Boolean).join(" ");
    }
    return digits.match(/.{1,4}/g)?.join(" ") || digits;
}

// ── DOM ──────────────────────────────────────────────────────────────────────
const inputEl  = document.getElementById("ccInput");
const resultEl = document.getElementById("ccResult");
const badgeEl  = document.getElementById("ccNetworkBadge");

function validate() {
    const raw    = inputEl.value.replace(/\D/g, "");
    badgeEl.textContent = "";
    badgeEl.className   = "cc-badge";
    resultEl.className  = "cc-result hidden";

    if (raw.length < 8) return;

    const network = detectNetwork(raw);
    if (network) {
        badgeEl.textContent = network.name;
        badgeEl.classList.add(network.cls);
    }

    if (raw.length < 12) return;

    const valid = luhn(raw);
    const formatted = formatNumber(raw, network);

    resultEl.className = "cc-result " + (valid ? "valid" : "invalid");
    resultEl.innerHTML = `
        <span class="result-icon">${valid ? "✅" : "❌"}</span>
        ${valid ? "Valid card number" : "Invalid card number (Luhn check failed)"}
        <div class="cc-detail">
            <span><strong>Number:</strong> ${formatted}</span>
            <span><strong>Length:</strong> ${raw.length} digits</span>
            ${network ? `<span><strong>Network:</strong> ${network.name}</span>` : ""}
        </div>`;
}

// Format on input (auto-insert spaces)
inputEl.addEventListener("input", e => {
    const cursor = e.target.selectionStart;
    const raw    = e.target.value.replace(/\D/g, "").slice(0, 19);
    const network = detectNetwork(raw);
    const formatted = formatNumber(raw, network);
    e.target.value = formatted;
    validate();
});

// Clickable test numbers
document.querySelectorAll(".test-row").forEach(row => {
    row.addEventListener("click", () => {
        const num = row.querySelector(".test-num").textContent;
        inputEl.value = num;
        validate();
    });
});
