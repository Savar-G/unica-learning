"use client";

import { useState } from "react";
import type { HomeSkillsView, SkillItemView } from "@/lib/parent-view";

// The Home's skills (#1003, Option A v9): the three counts since the child started (Mastered, Learning, Needs help), and
// the list of the one picked. Each number shows once, on its button; no count sits beside a heading. Under each skill name
// is one short grey line (#989, src/lib/skill-sentences.ts), written by code; with no sentence, the name stands alone.

type Focus = "mastered" | "learning" | "needsHelp";
const FOCUS: { key: Focus; count: string; heading: string; tone: "g" | "s" | "a"; empty: string }[] = [
  { key: "mastered", count: "Mastered", heading: "Mastered", tone: "g", empty: "Nothing here right now." },
  { key: "learning", count: "Learning", heading: "Learning", tone: "s", empty: "Nothing here right now." },
  { key: "needsHelp", count: "Needs help", heading: "Needs help with", tone: "a", empty: "Nothing here right now." },
];

const svg = (d: React.ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICONS: Record<Focus, React.ReactNode> = {
  mastered: svg(<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />),
  learning: svg(<><path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" /><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" /></>),
  needsHelp: svg(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>),
};

/** The list opens on Needs help when there is any (what a parent can act on), else Learning, else Mastered. */
const firstFocus = (s: HomeSkillsView): Focus => (s.needsHelp.length ? "needsHelp" : s.learning.length ? "learning" : "mastered");

function Row({ item, focus }: { item: SkillItemView; focus: Focus }) {
  const tone = FOCUS.find((f) => f.key === focus)!.tone;
  return (
    <li>
      <span className={`pa-tag is-${tone}`}>{ICONS[focus]}</span>
      <span className="po-skill">
        <b>{item.name}</b>
        {item.sentence && <small>{item.sentence}</small>}
      </span>
    </li>
  );
}

export function HomeSkills({ name, skills }: { name: string; skills: HomeSkillsView }) {
  const [focus, setFocus] = useState<Focus>(() => firstFocus(skills));
  const shown = FOCUS.find((f) => f.key === focus)!;
  const list = skills[focus];
  return (
    <>
      <div className="pa-sh"><h2>Skills</h2><span>Since {name} started</span></div>
      <div className="po-trio" role="group" aria-label={`Skills since ${name} started`}>
        {FOCUS.map((f) => (
          <button key={f.key} type="button" className={`po-count is-${f.tone}`} aria-pressed={focus === f.key} aria-controls="po-skill-list" onClick={() => setFocus(f.key)}>
            <b>{skills[f.key].length}</b><span>{f.count}</span>
          </button>
        ))}
      </div>
      <div className="pa-sh"><h2>{shown.heading}</h2></div>
      <div className="pa-card" id="po-skill-list" aria-live="polite">
        {list.length ? <ul className="po-list">{list.map((item) => <Row key={item.code} item={item} focus={focus} />)}</ul> : <p className="po-none">{shown.empty}</p>}
      </div>
    </>
  );
}
