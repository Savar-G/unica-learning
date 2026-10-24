// Resource article: /resources/is-kumon-worth-it
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx.
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "is-kumon-worth-it",
  title: "Is Kumon worth it? Cost, method and fit for BC families",
  description:
    "Is Kumon worth it for your child? How the Kumon method works, what it costs in BC, the trade-offs to weigh, and questions to ask at the free assessment.",
  category: "Comparing options",
  lead: "A balanced look at how Kumon works, what it costs in BC, and the questions that help you decide if it fits your child.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "Is Kumon worth the money?",
      a: "It depends on your child, your budget and your schedule. Kumon is daily worksheet practice, which Kumon says takes up to about 30 minutes per subject, and most students visit a centre twice a week. In BC, centre pages listed $180 to $260 per subject per month in October 2026. If that routine and price fit your family, it may be worth a try. If not, compare other options first.",
    },
    {
      q: "Is Kumon expensive?",
      a: "At BC centres that list a price, one subject was $180 to $260 a month in October 2026, plus an $80 enrolment fee and, at most centres, a $20 or $30 materials fee. Two subjects cost about twice as much. Kumon's online Canada Virtual centre listed $150 per subject.",
    },
    {
      q: "Is Kumon good for kids?",
      a: "Some children like a steady daily routine and short, clear worksheets. Others find daily practice hard to keep up. Watch how your child responds in the first weeks, and talk with the instructor about what you see.",
    },
    {
      q: "How do I know if daily practice is too much for my child?",
      a: "This applies to any daily practice program, including Kumon and ours. Watch for signs such as tears or arguments at practice time, avoiding the work, or worry about speed. If you see them, talk with your child and with the instructor or provider about the amount of work or the level.",
    },
    {
      q: "Does Kumon qualify for a tax credit?",
      a: "CRA's child care expense deduction is for paying someone to look after a child so you can work or study. CRA lists education fees and leisure activity fees among the expenses you cannot claim. CRA's page does not name tutoring or learning centres, so ask CRA or a tax professional about your case.",
    },
  ],
  sources: [
    { label: "Kumon Canada, What is Kumon?", url: "https://www.kumon.com/resources/canadian_english/what-kumon/", accessed: "2026-10-09" },
    { label: "Kumon Canada, Math program", url: "https://www.kumon.com/ca-en/math-program", accessed: "2026-10-09" },
    { label: "Kumon, How do Kumon's in-person and virtual classes work?", url: "https://www.kumon.com/resources/how-do-kumons-in-person-and-virtual-classes-work/", accessed: "2026-10-09" },
    { label: "Kumon Canada, Understanding student progress in Kumon", url: "https://www.kumon.com/resources/canadian_english/understanding-student-progress-in-kumon-what-to-look-for-and-where-to-find-it/", accessed: "2026-10-09" },
    { label: "Kumon Vancouver - Marpole, centre page (pricing and fees)", url: "https://www.kumon.com/vancouver-marpole/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Surrey - Fraser Heights, centre page (pricing and fees)", url: "https://www.kumon.com/surrey-fraser-heights/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Canada Virtual, centre page (pricing and fees)", url: "https://www.kumon.com/canada-virtual/aboutcenter", accessed: "2026-10-09" },
    { label: "Canada Revenue Agency, Line 21400 child care expenses: expenses you can claim", url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-21400-child-care-expenses/expenses-claim.html", accessed: "2026-10-09" },
    { label: "Kumon, Frequently asked questions", url: "https://www.kumon.com/frequently-asked-questions", accessed: "2026-10-09" },
    { label: "Kumon, How Kumon works", url: "https://www.kumon.com/how-kumon-works", accessed: "2026-10-09" },
    { label: "Canada Revenue Agency, Line 21400 child care expenses", url: "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-21400-child-care-expenses.html", accessed: "2026-10-09" },
  ],
  related: ["kumon-cost-bc", "kumon-alternatives", "kumon-vs-mathnasium", "tutor-cost-bc"],
};

