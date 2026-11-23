// Types for @profullstack/chat-plugins

export interface NetOptions {
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
  /** Allow private/loopback targets and plain http (local dev, tests). Default false. */
  allowPrivate?: boolean;
  /** Allow http://localhost while still refusing other private targets. */
  allowHttpLocalhost?: boolean;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Response body cap in bytes. */
  maxBytes?: number;
  /** Extra caller check, run for every URL (including each redirect hop). Throw to refuse. */
  guard?: (url: URL) => void | Promise<void>;
  clientInfo?: { name: string; version: string };
}

export class PluginError extends Error {
  code: string;
  status?: number;
  constructor(message: string, info?: { code?: string; status?: number; cause?: unknown });
}

export interface Connection {
  url: string;
  token?: string;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  [k: string]: unknown;
}

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

export interface ToolResult {
  isError: boolean;
  content: unknown[];
  structuredContent?: unknown;
  /** Full text, for the UI. */
  text: string;
  /** Text capped (~16 KB) for the model. */
  modelText: string;
}

export interface AuthInfo {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes?: string[];
  /** RFC 8707 resource indicator sent on authorize and token requests. */
  resource?: string;
  /** false when the server answers without sign-in but offers it (more tools when signed in). */
  required?: boolean;
}

export interface DiscoveredServer {
  url: string;
  name: string;
  title: string;
  instructions: string;
  version?: string;
  auth: "none" | AuthInfo;
}

export interface ClientRecord {
  client_id: string;
  client_secret?: string;
  registered_at?: number;
  [k: string]: unknown;
}

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  /** ms since epoch */
  expires_at?: number;
  token_type?: string;
  scope?: string;
  client_id?: string;
  client_secret?: string;
  token_endpoint?: string;
  resource?: string;
}

/**
 * Persistence the caller supplies. Clients are cached per issuer+redirectUri
 * (key from clientKey()). Token methods are optional conveniences; tokens must be
 * stored encrypted at rest (see sealToken).
 */
export interface PluginStore {
  getClient(key: string): Promise<ClientRecord | null | undefined> | ClientRecord | null | undefined;
  setClient(key: string, client: ClientRecord): Promise<void> | void;
  deleteClient?(key: string): Promise<void> | void;
  getTokens?(slug: string): Promise<Tokens | null | undefined> | Tokens | null | undefined;
  setTokens?(slug: string, tokens: Tokens): Promise<void> | void;
  deleteTokens?(slug: string): Promise<void> | void;
}

export interface PendingAuth {
  v: 1;
  state: string;
  verifier: string;
  client_id: string;
  client_secret?: string;
  /** The plugin's MCP URL. */
  url: string;
  issuer: string;
  token_endpoint: string;
  resource?: string;
  redirect_uri: string;
  created_at: number;
}

export interface StartAuthOptions extends NetOptions {
  server: DiscoveredServer;
  redirectUri: string;
  clientName?: string;
  store: PluginStore;
  scopes?: string[];
  clientUri?: string;
  logoUri?: string;
  /** Pre-registered client id, used when the server has no registration endpoint. */
  clientId?: string;
}

export interface FinishAuthOptions extends NetOptions {
  pending: PendingAuth;
  code: string;
  state: string;
  redirectUri?: string;
}

export interface Plugin {
  slug: string;
  name?: string;
  url: string;
  token?: string;
  enabled?: boolean;
  tools: McpTool[];
}

export interface CatalogEntry {
  slug: string;
  name: string;
  url: string;
  description?: string;
  homepage?: string;
  icon?: string;
}

export interface OpenAITool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ApprovalCall {
  id: string;
  /** Namespaced tool name `<slug>__<tool>`. */
  name: string;
  plugin: string;
  pluginName: string;
  tool: string;
  title: string;
  arguments: Record<string, unknown>;
  annotations: ToolAnnotations;
  kind: "native" | "prompt";
}

export type ApprovalDecision = "allow" | "deny" | "pending";

