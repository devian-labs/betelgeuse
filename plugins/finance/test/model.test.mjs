import assert from "node:assert/strict";
import { test } from "node:test";
import { accountState, addMonths, balances, budget, cashflow, investments, linkKey, monthsEnding, netWorth, parseAmount, parseCsv, parseData, parseDate, snapshotDue } from "../src/model.ts";

const row = (path, properties) => ({ path, title: path.replace(/^.*\//, "").replace(/ \d+\.md$|\.md$/, ""), properties });
const F = "Finance";
const data = parseData({
  accounts: [
    row(`${F}/Accounts/HDFC.md`, { Type: "Bank account", "Opening balance": 50000 }),
    row(`${F}/Accounts/Amex.md`, { Type: "Credit card", "Opening balance": 2000, "Credit limit": 100000 }),
    row(`${F}/Accounts/Home loan.md`, { Type: "Loan", "Opening balance": 1000000 }),
    row(`${F}/Accounts/Zerodha.md`, { Type: "Investment account", "Opening balance": 0 }),
  ],
  categories: [
    row(`${F}/Categories/Groceries.md`, { Kind: "Expense", "Monthly budget": 8000 }),
    row(`${F}/Categories/Dining.md`, { Kind: "Expense", "Monthly budget": 3000 }),
    row(`${F}/Categories/Travel.md`, { Kind: "Expense" }),
    row(`${F}/Categories/Salary.md`, { Kind: "Income" }),
  ],
  transactions: [
    row(`${F}/Transactions/Salary.md`, { Date: "2026-10-01", Amount: 100000, Type: "Income", Account: ["[[Finance/Accounts/HDFC]]"], Category: ["[[Salary]]"] }),
    row(`${F}/Transactions/Veggies.md`, { Date: "2026-10-03", Amount: 600, Type: "Expense", Account: ["[[HDFC]]"], Category: ["[[Groceries]]"] }),
    row(`${F}/Transactions/Dinner.md`, { Date: "2026-10-05", Amount: "4,000", Type: "Expense", Account: ["[[Amex]]"], Category: ["[[Dining]]"] }),
    row(`${F}/Transactions/Cab.md`, { Date: "2026-10-06", Amount: 300, Type: "Expense", Account: ["[[HDFC]]"] }),
    row(`${F}/Transactions/Card bill.md`, { Date: "2026-10-10", Amount: 6000, Type: "Transfer", Account: ["[[HDFC]]"], "To account": ["[[Amex]]"] }),
    row(`${F}/Transactions/EMI.md`, { Date: "2026-10-12", Amount: 20000, Type: "Transfer", Account: ["[[HDFC]]"], "To account": ["[[Home loan]]"] }),
    row(`${F}/Transactions/Flight.md`, { Date: "2026-11-02", Amount: 9000, Type: "Expense", Account: ["[[Amex]]"], Category: ["[[Travel]]"] }),
    row(`${F}/Transactions/Sept rent.md`, { Date: "2026-09-02", Amount: 15000, Type: "Expense", Account: ["[[HDFC]]"] }),
  ],
  holdings: [
    row(`${F}/Investments/Nifty fund.md`, { Type: "Mutual funds", Invested: 40000, "Current value": 46000 }),
    row(`${F}/Investments/FD.md`, { Type: "Fixed deposits", Invested: 20000, "Current value": 21000 }),
    row(`${F}/Investments/Old stock.md`, { Type: "Stocks", Invested: 5000, "Current value": 1000, Closed: true }),
  ],
  items: [row(`${F}/Assets and liabilities/Car.md`, { Kind: "Asset", Value: 300000 }), row(`${F}/Assets and liabilities/Loan from dad.md`, { Kind: "Liability", Value: 50000 })],
  snapshots: [row(`${F}/Net worth/2026-09.md`, { Date: "2026-09-30", Assets: 1, Liabilities: 1, "Net worth": 0 })],
});

test("links name rows by file name, with or without the path", () => {
  assert.equal(linkKey(["[[Finance/Accounts/HDFC]]"]), "HDFC");
  assert.equal(linkKey("[[Salary 2|Salary]]"), "Salary 2");
  assert.equal(linkKey([]), null);
});

test("balances: card spending is owed, paying the card and the EMI reduces what's owed", () => {
  const bal = balances(data, "2026-10-31");
  assert.equal(bal.get("HDFC"), 50000 + 100000 - 600 - 300 - 6000 - 20000 - 15000);
  assert.equal(bal.get("Amex"), -2000 - 4000 + 6000);
  assert.equal(bal.get("Home loan"), -1000000 + 20000);
  // November's flight hasn't happened yet on Oct 31.
  assert.equal(balances(data, "2026-11-30").get("Amex"), -9000);
  const amex = data.accounts.find((a) => a.key === "Amex");
  assert.deepEqual(accountState(amex, -9000), { balance: -9000, owed: true, due: 9000, utilisation: 0.09 });
});

test("a month's budget, savings and spending by category", () => {
  const b = budget(data, "2026-10");
  assert.equal(b.summary.income, 100000);
  assert.equal(b.summary.expense, 600 + 4000 + 300);
  assert.equal(b.summary.rate, (100000 - 4900) / 100000);
  assert.deepEqual(
    b.lines.map((l) => [l.category?.name ?? "Uncategorised", l.budget, l.spent]),
    [["Dining", 3000, 4000], ["Groceries", 8000, 600], ["Uncategorised", 0, 300]],
  );
  assert.equal(b.budgeted, 11000);
  assert.equal(b.left, 11000 - 4600);
  assert.deepEqual(cashflow(data, ["2026-09", "2026-10"]), [
    { month: "2026-09", income: 0, expense: 15000 },
    { month: "2026-10", income: 100000, expense: 4900 },
  ]);
});

test("net worth counts accounts, open investments and other assets, less what's owed", () => {
  const bal = balances(data, "2026-10-31");
  const nw = netWorth(data, bal);
  assert.equal(nw.parts.cash, bal.get("HDFC"));
  assert.equal(nw.parts.investments, 67000);
  assert.equal(nw.parts.cards, 0);
  assert.equal(nw.parts.loans, 980000);
  assert.equal(nw.parts.otherLiabilities, 50000);
  assert.equal(nw.net, bal.get("HDFC") + 67000 + 300000 - 980000 - 50000);
  assert.equal(snapshotDue(data, nw, "2026-10"), "new");
  assert.equal(snapshotDue(data, nw, "2026-09").key, "2026-09");
  const inv = investments(data);
  assert.equal(inv.gain, 7000);
  assert.deepEqual(inv.byType.map((t) => t.type), ["Mutual funds", "Fixed deposits"]);
});

test("months and statements", () => {
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.deepEqual(monthsEnding("2026-02", 3), ["2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(parseCsv('Date,Narration,Amount\n05/10/2026,"Swiggy, dinner",-450.00\r\n06/10/2026,Salary,"1,00,000"\n'), [
    ["Date", "Narration", "Amount"],
    ["05/10/2026", "Swiggy, dinner", "-450.00"],
    ["06/10/2026", "Salary", "1,00,000"],
  ]);
  assert.equal(parseDate("05/10/2026"), "2026-10-05");
  assert.equal(parseDate("10/05/2026", true), "2026-10-05");
  assert.equal(parseDate("2026-10-05T10:00"), "2026-10-05");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseAmount("1,00,000"), 100000);
  assert.equal(parseAmount("(200.50)"), -200.5);
  assert.equal(parseAmount("450 Dr"), -450);
  assert.equal(parseAmount("-₹ 450"), -450);
  assert.equal(parseAmount(""), null);
});

test("investing from a bank account moves money into an investment, and redeeming brings it back", async () => {
  const { effectiveHoldings, monthSummary } = await import("../src/model.ts");
  const d = parseData({
    accounts: [row("F/Accounts/HDFC.md", { Type: "Bank account", "Opening balance": 100000 })],
    categories: [],
    transactions: [
      // Before the value was last entered (Oct 8): already in that value, but it adds to what was invested.
      row("F/Transactions/SIP.md", { Date: "2026-10-05", Amount: 5000, Type: "Invest", Account: ["[[HDFC]]"], Investment: ["[[Nifty fund]]"] }),
      row("F/Transactions/SIP 2.md", { Date: "2026-10-20", Amount: 3000, Type: "Invest", Account: ["[[HDFC]]"], Investment: ["[[Nifty fund]]"] }),
      row("F/Transactions/Sold some.md", { Date: "2026-10-25", Amount: 2000, Type: "Redeem", Account: ["[[HDFC]]"], Investment: ["[[Nifty fund]]"] }),
      // A new investment started from a transaction: no value entered yet.
      row("F/Transactions/First buy.md", { Date: "2026-10-21", Amount: 1000, Type: "Invest", Account: ["[[HDFC]]"], Investment: ["[[Gold ETF]]"] }),
      // Not yet: scheduled.
      row("F/Transactions/Next SIP.md", { Date: "2026-11-05", Amount: 5000, Type: "Invest", Account: ["[[HDFC]]"], Investment: ["[[Nifty fund]]"] }),
    ],
    holdings: [
      row("F/Investments/Nifty fund.md", { Type: "Mutual funds", Invested: 40000, "Current value": 46000, Updated: "2026-10-08" }),
      row("F/Investments/Gold ETF.md", { Type: "Gold" }),
    ],
    items: [],
    snapshots: [],
  });
  const [nifty, gold] = effectiveHoldings(d, "2026-10-31");
  assert.equal(nifty.invested, 40000 + 5000 + 3000 - 2000);
  assert.equal(nifty.value, 46000 + 3000 - 2000);
  assert.deepEqual([gold.invested, gold.value], [1000, 1000]);
  assert.equal(balances(d, "2026-10-31").get("HDFC"), 100000 - 5000 - 3000 + 2000 - 1000);
  const s = monthSummary(d, "2026-10");
  assert.deepEqual([s.expense, s.income, s.invested], [0, 0, 5000 + 3000 - 2000 + 1000]);
  // Net worth doesn't move when money is invested: it changes hands.
  const after = netWorth(d, balances(d, "2026-10-31"), "2026-10-31");
  assert.equal(after.parts.investments, 47000 + 1000);
  // Investing doesn't change net worth: the money changes hands (Oct 20's SIP, after the value date).
  const on = (day) => netWorth(d, balances(d, day), day).net;
  assert.equal(on("2026-10-20"), on("2026-10-19"));
});

test("numbers as people type them: thousands separators, decimal commas, currency prefixes", async () => {
  const { parseNumber } = await import("../src/model.ts");
  assert.equal(parseNumber("1,234.56"), 1234.56);
  assert.equal(parseNumber("1,00,000"), 100000);
  assert.equal(parseNumber("1,234"), 1234);
  // A comma with other than three digits after it is a decimal comma.
  assert.equal(parseNumber("12,50"), 12.5);
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("1.234,56"), 1234.56);
  assert.equal(parseNumber("1.234.567"), 1234567);
  assert.equal(parseNumber("12.5"), 12.5);
  assert.equal(parseNumber(".5"), 0.5);
  assert.equal(parseNumber("1 234,5"), 1234.5);
  assert.equal(parseNumber("-500"), -500);
  assert.equal(parseNumber("Rs.450"), 450);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber(""), null);
  // Statement amounts: a currency prefix with a dot isn't a decimal point.
  assert.equal(parseAmount("Rs. 1,200.00"), 1200);
  assert.equal(parseAmount("Rs.450"), 450);
  assert.equal(parseAmount("INR 1,234.50 Dr"), -1234.5);
  assert.equal(parseAmount("1.234,56"), 1234.56);
});

