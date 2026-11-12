"use client";

// The add and edit form of the budget tracker (D-333). Posts to /api/admin/budget/entries (a new entry) or PATCHes
// /api/admin/budget/entries/<id> (an edit), and a new category first to /api/admin/budget/categories. The checks that
// matter are in src/lib/budget.ts and run again on the server; this form only keeps people from sending a bad one.
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CURRENCIES, KINDS, KIND_NAME, PEOPLE, PERSON_NAME, cadCentsOf, centsText, parseMoney, parseRate, splitShares,
  type BudgetCategory, type BudgetEntry, type Currency, type Kind, type Person,
} from "@/lib/budget";

const NEW_CATEGORY = "__new__";

interface FormState {
  kind: Kind; date: string; categoryId: string; newCategory: string; description: string; party: string; amount: string;
  currency: Currency; rate: string; paidBy: Person | ""; savarSharePct: string; settled: boolean; notes: string;
}

const rateText = (rate: number) => rate.toFixed(4);

function initialState(categories: readonly BudgetCategory[], rate: number, today: string, e: BudgetEntry | null): FormState {
  if (e) {
    return {
      kind: e.kind, date: e.date, categoryId: e.categoryId, newCategory: "", description: e.description, party: e.party ?? "",
      amount: (e.amountCents / 100).toFixed(2), currency: e.currency, rate: rateText(e.rate ?? rate), paidBy: e.paidBy ?? "",
      savarSharePct: String(e.savarSharePct), settled: e.settled, notes: e.notes ?? "",
    };
  }
  return {
    kind: "expense", date: today, categoryId: categories.find((c) => c.kind === "expense")?.id ?? NEW_CATEGORY, newCategory: "", description: "",
    party: "", amount: "", currency: "CAD", rate: rateText(rate), paidBy: "", savarSharePct: "50", settled: false, notes: "",
  };
}

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; [k: string]: unknown } | null;
    if (res.ok && json?.ok) return { ...json, ok: true };
    return { ok: false, error: json?.error ?? "That did not save. Try again in a moment." };
  } catch {
    return { ok: false, error: "The request did not reach the server. Check the connection and try again." };
  }
}

