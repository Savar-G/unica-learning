// "Personalized for your child" (D-096, option D "Fork" of round r18): two sample Grade 3 children, Leah and Kai,
// get two different learning programs. The section sits after How it works. The pages are built from the real
// question bank (src/lib/sample-children.ts): the words, numbers and answers are the templates' own; the pictures are
// drawn from the filled values. A tap on a page opens it full size (PageZoom).
import Link from "next/link";
import type { ReactNode } from "react";
import { Section, SectionHeader } from "@/ds";
import { SAMPLE_CHILDREN, kaiPage, leahPage, type PageItem, type SampleChild, type SampleChildId } from "@/lib/sample-children";
import { Knot, Rise } from "./drawn";
import { PageZoom } from "./page-zoom";
import "@/ds/styles/personalization.css";

const TITLE = "Every child learns differently. Different pace, different style. So we build each child their own learning program.";
const LINES: [keyof Pick<SampleChild, "result" | "style">, string][] = [
  ["result", "Assessment"],
  ["style", "Learning style"],
];

export function Personalization() {
  return (
    <Section id="personal" aria-labelledby="personalT" className="pz">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="Personalized for your child" title={TITLE} titleId="personalT" />
      </Rise>
      <Fork />
      <Footnote />
    </Section>
  );
}

function Footnote() {
  return (
    <div className="pz-foot">
      <Link className="more-link" href="/sample-report">See a sample report <span aria-hidden="true">→</span></Link>
    </div>
  );
}

function Lines({ child }: { child: SampleChild }) {
  return (
    <dl className="pz-lines">
      {LINES.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{child[key]}</dd>
        </div>
      ))}
    </dl>
  );
}

function Who({ child }: { child: SampleChild }) {
  return (
    <div className="pz-who">
      <span className={`pz-dot pz-dot-${child.id}`} aria-hidden="true" />
      <h3>{child.name}</h3>
      <span className="chip">{child.tag}</span>
    </div>
  );
}

// Fork: one shared start, then the pencil line splits to the two children, each with the first page of their next book.
function Fork() {
  return (
    <div className="pz-fork">
      <Rise className="pz-start">
        <span className="eyebrow">Meet Leah and Kai</span>
        <p>Leah and Kai are both in Grade 3. They get the same lessons every day. But Leah is falling behind, and Kai is ready for more.</p>
      </Rise>
      <svg className="pz-branch" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M200 0 C200 30 100 30 100 60 M200 0 C200 30 300 30 300 60" />
      </svg>
      <div className="pz-forks">
        {(["a", "b"] as const).map((id, i) => (
          <Rise key={id} d={i * 0.08} className="pz-row">
            <div className="pz-thumb"><PageZoom id={id} name={SAMPLE_CHILDREN[id].name}><BankPage id={id} /></PageZoom></div>
            <div>
              <Who child={SAMPLE_CHILDREN[id]} />
              <Lines child={SAMPLE_CHILDREN[id]} />
            </div>
          </Rise>
        ))}
      </div>
    </div>
  );
}

// ---------- The bank pages ----------
const PAGES: Record<SampleChildId, { head: string; title: string; ins: string; items: () => PageItem[]; alt: string }> = {
  a: {
    head: "Leah · Next book · Page 1 of 6",
    title: "Regrouping in stories",
    ins: "Read the story. Line up the tens and ones. When the ones make 10 or more, carry 1 ten.",
    items: leahPage,
    alt: "First page of Leah's next book: one worked story problem with the carried 1 marked, then three story problems that need regrouping.",
  },
  b: {
    head: "Kai · Next book · Page 1",
    title: "Multiplication with rows and groups",
    ins: "Use the picture. Count the rows, then the number in each row.",
    items: kaiPage,
    alt: "First page of Kai's next book: three multiplication problems, each with a picture: an array of chairs, groups of cookies on plates, and rows of books.",
  },
};

export function BankPage({ id }: { id: SampleChildId }) {
  const p = PAGES[id];
  const items = p.items();
  return (
    <div className="bpage" role="img" aria-label={p.alt}>
      <div className="bp-hd"><span>{p.head}</span><span>Math</span></div>
      <div className="bp-tt">{p.title}</div>
      <p className="bp-ins">{p.ins}</p>
      {items.map((it, i) => (
        <div className={it.worked ? "bp-q bp-eg" : "bp-q"} key={it.templateId + i}>
          {it.worked ? <b className="bp-tag">Example</b> : <span className="bp-n">{i + (items[0].worked ? 0 : 1)}.</span>}
          {it.level > 3 && <b className="bp-tag bp-up">Grade 4</b>}
          <p>{it.prompt}</p>
          {it.worked && <Column {...it.worked} />}
          {it.picture && <Picture p={it.picture} />}
          {!it.worked && !it.picture && <ColumnBlank a={it.values.a} b={it.values.b} op={/left/.test(it.prompt) ? "−" : "+"} />}
          {!it.worked && <span className="bp-line" />}
        </div>
      ))}
    </div>
  );
}

function Column({ a, b, carry, answer }: { a: number; b: number; carry: number; answer: number }) {
  return (
    <div className="bp-col">
      <span className="bp-carry">{carry || ""}</span>
      <span>{a}</span>
      <span>+ {b}</span>
      <span className="bp-ans">{answer}</span>
    </div>
  );
}

function ColumnBlank({ a, b, op }: { a: number; b: number; op: string }) {
  return (
    <div className="bp-col bp-blank">
      <span>{a}</span>
      <span>{op} {b}</span>
      <span className="bp-box" />
    </div>
  );
}

function Picture({ p }: { p: NonNullable<PageItem["picture"]> }): ReactNode {
  if (p.kind === "array") {
    const r = 6, gap = 16;
    const w = p.each * gap, h = p.rows * gap;
    return (
      <svg className="bp-pic" viewBox={`0 0 ${w} ${h}`} style={{ width: `${Math.min(100, p.each * 7)}%` }} aria-hidden="true">
        {Array.from({ length: p.rows }, (_, y) =>
          Array.from({ length: p.each }, (_, x) => <circle key={`${x}-${y}`} cx={x * gap + gap / 2} cy={y * gap + gap / 2} r={r / 1.4} />),
        )}
      </svg>
    );
  }
  const plate = 46;
  return (
    <svg className="bp-pic" viewBox={`0 0 ${p.groups * (plate + 8)} ${plate}`} style={{ width: `${p.groups * 16}%` }} aria-hidden="true">
      {Array.from({ length: p.groups }, (_, g) => (
        <g key={g} transform={`translate(${g * (plate + 8) + plate / 2} ${plate / 2})`}>
          <circle r={plate / 2 - 1} className="bp-plate" />
          {Array.from({ length: p.each }, (_, k) => {
            const a = (k / p.each) * Math.PI * 2 - Math.PI / 2;
            return <circle key={k} cx={Math.cos(a) * 12} cy={Math.sin(a) * 12} r={4.5} />;
          })}
        </g>
      ))}
    </svg>
  );
}
