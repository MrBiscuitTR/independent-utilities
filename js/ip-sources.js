/* ip-sources.js — shared provider chains for the two IP tools.
 *
 * Why this file exists
 * --------------------
 * A page cannot see its own public IP address, and IP-to-location data is a
 * database nobody can ship to a browser. Both jobs need something outside the
 * machine. This module keeps the list of "something"s in one place so the two
 * tools that need it agree, and so the badge in each page header can describe
 * exactly what gets contacted.
 *
 * Rules this module follows
 * -------------------------
 *   1. Nothing here runs on page load. Every function is called from a click.
 *   2. Every endpoint is HTTPS. The provider these tools used before
 *      (ip-api.com) is HTTP-only, which browsers block as mixed content on the
 *      live https:// site — the location lookup simply never worked there.
 *   3. Every endpoint is keyless and accountless, so nothing ties a lookup to
 *      you beyond the address itself.
 *   4. Requests send no referrer and no cookies, so a provider cannot see
 *      which tool or which site the request came from.
 *   5. Each job has a chain of independent providers on different networks. If
 *      one is down, blocked by an extension, or rate-limiting, the next is
 *      tried. The tool reports which one actually answered.
 */
(function (global) {
  "use strict";

  var TIMEOUT = 7000;

  function get(url, timeout) {
    return fetch(url, {
      signal: AbortSignal.timeout(timeout || TIMEOUT),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      mode: "cors"
    });
  }

  function isV4(s) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(s); }
  function isV6(s) { return s.indexOf(":") !== -1 && /^[0-9a-fA-F:.]+$/.test(s); }
  function isIP(s) { return isV4(s) || isV6(s); }

  function textFrom(url, validate, label) {
    return get(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (t) {
      t = t.trim();
      if (!validate(t)) throw new Error("did not return " + label);
      return t;
    });
  }

  function jsonIpFrom(url, validate, label) {
    return get(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (!validate(j.ip || "")) throw new Error("did not return " + label);
      return j.ip;
    });
  }

  /* ── "What is my public IP" sources ────────────────────────────────────────
     family: "v4" | "v6" | "any" — which address the endpoint reports back. */
  var ECHO = [
    {
      id: "icanhazip-v4", family: "v4", host: "ipv4.icanhazip.com",
      note: "Plain-text echo of your IPv4 address. Operated by Cloudflare, which states it keeps no logs of it.",
      run: function () { return textFrom("https://ipv4.icanhazip.com", isV4, "an IPv4 address"); }
    },
    {
      id: "icanhazip-v6", family: "v6", host: "ipv6.icanhazip.com",
      note: "The IPv6 half of the same service.",
      run: function () { return textFrom("https://ipv6.icanhazip.com", isV6, "an IPv6 address"); }
    },
    {
      id: "ipify-v4", family: "v4", host: "api.ipify.org",
      note: "Independent IPv4 echo on a different network, used when icanhazip is unreachable or blocked.",
      run: function () { return jsonIpFrom("https://api.ipify.org?format=json", isV4, "an IPv4 address"); }
    },
    {
      id: "ipify-v6", family: "v6", host: "api6.ipify.org",
      note: "The IPv6-only endpoint of the same service.",
      run: function () { return jsonIpFrom("https://api6.ipify.org?format=json", isV6, "an IPv6 address"); }
    },
    {
      id: "cf-trace", family: "any", host: "cloudflare.com/cdn-cgi/trace",
      note: "Cloudflare edge diagnostic endpoint. Reports whichever address family your connection actually used.",
      run: function () {
        return get("https://cloudflare.com/cdn-cgi/trace").then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        }).then(function (body) {
          var m = body.match(/^ip=(.+)$/m);
          var ip = m && m[1].trim();
          if (!ip || !isIP(ip)) throw new Error("no address in trace output");
          return ip;
        });
      }
    },
    {
      id: "geojs-echo", family: "any", host: "get.geojs.io/v1/ip",
      note: "GeoJS plain-text echo, last resort. The project states it does not log requests.",
      run: function () { return textFrom("https://get.geojs.io/v1/ip", isIP, "an address"); }
    }
  ];

  /* ── IP → location sources ─────────────────────────────────────────────────
     Each returns the same normalised shape, so the tools do not care which one
     answered. Fields a provider does not carry are simply absent. */
  var GEO = [
    {
      id: "ipwho", host: "ipwho.is",
      note: "Fullest data of the three: city, region, postal code, coordinates, timezone, ISP and ASN. Keyless, no account.",
      run: function (ip) {
        return get("https://ipwho.is/" + encodeURIComponent(ip)).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        }).then(function (d) {
          if (d.success === false) throw new Error(d.message || "lookup failed");
          var c = d.connection || {};
          var tz = d.timezone || {};
          return {
            ip: d.ip, country: d.country, countryCode: d.country_code,
            region: d.region, city: d.city, postal: d.postal,
            lat: d.latitude, lon: d.longitude,
            timezone: tz.id || undefined,
            isp: c.isp, org: c.org,
            asn: c.asn ? "AS" + c.asn : undefined
          };
        });
      }
    },
    {
      id: "geojs", host: "get.geojs.io",
      note: "A separate database on a separate network. Coarser outside large cities, but the project states it does not log requests.",
      run: function (ip) {
        return get("https://get.geojs.io/v1/ip/geo/" + encodeURIComponent(ip) + ".json").then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        }).then(function (d) {
          if (!d || !d.country_code) throw new Error("no data for that address");
          return {
            ip: d.ip, country: d.country, countryCode: d.country_code,
            region: d.region, city: d.city,
            lat: d.latitude !== undefined ? Number(d.latitude) : undefined,
            lon: d.longitude !== undefined ? Number(d.longitude) : undefined,
            timezone: d.timezone,
            org: d.organization_name,
            asn: d.asn ? "AS" + d.asn : undefined
          };
        });
      }
    },
    {
      id: "iplocation", host: "api.iplocation.net",
      note: "Country and ISP only — enough to still answer something when both of the above are unreachable.",
      run: function (ip) {
        return get("https://api.iplocation.net/?ip=" + encodeURIComponent(ip)).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        }).then(function (d) {
          if (String(d.response_code) !== "200") throw new Error(d.response_message || "lookup failed");
          return { ip: d.ip, country: d.country_name, countryCode: d.country_code2, isp: d.isp };
        });
      }
    }
  ];

  /* ── Chain runner ───────────────────────────────────────────────────────
     Tries each provider in order. Resolves { value, provider } on the first
     success; rejects with every collected reason if all of them fail. */
  function chain(providers, invoke) {
    var errors = [];
    var i = 0;
    function next() {
      if (i >= providers.length) {
        var e = new Error("every provider failed");
        e.details = errors;
        return Promise.reject(e);
      }
      var p = providers[i++];
      return Promise.resolve()
        .then(function () { return invoke(p); })
        .then(function (value) { return { value: value, provider: p }; })
        .catch(function (err) {
          errors.push(p.host + ": " + ((err && err.message) || err));
          return next();
        });
    }
    return next();
  }

  /* Detects your public address. `family` is "v4", "v6" or "any".
     Providers of family "any" are kept as fallbacks, and whatever they return
     is checked against the requested family before it is accepted. */
  function detectIP(family) {
    var wanted = family || "any";
    var usable = ECHO.filter(function (p) {
      return wanted === "any" || p.family === wanted || p.family === "any";
    });
    return chain(usable, function (p) {
      return p.run().then(function (ip) {
        if (wanted === "v4" && !isV4(ip)) throw new Error("returned an IPv6 address");
        if (wanted === "v6" && !isV6(ip)) throw new Error("returned an IPv4 address");
        return ip;
      });
    });
  }

  /* Looks an address up. Resolves { value: <normalised record>, provider }. */
  function lookupGeo(ip) {
    return chain(GEO, function (p) { return p.run(ip); });
  }


  /* ── Local sanity check ─────────────────────────────────────────────────
     Runs before anything is sent anywhere, so an address that cannot possibly
     resolve to a public location — a typo, or a machine on your own LAN — is
     rejected here rather than handed to a third party. */
  var V4_RESERVED = [
    ["0.0.0.0",       8,  "this network"],
    ["10.0.0.0",      8,  "a private range (RFC 1918)"],
    ["100.64.0.0",    10, "carrier-grade NAT space"],
    ["127.0.0.0",     8,  "loopback"],
    ["169.254.0.0",   16, "link-local"],
    ["172.16.0.0",    12, "a private range (RFC 1918)"],
    ["192.0.0.0",     24, "IETF protocol assignments"],
    ["192.0.2.0",     24, "documentation-only space"],
    ["192.168.0.0",   16, "a private range (RFC 1918)"],
    ["198.18.0.0",    15, "benchmarking space"],
    ["198.51.100.0",  24, "documentation-only space"],
    ["203.0.113.0",   24, "documentation-only space"],
    ["224.0.0.0",     4,  "multicast"],
    ["240.0.0.0",     4,  "reserved space"]
  ];

  function v4ToInt(ip) {
    return ip.split(".").reduce(function (a, o) { return ((a << 8) | parseInt(o, 10)) >>> 0; }, 0) >>> 0;
  }

  function classifyIP(raw) {
    var ip = String(raw == null ? "" : raw).trim();
    if (!ip) return { valid: false, reason: "Enter an IP address." };

    if (isV4(ip)) {
      if (ip.split(".").some(function (p) { return parseInt(p, 10) > 255; })) {
        return { valid: false, reason: '"' + ip + '" is not a valid IPv4 address.' };
      }
      var n = v4ToInt(ip);
      for (var i = 0; i < V4_RESERVED.length; i++) {
        var r = V4_RESERVED[i];
        var mask = r[1] === 0 ? 0 : (0xFFFFFFFF << (32 - r[1])) >>> 0;
        if (((n & mask) >>> 0) === v4ToInt(r[0])) {
          return { valid: true, family: "v4", reserved: true, reason: r[2] };
        }
      }
      return { valid: true, family: "v4", reserved: false };
    }

    if (isV6(ip)) {
      var low = ip.toLowerCase();
      if (low === "::1") return { valid: true, family: "v6", reserved: true, reason: "loopback" };
      if (low === "::")  return { valid: true, family: "v6", reserved: true, reason: "the unspecified address" };
      if (/^f[cd]/.test(low))    return { valid: true, family: "v6", reserved: true, reason: "a unique-local (private) range" };
      if (/^fe[89ab]/.test(low)) return { valid: true, family: "v6", reserved: true, reason: "link-local" };
      if (/^ff/.test(low))       return { valid: true, family: "v6", reserved: true, reason: "multicast" };
      return { valid: true, family: "v6", reserved: false };
    }

    return { valid: false, reason: '"' + ip + '" is not a valid IP address.' };
  }

  global.IPSources = {
    ECHO: ECHO,
    GEO: GEO,
    detectIP: detectIP,
    lookupGeo: lookupGeo,
    isV4: isV4,
    isV6: isV6,
    isIP: isIP,
    classifyIP: classifyIP
  };
})(window);
