"use client";

// PROTOTYPE ONLY (ticket #60). Small input pieces the variants place and style in their own way:
// the on-screen number pad, shape and fraction pictures, and icons.
import { useEffect } from "react";
import type { Pic } from "./data";

type PadProps = {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  max?: number;
  className?: string;
  /** Label of the enter key; omit to hide it. */
  enterLabel?: string;
  enterDisabled?: boolean;
  /** Listen to the physical keyboard too (digits, Backspace, Enter). */
  keyboard?: boolean;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function NumPad({ value, onChange, onEnter, max = 4, className = "", enterLabel, enterDisabled, keyboard = true }: PadProps) {
  const press = (k: string) => {
    if (k === "back") return onChange(value.slice(0, -1));
    if (value.length >= max) return;
    onChange(value === "0" ? k : value + k);
  };

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter" && onEnter && !enterDisabled) onEnter();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`pad ${className}`.trim()} role="group" aria-label="Number pad">
      {KEYS.map((k) => (
        <button type="button" key={k} onClick={() => press(k)}>{k}</button>
      ))}
      <button type="button" className="pad-back" onClick={() => press("back")} aria-label="Delete">
        <svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
          <path d="M8 2h15a1 1 0 011 1v14a1 1 0 01-1 1H8l-6-8 6-8z" />
          <path d="M12 7l6 6M18 7l-6 6" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" onClick={() => press("0")}>0</button>
      {enterLabel ? (
        <button type="button" className="pad-enter" onClick={onEnter} disabled={enterDisabled}>{enterLabel}</button>
      ) : (
        <span />
      )}
    </div>
  );
}

export function PicSvg({ kind, size = 72 }: { kind: Pic; size?: number }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinejoin: "round" as const };
  const shade = "var(--tp-shade, #ffc93c)";
  const bar = (parts: number, filled: number) => (
    <svg width={size * 1.3} height={size * 0.55} viewBox="0 0 104 44" aria-hidden>
      {Array.from({ length: parts }, (_, i) => (
        <rect key={i} x={2 + (i * 100) / parts} y={2} width={100 / parts} height={40} fill={i < filled ? shade : "#fff"} stroke="currentColor" strokeWidth={2.4} />
      ))}
    </svg>
  );
  switch (kind) {
    case "square": return <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden><rect x="12" y="12" width="48" height="48" {...stroke} /></svg>;
    case "rect": return <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden><rect x="4" y="20" width="64" height="32" {...stroke} /></svg>;
    case "tri": return <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden><path d="M36 10L64 60H8z" {...stroke} /></svg>;
    case "pent": return <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden><path d="M36 8l27 20-10 34H19L9 28z" {...stroke} /></svg>;
    case "half": return bar(2, 1);
    case "third": return bar(3, 1);
    case "quarter": return bar(4, 1);
    case "twothirds": return bar(3, 2);
  }
}

export function SpeakerIcon({ on = false, size = 22 }: { on?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" fillOpacity=".12" />
      {on ? (
        <>
          <path d="M16 8.5a5 5 0 010 7" />
          <path d="M18.8 5.8a9 9 0 010 12.4" />
        </>
      ) : (
        <path d="M16.5 9.5a3.5 3.5 0 010 5" />
      )}
    </svg>
  );
}

export function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
