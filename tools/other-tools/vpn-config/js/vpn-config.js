/* vpn-config.js
   Pure browser JS — no external requests, no API keys.
   Generates WireGuard and OpenVPN configuration file contents with
   advanced routing, NAT masquerade, and DNAT port-forwarding rules.
*/
"use strict";

let wgPeerCount  = 0;
let wgFwdCount   = 0;
let ovFwdCount   = 0;

// ── Tab switching ─────────────────────────────────────────────────────────────
document.getElementById("vpnTabs").addEventListener("click", e => {
    const btn = e.target.closest(".vtab");
    if (!btn) return;
    document.querySelectorAll(".vtab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".vpn-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
});

// ─────────────────────────────────────────────────────────────────────────────
// WireGuard — Peer management
// ─────────────────────────────────────────────────────────────────────────────
function addWgPeer() {
    wgPeerCount++;
    const id = `wgpeer_${wgPeerCount}`;
    const n  = wgPeerCount;
    const container = document.getElementById("wgPeers");
    const noMsg = container.querySelector(".vpn-no-peers");
    if (noMsg) noMsg.remove();

    const row = document.createElement("div");
    row.className = "vpn-peer-row";
    row.id = id;
    row.innerHTML = `
        <div class="vpn-peer-header">
            <span>Peer / Client ${n}</span>
            <button class="vpn-del-peer" onclick="removeWgPeer('${id}')">Remove</button>
        </div>
        <div class="vpn-peer-grid">
            <div class="vpn-field">
                <label class="vpn-label">Peer Name (comment)
                    <span class="vpn-info-icon" data-tip="Used as a comment in the server config and as the filename for the client config. E.g. 'laptop', 'phone', 'gameserver'.">ℹ️</span>
                </label>
                <input type="text" name="name" class="tool-input" placeholder="e.g. laptop, phone">
            </div>
            <div class="vpn-field">
                <label class="vpn-label">Peer Public Key
                    <span class="vpn-info-icon" data-tip="The peer's public key. Generate on the client: wg genkey | tee client.key | wg pubkey > client.pub — then paste client.pub here.">ℹ️</span>
                </label>
                <input type="text" name="pubkey" class="tool-input" placeholder="Peer's public key…" autocomplete="off">
            </div>
            <div class="vpn-field">
                <label class="vpn-label">Peer VPN IP (AllowedIPs — server side)
                    <span class="vpn-info-icon" data-tip="The IP address(es) this peer is allowed to use in the VPN, in CIDR notation. For a single client: 10.66.66.${n+1}/32. For a site-to-site peer that routes a subnet: 10.66.66.${n+1}/32, 192.168.100.0/24.">ℹ️</span>
                </label>
                <input type="text" name="allowedips" class="tool-input" placeholder="10.66.66.${n+1}/32">
            </div>
            <div class="vpn-field">
                <label class="vpn-label">Endpoint (site-to-site only)
                    <span class="vpn-info-icon" data-tip="Only needed for site-to-site VPN where this peer is also a server. Format: IP:port (e.g. 203.0.113.5:51820). Leave blank for road-warrior clients — they connect TO the server, not the other way.">ℹ️</span>
                </label>
                <input type="text" name="endpoint" class="tool-input" placeholder="IP:port (optional, site-to-site only)">
            </div>
            <div class="vpn-field">
                <label class="vpn-label">Peer Private Key (for client config)
                    <span class="vpn-info-icon" data-tip="The peer's private key — used only to fill in the client's [Interface] PrivateKey. It is never sent anywhere. If blank, a placeholder is used in the output.">ℹ️</span>
                </label>
                <input type="password" name="privkey" class="tool-input" placeholder="Peer's private key (for client config)" autocomplete="off">
            </div>
            <div class="vpn-field">
                <label class="vpn-label">PersistentKeepalive
                    <span class="vpn-info-icon" data-tip="Sends a keepalive packet every N seconds to maintain the connection through NAT. Use 25 if the client is behind a NAT router (home network, mobile). Leave 0 to disable (only needed on server-side peers).">ℹ️</span>
                </label>
                <input type="number" name="keepalive" class="tool-input" value="0" min="0" max="65535" placeholder="0 = off">
            </div>
            <div class="vpn-field vpn-peer-routing">
                <label class="vpn-label">Client Routing (AllowedIPs — client side)
                    <span class="vpn-info-icon" data-tip="What traffic the client routes through the VPN. 'Full tunnel' (0.0.0.0/0) routes ALL traffic through VPN — client's internet goes through the server. 'VPN subnet only' routes only VPN traffic (split tunnel). 'Custom' lets you specify your own.">ℹ️</span>
                </label>
                <select name="clientrouting" class="tool-select" onchange="onClientRoutingChange(this)">
                    <option value="full">Full tunnel — all traffic (0.0.0.0/0, ::/0)</option>
                    <option value="split" selected>VPN subnet only (split tunnel)</option>
                    <option value="custom">Custom…</option>
                </select>
                <input type="text" name="clientrouting_custom" class="tool-input" placeholder="e.g. 10.66.66.0/24, 192.168.1.0/24" style="display:none;margin-top:0.3rem">
            </div>
        </div>`;
    container.appendChild(row);
}

function onClientRoutingChange(sel) {
    const customInput = sel.closest(".vpn-peer-grid").querySelector("[name=clientrouting_custom]");
    customInput.style.display = sel.value === "custom" ? "" : "none";
}

function removeWgPeer(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    const c = document.getElementById("wgPeers");
    if (!c.querySelector(".vpn-peer-row")) {
        c.innerHTML = '<p class="vpn-no-peers">No peers added. Click &quot;+ Add Peer&quot; to add a client.</p>';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// WireGuard — Port forwarding rule management
// ─────────────────────────────────────────────────────────────────────────────
function addWgPortFwd() {
    wgFwdCount++;
    const id = `wgfwd_${wgFwdCount}`;
    const container = document.getElementById("wgPortFwdContainer");
    const noMsg = container.querySelector(".vpn-no-rules");
    if (noMsg) noMsg.remove();

    const row = document.createElement("div");
    row.className = "vpn-portfwd-row";
    row.id = id;
    row.innerHTML = `
        <div>
            <label>Protocol
                <span class="vpn-info-icon" data-tip="TCP for most services (web, game servers, SSH). UDP for DNS, VoIP, some games.">ℹ️</span>
            </label>
            <select name="proto">
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
                <option value="both">both</option>
            </select>
        </div>
        <div>
            <label>Ext Port
                <span class="vpn-info-icon" data-tip="The port number on the SERVER's public IP that incoming traffic arrives on. E.g. 25565 for Minecraft.">ℹ️</span>
            </label>
            <input type="number" name="extport" min="1" max="65535" placeholder="25565">
        </div>
        <div>
            <label>Destination (VPN client IP)
                <span class="vpn-info-icon" data-tip="The VPN IP address of the client to forward traffic to. Must match the client's AllowedIPs/VPN IP (e.g. 10.66.66.2).">ℹ️</span>
            </label>
            <input type="text" name="dstip" placeholder="10.66.66.2">
        </div>
        <div>
            <label>Dst Port
                <span class="vpn-info-icon" data-tip="The port on the destination client to forward to. Usually the same as the external port, but can differ.">ℹ️</span>
            </label>
            <input type="number" name="dstport" min="1" max="65535" placeholder="25565">
        </div>
        <div>
            <label>Add MASQUERADE
                <span class="vpn-info-icon" data-tip="Adds a POSTROUTING MASQUERADE rule for replies from the client back to the internet. Needed when the destination client uses the VPN server as its gateway. If unsure, leave checked.">ℹ️</span>
            </label>
            <select name="masq">
                <option value="yes" selected>yes</option>
                <option value="no">no</option>
            </select>
        </div>
        <button class="vpn-del-btn" onclick="removePortFwd('${id}', 'wgPortFwdContainer')">✕</button>`;
    container.appendChild(row);
}

function removePortFwd(id, containerId) {
    const el = document.getElementById(id);
    if (el) el.remove();
    const c = document.getElementById(containerId);
    if (!c.querySelector(".vpn-portfwd-row")) {
        c.innerHTML = '<p class="vpn-no-rules">No port forwarding rules added.</p>';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// WireGuard — Build iptables PostUp/PostDown lines
// ─────────────────────────────────────────────────────────────────────────────
function buildWgIptables() {
    const outIface   = document.getElementById("wgOutIface").value.trim() || "eth0";
    const masquerade = document.getElementById("wgMasquerade").checked;
    const forwardAll = document.getElementById("wgForwardAll").checked;
    const ip6tables  = document.getElementById("wgIP6Tables").checked;
    const customRaw  = document.getElementById("wgCustomPostUp").value.trim();

    const postUp   = [];
    const postDown = [];

    // Forward rules
    if (forwardAll) {
        postUp.push(`iptables -A FORWARD -i %i -j ACCEPT`);
        postUp.push(`iptables -A FORWARD -o %i -j ACCEPT`);
        postDown.push(`iptables -D FORWARD -i %i -j ACCEPT`);
        postDown.push(`iptables -D FORWARD -o %i -j ACCEPT`);
        if (ip6tables) {
            postUp.push(`ip6tables -A FORWARD -i %i -j ACCEPT`);
            postUp.push(`ip6tables -A FORWARD -o %i -j ACCEPT`);
            postDown.push(`ip6tables -D FORWARD -i %i -j ACCEPT`);
            postDown.push(`ip6tables -D FORWARD -o %i -j ACCEPT`);
        }
    }

    // Masquerade
    if (masquerade) {
        postUp.push(`iptables -t nat -A POSTROUTING -o ${outIface} -j MASQUERADE`);
        postDown.push(`iptables -t nat -D POSTROUTING -o ${outIface} -j MASQUERADE`);
        if (ip6tables) {
            postUp.push(`ip6tables -t nat -A POSTROUTING -o ${outIface} -j MASQUERADE`);
            postDown.push(`ip6tables -t nat -D POSTROUTING -o ${outIface} -j MASQUERADE`);
        }
    }

    // Port forwarding (DNAT) rules
    document.querySelectorAll("#wgPortFwdContainer .vpn-portfwd-row").forEach(row => {
        const proto   = row.querySelector("[name=proto]").value;
        const extPort = row.querySelector("[name=extport]").value.trim();
        const dstIP   = row.querySelector("[name=dstip]").value.trim();
        const dstPort = row.querySelector("[name=dstport]").value.trim();
        const masq    = row.querySelector("[name=masq]").value;

        if (!extPort || !dstIP || !dstPort) return;

        const protos = proto === "both" ? ["tcp", "udp"] : [proto];
        protos.forEach(p => {
            // PREROUTING DNAT — inbound from public internet → client
            postUp.push(`iptables -t nat -A PREROUTING -i ${outIface} -p ${p} --dport ${extPort} -j DNAT --to-destination ${dstIP}:${dstPort}`);
            postDown.push(`iptables -t nat -D PREROUTING -i ${outIface} -p ${p} --dport ${extPort} -j DNAT --to-destination ${dstIP}:${dstPort}`);
            // FORWARD — allow forwarded packets to reach the client
            postUp.push(`iptables -A FORWARD -p ${p} -d ${dstIP} --dport ${dstPort} -j ACCEPT`);
            postDown.push(`iptables -D FORWARD -p ${p} -d ${dstIP} --dport ${dstPort} -j ACCEPT`);
            // Optional MASQUERADE for replies
            if (masq === "yes") {
                postUp.push(`iptables -t nat -A POSTROUTING -o %i -p ${p} --dport ${dstPort} -d ${dstIP} -j MASQUERADE`);
                postDown.push(`iptables -t nat -D POSTROUTING -o %i -p ${p} --dport ${dstPort} -d ${dstIP} -j MASQUERADE`);
            }
        });
    });

    // Custom PostUp lines
    if (customRaw) {
        customRaw.split("\n").forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            postUp.push(trimmed);
            // Auto-generate PostDown by flipping -A → -D
            postDown.push(trimmed.replace(/ -A /g, " -D "));
        });
    }

    return { postUp, postDown };
}

// ─────────────────────────────────────────────────────────────────────────────
// WireGuard — Generate server config
// ─────────────────────────────────────────────────────────────────────────────
function genWgServer() {
    const privKey   = document.getElementById("wgServerPrivKey").value.trim();
    const port      = document.getElementById("wgPort").value || "51820";
    const ip        = document.getElementById("wgServerIP").value.trim() || "10.66.66.1/24";

    const { postUp, postDown } = buildWgIptables();

    const lines = [
        "[Interface]",
        `Address = ${ip}`,
        `PrivateKey = ${privKey || "<SERVER_PRIVATE_KEY>"}`,
        `ListenPort = ${port}`,
    ];

    postUp.forEach(l  => lines.push(`PostUp = ${l}`));
    postDown.forEach(l => lines.push(`PostDown = ${l}`));

    document.querySelectorAll(".vpn-peer-row").forEach((row, i) => {
        const name       = row.querySelector("[name=name]").value.trim();
        const pubkey     = row.querySelector("[name=pubkey]").value.trim();
        const allowedIPs = row.querySelector("[name=allowedips]").value.trim();
        const endpoint   = row.querySelector("[name=endpoint]").value.trim();
        const keepalive  = parseInt(row.querySelector("[name=keepalive]").value) || 0;

        lines.push("");
        if (name) lines.push(`# ${name}`);
        lines.push("[Peer]");
        lines.push(`PublicKey = ${pubkey || "<PEER_" + (i+1) + "_PUBLIC_KEY>"}`);
        lines.push(`AllowedIPs = ${allowedIPs || "10.66.66." + (i+2) + "/32"}`);
        if (endpoint) lines.push(`Endpoint = ${endpoint}`);
        if (keepalive > 0) lines.push(`PersistentKeepalive = ${keepalive}`);
    });

    renderOutput("wgOutput", [{ label: "Server Config", path: "/etc/wireguard/wg0.conf", content: lines.join("\n") }]);
}

// ─────────────────────────────────────────────────────────────────────────────
// WireGuard — Generate client configs
// ─────────────────────────────────────────────────────────────────────────────
function genWgClients() {
    const serverPubKey = document.getElementById("wgServerPubKey").value.trim();
    const serverIP     = document.getElementById("wgServerIP").value.trim();
    const port         = document.getElementById("wgPort").value || "51820";
    const dns          = document.getElementById("wgDNS").value.trim();
    const ifaceName    = document.getElementById("wgIfaceName").value.trim() || "wg0";

    const outputs = [];

    document.querySelectorAll(".vpn-peer-row").forEach((row, i) => {
        const name      = row.querySelector("[name=name]").value.trim() || `client${i+1}`;
        const privkey   = row.querySelector("[name=privkey]").value.trim();
        const allowedIPs= row.querySelector("[name=allowedips]").value.trim() || `10.66.66.${i+2}/32`;
        const keepalive = parseInt(row.querySelector("[name=keepalive]").value) || 0;
        const routing   = row.querySelector("[name=clientrouting]").value;
        const customR   = row.querySelector("[name=clientrouting_custom]").value.trim();

        // Client AllowedIPs (what routes through the VPN on the client side)
        let clientAllowedIPs;
        if (routing === "full") {
            clientAllowedIPs = "0.0.0.0/0, ::/0";
        } else if (routing === "custom" && customR) {
            clientAllowedIPs = customR;
        } else {
            // Split tunnel: only route VPN subnet
            const serverAddr = serverIP.split("/")[0];
            const parts = serverAddr.split(".");
            clientAllowedIPs = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
        }

        const lines = [
            "[Interface]",
            `Address = ${allowedIPs}`,
            `PrivateKey = ${privkey || "<CLIENT_PRIVATE_KEY>"}`,
        ];
        if (dns) lines.push(`DNS = ${dns}`);

        lines.push("", "[Peer]");
        lines.push(`PublicKey = ${serverPubKey || "<SERVER_PUBLIC_KEY>"}`);
        lines.push(`AllowedIPs = ${clientAllowedIPs}`);
        lines.push(`Endpoint = <SERVER_PUBLIC_IP>:${port}`);
        if (keepalive > 0) lines.push(`PersistentKeepalive = ${keepalive}`);

        outputs.push({
            label: `Client: ${name}`,
            path: `/etc/wireguard/${ifaceName}.conf (on ${name})`,
            content: lines.join("\n"),
        });
    });

    if (outputs.length === 0) {
        outputs.push({ label: "No peers", path: "", content: "# Add at least one peer first." });
    }
    renderOutput("wgOutput", outputs);
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenVPN — Port forwarding rule management
// ─────────────────────────────────────────────────────────────────────────────
function addOvPortFwd() {
    ovFwdCount++;
    const id = `ovfwd_${ovFwdCount}`;
    const container = document.getElementById("ovPortFwdContainer");
    const noMsg = container.querySelector(".vpn-no-rules");
    if (noMsg) noMsg.remove();

    const row = document.createElement("div");
    row.className = "vpn-portfwd-row";
    row.id = id;
    row.innerHTML = `
        <div>
            <label>Protocol
                <span class="vpn-info-icon" data-tip="TCP for most services. UDP for DNS, VoIP, some games.">ℹ️</span>
            </label>
            <select name="proto">
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
                <option value="both">both</option>
            </select>
        </div>
        <div>
            <label>Ext Port
                <span class="vpn-info-icon" data-tip="Incoming port on the server's public interface.">ℹ️</span>
            </label>
            <input type="number" name="extport" min="1" max="65535" placeholder="25565">
        </div>
        <div>
            <label>Client VPN IP
                <span class="vpn-info-icon" data-tip="The VPN IP of the OpenVPN client (from the server subnet, e.g. 10.8.0.2).">ℹ️</span>
            </label>
            <input type="text" name="dstip" placeholder="10.8.0.2">
        </div>
        <div>
            <label>Dst Port
                <span class="vpn-info-icon" data-tip="Port on the destination client to forward to.">ℹ️</span>
            </label>
            <input type="number" name="dstport" min="1" max="65535" placeholder="25565">
        </div>
        <div>
            <label>MASQUERADE
                <span class="vpn-info-icon" data-tip="Add POSTROUTING MASQUERADE so replies from the client are correctly routed back.">ℹ️</span>
            </label>
            <select name="masq">
                <option value="yes" selected>yes</option>
                <option value="no">no</option>
            </select>
        </div>
        <button class="vpn-del-btn" onclick="removePortFwd('${id}', 'ovPortFwdContainer')">✕</button>`;
    container.appendChild(row);
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenVPN — Build iptables lines for up/down scripts
// ─────────────────────────────────────────────────────────────────────────────
function buildOvIptables() {
    const outIface   = document.getElementById("ovOutIface").value.trim() || "eth0";
    const nat        = document.getElementById("ovNAT").checked;
    const forwarding = document.getElementById("ovForwarding").checked;

    const up   = [];
    const down = [];

    if (forwarding) {
        up.push(`iptables -A FORWARD -i tun0 -j ACCEPT`);
        up.push(`iptables -A FORWARD -o tun0 -j ACCEPT`);
        down.push(`iptables -D FORWARD -i tun0 -j ACCEPT`);
        down.push(`iptables -D FORWARD -o tun0 -j ACCEPT`);
    }

    if (nat) {
        up.push(`iptables -t nat -A POSTROUTING -o ${outIface} -j MASQUERADE`);
        down.push(`iptables -t nat -D POSTROUTING -o ${outIface} -j MASQUERADE`);
    }

    document.querySelectorAll("#ovPortFwdContainer .vpn-portfwd-row").forEach(row => {
        const proto   = row.querySelector("[name=proto]").value;
        const extPort = row.querySelector("[name=extport]").value.trim();
        const dstIP   = row.querySelector("[name=dstip]").value.trim();
        const dstPort = row.querySelector("[name=dstport]").value.trim();
        const masq    = row.querySelector("[name=masq]").value;

        if (!extPort || !dstIP || !dstPort) return;
        const protos = proto === "both" ? ["tcp", "udp"] : [proto];
        protos.forEach(p => {
            up.push(`iptables -t nat -A PREROUTING -i ${outIface} -p ${p} --dport ${extPort} -j DNAT --to-destination ${dstIP}:${dstPort}`);
            down.push(`iptables -t nat -D PREROUTING -i ${outIface} -p ${p} --dport ${extPort} -j DNAT --to-destination ${dstIP}:${dstPort}`);
            up.push(`iptables -A FORWARD -p ${p} -d ${dstIP} --dport ${dstPort} -j ACCEPT`);
            down.push(`iptables -D FORWARD -p ${p} -d ${dstIP} --dport ${dstPort} -j ACCEPT`);
            if (masq === "yes") {
                up.push(`iptables -t nat -A POSTROUTING -o tun0 -p ${p} --dport ${dstPort} -d ${dstIP} -j MASQUERADE`);
                down.push(`iptables -t nat -D POSTROUTING -o tun0 -p ${p} --dport ${dstPort} -d ${dstIP} -j MASQUERADE`);
            }
        });
    });

    return { up, down };
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenVPN — Generate configs
// ─────────────────────────────────────────────────────────────────────────────
function genOvpn() {
    const subnet     = document.getElementById("ovSubnet").value.trim() || "10.8.0.0 255.255.255.0";
    const port       = document.getElementById("ovPort").value || "1194";
    const proto      = document.getElementById("ovProto").value;
    const dev        = document.getElementById("ovDev").value;
    const cipher     = document.getElementById("ovCipher").value;
    const tls        = document.getElementById("ovTLS").value;
    const dns        = document.getElementById("ovDNS").value.trim();
    const maxCl      = document.getElementById("ovMaxClients").value;
    const c2c        = document.getElementById("ovClientToClient").checked;
    const fullTunnel = document.getElementById("ovFullTunnel").checked;
    const forwarding = document.getElementById("ovForwarding").checked;
    const routes     = document.getElementById("ovRoutes").value.trim().split("\n").filter(l => l.trim());
    const { up, down } = buildOvIptables();

    const server = [
        "# OpenVPN Server Configuration",
        `# File: /etc/openvpn/server.conf`,
        "",
        `port ${port}`,
        `proto ${proto}`,
        `dev ${dev}`,
        "",
        "# Certificate files — generate with easy-rsa:",
        "# cd /etc/openvpn/easy-rsa && ./easyrsa init-pki && ./easyrsa build-ca",
        "# ./easyrsa build-server-full server nopass && ./easyrsa gen-dh",
        "ca   ca.crt",
        "cert server.crt",
        "key  server.key",
        "dh   dh.pem",
        "",
        `server ${subnet}`,
        "ifconfig-pool-persist /var/log/openvpn/ipp.txt",
        "",
    ];

    if (fullTunnel) {
        server.push(`push "redirect-gateway def1 bypass-dhcp"`);
    }

    routes.forEach(r => {
        const parts = r.trim().split(/\s+/);
        if (parts.length >= 2) server.push(`push "route ${parts[0]} ${parts[1]}"`);
        else if (parts[0])     server.push(`push "route ${parts[0]}"`);
    });

    if (dns) server.push(`push "dhcp-option DNS ${dns}"`);
    if (c2c) server.push("client-to-client");
    if (maxCl) server.push(`max-clients ${maxCl}`);

    server.push("",
        `cipher ${cipher}`,
        "auth SHA256",
        "tls-version-min 1.2",
    );

    if (tls === "tls-crypt") {
        server.push("tls-crypt ta.key");
        server.push("# Generate ta.key: openvpn --genkey --secret ta.key");
    } else if (tls === "tls-auth") {
        server.push("tls-auth ta.key 0");
        server.push("# Generate ta.key: openvpn --genkey --secret ta.key");
    }

    if (forwarding || up.length > 0) {
        server.push("");
        server.push("# IP forwarding + iptables — use a script:");
        server.push("script-security 2");
        server.push("up /etc/openvpn/up.sh");
        server.push("down /etc/openvpn/down.sh");
    }

    server.push("",
        "keepalive 10 120",
        "persist-key",
        "persist-tun",
        "user nobody",
        "group nogroup",
        "status /var/log/openvpn/status.log",
        "log-append /var/log/openvpn/openvpn.log",
        "verb 3",
    );

    const client = [
        "# OpenVPN Client Configuration",
        "# File: client.ovpn",
        "",
        "client",
        `dev ${dev}`,
        `proto ${proto}`,
        "",
        "# Replace with your server's public IP or hostname:",
        `remote <SERVER_PUBLIC_IP> ${port}`,
        "resolv-retry infinite",
        "nobind",
        "",
        "persist-key",
        "persist-tun",
        "",
        "# Certificate files (copy from server or embed inline):",
        "ca ca.crt",
        "cert client.crt",
        "key client.key",
        "",
        `cipher ${cipher}`,
        "auth SHA256",
        "tls-version-min 1.2",
        "verb 3",
    ];

    if (tls === "tls-crypt") {
        client.push("tls-crypt ta.key");
    } else if (tls === "tls-auth") {
        client.push("tls-auth ta.key 1");
    }

    const outputs = [
        { label: "Server Config", path: "/etc/openvpn/server.conf", content: server.join("\n") },
        { label: "Client Config", path: "client.ovpn", content: client.join("\n") },
    ];

    // up.sh / down.sh if there are iptables rules
    if (up.length > 0) {
        const upLines = [
            "#!/bin/bash",
            "# /etc/openvpn/up.sh — runs when OpenVPN interface comes up",
            "# Make executable: chmod +x /etc/openvpn/up.sh",
            "",
            "# Enable IP forwarding",
            "sysctl -w net.ipv4.ip_forward=1",
            "",
            "# iptables rules",
            ...up,
        ];
        const downLines = [
            "#!/bin/bash",
            "# /etc/openvpn/down.sh — runs when OpenVPN interface goes down",
            "# Make executable: chmod +x /etc/openvpn/down.sh",
            "",
            ...down,
        ];
        outputs.push({ label: "up.sh (iptables up)", path: "/etc/openvpn/up.sh", content: upLines.join("\n") });
        outputs.push({ label: "down.sh (iptables down)", path: "/etc/openvpn/down.sh", content: downLines.join("\n") });
    }

    renderOutput("ovpnOutput", outputs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Render output blocks
// ─────────────────────────────────────────────────────────────────────────────
function renderOutput(containerId, outputs) {
    const container = document.getElementById(containerId);
    container.innerHTML = outputs.map((o, i) => {
        const uid = containerId + "_" + i;
        return `<div class="vpn-output-block">
            <div class="vpn-output-header">
                <span>${escHtml(o.label)} <span class="vpn-path-note">${escHtml(o.path)}</span></span>
                <button class="vpn-copy-btn" onclick="copyOutput('${uid}', this)">Copy</button>
            </div>
            <pre class="vpn-output-box" id="${uid}">${escHtml(o.content)}</pre>
        </div>`;
    }).join("");
}

function copyOutput(id, btn) {
    const el = document.getElementById(id);
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        btn.textContent = "Copied!";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1800);
    });
}

function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip
// ─────────────────────────────────────────────────────────────────────────────
const tooltip = document.getElementById("vpnTooltip");

function showTip(icon) {
    tooltip.textContent = icon.dataset.tip;
    tooltip.classList.add("visible");
    const r = icon.getBoundingClientRect();
    let top = r.bottom + 8, left = r.left;
    if (left + 310 > window.innerWidth) left = window.innerWidth - 320;
    if (top + 120 > window.innerHeight) top = r.top - 128;
    tooltip.style.top = top + "px";
    tooltip.style.left = left + "px";
}

document.addEventListener("mouseover", e => {
    const icon = e.target.closest(".vpn-info-icon");
    if (icon && icon.dataset.tip) showTip(icon);
});
document.addEventListener("mouseout", e => {
    if (e.target.closest(".vpn-info-icon")) tooltip.classList.remove("visible");
});
document.addEventListener("click", e => {
    const icon = e.target.closest(".vpn-info-icon");
    if (!icon) { tooltip.classList.remove("visible"); return; }
    if (icon.dataset.tip) {
        if (tooltip.classList.contains("visible") && tooltip.textContent === icon.dataset.tip) {
            tooltip.classList.remove("visible");
        } else {
            showTip(icon);
        }
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById("addWgPeer").addEventListener("click", addWgPeer);
document.getElementById("addWgPortFwd").addEventListener("click", addWgPortFwd);
document.getElementById("genWgServer").addEventListener("click", genWgServer);
document.getElementById("genWgClient").addEventListener("click", genWgClients);
document.getElementById("addOvPortFwd").addEventListener("click", addOvPortFwd);
document.getElementById("genOvpn").addEventListener("click", genOvpn);

// Initial no-peers message
document.getElementById("wgPeers").innerHTML = '<p class="vpn-no-peers">No peers added. Click &quot;+ Add Peer&quot; to add a client.</p>';
