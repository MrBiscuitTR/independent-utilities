/* ext-badge.js — "uses an external service" badge for tool pages.
 *
 * Most tools here are 100 % local: every library is bundled in the repo and
 * nothing leaves your browser. A handful genuinely cannot work that way — a
 * page cannot resolve DNS, look up WHOIS, or discover its own public IP
 * without asking something outside the machine. Those tools get a badge in
 * the header corner, and the badge explains exactly which host is contacted,
 * what is sent, and why it is unavoidable.
 *
 * No tool on this site loads code from a CDN — every library is served from
 * this repo, so the site keeps working offline and cannot be changed by a
 * third party after the fact.
 *
 * To add a tool: add an entry below keyed by its path. Pages without an entry
 * render no badge, so this file is harmless to include anywhere.
 */
(function () {
  "use strict";

  var DOH_CF = {
    host: "cloudflare-dns.com/dns-query",
    what: "DNS-over-HTTPS resolver. The hostname or IP you type is sent as a standard DNS query; the answer records come back as JSON.",
    why: "Browsers expose no DNS API at all. DoH is the only way for a page to look up DNS records without a server of its own. Cloudflare's resolver is free, needs no key, sends CORS headers, and does not log query-to-IP pairs beyond 24 h."
  };

  var DOH_GOOGLE = {
    host: "dns.google/resolve",
    what: "DNS-over-HTTPS resolver — same query as above, used as the fallback (or when you pick Google in the resolver selector).",
    why: "A second independent resolver so the tool still answers when Cloudflare is blocked on your network, and so you can compare answers between two resolvers."
  };

  /* The two IP tools declare their provider chains in /js/ip-sources.js, which
     loads before this script. Reading them back from there means the badge can
     never drift out of sync with what the tool actually contacts. */
  function fromIPSources(kind, whatEcho, whatGeo) {
    var src = window.IPSources;
    if (!src) return null;
    return (kind === "echo" ? src.ECHO : src.GEO).map(function (p) {
      return {
        host: p.host,
        what: kind === "echo" ? whatEcho : whatGeo,
        why: p.note
      };
    });
  }

  var ECHO_WHAT = "Your request reaches it and it replies with the public IP address it came from. Nothing else is sent.";
  var GEO_WHAT  = "The IP address is sent, and an approximate location, timezone and network operator come back.";

  var ECHO_WHY_HEAD = "A browser cannot see its own public address — behind NAT it only knows the private LAN address, so something outside your network has to echo it back. Several are listed because these endpoints are commonly on blocklists; they are tried in order until one answers.";
  var GEO_WHY_HEAD = "IP-to-location is a database that cannot be shipped to a browser, so the lookup has to happen somewhere else. Three independent providers are listed and tried in order, so one being down or rate-limiting does not break the tool.";

  var EXTERNAL_DEPS = {
    "/tools/internet/what-is-my-ip/": {
      note: "Nothing is contacted until you press the button — opening this page makes no outbound request at all. " + ECHO_WHY_HEAD,
      build: function () { return fromIPSources("echo", ECHO_WHAT); },
      extra: function () { return fromIPSources("geo", null, GEO_WHAT); },
      extraNote: "Only if you then press “Look up its location”: " + GEO_WHY_HEAD
    },
    "/tools/internet/ip-location/": {
      note: "Nothing is contacted until you press Lookup, and the address is validated here first — a typo or a private address is rejected locally and never sent. " + GEO_WHY_HEAD,
      build: function () { return fromIPSources("geo", null, GEO_WHAT); },
      extra: function () { return fromIPSources("echo", ECHO_WHAT); },
      extraNote: "Only when you leave the box blank, to find out what your own address is:"
    },
    "/tools/internet/dns-lookup/": {
      services: [DOH_CF, DOH_GOOGLE]
    },
    "/tools/internet/domain-checker/": {
      note: "Availability is inferred from DNS only — it is not a registrar check.",
      services: [DOH_CF]
    },
    "/tools/internet/ip-blacklist/": {
      note: "DNSBL lookups are ordinary DNS queries against the reversed IP, so they go through the same resolver.",
      services: [DOH_CF]
    },
    "/tools/internet/ip-tools/": {
      note: "The address maths (conversions, IPv6 expansion, EUI-64) is all local. Only hostname resolution leaves your browser.",
      services: [DOH_CF]
    },
    "/tools/internet/reverse-ip/": {
      services: [DOH_CF, DOH_GOOGLE]
    },
    "/tools/internet/whois-lookup/": {
      services: [
        {
          host: "rdap.arin.net, rdap.db.ripe.net, rdap.apnic.net, rdap.lacnic.net, rdap.afrinic.net",
          what: "RDAP — the modern, JSON replacement for WHOIS. The IP, ASN or domain you enter is sent to the registry that is authoritative for it.",
          why: "Registration data lives with the five regional internet registries; there is no local copy to consult. RDAP is the registries' own public HTTPS API, requires no key, and is CORS-enabled."
        },
        {
          host: "data.iana.org/rdap/*.json",
          what: "IANA bootstrap files that map an IP range or ASN to the registry responsible for it.",
          why: "Needed to know which of the five registries to ask before asking it. Fetched from IANA, the authority that publishes them."
        },
        DOH_CF
      ]
    },
    "/tools/internet/mac-lookup/": {
      note: "This tool also needs the optional local backend running — the request is proxied through it, not sent from your browser.",
      services: [
        {
          host: "api.maclookup.app/v2/macs/{mac}",
          what: "Maps the OUI (first three bytes) of the MAC address you enter to the hardware vendor that registered it.",
          why: "The IEEE OUI registry is a large, frequently-updated database. maclookup.app exposes it for free with no key."
        }
      ]
    },
    "/tools/internet/api-builder/": {
      note: "This tool has no third-party dependency of its own — it contacts whatever you point it at.",
      services: [
        {
          host: "the URL you type into the address bar",
          what: "Your request — method, headers, query parameters, body and any auth credentials you fill in — is sent straight from your browser to that URL with fetch().",
          why: "That is the entire purpose of the tool. Nothing is proxied through a server here, which also means the response is subject to the target's CORS policy, and any token you enter goes only to that target."
        }
      ]
    }
  };

  // ── Resolve the current tool's entry ──────────────────────────────────────
  function currentEntry() {
    var path = location.pathname.replace(/index\.html?$/i, "");
    if (path.charAt(path.length - 1) !== "/") path += "/";
    path = path.replace(/\\/g, "/");
    for (var key in EXTERNAL_DEPS) {
      if (Object.prototype.hasOwnProperty.call(EXTERNAL_DEPS, key) && path.endsWith(key)) {
        return EXTERNAL_DEPS[key];
      }
    }
    return null;
  }

  // An entry supplies its services either as a literal array or as a build()
  // that reads them from /js/ip-sources.js at run time.
  function servicesOf(entry) {
    if (typeof entry.build === "function") return entry.build() || [];
    return entry.services || [];
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function build(entry, header) {
    var wrap = document.createElement("div");
    wrap.className = "ext-badge-wrap";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ext-badge-btn";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "This tool uses an external service — details");
    btn.innerHTML =
      '<svg class="ext-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"></circle>' +
      '<path d="M3 12h18M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z"></path>' +
      "</svg><span class=\"ext-badge-label\">Uses an external service</span>";

    var panel = document.createElement("div");
    panel.className = "ext-badge-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "External services used by this tool");

    function listOf(services) {
      return "<ul>" + services.map(function (s) {
        return "<li><span class=\"ext-host\">" + esc(s.host) + "</span>" +
          '<p class="ext-line"><b>What for:</b> ' + esc(s.what) + "</p>" +
          '<p class="ext-line"><b>Why it is needed:</b> ' + esc(s.why) + "</p></li>";
      }).join("") + "</ul>";
    }

    var html = "<h2>External services used</h2>";
    if (entry.note) html += '<p class="ext-note">' + esc(entry.note) + "</p>";
    html += listOf(servicesOf(entry));

    // Some tools have a second chain that only runs on a further, separate
    // action; it is listed apart so the distinction is not lost.
    var extra = typeof entry.extra === "function" ? entry.extra() : null;
    if (extra && extra.length) {
      if (entry.extraNote) html += '<p class="ext-note">' + esc(entry.extraNote) + "</p>";
      html += listOf(extra);
    }
    html +=
      '<p class="ext-cdn-none"><b>No CDN.</b> Every JavaScript library on this site is ' +
      "served from this repository, never from a third-party CDN — the page keeps working offline " +
      "and cannot be altered by anyone else after the fact.</p>";
    panel.innerHTML = html;

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    header.appendChild(wrap);

    // ── Open / close ────────────────────────────────────────────────────────
    var hoverCapable = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var pinned = false;

    function setOpen(open) {
      wrap.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    // Click / tap toggles on every device — the only interaction touch has.
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      pinned = !pinned;
      setOpen(pinned);
    });

    // Hover is a pointer-device convenience on top of that.
    if (hoverCapable) {
      wrap.addEventListener("mouseenter", function () { setOpen(true); });
      wrap.addEventListener("mouseleave", function () { if (!pinned) setOpen(false); });
    }

    panel.addEventListener("click", function (e) { e.stopPropagation(); });

    document.addEventListener("click", function () {
      if (pinned) { pinned = false; setOpen(false); }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && pinned) { pinned = false; setOpen(false); btn.focus(); }
    });
  }

  function init() {
    var entry = currentEntry();
    if (!entry) return;
    if (!servicesOf(entry).length) return; // nothing to describe — no badge
    var header = document.querySelector(".tool-header");
    if (!header) return;
    build(entry, header);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
