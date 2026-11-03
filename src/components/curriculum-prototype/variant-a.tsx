"use client";

// PROTOTYPE variant A: "Pick a grade". A K-9 ruler is the first thing on the page. A tap on any grade opens that
// grade's band (never a single level). Levels are a quiet numbered list; one opens at a time.
import { useState, type CSSProperties, type ReactNode } from "react";
import { BANDS, gradeName } from "./data";

export function VariantA({ how, end }: { how: ReactNode; end: ReactNode }) {
  const [grade, setGrade] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const band = BANDS.find((b) => b.gradeList.includes(grade))!;
  return (
    <main id="main" className="curp cp cpa">
      <header className="cp-head">
        <p className="eyebrow">Our curriculum</p>
        <h1>Math from Kindergarten to Grade 9, one level at a time.</h1>
        <p className="lead">30 short levels, built from the BC math curriculum. Pick your child&apos;s grade to see what they would work on.</p>
      </header>

      <section className="cpa-picker" aria-label="Your child's grade">
        <p className="cpa-ask">What grade is your child in?</p>
        <div className="cpa-ruler">
          {BANDS.map((b) => (
            <div key={b.key} className={`cpa-seg${b === band ? " on" : ""}`} style={{ "--c": b.color, flexGrow: b.gradeList.length } as CSSProperties}>
              <div className="cpa-ticks">
                {b.gradeList.map((g) => (
                  <button key={g} type="button" aria-pressed={g === grade} onClick={() => { setGrade(g); setOpen(null); }}>
                    {g === 0 ? "K" : g}
                  </button>
                ))}
              </div>
              <span className="cpa-seg-label">{b.levels}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="cpa-band" style={{ "--c": band.color } as CSSProperties} aria-live="polite">
        <div className="cpa-band-top">
          <div>
            <p className="cp-mono">{band.levels}</p>
            <h2>{band.grades}</h2>
            <p className="cpa-gist">{band.gist}</p>
          </div>
          <p className="cpa-note"><b>{gradeName(grade)}</b> is in this range. Many children start below or above their grade, and that&apos;s normal. The free assessment finds the exact level to start.</p>
        </div>
        <ol className="cpa-list">
          {band.group.levels.map((l) => {
            const isOpen = open === l.n;
            return (
              <li key={l.n} className={isOpen ? "open" : ""}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.n)}>
                  <span className="cpa-n">U{l.n}</span>
                  <span className="cpa-t">{l.title}</span>
                  <span className="cpa-plus" aria-hidden="true">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && <ul>{l.points.map((p) => <li key={p}>{p}</li>)}</ul>}
              </li>
            );
          })}
        </ol>
      </section>

      {how}
      {end}
    </main>
  );
}
