"use client";

// The child's test (#64), in the split desk (D-088, #79): the start screen, one question at a time, the end screen.
// Read-aloud, the halfway break and progress (#69) are their own parts (test-read-aloud.tsx, test-break.tsx,
// test-progress.tsx); the whiteboard (#67) is whiteboard.tsx, beside each question; quick facts (#70) is facts.tsx.
// The server marks every answer; the browser gets only the next question and never learns what was right.
// Shared CSS first, so each screen's own CSS comes later and wins (test-base.css).
import "./test-base.css";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/ds";
import { breakDue, hasWork, readAloudText, spokenChoices, type HelpAnswer, type PublicQuestion, type TestStep } from "@/lib/assessment";
import { ANSWER_MAX, type FinishResult, type StartResult, type StepResult, type TestError, type WorkPayload } from "@/lib/test-api";
import { answerRecorder, type AnswerEvents } from "@/lib/answer-events";
import { deviceOf, type BreakEvent, type BreakResume, type ContextResult, type TestDevice } from "@/lib/test-context";
import { track } from "@/lib/track";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { draftKey, draftPrefix, emptyBoard, hasDrawing, type BoardState } from "@/lib/whiteboard";
import { FactsSection } from "./facts";
import { breakSeen, loadBreak, markBreakSeen, saveBreak, TestBreak } from "./test-break";
import { Choices } from "./test-choices";
import { BarGraph, ChoiceFace, PromptText } from "./test-figures";
import { TestHelp } from "./test-help";
import { TestProgress } from "./test-progress";
import { ReadAloud, warmUpVoices } from "./test-read-aloud";
import { Whiteboard, boardImage, clearDrafts, loadDraft, saveDraft, type BoardSize } from "./whiteboard";
import "./test.css";

type Screen =
  | { name: "intro" }
  /** `testId` keys the saved whiteboard of the question (#67). */
  | { name: "question"; question: PublicQuestion; number: number; total: number; breakAfter: number; testId: string }
  | { name: "break"; next: Extract<TestStep, { status: "question" }> }
  /** The timed facts section (#70), after the halfway break; then the test carries on with `next`. */
  | { name: "facts"; testId: string; next: Extract<TestStep, { status: "question" }> }
  /** "Did anyone help?" (#71): after the last question; its answer goes with the finish request. */
  | { name: "help" }
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

/** #185: one record of the test context (the device, or a break event). The screen never waits for it. */
const sendContext = (testId: string, body: { device: TestDevice } | { break: "shown" } | { break: Exclude<BreakEvent, "shown">; lengthMs: number }) =>
  call<ContextResult>(`/api/account/assessments/${testId}/context`, post(body));

/** What this browser says about its device (#185), with the pointer types used on the page so far. */
function browserDevice(pointers: readonly string[]): TestDevice {
  const media = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
  return deviceOf({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
    pointers,
    mainPointer: media("(pointer: coarse)") ? "coarse" : media("(pointer: fine)") ? "fine" : null,
  });
}

/**
 * #72: "resume" continues the open test where it stopped; "finish" sends a test whose answers are all in but that was
 * never scored; "restart" draws a new one after a test ran out of time.
 */
export type StartMode = "new" | "resume" | "finish" | "restart";

/**
 * `typing`: the whiteboard has a text box (grades 3-7); grades 1-2 draw only (#67). `breakAfter`: questions before the
 * halfway ring, for the progress on the help and end screens (the band's stage 1).
 */
