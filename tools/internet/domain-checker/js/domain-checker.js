/* domain-checker.js — pure JS, uses Cloudflare DNS-over-HTTPS (no backend) */
"use strict";

// ── External API endpoint ────────────────────────────────────────────────────
const DOH_API = "https://cloudflare-dns.com/dns-query";

// ── TLD list ──────────────────────────────────────────────────────────────────
const ALL_TLDS = [
    ".com", ".net", ".org", ".io", ".co", ".app",
    ".dev", ".ai", ".xyz", ".info", ".biz", ".me",
    ".online", ".tech", ".site",
];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const domainInput  = document.getElementById("domainInput");
const checkBtn     = document.getElementById("checkBtn");
const errorBox     = document.getElementById("errorBox");
const resultsArea  = document.getElementById("resultsArea");
const resultsTitle = document.getElementById("resultsTitle");
const resultsGrid  = document.getElementById("resultsGrid");
const tldGrid      = document.getElementById("tldGrid");
const selectAllBtn = document.getElementById("selectAllBtn");
const clearAllBtn  = document.getElementById("clearAllBtn");
const sumAvailable = document.getElementById("sumAvailable");
const sumTaken     = document.getElementById("sumTaken");
const sumUnknown   = document.getElementById("sumUnknown");

// ── TLD chip rendering ────────────────────────────────────────────────────────
ALL_TLDS.forEach(tld => {
    const chip = document.createElement("button");
    chip.className   = "dc-tld-chip selected";
    chip.textContent = tld;
    chip.dataset.tld = tld;
    chip.type        = "button";
    chip.addEventListener("click", () => chip.classList.toggle("selected"));
    tldGrid.appendChild(chip);
});

selectAllBtn.addEventListener("click", () => {
    tldGrid.querySelectorAll(".dc-tld-chip").forEach(c => c.classList.add("selected"));
});

clearAllBtn.addEventListener("click", () => {
    tldGrid.querySelectorAll(".dc-tld-chip").forEach(c => c.classList.remove("selected"));
});

// ── Main check ────────────────────────────────────────────────────────────────
checkBtn.addEventListener("click", runCheck);
domainInput.addEventListener("keydown", e => { if (e.key === "Enter") runCheck(); });

async function runCheck() {
    clearError();

    const raw = domainInput.value.trim().toLowerCase();
    if (!raw) {
        showError("Please enter a domain name to check.");
        return;
    }

    // Extract the base name (strip any TLD the user might have typed)
    let base = raw;
    // If they typed a full domain like "example.com", strip the TLD
    const dotIdx = raw.indexOf(".");
    if (dotIdx > 0) {
        base = raw.slice(0, dotIdx);
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(base)) {
        showError("Invalid domain name. Use only letters, numbers, and hyphens (no leading/trailing hyphen).");
        return;
    }

    const selectedTlds = [...tldGrid.querySelectorAll(".dc-tld-chip.selected")]
        .map(c => c.dataset.tld);

    if (selectedTlds.length === 0) {
        showError("Select at least one TLD to check.");
        return;
    }

    setLoading(true);
    resultsArea.classList.remove("hidden");
    resultsTitle.textContent = `Results for "${base}..."`;
    sumAvailable.textContent = "0";
    sumTaken.textContent     = "0";
    sumUnknown.textContent   = "0";

    // Build placeholder cards
    resultsGrid.innerHTML = "";
    const cardMap = {};
    selectedTlds.forEach(tld => {
        const domain = base + tld;
        const card   = buildCard(domain, "checking", "", "Checking DNS...");
        resultsGrid.appendChild(card);
        cardMap[domain] = card;
    });

    // Run all checks in parallel
    const checks = selectedTlds.map(tld => checkDomain(base + tld));
    const results = await Promise.allSettled(checks);

    let cntAvail = 0, cntTaken = 0, cntUnknown = 0;

    results.forEach((result, i) => {
        const domain = base + selectedTlds[i];
        const card   = cardMap[domain];

        if (result.status === "fulfilled") {
            const { status, detail } = result.value;
            updateCard(card, domain, status, detail);
            if (status === "available") cntAvail++;
            else if (status === "taken")     cntTaken++;
            else                              cntUnknown++;
        } else {
            updateCard(card, domain, "unknown", "Check failed: " + (result.reason?.message || "unknown error"));
            cntUnknown++;
        }
    });

    resultsTitle.textContent = `Results for "${base}"`;
    sumAvailable.textContent = cntAvail;
    sumTaken.textContent     = cntTaken;
    sumUnknown.textContent   = cntUnknown;

    setLoading(false);
}

