"use client";

// Parent account screens for the online assessment (#62, D-082): signup, sign-in, the children list.
// Server writes go through /api/account/*; the browser holds only the publishable key and the parent's own session.
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CURRICULA, EMAIL, POSTAL, curriculumFromPostal, type CurriculumId } from "@/lib/signup";
import type { StartState } from "@/lib/assessment";
import { gradeLabel, gradeShort } from "@/lib/assessment/grades";
import { GRADES, gradeHint, PASSWORD_MAX, PASSWORD_MIN, signInFailure, validPassword, type AccountError, type SignInFailure, type AccountResult, type ChildInput } from "@/lib/account";
import { browserClient } from "@/lib/supabase-browser";
import type { PinFormResult } from "@/lib/parent-pin-server";
import { track } from "@/lib/track";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { markAdStep } from "@/lib/ad-visit-steps";
import { SOURCE_STORAGE_KEY, VISIT_STORAGE_KEY, visitSource } from "@/lib/visit-source";

// The tags are kept for the tab on whichever page the visitor lands (VisitTags in the root layout), so a parent who
// browses first, or signs up with Google (and finishes on /account/finish), keeps them.

/** Referrer, UTM tags, click IDs and ad visit ID of this visit, so we know which channel brought each parent. */
function collectSource() {
  let stored: string | null = null;
  let visitId: string | null = null;
  try {
    stored = sessionStorage.getItem(SOURCE_STORAGE_KEY);
    visitId = sessionStorage.getItem(VISIT_STORAGE_KEY);
  } catch { /* storage off */ }
  return visitSource({ search: window.location.search, referrer: document.referrer, stored, visitId });
}

async function post(url: string, body: unknown): Promise<AccountResult> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as AccountResult;
  } catch {
    return { ok: false, error: "store_failed" };
  }
}

function errorText(error: AccountError | undefined): ReactNode {
  switch (error) {
    case "weak_password":
      return `Choose a different password. Use at least ${PASSWORD_MIN} characters.`;
    case "invalid":
      return "Correct the marked fields to continue.";
    case "too_many":
      return "This account has the most children we allow. Email us to add more.";
    case "busy":
      return <>Many people are signing up right now. Try again in a few minutes, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
    case "signed_out":
      return <>Your session ended. <Link href="/sign-in">Sign in</Link> again.</>;
    case "password_change_blocked":
      return <>We cannot set your password right now. Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> and we will help you finish your account.</>;
    case "unavailable":
      return <>We cannot set up this account right now. Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> and we will help.</>;
    case "unproved":
      return <>For your safety, confirm your email before you finish. <Link href="/sign-in/reset">Get a link by email</Link>, open it, then finish your account.</>;
    default:
      return <>We could not save your details. Try again in a moment. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
  }
}

