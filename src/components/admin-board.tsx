"use client";

// The admin board preview (#319): 27 + 39 drawn stroke by stroke, and the digits, in the two fonts Savar chooses from,
// side by side. One Replay restarts every board; "Show finished" shows the end at once. With reduced motion on, the
// boards show the finished work (DESIGN.md motion rules).
import { useState, useSyncExternalStore } from "react";
import { MayaBoard } from "@/components/maya-board";
import type { FontPreview } from "@/lib/board-preview";
import "./admin-board.css";

/** What each font looks like, in a line: facts for the choice, not a recommendation. */
const LOOK: Record<FontPreview["id"], string> = {
  "ems-tech": "Looks handwritten: a single-line version of Architects Daughter, a hand-lettered font.",
  "relief-singleline": "Looks like clean print: a single-line sans serif made for engraving machines.",
};

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (change: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

export function BoardPreview({ fonts }: { fonts: FontPreview[] }) {
  const [run, setRun] = useState(0);
  const [finished, setFinished] = useState(false);
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(REDUCED).matches, () => false);
  const instant = finished || reduced;

  return (
    <>
      <p className="adm-lead">
        Maya, the Unica Teaching Assistant, writes each step on a shared board, one pen stroke at a time. Here is the same sum
        in the two fonts we can use for her writing. Savar picks one (decision D-181); until then the board uses simple
        placeholder digits.
      </p>
      <div className="adm-board-controls">
        <button
          type="button"
          className="btn sm adm-btn"
          onClick={() => {
            setFinished(false);
            setRun((n) => n + 1);
          }}
        >
          Replay
        </button>
        <button type="button" className="btn sm ghost adm-btn" onClick={() => setFinished(true)} disabled={instant}>
          Show finished
        </button>
        {reduced && <p className="adm-note">Your device asks for less motion, so the boards show the finished work.</p>}
      </div>

      <div className="adm-board-compare">
        {fonts.map((f) => (
          <section key={f.id} className="adm-board-font" aria-labelledby={`font-${f.id}`}>
            <h2 id={`font-${f.id}`}>{f.name}</h2>
            <p className="adm-note">{LOOK[f.id]}</p>
            <figure>
              <MayaBoard key={`sum-${run}`} steps={f.sum.steps} view={f.sum.view} instant={instant} label={`27 plus 39 equals 66, worked in columns with a carried 1, in ${f.name}`} />
              <figcaption>27 + 39, stroke by stroke</figcaption>
            </figure>
            <figure>
              <MayaBoard key={`specimen-${run}`} steps={f.specimen.steps} view={f.specimen.view} instant={instant} label={`The digits 0 to 9 and the signs plus, minus, times, divide, equals and a check mark, in ${f.name}`} />
              <figcaption>Digits and signs</figcaption>
            </figure>
            <p className="adm-board-licence">
              {f.licence}. {f.credit}. <a href={f.source}>Font source</a>
            </p>
          </section>
        ))}
      </div>

      <h2>The same in both fonts</h2>
      <p className="adm-note">
        The minus sign, the check mark, the line under a sum and the arrow heads are the board&apos;s own lines, not the
        font&apos;s, so they look the same whichever font Maya uses.
      </p>
    </>
  );
}
