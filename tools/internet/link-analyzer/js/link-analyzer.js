/* link-analyzer.js */
"use strict";

// ── API endpoint ─────────────────────────────────────────────────────────────
const API_BASE          = "http://localhost:5501";
const API_LINK_ANALYZER = `${API_BASE}/api/link-analyzer`;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const urlInput         = document.getElementById("urlInput");
const maxLinksInput    = document.getElementById("maxLinks");
const analyzeBtn       = document.getElementById("analyzeBtn");
const backendBanner    = document.getElementById("backendBanner");
const errorBox         = document.getElementById("errorBox");
const resultsArea      = document.getElementById("resultsArea");
const metaBar          = document.getElementById("metaBar");
const linksBody        = document.getElementById("linksBody");
const sitemapXml       = document.getElementById("sitemapXml");
const exportCsvBtn     = document.getElementById("exportCsvBtn");
const downloadSitemapBtn = document.getElementById("downloadSitemapBtn");
const countAll         = document.getElementById("countAll");
const countInternal    = document.getElementById("countInternal");
const countExternal    = document.getElementById("countExternal");

// ── State ─────────────────────────────────────────────────────────────────────
let allLinks    = [];
let currentFilter = "all";
let sitemapContent = "";

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".la-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".la-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".la-panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
    });
});

// ── Filter buttons ────────────────────────────────────────────────────────────
document.querySelectorAll(".la-filter").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".la-filter").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.filter;
        renderLinksTable(allLinks, currentFilter);
    });
});

// ── Analyze ───────────────────────────────────────────────────────────────────
analyzeBtn.addEventListener("click", runAnalysis);
urlInput.addEventListener("keydown", e => { if (e.key === "Enter") runAnalysis(); });

async function runAnalysis() {
    const url = urlInput.value.trim();
    if (!url) {
        showError("Please enter a URL to analyze.");
        return;
    }

    let targetUrl = url;
    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = "https://" + targetUrl;
        urlInput.value = targetUrl;
    }

    const maxLinks = Math.min(parseInt(maxLinksInput.value, 10) || 100, 200);

    setLoading(true);
    clearError();
    resultsArea.classList.add("hidden");

    try {
        const resp = await fetch(API_LINK_ANALYZER, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: targetUrl, max_links: maxLinks }),
            signal: AbortSignal.timeout(30000),
        });

        backendBanner.classList.add("hidden");

        if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${resp.status}`);
        }

        const data = await resp.json();
        renderResults(data);

    } catch (err) {
        if (err.name === "TypeError" && err.message.includes("fetch")) {
            backendBanner.classList.remove("hidden");
            showError("Cannot reach the backend. Start python app.py (port 5501) and try again.");
        } else if (err.name === "TimeoutError" || err.name === "AbortError") {
            showError("Request timed out. The target site may be slow or unreachable.");
        } else {
            showError(err.message || "An unexpected error occurred.");
        }
    } finally {
        setLoading(false);
    }
}

function renderResults(data) {
    allLinks = data.links || [];
    sitemapContent = data.sitemap_xml || "";

    // Meta bar
    const internal = allLinks.filter(l => l.type === "internal").length;
    const external = allLinks.filter(l => l.type === "external").length;
    metaBar.innerHTML = `
        <span class="la-meta-title">${escHtml(data.title || "(no title)")}</span>
        <span class="la-meta-url">${escHtml(data.url || "")}</span>
        <span>${allLinks.length} links found</span>
        <span>${internal} internal</span>
        <span>${external} external</span>
    `;

    // Counts
    countAll.textContent      = allLinks.length;
    countInternal.textContent = internal;
    countExternal.textContent = external;

    // Reset filter
    currentFilter = "all";
    document.querySelectorAll(".la-filter").forEach(b => {
        b.classList.toggle("active", b.dataset.filter === "all");
    });

    renderLinksTable(allLinks, "all");

    // Sitemap
    sitemapXml.textContent = sitemapContent;

    resultsArea.classList.remove("hidden");

    // Switch to links tab
    document.querySelectorAll(".la-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".la-panel").forEach(p => p.classList.remove("active"));
    document.querySelector(".la-tab[data-tab='links']").classList.add("active");
    document.getElementById("panel-links").classList.add("active");
}

function renderLinksTable(links, filter) {
    const filtered = filter === "all" ? links : links.filter(l => l.type === filter);

    if (filtered.length === 0) {
        linksBody.innerHTML = `<tr><td colspan="4" style="padding:1rem;color:var(--color-text-muted);font-style:italic;">No links found for this filter.</td></tr>`;
        return;
    }

    linksBody.innerHTML = filtered.map((link, i) => `
        <tr>
            <td>${i + 1}</td>
            <td class="la-link-cell"><a href="${escAttr(link.href)}" target="_blank" rel="noopener noreferrer">${escHtml(truncate(link.href, 80))}</a></td>
            <td class="la-text-cell" title="${escAttr(link.text)}">${escHtml(link.text || "—")}</td>
            <td><span class="la-badge la-badge-${link.type}">${link.type}</span></td>
        </tr>
    `).join("");
}

// ── Export CSV ────────────────────────────────────────────────────────────────
exportCsvBtn.addEventListener("click", () => {
    if (!allLinks.length) return;
    const filtered = currentFilter === "all" ? allLinks : allLinks.filter(l => l.type === currentFilter);
    const rows = [["#", "Link", "Text", "Type"]];
    filtered.forEach((l, i) => rows.push([i + 1, l.href, l.text || "", l.type]));
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadBlob(csv, "text/csv", "links.csv");
});

// ── Download Sitemap ──────────────────────────────────────────────────────────
downloadSitemapBtn.addEventListener("click", () => {
    if (!sitemapContent) return;
    downloadBlob(sitemapContent, "application/xml", "sitemap.xml");
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escAttr(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function truncate(str, n) {
    return str.length > n ? str.slice(0, n) + "…" : str;
}

function downloadBlob(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
}

function clearError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
}

function setLoading(on) {
    analyzeBtn.disabled    = on;
    analyzeBtn.textContent = on ? "Analyzing…" : "Analyze";
}
