"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

/** "Update card": goes to Stripe's hosted page. The page comes back to the Account tab, which says what happened. */
export function UpdateCard({ cardId, name }: { cardId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function open() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch("/api/account/card-update", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: cardId }) });
      const body: { url?: unknown } = res.ok ? await res.json() : {};
      if (typeof body.url === "string") { window.location.assign(body.url); return; }
    } catch { /* The line below says so. */ }
    setFailed(true);
    setBusy(false);
  }
  return <div className="acct-plan-actions">
    <button type="button" className="btn ghost" onClick={open} disabled={busy} aria-label={`Update card for ${name}`}>{busy ? "Opening..." : "Update card"}</button>
    {failed && <p role="alert" className="acct-alert">We could not open the card page. Try again, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>}
  </div>;
}

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
      if (res.ok) { setAsking(false); router.refresh(); return; }
      if (res.status === 409 && (await res.json()).error === "no_plan") { setAsking(false); router.refresh(); return; }
      setFailed(true);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return <CancelPlanView name={name} consequence={consequence} asking={asking} busy={busy} failed={failed} cancel={cancel} keep={() => setAsking(false)} ask={() => setAsking(true)} />;
}

export function CancelPlanView({ name, consequence, asking, busy, failed, cancel, keep, ask }: {
  name: string; consequence: string; asking: boolean; busy: boolean; failed: boolean;
  cancel: () => void; keep: () => void; ask: () => void;
}) {
  return <div className="acct-plan-actions">
    {asking ? <>
      <p>Cancel {name}&apos;s plan? {consequence}</p>
      <div className="acct-plan-buttons">
        <button type="button" className="btn" onClick={cancel} disabled={busy}>{busy ? "Cancelling..." : "Yes, cancel plan"}</button>
        <button type="button" className="btn ghost" onClick={keep} disabled={busy}>Keep plan</button>
      </div>
    </> : <button type="button" className="btn ghost" onClick={ask}>Cancel plan</button>}
    {failed && <p role="alert" className="acct-alert">We could not confirm cancellation. A plan change may still be in progress. Try again, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>}
  </div>;
}

export interface PausePreview {
  token: string; weeks: number; remaining: number; year: number; late: boolean; targetNumber: number;
  charge: string; earliest: string | null; latest: string | null;
}
const controlErrors: Record<string, string> = {
  allowance: "This pause exceeds the eight weeks available this calendar year. Choose fewer weeks.",
  not_delivered: "You can pause after the first workbook arrives.",
  unsupported: "We cannot change this plan here yet. Please email us to arrange a pause.",
  stale: "The plan or its dates changed. Review the new dates before you confirm.",
  pending: "We cannot confirm this change yet. Check again before you make another change or delete the account.",
  unconfirmed: "We cannot confirm this change yet. Check again before you make another change or delete the account.",
  needs_team: "We cannot confirm this change yet. Please email us before you make another change.",
  no_card: "Please update your card. Then return here to restart the plan.",
  payment_refused: "Your payment did not go through. Please update your card. Then return here to restart the plan.",
  not_ended: "This plan has not ended. Reload the page to see its current state.",
};

/** Progressive confirmation uses only server-written dates and terms. A failed confirmation keeps its token for recovery. */
export function PlanControl({ cardId, name, mode, pending = false }: { cardId: string; name: string; mode: "pause" | "restart"; pending?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [weeks, setWeeks] = useState(1), [preview, setPreview] = useState<PausePreview | null>(null);
  const [restart, setRestart] = useState<{ price: number; token: string } | null>(null);
  // The action that finished: after a restart the refreshed plan renders this control in pause mode, and it must still say what happened.
  const [error, setError] = useState<string | null>(null), [done, setDone] = useState<"pause" | "restart" | null>(null);
  async function send(confirm: boolean) {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/account/plan/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: cardId, weeks, action: confirm ? "confirm" : "preview", ...(confirm ? { token: preview?.token ?? restart?.token } : {}) }) });
      const body = await response.json();
      if (!response.ok || body.ok !== true) {
        const key = typeof body.error === "string" ? body.error : "failed";
        setError(controlErrors[key] ?? "We could not complete this change. Try again, or email us.");
        if (key === "stale" || key === "payment_refused") { setPreview(null); setRestart(null); }
        return;
      }
      if (body.state === "applied" || body.state === "started") { setDone(mode); setPreview(null); setRestart(null); router.refresh(); return; }
      if (mode === "pause") setPreview(body);
      else setRestart({ price: body.price, token: body.token });
    } catch { setError(controlErrors.pending); }
    finally { setBusy(false); }
  }
  const close = () => { setOpen(false); setPreview(null); setRestart(null); setError(null); };
  return <PlanControlView name={name} mode={mode} pending={pending} open={open} busy={busy} weeks={weeks} preview={preview} restart={restart} error={error} done={done}
    onOpen={() => { setOpen(true); if (pending) void send(false); }} setWeeks={setWeeks} setPreview={setPreview} send={send} close={close} cardId={cardId} />;
}