test("a statement's header is the row naming a date and an amount, not a line about the statement", async () => {
  const { statementHeader } = await import("../src/model.ts");
  const rows = [
    ["Account Name", "S R"],
    ["Statement Date : 15/10/2026"],
    ["Txn Date", "Description", "Debit", "Credit", "Balance"],
    ["05/10/2026", "SWIGGY", "450", "", "1000"],
  ];
  assert.equal(statementHeader(rows), 2);
  assert.equal(statementHeader([["Date", "Amount"], ["2026-10-01", "5"]]), 0);
  // No row names both: the first one naming a date, as before.
  assert.equal(statementHeader([["junk"], ["Date", "Narration"]]), 1);
  assert.equal(statementHeader([["a", "b"]]), 0);
});

test("editing an investment keeps its Invest and Redeem transactions out of what's saved", async () => {
  const { effectiveHoldings, holdingEdit } = await import("../src/model.ts");
  const d = parseData({
    accounts: [],
    categories: [],
    transactions: [
      row("F/Transactions/SIP.md", { Date: "2026-10-05", Amount: 5000, Type: "Invest", Investment: ["[[Nifty fund]]"] }),
      row("F/Transactions/SIP 2.md", { Date: "2026-10-10", Amount: 3000, Type: "Invest", Investment: ["[[Nifty fund]]"] }),
    ],
    holdings: [row("F/Investments/Nifty fund.md", { Type: "Mutual funds", Invested: 40000, "Current value": 46000, Updated: "2026-10-08" })],
    items: [],
    snapshots: [],
  });
  const [shown] = effectiveHoldings(d, "2026-10-15");
  assert.deepEqual([shown.invested, shown.value], [48000, 49000]);
  // Saved as shown (only renamed): the row keeps what was entered, so nothing is counted twice.
  assert.deepEqual(holdingEdit(d, shown, { invested: 48000, value: 49000 }, "2026-10-15"), { invested: 40000, value: 46000, updated: "2026-10-08" });
  // A new value is today's valuation, with the transactions up to today in it.
  assert.deepEqual(holdingEdit(d, shown, { invested: 48000, value: 50000 }, "2026-10-15"), { invested: 40000, value: 50000, updated: "2026-10-15" });
  // More invested than shown: the difference goes into what was entered.
  assert.deepEqual(holdingEdit(d, shown, { invested: 49000, value: 49000 }, "2026-10-15").invested, 41000);
  // A new investment: as entered, the value defaulting to what was invested.
  assert.deepEqual(holdingEdit(d, undefined, { invested: 1000, value: null }, "2026-10-15"), { invested: 1000, value: 1000, updated: "2026-10-15" });
});

test("finds the Finance databases after their page is renamed, but not a lone database of the same name", async () => {
  const { DB_KEYS, DB_TITLES, locate } = await import("../src/schema.ts");
  const tree = (dir) => DB_KEYS.map((k) => ({ path: `${dir}/${DB_TITLES[k]}.md`, title: DB_TITLES[k], kind: "database" }));
  const config = { root: "Finance.md", dbs: Object.fromEntries(DB_KEYS.map((k) => [k, `Finance/${DB_TITLES[k]}.md`])) };
  const stray = { path: "Work/Accounts.md", title: "Accounts", kind: "database" };
  assert.equal(locate(config, [...tree("Finance"), stray]).accounts, "Finance/Accounts.md");
  // "Finance" renamed to "Money": its databases moved with it.
  const moved = locate(config, [...tree("Money"), stray]);
  assert.deepEqual(moved, Object.fromEntries(DB_KEYS.map((k) => [k, `Money/${DB_TITLES[k]}.md`])));
  // Only a stray database, or two complete sets to choose from: not set up (rather than guess).
  assert.equal(locate(config, [stray]), null);
  assert.equal(locate({}, [...tree("A"), ...tree("B")]), null);
});
