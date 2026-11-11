// MCP client over Streamable HTTP (protocol 2025-06-18): JSON and SSE responses,
// Mcp-Session-Id handling, timeouts and size caps.

import { PluginError, readCapped, safeFetch } from "./net.js";

export const PROTOCOL_VERSION = "2025-06-18";
export const CLIENT_INFO = { name: "@profullstack/chat-plugins", version: "0.1.0" };
/** Text handed to the model per tool result. The UI keeps the full text. */
export const MODEL_TEXT_LIMIT = 16 * 1024;

let nextId = 1;

/**
 * Parse a text/event-stream body and return the JSON-RPC message answering `id`.
 * @param {string} text
 * @param {number | string} id
 */
export function parseSse(text, id) {
  const events = [];
  let data = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw === "") {
      if (data.length) events.push(data.join("\n"));
      data = [];
      continue;
    }
    if (raw.startsWith(":")) continue;
    const idx = raw.indexOf(":");
    const field = idx === -1 ? raw : raw.slice(0, idx);
    let value = idx === -1 ? "" : raw.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
  }
  if (data.length) events.push(data.join("\n"));
  let fallback = null;
  for (const ev of events) {
    let msg;
    try {
      msg = JSON.parse(ev);
    } catch {
      continue;
    }
    for (const m of Array.isArray(msg) ? msg : [msg]) {
      if (m && m.id === id && ("result" in m || "error" in m)) return m;
      if (m && ("result" in m || "error" in m) && m.id === undefined) fallback = m;
    }
  }
  return fallback;
}

/**
 * Read an SSE stream until the response for `id` arrives (servers may keep the
 * stream open after it).
 * @param {Response} res
 * @param {number | string} id
 * @param {number} maxBytes
 */
async function readSseFor(res, id, maxBytes) {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) throw new PluginError(`Response larger than ${maxBytes} bytes`, { code: "too_large" });
        buf += decoder.decode(value, { stream: true });
        // Only parse complete events.
        const cut = Math.max(buf.lastIndexOf("\n\n"), buf.lastIndexOf("\r\n\r\n"));
        if (cut !== -1) {
          const msg = parseSse(buf.slice(0, cut + 2), id);
          if (msg && msg.id === id) return msg;
        }
      }
      if (done) break;
    }
    return parseSse(buf + "\n\n", id);
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
}

/**
 * @typedef {import("../index.js").Connection} Connection
 * @typedef {import("../index.js").NetOptions} NetOptions
 */

/**
 * Send one JSON-RPC message. Returns { result, sessionId } for requests.
 * @param {Connection} conn
 * @param {string} method
 * @param {any} params
 * @param {NetOptions & { sessionId?: string, notification?: boolean }} [opts]
 */
export async function rpc(conn, method, params, opts = {}) {
  const id = opts.notification ? undefined : nextId++;
  /** @type {Record<string,string>} */
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": PROTOCOL_VERSION,
  };
  if (conn.token) headers.authorization = `Bearer ${conn.token}`;
  if (opts.sessionId) headers["mcp-session-id"] = opts.sessionId;
  const body = JSON.stringify({ jsonrpc: "2.0", ...(id !== undefined ? { id } : {}), method, ...(params !== undefined ? { params } : {}) });
  const { res, done } = await safeFetch(conn.url, { method: "POST", headers, body }, opts);
  try {
    const sessionId = res.headers.get("mcp-session-id") || opts.sessionId;
    const maxBytes = opts.maxBytes ?? 4_000_000;
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel().catch(() => {});
      const err = new PluginError(res.status === 401 ? "Sign-in required" : "Not allowed", {
        code: res.status === 401 ? "unauthorized" : "forbidden",
        status: res.status,
      });
      /** @type {any} */ (err).wwwAuthenticate = res.headers.get("www-authenticate") || "";
      throw err;
    }
    if (res.status === 404 && opts.sessionId) {
      await res.body?.cancel().catch(() => {});
      throw new PluginError("MCP session expired", { code: "session_expired", status: 404 });
    }
    if (id === undefined) {
      await res.body?.cancel().catch(() => {});
      if (!res.ok && res.status !== 202) {
        throw new PluginError(`${method} failed: HTTP ${res.status}`, { code: "http_error", status: res.status });
      }
      return { result: undefined, sessionId };
    }
    const ct = res.headers.get("content-type") || "";
    let msg;
    if (/text\/event-stream/i.test(ct)) {
      msg = await readSseFor(res, id, maxBytes);
    } else {
      const text = await readCapped(res, maxBytes);
      try {
        const parsed = JSON.parse(text);
        msg = Array.isArray(parsed) ? parsed.find((m) => m && m.id === id) : parsed;
      } catch {
        msg = null;
      }
      if (!res.ok && !(msg && msg.error)) {
        throw new PluginError(`${method} failed: HTTP ${res.status}`, { code: "http_error", status: res.status });
      }
    }
    if (!msg) throw new PluginError(`${method}: no JSON-RPC response from ${new URL(conn.url).host}`, { code: "bad_response" });
    if (msg.error) {
      throw new PluginError(`${method}: ${msg.error.message || "error"}`, { code: "rpc_error", status: msg.error.code });
    }
    return { result: msg.result, sessionId };
  } finally {
    done();
  }
}

/** @type {Map<string, { sessionId?: string, info: any, at: number }>} */
const sessions = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000;

/** @param {Connection} conn */
function sessionKey(conn) {
  // The token is part of the key so two people never share a session.
  return `${conn.url}\u0000${conn.token || ""}`;
}

