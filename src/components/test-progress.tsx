// Progress (#69, D-088): one segment per question, done in ink and the current one in tangerine, with a ring between
// the two halves for the break and quick facts. It shows how far the child is; there is no clock and no countdown.
// It sits in the test's top bar: the segments in the middle, the label on the right (#79).
import "./test-base.css";
import "./test-parts.css";

/** Where the child is: on a question, at the halfway ring (the break or quick facts), or past the last question. */
export type ProgressAt = "question" | "halfway" | "facts" | "help" | "end";

export interface TestProgressProps {
  /** Questions answered so far. */
  answered: number;
  total: number;
  /** Questions before the halfway ring. */
  breakAfter: number;
  /** "question": on question answered + 1. "halfway" and "facts": at the ring. "help" and "end": every question done. */
  at: ProgressAt;
  /** #249: on "question", the question on the screen, from 0, when the child went back to an answered one. Default: `answered`. */
  current?: number;
}

const LABEL: Record<Exclude<ProgressAt, "question">, string> = { halfway: "Halfway", facts: "Quick facts", help: "Almost done", end: "Done" };

export function TestProgress({ answered, total, breakAfter, at, current = answered }: TestProgressProps) {
  const ringAt = at === "halfway" || at === "facts";
  const now = at === "question" ? current : -1;
  const segment = (i: number) => (
    <span key={i} className={i === now ? "is-now" : i < answered ? "is-done" : undefined} />
  );
  const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, k) => segment(from + k));
  const ring = answered > breakAfter || (answered === breakAfter && at === "question") ? "is-done" : ringAt ? "is-now" : undefined;
  const label = at === "question" ? `${current + 1} of ${total}` : LABEL[at];
  const text = at === "question" ? `Question ${current + 1} of ${total}` : ringAt ? `Halfway: ${answered} of ${total} questions done` : `${answered} of ${total} questions done`;
  return (
    <div className="test-progress">
      <div className="test-progress-bar" role="progressbar" aria-label="Test progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} aria-valuetext={text}>
        <div className="test-progress-seg" aria-hidden>{range(0, breakAfter)}</div>
        <span className={`test-progress-ring ${ring ?? ""}`.trim()} aria-hidden />
        <div className="test-progress-seg" aria-hidden>{range(breakAfter, total)}</div>
      </div>
      <span className="test-progress-count" aria-hidden>{label}</span>
    </div>
  );
}
