// "Personalized for your child" (D-096, option D "Fork" of round r18): two sample Grade 3 children, Leah and Kai,
// get two different learning programs. The section sits after How it works. The pages are built from the real
// question bank (src/lib/sample-children.ts): the words, numbers and answers are the templates' own; the pictures are
// drawn from the filled values. A tap on a page opens it full size (PageDeck).
import Link from "next/link";
import type { ReactNode } from "react";
import { Section, SectionHeader } from "@/ds";
import { ReportCard } from "@/components/report";
import { SAMPLE_CHILDREN, kaiPage, kaiPage2, kaiPage3, kaiPage4, leahPage, leahPage2, leahPage3, leahPage4, sampleReportView, type PageItem, type SampleChild, type SampleChildId } from "@/lib/sample-children";
import { Knot, Rise } from "./drawn";
import { PageDeck } from "./page-deck";
import { ReportPeek } from "./report-peek";
import "@/ds/styles/personalization.css";

const TITLE = "Same grade. Different program.";

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

// The real sample report in a small scrollable window, with a link to the full page under it.
function Footnote() {
  return (
    <div className="pz-foot">
      <div className="pz-peek">
        <ReportPeek>
          <ReportCard view={sampleReportView()} readOnly />
        </ReportPeek>
        <Link className="btn pz-peek-btn" href="/sample-report">See a sample report <span aria-hidden="true">→</span></Link>
      </div>
    </div>
  );
}

function Lines({ child }: { child: SampleChild }) {
  const lines: [string, string][] = [
    ["Gap", child.gap],
    [child.programLabel, child.program],
  ];
  return (
    <dl className="pz-lines">
      {lines.map(([label, text]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{text}</dd>
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
    </div>
  );
}

// Fork: one shared start, then the pencil line splits to the two children, each with sample sheets from their program.
function Fork() {
  return (
    <div className="pz-fork">
      <Rise className="pz-start">
        <span className="eyebrow">Meet Leah and Kai</span>
        <p>Leah and Kai are both in Grade 3. The assessment found different gaps, so their programs are different.</p>
      </Rise>
      <svg className="pz-branch" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
        <path d="M200 0 C200 30 100 30 100 60 M200 0 C200 30 300 30 300 60" />
      </svg>
      <div className="pz-forks">
        {(["a", "b"] as const).map((id, i) => (
          <Rise key={id} d={i * 0.08} className="pz-row">
            <div className="pz-thumb"><PageDeck id={id} name={SAMPLE_CHILDREN[id].name} pages={PAGES[id].map((_, n) => <BankPage key={n} id={id} n={n} />)} /></div>
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
interface Sheet { head: string; job: string; title: string; ins: string; items: () => PageItem[]; alt: string }

const PAGES: Record<SampleChildId, Sheet[]> = {
  a: [
    {
      head: "Leah's program",
      job: "Practice",
      title: "Regrouping in stories",
      ins: "Read the story. Line up the tens and ones. When the ones make 10 or more, carry 1 ten.",
      items: leahPage,
      alt: "A sample sheet from Leah's program: one worked story problem with the carried 1 marked, then three story problems that need regrouping.",
    },
    {
      head: "Leah's program",
      job: "Practice",
      title: "Borrowing in stories",
      ins: "Read the story. Line up the tens and ones. If the top ones are too small, borrow 1 ten.",
      items: leahPage2,
      alt: "A sample sheet from Leah's program: four take-away story problems that need borrowing.",
    },
    {
      head: "Leah's program",
      job: "Step up",
      title: "Adding hundreds in stories",
      ins: "Read the story. Add the ones, then the tens, then the hundreds. Carry when a column makes 10.",
      items: leahPage3,
      alt: "A sample sheet from Leah's program: four story problems that add three-digit numbers.",
    },
    {
      head: "Leah's program",
      job: "Review",
      title: "Mixed review",
      ins: "Read each problem. Decide what to do, then solve it.",
      items: leahPage4,
      alt: "A sample sheet from Leah's program: a mix of add, take-away and equal-groups problems, one with a picture.",
    },
  ],
  b: [
    {
      head: "Kai's program",
      job: "New",
      title: "Multiplication with rows and groups",
      ins: "Use the picture. Count the rows, then the number in each row.",
      items: kaiPage,
      alt: "A sample sheet from Kai's program: three multiplication problems, each with a picture: an array of chairs, groups of cookies on plates, and rows of books.",
    },
    {
      head: "Kai's program",
      job: "New",
      title: "Sharing equally",
      ins: "Use the picture. Share the items into equal groups, then count how many are in each group.",
      items: kaiPage2,
      alt: "A sample sheet from Kai's program: three sharing and grouping problems, each with a picture of equal groups.",
    },
    {
      head: "Kai's program",
      job: "Practice",
      title: "More rows and groups",
      ins: "Use the picture. Count the rows, then the number in each row.",
      items: kaiPage3,
      alt: "A sample sheet from Kai's program: three more multiplication problems with arrays and equal groups.",
    },
    {
      head: "Kai's program",
      job: "Grade 4",
      title: "Bigger numbers",
      ins: "Use the picture to help. Multiply or share the bigger numbers.",
      items: kaiPage4,
      alt: "A sample sheet from Kai's program: Grade 4 multiplication and sharing problems with bigger numbers.",
    },
  ],
};

export function BankPage({ id, n = 0 }: { id: SampleChildId; n?: number }) {
  const p = PAGES[id][n];
  const items = p.items();
  return (
    <div className="bpage" role="img" aria-label={p.alt}>
      <div className="bp-hd"><span>{p.head}</span><span>{p.job}</span></div>
      <div className="bp-tt">{p.title}</div>
      <p className="bp-ins">{p.ins}</p>
      {items.map((it, i) => (
        <div className={it.worked ? "bp-q bp-eg" : "bp-q"} key={it.templateId + i}>
          {it.worked ? <b className="bp-tag">Example</b> : <span className="bp-n">{i + (items[0].worked ? 0 : 1)}.</span>}
          {it.level > 3 && <b className="bp-tag bp-up">Grade 4</b>}
          <p>{it.prompt}</p>
          {it.worked && <Column {...it.worked} />}
          {it.picture && <Picture p={it.picture} />}
          {!it.worked && !it.picture && it.values.a != null && it.values.b != null && <ColumnBlank a={it.values.a} b={it.values.b} op={it.op ?? (/left/.test(it.prompt) ? "−" : "+")} />}
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
