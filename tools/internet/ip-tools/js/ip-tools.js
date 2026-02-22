/* ip-tools.js — pure JS, no external APIs */

"use strict";

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".ttab").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".ttab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tool-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("panel-" + btn.dataset.tool).classList.add("active");
    });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove("hidden");
}
function clearError(id) {
    document.getElementById(id).classList.add("hidden");
}
function showBlock(id) { document.getElementById(id).classList.remove("hidden"); }
function hideBlock(id) { document.getElementById(id).classList.add("hidden"); }

function isValidIPv4(ip) {
    const parts = ip.split(".");
    return parts.length === 4 && parts.every(p => /^\d+$/.test(p) && +p >= 0 && +p <= 255);
}

function ipv4ToInt(ip) {
    return ip.split(".").reduce((acc, o) => (acc * 256 + parseInt(o, 10)), 0) >>> 0;
}
function intToIPv4(n) {
    return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join(".");
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel 1: IP ↔ Decimal
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById("ipDecConv").addEventListener("click", () => {
    clearError("ipDecError");
    const ipv4Val = document.getElementById("ipv4Dec").value.trim();
    const decVal  = document.getElementById("decIp").value.trim();

    let ipInt;

    if (ipv4Val) {
        if (!isValidIPv4(ipv4Val)) { showError("ipDecError", "Invalid IPv4 address."); return; }
        ipInt = ipv4ToInt(ipv4Val);
        document.getElementById("decIp").value = ipInt;
    } else if (decVal) {
        const n = parseInt(decVal, 10);
        if (isNaN(n) || n < 0 || n > 4294967295) { showError("ipDecError", "Decimal must be 0 – 4294967295."); return; }
        ipInt = n >>> 0;
        document.getElementById("ipv4Dec").value = intToIPv4(ipInt);
    } else {
        showError("ipDecError", "Enter an IPv4 address or a decimal value.");
        return;
    }

    // Binary and hex are always derived from ipInt
    const bin = [(ipInt>>>24)&255,(ipInt>>>16)&255,(ipInt>>>8)&255,ipInt&255]
        .map(b => b.toString(2).padStart(8,"0")).join(".");
    const hex = ipInt.toString(16).toUpperCase().padStart(8,"0");

    document.getElementById("binIp").value = bin;
    document.getElementById("hexIp").value = hex;
});

document.getElementById("ipDecClear").addEventListener("click", () => {
    ["ipv4Dec","decIp","binIp","hexIp"].forEach(id => { document.getElementById(id).value = ""; });
    clearError("ipDecError");
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel 2: IPv4 ↔ IPv6
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById("v4v6Conv").addEventListener("click", () => {
    clearError("v4v6Error");
    const v4in = document.getElementById("v4in").value.trim();
    const v6in = document.getElementById("v6in").value.trim();

    if (v4in) {
        if (!isValidIPv4(v4in)) { showError("v4v6Error", "Invalid IPv4 address."); return; }
        const parts = v4in.split(".").map(Number);
        const hex1 = ((parts[0]<<8)|parts[1]).toString(16).padStart(4,"0");
        const hex2 = ((parts[2]<<8)|parts[3]).toString(16).padStart(4,"0");
        document.getElementById("v6mapped").value = `::ffff:${hex1}:${hex2}`;
    }

    if (v6in) {
        // Try to extract IPv4 from IPv4-mapped or IPv4-compatible
        const mapped = v6in.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
        if (mapped) { document.getElementById("v4out").value = mapped[1]; return; }

        const hexMapped = v6in.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
        if (hexMapped) {
            const a = parseInt(hexMapped[1], 16);
            const b = parseInt(hexMapped[2], 16);
            document.getElementById("v4out").value = `${a>>8}.${a&255}.${b>>8}.${b&255}`;
            return;
        }
        showError("v4v6Error", "Not an IPv4-mapped or IPv4-compatible IPv6 address.");
    }
});

document.getElementById("v4v6Clear").addEventListener("click", () => {
    ["v4in","v6mapped","v6in","v4out"].forEach(id => { document.getElementById(id).value = ""; });
    clearError("v4v6Error");
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel 3: IPv6 Compress / Expand
// ─────────────────────────────────────────────────────────────────────────────

// Expand an IPv6 address to 8 full 16-bit groups
function expandIPv6(addr) {
    if (addr.includes("::")) {
        const sides = addr.split("::");
        const left  = sides[0] ? sides[0].split(":") : [];
        const right = sides[1] ? sides[1].split(":") : [];
        const missing = 8 - left.length - right.length;
        const full = [...left, ...Array(missing).fill("0"), ...right];
        return full.map(g => g.padStart(4, "0")).join(":");
    }
    return addr.split(":").map(g => g.padStart(4, "0")).join(":");
}

// Compress: remove leading zeros and apply :: to longest run of all-zero groups
function compressIPv6(full) {
    const groups = full.split(":").map(g => g.replace(/^0+/, "") || "0");

    // Find longest run of "0" groups
    let best = { start: -1, len: 0 };
    let cur  = { start: -1, len: 0 };
    groups.forEach((g, i) => {
        if (g === "0") {
            if (cur.start === -1) { cur.start = i; cur.len = 1; }
            else cur.len++;
            if (cur.len > best.len) best = { ...cur };
        } else {
            cur = { start: -1, len: 0 };
        }
    });

    if (best.len < 2) return groups.join(":");

    const left  = groups.slice(0, best.start);
    const right = groups.slice(best.start + best.len);
    return (left.join(":") || "") + "::" + (right.join(":") || "");
}

function isValidIPv6(addr) {
    // Basic validation: after expand, should have 8 groups of 1-4 hex chars
    try {
        const exp = expandIPv6(addr.toLowerCase());
        const groups = exp.split(":");
        return groups.length === 8 && groups.every(g => /^[0-9a-f]{4}$/.test(g));
    } catch {
        return false;
    }
}

document.getElementById("v6CompBtn").addEventListener("click", () => {
    clearError("v6CompError");
    hideBlock("v6CompResult");
    const raw = document.getElementById("v6raw").value.trim().toLowerCase();
    if (!raw) { showError("v6CompError", "Enter an IPv6 address."); return; }

    if (!isValidIPv6(raw)) { showError("v6CompError", "Invalid IPv6 address."); return; }

    const expanded   = expandIPv6(raw);
    const compressed = compressIPv6(expanded);
    // Full with no compression: just expanded with leading zeros kept
    const full = expanded;

    document.getElementById("v6Compressed").textContent = compressed;
    document.getElementById("v6Expanded").textContent   = expanded;
    document.getElementById("v6Full").textContent       = full;
    showBlock("v6CompResult");
});

document.getElementById("v6CompClear").addEventListener("click", () => {
    document.getElementById("v6raw").value = "";
    clearError("v6CompError");
    hideBlock("v6CompResult");
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel 4: IPv6 CIDR ↔ Range
// BigInt is used because IPv6 addresses are 128-bit
// ─────────────────────────────────────────────────────────────────────────────

function ipv6ToBigInt(addr) {
    const exp = expandIPv6(addr.toLowerCase());
    return exp.split(":").reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n);
}

function bigIntToIPv6(n) {
    const groups = [];
    for (let i = 0; i < 8; i++) {
        groups.unshift((n & 0xffffn).toString(16).padStart(4, "0"));
        n >>= 16n;
    }
    return compressIPv6(groups.join(":"));
}

// Range → CIDR (greedy algorithm)
function rangeToCidrs(first, last) {
    const cidrs = [];
    let cur = first;
    while (cur <= last) {
        let maxSize = 128n;
        while (maxSize > 0n) {
            const mask = (~0n << (128n - maxSize + 1n)) & ((1n << 128n) - 1n);
            if ((cur & mask) !== cur) break;
            if (cur + (1n << (128n - maxSize + 1n)) - 1n > last) break;
            maxSize--;
        }
        maxSize++;
        cidrs.push(`${bigIntToIPv6(cur)}/${maxSize}`);
        cur += 1n << (128n - maxSize);
    }
    return cidrs;
}

document.getElementById("cidrToRange").addEventListener("click", () => {
    clearError("cidrRangeError");
    hideBlock("cidrRangeResult");
    const raw = document.getElementById("cidrIn").value.trim();
    if (!raw.includes("/")) { showError("cidrRangeError", "Enter IPv6 CIDR (e.g. 2001:db8::/32)."); return; }

    try {
        const [addr, prefixStr] = raw.split("/");
        const prefix = parseInt(prefixStr, 10);
        if (isNaN(prefix) || prefix < 0 || prefix > 128) throw new Error("Prefix must be 0–128.");
        if (!isValidIPv6(addr)) throw new Error("Invalid IPv6 address.");

        const addrInt  = ipv6ToBigInt(addr);
        const mask     = prefix === 0 ? 0n : (~0n << BigInt(128 - prefix)) & ((1n << 128n) - 1n);
        const first    = addrInt & mask;
        const last     = first | (~mask & ((1n << 128n) - 1n));
        const total    = last - first + 1n;

        document.getElementById("cidrFirst").textContent = bigIntToIPv6(first);
        document.getElementById("cidrLast").textContent  = bigIntToIPv6(last);
        document.getElementById("cidrTotal").textContent = total.toLocaleString();
        showBlock("cidrRangeResult");
    } catch (e) {
        showError("cidrRangeError", e.message);
    }
});

document.getElementById("rangeToCidr").addEventListener("click", () => {
    clearError("rangeCidrError");
    hideBlock("rangeCidrResult");
    const f = document.getElementById("rangeFirst").value.trim();
    const l = document.getElementById("rangeLast").value.trim();

    try {
        if (!isValidIPv6(f)) throw new Error("Invalid first IPv6 address.");
        if (!isValidIPv6(l)) throw new Error("Invalid last IPv6 address.");

        const first = ipv6ToBigInt(f);
        const last  = ipv6ToBigInt(l);
        if (first > last) throw new Error("First address must be \u2264 last address.");

        const cidrs = rangeToCidrs(first, last);
        document.getElementById("rangeCidrList").innerHTML = cidrs.map(c => `<div>${c}</div>`).join("");
        showBlock("rangeCidrResult");
    } catch (e) {
        showError("rangeCidrError", e.message);
    }
});

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Panel 5: IPv6 Compatibility Checker
// Uses DNS-over-HTTPS to check for AAAA records
// External API: Cloudflare DoH https://cloudflare-dns.com/dns-query
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const DOH_V6COMPAT = "https://cloudflare-dns.com/dns-query";

document.getElementById("v6compatBtn").addEventListener("click", async () => {
    clearError("v6compatError");
    hideBlock("v6compatResult");
    const domain = document.getElementById("v6compatDomain").value.trim().replace(/^https?:\/\//i,"").split("/")[0];
    if (!domain) { showError("v6compatError", "Enter a domain name."); return; }

    const btn = document.getElementById("v6compatBtn");
    btn.disabled = true;
    btn.textContent = "Checking\u2026";
    try {
        // Query both A and AAAA in parallel
        const [aResp, aaaaResp] = await Promise.all([
            fetch(`${DOH_V6COMPAT}?name=${encodeURIComponent(domain)}&type=A`,
                { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }).then(r => r.json()),
            fetch(`${DOH_V6COMPAT}?name=${encodeURIComponent(domain)}&type=AAAA`,
                { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) }).then(r => r.json()),
        ]);

        const aRecords    = (aResp.Answer    || []).filter(r => r.type === 1).map(r => r.data);
        const aaaaRecords = (aaaaResp.Answer || []).filter(r => r.type === 28).map(r => r.data);
        const ipv6Support = aaaaRecords.length > 0;

        const icon = ipv6Support ? "\u2705" : "\u274c";
        const statusText = ipv6Support
            ? `<strong style="color:#155724">${icon} IPv6 supported</strong> \u2014 ${aaaaRecords.length} AAAA record(s) found`
            : `<strong style="color:#721c24">${icon} No IPv6 support</strong> \u2014 no AAAA records found`;

        const aHtml = aRecords.length
            ? aRecords.map(ip => `<div class="result-field-row"><span class="rf-key">A</span><span class="rf-val mono">${ip}</span></div>`).join("")
            : '<div class="result-field-row"><span class="rf-key">A</span><span class="rf-val" style="color:var(--color-text-muted)">No A records</span></div>';

        const aaaaHtml = aaaaRecords.length
            ? aaaaRecords.map(ip => `<div class="result-field-row"><span class="rf-key">AAAA</span><span class="rf-val mono">${ip}</span></div>`).join("")
            : '<div class="result-field-row"><span class="rf-key">AAAA</span><span class="rf-val" style="color:var(--color-text-muted)">No AAAA records</span></div>';

        document.getElementById("v6compatResult").innerHTML = `
            <div style="margin-bottom:0.6rem;font-size:0.95rem">${statusText}</div>
            ${aHtml}${aaaaHtml}`;
        showBlock("v6compatResult");
    } catch(e) {
        showError("v6compatError", "Lookup failed: " + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Check IPv6 Support";
    }
});

document.getElementById("v6compatClear").addEventListener("click", () => {
    document.getElementById("v6compatDomain").value = "";
    clearError("v6compatError");
    hideBlock("v6compatResult");
});

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Panel 6: Local IPv6 Generator (ULA / Link-Local) — RFC 4193
// Pure JS, no external APIs
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function randHex(bytes) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2,"0")).join("");
}

function formatIPv6Groups(groups) {
    return compressIPv6(groups.join(":"));
}

document.getElementById("v6genBtn").addEventListener("click", () => {
    clearError("v6genError");
    hideBlock("v6genResult");
    const type   = document.getElementById("v6genType").value;
    const subnet = document.getElementById("v6genSubnet").value.trim();

    try {
        if (type === "link") {
            // fe80::/10 — interface identifier is 64-bit random (EUI-64 style but fully random)
            const iid = randHex(8);
            // fe80:: + 48 bits zero + 64 bit IID
            const full = `fe80:0000:0000:0000:${iid.slice(0,4)}:${iid.slice(4,8)}:${iid.slice(8,12)}:${iid.slice(12,16)}`;
            const compressed = compressIPv6(full);
            document.getElementById("v6genResult").innerHTML = `
                <div class="result-field-row"><span class="rf-key">Link-Local</span><span class="rf-val mono">${compressed}</span></div>
                <div class="result-field-row"><span class="rf-key">Expanded</span><span class="rf-val mono">${full.toUpperCase()}</span></div>
                <div class="result-field-row"><span class="rf-key">Prefix</span><span class="rf-val mono">fe80::/10</span></div>`;
        } else {
            // ULA: fd00::/8 — fc + 40-bit global ID + 16-bit subnet + 64-bit interface ID
            const globalId = randHex(5); // 40-bit
            let subnetId;
            if (subnet) {
                const s = parseInt(subnet, 16);
                if (isNaN(s) || s < 0 || s > 0xffff) throw new Error("Subnet ID must be hex 0\u2013FFFF.");
                subnetId = s.toString(16).padStart(4, "0");
            } else {
                subnetId = randHex(2);
            }
            const iid = randHex(8);
            // fd + globalId (5B) = first 6B of first 2 groups
            const g1 = "fd" + globalId.slice(0,2);
            const g2 = globalId.slice(2,6);
            const g3 = globalId.slice(6,8) + "00"; // last byte of globalId + 0 (subnet high)
            // Actually standard ULA: fd{globalId}/{subnet}/{iid}
            // Format: fdXX:XXXX:XXXX:SSSS:{iid}
            const gid1 = "fd" + globalId.slice(0,2);
            const gid2 = globalId.slice(2,6);
            const gid3 = globalId.slice(6) + "00"; // last octet of globalId
            // Correct: fd + 40bit = fd followed by 5 octets = 3 groups of 4+4+2 hex
            // fd = 0xfd, then 5 octets = 10 hex chars
            // Groups: fd<2> | <4> | <4> | <subnet 4> | iid(4) | iid(4) | iid(4) | iid(4)
            const hex10 = "fd" + globalId; // 12 hex chars = 3 groups of 4
            const grp1 = hex10.slice(0,4);
            const grp2 = hex10.slice(4,8);
            const grp3 = hex10.slice(8,12);
            const full  = `${grp1}:${grp2}:${grp3}:${subnetId}:${iid.slice(0,4)}:${iid.slice(4,8)}:${iid.slice(8,12)}:${iid.slice(12,16)}`;
            const compressed = compressIPv6(full);
            const network   = `${compressIPv6(`${grp1}:${grp2}:${grp3}:${subnetId}:0000:0000:0000:0000`)}/${48}`;

            document.getElementById("v6genResult").innerHTML = `
                <div class="result-field-row"><span class="rf-key">Address</span><span class="rf-val mono">${compressed}</span></div>
                <div class="result-field-row"><span class="rf-key">Expanded</span><span class="rf-val mono">${full.toUpperCase()}</span></div>
                <div class="result-field-row"><span class="rf-key">Network /48</span><span class="rf-val mono">${network}</span></div>
                <div class="result-field-row"><span class="rf-key">Subnet ID</span><span class="rf-val mono">${subnetId.toUpperCase()}</span></div>
                <div class="result-field-row"><span class="rf-key">Global ID</span><span class="rf-val mono">${globalId.toUpperCase()}</span></div>
                <div class="result-field-row"><span class="rf-key">IID</span><span class="rf-val mono">${iid.toUpperCase()}</span></div>
                <div class="result-field-row"><span class="rf-key">Type</span><span class="rf-val">ULA (Unique Local Address, RFC 4193)</span></div>`;
        }
        showBlock("v6genResult");
    } catch(e) {
        showError("v6genError", e.message);
    }
});

document.getElementById("v6genClear").addEventListener("click", () => {
    document.getElementById("v6genSubnet").value = "";
    clearError("v6genError");
    hideBlock("v6genResult");
});

// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Panel 7: MAC Address Generator — pure JS, Web Crypto API, no external APIs
// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function generateMAC(ouiHex) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    if (ouiHex && ouiHex.length >= 6) {
        // Parse OUI (first 3 octets)
        const oui = ouiHex.replace(/[^0-9a-f]/gi, "").slice(0, 6);
        bytes[0] = parseInt(oui.slice(0,2), 16);
        bytes[1] = parseInt(oui.slice(2,4), 16);
        bytes[2] = parseInt(oui.slice(4,6), 16);
    } else {
        // Make locally administered, unicast (bit 1 = 1, bit 0 = 0 in first octet)
        bytes[0] = (bytes[0] & 0xfe) | 0x02;
    }
    return Array.from(bytes);
}

function formatMAC(bytes, fmt) {
    const hex = bytes.map(b => b.toString(16).padStart(2,"0").toUpperCase());
    switch(fmt) {
        case "dash":  return hex.join("-");
        case "dot":   return `${hex[0]}${hex[1]}.${hex[2]}${hex[3]}.${hex[4]}${hex[5]}`;
        case "plain": return hex.join("");
        default:      return hex.join(":");
    }
}

let lastGeneratedMACs = [];

document.getElementById("macGenBtn").addEventListener("click", () => {
    clearError("macGenError");
    const ouiRaw = document.getElementById("macOui").value.trim();
    const fmt    = document.getElementById("macFormat").value;
    const count  = Math.min(Math.max(parseInt(document.getElementById("macCount").value, 10) || 1, 1), 50);

    const ouiHex = ouiRaw.replace(/[^0-9a-f]/gi,"");
    if (ouiRaw && ouiHex.length < 6) {
        showError("macGenError", "OUI prefix must be at least 3 octets (6 hex characters).");
        return;
    }

    lastGeneratedMACs = [];
    for (let i = 0; i < count; i++) {
        const bytes = generateMAC(ouiHex);
        lastGeneratedMACs.push(formatMAC(bytes, fmt));
    }

    const result = document.getElementById("macGenResult");
    result.innerHTML = lastGeneratedMACs
        .map(m => `<div class="result-field-row"><span class="rf-val mono">${m}</span></div>`)
        .join("");
    showBlock("macGenResult");
});

document.getElementById("macCopyBtn").addEventListener("click", () => {
    if (!lastGeneratedMACs.length) return;
    const text = lastGeneratedMACs.join("\n");
    const doFallback = () => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:0;left:0;width:2px;height:2px;opacity:0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
    };
    const btn = document.getElementById("macCopyBtn");
    const done = () => { btn.textContent = "Copied!"; setTimeout(() => btn.textContent = "Copy All", 1500); };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(doFallback);
    } else { doFallback(); done(); }
});

document.getElementById("macClearBtn").addEventListener("click", () => {
    document.getElementById("macOui").value = "";
    document.getElementById("macCount").value = "1";
    clearError("macGenError");
    hideBlock("macGenResult");
    lastGeneratedMACs = [];
});
