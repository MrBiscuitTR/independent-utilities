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
        if (first > last) throw new Error("First address must be ≤ last address.");

        const cidrs = rangeToCidrs(first, last);
        document.getElementById("rangeCidrList").innerHTML = cidrs.map(c => `<div>${c}</div>`).join("");
        showBlock("rangeCidrResult");
    } catch (e) {
        showError("rangeCidrError", e.message);
    }
});
