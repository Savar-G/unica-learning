"use client";

// The child's test (#64): instructions, one question at a time, the end screen. Plain screens until the chosen
// design (D-088, split desk) lands in #79. Read-aloud, the halfway break and progress (#69) are their own parts
// (test-read-aloud.tsx, test-break.tsx, test-progress.tsx); the whiteboard comes in #67.
// The server marks every answer; the browser gets only the next question and never learns what was right.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, GradientPanel } from "@/ds";
import { breakDue, type PublicQuestion, type TestStep } from "@/lib/assessment";
import { ANSWER_MAX, type FinishResult, type StartResult, type StepResult, type TestError } from "@/lib/test-api";
import { track } from "@/lib/track";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { FactsSection } from "./facts";
import { breakSeen, markBreakSeen, TestBreak } from "./test-break";
import { TestProgress } from "./test-progress";
import { ReadAloud } from "./test-read-aloud";
import "./test.css";

type Screen =
  | { name: "intro" }
  | { name: "question"; question: PublicQuestion; number: number; total: number; breakAfter: number }
  | { name: "break"; next: Extract<TestStep, { status: "question" }> }
  /** The timed facts section (#70), after the halfway break; then the test carries on with `next`. */
  | { name: "facts"; testId: string; next: Extract<TestStep, { status: "question" }> }
  | { name: "done" };

