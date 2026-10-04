"use client";

// Reserve flow: plan + grade -> details -> review -> result.
// Any element with [data-open] opens it ([data-plan] preselects a plan, [data-src] names the CTA).
// TODO(D3/D8): the review step will hand off to Stripe; until then it records the reservation in PostHog only.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { DELIVERY_FSA, PLANS, type PlanId } from "@/lib/site";
import { identify, track } from "@/lib/track";

type Step = 1 | 2 | 3 | "ok" | "wait" | "bad";
type Errors = Partial<Record<"name" | "email" | "postal", boolean>>;

const POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[A-Z] ?\d[A-Z]\d$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const open = useCallback((src: string, p?: string) => {
    if (p === "one" || p === "both") setPlan(p);
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
      setStep("wait");
      return;
    }
    track("details_done");
    setStep(3);
  };

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    track("checkout_start", { plan, grade });
    window.setTimeout(() => {
      setBusy(false);
      if (/declined/.test(window.location.search)) {
        track("checkout_declined");
        setStep("bad");
        return;
      }
      identify(email.trim().toLowerCase(), { name: name.trim(), postal, plan, subject: subj, grade });
      track("reserve_success", { plan, subject: subj, grade, price });
      setStep("ok");
    }, 900);
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
          <div className="seg" role="radiogroup" aria-label="Grade">
            {["3", "4", "5"].map((g) => (
              <label key={g}><input type="radio" name="grade" checked={grade === g} onChange={() => setGrade(g)} />Grade {g}</label>
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
        <div className="row2">
          <button className="btn ghost" type="button" onClick={() => setStep(1)}>Back</button>
          <button className="btn" type="submit">Continue <span className="arr">→</span></button>
        </div>
      </form>

      <form data-step="3" hidden={step !== 3} onSubmit={confirm} noValidate>
        <h3>Review and confirm.</h3>
        <div className="sum">
          <div><span>Plan</span><b>{subj}</b></div>
          <div><span>Grade</span><b>{grade}</b></div>
          <div><span>Ship to</span><b>{postal}</b></div>
          <div><span>Price</span><b>CAD {price} / month</b></div>
        </div>
        <p className="small" style={{ margin: 0 }}>Today: CAD 0. You&apos;re charged when your first workbook ships. Cancel anytime before then.</p>
        <div className="row2">
          <button className="btn ghost" type="button" onClick={() => setStep(2)}>Back</button>
          <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <span className="spin" aria-label="Processing" /> : "Continue to secure checkout"}
          </button>
        </div>
      </form>

      <div data-step="ok" className="state" hidden={step !== "ok"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M7 15.5l5.5 5.5L23.5 9" /></svg></div>
        <h3>You&apos;re in.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>
          Thanks, {firstName}. We&apos;ll email {email.trim()} a link to your child&apos;s placement assessment. Your first workbook ships after it, and you&apos;re charged only then.
        </p>
        <button className="btn" type="button" onClick={close}>Done</button>
      </div>

      <div data-step="wait" className="state" hidden={step !== "wait"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#D9E3FF" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 8v8l5 3" /></svg></div>
        <h3>We&apos;re not in your area yet.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>We don&apos;t deliver to {postal} yet. We&apos;ll email {email.trim()} as soon as we do.</p>
        <button className="btn" type="button" onClick={() => { track("waitlist_join", { fsa: postal.slice(0, 3) }); close(); }}>Join the waitlist</button>
      </div>

      <div data-step="bad" className="state" hidden={step !== "bad"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#FFD9C9" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M10 10l10 10M20 10L10 20" /></svg></div>
        <h3>Your card was declined.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>Nothing was charged. Try another card.</p>
        <button className="btn" type="button" onClick={() => setStep(3)}>Try again</button>
      </div>
    </dialog>
  );
}
