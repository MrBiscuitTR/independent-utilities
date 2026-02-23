/* ufw-configurator.js
   Pure browser JS — no external requests, no API keys.
   Generates UFW commands and config file contents from form state.
*/
"use strict";

// ── App profile definitions ──────────────────────────────────────────────────
const APP_PROFILES = [
    { name: "OpenSSH",       ports: "22/tcp" },
    { name: "Nginx HTTP",    ports: "80/tcp" },
    { name: "Nginx HTTPS",   ports: "443/tcp" },
    { name: "Nginx Full",    ports: "80,443/tcp" },
    { name: "Apache",        ports: "80/tcp" },
    { name: "Apache Full",   ports: "80,443/tcp" },
    { name: "Apache Secure", ports: "443/tcp" },
    { name: "MySQL",         ports: "3306/tcp" },
    { name: "PostgreSQL",    ports: "5432/tcp" },
    { name: "Redis",         ports: "6379/tcp" },
    { name: "MongoDB",       ports: "27017/tcp" },
];

let ruleCount = 0;

// ── Render app profiles ───────────────────────────────────────────────────────
function renderAppProfiles() {
    const container = document.getElementById("appProfiles");
    container.innerHTML = APP_PROFILES.map((p, i) => `
        <div class="ufw-app-item">
            <input type="checkbox" id="app_${i}" data-app="${p.name}">
            <label for="app_${i}" style="flex:1;cursor:pointer;margin:0">${p.name}
                <small style="color:var(--color-text-muted);font-size:0.72rem;display:block">${p.ports}</small>
            </label>
            <select id="app_action_${i}">
                <option value="allow">allow</option>
                <option value="deny">deny</option>
            </select>
        </div>
    `).join("");
}

// ── Add rule row ──────────────────────────────────────────────────────────────
function addRule() {
    ruleCount++;
    const id = `rule_${ruleCount}`;
    const container = document.getElementById("rulesContainer");

    // Remove "no rules" message
    const noRules = container.querySelector(".ufw-no-rules");
    if (noRules) noRules.remove();

    const row = document.createElement("div");
    row.className = "ufw-rule-row";
    row.id = id;
    row.innerHTML = `
        <div>
            <label>Direction</label>
            <select name="dir">
                <option value="">any</option>
                <option value="in">in</option>
                <option value="out">out</option>
            </select>
        </div>
        <div>
            <label>Action</label>
            <select name="action">
                <option value="allow">allow</option>
                <option value="deny">deny</option>
                <option value="reject">reject</option>
                <option value="limit">limit</option>
            </select>
        </div>
        <div>
            <label>Protocol</label>
            <select name="proto">
                <option value="">any</option>
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
            </select>
        </div>
        <div>
            <label>Port(s)</label>
            <input type="text" name="port" placeholder="22 or 80,443 or 8000:9000">
        </div>
        <div>
            <label>From IP/CIDR</label>
            <input type="text" name="from" placeholder="any (leave blank)">
        </div>
        <div>
            <label>Comment</label>
            <input type="text" name="comment" placeholder="optional">
        </div>
        <div class="ufw-del-col">
            <button class="ufw-del-btn" onclick="removeRule('${id}')">✕</button>
        </div>
    `;
    container.appendChild(row);
}

function removeRule(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    const container = document.getElementById("rulesContainer");
    if (container.children.length === 0) {
        container.innerHTML = '<p class="ufw-no-rules">No rules added yet. Click "+ Add Rule" to add one.</p>';
    }
}

