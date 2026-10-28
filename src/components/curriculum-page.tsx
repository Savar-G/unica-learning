// /curriculum (draft, Oct 27, 2026): how the program is built, for parents. 30 levels from the BC curriculum,
// Kindergarten to Grade 9; the grade appears once, in the lead, and never next to a level (levels, not grades).
// Level content lives in src/lib/curriculum.ts. Uses the site nav and footer, like /compare.
import Link from "next/link";
import { BRAND } from "@/lib/site";
import { CURRICULUM_GROUPS } from "@/lib/curriculum";
import { Eyebrow, Nav as NavBar } from "@/ds";
import { Motion } from "@/components/motion";
import { StartLink, StartNote } from "@/components/start-link";
import { Footer, START_LABEL } from "@/components/sections";
import { CurriculumPath } from "./curriculum-path";
import { Rise } from "./drawn";
import "./curriculum-page.css";

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Curriculum", href: "/curriculum" },
  { label: "Pricing", href: "/#price" },
  { label: "FAQ", href: "/#faq" },
];

const HOW: [string, string][] = [
  ["A workbook every two weeks", "A new paper workbook arrives in the mail every two weeks, built from your child's last one."],
  ["About 15 to 40 minutes a day*", "Five days a week. Younger children do shorter days."],
  ["Shown first", "Each new idea starts with a worked example, so your child sees how it's done."],
  ["Small steps", "Practice builds from easy to harder, one small change at a time."],
  ["Remember these?", "Every day brings back something learned earlier, so old skills stay fresh."],
  ["Adjusts as they go", "We look at the pages you scan. The next workbook adds practice where it's needed and new ideas when they're ready."],
  ["A test to move up", "A short test at the end of each level shows when your child is ready for the next one."],
];

export function CurriculumPage() {
  return (
    <div className="look-root" data-look="warm" id="top">
      <NavBar brand={BRAND} home="/" links={LINKS} cta={<StartLink className="btn sm" src="curriculum-nav">Free assessment</StartLink>} />
      <div className="frame">
        <main id="main" className="curp">
          <Rise className="curp-head">
            <Eyebrow>Our curriculum</Eyebrow>
            <h1><span className="curp-hl">30 levels,</span> built from the BC curriculum.</h1>
            <p className="lead">From counting to 10 to graphing equations, Kindergarten to Grade 9. Your child starts at the level the free assessment finds, not a level set by age, and moves up when they&apos;re ready.</p>
          </Rise>

          <Rise className="curp-path" aria-label="Levels 1 to 30">
            <CurriculumPath groups={CURRICULUM_GROUPS} />
          </Rise>

          <section className="curp-part" aria-labelledby="curpHowT">
            <h2 className="curp-kicker" id="curpHowT">How a level works</h2>
            <Rise>
              <ul className="curp-how">
                {HOW.map(([title, text]) => <li key={title}><b>{title}</b><span>{text}</span></li>)}
              </ul>
              <p className="curp-note">*A typical target. Every child works at their own pace, so some days take a little more or less time.</p>
            </Rise>
          </section>

          <section className="curp-part" aria-labelledby="curpLevelsT">
            <h2 className="curp-kicker" id="curpLevelsT">What each level covers</h2>
            {CURRICULUM_GROUPS.map((g, gi) => (
              <details key={g.name} className={`curp-group g${gi + 1}`} open={gi === 0}>
                <summary>
                  <span className="curp-group-name">{g.name}</span>
                  <span className="curp-group-sub">{g.levels[0].title} → {g.levels[g.levels.length - 1].title}</span>
                </summary>
                <div className="curp-levels">
                  {g.levels.map((l) => (
                    <article key={l.n} id={`level-${l.n}`} className="curp-level">
                      <p className="curp-num">Level {l.n}</p>
                      <h3>{l.title}</h3>
                      <ul>{l.points.map((p) => <li key={p}>{p}</li>)}</ul>
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </section>

          <Rise className="curp-end">
            <h2>Find out which level your child starts at.</h2>
            <p>The math assessment and report are free. The first month of workbooks is free too.</p>
            <div>
              <StartLink src="curriculum">{START_LABEL} <span className="arr">→</span></StartLink>
              <StartNote />
            </div>
            <Link href="/sample-report" className="curp-more">See a sample report</Link>
          </Rise>
        </main>
        <Footer />
      </div>
      <Motion />
    </div>
  );
}
