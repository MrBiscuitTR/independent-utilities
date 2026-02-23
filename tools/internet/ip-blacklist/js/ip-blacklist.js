/* ip-blacklist.js
   Checks an IPv4 address against major DNSBLs via Cloudflare DNS-over-HTTPS.
   External dependency: https://cloudflare-dns.com/dns-query (DoH JSON API, no key)
   Technique: reverse IP octets + append DNSBL host → query type A
              NXDOMAIN (status 3) = not listed (clean)
              Answer present      = listed (return code in first A record)
*/
"use strict";

const DOH_URL = "https://cloudflare-dns.com/dns-query";

const BLACKLISTS = [
    { name: "Spamhaus ZEN",          host: "zen.spamhaus.org",          category: "Anti-Spam",    url: "https://www.spamhaus.org/zen/" },
    { name: "Spamhaus SBL",          host: "sbl.spamhaus.org",          category: "Anti-Spam",    url: "https://www.spamhaus.org/sbl/" },
    { name: "Spamhaus PBL",          host: "pbl.spamhaus.org",          category: "Anti-Spam",    url: "https://www.spamhaus.org/pbl/" },
    { name: "Spamhaus XBL",          host: "xbl.spamhaus.org",          category: "Anti-Spam",    url: "https://www.spamhaus.org/xbl/" },
    { name: "Barracuda BRBL",        host: "b.barracudacentral.org",    category: "Anti-Spam",    url: "https://www.barracudacentral.org/rbl/" },
    { name: "SORBS SPAM",            host: "spam.dnsbl.sorbs.net",      category: "Anti-Spam",    url: "http://www.sorbs.net/" },
    { name: "SORBS HTTP",            host: "http.dnsbl.sorbs.net",      category: "Open Proxy",   url: "http://www.sorbs.net/" },
    { name: "SORBS SOCKS",           host: "socks.dnsbl.sorbs.net",     category: "Open Proxy",   url: "http://www.sorbs.net/" },
    { name: "SpamCop",               host: "bl.spamcop.net",            category: "Anti-Spam",    url: "https://www.spamcop.net/bl.shtml" },
    { name: "DNSBL.tornevall",       host: "dnsbl.tornevall.org",       category: "Anti-Spam",    url: "https://tornevall.net/wiki/DNSBL" },
    { name: "CBL (Abuseat)",         host: "cbl.abuseat.org",           category: "Malware/Bot",  url: "http://cbl.abuseat.org/" },
    { name: "PSBL",                  host: "psbl.surriel.com",          category: "Anti-Spam",    url: "https://psbl.surriel.com/" },
    { name: "UCEprotect L1",         host: "dnsbl-1.uceprotect.net",    category: "Anti-Spam",    url: "http://www.uceprotect.net/" },
    { name: "UCEprotect L2",         host: "dnsbl-2.uceprotect.net",    category: "Anti-Spam",    url: "http://www.uceprotect.net/" },
    { name: "MultiRBL",              host: "ix.dnsbl.manitu.net",       category: "Anti-Spam",    url: "https://www.dnsbl.manitu.net/" },
    { name: "SECTOOR Exitnodes",     host: "exitnodes.tor.dnsbl.sectoor.de", category: "TOR Exit", url: "https://www.sectoor.de/tor.php" },
    { name: "DroneBL",               host: "dnsbl.dronebl.org",         category: "Malware/Bot",  url: "https://dronebl.org/" },
];

// ── Validate IPv4 ─────────────────────────────────────────────────────────────
function isValidIPv4(ip) {
    return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
           ip.split(".").every(n => parseInt(n) >= 0 && parseInt(n) <= 255);
}

// ── Reverse IP for DNSBL lookup ───────────────────────────────────────────────
function reverseIP(ip) {
    return ip.split(".").reverse().join(".");
}

