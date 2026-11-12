// How it works (D-216, prototype round r32, layout A): six steps from the free assessment to the next workbook, each
// shown with the real product. Cards 01, 04 and 05 are animated (how-demos.tsx); cards 02, 03 and 06 show the paper:
// Leah's sample workbook pages and her next cover (public/whats-included, whats-included-parts.tsx).
/* eslint-disable @next/next/no-img-element -- fixed-size crops of the sample workbook pages inside the card picture */
import type { ReactNode } from "react";
import Link from "next/link";
import { Section, SectionHeader, StepCard, StepGrid } from "@/ds";
import { ASSETS, MarkedPage, NextCover } from "@/components/whats-included-parts";
import { ReportDemo, ScanDemo, TeachingDemo } from "@/components/how-demos";
import { Knot, Rise, type Vars } from "./drawn";
import "./how-it-works.css";

const d = (s: number) => ({ "--d": `${s}s` }) as Vars;

const STEPS: { n: string; title: string; text: ReactNode; vis: ReactNode; label: string }[] = [
  {
    n: "01",
    title: "Start with a free assessment",
    text: "A short test online, on a laptop or tablet. The report shows the level your child works at and the skills to work on next.",
    vis: <ReportDemo />,
    label: "A sample report: Leah is working at a grade 2 level, one below her school grade, and number and operations needs attention.",
  },
  {
    n: "02",
    title: "Their workbook arrives",
    text: "Made from the report, for your child only, and mailed home. Two a month. The first month is free.",
    vis: (
      <div className="how-v how-v-open">
        <img src={`${ASSETS}/wb/leah-02-plan.jpg`} alt="" />
        <img src={`${ASSETS}/wb/leah-03-d1p1.jpg`} alt="" />
        <i className="how-gutter" />
      </div>
    ),
    label: "Leah's sample workbook, open at her plan for the book and her first page.",
  },
  {
    n: "03",
    title: "They practise on paper",
    text: <>15 to 30 minutes a day, 5 days a week, in pencil, with rewards for every page. <Link href="/rewards" className="more-link">See the rewards <span aria-hidden="true">→</span></Link></>,
    vis: (
      <div className="how-v how-v-paper">
        <div className="how-tilt"><MarkedPage width={330} name /></div>
      </div>
    ),
    label: "A workbook page with Leah's answers in pencil.",
  },
  {
    n: "04",
    title: "Stuck? The Teaching Assistant helps",
    text: "Children in Grade 3 and up can type to the Teaching Assistant about a workbook question. Maya gives hints and can show an easier example on a shared board.",
    vis: <TeachingDemo />,
    label: "Illustration of a shared board: the Teaching Assistant works through 300 minus 128, then Leah writes the last digit.",
  },
  {
    n: "05",
    title: "Scan the pages. We mark them.",
    text: "Take a photo of each finished page with your phone, on our website. It comes back marked, with the steps for anything wrong.",
    vis: <ScanDemo />,
    label: "A phone on our website takes a photo of a finished page, and the page comes back marked: 8 of 9 right.",
  },
  {
    n: "06",
    title: "The next workbook is made from all of it",
    text: <>More practice where they slipped, less where they are strong. It arrives before this one runs out. <Link href="/sample-report" className="more-link">See a sample report <span aria-hidden="true">→</span></Link></>,
    vis: (
      <div className="how-v how-v-cover">
        <NextCover zoom={0.92} />
      </div>
    ),
    label: "Leah's next workbook cover: borrowing across zero.",
  },
];

export function How() {
  return (
    <Section id="how" aria-labelledby="howT">
      <Knot />
      <Rise>
        <SectionHeader
          className="how-head"
          eyebrow="How it works"
          title="From a free assessment to the next workbook."
          titleId="howT"
          lead={<>Six steps, in the order they happen. <Link href="/whats-included" className="more-link">See what&apos;s included <span aria-hidden="true">→</span></Link></>}
        />
      </Rise>
      <StepGrid>
        {STEPS.map((s, i) => (
          <StepCard
            key={s.n}
            number={s.n}
            title={s.title}
            visual={s.vis && <div className="how-pic" role="img" aria-label={s.label}>{s.vis}</div>}
            visualTone="paper"
            className="rise"
            style={d(i * 0.06)}
          >
            {s.text}
          </StepCard>
        ))}
      </StepGrid>
    </Section>
  );
}
