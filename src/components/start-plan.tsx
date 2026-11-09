"use client";

import { localDay, PACIFIC_ZONE } from "@/lib/family-time";

import { useState } from "react";
import type { StartPlanError } from "@/lib/plan-start-errors";

const ERRORS: Record<StartPlanError, string> = {
  already: "This child already has a plan in Stripe. Open it in Stripe to check.",
  no_card: "No saved card was found for this child.",
  not_delivered: "Confirm that the first workbook has arrived at the family's home before starting the free month.",
  delivery_receipt_required: "Open this child's workbook 1 and confirm its delivery. Then return here to start the free month.",
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
 * D-139: "Workbook delivered: start free month" on a saved card. One confirm, then the subscription with the free trial starts
 * in Stripe and the parent gets the confirmation email. Shows the first charge date, or why it did not start.
 */
export function StartPlan({ cardId, child }: { cardId: string; child: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    if (busy || !window.confirm(`Has ${child}'s first workbook arrived at their home? Confirm only after delivery. The 30-day free month begins now. Stripe charges the saved card on day 30.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/cards/${cardId}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryConfirmed: true }),
      });
      if (res.status === 404) { setError("This card is unavailable or your admin access has ended."); return; }
      const result = await res.json();
      if (result.ok) { setDone(result.firstChargeAt); setUnconfirmed(result.confirmation !== "sent"); return; }
      setError(Object.hasOwn(ERRORS, result.error) ? ERRORS[result.error as StartPlanError] : ERRORS.failed);
    } catch { setError("The response was lost. Open the family in Stripe to check before trying again."); }
    finally { setBusy(false); }
  }
  if (done) return <>
    <span className="adm-note">Started. First charge {localDay(done, PACIFIC_ZONE)}</span>
    {unconfirmed && <p role="alert" className="adm-note">We could not confirm the free month email. If it was refused, we try again every 15 minutes. Reload this page later and check Workbook emails on this card. If it still did not go, send the parent its text by hand.</p>}
  </>;
  return <>
    <button type="button" className="btn adm-btn" onClick={start} disabled={busy}>{busy ? "Starting..." : "Workbook delivered: start free month"}</button>
    {error && <p role="alert" className="adm-note">{error}</p>}
  </>;
}
