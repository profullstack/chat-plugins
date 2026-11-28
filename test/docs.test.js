import { describe, expect, test } from "bun:test";
import { DEFAULT_PLUGINS, DOCS_CATALOG, mcpAddCommand, policyFor, resolvePluginInput } from "../src/index.js";

describe("docs plugins", () => {
  test("Microsoft Learn is on by default and needs no sign-in", () => {
    const ms = DOCS_CATALOG.find((e) => e.slug === "microsoft-learn");
    expect(ms.url).toBe("https://learn.microsoft.com/api/mcp");
    expect(ms.default).toBe(true);
    expect(ms.auth).toBe("none");
    expect(DEFAULT_PLUGINS.map((d) => d.slug)).toEqual(["mercury", "coinpay", "microsoft-learn", "pit-world", "cheapestwayz"]);
    // Not a money plugin: no confirmation policy applies.
    expect(policyFor(ms.url)).toBeNull();
  });

  test("pit.world web search is on by default and needs no sign-in", () => {
    const pit = DOCS_CATALOG.find((e) => e.slug === "pit-world");
    expect(pit.url).toBe("https://pit.world/mcp");
    expect(pit.default).toBe(true);
    expect(pit.auth).toBe("none");
    expect(policyFor(pit.url)).toBeNull();
    expect(mcpAddCommand(pit)).toBe("claude mcp add --transport http pit-world https://pit.world/mcp");
  });

  test("the add command is the documented one-liner, per CLI", () => {
    const ms = DOCS_CATALOG[0];
    expect(mcpAddCommand(ms)).toBe("claude mcp add --transport http microsoft-learn https://learn.microsoft.com/api/mcp");
    expect(mcpAddCommand(ms, "codex")).toBe("codex mcp add microsoft-learn --url https://learn.microsoft.com/api/mcp");
    expect(mcpAddCommand(ms, "opencode")).toBe("opencode mcp add microsoft-learn --url https://learn.microsoft.com/api/mcp");
  });

  test("the add command refuses anything a shell could misread", () => {
    expect(() => mcpAddCommand({ slug: "x; rm -rf /", url: "https://a.example/mcp" })).toThrow();
    expect(() => mcpAddCommand({ slug: "x", url: "https://a.example/mcp;id" })).toThrow();
    expect(() => mcpAddCommand({ slug: "x", url: "http://a.example/mcp" })).toThrow();
    expect(() => mcpAddCommand({ slug: "x", url: "https://a.example/$(id)" })).toThrow();
    expect(() => mcpAddCommand({ slug: "x", url: "https://a.example/mcp" }, "nope")).toThrow();
  });

  test("a catalog built from it resolves the slug", () => {
    expect(resolvePluginInput("microsoft-learn", DOCS_CATALOG)?.url).toBe("https://learn.microsoft.com/api/mcp");
  });
});
