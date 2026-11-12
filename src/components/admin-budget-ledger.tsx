"use client";

// The budget tracker's list of transactions and everything you do to it (D-333): filters, add, edit, delete, the "split
// settled" tick, the default USD to CAD rate and category names. It gets the whole ledger from the server page and
// filters it here (a small team's books); every change goes to /api/admin/budget/* and then asks the page to read again.
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { EntryForm } from "@/components/admin-budget-form";
import {
  KIND_NAME, PEOPLE, PERSON_NAME, centsText, monthLabel, monthOf, parseRate, splitShares,
  type BudgetCategory, type BudgetEntry, type Kind, type Person,
} from "@/lib/budget";

interface Filters { kind: "all" | Kind; category: string; month: string; paidBy: "all" | Person; unsettled: boolean }
const NO_TICKS: Record<string, boolean> = {};
const NO_FILTER: Filters = { kind: "all", category: "all", month: "all", paidBy: "all", unsettled: false };

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return res.ok && json?.ok ? null : json?.error ?? "That did not save. Try again in a moment.";
  } catch {
    return "The request did not reach the server. Check the connection and try again.";
  }
}

function shareText(e: BudgetEntry): string {
  if (e.kind !== "expense") return "Not split";
  const s = splitShares(e.amountCadCents, e.savarSharePct);
  return s.savar === s.cedric ? `${centsText(s.savar)} each` : `Savar ${centsText(s.savar)}, Cedric ${centsText(s.cedric)}`;
}

