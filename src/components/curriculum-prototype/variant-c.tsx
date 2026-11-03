// PROTOTYPE variant C: "The path". One vertical line from U1 to U30, with the three grade bands as chapter markers
// and a sticky index on the left. Everything is visible; nothing to open.
import type { CSSProperties, ReactNode } from "react";
import { BANDS } from "./data";

export function VariantC({ how, end }: { how: ReactNode; end: ReactNode }) {
  return (
    <main id="main" className="curp cp cpc">
      <header className="cp-head">
        <p className="eyebrow">Our curriculum</p>
        <h1>From counting to 10 to graphing equations.</h1>
        <p className="lead">One path through the BC math curriculum, Kindergarten to Grade 9. Your child joins it at the level the free assessment finds and moves along when they&apos;re ready.</p>
      </header>

      <div className="cpc-wrap">
        <nav className="cpc-rail" aria-label="Grade bands">
          {BANDS.map((b) => (
            <a key={b.key} href={`#band-${b.key}`} style={{ "--c": b.color } as CSSProperties}>
              <span className="cpc-dot" aria-hidden="true" />
              <span><b>{b.grades}</b><small>{b.levels}</small></span>
            </a>
          ))}
        </nav>

        <ol className="cpc-path">
          {BANDS.map((b, bi) => (
            <li key={b.key} id={`band-${b.key}`} className="cpc-chapter" style={{ "--c": b.color } as CSSProperties}>
              <div className="cpc-mark">
                <span className="cpc-step">Part {bi + 1} of 3</span>
                <h2>{b.grades}</h2>
                <p>{b.gist}</p>
              </div>
              <ol className="cpc-levels">
                {b.group.levels.map((l) => (
                  <li key={l.n}>
                    <span className="cpc-node">U{l.n}</span>
                    <div>
                      <h3>{l.title}</h3>
                      <p>{l.points.join(" · ")}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>

      {how}
      {end}
    </main>
  );
}
