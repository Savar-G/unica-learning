"use client";

// PROTOTYPE ONLY (branch site/parent-prototype): five ways to show the parent's part, on the real home page.
// Question (Randy Epp review, 2026-10-09): "What is my experience as a parent giving this to my kid?"
// Should the answer be its own section after How it works, and what shape? Switch with ?variant=now|A|B|C|D|E
// or the bottom bar (← →). Facts come from DESIGN.md (15-20 minutes a day, 5 days a week; the app is for the parent).
// Draft copy only: no parent-minute numbers and no starter guide in the box, because we have neither yet.
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Section, SectionHeader } from "@/ds";
import { Knot } from "./drawn";
import { PrototypeSwitcher, SHOW_PROTOTYPES } from "./prototype-switcher";
import familyPhoto from "@/assets/img/loop-adapt.jpg";
import "./parent-prototype.css";

const EYEBROW = "Your part as a parent";

function Shell({ children, className, title, lead }: { children: ReactNode; className: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <Section id="parent" aria-labelledby="parentT" className={`pp ${className}`}>
      <Knot />
      <SectionHeader eyebrow={EYEBROW} title={title} lead={lead} titleId="parentT" />
      {children}
    </Section>
  );
}

/* A: a week as three swim lanes (your child, you, us). The argument: your lane is thin. */
function VariantA() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const lanes: { who: string; cells: (string | null)[]; tone: string }[] = [
    { who: "Your child", tone: "kid", cells: ["Today's pages", "Today's pages", "Today's pages", "Today's pages", "Today's pages", null, null] },
    { who: "You", tone: "you", cells: ["Sit with them", "Stay nearby", "Stuck? Scan it", "Stay nearby", "Scan the pages", null, null] },
    { who: "Us", tone: "us", cells: [null, null, null, null, "Mark the work", "Plan the next book", null] },
  ];
  return (
    <Shell className="pp-a" title="15-20 minutes a day. Here is your part." lead="Your child works on paper five days a week. You stay close, and we handle the rest.">
      <p className="pp-a-kid">Your child: today&apos;s pages, Monday to Friday.</p>
      <div className="pp-a-week" role="table" aria-label="A normal week">
        <div className="row head" role="row">
          <span role="columnheader" />
          {days.map((d) => <span key={d} role="columnheader">{d}</span>)}
        </div>
        {lanes.map((l) => (
          <div key={l.who} className={`row ${l.tone}`} role="row">
            <b role="rowheader">{l.who}</b>
            {l.cells.map((c, i) => <span key={i} role="cell" className={c ? "on" : "off"}>{c ?? (i > 4 && l.tone === "kid" ? "Free" : "")}</span>)}
          </div>
        ))}
      </div>
      {/* phones: one row per day instead of three lanes */}
      <ol className="pp-a-days">
        {days.slice(0, 5).map((d, i) => (
          <li key={d}>
            <span className="d">{d}</span>
            <span><b>You:</b> {lanes[1].cells[i]}{lanes[2].cells[i] ? <i> · Us: {lanes[2].cells[i]}</i> : null}</span>
          </li>
        ))}
        <li className="wk"><span className="d">Sat-Sun</span><span>Free. <i>Us: plan the next book.</i></span></li>
      </ol>
      <p className="pp-note"><b>First week:</b> plan to sit with them for each session. Pick the same time and spot every day, like right after a snack.</p>
    </Shell>
  );
}

