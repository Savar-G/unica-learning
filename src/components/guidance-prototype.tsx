"use client";

// PROTOTYPE ONLY (throwaway, branch site/maya-section-prototype). Question: how should the "Help when they're stuck"
// section be laid out so it takes less space but still plays the full demo video?
// Round 1: ?variant=A..E. Savar picked C (2026-11-02). Round 2: C plus four variations on it, C2..C5.
// The switcher cycles round 2; A, B, D, E still open by URL. now = the live section for comparison.
// Dev only: guidance.tsx renders the live section in production.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Section } from "@/ds";
import { DemoVideo } from "./demo-video";
import { Knot } from "./drawn";
import { PrototypeSwitcher } from "./prototype-switcher";
import "@/ds/styles/guidance-prototype.css";

const VARIANTS = ["C", "C2", "C3", "C4", "C5", "now"];
const NAMES: Record<string, string> = {
  A: "Tightened stack",
  B: "Split: text left, video right",
  C: "Video + chapter rail",
  D: "Annotated video",
  E: "Compact + theater mode",
  C2: "Header inside the chapter column",
  C3: "Chapter bar under the video",
  C4: "Chapters that open with a short why",
  C5: "Checklist on the left",
  now: "Live section today",
};

const EYEBROW = "Help when they're stuck";
const TITLE = "Meet Maya, our AI teaching assistant.";
const LEAD = "Maya helps your child with the problems they're stuck on.";
const CAPTION = "Shown without sound. The captions show what is said on the call.";
const LABEL = "Demo of a voice call: Maya, the Unica AI teaching assistant, explains 27 + 39 out loud and draws it on a shared board, showing how to carry the 1 to get 66. Captions show what is said.";

const POINTS: [string, string][] = [
  ["A real conversation", "Your child talks, listens and can ask why at any step."],
  ["See each step", "Maya draws every step on the board as it is explained."],
  ["On their exact question", "Maya knows the workbook page and question your child is on."],
];

// Chapter start times (seconds), read from the video captions one frame per second.
const CHAPTERS: [number, string][] = [
  [0, "Your child calls Maya about question 5"],
  [6, "Maya writes 27 + 39 on the board"],
  [9, "Ones first: 7 + 9 = 16"],
  [16, "Where does the 1 go?"],
  [24, "Tens: 1 + 2 + 3 = 6, so 66"],
  [34, "Back to the workbook to fix it"],
];

// What each step shows a parent (C4).
const WHY = [
  "Your child got 56 and asks for help. Maya already knows which question it is.",
  "Maya sets the sum up in columns, the same way the workbook page does.",
  "Maya asks instead of telling. Your child works out 7 + 9 = 16.",
  "Maya asks where the 1 goes. Your child finds the carry.",
  "Your child adds the tens, gets 66 and sees what went wrong.",
  "Maya sends your child back to fix question 5 in the workbook.",
];

const clock = (s: number) => `0:${String(s).padStart(2, "0")}`;

// Follows the wide demo video inside `wrap`: current time, chapter, and seek.
function useChapters() {
  const wrap = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(42);
  useEffect(() => {
    const v = wrap.current?.querySelector<HTMLVideoElement>(".gd-wide");
    if (!v) return;
    const tick = () => { setT(v.currentTime); if (v.duration) setDur(v.duration); };
    v.addEventListener("timeupdate", tick);
    v.addEventListener("loadedmetadata", tick);
    return () => { v.removeEventListener("timeupdate", tick); v.removeEventListener("loadedmetadata", tick); };
  }, []);
  const seek = (s: number) => {
    const v = wrap.current?.querySelector<HTMLVideoElement>(".gd-wide");
    if (!v) return;
    v.currentTime = s;
    void v.play().catch(() => {});
  };
  const active = CHAPTERS.reduce((a, [s], i) => (t >= s ? i : a), 0);
  const fill = (i: number) => {
    const s = CHAPTERS[i][0];
    const end = CHAPTERS[i + 1]?.[0] ?? dur;
    return i < active ? 1 : i === active ? Math.min(1, Math.max(0, (t - s) / (end - s))) : 0;
  };
  const state = (i: number) => (i === active ? "on" : i < active ? "done" : "");
  return [wrap, { active, fill, seek, state }] as const;
}

