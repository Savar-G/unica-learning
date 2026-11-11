"use client";

// "{child}'s first pages" on the parent's own report (docs/first-pages.md, round r-first-pages option B): the four real
// pages of Workbook 1, after "What's in workbook 1" and before the next step. Each page opens larger in a dialog (Esc,
// the close button or a click outside closes it; the arrows move between pages). The action goes to the plan choice
// and card step of the same report (#rpt-next); it is left out once a card is saved.
import { useEffect, useRef, useState } from "react";
import { familyPlanWords } from "@/lib/family-plan-words";
import { START_PLAN_TODAY } from "@/lib/first-pages-words";
import { NEXT_STEP_ANCHOR } from "@/lib/report-view";

export interface FirstPagesView {
  pages: { number: number; kind: "cover" | "lesson" | "practice"; url: string; width: number; height: number }[];
}

const captions = (name: string) => [
  { title: "Cover", text: `Made for ${name}` },
  { title: "Learn it", text: "The worked example" },
  { title: "Practice", text: `${name} tries it` },
  { title: "More practice", text: "With one to fix" },
];

export function ReportFirstPages({ name, view, offer }: { name: string; view: FirstPagesView; offer: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const caps = captions(name);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);
  const show = (i: number, el: HTMLButtonElement) => { opener.current = el; setOpen(i); };
  const close = () => { setOpen(null); opener.current?.focus(); };
  const page = open !== null ? view.pages[open] : null;
  return (
    <section className="rpt-row" aria-labelledby="rpt-first-pages">
      <div className="rpt-row-h">
        <h2 id="rpt-first-pages">{name}&apos;s first pages</h2>
        <p>From workbook 1, made from this test.</p>
      </div>
      <div className="rpt-row-c">
        <div className="rpt-fp">
          <p className="rpt-fp-lead">These are the first pages of the workbook we would mail to {name}, made from this test: the cover, the first lesson and two practice pages.</p>
          <ol className="rpt-fp-pages">
            {view.pages.map((p, i) => (
              <li key={p.number}>
                <figure>
                  <button type="button" aria-label={`Open the ${caps[i].title.toLowerCase()} page, larger`} onClick={(e) => show(i, e.currentTarget)}>
                    {/* A private, short-lived URL: not for the image optimizer, which would cache it. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`${caps[i].title} page of ${name}'s workbook 1`} width={p.width} height={p.height} loading="lazy" />
                  </button>
                  <figcaption><b>{caps[i].title}</b>{caps[i].text}</figcaption>
                </figure>
              </li>
            ))}
          </ol>
          {offer && (
            <div className="rpt-fp-cta">
              <a className="btn" href={`#${NEXT_STEP_ANCHOR}`}>{START_PLAN_TODAY}</a>
              <p>{familyPlanWords.freeMonth}</p>
            </div>
          )}
        </div>
        <dialog ref={dialog} className="rpt-fp-dialog" aria-label={page ? `${caps[open!].title} page` : undefined}
          onClose={() => { if (open !== null) close(); }}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          {page && (
            <div className="rpt-fp-dialog-in">
              <div className="rpt-fp-dialog-bar">
                <p><b>{caps[open!].title}</b> · Page {open! + 1} of {view.pages.length}</p>
                <div>
                  <button type="button" className="ghost" onClick={() => setOpen((open! + view.pages.length - 1) % view.pages.length)} aria-label="Previous page">←</button>
                  <button type="button" className="ghost" onClick={() => setOpen((open! + 1) % view.pages.length)} aria-label="Next page">→</button>
                  <button type="button" className="ghost" onClick={close}>Close</button>
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.url} alt={`${caps[open!].title} page of ${name}'s workbook 1`} width={page.width} height={page.height} />
            </div>
          )}
        </dialog>
      </div>
    </section>
  );
}
