import "server-only";
import { sendPlanStartAlert } from "@/lib/card-plan-alert";
import { CARD_WATCH_MS, sweepCards, writeWindow, type CardCheckSeams, type CardSweep } from "@/lib/card-reconcile";
import { supabaseCardRows } from "@/lib/card-reconcile-server";
import type { MailTransport } from "@/lib/email-delivery";
import { stripe, stripeWithin } from "@/lib/stripe";
import { stripeCards } from "@/lib/stripe-subscriptions";
import { planPrice } from "@/lib/subscription-plan";
import { adminClient } from "@/lib/supabase-auth";
import { planStartEmailClaim, sendPlanStartEmail } from "@/lib/workbook-email-server";

// The card comparison's seams for the webhook and the sweep (src/lib/card-reconcile.ts).
//
// The sweep's times, from the start of the /api/reminders run, inside its 60-second limit:
//   - 25 s: no new row starts.
//   - 30 s: no Stripe write and no email starts, also after an email's reads, claim and wait in the transport. Each has a 15-second
//     limit, so one that starts in time ends by 45 s.
//   - 45 s: all the sweep's work ends. One signal goes to every Stripe call, database call and email in it.
// The monthly emails' work ends at 50 s (MONTHLY_END_MS in the route), as before. That leaves 15 s and 10 s to answer.

/** The sweep starts no new row after this, from the start of the run. */
const SWEEP_START_MS = 25_000;
/** The sweep starts no write and no email after this. */
const SWEEP_WRITE_MS = 30_000;
/** All the sweep's work ends at this time. */
export const SWEEP_END_MS = 45_000;

/**
 * The seams, or null without the secret key or the Stripe key. `canWrite` starts now. `announcePlan` sends the plan start's one
 * confirmation email, which the start route could not send when its request timed out. The email's send key makes it once only.
 * `signal`: every Stripe call, database call and email of these seams ends with it. `transport`: the emails', shared with the run.
 */
export function liveCardChecks(origin: string, { canWrite = writeWindow(), signal, transport }: { canWrite?: () => boolean; signal?: AbortSignal; transport?: MailTransport } = {}): CardCheckSeams | null {
  const db = adminClient(signal);
  const client = signal ? stripeWithin(signal) : stripe();
  if (!db || !client) return null;
  const rows = supabaseCardRows(db);
  // The time is asked again right before each request, after the transport's wait. The plan email's own check goes first, so it can
  // tell that the time stopped it.
  const mail: MailTransport | undefined = transport && { send: (message, options) => transport.send(message, { signal, mayStart: canWrite, ...options }) };
  return {
    rows,
    stripe: stripeCards(client),
    canWrite,
    async announcePlan(row, start) {
      if (!start.firstCharge) throw new Error("The plan has no first charge date");
      const { data, error } = await db.from("card_setups").select("plan, price").eq("id", row.cardId).maybeSingle();
      if (error || !data) throw new Error("Card setup read failed");
      const sent = await sendPlanStartEmail(db, { cardId: row.cardId, generation: start.generation, price: planPrice(Number(data.price), data.plan), firstChargeAt: start.firstCharge, origin }, mail, canWrite);
      if (sent.status !== "sent") console.warn("[billing] plan start email", sent.status);
      return sent;
    },
    planEmailClaim: (cardId, generation) => planStartEmailClaim(db, cardId, generation),
    alertTeam: (row, start) => sendPlanStartAlert(rows, row, start, { to: process.env.SIGNUP_NOTIFY_EMAIL || null, origin, transport: mail }),
  };
}

/** The sweep of one /api/reminders run. Never throws, and all its work ends SWEEP_END_MS after `startedAt`. */
export async function sweepCardsNow({ origin, startedAt, transport }: { origin: string; startedAt: number; transport: MailTransport }): Promise<CardSweep | { error: "run_failed" } | { error: "not_configured" }> {
  const end = new AbortController();
  const timer = setTimeout(() => end.abort(new Error("The sweep's time is over")), Math.max(0, startedAt + SWEEP_END_MS - Date.now()));
  try {
    const seams = liveCardChecks(origin, { canWrite: writeWindow(SWEEP_WRITE_MS, startedAt), signal: end.signal, transport });
    if (!seams) return { error: "not_configured" };
    const result = await sweepCards(seams, { now: () => Date.now(), startBy: startedAt + SWEEP_START_MS, signal: end.signal });
    if (result.corrected > 0 || result.plans > 0 || result.emails > 0 || result.needsTeam > 0 || result.failed > 0 || result.outOfTime) console.info("[card sweep] run", JSON.stringify(result));
    return result;
  } catch (e) {
    console.error("[card sweep] run failed", e instanceof Error ? e.message : e);
    return { error: "run_failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** The dry run's count. */
export async function dueCardCount(now: number): Promise<number> {
  const db = adminClient();
  return db ? (await supabaseCardRows(db).dueCardRows(now - CARD_WATCH_MS, 1000)).length : 0;
}
