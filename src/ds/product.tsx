// Unica Learning design system: drawn product pieces (workbook pages, covers, mailer, phone scan,
// progress report). These stand in for product photography; they are real HTML, not images.
// Red marks and handwriting draw in when an ancestor gets the `is-in` class (the site's scroll
// observer adds it); outside the site they render in their finished state.
import type { ReactNode } from "react";
import type { Tone, Vars } from "./basics";

function Fr({ n, d }: { n: number; d: number }) {
  return (
    <span className="fr">
      <span>{n}</span>
      <span>{d}</span>
    </span>
  );
}

function Tick({ delay }: { delay: number }) {
  return (
    <svg className="draw" viewBox="0 0 40 36" style={{ "--len": 60, "--d": `${delay}s` } as Vars} aria-hidden="true">
      <path d="M4 19 L15 30 L37 4" />
    </svg>
  );
}

function Ring({ delay }: { delay: number }) {
  return (
    <svg className="draw" viewBox="0 0 88 80" style={{ "--len": 270, "--d": `${delay}s` } as Vars} aria-hidden="true">
      <path d="M52 6 C24 2 6 18 7 40 C8 64 30 76 50 74 C72 72 84 56 82 36 C80 16 62 4 40 7" />
    </svg>
  );
}

const FRAC_ROWS: [number, number, number, number, number, number, "ok" | "ring"][] = [
  [1, 5, 2, 5, 3, 5, "ok"],
  [2, 6, 3, 6, 5, 6, "ok"],
  [1, 4, 2, 4, 3, 8, "ring"],
  [3, 8, 4, 8, 7, 8, "ok"],
];

