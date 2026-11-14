import type { ReactNode } from "react";
import { SectionHead } from "@/components/admin-family-page";
import { RecordFacts } from "@/components/admin-records";
import { when } from "@/lib/admin-view";
import type { SkillPlanView, SnapshotPlanView } from "@/lib/next-book-plan-view";

// #473 (S10b): the frozen next-book snapshot's plan, one section per skill. Read only.
const list = (items: string[], empty = "None") => items.length ? <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="rec-quiet">{empty}</span>;
const days = (d: number[]) => d.length ? `Days ${d[0]} to ${d[d.length - 1]}` : "none";

function SkillPlan({ s }: { s: SkillPlanView }) {
  const rows: [string, ReactNode][] = [
    ["Decision from the marks", s.decision ?? <span className="rec-quiet">No decision for this skill</span>],
    ["New steps in the next book", list(s.newSteps.map(n => `Step ${n.step}, Day ${n.day}`), "No new step")],
    ["Reviews due", list(s.reviewsDue.map(r => `Step ${r.step}, ${r.when} (every ${r.every})`))],
    ["Reviews missed (back in Fix it)", list(s.reviewsMissed.map(r => `Step ${r.step} (every ${r.every})`))],
    ["Fix it items carried over", <>{list(s.fixIt.map(f => `${f.question}: ${f.result}${f.mistake ? `, mistake ${f.mistake}` : ""}`))}{s.fixItLater && <p className="rec-warn">No room in this book: it waits for the next one.</p>}</>],
    ["Held for a later book", list(s.held.map(h => `${h.step !== null ? `Step ${h.step}: ` : ""}${h.reason}`))],
  ];
  return <section className="rec-sec" aria-labelledby={`sp-${s.skill}`}>
    <SectionHead id={`sp-${s.skill}`} title={s.name} hint={s.skill} />
    <table className="adm-table"><tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>
  </section>;
}

export function AdminSnapshotPlan({ view }: { view: SnapshotPlanView }) {
  switch (view.state) {
    case "none": return <p className="adm-empty">No snapshot yet. It is taken when Day 7 of book 1 is scanned, 21 days after delivery, or with Prepare from snapshot.</p>;
    case "held": return <p className="adm-empty">On hold: no pages were scanned by the backstop.</p>;
    case "waiting": return <p className="adm-empty">Snapshot {view.revision} is waiting for the last marks.</p>;
    case "no-plan": return <p className="adm-empty">Snapshot {view.revision} was frozen {when(new Date(view.frozenAt).toISOString())} (Pacific). It has no plan yet.</p>;
  }
  return <>
    <RecordFacts facts={[
      ["Snapshot", `Version ${view.revision}: ${view.reason}`],
      ["Marks through (Pacific)", when(new Date(view.frozenAt).toISOString())],
      ["Days used", `${days(view.days.used)}${view.days.later.length ? `. ${days(view.days.later)} kept for a later book.` : ""}`],
      ["Marks used", `${view.used}. Still waiting for a mark: ${view.pending}.`],
    ]} />
    {!view.matchesSaved && <p role="status" className="rec-warn">The planner has changed since this snapshot, so its new steps cannot be shown. Reviews, Fix it items and held marks are as saved.</p>}
    {view.skills.map(s => <SkillPlan key={s.skill} s={s} />)}
    <section className="rec-sec" aria-labelledby="sp-other">
      <SectionHead id="sp-other" title="Other marks kept for later" count={view.otherHeld.reduce((n, h) => n + h.count, 0)} />
      {view.otherHeld.length ? <table className="adm-table"><tbody>{view.otherHeld.map(h => <tr key={h.reason}><th scope="row">{h.reason}</th><td>{h.count}</td></tr>)}</tbody></table> : <p className="adm-empty">None.</p>}
    </section>
  </>;
}
