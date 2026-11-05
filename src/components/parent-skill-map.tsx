"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { gradeLabel } from "@/lib/assessment/grades";
import type { SkillAreaView, SkillTileView } from "@/lib/skill-map-view";
import { STATE_WORD } from "@/lib/skill-state-words";

// The skill map's tiles and the panel on the selected skill (#561). Each tile is a button. The panel is the browser's own
// modal dialog: it holds the focus, Escape closes it, and closing puts the focus back on the tile. On a wide screen it is a side
// panel, on a phone a sheet from the bottom (src/components/parent-progress.css). A section with no data does not appear.

export function SkillMap({ areas, workingLevel }: { areas: SkillAreaView[]; workingLevel: number | null }) {
  const [selected, setSelected] = useState<SkillTileView | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const panel = dialog.current;
    if (selected && panel && !panel.open) panel.showModal();
  }, [selected]);

  /** A click on the backdrop lands on the dialog itself: its content fills the box. */
  const closeOnBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialog.current) dialog.current?.close();
  };

  return (
    <>
      <div className="pp-areas">
        {areas.map((a) => (
          <section key={a.area} className="pp-area" aria-labelledby={`pp-area-${a.area}`}>
            <h3 id={`pp-area-${a.area}`}>{a.name}</h3>
            <ul>
              {a.tiles.map((t) => (
                <li key={t.code}>
                  <button type="button" className={`pp-tile is-${t.state}`} aria-haspopup="dialog" onClick={(e) => { opener.current = e.currentTarget; setSelected(t); }}>
                    <span className="pp-tile-name">{t.name}</span>
                    <span className="pp-tile-state">{STATE_WORD[t.state]}{workingLevel !== null && t.grade !== workingLevel ? ` · ${gradeLabel(t.grade)}` : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <dialog ref={dialog} className="pp-panel" aria-labelledby="pp-panel-title" onClose={() => { setSelected(null); opener.current?.focus(); }} onClick={closeOnBackdrop}>
        {selected && <SkillPanel tile={selected} onClose={() => dialog.current?.close()} />}
      </dialog>
    </>
  );
}

export function SkillPanel({ tile, onClose }: { tile: SkillTileView; onClose: () => void }) {
  return (
    <div className="pp-panel-in">
      <div className="pp-panel-top">
        <span className={`pp-chip is-${tile.state}`}>{STATE_WORD[tile.state]}</span>
        <button type="button" className="pp-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <h3 id="pp-panel-title">{tile.name}</h3>
      <p className="pp-why">{tile.why}</p>
      {tile.workbookLine && <p className="pp-why">{tile.workbookLine}</p>}
      {tile.skills.length > 0 && (
        <section aria-labelledby="pp-panel-skills">
          <h4 id="pp-panel-skills">Skills inside this one</h4>
          <ul className="pp-list">{tile.skills.map((s) => <li key={s}>{s}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
