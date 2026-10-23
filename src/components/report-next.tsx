"use client";

// The report's next step (#66): a BC parent chooses a plan and goes to the payment page to save a card; a parent in
// any other province joins the waitlist with one click. The report email links here (links only), with the step.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Province } from "@/lib/assessment";
import { BOOKING_URL, SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { CARD_CHECK_ROUTE, CARD_ROUTE, WAITLIST_ROUTE, type CardCheckResult, type CardRequest, type CardResult, type ReportSrc, type WaitlistRequest, type WaitlistResult } from "@/lib/next-step";
import type { NextStep, PlanOption } from "@/lib/report-view";
import { CURRICULA } from "@/lib/signup";
import type { PlanId } from "@/lib/site";
import { track } from "@/lib/track";

export interface NextStepStart {
  /** The plan of a card that is already saved, from card_setups. */
  saved: PlanId | null;
  /** The child is on the waitlist already. */
  joined: boolean;
  /** Back from the payment page without a saved card. */
  cancelled: boolean;
}

type CardState = "choose" | "later" | "saved" | "error" | "checking" | "unknown";
type WaitState = "join" | "joined" | "error";

const post = async <T,>(url: string, body: CardRequest | WaitlistRequest): Promise<{ status: number; result: T | null }> => {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, result: (await res.json()) as T };
  } catch {
    return { status: 0, result: null };
  }
};

