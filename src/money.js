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
  for (const v of Object.values(args)) {
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
function moneySummary(kind, tool, args) {
  const lines = [];
  const add = (label, value) => {
    if (value)
      lines.push({ label, value });
  };
  let amount = pick(args, ["amount", "amountUsd", "value", "total", "paymentAmount"]);
  let currency = pick(args, ["currency", "currencyCode", "asset", "coin"]);
  const items = Array.isArray(args.lineItems) ? args.lineItems : null;
  if (!amount && items) {
    const t = items.reduce((s, i) => s + (Number(i?.quantity) || 0) * (Number(i?.unit_price) || 0), 0);
    amount = `${t.toLocaleString("en-US", { maximumFractionDigits: 8 })} before tax and discount (${items.length} line item${items.length === 1 ? "" : "s"})`;
    if (!currency)
      currency = "USD";
  }
  if (typeof args.minutes === "number")
    add("Time", `${args.minutes} minutes`);
  add("Amount", amount);
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
