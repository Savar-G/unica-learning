// Progress (#69, D-088): one segment per question, done in ink and the current one in tangerine, with a ring between
// the two halves for the break and quick facts. It shows how far the child is; there is no clock and no countdown.
import "./test-parts.css";

export interface TestProgressProps {
  /** Questions answered so far. */
  answered: number;
  total: number;
  /** Questions before the halfway ring. */
  breakAfter: number;
  /** "question": on question answered + 1. "halfway": at the ring (the break, and the quick facts from #70). */
  at: "question" | "halfway";
}

export function TestProgress({ answered, total, breakAfter, at }: TestProgressProps) {
  const segment = (i: number) => (
    <span key={i} className={i < answered ? "is-done" : i === answered && at === "question" ? "is-now" : undefined} />
  );
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, k) => segment(from + k));
  const ring = answered > breakAfter || (answered === breakAfter && at === "question") ? "is-done" : at === "halfway" ? "is-now" : undefined;
  const label = at === "halfway" ? "Halfway" : `${answered + 1} of ${total}`;
  return (
    <div className="test-progress">
      <div
        className="test-progress-bar"
        role="progressbar"
        aria-label="Test progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={answered}
        aria-valuetext={at === "halfway" ? `Halfway: ${answered} of ${total} questions done` : `Question ${answered + 1} of ${total}`}
      >
        <div className="test-progress-seg" aria-hidden>{range(0, breakAfter)}</div>
        <span className={`test-progress-ring ${ring ?? ""}`.trim()} aria-hidden />
        <div className="test-progress-seg" aria-hidden>{range(breakAfter, total)}</div>
      </div>
      <span className="test-progress-count" aria-hidden>{label}</span>
    </div>
  );
}
