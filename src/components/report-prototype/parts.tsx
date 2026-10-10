"use client";

// PROTOTYPE ONLY (branch site/report-prototype, round r12). Shared report pieces. Each variant arranges and styles them.
import { useState } from "react";
import { PLANS } from "@/lib/site";
import { track } from "@/lib/track";
import { BANDS, FSA, FSA_SOURCE, STATUS_LABEL, TAKERS, gradeName, pct, type Child, type Stage, type Status, type Work } from "./data";

export type Province = "BC" | "ON";
export const PROVINCE_NAME: Record<Province, string> = { BC: "BC", ON: "Ontario" };

export interface ReportProps {
  c: Child;
  stage: Stage;
  prov: Province;
  helped: boolean;
}

/** Marks a made-up number. Every sample number in the prototype carries it or sits under the page banner. */
export function Sample() {
  return <span className="rp-sample" title="Sample data for the prototype">sample</span>;
}

export function SampleBanner() {
  return (
    <p className="rp-banner" role="note">
      <b>Prototype · sample data.</b> Every child, score, count and comparison here is made up. Only the FSA figures are real, and they are to be checked before launch.
    </p>
  );
}

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** K-8 grade-level scale: the school grade as an outline marker, the working level as a filled one. */
export function Scale({ c, labels = true }: { c: Child; labels?: boolean }) {
  const lo = Math.min(c.grade, c.level);
  const hi = Math.max(c.grade, c.level);
  return (
    <div
      className={`rp-scale is-${c.verdict}`}
      role="img"
      aria-label={`Grade-level scale from kindergarten to grade 8. School grade: ${c.grade}. Working level: ${gradeName(c.level)}.`}
      style={{ "--lo": lo, "--hi": hi, "--g": c.grade, "--l": c.level } as React.CSSProperties}
    >
      <div className="rp-scale-track">
        <i className="rp-scale-gap" />
        {LEVELS.map((n) => (
          <span key={n} className={`rp-tick${n === c.level ? " is-level" : ""}${n === c.grade ? " is-grade" : ""}`}>
            {n === 0 ? "K" : n}
          </span>
        ))}
        <b className="rp-pin is-grade" />
        <b className="rp-pin is-level" />
      </div>
      {labels && (
        <div className="rp-scale-key">
          <span className="k-level">Working level: {gradeName(c.level)}</span>
          <span className="k-grade">School grade: {c.grade}</span>
        </div>
      )}
    </div>
  );
}

export function FsaLine({ c }: { c: Child }) {
  const v = FSA[c.grade];
  if (!v) return null;
  return (
    <p className="rp-fsa">
      <span className="rp-fsa-k">For context</span> In BC&apos;s 2025/26 Foundation Skills Assessment, {v}% of grade {c.grade} students with a result were On Track or Extending in numeracy.
      The FSA is a different test, so this is context, not a score for {c.name}. <cite>Source: {FSA_SOURCE}.</cite>
    </p>
  );
}

/** The stage-dependent comparison. Stage 1 shows nothing beyond the scale and FSA line. */
export function Comparison({ c, stage, compact = false }: { c: Child; stage: Stage; compact?: boolean }) {
  const n = TAKERS[stage];
  if (stage === 1) return null;
  if (stage === 2) {
    return (
      <div className="rp-compare">
        {!compact && <p className="rp-compare-h">Among grade {c.grade} children who took this test</p>}
        <div className="rp-bands" role="img" aria-label={`${c.name} is in the ${BANDS[c.band].toLowerCase()} of ${n} grade ${c.grade} children who took this test.`}>
          {BANDS.map((b, i) => (
            <span key={b} className={i === c.band ? "is-on" : ""} style={{ flexGrow: i === 1 ? 2 : 1 }}>
              {b}
              {i === c.band && <em>{c.name}</em>}
            </span>
          ))}
        </div>
        <p className="rp-n">
          n = {n} grade {c.grade} children <Sample />
        </p>
      </div>
    );
  }
  return (
    <div className="rp-compare">
      {!compact && <p className="rp-compare-h">Among grade {c.grade} children who took this test</p>}
      <p className="rp-pct">
        {c.name} scored higher than <b>{c.percentile}%</b> of the grade {c.grade} children who took this test. <Sample />
      </p>
      <div className="rp-strip" role="img" aria-label={`Position ${c.percentile} out of 100`}>
        <i style={{ left: `${c.percentile}%` }} />
      </div>
      <p className="rp-n">
        n = {n} grade {c.grade} children <Sample />
      </p>
    </div>
  );
}

export function StatusChip({ s }: { s: Status }) {
  return <span className={`rp-chip is-${s}`}>{STATUS_LABEL[s]}</span>;
}

export function Count({ correct, total }: { correct: number; total: number }) {
  return (
    <span className="rp-count">
      {correct} of {total} questions
    </span>
  );
}

/** Correct answers as filled dots, so the question count is visible, not only the label. */
export function Dots({ correct, total }: { correct: number; total: number }) {
  return (
    <span className="rp-dots" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < correct ? "on" : ""} />
      ))}
    </span>
  );
}

