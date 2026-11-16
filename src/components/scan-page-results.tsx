"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState, type CSSProperties } from "react";
import { browserClient } from "@/lib/supabase-browser";
import { useScanContext } from "@/lib/use-scan-context";
import { boxInCrop, initialTogetherState, questionCrop, resultsExplanationResponse, reviewLine, togetherState,
  type QuestionExplanation, type ResultsPhoto as ResultsPhotoData, type ResultsQuestion, type ScanResultsPageData } from "@/lib/scan-page-results";
import type { Box } from "@/lib/workbook-print-contract";
import "./scan-page-results.css";

const placement = (box: Box): CSSProperties => ({ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` });

export function ResultsPhoto({ photo, child, questions, question, whole = false, onOpen }: {
  photo: ResultsPhotoData | null; child: string; questions: ResultsQuestion[]; question?: ResultsQuestion; whole?: boolean; onOpen?: (itemId: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  if (!photo || failed) return <p className="spr-photo-unavailable" role="status">Photo no longer available.</p>;
  const crop = question && !whole && photo.aligned ? questionCrop(question) : null;
  const frame = crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const outlined = question?.questionBox ?? question?.regions[0];
  const positioned = questions.filter(item => (item.kind === "review" || item.kind === "right") && item.regions.length);
  return <div className={`spr-photo ${crop ? "spr-photo-crop" : ""}`} style={{ aspectRatio: `${photo.width * frame.width} / ${photo.height * frame.height}` }}>
    <Image unoptimized src={photo.src} width={photo.width} height={photo.height} alt={`${child}'s photographed page${question ? `, question ${question.number}${crop ? " close up" : " in the whole page"}` : ""}`}
      onError={() => setFailed(true)} style={crop ? { position: "absolute", maxWidth: "none", width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` } : { width: "100%", height: "auto" }} />
    {photo.aligned && question && outlined && <span className="spr-outline" style={placement(boxInCrop(outlined, frame))} aria-hidden="true" />}
    {photo.aligned && !question && positioned.flatMap(item => item.regions.map((box, index) => item.kind === "review"
      ? <button key={`${item.itemId}-${index}`} type="button" className="spr-marker" style={{ left: `${(box.x + box.width / 2) * 100}%`, top: `${(box.y + box.height / 2) * 100}%` }} onClick={() => onOpen?.(item.itemId)} aria-label={`Go through question ${item.number} together`}><span>{item.number}</span></button>
      : <span key={`${item.itemId}-${index}`} className="spr-tick" style={{ left: `${(box.x + box.width / 2) * 100}%`, top: `${(box.y + box.height / 2) * 100}%` }} role="img" aria-label={`Question ${item.number} right`}>✓</span>))}
  </div>;
}

function ExplanationNotice({ status, onRetry }: { status: QuestionExplanation["status"]; onRetry: () => void }) {
  return <div className="spr-notice" role={status === "retry" ? "alert" : "status"}>
    {status === "loading" ? "Preparing the explanation…" : status === "busy" ? "This explanation is being prepared. Try again shortly."
      : status === "retry" ? "We could not prepare the explanation. You can try again."
        : status === "cap" ? "We cannot prepare more explanations right now. Please try again later."
          : status === "closed" ? <>Explanations are not available while the plan is closed. See your <Link href="/account/plan">plan page</Link>.</>
            : status === "stale" ? "This mark changed. Refresh the page results before going over it."
              : status === "unavailable" ? "An explanation is not available for this question." : ""}
    {(status === "retry" || status === "busy") && <button className="spr-secondary" type="button" onClick={onRetry}>Try explanation again</button>}
  </div>;
}

export function ScanPageResults({ data, photo, parent }: { data: ScanResultsPageData; photo: string; parent?: string }) {
  const [state, dispatch] = useReducer(togetherState, initialTogetherState);
  const [answers, setAnswers] = useState<Record<string, QuestionExplanation>>({});
  const [ended, setEnded] = useState(false);
  const pending = useRef(new Map<string, AbortController>()), attempted = useRef(new Set<string>());
  const heading = useRef<HTMLHeadingElement>(null), initialFocus = useRef(true), nextQuestion = useRef<HTMLButtonElement>(null);
  const begin = useScanContext(parent, photo);
  const reviews = data.questions.filter(question => question.kind === "review");
  const active = state.screen === "together" ? reviews[state.index] : undefined;
  const key = (question: ResultsQuestion) => `${photo}:${question.itemId}:${question.version}`;
  async function load(question: ResultsQuestion, retry = false) {
    const questionKey = `${photo}:${question.itemId}:${question.version}`;
    if (!question.explainable || !question.correctAnswer || pending.current.has(questionKey) || (!retry && attempted.current.has(questionKey))) return;
    const current = begin();
    if (!current()) return;
    attempted.current.add(questionKey);
    const controller = new AbortController();
    pending.current.set(questionKey, controller);
    setAnswers(answers => ({ ...answers, [questionKey]: { status: "loading" } }));
    try {
      const response = await fetch(`/api/account/scans/${encodeURIComponent(photo)}/explanation`, {
        method: "POST", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: question.itemId, version: question.version }),
      });
      const result = resultsExplanationResponse(await response.json(), response.status, question.correctAnswer);
      if (current() && !controller.signal.aborted) setAnswers(answers => ({ ...answers, [questionKey]: result }));
    } catch {
      if (current() && !controller.signal.aborted) setAnswers(answers => ({ ...answers, [questionKey]: { status: "retry" } }));
    } finally { if (pending.current.get(questionKey) === controller) pending.current.delete(questionKey); }
  }
  function open(index: number) {
    dispatch({ type: "open", index });
    if (reviews[index]) void load(reviews[index]);
  }
  function next() {
    dispatch({ type: "next", total: reviews.length });
    if (reviews[state.index + 1]) void load(reviews[state.index + 1]);
  }
  function previous() {
    dispatch({ type: "previous" });
    if (reviews[state.index - 1]) void load(reviews[state.index - 1]);
  }
  useEffect(() => {
    const requests = pending.current;
    const attempts = attempted.current;
    const close = () => { setEnded(true); for (const controller of requests.values()) controller.abort(); };
    const auth = parent ? browserClient().auth.onAuthStateChange((_event, session) => { if (session?.user.id !== parent) close(); }) : null;
    window.addEventListener("pagehide", close);
    return () => {
      for (const [questionKey, controller] of requests) { controller.abort(); attempts.delete(questionKey); }
      requests.clear(); auth?.data.subscription.unsubscribe(); window.removeEventListener("pagehide", close);
    };
  }, [parent, photo]);
  useEffect(() => {
    if (initialFocus.current) { initialFocus.current = false; return; }
    heading.current?.focus();
  }, [state.screen, state.index]);
  const scored = data.questions.filter(question => question.kind === "right" || question.kind === "review");
  const right = scored.filter(question => question.kind === "right").length;
  const score = scored.length ? <p className="spr-score"><strong>{right}</strong> of {scored.length} right</p> : null;
  const context = <p className="spr-context">{data.child}{data.day ? ` · ${data.day}` : ""}{data.page !== null ? ` · Page ${data.page}` : ""}</p>;
  const answer = active ? answers[key(active)] : undefined;
  const explanation = active?.explainable && answer?.status === "ready" ? answer.explanation : undefined;
  const revealed = active ? state.revealed[active.itemId] ?? 0 : 0;
  const showAll = state.mode === "all";
  const stale = answer?.status === "stale";
  if (ended) return <p role="status">This page is closed. Sign in again to see page results.</p>;
  return <section className="spr" aria-label="Page results">
    {state.screen === "results" ? <>
      <h1 ref={heading} tabIndex={-1}>Page results</h1>{context}{score}
      {data.budgetHeld && <p role="status">We cannot check more pages right now.</p>}
      {data.unfinished && <p role="status">Looks unfinished: scan it when it’s done.</p>}
      <figure className="spr-card spr-overview">
        <ResultsPhoto key={data.photo?.src} photo={data.photo} child={data.child} questions={data.questions} onOpen={itemId => open(reviews.findIndex(question => question.itemId === itemId))} />
        <figcaption>{reviewLine(data.questions)}</figcaption>
      </figure>
      {data.photo && !data.photo.aligned && <p className="spr-notice">Page markers are not available for this photo.</p>}
      {reviews.length > 0 && <button className="spr-primary" type="button" onClick={() => open(0)}>Go through it together <span aria-hidden="true">→</span></button>}
      {data.questions.some(question => question.kind === "team") && <div className="spr-waits">{data.questions.filter(question => question.kind === "team").map(question => <p key={question.itemId}>Question {question.number}: Our team is checking this one.</p>)}</div>}
      {data.questions.some(question => question.kind === "pending") && <p role="status">Some answers are not marked yet.</p>}
      {data.questions.some(question => question.kind === "unscored") && <p>Some answers on this page are not scored.</p>}
      {!data.questions.length && <p role="status">Your page is not marked yet.</p>}
    </> : state.screen === "done" ? <div className="spr-card spr-done">
      <span className="spr-done-tick" aria-hidden="true">✓</span><h1 ref={heading} tabIndex={-1}>All done</h1>{context}{score}
      <button className="spr-secondary" type="button" onClick={() => dispatch({ type: "results" })}>Back to page results</button>
    </div> : active && <>
      <button type="button" className="spr-back" onClick={() => dispatch({ type: "results" })}>‹ Back to page results</button>
      <div className="spr-guide-heading"><h1 ref={heading} tabIndex={-1}>Go through it together</h1><p aria-live="polite">{state.index + 1} of {reviews.length}</p></div>{context}
      <div className="spr-card spr-guide">
        <div className="spr-toolbar"><span>Question {active.number}</span>{data.photo?.aligned && questionCrop(active) && <button type="button" className="spr-back" aria-pressed={state.whole} onClick={() => dispatch({ type: "whole" })}>{state.whole ? "Zoom to question" : "See whole page"}</button>}</div>
        <ResultsPhoto key={active.itemId} photo={active.evidencePhoto === photo ? data.photo : active.evidenceImage ?? null} child={data.child} questions={[]} question={active} whole={state.whole} />
        <div className="spr-guide-body" aria-busy={answer?.status === "loading"}>
          {active.questionText && !stale && <h2>{active.questionText}</h2>}
          {!stale && <p className="spr-reading">{data.child} wrote {active.readAnswer?.trim() || "no answer"}{active.correctAnswer && <> · <span>Answer {active.correctAnswer}</span></>}</p>}
          {active.explainable && <div className="spr-modes" role="group" aria-label="Explanation mode">
            <button type="button" aria-pressed={!showAll} onClick={() => dispatch({ type: "mode", mode: "step" })}>Step by step</button>
            <button type="button" aria-pressed={showAll} onClick={() => dispatch({ type: "mode", mode: "all" })}>Show all</button>
          </div>}
          <div aria-live="polite" aria-atomic="false">
            {explanation ? <>
              <ol className="spr-steps">{explanation.steps.slice(0, showAll ? undefined : revealed).map((step, index) => <li key={index}><span aria-hidden="true">{index + 1}</span>{step}</li>)}</ol>
              {(showAll || revealed >= explanation.steps.length) && <div className="spr-say"><p>Say to {data.child}</p><blockquote>{explanation.say}</blockquote></div>}
            </> : active.explainable ? <ExplanationNotice status={answer?.status ?? "loading"} onRetry={() => void load(active, true)} />
              : <p className="spr-notice">An explanation is not available for this question.{!active.correctAnswer && " The correct answer is not available here."}</p>}
          </div>
          {explanation && !showAll && revealed < explanation.steps.length && <button className="spr-primary" type="button" onClick={() => {
            dispatch({ type: "reveal", itemId: active.itemId, total: explanation.steps.length });
            if (revealed + 1 === explanation.steps.length) nextQuestion.current?.focus();
          }}>Show next step</button>}
          {stale && <button className="spr-secondary" type="button" onClick={() => window.location.reload()}>Refresh page results</button>}
        </div>
      </div>
      <nav className="spr-question-nav" aria-label="Questions to go over">
        <button type="button" className="spr-secondary" disabled={state.index === 0} onClick={previous}>‹ Previous</button>
        <button ref={nextQuestion} type="button" className="spr-secondary" onClick={next}>{state.index === reviews.length - 1 ? "Finish" : "Next question ›"}</button>
      </nav>
    </>}
  </section>;
}
