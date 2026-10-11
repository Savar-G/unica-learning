"use client";

// The halfway break (#69, D-083, D-088): skippable. The message on the left; on the right a grainy colour field with a
// slow breathing circle that stays still with reduced motion. A separate part so the split-desk rebuild (#79) can restyle it.
import { useEffect, useRef } from "react";
import { Button } from "@/ds";
import "./test-parts.css";

export interface TestBreakProps {
  name: string;
  answered: number;
  total: number;
  /** rested = "I am back from my break"; skipped = "Keep going". */
  onDone: (how: "rested" | "skipped") => void;
}

export function TestBreak({ name, answered, total, onDone }: TestBreakProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="test-break" aria-labelledby="test-break-title">
      <div className="test-break-msg">
        <p className="test-break-kicker">{answered} of {total} done</p>
        <h1 id="test-break-title" ref={heading} tabIndex={-1} className="test-break-title">Halfway there, {name}.</h1>
        <p className="test-break-lead">Take a short break if you want one. Stretch, get some water, then come back.</p>
        <div className="test-break-btns">
          <Button onClick={() => onDone("skipped")}>Keep going</Button>
          <Button variant="ghost" onClick={() => onDone("rested")}>I am back from my break</Button>
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