/** Speed always next to accuracy, never alone. */
export function Facts({ c, layout = "row" }: { c: Child; layout?: "row" | "stack" }) {
  const f = c.facts;
  return (
    <div className={`rp-facts is-${layout}`}>
      <div>
        <span className="rp-facts-k">Accuracy</span>
        <b>{pct(f.correct, f.tried)}%</b>
        <span>
          {f.correct} of {f.tried} right
        </span>
      </div>
      <div>
        <span className="rp-facts-k">Speed</span>
        <b>{f.perMinute}</b>
        <span>facts a minute</span>
      </div>
      <p className="rp-facts-note">
        {f.fluent
          ? `Quick and accurate on the facts ${c.their} grade is expected to know.`
          : `Accurate, and still building speed. Facts speed needs practice; it does not mean ${c.name} is behind.`}{" "}
        Timed section, {f.seconds} seconds.
      </p>
    </div>
  );
}

/** The child's whiteboard work, drawn in the handwriting font. */
export function WorkImage({ w }: { w: Work }) {
  return (
    <div className="rp-board" role="img" aria-label={`The child's work: ${w.lines.join(", ")}`}>
      {w.lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}

export function WorkCard({ w, showStrand = true }: { w: Work; showStrand?: boolean }) {
  return (
    <figure className="rp-work">
      <figcaption>
        {showStrand && <span className="rp-work-s">{w.strand}</span>}
        <span className="rp-work-q">{w.question}</span>
      </figcaption>
      <WorkImage w={w} />
      <p className={`rp-work-a ${w.correct ? "ok" : "no"}`}>
        {w.correct ? "✓ Correct" : "✗ Not correct"} · answer {w.answer}
      </p>
      {w.comment && <p className="rp-work-c">{w.comment}</p>}
    </figure>
  );
}

const HELP_TITLE = { behind: "Catch up, then move ahead", on: "Get ahead", ahead: "Keep learning at their level" } as const;

export function helpTitle(c: Child) {
  return c.verdict === "ahead" ? `Keep learning at ${c.their} level` : HELP_TITLE[c.verdict];
}

export function helpText(c: Child) {
  if (c.verdict === "behind")
    return `${c.name}'s first book starts at ${gradeName(c.level)} work, with extra practice on ${list(c.focus)}. After each photo check-in, we see what is secure and move the next book on: to ${gradeName(c.grade)} work, then past it when ${c.they} is ready.`;
  if (c.verdict === "on")
    return `${c.name}'s books keep ${gradeName(c.grade)} work steady, give extra practice on ${list(c.focus)}, and bring in ${gradeName(c.grade + 1)} topics when ${c.they} is ready, so ${c.they} sees them before ${c.their} class does.`;
  return `${c.name} already does ${gradeName(c.level)} work. ${cap(c.their)} books start there, so ${c.they} learns new things instead of repeating what ${c.they} knows, and ${c.their} school's topics stay covered.`;
}

function list(xs: string[]) {
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

export function HowWeHelp({ c, eyebrow = true }: { c: Child; eyebrow?: boolean }) {
  return (
    <div className="rp-help">
      {eyebrow && <p className="rp-k">How we help</p>}
      <h3>{helpTitle(c)}</h3>
      <p>{helpText(c)}</p>
    </div>
  );
}

export function HelpWarning({ c }: { c: Child }) {
  return (
    <p className="rp-warn" role="note">
      <b>This level may be too high.</b> Some answers came faster than a child can read the question, and you told us someone helped. If {c.name} takes the test again alone, the books will start at the right place.{" "}
      <a href="#retake" onClick={(e) => e.preventDefault()}>
        Retake with new questions
      </a>
    </p>
  );
}

/** Card for BC, waitlist for every other province. Clicks only fire the funnel event in the prototype. */
export function Cta({ c, prov, tone = "plain" }: { c: Child; prov: Province; tone?: "plain" | "field" }) {
  const [done, setDone] = useState<string | null>(null);
  if (prov === "BC") {
    return (
      <div className={`rp-cta is-${tone}`}>
        <h3>Start {c.name}&apos;s books</h3>
        <p>Choose a plan and add a card on the next page. We charge nothing until the first workbook ships. 30-day money-back guarantee. Cancel anytime.</p>
        <div className="rp-cta-row">
          {[PLANS.one, PLANS.both].map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn${p.id === "one" ? " ghost" : ""}`}
              onClick={() => {
                track("card_start", { src: "report-proto", plan: p.id, curriculum: "BC" });
                setDone(p.name);
              }}
            >
              {p.id === "one" ? "Math" : p.name} · CAD {p.price}/month
            </button>
          ))}
        </div>
        {done && <p className="rp-cta-done">Prototype: this opens Stripe Checkout in setup mode for {done}.</p>}
      </div>
    );
  }
  return (
    <div className={`rp-cta is-${tone}`}>
      <h3>Books for the {PROVINCE_NAME[prov]} curriculum are coming</h3>
      <p>Join the waitlist and we will email you when they are ready. {c.name}&apos;s report stays in your account.</p>
      <div className="rp-cta-row">
        <button
          type="button"
          className="btn"
          disabled={!!done}
          onClick={() => {
            track("waitlist_join", { src: "report-proto", curriculum: prov });
            setDone("yes");
          }}
        >
          {done ? "You're on the waitlist" : "Join the waitlist"}
        </button>
      </div>
    </div>
  );
}

export function Meta({ c, prov }: { c: Child; prov: Province }) {
  return (
    <span className="rp-meta">
      Math placement · {c.date} · {c.questions} questions in {c.minutes} minutes · measured against {PROVINCE_NAME[prov]} grade expectations <Sample />
    </span>
  );
}
