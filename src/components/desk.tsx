"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import type { LeaveResult, TapArea } from "@/lib/desk";
import type { ForgotPinResult } from "@/lib/parent-pin-server";
import { browserClient } from "@/lib/supabase-browser";
import { track } from "@/lib/track";
import "./desk.css";

// The child's desk (#301): the page image with a tap area on each question, and Maya's panel. Maya's calls come in a
// later ticket; the panel says so in plain words and offers nothing that does not work yet.

const noSubscribe = () => () => {};

/** A time as "3:05 p.m.", in the device's time zone (after hydration; the server renders nothing). */
function Time({ at }: { at: number }) {
  const text = useSyncExternalStore(noSubscribe, () => new Date(at).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }), () => "");
  return <>{text || "a few minutes"}</>;
}

export interface DeskQuestionView {
  number: number;
  text: string | null;
}

/** The page and Maya's panel. `image`: a short-lived link to the page image, or null when it could not be made. */
export function DeskBoard({ name, pageNumber, dayLabel, image, areas, questions, pageNav }: {
  name: string;
  pageNumber: number;
  dayLabel: string | null;
  image: { url: string; width: number; height: number } | null;
  areas: TapArea[];
  questions: DeskQuestionView[];
  pageNav: ReactNode;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  // On a phone Maya's panel is under the page: bring it into view after a tap.
  const pick = (n: number) => {
    setPicked(n);
    if (window.matchMedia("(max-width: 700px)").matches) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" }));
    }
  };
  const question = questions.find((q) => q.number === picked) ?? null;
  const pageTitle = dayLabel ? `Page ${pageNumber} · ${dayLabel}` : `Page ${pageNumber}`;
  return (
    <main id="main" className="desk-main">
      <section className="desk-pane desk-pane-page" aria-label={pageTitle}>
        {pageNav}
        <div className="desk-stage">
          {image ? (
            <div className="desk-sheet" style={{ "--w": image.width, "--h": image.height } as React.CSSProperties}>
              {/* A private, short-lived link: the image cannot go through the image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt={`${pageTitle} of the workbook`} width={image.width} height={image.height} />
              {areas.map((a) => (
                <button
                  key={a.question}
                  type="button"
                  className="desk-area"
                  style={{ left: `${a.left}%`, top: `${a.top}%`, width: `${a.width}%`, height: `${a.height}%` }}
                  aria-pressed={picked === a.question}
                  aria-label={`Question ${a.question}`}
                  onClick={() => pick(a.question)}
                />
              ))}
            </div>
          ) : (
            <p className="desk-missing">This page cannot be shown right now. Try again in a moment.</p>
          )}
        </div>
      </section>
      <section ref={panel} className="desk-pane desk-pane-maya" aria-label="Maya" aria-live="polite">
        <p className="desk-kicker">Maya · Unica Teaching Assistant</p>
        {question ? (
          <>
            <p className="desk-where">Page {pageNumber} · Question {question.number}</p>
            {question.text && <p className="desk-question">{question.text}</p>}
            <div className="desk-soon">
              <h2>Maya is coming soon.</h2>
              <p>Soon you can ask Maya for help with this question, one step at a time.</p>
            </div>
            <p className="desk-hint">To pick another question, tap it on your page.</p>
          </>
        ) : (
          <>
            <h1 className="desk-hello">Hi, {name}.</h1>
            <p className="desk-lead">{!image ? "Your page cannot be shown right now. Try again in a moment."
              : areas.length ? "Which question are you on? Tap it on your page." : "This page has no questions. Go to a page with questions."}</p>
            <div className="desk-soon">
              <h2>Maya is coming soon.</h2>
              <p>Soon you can ask Maya for help with a question on your page.</p>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

/** "Leave": a grown-up enters the PIN, checked on the server; then the account page opens. */
export function LeaveDesk() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const open = () => {
    setPin("");
    setError(null);
    dialog.current?.showModal();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter the 4 digits of the PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    let answer: LeaveResult;
    try {
      const res = await fetch("/api/desk/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      answer = (await res.json()) as LeaveResult;
    } catch {
      answer = { ok: false, error: "unavailable" };
    }
    if (answer.ok) {
      track("desk_left");
      router.replace("/account");
      router.refresh();
      return;
    }
    setBusy(false);
    setPin("");
    switch (answer.error) {
      case "wrong":
        setError(`That is not the PIN. ${answer.attemptsLeft} ${answer.attemptsLeft === 1 ? "try" : "tries"} left.`);
        break;
      case "locked":
        setError(<>Too many wrong tries. Try again after <Time at={answer.retryAt} />.</>);
        break;
      case "not_set":
        setError(<>No PIN is set. <Link href="/tutor/forgot-pin">Set a new PIN</Link> with your account password.</>);
        break;
      case "signed_out":
        setError(<>The account is signed out. <Link href="/sign-in">Sign in</Link> again.</>);
        break;
      default:
        setError("We cannot check the PIN right now. Try again in a moment.");
    }
  };

  return (
    <>
      <button type="button" className="btn ghost desk-leave-btn" onClick={open}>Leave</button>
      <dialog ref={dialog} className="desk-leave" aria-labelledby="desk-leave-title" onClose={() => setBusy(false)}>
        <form onSubmit={submit} noValidate>
          <h2 id="desk-leave-title">Leave the desk</h2>
          <p>A grown-up enters the 4-digit PIN.</p>
          <label htmlFor="desk-pin" className="desk-label">PIN</label>
          <input
            id="desk-pin" className="desk-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            aria-invalid={!!error} aria-describedby={error ? "desk-pin-error" : undefined}
          />
          {error && <p className="desk-error" id="desk-pin-error" role="alert">{error}</p>}
          <div className="desk-dialog-btns">
            <button type="submit" className="btn" disabled={busy}>{busy ? "Checking…" : "Leave the desk"}</button>
            <button type="button" className="btn ghost" onClick={() => dialog.current?.close()}>Stay</button>
          </div>
          <Link className="desk-forgot" href="/tutor/forgot-pin">Forgot the PIN?</Link>
        </form>
      </dialog>
    </>
  );
}

/**
 * Forgot PIN: the account password and a new PIN. The browser signs in again with the password (Supabase Auth limits
 * those tries per device), then the server accepts the new PIN from that fresh sign-in and closes the desk.
 */
export function ForgotPinForm({ email }: { email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const fail = (message: ReactNode) => {
    setBusy(false);
    setPassword("");
    setError(message);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!password || !/^\d{4}$/.test(pin)) {
      setError("Enter your account password and a new PIN of exactly 4 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    const signIn = await browserClient().auth.signInWithPassword({ email, password }).catch(() => null);
    if (!signIn || signIn.error) {
      const code = signIn?.error?.code;
      if (code === "invalid_credentials") return fail("That password is not right. Try again.");
      if (code === "over_request_rate_limit" || signIn?.error?.status === 429) return fail("Too many tries. Wait a few minutes, then try again.");
      return fail("We cannot check the password right now. Try again in a moment.");
    }
    let answer: ForgotPinResult;
    try {
      const res = await fetch("/api/desk/forgot-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      answer = (await res.json()) as ForgotPinResult;
    } catch {
      answer = { ok: false, error: "unavailable" };
    }
    if (answer.ok) {
      track("pin_reset");
      router.replace("/account?pin=1");
      router.refresh();
      return;
    }
    switch (answer.error) {
      case "invalid":
        return fail("Use a new PIN of exactly 4 digits.");
      case "password_needed":
        return fail("Enter your account password again.");
      case "signed_out":
        return fail(<>The account is signed out. <Link href="/sign-in">Sign in</Link> again.</>);
      default:
        return fail("We cannot save a new PIN right now. Wait a few minutes, then try again.");
    }
  };

  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      <div className={`fld${error ? " bad" : ""}`}>
        <label htmlFor="forgot-password">Your account password</label>
        <input id="forgot-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="fld">
        <label htmlFor="forgot-pin">New PIN</label>
        <input id="forgot-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        <span className="hint">4 digits.</span>
      </div>
      {error && <p className="acct-alert" role="alert">{error}</p>}
      <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Save the PIN and leave the desk"}</button>
    </form>
  );
}
