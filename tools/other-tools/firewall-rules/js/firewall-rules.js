/* firewall-rules.js
   Pure browser JS — no external requests, no API keys.
   Generates nftables and iptables rule files from form state.
*/
"use strict";

let ruleCount = 0;
let activeTab = "nft";

// ── Tab switching ─────────────────────────────────────────────────────────────
document.getElementById("fwTabs").addEventListener("click", e => {
    const btn = e.target.closest(".fwtab");
    if (!btn) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll(".fwtab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".fw-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const outPanel = document.getElementById("fw-out-" + activeTab);
    if (outPanel) outPanel.classList.add("active");
});

// ── Add rule row ──────────────────────────────────────────────────────────────
function addRule() {
    ruleCount++;
    const id = `fwrule_${ruleCount}`;
    const container = document.getElementById("rulesContainer");
    const noMsg = container.querySelector(".fw-no-rules");
    if (noMsg) noMsg.remove();

    const row = document.createElement("div");
    row.className = "fw-rule-row";
    row.id = id;
    row.innerHTML = `
        <div>
            <label>Chain</label>
            <select name="chain">
                <option value="input">INPUT</option>
                <option value="output">OUTPUT</option>
                <option value="forward">FORWARD</option>
            </select>
        </div>
        <div>
            <label>Action</label>
            <select name="action">
                <option value="accept">accept</option>
                <option value="drop">drop</option>
                <option value="reject">reject</option>
            </select>
        </div>
        <div>
            <label>Protocol</label>
            <select name="proto">
                <option value="">any</option>
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
                <option value="icmp">icmp</option>
                <option value="icmpv6">icmpv6</option>
            </select>
        </div>
        <div>
            <label>Direction</label>
            <select name="dir">
                <option value="">any</option>
                <option value="in">iif (in)</option>
                <option value="out">oif (out)</option>
            </select>
        </div>
        <div>
            <label>Port(s)</label>
            <input type="text" name="port" placeholder="22 or 80,443 or 8000-9000">
        </div>
        <div>
            <label>Source IP/CIDR</label>
            <input type="text" name="src" placeholder="any (leave blank)">
        </div>
        <div>
            <label>Dest IP/CIDR</label>
            <input type="text" name="dst" placeholder="any (leave blank)">
        </div>
        <div class="fw-del-col">
            <button class="fw-del-btn" onclick="removeRule('${id}')">✕</button>
        </div>`;
    container.appendChild(row);
}

function removeRule(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    const container = document.getElementById("rulesContainer");
    if (container.children.length === 0) {
        container.innerHTML = '<p class="fw-no-rules">No rules added yet. Click \"+ Add Rule\" to add one.</p>';
    }
}

// ── Generate ──────────────────────────────────────────────────────────────────
function generate() {
    const polInput   = document.getElementById("polInput").value;
    const polOutput  = document.getElementById("polOutput").value;
    const polForward = document.getElementById("polForward").value;
    const conntrack  = document.getElementById("optConntrack").checked;
    const loopback   = document.getElementById("optLoopback").checked;
    const icmp       = document.getElementById("optICMP").checked;
    const ipv6       = document.getElementById("optIPv6").checked;

    const rules = [];
    document.querySelectorAll(".fw-rule-row").forEach(row => {
        rules.push({
            chain:  row.querySelector("[name=chain]").value,
            action: row.querySelector("[name=action]").value,
            proto:  row.querySelector("[name=proto]").value,
            dir:    row.querySelector("[name=dir]").value,
            port:   row.querySelector("[name=port]").value.trim(),
            src:    row.querySelector("[name=src]").value.trim(),
            dst:    row.querySelector("[name=dst]").value.trim(),
        });
    });

    buildNft(polInput, polOutput, polForward, conntrack, loopback, icmp, ipv6, rules);
    buildIpt(polInput, polOutput, polForward, conntrack, loopback, icmp, ipv6, rules);

    const outputSection = document.getElementById("outputSection");
    outputSection.classList.remove("hidden");

    // Show correct output panel
    document.querySelectorAll(".fw-panel").forEach(p => p.classList.remove("active"));
    const outPanel = document.getElementById("fw-out-" + activeTab);
    if (outPanel) outPanel.classList.add("active");

    outputSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── nftables builder ──────────────────────────────────────────────────────────
function buildNft(polIn, polOut, polFwd, conntrack, loopback, icmp, ipv6, rules) {
    const family = ipv6 ? "inet" : "ip";
    const lines = [
        `#!/usr/sbin/nft -f`,
        `# nftables configuration — /etc/nftables.conf`,
        `# Apply with: sudo nft -f /etc/nftables.conf`,
        ``,
        `flush ruleset`,
        ``,
        `table ${family} filter {`,
        ``,
        `    chain input {`,
        `        type filter hook input priority 0; policy ${polIn};`,
    ];

    if (loopback) {
        lines.push(`        # Allow loopback`);
        lines.push(`        iif "lo" accept`);
    }
    if (conntrack) {
        lines.push(`        # Allow established/related connections`);
        lines.push(`        ct state established,related accept`);
        lines.push(`        ct state invalid drop`);
    }
    if (icmp) {
        lines.push(`        # Allow ICMP`);
        if (ipv6) {
            lines.push(`        ip protocol icmp accept`);
            lines.push(`        ip6 nexthdr icmpv6 accept`);
        } else {
            lines.push(`        ip protocol icmp accept`);
        }
    }

    rules.filter(r => r.chain === "input" && (r.port || r.src || r.dst || r.proto)).forEach(r => {
        lines.push(`        ${buildNftRule(r)}`);
    });
    lines.push(`    }`);
    lines.push(``);

    lines.push(`    chain output {`);
    lines.push(`        type filter hook output priority 0; policy ${polOut};`);
    if (conntrack) {
        lines.push(`        ct state established,related accept`);
    }
    rules.filter(r => r.chain === "output" && (r.port || r.src || r.dst || r.proto)).forEach(r => {
        lines.push(`        ${buildNftRule(r)}`);
    });
    lines.push(`    }`);
    lines.push(``);

    lines.push(`    chain forward {`);
    lines.push(`        type filter hook forward priority 0; policy ${polFwd};`);
    if (conntrack) {
        lines.push(`        ct state established,related accept`);
    }
    rules.filter(r => r.chain === "forward" && (r.port || r.src || r.dst || r.proto)).forEach(r => {
        lines.push(`        ${buildNftRule(r)}`);
    });
    lines.push(`    }`);
    lines.push(``);
    lines.push(`}`);

    document.getElementById("outNft").textContent = lines.join("\n");
}

function buildNftRule(r) {
    const parts = [];
    if (r.dir === "in")  parts.push(`iif != "lo"`);
    if (r.dir === "out") parts.push(`oif != "lo"`);
    if (r.proto && r.proto !== "icmp" && r.proto !== "icmpv6") {
        parts.push(`${r.proto === "tcp" || r.proto === "udp" ? "ip protocol" : "meta l4proto"} ${r.proto}`);
    }
    if (r.proto === "icmp")   parts.push(`ip protocol icmp`);
    if (r.proto === "icmpv6") parts.push(`ip6 nexthdr icmpv6`);
    if (r.src) parts.push(`ip saddr ${r.src}`);
    if (r.dst) parts.push(`ip daddr ${r.dst}`);
    if (r.port && (r.proto === "tcp" || r.proto === "udp")) {
        const portExpr = r.port.includes(",") ? `{ ${r.port} }` :
                         r.port.includes("-") ? `${r.port.replace("-", "-")}` : r.port;
        parts.push(`${r.proto} dport ${portExpr}`);
    } else if (r.port) {
        parts.push(`th dport ${r.port}`);
    }
    parts.push(r.action);
    return parts.join(" ");
}

// ── iptables builder ──────────────────────────────────────────────────────────
function buildIpt(polIn, polOut, polFwd, conntrack, loopback, icmp, ipv6, rules) {
    const pol = v => v.toUpperCase();
    const lines = [
        `# iptables rules — /etc/iptables/rules.v4`,
        `# Apply with: sudo iptables-restore < /etc/iptables/rules.v4`,
        ``,
        `*filter`,
        `:INPUT ${pol(polIn)} [0:0]`,
        `:FORWARD ${pol(polFwd)} [0:0]`,
        `:OUTPUT ${pol(polOut)} [0:0]`,
        ``,
    ];

    if (loopback) {
        lines.push(`# Allow loopback`);
        lines.push(`-A INPUT -i lo -j ACCEPT`);
        lines.push(`-A OUTPUT -o lo -j ACCEPT`);
        lines.push(``);
    }
    if (conntrack) {
        lines.push(`# Allow established/related connections`);
        lines.push(`-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`);
        lines.push(`-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`);
        lines.push(`-A INPUT -m conntrack --ctstate INVALID -j DROP`);
        lines.push(``);
    }
    if (icmp) {
        lines.push(`# Allow ICMP (ping)`);
        lines.push(`-A INPUT -p icmp --icmp-type echo-request -j ACCEPT`);
        lines.push(`-A OUTPUT -p icmp -j ACCEPT`);
        lines.push(``);
    }

    const userRules = rules.filter(r => r.port || r.src || r.dst || r.proto);
    if (userRules.length > 0) {
        lines.push(`# Custom rules`);
        userRules.forEach(r => lines.push(buildIptRule(r)));
        lines.push(``);
    }

    lines.push(`COMMIT`);
    document.getElementById("outIpt4").textContent = lines.join("\n");

    // IPv6 rules
    if (ipv6) {
        const v6lines = [
            `# ip6tables rules — /etc/iptables/rules.v6`,
            `*filter`,
            `:INPUT ${pol(polIn)} [0:0]`,
            `:FORWARD ${pol(polFwd)} [0:0]`,
            `:OUTPUT ${pol(polOut)} [0:0]`,
            ``,
        ];
        if (loopback) {
            v6lines.push(`-A INPUT -i lo -j ACCEPT`);
            v6lines.push(`-A OUTPUT -o lo -j ACCEPT`);
        }
        if (conntrack) {
            v6lines.push(`-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`);
            v6lines.push(`-A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`);
            v6lines.push(`-A INPUT -m conntrack --ctstate INVALID -j DROP`);
        }
        if (icmp) {
            v6lines.push(`-A INPUT -p icmpv6 -j ACCEPT`);
            v6lines.push(`-A OUTPUT -p icmpv6 -j ACCEPT`);
        }
        userRules.filter(r => r.proto !== "icmp").forEach(r => v6lines.push(buildIptRule(r, true)));
        v6lines.push(``, `COMMIT`);
        document.getElementById("outIpt6").textContent = v6lines.join("\n");
        document.getElementById("ipt6Block").style.display = "block";
    } else {
        document.getElementById("ipt6Block").style.display = "none";
    }

    // Shell commands version
    const cmdLines = [`#!/bin/bash`, `# Apply iptables rules immediately (not persistent)`, `# Install iptables-persistent for persistence: sudo apt install iptables-persistent`, ``];
    if (loopback) {
        cmdLines.push(`iptables -A INPUT -i lo -j ACCEPT`);
        cmdLines.push(`iptables -A OUTPUT -o lo -j ACCEPT`);
    }
    if (conntrack) {
        cmdLines.push(`iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`);
        cmdLines.push(`iptables -A INPUT -m conntrack --ctstate INVALID -j DROP`);
    }
    if (icmp) {
        cmdLines.push(`iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT`);
    }
    userRules.forEach(r => cmdLines.push(buildIptRule(r).replace(/^-A/, "iptables -A")));
    cmdLines.push(``, `# Set default policies`);
    cmdLines.push(`iptables -P INPUT ${pol(polIn)}`);
    cmdLines.push(`iptables -P OUTPUT ${pol(polOut)}`);
    cmdLines.push(`iptables -P FORWARD ${pol(polFwd)}`);
    cmdLines.push(``, `# Save rules (requires iptables-persistent)`);
    cmdLines.push(`# netfilter-persistent save`);
    document.getElementById("outIptCmds").textContent = cmdLines.join("\n");
}

function buildIptRule(r, ipv6 = false) {
    const chainMap = { input: "INPUT", output: "OUTPUT", forward: "FORWARD" };
    const parts = [`-A ${chainMap[r.chain] || "INPUT"}`];
    if (r.proto) parts.push(`-p ${r.proto}`);
    if (r.src)   parts.push(`-s ${r.src}`);
    if (r.dst)   parts.push(`-d ${r.dst}`);
    if (r.port) {
        if (r.port.includes(",")) {
            parts.push(`-m multiport --dport ${r.port}`);
        } else {
            parts.push(`--dport ${r.port.replace("-", ":")}`);
        }
    }
    const actionMap = { accept: "ACCEPT", drop: "DROP", reject: "REJECT" };
    parts.push(`-j ${actionMap[r.action] || "ACCEPT"}`);
    return parts.join(" ");
}

// ── Copy buttons ──────────────────────────────────────────────────────────────
document.querySelectorAll(".fw-copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        navigator.clipboard.writeText(target.textContent).then(() => {
            btn.textContent = "Copied!";
            btn.classList.add("copied");
            setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1800);
        });
    });
});

