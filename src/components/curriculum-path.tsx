"use client";

// The path of 30 level squares on /curriculum. A click opens the level's group (a closed <details>) before scrolling,
// since the browser alone does not scroll to a card inside a group that was closed.
import type { MouseEvent } from "react";
import type { CurriculumGroup } from "@/lib/curriculum";

export function CurriculumPath({ groups }: { groups: CurriculumGroup[] }) {
  const go = (e: MouseEvent<HTMLAnchorElement>, n: number) => {
    const card = document.getElementById(`level-${n}`);
    if (!card) return;
    e.preventDefault();
    const group = card.closest("details");
    if (group) group.open = true;
    card.scrollIntoView({ block: "start" });
    history.replaceState(null, "", `#level-${n}`);
  };
  return (
    <>
      <ol className="curp-steps">
        {groups.flatMap((g, gi) => g.levels.map((l) => (
          <li key={l.n} className={`g${gi + 1}`}><a href={`#level-${l.n}`} aria-label={`Level ${l.n}: ${l.title}`} onClick={(e) => go(e, l.n)}>{l.n}</a></li>
        )))}
      </ol>
      <div className="curp-legend">
        {groups.map((g, gi) => <span key={g.name} className={`g${gi + 1}`}>{g.name}</span>)}
      </div>
    </>
  );
}
