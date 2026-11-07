"use client";
import { useEffect, useId, useRef, useState } from "react";
import { explanationOutput, type ExplanationResult } from "@/lib/parent-problem-explanation-contract";
import { useScanContext } from "@/lib/use-scan-context";

export type ExplanationState = "idle" | "loading" | "busy" | "ready" | "retry" | "cap" | "stale" | "unavailable";
export function ScanProblemExplanationView({ state, result, number, onExplain }: {
  state: ExplanationState; result?: Extract<ExplanationResult, { status: "ready" }>; number: number; onExplain?: () => void;
}) {
  const id = useId(), pending = state === "loading";
  return <div className="scan-explanation" aria-busy={pending}>
    <button type="button" className="scan-link" onClick={onExplain} disabled={pending || state === "stale" || state === "unavailable"}
      aria-controls={`${id}-answer`} aria-describedby={`${id}-status`} aria-expanded={state === "ready"}>
      {state === "ready" ? "Show explanation again" : state === "retry" || state === "busy" ? "Try explanation again" : "Explain this problem"}
      <span className="sr-only"> for question {number}</span>
    </button>
    <p id={`${id}-status`} role={state === "retry" || state === "cap" ? "alert" : "status"}>
      {state === "loading" ? "Preparing the explanation..." : state === "busy" ? "This explanation is being prepared. Try again shortly."
        : state === "retry" || state === "cap" ? "We could not prepare the explanation. Please try again later."
          : state === "stale" ? "This mark changed. Refresh the page results."
            : state === "unavailable" ? "An explanation is not available for this question." : state === "ready" ? "The explanation is ready." : ""}
    </p>
    <div id={`${id}-answer`}>
      {state === "ready" && result && <div className="scan-mark-review" aria-label={`Explanation for question ${number}`}>
        <p><b>Stored correct answer:</b> {result.correctAnswer}</p>
        <ol>{result.explanation.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
        <p><b>Say to your child:</b> {result.explanation.say}</p>
      </div>}
    </div>
  </div>;
}
/** Mounted with a key that includes account, photo, mark version and reading. Late replies cannot enter a new question. */
export function ScanProblemExplanation({ parent, photo, itemId, version, number }: { parent?: string; photo: string; itemId: string; version: number; number: number }) {
  const [state, setState] = useState<ExplanationState>("idle"), [result, setResult] = useState<Extract<ExplanationResult, { status: "ready" }>>();
  const begin = useScanContext(parent, `${photo}:${itemId}:${version}`), running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  async function explain() {
    if (running.current) return;
    const current = begin(); if (!current()) return;
    const controller = new AbortController(); running.current = controller;
    setState("loading"); setResult(undefined);
    try {
      const response = await fetch(`/api/account/scans/${encodeURIComponent(photo)}/explanation`, { method: "POST", cache: "no-store",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, version }) });
      if (!current() || controller.signal.aborted) return;
      const data: unknown = await response.json();
      if (!current() || controller.signal.aborted) return;
      if (!data || typeof data !== "object" || !("status" in data)) throw new Error("explanation_response");
      if (response.status === 409 || response.status === 404 || data.status === "refused") { setState("stale"); return; }
      if (!response.ok) throw new Error("explanation_response");
      if (data.status === "ready" && "explanation" in data && "correctAnswer" in data && typeof data.correctAnswer === "string"
        && data.correctAnswer.length > 0 && data.correctAnswer.length <= 800 && "context" in data && typeof data.context === "string") {
        const explanation = explanationOutput(data.explanation);
        if (!explanation) throw new Error("explanation_output");
        setResult({ status: "ready", explanation, correctAnswer: data.correctAnswer, context: data.context }); setState("ready");
      } else if (data.status === "cap" || data.status === "unavailable" || data.status === "retry") setState(data.status);
      else if (data.status === "busy") setState("busy");
      else throw new Error("explanation_response");
    } catch { if (current() && !controller.signal.aborted) setState("retry"); }
    finally { if (running.current === controller) running.current = null; }
  }
  // Busy is retryable by an explicit second press; it never polls or starts another request itself.
  return <ScanProblemExplanationView state={state} result={result} number={number} onExplain={() => void explain()} />;
}
