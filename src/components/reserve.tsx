"use client";

// Reserve flow: plan + grade -> details -> review -> result.
// Any element with [data-open] opens it ([data-plan] preselects a plan, [data-src] names the CTA).
// Each reservation (and each outside-area waitlist entry) is saved through /api/signup to Supabase.
// TODO(D3/D8): the review step will hand off to Stripe.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { DELIVERY_FSA, PLANS, type PlanId } from "@/lib/site";
import { EMAIL, POSTAL, type SignupStatus } from "@/lib/signup";
import { identify, track } from "@/lib/track";

type Step = 1 | 2 | 3 | "ok" | "wait" | "bad" | "err";
type Errors = Partial<Record<"name" | "email" | "postal", boolean>>;

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"];

export function Reserve() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [plan, setPlan] = useState<PlanId>("one");
  const [subject, setSubject] = useState("Math");
  const [grade, setGrade] = useState("4");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [postal, setPostal] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState("unknown");
  const [website, setWebsite] = useState("");
  const [pending, setPending] = useState<SignupStatus>("reserved");

  const open = useCallback((src: string, p?: string) => {
    if (p === "one" || p === "both") setPlan(p);
    setSrc(src);
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

  // Move focus to the first control of each step.
  useEffect(() => {
    const first = dlg.current?.querySelector<HTMLElement>(`[data-step="${step}"] input, [data-step="${step}"] button`);
    first?.focus();
  }, [step]);

  const subj = plan === "both" ? "Math + Reading" : subject;
  const price = PLANS[plan].price;
  const close = () => dlg.current?.close();

  // Save the signup. Returns false when the server could not store it.
  const save = async (status: SignupStatus) => {
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
        body: JSON.stringify({ status, name: name.trim(), email: email.trim(), postal: postal.trim().toUpperCase(), plan, subject: subj, grade: Number(grade), source, website }),
      });
      if (!res.ok) track("signup_save_failed", { status, code: res.status });
      return res.ok;
    } catch {
      track("signup_save_failed", { status, code: 0 });
      return false;
    }
  };

  const finish = async (status: SignupStatus) => {
    setPending(status);
    setBusy(true);
    const ok = await save(status);
    setBusy(false);
    if (!ok) {
      setStep("err");
      return;
    }
    identify(email.trim().toLowerCase(), { name: name.trim(), postal: postal.trim().toUpperCase(), plan, subject: subj, grade });
    if (status === "waitlist") {
      track("waitlist_join", { fsa: postal.trim().slice(0, 3).toUpperCase() });
      setStep("wait");
    } else {
      track("reserve_success", { plan, subject: subj, grade, price });
      setStep("ok");
    }
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
    if (!DELIVERY_FSA.test(pc)) {
      track("outside_area", { fsa: pc.slice(0, 3) });
      void finish("waitlist");
      return;
    }
    track("details_done");
    setStep(3);
  };

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    track("checkout_start", { plan, grade });
    if (/declined/.test(window.location.search)) {
      track("checkout_declined");
      setStep("bad");
      return;
    }
    void finish("reserved");
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
          <input id="f-postal" autoComplete="postal-code" placeholder="V6B 1A1" value={postal} onChange={(e) => setPostal(e.target.value)} aria-invalid={!!errors.postal} aria-describedby="e-postal" />
          <span className="err" id="e-postal">Enter a Canadian postal code, like V6B 1A1.</span>
        </div>
        <input className="hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <div className="row2">
          <button className="btn ghost" type="button" onClick={() => setStep(1)}>Back</button>
          <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <span className="spin" aria-label="Saving" /> : <>Continue <span className="arr">→</span></>}
          </button>
        </div>
      </form>

      <form data-step="3" hidden={step !== 3} onSubmit={confirm} noValidate>
        <h3>Review and book.</h3>
        <div className="sum">
          <div><span>Plan</span><b>{subj}</b></div>
          <div><span>Grade</span><b>{grade}</b></div>
          <div><span>Ship to</span><b>{postal}</b></div>
          <div><span>Assessment</span><b>Free</b></div>
          <div><span>Then</span><b>CAD {price} / month</b></div>
        </div>
        <p className="small" style={{ margin: 0 }}>Today: CAD 0, and no card. You&apos;re charged when your first workbook ships, with a 30-day money-back guarantee. Cancel anytime.</p>
        <div className="row2">
          <button className="btn ghost" type="button" onClick={() => setStep(2)}>Back</button>
          <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <span className="spin" aria-label="Processing" /> : "Book free assessment"}
          </button>
        </div>
      </form>

      <div data-step="ok" className="state" hidden={step !== "ok"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M7 15.5l5.5 5.5L23.5 9" /></svg></div>
        <h3>You&apos;re in.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>
          Thanks, {firstName}. We&apos;ll email {email.trim()} to arrange your child&apos;s free placement assessment. Your first workbook ships after it, and you&apos;re charged only then.
        </p>
        <button className="btn" type="button" onClick={close}>Done</button>
      </div>

      <div data-step="wait" className="state" hidden={step !== "wait"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#D9E3FF" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 8v8l5 3" /></svg></div>
        <h3>You&apos;re on the waitlist.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>We don&apos;t deliver to {postal} yet. We&apos;ll email {email.trim()} as soon as we do.</p>
        <button className="btn" type="button" onClick={close}>Done</button>
      </div>

      <div data-step="bad" className="state" hidden={step !== "bad"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#FFD9C9" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M10 10l10 10M20 10L10 20" /></svg></div>
        <h3>Your card was declined.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>Nothing was charged. Try another card.</p>
        <button className="btn" type="button" onClick={() => setStep(3)}>Try again</button>
      </div>

      <div data-step="err" className="state" hidden={step !== "err"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#FFD9C9" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 8v9M15 21v1" /></svg></div>
        <h3>We couldn&apos;t save your spot.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>Check your connection and try again. Nothing was charged.</p>
        <button className="btn" type="button" disabled={busy} aria-busy={busy} onClick={() => void finish(pending)}>
          {busy ? <span className="spin" aria-label="Saving" /> : "Try again"}
        </button>
      </div>
    </dialog>
  );
}