// ── Guide toggle ──────────────────────────────────────────────────────────────
document.getElementById("fwGuideToggle").addEventListener("click", () => {
    const body  = document.getElementById("fwGuideBody");
    const arrow = document.querySelector(".fw-guide-arrow");
    body.classList.toggle("open");
    arrow.classList.toggle("open");
});

// ── Tooltip ───────────────────────────────────────────────────────────────────
const tooltip = document.getElementById("fwTooltip");

document.addEventListener("mouseover", e => {
    const icon = e.target.closest(".fw-info-icon");
    if (icon && icon.dataset.tip) {
        tooltip.textContent = icon.dataset.tip;
        tooltip.classList.add("visible");
        const r = icon.getBoundingClientRect();
        let top = r.bottom + 8, left = r.left;
        if (left + 290 > window.innerWidth) left = window.innerWidth - 300;
        tooltip.style.top = top + "px";
        tooltip.style.left = left + "px";
    }
});

document.addEventListener("mouseout", e => {
    if (e.target.closest(".fw-info-icon")) tooltip.classList.remove("visible");
});

// Mobile click toggle
document.addEventListener("click", e => {
    const icon = e.target.closest(".fw-info-icon");
    if (!icon) { tooltip.classList.remove("visible"); return; }
    if (icon.dataset.tip) {
        if (tooltip.classList.contains("visible") && tooltip.textContent === icon.dataset.tip) {
            tooltip.classList.remove("visible");
        } else {
            tooltip.textContent = icon.dataset.tip;
            tooltip.classList.add("visible");
            const r = icon.getBoundingClientRect();
            let top = r.bottom + 8, left = r.left;
            if (left + 290 > window.innerWidth) left = window.innerWidth - 300;
            tooltip.style.top = top + "px";
            tooltip.style.left = left + "px";
        }
    }
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById("addRuleBtn").addEventListener("click", addRule);
document.getElementById("generateBtn").addEventListener("click", generate);

document.getElementById("rulesContainer").innerHTML = '<p class="fw-no-rules">No rules added yet. Click \"+ Add Rule\" to add one.</p>';
