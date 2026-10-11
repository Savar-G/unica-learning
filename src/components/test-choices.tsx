"use client";

// Multiple choice in the test (D-088, #79): full-width rows with a radio dot; the whole row is the target. A radio group
// for the keyboard too: Tab reaches the group once, the arrow keys move and choose, Space and Enter choose.
import { useRef, type KeyboardEvent } from "react";
import "./test-base.css";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface ChoicesProps<T extends string> {
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** The id of the question's heading, which names the group. */
  labelledBy: string;
}

export function Choices<T extends string>({ options, value, onChange, labelledBy }: ChoicesProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  // The chosen row takes the Tab stop; before a choice, the first row does.
  const tabStop = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const rows = Array.from(group.current?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? []);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = (Math.max(0, at) + step + rows.length) % rows.length;
    rows[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <div ref={group} className="test-choices" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} tabIndex={i === tabStop ? 0 : -1} className="test-choice" onClick={() => onChange(o.value)}>
          <span className="test-dot" aria-hidden />
          {o.label}
        </button>
      ))}
    </div>
  );
}
