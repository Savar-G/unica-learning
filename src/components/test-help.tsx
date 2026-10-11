"use client";

// "Did anyone help?" (#71, D-083): the last question, after the last test question and before the end screen. The
// answer goes to the server with the finish request and never changes a mark. With the answer times it can raise help
// flags; when help is likely the report says the level may be too high. Kind words: any answer is fine.
// A separate part so the split-desk rebuild (#79) can restyle it, like the break (test-break.tsx).
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/ds";
import type { HelpAnswer } from "@/lib/assessment";
import { ReadAloud } from "./test-read-aloud";
import "./test-help.css";

const CHOICES: { value: HelpAnswer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "a-little", label: "A little" },
  { value: "no", label: "No" },
];

const READ_ALOUD = "One last question. Did anyone help you? Any answer is fine. Choose yes, a little, or no.";

export interface TestHelpProps {
  /** Sends the answer and finishes the test. Resolves false when it failed and the child can press Finish again. */
  onAnswer: (answer: HelpAnswer) => Promise<boolean>;
  /** The error line to show, if the last try failed. */
  problem: ReactNode;
}

export function TestHelp({ onAnswer, problem }: TestHelpProps) {
  const [value, setValue] = useState<HelpAnswer | null>(null);
  const [sending, setSending] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!value || sending) return;
    setSending(true);
    // On success the end screen replaces this one; on failure the child keeps the answer and can press Finish again.
    if (!(await onAnswer(value))) setSending(false);
  };

  return (
    <form className="test-q test-help" onSubmit={submit} aria-labelledby="test-help-title">
      <p className="eyebrow">One last question</p>
      <div className="test-qrow">
        <ReadAloud text={READ_ALOUD} />
        <h1 id="test-help-title" ref={heading} tabIndex={-1} className="test-prompt">Did anyone help you?</h1>
      </div>
      <p className="test-help-lead">Any answer is fine. It helps us pick the right level for you.</p>
      <div className="test-choices" role="radiogroup" aria-labelledby="test-help-title">
        {CHOICES.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={value === c.value} className="test-choice" onClick={() => setValue(c.value)}>
            <span className="test-dot" aria-hidden />
            {c.label}
          </button>
        ))}
      </div>
      {problem}
      <div className="test-next">
        <Button type="submit" disabled={!value || sending} aria-busy={sending}>{sending ? "Sending…" : "Finish"}</Button>
      </div>
    </form>
  );
}
