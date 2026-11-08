"use client";

import { localDay, PACIFIC_ZONE } from "@/lib/family-time";

import { useState } from "react";

const ERRORS: Record<string, string> = {
  already: "This family already has a plan in Stripe. Open it in Stripe to check.",
  no_card: "No saved card was found for this family.",
  not_delivered: "Confirm that the first workbook has arrived at the family's home before starting the free month.",
  delivery_receipt_required: "Open this child's workbook 1 and confirm its delivery. Then return here to start the free month.",
  unconfirmed: "We could not confirm that Stripe started this plan. Do not start another one. Reload this page in 15 minutes, or check the family in Stripe.",
  needs_team: "This start needs the team: Stripe did not answer it, and after 24 hours we still find no plan. Do not start another one. Reload this page to see what to do.",
  unavailable: "Stripe is unavailable. Try again later.",
  failed: "Stripe could not start the plan. Check Stripe before trying again.",
};

/** The start's answer, as the route gives it. `access` is "pending" when the plan state write after the start failed. */
export interface StartedAnswer {
  firstChargeAt: string;
  access: "open" | "pending";
  confirmation: string;
}

/** What the admin reads after a start that Stripe confirmed. */
export function StartedPlan({ firstChargeAt, access, confirmation }: StartedAnswer) {
  return <>
    <span className="adm-note">Started. First charge {localDay(firstChargeAt, PACIFIC_ZONE)}</span>
    {access === "pending" && <p role="alert" className="adm-note">The plan started in Stripe, but this child cannot use Unica yet: we could not save the plan on our side. The daily plan check opens it in its next run, which comes every 15 minutes, or the next Stripe event for this family opens it before that. Do not start another plan.</p>}
    {confirmation !== "sent" && <p role="alert" className="adm-note">We could not confirm the free month email. If it was refused, we try again every 15 minutes. Reload this page later and check Workbook emails on this card. If it still did not go, send the parent its text by hand.</p>}
  </>;
}

/**
 * D-139: "Workbook delivered: start free month" on a saved card. One confirm, then the subscription with the free trial starts
 * in Stripe and the parent gets the confirmation email. Shows the first charge date, or why it did not start.
 */
export function StartPlan({ cardId, child }: { cardId: string; child: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<StartedAnswer | null>(null);
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
      if (result.ok) { setDone({ firstChargeAt: result.firstChargeAt, access: result.access === "open" ? "open" : "pending", confirmation: String(result.confirmation) }); return; }
      setError(ERRORS[result.error] ?? ERRORS.failed);
    } catch { setError("The response was lost. Open the family in Stripe to check before trying again."); }
    finally { setBusy(false); }
  }
  if (done) return <StartedPlan {...done} />;
  return <>
    <button type="button" className="btn adm-btn" onClick={start} disabled={busy}>{busy ? "Starting..." : "Workbook delivered: start free month"}</button>
    {error && <p role="alert" className="adm-note">{error}</p>}
  </>;
}
