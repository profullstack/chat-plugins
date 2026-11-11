// Discovery: what is this MCP server called, and how does a person sign in to it?
// Follows the MCP 2025-06-18 authorization spec: WWW-Authenticate resource_metadata
// -> RFC 9728 protected-resource metadata -> RFC 8414 / OIDC server metadata.

import { initialize } from "./mcp.js";
import { assertSafeUrl, fetchJson, PluginError } from "./net.js";

/**
 * Pull resource_metadata (and scope) out of a WWW-Authenticate header.
 * @param {string} header
 */
export function parseWwwAuthenticate(header) {
  /** @type {Record<string,string>} */
  const out = {};
  if (!header) return out;
  const re = /([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g;
  let m;
  while ((m = re.exec(header))) out[m[1].toLowerCase()] = m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : m[3];
  return out;
}

/** @param {URL} u */
function pathSuffix(u) {
  const p = u.pathname.replace(/\/+$/, "");
  return p && p !== "/" ? p : "";
}

/**
 * Candidate RFC 9728 metadata URLs for a resource, most specific first.
 * @param {URL} resource
 */
export function protectedResourceCandidates(resource) {
  const suffix = pathSuffix(resource);
  const list = [];
  if (suffix) list.push(`${resource.origin}/.well-known/oauth-protected-resource${suffix}`);
  list.push(`${resource.origin}/.well-known/oauth-protected-resource`);
  return list;
}

/**
 * Candidate authorization-server metadata URLs for an issuer, in spec order.
 * @param {string} issuer
 */
export function authServerCandidates(issuer) {
  const u = new URL(issuer);
  const suffix = pathSuffix(u);
  if (!suffix) {
    return [`${u.origin}/.well-known/oauth-authorization-server`, `${u.origin}/.well-known/openid-configuration`];
  }
  return [
    `${u.origin}/.well-known/oauth-authorization-server${suffix}`,
    `${u.origin}/.well-known/openid-configuration${suffix}`,
    `${u.origin}${suffix}/.well-known/openid-configuration`,
  ];
}

/**
 * @param {string} issuer
 * @param {import("../index.js").NetOptions} opts
 */
async function fetchAuthServer(issuer, opts) {
  for (const candidate of authServerCandidates(issuer)) {
    const meta = await fetchJson(candidate, { headers: { accept: "application/json" } }, { ...opts, soft: true, timeoutMs: 10_000 });
    if (meta && typeof meta.authorization_endpoint === "string" && typeof meta.token_endpoint === "string") {
      return meta;
    }
  }
  return null;
}

/** @param {string} url */
export function hostLabel(url) {
  try {
    const h = new URL(url).hostname.replace(/^(www|api|mcp)\./, "");
    return h.split(".")[0] || h;
  } catch {
    return "plugin";
  }
}

/**
 * Look up a remote MCP server: its name and whether (and where) it needs sign-in.
 * @param {string} url
 * @param {import("../index.js").NetOptions & { clientInfo?: {name:string,version:string} }} [opts]
 * @returns {Promise<import("../index.js").DiscoveredServer>}
 */
export async function discover(url, opts = {}) {
  const target = await assertSafeUrl(url, opts);
  const serverUrl = target.toString();
  let info = null;
  let challenge = null;
  let required = false;
  try {
    const r = await initialize({ url: serverUrl }, { timeoutMs: 15_000, ...opts });
    info = r.info;
  } catch (err) {
    const e = /** @type {any} */ (err);
    if (e?.code === "unauthorized" || e?.code === "forbidden") {
      required = true;
      challenge = parseWwwAuthenticate(e.wwwAuthenticate || "");
    } else if (e?.code === "http_error" || e?.code === "bad_response") {
      throw new PluginError(`${target.host} does not look like an MCP server (${e.message})`, {
        code: "not_mcp",
        status: e.status,
      });
    } else {
      throw err;
    }
  }

  /** @type {any} */
  let prm = null;
  const prmUrls = challenge?.resource_metadata ? [challenge.resource_metadata] : protectedResourceCandidates(target);
  for (const candidate of prmUrls) {
    prm = await fetchJson(candidate, { headers: { accept: "application/json" } }, { ...opts, soft: true, timeoutMs: 10_000 });
    if (prm && Array.isArray(prm.authorization_servers) && prm.authorization_servers.length) break;
    prm = null;
  }
  if (prm?.resource) {
    let resOrigin = null;
    try {
      resOrigin = new URL(prm.resource).origin;
    } catch {}
    if (resOrigin !== target.origin) {
      throw new PluginError(`${target.host} published protected-resource metadata for a different host`, {
        code: "resource_mismatch",
      });
    }
  }

  /** @type {import("../index.js").DiscoveredServer["auth"]} */
  let auth = "none";
  if (prm || required) {
    // Legacy servers (2025-03-26) with no RFC 9728 document host the auth server themselves.
    const issuer = prm ? String(prm.authorization_servers[0]) : target.origin;
    await assertSafeUrl(issuer, opts);
    const meta = await fetchAuthServer(issuer, opts);
    if (!meta) {
      if (required) {
        throw new PluginError(
          `${target.host} needs sign-in but publishes no OAuth metadata, so it cannot be added without a key`,
          { code: "no_oauth_metadata" },
        );
      }
    } else {
      const methods = meta.code_challenge_methods_supported;
      if (Array.isArray(methods) && methods.length && !methods.includes("S256")) {
        throw new PluginError(`${target.host}'s sign-in does not support PKCE S256`, { code: "no_pkce" });
      }
      for (const k of ["authorization_endpoint", "token_endpoint", "registration_endpoint"]) {
        if (meta[k]) await assertSafeUrl(meta[k], opts);
      }
      const scopes = challenge?.scope
        ? challenge.scope.split(/\s+/).filter(Boolean)
        : Array.isArray(prm?.scopes_supported)
          ? prm.scopes_supported.map(String)
          : undefined;
      auth = {
        issuer: String(meta.issuer || issuer),
        authorization_endpoint: String(meta.authorization_endpoint),
        token_endpoint: String(meta.token_endpoint),
        ...(meta.registration_endpoint ? { registration_endpoint: String(meta.registration_endpoint) } : {}),
        ...(scopes && scopes.length ? { scopes } : {}),
        resource: String(prm?.resource || serverUrl),
        required,
      };
    }
  }

  const serverInfo = info?.serverInfo || {};
  const name = typeof serverInfo.name === "string" && serverInfo.name ? serverInfo.name : hostLabel(serverUrl);
  return {
    url: serverUrl,
    name,
    title: typeof serverInfo.title === "string" ? serverInfo.title : prm?.resource_name ? String(prm.resource_name) : name,
    instructions: typeof info?.instructions === "string" ? info.instructions.slice(0, 4000) : "",
    version: typeof serverInfo.version === "string" ? serverInfo.version : undefined,
    auth,
  };
}