export type LoopEvent =
  | { type: "tool_call"; id: string; name: string; plugin: string; tool: string; title: string; arguments: Record<string, unknown> }
  | {
      type: "tool_result";
      id: string;
      name: string;
      plugin: string;
      tool: string;
      isError: boolean;
      denied?: boolean;
      code?: string;
      text: string;
      modelText: string;
      content: unknown[];
      structuredContent?: unknown;
    }
  | { type: "approval_needed"; call: ApprovalCall }
  | { type: "text"; text: string };

export interface PendingApproval {
  call: ApprovalCall;
  remaining: ApprovalCall[];
  step: number;
  messages: any[];
}

export interface LoopResult {
  status: "done" | "pending";
  text: string;
  messages: any[];
  steps: number;
  exhausted?: boolean;
  pending?: PendingApproval;
}

export type ModelReply =
  | string
  | { content?: string | null; tool_calls?: any[] }
  | { choices: Array<{ message: any }> }
  | { message: any };

export interface ToolLoopOptions {
  messages: any[];
  plugins: Plugin[];
  /** The caller's model call. `tools` is undefined when tools should not be offered natively. */
  complete: (messages: any[], tools?: OpenAITool[]) => Promise<ModelReply> | ModelReply;
  maxSteps?: number;
  /** Default: () => "pending" (every gated call becomes an approval card). */
  approve?: (call: ApprovalCall) => ApprovalDecision | Promise<ApprovalDecision>;
  /**
   * "auto" (default): offer native tools AND the prompt protocol, accept either.
   * "prompt": models without tool calling (Ollama /api/chat etc.). "native": tools array only.
   */
  protocol?: "auto" | "native" | "prompt";
  onEvent?: (event: LoopEvent) => void | Promise<void>;
  /** Override how a tool is executed (tests, proxies). */
  callTool?: (plugin: Plugin, tool: string, args: Record<string, unknown>) => Promise<ToolResult>;
  net?: NetOptions;
  modelTextLimit?: number;
  /** Continue after an approval card: pass the PendingApproval and the person's decision. */
  resume?: { pending: PendingApproval; decision: "allow" | "deny" };
}

export const PROTOCOL_VERSION: string;
export const MODEL_TEXT_LIMIT: number;
export const MAX_TOOL_NAME: number;
export const PENDING_TTL_MS: number;
export const CATALOG: readonly CatalogEntry[];

export function discover(url: string, opts?: NetOptions): Promise<DiscoveredServer>;
export function startAuth(opts: StartAuthOptions): Promise<{ authorizeUrl: string; pending: PendingAuth }>;
export function finishAuth(opts: FinishAuthOptions): Promise<Tokens>;
export function refresh(tokens: Tokens, opts?: NetOptions): Promise<Tokens>;
export function ensureFresh(tokens: Tokens, opts?: NetOptions): Promise<{ tokens: Tokens; refreshed: boolean }>;
export function isExpired(tokens: Tokens | null | undefined, skewMs?: number): boolean;
export function memoryStore(): Required<PluginStore>;
export function clientKey(issuer: string, redirectUri: string): string;
export function pkceChallenge(verifier: string): Promise<string>;
export function randomToken(bytes?: number): string;

export function initialize(conn: Connection, opts?: NetOptions): Promise<{ info: any; sessionId?: string }>;
export function listTools(conn: Connection, opts?: NetOptions & { maxTools?: number }): Promise<McpTool[]>;
export function callTool(
  conn: Connection,
  name: string,
  args?: Record<string, unknown>,
  opts?: NetOptions & { modelTextLimit?: number },
): Promise<ToolResult>;
export function contentToText(content: unknown[], structured?: unknown): string;
export function truncateForModel(text: string, limit?: number): string;
export function parseSse(text: string, id: number | string): any;
export function resetSessions(conn?: Connection): void;

export function toOpenAITools(plugins: Plugin[]): OpenAITool[];
export function toolName(slug: string, tool: string): string;
export function buildToolIndex(plugins: Plugin[]): Map<string, { plugin: Plugin; tool: McpTool; name: string }>;
export function resolveTool(
  index: Map<string, { plugin: Plugin; tool: McpTool; name: string }>,
  name: string,
): { plugin: Plugin; tool: McpTool; name: string } | null;
export function needsApproval(tool: McpTool): boolean;
export function slugify(input: string): string;

