"use client";

// Back, the tappable progress steps and "Check your answers" (#249, #253), option B of design round r251 (D-127):
// under today's thin bar (read only), one row of round number steps for the open part only; at the end of a part, a
// full-width page of large ink number tiles. A step or a tile never shows right or wrong.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ds";
import "./test-base.css";
import "./test-steps.css";

const ICON = {
  left: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></svg>
  ),
  right: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
  ),
};

/** "← Back", a ghost button of the same width as Next (D-127). */
export const BackLabel = () => <>{ICON.left}<span>Back</span></>;
/** "Next →" (D-127). */
export const NextLabel = ({ text = "Next" }: { text?: string }) => <><span>{text}</span>{ICON.right}</>;

export interface TestStepsProps {
  /** 1 before the halfway break, 2 after it. */
  part: 1 | 2;
  /** The part's question numbers in the test, in order. */
  numbers: readonly number[];
  /** The answered questions of the part: tappable. */
  answered: ReadonlySet<number>;
  /** The question on the screen. */
  current: number;
  /** The newest question, not answered yet (null on the grid): tappable while the child looks at an earlier one. */
  newest: number | null;
  /** Opens a question: an answered one by its number, or the newest (null). */
  onGo: (number: number | null) => void;
}

/**
 * The row of steps for the open part. Answered = ink with a white number; on screen = tangerine with an ink ring; the
 * newest question, not answered yet = white with a grey ring; not reached = a small light grey dot, not tappable. When
 * the row is wider than the screen it scrolls sideways and keeps the step on screen in view.
 */
export function TestSteps({ part, numbers, answered, current, newest, onGo }: TestStepsProps) {
  const row = useRef<HTMLElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const fit = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      setCut(over);
      const now = el.querySelector<HTMLElement>(".is-now");
      if (over && now) el.scrollLeft = Math.max(0, now.offsetLeft - el.clientWidth / 2);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [current, numbers.length]);

  const step = (n: number) => {
    if (n === current) return <button key={n} type="button" className="test-step is-now" aria-current="step" aria-label={`Question ${n}, on screen now`}>{n}</button>;
    if (answered.has(n)) return <button key={n} type="button" className="test-step is-done" aria-label={`Question ${n}, answered. Tap to look again.`} onClick={() => onGo(n)}>{n}</button>;
    if (n === newest) return <button key={n} type="button" className="test-step is-next" aria-label={`Question ${n}, not answered yet`} onClick={() => onGo(null)}>{n}</button>;
    return <span key={n} className="test-step is-later" aria-hidden />;
  };
  return (
    <nav ref={row} className={`test-steps${cut ? " is-cut" : ""}`} aria-label={`Questions in part ${part}`}>
      <div className="test-steps-in">
        <span className="test-steps-part">Part {part}</span>
        {numbers.map(step)}
      </div>
    </nav>
  );
}

export interface TestCheckProps {
  name: string;
  part: 1 | 2;
  /** The part's question numbers in the test: every one is answered. */
  numbers: readonly number[];
  /** Opens the question with this number. */
  onOpen: (number: number) => void;
  /** "Done checking": locks the part. Resolves false when it failed and the child can press it again. */
  onDone: () => Promise<boolean>;
  /** The error line to show, if the last try failed. */
  problem: ReactNode;
}

/** "Check your answers": the part's questions as large number tiles (answered only, never right or wrong), and "Done checking". */
export function TestCheck({ name, part, numbers, onOpen, onDone, problem }: TestCheckProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const [sending, setSending] = useState(false);
  const done = async () => {
    if (sending) return;
    setSending(true);
    // On success the next screen replaces this one; on failure the child stays here and can press it again.
    if (!(await onDone())) setSending(false);
  };
  return (
    <section className="test-check" aria-labelledby="test-check-title">
      <div className="test-check-in">
        <p className="test-kicker">Part {part} · {numbers.length} questions</p>
        <h1 id="test-check-title" ref={heading} tabIndex={-1} className="test-title">Check your answers, {name}.</h1>
        <p className="test-lead">Tap a number to look at that question again. You can change your answer.</p>
        <div className={`test-tiles${numbers.length > 12 ? " is-many" : ""}`}>
          {numbers.map((n) => (
            <button key={n} type="button" className="test-tile" aria-label={`Question ${n}, answered`} onClick={() => onOpen(n)} disabled={sending}>{n}</button>
          ))}
        </div>
        {problem}
        <div className="test-check-foot">
          <p className="test-intro-note">{part === 1 ? "When you press Done checking, part 1 is finished. Then you get a break." : "When you press Done checking, part 2 is finished."}</p>
          <Button onClick={done} disabled={sending} aria-busy={sending} arrow={false}>{sending ? "Saving…" : "Done checking"}</Button>
        </div>
      </div>
    </section>
  );
}
