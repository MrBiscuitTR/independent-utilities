/* subnet-calc.js — pure JS, no external APIs */

"use strict";

const cidrInput = document.getElementById("cidrInput");
const calcBtn   = document.getElementById("calcBtn");
const resultArea= document.getElementById("resultArea");

// ── Parse input ───────────────────────────────────────────────────────────────
function parseInput(raw) {
    raw = raw.trim();
    let ip, prefix;

    if (raw.includes("/")) {
        const [ipPart, maskPart] = raw.split("/");
        ip = ipPart.trim();
        if (maskPart.includes(".")) {
            // Dotted-decimal mask
            prefix = maskToCidr(maskPart.trim());
        } else {
            prefix = parseInt(maskPart, 10);
        }
    } else {
        ip = raw;
        prefix = 32; // assume /32 if no mask
    }

    if (!isValidIPv4(ip)) throw new Error("Invalid IPv4 address.");
    if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error("Prefix length must be 0–32.");

    return { ip, prefix };
}

function isValidIPv4(ip) {
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    return parts.every(p => /^\d+$/.test(p) && parseInt(p) >= 0 && parseInt(p) <= 255);
}

function maskToCidr(mask) {
    const parts = mask.split(".").map(Number);
    if (parts.length !== 4) throw new Error("Invalid subnet mask.");
    let bits = 0;
    let seenZero = false;
    for (const octet of parts) {
        if (octet < 0 || octet > 255) throw new Error("Invalid subnet mask.");
        const bin = octet.toString(2).padStart(8, "0");
        for (const b of bin) {
            if (b === "1") {
                if (seenZero) throw new Error("Invalid subnet mask (non-contiguous).");
                bits++;
            } else {
                seenZero = true;
            }
        }
    }
    return bits;
}

// ── Convert IP string to 32-bit integer ───────────────────────────────────────
function ipToInt(ip) {
    return ip.split(".").reduce((acc, octet) => (acc << 8) | parseInt(octet), 0) >>> 0;
}

// ── Convert 32-bit integer to IP string ──────────────────────────────────────
function intToIp(n) {
    return [(n >>> 24), (n >>> 16 & 0xFF), (n >>> 8 & 0xFF), (n & 0xFF)].join(".");
}

// ── Main calculation ──────────────────────────────────────────────────────────
function calculate() {
    const raw = cidrInput.value.trim();
    if (!raw) { cidrInput.focus(); return; }

    try {
        const { ip, prefix } = parseInput(raw);
        const mask       = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
        const ipInt      = ipToInt(ip);
        const network    = (ipInt & mask) >>> 0;
        const broadcast  = (network | (~mask >>> 0)) >>> 0;
        const firstHost  = prefix < 31 ? network + 1 : network;
        const lastHost   = prefix < 31 ? broadcast - 1 : broadcast;
        const totalHosts = Math.pow(2, 32 - prefix);
        const usableHosts= prefix < 31 ? totalHosts - 2 : totalHosts;

        const wildcardMask  = intToIp(~mask >>> 0);
        const maskDotted    = intToIp(mask);
        const ipClass       = getClass(ipInt);
        const isPrivate     = checkPrivate(network, prefix);
        const binaryMask    = toBinaryMask(prefix);

        const fields = [
            ["Input CIDR",      `${intToIp(network)}/${prefix}`],
            ["IP Address",      ip],
            ["Network Address", intToIp(network)],
            ["Broadcast",       intToIp(broadcast)],
            ["First Usable",    prefix < 31 ? intToIp(firstHost) : "—"],
            ["Last Usable",     prefix < 31 ? intToIp(lastHost)  : "—"],
            ["Subnet Mask",     maskDotted],
            ["Wildcard Mask",   wildcardMask],
            ["Prefix Length",   `/${prefix}`],
            ["Total Hosts",     totalHosts.toLocaleString()],
            ["Usable Hosts",    usableHosts > 0 ? usableHosts.toLocaleString() : "0"],
            ["IP Class",        ipClass],
            ["Private Range",   isPrivate ? "Yes (RFC 1918)" : "No (Public)"],
            ["Binary Mask",     binaryMask],
        ];

        const fieldHtml = fields.map(([k, v]) => `
            <div class="result-field">
                <div class="result-field-key">${k}</div>
                <div class="result-field-val">${v}</div>
            </div>`).join("");

        resultArea.innerHTML = `
            <div class="result-card">
                <div class="result-card-title">${intToIp(network)}/${prefix}</div>
                <div class="result-grid">${fieldHtml}</div>
            </div>`;

    } catch (e) {
        resultArea.innerHTML = `<div class="subnet-error">Error: ${e.message}</div>`;
    }
}

function getClass(ipInt) {
    const first = ipInt >>> 24;
    if (first < 128)  return "A";
    if (first < 192)  return "B";
    if (first < 224)  return "C";
    if (first < 240)  return "D (Multicast)";
    return "E (Reserved)";
}

function checkPrivate(network, prefix) {
    const privateRanges = [
        { net: ipToInt("10.0.0.0"),    pref: 8  },
        { net: ipToInt("172.16.0.0"),  pref: 12 },
        { net: ipToInt("192.168.0.0"), pref: 16 },
    ];
    return privateRanges.some(r => prefix >= r.pref && (network >>> (32 - r.pref)) === (r.net >>> (32 - r.pref)));
}

function toBinaryMask(prefix) {
    const ones  = "1".repeat(prefix).padEnd(32, "0");
    return [0,8,16,24].map(i => ones.slice(i, i+8)).join(".");
}

calcBtn.addEventListener("click", calculate);
cidrInput.addEventListener("keydown", e => { if (e.key === "Enter") calculate(); });
