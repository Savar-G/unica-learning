import { describe, expect, it } from "vitest";
import {
  balanceOf, cadCentsOf, centsText, monthLabel, monthsFor, parseCategoryName, parseEntry, parseMoney, parseRate, splitShares, summarize,
  type BudgetCategory, type BudgetEntry,
} from "@/lib/budget";

// The budget tracker's rules (D-333): money in cents, the split, the balance, the summaries and the checks.

const CAT: BudgetCategory[] = [
  { id: "c-meta", kind: "expense", name: "Meta ads", sortOrder: 1 },
  { id: "c-sup", kind: "expense", name: "Supplies", sortOrder: 2 },
  { id: "c-sub", kind: "revenue", name: "Subscriptions", sortOrder: 1 },
];

let n = 0;
const entry = (o: Partial<BudgetEntry>): BudgetEntry => ({
  id: `e${++n}`, date: "2026-10-08", kind: "expense", categoryId: "c-meta", description: "x", party: null, currency: "CAD", amountCents: 1000,
  rate: null, amountCadCents: 1000, paidBy: "savar", savarSharePct: 50, settled: false, notes: null, ...o,
});

const UUID = "0b6f0c6e-1111-4111-8111-111111111111";
const validBody = { kind: "expense", date: "2026-11-09", categoryId: UUID, description: "Meta ads", party: "Meta", amount: "17.35", currency: "CAD", paidBy: "savar" };

describe("money", () => {
  it("writes cents as dollars", () => {
    expect(centsText(52422)).toBe("$524.22");
    expect(centsText(-52422)).toBe("-$524.22");
    expect(centsText(5)).toBe("$0.05");
    expect(centsText(123456789)).toBe("$1,234,567.89");
    expect(centsText(1181, "US$")).toBe("US$11.81");
  });

  it("reads what a person types", () => {
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("$12")).toBe(1200);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney(11.81)).toBe(1181);
    expect(parseMoney(0.1 + 0.2)).toBe(30);
    expect(parseMoney(1.234)).toBeNull();
    for (const bad of ["", "0", "0.00", "-5", "1.234", "abc", "1e3", " ", null, undefined, NaN, 1e12]) expect(parseMoney(bad)).toBeNull();
  });

  it("reads a rate between 0 and 100, to four decimals", () => {
    expect(parseRate("1.4240")).toBe(1.424);
    expect(parseRate(1.42399)).toBe(1.424);
    for (const bad of ["0", 0, "100", 100, "-1", "x", "", null]) expect(parseRate(bad)).toBeNull();
  });

  it("converts USD to CAD cents as the database does", () => {
    expect(cadCentsOf(1181, "USD", 1.424)).toBe(1682);
    expect(cadCentsOf(1181, "CAD", null)).toBe(1181);
  });
});

describe("the split", () => {
  it("splits 50/50 and gives the odd cent to Cedric", () => {
    expect(splitShares(1682, 50)).toEqual({ savar: 841, cedric: 841 });
    expect(splitShares(193, 50)).toEqual({ savar: 97, cedric: 96 });
  });

  it("splits by another share, and the two parts always add up", () => {
    expect(splitShares(10000, 70)).toEqual({ savar: 7000, cedric: 3000 });
    expect(splitShares(10001, 33.33)).toEqual({ savar: 3333, cedric: 6668 });
    expect(splitShares(1000, 100)).toEqual({ savar: 1000, cedric: 0 });
    expect(splitShares(1000, 0)).toEqual({ savar: 0, cedric: 1000 });
  });
});

describe("the balance", () => {
  it("counts only unsettled expenses, by who paid", () => {
    const b = balanceOf([
      entry({ amountCadCents: 11765, paidBy: "cedric", settled: true }), // the flyers: settled
      entry({ amountCadCents: 2000, paidBy: "savar" }),
      entry({ amountCadCents: 1000, paidBy: "savar", savarSharePct: 100 }),
      entry({ amountCadCents: 600, paidBy: "cedric" }),
      entry({ kind: "revenue", categoryId: "c-sub", amountCadCents: 99900, paidBy: null }),
    ]);
    expect(b.cedricOwes).toBe(1000);
    expect(b.savarOwes).toBe(300);
    expect(b.net).toEqual({ from: "cedric", to: "savar", cents: 700 });
    expect(b.open).toBe(3);
  });

  it("rounds the total once, not each row", () => {
    // Three rows of 1.93: each row's half is 0.965; the total half is 2.895, which is 2.90 and not 2.88.
    expect(balanceOf([1, 2, 3].map(() => entry({ amountCadCents: 193 }))).cedricOwes).toBe(290);
  });

  it("shows the net the other way, and no net when they cancel", () => {
    expect(balanceOf([entry({ amountCadCents: 1000, paidBy: "cedric" })]).net).toEqual({ from: "savar", to: "cedric", cents: 500 });
    expect(balanceOf([entry({ amountCadCents: 1000, paidBy: "cedric" }), entry({ amountCadCents: 1000, paidBy: "savar" })]).net).toBeNull();
    expect(balanceOf([]).net).toBeNull();
  });

  it("matches the old Sheet: Cedric owed Savar about $203.28 on 2026-11-09", () => {
    // The 15 unsettled expenses Savar paid, in cents of CAD (the USD domain row is 11.81 USD at 1.4240 = 16.82).
    const rows = [1682, 1050, 800, 1890, 1050, 1050, 1050, 2806, 193, 426, 1380, 20000, 3830, 1735, 1715];
    const b = balanceOf(rows.map((c) => entry({ amountCadCents: c })));
    expect(rows.reduce((s, c) => s + c, 0)).toBe(40657);
    // The Sheet shows 203.28 because it halves the unrounded USD amount (16.81744). Here the row is 16.82, so half of
    // the total 406.57 is 203.285, which rounds to 203.29 (the odd cents of single rows do not pile up).
    expect(b.cedricOwes).toBe(20329);
  });
});