function PageFractions({ label }: { label: string }) {
  return (
    <div
      className="page"
      role="img"
      aria-label="A finished fractions page in pencil. Three answers are ticked in red. One answer, 1/4 + 2/4 = 3/8, is circled with the note: added the bottoms."
    >
      <div className="hd">
        <span>{label}</span>
        <span>Fractions</span>
      </div>
      <div className="tt">Adding fractions</div>
      <p className="ins">Add. Show your working.</p>
      {FRAC_ROWS.map(([an, ad, bn, bd, xn, xd, kind], i) => {
        const d = 0.2 + i * 0.35;
        return (
          <div className="q" key={i}>
            <span className="qn">{i + 1}.</span>
            <Fr n={an} d={ad} />+<Fr n={bn} d={bd} />=
            <span className="ans ink" style={{ "--d": `${d}s` } as Vars}>
              <Fr n={xn} d={xd} />
            </span>
            {kind === "ok" ? (
              <span className="ok">
                <Tick delay={d + 1.4} />
              </span>
            ) : (
              <>
                <span className="ring">
                  <Ring delay={d + 1.4} />
                </span>
                <span className="note ink" style={{ "--d": `${d + 2.2}s` } as Vars}>
                  Added the bottoms
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PageNextBook() {
  const qs: [number, number, number, number][] = [
    [1, 4, 1, 4],
    [2, 5, 2, 5],
    [3, 8, 2, 8],
  ];
  return (
    <div className="page" role="img" aria-label="The first page of the next book, built around adding fractions with the same bottom number.">
      <div className="hd">
        <span>Book 4 · Page 1</span>
        <span>Fractions</span>
      </div>
      <div className="tt">Same bottoms</div>
      <p className="focus">Built from Book 3, page 12</p>
      <div className="eg">
        <b>Example</b>
        <Fr n={1} d={4} />+<Fr n={2} d={4} />=<Fr n={3} d={4} />
      </div>
      {qs.map(([an, ad, bn, bd], i) => (
        <div className="q" key={i}>
          <span className="qn">{i + 1}.</span>
          <Fr n={an} d={ad} />+<Fr n={bn} d={bd} />=<span className="box" />
        </div>
      ))}
    </div>
  );
}

function PageReading() {
  return (
    <div className="page" role="img" aria-label="A reading page about sea otters with one sentence highlighted and a handwritten answer ticked in red.">
      <div className="hd">
        <span>Book 2 · Page 7</span>
        <span>Reading</span>
      </div>
      <div className="tt">The main idea</div>
      <div className="read">
        <p>
          <u>Sea otters hold paws while they sleep so they do not drift apart.</u> Some wrap themselves in kelp to stay in one place.
        </p>
        <p>A group of resting otters is called a raft.</p>
      </div>
      <p className="ins">What is the main idea?</p>
      <div className="q" style={{ height: "14cqw" }}>
        <span className="ans ink" style={{ left: "4cqw", fontSize: "6.6cqw", "--d": ".3s" } as Vars}>
          Otters stay together to sleep
        </span>
        <span className="ok" style={{ left: "84cqw" }}>
          <Tick delay={1.2} />
        </span>
      </div>
    </div>
  );
}

export interface WorkbookPageProps {
  /**
   * `fractions` = a finished page with pencil answers and red marks (one mistake circled);
   * `next-book` = the first page of the next book, built from that mistake;
   * `reading` = a reading comprehension page with a highlighted sentence.
   */
  variant?: "fractions" | "next-book" | "reading";
  /** Header label for the fractions page. */
  label?: string;
}

/** A drawn paper workbook page (aspect 0.76). It scales to its container width. */
export function WorkbookPage({ variant = "fractions", label = "Book 3 · Page 12" }: WorkbookPageProps) {
  if (variant === "next-book") return <PageNextBook />;
  if (variant === "reading") return <PageReading />;
  return <PageFractions label={label} />;
}

const TONE_BG: Record<Tone, string> = { sun: "var(--sun)", sky: "var(--sky)", tang: "var(--tang)", leaf: "var(--leaf)" };

export interface WorkbookCoverProps {
  /** Child's first name, written in handwriting under "Made for". */
  name: string;
  book?: string;
  subject?: string;
  color?: Tone;
  brand?: string;
}

/** Front cover of a personalized workbook. */
export function WorkbookCover({ name, book = "Book 1", subject = "Math", color = "sun", brand = "Unica Learning" }: WorkbookCoverProps) {
  const light = color === "sky" || color === "leaf";
  return (
    <div className={`cover${light ? " on-dark" : ""}`} style={{ "--bg-c": TONE_BG[color] } as Vars} aria-hidden="true">
      <div className="brand">
        {brand}
        <b />
      </div>
      <div className="grid">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} className={[0, 4, 8].includes(i) ? "f" : undefined} />
        ))}
      </div>
      <div className="for">Made for</div>
      <div className="name">{name}</div>
      <div className="bk">
        <span>{book}</span>
        <span>{subject}</span>
      </div>
    </div>
  );
}

export interface CoverStackProps {
  /** Up to three covers; the last one sits on top. */
  covers?: WorkbookCoverProps[];
}

/** Three fanned workbook covers that spread apart on hover. */
export function CoverStack({
  covers = [
    { name: "Arjun", book: "Book 2", subject: "Reading", color: "sky" },
    { name: "Leo", book: "Book 5", subject: "Math", color: "leaf" },
    { name: "Maya", book: "Book 4", subject: "Fractions", color: "sun" },
  ],
}: CoverStackProps) {
  return (
    <div className="stack" aria-hidden="true">
      {covers.slice(0, 3).map((c) => (
        <WorkbookCover key={c.name} {...c} />
      ))}
    </div>
  );
}

export interface MailerProps {
  name?: string;
  city?: string;
  book?: number;
  subject?: string;
  /** Let the page's scroll observer slide the book out; leave false to show it out. */
  animate?: boolean;
}

/** Kraft mailer with a personalized workbook sliding out of it. Fills its container. */
export function Mailer({ name = "Maya", city = "Vancouver, BC", book = 4, subject = "Fractions", animate = false }: MailerProps) {
  return (
    <div className={animate ? "parcel" : "parcel is-in"} data-io role="img" aria-label={`A kraft mailer with a workbook made for ${name} sliding out of it`}>
      <WorkbookCover name={name} book={`Book ${book}`} subject={subject} />
      <div className="env">
        <div className="lbl">
          {name} P.<span>{city}</span>
        </div>
        <div className="stmp">
          Book
          <br />
          {book}
        </div>
      </div>
    </div>
  );
}

export interface PhoneScanProps {
  /** Show the "Page 12 scanned" confirmation chip. */
  done?: boolean;
  /** Let the page's scroll observer pop the chip in; leave false to show it. */
  animate?: boolean;
}

/** A phone photographing a finished workbook page. Fills its container. */
export function PhoneScan({ done = true, animate = false }: PhoneScanProps) {
  return (
    <div className={animate ? "scan" : "scan is-in"} data-io role="img" aria-label="A phone photographs a finished workbook page">
      <PageFractions label="Book 3 · Page 12" />
      <div className="phone">
        <div className="scr">
          <PageFractions label="Book 3 · Page 12" />
          <span className="vf" />
          <span className="shut" />
        </div>
      </div>
      {done && (
        <span className="chip leaf done" style={{ "--tilt": "-3deg" } as Vars}>
          Page 12 scanned
        </span>
      )}
    </div>
  );
}

export interface ProgressReportProps {
  child?: string;
  /** Child's age in years. */
  age?: number;
  skill?: string;
  score?: number;
  total?: number;
  /** The mistake that keeps coming back (shown in red). */
  recurring?: string;
  next?: string;
  updated?: string;
  /** Let the page's scroll observer fill the score bar; leave false to show it filled. */
  animate?: boolean;
}

/** The parent's progress report card: score bar, recurring mistake, next book. */
export function ProgressReport({
  child = "Maya",
  age = 9,
  skill = "Adding fractions",
  score = 3,
  total = 4,
  recurring = "Added the bottoms",
  next = "Same bottoms · on its way",
  updated = "Updated just now",
  animate = false,
}: ProgressReportProps) {
  const pct = `${Math.round((score / Math.max(total, 1)) * 100)}%`;
  return (
    <div className={animate ? "report" : "report is-in"} role="img" aria-label={`Progress report for ${child}: ${skill} ${score} of ${total}; keeps coming back: ${recurring}; next book: ${next}.`}>
      <div className="rh">
        <b>
          {child} · Age {age}
        </b>
        <span>
          <i />
          {updated}
        </span>
      </div>
      <div className="rr">
        <span>{skill}</span>
        <span>
          {score} of {total}
        </span>
      </div>
      <div className="bar">
        <i style={{ "--w": pct } as Vars} />
      </div>
      <div className="rr">
        <span>Keeps coming back</span>
        <span className="red">{recurring}</span>
      </div>
      <div className="rr nx">
        <span>Next book</span>
        <span>{next}</span>
      </div>
    </div>
  );
}

export type { ReactNode };
