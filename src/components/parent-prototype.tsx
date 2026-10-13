// PROTOTYPE ONLY (branch site/parent-copy-prototype, round r20). Never merge to main.
// Question: how does the existing "For parents" section answer a busy parent who pays a
// learning centre so they do not have to be involved (Mom's review, 2026-10-12)?
// Every variant stays inside the one existing section. No new section.
// 0 is the current section; A-D are new. Switch with ?variant= or the arrow keys.
// Daily time uses 15-30 minutes (open PR #131).
import type React from "react";
import { Section, SectionHeader } from "@/ds";
import { Parent } from "@/components/parent";
import { ParentSwitch } from "@/components/parent-prototype-switch";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/parent.css";
import "./parent-prototype.css";

export { SHOW_PROTOTYPES } from "@/components/prototype-switcher";

const TITLE = "We do the marking and planning. You hand over the book.";

// A: the four cards stay; the words change.
const QA_A: [string, string][] = [
  ["How much of my time does it take?", "A few minutes a day, and no drive to a centre. Books come to your door. Your child works for 15-30 minutes. You hand them the book and take a photo of the finished pages."],
  ["Do I have to mark it or teach it?", "No. We mark every page from your photo, find the gaps, and plan the next book around them. If your child is stuck, scan the problem. You see every step, explained."],
  ["How do I get my child started?", "Begin with the free math assessment: your child takes it alone, on a laptop or tablet. Pick the same time and spot each day, like right after a snack. Do the first page side by side."],
  ["What if they don't want to?", "Keep it short, and at the same time each day. The book starts at their level, so the first pages are ones they can do. Every finished page also earns points toward rewards they pick. If you need a break, pause. The next book starts where they left off."],
];

function VariantA() {
  return (
    <Section id="parent" aria-labelledby="parentT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="For parents" title={TITLE} titleId="parentT" />
      </Rise>
      <ul className="ask">
        {QA_A.map(([q, a], i) => (
          <Rise as="li" key={q} d={(i % 2) * 0.08}>
            <span className="n">0{i + 1}</span>
            <h3>{q}</h3>
            <p>{a}</p>
          </Rise>
        ))}
      </ul>
    </Section>
  );
}

// B: the parent's whole job, said first and large; three short answers under it.
const QA_B: [string, string][] = [
  ["Do I have to mark it?", "No. We mark every page from your photo, find the gaps, and plan the next book around them."],
  ["What if they get stuck?", "Scan the problem. You see every step, explained, so you do not need to remember how to teach it."],
  ["What if they don't want to?", "The first pages are ones they can do. Every finished page earns points toward rewards they pick. Pause anytime."],
];

function VariantB() {
  return (
    <Section id="parent" aria-labelledby="parentT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="For parents" title="Your part takes a few minutes a day." titleId="parentT" />
      </Rise>
      <Rise className="pp-job">
        <ol>
          <li><span className="n">01</span>Hand them today&apos;s pages.</li>
          <li><span className="n">02</span>Take a photo when they finish.</li>
        </ol>
        <p>That is your part. Your child works for 15-30 minutes. We mark the work, plan the next book and mail it to your door. No drive to a centre. In the first week, sit beside them while they learn the routine.</p>
      </Rise>
      <ul className="ask pp-three">
        {QA_B.map(([q, a], i) => (
          <Rise as="li" key={q} d={i * 0.06}>
            <h3>{q}</h3>
            <p>{a}</p>
          </Rise>
        ))}
      </ul>
    </Section>
  );
}

// C: a list of the jobs a parent does not have to do, each struck out, then the two that stay.
const NOT_YOURS: [string, string][] = [
  ["Drive to a centre and wait", "Books come to your door."],
  ["Mark every page", "We mark it from your photo."],
  ["Find the right level", "The free assessment places them."],
  ["Plan what comes next", "The next book is built from their work."],
  ["Remember how to teach it", "Scan a problem to see every step."],
];

const BOOK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 7h6" /></svg>;
const CAM = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3" /><circle cx="12" cy="13" r="3.5" /><path d="M9 6l1.5-2h3L15 6" /></svg>;
const FOOT = "If they do not want to, keep it short. Every finished page earns points toward rewards they pick. Pause anytime.";

// Round r21: five versions of the right-hand "what stays with you" panel. The struck-out list stays the same.

// C1: the r20 card, for reference.
function YoursList() {
  return (
    <Rise className="pp-yours">
      <h3>What stays with you</h3>
      <ul>
        <li>Hand them the book at the same time each day. They work for 15-30 minutes.</li>
        <li>Take a photo of the finished pages.</li>
        <li>In the first week, sit beside them while they learn the routine.</li>
      </ul>
      <p>{FOOT}</p>
    </Rise>
  );
}

// C2: two big icon tiles, one per job, with an arrow between them.
function YoursTiles() {
  return (
    <Rise className="pp-yours y-tiles">
      <h3>What stays with you: two things.</h3>
      <div className="tiles">
        <div><span className="ic">{BOOK}</span><b>Hand over the book</b><small>Same time each day</small></div>
        <span className="arr" aria-hidden="true">→</span>
        <div><span className="ic">{CAM}</span><b>Take a photo</b><small>When the pages are done</small></div>
      </div>
      <p className="wk">First week only: sit beside them while they learn the routine.</p>
      <p>{FOOT}</p>
    </Rise>
  );
}