function Field({ id, label, bad, error, hint, children }: { id: string; label: string; bad?: boolean; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className={`fld${bad ? " bad" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint" id={`h-${id}`}>{hint}</span>}
      {error && <span className="err" id={`e-${id}`}>{error}</span>}
    </div>
  );
}

const described = (id: string, bad: boolean | undefined, hint = false) =>
  [hint && `h-${id}`, bad && `e-${id}`].filter(Boolean).join(" ") || undefined;

/**
 * First name, grade and province of one child. `onPickProvince` runs when the parent chooses a province. An empty
 * province (the short phone signup, D-134: no postal code to guess it from) shows "Choose a province" until one is picked.
 */
function ChildFields({ prefix, value, onChange, bad, badProvince, onPickProvince }: { prefix: string; value: ChildInput; onChange: (c: ChildInput) => void; bad?: boolean; badProvince?: boolean; onPickProvince?: () => void }) {
  return (
    <>
      <Field id={`${prefix}-first`} label="Child's first name" bad={bad} error="Enter your child's first name.">
        <input id={`${prefix}-first`} autoComplete="off" value={value.firstName} maxLength={60} onChange={(e) => onChange({ ...value, firstName: e.target.value })} aria-invalid={!!bad} aria-describedby={described(`${prefix}-first`, bad)} />
      </Field>
      <div className="fld">
        <span className="lbl" id={`${prefix}-grade`}>School grade</span>
        <div className="seg" role="radiogroup" aria-labelledby={`${prefix}-grade`} aria-describedby={`h-${prefix}-grade`}>
          {GRADES.map((g) => (
            <label key={g} title={gradeLabel(g)}><input type="radio" name={`${prefix}-grade`} checked={value.grade === g} onChange={() => onChange({ ...value, grade: g })} aria-label={gradeLabel(g)} />{gradeShort(g)}</label>
          ))}
        </div>
        <span className="hint" id={`h-${prefix}-grade`}>{gradeHint(value.grade)}</span>
      </div>
      <Field id={`${prefix}-province`} label="Province" bad={badProvince} error="Choose your province." hint="We match the test to what your child learns at school.">
        <select
          id={`${prefix}-province`}
          value={value.province}
          onChange={(e) => {
            onPickProvince?.();
            onChange({ ...value, province: e.target.value as CurriculumId });
          }}
          aria-invalid={!!badProvince}
          aria-describedby={described(`${prefix}-province`, badProvince, true)}
        >
          {!value.province && <option value="" disabled>Choose a province</option>}
          {(Object.keys(CURRICULA) as CurriculumId[]).map((k) => <option key={k} value={k}>{CURRICULA[k]}</option>)}
        </select>
      </Field>
    </>
  );
}

function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
      {busy ? <span className="spin" aria-label="Saving" /> : children}
    </button>
  );
}

type SignupErrors = Partial<Record<"name" | "email" | "postal" | "password" | "child" | "province", boolean>>;

/** What the email-code step shows under the button (#82). */
type CodeNote = null | "sent_again" | "wait" | "bad" | "expired" | "too_many" | "check_failed" | "send_failed";

function codeNoteText(note: Exclude<CodeNote, null>): ReactNode {
  switch (note) {
    case "sent_again":
      return "We sent a new code. Use the code in the newest email.";
    case "wait":
      // Supabase gives the same answer for its one-email-a-minute rule and for the project's hourly email limit, so
      // this text does not say that a code was sent.
      return "We cannot send a new code right now. If an email from us already has a code, enter it here. If not, wait a few minutes, then send a new code.";
    case "bad":
      return "Enter the code from the email. It has only numbers.";
    case "expired":
      return "This code is not correct, or it has expired. Check that you used the newest email, or send a new code.";
    case "too_many":
      return "Too many tries. Wait a few minutes, then send a new code.";
    case "check_failed":
      return <>We could not check the code. Try again in a moment. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
    case "send_failed":
      return <>We could not send the email. Check the email address and try again. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
  }
}

/** Sends the one-time email code. Supabase answers the same for a new and an existing email, so the screen does too. */
async function sendCode(email: string): Promise<"sent" | "wait" | "failed"> {
  const { error } = await browserClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (!error) return "sent";
  // 429: one email a minute for each address, or the project's hourly email limit (both over_email_send_rate_limit).
  if (error.status === 429) return "wait";
  console.error("[account] code send failed", error.code);
  return "failed";
}

/**
 * Password signup (D-082, #82). The parent fills in the form, then proves the email with the one-time code that we
 * email: no account, child or test exists for an address nobody proved. The code signs the parent in on this tab, then
 * /api/account/finish sets the password from the form and writes the parent and the first child. The answer is the same
 * whether or not the email already has an account: the owner of an existing account gets a code too, the code signs
 * them in, and their account stays as it was.
 *
 * `phone` (D-134): the short phone signup. No postal code and no password: the test happens later on a laptop or tablet,
 * and the sign-in link that /api/account/finish emails to a phone opens it there.
 */
export function AccountSignup({ phone = false }: { phone?: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [postal, setPostal] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // On a phone there is no postal code to guess the province from, so the parent chooses it (D-134).
  const [child, setChild] = useState<ChildInput>({ firstName: "", grade: 4, province: phone ? ("" as CurriculumId) : "BC" });
  // Until the parent picks a province, follow the one in their postal code.
  const [pickedProvince, setPickedProvince] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<SignupErrors>({});
  const [failure, setFailure] = useState<AccountError | null>(null);
  const [busy, setBusy] = useState(false);
  // "form", then "code" once the email is on its way.
  const [step, setStep] = useState<"form" | "code">("form");
  const [code, setCode] = useState("");
  const [note, setNote] = useState<CodeNote>(null);
  const [resending, setResending] = useState(false);
  // True once this visit has sent a code. Until then the code step does not say that a code was sent.
  const [sentNow, setSentNow] = useState(false);
  // The email this tab has already proved. A retry after a failed finish then skips the code.
  const [proved, setProved] = useState<string | null>(null);
  const started = useRef(false);
  const cleanEmail = email.trim().toLowerCase();

  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
    // Back on the form after a password Supabase would not take: that field is the one to change.
    else if (proved) form.current?.querySelector<HTMLInputElement>("#a-password")?.focus();
  }, [step, proved]);

  const onStart = () => {
    if (started.current) return;
    started.current = true;
    track("account_form_start");
    markAdStep("form_start");
  };

  /** Writes the family for the proved email: the password from the form, the parent and the first child. */
  const finish = async () => {
    setBusy(true);
    const res = await post("/api/account/finish", {
      name: name.trim(), child: { ...child, firstName: child.firstName.trim() }, source: collectSource(),
      ...(phone ? {} : { postal: postal.trim().toUpperCase(), password }),
    });
    if (!res.ok) {
      track("account_signup_failed", { code: res.error ?? "unknown" });
      setBusy(false);
      if (res.error === "signed_out") {
        setProved(null);
        setCode("");
        setNote(null);
        setSentNow(false);
        setErrors({});
        setStep("form");
        setFailure("signed_out");
        return;
      }
      // A password Supabase will not take: back to the form to choose another. The email stays proved.
      if (res.error === "weak_password" || res.error === "invalid") {
        setFailure(res.error);
        setErrors(res.error === "weak_password" ? { password: true } : {});
        setStep("form");
        return;
      }
      setFailure(res.error ?? "store_failed");
      return;
    }
    if (res.existing) {
      track("sign_in", { channel: "code" });
      router.replace("/account?existing=1");
    } else {
      track("account_created", { curriculum: child.province });
      router.replace(res.linkSent ? "/account?sent=1" : "/account");
    }
    router.refresh();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: SignupErrors = {
      name: name.trim().length < 2,
      email: !EMAIL.test(email.trim()),
      postal: !phone && !POSTAL.test(postal.trim()),
      password: !phone && !validPassword(password),
      child: !child.firstName.trim(),
      province: !child.province,
    };
    setErrors(next);
    setFailure(null);
    const firstBad = (["name", "email", "postal", "password", "child", "province"] as const).find((k) => next[k]);
    if (firstBad) {
      const at = firstBad === "child" ? "c-first" : firstBad === "province" ? "c-province" : firstBad;
      form.current?.querySelector<HTMLElement>(`#a-${at}`)?.focus();
      return;
    }
    if (proved === cleanEmail) {
      await finish();
      return;
    }
    setCode("");
    // Bots fill every field; show them the next step and send nothing.
    if (website) {
      setStep("code");
      return;
    }
    setBusy(true);
    const sent = await sendCode(cleanEmail);
    setBusy(false);
    if (sent === "failed") {
      track("account_code_failed", { code: "send" });
      setFailure("send_failed");
      return;
    }
    track("account_code_sent", { status: sent });
    markAdStep("code_sent");
    setNote(sent === "wait" ? "wait" : null);
    setSentNow(sent === "sent");
    setStep("code");
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFailure(null);
    if (proved === cleanEmail) {
      await finish();
      return;
    }
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(token)) {
      setNote("bad");
      codeInput.current?.focus();
      return;
    }
    setBusy(true);
    setNote(null);
    const { error } = await browserClient().auth.verifyOtp({ email: cleanEmail, token, type: "email" });
    if (error) {
      setBusy(false);
      const why: CodeNote = error.status === 429 ? "too_many" : error.code === "otp_expired" || error.status === 403 ? "expired" : "check_failed";
      track("account_code_failed", { code: why });
      setNote(why);
      codeInput.current?.focus();
      return;
    }
    setProved(cleanEmail);
    await finish();
  };

  const resend = async () => {
    if (resending || busy) return;
    setResending(true);
    const sent = website ? "sent" : await sendCode(cleanEmail);
    setResending(false);
    track(sent === "failed" ? "account_code_failed" : "account_code_sent", sent === "failed" ? { code: "send" } : { status: sent === "sent" ? "again" : "wait" });
    setNote(sent === "sent" ? "sent_again" : sent === "wait" ? "wait" : "send_failed");
    if (sent === "sent") setSentNow(true);
  };

  if (step === "code") {
    const bad = note === "bad" || note === "expired";
    return (
      <form className="acct-form" onSubmit={confirm} noValidate>
        <p role="status" className="acct-alert">
          {sentNow
            ? <>We sent a code to <b>{cleanEmail}</b>. Enter it here to confirm your email.</>
            : <>To confirm <b>{cleanEmail}</b>, enter the code from our email here.</>}{" "}
          If this email already has an account, the code signs you in.
        </p>
        {failure && <p role="alert" className="acct-alert">{errorText(failure)}</p>}
        {proved !== cleanEmail && (
          <Field id="a-code" label="Code from the email" bad={bad}>
            <input
              ref={codeInput}
              id="a-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={bad}
              aria-describedby={note ? "a-code-note" : undefined}
            />
          </Field>
        )}
        {note && <p id="a-code-note" role={note === "sent_again" ? "status" : "alert"} className="acct-alert">{codeNoteText(note)}</p>}
        <Submit busy={busy}>{proved === cleanEmail ? "Try again" : "Confirm email"} <span className="arr">→</span></Submit>
        {proved !== cleanEmail && (
          <p className="small">
            No email? Check your spam folder, or{" "}
            <button className="acct-link" type="button" onClick={resend} disabled={resending} aria-busy={resending}>send a new code</button>.
          </p>
        )}
        <p className="small">
          <button className="acct-link" type="button" disabled={busy} onClick={() => { setStep("form"); setNote(null); setFailure(null); }}>Change your details</button>
        </p>
      </form>
    );
  }

  return (
    <form ref={form} className="acct-form" onSubmit={submit} onFocus={onStart} noValidate>
      <GoogleButton />
      {failure && (
        <p role="alert" className="acct-alert">
          {failure === "send_failed" ? codeNoteText("send_failed")
            // The proof was cleared (#121): a new code signs the parent in again, and the entries are still here.
            : failure === "signed_out" ? "Your session ended before we saved your account. Your details are still here. Select Create account, and we will email you a new code."
            : errorText(failure)}
        </p>
      )}
      {!failure && Object.values(errors).some(Boolean) && <p role="alert" className="acct-alert">{errorText("invalid")}</p>}
      <fieldset>
        <legend>About you</legend>
        <Field id="a-name" label="Your name" bad={errors.name} error="Enter your name.">
          <input id="a-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={described("a-name", errors.name)} />
        </Field>
        <Field id="a-email" label="Email" bad={errors.email} error="Enter a valid email." hint={phone ? "We email you a code to confirm it, then the link for the laptop or tablet." : "We email you a code to confirm it."}>
          <input id="a-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={described("a-email", errors.email, true)} />
        </Field>
        {!phone && <>
          <Field id="a-postal" label="Postal code" bad={errors.postal} error="Enter a Canadian postal code, like V6B 1A1.">
            <input id="a-postal" autoComplete="postal-code" placeholder="V6B 1A1" value={postal} onChange={(e) => {
              setPostal(e.target.value);
              const guess = curriculumFromPostal(e.target.value);
              if (guess && !pickedProvince) setChild((c) => ({ ...c, province: guess }));
            }} aria-invalid={!!errors.postal} aria-describedby={described("a-postal", errors.postal)} />
          </Field>
          <Field id="a-password" label="Password" bad={errors.password} error={failure === "weak_password" ? "Choose a different password." : `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`} hint={`At least ${PASSWORD_MIN} characters.`}>
            <span className="pw">
              <input id="a-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={described("a-password", errors.password, true)} />
              <button type="button" onClick={() => setShowPassword((s) => !s)} aria-controls="a-password" aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
            </span>
          </Field>
        </>}
      </fieldset>
      <fieldset>
        <legend>Your child</legend>
        <ChildFields prefix="a-c" value={child} onChange={setChild} bad={errors.child} badProvince={errors.province} onPickProvince={() => setPickedProvince(true)} />
      </fieldset>
      <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <Submit busy={busy}>Create account <span className="arr">→</span></Submit>
      <p className="small">Already have an account? <Link href="/sign-in">Sign in</Link></p>
      <p className="small">We use your details to run your child&apos;s assessment and to contact you. Read our <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link>.</p>
    </form>
  );
}

