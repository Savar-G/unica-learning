// PROTOTYPE variant B: "Three drop-downs" (Savar's idea). The grade band is the headline of each drop-down; the level
// numbers move to a small label. Inside, the level cards of the current page.
import type { CSSProperties, ReactNode } from "react";
import { BANDS } from "./data";

export function VariantB({ how, end }: { how: ReactNode; end: ReactNode }) {
  return (
    <main id="main" className="curp cp cpb">
      <header className="cp-head">
        <p className="eyebrow">Our curriculum</p>
        <h1>What your child learns, <span className="curp-hl">grade by grade.</span></h1>
        <p className="lead">The program follows the BC math curriculum from Kindergarten to Grade 9, in 30 short levels. Your child starts where the free assessment finds, not where their age says, and moves up when they&apos;re ready.</p>
      </header>

      <section className="cpb-bands" aria-label="Grade bands">
        {BANDS.map((b, i) => {
          const first = b.group.levels[0], last = b.group.levels[b.group.levels.length - 1];
          return (
            <details key={b.key} className="cpb-band" open={i === 0} style={{ "--c": b.color } as CSSProperties}>
              <summary>
                <span className="cpb-chip" aria-hidden="true">{b.short}</span>
                <span className="cpb-title">
                  <span className="cpb-grades">{b.grades}</span>
                  <span className="cpb-sub"><b>{b.levels}</b> · {first.title} → {last.title}</span>
                </span>
                <span className="cpb-toggle" aria-hidden="true" />
              </summary>
              <p className="cpb-gist">{b.gist}</p>
              <div className="curp-levels">
                {b.group.levels.map((l) => (
                  <article key={l.n} className="curp-level cpb-level">
                    <p className="curp-num">Level U{l.n}</p>
                    <h3>{l.title}</h3>
                    <ul>{l.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  </article>
                ))}
              </div>
            </details>
          );
        })}
        <p className="cp-fine">Many children start below or above their school grade, and that&apos;s normal. The first levels are done together with a parent.</p>
      </section>

      {how}
      {end}
    </main>
  );
}
