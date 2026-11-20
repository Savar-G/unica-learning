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

/** The list opens on Needs help when there is any (what a parent can act on), else Learning, else Mastered. */
const firstFocus = (s: HomeSkillsView): Focus => (s.needsHelp.length ? "needsHelp" : s.learning.length ? "learning" : "mastered");

function Row({ item }: { item: SkillItemView }) {
  return (
    <li>
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
        {list.length ? <ul className="po-list">{list.map((item) => <Row key={item.code} item={item} />)}</ul> : <p className="po-none">{shown.empty}</p>}
      </div>
    </>
  );
}
