// Tool naming and the OpenAI `tools` array.

/** Plugin slug: lowercase [a-z0-9-], 1-32 chars, never contains "__". @param {string} input */
export function slugify(input) {
  const s = String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return s || "plugin";
}

/** @param {string} s */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const MAX_TOOL_NAME = 64;

/**
 * Namespaced tool name `<slug>__<tool>`, [a-zA-Z0-9_-], at most 64 chars.
 * Deterministic, so a name can be resolved again later.
 * @param {string} slug
 * @param {string} tool
 */
export function toolName(slug, tool) {
  const clean = `${slugify(slug)}__${String(tool).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  if (clean.length <= MAX_TOOL_NAME) return clean;
  const hash = fnv1a(`${slug}\u0000${tool}`);
  return `${clean.slice(0, MAX_TOOL_NAME - 9)}_${hash}`;
}

/**
 * @param {import("../index.js").Plugin[]} plugins
 * @returns {Map<string, { plugin: import("../index.js").Plugin, tool: import("../index.js").McpTool, name: string }>}
 */
export function buildToolIndex(plugins) {
  const map = new Map();
  for (const plugin of plugins || []) {
    if (!plugin || plugin.enabled === false) continue;
    for (const tool of plugin.tools || []) {
      const name = toolName(plugin.slug, tool.name);
      if (!map.has(name)) map.set(name, { plugin, tool, name });
    }
  }
  return map;
}

/**
 * Find a tool by the name a model used: the namespaced name, a bare tool name that
 * is unique across plugins, or `slug.tool` / `slug/tool`; case-insensitive.
 * @param {ReturnType<typeof buildToolIndex>} index
 * @param {string} name
 */
export function resolveTool(index, name) {
  if (!name) return null;
  const n = String(name).trim();
  if (index.has(n)) return index.get(n) || null;
  const lower = n.toLowerCase();
  for (const [k, v] of index) if (k.toLowerCase() === lower) return v;
  const alt = lower.replace(/[./:]/, "__");
  for (const [k, v] of index) if (k.toLowerCase() === alt) return v;
  const bare = [...index.values()].filter((v) => v.tool.name.toLowerCase() === lower);
  return bare.length === 1 ? bare[0] : null;
}

/** JSON Schema for parameters, always an object schema. @param {any} schema */
function paramsSchema(schema) {
  if (!schema || typeof schema !== "object" || schema.type !== "object") {
    return { type: "object", properties: {} };
  }
  const { $schema, ...rest } = schema;
  return { properties: {}, ...rest };
}

/**
 * OpenAI chat-completions `tools` array for every enabled plugin's tools.
 * @param {import("../index.js").Plugin[]} plugins
 */
export function toOpenAITools(plugins) {
  const out = [];
  for (const { plugin, tool, name } of buildToolIndex(plugins).values()) {
    const label = plugin.name || plugin.slug;
    const desc = [tool.title && tool.title !== tool.name ? tool.title : "", tool.description || ""].filter(Boolean).join(": ");
    out.push({
      type: "function",
      function: {
        name,
        description: `[${label}] ${desc}`.slice(0, 1024),
        parameters: paramsSchema(tool.inputSchema),
      },
    });
  }
  return out;
}

/**
 * Does calling this tool need the person's OK first?
 * destructiveHint === true, or not read-only and open-world.
 * @param {import("../index.js").McpTool} tool
 */
export function needsApproval(tool) {
  const a = tool?.annotations || {};
  if (a.destructiveHint === true) return true;
  if (a.readOnlyHint !== true && a.openWorldHint === true) return true;
  return false;
}
