// Resource article: /resources/kumon-cost-bc
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx.
import Link from "next/link";
import Image from "next/image";
import feeData from "@/content/data/bc-centre-fees-2026-11-01.json";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "kumon-cost-bc",
  title: "How much is Kumon per month in BC?",
  description:
    "How much is Kumon per month in BC? Centre pages list $180-$260 per subject, plus an $80 enrolment fee. See prices by centre, two-subject totals and fees.",
  category: "Comparing options",
  lead: "Kumon prices in BC by centre, what two subjects cost, the extra fees, and the questions to ask before you enrol.",
  updated: "2026-11-01",
  faqs: [
    {
      q: "How much is Kumon per month in BC?",
      a: "On November 1, 2026, the 13 BC centre pages in our sample listed tuition of $180 to $260 per subject per month. All 13 listed an $80 enrolment fee. Eleven listed a $30 materials fee, one listed $20, and one did not list it. This sample does not cover every BC centre. Ask your centre for its current price.",
    },
    {
      q: "How much is Kumon for math and reading together?",
      a: "Kumon charges per subject. At the BC centre prices we found, two subjects come to about $360 to $520 a month in tuition, before the enrolment and materials fees.",
    },
    {
      q: "Is there a cheaper online Kumon option?",
      a: "Kumon's Canada Virtual centre listed $150 per subject per month and an $80 enrolment fee on November 1, 2026. Classes happen online instead of at a centre. This centre is based outside BC and is excluded from our BC price range.",
    },
    {
      q: "Is Kumon cheaper than Mathnasium?",
      a: "We cannot say. The Mathnasium North Vancouver centre page does not print a price. It says it charges a flat monthly membership and a one-time enrolment fee, so ask that centre for its price and compare the monthly totals.",
    },
    {
      q: "Is Kumon expensive compared with a tutor?",
      a: "It depends on how many hours of tutoring you buy. One hour a week with a tutor at $38 to $100 an hour is about $152 to $400 for 4 weeks, using tutor rates checked in October 2026. The 13 BC Kumon centre pages in our sample listed $180 to $260 per subject per month on November 1, 2026.",
    },
  ],
  sources: [
    ...feeData.centres.map((centre) => ({
      label: `Kumon ${centre.centre}, centre page (pricing and fees)`,
      url: centre.source,
      accessed: centre.checked,
    })),
    { label: "Kumon Canada, What is Kumon?", url: "https://www.kumon.com/resources/canadian_english/what-kumon/", accessed: "2026-10-09" },
    { label: "Kumon, How do Kumon's in-person and virtual classes work?", url: "https://www.kumon.com/resources/how-do-kumons-in-person-and-virtual-classes-work/", accessed: "2026-10-09" },
    { label: "Kumon Canada, Understanding student progress in Kumon", url: "https://www.kumon.com/resources/canadian_english/understanding-student-progress-in-kumon-what-to-look-for-and-where-to-find-it/", accessed: "2026-10-09" },
    { label: "Mathnasium North Vancouver, centre page and FAQ", url: "https://www.mathnasium.com/ca/math-centres/northvancouver", accessed: "2026-10-09" },
    { label: "Math Tutor Network Vancouver, Rates (tutoring company page)", url: "https://www.mathtutornetwork.com/rates.html", accessed: "2026-10-09" },
    { label: "Genie Teacher, How much does a tutor cost in Canada in 2026? (tutoring company blog)", url: "https://genieteacher.com/blogs/how-much-does-a-tutor-cost-canada", accessed: "2026-10-09" },
    { label: "Mathnasium franchise site (describes Mathnasium as a math-only education franchise)", url: "https://franchise.mathnasium.com/", accessed: "2026-10-09" },
  ],
  related: ["is-kumon-worth-it", "kumon-vs-mathnasium", "kumon-alternatives", "tutor-cost-bc"],
};

const BC_CENTRES = feeData.centres.filter((centre) => centre.market === "BC");
const DOWNLOAD = "/resources/data/bc-centre-fees-2026-11-01";

