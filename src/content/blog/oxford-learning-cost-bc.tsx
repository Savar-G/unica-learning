// Blog post: /blog/oxford-learning-cost-bc
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx. Rules: docs/blog-style.md.
import Link from "next/link";
import type { BlogMeta } from "@/lib/blog";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: BlogMeta = {
  slug: "oxford-learning-cost-bc",
  title: "Oxford Learning cost per month in BC: one centre's price list",
  description:
    "Oxford Learning cost per month in BC: one Surrey centre lists $496 for 2 hours a week, plus a $250 fee. What that means per hour and per school year.",
  category: "Comparing options",
  lead: "Oxford Learning sets prices centre by centre. One BC centre prints its price list, so here is what it says and how to turn it into a yearly cost.",
  published: "2026-11-15",
  updated: "2026-11-15",
  faqs: [
    {
      q: "How much does Oxford Learning cost per month in BC?",
      a: "Oxford Learning does not publish one price for Canada. The South Surrey Panorama centre lists $496 a month for 2 hours a week, $744 for 3 hours and $992 for 4 hours, plus a $250 enrolment fee, as listed in November 2026. Prices vary by centre, so ask yours for its list.",
    },
    {
      q: "Is there a sign-up fee at Oxford Learning?",
      a: "The South Surrey Panorama centre lists a $250 enrolment fee. It says the fee includes a Student Learning Profile that looks at your child's skills and learning style. The page also says seasonal promotions are sometimes available, so ask before you pay.",
    },
    {
      q: "How many students are in an Oxford Learning class?",
      a: "Oxford Learning says its regular programs run at small tables with three students per teacher. It also runs small group programs and workshops, usually with no more than 8 to 10 students. The Richmond centre's page says it offers one-on-one tutoring as well.",
    },
    {
      q: "Can I cancel Oxford Learning at any time?",
      a: "Oxford Learning's FAQ says it has a 30-day cancellation policy. Ask your centre how that works with monthly payments, a financing plan or a prepaid package, and get the answer in writing before you enrol.",
    },
    {
      q: "Does Oxford Learning offer payment plans?",
      a: "Yes, at some centres. Oxford Learning offers monthly payment plans through iFinance, a lending company, and says this may not be available at all locations. The South Surrey Panorama centre lists month-by-month tuition, a financing option or a prepaid package.",
    },
  ],
  sources: [
    { label: "Oxford Learning: South Surrey Panorama centre page", url: "https://oxfordlearning.com/locations/south-surrey-tutoring/", accessed: "2026-11-15" },
    { label: "Oxford Learning: Payment Options", url: "https://oxfordlearning.com/pricing/", accessed: "2026-11-15" },
    { label: "Oxford Learning: Tutoring FAQs", url: "https://oxfordlearning.com/tutoring-faqs/", accessed: "2026-11-15" },
    { label: "Oxford Learning: British Columbia locations", url: "https://oxfordlearning.com/region/british-columbia/", accessed: "2026-11-15" },
    { label: "Oxford Learning: Beyond Tutoring (grades 1 to 8)", url: "https://oxfordlearning.com/tutoring-programs/beyond-tutoring/", accessed: "2026-11-15" },
    { label: "Oxford Learning: Richmond centre page", url: "https://oxfordlearning.com/locations/richmond-tutoring/", accessed: "2026-11-15" },
    { label: "Oxford Learning: Math Tutoring", url: "https://oxfordlearning.com/subject/math-tutoring/", accessed: "2026-11-15" },
  ],
  related: ["/resources/tutor-cost-bc", "/resources/kumon-alternatives", "/blog/mathnasium-cost-bc", "/resources/kumon-cost-bc"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>South Surrey Panorama lists $496 a month for 2 hours a week, $744 for 3 hours and $992 for 4 hours.<Cite n={1} /></>,
          <>The same centre lists a $250 enrolment fee, with no extra taxes and all materials included.<Cite n={1} /></>,
          <>Regular programs seat three students per teacher.<Cite n={3} /></>,
          <>Oxford Learning has 20 centres in BC, and prices vary by centre.<Cite n={4} /><Cite n={2} /></>,
        ]}
      />

      <p>
        Oxford Learning does not publish one price for Canada. Its payment page says every centre charges a competitive hourly
        rate and that pricing may vary from coast to coast.<Cite n={2} /> One BC centre does print its list: South Surrey
        Panorama charges $496 a month for 2 hours a week, plus a $250 enrolment fee, as listed in November
        2026.<Cite n={1} />
      </p>
      <p>
        That works out to about $62 an hour, or about $5,200 for a September to June school year at 2 hours a week, fee included. The rest of
        this post shows the math, what the price includes, and what to ask a centre that does not print its prices.
      </p>

      <Section title="What does Oxford Learning charge per month in BC?" id="price-list">
        <p>
          We read the pages of eight of the 20 BC centres, in Surrey, Burnaby, Coquitlam, Richmond, Vancouver and
          Victoria.<Cite n={4} /> Only South Surrey Panorama listed prices. It shows the same table for its September to June
          program and its July and August program:<Cite n={1} />
        </p>
        <DataTable
          caption="Oxford Learning South Surrey Panorama: monthly tuition"
          columns={["Hours per week", "Monthly tuition", "Hours a month (about)", "Per hour (about)"]}
          rows={[
            ["2 hours", "$496", "8", "$62"],
            ["3 hours", "$744", "12", "$62"],
            ["4 hours", "$992", "16", "$62"],
          ]}
          note={
            <>
              Prices as listed in November 2026 on the centre&apos;s page; they vary by centre.<Cite n={1} /> Hours a month use
              Oxford Learning&apos;s own figure: two 1-hour classes a week is about 8 hours a month.<Cite n={3} /> The per-hour
              figure is our division, not a listed price.
            </>
          }
        />
        <p>
          The price per hour stays the same as you add hours. There is no discount for coming more often in this table. The
          centre also lists a prepaid package as an option, but the page gives no prepaid price.<Cite n={1} />
        </p>
      </Section>

      <Section title="What is included, and what costs extra?" id="included">
        <p>The South Surrey Panorama page lists these terms:<Cite n={1} /></p>
        <ul>
          <li>
            <strong>Enrolment fee: $250.</strong> It includes a Student Learning Profile, which the centre uses to find your
            child&apos;s skills and learning style. The page notes that seasonal promotions are sometimes available.
          </li>
          <li>
            <strong>No added taxes,</strong> and all materials are included.
          </li>
          <li>
            <strong>Progress reports</strong> every 6 weeks in the school year, and homework materials if you ask for them.
          </li>
          <li>
            <strong>Three ways to pay:</strong> month by month, a financing option or a prepaid package.
          </li>
        </ul>
        <p>
          The financing comes from iFinance, a lending company that Oxford Learning partners with for monthly payment plans. Its
          page says the plan may not be offered at every centre.<Cite n={2} /> A financing plan is a loan: read the interest
          rate and the full amount you will repay before you sign.
        </p>
      </Section>

      <Section title="What does a full school year cost?" id="year-cost">
        <p>
          A monthly price hides the real total. Using the South Surrey Panorama list, here is what 10 months, September to June,
          would cost at each level:<Cite n={1} />
        </p>
        <DataTable
          caption="A September to June school year at South Surrey Panorama prices"
          columns={["Hours per week", "10 months of tuition", "With the $250 fee"]}
          rows={[
            ["2 hours", "$4,960", "$5,210"],
            ["3 hours", "$7,440", "$7,690"],
            ["4 hours", "$9,920", "$10,170"],
          ]}
          note={<>Our math from the listed monthly prices, November 2026.<Cite n={1} /> Your centre&apos;s prices may differ.</>}
        />
        <p>
          Oxford Learning&apos;s FAQ also gives a target: it recommends about 100 hours of instruction.<Cite n={3} /> At 2 hours
          a week, that is about 12 to 13 months. At the South Surrey Panorama rate, 100 hours comes to about $6,200 in tuition,
          plus the enrolment fee.
        </p>
        <p>
          Hours are the biggest lever on the price. At South Surrey Panorama, going from 2 to 3 hours a week adds $248 a month,
          and going to 4 hours adds $496.<Cite n={1} /> Over a 10-month school year, the gap between 2 and 4 hours is $4,960.
        </p>
        <p>
          Oxford Learning&apos;s own example uses two 1-hour classes a week.<Cite n={3} /> Start there unless the centre gives
          you a clear reason, tied to your child&apos;s assessment, to book more. Ask what would need to change for your child
          to drop back to fewer hours, and when the centre would review that. The progress reports every 6 weeks are a natural
          point to ask.<Cite n={1} />
        </p>
        <Callout label="Before you enrol" tone="sun">
          Ask the centre how many months it expects your child to attend. Multiply that by the monthly price, add the fee, and
          compare the total, not the monthly figure.
        </Callout>
      </Section>

      <Section title="What does your child get for that price?" id="what-you-get">
        <p>
          Oxford Learning&apos;s regular programs run at small tables with three students per teacher.<Cite n={3} /> The South
          Surrey Panorama centre runs year-round programs for Pre-K to Grade 12 at that 3 to 1 ratio, with classes on weekday
          afternoons and Saturday mornings.<Cite n={1} /> Some centres offer one-on-one tutoring too: the Richmond centre&apos;s
          page lists both one-on-one and small groups of up to three.<Cite n={6} />
        </p>
        <p>
          For Grades 1 to 8, the main program is Beyond Tutoring. It starts with an assessment to find the study skills and
          subjects where your child needs help, and it covers reading, writing, math and study skills.<Cite n={5} /> Oxford
          Learning is not a math-only centre, so ask how much of each hour your child will spend on math if that is your main
          worry.
        </p>
      </Section>

      <Section title="Is Oxford Learning a good fit for a child who needs math help?" id="fit">
        <p>
          Oxford Learning runs math tutoring for Grades 1 to 12. Its math page says tutors assess your child&apos;s skill level
          first and then build a program for them, and that it is meant both for children who find math too hard and for
          children who are not challenged enough.<Cite n={7} /> The page does not say how sessions run or whether the work
          follows the BC curriculum, so ask the centre to show you a sample of the math your child would do.
        </p>
        <p>The format is more likely to suit your child if they:</p>
        <ul>
          <li>work better with an adult beside them than alone at the kitchen table;</li>
          <li>are fine sharing a teacher with two other students;</li>
          <li>need help in more than one subject, for example math and reading;</li>
          <li>can get to the centre after school one to four times a week.</li>
        </ul>
        <p>
          It is worth thinking twice if math is the only worry and your child mostly needs regular practice at the right level.
          You would be paying an hourly rate for time that also covers study skills and other subjects. Look at your
          child&apos;s latest report card first: our guide to <Link href="/resources/bc-proficiency-scale">the BC proficiency
          scale</Link> explains what Emerging, Developing, Proficient and Extending mean in math.
        </p>
      </Section>


      <AssessmentCta slug="blog-oxford-learning-cost-bc">
        Before you pay an enrolment fee, find out where your child stands in math. Our free online assessment shows their level and gaps.
      </AssessmentCta>

      <Section title="My centre does not list prices. What should I ask?" id="questions">
        <p>
          Most BC centre pages we read gave no price. Oxford Learning&apos;s own advice is to contact your nearest centre for
          full pricing.<Cite n={2} /> When you call, ask for these answers in writing:
        </p>
        <ul>
          <li>What is the monthly tuition for 2, 3 and 4 hours a week?</li>
          <li>Is there an enrolment or assessment fee, and is any promotion running now?</li>
          <li>Is there a prepaid package, and what does it cost per hour?</li>
          <li>How does the 30-day cancellation policy work, and is a prepaid package refundable?<Cite n={3} /></li>
          <li>How many students sit at my child&apos;s table, and is it the same teacher each week?</li>
          <li>How much of each session is math?</li>
        </ul>
        <p>
          With those answers you can compare like with like. Our guides show what{" "}
          <Link href="/resources/tutor-cost-bc">a private tutor costs in BC</Link>,{" "}
          <Link href="/resources/kumon-cost-bc">what Kumon costs per month</Link> and{" "}
          <Link href="/blog/mathnasium-cost-bc">what Mathnasium costs</Link>.
        </p>
      </Section>

      <Section title="Is there a lower-cost option for math?" id="other-options">
        <p>
          It depends on what your child needs. A centre gives your child a teacher at a small table, a set time each week and a
          place to work away from home. If your child needs someone to explain topics in person, that has real value.
        </p>
        <p>
          If your child mainly needs steady practice at the right level, the options widen. Our guide to{" "}
          <Link href="/resources/kumon-alternatives">alternatives in BC</Link> compares tutors, learning centres, apps and
          workbooks. Unica Learning is one of them: it starts with a free online math assessment, then mails paper workbooks
          made for your child&apos;s level. Math is CAD 79.99 a month for the first child, with delivery included.
        </p>
      </Section>
    </>
  );
}
