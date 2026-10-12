// Resource article: /resources/tutor-cost-bc
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx.
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "tutor-cost-bc",
  title: "How much does a tutor cost in BC? Math and reading tutor rates",
  description:
    "How much does a tutor cost in BC? K-7 math tutoring in Vancouver is listed from $38-$40 an hour; tutors commonly charge $60-$100. Rates and monthly totals.",
  category: "Comparing options",
  lead: "Hourly tutor rates for elementary math and reading in BC, what moves the price, and what a month of tutoring adds up to.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "How much does a math tutor cost per hour in Vancouver?",
      a: "Published rates run from about $30 to $100 an hour. One Vancouver tutoring company lists starting rates for K-7 math of $38 an hour online and $40 in person. A tutoring company blog puts typical Vancouver rates at $60 to $100 an hour.",
    },
    {
      q: "How much does tutoring cost for elementary students?",
      a: "Elementary tutoring usually sits at the lower end of the range, because rates rise with the grade and the subject. For K-7 math in Vancouver, one company lists starting rates of $38-$40 an hour. A certified teacher can charge more.",
    },
    {
      q: "How much does tutoring cost per month?",
      a: "Multiply the hourly rate by the hours. One hour a week for 4 weeks is about $152-$160 at $38-$40 an hour, and $240-$400 at $60-$100 an hour. Two hours a week doubles that.",
    },
    {
      q: "Is online tutoring cheaper than in person?",
      a: "Usually, yes. One Vancouver company lists K-7 math at $38 online and $40 in person. A Canada-wide guide from a tutoring company says online sessions usually cost $15 to $30 an hour less.",
    },
    {
      q: "Is a group lesson cheaper than a private tutor?",
      a: "Per child, yes. One Vancouver company lists K-7 math group lessons from $28 an hour per student online and $30 in person, compared with $38 and $40 for private lessons.",
    },
  ],
  sources: [
    { label: "Kumon Vancouver - Marpole, centre page (pricing and fees)", url: "https://www.kumon.com/vancouver-marpole/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Surrey - Fraser Heights, centre page (pricing and fees)", url: "https://www.kumon.com/surrey-fraser-heights/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Canada Virtual, centre page (pricing and fees)", url: "https://www.kumon.com/canada-virtual/aboutcenter", accessed: "2026-10-09" },
    { label: "Mathnasium North Vancouver, centre page and FAQ", url: "https://www.mathnasium.com/ca/math-centres/northvancouver", accessed: "2026-10-09" },
    { label: "Math Tutor Network Vancouver, Rates (tutoring company page)", url: "https://www.mathtutornetwork.com/rates.html", accessed: "2026-10-09" },
    { label: "TutorLyft, How much does a math tutor in Vancouver cost per hour? (tutoring company blog, updated June 28, 2026)", url: "https://www.tutorlyft.com/blogs/how-much-does-a-math-tutor-in-vancouver-cost-per-hour", accessed: "2026-10-09" },
    { label: "Genie Teacher, How much does a tutor cost in Canada in 2026? (tutoring company blog, updated July 24, 2026)", url: "https://genieteacher.com/blogs/how-much-does-a-tutor-cost-canada", accessed: "2026-10-09" },
  ],
  related: ["kumon-cost-bc", "is-kumon-worth-it", "kumon-alternatives"],
};