/**
 * Supabase cannot tell an unknown email from a wrong password, so the "no_match" text names every common cause: an
 * account made with Google has no password, a forgotten password, or no account yet.
 */
function signInFailureText(failure: SignInFailure): ReactNode {
  switch (failure) {
    case "too_many":
      return "Too many tries. Wait a few minutes, then try again.";
    case "unavailable":
      return <>We could not sign you in right now. Try again in a moment. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
    case "no_match":
      return <>This email and password do not match an account. If you made your account with Google, use Continue with Google. If you made it on a phone, or forgot your password, use a sign-in code from your email instead. If you are new, <Link href="/start">create an account</Link>.</>;
  }
}

/**
 * Sends a sign-in code to an existing account (D-134). It never makes an account. Supabase answers an unknown email with
 * an error, but the screen says the same thing for both. A new code is not asked for within a minute of the last one, so
 * Supabase's one-email-a-minute answer (which only an existing account gets) does not show on the screen either. Supabase
 * itself still answers the two cases differently, as it does for the reset form.
 */
async function sendSignInCode(email: string): Promise<"sent" | "no_account" | "wait" | "failed"> {
  const { error } = await browserClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (!error) return "sent";
  if (error.status === 429) return "wait";
  if (error.code === "otp_disabled" || error.code === "signup_disabled" || error.code === "user_not_found") return "no_account";
  console.error("[account] sign-in code send failed", error.code);
  return "failed";
}