// C3: one practice session as a bar. The parent's parts are thin slivers; the child's work and ours fill the rest.
function YoursBar() {
  return (
    <Rise className="pp-yours y-bar">
      <h3>One day, start to finish</h3>
      <div className="bar" role="img" aria-label="You hand over the book, your child works for 15-30 minutes, you take a photo, then we mark the work and plan the next book.">
        <span className="you" />
        <span className="kid">Your child, 15-30 min</span>
        <span className="you" />
        <span className="us">Us</span>
      </div>
      <ol className="keys">
        <li><i className="you" />You hand over the book.</li>
        <li><i className="kid" />Your child works on their own pages.</li>
        <li><i className="you" />You take a photo of the finished pages.</li>
        <li><i className="us" />We mark the work and plan the next book.</li>
      </ol>
      <p>{FOOT} In the first week, sit beside them while they learn the routine.</p>
    </Rise>
  );
}

// C4: a sticky note with a two-line checklist, in the hand-drawn feel of the page.
function YoursNote() {
  return (
    <Rise className="y-note-wrap">
      <div className="y-note">
        <h3>Your list</h3>
        <ul>
          <li><span className="box" aria-hidden="true" />Hand them the book</li>
          <li><span className="box" aria-hidden="true" />Take a photo of the pages</li>
        </ul>
        <p className="wk">Week 1: sit beside them.</p>
      </div>
      <p>Your child works for 15-30 minutes a day. {FOOT}</p>
    </Rise>
  );
}

// C5: a week on one line. Five school days with the same two jobs; the weekend is off.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function YoursWeek() {
  return (
    <Rise className="pp-yours y-week">
      <h3>Your week</h3>
      <div className="days">
        {DAYS.map((d, i) => (
          <div key={d} className={i > 4 ? "off" : ""}>
            <span className="d">{d}</span>
            {i > 4 ? <span className="o">Off</span> : <><span className="ic">{BOOK}</span><span className="ic">{CAM}</span></>}
          </div>
        ))}
      </div>
      <ol className="keys">
        <li><span className="ic">{BOOK}</span>Hand them the book. They work for 15-30 minutes.</li>
        <li><span className="ic">{CAM}</span>Take a photo of the finished pages.</li>
      </ol>
      <p>In the first week, sit beside them while they learn the routine. {FOOT}</p>
    </Rise>
  );
}

function VariantC({ yours = <YoursList /> }: { yours?: React.ReactNode }) {
  return (
    <Section id="parent" aria-labelledby="parentT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="For parents" title="Less for you to do, not more." titleId="parentT" lead="A busy week does not need another job. Here is what we take off your list." />
      </Rise>
      <div className="pp-list">
        <ul className="pp-off" aria-label="What we do for you">
          {NOT_YOURS.map(([job, how], i) => (
            <Rise as="li" key={job} d={i * 0.05}>
              <s>{job}</s>
              <span>{how}</span>
            </Rise>
          ))}
        </ul>
        {yours}
      </div>
    </Section>
  );
}

// D: the parent's own question as a large quote; the answers as rows, question left, answer right.
const QA_D: [string, string][] = [
  ["Your time", "A few minutes a day. Your child works for 15-30 minutes. You hand them the book and take a photo of the finished pages."],
  ["Marking", "We mark every page from your photo, find the gaps, and plan the next book around them."],
  ["Teaching", "Not needed. If your child is stuck, scan the problem. You see every step, explained."],
  ["Travel", "None. Books come to your door, so there is no drive and no waiting room."],
  ["Getting started", "The free assessment places them. Pick a time each day, and do the first page side by side."],
];

function VariantD() {
  return (
    <Section id="parent" aria-labelledby="parentT">
      <Knot />
      <div className="pp-quote">
        <Rise>
          <p className="eyebrow">For parents</p>
          <h2 id="parentT">&ldquo;I&apos;m busy. How much of this falls on me?&rdquo;</h2>
          <p className="lead">No drive to a centre. We do the marking and the planning.</p>
        </Rise>
        <dl className="pp-rows">
          {QA_D.map(([k, v], i) => (
            <Rise key={k} d={i * 0.05}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Rise>
          ))}
        </dl>
      </div>
    </Section>
  );
}

const VARIANTS = [
  { key: "C1", name: "C card: bullet list (r20)" },
  { key: "C2", name: "C card: two icon tiles" },
  { key: "C3", name: "C card: one-day bar" },
  { key: "C4", name: "C card: sticky note" },
  { key: "C5", name: "C card: your week" },
  { key: "0", name: "Current" },
  { key: "A", name: "Same cards, new words" },
  { key: "B", name: "Your two jobs, said first" },
  { key: "D", name: "Parent's question + rows" },
];

export function ParentPrototype() {
  return (
    <ParentSwitch
      variants={VARIANTS}
      fallback="C1"
      nodes={{
        C1: <VariantC />,
        C2: <VariantC yours={<YoursTiles />} />,
        C3: <VariantC yours={<YoursBar />} />,
        C4: <VariantC yours={<YoursNote />} />,
        C5: <VariantC yours={<YoursWeek />} />,
        "0": <Parent />,
        A: <VariantA />,
        B: <VariantB />,
        D: <VariantD />,
      }}
    />
  );
}
