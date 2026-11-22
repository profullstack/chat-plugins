import { describe, expect, test } from "bun:test";
import { applyPolicy, DEFAULT_PLUGINS, describeAction, FINANCE_CATALOG, needsApproval, needsConfirmation, POLICIES, policyFor, redactLog } from "../src/index.js";

describe("money plugin catalog", () => {
  test("Mercury and CoinPay are on by default; moomoo is listed but off", () => {
    expect(DEFAULT_PLUGINS.map((d) => d.slug).sort()).toEqual(["coinpay", "mercury"]);
    const moomoo = FINANCE_CATALOG.find((e) => e.slug === "moomoo");
    expect(moomoo.default).toBe(false);
    expect(moomoo.description).toContain("you decide");
    for (const e of FINANCE_CATALOG) {
      expect(e.url.startsWith("https://")).toBe(true);
      expect(e.description.toLowerCase()).not.toContain("first ever");
    }
  });

  test("policy is chosen by server, not by slug", () => {
    expect(policyFor("https://mcp.mercury.com/mcp")?.kind).toBe("banking");
    expect(policyFor("https://MCP.mercury.com/mcp/")?.kind).toBe("banking");
    expect(policyFor("https://coinpayportal.com/api/mcp")?.kind).toBe("crypto");
    expect(policyFor("https://mcp.moomoo.com/mcp")?.kind).toBe("trading");
    expect(policyFor("https://threatcrush.com/api/mcp")).toBeNull();
    expect(policyFor("https://mcp.mercury.com.evil.example/mcp")).toBeNull();
    expect(policyFor("not a url")).toBeNull();
  });
});

describe("confirmation gate", () => {
  test("only allowlisted reads run alone; writes and unknown tools ask", () => {
    const m = POLICIES.mercury;
    expect(needsConfirmation(m, "listTransactions")).toBe(false);
    expect(needsConfirmation(m, "getAccounts")).toBe(false);
    for (const t of ["requestSendMoney", "requestTransferMoney", "approveReimbursement", "createRecipient", "somethingNew"]) expect(needsConfirmation(m, t)).toBe(true);
    const c = POLICIES.coinpay;
    expect(needsConfirmation(c, "invoice_list")).toBe(false);
    for (const t of ["invoice_create_draft", "time_log", "project_invoice_time", "wallet_send"]) expect(needsConfirmation(c, t)).toBe(true);
    const mm = POLICIES.moomoo;
    expect(needsConfirmation(mm, "quote_stock_quote")).toBe(false);
    expect(needsConfirmation(mm, "account_positions")).toBe(false);
    for (const t of ["trading_order_place", "trading_order_cancel", "sim_trade_input_order", "quote_modify_user_security", "transfer_funds"]) expect(needsConfirmation(mm, t)).toBe(true);
  });

  test("a server that calls a write tool read-only cannot loosen the rule", () => {
    const tools = [
      { name: "listTransactions", annotations: {} },
      { name: "requestSendMoney", annotations: { readOnlyHint: true, destructiveHint: false } },
      { name: "mystery" },
    ];
    const out = applyPolicy(POLICIES.mercury, tools);
    expect(out.find((t) => t.name === "listTransactions")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(out.find((t) => t.name === "requestSendMoney")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(out.find((t) => t.name === "mystery")?.annotations).toMatchObject({ destructiveHint: true });
    // The package's own loop check now asks for every non-allowlisted tool.
    expect(out.filter((t) => needsApproval(t)).map((t) => t.name)).toEqual(["requestSendMoney", "mystery"]);
    // No policy: the server's own annotations stand.
    expect(applyPolicy(null, tools)).toBe(tools);
  });

  test("brokerage: paper mode hides live order tools; live shows them (still asking)", () => {
    const tools = ["quote_stock_quote", "sim_trade_input_order", "trading_order_place", "trading_order_cancel", "unknown_tool"].map((name) => ({ name }));
    const paper = applyPolicy(POLICIES.moomoo, tools, "paper").map((t) => t.name);
    expect(paper).toEqual(["quote_stock_quote", "sim_trade_input_order"]);
    const live = applyPolicy(POLICIES.moomoo, tools, "live");
    expect(live.map((t) => t.name)).toEqual(tools.map((t) => t.name));
    expect(live.find((t) => t.name === "trading_order_place")?.annotations).toMatchObject({ destructiveHint: true });
  });
});

describe("approval card", () => {
  test("a payment shows amount, currency, from, to and memo", () => {
    const s = describeAction(POLICIES.mercury, "requestSendMoney", { accountId: "acct_1", recipientId: "rcp_9", amount: 1250.5, currency: "USD", note: "Invoice 42" });
    const get = (l) => s.lines.find((x) => x.label === l)?.value;
    expect(s.title).toBe("Request send money");
    expect(get("Amount")).toBe("1250.5");
    expect(get("Currency")).toBe("USD");
    expect(get("From")).toBe("acct_1");
    expect(get("To")).toBe("rcp_9");
    expect(get("Memo")).toBe("Invoice 42");
    expect(s.note).toContain("Mercury");
  });

  test("a CoinPay draft invoice totals its line items", () => {
    const s = describeAction(POLICIES.coinpay, "invoice_create_draft", { clientId: "c1", lineItems: [{ description: "work", quantity: 3, unit_price: 100 }] });
    expect(s.lines.find((x) => x.label === "Amount")?.value).toContain("300");
    expect(s.lines.find((x) => x.label === "Currency")?.value).toBe("USD");
    expect(s.lines.find((x) => x.label === "To")?.value).toBe("c1");
  });

  test("an order shows symbol, side, quantity, type, prices, estimated cost and paper vs live", () => {
    const live = describeAction(POLICIES.moomoo, "trading_order_place", { acc_id: "123", code: "US.AAPL", side: "BUY", qty: "10", order_type: "LIMIT", price: "190.5", time_in_force: "DAY" });
    const get = (l) => live.lines.find((x) => x.label === l)?.value;
    expect(live.title).toBe("Place order");
    expect(get("Symbol")).toBe("US.AAPL");
    expect(get("Side")).toBe("BUY");
    expect(get("Quantity")).toBe("10");
    expect(get("Order type")).toBe("LIMIT");
    expect(get("Limit price")).toBe("190.5");
    expect(get("Estimated cost")).toContain("1,905");
    expect(get("Account")).toContain("LIVE");
    expect(live.account).toBe("live");
    expect(live.note).toContain("can be wrong");
    const paper = describeAction(POLICIES.moomoo, "sim_trade_input_order", { code: "US.TSLA", side: "SELL", qty: "1", order_type: "MARKET" });
    expect(paper.account).toBe("paper");
    expect(paper.lines.find((x) => x.label === "Estimated cost")?.value).toContain("market price");
    expect(describeAction(null, "x", {})).toBeNull();
  });
});

describe("logs", () => {
  test("tokens, account numbers and amounts are masked", () => {
    const out = redactLog(new Error('token exchange failed: {"access_token":"abc.def","refresh_token":"r1"} Bearer eyJhbGciOi.eyJzdWIi.sig acct 1234567890123 paid $1,250.00'));
    expect(out).not.toContain("abc.def");
    expect(out).not.toContain("r1\"");
    expect(out).not.toContain("1234567890123");
    expect(out).not.toContain("1,250");
    expect(out).toContain("[redacted]");
  });
});
