"use client";

// PROTOTYPE ONLY (branch site/assessment-test-prototype, ticket #60). Do not merge.
// Five ways for a child to take the placement test, on /test-prototype?variant=A..E, with fake data.
// The flow state lives here, above the variants, so switching variant keeps the same screen.
import { useEffect, useState } from "react";
import { UnicaRoot } from "@/ds";
// shared styles first, so each variant file can override them
import "./test-prototype.css";
import { useTestFlow, type Flow } from "./flow";
import { useSpeech, type Speech } from "./speech";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import { VariantD } from "./variant-d";
import { VariantE } from "./variant-e";

export type VariantProps = { flow: Flow; speech: Speech };

const VARIANTS = [
  { key: "A", name: "Workbook page", C: VariantA },
  { key: "B", name: "Split desk", C: VariantB },
  { key: "C", name: "One big thing", C: VariantC },
  { key: "D", name: "Trail", C: VariantD },
  { key: "E", name: "School test", C: VariantE },
];
const KEYS = VARIANTS.map((v) => v.key);

const JUMPS = [
  ["q1", "Q1"],
  ["work", "Q4 work"],
  ["q18", "Q18"],
  ["break", "Break"],
  ["facts", "Facts"],
  ["q19", "Q19"],
  ["q36", "Q36"],
  ["end", "End"],
] as const;

export function TestPrototype() {
  const [key, setKey] = useState("A");
  const flow = useTestFlow(`proto-${key}`);
  const speech = useSpeech(`proto-${key}`);
  const [barOpen, setBarOpen] = useState(true);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("variant");
    if (k && KEYS.includes(k)) setKey(k); // eslint-disable-line react-hooks/set-state-in-effect -- read the URL once after hydration
  }, []);

  const change = (k: string) => {
    speech.stop();
    setKey(k);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", k);
    window.history.replaceState(null, "", url);
  };

  const i = Math.max(0, KEYS.indexOf(key));
  const go = (step: number) => change(KEYS[(i + step + KEYS.length) % KEYS.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // stop the voice when the screen changes
  useEffect(() => speech.stop(), [flow.phase, flow.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const V = VARIANTS[i];
  const where = flow.phase === "q" ? `Q${flow.index + 1}/${flow.total}${flow.q.board === "required" ? " · work needed" : ""}` : flow.phase === "facts" ? `facts ${flow.f.left}s · ${flow.f.right}/${flow.f.tried}` : flow.phase;

  return (
    <UnicaRoot className="tp-root">
      <div className="tp-stage" data-variant={key}>
        <V.C flow={flow} speech={speech} />
      </div>
      <div className={`proto-bar tp-bar ${barOpen ? "" : "is-min"}`} role="toolbar" aria-label="Prototype controls">
        <button type="button" onClick={() => go(-1)} aria-label="Previous variant">←</button>
        <span className="tp-bar-name">
          <b>{V.key}</b> {V.name} <i>{i + 1}/{VARIANTS.length}</i>
        </span>
        <button type="button" onClick={() => go(1)} aria-label="Next variant">→</button>
        {barOpen && (
          <>
            <span className="tp-bar-sep" />
            <span className="tp-bar-jumps">
              {JUMPS.map(([to, label]) => (
                <button type="button" key={to} onClick={() => flow.jump(to)}>{label}</button>
              ))}
            </span>
            <span className="tp-bar-sep" />
            <span className="tp-bar-state">
              {where} · answered {Object.keys(flow.answers).length} · voice {speech.voiceName}
            </span>
          </>
        )}
        <button type="button" onClick={() => setBarOpen(!barOpen)} aria-label={barOpen ? "Shrink prototype bar" : "Expand prototype bar"}>{barOpen ? "–" : "+"}</button>
      </div>
    </UnicaRoot>
  );
}
