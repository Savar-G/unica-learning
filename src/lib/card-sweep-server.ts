import "server-only";
import { CARD_WATCH_MS, sweepCards, writeWindow, type CardCheckSeams, type CardSweep } from "@/lib/card-reconcile";
import { supabaseCardRows } from "@/lib/card-reconcile-server";
import { stripe } from "@/lib/stripe";
import { stripeCards } from "@/lib/stripe-subscriptions";
import { planPrice } from "@/lib/subscription-plan";
import { adminClient } from "@/lib/supabase-auth";
import { sendPlanStartEmail } from "@/lib/workbook-email-server";

// The card comparison's seams for the webhook and the sweep (src/lib/card-reconcile.ts).

/** The sweep starts no new row after this, from the start of the run. */
const SWEEP_START_MS = 25_000;
/** The sweep starts no write after this: 15 seconds for the write and 9 for the read after it stay inside the 60-second limit. */
const SWEEP_WRITE_MS = 35_000;

/**
 * The seams, or null without the secret key or the Stripe key. `canWrite` starts now. `announcePlan` sends the plan start's one
 * confirmation email, which the start route could not send when its request timed out. The email's send key makes it once only.
 */
export function liveCardChecks(origin: string, canWrite = writeWindow()): CardCheckSeams | null {
  const db = adminClient();
  const client = stripe();
  if (!db || !client) return null;
  return {
    rows: supabaseCardRows(db),
    stripe: stripeCards(client),
    canWrite,
    async announcePlan(row, plan) {
      if (!plan.firstCharge) throw new Error("The plan has no first charge date");
      const { data, error } = await db.from("card_setups").select("plan, price").eq("id", row.cardId).maybeSingle();
      if (error || !data) throw new Error("Card setup read failed");
      const sent = await sendPlanStartEmail(db, { cardId: row.cardId, price: planPrice(Number(data.price), data.plan), firstChargeAt: plan.firstCharge, origin });
      if (sent.status !== "sent") console.warn("[billing] plan start email", sent.status);
    },
  };
}

/** The sweep of one /api/reminders run. Never throws, and never holds up the run's answer past its own time. */
export async function sweepCardsNow({ origin, startedAt }: { origin: string; startedAt: number }): Promise<CardSweep | { error: "run_failed" } | { error: "not_configured" }> {
  const seams = liveCardChecks(origin, writeWindow(SWEEP_WRITE_MS, startedAt));
  if (!seams) return { error: "not_configured" };
  try {
    const result = await sweepCards(seams, { now: () => Date.now(), startBy: startedAt + SWEEP_START_MS });
    if (result.corrected > 0 || result.plans > 0 || result.failed > 0 || result.outOfTime) console.info("[card sweep] run", JSON.stringify(result));
    return result;
  } catch (e) {
    console.error("[card sweep] run failed", e instanceof Error ? e.message : e);
    return { error: "run_failed" };
  }
}

/** The dry run's count. */
export async function dueCardCount(now: number): Promise<number> {
  const db = adminClient();
  return db ? (await supabaseCardRows(db).dueCardRows(now - CARD_WATCH_MS, 1000)).length : 0;
}
