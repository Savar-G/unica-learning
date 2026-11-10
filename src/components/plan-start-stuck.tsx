"use client";

import { useState } from "react";
import { StartPlan } from "@/components/start-plan";
import type { FamilyPlanOffer } from "@/lib/family-plan-words";

const ERRORS: Record<string, string> = {
  changed: "This start has changed. Reload this page.",
  too_soon: "Stripe may still answer this start. Try again after 24 hours.",
  landed: "The plan from this start is in Stripe now. The start is closed, and the parent gets the confirmation email. Reload this page.",
  already: "This family has another running plan in Stripe. The start is closed. Reload this page.",
  unavailable: "We could not read Stripe, so the start stays open. Try again later.",
};

/**
 * #554: a plan start that Stripe never answered, 24 hours on, with no plan found. The record stays open, as the request may still
 * land. Only an admin, after their own check in Stripe, closes it. An initial start is offered only when none has completed.
 */
export function PlanStartStuck({ cardId, parentId, child, generation, allowInitialStart, familyWindow = null }: { cardId: string; parentId: string; child: string; generation: number; allowInitialStart: boolean; familyWindow?: FamilyPlanOffer["window"] | null }) {
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState("");
  async function close() {
    if (busy || !window.confirm(`Close this start for ${child}? Confirm only after you opened this family in Stripe and found no plan from this start. If Stripe still makes that plan later, a new start could make a second one.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/cards/${cardId}/plan-start`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generation, checkedStripe: true }),
      });
      if (res.status === 404) { setError("This card is unavailable or your admin access has ended."); return; }
      const result = await res.json();
      if (result.ok) { setClosed(true); return; }
      setError(ERRORS[result.error] ?? ERRORS.unavailable);
    } catch { setError("The response was lost. Reload this page to check the start."); }
    finally { setBusy(false); }
  }
  if (closed) return <>
    <span className="adm-note">{allowInitialStart ? "Start closed. You can start the free month again." : "Start closed."}</span>
    {allowInitialStart && <StartPlan parentId={parentId} cardId={cardId} child={child} familyWindow={familyWindow} />}
  </>;
  return <>
    <p role="alert" className="adm-note">This start needs the team. Stripe did not answer it, and after 24 hours we still find no plan. Do not start another one. Open this family in Stripe to check.</p>
    <button type="button" className="btn adm-btn" onClick={close} disabled={busy}>{busy ? "Closing..." : "I checked Stripe: close this start"}</button>
    {error && <p role="alert" className="adm-note">{error}</p>}
  </>;
}
