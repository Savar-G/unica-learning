"use client";

// PROTOTYPE variant D: "By topic". A table of eight math topics across the three grade bands, so a parent can follow
// one topic (say fractions) from start to end. A level chip opens that level's details under the table.
import { useState, type CSSProperties, type ReactNode } from "react";
import { BANDS, TOPICS, ALL_LEVELS } from "./data";

export function VariantD({ how, end }: { how: ReactNode; end: ReactNode }) {
  const [pick, setPick] = useState<number | null>(null);
  const level = ALL_LEVELS.find((l) => l.n === pick);
  return (
    <main id="main" className="curp cp cpd">
      <header className="cp-head">
        <p className="eyebrow">Our curriculum</p>
        <h1>Follow any topic from Kindergarten to Grade 9.</h1>
        <p className="lead">Eight parts of math, and what your child learns in each as they move up. Built from the BC math curriculum, in 30 short levels. Tap a level to see what&apos;s in it.</p>
      </header>

      <div className="cpd-table" role="table" aria-label="Topics by grade band">
        <div className="cpd-row cpd-headrow" role="row">
          <span role="columnheader" className="cpd-topic">Topic</span>
          {BANDS.map((b) => (
            <span key={b.key} role="columnheader" className="cpd-colhead" style={{ "--c": b.color } as CSSProperties}>
              <b>{b.grades}</b><small>{b.levels}</small>
            </span>
          ))}
        </div>
        {TOPICS.map((t) => (
          <div key={t.name} className="cpd-row" role="row">
            <span role="rowheader" className="cpd-topic">{t.name}</span>
            {t.cells.map(([text, levels], i) => (
              <div key={i} role="cell" className={`cpd-cell${text ? "" : " empty"}`} style={{ "--c": BANDS[i].color } as CSSProperties}>
                <small className="cpd-mob">{BANDS[i].grades}</small>
                {text ? <p>{text}</p> : <p>Starts in {BANDS[i + 1].grades}</p>}
                {levels.length > 0 && (
                  <div className="cpd-chips">
                    {levels.map((n) => (
                      <button key={n} type="button" aria-pressed={pick === n} onClick={() => setPick(pick === n ? null : n)}>U{n}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={`cpd-detail${level ? " on" : ""}`} aria-live="polite">
        {level ? (
          <article style={{ "--c": level.band.color } as CSSProperties}>
            <button type="button" className="cpd-close" onClick={() => setPick(null)} aria-label="Close">×</button>
            <p className="cp-mono">Level U{level.n} · {level.band.grades}</p>
            <h3>{level.title}</h3>
            <ul>{level.points.map((p) => <li key={p}>{p}</li>)}</ul>
          </article>
        ) : <p className="cp-fine">Tap a level, such as U12, to see what&apos;s in it.</p>}
      </div>

      {how}
      {end}
    </main>
  );
}
