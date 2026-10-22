"use client";
// A stack of sample sheets: one shows at a time, with a small arrow on each side of a row of dots. Tapping the sheet opens
// it full size (round r18, a native <dialog>: Esc closes it, focus returns to the thumbnail), and the full-size view has
// its own arrows, so a parent can keep going through the sheets there too. The sheets are server-rendered and passed
// in; the arrows wrap around from the last sheet to the first. The page scales with its box (container units).
import { useRef, useState, type ReactNode } from "react";
import { track } from "@/lib/track";

export function PageDeck({ id, name, pages }: { id: string; name: string; pages: ReactNode[] }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const go = (step: number) => setI((i + step + pages.length) % pages.length);
  const open = () => {
    ref.current?.showModal();
    track("page_zoom", { src: id });
  };
  const nav = (
    <div className="pz-deck-nav">
      <button type="button" className="pz-deck-btn" onClick={() => go(-1)} aria-label={`Previous sheet of ${name}'s book`}><Chevron flip /></button>
      <div className="pz-deck-dots" role="group" aria-label={`${name}'s sheets`}>
        {pages.map((_, n) => (
          <button key={n} type="button" className="pz-deck-dot" aria-label={`Sheet ${n + 1} of ${pages.length}`} aria-current={n === i} onClick={() => setI(n)} />
        ))}
      </div>
      <button type="button" className="pz-deck-btn" onClick={() => go(1)} aria-label={`Next sheet of ${name}'s book`}><Chevron /></button>
    </div>
  );
  return (
    <div className="pz-deck">
      <div className="pz-deck-stage" key={i}>
        <button type="button" className="pz-zoom" onClick={open} aria-label={`See ${name}'s page full size`}>
          {pages[i]}
        </button>
      </div>
      {nav}
      <dialog
        ref={ref}
        className="pz-dialog"
        aria-label={`${name}'s page`}
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
      >
        <div className="pz-dialog-bar">
          <span>{name}&apos;s page</span>
          {nav}
          <button type="button" className="pz-dialog-close" onClick={() => ref.current?.close()} aria-label="Close">
            ×
          </button>
        </div>
        <div className="pz-dialog-page" key={i}>{pages[i]}</div>
      </dialog>
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
