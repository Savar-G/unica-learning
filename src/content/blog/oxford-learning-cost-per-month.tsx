// Blog post: /blog/oxford-learning-cost-per-month
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx. Rules: docs/blog-style.md.
import Link from "next/link";
import type { BlogMeta } from "@/lib/blog";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: BlogMeta = {
  slug: "oxford-learning-cost-per-month",
  title: "Oxford Learning cost per month in BC: tuition, fees and what to ask",
  description:
    "Oxford Learning cost per month in BC: one Surrey centre lists $496 for 2 hours a week, plus a $250 enrolment fee. What a year adds up to, and what to ask.",
  category: "Comparing options",
  lead: "The one BC price list Oxford Learning publishes, what it adds up to over a school year, and the questions to ask your own centre.",
  published: "2026-11-14",
  updated: "2026-11-14",
  faqs: [
    {
      q: "How much does Oxford Learning cost per month in BC?",
      a: "Each centre sets its own price. The South Surrey Panorama centre lists $496 a month for 2 hours a week, $744 for 3 hours and $992 for 4 hours, as listed in November 2026. The other BC centre pages we read print no tuition, so ask your centre for its price list.",
    },
    {
      q: "Does Oxford Learning charge for the assessment?",
      a: "At the centres that print it, yes. South Surrey Panorama lists a $250 enrolment fee that includes a Student Learning Profile. Langley Walnut Grove lists a $150 Dynamic Assessment and a $75 Pre-Reading Screen, and West Vancouver lists a $295 Dynamic Assessment. Prices vary by centre.",
    },
    {
      q: "Is Oxford Learning one-on-one tutoring?",
      a: "Not in the regular programs. Oxford Learning says its regular programs use small tables with three students per teacher. Its small group programs and workshops usually have no more than 8 to 10 students.",
    },
    {
      q: "Can you cancel Oxford Learning at any time?",
      a: "Oxford Learning's FAQ says it has a 30-day cancellation policy. Ask your centre how that works with monthly tuition, a prepaid package or financing, and get the answer in writing before you sign.",
    },
    {
      q: "Does Oxford Learning have payment plans?",
      a: "The South Surrey Panorama centre offers month-by-month tuition, a prepaid package or financing. Oxford Learning's payment page says it offers monthly payment plans through iFinance, which may not be available at all locations.",
    },
  ],
  sources: [
    { label: "Oxford Learning: Tutoring FAQs", url: "https://oxfordlearning.com/tutoring-faqs/", accessed: "2026-11-14" },
    { label: "Oxford Learning: Payment Options", url: "https://oxfordlearning.com/pricing/", accessed: "2026-11-14" },
    { label: "Oxford Learning: South Surrey Panorama centre", url: "https://oxfordlearning.com/locations/south-surrey-tutoring/", accessed: "2026-11-14" },
    { label: "Oxford Learning: British Columbia locations", url: "https://oxfordlearning.com/region/british-columbia/", accessed: "2026-11-14" },
    { label: "Oxford Learning: Langley Walnut Grove centre", url: "https://oxfordlearning.com/locations/langley-walnutgrove-tutoring/", accessed: "2026-11-14" },
    { label: "Oxford Learning: West Vancouver centre", url: "https://oxfordlearning.com/locations/west-vancouver-tutoring/", accessed: "2026-11-14" },
    { label: "Oxford Learning: Beyond Tutoring (Grades 1 to 8)", url: "https://oxfordlearning.com/tutoring-programs/beyond-tutoring/", accessed: "2026-11-14" },
    { label: "Oxford Learning: Math Tutoring", url: "https://oxfordlearning.com/subject/math-tutoring/", accessed: "2026-11-14" },
    { label: "Oxford Learning: Surrey Ocean Park centre", url: "https://oxfordlearning.com/locations/surrey-ocean-park-tutoring/", accessed: "2026-11-14" },
  ],
  related: ["/resources/tutor-cost-bc", "/resources/kumon-alternatives", "/resources/kumon-cost-bc", "/blog/mathnasium-cost-bc"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>Oxford Learning has 20 centres in BC, from Abbotsford to Victoria.<Cite n={4} /></>,
          <>South Surrey Panorama lists $496 a month for 2 hours a week, $744 for 3 hours and $992 for 4 hours.<Cite n={3} /></>,
          <>That centre also charges a $250 enrolment fee, which includes a Student Learning Profile of your child&apos;s skills.<Cite n={3} /></>,
          <>Regular programs seat three students per teacher.<Cite n={1} /></>,
          <>Oxford Learning has a 30-day cancellation policy.<Cite n={1} /></>,
        ]}
      />

      <p>
        Oxford Learning does not set one price for Canada. Each centre sets its own rate, and the price depends on the program
        and how many hours a week your child attends.<Cite n={1} /><Cite n={2} /> In BC, one centre prints its tuition: South
        Surrey Panorama lists $496 a month for 2 hours a week, as listed in November 2026.<Cite n={3} />
      </p>
      <p>
        Add a $250 enrolment fee at that centre, and the first month at 2 hours a week comes to $746. Prices vary by centre, so
        treat these numbers as a starting point for your own call, not a quote.
      </p>

      <Section title="What does each BC centre publish?" id="what-centres-publish">
        <p>
          On November 14, 2026, we read the page of each of the 20 BC centres on Oxford Learning&apos;s site.<Cite n={4} /> One
          printed monthly tuition. Three printed an assessment or enrolment fee, and one printed summer class prices only. The other
          16 printed no price at all.
        </p>
        <DataTable
          caption="Prices printed on Oxford Learning's BC centre pages, as listed in November 2026"
          columns={["Centre", "What the page lists"]}
          rows={[
            ["South Surrey Panorama", <>$250 enrolment fee; $496, $744 or $992 a month for 2, 3 or 4 hours a week<Cite key="c" n={3} /></>],
            ["Langley Walnut Grove", <>Dynamic Assessment $150; Pre-Reading Screen $75; tuition by email or phone<Cite key="c" n={5} /></>],
            ["West Vancouver", <>Dynamic Assessment $295; no tuition listed<Cite key="c" n={6} /></>],
            ["Surrey Ocean Park", <>Summer enrichment classes, $50 a session drop-in; no tuition listed<Cite key="c" n={9} /></>],
            ["The other 16 BC centres", "No tuition or fees printed"],
          ]}
          note="Prices vary by centre and can change. Ask your centre for its current price list in writing."
        />
        <p>
          The South Surrey Panorama page says there are no added taxes and that all materials are included.<Cite n={3} /> The
          Langley Walnut Grove page says rates and scheduling can be given by email or over the phone.<Cite n={5} />
        </p>
      </Section>

      <Section title="What does a school year at Oxford Learning add up to?" id="year-cost">
        <p>
          Monthly tuition is easier to compare when you turn it into a year and an hour. Here is the arithmetic for the South
          Surrey Panorama rates, if you pay tuition for all 12 months. Ask your centre whether summer months are billed the same
          way.
        </p>
        <DataTable
          caption="South Surrey Panorama tuition over 12 months"
          columns={["Hours a week", "Per month", "12 months", "Hours in a year", "About per hour"]}
          rows={[
            ["2", "$496", "$5,952", "104", "$57"],
            ["3", "$744", "$8,928", "156", "$57"],
            ["4", "$992", "$11,904", "208", "$57"],
          ]}
          note={<>Monthly tuition from the South Surrey Panorama centre page<Cite n={3} />, read November 14, 2026. Yearly totals and hourly figures are our arithmetic (52 weeks), before the $250 enrolment fee.</>}
        />
        <p>
          The hourly rate depends on how you count a month. Oxford Learning&apos;s FAQ counts two 1-hour classes a week as about
          8 hours a month.<Cite n={1} /> At 8 hours, $496 is $62 an hour. Over a full year of weeks, it is closer to $57.
        </p>
        <p>
          Oxford Learning also says how long it expects a program to run. Its FAQ recommends about 100 hours of instruction, and
          says that generally takes about a year.<Cite n={1} /> At 2 hours a week and the South Surrey Panorama rates, a year is
          $5,952 in tuition plus the $250 enrolment fee: $6,202. That is the number to hold in mind, not the first month.
        </p>
        <Callout label="Ask for the year" tone="sun">
          When you call a centre, ask: &quot;What would 100 hours cost my child, with every fee?&quot; One total is easier to compare
          than a monthly price, a fee and a package discount.
        </Callout>
      </Section>

      <Section title="What do you get for the monthly price?" id="what-you-get">
        <p>
          The regular programs use small tables with three students per teacher, mixing one-on-one teaching with independent
          work. Small group programs and workshops usually have no more than 8 to 10 students.<Cite n={1} /> So a 1-hour class
          is not an hour of one tutor beside your child the whole time.
        </p>
        <p>
          For children in Grades 1 to 8, the main program is called Beyond Tutoring. Oxford Learning lists reading, writing, math
          and study skills as its focus areas, with personalized pacing, a mix of hands-on teaching and independent work, and
          regular check-ins.<Cite n={7} /> Its math tutoring page says it builds each child&apos;s program after assessing their skill
          level.<Cite n={8} />
        </p>
        <p>
          South Surrey Panorama says its programs include progress reports every 4 to 6 weeks, and homework materials if you ask
          for them.<Cite n={3} /> Classes run after school. The FAQ lists 4:00 pm to 8:00 pm, Monday to Thursday, plus Saturday
          mornings, and hours vary by centre.<Cite n={1} />
        </p>
      </Section>

      <Section title="Is it a good fit if your child only needs math?" id="math-only">
        <p>
          Beyond Tutoring is broader than a math class. Besides reading, writing and math, Oxford Learning lists cognitive skills,
          organization and learning to do homework quickly and on time among its goals.<Cite n={7} /> That can suit a child who
          struggles with several things at once, for example slow reading that also makes word problems hard.
        </p>
        <p>
          If your child&apos;s gaps are only in math, ask how the hours are split. At $496 a month, you want to know how many of
          those 8 or so hours go to fractions or multiplication, and how many go to other skills.
        </p>
        <p>
          Count the drive too. The 20 BC centres are in the Lower Mainland, the Fraser Valley and Victoria.<Cite n={4} /> There is
          no centre listed in Kelowna, Kamloops, Nanaimo or Prince George. Two classes a week means two round trips, often at
          dinner time.
        </p>
      </Section>

      <Section title="What is the assessment, and is it worth paying for?" id="assessment">
        <p>
          Oxford Learning builds each child&apos;s program after assessing their skill level.<Cite n={8} /> Its centres call the full version a Dynamic Assessment. The Langley Walnut Grove page
          says it takes 1.5 to 2 hours and gives a picture of your child&apos;s strengths and academic skill gaps.<Cite n={5} /> At
          South Surrey Panorama, the $250 enrolment fee includes a Student Learning Profile of academic skills and learning
          style, and the page says some seasonal promotions are available.<Cite n={3} />
        </p>
        <p>
          Before you pay for one, it helps to know where your child stands in math already. The latest BC report card is a start.
          Our guide to the <Link href="/resources/bc-proficiency-scale">BC proficiency scale</Link> explains what Emerging,
          Developing, Proficient and Extending mean.
        </p>
      </Section>

      <AssessmentCta slug="blog-oxford-learning-cost-per-month">
        Want to know your child&apos;s math level before you pay for an assessment? Our free online math assessment shows it.
      </AssessmentCta>

      <Section title="How can you pay, and how do you stop?" id="payment">
        <p>
          South Surrey Panorama offers three ways to pay: month-by-month tuition, a prepaid package or financing.<Cite n={3} />{" "}
          Oxford Learning&apos;s payment page says it partners with iFinance for monthly payment plans, and that financing may not
          be available at all locations.<Cite n={2} />
        </p>
        <p>
          The payment page describes a loan with its own contract, signed online.<Cite n={2} /> Read its terms the way you would read any loan: the interest, the
          length and what happens if you stop the program early.
        </p>
        <p>
          Oxford Learning&apos;s FAQ says it has a 30-day cancellation policy.<Cite n={1} /> Ask your centre what that means for a
          prepaid package or a financing plan, and get the answer in writing.
        </p>
      </Section>

      <Section title="Questions to ask your Oxford Learning centre" id="questions">
        <p>Most BC centres do not print a price, so the call matters. Ask:</p>
        <ul>
          <li>What is the monthly tuition for 2 hours a week, and for 3?</li>
          <li>Is there an enrolment or assessment fee, and is it ever waived or credited?</li>
          <li>Are summer months billed at the same rate, and can we pause?</li>
          <li>What does a prepaid package cost, and is any of it refunded if we stop?</li>
          <li>How many students sit at my child&apos;s table, and will it be the same teacher each week?</li>
          <li>How much of each class is math, if my child needs help only in math?</li>
        </ul>
        <p>
          Then compare the yearly total with other choices. Our guides list what{" "}
          <Link href="/resources/tutor-cost-bc">a private tutor costs in BC</Link> and{" "}
          <Link href="/resources/kumon-cost-bc">what Kumon costs in BC</Link>, and{" "}
          <Link href="/resources/kumon-alternatives">alternatives in BC</Link> compares centres side by side.
        </p>
        <p>
          If math is the only subject, practice at home is another route. Unica Learning starts with a free online math
          assessment, then mails paper workbooks made for your child&apos;s level. See{" "}
          <Link href="/compare">how it compares</Link> with learning centres and tutors.
        </p>
      </Section>
    </>
  );
}
