"use client";
// A stack of sample sheets with a "Next sheet" button. One sheet shows at a time, and tapping it opens it full size
// (PageZoom). The sheets are server-rendered and passed in; the buttons wrap around from the last sheet to the first.
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
        <button type="button" className="pz-deck-btn" onClick={() => go(-1)} aria-label={`Previous sheet of ${name}'s book`}>←</button>
        <span className="pz-deck-count" aria-live="polite">Sheet {i + 1} of {pages.length}</span>
        <button type="button" className="pz-deck-btn pz-deck-next" onClick={() => go(1)}>Next sheet <span aria-hidden="true">→</span></button>
      </div>
    </div>
  );
}
