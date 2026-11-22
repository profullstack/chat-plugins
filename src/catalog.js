// Built-in plugin catalog. Apps can pass their own list anywhere a catalog is taken.

import { slugify } from "./tools.js";

/** @type {readonly import("../index.js").CatalogEntry[]} */
export const CATALOG = Object.freeze([
  Object.freeze({
    slug: "c0mpute",
    name: "c0mpute hosting",
    url: "https://c0mpute.com/api/mcp",
    description: "Host sites and apps on the c0mpute p2p network, check jobs, nodes and your balance.",
    homepage: "https://c0mpute.com",
  }),
  Object.freeze({
    slug: "threatcrush",
    name: "ThreatCrush",
    url: "https://threatcrush.com/api/mcp",
    description: "File-hash, IP and domain reputation, plus your org's scan and pentest findings.",
    homepage: "https://threatcrush.com",
  }),
  // On by default (DEFAULT_PLUGINS): reading works without an account; earning tools (referral
  // link, earnings) and posting sign in on first use with OAuth 2.1, by email link or CoinPay.
  Object.freeze({
    slug: "cheapestwayz",
    name: "CheapestWayz",
    url: "https://cheapestwayz.com/mcp",
    description:
      "Find the cheapest way to get something done: priced DIY, online and local-business methods ranked by cost, local quote requests, and your referral link and earnings. Sign in with your CheapestWayz email link or CoinPay.",
    homepage: "https://cheapestwayz.com",
    icon: "https://cheapestwayz.com/favicon.svg",
    default: true,
  }),
]);

/**
 * Merge a catalog override over the built-in list (same slug replaces; `false` url removes).
 * @param {import("../index.js").CatalogEntry[]} [extra]
 * @param {{ replace?: boolean }} [opts]
 */
export function makeCatalog(extra = [], opts = {}) {
  /** @type {Map<string, import("../index.js").CatalogEntry>} */
  const map = new Map();
  if (!opts.replace) for (const e of CATALOG) map.set(e.slug, e);
  for (const e of extra) {
    if (!e || !e.slug) continue;
    if (!e.url) map.delete(e.slug);
    else map.set(e.slug, e);
  }
  return [...map.values()];
}

/**
 * Turn what a person typed after "/plugin add" into { slug, url, name, entry? }.
 * Accepts a catalog slug ("c0mpute"), a catalog name, or a URL (scheme optional).
 * @param {string} input
 * @param {readonly import("../index.js").CatalogEntry[]} [catalog]
 */
export function resolvePluginInput(input, catalog = CATALOG) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const entry = catalog.find((e) => e.slug === lower || e.name.toLowerCase() === lower);
  if (entry) return { slug: entry.slug, url: entry.url, name: entry.name, entry };
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
  const byUrl = catalog.find((e) => e.url.replace(/\/+$/, "") === url.toString().replace(/\/+$/, ""));
  if (byUrl) return { slug: byUrl.slug, url: byUrl.url, name: byUrl.name, entry: byUrl };
  const host = url.hostname.replace(/^(www|api|mcp)\./, "");
  return { slug: slugify(host.split(".")[0] || host), url: url.toString(), name: host };
}

/**
 * A slug not already taken: "foo", "foo-2", ...
 * @param {string} base
 * @param {Iterable<string>} taken
 */
export function uniqueSlug(base, taken) {
  const set = new Set(taken);
  const s = slugify(base);
  if (!set.has(s)) return s;
  for (let i = 2; i < 1000; i++) {
    const c = `${s.slice(0, 28)}-${i}`;
    if (!set.has(c)) return c;
  }
  return `${s.slice(0, 20)}-${Date.now().toString(36)}`;
}
