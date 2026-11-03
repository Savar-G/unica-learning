"use client";

// PROTOTYPE ONLY (throwaway, branch site/maya-section-prototype). Question: how should the "Help when they're stuck"
// section be laid out so it takes less space but still plays the full demo video?
// Five variants on the real home page, switchable via ?variant=A..E (now = the live section for comparison).
// Dev only: guidance.tsx renders the live section in production.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Section } from "@/ds";
import { DemoVideo } from "./demo-video";
import { Knot } from "./drawn";
import { PrototypeSwitcher } from "./prototype-switcher";
import "@/ds/styles/guidance-prototype.css";

const VARIANTS = ["A", "B", "C", "D", "E", "now"];
const NAMES: Record<string, string> = {
  A: "Tightened stack",
  B: "Split: text left, video right",
  C: "Video + chapter rail",
  D: "Annotated video",
  E: "Compact + theater mode",
  now: "Live section today",
};

const EYEBROW = "Help when they're stuck";
const TITLE = "Stuck on a question? Meet Maya, our AI teaching assistant.";
const LEAD = "Maya helps your child with the problems they're stuck on.";
const CAPTION = "Shown without sound. The captions show what is said on the call.";
const LABEL = "Demo of a voice call: Maya, the Unica AI teaching assistant, explains 27 + 39 out loud and draws it on a shared board, showing how to carry the 1 to get 66. Captions show what is said.";

const POINTS: [string, string][] = [
  ["A real conversation", "Your child talks, listens and can ask why at any step."],
  ["See each step", "Maya draws every step on the board as it is explained."],
  ["On their exact question", "Maya knows the workbook page and question your child is on."],
];

// Chapter start times (seconds), read from the demo video frames.
const CHAPTERS: [number, string][] = [
  [0, "Your child calls Maya about question 5"],
  [3, "Maya writes 27 + 39 on the board"],
  [9, "Ones first: 7 + 9 = 16"],
  [15, "Where does the 1 go?"],
  [24, "Tens: 1 + 2 + 3 = 6, so 66"],
  [33, "Back to the workbook to fix it"],
];

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
  return (
    <div className="gp gp-c">
      <Head className="gp-row" />
      <div className="gp-c-body" ref={wrap}>
        <Media />
        <ol className="gp-chapters" aria-label="What happens in the demo">
          {CHAPTERS.map(([s, text], i) => {
            const end = CHAPTERS[i + 1]?.[0] ?? dur;
            const fill = i < active ? 1 : i === active ? Math.min(1, (t - s) / (end - s)) : 0;
            return (
              <li key={s} className={i === active ? "on" : i < active ? "done" : ""}>
                <button type="button" onClick={() => seek(s)}>
                  <span className="ts">0:{String(s).padStart(2, "0")}</span>
                  <span className="tx">{text}</span>
                  <i style={{ transform: `scaleY(${fill})` }} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <Cap className="gp-c-cap" />
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
  const v = params.get("variant") ?? "A";
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
      </Section>
      <PrototypeSwitcher variants={VARIANTS} names={NAMES} />
    </>
  );
}
