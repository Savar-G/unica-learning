"use client";

// Reserve flow: plan + grade -> details -> (open curriculum) review -> Stripe deposit, or (other) waitlist.
// Any element with [data-open] opens it ([data-plan] preselects a plan, [data-src] names the CTA).
// Every signup is saved through /api/signup to Supabase before the parent leaves for Stripe (D-053).
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { DEPOSIT, PLANS, type PlanId } from "@/lib/site";
import { CURRICULA, EMAIL, OPEN_CURRICULA, POSTAL, curriculumFromPostal, statusFor, type CurriculumId, type SignupResult } from "@/lib/signup";
import { identify, track } from "@/lib/track";

// ok = reserved but no payment link is set; paid = back from Stripe; wait = waitlist.
type Step = 1 | 2 | 3 | "ok" | "paid" | "wait" | "err";
type Errors = Partial<Record<"name" | "email" | "postal", boolean>>;

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"];
// Name and email kept across the round trip to Stripe, for the "Deposit received" message.
const PAID_KEY = "pw-deposit";

export function Reserve() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [plan, setPlan] = useState<PlanId>("one");
  const [subject, setSubject] = useState("Math");
  const [grade, setGrade] = useState("4");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [postal, setPostal] = useState("");
  const [curriculum, setCurriculum] = useState<CurriculumId>("BC");
  // Until the parent picks a curriculum, follow the province in their postal code.
  const [pickedCurriculum, setPickedCurriculum] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState("unknown");
  const [website, setWebsite] = useState("");
  // Stripe URL for the saved signup, reused if the parent comes back from Stripe and pays again.
  const [payUrl, setPayUrl] = useState<string | null>(null);

  const open = useCallback((src: string, p?: string) => {
    if (p === "one" || p === "both") setPlan(p);
    setSrc(src);
    setPayUrl(null);
    setStep(1);
    dlg.current?.showModal();
    track("cta_click", { src, plan: p ?? null });
    track("form_start");
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-open]");
      if (!el) return;
      e.preventDefault();
      open(el.dataset.src ?? "unknown", el.dataset.plan);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  // Stripe sends parents who paid back to /?deposit=paid (the Payment Link's after-payment redirect).
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("deposit") !== "paid") return;
    qs.delete("deposit");
    qs.delete("session_id");
    const rest = qs.toString();
    history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
    let saved: { name?: string; email?: string } = {};
    try {
      saved = JSON.parse(sessionStorage.getItem(PAID_KEY) ?? "{}");
      sessionStorage.removeItem(PAID_KEY);
    } catch {}
    // The URL exists only in the browser, so this cannot be initial state on a static page.
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(saved.name ?? "");
    setEmail(saved.email ?? "");
    setStep("paid");
    /* eslint-enable react-hooks/set-state-in-effect */
    dlg.current?.showModal();
    track("deposit_paid");
  }, []);

  // Back from Stripe without paying: the browser can restore this page with the spinner still on.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // Move focus to the first control of each step.
  useEffect(() => {
    const first = dlg.current?.querySelector<HTMLElement>(`[data-step="${step}"] input, [data-step="${step}"] button`);
    first?.focus();
  }, [step]);

  const subj = plan === "both" ? "Math + Reading" : subject;
  const price = PLANS[plan].price;
  const status = statusFor(curriculum);
  // "the Alberta" / "your province's", for "books for ... curriculum".
  const theirs = curriculum === "other" ? "your province's" : `the ${CURRICULA[curriculum]}`;
  const close = () => dlg.current?.close();

  // Save the signup. Returns null when the server could not store it.
  const save = async (): Promise<SignupResult | null> => {
    const qs = new URLSearchParams(window.location.search);
    const source: Record<string, string> = { cta: src };
    if (document.referrer) source.referrer = document.referrer;
    for (const k of UTM) {
      const v = qs.get(k);
      if (v) source[k] = v;
    }
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), postal: postal.trim().toUpperCase(), plan, subject: subj, grade: Number(grade), curriculum, source, website }),
      });
      if (!res.ok) {
        track("signup_save_failed", { status, code: res.status });
        return null;
      }
      return (await res.json()) as SignupResult;
    } catch {
      track("signup_save_failed", { status, code: 0 });
      return null;
    }
  };

  const toStripe = (url: string) => {
    try {
      sessionStorage.setItem(PAID_KEY, JSON.stringify({ name: name.trim(), email: email.trim() }));
    } catch {}
    track("deposit_redirect", { plan, deposit: DEPOSIT });
    window.location.assign(url);
  };

  const finish = async () => {
    if (payUrl) {
      setBusy(true);
      toStripe(payUrl);
      return;
    }
    setBusy(true);
    const res = await save();
    if (!res?.ok) {
      setBusy(false);
      setStep("err");
      return;
    }
    identify(email.trim().toLowerCase(), { name: name.trim(), postal: postal.trim().toUpperCase(), plan, subject: subj, grade, curriculum });
    if (res.status === "waitlist") {
      setBusy(false);
      track("waitlist_join", { curriculum, plan, grade });
      setStep("wait");
      return;
    }
    track("reserve_success", { plan, subject: subj, grade, curriculum, price, deposit: !!res.pay });
    if (res.pay) {
      // Keep the spinner on while the browser leaves for Stripe.
      setPayUrl(res.pay);
      toStripe(res.pay);
      return;
    }
    setBusy(false);
    setStep("ok");
  };

  const submitPlan = (e: FormEvent) => {
    e.preventDefault();
    track("plan_selected", { plan, subject: subj, grade });
    setStep(2);
  };

  const submitDetails = (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {
      name: name.trim().length < 2,
      email: !EMAIL.test(email.trim()),
      postal: !POSTAL.test(postal.trim()),
    };
    setErrors(next);
    if (next.name || next.email || next.postal) {
      const firstBad = (["name", "email", "postal"] as const).find((k) => next[k]);
      dlg.current?.querySelector<HTMLInputElement>(`#f-${firstBad}`)?.focus();
      return;
    }
    const pc = postal.trim().toUpperCase();
    setPostal(pc);
    track("details_done", { curriculum, status });
    // Books for this curriculum are not ready: save the waitlist entry now, with no review step.
    if (status === "waitlist") {
      void finish();
      return;
    }
    setStep(3);
  };

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    track("checkout_start", { plan, grade });
    void finish();
  };

  const dots = typeof step === "number" ? step : 3;
  const firstName = name.trim().split(" ")[0];

  return (
    <dialog className="rsv" ref={dlg} aria-labelledby="rsvT" onClick={(e) => e.target === dlg.current && close()}>
      <div className="hd">
        <div className="dots" aria-hidden="true">
          {[1, 2, 3].map((n) => <i key={n} className={n <= dots ? "on" : undefined} />)}
        </div>
        <button className="x" type="button" onClick={close} aria-label="Close">×</button>
      </div>

      <form data-step="1" hidden={step !== 1} onSubmit={submitPlan} noValidate>
        <h3 id="rsvT">Choose your plan.</h3>
        <fieldset>
          <legend>Plan</legend>
          <label className="opt">
            <input type="radio" name="plan" checked={plan === "one"} onChange={() => setPlan("one")} />
            <span className="t"><b>{PLANS.one.name}</b><span>{PLANS.one.note}</span></span>
            <span className="p">CAD {PLANS.one.price}</span>
          </label>
          {plan === "one" && (
            <div className="seg" role="radiogroup" aria-label="Subject">
              {["Math", "Reading"].map((s) => (
                <label key={s}><input type="radio" name="subject" checked={subject === s} onChange={() => setSubject(s)} />{s}</label>
              ))}
            </div>
          )}
          <label className="opt">
            <input type="radio" name="plan" checked={plan === "both"} onChange={() => setPlan("both")} />
            <span className="t"><b>{PLANS.both.name}</b><span>{PLANS.both.note}</span></span>
            <span className="p">CAD {PLANS.both.price}</span>
          </label>
        </fieldset>
        <fieldset>
          <legend>Your child&apos;s grade</legend>
          <div className="seg ages" role="radiogroup" aria-label="Grade">
            {["1", "2", "3", "4", "5", "6", "7"].map((g) => (
              <label key={g}><input type="radio" name="grade" checked={grade === g} onChange={() => setGrade(g)} aria-label={`Grade ${g}`} />{g}</label>
            ))}
          </div>
        </fieldset>
        <button className="btn" type="submit" style={{ justifyContent: "center" }}>Continue <span className="arr">→</span></button>
      </form>

      <form data-step="2" hidden={step !== 2} onSubmit={submitDetails} noValidate>
        <h3>Where should we send it?</h3>
        <div className={`fld${errors.name ? " bad" : ""}`}>
          <label htmlFor="f-name">Your name</label>
          <input id="f-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby="e-name" />
          <span className="err" id="e-name">Enter your name.</span>
        </div>
        <div className={`fld${errors.email ? " bad" : ""}`}>
          <label htmlFor="f-email">Email</label>
          <input id="f-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby="e-email" />
          <span className="err" id="e-email">Enter a valid email.</span>
        </div>
        <div className={`fld${errors.postal ? " bad" : ""}`}>
          <label htmlFor="f-postal">Postal code</label>
          <input
            id="f-postal"
            autoComplete="postal-code"
            placeholder="V6B 1A1"
            value={postal}
            onChange={(e) => {
              setPostal(e.target.value);
              const guess = curriculumFromPostal(e.target.value);
              if (guess && !pickedCurriculum) setCurriculum(guess);
            }}
            aria-invalid={!!errors.postal}
            aria-describedby="e-postal"
          />
          <span className="err" id="e-postal">Enter a Canadian postal code, like V6B 1A1.</span>
        </div>
        <div className="fld">
          <label htmlFor="f-curriculum">School curriculum</label>
          <select
            id="f-curriculum"
            value={curriculum}
            onChange={(e) => {
              setCurriculum(e.target.value as CurriculumId);
              setPickedCurriculum(true);
            }}
            aria-describedby="h-curriculum"
          >
            {(Object.keys(CURRICULA) as CurriculumId[]).map((k) => (
              <option key={k} value={k}>{CURRICULA[k]}</option>
            ))}
          </select>
          <span className="hint" id="h-curriculum">
            {status === "waitlist"
              ? `We make books for the ${OPEN_CURRICULA.join(" and ")} curriculum first. Join the waitlist and we'll email you when books for ${theirs} curriculum are ready.`
              : "We match every book to what your child learns at school."}
          </span>
        </div>
        <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <div className="row2">
          <button className="btn ghost" type="button" onClick={() => setStep(1)}>Back</button>
          <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <span className="spin" aria-label="Saving" /> : status === "waitlist" ? "Join waitlist" : <>Continue <span className="arr">→</span></>}
          </button>
        </div>
      </form>

      <form data-step="3" hidden={step !== 3} onSubmit={confirm} noValidate>
        <h3>Review and book.</h3>
        <div className="sum">
          <div><span>Plan</span><b>{subj}</b></div>
          <div><span>Grade</span><b>{grade}</b></div>
          <div><span>Ship to</span><b>{postal}</b></div>
          <div><span>Curriculum</span><b>{CURRICULA[curriculum]}</b></div>
          <div><span>Assessment</span><b>Free</b></div>
          <div><span>Refundable deposit today</span><b>CAD {DEPOSIT}</b></div>
          <div><span>Then</span><b>CAD {price} / month</b></div>
        </div>
        <p className="small" style={{ margin: 0 }}>
          The CAD {DEPOSIT} comes off your first month, which is charged when your first workbook ships. Cancel before then and we refund it in full. Every plan also has a 30-day money-back guarantee. You pay on Stripe&apos;s secure checkout.
        </p>
        <div className="row2">
          <button className="btn ghost" type="button" onClick={() => { setPayUrl(null); setStep(2); }}>Back</button>
          <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <span className="spin" aria-label="Processing" /> : `Pay CAD ${DEPOSIT} deposit`}
          </button>
        </div>
      </form>

      <div data-step="ok" className="state" hidden={step !== "ok"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M7 15.5l5.5 5.5L23.5 9" /></svg></div>
        <h3>You&apos;re in.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>
          Thanks, {firstName}. We&apos;ll email {email.trim()} a link to pay your CAD {DEPOSIT} refundable deposit, then arrange your child&apos;s free placement assessment.
        </p>
        <button className="btn" type="button" onClick={close}>Done</button>
      </div>

      <div data-step="paid" className="state" hidden={step !== "paid"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M7 15.5l5.5 5.5L23.5 9" /></svg></div>
        <h3>Deposit received.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>
          Thanks{firstName && `, ${firstName}`}. We&apos;ll email {email.trim() || "you"} to arrange your child&apos;s free placement assessment. Your CAD {DEPOSIT} comes off your first month.
        </p>
        <button className="btn" type="button" onClick={close}>Done</button>
      </div>

      <div data-step="wait" className="state" hidden={step !== "wait"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#D9E3FF" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 8v8l5 3" /></svg></div>
        <h3>You&apos;re on the waitlist.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>
          Thanks, {firstName}. We&apos;ll email {email.trim()} when books for {theirs} curriculum are ready. Nothing was charged.
        </p>
        <button className="btn" type="button" onClick={close}>Done</button>
      </div>

      <div data-step="err" className="state" hidden={step !== "err"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#FFD9C9" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 8v9M15 21v1" /></svg></div>
        <h3>We couldn&apos;t save your spot.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>Check your connection and try again. Nothing was charged.</p>
        <button className="btn" type="button" disabled={busy} aria-busy={busy} onClick={() => void finish()}>
          {busy ? <span className="spin" aria-label="Saving" /> : "Try again"}
        </button>
      </div>
    </dialog>
  );
}