// ── DNS-over-HTTPS check ──────────────────────────────────────────────────────
/**
 * Checks a domain via Cloudflare DoH.
 * Returns { status: "available"|"taken"|"unknown", detail: string }
 *
 * Logic:
 *   - Query A record. If NXDOMAIN (rcode=3) → likely available.
 *   - If A records found → taken.
 *   - If no A records but NOERROR → query NS record.
 *     NS records present → taken (domain is delegated).
 *     No NS either       → unknown (no authoritative info).
 */
async function checkDomain(domain) {
    // Query A record
    const aResult = await dohQuery(domain, "A");

    if (aResult.rcode === 3) {
        // NXDOMAIN — domain doesn't exist in DNS
        return {
            status: "available",
            detail: "NXDOMAIN — no DNS records found. Likely available.",
        };
    }

    if (aResult.rcode !== 0) {
        // SERVFAIL (2) or other error
        return {
            status: "unknown",
            detail: `DNS error (rcode ${aResult.rcode}).`,
        };
    }

    // NOERROR (rcode=0)
    if (aResult.answers && aResult.answers.length > 0) {
        return {
            status: "taken",
            detail: `DNS records found (${aResult.answers.length} A record${aResult.answers.length > 1 ? "s" : ""}).`,
        };
    }

    // NOERROR but no A records — try NS
    const nsResult = await dohQuery(domain, "NS");
    if (nsResult.rcode === 0 && nsResult.answers && nsResult.answers.length > 0) {
        return {
            status: "taken",
            detail: `Nameservers found — domain is registered and delegated.`,
        };
    }

    return {
        status: "unknown",
        detail: "No A or NS records, but no NXDOMAIN. Result inconclusive.",
    };
}

/**
 * Performs a DNS-over-HTTPS query using Cloudflare's JSON API.
 * Returns { rcode, answers } where answers is an array of record objects.
 */
async function dohQuery(name, type) {
    const url = `${DOH_API}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
    const resp = await fetch(url, {
        headers: { "Accept": "application/dns-json" },
        signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`DoH HTTP ${resp.status}`);
    const data = await resp.json();
    return {
        rcode:   data.Status,
        answers: data.Answer || [],
    };
}

// ── Card helpers ──────────────────────────────────────────────────────────────
function buildCard(domain, status, _detail, message) {
    const card = document.createElement("div");
    card.className = `dc-result-card checking`;
    card.innerHTML = `
        <div class="dc-card-domain">${escHtml(domain)}</div>
        <div class="dc-card-status checking">
            <span class="dc-spinner"></span>
            <span>${escHtml(message)}</span>
        </div>
        <div class="dc-card-detail"></div>
    `;
    return card;
}

function updateCard(card, domain, status, detail) {
    card.className = `dc-result-card ${status}`;

    const dotClass = {
        available: "dc-dot-available",
        taken:     "dc-dot-taken",
        unknown:   "dc-dot-unknown",
    }[status] || "dc-dot-checking";

    const labelMap = {
        available: "Likely available",
        taken:     "Likely taken",
        unknown:   "Unknown",
    };

    card.innerHTML = `
        <div class="dc-card-domain">${escHtml(domain)}</div>
        <div class="dc-card-status ${status}">
            <span class="dc-dot ${dotClass}"></span>
            <span>${labelMap[status] || status}</span>
        </div>
        <div class="dc-card-detail">${escHtml(detail)}</div>
    `;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
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
    checkBtn.disabled    = on;
    checkBtn.textContent = on ? "Checking…" : "Check";
}