export function ReportNextActions({ reportId, step, childName, province, src, asked, start }: {
  reportId: string;
  step: NextStep;
  childName: string;
  province: Province;
  src: ReportSrc;
  /** The parent came from the email's next step link. */
  asked: boolean;
  start: NextStepStart;
}) {
  const [card, setCard] = useState<CardState>(start.saved ? "saved" : "checking");
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [savedPlan, setSavedPlan] = useState<PlanId | null>(start.saved);
  const [wait, setWait] = useState<WaitState>(start.joined ? "joined" : "join");
  const [busy, setBusy] = useState<PlanId | "waitlist" | null>(null);
  // Said to screen readers after a click; the state on arrival is already in the heading.
  const [announce, setAnnounce] = useState("");
  const sending = useRef(false);
  const cancelled = useRef(start.cancelled);
  const router = useRouter();

  /** The session ended in another tab: sign in again and come back to this step. */
  const signInAgain = () => router.push(`/sign-in?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`);

  // No saved card in card_setups: ask Stripe while the report stays readable, with the plan buttons off. Only a
  // finished answer of "no card" turns them on; a failed, slow or unreadable answer is "could not check".
  useEffect(() => {
    if (step.kind !== "card" || start.saved) return;
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    void fetch(CARD_CHECK_ROUTE, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report: reportId }), signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 401) {
          if (active) router.push(`/sign-in?next=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`);
          return;
        }
        const result = res.ok ? ((await res.json()) as CardCheckResult) : null;
        if (!active) return;
        if (result?.state === "saved") {
          setSavedPlan(result.plan);
          setCard("saved");
          setAnnounce("Your card is saved.");
        } else setCard(result?.state === "absent" ? "choose" : "unknown");
      })
      .catch(() => { if (active) setCard("unknown"); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [reportId, step.kind, start.saved, checkAttempt, router]);

  const checkAgain = () => { setCard("checking"); setCheckAttempt((n) => n + 1); };

  // Back from the payment page: once per visit, and the query leaves the address so a reload does not count again.
  useEffect(() => {
    if (!cancelled.current) return;
    cancelled.current = false;
    track("card_cancelled", { src: "report" });
    const qs = new URLSearchParams(location.search);
    qs.delete("card");
    const rest = qs.toString();
    history.replaceState(null, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
  }, []);

  // Back from the payment page with the browser's back button: the page can come back with the spinner still on, and
  // the card may be saved by now, so it checks again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setBusy(null);
      sending.current = false;
      if (step.kind === "card" && !start.saved) { setCard("checking"); setCheckAttempt((n) => n + 1); }
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [step.kind, start.saved]);

  const choose = async (option: PlanOption) => {
    // The buttons are off until the check finds no card; this guards a click that came before.
    if (sending.current || card === "checking" || card === "unknown") return;
    sending.current = true;
    setBusy(option.plan);
    const { status, result } = await post<CardResult>(CARD_ROUTE, { report: reportId, plan: option.plan, src });
    if (status === 401) return signInAgain();
    const state = result?.ok ? result.state : "error";
    // The click to the payment page. Leaving the page drops a queued event, so it goes out at once.
    track("card_start", { plan: option.plan, price: option.price, src, status: state }, { beacon: state === "stripe" });
    if (result?.ok && result.state === "stripe") {
      window.location.assign(result.cardUrl);
      return;
    }
    if (result?.ok && result.state === "saved") setSavedPlan(result.plan);
    setCard(state === "stripe" ? "error" : state);
    setAnnounce(state === "later" ? "We received your plan choice." : state === "saved" ? "Your card is saved." : "");
    setBusy(null);
    sending.current = false;
  };

  const join = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy("waitlist");
    const { status, result } = await post<WaitlistResult>(WAITLIST_ROUTE, { report: reportId });
    if (status === 401) return signInAgain();
    if (result?.ok) track("waitlist_join", { src, curriculum: province, status: result.state });
    setWait(result?.ok ? "joined" : "error");
    setAnnounce(result?.ok ? "You are on the waitlist." : "");
    setBusy(null);
    sending.current = false;
  };

  const help = <>If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
  const spinner = (label: string) => <span className="spin" role="img" aria-label={label} />;

  if (step.kind === "waitlist") {
    const books = province === "other" ? "books for more provinces" : `books for the ${CURRICULA[province]} curriculum`;
    return (
      <div className={`rpt-next is-waitlist${asked ? " is-asked" : ""}`}>
        {wait === "joined" ? <>
          <h3>You are on the waitlist.</h3>
          <p>We will email you when {books} are ready. {childName}&apos;s report stays in your account.</p>
        </> : <>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          {wait === "error" && <p className="rpt-next-note" role="alert">We could not add you to the waitlist. Try again in a moment. {help}</p>}
          <button className="btn" type="button" onClick={() => void join()} disabled={busy !== null} aria-busy={busy === "waitlist"}>
            {busy === "waitlist" ? spinner("Joining the waitlist") : <>Join the waitlist <span className="arr">→</span></>}
          </button>
        </>}
        <p className="sr-only" role="status">{announce}</p>
      </div>
    );
  }

  const savedOption = step.plans.find((p) => p.plan === savedPlan);
  return (
    <div className={`rpt-next is-card${asked ? " is-asked" : ""}`}>
      {card === "saved" ? <>
        <h3>Card saved</h3>
        <p>{savedOption ? `Plan: ${savedOption.label}. ` : ""}Your first 2 weeks are free, starting when the first workbook ships. We email you before the first charge. To change the plan, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>
      </> : card === "later" ? <>
        <h3>We received your plan choice.</h3>
        <p>We will email you a link to add your card. You have not been charged.</p>
      </> : <>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        {start.cancelled && card === "choose" && <p className="rpt-next-note">Your card is not saved yet, and nothing was charged. Choose a plan when you are ready.</p>}
        {card === "checking" && <p className="rpt-next-note" role="status">Checking your card…</p>}
        {card === "unknown" && <div className="rpt-next-note" role="alert">
          <p>We could not check your card. Try again in a moment. {help}</p>
          <button className="btn ghost" type="button" onClick={checkAgain}>Try again</button>
        </div>}
        {card === "error" && <p className="rpt-next-note" role="alert">We could not open the payment page. Nothing was charged. Try again in a moment. {help}</p>}
        <div className="rpt-plans">
          {step.plans.map((option, i) => (
            <button key={option.plan} className={`btn${i < step.plans.length - 1 ? " ghost" : ""}`} type="button" onClick={() => void choose(option)} disabled={busy !== null || card === "checking" || card === "unknown"} aria-busy={busy === option.plan}>
              {busy === option.plan ? spinner("Opening the payment page") : option.label}
            </button>
          ))}
        </div>
        <p className="rpt-small">You add your card on a secure payment page.</p>
      </>}
      <p className="sr-only" role="status">{announce}</p>
    </div>
  );
}

/**
 * A free 15-minute call with a founder about the results, next to the plan choice and quieter than it. Opens Calendly
 * in a new tab; nothing about the child goes in the link. Hidden when no booking page is set (BOOKING_URL).
 */
export function BookCall({ childName }: { childName: string }) {
  if (!BOOKING_URL) return null;
  return (
    <div className="rpt-next rpt-call">
      <h3>Questions about {childName}&apos;s results?</h3>
      <p>Book a free 15-minute call with Cedric or Savar, Unica&apos;s founders. We go through the report with you, explain where {childName} starts, and answer your questions.</p>
      <a className="btn ghost" href={BOOKING_URL} target="_blank" rel="noopener" onClick={() => track("book_call", { src: "report" })}>
        Book a call <span className="arr">→</span>
      </a>
    </div>
  );
}
