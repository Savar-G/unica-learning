"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { FamilyTime as When } from "@/components/family-time";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { DESK_HOME } from "@/lib/desk";
import { DELETE_CODE_LENGTH, DELETE_WORD, FAMILY_DELETED_PATH, FAMILY_DELETED_STATUS, validDeleteCode, type FamilyDeleteResult } from "@/lib/family-delete";
import type { DeleteCodeResult } from "@/lib/family-delete-code";
import type { RetryTime } from "@/lib/family-time";

type NotSignedIn = { ok: false; error: "signed_out" | "bad_json" | "forbidden" };
type Answer = (FamilyDeleteResult & Partial<RetryTime> & { state?: "deleted" | "pending" }) | NotSignedIn;
type CodeAnswer = (DeleteCodeResult & Partial<RetryTime>) | NotSignedIn;

const email = <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>;
const plans = (n: number) => `${n} ${n === 1 ? "plan" : "plans"}`;
const signedOut = <>You are signed out. <Link href="/sign-in">Sign in</Link> and try again.</>;
const lockedOut = (answer: { retryAt: number } & Partial<RetryTime>) => <>Too many wrong tries. Try again after <When at={answer.retryAt} text={answer.retryWhen ?? "15 minutes"} />.</>;
const cardStep = <>A card step for your family is still running, so we changed nothing. Try again in a few minutes. If this keeps happening, email {email}.</>;

function message(answer: Exclude<Answer, { ok: true }>): ReactNode {
  switch (answer.error) {
    case "wrong_code":
      return `That code is not right. You have ${answer.attemptsLeft} ${answer.attemptsLeft === 1 ? "try" : "tries"} left, then a 15-minute lock.`;
    case "code_ended":
      return "That code has ended or was already used. Ask for a new code.";
    case "locked":
      return lockedOut(answer);
    case "busy":
      return cardStep;
    case "protected":
      return "This account cannot be deleted here.";
    case "not_finished":
      return answer.plansStopped > 0
        ? <>We stopped {plans(answer.plansStopped)}, but we could not finish. Your family&apos;s data is all still here. Ask for a new code and try again, or email {email}.</>
        : <>We could not stop your plan, so we deleted nothing. Ask for a new code and try again, or email {email}.</>;
    case "signed_out":
      return signedOut;
    case "invalid":
      return `Enter the ${DELETE_CODE_LENGTH}-digit code and type ${DELETE_WORD}.`;
    default:
      return <>We could not finish this check, so we changed nothing. Ask for a new code and try again, or email {email}.</>;
  }
}

function codeMessage(answer: Exclude<CodeAnswer, { ok: true }>): ReactNode {
  switch (answer.error) {
    case "too_many":
      return <>We have sent as many codes as we can for now. Try again after <When at={answer.retryAt} text={answer.retryWhen ?? "an hour"} />.</>;
    case "locked":
      return lockedOut(answer);
    case "busy":
      return cardStep;
    case "protected":
      return "This account cannot be deleted here.";
    case "no_confirmed_email":
      return <>We can only send the code to a confirmed email address, and this account does not have one. Email {email} and we will help you.</>;
    case "signed_out":
      return signedOut;
    default:
      return <>We could not send the email, so we changed nothing. Try again, or email {email}.</>;
  }
}