export default function Body() {
  return (
    <>
      <p>
        <strong>Is Kumon worth it?</strong> There is no single answer. Kumon is a daily worksheet program: your child
        starts at a level set by a placement test, practises every day, and typically visits a centre twice a
        week.<Cite n={1} /> Kumon says daily work takes up to about 30 minutes per subject.<Cite n={2} /><Cite n={9} /> In BC, one subject cost $180 to $260 a month at centres that
        listed a price in October 2026.<Cite n={5} /><Cite n={6} /> Whether it is worth it depends on your child, your
        schedule and your budget. This guide sets out the facts and the questions to weigh.
      </p>

      <KeyFacts
        title="Kumon in brief"
        items={[
          <>Subjects: math and reading, charged per subject.<Cite n={9} /></>,
          "Start: a placement test sets the starting level.",
          "Routine: up to about 30 minutes per subject a day; most students visit a centre twice a week.",
          "BC price: $180-$260 per subject a month, plus fees (October 2026).",
          "Online: Kumon's Canada Virtual centre listed $150 per subject.",
        ]}
      />

      <Section title="How the Kumon method works">
        <p>This is how Kumon describes its own program:</p>
        <ul>
          <li>
            <strong>Placement test.</strong> Your child takes a placement test at the start. The instructor uses it to
            choose a starting level.<Cite n={1} />
          </li>
          <li>
            <strong>Worksheets in a set order.</strong> Your child works through a sequence of worksheets, in levels,
            and moves on at their own pace.<Cite n={1} />
          </li>
          <li>
            <strong>Daily practice.</strong> Kumon says each subject takes about 30 minutes a day,<Cite n={2} /> and
            that new students and early learners may need less time.<Cite n={9} />
          </li>
          <li>
            <strong>Centre visits.</strong> Students typically visit the centre twice a week and do most of the work
            at home.<Cite n={1} /> Kumon also runs virtual classes.<Cite n={3} />
          </li>
          <li>
            <strong>Instructor review.</strong> Every worksheet is graded, the child corrects mistakes, and the
            instructor uses the work to plan lessons.<Cite n={1} /> Parents can follow progress in the myKumon portal,
            and families who use digital worksheets can see times and scores in the Kumon Connect app.<Cite n={4} />
          </li>
        </ul>
      </Section>

      <Section title="What Kumon costs in BC">
        <p>Kumon prices for one child, as listed on BC centre pages in October 2026:</p>
        <ul>
          <li><strong>One subject at a BC centre:</strong> $180-$260 a month.<Cite n={5} /><Cite n={6} /></li>
          <li><strong>Two subjects (math and reading):</strong> about $360-$520 a month (twice the per-subject range).</li>
          <li><strong>Enrolment:</strong> $80 per student, once.<Cite n={5} /></li>
          <li><strong>Materials:</strong> $20-$30 at most centres.<Cite n={5} /><Cite n={6} /></li>
          <li><strong>Canada Virtual (online), one subject:</strong> $150 a month.<Cite n={7} /></li>
        </ul>
        <p>Prices vary by centre and can change, so ask your centre for its current fees.</p>
        <p>
          For every BC centre we checked, see{" "}
          <Link href="/resources/kumon-cost-bc">how much Kumon costs per month in BC</Link>.
        </p>
      </Section>

      <Section title="Is Kumon worth it for your child? Fit and trade-offs">
        <p>
          These are points to consider, not a verdict. The same feature can suit one child and not another.
        </p>
        <h3>It may suit a child who</h3>
        <ul>
          <li>likes a clear routine and short tasks with a right answer;</li>
          <li>wants steady daily practice on core skills;</li>
          <li>lives near a centre, or does well with a virtual class.</li>
        </ul>
        <h3>Trade-offs a parent should weigh</h3>
        <ul>
          <li>
            <strong>Time every day.</strong> Up to about 30 minutes per subject a day is up to an hour for math and
            reading.<Cite n={2} /><Cite n={9} /> Ask yourself if that fits after school, sports and homework.
          </li>
          <li>
            <strong>Centre visits.</strong> Two visits a week can mean travel time for a parent, unless you choose
            the virtual option.<Cite n={1} /><Cite n={3} />
          </li>
          <li>
            <strong>Cost for two subjects.</strong> At BC centre prices, math and reading together are about $360-$520
            a month in tuition.<Cite n={5} /><Cite n={6} />
          </li>
          <li>
            <strong>Repetition by design.</strong> Kumon says it uses repetition on purpose, to build mastery, speed
            and accuracy, and assigns it as needed.<Cite n={9} /> Its worksheets include examples that show how to
            solve each type of problem.<Cite n={10} /> Some children like this format. Others prefer more variety.
          </li>
          <li>
            <strong>Who supports the daily work.</strong> Most work is done at home,<Cite n={1} /> and Kumon says the
            program requires a special commitment from parents.<Cite n={10} />
          </li>
        </ul>
        <Callout label="Is daily practice too much for my child?" tone="peach">
          <p>
            This question applies to any daily practice program, including ours. It depends on the child. Watch for
            tears or arguments at practice time, avoiding the work, or worry about speed. If you see them, talk with
            your child and with the instructor about the amount of work or the level.
          </p>
        </Callout>
      </Section>

      <Section title="Questions to ask at the free assessment">
        <ol>
          <li>Which level will my child start at, and why?</li>
          <li>How many worksheets a day, and how long should they take?</li>
          <li>What happens if my child finds the work too hard or too easy?</li>
          <li>How will you tell me about progress, and how often?</li>
          <li>What is the monthly price for one and two subjects, and what are the other fees?</li>
          <li>How do we pause or stop, and how much notice do you need?</li>
          <li>How does the work connect to what my child learns at school in BC?</li>
        </ol>
      </Section>

      <Section title="Does Kumon qualify for a tax credit?">
        <p>
          The CRA child care expense deduction is for amounts paid to have someone look after an eligible child so you
          could earn income, go to school, or carry on research under a grant.<Cite n={11} /> CRA lists, among the expenses you cannot claim, education fees at an
          educational institution (such as tuition for a regular program) and fees for leisure or recreational
          activities.<Cite n={8} /> CRA&apos;s page does not name tutoring or learning centres. Ask CRA or a tax
          professional about your situation.
        </p>
      </Section>

      <Section title="Alternatives to Kumon">
        <p>
          Other options include a private tutor, another learning centre, or workbooks at home. Read{" "}
          <Link href="/resources/kumon-alternatives">Kumon alternatives</Link> for an overview,{" "}
          <Link href="/resources/kumon-vs-mathnasium">Kumon vs Mathnasium</Link> for two centres side by side, and{" "}
          <Link href="/resources/tutor-cost-bc">tutor costs in BC</Link> for hourly rates.
        </p>
        <p>
          Unica is one of these options: personalized math workbooks for ages 6-12, mailed home. The books
          follow the BC curriculum at your child&apos;s level, and your child works on paper for 15-30 minutes a day, 5
          days a week. Math is CAD 79.99 a month, delivery included, and the
          first month is free.
        </p>
      </Section>

      <AssessmentCta slug={meta.slug}>
        Whatever you choose, start by knowing where your child is. Our free online math assessment shows their math
        level and gaps.
      </AssessmentCta>
    </>
  );
}
