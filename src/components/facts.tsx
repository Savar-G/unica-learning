"use client";

// The timed facts section (#70), in the split desk (D-088, #79): a start screen; then the fact large in the left pane
// with a draining bar and the time, a big number pad in the right pane; it ends with "Time is up!" and the count of
// facts done. The server times the section: the browser gets the
// time left and the facts still to come, shows them without a wait, and sends each answer in order behind the child.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ds";
import type { FactOp, FactsStep, PublicFact } from "@/lib/assessment";
import { FACT_ANSWER_MAX, type FactsStepResult } from "@/lib/facts-api";
import type { TestError } from "@/lib/test-api";
import { track } from "@/lib/track";
import "./test-base.css";
import "./facts.css";

/** How the section ended: the time ran out, or the child answered every fact. */
type FactsEnd = "time_up" | "all_answered";

type View =
  | { name: "loading"; failed: boolean }
  | { name: "ready"; seconds: number }
  | { name: "running"; seconds: number; facts: PublicFact[]; deadline: number }
  | { name: "saving"; reason: FactsEnd }
  /** answered is null when the count could not be read; the child still carries on. */
  | { name: "done"; reason: FactsEnd; answered: number | null };

const OP: Record<FactOp, string> = { "+": "+", "-": "−", "×": "×", "÷": "÷" };
const SAY: Record<FactOp, string> = { "+": "plus", "-": "minus", "×": "times", "÷": "divided by" };

async function call(url: string, init?: RequestInit): Promise<FactsStepResult> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
    return (await res.json()) as FactsStepResult;
  } catch {
    return { ok: false, error: "store_failed" };
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `problem`: the test's error line, shown in the left pane. */
export function FactsSection({ testId, onDone, onError, problem }: { testId: string; onDone: () => void; onError: (e: TestError | null) => void; problem?: ReactNode }) {
  const [view, setView] = useState<View>({ name: "loading", failed: false });
  const base = `/api/account/assessments/${testId}/facts`;
  // Answers wait here and go to the server one at a time, in order, so the server's times follow the child's pace.
  const queue = useRef<{ factId: string; response: string }[]>([]);
  const sending = useRef<Promise<void> | null>(null);
  const tracked = useRef(false);
  // The parent passes new callbacks on each render; keep the latest here so a re-render never reloads the section.
  const props = useRef({ onDone, onError });
  useEffect(() => {
    props.current = { onDone, onError };
  });

  const finishSection = useCallback(async (reason: FactsEnd) => {
    setView({ name: "saving", reason });
    await sending.current;
    const res = await call(base);
    const answered = !res.ok ? null : res.step.status === "ready" ? 0 : res.step.answered;
    if (!tracked.current) {
      tracked.current = true;
      track("test_facts_done", { status: reason });
    }
    setView({ name: "done", reason, answered });
  }, [base]);

  const flush = useCallback(() => {
    if (sending.current) return;
    const run = async () => {
      let failures = 0;
      while (queue.current.length > 0) {
        const head = queue.current[0];
        const res = await call(`${base}/answers`, post(head));
        if (res.ok) {
          failures = 0;
          queue.current.shift();
          if (res.step.status === "done") queue.current = [];
          continue;
        }
        if (res.error === "conflict") {
          // The server is ahead (a retry it already stored) or the time is up: keep only answers it still waits for.
          const next = res.step?.status === "running" ? res.step.facts[0]?.id : undefined;
          const at = next ? queue.current.findIndex((a) => a.factId === next) : -1;
          queue.current = at >= 0 ? queue.current.slice(at) : [];
          // The same answer refused again and again: stop, like any other failure, instead of looping.
          if (at !== 0) continue;
        }
        if (++failures > 3) {
          props.current.onError(res.error);
          queue.current = [];
          break;
        }
        await wait(400 * failures);
      }
    };
    sending.current = run().finally(() => {
      sending.current = null;
    });
  }, [base]);

  const showStep = useCallback((step: FactsStep) => {
    if (step.status === "ready") setView({ name: "ready", seconds: step.seconds });
    // Done before this screen opened (a resumed test): nothing to show, carry on with the test.
    else if (step.status === "done") props.current.onDone();
    else setView({ name: "running", seconds: step.seconds, facts: step.facts, deadline: performance.now() + step.remainingMs });
  }, []);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    call(base).then((res) => {
      if (!live) return;
      if (res.ok) {
        props.current.onError(null);
        showStep(res.step);
      } else {
        props.current.onError(res.error);
        setView({ name: "loading", failed: true });
      }
    });
    return () => {
      live = false;
    };
  }, [base, showStep, attempt]);

  const start = async () => {
    onError(null);
    const res = await call(base, post({}));
    if (res.ok) showStep(res.step);
    else onError(res.error);
  };

  const answer = useCallback((factId: string, response: string) => {
    queue.current.push({ factId, response });
    flush();
  }, [flush]);

  return (
    <div className="test-split facts" data-view={view.name}>
      {view.name === "loading" && (
        <section className="test-pane test-pane-l is-msg" aria-busy={!view.failed}>
          {problem}
          {view.failed && (
            <Button onClick={() => { setView({ name: "loading", failed: false }); setAttempt((n) => n + 1); }}>Try again</Button>
          )}
        </section>
      )}
      {view.name === "ready" && <Ready seconds={view.seconds} onStart={start} problem={problem} />}
      {view.name === "running" && (
        <Running facts={view.facts} seconds={view.seconds} deadline={view.deadline} onAnswer={answer} onEnd={finishSection} problem={problem} />
      )}
      {(view.name === "saving" || view.name === "done") && (
        <section className="test-pane test-pane-l is-msg">
          <p className="test-kicker">Quick facts</p>
          <Heading>{view.reason === "time_up" ? "Time is up!" : "You did every fact!"}</Heading>
          {view.name === "done" ? (
            <p className="test-lead">
              {view.answered !== null && <>You did {view.answered} {view.answered === 1 ? "fact" : "facts"}. </>}Next, the second half of the test.
            </p>
          ) : (
            <p className="test-lead">Saving your answers…</p>
          )}
          {problem}
          <Button onClick={onDone} disabled={view.name !== "done"} aria-busy={view.name === "saving"}>Keep going</Button>
        </section>
      )}
      {view.name !== "running" && <div className="test-pane test-pane-r test-field" aria-hidden />}
    </div>
  );
}

