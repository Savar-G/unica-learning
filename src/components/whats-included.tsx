// /whats-included (D-170, D-179): everything a family gets, in the order it happens. Built from design round r162
// (.design/experiments/r162): the free assessment, the workbook (a 3D book that turns its pages), the AI Teaching
// Assistant, the Unica app scanning the open workbook (S-A), the parent dashboard on the web and in the app (D-A),
// and the next workbook with where each change comes from. Product screens are sample data.
/* eslint-disable @next/next/no-img-element -- fixed-size product mockups; next/image wrappers would break the absolute layout */
import Link from "next/link";
import { BRAND } from "@/lib/site";
import { warpTransform, type Quad } from "@/lib/warp";
import { Eyebrow, Nav as NavBar, Section } from "@/ds";
import { Motion } from "@/components/motion";
import { StartLink, StartNote } from "@/components/start-link";
import { Footer, START_LABEL } from "@/components/sections";
import { DemoVideo } from "./demo-video";
import { Rise } from "./drawn";
import { Fit } from "./fit";
import { WorkbookReader } from "./whats-included-book";
import { ScanPhone } from "./whats-included-scan";
import { DashboardDemo } from "./whats-included-dash";
import { SourceWires } from "./whats-included-wires";
import { ASSETS, MarkedPage, NextCover, PageTwo, TAG_LABEL, type Change } from "./whats-included-parts";
import "@/ds/styles/guidance.css";
import "./whats-included.css";

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Pricing", href: "/#price" },
  { label: "FAQ", href: "/#faq" },
];

function StepHead({ eyebrow, title, lead, id, children }: { eyebrow: string; title: string; lead: string; id: string; children?: React.ReactNode }) {
  return (
    <Rise className="wi-st">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id}>{title}</h2>
      <p className="lead">{lead}</p>
      {children}
    </Rise>
  );
}

// ---------- the scan photo (S-A) ----------
// Corners (top-left, top-right, bottom-left, bottom-right) on the 1280 x 960 base photo, measured on a grid. The base
// photo is AI generated on a white table with blank pages and a blank screen (D-180); the pages and the app screens are
// ours. Each page keeps its 541 x 700 shape, so it sits inside the paper with a top and bottom margin.
const PAGE_L: Quad = [178, 160, 642, 165, 178, 762, 642, 763];
const PAGE_R: Quad = [645, 165, 1100, 162, 645, 763, 1100, 760];
const SCREEN: Quad = [298, 345, 474, 345, 298, 716, 474, 716];
const CROP = { x: 100, y: 60, w: 1080, h: 830 };

function ScanPhoto() {
  const mask = `url('${ASSETS}/mask-paper.png')`;
  return (
    <Fit w={CROP.w} h={CROP.h} className="wi-ov-fit">
      <div className="wi-ov">
        <div className="wi-ov-in" style={{ transform: `translate(${-CROP.x}px, ${-CROP.y}px)` }}>
          <img className="wi-ov-bg" src={`${ASSETS}/scan-base.jpg`} alt="A parent holds a phone over an open Unica workbook. The Unica app finds page 1, marks it, and shows 28 of 30 right." />
          <div className="wi-ov-paper" style={{ WebkitMaskImage: mask, maskImage: mask }}>
            <div className="wi-warp" style={{ width: 541, height: 700, transform: warpTransform(541, 700, PAGE_L) }}><MarkedPage width={541} name className="flat" /></div>
            <div className="wi-warp" style={{ width: 541, height: 700, transform: warpTransform(541, 700, PAGE_R) }}><PageTwo width={541} className="flat" /></div>
          </div>
          <div className="wi-warp wi-ov-screen" style={{ width: 282, height: 564, transform: warpTransform(282, 564, SCREEN) }}><ScanPhone /></div>
          <div className="wi-warp wi-ov-glare" style={{ width: 282, height: 564, transform: warpTransform(282, 564, SCREEN) }} />
        </div>
      </div>
    </Fit>
  );
}

