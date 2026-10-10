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
    const qs = new URLSearchParams(window.location.search);
    const source: Record<string, string> = {};
    if (document.referrer) source.referrer = document.referrer;
    for (const k of UTM) {
      const v = qs.get(k);
      if (v) source[k] = v;
    }
    const res = await post("/api/account/signup", {
      name: name.trim(), email: email.trim(), postal: postal.trim().toUpperCase(), password, child: { ...child, firstName: child.firstName.trim() }, source, website,
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
    router.replace(error ? "/sign-in?created=1" : "/account");
  };

  return (
    <form ref={form} className="acct-form" onSubmit={submit} onFocus={onStart} noValidate>
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

export function SignIn({ created }: { created: boolean }) {
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
      {created && !failed && <p role="status" className="acct-alert">Your account is ready. Sign in to continue.</p>}
      {failed && <p role="alert" className="acct-alert">The email or password is not correct. Try again.</p>}
      <Field id="s-email" label="Email">
        <input id="s-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="s-password" label="Password">
        <input id="s-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Submit busy={busy}>Sign in <span className="arr">→</span></Submit>
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

/** Opens the child's test (#64). An open test continues; a finished one waits for its report. */
export function StartTest({ childId, name, status }: { childId: string; name: string; status: "in_progress" | "completed" | null }) {
  if (status === "completed") return <span className="small acct-done">Test done. The report comes by email.</span>;
  return (
    <span className="acct-start">
      <Link className="btn" href={`/account/test/${childId}`} onClick={() => track("test_start_click", { status: status ?? "new" })}>
        {status === "in_progress" ? "Continue test" : "Start test"} <span className="sr-only">for {name}</span> <span className="arr">→</span>
      </Link>
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

/** Counts how many parents reach the phone screen. */
export function PhoneSeen() {
  useEffect(() => track("phone_screen"), []);
  return null;
}