/**
 * Sign-in (#63): Google, email and password, or a code from the email (D-134). The code is for a parent with no password
 * (the short phone signup) and for anyone who prefers it; it also opens the page that a reminder or report link asked for.
 */
export function SignIn({ googleFailed, next = "/account" }: { googleFailed: boolean; next?: string }) {
  const router = useRouter();
  const codeInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState<SignInFailure | null>(null);
  const [busy, setBusy] = useState(false);
  // "password", or the code: "code" asks for the email, "enter" asks for the code from the email.
  const [mode, setMode] = useState<"password" | "code" | "enter">("password");
  const [code, setCode] = useState("");
  const [note, setNote] = useState<CodeNote>(null);
  const [resending, setResending] = useState(false);
  const [emailBad, setEmailBad] = useState(false);
  // When this tab last asked for a code. Supabase sends one email a minute for each address.
  const lastSent = useRef(0);
  const cleanEmail = email.trim().toLowerCase();

  useEffect(() => {
    if (mode === "enter") codeInput.current?.focus();
    else if (mode === "code") document.getElementById("s-email")?.focus();
  }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(null);
    const { error } = await browserClient().auth.signInWithPassword({ email: cleanEmail, password });
    if (error) {
      track("sign_in_failed", { code: error.code ?? "unknown" });
      setFailed(signInFailure(error));
      setBusy(false);
      return;
    }
    track("sign_in");
    router.replace(next);
  };

  const askCode = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setNote(null);
    if (!EMAIL.test(email.trim())) {
      setEmailBad(true);
      document.getElementById("s-email")?.focus();
      return;
    }
    setEmailBad(false);
    setBusy(true);
    lastSent.current = Date.now();
    const sent = await sendSignInCode(cleanEmail);
    setBusy(false);
    track(sent === "failed" ? "sign_in_code_failed" : "sign_in_code_sent", sent === "failed" ? { code: "send" } : { status: sent });
    if (sent === "failed") {
      setNote("send_failed");
      return;
    }
    if (sent === "wait") setNote("wait");
    setCode("");
    setMode("enter");
  };

  const resend = async () => {
    if (resending || busy) return;
    if (Date.now() - lastSent.current < 60_000) {
      setNote("wait");
      return;
    }
    setResending(true);
    lastSent.current = Date.now();
    const sent = await sendSignInCode(cleanEmail);
    setResending(false);
    track(sent === "failed" ? "sign_in_code_failed" : "sign_in_code_sent", sent === "failed" ? { code: "send" } : { status: sent === "sent" ? "again" : sent });
    setNote(sent === "failed" ? "send_failed" : sent === "wait" ? "wait" : "sent_again");
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(token)) {
      setNote("bad");
      codeInput.current?.focus();
      return;
    }
    setBusy(true);
    setNote(null);
    const { error } = await browserClient().auth.verifyOtp({ email: cleanEmail, token, type: "email" });
    if (error) {
      setBusy(false);
      const why: CodeNote = error.status === 429 ? "too_many" : error.code === "otp_expired" || error.status === 403 ? "expired" : "check_failed";
      track("sign_in_code_failed", { code: why });
      setNote(why);
      codeInput.current?.focus();
      return;
    }
    track("sign_in", { channel: "code" });
    router.replace(next);
    router.refresh();
  };

  const toPassword = () => {
    setMode("password");
    setNote(null);
    setCode("");
  };

  if (mode === "enter") {
    const bad = note === "bad" || note === "expired";
    return (
      <form className="acct-form" onSubmit={confirm} noValidate>
        <p role="status" className="acct-alert">
          {note === "wait"
            ? <>To sign in as <b>{cleanEmail}</b>, enter the code from our email here.</>
            : <>If <b>{cleanEmail}</b> has an account, we sent a code to it. Enter the code here to sign in.</>}
        </p>
        <Field id="s-code" label="Code from the email" bad={bad}>
          <input
            ref={codeInput}
            id="s-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={bad}
            aria-describedby={note ? "s-code-note" : undefined}
          />
        </Field>
        {note && <p id="s-code-note" role={note === "sent_again" ? "status" : "alert"} className="acct-alert">{codeNoteText(note)}</p>}
        <Submit busy={busy}>Sign in <span className="arr">→</span></Submit>
        <p className="small">
          No email? Check your spam folder, or{" "}
          <button className="acct-link" type="button" onClick={resend} disabled={resending || busy} aria-busy={resending}>send a new code</button>.{" "}
          <button className="acct-link" type="button" disabled={busy} onClick={() => { setMode("code"); setNote(null); }}>Use a different email</button>
        </p>
        <p className="small">New here? <Link href="/start">Create an account</Link></p>
      </form>
    );
  }

  if (mode === "code") {
    return (
      <form className="acct-form" onSubmit={askCode} noValidate>
        <GoogleButton next={next === "/account" ? undefined : next} />
        {note && <p role="alert" className="acct-alert">{codeNoteText(note)}</p>}
        <Field id="s-email" label="Email" bad={emailBad} error="Enter a valid email." hint="We email you a code. Enter it here to sign in. No password needed.">
          <input id="s-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={emailBad} aria-describedby={described("s-email", emailBad, true)} />
        </Field>
        <Submit busy={busy}>Email me a code <span className="arr">→</span></Submit>
        <p className="small"><button className="acct-link" type="button" onClick={toPassword}>Sign in with your password instead</button></p>
        <p className="small">New here? <Link href="/start">Create an account</Link></p>
      </form>
    );
  }

  return (
    <form className="acct-form" onSubmit={submit}>
      {/* The default return to /account keeps the plain callback URL that the Supabase redirect list already allows. */}
      <GoogleButton next={next === "/account" ? undefined : next} />
      {googleFailed && !failed && <p role="alert" className="acct-alert">We could not sign you in with Google. Try again, or use your email and password.</p>}
      {failed && <p role="alert" className="acct-alert">{signInFailureText(failed)}</p>}
      <Field id="s-email" label="Email">
        <input id="s-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="s-password" label="Password">
        <input id="s-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Submit busy={busy}>Sign in <span className="arr">→</span></Submit>
      <button className="btn ghost" type="button" onClick={() => { setFailed(null); setMode("code"); }}>Email me a sign-in code instead</button>
      <p className="small">No password, or made your account on a phone? Use a sign-in code. <Link href="/sign-in/reset">Forgot your password?</Link></p>
      <p className="small">New here? <Link href="/start">Create an account</Link></p>
    </form>
  );
}

