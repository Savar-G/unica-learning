"use client";

// The child's test (#64), in the split desk (D-088, #79): the start screen, one question at a time, the end screen.
// Read-aloud, the halfway break and progress (#69) are their own parts (test-read-aloud.tsx, test-break.tsx,
// test-progress.tsx); the whiteboard (#67) is whiteboard.tsx, beside each question; quick facts (#70) is facts.tsx.
// The server marks every answer; the browser gets only the next question and never learns what was right.
// Shared CSS first, so each screen's own CSS comes later and wins (test-base.css).
import "./test-base.css";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/ds";
import { breakDue, readAloudText, spokenChoices, type AnsweredQuestion, type HelpAnswer, type PublicQuestion, type TestStep } from "@/lib/assessment";
import { ANSWER_MAX, type FinishResult, type StartResult, type StepResult, type TestError, type WorkPayload } from "@/lib/test-api";
import { answerRecorder, mergeEvents, type AnswerEvents } from "@/lib/answer-events";
import { deviceOf, type BreakEvent, type BreakResume, type ContextResult, type TestDevice } from "@/lib/test-context";
import { track } from "@/lib/track";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { draftKey, draftPrefix, emptyBoard, hasDrawing, openMode, type BoardState } from "@/lib/whiteboard";
import { fitStrokes, recordStrokes, storedBoard, type StoredWork } from "@/lib/strokes";
import { leaveDestination, questionButtons, type LeaveAction, type QuestionButtons } from "@/lib/test-review";
import { FactsSection } from "./facts";
import { breakSeen, loadBreak, markBreakSeen, saveBreak, TestBreak } from "./test-break";
import { Choices } from "./test-choices";
import { BarGraph, ChoiceFace, PromptText } from "./test-figures";
import { TestHelp } from "./test-help";
import { TestProgress } from "./test-progress";
import { BackLabel, NextLabel, TestCheck, TestSteps } from "./test-steps";
import { ReadAloud, warmUpVoices } from "./test-read-aloud";
import { Whiteboard, boardImage, clearDrafts, loadDraft, saveDraft, type BoardSize } from "./whiteboard";
import "./test.css";

type Screen =
  | { name: "intro" }
  /** `testId` keys the saved whiteboard of the question (#67). */
  | { name: "question"; question: PublicQuestion; number: number; total: number; breakAfter: number; testId: string; takeYourTime: boolean }
  /** #253: "Check your answers" at the end of a part: its question numbers; "Done checking" goes on. */
  | { name: "check"; section: "stage1" | "stage2"; numbers: number[]; total: number; breakAfter: number; testId: string }
  | { name: "break"; next: Extract<TestStep, { status: "question" }> }
  /** The timed facts section (#70), after the halfway break; then the test carries on with `next`. */
  | { name: "facts"; testId: string; next: Extract<TestStep, { status: "question" }> }
  /** "Did anyone help?" (#71): after the last question; its answer goes with the finish request. */
  | { name: "help" }
  | { name: "done"; testId?: string };