// ---------- the next workbook, built from three sources ----------
const SOURCES: { title: string; sub: string; thumb: React.ReactNode; showed: string; changes: Change["tag"][]; labels: string[] }[] = [
  {
    title: "From her marked pages", sub: "Every page she scans in the Unica app",
    thumb: <div className="th-page"><MarkedPage width={260} marks /></div>,
    showed: "When she borrows, she takes the smaller digit from the bigger one, like 5 − 0 instead of 0 − 5. Carrying: all right.",
    changes: ["more", "less"], labels: ["borrowing across zero", "carrying"],
  },
  {
    title: "From her sessions with Maya", sub: "The AI Teaching Assistant",
    thumb: <div className="th-maya"><img src={`${ASSETS}/maya.png`} alt="" /><span>Let&apos;s look at 300 − 128 together.</span></div>,
    showed: "Most of her questions to Maya were about borrowing. On 300 − 128 she needed Maya's steps, then finished on her own.",
    changes: ["more"], labels: ["borrowing across zero"],
  },
  {
    title: "From her first assessment", sub: "And the monthly re-check",
    thumb: <div className="th-lv"><small>Working level</small><b>Grade 2</b><div className="sc">{["K", "1", "2", "3", "4", "5"].map((g) => <i key={g} className={g === "2" ? "on" : g === "3" ? "sch" : ""}>{g}</i>)}</div><em>School grade: 3</em></div>,
    showed: "Her working level, and the skills still to come at that level.",
    changes: ["new", "rev"], labels: ["multiplying by 10", "unit fractions"],
  },
];
const COVER_CHANGES: Change[] = [
  { tag: "more", label: "more", text: "Borrowing across zero", from: [1, 2] },
  { tag: "new", label: "new", text: "Multiplying by 10", from: [3] },
  { tag: "less", label: "less", text: "Carrying, now strong", from: [1] },
  { tag: "rev", label: "rev", text: "Unit fractions", from: [3] },
];

