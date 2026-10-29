// "Personalized for your child" (D-096, option D "Fork" of round r18): two sample Grade 3 children, Leah and Kai,
// get two different learning programs. The section sits after How it works. The sheets are real workbook pages exported
// from Figma (V7 Leah, and Kai sample pages) as WebP in public/samples/. A tap on a page opens it full size (PageDeck).
import Image from "next/image";
import { Section, SectionHeader } from "@/ds";
import { SAMPLE_CHILDREN, type SampleChild } from "@/lib/sample-children";
import { Knot, Rise } from "./drawn";
import { PageDeck } from "./page-deck";
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
    </Section>
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
            <div className="pz-thumb"><PageDeck id={id} name={SAMPLE_CHILDREN[id].name} pages={PAGES[id].map((alt, n) => <SheetImage key={n} src={`/samples/${NAMES[id]}-${n + 1}.webp`} alt={alt} />)} /></div>
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

// ---------- The workbook pages ----------
const NAMES = { a: "leah", b: "kai" } as const;

const PAGES: Record<"a" | "b", string[]> = {
  a: [
    "A page from Leah's workbook: a worked example of borrowing across a zero, 403 − 168 = 235, with a spot-the-error box.",
    "A practice page from Leah's workbook: one worked subtraction across a zero, then six for her to finish.",
    "A word-problems page from Leah's workbook: three take-away stories with space to show her work.",
    "A review page from Leah's workbook: eight quick questions from earlier days and four mixed stories.",
  ],
  b: [
    "A page from Kai's workbook introducing multiplication with equal groups and dot arrays.",
    "A practice page from Kai's workbook: dot arrays and groups to turn into multiplication facts.",
    "A word-problems page from Kai's workbook: four stories about equal groups and sharing.",
    "A step-up page from Kai's workbook: missing factors, sharing 28 cookies, and a fact family.",
  ],
};

// Serves both the ~340px thumb and the ~644px dialog, so sizes is set for the larger of the two.
function SheetImage({ src, alt }: { src: string; alt: string }) {
  return <Image className="pz-sheet" src={src} alt={alt} width={816} height={1056} sizes="(max-width: 699px) 92vw, 644px" />;
}