export function AddChild({ province }: { province: CurriculumId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState<ChildInput>({ firstName: "", grade: 4, province });
  const [bad, setBad] = useState(false);
  const [failure, setFailure] = useState<AccountError | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return <button className="btn ghost" type="button" onClick={() => setOpen(true)}>Add another child</button>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const empty = !child.firstName.trim();
    setBad(empty);
    setFailure(null);
    if (empty) {
      document.getElementById("k-first")?.focus();
      return;
    }
    setBusy(true);
    const res = await post("/api/account/children", { ...child, firstName: child.firstName.trim() });
    setBusy(false);
    if (!res.ok) {
      setFailure(res.error ?? "store_failed");
      return;
    }
    track("child_added", { curriculum: child.province });
    setChild({ firstName: "", grade: 4, province: child.province });
    setOpen(false);
    router.refresh();
  };

  return (
    <form className="acct-form acct-card" onSubmit={submit} noValidate>
      <h2>Add another child</h2>
      {failure && <p role="alert" className="acct-alert">{errorText(failure)}</p>}
      <ChildFields prefix="k" value={child} onChange={setChild} bad={bad} />
      <div className="row2">
        <button className="btn ghost" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <Submit busy={busy}>Add child</Submit>
      </div>
    </form>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const noSubscribe = () => () => {};

/**
 * A moment in the reader's own time zone, for example "5:12 p.m. on Monday, November 9". The server does not know the
 * parent's zone, so the first paint (and a page without JavaScript) shows UTC, labelled; the browser then shows local time.
 */
function When({ at }: { at: number }) {
  const local = useSyncExternalStore(noSubscribe, () => true, () => false);
  const d = new Date(at);
  const [day, date, month, h, m] = local
    ? [d.getDay(), d.getDate(), d.getMonth(), d.getHours(), d.getMinutes()]
    : [d.getUTCDay(), d.getUTCDate(), d.getUTCMonth(), d.getUTCHours(), d.getUTCMinutes()];
  const clock = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}${local ? "" : " UTC"}`;
  return <time dateTime={d.toISOString()}>{clock} on {DAYS[day]}, {MONTHS[month]} {date}</time>;
}

/** The button and the line under it for each start state (#72). `status` goes with test_start_click. */
function startView(state: Exclude<StartState, { kind: "wait" }>, name: string): { label: string; note: ReactNode; status: string } {
  switch (state.kind) {
    case "resume":
      return { label: "Continue test", note: <>The answers are saved. {name} can continue until <When at={state.resumeUntil} />.</>, status: "in_progress" };
    case "finish":
      return { label: "Finish test", note: <>All of {name}&apos;s answers are in, but the test was not sent. Open it to finish. The report then comes by email.</>, status: "finish" };
    case "expired":
      return { label: "Start again", note: "The last test was not finished within 24 hours, so it closed. The new test has new questions.", status: "expired" };
    case "start":
      return state.retake
        ? { label: "Start test", note: "The next test is open. It has new questions.", status: "retake" }
        : { label: "Start test", note: null, status: "new" };
  }
}

/**
 * Opens the child's test (#64), in the state the assessment core gives (#72): start, continue an open test until its
 * deadline, finish a test whose answers are all in, start again after a test ran out of time, or wait 30 days after
 * a completed test. `report` is the path of the child's newest report (#65): while the child waits it is the button,
 * and in every other state it stays reachable under the button (spec #54, story 32).
 */
export function StartTest({ childId, name, state, report }: { childId: string; name: string; state: StartState; report?: string }) {
  const noteId = useId();
  if (state.kind === "wait") {
    if (!report) {
      return (
        <span className="small acct-done">
          Test done. The report comes by email. The next test opens at <When at={state.opensAt} />.
        </span>
      );
    }
    return (
      <span className="acct-start">
        <Link className="btn ghost" href={report}>See the report <span className="sr-only">for {name}</span> <span className="arr">→</span></Link>
        <span className="small">The next test opens at <When at={state.opensAt} />.</span>
      </span>
    );
  }
  const { label, note, status } = startView(state, name);
  return (
    <span className="acct-start">
      <Link className="btn" href={`/account/test/${childId}`} aria-describedby={note ? noteId : undefined} onClick={() => track("test_start_click", { status })}>
        {label} <span className="sr-only">for {name}</span> <span className="arr">→</span>
      </Link>
      {note && <span id={noteId} className="small">{note}</span>}
      {report && <Link className="small" href={report}>See the last report<span className="sr-only"> for {name}</span></Link>}
    </span>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button className="acct-link" type="button" onClick={async () => { await browserClient().auth.signOut(); router.replace("/sign-in"); }}>
      Sign out
    </button>
  );
}

/** Sends one event when the screen first shows, for example to count how many parents reach the phone screen. */
export function TrackOnce({ event, props }: { event: string; props?: Record<string, string> }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(event, props);
  }, [event, props]);
  return null;
}

// Google sign-in, the phone-to-laptop link and password reset (#63).

const GOOGLE_G = (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

/**
 * Google sign-in. Google returns the parent to /auth/callback, which then opens `next` (default /account); a new parent
 * finishes their account on /account/finish.
 */
export function GoogleButton({ next }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const go = async () => {
    setBusy(true);
    setFailed(false);
    track("google_start");
    // An ad test step only on the signup page, not when a parent signs in with Google.
    if (window.location.pathname === "/start") markAdStep("google_start");
    const callback = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error } = await browserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback } });
    if (error) {
      track("google_failed", { code: error.code ?? "unknown" });
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <div className="acct-google">
      <button className="btn ghost" type="button" onClick={go} disabled={busy} aria-busy={busy}>{GOOGLE_G} Continue with Google</button>
      {failed && <p role="alert" className="acct-alert">We could not open Google sign-in. Try again, or use your email.</p>}
      <p className="acct-or"><span>or use your email</span></p>
    </div>
  );
}

/**
 * A parent who signed in for the first time without the signup form (Google, or a password reset link) gives the rest of
 * the details. Finishing gives the account a new password that nobody knows (#82), so a parent without Google chooses
 * the password here (`needsPassword`); a Google parent signs in with Google.
 */
export function FinishAccount({ name: googleName, email, needsPassword }: { name: string; email: string; needsPassword: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(googleName);
  const [postal, setPostal] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [child, setChild] = useState<ChildInput>({ firstName: "", grade: 4, province: "BC" });
  const [pickedProvince, setPickedProvince] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [failure, setFailure] = useState<AccountError | null>(null);
  const [busy, setBusy] = useState(false);
  const channel = needsPassword ? "email" : "google";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: SignupErrors = {
      name: name.trim().length < 2,
      postal: !POSTAL.test(postal.trim()),
      password: needsPassword && !validPassword(password),
      child: !child.firstName.trim(),
    };
    setErrors(next);
    setFailure(null);
    const firstBad = (["name", "postal", "password", "child"] as const).find((k) => next[k]);
    if (firstBad) {
      form.current?.querySelector<HTMLInputElement>(`#f-${firstBad === "child" ? "c-first" : firstBad}`)?.focus();
      return;
    }
    setBusy(true);
    const res = await post("/api/account/finish", {
      name: name.trim(), postal: postal.trim().toUpperCase(), child: { ...child, firstName: child.firstName.trim() }, source: collectSource(),
      ...(needsPassword ? { password } : {}),
    });
    if (!res.ok) {
      track("account_signup_failed", { code: res.error ?? "unknown", channel });
      setFailure(res.error ?? "store_failed");
      if (res.error === "weak_password") {
        setErrors({ password: true });
        form.current?.querySelector<HTMLInputElement>("#f-password")?.focus();
      }
      setBusy(false);
      return;
    }
    if (!res.existing) track("account_created", { curriculum: child.province, channel });
    router.replace(res.linkSent ? "/account?sent=1" : "/account");
    router.refresh();
  };

  return (
    <form ref={form} className="acct-form" onSubmit={submit} noValidate>
      {failure && <p role="alert" className="acct-alert">{errorText(failure)}</p>}
      {!failure && Object.values(errors).some(Boolean) && <p role="alert" className="acct-alert">{errorText("invalid")}</p>}
      <fieldset>
        <legend>About you</legend>
        <p className="small">Signed in as <b>{email}</b>.</p>
        <Field id="f-name" label="Your name" bad={errors.name} error="Enter your name.">
          <input id="f-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={described("f-name", errors.name)} />
        </Field>
        <Field id="f-postal" label="Postal code" bad={errors.postal} error="Enter a Canadian postal code, like V6B 1A1.">
          <input id="f-postal" autoComplete="postal-code" placeholder="V6B 1A1" value={postal} onChange={(e) => {
            setPostal(e.target.value);
            const guess = curriculumFromPostal(e.target.value);
            if (guess && !pickedProvince) setChild((c) => ({ ...c, province: guess }));
          }} aria-invalid={!!errors.postal} aria-describedby={described("f-postal", errors.postal)} />
        </Field>
        {needsPassword && (
          <Field id="f-password" label="Choose a password" bad={errors.password} error={failure === "weak_password" ? "Choose a different password." : `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`} hint={`At least ${PASSWORD_MIN} characters. You sign in with it next time.`}>
            <span className="pw">
              <input id="f-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={described("f-password", errors.password, true)} />
              <button type="button" onClick={() => setShowPassword((s) => !s)} aria-controls="f-password" aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
            </span>
          </Field>
        )}
      </fieldset>
      <fieldset>
        <legend>Your child</legend>
        <ChildFields prefix="f-c" value={child} onChange={setChild} bad={errors.child} onPickProvince={() => setPickedProvince(true)} />
      </fieldset>
      <Submit busy={busy}>Finish <span className="arr">→</span></Submit>
      <p className="small">We use your details to run your child&apos;s assessment and to contact you. Read our <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link>.</p>
    </form>
  );
}