export function TakeTest({ childId, name, total, breakAfter, ready, done, mode: firstMode = "new", typing = true }: { childId: string; name: string; total: number; breakAfter: number; ready: boolean; done: boolean; mode?: StartMode; typing?: boolean }) {
  const [screen, setScreen] = useState<Screen>(done ? { name: "done" } : { name: "intro" });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<TestError | null>(null);
  const [mode, setMode] = useState<StartMode>(firstMode);
  const testId = useRef<string | null>(null);
  // Set once the facts section is over (or was over before a resume), so it never shows twice.
  const factsDone = useRef(false);
  // #185: the pointer types the child used on this page (a finger, a pen or a mouse), each once, the latest last.
  const pointers = useRef<string[]>([]);
  // #185: when the break screen showed (performance.now()), for the break's length. The end goes at once with it, and
  // never waits on the "shown" request: a slow save must not make the break longer.
  const breakShownAt = useRef<number | null>(null);

  // The voices for "read it to me" load while the child reads the start screen, so the button is there with question 1.
  useEffect(() => warmUpVoices(), []);

  useEffect(() => {
    const seen = (e: PointerEvent) => {
      if (e.pointerType) pointers.current = [...pointers.current.filter((p) => p !== e.pointerType), e.pointerType];
    };
    window.addEventListener("pointerdown", seen, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", seen, { capture: true });
  }, []);

  /** The open test ran out of time (#72): back to the start, where the next test has new questions. */
  const expire = useCallback(() => {
    setMode("restart");
    setFailure("expired");
    setScreen({ name: "intro" });
    return false;
  }, []);

  // A stop (#72): the tab closes or the connection drops during a question, the break or quick facts. The answers so far are saved on the server.
  const asking = screen.name === "question" || screen.name === "break" || screen.name === "facts" || screen.name === "help";
  useEffect(() => {
    if (!asking) return;
    // The page is going away: a beacon still goes out. Offline: PostHog queues the event and retries once back online.
    const closed = () => track("test_stop", { status: "closed" }, { beacon: true });
    const offline = () => track("test_stop", { status: "offline" });
    window.addEventListener("pagehide", closed, { once: true });
    window.addEventListener("offline", offline, { once: true });
    return () => {
      window.removeEventListener("pagehide", closed);
      window.removeEventListener("offline", offline);
    };
  }, [asking]);

  const finish = useCallback(async (help: HelpAnswer) => {
    setFailure(null);
    const res = await call<FinishResult>(`/api/account/assessments/${testId.current}/finish`, post({ help }));
    if (!res.ok) {
      track("test_error", { code: res.error, status: "finish" });
      if (res.error === "expired") return expire();
      setFailure(res.error);
      return false;
    }
    track("test_finish");
    // #67: no saved whiteboard of this test is needed any more.
    const finished = testId.current;
    if (finished) clearDrafts((key) => key.startsWith(draftPrefix(finished)));
    setScreen({ name: "done" });
    return true;
  }, [expire]);

  /** Shows the step the server sent: the next question, or the end of the test. */
  const show = useCallback(async (step: TestStep, resume?: BreakResume) => {
    // Every answer is in: "Did anyone help?" (#71) comes last, and its Finish sends the test.
    if (step.status === "complete") {
      setScreen({ name: "help" });
      return true;
    }
    // The skippable halfway break (#69) comes once per test, before the first question of the second half.
    const id = testId.current ?? "";
    const saved = loadBreak(id);
    if (resume?.ended || saved?.end) {
      markBreakSeen(id);
    }
    const unfinished = resume && !resume.ended && !saved?.end;
    if ((unfinished && step.number > step.breakAfter) || (breakDue(step) && !breakSeen(id))) {
      track("test_break", { status: "shown" });
      // Keep the browser's original start across a reload. Within a page use its monotonic clock, never the save
      // response. On another browser the server's saved start is the available duration basis.
      const startedAt = saved?.startedAt ?? resume?.startedAt ?? Date.now();
      saveBreak(id, { startedAt, end: null });
      breakShownAt.current = performance.now() - Math.max(0, Date.now() - startedAt);
      void sendContext(id, { break: "shown" });
      setScreen({ name: "break", next: step });
      return true;
    }
    // Then the timed facts section (#70, D-088): the break's onDone comes back here. On a resume the facts screen
    // asks the server first and hands straight on to the question when the section is already done.
    if (!factsDone.current && id && step.number > step.breakAfter) {
      setScreen({ name: "facts", testId: id, next: step });
      return true;
    }
    setScreen({ name: "question", question: step.question, number: step.number, total: step.total, breakAfter: step.breakAfter, testId: id });
    return true;
  }, []);

  /**
   * After the quick facts, the first question after halfway (#184): the screen asks the server for the step again, so
   * the server records when the question really appears. When that request fails, the question the screen holds shows.
   */
  const afterFacts = useCallback(async (held: Extract<TestStep, { status: "question" }>) => {
    const res = await call<StepResult>(`/api/account/assessments/${testId.current}`);
    if (res.ok) return show(res.step);
    if (res.error === "expired") return expire();
    return show(held);
  }, [show, expire]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const started = await call<StartResult>("/api/account/assessments", post({ childId, restart: mode === "restart" }));
    if (!started.ok) {
      track("test_error", { code: started.error, status: "start" });
      if (started.error === "expired") setMode("restart");
      setFailure(started.error);
      setBusy(false);
      return;
    }
    testId.current = started.id;
    // #185: the device, once per test (the server keeps the first), with the pointer that pressed Start.
    void sendContext(started.id, { device: browserDevice(pointers.current) });
    // #67: saved whiteboards of older tests (one that ran out of time) go; this test's stay for a resume.
    clearDrafts((key) => !key.startsWith(draftPrefix(started.id)));
    if (started.resumed) track("test_resume");
    else track("test_start", { status: mode === "restart" ? "restart" : "new" });
    const res = await call<StepResult>(`/api/account/assessments/${started.id}`);
    if (res.ok) {
      // A captured end survived a reload while its request was pending. Resend the same value once on resume.
      const saved = loadBreak(started.id);
      if (!res.break?.ended && saved?.end) void sendContext(started.id, { break: saved.end.event, lengthMs: saved.end.lengthMs });
      await show(res.step, res.break);
    }
    else if (res.error === "expired") expire();
    else setFailure(res.error);
    setBusy(false);
  };

  /**
   * Sends one answer, with the whiteboard work (#67) and what the child did before Next (#184). Resolves false when it
   * failed and the child should try again.
   */
  const answer = async (questionId: string, response: string, timeMs: number, work?: WorkPayload, events?: AnswerEvents) => {
    setFailure(null);
    const res = await call<StepResult>(`/api/account/assessments/${testId.current}/answers`, post({ questionId, response, timeMs, work, events }));
    if (res.ok) return show(res.step);
    // Another tab or a retry answered first: carry on from where the server is.
    if (res.error === "conflict" && "step" in res && res.step) return show(res.step);
    track("test_error", { code: res.error, status: "answer" });
    if (res.error === "expired") return expire();
    setFailure(res.error);
    return false;
  };

  return (
    <div className="look-root test-root" data-look="warm">
      <header className="test-top">
        <span className="logo">Unica Learning<b /></span>
        {screen.name === "question" && <TestProgress answered={screen.number - 1} total={screen.total} breakAfter={screen.breakAfter} at="question" />}
        {screen.name === "break" && <TestProgress answered={screen.next.breakAfter} total={screen.next.total} breakAfter={screen.next.breakAfter} at="halfway" />}
        {screen.name === "facts" && <TestProgress answered={screen.next.number - 1} total={screen.next.total} breakAfter={screen.next.breakAfter} at="facts" />}
        {(screen.name === "help" || screen.name === "done") && <TestProgress answered={total} total={total} breakAfter={breakAfter} at={screen.name === "help" ? "help" : "end"} />}
      </header>
      <main id="main" className="test-main">
        {screen.name === "intro" && <Intro name={name} total={total} ready={ready} busy={busy} onStart={start} failure={failure} mode={mode} />}
        {screen.name === "question" && (
          <Question key={screen.question.id} testId={screen.testId} typing={typing} question={screen.question} last={screen.number === screen.total} onAnswer={answer} failure={failure} />
        )}
        {screen.name === "break" && (
          <TestBreak name={name} answered={screen.next.breakAfter} total={screen.next.total} onDone={(how) => {
            track("test_break", { status: how });
            // #185: how the break ended and how long it lasted on this screen, sent at once.
            const id = testId.current;
            const shownAt = breakShownAt.current;
            if (id && shownAt !== null) {
              const lengthMs = Math.round(performance.now() - shownAt);
              saveBreak(id, { startedAt: loadBreak(id)?.startedAt ?? Date.now() - lengthMs, end: { event: how, lengthMs } });
              markBreakSeen(id);
              void sendContext(id, { break: how, lengthMs });
            }
            void show(screen.next);
          }} />
        )}
        {screen.name === "facts" && (
          <FactsSection testId={screen.testId} problem={<Problem error={failure} />} onError={setFailure} onDone={() => { factsDone.current = true; void afterFacts(screen.next); }} />
        )}
        {screen.name === "help" && (
          <TestHelp problem={<Problem error={failure} />} onAnswer={async (help) => {
            const sent = await finish(help);
            // Once per test, when it is stored. Only the answer category goes to analytics: no name and no grade.
            if (sent) track("test_help", { status: help });
            return sent;
          }} />
        )}
        {screen.name === "done" && <End name={name} total={total} />}
      </main>
    </div>
  );
}

function Problem({ error }: { error: TestError | null }) {
  // A pane that scrolls (a long question) could hide a new error line under Next: bring it into view.
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // A block body: scrollIntoView returns a Promise in newer browsers, and an effect may return only a clean-up.
    line.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);
  if (!error) return null;
  const text =
    error === "signed_out" ? <>The sign-in ended. Ask your grown-up to <Link href="/sign-in">sign in</Link> again. Your earlier answers are saved.</>
    : error === "not_ready" ? "The test for this grade is not ready yet."
    : error === "expired" ? "The last test was not finished within 24 hours, so it closed."
    : error === "retake_closed" ? <>A new test opens 30 days after the last one. <Link href="/account">Your account</Link> shows the date.</>
    : error === "work_required" ? "Show your work on the whiteboard, then press Next."
    : error === "work_too_big" ? "Your work is too big to save. Clear some of it, then press Next again."
    : <>Something went wrong. Check the internet connection and try again. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
  return <p ref={line} role="alert" className="test-alert">{text}</p>;
}

