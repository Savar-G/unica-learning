// PROTOTYPE variant E: "Three chapters". The big picture first: each grade band is a full-width coloured chapter with
// three example problems written like a child's workbook page. The level list waits behind "See the levels".
import type { CSSProperties, ReactNode } from "react";
import { BANDS } from "./data";

export function VariantE({ how, end }: { how: ReactNode; end: ReactNode }) {
  return (
    <main id="main" className="curp cp cpe">
      <header className="cp-head cpe-head">
        <p className="eyebrow">Our curriculum</p>
        <h1>Three chapters of math, Kindergarten to Grade 9.</h1>
        <p className="lead">Built from the BC math curriculum. Here is the kind of work your child does in each one.</p>
      </header>

      {BANDS.map((b, i) => (
        <section key={b.key} className={`cpe-ch${i % 2 ? " flip" : ""}`} style={{ "--c": b.color } as CSSProperties} aria-labelledby={`cpe-${b.key}`}>
          <div className="cpe-field" aria-hidden="true" />
          <div className="cpe-text">
            <p className="cp-mono">Chapter {i + 1} · {b.levels}</p>
            <h2 id={`cpe-${b.key}`}>{b.grades}</h2>
            <p className="cpe-gist">{b.gist}</p>
            <details className="cpe-more">
              <summary>See the {b.group.levels.length} levels</summary>
              <ol>
                {b.group.levels.map((l) => (
                  <li key={l.n}><span>U{l.n}</span><div><b>{l.title}</b><small>{l.points.join(" · ")}</small></div></li>
                ))}
              </ol>
            </details>
          </div>
          <div className="cpe-pages">
            {b.samples.map((s, si) => (
              <figure key={s.q} className="cpe-page" style={{ "--r": `${[-2.5, 1.5, -1][si]}deg` } as CSSProperties}>
                <p className="cpe-q">{s.q}</p>
                <figcaption>From level U{s.from}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}

      <p className="cp-fine cpe-fine">Your child starts at the level the free assessment finds. Many children start below or above their school grade, and that&apos;s normal.</p>
      {how}
      {end}
    </main>
  );
}