// ── Generate ──────────────────────────────────────────────────────────────────
function generate() {
    const defIn      = document.getElementById("defIncoming").value;
    const defOut     = document.getElementById("defOutgoing").value;
    const defFwd     = document.getElementById("defForward").value;
    const ipv6       = document.getElementById("optIPv6").checked;
    const forwarding = document.getElementById("optForwarding").checked;
    const rateLimit  = document.getElementById("optRateLimit").checked;
    const logging    = document.getElementById("optLogging").value;

    const lines = [];
    lines.push("#!/bin/bash");
    lines.push("# Generated UFW configuration");
    lines.push("# Run as root or with sudo\n");

    lines.push("# Reset UFW to defaults (optional — remove if you want to keep existing rules)");
    lines.push("# sudo ufw reset\n");

    lines.push("# Set default policies");
    lines.push(`sudo ufw default ${defIn} incoming`);
    lines.push(`sudo ufw default ${defOut} outgoing`);
    if (defFwd !== "deny") {
        lines.push(`sudo ufw default ${defFwd} forward`);
    }
    lines.push("");

    // Rate limit SSH
    if (rateLimit) {
        lines.push("# Rate limit SSH to prevent brute force attacks");
        lines.push("sudo ufw limit ssh");
        lines.push("");
    }

    // Custom rules
    const rows = document.querySelectorAll(".ufw-rule-row");
    if (rows.length > 0) {
        lines.push("# Custom rules");
        rows.forEach(row => {
            const dir     = row.querySelector("[name=dir]").value;
            const action  = row.querySelector("[name=action]").value;
            const proto   = row.querySelector("[name=proto]").value;
            const port    = row.querySelector("[name=port]").value.trim();
            const from    = row.querySelector("[name=from]").value.trim();
            const comment = row.querySelector("[name=comment]").value.trim();

            if (!port && !from) return; // skip empty rows

            let cmd = `sudo ufw`;
            if (dir) cmd += ` ${dir}`;
            cmd += ` ${action}`;
            if (proto && port) cmd += ` proto ${proto}`;
            if (from) cmd += ` from ${from}`;
            if (port) {
                if (from) cmd += ` to any port ${port}`;
                else cmd += ` ${port}${proto ? "/" + proto : ""}`;
            }
            if (comment) cmd += ` comment '${comment}'`;
            lines.push(cmd);
        });
        lines.push("");
    }

    // App profiles
    const appItems = document.querySelectorAll(".ufw-app-item input[type=checkbox]:checked");
    if (appItems.length > 0) {
        lines.push("# Application profiles");
        appItems.forEach(cb => {
            const app    = cb.dataset.app;
            const idx    = cb.id.replace("app_", "");
            const action = document.getElementById(`app_action_${idx}`).value;
            lines.push(`sudo ufw ${action} '${app}'`);
        });
        lines.push("");
    }

    // Logging
    if (logging !== "on") {
        lines.push(`# Set logging level`);
        lines.push(`sudo ufw logging ${logging}`);
        lines.push("");
    }

    lines.push("# Enable UFW");
    lines.push("sudo ufw enable");
    lines.push("");
    lines.push("# Verify");
    lines.push("sudo ufw status verbose");

    document.getElementById("outCommands").textContent = lines.join("\n");

    // /etc/default/ufw
    const defLines = [
        "# /etc/default/ufw — key settings to change",
        `IPV6=${ipv6 ? "yes" : "no"}`,
        `DEFAULT_INPUT_POLICY="${defIn.toUpperCase()}"`,
        `DEFAULT_OUTPUT_POLICY="${defOut.toUpperCase()}"`,
        `DEFAULT_FORWARD_POLICY="${(forwarding ? "accept" : defFwd).toUpperCase()}"`,
    ];
    if (logging === "off") defLines.push(`LOGLEVEL=off`);
    document.getElementById("outDefaultUfw").textContent = defLines.join("\n");

    // before.rules (only if forwarding)
    const beforeBlock = document.getElementById("beforeRulesBlock");
    if (forwarding) {
        const iface = "eth0"; // common default
        const beforeLines = [
            "# Add this block to /etc/ufw/before.rules",
            "# Place it BEFORE the *filter section (near the top of the file)",
            "",
            "*nat",
            ":POSTROUTING ACCEPT [0:0]",
            `# Replace ${iface} with your actual outbound network interface`,
            `-A POSTROUTING -s 10.8.0.0/24 -o ${iface} -j MASQUERADE`,
            "COMMIT",
            "",
            "# Also enable IP forwarding in the kernel:",
            "# sudo sysctl -w net.ipv4.ip_forward=1",
            "# To make it permanent, add to /etc/sysctl.conf:",
            "# net.ipv4.ip_forward=1",
        ];
        document.getElementById("outBeforeRules").textContent = beforeLines.join("\n");
        beforeBlock.style.display = "block";
    } else {
        beforeBlock.style.display = "none";
    }

    const outputSection = document.getElementById("outputSection");
    outputSection.classList.remove("hidden");
    outputSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── Copy buttons ──────────────────────────────────────────────────────────────
document.querySelectorAll(".ufw-copy-btn").forEach(btn => {
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
document.getElementById("ufwGuideToggle").addEventListener("click", () => {
    const body  = document.getElementById("ufwGuideBody");
    const arrow = document.querySelector(".ufw-guide-arrow");
    body.classList.toggle("open");
    arrow.classList.toggle("open");
});

// ── Tooltip ───────────────────────────────────────────────────────────────────
const tooltip = document.getElementById("ufwTooltip");
let tooltipTimeout = null;

function showTooltip(el, text) {
    clearTimeout(tooltipTimeout);
    tooltip.textContent = text;
    tooltip.classList.add("visible");
    positionTooltip(el);
}

function hideTooltip() {
    tooltipTimeout = setTimeout(() => tooltip.classList.remove("visible"), 100);
}

function positionTooltip(el) {
    const rect = el.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 290;
    if (top + 120 > window.innerHeight) top = rect.top - 128;
    tooltip.style.top  = top + "px";
    tooltip.style.left = left + "px";
}

document.addEventListener("mouseover", e => {
    const icon = e.target.closest(".ufw-info-icon");
    if (icon && icon.dataset.tip) showTooltip(icon, icon.dataset.tip);
});

document.addEventListener("mouseout", e => {
    if (e.target.closest(".ufw-info-icon")) hideTooltip();
});

// Mobile: click to toggle
document.addEventListener("click", e => {
    const icon = e.target.closest(".ufw-info-icon");
    if (!icon) { tooltip.classList.remove("visible"); return; }
    if (icon.dataset.tip) {
        if (tooltip.classList.contains("visible") && tooltip.textContent === icon.dataset.tip) {
            tooltip.classList.remove("visible");
        } else {
            showTooltip(icon, icon.dataset.tip);
        }
    }
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById("addRuleBtn").addEventListener("click", addRule);
document.getElementById("generateBtn").addEventListener("click", generate);

renderAppProfiles();

// Start with empty rules message
document.getElementById("rulesContainer").innerHTML = '<p class="ufw-no-rules">No rules added yet. Click "+ Add Rule" to add one.</p>';