export interface PlanControlViewProps {
  name: string; mode: "pause" | "restart"; pending: boolean; open: boolean; busy: boolean; weeks: number;
  preview: PausePreview | null; restart: { price: number; token: string } | null; error: string | null; done: "pause" | "restart" | null;
  onOpen: () => void; setWeeks: (weeks: number) => void; setPreview: (preview: PausePreview | null) => void;
  send: (confirm: boolean) => void; close: () => void; cardId: string;
}

/** The same confirmation view is also used by the static Admin sample renderer. */
export function PlanControlView({ name, mode, pending, open, busy, weeks, preview, restart, error, done, onOpen, setWeeks, setPreview, send, close, cardId }: PlanControlViewProps) {
  const label = pending ? `Check ${mode}` : mode === "pause" ? "Pause plan" : "Restart plan";
  return <div className="acct-plan-actions">
    {done ? <p role="status">{done === "pause" ? "The pause is saved. Your mailing and charge dates have changed." : "The paid plan has restarted. We will prepare the next workbook from the current learning profile."}</p>
      : !open ? <button type="button" className="btn ghost" onClick={onOpen} aria-label={`${label} for ${name}`}>{label}</button>
        : <>
          <p><b>{mode === "pause" ? `Pause ${name}'s plan` : `Restart ${name}'s plan`}</b></p>
          {mode === "pause" && !preview && !pending && <>
            <p>You can pause for up to eight whole weeks per calendar year after the first delivery.</p>
            <label>Weeks to pause <select value={weeks} onChange={event => { setWeeks(Number(event.target.value)); setPreview(null); }} disabled={busy}>{Array.from({ length: 8 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
          </>}
          {preview && <>
            <p>{preview.weeks} {preview.weeks === 1 ? "week" : "weeks"}. Next charge: {preview.charge}.</p>
            <p>{preview.earliest && preview.latest ? `Next mailing: ${preview.earliest} to ${preview.latest}.` : "We cannot confirm the next mailing range yet."}</p>
            {preview.late && <p>The next workbook keeps its mailing range. The pause applies from workbook {preview.targetNumber}. We will show that mailing range after the next workbook ships.</p>}
            <p>{preview.remaining} weeks remain in {preview.year} after this pause.</p>
          </>}
          {mode === "restart" && <p>{restart ? `We charge CAD ${restart.price.toFixed(2)} immediately, then CAD ${restart.price.toFixed(2)} each month until you cancel. ` : "Restart begins a paid plan immediately. Review the price before you confirm. "}There is no second free month.</p>}
          <div className="acct-plan-buttons">
            <button type="button" className="btn" disabled={busy} onClick={() => send(!!(preview || restart))}>{busy ? "Please wait..." : preview || restart ? `Confirm ${mode}` : pending ? `Check ${mode}` : mode === "pause" ? "Review new dates" : "Review price"}</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={close}>{pending ? "Close" : "Keep current plan"}</button>
            {preview && <button type="button" className="btn ghost" disabled={busy} onClick={() => setPreview(null)}>Change weeks</button>}
          </div>
        </>}
    {error && <p role="alert" className="acct-alert">{error} <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>}
    {(error === controlErrors.no_card || error === controlErrors.payment_refused) && <UpdateCard cardId={cardId} name={name} />}
  </div>;
}
