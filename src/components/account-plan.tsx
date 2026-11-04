"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

/** "Cancel plan": one confirmation, with no offer to stay. The plan page reloads from Stripe after it. */
export function CancelPlan({ cardId, name, consequence }: { cardId: string; name: string; consequence: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function cancel() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/account/plan/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: cardId }) });
      // A plan that has already stopped is what the parent wanted; the reload shows it.
      if (res.ok || res.status === 409) { setAsking(false); router.refresh(); return; }
      setFailed(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <div className="acct-plan-actions">
    {asking ? <>
      <p>Cancel {name}&apos;s plan? {consequence}</p>
      <div className="acct-plan-buttons">
        <button type="button" className="btn" onClick={cancel} disabled={busy}>{busy ? "Cancelling..." : "Yes, cancel plan"}</button>
        <button type="button" className="btn ghost" onClick={() => setAsking(false)} disabled={busy}>Keep plan</button>
      </div>
    </> : <button type="button" className="btn ghost" onClick={() => setAsking(true)}>Cancel plan</button>}
    {failed && <p role="alert" className="acct-alert">We could not cancel the plan. Try again, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>}
  </div>;
}
