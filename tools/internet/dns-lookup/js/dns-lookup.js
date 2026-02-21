/* dns-lookup.js
   Pure browser JS — uses DNS-over-HTTPS (DoH).
   No API keys required. No backend required.

   External API endpoints:
     - Cloudflare DoH : https://cloudflare-dns.com/dns-query
     - Google DoH     : https://dns.google/resolve
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const DOH_PROVIDERS = {
    cloudflare: "https://cloudflare-dns.com/dns-query",
    google:     "https://dns.google/resolve",
};

// Record type numbers (for Cloudflare wire-format DoH)
const TYPE_MAP = { A:1, AAAA:28, MX:15, NS:2, TXT:16, CNAME:5, SOA:6, PTR:12 };
const ALL_TYPES = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"];

// ── DOM ─────────────────────────────────────────────────────────────────────
const domainInput = document.getElementById("domainInput");
const typeSelect  = document.getElementById("typeSelect");
const lookupBtn   = document.getElementById("lookupBtn");
const resultArea  = document.getElementById("resultArea");

// ── DoH query ────────────────────────────────────────────────────────────────
async function dohQuery(domain, type) {
    const provider = document.querySelector('input[name="doh"]:checked').value;
    const base = DOH_PROVIDERS[provider];
    const url  = `${base}?name=${encodeURIComponent(domain)}&type=${type}`;

    const resp = await fetch(url, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`DoH returned HTTP ${resp.status}`);
    return resp.json();
}

// ── Parse answers ────────────────────────────────────────────────────────────
function parseAnswers(data, type) {
    if (!data.Answer) return [];
    return data.Answer
        .filter(r => r.type === TYPE_MAP[type])
        .map(r => ({ ttl: r.TTL, data: r.data }));
}

// ── Render one record section ────────────────────────────────────────────────
function renderSection(type, records) {
    const count = records.length;
    let rows = "";
    if (count === 0) {
        rows = `<div class="dns-no-records">No ${type} records found.</div>`;
    } else {
        let cols = "";
        if (type === "MX") {
            cols = "<th>Priority</th><th>Mail server</th><th>TTL</th>";
            rows = records.map(r => {
                const parts = r.data.trim().split(/\s+/);
                const prio  = parts[0] ?? "";
                const host  = parts[1] ?? r.data;
                return `<tr><td>${prio}</td><td>${host}</td><td>${r.ttl}s</td></tr>`;
            }).join("");
        } else {
            cols = "<th>Value</th><th>TTL</th>";
            rows = records.map(r => `<tr><td>${r.data}</td><td>${r.ttl}s</td></tr>`).join("");
        }
        rows = `<table class="dns-table"><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table>`;
    }

    return `
        <div class="dns-section">
            <div class="dns-section-title">
                ${type}
                <span class="dns-count">${count}</span>
            </div>
            ${rows}
        </div>`;
}

// ── Main lookup ───────────────────────────────────────────────────────────────
async function doLookup() {
    const domain = domainInput.value.trim();
    if (!domain) { domainInput.focus(); return; }

    const selectedType = typeSelect.value;
    const types = selectedType === "ALL" ? ALL_TYPES : [selectedType];

    resultArea.innerHTML = `<p style="color:var(--color-text-muted);font-size:0.9rem">Querying DNS…</p>`;
    lookupBtn.disabled = true;

    try {
        const queries = types.map(t => dohQuery(domain, t).then(d => ({ type: t, data: d })).catch(() => ({ type: t, data: {} })));
        const results = await Promise.all(queries);

        let html = "";
        for (const { type, data } of results) {
            const records = parseAnswers(data, type);
            html += renderSection(type, records);
        }

        // Show NXDOMAIN / SERVFAIL if every type returned nothing
        if (results.every(r => !r.data.Answer || r.data.Answer.length === 0)) {
            const status = results[0]?.data?.Status;
            if (status === 3) {
                html = `<div class="dns-error">NXDOMAIN — domain does not exist.</div>`;
            } else if (status === 2) {
                html = `<div class="dns-error">SERVFAIL — DNS server error.</div>`;
            }
        }

        resultArea.innerHTML = html || `<p style="color:var(--color-text-muted)">No records found.</p>`;
    } catch (e) {
        resultArea.innerHTML = `<div class="dns-error">Error: ${e.message}</div>`;
    } finally {
        lookupBtn.disabled = false;
    }
}

lookupBtn.addEventListener("click", doLookup);
domainInput.addEventListener("keydown", e => { if (e.key === "Enter") doLookup(); });