function Intro({ name, total, ready, busy, onStart, failure, mode }: { name: string; total: number; ready: boolean; busy: boolean; onStart: () => void; failure: TestError | null; mode: StartMode }) {
  if (!ready) {
    return (
      <MessageScreen>
        <p className="test-kicker">Math test</p>
        <h1 className="test-title">The test for {name}&apos;s grade is not ready yet.</h1>
        <p className="test-lead">The test is open for grades 1 to 5 now. We are writing the questions for the other grades.</p>
        <Link className="btn ghost" href="/account">Back to your account</Link>
      </MessageScreen>
    );
  }
  if (mode === "finish") {
    return (
      <MessageScreen>
        <p className="test-kicker">Math test · {total} questions</p>
        <h1 className="test-title">All your answers are in, {name}!</h1>
        <p className="test-lead">The test was not sent yet. Answer one last question to send it.</p>
        <Problem error={failure} />
        <Button onClick={onStart} disabled={busy} aria-busy={busy}>{busy ? "Opening…" : "Continue"}</Button>
      </MessageScreen>
    );
  }
  return (
    <MessageScreen className="test-intro">
      <p className="test-kicker">Math test · {total} questions</p>
      <h1 className="test-title">{mode === "resume" ? `Welcome back, ${name}! Before you go on:` : `Hi ${name}! Before you start:`}</h1>
      <ul className="test-rules">
        <li><b>No calculator.</b> Work the answers out yourself.</li>
        <li><b>No help from a parent.</b> Do the test on your own. Grown-ups, please let your child work alone.</li>
        <li><b>Use the whiteboard for your working.</b> Do not use scrap paper. Some questions ask you to show your work there.</li>
      </ul>
      {mode === "resume"
        ? <p className="test-intro-note">Your answers are saved. You go on from the question where you stopped. You cannot go back, so check each answer before you press Next.</p>
        : <p className="test-intro-note">Answer one question at a time. You cannot go back, so check each answer before you press Next. If you do not know an answer, make your best guess.</p>}
      <Problem error={failure} />
      {mode === "restart" && <p className="test-intro-note">This is a new test, with new questions.</p>}
      <Button onClick={onStart} disabled={busy} aria-busy={busy}>{busy ? "Starting…" : mode === "resume" ? "Continue the test" : "Start the test"}</Button>
    </MessageScreen>
  );
}

