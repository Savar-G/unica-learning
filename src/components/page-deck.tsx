"use client";
// A stack of sample sheets with a small arrow on each side of the count. One sheet shows at a time, and tapping it opens it full size
// (PageZoom). The sheets are server-rendered and passed in; the two arrows wrap around from the last sheet to the first.
import { useState, type ReactNode } from "react";
import { PageZoom } from "./page-zoom";

export function PageDeck({ id, name, pages }: { id: string; name: string; pages: ReactNode[] }) {
  const [i, setI] = useState(0);
  const go = (step: number) => setI((i + step + pages.length) % pages.length);
  return (
    <div className="pz-deck">
      <div className="pz-deck-stage" key={i}>
        <PageZoom id={id} name={name}>{pages[i]}</PageZoom>
      </div>
      <div className="pz-deck-nav">
        <button type="button" className="pz-deck-btn" onClick={() => go(-1)} aria-label={`Previous sheet of ${name}'s book`}><Chevron flip /></button>
        <span className="pz-deck-count" aria-live="polite">{i + 1} / {pages.length}</span>
        <button type="button" className="pz-deck-btn" onClick={() => go(1)} aria-label={`Next sheet of ${name}'s book`}><Chevron /></button>
      </div>
    </div>
  );
}

function Chevron({ flip = false }: { flip?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}