function Head({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={`gp-head ${className}`.trim()}>
      <p className="eyebrow">{EYEBROW}</p>
      <h2 id="guidanceT">{TITLE}</h2>
      {children ?? <p className="gp-lead">{LEAD}</p>}
    </div>
  );
}

function Media({ className = "" }: { className?: string }) {
  return (
    <div className={`gp-media ${className}`.trim()}>
      <DemoVideo className="gd-wide" src="/video/guidance-demo.mp4" poster="/video/guidance-demo-poster.jpg" label={LABEL} />
      <DemoVideo className="gd-board" src="/video/guidance-demo-board.mp4" poster="/video/guidance-demo-board-poster.jpg" label={LABEL} />
    </div>
  );
}

function Points({ className = "" }: { className?: string }) {
  return (
    <ul className={`gp-points ${className}`.trim()}>
      {POINTS.map(([title, text]) => (
        <li key={title}><b>{title}</b><span>{text}</span></li>
      ))}
    </ul>
  );
}

const Cap = ({ className = "" }: { className?: string }) => <p className={`gp-cap ${className}`.trim()}>{CAPTION}</p>;

// A: same order as today, with the spacing fixed: tight header, video, then points and caption close under it.
function VariantA() {
  return (
    <div className="gp gp-a">
      <Head />
      <Media />
      <div className="gp-a-foot">
        <Points />
        <Cap />
      </div>
    </div>
  );
}

// B: two columns. Text and points on the left, the video on the right at about 60% width.
function VariantB() {
  return (
    <div className="gp gp-b">
      <div className="gp-b-text">
        <Head />
        <Points className="gp-points-stack" />
        <Cap />
      </div>
      <Media />
    </div>
  );
}

// C: compact header row, then the video with a clickable chapter list that follows the video.
function VariantC() {
  const [wrap, ch] = useChapters();
  return (
    <div className="gp gp-c">
      <Head className="gp-row" />
      <div className="gp-c-body" ref={wrap}>
        <Media />
        <ol className="gp-chapters" aria-label="What happens in the demo">
          {CHAPTERS.map(([s, text], i) => (
            <li key={s} className={ch.state(i)}>
              <button type="button" onClick={() => ch.seek(s)}>
                <span className="ts">{clock(s)}</span>
                <span className="tx">{text}</span>
                <i style={{ transform: `scaleY(${ch.fill(i)})` }} />
              </button>
            </li>
          ))}
        </ol>
      </div>
      <Cap className="gp-c-cap" />
    </div>
  );
}

