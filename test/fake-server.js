// A fake remote MCP server with OAuth 2.1 + DCR + PKCE, for tests.

import { createHash, randomBytes } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const TOOLS = [
  { name: "echo", description: "Echo text back", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, annotations: { readOnlyHint: true } },
  { name: "delete_site", description: "Delete a hosted site", inputSchema: { type: "object", properties: { name: { type: "string" } } }, annotations: { destructiveHint: true } },
  { name: "big", description: "Return a large result", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "sse_echo", description: "Echo, answered over SSE", inputSchema: { type: "object", properties: { text: { type: "string" } } }, annotations: { readOnlyHint: true } },
];

/** @param {{ auth?: boolean }} opts */
export function startFakeServer(opts = {}) {
  const auth = opts.auth !== false;
  const state = { registrations: 0, clients: new Map(), codes: new Map(), tokens: new Set(), refreshTokens: new Set(), sessions: new Set(), calls: [] };
  let origin = "";

  const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const p = url.pathname;
      if (p === "/.well-known/oauth-protected-resource/mcp" && auth) {
        return json({ resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: ["mcp"] });
      }
      if (p === "/.well-known/oauth-authorization-server" && auth) {
        return json({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          registration_endpoint: `${origin}/register`,
          code_challenge_methods_supported: ["S256"],
        });
      }
      if (p === "/.well-known/oauth-protected-resource") {
        // An HTML 200 like a Next.js catch-all page: must be treated as "not there".
        return new Response("<html>not json</html>", { headers: { "content-type": "text/html" } });
      }
      if (p === "/register" && req.method === "POST") {
        const body = await req.json();
        if (body.token_endpoint_auth_method !== "none") return json({ error: "invalid_client_metadata" }, 400);
        state.registrations++;
        const id = `client-${state.registrations}`;
        state.clients.set(id, body);
        return json({ client_id: id, ...body }, 201);
      }
      if (p === "/authorize") {
        const q = url.searchParams;
        const client = state.clients.get(q.get("client_id"));
        if (!client || !client.redirect_uris.includes(q.get("redirect_uri"))) return json({ error: "bad client" }, 400);
        if (q.get("code_challenge_method") !== "S256") return json({ error: "pkce" }, 400);
        const code = b64url(randomBytes(16));
        state.codes.set(code, { challenge: q.get("code_challenge"), client_id: q.get("client_id"), redirect_uri: q.get("redirect_uri"), resource: q.get("resource") });
        const to = new URL(q.get("redirect_uri"));
        to.searchParams.set("code", code);
        to.searchParams.set("state", q.get("state"));
        return new Response(null, { status: 302, headers: { location: to.toString() } });
      }
      if (p === "/token" && req.method === "POST") {
        const f = new URLSearchParams(await req.text());
        if (f.get("grant_type") === "authorization_code") {
          const c = state.codes.get(f.get("code"));
          if (!c) return json({ error: "invalid_grant" }, 400);
          state.codes.delete(f.get("code"));
          const expect = b64url(createHash("sha256").update(f.get("code_verifier") || "").digest());
          if (expect !== c.challenge) return json({ error: "invalid_grant", error_description: "PKCE mismatch" }, 400);
          if (c.client_id !== f.get("client_id") || c.redirect_uri !== f.get("redirect_uri")) return json({ error: "invalid_grant" }, 400);
          const at = `at-${b64url(randomBytes(8))}`;
          const rt = `rt-${b64url(randomBytes(8))}`;
          state.tokens.add(at);
          state.refreshTokens.add(rt);
          return json({ access_token: at, refresh_token: rt, token_type: "Bearer", expires_in: 1 });
        }
        if (f.get("grant_type") === "refresh_token") {
          if (!state.refreshTokens.has(f.get("refresh_token"))) return json({ error: "invalid_grant" }, 400);
          const at = `at-${b64url(randomBytes(8))}`;
          state.tokens.add(at);
          return json({ access_token: at, token_type: "Bearer", expires_in: 3600 });
        }
        return json({ error: "unsupported_grant_type" }, 400);
      }
      if (p === "/redirect-away") {
        return new Response(null, { status: 307, headers: { location: "https://example.com/mcp" } });
      }
      if (p === "/mcp" && req.method === "POST") {
        if (auth) {
          const h = req.headers.get("authorization") || "";
          const tok = h.replace(/^Bearer /, "");
          if (!state.tokens.has(tok)) {
            return json({ error: "unauthorized" }, 401, {
              "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="mcp"`,
            });
          }
        }
        const msg = await req.json();
        if (msg.method === "initialize") {
          const sid = b64url(randomBytes(8));
          state.sessions.add(sid);
          return json(
            { jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "Fake Hosting", version: "1.0" }, instructions: "Fake server." } },
            200,
            { "mcp-session-id": sid },
          );
        }
        const sid = req.headers.get("mcp-session-id");
        if (!sid || !state.sessions.has(sid)) return json({ error: "no session" }, 404);
        if (msg.method === "notifications/initialized") return new Response(null, { status: 202 });
        if (msg.method === "tools/list") {
          const page = msg.params?.cursor === "p2" ? 2 : 1;
          const tools = page === 1 ? TOOLS.slice(0, 2) : TOOLS.slice(2);
          return json({ jsonrpc: "2.0", id: msg.id, result: { tools, ...(page === 1 ? { nextCursor: "p2" } : {}) } });
        }
        if (msg.method === "tools/call") {
          const { name, arguments: args } = msg.params;
          state.calls.push({ name, args });
          if (name === "echo") return json({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `echo: ${args.text}` }] } });
          if (name === "delete_site") return json({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `deleted ${args.name}` }] } });
          if (name === "big") return json({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "x".repeat(40_000) }] } });
          if (name === "sse_echo") {
            const body =
              `: keepalive\n\n` +
              `event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}\n\n` +
              `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `sse: ${args.text}` }] } })}\n\n`;
            return new Response(body, { headers: { "content-type": "text/event-stream" } });
          }
          return json({ jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: `Unknown tool ${name}` } });
        }
        return json({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  origin = `http://127.0.0.1:${server.port}`;
  return { server, origin, url: `${origin}/mcp`, state, stop: () => server.stop(true) };
}
