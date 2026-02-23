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

// Record type numbers (RFC standard)
const TYPE_NUM = { A:1, AAAA:28, MX:15, NS:2, TXT:16, CNAME:5, SOA:6, PTR:12, CAA:257, SRV:33, DNSKEY:48, DS:43 };
const ALL_TYPES = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA", "CAA"];

// ── Tab switching ─────────────────────────────────────────────────────────────
document.getElementById("dnsTabs").addEventListener("click", e => {
    const btn = e.target.closest(".dtab");
    if (!btn) return;
    document.querySelectorAll(".dtab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".dns-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
});

// ── DoH helper ────────────────────────────────────────────────────────────────
async function dohQuery(name, type) {
    const provider = document.querySelector('input[name="doh"]:checked').value;
    const base = DOH_PROVIDERS[provider];
    const url  = `${base}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
    const resp = await fetch(url, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error(`DoH returned HTTP ${resp.status}`);
    return resp.json();
}

function getAnswers(data, typeStr) {
    if (!data.Answer) return [];
    const num = TYPE_NUM[typeStr];
    return data.Answer.filter(r => !num || r.type === num).map(r => ({ ttl: r.TTL, data: r.data }));
}

// ── Shared render helpers ─────────────────────────────────────────────────────
function loading(el) {
    el.innerHTML = `<p class="dns-loading">Querying DNS&#x2026;</p>`;
}

function renderSection(type, records) {
    const count = records.length;
    let inner = "";
    if (count === 0) {
        inner = `<div class="dns-no-records">No ${type} records found.</div>`;
    } else {
        let cols = "";
        if (type === "MX") {
            cols = "<th>Priority</th><th>Mail Server</th><th>TTL</th>";
            inner = records.map(r => {
                const p = r.data.trim().split(/\s+/);
                return `<tr><td>${p[0]??""}</td><td>${p[1]??r.data}</td><td>${r.ttl}s</td></tr>`;
            }).join("");
        } else if (type === "SOA") {
            cols = "<th>Value</th><th>TTL</th>";
            inner = records.map(r => `<tr><td style="word-break:break-all">${r.data}</td><td>${r.ttl}s</td></tr>`).join("");
        } else {
            cols = "<th>Value</th><th>TTL</th>";
            inner = records.map(r => `<tr><td>${r.data}</td><td>${r.ttl}s</td></tr>`).join("");
        }
        inner = `<table class="dns-table"><thead><tr>${cols}</tr></thead><tbody>${inner}</tbody></table>`;
    }
    return `<div class="dns-section">
        <div class="dns-section-title">${type} <span class="dns-count">${count}</span></div>
        ${inner}
    </div>`;
}

function renderError(msg) {
    return `<div class="dns-error">${escHtml(msg)}</div>`;
}

function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1 — DNS Records
// ════════════════════════════════════════════════════════════════════════════
const domainInput = document.getElementById("domainInput");
const typeSelect  = document.getElementById("typeSelect");
const lookupBtn   = document.getElementById("lookupBtn");
const resultArea  = document.getElementById("resultArea");
const dkimRow     = document.getElementById("dkimRow");
const dkimSel     = document.getElementById("dkimSelector");

typeSelect.addEventListener("change", () => {
    dkimRow.classList.toggle("hidden", typeSelect.value !== "DKIM");
});

async function doLookup() {
    const domain = domainInput.value.trim().replace(/^https?:\/\//i, "").split("/")[0];
    if (!domain) { domainInput.focus(); return; }

    loading(resultArea);
    lookupBtn.disabled = true;

    try {
        let selectedType = typeSelect.value;

        if (selectedType === "DKIM") {
            // DKIM = TXT at <selector>._domainkey.<domain>
            const selector = dkimSel.value.trim() || "default";
            const dkimName = `${selector}._domainkey.${domain}`;
            const data = await dohQuery(dkimName, "TXT");
            const records = getAnswers(data, "TXT");
            resultArea.innerHTML = renderSection(`DKIM (${selector}._domainkey.${domain})`, records);
            return;
        }

        const types = selectedType === "ALL" ? ALL_TYPES : [selectedType];
        const queries = types.map(t =>
            dohQuery(domain, t).then(d => ({ type: t, data: d })).catch(() => ({ type: t, data: {} }))
        );
        const results = await Promise.all(queries);

        let html = "";
        for (const { type, data } of results) {
            html += renderSection(type, getAnswers(data, type));
        }

        // NXDOMAIN / SERVFAIL check
        if (results.every(r => !r.data.Answer || r.data.Answer.length === 0)) {
            const status = results[0]?.data?.Status;
            if (status === 3) html = renderError("NXDOMAIN — domain does not exist.");
            else if (status === 2) html = renderError("SERVFAIL — DNS server error.");
        }

        resultArea.innerHTML = html || `<p style="color:var(--color-text-muted)">No records found.</p>`;
    } catch(e) {
        resultArea.innerHTML = renderError(e.message);
    } finally {
        lookupBtn.disabled = false;
    }
}

lookupBtn.addEventListener("click", doLookup);
domainInput.addEventListener("keydown", e => { if (e.key === "Enter") doLookup(); });

// ════════════════════════════════════════════════════════════════════════════
// TAB 2 — DMARC
// ════════════════════════════════════════════════════════════════════════════
const dmarcDomain = document.getElementById("dmarcDomain");
const dmarcBtn    = document.getElementById("dmarcBtn");
const dmarcResult = document.getElementById("dmarcResult");

function parseDmarc(raw) {
    // raw TXT record content, e.g. v=DMARC1; p=reject; ...
    const tags = {};
    raw.replace(/^"|"$/g, "").split(/\s*;\s*/).forEach(part => {
        const eq = part.indexOf("=");
        if (eq > 0) tags[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
    });
    return tags;
}

const DMARC_LABELS = {
    v: "Version", p: "Policy", sp: "Sub-domain Policy", pct: "Percentage",
    rua: "Aggregate Report URI", ruf: "Forensic Report URI",
    adkim: "DKIM Alignment", aspf: "SPF Alignment", fo: "Failure Options",
};

const DMARC_POLICY_BADGE = { none: "dns-badge-warn", quarantine: "dns-badge-info", reject: "dns-badge-ok" };

async function doDmarc() {
    const domain = dmarcDomain.value.trim().replace(/^https?:\/\//i, "").split("/")[0];
    if (!domain) { dmarcDomain.focus(); return; }

    loading(dmarcResult);
    dmarcBtn.disabled = true;

    try {
        const data = await dohQuery(`_dmarc.${domain}`, "TXT");
        const records = getAnswers(data, "TXT");
        const dmarcRec = records.find(r => r.data.includes("v=DMARC1"));

        if (!dmarcRec) {
            dmarcResult.innerHTML = `<div class="dns-warn-box">No DMARC record found at <code>_dmarc.${escHtml(domain)}</code>. Email is not protected by DMARC.</div>`;
            return;
        }

        const tags = parseDmarc(dmarcRec.data);
        const policy = tags.p || "none";
        const badgeClass = DMARC_POLICY_BADGE[policy] || "dns-badge-info";

        let rows = Object.entries(DMARC_LABELS)
            .filter(([k]) => tags[k])
            .map(([k, label]) => {
                let val = escHtml(tags[k]);
                if (k === "p" || k === "sp") {
                    val = `<span class="dns-badge ${DMARC_POLICY_BADGE[tags[k]] || "dns-badge-info"}">${val}</span>`;
                }
                return `<tr><td class="dns-kv-key">${label}</td><td>${val}</td></tr>`;
            }).join("");

        dmarcResult.innerHTML = `
            <div class="dns-kv-box">
                <div class="dns-kv-header">
                    DMARC Record <span class="dns-badge ${badgeClass}">${escHtml(policy)}</span>
                </div>
                <div class="dns-raw-record">${escHtml(dmarcRec.data)}</div>
                <table class="dns-kv-table"><tbody>${rows}</tbody></table>
            </div>`;
    } catch(e) {
        dmarcResult.innerHTML = renderError(e.message);
    } finally {
        dmarcBtn.disabled = false;
    }
}

dmarcBtn.addEventListener("click", doDmarc);
dmarcDomain.addEventListener("keydown", e => { if (e.key === "Enter") doDmarc(); });

// ════════════════════════════════════════════════════════════════════════════
// TAB 3 — DNSKEY / DS
// ════════════════════════════════════════════════════════════════════════════
const dnskeyDomain = document.getElementById("dnskeyDomain");
const dnskeyBtn    = document.getElementById("dnskeyBtn");
const dsBtn        = document.getElementById("dsBtn");
const dnskeyResult = document.getElementById("dnskeyResult");

async function doDnskeyLookup(type) {
    const domain = dnskeyDomain.value.trim().replace(/^https?:\/\//i, "").split("/")[0];
    if (!domain) { dnskeyDomain.focus(); return; }

    loading(dnskeyResult);
    dnskeyBtn.disabled = true;
    dsBtn.disabled = true;

    try {
        const data = await dohQuery(domain, type);
        const records = getAnswers(data, type);

        if (records.length === 0) {
            dnskeyResult.innerHTML = `<div class="dns-warn-box">No ${type} records found for <strong>${escHtml(domain)}</strong>. DNSSEC may not be configured.</div>`;
            return;
        }

        dnskeyResult.innerHTML = renderSection(type, records);
    } catch(e) {
        dnskeyResult.innerHTML = renderError(e.message);
    } finally {
        dnskeyBtn.disabled = false;
        dsBtn.disabled = false;
    }
}

dnskeyBtn.addEventListener("click", () => doDnskeyLookup("DNSKEY"));
dsBtn.addEventListener("click", () => doDnskeyLookup("DS"));
dnskeyDomain.addEventListener("keydown", e => { if (e.key === "Enter") doDnskeyLookup("DNSKEY"); });

// ════════════════════════════════════════════════════════════════════════════
// TAB 4 — DNS Health Check
// ════════════════════════════════════════════════════════════════════════════
const healthDomain = document.getElementById("healthDomain");
const healthBtn    = document.getElementById("healthBtn");
const healthResult = document.getElementById("healthResult");

async function doHealthCheck() {
    const domain = healthDomain.value.trim().replace(/^https?:\/\//i, "").split("/")[0];
    if (!domain) { healthDomain.focus(); return; }

    healthResult.innerHTML = `<p class="dns-loading">Running health checks&#x2026;</p>`;
    healthBtn.disabled = true;

    try {
        // Run all checks in parallel
        const [aRes, aaaaRes, mxRes, nsRes, soaRes, txtRes, dnskeyRes, dmarcRes, caaRes] = await Promise.all([
            dohQuery(domain, "A").catch(() => ({})),
            dohQuery(domain, "AAAA").catch(() => ({})),
            dohQuery(domain, "MX").catch(() => ({})),
            dohQuery(domain, "NS").catch(() => ({})),
            dohQuery(domain, "SOA").catch(() => ({})),
            dohQuery(domain, "TXT").catch(() => ({})),
            dohQuery(domain, "DNSKEY").catch(() => ({})),
            dohQuery(`_dmarc.${domain}`, "TXT").catch(() => ({})),
            dohQuery(domain, "CAA").catch(() => ({})),
        ]);

        const a    = getAnswers(aRes, "A");
        const aaaa = getAnswers(aaaaRes, "AAAA");
        const mx   = getAnswers(mxRes, "MX");
        const ns   = getAnswers(nsRes, "NS");
        const soa  = getAnswers(soaRes, "SOA");
        const txt  = getAnswers(txtRes, "TXT");
        const dnskey = getAnswers(dnskeyRes, "DNSKEY");
        const dmarcTxt = getAnswers(dmarcRes, "TXT").filter(r => r.data.includes("v=DMARC1"));
        const caa  = getAnswers(caaRes, "CAA");

        // SPF = TXT starting with v=spf1
        const spf = txt.filter(r => r.data.startsWith("v=spf1") || r.data.includes('"v=spf1'));

        // DNSKEY check is done via presence
        const dnssec = dnskey.length > 0;

        function check(ok, label, detail) {
            const icon = ok ? "&#x2705;" : "&#x26A0;&#xFE0F;";
            const cls  = ok ? "health-ok" : "health-warn";
            return `<div class="health-row ${cls}">
                <span class="health-icon">${icon}</span>
                <div class="health-info">
                    <span class="health-label">${label}</span>
                    ${detail ? `<span class="health-detail">${detail}</span>` : ""}
                </div>
            </div>`;
        }

        const aIps    = a.map(r => r.data).join(", ") || "—";
        const aaaaIps = aaaa.map(r => r.data).join(", ") || "—";
        const mxHosts = mx.map(r => { const p = r.data.split(/\s+/); return (p[1]||r.data) + ` (${p[0]||""} priority)`; }).join("; ") || "—";
        const nsHosts = ns.map(r => r.data).join(", ") || "—";
        const soaVal  = soa[0]?.data || "—";
        const dmarcPolicy = dmarcTxt.length ? (parseDmarc(dmarcTxt[0].data).p || "none") : null;
        const spfRecord = spf[0]?.data || null;

        let html = `<div class="health-card">
            <div class="health-card-title">DNS Health: <strong>${escHtml(domain)}</strong></div>
            ${check(a.length > 0, "A record (IPv4)", `${a.length} record(s): ${aIps}`)}
            ${check(aaaa.length > 0, "AAAA record (IPv6)", aaaa.length > 0 ? `${aaaa.length} record(s): ${aaaaIps}` : "No IPv6 address configured")}
            ${check(ns.length > 0, "NS records", `Nameservers: ${nsHosts}`)}
            ${check(soa.length > 0, "SOA record", soaVal.length > 60 ? soaVal.slice(0,60)+"…" : soaVal)}
            ${check(mx.length > 0, "MX records (email delivery)", mx.length > 0 ? `${mx.length} mail server(s): ${mxHosts}` : "No MX records — domain cannot receive email")}
            ${check(spfRecord !== null, "SPF record (email authentication)", spfRecord ? escHtml(spfRecord.slice(0,80)) : "No SPF TXT record found")}
            ${check(dmarcPolicy !== null && dmarcPolicy !== "none", "DMARC record (email policy)",
                dmarcPolicy === null ? "No DMARC record found at _dmarc." + escHtml(domain) :
                dmarcPolicy === "none" ? "DMARC found but policy=none (monitoring only)" :
                `Policy: ${escHtml(dmarcPolicy)}`)}
            ${check(caa.length > 0, "CAA record (cert authority control)", caa.length > 0 ? caa.map(r=>r.data).join("; ") : "No CAA record — any CA can issue certificates")}
            ${check(dnssec, "DNSSEC", dnssec ? `${dnskey.length} DNSKEY record(s) found` : "No DNSKEY record — DNSSEC not configured")}
        </div>`;

        healthResult.innerHTML = html;
    } catch(e) {
        healthResult.innerHTML = renderError(e.message);
    } finally {
        healthBtn.disabled = false;
    }
}

healthBtn.addEventListener("click", doHealthCheck);
healthDomain.addEventListener("keydown", e => { if (e.key === "Enter") doHealthCheck(); });

// ════════════════════════════════════════════════════════════════════════════
// TAB — SPF
// ════════════════════════════════════════════════════════════════════════════
const spfDomain = document.getElementById("spfDomain");
const spfBtn    = document.getElementById("spfBtn");
const spfResult = document.getElementById("spfResult");

// Known SPF mechanism prefixes and their meanings
const SPF_MECH_DESC = {
    "all":      { label: "all",      desc: "Matches any sender (catch-all)" },
    "a":        { label: "A",        desc: "IP must match the domain's A/AAAA records" },
    "mx":       { label: "MX",       desc: "IP must match the domain's MX servers" },
    "include":  { label: "include",  desc: "Delegate to another domain's SPF record" },
    "ip4":      { label: "ip4",      desc: "Explicit IPv4 address or CIDR block" },
    "ip6":      { label: "ip6",      desc: "Explicit IPv6 address or CIDR block" },
    "exists":   { label: "exists",   desc: "DNS lookup must return a result" },
    "redirect": { label: "redirect", desc: "Use another domain's SPF record entirely" },
    "exp":      { label: "exp",      desc: "Explanation TXT record URL" },
    "ptr":      { label: "ptr",      desc: "Reverse DNS must match (discouraged)" },
};

const SPF_QUALIFIERS = { "+": "pass", "-": "fail", "~": "softfail", "?": "neutral" };

function parseSpf(raw) {
    const cleaned = raw.replace(/^"|"$/g, "");
    const parts   = cleaned.trim().split(/\s+/);
    const version = parts[0];
    const mechanisms = [];

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        let qualifier = "+";
        let rest = part;

        if (["+", "-", "~", "?"].includes(part[0])) {
            qualifier = part[0];
            rest = part.slice(1);
        }

        const colonIdx = rest.indexOf("=");
        const slashIdx = rest.indexOf(":");
        let mech, value;

        if (slashIdx !== -1 && (colonIdx === -1 || slashIdx < colonIdx)) {
            mech  = rest.slice(0, slashIdx).toLowerCase();
            value = rest.slice(slashIdx + 1);
        } else if (colonIdx !== -1) {
            mech  = rest.slice(0, colonIdx).toLowerCase();
            value = rest.slice(colonIdx + 1);
        } else {
            mech  = rest.toLowerCase();
            value = null;
        }

        const info = SPF_MECH_DESC[mech] || { label: mech, desc: "Unknown mechanism" };
        mechanisms.push({ qualifier, mech, value, label: info.label, desc: info.desc });
    }

    return { version, mechanisms };
}

async function doSpfCheck() {
    const domain = spfDomain.value.trim().replace(/^https?:\/\//i, "").split("/")[0];
    if (!domain) { spfDomain.focus(); return; }

    loading(spfResult);
    spfBtn.disabled = true;

    try {
        const data    = await dohQuery(domain, "TXT");
        const records = getAnswers(data, "TXT");
        const spfRec  = records.find(r => {
            const d = r.data.replace(/^"|"$/g, "");
            return d.startsWith("v=spf1");
        });

        if (!spfRec) {
            spfResult.innerHTML = `<div class="dns-warn-box">No SPF record found for <strong>${escHtml(domain)}</strong>.<br>
                Without an SPF record, email senders are not authenticated and spam filters may reject or flag messages.</div>`;
            return;
        }

        const raw = spfRec.data.replace(/^"|"$/g, "");
        const { mechanisms } = parseSpf(raw);

        // Determine overall verdict from "all" qualifier
        const allMech = mechanisms.find(m => m.mech === "all");
        const allQ    = allMech ? allMech.qualifier : null;
        const verdictMap = { "-": { cls: "dns-badge-ok",   text: "Strict (fail)" },
                             "~": { cls: "dns-badge-warn",  text: "Soft fail" },
                             "?": { cls: "dns-badge-warn",  text: "Neutral" },
                             "+": { cls: "dns-badge-info",  text: "Pass all (insecure)" } };
        const verdict = allQ ? verdictMap[allQ] : { cls: "dns-badge-info", text: "No all" };

        const qLabel = q => `<span class="spf-qualifier spf-q-${q}">${q} (${SPF_QUALIFIERS[q] || q})</span>`;

        const rows = mechanisms.map(m => {
            const valCell = m.value ? `<code>${escHtml(m.value)}</code>` : "—";
            return `<tr>
                <td>${qLabel(m.qualifier)}</td>
                <td><strong>${escHtml(m.label)}</strong></td>
                <td>${valCell}</td>
                <td class="spf-desc">${escHtml(m.desc)}</td>
            </tr>`;
        }).join("");

        spfResult.innerHTML = `
            <div class="dns-kv-box">
                <div class="dns-kv-header">
                    SPF Record &nbsp;<span class="dns-badge ${verdict.cls}">${verdict.text}</span>
                </div>
                <div class="dns-raw-record">${escHtml(raw)}</div>
                <table class="spf-table">
                    <thead><tr><th>Qualifier</th><th>Mechanism</th><th>Value</th><th>Meaning</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch(e) {
        spfResult.innerHTML = renderError(e.message);
    } finally {
        spfBtn.disabled = false;
    }
}

spfBtn.addEventListener("click", doSpfCheck);
spfDomain.addEventListener("keydown", e => { if (e.key === "Enter") doSpfCheck(); });

// ════════════════════════════════════════════════════════════════════════════
// TAB — DKIM (full checker)
// ════════════════════════════════════════════════════════════════════════════
const dkimDomainFull   = document.getElementById("dkimDomainFull");
const dkimSelectorFull = document.getElementById("dkimSelectorFull");
const dkimFullBtn      = document.getElementById("dkimFullBtn");
const dkimResultEl     = document.getElementById("dkimResult");

function parseDkimTxt(raw) {
    // DKIM TXT: v=DKIM1; k=rsa; p=MIGfMA0...
    const cleaned = raw.replace(/^"|"$/g, "");
    const tags = {};
    cleaned.split(/\s*;\s*/).forEach(part => {
        const eq = part.indexOf("=");
        if (eq > 0) {
            tags[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
        }
    });
    return tags;
}

const DKIM_TAG_LABELS = {
    v: "Version",
    k: "Key Type",
    p: "Public Key (Base64)",
    h: "Hash Algorithms",
    s: "Service Type",
    t: "Flags",
    n: "Notes",
};

async function doDkimCheck() {
    const domain   = dkimDomainFull.value.trim().replace(/^https?:\/\//i, "").split("/")[0];
    const selector = dkimSelectorFull.value.trim() || "default";
    if (!domain) { dkimDomainFull.focus(); return; }

    loading(dkimResultEl);
    dkimFullBtn.disabled = true;

    try {
        const dkimName = `${selector}._domainkey.${domain}`;
        const data     = await dohQuery(dkimName, "TXT");
        const records  = getAnswers(data, "TXT");
        const dkimRec  = records.find(r => r.data.includes("v=DKIM1") || r.data.includes("k="));

        if (!dkimRec) {
            dkimResultEl.innerHTML = `<div class="dns-warn-box">
                No DKIM record found at <code>${escHtml(dkimName)}</code>.<br>
                Check that the selector is correct. Common selectors: <code>default</code>, <code>google</code>, <code>s1</code>, <code>k1</code>, <code>mail</code>.
            </div>`;
            return;
        }

        const tags = parseDkimTxt(dkimRec.data);
        const keyType = tags.k || "rsa";

        // Truncate long public key for display
        const pubKey = tags.p || "";
        const pubKeyDisplay = pubKey.length > 64
            ? pubKey.slice(0, 64) + "…  (" + pubKey.length + " chars)"
            : pubKey || "(empty — key revoked)";

        const keyRevoked = !pubKey;

        let rows = Object.entries(DKIM_TAG_LABELS)
            .filter(([k]) => tags[k] !== undefined)
            .map(([k, label]) => {
                let val = escHtml(tags[k]);
                if (k === "p") val = `<code style="word-break:break-all;font-size:0.78rem">${escHtml(pubKeyDisplay)}</code>`;
                if (k === "t" && tags[k].includes("y")) val += ' <span class="dns-badge dns-badge-warn">Testing Mode</span>';
                if (k === "t" && tags[k].includes("s")) val += ' <span class="dns-badge dns-badge-info">Strict</span>';
                return `<tr><td class="dns-kv-key">${label}</td><td>${val}</td></tr>`;
            }).join("");

        const statusBadge = keyRevoked
            ? `<span class="dns-badge dns-badge-warn">Key Revoked</span>`
            : `<span class="dns-badge dns-badge-ok">Key Present (${escHtml(keyType.toUpperCase())})</span>`;

        dkimResultEl.innerHTML = `
            <div class="dns-kv-box">
                <div class="dns-kv-header">
                    DKIM Record — <code>${escHtml(dkimName)}</code> &nbsp;${statusBadge}
                </div>
                <div class="dns-raw-record">${escHtml(dkimRec.data.slice(0, 200))}${dkimRec.data.length > 200 ? "…" : ""}</div>
                <table class="dns-kv-table"><tbody>${rows}</tbody></table>
            </div>
            ${keyRevoked ? `<div class="dns-warn-box" style="margin-top:0.75rem">⚠️ Empty public key (<code>p=</code>) means this DKIM key has been revoked. Emails signed with this selector will fail DKIM validation.</div>` : ""}`;
    } catch(e) {
        dkimResultEl.innerHTML = renderError(e.message);
    } finally {
        dkimFullBtn.disabled = false;
    }
}

dkimFullBtn.addEventListener("click", doDkimCheck);
dkimDomainFull.addEventListener("keydown", e => { if (e.key === "Enter") doDkimCheck(); });
dkimSelectorFull.addEventListener("keydown", e => { if (e.key === "Enter") doDkimCheck(); });