/** A screen of words in the split desk: the message in the left pane, the colour field on the right (D-088). */
function MessageScreen({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`test-split ${className}`.trim()}>
      <div className="test-pane test-pane-l is-msg">{children}</div>
      <div className="test-pane test-pane-r test-field" aria-hidden />
    </section>
  );
}

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

interface QuestionProps {
  testId: string;
  /** Grades 3-7 can type on the whiteboard; grades 1-2 draw only (#67). */
  typing: boolean;
  question: PublicQuestion;
  last: boolean;
  onAnswer: (id: string, response: string, timeMs: number, work?: WorkPayload, events?: AnswerEvents) => Promise<boolean>;
  failure: TestError | null;
}

// One question in the split desk (D-088): the question and the answer on the left, the whiteboard on the right.
function Question({ testId, typing, question, last, onAnswer, failure }: QuestionProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  // Time on the question runs from when it appears to when the child presses Next.
  const shownAt = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    shownAt.current = performance.now();
    heading.current?.focus();
  }, []);

  // #184: what the child does before Next, from when the question appears: each answer change, each "Read it to me",
  // and each time the tab is hidden (another tab or app in front) with how long.
  const [recorder] = useState(answerRecorder);
  const recordedValue = useRef("");
  useEffect(() => {
    if (value === recordedValue.current) return;
    recordedValue.current = value;
    recorder.change(value, performance.now() - shownAt.current);
  }, [value, recorder]);
  useEffect(() => {
    const at = () => performance.now() - shownAt.current;
    const onVisibility = () => (document.hidden ? recorder.hidden(at()) : recorder.visible(at()));
    if (document.hidden) recorder.hidden(at());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [recorder]);
  const onRead = useCallback(() => recorder.readAloud(performance.now() - shownAt.current), [recorder]);

  // #67: the whiteboard. A resume of this question on this device brings back the work from before the stop (#72).
  const draft = draftKey(testId, question.id);
  const [board, setBoard] = useState<BoardState>(() => (testId ? loadDraft(draft) : null) ?? emptyBoard());
  const boardSize = useRef<BoardSize>({ width: 0, height: 0 });
  const onBoardSize = useCallback((size: BoardSize) => {
    boardSize.current = size;
  }, []);
  const stored = useRef(false);
  useEffect(() => {
    if (!testId) return;
    const t = window.setTimeout(() => {
      if (!stored.current) saveDraft(draft, board);
    }, 250);
    return () => window.clearTimeout(t);
  }, [testId, draft, board]);

  // The strokes that turned out to be an empty picture (the eraser took every line): no drawing until the child draws again.
  const [erased, setErased] = useState<BoardState["strokes"] | null>(null);
  const drawn = hasDrawing(board.strokes) && erased !== board.strokes;
  const text = typing ? board.text : "";
  // On a show-your-work question, Next stays off until there is an answer and the board has work (D-088).
  const needsWork = question.showWork && !hasWork({ drawn, text });
  const nudge = !!value && needsWork;
  const nudged = useRef(false);
  useEffect(() => {
    if (!nudge || nudged.current) return;
    nudged.current = true;
    track("test_work_nudge");
  }, [nudge]);

  const press = useCallback((key: string) => {
    setValue((v) => {
      if (key === "back") return v.slice(0, -1);
      if (v.length >= ANSWER_MAX || (key === "." && v.includes("."))) return v;
      return v === "0" && key !== "." ? key : v + key;
    });
  }, []);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!value || sending || needsWork) return;
    setSending(true);
    const timeMs = performance.now() - shownAt.current;
    let image: string | null = null;
    let blank = false;
    try {
      image = await boardImage(board.strokes, boardSize.current);
      blank = drawn && image === null;
    } catch {
      // The browser could not make the picture: the answer goes without it, and the server says if work is missing.
    }
    const typed = text.trim();
    if (blank) setErased(board.strokes);
    // Everything was erased on a show-your-work question: the board is empty, so the nudge comes back instead of Next.
    if (question.showWork && blank && !typed) {
      setSending(false);
      return;
    }
    const work: WorkPayload | undefined = image || typed ? { ...(image ? { image } : {}), ...(typed ? { text: typed } : {}) } : undefined;
    const ok = await onAnswer(question.id, value, timeMs, work, recorder.events(timeMs));
    // On success this question unmounts; on failure the child keeps the answer and the work, and can press Next again.
    if (!ok) {
      setSending(false);
      return;
    }
    stored.current = true;
    saveDraft(draft, emptyBoard());
    if (work) track("test_work", { status: question.showWork ? "required" : "optional", channel: image && typed ? "both" : image ? "draw" : "type" });
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
      // Typing on the whiteboard (#67): every key, Enter too, belongs to the text box.
      if (target?.closest("textarea, input, [contenteditable]")) return;
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

  // "Read it to me" reads the choices in the order of the rows on screen (#79): the core shuffles them.
  const shown = question.format === "choice" ? question.choices ?? [] : [];
  const spoken = readAloudText(question, shown);
  const names = spokenChoices(question, shown);

  return (
    <form className="test-split test-desk" onSubmit={submit}>
      <div className="test-pane test-pane-l">
        <div className="test-qrow">
          <ReadAloud key={question.id} text={spoken} onRead={onRead} />
          <h1 id="test-q-title" ref={heading} tabIndex={-1} className="test-prompt"><PromptText text={question.prompt} /></h1>
        </div>
        {question.figure?.kind === "bars" && <BarGraph figure={question.figure} />}
        {question.format === "choice" ? (
          <Choices options={shown.map((c, i) => ({ value: c, label: <ChoiceFace text={c} />, name: names[i] }))} value={value || null} onChange={setValue} labelledBy="test-q-title" />
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
          <p className="test-why" aria-live="polite">{nudge ? "Now show your work on the board" : ""}</p>
          <Button type="submit" disabled={!value || sending || needsWork} aria-busy={sending}>{last ? "Finish" : "Next"}</Button>
        </div>
      </div>
      <div className="test-pane test-pane-r">
        <Whiteboard board={board} onChange={setBoard} typing={typing} required={question.showWork} nudge={nudge} onSize={onBoardSize} />
      </div>
    </form>
  );
}

/** The end (D-088): a full colour field. */
function End({ name, total }: { name: string; total: number }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="test-end test-field" aria-labelledby="test-end-title">
      <div>
        <p className="test-kicker">All {total} done</p>
        <h1 id="test-end-title" ref={heading} tabIndex={-1} className="test-title">You did it, {name}!</h1>
        <p className="test-lead">Thank you for working so hard. Your report will be emailed to your grown-up shortly.</p>
        <p className="test-end-link"><Link href="/account">Back to the account</Link></p>
      </div>
    </section>
  );
}
