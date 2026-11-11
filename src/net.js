// Network guard: every request this package makes goes through safeFetch.
//
// - https only (http allowed for localhost when `allowHttpLocalhost`, or anywhere
//   when `allowPrivate` is set, which tests and local dev use).
// - SSRF: the hostname is resolved (node:dns when available) and every address
//   must be public. Private, loopback, link-local, CGNAT, multicast and
//   reserved ranges are refused unless `allowPrivate`.
// - Redirects are followed by hand, re-checked at every hop, and a request that
//   carries a bearer token is never forwarded to a different origin.
// - Response bodies are read with a byte cap.

export class PluginError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number, cause?: unknown }} [info]
   */
  constructor(message, info = {}) {
    super(message);
    this.name = "PluginError";
    this.code = info.code || "plugin_error";
    if (info.status !== undefined) this.status = info.status;
    if (info.cause !== undefined) this.cause = info.cause;
  }
}

const LOCAL_NAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"]);

/** @param {string} host */
function stripBrackets(host) {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** @param {string} ip */
function parseV4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts;
}

/**
 * True when an IP literal is not a public unicast address.
 * @param {string} ip
 */
export function isPrivateAddress(ip) {
  ip = stripBrackets(String(ip).trim()).toLowerCase();
  const v4 = parseV4(ip);
  if (v4) {
    const [a, b, c] = v4;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
  }
  if (!ip.includes(":")) return false; // not an IP literal
  if (ip === "::" || ip === "::1") return true;
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isPrivateAddress(mapped[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const groups = ip.split(":");
  const first = parseInt(groups[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xffc0) === 0xfec0) return true; // site-local (deprecated)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2001 && groups[1] === "db8") return true; // documentation
  if (first === 0x64 && groups[1] === "ff9b") return true; // NAT64 reaches v4 private
  if (first === 0x2002) return true; // 6to4 embeds an arbitrary v4
  return false;
}

/** @param {string} host */
function isIpLiteral(host) {
  host = stripBrackets(host);
  return !!parseV4(host) || host.includes(":");
}

/** @param {string} host */
export function isLocalHostname(host) {
  host = stripBrackets(host).toLowerCase().replace(/\.$/, "");
  if (LOCAL_NAMES.has(host) || host.endsWith(".localhost")) return true;
  if (isIpLiteral(host)) {
    const v4 = parseV4(host);
    return (v4 && v4[0] === 127) || host === "::1";
  }
  return false;
}

/** @type {any} */
let dnsLookup;
async function getLookup() {
  if (dnsLookup !== undefined) return dnsLookup;
  try {
    const dns = await import("node:dns/promises");
    dnsLookup = dns.lookup;
  } catch {
    dnsLookup = null; // browser / edge: literal checks only
  }
  return dnsLookup;
}

/**
 * Throws a PluginError unless `url` is safe to fetch from a server.
 * @param {string | URL} input
 * @param {import("../index.js").NetOptions} [opts]
 * @returns {Promise<URL>}
 */
export async function assertSafeUrl(input, opts = {}) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new PluginError(`Not a valid URL: ${String(input).slice(0, 200)}`, { code: "bad_url" });
  }
  if (url.username || url.password) {
    throw new PluginError("Plugin URLs cannot carry credentials", { code: "bad_url" });
  }
  const host = url.hostname;
  const local = isLocalHostname(host);
  if (url.protocol === "http:") {
    if (!(opts.allowPrivate || (opts.allowHttpLocalhost && local))) {
      throw new PluginError("Plugin URLs must use https", { code: "insecure_url" });
    }
  } else if (url.protocol !== "https:") {
    throw new PluginError(`Unsupported URL scheme ${url.protocol}`, { code: "bad_url" });
  }
  if (!opts.allowPrivate && !(opts.allowHttpLocalhost && local)) {
    if (local) throw new PluginError("Plugin URL points at this machine", { code: "private_address" });
    if (isIpLiteral(host)) {
      if (isPrivateAddress(host)) {
        throw new PluginError("Plugin URL points at a private address", { code: "private_address" });
      }
    } else {
      const lookup = await getLookup();
      if (lookup) {
        let addrs;
        try {
          addrs = await lookup(host, { all: true, verbatim: true });
        } catch (err) {
          throw new PluginError(`Cannot resolve ${host}`, { code: "dns_failed", cause: err });
        }
        if (!addrs.length) throw new PluginError(`Cannot resolve ${host}`, { code: "dns_failed" });
        for (const a of addrs) {
          if (isPrivateAddress(a.address)) {
            throw new PluginError(`${host} resolves to a private address`, { code: "private_address" });
          }
        }
      }
    }
  }
  if (opts.guard) await opts.guard(url);
  return url;
}