async function call<T>(url: string, init?: RequestInit): Promise<T | { ok: false; error: TestError }> {
  try {
    const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
    return (await res.json()) as T;
  } catch {
    return { ok: false, error: "store_failed" };
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/**
 * #249: one visit of a question, as the question hands it over when the child leaves it: the answer on the screen ("" when
 * none), the time and events of the visit, the work, and whether the child drew or typed in this visit.
 */
interface Visit {
  questionId: string;
  response: string;
  timeMs: number;
  events: AnswerEvents;
  work?: WorkPayload;
  workChanged: boolean;
  /** The whiteboard as the child left it, on an answered question: a failed save puts it back on the board. */
  board?: BoardState;
}

/** #249: how the child leaves a question; `leaveDestination` (src/lib/test-review.ts) says where it goes. */
type Target = LeaveAction;

/** #249: a failed save moves the screen; every other way of leaving is the child's. */
const reopening = (to: Target): to is { reopen: number } => typeof to === "object" && "reopen" in to;

/** #249: what leaving did: "saved" (the answer went to the server, or is on its way), "kept" (nothing to save: the visit stays in this browser), or false (the child stays). */
type Left = "saved" | "kept" | false;

/** Time and events of visits that are not saved yet: they go with the question's next save. */
type Carry = { ms: number; events: AnswerEvents };

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
 * `typing`: the whiteboard has a text box (grades 3-9); Kindergarten to grade 2 draw only (#67). `breakAfter`: questions
 * before the halfway ring, for the progress on the help and end screens (the band's stage 1). `readFirst` (D-156,
 * Kindergarten): the voice reads each new question as it opens (readsAloudFirst).
 */
export function TakeTest({ childId, name, breakAfter, ready, done, mode: firstMode = "new", typing = true, afterBreak = false, checkGrid = false, readFirst = false }: { childId: string; name: string; breakAfter: number; ready: boolean; done: boolean; mode?: StartMode; typing?: boolean; afterBreak?: boolean; checkGrid?: boolean; readFirst?: boolean }) {
  const [screen, setScreen] = useState<Screen>(done ? { name: "done" } : { name: "intro" });
  const [progress, setProgress] = useState<{ total: number; breakAfter: number } | null>(null);
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
  // #249: Back. The open section's answered questions, as the step brought them and the child changed them since, and
  // the one on the screen (null: the newest question, `screen.question`). Each visit mounts the question again.
  const [answered, setAnswered] = useState<AnsweredQuestion[]>([]);
  const answeredRef = useRef<AnsweredQuestion[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  // The questions the child marked to check again, by number. Kept in this browser tab only: never sent or scored.
  const [marks, setMarks] = useState<ReadonlySet<number>>(() => new Set());
  const toggleMark = (n: number) => {
    const id = testId.current;
    setMarks((prev) => {
      const next = new Set(prev);
      if (!next.delete(n)) next.add(n);
      if (id) saveMarks(id, next);
      return next;
    });
  };
  const viewingRef = useRef<number | null>(null);
  const [visit, setVisit] = useState(0);
  // Time and events of visits not saved yet, and the newest question's answer when a failed save moved the screen.
  const carry = useRef(new Map<string, Carry>());
  const [held, setHeld] = useState<Readonly<Record<string, string>>>({});
  // The new work of an answered question whose save failed: it goes back on the board when the question opens again.
  const [unsaved, setUnsaved] = useState<Readonly<Record<string, BoardState>>>({});
  const setUnsavedWork = (questionId: string, board: BoardState | null) =>
    setUnsaved((all) => {
      const rest = Object.fromEntries(Object.entries(all).filter(([id]) => id !== questionId));
      return board ? { ...rest, [questionId]: board } : rest;
    });
  // The saves of answered questions: in the background, one at a time, in order.
  const saves = useRef<Promise<void>>(Promise.resolve());
  // A save failed: the question to open again, with the child's answer on it.
  const reopen = useRef<number | null>(null);
  // The question on the screen leaves through this, when a failed save opens another question.
  const leaveScreen = useRef<((to: Target) => Promise<unknown>) | null>(null);
  const onShown = useCallback((leave: ((to: Target) => Promise<unknown>) | null) => {
    leaveScreen.current = leave;
    // A save failed before this question could take it (the error came while the question before it was still leaving):
    // this question leaves now, to the question whose save failed.
    if (leave && reopen.current !== null) void leave({ reopen: reopen.current });
  }, []);

  const setList = (list: AnsweredQuestion[]) => {
    answeredRef.current = list;
    setAnswered(list);
  };
  /** Opens an answered question (by its number), or the newest question (null, also for a number no longer open). */
  const open = (number: number | null) => {
    const shown = number !== null && answeredRef.current.some((a) => a.number === number) ? number : null;
    viewingRef.current = shown;
    setViewing(shown);
    setVisit((v) => v + 1);
  };
  /** Keeps a visit that saves nothing in this browser: its time and events go with the question's next save. */
  const keep = (v: Visit, value?: string) => {
    const before = carry.current.get(v.questionId);
    carry.current.set(v.questionId, before ? { ms: before.ms + v.timeMs, events: mergeEvents(before.events, before.ms, v.events)! } : { ms: v.timeMs, events: v.events });
    if (value !== undefined) setHeld((h) => ({ ...h, [v.questionId]: value }));
  };
  /** The visit with the time and events of the visits before it that were not saved. */
  const withCarry = (v: Visit) => {
    const before = carry.current.get(v.questionId);
    carry.current.delete(v.questionId);
    return before ? { ...v, timeMs: before.ms + v.timeMs, events: mergeEvents(before.events, before.ms, v.events)! } : v;
  };

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
  const asking = screen.name === "question" || screen.name === "check" || screen.name === "break" || screen.name === "facts" || screen.name === "help";
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

  /** Sends the test with the help answer. */
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
    setScreen({ name: "done", ...(finished && { testId: finished }) });
    return true;
  }, [expire]);

  /** Shows the step the server sent: the next question, or the end of the test. */
  const show = useCallback(async (step: TestStep, resume?: BreakResume) => {
    setProgress((previous) => ({
      total: step.total,
      breakAfter: step.status === "complete" ? previous?.breakAfter ?? breakAfter : step.breakAfter,
    }));
    // Every answer is in: "Did anyone help?" (#71) comes last, and its Finish sends the test.
    if (step.status === "complete") {
      setScreen({ name: "help" });
      return true;
    }
    const id = testId.current ?? "";
    // #249: the newest question shows, with the open section's answered questions for Back.
    answeredRef.current = step.answered ?? [];
    setAnswered(answeredRef.current);
    viewingRef.current = null;
    setViewing(null);
    // #253: every question of the part is answered: "Check your answers" (also on a resume).
    if (step.status === "check") {
      setScreen({ name: "check", section: step.section, numbers: step.numbers, total: step.total, breakAfter: step.breakAfter, testId: id });
      return true;
    }
    // The skippable halfway break (#69) comes once per test, before the first question of the second half.
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
    // #189: the last three answers were very fast, so the question says "Take your time" (absent from an older server: off).
    setScreen({ name: "question", question: step.question, number: step.number, total: step.total, breakAfter: step.breakAfter, testId: id, takeYourTime: step.takeYourTime === true });
    return true;
  }, [breakAfter]);

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

  /** Start or Continue on the start screen. */
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
    setMarks(loadMarks(started.id));
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

  /**
   * #249: saves the change of an answered question in the background, after the saves before it. A failed save opens
   * that question again, with the child's answer on it and the "could not save" message; its time and events go with
   * the next save. When the test moved on (another tab), the screen goes where the server is.
   */
  const saveChange = (number: number, v: Visit) => {
    saves.current = saves.current.then(async () => {
      const res = await call<StepResult>(`/api/account/assessments/${testId.current}/answers`, {
        method: "PUT",
        body: JSON.stringify({ questionId: v.questionId, response: v.response, timeMs: v.timeMs, work: v.work, events: v.events, workChanged: v.workChanged }),
      });
      if (res.ok) return;
      track("test_error", { code: res.error, status: "change" });
      if (res.error === "expired") return void expire();
      if (res.error === "conflict" && "step" in res && res.step) return void show(res.step);
      const before = carry.current.get(v.questionId);
      carry.current.set(v.questionId, before ? { ms: v.timeMs + before.ms, events: mergeEvents(v.events, v.timeMs, before.events)! } : { ms: v.timeMs, events: v.events });
      // The new work stays on the board, and goes as changed work with the next save.
      if (v.workChanged && v.board) setUnsavedWork(v.questionId, v.board);
      reopen.current = number;
      // #253: on the grid no question is on the screen: the question whose save failed opens at once.
      if (leaveScreen.current) await leaveScreen.current({ reopen: number });
      else {
        reopen.current = null;
        open(number);
      }
      setFailure(res.error);
    });
  };

  /**
   * #249: the child leaves the question on the screen: Back, Next, or a failed save opens another question. Leaving an
   * answered question saves it in the background (a change, or the same answer with its time), and the screen moves at
   * once. Leaving the newest question with an answer is the answer request, as Next was before: the screen waits for it.
   * Leaving it with no answer saves nothing: its time and events wait in this browser for its first save.
   */
  const leave = async (v: Visit, to: Target): Promise<Left> => {
    if (screen.name !== "question" && screen.name !== "check") return false;
    // A save failed while this question was busy: it goes to the question whose save failed.
    if (reopen.current !== null) to = { reopen: reopen.current };
    if (!reopening(to)) setFailure(null);
    const from = viewingRef.current;
    // #253: on the grid, the question on the screen is always an answered one. D-132: the grid's questions are in review.
    const destination = leaveDestination({
      reviewing: screen.name === "check",
      answered: answeredRef.current.map((a) => a.number),
      viewing: from,
      newest: screen.name === "question" ? screen.number : 0,
      failed: reopening(to) ? to.reopen : null,
    }, to);
    if (destination.to === "stay") return false;
    // open(null) shows the newest question, or on the grid's questions the grid itself.
    const target = destination.to === "question" ? destination.number : null;

    if (from === null) {
      if (to !== "next" && !reopening(to) && v.response) {
        // Back or a tap on a step: the answer request first, then that question, if the answer did not close its section.
        if (!(await sendAnswer(v))) return false;
        if (reopen.current === null && answeredRef.current.some((a) => a.number === target)) open(target);
        return "saved";
      }
      if (to === "next") return (await sendAnswer(v)) ? "saved" : false;
      keep(v, v.response);
      if (reopening(to)) reopen.current = null;
      open(target);
      return "kept";
    }

    // An answered question: a change must be an answer; a child cannot clear one.
    if (!v.response) {
      if (!reopening(to)) return false;
      keep(v);
    } else {
      // #252: changed work is what the server stores (strokes only with a drawing), so the next visit shows it at once.
      const work = (a: AnsweredQuestion): StoredWork | undefined => (v.workChanged
        ? { ...(v.work?.image && v.work.strokes && { strokes: v.work.strokes }), ...(v.work?.text && { text: v.work.text }) }
        : a.work);
      setList(answeredRef.current.map((a) => (a.number === from ? { ...a, response: v.response, work: work(a) } : a)));
      setUnsavedWork(v.questionId, null);
      saveChange(from, withCarry(v));
    }
    if (reopening(to)) reopen.current = null;
    open(target);
    return v.response ? "saved" : "kept";
  };

  /**
   * #253: "Done checking" on the grid, after the saves before it. The test goes on: after part 1 (which it locks) to the
   * break, after part 2 to "Did anyone help?". Resolves false when it failed: the child stays on the grid with the error
   * and can press it again, or (a save failed) on the question whose save failed.
   */
  const doneChecking = async (section: "stage1" | "stage2"): Promise<boolean> => {
    setFailure(null);
    await saves.current;
    if (viewingRef.current !== null) return false;
    const res = await call<StepResult>(`/api/account/assessments/${testId.current}/check`, post({ section }));
    if (res.ok) {
      track("test_check", { status: section });
      return show(res.step);
    }
    // Another tab or a retry went on first: carry on from where the server is.
    if (res.error === "conflict" && "step" in res && res.step) return show(res.step);
    track("test_error", { code: res.error, status: "check" });
    if (res.error === "expired") return expire();
    setFailure(res.error);
    return false;
  };

  /** The answer request for the newest question, after the saves before it, so a change lands before the answer that closes its section. */
  const sendAnswer = async (v: Visit): Promise<boolean> => {
    await saves.current;
    const failed = reopen.current;
    if (failed !== null) {
      // A save failed meanwhile: keep this answer in the browser and open the question whose save failed.
      keep(v, v.response);
      reopen.current = null;
      open(failed);
      return false;
    }
    const before = carry.current.get(v.questionId);
    const sent = withCarry(v);
    const ok = await answer(sent.questionId, sent.response, sent.timeMs, sent.work, sent.events);
    if (ok) setHeld((h) => Object.fromEntries(Object.entries(h).filter(([id]) => id !== v.questionId)));
    // The child stays on the question, whose own time and events go on: only the earlier visits wait again.
    else if (before) carry.current.set(v.questionId, before);
    return ok;
  };

  // #249: the question on the screen: an answered one the child went back to, or the newest one.
  const viewed = (screen.name === "question" || screen.name === "check") && viewing !== null ? answered.find((a) => a.number === viewing) ?? null : null;
  // #253: the step row of the open part, on a question (not on the grid itself).
  const steps = screen.name === "question"
    ? { part: screen.number <= screen.breakAfter ? 1 as const : 2 as const, first: screen.number <= screen.breakAfter ? 1 : screen.breakAfter + 1, last: screen.number <= screen.breakAfter ? screen.breakAfter : screen.total, current: viewed?.number ?? screen.number, newest: screen.number }
    : screen.name === "check" && viewed
      ? { part: screen.section === "stage1" ? 1 as const : 2 as const, first: screen.numbers[0], last: screen.numbers.at(-1)!, current: viewed.number, newest: null }
      : null;

  // D-132: the question's main button ("Back to my answers" in review).
  const buttons = questionButtons({ reviewing: screen.name === "check" });

  return (
    <div className="look-root test-root" data-look="warm">
      <header className="test-top">
        <span className="logo">Unica Learning<b /></span>
        {screen.name === "question" && <TestProgress answered={screen.number - 1} total={screen.total} breakAfter={screen.breakAfter} at="question" current={(viewed?.number ?? screen.number) - 1} />}
        {screen.name === "check" && <TestProgress answered={screen.numbers.at(-1)!} total={screen.total} breakAfter={screen.breakAfter} at="check" current={viewed ? viewed.number - 1 : undefined} />}
        {screen.name === "break" && <TestProgress answered={screen.next.breakAfter} total={screen.next.total} breakAfter={screen.next.breakAfter} at="halfway" />}
        {screen.name === "facts" && <TestProgress answered={screen.next.number - 1} total={screen.next.total} breakAfter={screen.next.breakAfter} at="facts" />}
        {(screen.name === "help" || screen.name === "done") && progress && <TestProgress answered={progress.total} total={progress.total} breakAfter={progress.breakAfter} at={screen.name === "help" ? "help" : "end"} />}
      </header>
      {steps && (
        <TestSteps part={steps.part} numbers={Array.from({ length: steps.last - steps.first + 1 }, (_, i) => steps.first + i)}
          answered={new Set(answered.map((a) => a.number))} marked={marks} current={steps.current} newest={steps.newest}
          onGo={(n) => void leaveScreen.current?.({ go: n })} />
      )}
      <main id="main" className="test-main">
        {screen.name === "intro" && <Intro name={name} ready={ready} busy={busy} onStart={() => start()} failure={failure} mode={mode} afterBreak={afterBreak} checkGrid={checkGrid} />}
        {screen.name === "question" && (
          <Question key={`${(viewed?.question ?? screen.question).id}:${visit}`} testId={screen.testId} typing={typing}
            readFirst={readFirst && viewed === null} question={viewed?.question ?? screen.question} initial={viewed ? viewed.response : held[screen.question.id] ?? ""} revisit={viewed !== null}
            initialBoard={viewed ? unsaved[viewed.question.id] : undefined} storedWork={viewed?.work}
            canBack={answered.some((a) => a.number < (viewed?.number ?? screen.number))}
            marked={marks.has(viewed?.number ?? screen.number)} onMark={() => toggleMark(viewed?.number ?? screen.number)}
            // #253: Next after the last question of a part goes to its grid.
            main={buttons.main} takeYourTime={!viewed && screen.takeYourTime} onLeave={leave} onShown={onShown} failure={failure} />
        )}
        {screen.name === "check" && (viewed
          // #253: an answered question opened from the grid. D-132: the child is reviewing, so "Back to my answers"
          // (in place of Next) saves it and comes back to the grid at once; Back and the step row still go to a question.
          ? <Question key={`${viewed.question.id}:${visit}`} testId={screen.testId} typing={typing}
              question={viewed.question} initial={viewed.response} revisit initialBoard={unsaved[viewed.question.id]} storedWork={viewed.work}
              canBack={answered.some((a) => a.number < viewed.number)} marked={marks.has(viewed.number)} onMark={() => toggleMark(viewed.number)} main={buttons.main} takeYourTime={false} onLeave={leave} onShown={onShown} failure={failure} />
          : <TestCheck name={name} part={screen.section === "stage1" ? 1 : 2} numbers={screen.numbers} marked={marks} problem={<Problem error={failure} />}
              onOpen={(n) => {
                setFailure(null);
                open(n);
              }}
              onDone={() => doneChecking(screen.section)} />)}
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
        {screen.name === "done" && <End name={name} total={progress?.total} testId={screen.testId ?? null} />}
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
    : error === "work_too_big" ? "Your work is too big to save. Clear some of it, then press Next again."
    : <>Something went wrong. Check the internet connection and try again. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</>;
  return <p ref={line} role="alert" className="test-alert">{text}</p>;
}

function Intro({ name, ready, busy, onStart, failure, mode, afterBreak, checkGrid }: { name: string; ready: boolean; busy: boolean; onStart: () => void; failure: TestError | null; mode: StartMode; afterBreak: boolean; checkGrid: boolean }) {
  if (!ready) {
    return (
      <MessageScreen>
        <p className="test-kicker">Math test</p>
        <h1 className="test-title">The test for {name}&apos;s grade is not ready yet.</h1>
        <p className="test-lead">The test is open for Kindergarten to Grade 9, but this one could not be built. Please try again later.</p>
        <Link className="btn ghost" href="/account">Back to your account</Link>
      </MessageScreen>
    );
  }
  if (mode === "finish") {
    // #253: the next step is the part 2 grid (Savar, 2026-10-18); Continue opens it.
    return (
      <MessageScreen>
        <p className="test-kicker">Math test</p>
        <h1 className="test-title">{checkGrid ? `Welcome back, ${name}!` : `All your answers are in, ${name}!`}</h1>
        <p className="test-lead">{checkGrid ? "Check your answers, then press Done checking." : "The test was not sent yet. Press Continue to finish it."}</p>
        <Problem error={failure} />
        <Button onClick={onStart} disabled={busy} aria-busy={busy}>{busy ? "Opening…" : "Continue"}</Button>
      </MessageScreen>
    );
  }
  return (
    <MessageScreen className="test-intro">
      <p className="test-kicker">Math test</p>
      <h1 className="test-title">{mode === "resume" ? `Welcome back, ${name}! Before you go on:` : `Hi ${name}! Before you start:`}</h1>
      <ul className="test-rules">
        <li><b>No calculator.</b> Work the answers out yourself.</li>
        <li><b>No help from a parent.</b> Do the test on your own. Grown-ups, please let your child work alone.</li>
        <li><b>Scrap paper is fine.</b> Work things out on paper or on the whiteboard, if it helps. We only need your answers.</li>
        {/* #253 (D-127): Back and the steps at the top; until the break, or on a resume after it until the end of the test. */}
        <li><b>You can go back.</b> Press Back, or tap a number at the top, to change an answer. {mode === "resume" && afterBreak ? "You can do this until the end of the test." : "You can do this until the break."}</li>
      </ul>
      {mode === "resume"
        ? <p className="test-intro-note">Your answers are saved. You go on from the question where you stopped.</p>
        : <p className="test-intro-note">Answer one question at a time. If you do not know an answer, make your best guess.</p>}
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

const PENCIL = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
);
const FLAG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 22V4" /><path d="M4 4h13l-2 4 2 4H4" /></svg>
);

const marksKey = (testId: string) => `unica.marks.${testId}`;

/** The question numbers marked to check again in this test, from this tab; none when storage is off. */
function loadMarks(testId: string): Set<number> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(marksKey(testId)) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((n): n is number => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

function saveMarks(testId: string, marks: ReadonlySet<number>) {
  try {
    sessionStorage.setItem(marksKey(testId), JSON.stringify([...marks]));
  } catch {
    // Storage is off: the marks last until the page closes.
  }
}

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

interface QuestionProps {
  testId: string;
  /** Grades 3-9 can type on the whiteboard; Kindergarten to grade 2 draw only (#67). */
  typing: boolean;
  /** D-156: the voice reads the question as it opens (Kindergarten, a question not seen before). */
  readFirst?: boolean;
  question: PublicQuestion;
  /** #249: the answer on the screen when the question opens: the child's answer to a question they went back to. */
  initial: string;
  /** #249: the board an answered question opens with: the child's new work when its save failed. Else `storedWork`. */
  initialBoard?: BoardState;
  /** #252: the stored strokes and typed working of an answered question, on its board at once; it opens empty without them. */
  storedWork?: StoredWork;
  /** #249: an answered question the child went back to. */
  revisit: boolean;
  /** #249: an answered question of the section comes before this one, so Back shows. */
  canBack: boolean;
  /** The child marked this question to check again; shown on the step row and the "Check your answers" grid. */
  marked: boolean;
  onMark: () => void;
  /**
   * D-132: the main button's words: "Next", or "Back to my answers" once the section's grid was reached (complete, not
   * locked), which saves the answer as Next does and goes back to the grid at once (`questionButtons`).
   */
  main: QuestionButtons["main"];
  /** #189: show "Take your time" above the question: the last three answers were very fast. */
  takeYourTime: boolean;
  /** #249: the child leaves the question (Next, Back, or a failed save opens another question). Resolves false when the child stays. */
  onLeave: (visit: Visit, to: Target) => Promise<Left>;
  /** #249: gets this question's leave while it is on the screen (null once it goes), so a failed save can move the screen. */
  onShown: (leave: ((to: Target) => Promise<unknown>) | null) => void;
  failure: TestError | null;
}

// One question in the split desk (D-088): the question and the answer on the left, the whiteboard on the right.
function Question({ testId, typing, readFirst = false, question, initial, initialBoard, storedWork, revisit, canBack, marked, onMark, main, takeYourTime, onLeave, onShown, failure }: QuestionProps) {
  const [value, setValue] = useState(initial);
  const [sending, setSending] = useState(false);
  // Time on the question runs from when it appears to when the child presses Next.
  const shownAt = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    shownAt.current = performance.now();
    heading.current?.focus();
  }, []);

  // #184: what the child does before Next, from when the question appears: each answer change, each "Read it to me",
  // and each time the tab is hidden (another tab or app in front) with how long. #249: the answer already on the screen
  // when the question opens is not a change.
  const [recorder] = useState(() => answerRecorder(initial));
  useEffect(() => {
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
  // #249: an answered question the child went back to keeps no draft. #252: its board opens with the stored work, which
  // the step brought, so it is on the board in the first frame; the server copy is the truth.
  const draft = draftKey(testId, question.id);
  const drafts = !!testId && !revisit;
  const [board, setBoard] = useState<BoardState>(() => {
    const restored = (drafts ? loadDraft(draft) : null) ?? initialBoard ?? (storedWork ? storedBoard(storedWork, performance.now()) : emptyBoard());
    return { ...restored, shownAt: restored.shownAt ?? performance.now() };
  });
  // #252: a revisit opens the board in the mode of the work on it (Type for typed working with no drawing).
  const [startMode] = useState(() => (revisit ? openMode(board, typing) : "draw"));
  // The whiteboard opens when the child asks for it, so the question has the screen. It is always open when the
  // question needs shown work (#67), and opens with the question when work is already on it.
  const [boardOpen, setBoardOpen] = useState(() => question.showWork || hasDrawing(board.strokes) || (typing && board.text.trim() !== ""));
  const boardFixed = question.showWork;
  const stored = useRef(false);
  // Save each completed action before a reload can discard it, including an undo or clear to an empty board.
  // #249: any edit of the board or the typed working in this visit, Clear and Undo too, is changed work.
  const edited = useRef(false);
  const busy = useRef(false);
  const changeBoard = (next: BoardState) => {
    edited.current = true;
    if (drafts && !stored.current) saveDraft(draft, next);
    setBoard(next);
  };
  const boardSize = useRef<BoardSize>({ width: 0, height: 0 });
  const onBoardSize = useCallback((size: BoardSize) => {
    boardSize.current = size;
  }, []);
  // The strokes that turned out to be an empty picture (the eraser took every line): no drawing until the child draws again.
  const [erased, setErased] = useState<BoardState["strokes"] | null>(null);
  const drawn = hasDrawing(board.strokes) && erased !== board.strokes;
  const text = typing ? board.text : "";

  const press = useCallback((key: string) => {
    setValue((v) => {
      if (key === "back") return v.slice(0, -1);
      if (v.length >= ANSWER_MAX || (key === "." && v.includes("."))) return v;
      return v === "0" && key !== "." ? key : v + key;
    });
  }, []);

  /**
   * #249: leaves the question: Next, Back, or a failed save that opens another question. It sends the visit with the
   * whiteboard work (#67) and what the child did (#184). Resolves false when the child stays on the question.
   */
  const leave = async (to: Target): Promise<Left> => {
    // A ref, not the state: a failed save can call this before the screen shows that the question is leaving.
    if (busy.current) return false;
    // Next needs an answer; on an answered question Back and a step do too (a child cannot clear an answer).
    if (!reopening(to) && !value && (to === "next" || revisit)) return false;
    busy.current = true;
    setSending(true);
    const timeMs = performance.now() - shownAt.current;
    let image: string | null = null;
    let blank = false;
    try {
      image = await boardImage(board.strokes, boardSize.current);
      blank = drawn && image === null;
    } catch {
      // The browser could not make the picture: the answer goes without it.
    }
    const typed = text.trim();
    if (blank) setErased(board.strokes);
    // #186: every stroke, undo and clear, for the admin's replay, thinned to the size limit (or none when it cannot fit).
    const recorded = recordStrokes(board.log, board.shownAt ?? shownAt.current, boardSize.current);
    const strokes = recorded && fitStrokes(recorded);
    const work: WorkPayload | undefined = image || typed || strokes
      ? { ...(image ? { image } : {}), ...(typed ? { text: typed } : {}), ...(strokes ? { strokes } : {}) }
      : undefined;
    // #249: on a question the child went back to, the work changed when the child edited the board or the typed working
    // in this visit (a cleared board is changed work with no drawing), or when it holds new work whose save failed.
    const workChanged = !revisit || edited.current || initialBoard !== undefined;
    const left = await onLeave({ questionId: question.id, response: value, timeMs, events: recorder.events(timeMs), work, workChanged, ...(revisit && { board }) }, to);
    // On success this question unmounts; on failure the child keeps the answer and the work, and can press Next again.
    if (!left) {
      busy.current = false;
      setSending(false);
      return false;
    }
    if (left === "saved" && !revisit) {
      stored.current = true;
      saveDraft(draft, emptyBoard());
    }
    if (left === "saved" && (image || typed)) track("test_work", { status: question.showWork ? "required" : "optional", channel: image && typed ? "both" : image ? "draw" : "type" });
    return left;
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    await leave("next");
  };

  // #249: a failed save elsewhere moves the screen through this question's leave.
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });
  useEffect(() => {
    onShown((to) => leaveRef.current(to));
    return () => onShown(null);
  }, [onShown]);

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
    <form className={`test-split test-desk${boardOpen ? "" : " is-board-closed"}`} onSubmit={submit}>
      <div className="test-pane test-pane-l">
        {takeYourTime && <TakeYourTime />}
        <div className="test-qrow">
          <ReadAloud key={question.id} text={spoken} onRead={onRead} auto={readFirst} />
          <h1 id="test-q-title" ref={heading} tabIndex={-1} className="test-prompt"><PromptText text={question.prompt} /></h1>
        </div>
        {question.figure?.kind === "bars" && <BarGraph figure={question.figure} />}
        {!boardOpen && (
          <button type="button" className="test-board-open" onClick={() => setBoardOpen(true)}>{PENCIL}<span>Use the whiteboard</span></button>
        )}
        <div className="test-response">
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
          <button type="button" className="test-mark" aria-pressed={marked} onClick={onMark}>
            {FLAG}<span>{marked ? "Marked to check again" : "Mark to check again"}</span>
          </button>
          <Problem error={failure} />
          <div className="test-next">
            {/* #249: Back to the answered question before this one; hidden on the first question of a section. */}
            {canBack && <Button variant="ghost" className="test-back" onClick={() => void leave("back")} disabled={sending || (revisit && !value)}><BackLabel /></Button>}
            <Button type="submit" className="test-go" arrow={false} disabled={!value || sending} aria-busy={sending}>{main === "Next" ? <NextLabel /> : <span>{main}</span>}</Button>
          </div>
        </div>
      </div>
      {boardOpen && (
        <div className="test-pane test-pane-r">
          {!boardFixed && <button type="button" className="test-board-hide" onClick={() => setBoardOpen(false)}>Hide whiteboard</button>}
          <Whiteboard board={board} onChange={changeBoard} typing={typing} onSize={onBoardSize} startMode={startMode} />
        </div>
      )}
    </form>
  );
}

/**
 * #189: after three very fast answers in a row. A calm note above the question, never a block: the child reads it with
 * the question and goes on. role="status", so a screen reader says it once.
 */
function TakeYourTime() {
  useEffect(() => track("test_pace", { status: "shown" }), []);
  return (
    <p className="test-pace" role="status">
      <b>Take your time.</b> Read each question and work it out before you press Next.
    </p>
  );
}

/**
 * The end (D-088): a full colour field. The child is thanked and hands the device back; "I'm the grown-up" turns the
 * screen into the wait for the report, which opens here when the report job has built it.
 */
function End({ name, total, testId }: { name: string; total?: number; testId: string | null }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [who, setWho] = useState<"child" | "parent">("child");
  useEffect(() => heading.current?.focus(), [who]);
  return (
    <section className="test-end test-field" aria-labelledby="test-end-title">
      <div>
        {who === "child" ? (
          <>
            <p className="test-kicker">{total === undefined ? "All done" : `All ${total} done`}</p>
            <h1 id="test-end-title" ref={heading} tabIndex={-1} className="test-title">You did it, {name}!</h1>
            <p className="test-lead">Thank you for working so hard. Please pass the device back to your grown-up.</p>
            <Button onClick={() => setWho("parent")}>I&apos;m the grown-up</Button>
          </>
        ) : (
          <ReportWait name={name} testId={testId} heading={heading} />
        )}
      </div>
    </section>
  );
}

/**
 * How often the wait asks whether the report is ready, how long one ask may take, the least time the wait shows, and
 * when it stops asking.
 */
const REPORT_POLL_MS = 4_000;
const REPORT_ASK_MS = 15_000;
const REPORT_MIN_WAIT_MS = 2_500;
const REPORT_GIVE_UP_MS = 3 * 60_000;

/** The grown-up's wait: asks whether the report is built, then opens it. After 3 minutes it says the email will bring it. */
function ReportWait({ name, testId, heading }: { name: string; testId: string | null; heading: RefObject<HTMLHeadingElement | null> }) {
  const router = useRouter();
  // No test id (the page opened on a finished test): nothing to wait for, so the email and the account bring it.
  const [slow, setSlow] = useState(!testId);
  useEffect(() => {
    if (!testId) return;
    const startedAt = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let asking: AbortController | undefined;
    // The 3-minute limit runs on its own timer, so an ask that never answers cannot keep the wait on the screen.
    const giveUp = setTimeout(() => {
      stopped = true;
      clearTimeout(timer);
      asking?.abort();
      track("test_report_wait", { status: "slow" });
      setSlow(true);
    }, REPORT_GIVE_UP_MS);
    const ask = async () => {
      const controller = new AbortController();
      asking = controller;
      const cut = setTimeout(() => controller.abort(), REPORT_ASK_MS);
      const res = await call<{ ok: true; href: string | null }>(`/api/account/assessments/${testId}/report`, { signal: controller.signal });
      clearTimeout(cut);
      if (stopped) return;
      if (res.ok && res.href) {
        const href = res.href;
        clearTimeout(giveUp);
        track("test_report_wait", { status: "opened" });
        timer = setTimeout(() => router.push(href), Math.max(0, REPORT_MIN_WAIT_MS - (Date.now() - startedAt)));
        return;
      }
      timer = setTimeout(ask, REPORT_POLL_MS);
    };
    void ask();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(giveUp);
      asking?.abort();
    };
  }, [testId, router]);
  if (slow) {
    return (
      <>
        <p className="test-kicker">Report</p>
        <h1 id="test-end-title" ref={heading} tabIndex={-1} className="test-title">{name}&apos;s report is on its way.</h1>
        <p className="test-lead">{testId ? "It is taking a little longer than usual. " : ""}We will email it to you, and it will be in your account.</p>
        <p className="test-end-link"><Link href="/account">Go to your account</Link></p>
      </>
    );
  }
  return (
    <>
      <p className="test-kicker">Report</p>
      <h1 id="test-end-title" ref={heading} tabIndex={-1} className="test-title">Building {name}&apos;s report…</h1>
      <p className="test-lead" role="status">This usually takes about a minute. It opens here when it is ready, and we email you a copy.</p>
      <span className="test-wait" aria-hidden><i /><i /><i /></span>
    </>
  );
}
