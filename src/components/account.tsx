"use client";

// Parent account screens for the online assessment pilot (#62, D-082): signup, sign-in, the children list.
// Server writes go through /api/account/*; the browser holds only the publishable key and the parent's own session.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CURRICULA, EMAIL, POSTAL, curriculumFromPostal, type CurriculumId } from "@/lib/signup";
import { GRADES, PASSWORD_MIN, type AccountError, type AccountResult, type ChildInput } from "@/lib/account";
import { browserClient } from "@/lib/supabase-browser";
import { track } from "@/lib/track";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"];

/** Referrer and UTM tags of this visit, so we know which channel brought each parent. */
function collectSource() {
  const qs = new URLSearchParams(window.location.search);
  const source: Record<string, string> = {};
  if (document.referrer) source.referrer = document.referrer;
  for (const k of UTM) {
    const v = qs.get(k);
    if (v) source[k] = v;
  }
  return source;
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
    case "account_exists":
      return <>You already have an account with this email. <Link href="/sign-in">Sign in</Link>.</>;
    case "weak_password":
      return "Choose a stronger password. Use a longer one, and do not use a common password.";
    case "invalid":
      return "Correct the marked fields to continue.";
    case "too_many":
      return "This account has the most children we allow. Email us to add more.";
    case "busy":
      return <>Many people are signing up right now. Try again in a few minutes, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
    case "signed_out":
      return <>Your session ended. <Link href="/sign-in">Sign in</Link> again.</>;
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

/** First name, grade and province of one child. `onPickProvince` runs when the parent chooses a province. */
function ChildFields({ prefix, value, onChange, bad, onPickProvince }: { prefix: string; value: ChildInput; onChange: (c: ChildInput) => void; bad?: boolean; onPickProvince?: () => void }) {
  return (
    <>
      <Field id={`${prefix}-first`} label="Child's first name" bad={bad} error="Enter your child's first name.">
        <input id={`${prefix}-first`} autoComplete="off" value={value.firstName} maxLength={60} onChange={(e) => onChange({ ...value, firstName: e.target.value })} aria-invalid={!!bad} aria-describedby={described(`${prefix}-first`, bad)} />
      </Field>
      <div className="fld">
        <span className="lbl" id={`${prefix}-grade`}>School grade</span>
        <div className="seg" role="radiogroup" aria-labelledby={`${prefix}-grade`}>
          {GRADES.map((g) => (
            <label key={g}><input type="radio" name={`${prefix}-grade`} checked={value.grade === g} onChange={() => onChange({ ...value, grade: g })} aria-label={`Grade ${g}`} />{g}</label>
          ))}
        </div>
      </div>
      <Field id={`${prefix}-province`} label="Province" hint="We match the test to what your child learns at school.">
        <select
          id={`${prefix}-province`}
          value={value.province}
          onChange={(e) => {
            onPickProvince?.();
            onChange({ ...value, province: e.target.value as CurriculumId });
          }}
          aria-describedby={`h-${prefix}-province`}
        >
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

type SignupErrors = Partial<Record<"name" | "email" | "postal" | "password" | "child", boolean>>;

export function AccountSignup() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [postal, setPostal] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [child, setChild] = useState<ChildInput>({ firstName: "", grade: 4, province: "BC" });
  // Until the parent picks a province, follow the one in their postal code.
  const [pickedProvince, setPickedProvince] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<SignupErrors>({});
  const [failure, setFailure] = useState<AccountError | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const onStart = () => {
    if (started.current) return;
    started.current = true;
    track("account_form_start");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: SignupErrors = {
      name: name.trim().length < 2,
      email: !EMAIL.test(email.trim()),
      postal: !POSTAL.test(postal.trim()),
      password: password.length < PASSWORD_MIN,
      child: !child.firstName.trim(),
    };
    setErrors(next);
    setFailure(null);
    const firstBad = (["name", "email", "postal", "password", "child"] as const).find((k) => next[k]);
    if (firstBad) {
      form.current?.querySelector<HTMLInputElement>(`#a-${firstBad === "child" ? "c-first" : firstBad}`)?.focus();
      return;
    }
    setBusy(true);
    const res = await post("/api/account/signup", {
      name: name.trim(), email: email.trim(), postal: postal.trim().toUpperCase(), password, child: { ...child, firstName: child.firstName.trim() }, source: collectSource(), website,
    });
    if (!res.ok) {
      track("account_signup_failed", { code: res.error ?? "unknown" });
      setFailure(res.error ?? "store_failed");
      setBusy(false);
      return;
    }
    track("account_created", { curriculum: child.province });
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    // The account exists even if this sign-in fails; the sign-in page lets the parent finish.
    router.replace(error ? "/sign-in?created=1" : res.linkSent ? "/account?sent=1" : "/account");
  };

  return (
    <form ref={form} className="acct-form" onSubmit={submit} onFocus={onStart} noValidate>
      <GoogleButton />
      {failure && <p role="alert" className="acct-alert">{errorText(failure)}</p>}
      {!failure && Object.values(errors).some(Boolean) && <p role="alert" className="acct-alert">{errorText("invalid")}</p>}
      <fieldset>
        <legend>About you</legend>
        <Field id="a-name" label="Your name" bad={errors.name} error="Enter your name.">
          <input id="a-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={described("a-name", errors.name)} />
        </Field>
        <Field id="a-email" label="Email" bad={errors.email} error="Enter a valid email.">
          <input id="a-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={described("a-email", errors.email)} />
        </Field>
        <Field id="a-postal" label="Postal code" bad={errors.postal} error="Enter a Canadian postal code, like V6B 1A1.">
          <input id="a-postal" autoComplete="postal-code" placeholder="V6B 1A1" value={postal} onChange={(e) => {
            setPostal(e.target.value);
            const guess = curriculumFromPostal(e.target.value);
            if (guess && !pickedProvince) setChild((c) => ({ ...c, province: guess }));
          }} aria-invalid={!!errors.postal} aria-describedby={described("a-postal", errors.postal)} />
        </Field>
        <Field id="a-password" label="Password" bad={errors.password} error={`Use at least ${PASSWORD_MIN} characters.`} hint={`At least ${PASSWORD_MIN} characters.`}>
          <span className="pw">
            <input id="a-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={described("a-password", errors.password, true)} />
            <button type="button" onClick={() => setShowPassword((s) => !s)} aria-controls="a-password" aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
          </span>
        </Field>
      </fieldset>
      <fieldset>
        <legend>Your child</legend>
        <ChildFields prefix="a-c" value={child} onChange={setChild} bad={errors.child} onPickProvince={() => setPickedProvince(true)} />
      </fieldset>
      <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
      <Submit busy={busy}>Create account <span className="arr">→</span></Submit>
      <p className="small">Already have an account? <Link href="/sign-in">Sign in</Link></p>
      <p className="small">We use your details to run your child&apos;s assessment and to contact you. Read our <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link>.</p>
    </form>
  );
}

export function SignIn({ created, googleFailed }: { created: boolean; googleFailed: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      track("sign_in_failed", { code: error.code ?? "unknown" });
      setFailed(true);
      setBusy(false);
      return;
    }
    track("sign_in");
    router.replace("/account");
  };

  return (
    <form className="acct-form" onSubmit={submit}>
      <GoogleButton />
      {created && !failed && <p role="status" className="acct-alert">Your account is ready. Sign in to continue.</p>}
      {googleFailed && !failed && <p role="alert" className="acct-alert">We could not sign you in with Google. Try again, or use your email and password.</p>}
      {failed && <p role="alert" className="acct-alert">The email or password is not correct. Try again.</p>}
      <Field id="s-email" label="Email">
        <input id="s-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="s-password" label="Password">
        <input id="s-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Submit busy={busy}>Sign in <span className="arr">→</span></Submit>
      <p className="small"><Link href="/sign-in/reset">Forgot your password?</Link></p>
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

/** Placeholder until the test ticket (#64) builds the test. */
export function StartTest({ name }: { name: string }) {
  const [clicked, setClicked] = useState(false);
  return (
    <span className="acct-start">
      <button className="btn" type="button" onClick={() => { setClicked(true); track("test_start_click"); }}>
        Start test <span className="sr-only">for {name}</span> <span className="arr">→</span>
      </button>
      {clicked && <span className="small" role="status">The test is not open yet. We will tell you when it is ready.</span>}
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

/** Google sign-in. Google returns the parent to /auth/callback; a new parent then finishes their account on /account/finish. */
export function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const go = async () => {
    setBusy(true);
    setFailed(false);
    track("google_start");
    const { error } = await browserClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
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

/** A parent who signed in with Google for the first time gives the rest of the signup details. */
export function FinishAccount({ name: googleName, email }: { name: string; email: string }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(googleName);
  const [postal, setPostal] = useState("");
  const [child, setChild] = useState<ChildInput>({ firstName: "", grade: 4, province: "BC" });
  const [pickedProvince, setPickedProvince] = useState(false);
  const [errors, setErrors] = useState<SignupErrors>({});
  const [failure, setFailure] = useState<AccountError | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: SignupErrors = { name: name.trim().length < 2, postal: !POSTAL.test(postal.trim()), child: !child.firstName.trim() };
    setErrors(next);
    setFailure(null);
    const firstBad = (["name", "postal", "child"] as const).find((k) => next[k]);
    if (firstBad) {
      form.current?.querySelector<HTMLInputElement>(`#f-${firstBad === "child" ? "c-first" : firstBad}`)?.focus();
      return;
    }
    setBusy(true);
    const res = await post("/api/account/finish", {
      name: name.trim(), postal: postal.trim().toUpperCase(), child: { ...child, firstName: child.firstName.trim() }, source: collectSource(),
    });
    if (!res.ok && res.error !== "account_exists") {
      track("account_signup_failed", { code: res.error ?? "unknown", channel: "google" });
      setFailure(res.error ?? "store_failed");
      setBusy(false);
      return;
    }
    if (res.ok) track("account_created", { curriculum: child.province, channel: "google" });
    router.replace(res.linkSent ? "/account?sent=1" : "/account");
    router.refresh();
  };

  return (
    <form ref={form} className="acct-form" onSubmit={submit} noValidate>
      {failure && <p role="alert" className="acct-alert">{errorText(failure)}</p>}
      {!failure && Object.values(errors).some(Boolean) && <p role="alert" className="acct-alert">{errorText("invalid")}</p>}
      <fieldset>
        <legend>About you</legend>
        <p className="small">Signed in with Google as <b>{email}</b>.</p>
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
        : updateError.status === 401 ? errorText("signed_out")
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