function Sources() {
  return (
    <div className="wi-nx">
      <SourceWires />
      <ol className="wi-srcs">
        {SOURCES.map((s, i) => (
          <li className="wi-srcc" key={s.title}>
            <div className="th" aria-hidden="true">{s.thumb}</div>
            <div className="tx">
              <div className="hd"><i>{i + 1}</i><div><b>{s.title}</b><span>{s.sub}</span></div></div>
              <p><em>What it showed:</em> {s.showed}</p>
              <p className="to"><em>In Workbook 04:</em>{s.changes.map((t, k) => <span key={t}> <b className={`wi-t ${t}`}>{TAG_LABEL[t]}</b> {s.labels[k]}</span>)}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="wi-cvw">
        <NextCover changes={COVER_CHANGES} zoom={1.12} />
        <p className="wi-cvn">It arrives before this workbook runs out. Pause or skip one in the app.</p>
      </div>
    </div>
  );
}

// ---------- closing cards ----------
const CARDS = [
  {
    tone: "t1", title: "Free assessment", text: "A short test online. A report shows the level and what to work on.",
    im: (
      <div className="ct-q">
        <small>Question 4 of 20</small>
        <b>Which number is 10 more than 47?</b>
        <div className="opts">{["37", "48", "57", "147"].map((o) => <i key={o} className={o === "57" ? "on" : ""}>{o}</i>)}</div>
      </div>
    ),
  },
  {
    tone: "t2", title: "Workbook", text: "Made from the free assessment. Mailed home, two a month.",
    im: (
      <div className="ct-books">
        <img className="back" src={`${ASSETS}/wb/leah-02-plan.jpg`} alt="" />
        <img className="front" src={`${ASSETS}/wb/leah-01-cover.jpg`} alt="" />
      </div>
    ),
  },
  {
    tone: "t3", title: "AI Teaching Assistant", text: "Maya works through a stuck question on a shared whiteboard.",
    im: (
      <div className="ct-board">
        <div className="ct-sum"><span>300</span><span>− 128</span><span className="ans">172</span></div>
        <div className="maya"><img src={`${ASSETS}/maya.png`} alt="" /><span>Maya</span></div>
      </div>
    ),
  },
  { tone: "t4", title: "Unica app", text: "Scan the pages. They come back marked, with the steps.", im: <img className="ct-phone" src={`${ASSETS}/app-marked.png`} alt="" /> },
  { tone: "t5", title: "Parent dashboard", text: "Level, skills, past work and sessions with Maya.", im: <div className="mini-br wide"><div className="bar" /><img src={`${ASSETS}/dash.jpg`} alt="" /></div> },
  {
    tone: "t6", title: "Next workbook", text: "Built on everything before it. Arrives before this one ends.",
    im: (
      <div className="ct-next">
        <img className="prev" src={`${ASSETS}/wb/leah-01-cover.jpg`} alt="" />
        <div className="cur"><NextCover zoom={0.4} /></div>
      </div>
    ),
  },
];

const MAYA_LABEL = "Demo: Maya, the AI Teaching Assistant, explains 27 + 39 on a shared whiteboard and draws each step, carrying the 1 to get 66. Captions show what Maya says.";

export function WhatsIncluded() {
  return (
    <div className="look-root" data-look="warm" id="top">
      <NavBar brand={BRAND} home="/" links={LINKS} cta={<StartLink className="btn sm" src="included-nav">Free assessment</StartLink>} />
      <div className="frame">
        <main id="main" className="wi">
          <Rise className="wi-hero">
            <Eyebrow>What&apos;s included</Eyebrow>
            <h1>Everything your child gets, in the order it happens.</h1>
            <p className="lead">A free assessment, a workbook made for your child, and help when they get stuck. Then each new workbook is built from everything that came before.</p>
            <div className="wi-cta">
              <StartLink src="included-hero">{START_LABEL}</StartLink>
              <Link className="btn ghost" href="/sample-report">See a sample report</Link>
            </div>
          </Rise>

          <Section className="wi-row" aria-labelledby="wiAs">
            <StepHead id="wiAs" eyebrow="Free assessment" title="It starts with a free assessment." lead="Your child takes a short test online, on a laptop or tablet. Then you get a report: the level your child works at, and the skills to work on next.">
              <Link className="wi-lnk" href="/sample-report">See a sample report <span aria-hidden="true">→</span></Link>
            </StepHead>
            <div className="wi-as">
              <div className="wi-browser"><div className="bar"><i /><i /><i /><span>unicalearning.com</span></div><img src={`${ASSETS}/test-question.jpg`} alt="A question in the free assessment, with a whiteboard for working" /></div>
              <div className="rep"><img src={`${ASSETS}/report-level.webp`} alt="Leah's report: the level she works at" /></div>
            </div>
          </Section>

          <Section className="wi-band" aria-labelledby="wiWb">
            <StepHead id="wiWb" eyebrow="Personalized workbook" title="Then your child's workbook arrives." lead="Made from the free assessment, personalized for your child, and mailed home." />
            <WorkbookReader />
          </Section>

          <Section className="wi-gd" aria-labelledby="wiTa">
            <StepHead id="wiTa" eyebrow="AI Teaching Assistant" title="If they get stuck, Maya helps them work it out." lead="Maya, the Unica AI Teaching Assistant, opens the exact question from the workbook on a whiteboard they both see. Maya explains each step out loud and draws it. Your child answers, asks why, or picks up the pen." />
            <Rise className="gd-media">
              <DemoVideo className="gd-wide" src="/video/guidance-demo.mp4" poster="/video/guidance-demo-poster.jpg" label={MAYA_LABEL} />
              <DemoVideo className="gd-board" src="/video/guidance-demo-board.mp4" poster="/video/guidance-demo-board-poster.jpg" label={MAYA_LABEL} />
              <p className="gd-cap">Shown without sound. The captions show what Maya says.</p>
            </Rise>
          </Section>

          <Section className="wi-full" aria-labelledby="wiApp">
            <StepHead id="wiApp" eyebrow="Unica app" title="When the day's pages are done, scan them. The app marks them." lead="Take a photo of each page in the Unica app. Each page comes back marked in seconds, with the steps for anything wrong." />
            <ScanPhoto />
          </Section>

          <Section className="wi-full center" aria-labelledby="wiDb">
            <StepHead id="wiDb" eyebrow="Parent dashboard" title="Every scan updates your dashboard." lead="Level, skills, past work and every session with Maya, on the website or in the app. One account for both." />
            <DashboardDemo />
          </Section>

          <Section className="wi-full" aria-labelledby="wiNx">
            <StepHead id="wiNx" eyebrow="Next workbook" title="Then the next workbook is made from all of it." lead="Her marked pages, her sessions with Maya and her assessment decide what comes next: more practice where she slipped, less where she is strong. It arrives before this one runs out." />
            <Sources />
          </Section>

          <Section className="wi-closing" aria-labelledby="wiAll">
            <Rise>
              <Eyebrow>All of it, together</Eyebrow>
              <h2 id="wiAll">From a free assessment to the next workbook.</h2>
            </Rise>
            <ul className="wi-cards">
              {CARDS.map((c) => (
                <li key={c.title}>
                  <div className={`im ${c.tone}`} aria-hidden="true">{c.im}</div>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                </li>
              ))}
            </ul>
            <div className="wi-end">
              <StartLink src="included">{START_LABEL} <span className="arr">→</span></StartLink>
              <StartNote />
            </div>
          </Section>
        </main>
        <Footer />
      </div>
      <Motion />
    </div>
  );
}
