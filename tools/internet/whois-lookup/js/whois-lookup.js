/* whois-lookup.js
   IP WHOIS, IPv6 WHOIS, ASN WHOIS, and Domain WHOIS via RDAP.
   RDAP is the modern replacement for WHOIS — JSON-based, CORS-enabled.
   Domains are resolved to IPs first via DNS-over-HTTPS, then IP WHOIS is run.

   External API endpoints (all free, no key, CORS-enabled):
     - https://rdap.arin.net/registry/ip/{ip}         (ARIN — covers ARIN space)
     - https://rdap.db.ripe.net/ip/{ip}               (RIPE — Europe/Middle East)
     - https://rdap.apnic.net/ip/{ip}                 (APNIC — Asia-Pacific)
     - https://rdap.lacnic.net/rdap/ip/{ip}           (LACNIC — Latin America)
     - https://rdap.afrinic.net/rdap/ip/{ip}          (AFRINIC — Africa)
     - https://rdap.arin.net/registry/autnum/{asn}    (ASN lookup)
     Fallback bootstrap via IANA RDAP bootstrap:
     - https://data.iana.org/rdap/ipv4.json
     - https://data.iana.org/rdap/ipv6.json
     - https://data.iana.org/rdap/asn.json
     Domain name resolution:
     - https://cloudflare-dns.com/dns-query           (Cloudflare DoH, A/AAAA)
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const RDAP_BOOTSTRAP_IP4 = "https://data.iana.org/rdap/ipv4.json";
const RDAP_BOOTSTRAP_IP6 = "https://data.iana.org/rdap/ipv6.json";
const RDAP_BOOTSTRAP_ASN = "https://data.iana.org/rdap/asn.json";

// Authoritative RDAP bases per RIR
const RIR_BASES = {
    arin:    "https://rdap.arin.net/registry",
    ripe:    "https://rdap.db.ripe.net",
    apnic:   "https://rdap.apnic.net",
    lacnic:  "https://rdap.lacnic.net/rdap",
    afrinic: "https://rdap.afrinic.net/rdap",
};

// ── DOM ─────────────────────────────────────────────────────────────────────
const whoisInput  = document.getElementById("whoisInput");
const whoisBtn    = document.getElementById("whoisBtn");
const whoisResult = document.getElementById("whoisResult");

// ── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function loading(msg) {
    whoisResult.innerHTML = `<p class="whois-loading">${msg || "Looking up WHOIS data&#x2026;"}</p>`;
}

function showError(msg) {
    whoisResult.innerHTML = `<div class="whois-error">${esc(msg)}</div>`;
}

function isIPv4(s) { return /^(\d{1,3}\.){3}\d{1,3}$/.test(s); }
function isIPv6(s) { return s.includes(":") && !s.includes("://"); }
function isASN(s)  { return /^(AS)?\d+$/i.test(s.trim()); }

// Looks like a domain (not IP, not ASN)
function isDomain(s) {
    return !isIPv4(s) && !isIPv6(s) && !isASN(s) && /^[a-zA-Z0-9][a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}$/.test(s);
}

// ── Resolve domain → IP via Cloudflare DoH ───────────────────────────────────
const DOH_FOR_DOMAIN = "https://cloudflare-dns.com/dns-query";

async function resolveToIP(domain) {
    // Try A first, then AAAA
    const resp = await fetch(
        `${DOH_FOR_DOMAIN}?name=${encodeURIComponent(domain)}&type=A`,
        { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) throw new Error(`DoH HTTP ${resp.status}`);
    const data = await resp.json();
    const aRecs = (data.Answer || []).filter(r => r.type === 1).map(r => r.data);
    if (aRecs.length > 0) return { ip: aRecs[0], allIPs: aRecs, domain };

    // Try IPv6 if no A records
    const resp6 = await fetch(
        `${DOH_FOR_DOMAIN}?name=${encodeURIComponent(domain)}&type=AAAA`,
        { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }
    );
    if (!resp6.ok) throw new Error(`DoH HTTP ${resp6.status}`);
    const data6 = await resp6.json();
    const aaaaRecs = (data6.Answer || []).filter(r => r.type === 28).map(r => r.data);
    if (aaaaRecs.length > 0) return { ip: aaaaRecs[0], allIPs: aaaaRecs, domain };

    if (data.Status === 3) throw new Error(`NXDOMAIN — domain "${domain}" does not exist.`);
    throw new Error(`Could not resolve "${domain}" to an IP address.`);
}

// ── RDAP fetch with timeout ───────────────────────────────────────────────────
async function rdapFetch(url) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
    return resp.json();
}

// ── Bootstrap lookup (IANA RDAP bootstrap to find correct RIR) ───────────────
async function getBootstrapUrl(type, query) {
    const bootstrapUrl = type === "asn" ? RDAP_BOOTSTRAP_ASN
        : type === "ipv6" ? RDAP_BOOTSTRAP_IP6
        : RDAP_BOOTSTRAP_IP4;

    try {
        const bootstrap = await rdapFetch(bootstrapUrl);
        const num = type === "asn" ? parseInt(query.replace(/^AS/i, ""), 10) : null;
        const ip  = type !== "asn" ? query : null;

        for (const service of bootstrap.services || []) {
            const [ranges, urls] = service;
            const base = urls[0];

            if (type === "asn" && num !== null) {
                for (const r of ranges) {
                    const [lo, hi] = r.split("-").map(Number);
                    if (num >= lo && num <= hi) return `${base}autnum/${num}`;
                }
            } else if (ip) {
                // Simple CIDR prefix match
                for (const r of ranges) {
                    const [pfx, bits] = r.split("/");
                    if (ipMatchesCidr(ip, pfx, parseInt(bits, 10))) {
                        const path = type === "ipv6" ? `ip/${encodeURIComponent(ip)}` : `ip/${ip}`;
                        return `${base}${path}`;
                    }
                }
            }
        }
    } catch(_) {}
    return null;
}

function ipMatchesCidr(ip, prefix, bits) {
    try {
        if (ip.includes(":")) return false; // IPv6 handled separately below
        const ipInt = ip.split(".").reduce((a, b) => (a << 8) | parseInt(b, 10), 0) >>> 0;
        const pfxInt = prefix.split(".").reduce((a, b) => (a << 8) | parseInt(b, 10), 0) >>> 0;
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (ipInt & mask) === (pfxInt & mask);
    } catch(_) { return false; }
}

// ── RDAP data renderers ───────────────────────────────────────────────────────
function renderKV(rows) {
    const trs = rows.filter(([,v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `<tr><td class="wh-key">${esc(k)}</td><td class="wh-val">${esc(v)}</td></tr>`)
        .join("");
    return `<table class="wh-table"><tbody>${trs}</tbody></table>`;
}

function extractVcardName(vcard) {
    // vcard is an array like [["fn",{},"text","Value"],...]
    if (!Array.isArray(vcard)) return null;
    for (const entry of vcard) {
        if (Array.isArray(entry) && (entry[0] === "fn" || entry[0] === "org")) {
            return entry[3] || null;
        }
    }
    return null;
}

function extractEmails(vcard) {
    const emails = [];
    if (!Array.isArray(vcard)) return emails;
    for (const entry of vcard) {
        if (Array.isArray(entry) && entry[0] === "email" && entry[3]) {
            emails.push(entry[3]);
        }
    }
    return emails;
}

function getEntityInfo(entities) {
    if (!entities) return [];
    return entities.map(e => {
        const name  = extractVcardName(e.vcardArray?.[1]) || e.handle || "";
        const roles = (e.roles || []).join(", ");
        const emails = extractEmails(e.vcardArray?.[1]).join(", ");
        return { name, roles, emails };
    });
}

function renderEntities(entities) {
    if (!entities || entities.length === 0) return "";
    const rows = entities.map(e => {
        const parts = [];
        if (e.name)   parts.push(`<strong>${esc(e.name)}</strong>`);
        if (e.roles)  parts.push(`<em>${esc(e.roles)}</em>`);
        if (e.emails) parts.push(esc(e.emails));
        return `<li>${parts.join(" — ")}</li>`;
    }).join("");
    return `<div class="wh-entities"><strong>Contacts:</strong><ul>${rows}</ul></div>`;
}

function renderRemarks(remarks) {
    if (!remarks || remarks.length === 0) return "";
    const lines = remarks.flatMap(r =>
        (r.description || []).map(d => `<p>${esc(d)}</p>`)
    );
    return lines.length ? `<div class="wh-remarks">${lines.join("")}</div>` : "";
}

// ── IP / IPv6 WHOIS ───────────────────────────────────────────────────────────
async function lookupIP(ip, ctx) {
    // ctx = optional { resolvedFrom: domain, allIPs: [ip,...] }
    if (!ctx) loading();

    // Try bootstrap first, then fallback to ARIN
    const type = ip.includes(":") ? "ipv6" : "ipv4";
    let url = await getBootstrapUrl(type, ip);
    if (!url) {
        url = `${RIR_BASES.arin}/ip/${encodeURIComponent(ip)}`;
    }

    try {
        const d = await rdapFetch(url);

        const entities = getEntityInfo(d.entities);

        const network = d.name || "";
        const handle  = d.handle || "";
        const type_   = d.type || "";
        const country = d.country || "";
        const startIp = d.startAddress || "";
        const endIp   = d.endAddress   || "";
        const cidr    = (d.cidr0_cidrs || []).map(c => c.v4prefix || c.v6prefix).filter(Boolean).join(", ")
                     || (d.ipAddresses?.v4?.[0] || d.ipAddresses?.v6?.[0] || "");
        const parent  = d.parentHandle || "";
        const updated = d.events?.find(e => e.eventAction === "last changed")?.eventDate?.slice(0,10) || "";
        const rdapUrl = d.links?.find(l => l.type === "application/rdap+json")?.href || url;

        const domainBanner = ctx?.resolvedFrom
            ? `<div class="wh-domain-banner">
                   <strong>Domain:</strong> ${esc(ctx.resolvedFrom)}
                   &nbsp;&nbsp;<span class="wh-domain-ips">Resolved IPs: ${esc(ctx.allIPs.join(", "))}</span>
               </div>`
            : "";

        whoisResult.innerHTML = `
            <div class="wh-card">
                ${domainBanner}
                <div class="wh-card-header">
                    <span class="wh-ip-big">${esc(ip)}</span>
                    <a class="wh-rdap-link" href="${esc(rdapUrl)}" target="_blank" rel="noopener">RDAP source &#x2197;</a>
                </div>
                ${renderKV([
                    ["Network Name", network],
                    ["Handle",       handle],
                    ["Type",         type_],
                    ["Country",      country],
                    ["Start IP",     startIp],
                    ["End IP",       endIp],
                    ["CIDR",         cidr],
                    ["Parent",       parent],
                    ["Last Updated", updated],
                ])}
                ${renderEntities(entities)}
                ${renderRemarks(d.remarks)}
            </div>`;
    } catch(e) {
        showError(`WHOIS lookup failed: ${e.message}`);
    }
}

// ── ASN WHOIS ─────────────────────────────────────────────────────────────────
async function lookupASN(input) {
    loading();
    const asn = parseInt(input.replace(/^AS/i, ""), 10);
    if (isNaN(asn)) { showError("Invalid ASN."); return; }

    let url = await getBootstrapUrl("asn", `AS${asn}`);
    if (!url) url = `${RIR_BASES.arin}/autnum/${asn}`;

    try {
        const d = await rdapFetch(url);
        const entities = getEntityInfo(d.entities);
        const updated = d.events?.find(e => e.eventAction === "last changed")?.eventDate?.slice(0,10) || "";
        const rdapUrl = d.links?.find(l => l.type === "application/rdap+json")?.href || url;

        whoisResult.innerHTML = `
            <div class="wh-card">
                <div class="wh-card-header">
                    <span class="wh-ip-big">AS${asn}</span>
                    <a class="wh-rdap-link" href="${esc(rdapUrl)}" target="_blank" rel="noopener">RDAP source &#x2197;</a>
                </div>
                ${renderKV([
                    ["Name",         d.name || ""],
                    ["Handle",       d.handle || ""],
                    ["Start AS",     d.startAutnum ?? ""],
                    ["End AS",       d.endAutnum ?? ""],
                    ["Country",      d.country || ""],
                    ["Last Updated", updated],
                ])}
                ${renderEntities(entities)}
                ${renderRemarks(d.remarks)}
            </div>`;
    } catch(e) {
        showError(`ASN lookup failed: ${e.message}`);
    }
}

// ── Main dispatch ─────────────────────────────────────────────────────────────
async function doLookup() {
    let raw = whoisInput.value.trim();
    // Strip scheme/path if user pasted a URL
    raw = raw.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0].trim();
    if (!raw) { whoisInput.focus(); return; }

    whoisBtn.disabled = true;
    try {
        if (isASN(raw)) {
            await lookupASN(raw);
        } else if (isIPv4(raw) || isIPv6(raw)) {
            await lookupIP(raw);
        } else if (isDomain(raw)) {
            // Resolve domain → IP, then do IP WHOIS
            loading(`Resolving domain &#x201C;${esc(raw)}&#x201D;&#x2026;`);
            let resolved;
            try {
                resolved = await resolveToIP(raw);
            } catch(e) {
                showError(`Could not resolve domain: ${e.message}`);
                return;
            }

            // Show all resolved IPs as a notice, then WHOIS the first one
            const ipList = resolved.allIPs.join(", ");
            loading(`Resolved to ${esc(ipList)} &#x2014; looking up WHOIS&#x2026;`);

            await lookupIP(resolved.ip, { resolvedFrom: raw, allIPs: resolved.allIPs });
        } else {
            showError("Please enter a domain name, IPv4/IPv6 address, or ASN (e.g. AS15169).");
        }
    } finally {
        whoisBtn.disabled = false;
    }
}

whoisBtn.addEventListener("click", doLookup);
whoisInput.addEventListener("keydown", e => { if (e.key === "Enter") doLookup(); });