// C2: no header row. The left column holds the header, then the chapters; the video fills the right.
function VariantC2() {
  const [wrap, ch] = useChapters();
  return (
    <div className="gp gp-c2" ref={wrap}>
      <div className="gp-c2-side">
        <Head />
        <ol className="gp-chapters gp-chapters-tight" aria-label="What happens in the demo">
          {CHAPTERS.map(([s, text], i) => (
            <li key={s} className={ch.state(i)}>
              <button type="button" onClick={() => ch.seek(s)}>
                <span className="ts">{clock(s)}</span>
                <span className="tx">{text}</span>
                <i style={{ transform: `scaleY(${ch.fill(i)})` }} />
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="gp-c2-vid">
        <Media />
        <Cap />
      </div>
    </div>
  );
}

// C3: header row as in C; the chapters become a bar of six parts under the video, like video chapters.
function VariantC3() {
  const [wrap, ch] = useChapters();
  return (
    <div className="gp gp-c3">
      <Head className="gp-row" />
      <div className="gp-c3-body" ref={wrap}>
        <Media />
        <ol className="gp-strip" aria-label="What happens in the demo">
          {CHAPTERS.map(([s, text], i) => (
            <li key={s} className={ch.state(i)}>
              <button type="button" onClick={() => ch.seek(s)}>
                <span className="bar"><i style={{ transform: `scaleX(${ch.fill(i)})` }} /></span>
                <span className="tx">{text}</span>
              </button>
            </li>
          ))}
        </ol>
        <Cap />
      </div>
    </div>
  );
}

// C4: as C, but only the playing chapter is open, with one line on what it shows a parent.
function VariantC4() {
  const [wrap, ch] = useChapters();
  return (
    <div className="gp gp-c">
      <Head className="gp-row" />
      <div className="gp-c-body gp-c4-body" ref={wrap}>
        <Media />
        <ol className="gp-acc" aria-label="What happens in the demo">
          {CHAPTERS.map(([s, text], i) => (
            <li key={s} className={ch.state(i)}>
              <button type="button" onClick={() => ch.seek(s)} aria-expanded={i === ch.active}>
                <span className="n">{i + 1}</span>
                <span className="tx">{text}</span>
              </button>
              <div className="gp-why"><p>{WHY[i]}</p></div>
              <span className="bar"><i style={{ transform: `scaleX(${ch.fill(i)})` }} /></span>
            </li>
          ))}
        </ol>
      </div>
      <Cap className="gp-c-cap" />
    </div>
  );
}

// C5: header row as in C; the chapters move to the left as a checklist that ticks off as the video plays.
function VariantC5() {
  const [wrap, ch] = useChapters();
  return (
    <div className="gp gp-c">
      <Head className="gp-row" />
      <div className="gp-c5-body" ref={wrap}>
        <ol className="gp-check" aria-label="What happens in the demo">
          {CHAPTERS.map(([s, text], i) => (
            <li key={s} className={ch.state(i)}>
              <button type="button" onClick={() => ch.seek(s)}>
                <span className="box" aria-hidden="true">{i < ch.active ? "✓" : ""}</span>
                <span className="tx">{text}</span>
              </button>
            </li>
          ))}
        </ol>
        <Media />
      </div>
      <Cap className="gp-c5-cap" />
    </div>
  );
}

// D: centered header, the video in the middle at about 70% width, the three points as callouts in the margins.
function VariantD() {
  return (
    <div className="gp gp-d">
      <Head className="gp-center" />
      <div className="gp-d-stage">
        <div className="gp-d-call l1"><b>{POINTS[2][0]}</b><span>{POINTS[2][1]}</span></div>
        <div className="gp-d-call l2"><b>{POINTS[0][0]}</b><span>{POINTS[0][1]}</span></div>
        <Media />
        <div className="gp-d-call r1"><b>{POINTS[1][0]}</b><span>{POINTS[1][1]}</span></div>
      </div>
      <Cap className="gp-center" />
    </div>
  );
}

// E: text and a smaller video side by side (50/50); a button opens the same video at full screen size.
function VariantE() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="gp gp-e">
      <div className="gp-e-text">
        <Head>
          <p className="gp-lead">{LEAD} By voice, one step at a time, on a board they share. You don&apos;t need to know the answer.</p>
        </Head>
        <Points className="gp-points-inline" />
      </div>
      <div className="gp-e-vid">
        <Media />
        <div className="gp-e-bar">
          <Cap />
          <button type="button" className="gp-e-open" onClick={() => setOpen(true)}>Watch full size <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      {open && (
        <div className="gp-theater" role="dialog" aria-modal="true" aria-label="Demo video" onClick={() => setOpen(false)}>
          <div className="gp-theater-in" onClick={(e) => e.stopPropagation()}>
            <video className="gd-video" src="/video/guidance-demo.mp4" poster="/video/guidance-demo-poster.jpg" autoPlay muted loop playsInline controls aria-label={LABEL} />
            <button type="button" className="gp-theater-x" onClick={() => setOpen(false)}>Close ✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function GuidancePrototype({ live }: { live: ReactNode }) {
  const params = useSearchParams();
  const v = params.get("variant") ?? "C";
  if (v === "now") return <>{live}<PrototypeSwitcher variants={VARIANTS} names={NAMES} /></>;
  return (
    <>
      <Section id="guidance" aria-labelledby="guidanceT" className="gd gp-sec" data-variant={v}>
        <Knot />
        {v === "A" && <VariantA />}
        {v === "B" && <VariantB />}
        {v === "C" && <VariantC />}
        {v === "D" && <VariantD />}
        {v === "E" && <VariantE />}
        {v === "C2" && <VariantC2 />}
        {v === "C3" && <VariantC3 />}
        {v === "C4" && <VariantC4 />}
        {v === "C5" && <VariantC5 />}
      </Section>
      <PrototypeSwitcher variants={VARIANTS} names={NAMES} />
    </>
  );
}