type LinkSend = "idle" | "busy" | "sent" | AccountError;

function linkSendText(state: LinkSend): ReactNode {
  if (state === "sent") return "Sent. Open the email on the laptop or tablet.";
  if (state === "too_many") return "You asked for many links in the last hour. Use the newest email, or try again in an hour.";
  if (state === "signed_out") return errorText("signed_out");
  if (state === "invalid") return <>We cannot send a new link from this one. <Link href="/sign-in">Sign in</Link> with your email and password, or with Google.</>;
  return <>We could not send the email. Try again in a moment. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
}

/** Asks the server for a sign-in link email. `body` is { childId } when signed in, or { token } of an old link. */
function useLinkSend(body: { childId: string } | { token: string }) {
  const [state, setState] = useState<LinkSend>("idle");
  const send = async () => {
    if (state === "busy") return;
    setState("busy");
    const res = await post("/api/account/sign-in-link", body);
    if (res.ok) {
      track("sign_in_link_sent", { src: "childId" in body ? "phone" : "old_link" });
      setState("sent");
    } else {
      track("sign_in_link_failed", { code: res.error ?? "unknown" });
      setState(res.error ?? "send_failed");
    }
  };
  return [state, send] as const;
}

/** On the phone screen: emails the link that opens this child's start screen on a laptop or tablet. */
export function SendLink({ childId, name, sent }: { childId: string; name: string; sent?: boolean }) {
  const [state, send] = useLinkSend({ childId });
  const shown = state === "idle" && sent ? "sent" : state;
  return (
    <span className="acct-start">
      <button className="btn ghost" type="button" onClick={send} disabled={shown === "busy"} aria-busy={shown === "busy"}>
        {shown === "sent" ? "Send the link again" : "Email me the link"} <span className="sr-only">for {name}</span>
      </button>
      {shown !== "idle" && shown !== "busy" && <span className="small" role="status">{linkSendText(shown)}</span>}
    </span>
  );
}