async function call<T>(url: string, init?: RequestInit): Promise<T | { ok: false; error: TestError }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
    return (await res.json()) as T;
  } catch {
    return { ok: false, error: "store_failed" };
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export function TakeTest({ childId, name, total, ready, done }: { childId: string; name: string; total: number; ready: boolean; done: boolean }) {
  const [screen, setScreen] = useState<Screen>(done ? { name: "done" } : { name: "intro" });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<TestError | null>(null);
  const testId = useRef<string | null>(null);
  // Set once the facts section is over (or was over before a resume), so it never shows twice.
  const factsDone = useRef(false);

  const finish = useCallback(async () => {
    const res = await call<FinishResult>(`/api/account/assessments/${testId.current}/finish`, post({}));
    if (!res.ok) {
      track("test_error", { code: res.error, status: "finish" });
      setFailure(res.error);
      return false;
    }
    track("test_finish");
    setScreen({ name: "done" });
    return true;
  }, []);

  /** Shows the step the server sent: the next question, or the end of the test. */
  const show = useCallback(async (step: TestStep) => {
    if (step.status === "complete") return finish();
    // The skippable halfway break (#69) comes once per test, before the first question of the second half.
    const id = testId.current ?? "";
    if (breakDue(step) && !breakSeen(id)) {
      markBreakSeen(id);
      track("test_break", { status: "shown" });
      setScreen({ name: "break", next: step });
      return true;
    }
    // Then the timed facts section (#70, D-088): the break's onDone comes back here. On a resume the facts screen
    // asks the server first and hands straight on to the question when the section is already done.
    if (!factsDone.current && id && step.number > step.breakAfter) {
      setScreen({ name: "facts", testId: id, next: step });
      return true;
    }
    setScreen({ name: "question", question: step.question, number: step.number, total: step.total, breakAfter: step.breakAfter });
    return true;
  }, [finish]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const started = await call<StartResult>("/api/account/assessments", post({ childId }));
    if (!started.ok) {
      track("test_error", { code: started.error, status: "start" });
      setFailure(started.error);
      setBusy(false);
      return;
    }
    testId.current = started.id;
    track("test_start", { status: started.resumed ? "resumed" : "new" });
    const res = await call<StepResult>(`/api/account/assessments/${started.id}`);
    if (res.ok) await show(res.step);
    else setFailure(res.error);
    setBusy(false);
  };

  /** Sends one answer. Resolves false when it failed and the child should try again. */
  const answer = async (questionId: string, response: string, timeMs: number) => {
    setFailure(null);
    const res = await call<StepResult>(`/api/account/assessments/${testId.current}/answers`, post({ questionId, response, timeMs }));
    if (res.ok) return show(res.step);
    // Another tab or a retry answered first: carry on from where the server is.
    if (res.error === "conflict" && "step" in res && res.step) return show(res.step);
    track("test_error", { code: res.error, status: "answer" });
    setFailure(res.error);
    return false;
  };

  return (
    <div className="look-root test-root" data-look="warm">
      <header className="test-top">
        <span className="logo">Unica Learning<b /></span>
        {screen.name === "question" && <TestProgress answered={screen.number - 1} total={screen.total} breakAfter={screen.breakAfter} at="question" />}
        {screen.name === "break" && <TestProgress answered={screen.next.breakAfter} total={screen.next.total} breakAfter={screen.next.breakAfter} at="halfway" />}
        {screen.name === "facts" && <TestProgress answered={screen.next.number - 1} total={screen.next.total} breakAfter={screen.next.breakAfter} at="halfway" />}
      </header>
      <main id="main" className="test-main">
        {screen.name === "intro" && <Intro name={name} total={total} ready={ready} busy={busy} onStart={start} failure={failure} />}
        {screen.name === "question" && (
          <Question key={screen.question.id} question={screen.question} last={screen.number === screen.total} onAnswer={answer} failure={failure} />
        )}
        {screen.name === "break" && (
          <TestBreak name={name} answered={screen.next.breakAfter} total={screen.next.total} onDone={(how) => {
            track("test_break", { status: how });
            void show(screen.next);
          }} />
        )}
        {screen.name === "facts" && (
          <>
            <FactsSection testId={screen.testId} onError={setFailure} onDone={() => { factsDone.current = true; void show(screen.next); }} />
            <Problem error={failure} />
          </>
        )}
        {screen.name === "done" && <End name={name} />}
      </main>
    </div>
  );
}

function Problem({ error }: { error: TestError | null }) {
  if (!error) return null;
  const text =
    error === "signed_out" ? <>The sign-in ended. Ask your grown-up to <Link href="/sign-in">sign in</Link> again. Your earlier answers are saved.</>
    : error === "not_ready" ? "The test for this grade is not ready yet."
    : <>Something went wrong. Check the internet connection and try again. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
  return <p role="alert" className="test-alert">{text}</p>;
}

function Intro({ name, total, ready, busy, onStart, failure }: { name: string; total: number; ready: boolean; busy: boolean; onStart: () => void; failure: TestError | null }) {
  if (!ready) {
    return (
      <section className="test-card">
        <h1>The test for {name}&apos;s grade is not ready yet.</h1>
        <p>The test is open for grades 1 to 5 now. We are writing the questions for the other grades.</p>
        <Link className="btn ghost" href="/account">Back to your account</Link>
      </section>
    );
  }
  return (
    <section className="test-card">
      <p className="eyebrow">Math test · {total} questions</p>
      <h1>Hi {name}! Before you start:</h1>
      <ul className="test-rules">
        <li><b>No calculator.</b> Work the answers out yourself.</li>
        <li><b>No help from a parent.</b> Do the test on your own. Grown-ups, please let your child work alone.</li>
        <li><b>Use the whiteboard for your working.</b> Do not use scrap paper.</li>
      </ul>
      <p>Answer one question at a time. You cannot go back, so check each answer before you press Next. If you do not know an answer, make your best guess.</p>
      <Problem error={failure} />
      <Button onClick={onStart} disabled={busy} aria-busy={busy}>{busy ? "Starting…" : "Start the test"}</Button>
    </section>
  );
}

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

function Question({ question, last, onAnswer, failure }: { question: PublicQuestion; last: boolean; onAnswer: (id: string, response: string, timeMs: number) => Promise<boolean>; failure: TestError | null }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  // Time on the question runs from when it appears to when the child presses Next.
  const shownAt = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    shownAt.current = performance.now();
    heading.current?.focus();
  }, []);

  const press = useCallback((key: string) => {
    setValue((v) => {
      if (key === "back") return v.slice(0, -1);
      if (v.length >= ANSWER_MAX || (key === "." && v.includes("."))) return v;
      return v === "0" && key !== "." ? key : v + key;
    });
  }, []);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!value || sending) return;
    setSending(true);
    const ok = await onAnswer(question.id, value, performance.now() - shownAt.current);
    // On success this question unmounts; on failure the child keeps the answer and can press Next again.
    if (!ok) setSending(false);
  };

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  // The physical keyboard works the number pad too, and Enter means Next.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Enter on a focused pad key would press that key again; on the pad it means Next, as elsewhere.
      const target = e.target instanceof Element ? e.target : null;
      const onOtherButton = !!target?.closest("button, a") && !target?.closest(".test-pad");
      if (e.key === "Enter" && !onOtherButton) submitRef.current();
      else if (question.format !== "number") return;
      else if (/^[0-9.]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question.format, press]);

  return (
    <form className="test-q" onSubmit={submit}>
      <div className="test-qrow">
        <ReadAloud key={question.id} text={question.readAloud} />
        <h1 ref={heading} tabIndex={-1} className="test-prompt">{question.prompt}</h1>
      </div>
      {question.format === "choice" ? (
        <div className="test-choices" role="radiogroup" aria-label="Choose one answer">
          {(question.choices ?? []).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={value === c} className="test-choice" onClick={() => setValue(c)}>
              <span className="test-dot" aria-hidden />
              {c}
            </button>
          ))}
        </div>
      ) : (
        <div className="test-num">
          <output className="test-display" aria-live="polite" aria-label="Your answer">{value || <i>Type your answer</i>}</output>
          <div className="test-pad" role="group" aria-label="Number pad">
            {PAD_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => press(k)} aria-label={k === "." ? "Decimal point" : undefined}>{k}</button>
            ))}
            <button type="button" onClick={() => press("back")} aria-label="Delete">⌫</button>
          </div>
        </div>
      )}
      <Problem error={failure} />
      <div className="test-next">
        <Button type="submit" disabled={!value || sending} aria-busy={sending}>{last ? "Finish" : "Next"}</Button>
      </div>
    </form>
  );
}

function End({ name }: { name: string }) {
  return (
    <GradientPanel className="test-end">
      <p className="eyebrow">All done</p>
      <h2>You did it, {name}!</h2>
      <p>Thank you for working so hard. Your report will be emailed to your grown-up shortly.</p>
      <p className="small"><Link href="/account">Back to the account</Link></p>
    </GradientPanel>
  );
}