export function BudgetLedger({ entries, categories, rate, today, cut }: { entries: BudgetEntry[]; categories: BudgetCategory[]; rate: number; today: string; cut: boolean }) {
  const router = useRouter();
  // A tick shows at once and holds until the page reads again: the ticks belong to one `entries` array, and a new array
  // (the page's fresh read) drops them, so the list never flickers back to the old value between the save and the read.
  const [ticks, setTicks] = useState<{ base: BudgetEntry[]; byId: Record<string, boolean> }>({ base: entries, byId: {} });
  const byId = useMemo(() => (ticks.base === entries ? ticks.byId : NO_TICKS), [ticks, entries]);
  const shown = useMemo(() => entries.map((e) => (e.id in byId ? { ...e, settled: byId[e.id] } : e)), [entries, byId]);
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [form, setForm] = useState<{ entry: BudgetEntry | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const months = useMemo(() => [...new Set(shown.map((e) => monthOf(e.date)))].sort().reverse(), [shown]);
  // A month with no entry left (the last one was deleted or moved) shows as "All" and filters nothing.
  const month = months.includes(filters.month) ? filters.month : "all";
  const rows = shown.filter((e) =>
    (filters.kind === "all" || e.kind === filters.kind) && (filters.category === "all" || e.categoryId === filters.category) &&
    (month === "all" || monthOf(e.date) === month) && (filters.paidBy === "all" || e.paidBy === filters.paidBy) &&
    (!filters.unsettled || (e.kind === "expense" && !e.settled)));
  const filtered = JSON.stringify({ ...filters, month }) !== JSON.stringify(NO_FILTER);
  const expenseSum = rows.filter((e) => e.kind === "expense").reduce((s, e) => s + e.amountCadCents, 0);
  const revenueSum = rows.filter((e) => e.kind === "revenue").reduce((s, e) => s + e.amountCadCents, 0);
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  async function toggle(e: BudgetEntry, settled: boolean) {
    setError(null);
    setTicks({ base: entries, byId: { ...byId, [e.id]: settled } });
    const problem = await call(`/api/admin/budget/entries/${e.id}`, "PATCH", { settled });
    if (problem) {
      setError(problem);
      setTicks((t) => { const next = { ...t.byId }; delete next[e.id]; return { base: t.base, byId: next }; });
    }
    router.refresh();
  }

  async function remove(e: BudgetEntry) {
    setDeleting(e.id);
    setError(null);
    const problem = await call(`/api/admin/budget/entries/${e.id}`, "DELETE");
    setDeleting(null);
    setConfirming(null);
    if (problem) return setError(problem);
    router.refresh();
  }

  return (
    <section aria-labelledby="bt-list" className="bt-ledger">
      <div className="ab-head">
        <h2 id="bt-list">Transactions</h2>
        <span className="ab-count">{shown.length}</span>
        <span className="ab-head-actions">
          {!form && <button type="button" className="adm-btn" onClick={() => setForm({ entry: null })}>Add transaction</button>}
        </span>
        <p>Every expense and payment received. Tick &ldquo;Split settled&rdquo; after the other partner pays their share back.</p>
      </div>

      {form && (
        <EntryForm key={form.entry?.id ?? "new"} categories={categories} rate={rate} today={today} entry={form.entry}
          onDone={() => { setForm(null); router.refresh(); }} onCancel={() => setForm(null)} />
      )}

      <div className="adm-filters bt-filters" role="group" aria-label="Filter transactions">
        <label>Type
          <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value as Filters["kind"], category: "all" }))}>
            <option value="all">All</option><option value="expense">Expenses</option><option value="revenue">Revenue</option>
          </select>
        </label>
        <label>Category
          <select value={filters.category} onChange={(e) => setFilter("category", e.target.value)}>
            <option value="all">All</option>
            {categories.filter((c) => filters.kind === "all" || c.kind === filters.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Month
          <select value={month} onChange={(e) => setFilter("month", e.target.value)}>
            <option value="all">All</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <label>Paid by
          <select value={filters.paidBy} onChange={(e) => setFilter("paidBy", e.target.value as Filters["paidBy"])}>
            <option value="all">Anyone</option>
            {PEOPLE.map((p) => <option key={p} value={p}>{PERSON_NAME[p]}</option>)}
          </select>
        </label>
        <label className="adm-check"><input type="checkbox" checked={filters.unsettled} onChange={(e) => setFilter("unsettled", e.target.checked)} />Split not settled</label>
        {filtered && <button type="button" className="adm-btn is-quiet" onClick={() => setFilters(NO_FILTER)}>Clear filters</button>}
      </div>

      <p className="bt-line" role="status">
        {filtered ? `Showing ${rows.length} of ${shown.length}. ` : ""}
        {rows.length > 0 && <>Expenses {centsText(expenseSum)}, revenue {centsText(revenueSum)} (CAD).</>}
        {cut && " The list stopped at its limit; older entries are not shown."}
      </p>
      <p role="alert" className="bt-error">{error}</p>

      {rows.length === 0 ? (
        <p className="adm-empty">{shown.length === 0 ? "No transactions yet. Use Add transaction." : "No transaction matches these filters."}</p>
      ) : (
        <div className="adm-scroll" role="region" aria-label="Transactions" tabIndex={0}>
          <table className="adm-table bt-table">
            <thead>
              <tr>
                {["Date", "Type", "Category", "Description", "Amount", "In CAD", "Paid by", "Each pays", "Split settled", ""].map((h, i) => <th key={i} scope="col">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td data-label="Date" className="bt-date">{e.date}</td>
                  <td data-label="Type"><span className={`adm-chip is-${e.kind === "revenue" ? "ok" : "muted"}`}>{KIND_NAME[e.kind]}</span></td>
                  <td data-label="Category">{catName.get(e.categoryId) ?? "-"}</td>
                  <td data-label="Description" className="bt-desc">
                    <div>
                      {e.description}
                      {e.party && <span className="bt-sub">{e.party}</span>}
                      {e.notes && <span className="bt-sub bt-notes" title={e.notes}>{e.notes}</span>}
                    </div>
                  </td>
                  <td data-label="Amount" className="adm-num">
                    <div>
                      {e.currency === "USD" ? centsText(e.amountCents, "US$") : centsText(e.amountCents)}
                      {e.currency === "USD" && e.rate && <span className="bt-sub">at {e.rate.toFixed(4)}</span>}
                    </div>
                  </td>
                  <td data-label="In CAD" className="adm-num">{centsText(e.amountCadCents)}</td>
                  <td data-label={e.kind === "expense" ? "Paid by" : "Received by"}>{e.paidBy ? PERSON_NAME[e.paidBy] : "-"}</td>
                  <td data-label="Each pays">{shareText(e)}</td>
                  <td data-label="Split settled" className="bt-settle">
                    {e.kind === "expense"
                      ? <input type="checkbox" checked={e.settled} onChange={(ev) => toggle(e, ev.target.checked)} aria-label={`Split settled: ${e.description}`} />
                      : "-"}
                  </td>
                  <td className="bt-row-actions">
                    {confirming === e.id ? (
                      <>
                        <button type="button" className="adm-btn is-danger" onClick={() => remove(e)} disabled={deleting === e.id}>{deleting === e.id ? "Deleting..." : "Delete it"}</button>
                        <button type="button" className="adm-btn is-quiet" onClick={() => setConfirming(null)} disabled={deleting === e.id}>Keep</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="adm-btn is-quiet" onClick={() => { setForm({ entry: e }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                        <button type="button" className="adm-btn is-quiet" onClick={() => setConfirming(e.id)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BudgetSettings categories={categories} rate={rate} />
    </section>
  );
}

function BudgetSettings({ categories, rate }: { categories: BudgetCategory[]; rate: number }) {
  const router = useRouter();
  const [rateText, setRateText] = useState(rate.toFixed(4));
  const [names, setNames] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ key: string; text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    if (parseRate(rateText) === null) return setMsg({ key: "rate", text: "Enter a rate above 0 and under 100.", bad: true });
    setBusy(true);
    const problem = await call("/api/admin/budget/settings", "PUT", { rate: rateText });
    setBusy(false);
    setMsg({ key: "rate", text: problem ?? "Saved. New USD entries start from this rate.", bad: !!problem });
    if (!problem) router.refresh();
  }

  async function rename(c: BudgetCategory, e: FormEvent) {
    e.preventDefault();
    const name = (names[c.id] ?? c.name).trim();
    if (name === c.name) return;
    setBusy(true);
    const problem = await call(`/api/admin/budget/categories/${c.id}`, "PATCH", { name });
    setBusy(false);
    setMsg({ key: c.id, text: problem ?? "Renamed.", bad: !!problem });
    if (!problem) router.refresh();
  }

  return (
    <details className="bt-settings">
      <summary>Settings: USD to CAD rate and category names</summary>
      <form className="bt-rate" onSubmit={saveRate}>
        <label>USD to CAD rate
          <input type="text" inputMode="decimal" value={rateText} onChange={(e) => { setRateText(e.target.value); setMsg(null); }} />
        </label>
        <button className="adm-btn" type="submit" disabled={busy}>Save rate</button>
        <p>New USD entries start from this rate. Each entry keeps the rate it was saved with, so changing it never moves an old amount.</p>
        {msg?.key === "rate" && <p role="status" className={msg.bad ? "bt-error" : "bt-ok"}>{msg.text}</p>}
      </form>
      {(["expense", "revenue"] as const).map((kind) => (
        <div key={kind} className="bt-cats">
          <h3>{KIND_NAME[kind]} categories</h3>
          {categories.filter((c) => c.kind === kind).map((c) => (
            <form key={c.id} onSubmit={(e) => rename(c, e)} className="bt-cat">
              <input type="text" aria-label={`Name of category ${c.name}`} maxLength={60} value={names[c.id] ?? c.name} onChange={(e) => { setNames((n) => ({ ...n, [c.id]: e.target.value })); setMsg(null); }} />
              <button className="adm-btn is-quiet" type="submit" disabled={busy || (names[c.id] ?? c.name).trim() === c.name}>Rename</button>
              {msg?.key === c.id && <span role="status" className={msg.bad ? "bt-error" : "bt-ok"}>{msg.text}</span>}
            </form>
          ))}
        </div>
      ))}
      <p className="bt-sub">To add a category, choose &ldquo;+ New category...&rdquo; in the Category list of a transaction.</p>
    </details>
  );
}