/** On a used or expired link: sends a new link to the same parent, for the same child. */
export function ResendLink({ token }: { token: string }) {
  const [state, send] = useLinkSend({ token });
  if (state === "sent") return <p role="status" className="acct-alert">We sent a new link to your email. Open it on the laptop or tablet your child will use.</p>;
  return (
    <div className="acct-form">
      {state !== "idle" && state !== "busy" && <p role="alert" className="acct-alert">{linkSendText(state)}</p>}
      <button className="btn" type="button" onClick={send} disabled={state === "busy"} aria-busy={state === "busy"}>
        {state === "busy" ? <span className="spin" aria-label="Sending" /> : <>Send a new link <span className="arr">→</span></>}
      </button>
    </div>
  );
}

/** Asks Supabase to email a password reset link. The answer is the same whether or not the email has an account. */
export function ResetRequest({ expired }: { expired: boolean }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "wait" | "bad">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    if (!EMAIL.test(email.trim())) {
      setState("bad");
      return;
    }
    setState("busy");
    const { error } = await browserClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/account/password`,
    });
    // Supabase allows one reset email a minute for each address.
    if (error?.status === 429) {
      setState("wait");
      return;
    }
    if (error) console.error("[account] reset failed", error.code);
    track("password_reset_request");
    setState("sent");
  };

  if (state === "sent") {
    return (
      <div className="acct-form">
        <p role="status" className="acct-alert">If an account uses <b>{email.trim()}</b>, we sent it a link to choose a new password. Check your email.</p>
        <p className="small"><Link href="/sign-in">Back to sign in</Link></p>
      </div>
    );
  }
  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      {expired && state === "idle" && <p role="alert" className="acct-alert">That link has expired or was already used. Send a new one.</p>}
      {state === "wait" && <p role="alert" className="acct-alert">We just sent an email. Wait a minute, then try again.</p>}
      <Field id="r-email" label="Email" bad={state === "bad"} error="Enter a valid email.">
        <input id="r-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={state === "bad"} aria-describedby={described("r-email", state === "bad")} />
      </Field>
      <Submit busy={state === "busy"}>Email me a link <span className="arr">→</span></Submit>
      <p className="small"><Link href="/sign-in">Back to sign in</Link></p>
    </form>
  );
}

/** Sets a new password for the signed-in parent (after the reset link signed them in). */
export function NewPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await browserClient().auth.updateUser({ password });
    if (updateError) {
      track("password_change_failed", { code: updateError.code ?? "unknown" });
      setError(updateError.code === "same_password" ? "This is your current password. Choose a different one."
        : updateError.code === "weak_password" ? errorText("weak_password")
        : updateError.status === 401 || updateError.code === "reauthentication_needed" ? errorText("signed_out")
        : updateError.code === "current_password_required" ? errorText("password_change_blocked")
        : errorText("store_failed"));
      setBusy(false);
      return;
    }
    track("password_changed");
    router.replace("/account?password=1");
    router.refresh();
  };

  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      {error && <p role="alert" className="acct-alert">{error}</p>}
      <Field id="n-password" label="New password" hint={`At least ${PASSWORD_MIN} characters.`}>
        <span className="pw">
          <input id="n-password" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="h-n-password" />
          <button type="button" onClick={() => setShow((s) => !s)} aria-controls="n-password" aria-pressed={show}>{show ? "Hide" : "Show"}</button>
        </span>
      </Field>
      <Submit busy={busy}>Save password <span className="arr">→</span></Submit>
    </form>
  );
}

/**
 * Sets or changes the parent's 4-digit PIN (#300). The child's desk asks for it before the child can leave. When a PIN
 * is set (`isSet`), the current one is asked first. The server checks and hashes it; a wrong current PIN counts against
 * the attempt limit, so after five wrong tries the form is refused for 15 minutes.
 */
export function PinForm({ isSet }: { isSet: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<ReactNode>(null);
  const [busy, setBusy] = useState(false);
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 4);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{4}$/.test(pin) || (isSet && !/^\d{4}$/.test(current))) {
      setError("Use exactly 4 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    let answer: PinFormResult;
    try {
      const res = await fetch("/api/account/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isSet ? { pin, current } : { pin }) });
      answer = (await res.json()) as PinFormResult;
    } catch {
      answer = { ok: false, error: "unavailable" };
    }
    if (answer.ok) {
      track(isSet ? "pin_changed" : "pin_set");
      router.replace("/account?pin=1");
      router.refresh();
      return;
    }
    setBusy(false);
    switch (answer.error) {
      case "wrong":
        setError(`That is not your current PIN. You have ${answer.attemptsLeft} ${answer.attemptsLeft === 1 ? "try" : "tries"} left.`);
        break;
      case "locked":
        setError(<>Too many wrong tries. Try again after <When at={answer.retryAt} />.</>);
        break;
      case "invalid":
        setError("Use exactly 4 digits.");
        break;
      case "current_required":
        setError("Enter your current PIN first.");
        break;
      case "signed_out":
        setError(errorText("signed_out"));
        break;
      default:
        setError(errorText("store_failed"));
    }
  };

  return (
    <form className="acct-form" onSubmit={submit} noValidate>
      {error && <p role="alert" className="acct-alert">{error}</p>}
      {isSet && (
        <Field id="p-current" label="Current PIN">
          <input id="p-current" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={current} onChange={(e) => setCurrent(digits(e.target.value))} />
        </Field>
      )}
      <Field id="p-new" label={isSet ? "New PIN" : "PIN"} hint="4 digits. Do not share it with your child.">
        <input id="p-new" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(digits(e.target.value))} aria-describedby="h-p-new" />
      </Field>
      <Submit busy={busy}>{isSet ? "Change PIN" : "Save PIN"} <span className="arr">→</span></Submit>
    </form>
  );
}