/** A screen heading that takes focus when it appears, so a screen reader starts there. */
function Heading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return <h1 ref={ref} tabIndex={-1} className="test-title">{children}</h1>;
}

function Ready({ seconds, onStart, problem }: { seconds: number; onStart: () => Promise<void>; problem: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const length = seconds === 60 ? "one minute" : `${seconds} seconds`;
  return (
    <section className="test-pane test-pane-l is-msg">
      <p className="test-kicker">Quick facts · {length}</p>
      <Heading>How many can you do in {length}?</Heading>
      <p className="test-lead">Type the answer and press Enter. To skip a fact, press Enter with no answer. Just do your best.</p>
      {problem}
      <Button onClick={async () => { setBusy(true); await onStart(); setBusy(false); }} disabled={busy} aria-busy={busy}>
        {busy ? "Starting…" : "Start"}
      </Button>
    </section>
  );
}

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function Running({ facts, seconds, deadline, onAnswer, onEnd, problem }: {
  facts: PublicFact[];
  seconds: number;
  deadline: number;
  onAnswer: (factId: string, response: string) => void;
  onEnd: (reason: FactsEnd) => void;
  problem: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [entry, setEntry] = useState("");
  const [left, setLeft] = useState(() => Math.max(0, deadline - performance.now()));
  const over = useRef(false);
  const fact = facts[index];
  // Start unmounts the Start button: move focus to the fact, not the page body.
  const factRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => factRef.current?.focus(), []);

  const end = useCallback((reason: FactsEnd) => {
    if (over.current) return;
    over.current = true;
    onEnd(reason);
  }, [onEnd]);

  // The time shown counts down from what the server sent. The server still decides: a late answer is not stored.
  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, deadline - performance.now());
      setLeft(ms);
      if (ms === 0) end("time_up");
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, end]);

  const press = useCallback((key: string) => {
    if (over.current) return;
    setEntry((v) => (key === "back" ? v.slice(0, -1) : v.length >= FACT_ANSWER_MAX ? v : v === "0" ? key : v + key));
  }, []);

  const enter = useCallback(() => {
    if (over.current || !fact) return;
    onAnswer(fact.id, entry);
    setEntry("");
    if (index + 1 >= facts.length) end("all_answered");
    else setIndex(index + 1);
  }, [fact, entry, index, facts.length, onAnswer, end]);

  const enterRef = useRef(enter);
  useEffect(() => {
    enterRef.current = enter;
  });

  // The physical keyboard works the pad too: digits, Backspace, and Enter (also on a focused pad key).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") enterRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const secs = Math.ceil(left / 1000);
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <>
      <section className="test-pane test-pane-l facts-run">
        <div className="facts-clock">
          <div className="facts-bar" aria-hidden><span style={{ width: `${(left / (seconds * 1000)) * 100}%` }} /></div>
          <p className="facts-time"><span className="sr-only">Time left: </span>{time}</p>
        </div>
        {fact && (
          <p className="facts-fact" ref={factRef} tabIndex={-1}>
            <span aria-live="polite">
              <span className="sr-only">{fact.a} {SAY[fact.op]} {fact.b}</span>
              <span aria-hidden>{fact.a} {OP[fact.op]} {fact.b} =</span>
            </span>
            <output className={entry ? "" : "is-empty"} aria-label="Your answer" aria-live="off">{entry || "?"}</output>
          </p>
        )}
        <p className="facts-hint">Press Enter with no answer to skip.</p>
        {problem}
      </section>
      <section className="test-pane test-pane-r facts-padside">
        <div className="facts-pad" role="group" aria-label="Number pad">
          {PAD.map((k) => <button key={k} type="button" onClick={() => press(k)}>{k}</button>)}
          <button type="button" onClick={() => press("back")} aria-label="Delete">⌫</button>
          <button type="button" onClick={() => press("0")}>0</button>
          <button type="button" className="facts-enter" onClick={enter}>Enter</button>
        </div>
      </section>
    </>
  );
}
