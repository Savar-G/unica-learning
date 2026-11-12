import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import {
  DEFAULT_USD_TO_CAD, KINDS, PEOPLE, parseRate, toCents,
  type BudgetCategory, type BudgetEntry, type Currency, type EntryInput, type Kind, type Person,
} from "@/lib/budget";
import type { Database } from "@/lib/database.types";

// What the admin budget page (/admin/budget) reads and writes (D-333). Every call uses the admin's own session, never
// the secret key: the tables have admin-only policies, and a change is logged by the database (budget_entry_changes).
// The whole ledger is read at once (a small team's books, never near the limit); the page sums it in code.

/** The most entries one read returns. A longer ledger says so on the page. */
export const ENTRIES_MAX = 5000;

type EntryRow = Database["public"]["Tables"]["budget_entries"]["Row"];

export interface BudgetData {
  entries: BudgetEntry[];
  categories: BudgetCategory[];
  /** The USD to CAD rate a new USD entry starts from. */
  rate: number;
  /** True when the read stopped at ENTRIES_MAX. */
  cut: boolean;
}

const asKind = (v: string): Kind => KINDS.find((k) => k === v) ?? "expense";
const asPerson = (v: string | null): Person | null => PEOPLE.find((p) => p === v) ?? null;

function entryOf(r: EntryRow): BudgetEntry {
  const currency: Currency = r.currency === "USD" ? "USD" : "CAD";
  const amountCents = toCents(r.amount);
  return {
    id: r.id, date: r.entry_date, kind: asKind(r.kind), categoryId: r.category_id, description: r.description, party: r.party,
    currency, amountCents, rate: r.usd_to_cad, amountCadCents: r.amount_cad === null ? amountCents : toCents(r.amount_cad),
    paidBy: asPerson(r.paid_by), savarSharePct: r.savar_share_pct, settled: r.split_settled, notes: r.notes,
  };
}

/** The ledger, the categories and the default rate. Three reads at the same time. */
export async function readBudget(a: AdminSession): Promise<BudgetData> {
  const [entries, categories, settings] = await Promise.all([
    a.db.from("budget_entries").select("*").is("deleted_at", null).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(ENTRIES_MAX),
    a.db.from("budget_categories").select("id, kind, name, sort_order").order("sort_order").order("name"),
    a.db.from("budget_settings").select("usd_to_cad").limit(1),
  ]);
  if (entries.error) throw new Error(`budget entries: ${entries.error.message}`);
  if (categories.error) throw new Error(`budget categories: ${categories.error.message}`);
  if (settings.error) throw new Error(`budget settings: ${settings.error.message}`);
  const rows: EntryRow[] = entries.data ?? [];
  return {
    entries: rows.map(entryOf),
    categories: (categories.data ?? []).map((c) => ({ id: c.id, kind: asKind(c.kind), name: c.name, sortOrder: c.sort_order })),
    rate: parseRate(settings.data?.[0]?.usd_to_cad) ?? DEFAULT_USD_TO_CAD,
    cut: rows.length >= ENTRIES_MAX,
  };
}

export type WriteResult<T = null> = { ok: true; value: T } | { ok: false; status: number; error: string };

const fail = (error: { code?: string; message: string }, what: string): { ok: false; status: number; error: string } => {
  if (error.code === "23503") return { ok: false, status: 400, error: "That category is for the other type, or it does not exist." };
  if (error.code === "23505") return { ok: false, status: 409, error: "A category with that name already exists." };
  if (error.code === "42501") return { ok: false, status: 403, error: "Only admins can change the budget." };
  console.error(`[budget] ${what} failed`, error.code, error.message);
  return { ok: false, status: 503, error: "That did not save. Try again in a moment." };
};

const writeRow = (v: EntryInput) => ({
  entry_date: v.date, kind: v.kind, category_id: v.categoryId, description: v.description, party: v.party, amount: v.amount,
  currency: v.currency, usd_to_cad: v.currency === "USD" ? v.rate : null, paid_by: v.paidBy, savar_share_pct: v.savarSharePct,
  split_settled: v.settled, notes: v.notes,
});

export async function createEntry(a: AdminSession, v: EntryInput): Promise<WriteResult<{ id: string }>> {
  const { data, error } = await a.db.from("budget_entries").insert(writeRow(v)).select("id").single();
  if (error) return fail(error, "create entry");
  return { ok: true, value: { id: data.id } };
}

/** Changes every field of one entry (not a deleted one). */
export async function updateEntry(a: AdminSession, id: string, v: EntryInput): Promise<WriteResult> {
  const { data, error } = await a.db.from("budget_entries").update(writeRow(v)).eq("id", id).is("deleted_at", null).select("id");
  if (error) return fail(error, "update entry");
  return data.length === 1 ? { ok: true, value: null } : { ok: false, status: 404, error: "That entry is not there any more." };
}

/** Ticks or unticks "split settled" on one expense. */
export async function setSettled(a: AdminSession, id: string, settled: boolean): Promise<WriteResult> {
  const { data, error } = await a.db.from("budget_entries").update({ split_settled: settled }).eq("id", id).eq("kind", "expense").is("deleted_at", null).select("id");
  if (error) return fail(error, "set settled");
  return data.length === 1 ? { ok: true, value: null } : { ok: false, status: 404, error: "That expense is not there any more." };
}

/** Hides one entry. It stays in the change log, and the database never deletes it. */
export async function deleteEntry(a: AdminSession, id: string): Promise<WriteResult> {
  const { data, error } = await a.db.from("budget_entries").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select("id");
  if (error) return fail(error, "delete entry");
  return data.length === 1 ? { ok: true, value: null } : { ok: false, status: 404, error: "That entry is not there any more." };
}

export async function createCategory(a: AdminSession, kind: Kind, name: string): Promise<WriteResult<BudgetCategory>> {
  const { data: last } = await a.db.from("budget_categories").select("sort_order").eq("kind", kind).order("sort_order", { ascending: false }).limit(1);
  const sortOrder = (last?.[0]?.sort_order ?? 0) + 1;
  const { data, error } = await a.db.from("budget_categories").insert({ kind, name, sort_order: sortOrder }).select("id, kind, name, sort_order").single();
  if (error) return fail(error, "create category");
  return { ok: true, value: { id: data.id, kind: asKind(data.kind), name: data.name, sortOrder: data.sort_order } };
}

export async function renameCategory(a: AdminSession, id: string, name: string): Promise<WriteResult> {
  const { data, error } = await a.db.from("budget_categories").update({ name }).eq("id", id).select("id");
  if (error) return fail(error, "rename category");
  return data.length === 1 ? { ok: true, value: null } : { ok: false, status: 404, error: "That category is not there any more." };
}

export async function setDefaultRate(a: AdminSession, rate: number): Promise<WriteResult> {
  const { data, error } = await a.db.from("budget_settings").update({ usd_to_cad: rate, updated_at: new Date().toISOString() }).eq("id", true).select("id");
  if (error) return fail(error, "set rate");
  return data.length === 1 ? { ok: true, value: null } : { ok: false, status: 503, error: "The rate could not be saved." };
}