// ── DoH DNSBL query ───────────────────────────────────────────────────────────
async function checkDNSBL(reversedIP, dnsbl) {
    const query = `${reversedIP}.${dnsbl.host}`;
    const url = `${DOH_URL}?name=${encodeURIComponent(query)}&type=A`;

    try {
        const res = await fetch(url, { headers: { Accept: "application/dns-json" } });
        if (!res.ok) return { status: "error", code: null, error: `HTTP ${res.status}` };
        const data = await res.json();

        // NXDOMAIN (Status 3) = not listed
        if (data.Status === 3) return { status: "clean", code: null };
        // SERVFAIL or other errors
        if (data.Status !== 0) return { status: "error", code: null, error: `DNS status ${data.Status}` };
        // Answer present = listed; first A record is the return code
        if (data.Answer && data.Answer.length > 0) {
            const code = data.Answer.find(a => a.type === 1)?.data || "";
            return { status: "listed", code };
        }
        return { status: "clean", code: null };
    } catch (err) {
        return { status: "error", code: null, error: err.message };
    }
}

// ── Build initial table skeleton ──────────────────────────────────────────────
function buildSkeleton(ip) {
    const rows = BLACKLISTS.map((bl, i) => `
        <tr id="bl-row-${i}" class="row-checking">
            <td>${escHtml(bl.name)}</td>
            <td><span class="bl-cat">${escHtml(bl.category)}</span></td>
            <td><span class="bl-status bl-status-checking">checking…</span></td>
            <td class="bl-code" id="bl-code-${i}"></td>
        </tr>`).join("");

    return `
        <div class="bl-stats" id="blStats">
            <div class="bl-stat bl-stat-listed"><span class="bl-stat-num" id="statListed">0</span>Listed</div>
            <div class="bl-stat bl-stat-clean"><span class="bl-stat-num" id="statClean">0</span>Clean</div>
            <div class="bl-stat bl-stat-error"><span class="bl-stat-num" id="statError">0</span>Error</div>
            <div class="bl-stat bl-stat-total"><span class="bl-stat-num">${BLACKLISTS.length}</span>Total</div>
        </div>
        <div class="bl-progress-wrap"><div class="bl-progress-bar" id="blProgress"></div></div>
        <div class="bl-card">
            <table class="bl-table">
                <thead><tr>
                    <th>Blacklist</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Return Code</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

// ── Update a row live ─────────────────────────────────────────────────────────
function updateRow(i, result) {
    const row = document.getElementById(`bl-row-${i}`);
    const codeCell = document.getElementById(`bl-code-${i}`);
    if (!row) return;

    row.className = result.status === "listed" ? "row-listed" : "";
    const statusCell = row.querySelector(".bl-status");

    if (result.status === "listed") {
        statusCell.className = "bl-status bl-status-listed";
        statusCell.textContent = "✗ Listed";
        if (result.code) codeCell.textContent = result.code;
    } else if (result.status === "clean") {
        statusCell.className = "bl-status bl-status-clean";
        statusCell.textContent = "✓ Clean";
    } else {
        statusCell.className = "bl-status bl-status-error";
        statusCell.textContent = "? Error";
        if (result.error) codeCell.textContent = result.error;
    }
}

// ── Main check function ───────────────────────────────────────────────────────
async function runCheck() {
    const ip = document.getElementById("ipInput").value.trim();
    if (!ip) return;

    if (!isValidIPv4(ip)) {
        document.getElementById("resultSection").innerHTML =
            '<div class="bl-error">Invalid IPv4 address. Please enter a valid address like 1.2.3.4</div>';
        document.getElementById("resultSection").classList.remove("hidden");
        return;
    }

    const section = document.getElementById("resultSection");
    section.innerHTML = buildSkeleton(ip);
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const reversedIP = reverseIP(ip);
    let listed = 0, clean = 0, errors = 0, done = 0;

    const updateStats = () => {
        document.getElementById("statListed").textContent = listed;
        document.getElementById("statClean").textContent = clean;
        document.getElementById("statError").textContent = errors;
        const pct = Math.round((done / BLACKLISTS.length) * 100);
        document.getElementById("blProgress").style.width = pct + "%";
    };

    // Run all checks concurrently
    const promises = BLACKLISTS.map((bl, i) =>
        checkDNSBL(reversedIP, bl).then(result => {
            done++;
            if (result.status === "listed") listed++;
            else if (result.status === "clean") clean++;
            else errors++;
            updateRow(i, result);
            updateStats();
        })
    );

    await Promise.allSettled(promises);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Wiring ────────────────────────────────────────────────────────────────────
document.getElementById("checkBtn").addEventListener("click", runCheck);
document.getElementById("ipInput").addEventListener("keydown", e => {
    if (e.key === "Enter") runCheck();
});