export default function Body() {
  return (
    <>
      <p>
        <strong>How much is Kumon per month in BC?</strong> On November 1, 2026, the 13 BC Kumon centre pages in
        our sample listed <strong>$180 to $260 per subject per month</strong>. All 13 listed a one-time
        <strong> $80 enrolment fee</strong> per student. Most listed a <strong>$20 or $30 materials fee</strong>.
        <Cite n={1} /><Cite n={10} /> Kumon&apos;s online
        Canada Virtual centre listed $150 per subject.<Cite n={14} /> Each centre sets its own price, so check with the
        centre near you.
      </p>

      <KeyFacts
        title="Kumon in BC at a glance (checked November 1, 2026)"
        items={[
          "One subject: $180-$260 a month in our sample of 13 BC centre pages.",
          "Two subjects (math and reading): about $360-$520 a month.",
          "Enrolment: $80 per student, once. Materials: $20-$30 at most centres.",
          "Online (Canada Virtual): $150 per subject a month.",
          "Prices vary by centre. Ask your centre for its current fees.",
        ]}
      />

      <Section title="Kumon prices by BC centre">
        <p>
          We rechecked the &quot;Pricing and Fees&quot; blocks on the 13 BC centre pages already listed in this guide.
          This is a convenience sample, not every centre in BC. The online centre is shown separately below.
        </p>
        <DataTable
          caption="Listed fees: 13 BC centres and one online centre, checked November 1, 2026"
          columns={["Centre", "Per subject a month", "Materials fee"]}
          rows={feeData.centres.map((centre, index) => [
            <>
              {centre.centre}
              <Cite n={index + 1} />
            </>,
            centre.tuitionLow === centre.tuitionHigh ? `$${centre.tuitionLow}` : `$${centre.tuitionLow}-$${centre.tuitionHigh}`,
            centre.materials === null ? "Not listed" : `$${centre.materials}`,
          ])}
          note="Every page listed a one-time $80 enrolment fee per student. These are dollar figures from Canadian centre pages; some omit a currency label or dollar sign. We use $ consistently in this table. A range is the page's listed range, not a quote for your child. A missing fee does not mean zero."
        />
      </Section>

      <Section title="Download the data and chart" id="data-method">
        <p>
          The BC sample contains {BC_CENTRES.length} centres. All {BC_CENTRES.length} listed an $80 enrolment fee.
          {" "}{BC_CENTRES.filter((centre) => centre.materials === 30).length} listed a $30 materials fee,
          {" "}{BC_CENTRES.filter((centre) => centre.materials === 20).length} listed $20, and
          {" "}{BC_CENTRES.filter((centre) => centre.materials === null).length} did not list a materials fee.
          The pages do not say how often materials fees apply.
        </p>
        <p>
          <strong>Method and limits.</strong> We read the published fee blocks on November 1, 2026.
          We kept each page&apos;s tuition range and did not estimate an average. We did not call centres,
          collect private quotes or measure learning results. The Canada Virtual row is based outside BC
          and is excluded from the BC counts and chart. Prices can change.
        </p>
        <ul>
          <li><a href={`${DOWNLOAD}.csv`} download>Download the centre data (CSV)</a></li>
          <li><a href={`${DOWNLOAD}.json`} download>Download the data and method (JSON)</a></li>
          <li><a href={`${DOWNLOAD}.png`} download>Download the chart (PNG, 1920 by 1440)</a></li>
          <li><a href={`${DOWNLOAD}.svg`} download>Download the chart (SVG)</a></li>
        </ul>
        <figure style={{ margin: "24px 0" }}>
          <a href={`${DOWNLOAD}.png`}>
            <Image
              src={`${DOWNLOAD}.png`}
              width={1920}
              height={1440}
              sizes="(max-width: 768px) 100vw, 760px"
              style={{ width: "100%", height: "auto" }}
              alt="Listed monthly tuition per subject at 13 BC Kumon centres, from $180 to $260. Each centre's range is also in the table above."
            />
          </a>
          <figcaption>Open the full-size chart to read the centre labels. The table above contains the same prices.</figcaption>
        </figure>
        <p>
          You can reuse our chart with source credit. Suggested credit: Unica Learning, published centre fees,
          checked November 1, 2026. Link to this method and the original centre pages so readers can check the figures.
          Kumon has not endorsed this guide.
        </p>
      </Section>

      <Section title="What two subjects cost">
        <p>
          Kumon charges per subject, so math and reading together cost twice the monthly tuition. At the BC centre
          prices above, that comes to about <strong>$360 to $520 a month</strong> in tuition. At a centre
          that lists $190-$220 per subject, two subjects come to $380-$440 a month.
        </p>
        <Callout label="Worked example (arithmetic only)" tone="sun">
          <p>
            A centre that lists $190 per subject, an $80 enrolment fee and a $30 materials fee:
          </p>
          <ul>
            <li>First month, one subject: $190 + $80 + $30 = $300.</li>
            <li>First month, two subjects: $380 + $80 + $30 = $490 (if the materials fee is charged once per student).</li>
            <li>Later months, two subjects: $380 in tuition, plus any materials fee.</li>
          </ul>
          <p>
            The centre pages do not say how often the materials fee is charged, or whether it is per subject. Ask
            your centre.
          </p>
        </Callout>
      </Section>

      <Section title="What the monthly fee covers">
        <p>
          Kumon describes its program like this: your child takes a placement test that sets a starting point, then
          works through a sequence of worksheets at their own pace. Students typically visit the centre twice a week,
          and most of the work is done at home. An instructor grades the work and uses it to plan the next
          lessons.<Cite n={15} /> Kumon gives the daily time as 15 to 30 minutes of work a day on one page
          <Cite n={15} /> and thirty minutes per subject a day on another.<Cite n={16} />
        </p>
        <p>
          Kumon also says parents can follow progress in the myKumon portal, and, for families who use digital
          worksheets, in the Kumon Connect app, which shows finished worksheets with times and scores.
          <Cite n={17} /> Ask your centre which of these it uses.
        </p>
      </Section>

      <Section title="The online option">
        <p>
          Kumon runs virtual classes as well as centre classes.<Cite n={16} /> The Canada Virtual centre listed
          tuition of $150 per subject per month and an $80 enrolment fee on November 1, 2026. Its page did not list a
          materials fee.<Cite n={14} /> That is $300 a month for math and reading in tuition. If your family is not
          near a centre, or the drive twice a week is hard, the virtual centre is the option to ask about.
        </p>
      </Section>

      <Section title="What changes your monthly total">
        <ul>
          <li><strong>The centre.</strong> Prices in the table range from $180 to $260 per subject.</li>
          <li><strong>The number of subjects.</strong> Each subject is charged separately.</li>
          <li><strong>The number of children.</strong> The enrolment fee is per student. Ask about sibling pricing.</li>
          <li><strong>One-time and recurring fees.</strong> Enrolment is once. Ask how often materials are charged.</li>
          <li><strong>Online or in person.</strong> The virtual centre listed a lower price than the BC centres.</li>
          <li><strong>Promotions.</strong> Centre pages sometimes show a time-limited offer. Read its terms.</li>
        </ul>
      </Section>

      <Section title="Questions to ask a Kumon centre">
        <ol>
          <li>What is the monthly tuition for my child, and why is it at that point in your range?</li>
          <li>Is the materials fee charged once, monthly or per subject?</li>
          <li>Is there a lower price for a second subject or a second child?</li>
          <li>How much notice do you need if we pause or stop? Is there a fee?</li>
          <li>Which days and times are open for centre visits?</li>
          <li>How will I see my child&apos;s progress, and how often will you talk with me?</li>
        </ol>
      </Section>

      <Section title="How Kumon compares with tutors and other options on price">
        <p>
          These are prices only. They do not compare what a child learns, because each option works in a different
          way.
        </p>
        <DataTable
          caption="Monthly prices for one child: published rates and worked examples"
          columns={["Option", "About one month"]}
          rows={[
            [<>Kumon centre, one subject<Cite n={1} /></>, "$180-$260, plus fees"],
            [<>Kumon centre, two subjects</>, "$360-$520, plus fees"],
            [<>Kumon Canada Virtual, one subject<Cite n={14} /></>, "$150, plus fees"],
            [<>Private math tutor, K-7, Vancouver<Cite n={19} /></>, "From $152-$160 for 1 hour a week (from $38-$40 an hour)"],
            [<>Tutors in Vancouver, all types<Cite n={20} /></>, "$240-$400 for 1 hour a week ($60-$100 an hour)"],
            ["Unica, math", "CAD 79.99, delivery included"],
          ]}
          note="Kumon fees checked November 1, 2026. Tutor rates checked October 9, 2026. Tutor monthly figures are arithmetic: the hourly rate x 1 hour a week x 4 weeks. Math Tutor Network lists starting rates and adds $5 for lessons shorter than 1.5 hours. Tutor sources are tutoring company pages."
        />
        <p>
          Mathnasium, another learning centre, teaches math only.<Cite n={21} /> Its North Vancouver centre page does
          not print a price; it says the centre charges a flat monthly membership and a one-time enrolment
          fee.<Cite n={18} /> Ask
          the centre for its total so you can compare the same months.
        </p>
        <p>
          Unica is a different format: personalized math workbooks for ages 5 to 14, mailed home. The books
          follow the BC curriculum at your child&apos;s level, and your child works on paper for 15-30 minutes a day, 5
          days a week. There is a free online math assessment, the first month free, and you can
          cancel anytime. For a wider look, read <Link href="/resources/tutor-cost-bc">how much a tutor costs in BC</Link>{" "}
          and <Link href="/resources/is-kumon-worth-it">is Kumon worth it?</Link>
        </p>
      </Section>

      <AssessmentCta slug={meta.slug}>
        Comparing options? Start with the free online math assessment. It shows your child&apos;s math level and gaps,
        whatever you choose next.
      </AssessmentCta>
    </>
  );
}
