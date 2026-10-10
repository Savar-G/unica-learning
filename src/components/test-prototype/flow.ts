"use client";

// PROTOTYPE ONLY (ticket #60). In-memory flow shared by all five variants, so they differ only in layout.
// Order: questions 1-18 -> halfway break (skippable) -> 60 s facts -> questions 19-36 -> end screen.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/track";
import { BREAK_AFTER, buildFacts, buildTest, FACT_SECONDS, TOTAL, type Question } from "./data";

export type Stroke = { erase: boolean; w: number; pts: [number, number][] };
export type Work = { strokes: Stroke[]; text: string };
export type Phase = "q" | "break" | "facts" | "end";
export type FactsState = { started: boolean; index: number; left: number; done: boolean; right: number; tried: number; entry: string; log: string[] };

const EMPTY_WORK: Work = { strokes: [], text: "" };

export function hasWork(w: Work | undefined) {
  return !!w && (w.strokes.some((s) => !s.erase) || w.text.trim().length > 0);
}

export function useTestFlow(src: string) {
  const questions = useMemo(() => buildTest(), []);
  const facts = useMemo(() => buildFacts(), []);
  const [phase, setPhase] = useState<Phase>("q");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [work, setWork] = useState<Record<number, Work>>({});
  const [f, setF] = useState<FactsState>({ started: false, index: 0, left: FACT_SECONDS, done: false, right: 0, tried: 0, entry: "", log: [] });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("test_start", { src });
  }, [src]);

  // facts countdown
  useEffect(() => {
    if (phase !== "facts" || !f.started || f.done) return;
    const t = window.setInterval(() => {
      setF((s) => (s.left <= 1 ? { ...s, left: 0, done: true } : { ...s, left: s.left - 1 }));
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, f.started, f.done]);

  const q: Question = questions[index];
  const answer = answers[q.id] ?? "";
  const w = work[q.id] ?? EMPTY_WORK;
  const needsWork = q.board === "required" && !hasWork(w);
  const canNext = answer.trim().length > 0 && !needsWork;
  const part = index < BREAK_AFTER ? 1 : 2;
  const partStart = part === 1 ? 0 : BREAK_AFTER;
  const partEnd = part === 1 ? BREAK_AFTER : TOTAL;

  const setAnswer = useCallback((v: string) => setAnswers((a) => ({ ...a, [q.id]: v })), [q.id]);
  const setStrokes = useCallback((strokes: Stroke[]) => setWork((m) => ({ ...m, [q.id]: { ...(m[q.id] ?? EMPTY_WORK), strokes } })), [q.id]);
  const setText = useCallback((text: string) => setWork((m) => ({ ...m, [q.id]: { ...(m[q.id] ?? EMPTY_WORK), text } })), [q.id]);

  const next = useCallback(() => {
    if (phase !== "q") return;
    if (index === BREAK_AFTER - 1) {
      setPhase("break");
      track("test_break", { src, status: "shown" });
    } else if (index === TOTAL - 1) {
      setPhase("end");
      track("test_finish", { src });
    } else setIndex(index + 1);
  }, [phase, index, src]);

  const back = useCallback(() => {
    if (phase === "q" && index > partStart) setIndex(index - 1);
  }, [phase, index, partStart]);

  const goTo = useCallback((i: number) => {
    if (i >= partStart && i < partEnd) setIndex(i);
  }, [partStart, partEnd]);

  const endBreak = useCallback((rested: boolean) => {
    track("test_break", { src, status: rested ? "rested" : "skipped" });
    setPhase("facts");
  }, [src]);

  const startFacts = useCallback(() => setF((s) => ({ ...s, started: true })), []);
  const setFactEntry = useCallback((entry: string) => setF((s) => ({ ...s, entry })), []);
  const submitFact = useCallback(() => {
    setF((s) => {
      if (s.done) return s;
      // Enter on an empty answer skips the fact
      const right = s.entry !== "" && Number(s.entry) === facts[s.index].answer;
      const log = [...s.log, s.entry];
      return { ...s, entry: "", log, index: Math.min(s.index + 1, facts.length - 1), tried: s.tried + (s.entry ? 1 : 0), right: s.right + (right ? 1 : 0) };
    });
  }, [facts]);
  const endFacts = useCallback(() => {
    track("test_facts_done", { src });
    setIndex(BREAK_AFTER);
    setPhase("q");
  }, [src]);

  /** Prototype bar: jump straight to a screen. */
  const jump = useCallback((to: "q1" | "work" | "q18" | "break" | "facts" | "q19" | "q36" | "end") => {
    setF({ started: false, index: 0, left: FACT_SECONDS, done: false, right: 0, tried: 0, entry: "", log: [] });
    if (to === "break" || to === "facts" || to === "end") return setPhase(to);
    setPhase("q");
    setIndex({ q1: 0, work: 3, q18: BREAK_AFTER - 1, q19: BREAK_AFTER, q36: TOTAL - 1 }[to]);
  }, []);

  return {
    questions, facts, phase, index, q, answer, work: w, needsWork, canNext, answers, allWork: work,
    part, partStart, partEnd, total: TOTAL, f, fact: facts[f.index],
    setAnswer, setStrokes, setText, next, back, goTo, endBreak, startFacts, setFactEntry, submitFact, endFacts, jump,
  };
}

export type Flow = ReturnType<typeof useTestFlow>;
