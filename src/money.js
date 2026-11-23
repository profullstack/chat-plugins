// Money plugins: catalog entries for banking (Mercury), crypto payments
// (CoinPay) and brokerage (moomoo), which of them apps turn on by default,
// and the confirmation gate for their tools.
//
// The gate is meant for the app's tool-call layer, not a prompt: for a plugin
// with a policy, a tool may run on its own only when its exact name is on that
// plugin's read-only allowlist. applyPolicy() marks every other tool (a write,
// or a name never seen) destructiveHint: true before the tool loop sees it, so
// needsApproval() is true and the loop stops for the person. A server's own
// annotations cannot loosen it. Policies are chosen by server URL, not slug.
//
// Shared by c0mpute chat and Infernet chat so the two cannot drift. No Node
// imports: describeAction() also runs in the browser.

export const MODEL_CAN_BE_WRONG = "The model can be wrong. You decide: nothing here runs until you approve it.";
export const FINANCE_CATALOG = Object.freeze([
  {
    slug: "mercury",
    name: "Mercury (business banking)",
    url: "https://mcp.mercury.com/mcp",
    description: "Your Mercury accounts in chat: balances, transactions, recipients, cards, statements and cash flow. Payment and transfer requests need your approval here and still go through Mercury's own approval. Sign in with your Mercury account.",
    homepage: "https://mercury.com",
    icon: "https://mercury.com/favicon.ico",
    default: true
  },
  {
    slug: "coinpay",
    name: "CoinPay (crypto payments)",
    url: "https://coinpayportal.com/api/mcp",
    description: "Your CoinPay business in chat: crypto invoices, receivables aging, projects, contractors and pay runs. Creating anything needs your approval first. Sign in with your CoinPay account.",
    homepage: "https://coinpayportal.com",
    icon: "https://coinpayportal.com/favicon.ico",
    default: true
  },
  {
    slug: "moomoo",
    name: "moomoo (brokerage and trading)",
    url: "https://mcp.moomoo.com/mcp",
    description: "Quotes, charts, screeners, news and your moomoo positions, balances and orders. Starts on paper trading; switching to live is your call, and every order needs your approval. The model can be wrong and you decide. Sign in with your moomoo account.",
    homepage: "https://www.moomoo.com",
    icon: "https://www.moomoo.com/favicon.ico",
    default: false
  }
]);
export const DEFAULT_PLUGINS = FINANCE_CATALOG.filter((e) => e.default);
const MERCURY_READ = new Set([
  "getCurrentDate",
  "getAccount",
  "getAccounts",
  "getAccountCards",
  "getAccountStatements",
  "getTransaction",
  "getTransactionById",
  "listTransactions",
  "getCashflowSummary",
  "getAutoTransferRules",
  "listCategories",
  "listCredit",
  "getCreditAccountStatements",
  "getOrganization",
  "getRecipient",
  "getRecipients",
  "getRecipientInvite",
  "listRecipientInvites",
  "listRecipientsAttachments",
  "getTreasury",
  "getTreasuryTransactions",
  "getInvest",
  "getInvestActivity",
  "getCard",
  "listCards",
  "listMerchants",
  "getUser",
  "getUsers",
  "getWebhook",
  "getWebhooks",
  "listSendMoneyApprovalRequests",
  "getSendMoneyApprovalRequest",
  "listTransferMoneyApprovalRequests",
  "getTransferMoneyApprovalRequest",
  "listTasks",
  "getTask",
  "getSafeRequest",
  "getSafeRequests",
  "getAttachment",
  "getCustomer",
  "listCustomers",
  "listProducts",
  "getInvoice",
  "listInvoices",
  "listInvoiceAttachments",
  "listInvoicePayments",
  "listBudgets",
  "getBudget",
  "getBudgetMembers",
  "getBudgetExpenditures",
  "listReceipts",
  "getReceipt",
  "listReimbursements",
  "getReimbursement",
  "getBooksInstances",
  "getBooksSourceAccounts",
  "getBooksTransactions",
  "getBooksTransaction",
  "getBooksLedgers",
  "getBooksLedger",
  "getBooksLedgerBalances",
  "getBooksLineEntries",
  "listBooksJournalEntries",
  "retrieveBooksJournalEntry",
  "getBooksTagGroups",
  "getBooksTags",
  "getBooksCategorizationRules",
  "getBooksProfitAndLoss",
  "getBooksBalanceSheet",
  "getBooksCashFlow",
  "getBooksBills",
  "getBooksBill",
  "getBooksInvoices",
  "getBooksInvoice"
]);
const COINPAY_READ = new Set([
  "invoice_list",
  "invoice_get",
  "invoice_ar_aging",
  "project_list",
  "project_get",
  "contractor_list",
  "contractor_get",
  "contractor_work_list",
  "pay_run_list",
  "pay_run_get",
  "document_list",
  "document_get"
]);
const MOOMOO_READ = new Set([
  "account_authorized_trd_accs",
  "account_funds",
  "account_positions",
  "account_orders_active",
  "account_orders_history",
  "account_orders_detail",
  "account_order_fills_today",
  "account_fills_history",
  "account_trading_info",
  "sim_trade_account_list",
  "sim_trade_cash_info",
  "sim_trade_position_list",
  "sim_trade_history_order_list",
  "sim_trade_max_buy_sell",
  "quote_market_snapshot",
  "quote_market_state",
  "quote_stock_quote",
  "quote_stock_feed",
  "quote_stock_basicinfo",
  "quote_stock_screen",
  "quote_option_screen",
  "quote_warrant_screen",
  "quote_rt_ticker",
  "quote_rt_data",
  "quote_order_book",
  "quote_cur_kline",
  "quote_history_kline",
  "quote_trading_days",
  "quote_top_ten_brokers",
  "quote_capital_flow",
  "quote_capital_flow_history",
  "quote_capital_distribution",
  "quote_plate_list",
  "quote_plate_stock",
  "quote_owner_plate",
  "quote_referencefuture_list",
  "quote_future_info",
  "quote_option_chain",
  "quote_option_expiration_date",
  "quote_option_volatility",
  "quote_option_exercise_probability",
  "quote_user_security",
  "quote_user_security_group",
  "quote_valuation_detail",
  "quote_valuation_plate_stock_list",
  "quote_valuation_index_stock_plate_list",
  "quote_valuation_index_component_stock_list",
  "quote_financials_statements",
  "quote_financials_revenue_breakdown",
  "quote_financials_earnings_price_history",
  "quote_company_profile",
  "quote_company_executives",
  "quote_company_executive_background",
  "quote_company_operational_efficiency",
  "quote_corporate_actions_dividends",
  "quote_corporate_actions_stock_splits",
  "quote_corporate_actions_buybacks",
  "quote_corporate_actions_rehab",
  "quote_shareholders_overview",
  "quote_shareholders_institutional",
  "quote_shareholders_holding_changes",
  "quote_shareholders_holder_detail",
  "quote_insider_trade_list",
  "quote_insider_holder_list",
  "quote_short_interest",
  "quote_daily_short_volume",
  "quote_research_rating_summary",
  "quote_research_analyst_consensus",
  "quote_research_morningstar_report",
  "quote_news_search",
  "quote_community_search",
  "quote_economic_calendar_search",
  "quote_economic_calendar_hot",
  "quote_ipo_list_us",
  "quote_ipo_list_hk",
  "quote_ipo_list_cn",
  "quote_ipo_list_sg",
  "quote_ipo_list_my"
]);
const MOOMOO_PAPER_WRITES = new Set(["sim_trade_input_order", "sim_trade_modify_order", "sim_trade_cancel_order"]);
export const POLICIES = {
  mercury: {
    slug: "mercury",
    kind: "banking",
    readOnly: MERCURY_READ,
    scopes: ["read", "offline_access", "transactions:request", "transfers:request"]
  },
  coinpay: { slug: "coinpay", kind: "crypto", readOnly: COINPAY_READ },
  moomoo: { slug: "moomoo", kind: "trading", readOnly: MOOMOO_READ, paperWrites: MOOMOO_PAPER_WRITES }
};
function parse(u) {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}
export function policyFor(url) {
  const u = parse(url);
  if (!u)
    return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "mcp.mercury.com")
    return POLICIES.mercury;
  if (host === "mcp.moomoo.com")
    return POLICIES.moomoo;
  if (host === "coinpayportal.com" || host === "www.coinpayportal.com")
    return POLICIES.coinpay;
  return null;
}
export function needsConfirmation(policy, tool) {
  return !policy.readOnly.has(tool);
}
export function visibleInMode(policy, tool, mode) {
  if (policy.kind !== "trading" || mode === "live")
    return true;
  return policy.readOnly.has(tool) || !!policy.paperWrites?.has(tool);
}
export function applyPolicy(policy, tools, mode = "paper") {
  if (!policy)
    return tools;
  return tools.filter((t) => visibleInMode(policy, t.name, mode)).map((t) => needsConfirmation(policy, t.name) ? { ...t, annotations: { ...t.annotations ?? {}, readOnlyHint: false, destructiveHint: true } } : { ...t, annotations: { ...t.annotations ?? {}, readOnlyHint: true, destructiveHint: false } });
}
const str = (v) => v === undefined || v === null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
// Keys that hold an adjustment to an amount rather than the amount itself.
const ADJUSTMENT_KEY = /discount|tax|fee|tip|coupon|rebate|credit|adjust|shipping/i;
function pick(args, names) {
  const norm = (k) => k.toLowerCase().replace(/[_-]/g, "");
  const want = names.map(norm);
  const scan = (o) => {
    for (const w of want) {
      for (const [k, v] of Object.entries(o))
        if (norm(k) === w && v !== undefined && v !== null && v !== "")
          return str(v);
    }
    return "";
  };
  const top = scan(args);
  if (top)
    return top;
  // One level down for wrapped arguments ({ payment: { amount } }), but never
  // into a discount, tax or fee object: its `value`/`amount` is an adjustment,
  // not what the action moves.
  for (const [k, v] of Object.entries(args)) {
    if (ADJUSTMENT_KEY.test(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = scan(v);
      if (inner)
        return inner;
    }
  }
  return "";
}
function humanTool(tool) {
  const s = tool.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const num = (s) => {
  if (!s)
    return null;
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
function tradingSummary(tool, args) {
  const paper = tool.startsWith("sim_trade_");
  const lines = [];
  const add = (label, value) => {
    if (value)
      lines.push({ label, value });
  };
  const isCancel = /cancel/.test(tool);
  const isChange = /modify|replace/.test(tool);
  const isPlace = !isCancel && !isChange && /order|place|confirm/.test(tool);
  const title = isCancel ? "Cancel order" : isChange ? "Change order" : /confirm/.test(tool) ? "Confirm order" : isPlace ? "Place order" : humanTool(tool);
  add("Symbol", pick(args, ["code", "symbol", "ticker", "security"]));
  add("Side", pick(args, ["side", "trd_side", "direction"]));
  const qty = pick(args, ["qty", "quantity", "new_qty", "shares"]);
  add("Quantity", qty);
  const type = pick(args, ["order_type", "type"]);
  add("Order type", type);
  const price = pick(args, ["price", "limit_price", "new_price"]);
  add("Limit price", price);
  add("Stop / trigger price", pick(args, ["aux_price", "stop_price", "trigger_price"]));
  add("Time in force", pick(args, ["time_in_force", "tif"]));
  add("Order id", pick(args, ["order_id", "confirm_id"]));
  if (isPlace || isChange) {
    const q = num(qty);
    const p = num(price);
    lines.push({
      label: "Estimated cost",
      value: q !== null && p !== null && !/MARKET/i.test(type) ? `${(q * p).toLocaleString("en-US", { maximumFractionDigits: 4 })} (quantity x price, before fees; options and futures also multiply by the contract size)` : "at the market price, not known until it fills"
    });
  }
  add("Account id", pick(args, ["acc_id", "account_id"]));
  lines.push({ label: "Account", value: paper ? "PAPER (simulated, no real money)" : "LIVE (real money)" });
  return { title, lines, account: paper ? "paper" : "live", note: MODEL_CAN_BE_WRONG };
}
// Invoice arithmetic in integer cents, the same as CoinPay's server
// (computeInvoiceTotals): subtotal of quantity x unit_price, then the discount
// (percent of the subtotal, or a fixed amount), then each line's tax_rate on
// its share of the discounted subtotal. Returns { error } instead of a number
// whenever the arguments do not pin the total down.
const toNum = (v) => typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" && v.trim() !== "" ? num(v) : null;
const cents = (n) => BigInt(Math.round(n * 100));
const divRound = (a, b) => (a * 2n + b) / (b * 2n);
const money = (c) => (Number(c) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
export function invoiceTotals(items, discount) {
  if (!Array.isArray(items) || items.length === 0) return { error: "no line items" };
  const lines = [];
  for (const [i, it] of items.entries()) {
    if (!it || typeof it !== "object" || Array.isArray(it)) return { error: `line ${i + 1} is not an item` };
    const q = toNum(it.quantity);
    const p = toNum(it.unit_price ?? it.unitPrice);
    const r = it.tax_rate ?? it.taxRate;
    const rate = r === undefined || r === null || r === "" ? 0 : toNum(r);
    if (q === null || q < 0) return { error: `line ${i + 1} has no usable quantity` };
    if (p === null || p < 0) return { error: `line ${i + 1} has no usable unit_price` };
    if (rate === null || rate < 0) return { error: `line ${i + 1} has an unusable tax_rate` };
    lines.push({ c: divRound(BigInt(Math.round(q * 1e4)) * cents(p), 10000n), rate, q, p, d: it.description });
  }
  const subtotal = lines.reduce((s, l) => s + l.c, 0n);
  let off = 0n;
  let discountLabel = "";
  if (discount !== undefined && discount !== null) {
    const type = discount && typeof discount === "object" ? discount.type : undefined;
    const value = discount && typeof discount === "object" ? toNum(discount.value) : null;
    if ((type !== "percent" && type !== "fixed") || value === null || value < 0) return { error: "the discount is not {type: percent|fixed, value}" };
    if (type === "percent" && value > 100) return { error: "the discount is over 100%" };
    off = type === "percent" ? divRound(subtotal * BigInt(Math.round(value * 1000)), 100000n) : cents(value);
    if (off > subtotal) return { error: "the discount is larger than the subtotal" };
    discountLabel = type === "percent" ? `${value}% = -${money(off)}` : `fixed -${money(off)}`;
  }
  const share = lines.map(() => 0n);
  if (off > 0n) {
    let given = 0n;
    let last = -1;
    lines.forEach((l, i) => {
      if (l.c === 0n) return;
      last = i;
      share[i] = (l.c * off) / subtotal;
      given += share[i];
    });
    share[last] += off - given;
  }
  const tax = lines.reduce((s, l, i) => s + (l.rate ? divRound((l.c - share[i]) * BigInt(Math.round(l.rate * 1000)), 100000n) : 0n), 0n);
  const taxed = lines.filter((l) => l.rate).length;
  return { subtotal, discount: off, discountLabel, tax, taxedLines: taxed, total: subtotal - off + tax, lines };
}
function describeLines(items) {
  const parts = items.map((it) => {
    if (!it || typeof it !== "object") return str(it);
    const d = str(it.description ?? it.name ?? "");
    return `${str(it.quantity)} x ${str(it.unit_price ?? it.unitPrice)}${d ? ` ${d}` : ""}${it.tax_rate ? ` (+${str(it.tax_rate)}% tax)` : ""}`;
  });
  const s = parts.join("; ");
  return s.length > 300 ? `${s.slice(0, 299)}…` : s;
}
const raw = (v) => {
  const s = str(v);
  return s.length > 500 ? `${s.slice(0, 499)}…` : s;
};
export const AMOUNT_SEE_DETAILS = "see details";
function moneySummary(kind, tool, args) {
  const lines = [];
  const add = (label, value) => {
    if (value)
      lines.push({ label, value });
  };
  const given = pick(args, ["amount", "amountUsd", "value", "total", "paymentAmount"]);
  let currency = pick(args, ["currency", "currencyCode", "asset", "coin"]);
  const items = args.lineItems ?? args.line_items;
  if (typeof args.minutes === "number")
    add("Time", `${args.minutes} minutes`);
  if (items !== undefined) {
    // An itemised invoice: the amount is what the items add up to, never a
    // number found elsewhere in the arguments.
    const t = invoiceTotals(items, args.discount);
    if (t.error || (given && (num(given) === null || cents(num(given)) !== t.total))) {
      add("Amount", `${AMOUNT_SEE_DETAILS} (${t.error ?? `the amount given (${given}) does not match the line items`})`);
      add("Line items", raw(items));
      if (args.discount !== undefined) add("Discount", raw(args.discount));
    } else {
      const n = t.lines.length;
      add("Subtotal", `${money(t.subtotal)} (${n} line item${n === 1 ? "" : "s"})`);
      add("Discount", t.discountLabel);
      if (t.taxedLines) add("Tax", `+${money(t.tax)} (on ${t.taxedLines} of ${n} line${n === 1 ? "" : "s"})`);
      const how = [`${money(t.subtotal)} subtotal`];
      if (t.discount > 0n) how.push(`- ${money(t.discount)} discount`);
      if (t.taxedLines) how.push(`+ ${money(t.tax)} tax`);
      add("Amount", `${money(t.total)} total${how.length > 1 ? ` (${how.join(" ")})` : ""}`);
      add("Line items", describeLines(items));
    }
    if (!currency) currency = "USD";
  } else {
    // A discount, tax or fee next to an amount leaves it unclear whether the
    // amount is before or after it: show the arguments instead of a guess.
    const adjustments = Object.keys(args).filter((k) => ADJUSTMENT_KEY.test(k) && args[k] !== null && args[k] !== undefined && args[k] !== "");
    if (adjustments.length) {
      add("Amount", AMOUNT_SEE_DETAILS);
      add("Details", raw(args));
    } else {
      add("Amount", given);
    }
  }
  add("Currency", currency);
  add("From", pick(args, ["fromAccountId", "sourceAccountId", "from", "accountId", "fromAccount", "businessId", "fromWallet"]));
  add("To", pick(args, ["recipientId", "toAccountId", "destinationAccountId", "to", "recipient", "toAddress", "address", "clientId", "contractorId", "projectId"]));
  add("Memo", pick(args, ["memo", "note", "notes", "externalMemo", "description", "purpose", "remark"]));
  add("Payment method", pick(args, ["paymentMethod", "method", "network", "chain"]));
  return {
    title: humanTool(tool),
    lines,
    note: kind === "banking" ? "Mercury payment and transfer requests still need an approver in Mercury." : MODEL_CAN_BE_WRONG
  };
}
export function describeAction(policy, tool, args) {
  if (!policy)
    return null;
  const a = args && typeof args === "object" ? args : {};
  return policy.kind === "trading" ? tradingSummary(tool, a) : moneySummary(policy.kind, tool, a);
}
export function redactLog(v) {
  const s = v instanceof Error ? `${v.name}: ${v.message}` : typeof v === "string" ? v : (() => {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  })();
  return s.replace(/(bearer\s+)\S+/gi, "$1[redacted]").replace(/("?(?:access_token|refresh_token|id_token|client_secret|code|code_verifier|token|password|secret)"?\s*[:=]\s*"?)[^"&\s,}]+/gi, "$1[redacted]").replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[jwt]").replace(/[A-Za-z0-9_\-+/=]{32,}/g, "[opaque]").replace(/\d[\d -]{6,}\d/g, "[number]").replace(/[$€£]\s?\d[\d,]*(\.\d+)?/g, "[amount]").slice(0, 500);
}
