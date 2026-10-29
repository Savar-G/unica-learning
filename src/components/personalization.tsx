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
            <div className="pz-thumb"><PageDeck id={id} name={SAMPLE_CHILDREN[id].name} pages={PAGES[id].map((alt, n) => <SheetImage key={n} src={`/samples/${FILES[id][n]}-v2.webp`} alt={alt} />)} /></div>
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
const FILES = {
  a: ["leah-stories", "leah-new-idea", "leah-practice", "leah-review"],
  b: ["kai-new-idea", "kai-practice", "kai-stories", "kai-step-up"],
} as const;

const PAGES: Record<"a" | "b", string[]> = {
  a: [
    "A word-problems page from Leah's workbook: three take-away stories, 403 − 168, 605 − 278 and 302 − 145, with space to show her work.",
    "A new-idea page from Leah's workbook: a worked subtraction, 403 − 168 = 235, with the trades marked, and a spot-the-error box.",
    "A practice page from Leah's workbook: one worked subtraction across a zero, one half done, and two for her to finish.",
    "A review page from Leah's workbook: three quick questions from earlier days and a mixed story where she picks add or take away.",
  ],
  b: [
    "A new-idea page from Kai's workbook: equal groups and a 3 by 6 dot array show what multiplication means.",
    "A practice page from Kai's workbook: one worked dot array, then three arrays to turn into multiplication facts.",
    "A word-problems page from Kai's workbook: rows of seats, packs of pencils, and 20 marbles shared between 4 friends.",
    "A step-up page from Kai's workbook: a missing factor, 28 cookies shared by 4, and the fact family of 3, 8 and 24.",
  ],
};

// Serves both the ~340px thumb and the ~644px dialog, so sizes is set for the larger of the two.
function SheetImage({ src, alt }: { src: string; alt: string }) {
  return <Image className="pz-sheet" src={src} alt={alt} width={900} height={1620} sizes="(max-width: 699px) 92vw, 644px" />;
}
