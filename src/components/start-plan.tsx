"use client";

import { familyPlanWords as w } from "@/lib/family-plan-words";

import { localDay, PACIFIC_ZONE } from "@/lib/family-time";

import { useState } from "react";
import { DELIVERY_RECEIPT_TEXT, type StartPlanError } from "@/lib/plan-start-errors";
import type { FamilyPlanOffer } from "@/lib/family-plan-words";

const ERRORS: Record<StartPlanError, string> = {
  family_plan_upgrade_required: w.siblingStop,
  already: "This child already has a plan in Stripe. Open it in Stripe to check.",
  no_card: "No saved card was found for this child.",
  not_delivered: "Confirm that the first workbook has arrived at the family's home before starting the free month.",
  delivery_receipt_required: DELIVERY_RECEIPT_TEXT,
  unconfirmed: "We could not confirm that Stripe started this plan. Do not start another one. Reload this page in 15 minutes, or check the family in Stripe.",
  needs_team: "This start needs the team: Stripe did not answer it, and after 24 hours we still find no plan. Do not start another one. Reload this page to see what to do.",
  unavailable: "The plan service is unavailable. Try again later.",
  failed: "We could not confirm the plan start. Check this child's plan in Stripe before trying again.",
  delivery_confirmation_required: "The delivery confirmation was not sent correctly. Reload this page and confirm delivery again.",
  invalid: "The start request could not be read. Reload this page and try again.",
  restart_required: "This child's plan has ended. The parent can restart it from the Account tab, or the team can use Restart.",
  wrong_mode: "A restart for this child is in progress. Wait for it to finish before trying again.",
  family_unavailable: "This family is being deleted. A plan cannot be started.",
  payment_refused: "Stripe refused the saved card. Ask the parent to update it in the Account tab before trying again.",
  not_ended: "This child's plan is still running. It cannot be restarted yet.",
};

/**
 * The start's answer, as the route gives it. `access` is "pending" when the plan state write after the start did not answer that it
 * stored: it may have failed, or it may have stored and its answer been lost. So the note claims neither.
 */
export interface StartedAnswer {
  firstChargeAt: string;
  access: "open" | "pending";
  confirmation: string;
  monthlyPrice?: number | null;
}

/** What the admin reads after a start that Stripe confirmed. */
export function StartedPlan({ firstChargeAt, access, confirmation, monthlyPrice }: StartedAnswer) {
  return <>
    <span className="adm-note">Started. {monthlyPrice != null && <>{w.monthly(monthlyPrice)} </>}First charge {localDay(firstChargeAt, PACIFIC_ZONE)}</span>
    {access === "pending" && <p role="alert" className="adm-note">The plan started in Stripe, but we could not confirm that this child can use Unica. Automatic checks will try again. Check this child&apos;s plan state later today. Do not start another plan.</p>}
    {confirmation !== "sent" && <p role="alert" className="adm-note">{w.emailUnconfirmed} If it was refused, we try again every 15 minutes. Reload this page later and check Workbook emails on this card. If it still did not go, send the parent its text by hand.</p>}
  </>;
}

/** The request was refused before the route called Stripe (for example the origin check's 403), so nothing started. */
export const START_REFUSED = "The start request was refused before it reached Stripe. Nothing started. Reload this page and press the button again.";
/** No answer, or an answer we cannot read after the route may have called Stripe. */
export const START_LOST = "The response was lost. Open the family in Stripe to check before trying again.";

/**
 * D-139: "Workbook delivered: start plan" on a saved card. One confirm, then the subscription with the free trial starts
 * in Stripe and the parent gets the confirmation email. Shows the first charge date, or why it did not start.
 * `familyWindow` is the family's free window before this start. The approved window sentences show only when the family
 * may already have one: "new" (no window yet, so this is the first child) shows none, and an unknown window keeps them.
 */
export function StartPlan({ cardId, child, familyWindow = null }: { cardId: string; child: string; familyWindow?: FamilyPlanOffer["window"] | null }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<StartedAnswer | null>(null);
  const [error, setError] = useState("");
  async function start() {
    const windowWords = familyWindow === "new" ? "" : ` ${w.existingWindow} ${w.immediateCharge}`;
    if (busy || !window.confirm(`${w.adminConfirm(child)} Confirm only after delivery.${windowWords}`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/cards/${cardId}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryConfirmed: true }),
      });
      if (res.status === 404) { setError("This card is unavailable or your admin access has ended."); return; }
      // The route answers JSON once it reads the card. A 4xx with no JSON body (the origin check's 403, or the platform's own
      // refusal) never reached that point, so Stripe was not called. A body we cannot read after that point is a lost answer.
      if (res.status === 403) { setError(START_REFUSED); return; }
      const result = await res.json().catch(() => null);
      if (!result || typeof result !== "object") { setError(res.status >= 400 && res.status < 500 ? START_REFUSED : START_LOST); return; }
      if (result.ok) { setDone({ firstChargeAt: result.firstChargeAt, access: result.access === "open" ? "open" : "pending", confirmation: String(result.confirmation), monthlyPrice: result.monthlyPrice ?? null }); return; }
      setError(Object.hasOwn(ERRORS, result.error) ? ERRORS[result.error as StartPlanError] : ERRORS.failed);
    } catch { setError(START_LOST); }
    finally { setBusy(false); }
  }
  if (done) return <StartedPlan {...done} />;
  return <>
    <button type="button" className="btn adm-btn" onClick={start} disabled={busy}>{busy ? "Starting..." : w.adminAction}</button>
    {error && <p role="alert" className="adm-note">{error}</p>}
  </>;
}
