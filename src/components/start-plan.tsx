"use client";

import { useState } from "react";

const ERRORS: Record<string, string> = {
  already: "This family already has a plan in Stripe. Open it in Stripe to check.",
  no_card: "No saved card was found for this family.",
  unavailable: "Stripe is unavailable. Try again later.",
  failed: "Stripe could not start the plan. Check Stripe before trying again.",
};

/**
 * D-139: "Workbook shipped: start plan" on a saved card. One confirm, then the subscription with the free trial starts
 * in Stripe. Shows the first charge date, or why it did not start.
 */
export function StartPlan({ cardId, child }: { cardId: string; child: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function start() {
    if (busy || !window.confirm(`Start ${child}'s plan? The free first month begins now. Stripe charges the saved card on day 30.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/cards/${cardId}/start`, { method: "POST" });
      if (res.status === 404) { setError("This card is unavailable or your admin access has ended."); return; }
      const result = await res.json();
      if (result.ok) { setDone(result.firstChargeAt); return; }
      setError(ERRORS[result.error] ?? ERRORS.failed);
    } catch { setError("The response was lost. Open the family in Stripe to check before trying again."); }
    finally { setBusy(false); }
  }
  if (done) return <span className="adm-note">Started. First charge {new Date(done).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" })}</span>;
  return <>
    <button type="button" className="btn adm-btn" onClick={start} disabled={busy}>{busy ? "Starting..." : "Workbook shipped: start plan"}</button>
    {error && <p role="alert" className="adm-note">{error}</p>}
  </>;
}
