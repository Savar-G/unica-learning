// Resource article: /resources/kumon-vs-mathnasium
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx.
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "kumon-vs-mathnasium",
  title: "Kumon vs Mathnasium: cost, method and fit",
  description:
    "Kumon vs Mathnasium in BC: subjects, method, time and cost side by side, with Kumon prices as listed in October 2026 and questions to ask both centres.",
  category: "Comparing options",
  lead: "Kumon and Mathnasium both start with an assessment and set a child's own plan, but they differ in subjects, routine and how they publish prices.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "Which costs more, Kumon or Mathnasium?",
      a: "We cannot compare them on price from public pages. Kumon BC centres listed $180 to $260 per subject per month in October 2026, plus an $80 enrolment fee. Mathnasium's North Vancouver page describes a flat monthly membership and a one-time enrolment fee but does not print the price. Ask your local Mathnasium centre for a written quote.",
    },
    {
      q: "How much does Mathnasium cost in BC?",
      a: "Mathnasium does not publish a price on its North Vancouver centre page. It describes a flat monthly membership plus a one-time enrolment fee, and says the membership price is the same online or in person. Call or visit the centre for the price for your child.",
    },
    {
      q: "Does Mathnasium teach reading?",
      a: "No. Mathnasium describes itself as math-only. Kumon offers math and reading as separate subjects, each with its own monthly fee.",
    },
    {
      q: "How often do kids go to Kumon or Mathnasium?",
      a: "Kumon says most students visit the centre twice a week and do daily work at home, about 30 minutes per subject a day. Mathnasium's North Vancouver page says most students attend two to three times a week.",
    },
    {
      q: "Can my child do Kumon or Mathnasium online?",
      a: "Yes, both list online options. Kumon lists a Canada Virtual centre at $150 per subject per month (October 2026). Mathnasium's North Vancouver page says its membership price is the same online or in person.",
    },
  ],
  sources: [
    { label: "Kumon Vancouver - Marpole: centre page, Pricing and Fees", url: "https://www.kumon.com/vancouver-marpole/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Surrey - Fraser Heights: centre page, Pricing and Fees", url: "https://www.kumon.com/surrey-fraser-heights/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon North Vancouver - Capilano Mall: centre page, Pricing and Fees", url: "https://www.kumon.com/north-vancouver-capilano-mall/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Canada Virtual: centre page, Pricing and Fees", url: "https://www.kumon.com/canada-virtual/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Canada: What is Kumon?", url: "https://www.kumon.com/resources/canadian_english/what-kumon/", accessed: "2026-10-09" },
    { label: "Kumon: Understanding student progress in Kumon", url: "https://www.kumon.com/resources/understanding-student-progress-in-kumon-what-to-look-for-and-where-to-find-it/", accessed: "2026-10-09" },
    { label: "Mathnasium of North Vancouver: centre page and FAQ", url: "https://www.mathnasium.com/ca/math-centres/northvancouver", accessed: "2026-10-09" },
    { label: "Math Tutor Network (Vancouver): rates", url: "https://www.mathtutornetwork.com/rates.html", accessed: "2026-10-09" },
    { label: "TutorLyft: How much does a math tutor in Vancouver cost per hour? (updated June 28, 2026)", url: "https://www.tutorlyft.com/blogs/how-much-does-a-math-tutor-in-vancouver-cost-per-hour", accessed: "2026-10-09" },
    { label: "Mathnasium franchise site (describes Mathnasium as a math-only education franchise)", url: "https://franchise.mathnasium.com/", accessed: "2026-10-09" },
    { label: "Kumon: How Kumon works", url: "https://www.kumon.com/how-kumon-works", accessed: "2026-10-09" },
  ],
  related: ["kumon-cost-bc", "is-kumon-worth-it", "kumon-alternatives", "tutor-cost-bc"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>Kumon: math and reading. Mathnasium: math only.<Cite n={5} /><Cite n={10} /></>,
          <>Both start with an assessment and set each child&apos;s own plan.<Cite n={5} /><Cite n={7} /></>,
          <>Kumon BC centres listed $180-$260 per subject per month in October 2026, plus $80 enrolment.<Cite n={1} /><Cite n={2} /></>,
          <>Mathnasium North Vancouver: flat monthly membership plus enrolment fee; price not published.<Cite n={7} /></>,
          <>Kumon: centre typically twice a week plus daily work at home. Mathnasium: most students attend 2-3 times a week.<Cite n={5} /><Cite n={7} /></>,
        ]}
      />

      <p>
        Kumon vs Mathnasium is a common question for BC parents who look at learning centres. Both have centres in the Lower
        Mainland, and both set a plan for your child. This guide puts them side by side using each company&apos;s own pages:
        what they teach, how the work happens, how often your child goes, and what it costs as listed in October 2026. It does
        not judge which one gets better results, because we have no fair test for that.
      </p>

      <Section title="Kumon vs Mathnasium side by side" id="side-by-side">
        <DataTable
          caption="Kumon vs Mathnasium in BC (October 2026)"
          columns={["", "Kumon", "Mathnasium"]}
          rows={[
            ["Subjects", <>Math and reading, as separate subjects<Cite n={5} /></>, <>Math only<Cite n={10} /></>],
            ["Assessment at start", <>Placement test sets the starting level<Cite n={5} /></>, <>Diagnostic assessment, then a customized learning plan<Cite n={7} /></>],
            ["Method", <>A sequence of worksheets; each child moves through the levels at their own pace<Cite n={5} /></>, <>Work from the child&apos;s own learning plan<Cite n={7} /></>],
            ["Where the work happens", <>At the centre and at home; an online Canada Virtual centre is listed<Cite n={4} /><Cite n={5} /></>, <>At the centre or online<Cite n={7} /></>],
            ["How often", <>Centre typically twice a week; daily work at home, about 30 minutes per subject a day<Cite n={5} /><Cite n={11} /></>, <>Most students attend 2-3 times a week<Cite n={7} /></>],
            ["How progress is tracked", <>Instructor grades each worksheet and plans lessons<Cite n={5} />; parents can check the myKumon portal, and the Kumon Connect app for digital worksheets<Cite n={6} /></>, "Ask the centre"],
            ["BC cost", <>$180-$260 per subject / month, plus $80 enrolment; materials fee $20-$30 at most centres<Cite n={1} /><Cite n={2} /></>, <>Flat monthly membership plus one-time enrolment fee; price not published, ask the centre<Cite n={7} /></>],
          ]}
          note="From each company's own pages, October 2026. Prices and schedules vary by centre; confirm with your local centre."
        />
      </Section>

      <Section title="Method: how each one teaches" id="method">
        <h3>Kumon</h3>
        <p>
          Kumon gives a placement test at enrolment to set the starting level. Your child then works through a set sequence of
          worksheets and moves up at their own pace. The instructor grades the work and uses it to plan lessons.<Cite n={5} /> Kumon
          is built on daily practice, most of it at home: 15 to 30 minutes of work a day,<Cite n={5} /> or about 30 minutes per
          subject.<Cite n={11} />
        </p>
        <h3>Mathnasium</h3>
        <p>
          Mathnasium starts with a diagnostic assessment and then builds a customized learning plan for your child. The work
          happens at the centre or online, and most students attend two to three times a week.<Cite n={7} /> Ask the centre
          whether there is work to do at home.
        </p>
        <p>
          In short: Kumon describes daily work, most of it at home. Mathnasium&apos;s North Vancouver page describes sessions two
          to three times a week, at the centre or online.
        </p>
      </Section>

      <Section title="Cost: Kumon vs Mathnasium in BC" id="cost">
        <p>
          Kumon centre pages print their fees. The BC centres we read listed tuition of $180-$260 per subject per month, with most
          between $190 and $220, plus a one-time $80 enrolment fee per student and a materials fee of $20-$30 at most
          centres.<Cite n={1} /><Cite n={2} /> For example, North Vancouver - Capilano Mall listed $200-$220.<Cite n={3} /> Math and
          reading together is two subjects, so about $360-$520 a month at those centres. Kumon&apos;s online Canada Virtual centre
          listed $150 per subject per month.<Cite n={4} /> See the full list in{" "}
          <Link href="/resources/kumon-cost-bc">how much Kumon costs per month in BC</Link>.
        </p>
        <p>
          Mathnasium does not print a price on its North Vancouver page. It describes a flat monthly membership and a one-time
          enrolment fee, and says the membership price is the same online or in person.<Cite n={7} /> So the only way to compare
          cost is to ask your local Mathnasium centre for a quote and set it beside your local Kumon centre&apos;s fees.
        </p>
        <Callout label="Tip">
          <p>Ask both centres for the total for your first three months: enrolment, tuition or membership, and any materials fee. That number is easier to compare than a monthly rate.</p>
        </Callout>
      </Section>

      <Section title="Time commitment" id="time">
        <p>
          With Kumon, plan on centre visits, typically twice a week, plus daily work at home, about 30 minutes per
          subject.<Cite n={5} /><Cite n={11} /> Two subjects can mean up to about an hour of work a day, and Kumon says the program
          needs a special commitment from parents.<Cite n={11} />
        </p>
        <p>
          With Mathnasium, most students attend two to three times a week.<Cite n={7} /> Ask how long each session is and add the
          drive time, unless you choose the online option.
        </p>
      </Section>

      <Section title="Which may suit your child" id="fit">
        <p>These are things to weigh, not verdicts. Children differ, and so do centres.</p>
        <h3>Kumon may suit a family that</h3>
        <ul>
          <li>wants both math and reading from one provider;</li>
          <li>wants daily paper practice and has time to keep a home routine;</li>
          <li>has a child who likes steady, short practice and clear levels.</li>
        </ul>
        <h3>Mathnasium may suit a family that</h3>
        <ul>
          <li>needs help with math only;</li>
          <li>prefers scheduled sessions two to three times a week;</li>
          <li>wants the option of online sessions at the same price as in person.</li>
        </ul>
        <p>
          If you are still unsure about Kumon itself, read <Link href="/resources/is-kumon-worth-it">is Kumon worth it?</Link>
        </p>
      </Section>

      <Section title="A third option" id="third-option">
        <p>
          Kumon and Mathnasium are not the only choices. A private tutor works one-on-one. One Vancouver tutoring company lists K to 7
          math from $38-$40 an hour,<Cite n={8} /> and a Vancouver tutoring blog gives a range of about $30-$100.<Cite n={9} />
        </p>
        <p>
          Workbooks at home are another route. Unica mails personalized math workbooks for ages 6 to 12 that follow
          the BC curriculum at your child&apos;s level, with a free online math assessment first and about 15-30 minutes a day, 5
          days a week. Math costs CAD 79.99 a month, delivery included, with the first month
          free and cancel anytime. More options are in our{" "}
          <Link href="/resources/kumon-alternatives">guide to Kumon alternatives</Link>.
        </p>
      </Section>

      <Section title="Questions to ask both centres" id="questions">
        <ol>
          <li>What is the full monthly cost for my child, and what one-time fees are there?</li>
          <li>How long is each session, and how many sessions a week do you suggest for my child?</li>
          <li>How much work happens at home, and how long does it take each day?</li>
          <li>What does the starting assessment test, and will I see the results?</li>
          <li>How will I see progress, and how often will you talk to me about it?</li>
          <li>Does the work follow the BC curriculum for my child&apos;s grade, or a separate sequence?</li>
          <li>How do I pause or cancel, and how much notice do you need?</li>
        </ol>
      </Section>

      <AssessmentCta slug={meta.slug}>
        Before you pick a centre, see where your child is. The free online math assessment shows their math level and gaps.
      </AssessmentCta>
    </>
  );
}