export function EntryForm({ categories, rate, today, entry, onDone, onCancel }: {
  categories: BudgetCategory[]; rate: number; today: string; entry: BudgetEntry | null; onDone: () => void; onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(() => initialState(categories, rate, today, entry));
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setF((s) => ({ ...s, [k]: v })); setError(null); };
  const ofKind = categories.filter((c) => c.kind === f.kind);
  const expense = f.kind === "expense";

  function setKind(kind: Kind) {
    setF((s) => ({ ...s, kind, categoryId: categories.find((c) => c.kind === kind)?.id ?? NEW_CATEGORY }));
    setError(null);
  }

  const cents = parseMoney(f.amount);
  const usedRate = f.currency === "USD" ? parseRate(f.rate) : null;
  const cadCents = cents !== null && (f.currency === "CAD" || usedRate !== null) ? cadCentsOf(cents, f.currency, usedRate) : null;
  const pct = Number(f.savarSharePct);
  const shares = cadCents !== null && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? splitShares(cadCents, pct) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state === "saving") return;
    setState("saving");
    setError(null);
    let categoryId = f.categoryId;
    if (categoryId === NEW_CATEGORY) {
      const made = await send("/api/admin/budget/categories", "POST", { kind: f.kind, name: f.newCategory });
      const created = made.ok ? (made.category as { id?: string } | undefined) : undefined;
      if (!created?.id) { setState("idle"); setError(made.error ?? "The category was not saved."); return; }
      categoryId = created.id;
    }
    const body = {
      kind: f.kind, date: f.date, categoryId, description: f.description, party: f.party, amount: f.amount, currency: f.currency,
      rate: f.currency === "USD" ? f.rate : null, paidBy: f.paidBy || null, savarSharePct: expense ? f.savarSharePct : 50, settled: expense && f.settled, notes: f.notes,
    };
    const res = entry ? await send(`/api/admin/budget/entries/${entry.id}`, "PATCH", body) : await send("/api/admin/budget/entries", "POST", body);
    setState("idle");
    if (!res.ok) { setError(res.error ?? "That did not save."); return; }
    onDone();
  }

  return (
    <form className="bt-form" onSubmit={submit} aria-label={entry ? "Edit transaction" : "Add transaction"} id="budget-form">
      <h3>{entry ? "Edit transaction" : "Add a transaction"}</h3>
      <div className="bt-grid">
        <fieldset className="bt-seg bt-wide">
          <legend>Type</legend>
          {KINDS.map((k) => (
            <label key={k}><input type="radio" name="kind" value={k} checked={f.kind === k} onChange={() => setKind(k)} />{KIND_NAME[k]}</label>
          ))}
        </fieldset>
        <label>Date<input type="date" required value={f.date} onChange={(e) => set("date", e.target.value)} min="2020-01-01" max="2100-01-01" /></label>
        <label>Category
          <select ref={first} required value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {ofKind.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_CATEGORY}>+ New category...</option>
          </select>
        </label>
        {f.categoryId === NEW_CATEGORY && (
          <label>New category name<input type="text" required maxLength={60} value={f.newCategory} onChange={(e) => set("newCategory", e.target.value)} placeholder={expense ? "For example, Legal fees" : "For example, Grants"} /></label>
        )}
        <label className="bt-wide">Description<input type="text" required maxLength={300} value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
        <label>{expense ? "Vendor" : "Customer"}<input type="text" maxLength={200} value={f.party} onChange={(e) => set("party", e.target.value)} /></label>
        <label>Amount<input type="text" inputMode="decimal" required value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" /></label>
        <label>Currency
          <select value={f.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {f.currency === "USD" && (
          <label>USD to CAD rate<input type="text" inputMode="decimal" required value={f.rate} onChange={(e) => set("rate", e.target.value)} /></label>
        )}
        <label>{expense ? "Paid by" : "Received by"}
          <select required={expense} value={f.paidBy} onChange={(e) => set("paidBy", e.target.value as Person | "")}>
            {!expense && <option value="">Not recorded</option>}
            {expense && <option value="" disabled>Choose...</option>}
            {PEOPLE.map((p) => <option key={p} value={p}>{PERSON_NAME[p]}</option>)}
          </select>
        </label>
        {expense && (
          <>
            <label>Savar&apos;s share (%)<input type="text" inputMode="decimal" value={f.savarSharePct} onChange={(e) => set("savarSharePct", e.target.value)} /></label>
            <label className="bt-check"><input type="checkbox" checked={f.settled} onChange={(e) => set("settled", e.target.checked)} /><span><b>Split settled</b><small>The other partner has paid their share back.</small></span></label>
          </>
        )}
        <label className="bt-wide">Notes<textarea rows={2} maxLength={2000} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      </div>
      <p className="bt-preview" aria-live="polite">
        {cadCents === null ? "Enter an amount to see it in CAD." : (
          <>
            {f.currency === "USD" && <>{centsText(cents ?? 0, "US$")} at {rateText(usedRate ?? 0)} is </>}
            <b>{centsText(cadCents, "CA$")}</b>
            {expense && shares && <>. Savar {centsText(shares.savar)}, Cedric {centsText(shares.cedric)}.</>}
            {!expense && <>. Revenue is not split.</>}
          </>
        )}
      </p>
      <div className="bt-actions">
        <button className="adm-btn" type="submit" disabled={state === "saving"}>{state === "saving" ? "Saving..." : entry ? "Save changes" : "Add transaction"}</button>
        <button className="adm-btn is-quiet" type="button" onClick={onCancel} disabled={state === "saving"}>Cancel</button>
        <span role="alert" className="bt-error">{error}</span>
      </div>
    </form>
  );
}
