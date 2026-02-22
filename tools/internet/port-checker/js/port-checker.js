/* port-checker.js
   Backend: http://localhost:5501/api/port-check (Flask, no external API)
   TCP connect scan + UDP best-effort (open|filtered / closed).
*/

"use strict";

// ── External API endpoints ──────────────────────────────────────────────────
const API_BASE       = "http://localhost:5501";
const API_PORT_CHECK = `${API_BASE}/api/port-check`;
const API_MY_IP      = `${API_BASE}/api/my-ip`;

// ── Port presets (each entry: {port, proto}) ─────────────────────────────────
const PRESETS = {
    web: [
        {port:80,proto:"tcp"},{port:443,proto:"tcp"},
        {port:8080,proto:"tcp"},{port:8443,proto:"tcp"},
        {port:8888,proto:"tcp"},{port:3000,proto:"tcp"},
    ],
    server: [
        {port:21,proto:"tcp"},{port:22,proto:"tcp"},{port:2222,proto:"tcp"},
        {port:23,proto:"tcp"},{port:25,proto:"tcp"},{port:53,proto:"tcp"},
        {port:53,proto:"udp"},{port:80,proto:"tcp"},{port:110,proto:"tcp"},
        {port:143,proto:"tcp"},{port:443,proto:"tcp"},{port:445,proto:"tcp"},
        {port:3306,proto:"tcp"},{port:3389,proto:"tcp"},{port:5432,proto:"tcp"},
        {port:5900,proto:"tcp"},{port:8080,proto:"tcp"},
    ],
    gaming: [
        {port:25565,proto:"tcp"},{port:19132,proto:"udp"},{port:27015,proto:"udp"},
        {port:7777,proto:"udp"},{port:2302,proto:"udp"},{port:3724,proto:"tcp"},
        {port:6112,proto:"tcp"},{port:28960,proto:"udp"},{port:7960,proto:"udp"},
        {port:9987,proto:"udp"},
    ],
    vuln: [
        {port:21,proto:"tcp"},{port:22,proto:"tcp"},{port:23,proto:"tcp"},
        {port:25,proto:"tcp"},{port:53,proto:"udp"},{port:69,proto:"udp"},
        {port:80,proto:"tcp"},{port:110,proto:"tcp"},{port:111,proto:"tcp"},
        {port:135,proto:"tcp"},{port:139,proto:"tcp"},{port:161,proto:"udp"},
        {port:389,proto:"tcp"},{port:443,proto:"tcp"},{port:445,proto:"tcp"},
        {port:512,proto:"tcp"},{port:513,proto:"tcp"},{port:514,proto:"tcp"},
        {port:1433,proto:"tcp"},{port:1521,proto:"tcp"},{port:2049,proto:"tcp"},
        {port:3306,proto:"tcp"},{port:3389,proto:"tcp"},{port:4444,proto:"tcp"},
        {port:5900,proto:"tcp"},{port:6379,proto:"tcp"},{port:7547,proto:"tcp"},
        {port:8080,proto:"tcp"},{port:8443,proto:"tcp"},{port:27017,proto:"tcp"},
    ],
    vpn: [
        {port:51820,proto:"udp"},{port:1194,proto:"udp"},{port:500,proto:"udp"},
        {port:4500,proto:"udp"},{port:1723,proto:"tcp"},{port:1701,proto:"udp"},
    ],
    custom: [],
};

