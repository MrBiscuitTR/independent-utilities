/* rot13.js — pure JS, no dependencies */
"use strict";

function rot13(str) {
    return str.replace(/[a-zA-Z]/g, ch => {
        const base = ch <= 'Z' ? 65 : 97;
        return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
    });
}

const inputEl  = document.getElementById("rot13Input");
const outputEl = document.getElementById("rot13Output");
const rotBtn   = document.getElementById("rot13Btn");
const swapBtn  = document.getElementById("swapBtn");
const copyBtn  = document.getElementById("rot13CopyBtn");

// Live update as user types
inputEl.addEventListener("input", () => {
    outputEl.value = rot13(inputEl.value);
});

rotBtn.addEventListener("click", () => {
    outputEl.value = rot13(inputEl.value);
});

swapBtn.addEventListener("click", () => {
    const tmp = inputEl.value;
    inputEl.value  = outputEl.value;
    outputEl.value = tmp;
});

copyBtn.addEventListener("click", () => {
    if (!outputEl.value) return;
    navigator.clipboard.writeText(outputEl.value).then(() => {
        copyBtn.textContent = "Copied!";
        copyBtn.classList.add("copied");
        setTimeout(() => { copyBtn.textContent = "Copy output"; copyBtn.classList.remove("copied"); }, 1500);
    });
});
