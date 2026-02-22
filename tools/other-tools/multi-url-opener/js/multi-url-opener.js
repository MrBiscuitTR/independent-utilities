/* multi-url-opener.js — pure JS, no dependencies */
"use strict";

const urlsInput  = document.getElementById("urlsInput");
const openBtn    = document.getElementById("openBtn");
const clearBtn   = document.getElementById("clearBtn");
const urlCount   = document.getElementById("urlCount");
const urlList    = document.getElementById("urlList");
const popupNote  = document.getElementById("popupNotice");

function parseUrls(raw) {
    return raw
        .split(/[\n,\s]+/)
        .map(u => u.trim())
        .filter(Boolean);
}

function normalizeUrl(u) {
    if (/^https?:\/\//i.test(u)) return u;
    return "https://" + u;
}

function isLikelyUrl(u) {
    try {
        const url = new URL(normalizeUrl(u));
        return url.hostname.includes(".");
    } catch {
        return false;
    }
}

function updateCount() {
    const urls = parseUrls(urlsInput.value);
    const valid = urls.filter(isLikelyUrl).length;
    urlCount.textContent = valid > 0
        ? `${urls.length} URL${urls.length !== 1 ? "s" : ""} detected (${valid} valid)`
        : `${urls.length} line${urls.length !== 1 ? "s" : ""} entered`;
}

urlsInput.addEventListener("input", updateCount);

openBtn.addEventListener("click", () => {
    const raw  = parseUrls(urlsInput.value);
    const urls = raw.map(u => ({ raw: u, url: normalizeUrl(u), valid: isLikelyUrl(u) }));

    urlList.innerHTML = "";
    popupNote.classList.add("hidden");

    let blockedCount = 0;

    urls.forEach(entry => {
        const item = document.createElement("div");
        item.className = "url-item" + (entry.valid ? "" : " invalid");

        const textSpan   = document.createElement("span");
        textSpan.className = "url-text";
        textSpan.textContent = entry.raw;

        const statusSpan = document.createElement("span");
        statusSpan.className = "url-status";

        item.appendChild(textSpan);
        item.appendChild(statusSpan);
        urlList.appendChild(item);

        if (!entry.valid) {
            statusSpan.textContent = "invalid URL";
            return;
        }

        const win = window.open(entry.url, "_blank");
        if (win) {
            statusSpan.textContent = "opened ✓";
            item.classList.add("opened");
        } else {
            statusSpan.textContent = "blocked by browser";
            item.classList.add("blocked");
            blockedCount++;
        }
    });

    if (blockedCount > 0) {
        popupNote.classList.remove("hidden");
    }
});

clearBtn.addEventListener("click", () => {
    urlsInput.value = "";
    urlList.innerHTML = "";
    popupNote.classList.add("hidden");
    updateCount();
});

updateCount();
