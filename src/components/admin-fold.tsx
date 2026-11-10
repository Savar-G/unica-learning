// A closed section of an admin record page (D-315): long detail (timelines, logs, per-question tables) that the team
// opens when it needs it. The summary names the section and says in one quiet line what is inside.
import type { ReactNode } from "react";
import "./admin-fold.css";

export function Fold({ title, hint, id, open = false, children }: { title: ReactNode; hint?: ReactNode; id?: string; open?: boolean; children: ReactNode }) {
  return <details className="adm-fold" id={id} open={open || undefined}>
    <summary><span className="adm-fold-title">{title}</span>{hint && <span className="adm-fold-hint">{hint}</span>}</summary>
    <div className="adm-fold-body">{children}</div>
  </details>;
}