const WELL_KNOWN = {
    21:"FTP",22:"SSH",23:"Telnet",25:"SMTP",53:"DNS",69:"TFTP",
    80:"HTTP",110:"POP3",111:"RPC",135:"MS-RPC",137:"NetBIOS",
    139:"NetBIOS",143:"IMAP",161:"SNMP",389:"LDAP",443:"HTTPS",
    445:"SMB",500:"IKE",512:"rexec",513:"rlogin",514:"syslog",
    1194:"OpenVPN",1433:"MSSQL",1521:"Oracle",1701:"L2TP",1723:"PPTP",
    2049:"NFS",2222:"SSH-Alt",3000:"Dev-HTTP",3306:"MySQL",3389:"RDP",
    4444:"Metasploit",4500:"NAT-T",5432:"PostgreSQL",5900:"VNC",
    6379:"Redis",7547:"TR-069",8080:"HTTP-Alt",8443:"HTTPS-Alt",
    8888:"Alt-HTTP",9987:"TeamSpeak-UDP",19132:"Minecraft-PE-UDP",
    25565:"Minecraft",27015:"Steam/Source-UDP",27017:"MongoDB",
    28960:"CoD-UDP",51820:"WireGuard-UDP",
};

// ── DOM ──────────────────────────────────────────────────────────────────────
const pcHost       = document.getElementById("pcHost");
const pcPorts      = document.getElementById("pcPorts");
const pcScanBtn    = document.getElementById("pcScanBtn");
const resultArea   = document.getElementById("resultArea");
const backendBanner= document.getElementById("backendBanner");

// ── Preset serialisation helpers ─────────────────────────────────────────────
function presetToText(entries) {
    return entries.map(e => e.proto === "udp" ? `${e.port}/udp` : e.port).join(", ");
}

