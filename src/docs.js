// Docs plugins: public, read-only documentation servers that need no sign-in.
// Entries with `default: true` are on for every account in apps that seed
// DEFAULT_PLUGINS (c0mpute chat, Infernet chat). `auth: "none"` tells the app
// to seed the row as ready to use, not as "needs sign-in".
//
// No Node imports: this also runs in the browser.

/** @type {readonly import("../index.js").DocsCatalogEntry[]} */
export const DOCS_CATALOG = Object.freeze([
  Object.freeze({
    slug: "microsoft-learn",
    name: "Microsoft Learn (docs)",
    url: "https://learn.microsoft.com/api/mcp",
    description:
      "Official Microsoft and Azure documentation in chat: search the docs, find code samples and read full pages as markdown. Read-only, no sign-in.",
    homepage: "https://learn.microsoft.com",
    icon: "https://learn.microsoft.com/favicon.ico",
    default: true,
    auth: "none",
  }),
]);

/**
 * The one-line command that registers a catalog entry in a coding agent's CLI,
 * e.g. `claude mcp add --transport http microsoft-learn https://learn.microsoft.com/api/mcp`.
 * @param {{ slug: string, url: string }} entry
 * @param {"claude" | "gemini" | "qwen" | "codex" | "opencode"} [cli]
 */
export function mcpAddCommand(entry, cli = "claude") {
  const slug = String(entry?.slug || "");
  const url = String(entry?.url || "");
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) throw new Error("mcpAddCommand: bad slug");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("mcpAddCommand: bad url");
  }
  if (parsed.protocol !== "https:" || /[\s'"`$\;&|<>()]/.test(url)) throw new Error("mcpAddCommand: bad url");
  if (cli === "codex" || cli === "opencode") return `${cli} mcp add ${slug} --url ${url}`;
  if (cli === "claude" || cli === "gemini" || cli === "qwen") return `${cli} mcp add --transport http ${slug} ${url}`;
  throw new Error(`mcpAddCommand: unknown cli ${cli}`);
}