export default function Body() {
  return (
    <>
      <p>
        <strong>How much does a tutor cost in BC?</strong> One Vancouver tutoring company lists K-7 math from{" "}
        <strong>$38-$40 an hour</strong>.<Cite n={5} /> Tutoring company blogs put math tutors in Vancouver at $30-$100
        an hour, and say Vancouver tutors in all subjects commonly charge <strong>$60-$100 an hour</strong>.
        <Cite n={6} /><Cite n={7} /> The price depends on who teaches, whether the lessons are online or in person, and
        whether your child learns alone or in a small group. Below are the rates we could confirm, what changes them,
        and what a month adds up to.
      </p>

      <KeyFacts
        title="Tutor rates in BC at a glance"
        items={[
          "K-7 math, Vancouver company: from $38/hour online, $40/hour in person.",
          "Vancouver math tutors overall: about $30-$100 an hour.",
          "Vancouver tutors, all subjects: commonly $60-$100 an hour.",
          "Small groups cost less per child: from $28-$30 an hour.",
          "1 hour a week for 4 weeks: about $152-$400.",
        ]}
      />

      <Section title="Tutor rates for elementary math and reading in BC">
        <p>
          Few tutors publish their prices, so the figures below come from tutoring companies that do. They are company
          pages and blogs, not independent surveys, so treat them as a guide.
        </p>
        <DataTable
          caption="Published tutor rates relevant to BC elementary students, checked October 2026"
          columns={["Source", "Rate per hour", "What it covers"]}
          rows={[
            [<>Math Tutor Network<Cite n={5} /></>, "$38 online, $40 in person", "Private K-7 math, Vancouver, starting rates"],
            [<>Math Tutor Network<Cite n={5} /></>, "$28 online, $30 in person", "Group K-7 math, per student, starting rates"],
            [<>TutorLyft blog<Cite n={6} /></>, "$30-$100; agencies often from $45", "Math tutors in Vancouver, all levels"],
            [<>Genie Teacher blog<Cite n={7} /></>, "$60-$100", "Tutors in Toronto and Vancouver, all subjects"],
          ]}
          note="Rates as published by tutoring companies, checked October 2026. Math Tutor Network says rates vary by location and tutor experience, and adds $5 for lessons shorter than 1.5 hours."
        />
        <h3>What about reading tutors?</h3>
        <p>
          We did not find a BC source that lists reading tutor rates on their own. The Canada-wide bands from Genie
          Teacher cover all subjects: independent qualified tutors at $25-$45 an hour online and $35-$60 in person, and
          certified teachers at $30-$70 online and $60-$100 or more in person.<Cite n={7} /> Ask any reading tutor for
          their rate in writing before the first lesson.
        </p>
      </Section>

      <Section title="What changes the price">
        <ul>
          <li>
            <strong>Online or in person.</strong> Online is usually cheaper. One Vancouver company lists $38 online and
            $40 in person for K-7 math.<Cite n={5} /> Genie Teacher says online usually costs $15-$30 an hour less
            across Canada.<Cite n={7} />
          </li>
          <li>
            <strong>Who teaches.</strong> Genie Teacher lists student tutors at $15-$35 an hour, independent qualified
            tutors at $25-$60, and certified teachers at $30-$100 or more, depending on format.<Cite n={7} />
          </li>
          <li>
            <strong>Agency or independent.</strong> Genie Teacher lists agencies and learning centres at $40-$75
            online and $50-$90 in person.<Cite n={7} /> TutorLyft says agencies in Vancouver often start at
            $45.<Cite n={6} />
          </li>
          <li>
            <strong>Group or private.</strong> Group lessons cost less per child: from $28-$30 an hour for K-7 math at
            one company, compared with $38-$40 private.<Cite n={5} />
          </li>
          <li>
            <strong>Grade and subject.</strong> Rates rise with the grade. The same company lists Math 12 from $44
            online and $46 in person.<Cite n={5} />
          </li>
          <li>
            <strong>Lesson length.</strong> Some tutors charge more per hour for short lessons. Math Tutor Network adds
            $5 for lessons shorter than 1.5 hours.<Cite n={5} />
          </li>
        </ul>
      </Section>

      <Section title="How much a tutor costs per month in BC">
        <p>Most families think in months, not hours. Here is the arithmetic for one child.</p>
        <DataTable
          caption="Monthly tutoring cost, worked example (arithmetic only)"
          columns={["Hourly rate", "1 hour a week x 4 weeks", "2 hours a week x 4 weeks"]}
          rows={[
            [<>$38 (K-7 math, online, starting rate)<Cite n={5} /></>, "$152", "$304"],
            [<>$40 (K-7 math, in person, starting rate)<Cite n={5} /></>, "$160", "$320"],
            [<>$60 (low end, Vancouver tutors)<Cite n={7} /></>, "$240", "$480"],
            [<>$100 (high end, Vancouver tutors)<Cite n={7} /></>, "$400", "$800"],
          ]}
          note="This is arithmetic on published rates, not a quote. Some months have 5 weeks. Short-lesson fees, travel and materials can add to it."
        />
      </Section>

      <Section title="Learning centre prices for comparison">
        <p>
          Learning centres usually charge a monthly fee instead of an hourly rate. Kumon BC centre pages listed $180
          to $260 per subject per month in October 2026, plus an $80 enrolment fee.<Cite n={1} /><Cite n={2} />{" "}
          Kumon&apos;s online Canada Virtual centre listed $150 per subject.<Cite n={3} /> Prices vary by centre. See
          the full table in <Link href="/resources/kumon-cost-bc">how much is Kumon per month in BC</Link>.
        </p>
        <p>
          The Mathnasium North Vancouver centre page does not print a price. It says the centre charges a flat
          monthly membership and a one-time enrolment fee, and that most students attend two to three times a
          week.<Cite n={4} /> Ask the centre for its total.
        </p>
        <p>
          Unica is a third format: personalized math workbooks for ages 6-12, mailed home. Math is
          CAD 99 a month, delivery included. Your child works on paper for
          15-20 minutes a day, 5 days a week, and you can cancel anytime.
        </p>
      </Section>

      <Section title="How to choose a tutor">
        <ol>
          <li>
            <strong>Name the goal.</strong> Is it one topic (like fractions), reading fluency, or general catch-up? A
            clear goal tells you how many hours you may need.
          </li>
          <li>
            <strong>Ask about experience with your child&apos;s grade.</strong> Teaching a 7-year-old to read is a
            different skill from helping with Grade 11 math.
          </li>
          <li>
            <strong>Ask how they will check progress.</strong> Will they tell you what your child can do now that they
            could not do before?
          </li>
          <li>
            <strong>Ask for the full price.</strong> Get the hourly rate, any short-lesson or travel fee, and the
            cancellation rule in writing.
          </li>
          <li>
            <strong>Try a few sessions first.</strong> Your child needs to feel comfortable with the tutor.
          </li>
          <li>
            <strong>Plan the time between sessions.</strong> A tutor sees your child once or twice a week. Ask what
            practice they suggest for the other days.
          </li>
        </ol>
        <Callout label="Tip">
          <p>
            Before you pay for hours, find out where your child is. A placement assessment shows which skills are
            solid and which are gaps, so any tutor, centre or workbook can start in the right place.
          </p>
        </Callout>
      </Section>

      <AssessmentCta slug={meta.slug}>
        Not sure what your child needs yet? The free online math assessment shows their math level and gaps.
      </AssessmentCta>
    </>
  );
}
