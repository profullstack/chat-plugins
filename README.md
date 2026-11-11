# @profullstack/chat-plugins

Plugins for chat apps, with fewer hoops than "connectors". A plugin is a remote
[MCP](https://modelcontextprotocol.io) server. A person pastes a URL (or picks one from
a short catalog), signs in on the provider's own page if it asks, and the plugin's tools
are usable by the model in chat. No developer mode, no client id/secret forms, no manual
OAuth setup: the client registers itself (RFC 7591), uses PKCE S256, and refreshes tokens.

- Zero dependencies. ESM. Node 20+, Bun, Deno, Workers (WebCrypto + fetch).
- Streamable HTTP MCP client (protocol 2025-06-18): JSON and SSE responses, `Mcp-Session-Id`.
- An agent loop that works with models that have **no native tool calling** (a prompt
  protocol with a robust parser) and with native OpenAI-style `tool_calls`.
- Approval cards for destructive tools.
- Safe by default on servers: https only, SSRF guard (DNS resolved, private ranges refused),
  bearer tokens never follow a redirect to another host, response size caps, tool results
  passed to the model as data and never as instructions.

```sh
npm i @profullstack/chat-plugins
```

## Add a plugin

```js
import { resolvePluginInput, discover, startAuth, finishAuth, listTools, sealToken } from "@profullstack/chat-plugins";

const input = resolvePluginInput("c0mpute");          // or a URL: "https://example.com/mcp"
const server = await discover(input.url);             // { name, title, instructions, auth }

if (server.auth === "none") {
  const tools = await listTools({ url: server.url }); // done
} else {
  // store: your persistence for registered clients (getClient/setClient)
  const { authorizeUrl, pending } = await startAuth({
    server, redirectUri: "https://app.example/api/v1/plugins/callback", clientName: "My chat", store,
  });
  // keep `pending` server-side (keyed by pending.state), open authorizeUrl in a popup
}

// in the callback route:
const tokens = await finishAuth({ pending, code, state });
await db.save(slug, await sealToken(tokens, process.env.PLUGIN_TOKEN_KEY)); // AES-256-GCM at rest
```

`auth.required === false` means the server works without sign-in but offers it (more
tools when signed in).

## Use plugins in chat

```js
import { runToolLoop, ensureFresh } from "@profullstack/chat-plugins";

const plugins = [{ slug: "c0mpute", name: "c0mpute hosting", url, token, tools }];

const result = await runToolLoop({
  messages,
  plugins,
  protocol: "prompt",                 // "auto" (default) | "native" | "prompt"
  complete: (messages, tools) => myModel(messages, tools), // string, OpenAI completion, or message
  approve: (call) => "pending",       // "allow" | "deny" | "pending"
  onEvent: (e) => send(e),            // tool_call | tool_result | approval_needed | text
});

if (result.status === "pending") {
  // show an approval card for result.pending.call; later:
  await runToolLoop({ messages: result.pending.messages, resume: { pending: result.pending, decision: "allow" }, plugins, complete });
}
```

Tools are named `<slug>__<tool>` (at most 64 chars, `[a-zA-Z0-9_-]`). `toOpenAITools(plugins)`
gives the OpenAI `tools` array. A tool needs approval when `annotations.destructiveHint === true`,
or when it is not read-only and `openWorldHint === true`.

**Prompt protocol.** For models without tool calling, the loop adds a system prompt listing
the tools with their JSON schemas. The model replies with one block:

````
```tool_call
{"name": "c0mpute__list_sites", "arguments": {}}
```
````

The parser also accepts `<tool_call>` tags, `json` fences that contain a call, alternate keys
(`tool`/`args`/`input`, `function: {name, arguments}`), stringified arguments, trailing commas,
an unclosed final fence, and ignores calls drafted inside `<think>`. Results go back as a
user message inside `<tool_result>` with a note that it is data, not instructions. With
`protocol: "auto"` both native `tool_calls` and the block are accepted.

Tool results keep the full text for the UI (`text`) and a ~16 KB cut for the model (`modelText`).

## Catalog

`CATALOG` ships c0mpute hosting and ThreatCrush. `makeCatalog(extra, { replace })` merges your
own entries (an entry with an empty `url` removes a built-in one).

## Server-side safety

Every request goes through `safeFetch`: https only (`allowHttpLocalhost` for dev,
`allowPrivate` for tests), hostnames resolved and checked against private, loopback,
link-local, CGNAT, multicast and reserved ranges, redirects re-checked hop by hop, and an
`Authorization` header never forwarded across origins. `guard(url)` adds your own check.

## License

MIT