export function runToolLoop(opts: ToolLoopOptions): Promise<LoopResult & { events: LoopEvent[] }>;
export function iterateToolLoop(opts: ToolLoopOptions): AsyncGenerator<LoopEvent, LoopResult>;
export function parseToolCall(text: string): { name: string; arguments: Record<string, unknown>; before: string } | null;
export function normalizeReply(reply: ModelReply): { content: string; tool_calls: Array<{ id?: string; name: string; arguments: Record<string, unknown> }> };
export function toolPrompt(plugins: Plugin[]): string;
export function wrapToolResult(name: string, text: string, isError: boolean): string;

export function makeCatalog(extra?: CatalogEntry[], opts?: { replace?: boolean }): CatalogEntry[];
export function resolvePluginInput(
  input: string,
  catalog?: readonly CatalogEntry[],
): { slug: string; url: string; name: string; entry?: CatalogEntry } | null;
export function uniqueSlug(base: string, taken: Iterable<string>): string;

export function sealToken(secret: string | object, key: string | Uint8Array): Promise<string>;
export function openToken(sealed: string, key: string | Uint8Array): Promise<any>;

export function assertSafeUrl(url: string | URL, opts?: NetOptions): Promise<URL>;
export function isPrivateAddress(ip: string): boolean;
export function isLocalHostname(host: string): boolean;
export function safeFetch(
  url: string | URL,
  init?: RequestInit & { headers?: Record<string, string> },
  opts?: NetOptions,
): Promise<{ res: Response; url: URL; done: () => void }>;
export function fetchJson(
  url: string | URL,
  init?: RequestInit & { headers?: Record<string, string> },
  opts?: NetOptions & { soft?: boolean },
): Promise<any>;
export function parseWwwAuthenticate(header: string): Record<string, string>;
export function protectedResourceCandidates(resource: URL): string[];
export function authServerCandidates(issuer: string): string[];

// ── money plugins (src/money.js) ────────────────────────────────────────────

export type MoneyKind = "banking" | "crypto" | "trading";
export type TradingMode = "paper" | "live";
export interface PluginPolicy {
  slug: string;
  kind: MoneyKind;
  /** Tools that only read. Exact names; anything else asks first. */
  readOnly: ReadonlySet<string>;
  /** OAuth scopes to ask for instead of everything the server offers. */
  scopes?: string[];
  /** Brokerage: tools that place, change or cancel PAPER orders. */
  paperWrites?: ReadonlySet<string>;
}
export interface FinanceCatalogEntry {
  slug: string;
  name: string;
  url: string;
  description: string;
  homepage: string;
  icon: string;
  /** On for every account (listed and switched on, not signed in). */
  default: boolean;
}
export interface ActionSummary {
  title: string;
  lines: { label: string; value: string }[];
  account?: TradingMode;
  note?: string;
}
export const MODEL_CAN_BE_WRONG: string;
export const FINANCE_CATALOG: readonly FinanceCatalogEntry[];
export const DEFAULT_PLUGINS: readonly FinanceCatalogEntry[];
export const POLICIES: Record<string, PluginPolicy>;
export function policyFor(url: string): PluginPolicy | null;
export function needsConfirmation(policy: PluginPolicy, tool: string): boolean;
export function visibleInMode(policy: PluginPolicy, tool: string, mode: TradingMode): boolean;
export function applyPolicy<T extends { name: string; annotations?: object }>(policy: PluginPolicy | null, tools: T[], mode?: TradingMode): T[];
export function describeAction(policy: PluginPolicy | null, tool: string, args: Record<string, unknown>): ActionSummary | null;
/** Shown as the Amount when the arguments do not pin the amount down; the raw line items or arguments follow. */
export const AMOUNT_SEE_DETAILS: string;
/** CoinPay-style invoice totals in integer cents: subtotal, discount (percent|fixed), per-line tax_rate on the discounted share, total. `{ error }` when the input is ambiguous. */
export function invoiceTotals(
  items: unknown,
  discount?: unknown
): { error: string } | { error?: undefined; subtotal: bigint; discount: bigint; discountLabel: string; tax: bigint; taxedLines: number; total: bigint; lines: unknown[] };
export function redactLog(v: unknown): string;