/* B: two lists side by side. Your list is short; ours is long. */
function VariantB() {
  const you = [
    ["Pick a time and a spot.", "The same time each day makes it a habit."],
    ["Sit with them for the first week.", "Do the first page together. Then step back."],
    ["Help when they're stuck.", "Scan the problem. Our app shows you every step, so you can walk them through it."],
    ["Scan the finished pages.", "See what's right in seconds."],
  ];
  const us = ["Find your child's level", "Make every book for your child", "Mail it before the last one runs out", "Mark every page you scan", "Show you the gaps and the solutions", "Plan the next book from how they did"];
  return (
    <Shell className="pp-b" title="You coach. We do the rest.">
      <div className="pp-b-grid">
        <div className="you">
          <p className="pp-who">Your part</p>
          <ol>
            {you.map(([h, p]) => <li key={h}><h3>{h}</h3><p>{p}</p></li>)}
          </ol>
        </div>
        <div className="us">
          <p className="pp-who">Our part</p>
          <ul>
            {us.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </div>
    </Shell>
  );
}

/* C: the first month as a timeline beside one photo. Answers "more at first, less later". */
function VariantC() {
  const beats = [
    ["Day 1", "Open the book together.", "Look through the first pages with them, and do the first page side by side."],
    ["Week 1", "Sit with them.", "Same time, same spot each day. Stay close and help when they ask."],
    ["Week 2 on", "Step back.", "They work on their own for 15-20 minutes. You stay nearby in case they get stuck."],
    ["Any day", "Stuck? Scan it.", "Scan the problem with our app. You see every step, explained, so you can walk them through it."],
    ["End of the book", "Scan the pages.", "We mark the work, show you the gaps, and the next book is already on its way."],
  ];
  return (
    <Shell className="pp-c" title="Your first month, week by week." lead="You do more at the start. After that, the routine does most of the work.">
      <div className="pp-c-grid">
        <div className="ph pp-c-photo"><Image src={familyPhoto} alt="A girl shows her finished work to her parents" sizes="(min-width: 980px) 440px, 92vw" placeholder="blur" /></div>
        <ol className="pp-c-line">
          {beats.map(([when, h, p]) => (
            <li key={when}>
              <span className="when">{when}</span>
              <h3>{h}</h3>
              <p>{p}</p>
            </li>
          ))}
        </ol>
      </div>
    </Shell>
  );
}

/* D: the four questions a parent asks, answered in large type. */
function VariantD() {
  const qs = [
    ["How much of my time does it take?", "Your child works 15-20 minutes a day, 5 days a week. Sit with them for the first week. After that, stay nearby and scan the pages."],
    ["Do I need to know how to teach it?", "No. When they're stuck, scan the problem. Our app shows you every step, explained, so you can walk them through it."],
    ["How do I get my child started?", "Pick the same time and spot each day. Open the first book together and do the first page side by side."],
    ["What if they don't want to?", "Keep it short and at the same time each day. The book starts at their level, so the first pages are ones they can do."],
  ];
  return (
    <Shell className="pp-d" title="What it takes from you.">
      <div className="pp-d-grid">
        {qs.map(([q, a], i) => (
          <article key={q}>
            <span className="n">0{i + 1}</span>
            <h3>{q}</h3>
            <p>{a}</p>
          </article>
        ))}
      </div>
    </Shell>
  );
}

const VARIANTS: { key: string; name: string; C: () => ReactNode }[] = [
  { key: "now", name: "Live page (no parent section)", C: () => null },
  { key: "A", name: "Your week", C: VariantA },
  { key: "B", name: "You vs us", C: VariantB },
  { key: "C", name: "First month", C: VariantC },
  { key: "D", name: "Parent questions", C: VariantD },
  { key: "E", name: "Inside How it works", C: () => null },
];

function Switch({ how, howParent }: { how: ReactNode; howParent: ReactNode }) {
  const [key, setKey] = useState("now");

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("variant");
    if (k && VARIANTS.some((v) => v.key === k)) setKey(k); // eslint-disable-line react-hooks/set-state-in-effect -- read the URL once after hydration
  }, []);

  useEffect(() => {
    // the page's reveal observer only sees the first render; show swapped-in content at once
    document.querySelectorAll("#how .rise, #parent .rise").forEach((el) => el.classList.add("is-in"));
  }, [key]);

  const change = (k: string) => {
    setKey(k);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", k);
    window.history.replaceState(null, "", url);
  };

  const V = (VARIANTS.find((v) => v.key === key) ?? VARIANTS[0]).C;
  return (
    <>
      {key === "E" ? howParent : how}
      <V />
      <PrototypeSwitcher variants={VARIANTS} current={key} onChange={change} />
    </>
  );
}

export function ParentPrototype({ how, howParent }: { how: ReactNode; howParent: ReactNode }) {
  return SHOW_PROTOTYPES ? <Switch how={how} howParent={howParent} /> : how;
}
