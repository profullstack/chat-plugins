// OAuth 2.1 for remote MCP servers: dynamic client registration (RFC 7591, public
// client), PKCE S256, state, code exchange and refresh. No forms for the person:
// the client registers itself and the person only sees the provider's sign-in page.

import { fetchJson, PluginError } from "./net.js";

/** @param {Uint8Array} bytes */
export function base64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** @param {number} n */
export function randomToken(n = 32) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return base64url(b);
}

/** @param {string} verifier */
export async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** In-memory PluginStore (tests, CLIs that keep their own file). */
export function memoryStore() {
  const clients = new Map();
  const tokens = new Map();
  return {
    /** @param {string} key */
    getClient: async (key) => clients.get(key) || null,
    /** @param {string} key @param {any} c */
    setClient: async (key, c) => void clients.set(key, c),
    /** @param {string} key */
    deleteClient: async (key) => void clients.delete(key),
    /** @param {string} slug */
    getTokens: async (slug) => tokens.get(slug) || null,
    /** @param {string} slug @param {any} t */
    setTokens: async (slug, t) => void tokens.set(slug, t),
    /** @param {string} slug */
    deleteTokens: async (slug) => void tokens.delete(slug),
  };
}

/** @param {string} issuer @param {string} redirectUri */
export function clientKey(issuer, redirectUri) {
  return `${issuer}|${redirectUri}`;
}

/**
 * @param {import("../index.js").DiscoveredServer} server
 */
function requireAuth(server) {
  if (!server || typeof server.auth !== "object" || !server.auth) {
    throw new PluginError("This plugin does not use sign-in", { code: "no_auth" });
  }
  return server.auth;
}

/**
 * Register (or reuse) a public client and build the authorize URL.
 * @param {import("../index.js").StartAuthOptions} opts
 * @returns {Promise<{ authorizeUrl: string, pending: import("../index.js").PendingAuth }>}
 */
export async function startAuth(opts) {
  const { server, redirectUri, clientName = "Chat plugins", store } = opts;
  const auth = requireAuth(server);
  if (!redirectUri) throw new PluginError("redirectUri is required", { code: "bad_request" });
  if (!store || typeof store.getClient !== "function" || typeof store.setClient !== "function") {
    throw new PluginError("store with getClient/setClient is required", { code: "bad_request" });
  }
  const key = clientKey(auth.issuer, redirectUri);
  /** @type {any} */
  let client = await store.getClient(key);
  if (!client?.client_id) {
    if (opts.clientId) {
      client = { client_id: opts.clientId };
    } else if (auth.registration_endpoint) {
      const body = {
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        ...(opts.clientUri ? { client_uri: opts.clientUri } : {}),
        ...(opts.logoUri ? { logo_uri: opts.logoUri } : {}),
        ...(auth.scopes?.length ? { scope: auth.scopes.join(" ") } : {}),
      };
      const reg = await fetchJson(
        auth.registration_endpoint,
        { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) },
        { timeoutMs: 15_000, ...opts },
      );
      if (!reg.client_id) throw new PluginError("Client registration returned no client_id", { code: "registration_failed" });
      client = {
        client_id: String(reg.client_id),
        ...(reg.client_secret ? { client_secret: String(reg.client_secret) } : {}),
        registered_at: Date.now(),
      };
    } else {
      throw new PluginError(
        "This plugin's sign-in server does not allow automatic registration (no registration_endpoint)",
        { code: "no_registration" },
      );
    }
    await store.setClient(key, client);
  }
  const verifier = randomToken(48);
  const state = randomToken(24);
  const scopes = opts.scopes || auth.scopes;
  const u = new URL(auth.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", client.client_id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code_challenge", await pkceChallenge(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  if (scopes?.length) u.searchParams.set("scope", scopes.join(" "));
  if (auth.resource) u.searchParams.set("resource", auth.resource);
  return {
    authorizeUrl: u.toString(),
    pending: {
      v: 1,
      state,
      verifier,
      client_id: client.client_id,
      ...(client.client_secret ? { client_secret: client.client_secret } : {}),
      url: server.url,
      issuer: auth.issuer,
      token_endpoint: auth.token_endpoint,
      resource: auth.resource,
      redirect_uri: redirectUri,
      created_at: Date.now(),
    },
  };
}

/** @param {string} a @param {string} b */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * @param {any} json
 * @param {{ client_id: string, client_secret?: string, token_endpoint: string, resource?: string }} ctx
 * @param {string} [previousRefresh]
 * @returns {import("../index.js").Tokens}
 */
function toTokens(json, ctx, previousRefresh) {
  if (!json || typeof json.access_token !== "string" || !json.access_token) {
    throw new PluginError("Sign-in server returned no access_token", { code: "token_failed" });
  }
  const expiresIn = Number(json.expires_in);
  return {
    access_token: json.access_token,
    ...(json.refresh_token || previousRefresh ? { refresh_token: json.refresh_token || previousRefresh } : {}),
    ...(Number.isFinite(expiresIn) && expiresIn > 0 ? { expires_at: Date.now() + expiresIn * 1000 } : {}),
    token_type: json.token_type || "Bearer",
    ...(json.scope ? { scope: String(json.scope) } : {}),
    client_id: ctx.client_id,
    ...(ctx.client_secret ? { client_secret: ctx.client_secret } : {}),
    token_endpoint: ctx.token_endpoint,
    ...(ctx.resource ? { resource: ctx.resource } : {}),
  };
}

/**
 * @param {string} endpoint
 * @param {Record<string,string|undefined>} form
 * @param {import("../index.js").NetOptions} opts
 */
async function postForm(endpoint, form, opts) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) if (v !== undefined && v !== "") body.set(k, v);
  try {
    return await fetchJson(
      endpoint,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: body.toString(),
      },
      { timeoutMs: 15_000, ...opts },
    );
  } catch (err) {
    const e = /** @type {any} */ (err);
    throw new PluginError(`Sign-in failed: ${e.message}`, { code: "token_failed", status: e.status, cause: err });
  }
}