/**
 * initialize + notifications/initialized. Returns the server's InitializeResult.
 * @param {Connection} conn
 * @param {NetOptions} [opts]
 */
export async function initialize(conn, opts = {}) {
  const { result, sessionId } = await rpc(
    conn,
    "initialize",
    { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: opts.clientInfo || CLIENT_INFO },
    opts,
  );
  try {
    await rpc(conn, "notifications/initialized", undefined, { ...opts, sessionId, notification: true });
  } catch (err) {
    if (/** @type {any} */ (err)?.code === "unauthorized") throw err;
    // Some servers answer notifications oddly; the session still works.
  }
  return { info: result || {}, sessionId };
}

/**
 * @param {Connection} conn
 * @param {NetOptions} opts
 */
async function getSession(conn, opts) {
  const key = sessionKey(conn);
  const hit = sessions.get(key);
  if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit;
  const s = await initialize(conn, opts);
  const entry = { ...s, at: Date.now() };
  sessions.set(key, entry);
  if (sessions.size > 500) sessions.delete(sessions.keys().next().value);
  return entry;
}

/**
 * Request inside a (cached) session; re-initializes once if the session expired.
 * @param {Connection} conn
 * @param {string} method
 * @param {any} params
 * @param {NetOptions} [opts]
 */
export async function request(conn, method, params, opts = {}) {
  let s = await getSession(conn, opts);
  try {
    return (await rpc(conn, method, params, { ...opts, sessionId: s.sessionId })).result;
  } catch (err) {
    const code = /** @type {any} */ (err)?.code;
    if (code === "session_expired" || (code === "http_error" && /** @type {any} */ (err).status === 400 && s.sessionId)) {
      sessions.delete(sessionKey(conn));
      s = await getSession(conn, opts);
      return (await rpc(conn, method, params, { ...opts, sessionId: s.sessionId })).result;
    }
    if (code === "unauthorized") sessions.delete(sessionKey(conn));
    throw err;
  }
}

/** Forget cached sessions (all, or one connection's). @param {Connection} [conn] */
export function resetSessions(conn) {
  if (conn) sessions.delete(sessionKey(conn));
  else sessions.clear();
}

/**
 * List every tool the server offers (follows nextCursor, capped).
 * @param {Connection} conn
 * @param {NetOptions & { maxTools?: number }} [opts]
 * @returns {Promise<import("../index.js").McpTool[]>}
 */
export async function listTools(conn, opts = {}) {
  const max = opts.maxTools ?? 128;
  const tools = [];
  let cursor;
  for (let page = 0; page < 10; page++) {
    const result = await request(conn, "tools/list", cursor ? { cursor } : {}, { timeoutMs: 20_000, ...opts });
    for (const t of result?.tools || []) {
      if (!t || typeof t.name !== "string") continue;
      tools.push({
        name: t.name,
        title: typeof t.title === "string" ? t.title : t.annotations?.title,
        description: typeof t.description === "string" ? t.description.slice(0, 2000) : "",
        inputSchema: t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object", properties: {} },
        annotations: t.annotations && typeof t.annotations === "object" ? t.annotations : {},
      });
      if (tools.length >= max) return tools;
    }
    cursor = result?.nextCursor;
    if (!cursor) break;
  }
  return tools;
}

/**
 * Flatten MCP content blocks to text.
 * @param {any[]} content
 * @param {any} [structured]
 */
export function contentToText(content, structured) {
  const parts = [];
  for (const c of Array.isArray(content) ? content : []) {
    if (!c || typeof c !== "object") continue;
    if (c.type === "text" && typeof c.text === "string") parts.push(c.text);
    else if (c.type === "resource" && c.resource) {
      if (typeof c.resource.text === "string") parts.push(c.resource.text);
      else parts.push(`[resource ${c.resource.uri || ""}]`);
    } else if (c.type === "resource_link") parts.push(`[link ${c.name || ""} ${c.uri || ""}]`.trim());
    else if (c.type === "image") parts.push(`[image ${c.mimeType || ""}]`);
    else if (c.type === "audio") parts.push(`[audio ${c.mimeType || ""}]`);
  }
  if (!parts.length && structured !== undefined) {
    try {
      parts.push(JSON.stringify(structured, null, 2));
    } catch {}
  }
  return parts.join("\n\n");
}

/**
 * Cut text to a byte budget on a character boundary, with a marker.
 * @param {string} text
 * @param {number} [limit]
 */
export function truncateForModel(text, limit = MODEL_TEXT_LIMIT) {
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  if (bytes.length <= limit) return text;
  let cut = new TextDecoder().decode(bytes.slice(0, limit));
  cut = cut.replace(/�+$/, "");
  return `${cut}\n\n[truncated: ${bytes.length - enc.encode(cut).length} more bytes not shown]`;
}

/**
 * Call one tool.
 * @param {Connection} conn
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 * @param {NetOptions & { modelTextLimit?: number }} [opts]
 * @returns {Promise<import("../index.js").ToolResult>}
 */
export async function callTool(conn, name, args = {}, opts = {}) {
  const result = await request(conn, "tools/call", { name, arguments: args || {} }, { timeoutMs: 60_000, ...opts });
  const content = Array.isArray(result?.content) ? result.content : [];
  const text = contentToText(content, result?.structuredContent);
  return {
    isError: result?.isError === true,
    content,
    structuredContent: result?.structuredContent,
    text,
    modelText: truncateForModel(text, opts.modelTextLimit ?? MODEL_TEXT_LIMIT),
  };
}
