// Drawn product visuals: workbook pages, covers, the mailer and the phone scan.
// Pure server components; their reveal animations are driven by the `is-in` class from <Motion />.
import type { CSSProperties, ReactNode } from "react";
import { BRAND } from "@/lib/site";

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function Fr({ n, d }: { n: number; d: number }) {
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

export function PageFrac({ label = "Book 3 · Page 12" }: { label?: string }) {
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

export function PageNext() {
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

export function PageRead() {
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

export function Cover({ name, book, subject, bg }: { name: string; book: string; subject: string; bg?: string }) {
  return (
    <div className="cover" style={bg ? ({ "--bg-c": bg } as Vars) : undefined} aria-hidden="true">
      <div className="brand">
        {BRAND}
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

export function Parcel({ name = "Maya" }: { name?: string }) {
  return (
    <div className="parcel" data-io role="img" aria-label={`A kraft mailer with a ${BRAND} workbook made for ${name} sliding out of it`}>
      <Cover name={name} book="Book 4" subject="Fractions" />
      <div className="env">
        <div className="lbl">
          {name} P.<span>Vancouver, BC</span>
        </div>
        <div className="stmp">
          Book
          <br />4
        </div>
      </div>
    </div>
  );
}

export function Scan({ done = true }: { done?: boolean }) {
  return (
    <div className="scan" data-io role="img" aria-label="A phone photographs a finished workbook page">
      <PageFrac />
      <div className="phone">
        <div className="scr">
          <PageFrac />
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

export function Report() {
  return (
    <div
      className="report"
      role="img"
      aria-label="A progress report for Maya: adding fractions 3 of 4 right; keeps coming back: added the bottom numbers; next book: same bottom numbers, on its way."
    >
      <div className="rh">
        <b>Maya · Grade 4</b>
        <span>
          <i />
          Updated just now
        </span>
      </div>
      <div className="rr">
        <span>Adding fractions</span>
        <span>3 of 4</span>
      </div>
      <div className="bar">
        <i style={{ "--w": "75%" } as Vars} />
      </div>
      <div className="rr">
        <span>Keeps coming back</span>
        <span className="red">Added the bottoms</span>
      </div>
      <div className="rr nx">
        <span>Next book</span>
        <span>Same bottoms · on its way</span>
      </div>
    </div>
  );
}

export function Knot() {
  return <span className="knot" data-thread aria-hidden="true" />;
}

export function Rise({ as: Tag = "div", d = 0, className = "", children, ...rest }: { as?: "div" | "p" | "h1" | "h2" | "li" | "ul"; d?: number; className?: string; children: ReactNode } & Record<string, unknown>) {
  const T = Tag as "div";
  return (
    <T className={`rise ${className}`.trim()} style={d ? ({ "--d": `${d}s` } as Vars) : undefined} {...rest}>
      {children}
    </T>
  );
}

export type { Vars };
