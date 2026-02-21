/* notepad.js — plain text editor with multi-tab support
   No external API. JSZip (local copy) used only for "Save All".
*/
"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
let tabs    = [];
let activeId = null;
let nextId  = 1;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ── DOM ───────────────────────────────────────────────────────────────────────
const tabBar     = document.getElementById("tabBar");
const newTabBtn  = document.getElementById("newTabBtn");
const editor     = document.getElementById("editor");
const charInfo   = document.getElementById("charCountInfo");
const openBtn    = document.getElementById("openFileBtn");
const fileInput  = document.getElementById("fileInput");
const saveBtn    = document.getElementById("saveBtn");
const saveAllBtn = document.getElementById("saveAllBtn");
const renameInput= document.getElementById("renameInput");

// ── Tab management ────────────────────────────────────────────────────────────
function createTab(name = "Untitled", content = "") {
    const id = nextId++;
    tabs.push({ id, name, content, saved: true });
    renderTabs();
    switchTo(id);
    return id;
}

function switchTo(id) {
    if (activeId !== null) {
        const cur = tabs.find(t => t.id === activeId);
        if (cur) cur.content = editor.value;
    }
    activeId = id;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    editor.value = tab.content;
    editor.focus();
    renderTabs();
    updateCharCount();
}

function closeTab(id) {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    if (!tab.saved && tab.content.trim()) {
        if (!confirm(`Close "${tab.name}" without saving?`)) return;
    }
    const idx = tabs.findIndex(t => t.id === id);
    tabs.splice(idx, 1);
    if (tabs.length === 0) {
        createTab();
        return;
    }
    if (activeId === id) {
        const newActive = tabs[Math.min(idx, tabs.length - 1)].id;
        switchTo(newActive);
    } else {
        renderTabs();
    }
}

function renderTabs() {
    // Remove all tab elements (keep new-tab btn)
    tabBar.querySelectorAll(".tab").forEach(el => el.remove());

    tabs.forEach(tab => {
        const el = document.createElement("div");
        el.className = "tab" + (tab.id === activeId ? " active" : "") + (!tab.saved ? " unsaved" : "");
        el.dataset.tabId = tab.id;
        el.title = tab.name + (!tab.saved ? " (unsaved)" : "");
        el.innerHTML = `<span class="tab-name">${escHtml(tab.name)}</span><button class="tab-close" data-close="${tab.id}" title="Close">✕</button>`;

        el.addEventListener("click", e => {
            if (e.target.closest(".tab-close")) return;
            switchTo(tab.id);
        });
        // Double-click to rename
        el.addEventListener("dblclick", e => {
            if (e.target.closest(".tab-close")) return;
            showRenameInput(tab.id, el);
        });

        el.querySelector(".tab-close").addEventListener("click", e => {
            e.stopPropagation();
            closeTab(tab.id);
        });

        tabBar.insertBefore(el, newTabBtn);
    });
}

// ── Rename ────────────────────────────────────────────────────────────────────
function showRenameInput(id, tabEl) {
    const rect = tabEl.getBoundingClientRect();
    renameInput.classList.remove("hidden");
    renameInput.style.top  = (rect.bottom + window.scrollY) + "px";
    renameInput.style.left = rect.left + "px";
    renameInput.value = tabs.find(t => t.id === id)?.name || "";
    renameInput.select();
    renameInput.dataset.renameId = id;
    renameInput.focus();
}

renameInput.addEventListener("blur", commitRename);
renameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { commitRename(); renameInput.blur(); }
    if (e.key === "Escape") { renameInput.classList.add("hidden"); }
});

function commitRename() {
    const id  = parseInt(renameInput.dataset.renameId);
    const tab = tabs.find(t => t.id === id);
    if (tab && renameInput.value.trim()) {
        tab.name = renameInput.value.trim();
        renderTabs();
    }
    renameInput.classList.add("hidden");
}

// ── Editor events ─────────────────────────────────────────────────────────────
editor.addEventListener("input", () => {
    const tab = tabs.find(t => t.id === activeId);
    if (tab) { tab.content = editor.value; tab.saved = false; }
    updateCharCount();
    renderTabs();
});

// Tab key inserts 4 spaces
editor.addEventListener("keydown", e => {
    if (e.key === "Tab") {
        e.preventDefault();
        const start = editor.selectionStart;
        const end   = editor.selectionEnd;
        const val   = editor.value;
        if (e.shiftKey) {
            // Unindent: remove up to 4 leading spaces from current line
            const lineStart = val.lastIndexOf("\n", start - 1) + 1;
            const spaces    = Math.min(4, val.slice(lineStart).match(/^ */)[0].length);
            if (spaces > 0) {
                editor.value = val.slice(0, lineStart) + val.slice(lineStart + spaces);
                editor.selectionStart = editor.selectionEnd = start - spaces;
            }
        } else {
            editor.value = val.slice(0, start) + "    " + val.slice(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
        }
        const tab = tabs.find(t => t.id === activeId);
        if (tab) { tab.content = editor.value; tab.saved = false; }
        updateCharCount();
    }
    // Ctrl+S → save
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        downloadCurrentTab();
    }
});

function updateCharCount() {
    const v = editor.value;
    const words = v.trim() ? v.trim().split(/\s+/).length : 0;
    charInfo.textContent = `${v.length} chars · ${words} words · ${v.split("\n").length} lines`;
}

// ── Open files ────────────────────────────────────────────────────────────────
openBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
    const files = [...fileInput.files];
    fileInput.value = "";
    files.forEach(file => {
        if (file.size > MAX_FILE_SIZE) {
            alert(`"${file.name}" exceeds the 20 MB limit and was skipped.`);
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            // Check if there's a blank untitled unsaved tab to reuse
            const blank = tabs.find(t => t.name === "Untitled" && !t.content.trim() && t.saved);
            if (blank) {
                blank.name    = file.name;
                blank.content = e.target.result;
                blank.saved   = true;
                switchTo(blank.id);
            } else {
                const id = createTab(file.name, e.target.result);
                const tab = tabs.find(t => t.id === id);
                if (tab) tab.saved = true;
                renderTabs();
            }
        };
        reader.readAsText(file);
    });
});

// ── Save ──────────────────────────────────────────────────────────────────────
function downloadCurrentTab() {
    const tab = tabs.find(t => t.id === activeId);
    if (!tab) return;
    downloadText(tab.content, tab.name);
    tab.saved = true;
    renderTabs();
}

saveBtn.addEventListener("click", downloadCurrentTab);

saveAllBtn.addEventListener("click", async () => {
    if (!window.JSZip) { alert("JSZip not loaded — cannot zip files."); return; }
    const zip = new JSZip();
    tabs.forEach(tab => {
        const content = tab.id === activeId ? editor.value : tab.content;
        zip.file(tab.name, content);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = "notepad-tabs.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    tabs.forEach(t => t.saved = true);
    renderTabs();
});

function downloadText(content, filename) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ── New tab button ────────────────────────────────────────────────────────────
newTabBtn.addEventListener("click", () => createTab());

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Init ──────────────────────────────────────────────────────────────────────
createTab();