function textToEntries(text) {
    const seen = new Set();
    const out  = [];
    for (const tok of text.split(/[\s,]+/).filter(Boolean)) {
        const m = tok.match(/^(\d+)(?:\/(tcp|udp))?$/i);
        if (!m) continue;
        const port = parseInt(m[1], 10);
        if (port < 1 || port > 65535) continue;
        const proto = (m[2] || "tcp").toLowerCase();
        const key = `${port}/${proto}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ port, proto });
        if (out.length >= 30) break;
    }
    return out;
}

// ── Preset buttons ────────────────────────────────────────────────────────────
document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const preset = PRESETS[btn.dataset.preset];
        if (preset && preset.length) pcPorts.value = presetToText(preset);
        else pcPorts.value = "";
    });
});

// Watch manual edits → match preset or switch to Custom
pcPorts.addEventListener("input", () => {
    const entries = textToEntries(pcPorts.value);
    const sig = entries.map(e => `${e.port}/${e.proto}`).sort().join(",");
    let matched = null;
    for (const [k, v] of Object.entries(PRESETS)) {
        if (k === "custom") continue;
        const psig = v.map(e => `${e.port}/${e.proto}`).sort().join(",");
        if (sig === psig) { matched = k; break; }
    }
    document.querySelectorAll(".preset-btn").forEach(b => {
        b.classList.toggle("active", matched ? b.dataset.preset === matched : b.dataset.preset === "custom");
    });
});

// ── Scan ──────────────────────────────────────────────────────────────────────
pcScanBtn.addEventListener("click", async () => {
    let host = pcHost.value.trim();

    // Blank host → resolve current public IP
    if (!host) {
        try {
            const r = await fetch(API_MY_IP, { signal: AbortSignal.timeout(5000) });
            const d = await r.json();
            host = d.ipv4 || d.ipv6 || "";
            if (host) pcHost.value = host;
        } catch (_) {}
    }

    const entries = textToEntries(pcPorts.value);
    if (!entries.length) { alert("Enter at least one valid port (e.g. 80, 443, 53/udp)."); return; }

    const tcpCount = entries.filter(e => e.proto === "tcp").length;
    const udpCount = entries.filter(e => e.proto === "udp").length;
    resultArea.innerHTML = `<p style="color:var(--color-text-muted);margin-top:1rem">Scanning ${entries.length} port${entries.length > 1 ? "s" : ""} (${tcpCount} TCP, ${udpCount} UDP) on ${host || "auto"}…</p>`;
    pcScanBtn.disabled = true;

    try {
        const resp = await fetch(API_PORT_CHECK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ host, ports: entries }),
            signal: AbortSignal.timeout(90000),
        });

        if (!resp.ok) {
            backendBanner.classList.remove("hidden");
            throw new Error("Backend offline. Start the Flask server to use this tool.");
        }
        backendBanner.classList.add("hidden");

        const data = await resp.json();
        if (data.error) throw new Error(data.error);

        renderResults(data);
    } catch (e) {
        resultArea.innerHTML = `<div class="pc-error">Error: ${e.message}</div>`;
    } finally {
        pcScanBtn.disabled = false;
    }
});

function statusClass(r) {
    if (r.status === "open")          return "status-open";
    if (r.status === "open|filtered") return "status-filtered";
    return "status-closed";
}
function statusLabel(r) {
    if (r.status === "open")          return "Open ✓";
    if (r.status === "open|filtered") return "Open|Filtered ~";
    return "Closed ✗";
}

// function renderResults(data) {
//     const open     = data.results.filter(r => r.open).length;
//     const closed   = data.results.filter(r => r.status === "closed").length;
//     const filtered = data.results.filter(r => r.status === "open|filtered").length;
//     const rows = data.results.map(r => `
//         <tr>
//             <td>${r.port}</td>
//             <td>${r.proto.toUpperCase()}</td>
//             <td>${WELL_KNOWN[r.port] || "—"}</td>
//             <td class="${statusClass(r)}">${statusLabel(r)}</td>
//         </tr>`).join("");

//     resultArea.innerHTML = `
//         <p style="font-size:0.88rem;color:var(--color-text-muted);margin-top:1rem">
//             ${data.host}
//             — <strong style="color:#1a7d44">${open} open</strong>
//             ${filtered ? `, <strong style="color:#fd7e14">${filtered} filtered (UDP)</strong>` : ""}
//             , <strong style="color:#c00">${closed} closed</strong>
//         </p>
//         <table class="port-table">
//             <thead><tr><th>Port</th><th>Proto</th><th>Service</th><th>Status</th></tr></thead>
//             <tbody>${rows}</tbody>
//         </table>`;
// }
function renderResults(data) {
    // Find ports (with proto) that are open
    const openPorts = new Set(data.results.filter(r => r.status === "open").map(r => `${r.port}/${r.proto}`));

    // Find ports (with proto) that are open|filtered
    const filteredPorts = new Set(data.results.filter(r => r.status === "open|filtered").map(r => `${r.port}/${r.proto}`));

    // Find port numbers that appear in both open and open|filtered (regardless of proto)
    // But you want to treat the same port number across protocols as the same? Let's assume yes.
    // So extract port only (ignore proto) for comparison.
    const openPortNums = new Set(data.results.filter(r => r.status === "open").map(r => r.port));
    const filteredPortNums = new Set(data.results.filter(r => r.status === "open|filtered").map(r => r.port));

    // Ports to exclude from open count are those present in both sets (by port number)
    const overlapPorts = new Set([...openPortNums].filter(port => filteredPortNums.has(port)));

    // Filter open results to exclude ports also marked open|filtered
    const open = data.results.filter(r => r.status === "open" && !overlapPorts.has(r.port)).length;

    // Filter filtered results (all open|filtered)
    const filtered = data.results.filter(r => r.status === "open|filtered").length;

    // Closed count stays the same
    const closed = data.results.filter(r => r.status === "closed").length;

    const rows = data.results.map(r => `
        <tr>
            <td>${r.port}</td>
            <td>${r.proto.toUpperCase()}</td>
            <td>${WELL_KNOWN[r.port] || "—"}</td>
            <td class="${statusClass(r)}">${statusLabel(r)}</td>
        </tr>`).join("");

    resultArea.innerHTML = `
        <p style="font-size:0.88rem;color:var(--color-text-muted);margin-top:1rem">
            ${data.host}
            — <strong style="color:#1a7d44">${open} open</strong>
            ${filtered ? `, <strong style="color:#fd7e14">${filtered} filtered (UDP)</strong>` : ""}
            , <strong style="color:#c00">${closed} closed</strong>
        </p>
        <table class="port-table">
            <thead><tr><th>Port</th><th>Proto</th><th>Service</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}