describe("the summary", () => {
  const entries = [
    entry({ date: "2026-10-08", categoryId: "c-meta", amountCadCents: 1000, paidBy: "savar" }),
    entry({ date: "2026-10-16", categoryId: "c-sup", amountCadCents: 11765, paidBy: "cedric", settled: true }),
    entry({ date: "2026-12-02", categoryId: "c-meta", amountCadCents: 500, paidBy: "savar" }),
    entry({ date: "2026-12-03", kind: "revenue", categoryId: "c-sub", amountCadCents: 7999, paidBy: null }),
  ];
  const s = summarize(entries, CAT, "2026-12");

  it("totals revenue, expenses and net profit", () => {
    expect(s.revenueCents).toBe(7999);
    expect(s.expenseCents).toBe(13265);
    expect(s.netCents).toBe(7999 - 13265);
    expect(s.entryCount).toBe(4);
  });

  it("lists every month from the first entry, with empty months between", () => {
    expect(s.months).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(s.expenseByMonth).toEqual({ "2026-10": 12765, "2026-12": 500 });
    expect(s.netByMonth).toEqual({ "2026-10": -12765, "2026-11": 0, "2026-12": 7499 });
  });

  it("sums each category by month, in the category order", () => {
    expect(s.expenses.map((r) => [r.category.name, r.total])).toEqual([["Meta ads", 1500], ["Supplies", 11765]]);
    expect(s.expenses[0].byMonth).toEqual({ "2026-10": 1000, "2026-12": 500 });
    expect(s.revenue.map((r) => [r.category.name, r.total])).toEqual([["Subscriptions", 7999]]);
  });

  it("says what each partner paid and what each one's part is", () => {
    expect(s.paid).toEqual({ savar: 1500, cedric: 11765 });
    expect(s.share.savar + s.share.cedric).toBe(s.expenseCents);
    expect(s.balance.net).toEqual({ from: "cedric", to: "savar", cents: 750 });
  });

  it("shows the current month when there are no entries", () => {
    expect(monthsFor([], "2026-11")).toEqual(["2026-11"]);
    expect(summarize([], CAT, "2026-11").netCents).toBe(0);
  });

  it("goes past a year end and keeps at most 36 months", () => {
    expect(monthsFor([entry({ date: "2026-11-30" })], "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsFor([entry({ date: "2020-01-05" })], "2026-12")).toHaveLength(36);
    expect(monthLabel("2026-10")).toBe("Oct 2026");
  });
});

describe("the checks of an entry", () => {
  it("accepts a good expense and trims the text", () => {
    const r = parseEntry({ ...validBody, description: "  Meta ads, B2  ", party: " ", notes: "" });
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ description: "Meta ads, B2", party: null, notes: null, amount: 17.35, rate: null, savarSharePct: 50, settled: false }) });
  });

  it("needs a rate for USD and drops it for CAD", () => {
    expect(parseEntry({ ...validBody, currency: "USD" })).toMatchObject({ ok: false });
    expect(parseEntry({ ...validBody, currency: "USD", rate: "1.4240" })).toMatchObject({ ok: true, value: { rate: 1.424 } });
    expect(parseEntry({ ...validBody, rate: 1.4 })).toMatchObject({ ok: true, value: { rate: null } });
  });

  it("needs a payer for an expense, not for revenue, and never splits revenue", () => {
    expect(parseEntry({ ...validBody, paidBy: null })).toMatchObject({ ok: false });
    expect(parseEntry({ ...validBody, paidBy: "someone" })).toMatchObject({ ok: false });
    expect(parseEntry({ ...validBody, kind: "revenue", paidBy: null, savarSharePct: 80, settled: true })).toMatchObject({
      ok: true, value: { paidBy: null, savarSharePct: 50, settled: false },
    });
  });

  it("keeps a custom share and the settled tick on an expense", () => {
    expect(parseEntry({ ...validBody, savarSharePct: "70", settled: true })).toMatchObject({ ok: true, value: { savarSharePct: 70, settled: true } });
    for (const bad of [101, -1, "x", 33.333]) expect(parseEntry({ ...validBody, savarSharePct: bad })).toMatchObject({ ok: false });
  });

  it("refuses bad dates, amounts, currencies, categories and long text", () => {
    for (const patch of [
      { date: "2026-02-30" }, { date: "26-1-1" }, { date: "2019-12-31" }, { amount: "0" }, { amount: "1.999" }, { currency: "EUR" },
      { categoryId: "nope" }, { kind: "gift" }, { description: " " }, { description: "x".repeat(301) }, { party: "x".repeat(201) }, { notes: "x".repeat(2001) },
    ]) expect(parseEntry({ ...validBody, ...patch })).toMatchObject({ ok: false });
    expect(parseEntry(null)).toMatchObject({ ok: false });
    expect(parseEntry("x")).toMatchObject({ ok: false });
  });

  it("cleans a category name", () => {
    expect(parseCategoryName("  Legal   fees ")).toBe("Legal fees");
    expect(parseCategoryName(" ")).toBeNull();
    expect(parseCategoryName("x".repeat(61))).toBeNull();
    expect(parseCategoryName(5)).toBeNull();
  });
});
