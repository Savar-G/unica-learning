"use client";

// The halfway break (#69, D-083, D-088): skippable. The message in the left pane; in the right pane a grainy colour field
// with a slow breathing circle that stays still with reduced motion.
import { useEffect, useRef } from "react";
import { Button } from "@/ds";
import { isBreakLength, type BreakRecord } from "@/lib/test-context";
import "./test-base.css";
import "./test-parts.css";

// The break shows at most once per test, also after a reload or a resume in a new tab. The flag lives in this browser
// (local storage, only the test's id); the in-memory set covers browsers that block storage.
const BREAK_KEY = "unica-test-break-";
const seen = new Set<string>();
const pending = new Map<string, SavedBreak>();
const STATE_KEY = "unica-test-break-state-";
export interface SavedBreak {
  startedAt: number;
  end: Exclude<BreakRecord, { event: "shown" }> | null;
}

/** A pending break is separate from the old seen flag. Keep the clock basis and a captured end across reloads. */
export function loadBreak(testId: string): SavedBreak | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(STATE_KEY + testId) ?? "null");
    if (value && Number.isFinite(value.startedAt) && value.startedAt > 0 &&
      (value.end === null || ((value.end?.event === "rested" || value.end?.event === "skipped") && isBreakLength(value.end.lengthMs)))) {
      return { startedAt: value.startedAt, end: value.end === null ? null : { event: value.end.event, lengthMs: value.end.lengthMs } };
    }
  } catch {
    // Storage blocked or damaged: use this page's state, then the server's resume state.
  }
  return pending.get(testId) ?? null;
}

export function saveBreak(testId: string, state: SavedBreak): void {
  pending.set(testId, state);
  try {
    window.localStorage.setItem(STATE_KEY + testId, JSON.stringify(state));
  } catch {
    // The server keeps the start when local storage is not available.
  }
}

/** True when this browser completed the break (or holds the legacy seen flag). */
export function breakSeen(testId: string): boolean {
  if (seen.has(testId)) return true;
  try {
    return window.localStorage.getItem(BREAK_KEY + testId) === "1";
  } catch {
    return false;
  }
}

export function markBreakSeen(testId: string): void {
  seen.add(testId);
  try {
    window.localStorage.setItem(BREAK_KEY + testId, "1");
  } catch {
    // Storage blocked: the in-memory flag still covers this page.
  }
}

export interface TestBreakProps {
  name: string;
  answered: number;
  total: number;
  /** Called once. rested = "I am back from my break"; skipped = "Keep going". */
  onDone: (how: "rested" | "skipped") => void;
}

export function TestBreak({ name, answered, total, onDone }: TestBreakProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  // One break, one answer: a double tap must not end it twice.
  const ended = useRef(false);
  const end = (how: "rested" | "skipped") => {
    if (ended.current) return;
    ended.current = true;
    onDone(how);
  };
  return (
    <section className="test-split test-break" aria-labelledby="test-break-title">
      <div className="test-pane test-pane-l is-msg">
        <p className="test-kicker">{answered} of {total} done</p>
        <h1 id="test-break-title" ref={heading} tabIndex={-1} className="test-title">Halfway there, {name}.</h1>
        <p className="test-lead">Take a short break if you want one. Stretch, get some water, then come back.</p>
        <div className="test-btns">
          <Button onClick={() => end("skipped")}>Keep going</Button>
          <Button variant="ghost" onClick={() => end("rested")}>I am back from my break</Button>
        </div>
      </div>
      <div className="test-pane test-pane-r test-field" aria-hidden>
        <div className="test-breath">
          <span className="test-breath-in">Breathe in</span>
          <span className="test-breath-out">Breathe out</span>
          <span className="test-breath-still">Take a slow breath</span>
        </div>
      </div>
    </section>
  );
}
