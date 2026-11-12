// The budget tracker's rules (D-333, /admin/budget): the entries, their checks, the split between Savar and Cedric and the
// summaries. Pure code with no database, no clock and no network, so the page, the routes and the tests share it.
// Money is whole cents everywhere in this file; the database column is numeric(12, 2).
//
// Rules decided with Savar on 2026-11-12:
// - Amount and amount paid are one number. A bill that is not charged yet is still the full amount.
// - An expense splits between Savar and Cedric (50/50, or another share on one row) and says who paid and whether the
//   split is settled. Revenue is never split.
// - A USD entry keeps its own USD to CAD rate (the default rate is a setting), so a later rate never moves an old amount.
// - The balance counts the expenses with "split settled" off: what the other partner still owes the one who paid.

export const BUDGET_PATH = "/admin/budget";

export const PEOPLE = ["savar", "cedric"] as const;
export type Person = (typeof PEOPLE)[number];
export const PERSON_NAME: Record<Person, string> = { savar: "Savar", cedric: "Cedric" };
export const otherPerson = (p: Person): Person => (p === "savar" ? "cedric" : "savar");

export const KINDS = ["expense", "revenue"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_NAME: Record<Kind, string> = { expense: "Expense", revenue: "Revenue" };

export const CURRENCIES = ["CAD", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** The USD to CAD rate before any setting is read (the Bank of Canada rate of 2026-10-08, from the old Sheet). */
export const DEFAULT_USD_TO_CAD = 1.424;
export const FIRST_DATE = "2020-01-01";
export const LAST_DATE = "2100-01-01";
export const MAX_CENTS = 999_999_999;

export interface BudgetCategory { id: string; kind: Kind; name: string; sortOrder: number }

export interface BudgetEntry {
  id: string;
  date: string;
  kind: Kind;
  categoryId: string;
  description: string;
  party: string | null;
  currency: Currency;
  /** The amount in `currency`, in cents. */
  amountCents: number;
  /** CAD per USD for this row; null for a CAD row. */
  rate: number | null;
  amountCadCents: number;
  paidBy: Person | null;
  /** Savar's share of an expense, in percent (two decimals at most). */
  savarSharePct: number;
  settled: boolean;
  notes: string | null;
}

// ---------- money ----------

export const toCents = (n: number): number => Math.round(n * 100 + (n < 0 ? -1e-9 : 1e-9));

/** "$1,234.56"; a negative is "-$1,234.56". */
export function centsText(cents: number, symbol = "$"): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-CA");
  return `${cents < 0 ? "-" : ""}${symbol}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** An amount a person typed ("1,234.56", "$12", "12.5") as cents, or null when it is not a positive amount with at most two decimals. */
export function parseMoney(input: unknown): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    const c = toCents(input);
    return Math.abs(input * 100 - c) < 1e-6 && c > 0 && c <= MAX_CENTS ? c : null;
  }
  if (typeof input !== "string") return null;
  const t = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const c = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return c > 0 && c <= MAX_CENTS ? c : null;
}

/** A USD to CAD rate (more than 0, under 100, four decimals at most), or null. */
export function parseRate(input: unknown): number | null {
  const n = typeof input === "number" ? input : typeof input === "string" && /^\d+(\.\d+)?$/.test(input.trim()) ? Number(input.trim()) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
  const r = Math.round(n * 10_000) / 10_000;
  return r > 0 ? r : null;
}

/** The CAD amount of a row in cents, the way the database computes it. */
export const cadCentsOf = (amountCents: number, currency: Currency, rate: number | null): number =>
  currency === "CAD" || rate === null ? amountCents : Math.round(amountCents * rate);

// ---------- the split ----------

/** Savar's and Cedric's parts of an amount, in cents. Cedric gets the rest, so the two always add up. */
export function splitShares(cents: number, savarSharePct: number): { savar: number; cedric: number } {
  const savar = Math.round((cents * Math.round(savarSharePct * 100)) / 10_000);
  return { savar, cedric: cents - savar };
}

export interface Balance {
  /** Unsettled expenses Savar paid: what Cedric owes him for them. */
  cedricOwes: number;
  /** Unsettled expenses Cedric paid: what Savar owes him for them. */
  savarOwes: number;
  /** The two set against each other; null when they cancel out. */
  net: { from: Person; to: Person; cents: number } | null;
  /** How many unsettled expenses make the balance. */
  open: number;
}

/**
 * The balance of the expenses whose split is not settled. It adds the exact parts first and rounds the total once, so the
 * odd cents of single rows never pile up (half of $406.57 is $203.29, not the sum of rounded halves).
 */
export function balanceOf(entries: readonly BudgetEntry[]): Balance {
  let cedricX = 0, savarX = 0, open = 0;
  for (const e of entries) {
    if (e.kind !== "expense" || e.settled || !e.paidBy) continue;
    const savarPart = e.amountCadCents * Math.round(e.savarSharePct * 100);
    open += 1;
    if (e.paidBy === "savar") cedricX += e.amountCadCents * 10_000 - savarPart;
    else savarX += savarPart;
  }
  const cedricOwes = Math.round(cedricX / 10_000), savarOwes = Math.round(savarX / 10_000);
  const diff = cedricOwes - savarOwes;
  const net = diff === 0 ? null : diff > 0 ? { from: "cedric" as Person, to: "savar" as Person, cents: diff } : { from: "savar" as Person, to: "cedric" as Person, cents: -diff };
  return { cedricOwes, savarOwes, net, open };
}

// ---------- the summaries ----------

/** "2026-10" of a calendar date "2026-10-08". */
export const monthOf = (date: string): string => date.slice(0, 7);

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 2026" of "2026-10". */
export const monthLabel = (month: string): string => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? "?"} ${month.slice(0, 4)}`;

const nextMonth = (m: string): string => {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
  return mo === 12 ? `${y + 1}-01` : `${m.slice(0, 5)}${String(mo + 1).padStart(2, "0")}`;
};

/** The most month columns the summary shows. */
export const MONTHS_MAX = 36;

/** The months from the first entry to the latest entry or the current month, whichever is later, newest last. At least the current month. */
export function monthsFor(entries: readonly BudgetEntry[], currentMonth: string): string[] {
  const dates = entries.map((e) => monthOf(e.date));
  const first = dates.reduce((a, b) => (b < a ? b : a), currentMonth);
  const last = dates.reduce((a, b) => (b > a ? b : a), currentMonth);
  const months: string[] = [];
  for (let m = first; m <= last && months.length < 400; m = nextMonth(m)) months.push(m);
  return months.slice(-MONTHS_MAX);
}

export interface CategoryRow { category: BudgetCategory; byMonth: Record<string, number>; total: number }
export interface BudgetSummary {
  months: string[];
  revenueCents: number;
  expenseCents: number;
  netCents: number;
  expenses: CategoryRow[];
  revenue: CategoryRow[];
  expenseByMonth: Record<string, number>;
  revenueByMonth: Record<string, number>;
  netByMonth: Record<string, number>;
  /** What each partner paid out of pocket (expenses only), and each one's part of the expenses by the split. */
  paid: Record<Person, number>;
  share: Record<Person, number>;
  balance: Balance;
  entryCount: number;
}

/** The totals, the category by month tables and the balance. The months cover every entry; only the last MONTHS_MAX show. */
export function summarize(entries: readonly BudgetEntry[], categories: readonly BudgetCategory[], currentMonth: string): BudgetSummary {
  const months = monthsFor(entries, currentMonth);
  const rows = new Map<string, CategoryRow>();
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  for (const c of sorted) rows.set(c.id, { category: c, byMonth: {}, total: 0 });
  const expenseByMonth: Record<string, number> = {}, revenueByMonth: Record<string, number> = {};
  const paid: Record<Person, number> = { savar: 0, cedric: 0 }, share: Record<Person, number> = { savar: 0, cedric: 0 };
  let revenueCents = 0, expenseCents = 0, savarShareX = 0;
  for (const e of entries) {
    const m = monthOf(e.date);
    const row = rows.get(e.categoryId);
    if (row) {
      row.byMonth[m] = (row.byMonth[m] ?? 0) + e.amountCadCents;
      row.total += e.amountCadCents;
    }
    if (e.kind === "revenue") {
      revenueCents += e.amountCadCents;
      revenueByMonth[m] = (revenueByMonth[m] ?? 0) + e.amountCadCents;
    } else {
      expenseCents += e.amountCadCents;
      expenseByMonth[m] = (expenseByMonth[m] ?? 0) + e.amountCadCents;
      if (e.paidBy) paid[e.paidBy] += e.amountCadCents;
      savarShareX += e.amountCadCents * Math.round(e.savarSharePct * 100);
    }
  }
  share.savar = Math.round(savarShareX / 10_000);
  share.cedric = expenseCents - share.savar;
  const netByMonth: Record<string, number> = {};
  for (const m of months) netByMonth[m] = (revenueByMonth[m] ?? 0) - (expenseByMonth[m] ?? 0);
  const all = [...rows.values()];
  return {
    months, revenueCents, expenseCents, netCents: revenueCents - expenseCents,
    expenses: all.filter((r) => r.category.kind === "expense"), revenue: all.filter((r) => r.category.kind === "revenue"),
    expenseByMonth, revenueByMonth, netByMonth, paid, share, balance: balanceOf(entries), entryCount: entries.length,
  };
}

// ---------- checks for what the page sends ----------

/** What the page sends for one entry (a form, or the Edit form). */
export interface EntryInput {
  kind: Kind;
  date: string;
  categoryId: string;
  description: string;
  party: string | null;
  amount: number;
  currency: Currency;
  rate: number | null;
  paidBy: Person | null;
  savarSharePct: number;
  settled: boolean;
  notes: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** True for a real calendar date "YYYY-MM-DD" between FIRST_DATE and LAST_DATE. */
export function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v < FIRST_DATE || v > LAST_DATE) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

const text = (v: unknown, max: number): string | null | undefined => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? null : t.length <= max ? t : undefined;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** The checks of one entry. The messages are plain words for the person who typed it. */
export function parseEntry(body: unknown): Parsed<EntryInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "Send the entry as an object." };
  const b = body as Record<string, unknown>;
  const kind = KINDS.find((k) => k === b.kind);
  if (!kind) return { ok: false, error: "Choose expense or revenue." };
  if (!validDate(b.date)) return { ok: false, error: "Enter a real date." };
  if (!isUuid(b.categoryId)) return { ok: false, error: "Choose a category." };
  const description = text(b.description, 300);
  if (!description) return { ok: false, error: "Write a description of 1 to 300 characters." };
  const party = text(b.party, 200);
  if (party === undefined) return { ok: false, error: "The vendor or customer is too long (200 characters at most)." };
  const notes = text(b.notes, 2000);
  if (notes === undefined) return { ok: false, error: "The notes are too long (2000 characters at most)." };
  const cents = parseMoney(b.amount);
  if (cents === null) return { ok: false, error: "Enter an amount above 0 with at most two decimals." };
  const currency = CURRENCIES.find((c) => c === b.currency);
  if (!currency) return { ok: false, error: "Choose CAD or USD." };
  let rate: number | null = null;
  if (currency === "USD") {
    rate = parseRate(b.rate);
    if (rate === null) return { ok: false, error: "Enter the USD to CAD rate (above 0, under 100)." };
  }
  const paidBy = b.paidBy === null || b.paidBy === undefined || b.paidBy === "" ? null : PEOPLE.find((p) => p === b.paidBy);
  if (paidBy === undefined) return { ok: false, error: "Choose Savar or Cedric." };
  if (kind === "expense" && !paidBy) return { ok: false, error: "Choose who paid." };
  let savarSharePct = 50;
  let settled = false;
  if (kind === "expense") {
    const pct = typeof b.savarSharePct === "number" ? b.savarSharePct : typeof b.savarSharePct === "string" && b.savarSharePct.trim() !== "" ? Number(b.savarSharePct) : 50;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-6) return { ok: false, error: "Savar's share is a percent from 0 to 100 with at most two decimals." };
    savarSharePct = pct;
    settled = b.settled === true;
  }
  return { ok: true, value: { kind, date: b.date, categoryId: b.categoryId, description, party, amount: cents / 100, currency, rate, paidBy, savarSharePct, settled, notes } };
}

/** A category name: trimmed, 1 to 60 characters. */
export function parseCategoryName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t.length >= 1 && t.length <= 60 ? t : null;
}
