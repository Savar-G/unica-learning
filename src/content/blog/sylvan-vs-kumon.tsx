// Blog post: /blog/sylvan-vs-kumon
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx. Rules: docs/blog-style.md.
import Link from "next/link";
import type { BlogMeta } from "@/lib/blog";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: BlogMeta = {
  slug: "sylvan-vs-kumon",
  title: "Sylvan vs Kumon in BC: cost, method and which fits your child",
  description:
    "Sylvan vs Kumon for BC families: how each one teaches, what BC centres list as prices in October 2026, and how to choose for a child in grades 1-7.",
  category: "Comparing options",
  lead: "Kumon is daily worksheet practice, mostly at home. Sylvan is teacher-led sessions at a centre. Here is how they differ, and what each costs in BC.",
  published: "2026-10-27",
  updated: "2026-10-27",
  faqs: [
    {
      q: "Is Sylvan or Kumon better?",
      a: "Neither is better for every child. Kumon suits a child who needs daily practice to build speed and accuracy, and a family that can keep a home routine. Sylvan suits a child who needs a teacher to explain a topic, in a small group at a centre. Start from what your child needs: practice or explanation.",
    },
    {
      q: "Is Sylvan more expensive than Kumon?",
      a: "At the BC centres we checked, yes. Kumon BC centres listed $180 to $260 per subject per month in October 2026. Sylvan bills per session: Sylvan of Surrey and Newton lists $69 a session month to month, so two sessions a week is about $550 to $620 a month. Prices are set by each centre.",
    },
    {
      q: "How often does a child go to Kumon or Sylvan?",
      a: "Kumon students go to the centre two days a week and do the other five days of worksheets at home, about 30 minutes per subject a day. At Sylvan, the number of sessions a week comes out of the first assessment, and more sessions a week lower the price per session.",
    },
    {
      q: "Do Kumon and Sylvan have a free assessment?",
      a: "Yes. Kumon gives a placement test at no cost at the parent orientation. Sylvan offers a free single-subject Insight Assessment, after which the centre builds a plan and a quote.",
    },
    {
      q: "Does Kumon or Sylvan teach reading too?",
      a: "Both do. Kumon has a math program and a reading program, each priced per subject. Sylvan centres in BC list reading, writing and math for kindergarten to grade 12.",
    },
  ],
  sources: [
    { label: "Kumon Canada: How Kumon works", url: "https://www.kumon.com/ca-en/how-kumon-works", accessed: "2026-10-27" },
    { label: "Kumon of Vancouver - Marpole: centre page, Pricing and Fees", url: "https://www.kumon.com/vancouver-marpole/aboutcenter", accessed: "2026-10-27" },
    { label: "Kumon of Surrey - Fraser Heights: centre page, Pricing and Fees", url: "https://www.kumon.com/surrey-fraser-heights/aboutcenter", accessed: "2026-10-27" },
    { label: "Kumon Canada: Math program", url: "https://www.kumon.com/ca-en/math-program", accessed: "2026-10-27" },
    { label: "Sylvan Learning of Surrey & Newton: membership pricing", url: "https://www.sylvanlearning.com/locations/ca/bc/surrey-tutoring/surrey-newton/pricing/", accessed: "2026-10-27" },
    { label: "Sylvan Learning of Vancouver - Kerrisdale: membership pricing", url: "https://www.sylvanlearning.com/locations/ca/bc/vancouver-tutoring/vancouver-kerrisdale/pricing/", accessed: "2026-10-27" },
    { label: "Sylvan Learning of Richmond: centre page", url: "https://www.sylvanlearning.com/locations/ca/bc/richmond-tutoring/richmond/", accessed: "2026-10-27" },
    { label: "Sylvan Learning: home page, How Sylvan works", url: "https://www.sylvanlearning.com/", accessed: "2026-10-27" },
  ],
  related: ["/resources/kumon-cost-bc", "/blog/mathnasium-cost-bc", "/resources/kumon-alternatives", "/resources/tutor-cost-bc"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>Kumon: worksheets for about 30 minutes per subject a day, 2 days a week at the centre and 5 at home.<Cite n={1} /></>,
          <>Kumon BC centres listed $180-$260 per subject per month in October 2026, plus an $80 enrolment fee.<Cite n={2} /><Cite n={3} /></>,
          <>Sylvan: teacher-led sessions at the centre, priced per session. Surrey &amp; Newton lists $56-$69 a session; Kerrisdale lists $60-$75.<Cite n={5} /><Cite n={6} /></>,
          <>Sylvan adds a one-time registration fee: $149 in Surrey &amp; Newton, $199 in Kerrisdale.<Cite n={5} /><Cite n={6} /></>,
          <>Both start with a free assessment. Prices are set by each centre, so ask yours.</>,
        ]}
      />

      <p>
        Kumon and Sylvan are both learning centres with locations across BC, and both start with a test of your child. After
        that they work in very different ways. Kumon is a practice program: short daily worksheets, most of them done at
        home. Sylvan is teaching: a certified teacher works with your child at the centre. The right choice depends less on the
        brand and more on what your child needs right now.
      </p>

      <Section title="How Kumon works" id="how-kumon-works">
        <p>
          Your child takes a placement test at no cost during the parent orientation.<Cite n={1} /> The instructor uses it to
          pick a starting level, which is often easier than your child&apos;s grade on purpose, so the first weeks feel
          comfortable.
        </p>
        <p>
          Then the routine starts. Daily assignments take about 30 minutes per subject. Two days a week your child does them at
          the Kumon centre; the other five days, at home.<Cite n={1} /> The math program runs from counting through
          addition, multiplication and fractions up to algebra, and each child moves at their own pace.<Cite n={4} />
        </p>
        <p>
          <strong>What it asks of you:</strong> five days a week, someone at home keeps the worksheet routine going. For a
          child in grade 1 or 2, that often means sitting nearby.
        </p>
      </Section>

      <Section title="How Sylvan works" id="how-sylvan-works">
        <p>
          Sylvan starts with its Insight Assessment, free for one subject at BC centres such as Richmond. The centre then builds a
          plan and gives you a quote.<Cite n={7} /> Sylvan describes the assessment as an adaptive test plus teacher observation
          and your child&apos;s own view of school.<Cite n={8} />
        </p>
        <p>
          Sessions happen at the centre, taught by certified teachers trained in the Sylvan method.<Cite n={7} /> How many
          sessions a week your child needs comes from the assessment. BC centres list reading, writing and math for
          kindergarten to grade 12.<Cite n={7} />
        </p>
        <p>
          <strong>What it asks of you:</strong> driving to the centre for each session. The teaching happens there, so there is
          less to supervise at home.
        </p>
      </Section>

      <Section title="What Sylvan and Kumon cost in BC" id="cost">
        <p>
          The two centres charge in different ways. Kumon charges a monthly fee per subject. Sylvan charges per session, and the
          rate drops when you book more sessions a week or sign up for 6 or 12 months.<Cite n={5} />
        </p>
        <DataTable
          caption="Listed prices at BC centres, October 2026"
          columns={["Centre", "Price as listed", "One-time fee", "What it covers"]}
          rows={[
            ["Kumon Vancouver - Marpole", "$230-$260 per subject a month", "$80 enrolment, $30 materials", "2 centre days a week plus home worksheets"],
            ["Kumon Surrey - Fraser Heights", "$180-$200 per subject a month", "$80 enrolment, $20 materials", "2 centre days a week plus home worksheets"],
            ["Sylvan Surrey & Newton", "$69 a session month to month; $56-$66 with a 6 or 12-month minimum", "$149 registration", "Each session at the centre"],
            ["Sylvan Vancouver - Kerrisdale", "$75 a session month to month; $60-$72 with a 6 or 12-month minimum", "$199 registration", "Each session at the centre"],
          ]}
          note={<>Sources: centre pages read on October 27, 2026.<Cite n={2} /><Cite n={3} /><Cite n={5} /><Cite n={6} /> Other centres set their own prices.</>}
        />
        <p>
          To compare them by the month, multiply Sylvan&apos;s rate by the sessions. At two sessions a week (8 or 9 a month), Surrey
          &amp; Newton&apos;s month-to-month rate comes to about $550-$620 a month, and Kerrisdale&apos;s to about $600-$675. One
          Kumon subject at the centres above is $180-$260 a month. Our <Link href="/resources/kumon-cost-bc">guide to Kumon costs in BC</Link>{" "}
          lists more centres.
        </p>
        <Callout label="Ask before you sign" tone="sun">
          <p>
            Ask each centre for its written price list, the fees that come once and the fees that repeat, the notice you need to
            give to stop, and how many sessions a week it recommends for your child. Sylvan&apos;s lower rates need a 6 or
            12-month minimum.<Cite n={5} />
          </p>
        </Callout>
      </Section>

      <Section title="Which one fits your child?" id="which-fits">
        <ul>
          <li><strong>Your child understands the math but is slow or makes small errors:</strong> daily practice is the fix. That is what Kumon is built for.</li>
          <li><strong>Your child does not understand a topic, such as fractions or word problems:</strong> more worksheets will not explain it. A teacher, like Sylvan&apos;s, can.</li>
          <li><strong>You cannot keep a five-day home routine:</strong> Sylvan puts the work at the centre. Kumon depends on the home days.</li>
          <li><strong>You cannot drive across town twice a week:</strong> both need trips to the centre. Kumon also has an online Canada Virtual centre; see our <Link href="/resources/kumon-alternatives">Kumon alternatives guide</Link>.</li>
          <li><strong>The budget is the limit:</strong> Kumon is lower per month at the centres above. A private tutor can also cost less; see <Link href="/resources/tutor-cost-bc">tutor costs in BC</Link>.</li>
        </ul>
        <p>Whichever you pick, both free tests tell you where your child starts. You can take more than one before you decide.</p>
      </Section>

      <AssessmentCta slug="blog-sylvan-vs-kumon">
        Want to see your child&apos;s math level first, at home? Our free online math assessment shows their level and the topics they find hard.
      </AssessmentCta>

      <Section title="A third option: practice made for one child, at home" id="third-option">
        <p>
          Some families want Kumon&apos;s daily paper practice without the drive, and a plan built from their child&apos;s gaps,
          like Sylvan&apos;s, without the session fees. That is what Unica Learning does. Your child takes a free online math
          assessment on a laptop or tablet. Then each paper workbook is made for your child&apos;s level and gaps and mailed home,
          and the next one adapts to their work. See <Link href="/compare">how we compare</Link> with learning centres and tutors.
        </p>
      </Section>
    </>
  );
}
