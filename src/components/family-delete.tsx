"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { FamilyTime as When } from "@/components/family-time";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { DESK_HOME } from "@/lib/desk";
import { DELETE_WORD, FAMILY_DELETED_PATH, FAMILY_DELETED_STATUS, type FamilyDeleteResult } from "@/lib/family-delete";
import type { RetryTime } from "@/lib/family-time";

type Answer = (FamilyDeleteResult & Partial<RetryTime>) | { ok: false; error: "signed_out" | "bad_json" | "forbidden" };

const email = <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>;
const plans = (n: number) => `${n} ${n === 1 ? "plan" : "plans"}`;

function message(answer: Exclude<Answer, { ok: true }>): ReactNode {
  switch (answer.error) {
    case "wrong_password":
      return `That password is not right. You have ${answer.attemptsLeft} ${answer.attemptsLeft === 1 ? "try" : "tries"} left, then a 15-minute lock.`;
    case "locked":
      return <>Too many wrong tries. Try again after <When at={answer.retryAt} text={answer.retryWhen ?? "15 minutes"} />.</>;
    case "busy":
      return <>A card step for your family is still running, so we changed nothing. Try again in a few minutes. If this keeps happening, email {email}.</>;
    case "plan_start":
      return answer.plansStopped > 0
        ? <>We stopped {plans(answer.plansStopped)}, but our team must finish starting a plan for your family before we can delete this account. Your family&apos;s data is all still here. We have told the team. Try again later, or email {email}.</>
        : <>Our team must finish starting a plan for your family before we can delete this account, so we changed nothing. We have told the team. Try again later, or email {email}.</>;
    case "protected":
      return "This account cannot be deleted here.";
    case "not_finished":
      return answer.plansStopped > 0
        ? <>We stopped {plans(answer.plansStopped)}, but we could not finish. Your family&apos;s data is all still here. Try again, or email {email}.</>
        : <>We could not stop your plan, so we deleted nothing. Try again, or email {email}.</>;
    case "signed_out":
      return <>You are signed out. <Link href="/sign-in">Sign in</Link> and try again.</>;
    case "invalid":
      return `Enter your password and type ${DELETE_WORD}.`;
    default:
      return <>We could not check your plans, so we changed nothing. Try again, or email {email}.</>;
  }
}

/** The Account tab's delete (#556). It stays closed until the parent asks, and then says what happens before the form. */
export function FamilyDelete() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !password || confirm !== DELETE_WORD) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/family/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, confirm }) });
      // 423: the child's desk is open on this device (#301); an old page goes to the desk.
      if (res.status === 423) { window.location.replace(DESK_HOME); return; }
      // The request is already queued: an earlier answer was lost, or another device sent it.
      if (res.status === FAMILY_DELETED_STATUS) { window.location.replace(FAMILY_DELETED_PATH); return; }
      const answer = (await res.json()) as Answer;
      if (answer.ok) { window.location.replace(FAMILY_DELETED_PATH); return; }
      setError(message(answer));
    } catch {
      setError("We did not get an answer. Refresh this page. If you are signed out, your request went through.");
    }
    setPassword("");
    setBusy(false);
  };

  return (
    <section className="pd-delete" aria-labelledby="pd-delete-title">
      <h2 id="pd-delete-title">Delete your family&apos;s account</h2>
      {!open ? (
        <>
          <p>This stops every plan and removes your family&apos;s data. You can read what it does before you confirm.</p>
          <button className="btn ghost" type="button" onClick={() => setOpen(true)}>Delete family account</button>
        </>
      ) : (
        <>
          <h3>What stops now</h3>
          <ul>
            <li>Every workbook plan stops now, not at the end of the month. We make no more charges and give no refund for time already paid. A free month ends now.</li>
            <li>We mail no more workbooks. The desk and Maya stop.</li>
          </ul>
          <h3>What we delete</h3>
          <ul>
            <li>Your account, your children&apos;s details, tests, reports, workbooks, page photos and Maya notes. You cannot undo this.</li>
          </ul>
          <h3>What stays</h3>
          <ul>
            <li>A copy of each test without names. It has the grade, province and month of the test, the questions, the answers and their times, the results, the learning choices you picked and the kind of device. It has no names, email, postal code, drawings, typed working or anything written in your own words, and it is not linked to your family. We use it to improve our tests and workbooks.</li>
            <li>Invoices and payment records stay with our payment provider. Emails you already received stay with you.</li>
          </ul>
          <p className="small">To stop a plan and keep your data, use <Link href="/account/plan">Manage or cancel plan</Link>. The <Link href="/privacy">privacy policy</Link> has the full detail.</p>
          <form className="acct-form" onSubmit={submit} noValidate>
            {error && <p role="alert" className="acct-alert">{error}</p>}
            <div className="fld">
              <label htmlFor="d-password">Your password</label>
              <span className="pw">
                <input id="d-password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="h-d-password" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-controls="d-password" aria-pressed={show}>{show ? "Hide" : "Show"}</button>
              </span>
              <span className="hint" id="h-d-password">No password yet, or you sign in with Google? <Link href="/account/password">Add a password</Link> first.</span>
            </div>
            <div className="fld">
              <label htmlFor="d-confirm">Type {DELETE_WORD} to confirm</label>
              <input id="d-confirm" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <div className="pd-delete-actions">
              <button className="btn danger" type="submit" disabled={busy || !password || confirm !== DELETE_WORD} aria-busy={busy}>
                {busy ? <span className="spin" aria-label="Deleting" /> : "Delete family account"}
              </button>
              <button className="acct-link" type="button" disabled={busy} onClick={() => { setOpen(false); setError(null); setPassword(""); setConfirm(""); }}>Keep my account</button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