/**
 * Read a response body as text with a byte cap.
 * @param {Response} res
 * @param {number} maxBytes
 */
export async function readCapped(res, maxBytes) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {}
      throw new PluginError(`Response larger than ${maxBytes} bytes`, { code: "too_large" });
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/**
 * fetch with the guard, a timeout, and hand-followed redirects (each hop re-checked;
 * an authenticated request never leaves its origin). The caller must call done().
 * @param {string | URL} input
 * @param {RequestInit & { headers?: Record<string,string> }} init
 * @param {import("../index.js").NetOptions} [opts]
 * @returns {Promise<{ res: Response, url: URL, done: () => void }>}
 */
export async function safeFetch(input, init = {}, opts = {}) {
  const f = opts.fetch || globalThis.fetch;
  if (!f) throw new PluginError("No fetch implementation available");
  const ctrl = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const done = () => clearTimeout(timer);
  try {
    let url = await assertSafeUrl(input, opts);
    const origin0 = url.origin;
    const headers = { ...(init.headers || {}) };
    const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
    let method = init.method || "GET";
    let body = init.body;
    for (let hop = 0; hop < 5; hop++) {
      let res;
      try {
        res = await f(url.toString(), { ...init, method, body, headers, redirect: "manual", signal: ctrl.signal });
      } catch (err) {
        if (ctrl.signal.aborted) {
          throw new PluginError(`Request to ${url.host} timed out after ${timeoutMs} ms`, { code: "timeout" });
        }
        throw new PluginError(`Could not reach ${url.host}: ${/** @type {any} */ (err)?.message || err}`, {
          code: "network",
          cause: err,
        });
      }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, url);
        try {
          await res.body?.cancel();
        } catch {}
        if (hasAuth && next.origin !== origin0) {
          throw new PluginError("Plugin redirected an authenticated request to another host", {
            code: "cross_origin_redirect",
          });
        }
        url = await assertSafeUrl(next, opts);
        if (res.status === 303) {
          method = "GET";
          body = undefined;
        }
        continue;
      }
      return { res, url, done };
    }
    throw new PluginError("Too many redirects", { code: "redirect_loop" });
  } catch (err) {
    done();
    throw err;
  }
}

/**
 * Fetch and parse JSON. With `soft`, returns null instead of throwing on a
 * non-2xx status or a body that is not a JSON object (an HTML 200 included).
 * @param {string | URL} url
 * @param {RequestInit & { headers?: Record<string,string> }} init
 * @param {import("../index.js").NetOptions & { soft?: boolean }} [opts]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, init = {}, opts = {}) {
  let r;
  try {
    r = await safeFetch(url, init, opts);
  } catch (err) {
    if (opts.soft && /** @type {any} */ (err)?.code !== "private_address" && /** @type {any} */ (err)?.code !== "insecure_url") {
      return null;
    }
    throw err;
  }
  const { res, done } = r;
  try {
    const text = await readCapped(res, opts.maxBytes ?? 1_000_000);
    let json = null;
    if (/^\s*[{[]/.test(text)) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok || json === null || typeof json !== "object" || Array.isArray(json)) {
      if (opts.soft) return null;
      const msg =
        (json && (json.error_description || json.error?.message || json.error || json.message)) ||
        `HTTP ${res.status}`;
      throw new PluginError(`${new URL(String(url)).host}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`, {
        code: "http_error",
        status: res.status,
      });
    }
    return json;
  } finally {
    done();
  }
}
