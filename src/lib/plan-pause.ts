import { addDays, localDateTime, localDay, partsInZone, type FamilyZone } from "@/lib/family-time";
import { nextBook } from "@/lib/next-book";

export interface PauseBook { id: string; number: number; shippedAt: string; deliveredAt: string | null }
export interface PausePlan { id: string; kind: "trial" | "paid"; chargeAt: string }
export interface PauseLocation { timeZone: string | null; postal: string | null; province: string | null }
export interface PauseQuote {
  location?: PauseLocation;
  weeks: number; year: number; used: number; subscription: string; kind: "trial" | "paid";
  previousCharge: string; chargeAt: string; bookId: string; targetNumber: number; late: boolean;
  earliest: string | null; latest: string | null;
  /** Server context for atomic admission. This never comes from the browser. */
  shippedAt: string; deliveredAt: string | null; today: string;
}
/** A family may pause its plan this many weeks in a calendar year. The SQL side holds the same number. */
export const PAUSE_WEEKS_PER_YEAR = 8;

export type PauseRefusal = "invalid_weeks" | "allowance" | "not_delivered" | "unavailable" | "stale" | "pending" | "unsupported" | "not_found";

/** Whole local calendar weeks retain the charge's local clock time through seasonal changes and dated overrides. */
export function shiftCharge(at: string, weeks: number, zone: FamilyZone): string {
  const parts = partsInZone(at, zone, { hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
  return new Date(localDateTime(addDays(localDay(at, zone), weeks * 7), zone, +parts.hour, +parts.minute, +parts.second)).toISOString();
}

export function pauseQuote({ weeks, used, now, zone, book, plan, mailingWeeks = 0, firstDelivered = !!book?.deliveredAt, location }: {
  weeks: number; used: number; now: number; zone: FamilyZone; book: PauseBook | null; plan: PausePlan; mailingWeeks?: number; firstDelivered?: boolean; location?: PauseLocation;
}): { ok: true; quote: PauseQuote } | { ok: false; error: PauseRefusal } {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > PAUSE_WEEKS_PER_YEAR) return { ok: false, error: "invalid_weeks" };
  if (used + weeks > PAUSE_WEEKS_PER_YEAR) return { ok: false, error: "allowance" };
  if (!book || !firstDelivered) return { ok: false, error: "not_delivered" };
  if (!Number.isFinite(Date.parse(plan.chargeAt)) || Date.parse(plan.chargeAt) <= now) return { ok: false, error: "unavailable" };
  const today = localDay(now, zone), shippedOn = localDay(book.shippedAt, zone);
  const late = today > addDays(shippedOn, 9);
  const range = nextBook({ shippedOn, deliveredOn: book.deliveredAt ? localDay(book.deliveredAt, zone) : null, today, ended: false, pausedWeeks: mailingWeeks + (late ? 0 : weeks) });
  return { ok: true, quote: {
    ...(location ? { location } : {}), weeks, used, year: +today.slice(0, 4), today, subscription: plan.id, kind: plan.kind,
    previousCharge: new Date(plan.chargeAt).toISOString(), chargeAt: shiftCharge(plan.chargeAt, weeks, zone),
    bookId: book.id, shippedAt: book.shippedAt, deliveredAt: book.deliveredAt,
    targetNumber: book.number + (late ? 2 : 1), late,
    earliest: range.kind === "range" ? range.earliest : null, latest: range.kind === "range" ? range.latest : null,
  } };
}

export interface PauseOperation { id: string; state: "open" | "applied" | "refused"; quote: PauseQuote; send: boolean }
export interface PauseContext {
  zone: FamilyZone; book: PauseBook | null; location?: PauseLocation; firstDelivered?: boolean; used: number; mailingWeeks: number; blocked: boolean; pending?: { token: string; weeks: number };
}
export interface PauseStore {
  context(parent: string, card: string, now: number): Promise<PauseContext | null>;
  operation(parent: string, card: string, token: string): Promise<PauseOperation | null>;
  /** Atomically validates current book, quota and holds. Only one caller gets send=true. */
  admit(parent: string, card: string, token: string, quote: PauseQuote): Promise<PauseOperation | null>;
  /** Applied preserves the quota. Refused releases it. Open retains the deletion hold with no expiry. */
  finish(id: string, state: "applied" | "refused"): Promise<void>;
}
export interface PauseProvider {
  plan(parent: string, card: string): Promise<PausePlan | null>;
  apply(parent: string, card: string, operation: PauseOperation): Promise<"applied" | "refused" | "pending">;
  /** Only matching operation metadata and matching dates can prove this mutation. */
  recover(parent: string, card: string, operation: PauseOperation): Promise<boolean>;
}
export interface PauseSeams { store: PauseStore; provider: PauseProvider; token(quote: PauseQuote): string }
export type PauseResult = { ok: true; token: string; quote: PauseQuote; state: "preview" | "applied" } | { ok: false; error: PauseRefusal };

export async function previewPause(parent: string, card: string, weeks: number, now: number, seams: PauseSeams): Promise<PauseResult> {
  const context = await seams.store.context(parent, card, now);
  if (!context) return { ok: false, error: "not_found" };
  if (context.pending) return confirmPause(parent, card, context.pending.weeks, context.pending.token, now, seams);
  if (context.blocked) return { ok: false, error: "pending" };
  const plan = await seams.provider.plan(parent, card);
  if (!plan) return { ok: false, error: "unsupported" };
  const result = pauseQuote({ ...context, weeks, now, plan });
  return result.ok ? { ...result, token: seams.token(result.quote), state: "preview" } : result;
}

export async function confirmPause(parent: string, card: string, weeks: number, token: string, now: number, seams: PauseSeams): Promise<PauseResult> {
  let operation = await seams.store.operation(parent, card, token);
  if (!operation) {
    const preview = await previewPause(parent, card, weeks, now, seams);
    if (!preview.ok) return preview;
    if (preview.token !== token) return { ok: false, error: "stale" };
    operation = await seams.store.admit(parent, card, token, preview.quote);
    if (!operation) return { ok: false, error: "stale" };
  }
  if (operation.state === "refused") return { ok: false, error: "unavailable" };
  if (operation.state === "applied") return { ok: true, state: "applied", token, quote: operation.quote };
  let outcome: "applied" | "refused" | "pending" = "pending";
  try {
    outcome = operation.send ? await seams.provider.apply(parent, card, operation)
      : await seams.provider.recover(parent, card, operation) ? "applied" : "pending";
  } catch { /* The request may still land. Keep its hold and quota. */ }
  if (outcome === "pending") return { ok: false, error: "pending" };
  await seams.store.finish(operation.id, outcome);
  return outcome === "applied" ? { ok: true, token, state: "applied", quote: operation.quote } : { ok: false, error: "unavailable" };
}
