"use client";
// The sample report as a small window on the home page. The report is server-rendered and passed in as children.
// Wide screens: the card scrolls on its own (the scrollbar and a "Scroll" hint show it moves; the hint goes at the first
// scroll, and the fade goes at the end). Phones: a scrolling card inside a scrolling page traps a finger, so the card
// holds still and a tap opens the report full screen in a <dialog>, with a close button and its own scroll. The
// dialog's copy of the report is only rendered while it is open.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ReportPeek({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [end, setEnd] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="pz-peek-wrap" data-scrolled={scrolled} data-end={end}>
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
      <button type="button" className="pz-peek-open" onClick={() => setOpen(true)} aria-label="Open the sample report" />
      <span className="pz-peek-hint" aria-hidden="true">
        <span className="pz-peek-scroll">Scroll <i>↓</i></span>
        <span className="pz-peek-tap">Tap to read</span>
      </span>
      <dialog ref={dialog} className="pz-peek-dialog" aria-label="Sample report" onClose={() => setOpen(false)}>
        {open && (
          <>
            <div className="pz-peek-dialog-bar">
              <span>Sample report</span>
              <button type="button" className="pz-dialog-close" onClick={() => dialog.current?.close()} aria-label="Close">
                ×
              </button>
            </div>
            <div className="pz-peek-dialog-body">{children}</div>
          </>
        )}
      </dialog>
    </div>
  );
}
