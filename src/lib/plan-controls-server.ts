import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { familyZone, localDay } from "@/lib/family-time";
import { stripePauses } from "@/lib/plan-pause-stripe";
import type { PauseContext, PauseOperation, PauseQuote, PauseSeams } from "@/lib/plan-pause";
import type { ParentPlan } from "@/lib/parent-plan";
import { planPrice } from "@/lib/subscription-plan";
import { customerSubscriptions, CARD_READ } from "@/lib/stripe-subscriptions";
import { planNotOver } from "@/lib/card-reconcile";
import { applyPlanStart } from "@/lib/plan-state";
import { stripePlanProvider, supabasePlanStore } from "@/lib/plan-state-server";
import { endCardOperation, holdPlanStart } from "@/lib/family-deletion-store";
import { supabaseCardRows } from "@/lib/card-reconcile-server";
import { startPlan, stripe } from "@/lib/stripe";
import { adminClient } from "@/lib/supabase-auth";

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Plan control response unreadable");
  return value as Record<string, unknown>;
};
const str = (value: unknown): string => { if (typeof value !== "string") throw new Error("Plan control string unreadable"); return value; };
const nullable = (value: unknown) => value == null ? null : str(value);
const num = (value: unknown): number => { if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Plan control number unreadable"); return value; };
const array = (value: unknown): unknown[] => { if (!Array.isArray(value)) throw new Error("Plan controls unreadable"); return value; };
export const controlToken = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function readQuote(value: unknown): PauseQuote {
  const q = record(value);
  if (q.kind !== "trial" && q.kind !== "paid") throw new Error("Pause kind unreadable");
  const location = q.location == null ? null : record(q.location);
  return { ...(location ? { location: { timeZone: nullable(location.timeZone), postal: nullable(location.postal), province: nullable(location.province) } } : {}), weeks: num(q.weeks), year: num(q.year), used: num(q.used), subscription: str(q.subscription), kind: q.kind,
    previousCharge: str(q.previousCharge), chargeAt: str(q.chargeAt), bookId: str(q.bookId), targetNumber: num(q.targetNumber), late: q.late === true,
    earliest: nullable(q.earliest), latest: nullable(q.latest), shippedAt: str(q.shippedAt), deliveredAt: nullable(q.deliveredAt), today: str(q.today) };
}
function readOperation(value: unknown): PauseOperation {
  const o = record(value);
  if (o.state !== "open" && o.state !== "applied" && o.state !== "refused") throw new Error("Pause state unreadable");
  return { id: str(o.id), state: o.state, quote: readQuote(o.quote), send: o.send === true };
}

export async function planControlContext(db: SupabaseClient<Database>, parent: string, card: string) {
  const { data, error } = await db.rpc("plan_control_context", { p_parent: parent, p_card: card });
  if (error) throw new Error(`plan control context: ${error.message}`);
  return data == null ? null : record(data);
}
export function supabasePauses(db: SupabaseClient<Database>, client: NonNullable<ReturnType<typeof stripe>>): PauseSeams {
  return {
    token: controlToken,
    store: {
      async context(parent, card, now): Promise<PauseContext | null> {
        const ctx = await planControlContext(db, parent, card);
        if (!ctx) return null;
        const family = record(ctx.family), b = ctx.book == null ? null : record(ctx.book);
        const zone = familyZone({ timeZone: nullable(family.timeZone), postal: nullable(family.postal), province: nullable(ctx.province) });
        const pauses = array(ctx.pauses).map(record), year = +localDay(now, zone).slice(0, 4);
        const pending = pauses.find(p => p.state === "open");
        return { location: { timeZone: nullable(family.timeZone), postal: nullable(family.postal), province: nullable(ctx.province) }, ...(pending ? { pending: { token: str(pending.token), weeks: num(pending.weeks) } } : {}), zone, book: b ? { id: str(b.id), number: num(b.number), shippedAt: str(b.shippedAt), deliveredAt: nullable(b.deliveredAt) } : null,
          firstDelivered: ctx.firstDelivered === true,
          used: pauses.filter(p => p.year === year).reduce((n, p) => n + num(p.weeks), 0),
          mailingWeeks: await childPauseMailing(db, parent, str(ctx.child), b ? num(b.number) + 1 : 0),
          blocked: ctx.blocked === true || ctx.cancelled === true };
      },
      async operation(parent, card, token) {
        const { data, error } = await db.rpc("plan_control_operation", { p_parent: parent, p_card: card, p_token: token });
        if (error) throw new Error(`pause read: ${error.message}`);
        return data == null ? null : readOperation(data);
      },
      async admit(parent, card, token, quote) {
        const { data, error } = await db.rpc("admit_plan_pause", { p_parent: parent, p_card: card, p_token: token, p_quote: { ...quote, location: quote.location ? { ...quote.location } : undefined } });
        if (error) throw new Error(`pause admission: ${error.message}`);
        return data == null ? null : readOperation(data);
      },
      async finish(id, state) { await finishControl(db, id, state); },
    },
    provider: stripePauses(client, async (parent, card) => {
      const { data, error } = await db.from("card_setups").select("stripe_customer_id").eq("id", card).eq("parent_id", parent).maybeSingle();
      if (error) throw new Error(`pause owner: ${error.message}`);
      return data?.stripe_customer_id ?? null;
    }),
  };
}
export function livePauses(): PauseSeams | null {
  const db = adminClient(), client = stripe();
  return db && client ? supabasePauses(db, client) : null;
}
export async function finishControl(db: SupabaseClient<Database>, id: string, state: "applied" | "refused") {
  const { error } = await db.rpc("finish_plan_control", { p_id: id, p_state: state });
  if (error) throw new Error(`plan control finish: ${error.message}`);
}

/** Server-only terms. The browser sends only the row and the opaque confirmation token. */
export async function restartFamilyPlan(parent: string, card: string, token?: string) {
  const db = adminClient(), client = stripe();
  if (!db || !client) return { ok: false as const, error: "unavailable" };
  const { data, error } = await db.from("card_setups").select("id,child_id,stripe_customer_id,card_saved_at,price,plan").eq("id", card).eq("parent_id", parent).maybeSingle();
  if (error) throw new Error(`restart owner: ${error.message}`);
  if (!data?.stripe_customer_id || !data.card_saved_at) return { ok: false as const, error: "not_found" };
  const context = await planControlContext(db, parent, card);
  if (!context) return { ok: false as const, error: "not_found" };
  const price = planPrice(Number(data.price), data.plan), revision = nullable(context.revision) ?? "";
  if (!Number.isFinite(price) || price <= 0) return { ok: false as const, error: "unavailable" };
  const rows = supabaseCardRows(db), row = await rows.cardRow(card);
  if (row?.planStart?.state === "open" && rows.startTerms) Object.assign(row.planStart, await rows.startTerms(card, row.planStart.generation));
  const recovering = row?.planStart?.state === "open" && row.planStart.purpose === "restart";
  const generation = row?.planStart?.state === "open" ? row.planStart.generation : (row?.planStart?.generation ?? 0) + 1;
  const expected = controlToken({ parent, card, price, revision, generation });
  if (!token && recovering) token = expected;
  if (!token) {
    if (context.blocked) return { ok: false as const, error: "pending" };
    const plans = await customerSubscriptions(client, data.stripe_customer_id, CARD_READ);
    if (plans.length === 0 || plans.some(p => planNotOver(p.status))) return { ok: false as const, error: "not_ended" };
    return { ok: true as const, state: "preview" as const, price, token: expected };
  }
  if (token !== expected) return { ok: false as const, error: "stale" };
  if (context.blocked && !recovering) return { ok: false as const, error: "pending" };
  if (await holdPlanStart(db, parent, card) === "fenced") return { ok: false as const, error: "pending" };
  const startedAt = Date.now();
  const result = await startPlan(client, { cardSetup: card, customer: data.stripe_customer_id, price, deliveryConfirmed: false, purpose: "restart", restartRevision: revision }, undefined, rows);
  // Before anything else that can throw: the plan is running, so access reopens now, with no webhook wait.
  const access = result.ok ? await openRestartedPlan(db, client, { customer: data.stripe_customer_id, cardSetup: card, generation: result.generation, startedAt }) : null;
  // Unknown provider outcomes retain both the start record and its route hold.
  // A confirmed refusal can release the hold only after the durable record is closed.
  if ((result.ok || (result.error !== "unconfirmed" && result.error !== "needs_team"))
    && (await rows.cardRow(card))?.planStart?.state !== "open") await endCardOperation(db, card);
  return result.ok ? { ok: true as const, state: "started" as const, price, access: access ?? "pending" } : result;
}

/**
 * As the admin start route does. The plan has started, so a failed write must not read as a failed restart. After a failed write the webhook is
 * the only fallback: the re-read does not take `ended` rows, and the card sweep writes plan state only when it closes an open start itself.
 * With that webhook lost too, an `ended` row stays closed on a paying plan (#713). A family with no row is filled on its next Account tab load.
 */
async function openRestartedPlan(db: SupabaseClient<Database>, client: NonNullable<ReturnType<typeof stripe>>, start: Parameters<typeof applyPlanStart>[0]): Promise<"open" | "pending"> {
  try {
    return await applyPlanStart(start, { store: supabasePlanStore(db), provider: stripePlanProvider(client) }) === "no_match" ? "pending" : "open";
  } catch (e) {
    console.error("[plan] plan state after a restart failed", e instanceof Error ? e.message : "failed");
    return "pending";
  }
}

/** Safe parent-visible facts from the private pause ledger. Never return a provider id or child profile. */
export async function childPauseMailing(db: SupabaseClient<Database>, parent: string, child: string, number: number): Promise<number> {
  const { data, error } = await db.rpc("plan_mailing_weeks", { p_parent: parent, p_child: child, p_number: number });
  if (error) throw new Error(`pause mailing: ${error.message}`);
  return num(data);
}

/** Confirmed pause dates remain visible while the provider's renewal boundary has not moved yet. */
export async function adjustedPlan(db: SupabaseClient<Database>, parent: string, card: string, plan: ParentPlan): Promise<ParentPlan> {
  if (plan.kind !== "paying" && plan.kind !== "free_month") return plan;
  const context = await planControlContext(db, parent, card);
  if (!context || context.blocked || context.cancelled) return { kind: "unknown" };
  for (const raw of array(context.pauses)) {
    const pause = record(raw);
    if (pause.state !== "applied" || pause.retired === true) continue;
    const quote = readQuote(pause.quote);
    if (plan.kind === "paying" && plan.nextCharge === quote.previousCharge) plan = { ...plan, nextCharge: quote.chargeAt };
    if (plan.kind === "free_month" && plan.firstCharge === quote.previousCharge) plan = { ...plan, firstCharge: quote.chargeAt };
  }
  return plan;
}

export async function pendingPlanControl(db: SupabaseClient<Database>, parent: string, card: string): Promise<"pause" | "restart" | "cancel" | null> {
  const context = await planControlContext(db, parent, card);
  const kind = context?.pendingKind;
  return kind === "pause" || kind === "restart" || kind === "cancel" ? kind : null;
}

export async function familyPendingControls(parent: string, cards: readonly string[]) {
  const db = adminClient();
  if (!db) return new Map<string, "pause" | "restart" | "cancel" | null>();
  return new Map(await Promise.all(cards.map(async card => [card, await pendingPlanControl(db, parent, card)] as const)));
}