/** Max age of a pending sign-in. */
export const PENDING_TTL_MS = 30 * 60 * 1000;

/**
 * Exchange the callback code for tokens.
 * @param {import("../index.js").FinishAuthOptions} opts
 * @returns {Promise<import("../index.js").Tokens>}
 */
export async function finishAuth(opts) {
  const { pending, code, state } = opts;
  if (!pending || !pending.verifier || !pending.token_endpoint) {
    throw new PluginError("Unknown or expired sign-in", { code: "bad_state" });
  }
  if (!safeEqual(String(state || ""), pending.state)) {
    throw new PluginError("Sign-in state did not match (open the link again)", { code: "bad_state" });
  }
  if (pending.created_at && Date.now() - pending.created_at > PENDING_TTL_MS) {
    throw new PluginError("Sign-in took too long, start again", { code: "expired" });
  }
  if (!code) throw new PluginError("No authorization code in callback", { code: "bad_request" });
  const redirectUri = opts.redirectUri || pending.redirect_uri;
  const json = await postForm(
    pending.token_endpoint,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: pending.client_id,
      client_secret: pending.client_secret,
      code_verifier: pending.verifier,
      resource: pending.resource,
    },
    opts,
  );
  return toTokens(json, pending);
}

/**
 * True when the access token is expired or about to be.
 * @param {import("../index.js").Tokens | null | undefined} tokens
 * @param {number} [skewMs]
 */
export function isExpired(tokens, skewMs = 60_000) {
  return !!tokens?.expires_at && Date.now() + skewMs >= tokens.expires_at;
}

/**
 * Use the refresh token. Keeps the old refresh token when the server does not rotate it.
 * @param {import("../index.js").Tokens} tokens
 * @param {import("../index.js").NetOptions} [opts]
 * @returns {Promise<import("../index.js").Tokens>}
 */
export async function refresh(tokens, opts = {}) {
  if (!tokens?.refresh_token) throw new PluginError("No refresh token; sign in again", { code: "reauth_required" });
  if (!tokens.token_endpoint || !tokens.client_id) {
    throw new PluginError("Token record lacks token_endpoint/client_id; sign in again", { code: "reauth_required" });
  }
  const json = await postForm(
    tokens.token_endpoint,
    {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: tokens.client_id,
      client_secret: tokens.client_secret,
      resource: tokens.resource,
    },
    opts,
  );
  return toTokens(
    json,
    { client_id: tokens.client_id, client_secret: tokens.client_secret, token_endpoint: tokens.token_endpoint, resource: tokens.resource },
    tokens.refresh_token,
  );
}

/**
 * Refresh when expired. Returns the (possibly new) tokens and whether they changed,
 * so the caller can persist them.
 * @param {import("../index.js").Tokens} tokens
 * @param {import("../index.js").NetOptions} [opts]
 */
export async function ensureFresh(tokens, opts = {}) {
  if (!isExpired(tokens) || !tokens.refresh_token) return { tokens, refreshed: false };
  return { tokens: await refresh(tokens, opts), refreshed: true };
}
