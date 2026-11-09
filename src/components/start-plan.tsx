"use client";

import { localDay, PACIFIC_ZONE } from "@/lib/family-time";

import { useState } from "react";

const ERRORS: Record<string, string> = {
  family_plan_upgrade_required: "This child is a sibling. Their price (CAD 59.99) can start once the sibling update ships.",
  already: "This family already has a plan in Stripe. Open it in Stripe to check.",
  no_card: "No saved card was found for this family.",
  not_delivered: "Confirm that the first workbook has arrived at the family's home before starting the free month.",
  delivery_receipt_required: "Open this child's workbook 1 and confirm its delivery. Then return here to start the free month.",
  unconfirmed: "We could not confirm that Stripe started this plan. Do not start another one. Reload this page in 15 minutes, or check the family in Stripe.",
  needs_team: "This start needs the team: Stripe did not answer it, and after 24 hours we still find no plan. Do not start another one. Reload this page to see what to do.",
  unavailable: "Stripe is unavailable. Try again later.",
  failed: "Stripe could not start the plan. Check Stripe before trying again.",
};

/**
 * D-139: "Workbook delivered: start plan" on a saved card. One confirm, then the subscription with the free trial starts
 * in Stripe and the parent gets the confirmation email. Shows the first charge date, or why it did not start.
 */
export function StartPlan({ cardId, child }: { cardId: string; child: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ at: string; monthly: number | null } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    if (busy || !window.confirm(`Has ${child}'s first workbook arrived at their home? Confirm only after delivery. The family's existing free window applies. If it has ended, Stripe charges the monthly price now.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/cards/${cardId}/start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryConfirmed: true }),
      });
      if (res.status === 404) { setError("This card is unavailable or your admin access has ended."); return; }
      const result = await res.json();
      if (result.ok) { setDone({ at: result.firstChargeAt, monthly: result.monthlyPrice ?? null }); setUnconfirmed(result.confirmation !== "sent"); return; }
      setError(ERRORS[result.error] ?? ERRORS.failed);
    } catch { setError("The response was lost. Open the family in Stripe to check before trying again."); }
    finally { setBusy(false); }
  }
  if (done) return <>
    <span className="adm-note">Started. {done.monthly !== null && <>CAD {done.monthly.toFixed(2)} a month. </>}First charge {localDay(done.at, PACIFIC_ZONE)}</span>
    {unconfirmed && <p role="alert" className="adm-note">We could not confirm the plan start email. If it was refused, we try again every 15 minutes. Reload this page later and check Workbook emails on this card. If it still did not go, send the parent its text by hand.</p>}
  </>;
  return <>
    <button type="button" className="btn adm-btn" onClick={start} disabled={busy}>{busy ? "Starting..." : "Workbook delivered: start plan"}</button>
    {error && <p role="alert" className="adm-note">{error}</p>}
  </>;
}
