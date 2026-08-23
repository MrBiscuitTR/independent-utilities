/* ip-location.js
 *
 * Nothing is contacted until you press Lookup.
 *
 * Before any request goes out, the address you typed is checked locally
 * (/js/ip-sources.js -> classifyIP). A typo or an address on your own LAN is
 * rejected here rather than being handed to a third party — a private address
 * has no public location anyway, and sending one only tells a stranger how
 * your network is laid out.
 *
 * Geolocation chain, tried in order until one answers:
 *   ipwho.is  ->  get.geojs.io  ->  api.iplocation.net
 * The previous provider (ip-api.com) is HTTP-only, so on the live https://
 * site the browser blocked it as mixed content and this tool never worked.
 */

"use strict";

const S = window.IPSources;

const ipInput    = document.getElementById("ipInput");
const lookupBtn  = document.getElementById("lookupBtn");
const resultArea = document.getElementById("resultArea");
const idleNote   = document.getElementById("idleNote");

const backendBanner = document.getElementById("backendBanner");
if (backendBanner) backendBanner.classList.add("hidden");

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function showError(html) {
    resultArea.innerHTML = '<div class="loc-error">' + html + "</div>";
}

// ── Country code → flag emoji ─────────────────────────────────────────────
function flagEmoji(cc) {
    if (!cc || cc.length !== 2) return "🌐";
    // Regional indicator letters: 'A'=U+1F1E6 … 'Z'=U+1F1FF
    return [...cc.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join("");
}

// ── Main lookup ───────────────────────────────────────────────────────────
async function doLookup() {
    const typed = ipInput.value.trim();
    if (idleNote) idleNote.classList.add("hidden");

    // Validate locally first — nothing goes out for input that cannot work.
    if (typed) {
        const c = S.classifyIP(typed);
        if (!c.valid) { showError(esc(c.reason)); return; }
        if (c.reserved) {
            showError(
                esc(typed) + " is " + esc(c.reason) + ", so it has no public location. " +
                "Nothing was sent anywhere \u2014 addresses like this only exist inside a network."
            );
            return;
        }
    }

    resultArea.innerHTML = '<p class="net-source">Looking up\u2026</p>';
    lookupBtn.disabled = true;

    try {
        let ip = typed;
        let ipVia = null;

        if (!ip) {
            const det = await S.detectIP("any");
            ip = det.value;
            ipVia = det.provider.host;
        }

        const res = await S.lookupGeo(ip);
        renderResult(res.value, res.provider, ipVia);
    } catch (e) {
        showError(
            "Lookup failed: " + esc(e.message) +
            (e.details ? "<br><small>" + esc(e.details.join(" \u00b7 ")) + "</small>" : "") +
            "<br><small>If every provider failed, a tracking-blocker extension is the usual cause.</small>"
        );
    } finally {
        lookupBtn.disabled = false;
    }
}

function renderResult(d, provider, ipVia) {
    const flag = flagEmoji(d.countryCode);
    const country = d.country
        ? d.country + (d.countryCode ? " (" + d.countryCode + ")" : "")
        : null;

    const fields = [
        ["IP",           d.ip],
        ["Country",      country],
        ["Region",       d.region],
        ["City",         d.city],
        ["Postcode",     d.postal],
        ["Latitude",     d.lat],
        ["Longitude",    d.lon],
        ["Timezone",     d.timezone],
        ["ISP",          d.isp],
        ["Organisation", d.org],
        ["ASN",          d.asn]
    ].filter(f => f[1] !== undefined && f[1] !== null && f[1] !== "");

    const fieldHtml = fields.map(f =>
        '<div class="loc-field"><div class="loc-field-key">' + esc(f[0]) +
        '</div><div class="loc-field-val">' + esc(f[1]) + "</div></div>").join("");

    const place = [d.city, d.region, d.country].filter(Boolean).join(", ");

    const mapRow = (d.lat !== undefined && d.lon !== undefined)
        ? '<div class="loc-map-row"><a href="https://www.openstreetmap.org/?mlat=' +
          encodeURIComponent(d.lat) + "&mlon=" + encodeURIComponent(d.lon) +
          '&zoom=10" target="_blank" rel="noopener noreferrer">\ud83d\udccd View on OpenStreetMap</a></div>'
        : "";

    const via = "Answered by <code>" + esc(provider.host) + "</code>" +
        (ipVia ? "; your own address came from <code>" + esc(ipVia) + "</code>" : "") + ".";

    resultArea.innerHTML =
        '<div class="loc-card">' +
            '<div class="loc-card-header">' +
                '<span class="loc-flag">' + flag + "</span>" +
                "<div>" +
                    '<div class="loc-ip-big">' + esc(d.ip) + "</div>" +
                    '<div class="loc-city-line">' + esc(place) + "</div>" +
                "</div>" +
            "</div>" +
            '<div class="loc-grid">' + fieldHtml + "</div>" +
            mapRow +
        "</div>" +
        '<p class="net-source">' + via + "</p>";
}

lookupBtn.addEventListener("click", doLookup);
ipInput.addEventListener("keydown", e => { if (e.key === "Enter") doLookup(); });