/** The Account tab's delete (#556, D-255). It stays closed until the parent asks, says what happens, and only then offers the code. */
export function FamilyDelete({ child }: { child?: { id: string; name: string } } = {}) {
  const endpoint = child ? `/api/account/children/${child.id}/delete` : "/api/account/family/delete";
  const titleId = child ? `delete-${child.id}` : "pd-delete-title";
  const codeId = child ? `code-${child.id}` : "d-code";
  const confirmId = child ? `confirm-${child.id}` : "d-confirm";
  const [done, setDone] = useState<"deleted" | "pending" | null>(null);
  const [open, setOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [unsure, setUnsure] = useState(false);
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const askForCode = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}/code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      // 423: the child's desk is open on this device (#301); an old page goes to the desk.
      if (res.status === 423) { window.location.replace(DESK_HOME); return; }
      if (res.status === FAMILY_DELETED_STATUS) { window.location.replace(FAMILY_DELETED_PATH); return; }
      const answer = (await res.json()) as CodeAnswer;
      if (answer.ok) {
        setSentTo(answer.sentTo);
        setUnsure(answer.unsure);
        setCode("");
      } else setError(codeMessage(answer));
    } catch {
      setError("We did not get an answer. Check your email. If no code came, try again.");
    }
    setBusy(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !validDeleteCode(code) || confirm !== DELETE_WORD) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, confirm }) });
      // 423: the child's desk is open on this device (#301); an old page goes to the desk.
      if (res.status === 423) { window.location.replace(DESK_HOME); return; }
      // The request is already queued: an earlier answer was lost, or another device sent it.
      if (res.status === FAMILY_DELETED_STATUS) { window.location.replace(FAMILY_DELETED_PATH); return; }
      const answer = (await res.json()) as Answer;
      if (answer.ok) {
        if (child) { setDone(answer.state ?? "pending"); setBusy(false); return; }
        window.location.replace(FAMILY_DELETED_PATH); return;
      }
      setError(child && answer.error !== "wrong_code" && answer.error !== "invalid" && answer.error !== "locked"
        ? <>We could not confirm the deletion. {"plansStopped" in answer && answer.plansStopped > 0 ? `We stopped ${plans(answer.plansStopped)}. ` : ""}Ask for a new code and try again, or email {email}.</>
        : message(answer));
      // Only a wrong code leaves the code live. Every other answer needs a new one: the right code is spent when it is checked.
      if (answer.error !== "wrong_code" && answer.error !== "invalid") setSentTo(null);
    } catch {
      setError(child ? "We did not get an answer. Reload Account to check whether the deletion finished. A plan may have stopped." : "We did not get an answer. Refresh this page. If you are signed out, your request went through.");
    }
    setCode("");
    setBusy(false);
  };

  const close = () => { setOpen(false); setSentTo(null); setUnsure(false); setError(null); setCode(""); setConfirm(""); };

  if (child && done) return <section className="pd-delete" aria-labelledby={titleId}>
    <h2 id={titleId}>{done === "deleted" ? `${child.name} is deleted` : `${child.name}'s deletion is saved`}</h2>
    <p role="status">{done === "deleted" ? `${child.name}'s data and files are deleted. A copy of each test without names stays.` : `We stopped ${child.name}'s workbook plans. We have not finished removing the data and files. We will retry the remaining steps.`}</p>
    <p>We will make no more charges for {child.name}&apos;s plans. Your account and other children stay.</p>
    <a className="btn" href="/account/settings">Back to Account</a>
  </section>;

  return (
    <section className="pd-delete" aria-labelledby={titleId}>
      <h2 id={titleId}>{child ? `Delete ${child.name}` : <>Delete your family&apos;s account</>}</h2>
      {!open ? (
        <>
          <p>{child ? `This stops ${child.name}'s workbook plan and removes ${child.name}'s data. Your account and other children stay.` : <>This stops every plan and removes your family&apos;s data. You can read what it does before you confirm.</>}</p>
          <button className="btn ghost" type="button" onClick={() => setOpen(true)}>{child ? `Delete ${child.name}` : "Delete family account"}</button>
        </>
      ) : (
        <>
          <h3>What stops now</h3>
          <ul>
            <li>{child ? `${child.name}'s workbook plans stop now` : "Every workbook plan stops now"}, not at the end of the month. We make no more charges and give no refund for time already paid. A free month ends now.</li>
            <li>{child ? `We mail no more workbooks for ${child.name}. ${child.name} cannot use the desk or Maya.` : "We mail no more workbooks. The desk and Maya stop."}</li>
          </ul>
          <h3>What we delete</h3>
          <ul>
            <li>{child ? `${child.name}'s details, tests, answers, typed working, drawings, reports, workbooks, page photos and crops, learning records, Maya chats and notes, card setup, waitlist and assessment email records. Your account and other children stay, even if ${child.name} is your last child.` : <>Your account, your children&apos;s details, tests, reports, workbooks, page photos and Maya notes.</>} You cannot undo this.</li>
            {child && <li>We also remove stored copies of family emails that include {child.name}. Emails you already received stay with you.</li>}
          </ul>
          <h3>What stays</h3>
          <ul>
            <li>{child ? `A copy of each of ${child.name}'s tests without names.` : "A copy of each test without names."} It has the grade, province and month of the test, the questions, the answers and their times, the results, the learning choices you picked and the kind of device. It has no names, email, postal code, drawings, typed working or anything written in your own words, and it is not linked to your family. We use it to improve our tests and workbooks.</li>
            {child && <li>We keep a record of deleted file locations to prevent them from being saved again.</li>}
            <li>Historical reservation records stay. Invoices and payment records stay with our payment provider. Emails you already received stay with you.</li>
          </ul>
          <p className="small">To stop a plan and keep your data, use <Link href="/account/plan">Manage or cancel plan</Link>. The <Link href="/privacy">privacy policy</Link> has the full detail.</p>
          {sentTo === null ? (
            <div className="pd-delete-ask">
              {error && <p role="alert" className="acct-alert">{error}</p>}
              <p>To confirm, we email a one-time code to your account&apos;s email address.</p>
              <div className="pd-delete-actions">
                <button className="btn" type="button" disabled={busy} aria-busy={busy} onClick={askForCode}>
                  {busy ? <span className="spin" aria-label="Sending" /> : "Email me a code"}
                </button>
                <button className="acct-link" type="button" disabled={busy} onClick={close}>{child ? `Keep ${child.name}` : "Keep my account"}</button>
              </div>
            </div>
          ) : (
            <form className="acct-form" onSubmit={submit} noValidate>
              {error && <p role="alert" className="acct-alert">{error}</p>}
              <p className="pd-delete-sent" role="status">
                {unsure ? <>We may have sent a code to <strong>{sentTo}</strong>. If nothing comes in a few minutes, send a new one.</> : <>We sent a {DELETE_CODE_LENGTH}-digit code to <strong>{sentTo}</strong>.</>}{" "}
                It ends in 10 minutes and works once. Check your spam folder if you do not see it.
              </p>
              <div className="fld">
                <label htmlFor={codeId}>Code from the email</label>
                <input id={codeId} autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={DELETE_CODE_LENGTH} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="fld">
                <label htmlFor={confirmId}>Type {DELETE_WORD} to confirm</label>
                <input id={confirmId} type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <div className="pd-delete-actions">
                <button className="btn danger" type="submit" disabled={busy || !validDeleteCode(code) || confirm !== DELETE_WORD} aria-busy={busy}>
                  {busy ? <span className="spin" aria-label="Deleting" /> : child ? `Delete ${child.name}` : "Delete family account"}
                </button>
                <button className="acct-link" type="button" disabled={busy} onClick={askForCode}>Send a new code</button>
                <button className="acct-link" type="button" disabled={busy} onClick={close}>{child ? `Keep ${child.name}` : "Keep my account"}</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
