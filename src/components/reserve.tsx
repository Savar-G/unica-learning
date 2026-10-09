"use client";

// Reserve flow: plan + grade -> details -> (open curriculum) review -> Stripe saves the card, or (other) waitlist.
// Nothing is charged at signup; the first month is charged when the first workbook ships (D-053).
// Any element with [data-open] opens it ([data-plan] preselects a plan, [data-src] names the CTA).
// Every signup is saved through /api/signup to Supabase before the parent leaves for Stripe.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PLANS, type PlanId } from "@/lib/site";
import { CURRICULA, EMAIL, OPEN_CURRICULA, POSTAL, curriculumFromPostal, statusFor, type CurriculumId, type SignupResult } from "@/lib/signup";
import { track } from "@/lib/track";
import { keepReceipt } from "@/lib/receipt";
import { keepHeardRef } from "@/lib/heard";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

// Completed requests use /thank-you; cancelled card setup and save failures stay in the dialog.
type Step = 1 | 2 | 3 | "nocard" | "err";
type Errors = Partial<Record<"name" | "email" | "postal", boolean>>;

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"];
// Kept across the round trip to Stripe, for the message when the parent comes back.
const CARD_KEY = "pw-card";

export function Reserve() {
  const router = useRouter();
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
  const saving = useRef(false);
  const [src, setSrc] = useState("unknown");
  const [website, setWebsite] = useState("");
  // Stripe page for the saved signup, reused if the parent comes back from Stripe and tries again.
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  const open = useCallback((src: string, p?: string) => {
    if (p === "one" || p === "both") setPlan(p);
    setSrc(src);
    setCardUrl(null);
    setErrors({});
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

  // New Stripe sessions return to /thank-you. Keep the cancellation path and handle old success URLs without claiming a saved card.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const card = qs.get("card");
    if (card === "saved") {
      router.replace("/thank-you?card=unconfirmed");
      return;
    }
    if (card !== "cancelled") return;
    qs.delete("card");
    const rest = qs.toString();
    history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
    let kept: { name?: string; email?: string; plan?: string; url?: string } = {};
    try {
      kept = JSON.parse(sessionStorage.getItem(CARD_KEY) ?? "{}");
    } catch {}
    // The URL exists only in the browser, so this cannot be initial state on a static page.
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(kept.name ?? "");
    setEmail(kept.email ?? "");
    if (kept.plan === "one" || kept.plan === "both") setPlan(kept.plan);
    setCardUrl(kept.url ?? null);
    setStep("nocard");
    /* eslint-enable react-hooks/set-state-in-effect */
    dlg.current?.showModal();
    track("card_cancelled");
  }, [router]);

  // Back from Stripe with the browser's back button: the page can come back with the spinner still on.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) { setBusy(false); saving.current = false; }
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
    setBusy(true);
    try {
      sessionStorage.setItem(CARD_KEY, JSON.stringify({ name: name.trim(), email: email.trim(), plan, url }));
    } catch {}
    track("card_redirect", { plan, price });
    window.location.assign(url);
  };

  const finish = async () => {
    if (saving.current) return;
    saving.current = true;
    if (cardUrl) {
      toStripe(cardUrl);
      return;
    }
    setBusy(true);
    const res = await save();
    if (!res?.ok) {
      saving.current = false;
      setBusy(false);
      setStep("err");
      return;
    }
    // /thank-you asks "how did you hear about us?" and sends the answer with this ref.
    if (res.ref) keepHeardRef(res.ref);
    if (res.status === "waitlist") {
      setBusy(false);
      saving.current = false;
      track("waitlist_join", { curriculum, plan, grade });
      keepReceipt("waitlist");
      close();
      router.push("/thank-you");
      return;
    }
    track("reserve_success", { plan, subject: subj, grade, curriculum, price, card: !!res.cardUrl });
    if (res.cardUrl) {
      // Keep the spinner on while the browser leaves for Stripe.
      setCardUrl(res.cardUrl);
      toStripe(res.cardUrl);
      return;
    }
    setBusy(false);
    saving.current = false;
    keepReceipt("reserved");
    close();
    router.push("/thank-you");
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

  return (
    <dialog className="rsv" ref={dlg} aria-labelledby="rsvT" onClick={(e) => e.target === dlg.current && !busy && close()} onCancel={(e) => { if (busy) e.preventDefault(); }}>
      <h2 id="rsvT" className="sr-only">Assessment booking</h2>
      <div className="hd">
        <div className="dots" aria-hidden="true">
          {[1, 2, 3].map((n) => <i key={n} className={n <= dots ? "on" : undefined} />)}
        </div>
        <button className="x" type="button" onClick={close} disabled={busy} aria-label="Close">×</button>
      </div>

      <form data-step="1" hidden={step !== 1} onSubmit={submitPlan} noValidate>
        <h3>Choose your plan.</h3>
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
        {(errors.name || errors.email || errors.postal) && <p role="alert" className="small">Correct the marked fields to continue.</p>}
        <div className={`fld${errors.name ? " bad" : ""}`}>
          <label htmlFor="f-name">Your name</label>
          <input id="f-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? "e-name" : undefined} />
          <span className="err" id="e-name">Enter your name.</span>
        </div>
        <div className={`fld${errors.email ? " bad" : ""}`}>
          <label htmlFor="f-email">Email</label>
          <input id="f-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? "e-email" : undefined} />
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
            aria-describedby={errors.postal ? "e-postal" : undefined}
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
          <button className="btn ghost" type="button" disabled={busy} onClick={() => setStep(1)}>Back</button>
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
          <div><span>Today</span><b>CAD 0</b></div>
          <div><span>When your first book ships</span><b>CAD {price} / month</b></div>
        </div>
        <p className="small" style={{ margin: 0 }}>
          Add your card on the secure payment page. We charge nothing today. When your first workbook ships, we charge CAD {price}, then every month until you cancel. Cancel before it ships and you pay nothing. Your 30-day money-back guarantee starts on the day of your first payment.
        </p>
        <div className="row2">
          <button className="btn ghost" type="button" disabled={busy} onClick={() => { setCardUrl(null); setStep(2); }}>Back</button>
          <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <span className="spin" aria-label="Processing" /> : <>Add card <span className="arr">→</span></>}
          </button>
        </div>
      </form>

      <div data-step="nocard" className="state" hidden={step !== "nocard"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#D9E3FF" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 8v8l5 3" /></svg></div>
        <h3>Your card isn&apos;t saved yet.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>
          {cardUrl
            ? "We kept your details, and nothing was charged. Add your card to book your child's free assessment."
            : <>We kept your details, and nothing was charged. Email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> to ask for a link to add your card.</>}
        </p>
        {cardUrl ? (
          <div className="row2">
            <button className="btn ghost" type="button" onClick={close}>Close</button>
            <button className="btn" type="button" disabled={busy} aria-busy={busy} onClick={() => toStripe(cardUrl)}>
              {busy ? <span className="spin" aria-label="Opening payment page" /> : <>Add card <span className="arr">→</span></>}
            </button>
          </div>
        ) : (
          <button className="btn" type="button" onClick={close}>Done</button>
        )}
      </div>

      <div data-step="err" className="state" hidden={step !== "err"} style={{ padding: "28px 22px 30px" }} aria-live="polite">
        <div className="big" style={{ background: "#FFD9C9" }}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 8v9M15 21v1" /></svg></div>
        <h3>We couldn&apos;t save your spot.</h3>
        <p className="lead" style={{ margin: 0, fontSize: 17 }}>Try again in a moment. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>. Nothing was charged.</p>
        <button className="btn" type="button" disabled={busy} aria-busy={busy} onClick={() => void finish()}>
          {busy ? <span className="spin" aria-label="Saving" /> : "Try again"}
        </button>
      </div>
      <p className="form-notice">We use your details to arrange your assessment or add you to the waitlist, and to contact you. Read our <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link>.</p>
      <p className="sr-only" role="status">{busy ? "Saving your request. Please wait." : ""}</p>
    </dialog>
  );
}
