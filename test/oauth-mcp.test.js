import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  callTool,
  discover,
  ensureFresh,
  finishAuth,
  isExpired,
  listTools,
  memoryStore,
  refresh,
  resetSessions,
  startAuth,
  safeFetch,
} from "../src/index.js";
import { startFakeServer } from "./fake-server.js";

const NET = { allowPrivate: true };
let fake;
let open;

beforeAll(() => {
  fake = startFakeServer();
  open = startFakeServer({ auth: false });
});
afterAll(() => {
  fake.stop();
  open.stop();
});

describe("discover", () => {
  test("auth-required server: WWW-Authenticate -> PRM -> AS metadata", async () => {
    const d = await discover(fake.url, NET);
    expect(d.url).toBe(fake.url);
    expect(typeof d.auth).toBe("object");
    expect(d.auth.issuer).toBe(fake.origin);
    expect(d.auth.authorization_endpoint).toBe(`${fake.origin}/authorize`);
    expect(d.auth.registration_endpoint).toBe(`${fake.origin}/register`);
    expect(d.auth.scopes).toEqual(["mcp"]);
    expect(d.auth.resource).toBe(fake.url);
    expect(d.auth.required).toBe(true);
  });

  test("authless server: name, instructions, auth none (HTML well-known ignored)", async () => {
    const d = await discover(open.url, NET);
    expect(d.name).toBe("Fake Hosting");
    expect(d.instructions).toBe("Fake server.");
    expect(d.auth).toBe("none");
  });

  test("refuses http and private targets by default", async () => {
    await expect(discover(fake.url)).rejects.toMatchObject({ code: "insecure_url" });
    await expect(discover("https://127.0.0.1/mcp")).rejects.toMatchObject({ code: "private_address" });
    await expect(discover("https://169.254.169.254/latest")).rejects.toMatchObject({ code: "private_address" });
    await expect(discover("https://[::1]/mcp")).rejects.toMatchObject({ code: "private_address" });
    await expect(discover("https://localhost/mcp")).rejects.toMatchObject({ code: "private_address" });
  });
});

describe("oauth + tools", () => {
  test("DCR once per issuer+redirect, PKCE code exchange, refresh, tools over JSON and SSE", async () => {
    const store = memoryStore();
    const server = await discover(fake.url, NET);
    const redirectUri = "https://app.example/api/v1/plugins/callback";
    const { authorizeUrl, pending } = await startAuth({ server, redirectUri, clientName: "Test", store, ...NET });
    const a = new URL(authorizeUrl);
    expect(a.searchParams.get("code_challenge_method")).toBe("S256");
    expect(a.searchParams.get("resource")).toBe(fake.url);
    expect(a.searchParams.get("scope")).toBe("mcp");
    expect(JSON.parse(JSON.stringify(pending))).toEqual(pending); // serializable
    expect(pending.client_id).toBe("client-1");

    const again = await startAuth({ server, redirectUri, clientName: "Test", store, ...NET });
    expect(again.pending.client_id).toBe("client-1");
    expect(fake.state.registrations).toBe(1);

    // Simulate the person signing in: the provider redirects back with code + state.
    const res = await fetch(authorizeUrl, { redirect: "manual" });
    const back = new URL(res.headers.get("location"));
    const code = back.searchParams.get("code");
    const state = back.searchParams.get("state");

    await expect(finishAuth({ pending, code, state: "wrong", redirectUri, ...NET })).rejects.toMatchObject({ code: "bad_state" });

    const tokens = await finishAuth({ pending, code, state, redirectUri, ...NET });
    expect(tokens.access_token).toStartWith("at-");
    expect(tokens.refresh_token).toStartWith("rt-");
    expect(tokens.client_id).toBe("client-1");

    const conn = { url: fake.url, token: tokens.access_token };
    const tools = await listTools(conn, NET);
    expect(tools.map((t) => t.name)).toEqual(["echo", "delete_site", "big", "sse_echo"]);

    const r = await callTool(conn, "echo", { text: "hi" }, NET);
    expect(r.text).toBe("echo: hi");
    expect(r.isError).toBe(false);

    const s = await callTool(conn, "sse_echo", { text: "yo" }, NET);
    expect(s.text).toBe("sse: yo");

    const big = await callTool(conn, "big", {}, NET);
    expect(big.text.length).toBe(40_000);
    expect(big.modelText.length).toBeLessThan(17_000);
    expect(big.modelText).toContain("[truncated:");

    await Bun.sleep(1100);
    expect(isExpired(tokens)).toBe(true);
    const fresh = await ensureFresh(tokens, NET);
    expect(fresh.refreshed).toBe(true);
    expect(fresh.tokens.refresh_token).toBe(tokens.refresh_token); // kept when not rotated
    const r2 = await callTool({ url: fake.url, token: fresh.tokens.access_token }, "echo", { text: "again" }, NET);
    expect(r2.text).toBe("echo: again");

    await expect(callTool({ url: fake.url, token: "nope" }, "echo", { text: "x" }, NET)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(refresh({ ...tokens, refresh_token: "bad" }, NET)).rejects.toMatchObject({ code: "token_failed" });
  });

  test("re-initializes when the session expires", async () => {
    resetSessions();
    const conn = { url: open.url };
    await listTools(conn, NET);
    open.state.sessions.clear();
    const r = await callTool(conn, "echo", { text: "back" }, NET);
    expect(r.text).toBe("echo: back");
  });

  test("an authenticated request never follows a redirect to another host", async () => {
    await expect(
      safeFetch(`${open.origin}/redirect-away`, { method: "POST", headers: { authorization: "Bearer secret" } }, NET),
    ).rejects.toMatchObject({ code: "cross_origin_redirect" });
  });
});
