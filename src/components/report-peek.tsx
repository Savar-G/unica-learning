"use client";
// The sample report as a small scrollable window on the home page. The report is server-rendered and passed in as
// children. A caption above the card says it scrolls, and a "Scroll" hint shows until the first scroll, and the fade goes when the end is reached; macOS hides
// scrollbars, so the hint is what tells a visitor the card moves. The card is focusable so the keyboard can scroll it.
import { useState, type ReactNode } from "react";

export function ReportPeek({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [end, setEnd] = useState(false);
  return (
    <div className="pz-peek-wrap" data-scrolled={scrolled} data-end={end}>
      <p className="pz-peek-cap" aria-hidden="true"><span>Sample report</span><span>Scroll inside to read it all <b>↓</b></span></p>
      <div
        className="pz-peek-card"
        role="region"
        aria-label="Sample report, scrollable"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrolled(true);
          setEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
        }}
      >
        {children}
      </div>
      <span className="pz-peek-hint" aria-hidden="true">Scroll <span>↓</span></span>
    </div>
  );
}
