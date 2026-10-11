"use client";

// The halfway break (#69, D-083, D-088): skippable. The message on the left; on the right a grainy colour field with a
// slow breathing circle that stays still with reduced motion. A separate part so the split-desk rebuild (#79) can restyle it.
import { useEffect, useRef } from "react";
import { Button } from "@/ds";
import "./test-parts.css";

// The break shows at most once per test, also after a reload or a resume in a new tab. The flag lives in this browser
// (local storage, only the test's id); the in-memory set covers browsers that block storage.
const BREAK_KEY = "unica-test-break-";
const seen = new Set<string>();

/** True when this test's break was already shown in this browser. */
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
    <section className="test-break" aria-labelledby="test-break-title">
      <div className="test-break-msg">
        <p className="test-break-kicker">{answered} of {total} done</p>
        <h1 id="test-break-title" ref={heading} tabIndex={-1} className="test-break-title">Halfway there, {name}.</h1>
        <p className="test-break-lead">Take a short break if you want one. Stretch, get some water, then come back.</p>
        <div className="test-break-btns">
          <Button onClick={() => end("skipped")}>Keep going</Button>
          <Button variant="ghost" onClick={() => end("rested")}>I am back from my break</Button>
        </div>
      </div>
      <div className="test-break-field" aria-hidden>
        <div className="test-breath">
          <span className="test-breath-in">Breathe in</span>
          <span className="test-breath-out">Breathe out</span>
          <span className="test-breath-still">Take a slow breath</span>
        </div>
      </div>
    </section>
  );
}
