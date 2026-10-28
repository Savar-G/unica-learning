// Resource article: /resources/kumon-alternatives
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx.
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "kumon-alternatives",
  title: "Kumon alternatives in BC: tutors, learning centres, apps and workbooks",
  description:
    "Kumon alternatives in BC: private tutors, other learning centres, online apps, free library programs and workbooks at home, with October 2026 prices.",
  category: "Comparing options",
  lead: "If Kumon is not the right fit, BC families can choose from tutors, other learning centres, apps, free library programs and workbooks at home.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What is a good alternative to Kumon for reading?",
      a: "Options that cover reading include a private reading tutor, Oxford Learning (reading, writing and math for grades 1 to 8), Sylvan (math, reading and writing), Eye Level (math and English), IXL language arts, Khan Academy Kids for ages 2 to 8, free library programs such as the BC Summer Reading Club, and reading workbooks at home. Mathnasium teaches math only.",
    },
    {
      q: "Is there a free alternative to Kumon?",
      a: "Yes, with limits. Khan Academy Kids is a free app for ages 2 to 8. Prodigy's math and English content is free, with paid memberships for extras. The BC Summer Reading Club is a free summer program at public libraries for ages 5 to 14. None of these give a child a teacher who checks their paper work.",
    },
    {
      q: "Are there online alternatives to Kumon in Canada?",
      a: "Yes. IXL lists a Canadian family membership from CAD 12.95 a month for one subject. Prodigy and Khan Academy Kids are apps. Many private tutors teach online. Kumon itself also lists an online Canada Virtual centre at $150 per subject per month (October 2026).",
    },
    {
      q: "What is the best Kumon alternative?",
      a: "There is no single best option. It depends on what your child needs (daily practice or explanation), the subject, your budget, how much screen time you want, and how far you can drive. Use the questions at the top of this guide to narrow it down, and ask any provider for its price and method before you sign up.",
    },
    {
      q: "Is Mathnasium cheaper than Kumon?",
      a: "We cannot say. Mathnasium's North Vancouver page describes a flat monthly membership plus a one-time enrolment fee, but it does not print a price. Kumon BC centres listed $180 to $260 per subject per month in October 2026. Ask your local Mathnasium centre for its price.",
    },
  ],
  sources: [
    { label: "Kumon Vancouver - Marpole: centre page, Pricing and Fees", url: "https://www.kumon.com/vancouver-marpole/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Surrey - Fraser Heights: centre page, Pricing and Fees", url: "https://www.kumon.com/surrey-fraser-heights/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Canada Virtual: centre page, Pricing and Fees", url: "https://www.kumon.com/canada-virtual/aboutcenter", accessed: "2026-10-09" },
    { label: "Kumon Canada: What is Kumon?", url: "https://www.kumon.com/resources/canadian_english/what-kumon/", accessed: "2026-10-09" },
    { label: "Math Tutor Network (Vancouver): rates", url: "https://www.mathtutornetwork.com/rates.html", accessed: "2026-10-09" },
    { label: "TutorLyft: How much does a math tutor in Vancouver cost per hour? (updated June 28, 2026)", url: "https://www.tutorlyft.com/blogs/how-much-does-a-math-tutor-in-vancouver-cost-per-hour", accessed: "2026-10-09" },
    { label: "Mathnasium of North Vancouver: centre page and FAQ", url: "https://www.mathnasium.com/ca/math-centres/northvancouver", accessed: "2026-10-09" },
    { label: "Oxford Learning: British Columbia locations", url: "https://oxfordlearning.com/region/british-columbia/", accessed: "2026-10-09" },
    { label: "Oxford Learning: Tutoring FAQs", url: "https://oxfordlearning.com/tutoring-faqs/", accessed: "2026-10-09" },
    { label: "Oxford Learning: Beyond Tutoring (grades 1 to 8)", url: "https://oxfordlearning.com/tutoring-programs/beyond-tutoring/", accessed: "2026-10-09" },
    { label: "Sylvan Learning of Vancouver - Kerrisdale: membership pricing", url: "https://www.sylvanlearning.com/locations/ca/bc/vancouver-tutoring/vancouver-kerrisdale/pricing/", accessed: "2026-10-09" },
    { label: "Eye Level: Vancouver-East learning centre", url: "https://www.myeyelevel.com/US/center/vancouvereast", accessed: "2026-10-09" },
    { label: "Eye Level: programs", url: "https://www.myeyelevel.com/US/programs/intro.do", accessed: "2026-10-09" },
    { label: "Eye Level: FAQ", url: "https://www.myeyelevel.com/US/footer/faq.do", accessed: "2026-10-09" },
    { label: "IXL Canada: family membership", url: "https://ca.ixl.com/membership/family/subscribe", accessed: "2026-10-09" },
    { label: "IXL blog: Keep parents in the loop with IXL Analytics (updated March 27, 2025)", url: "https://blog.ixl.com/2025/02/04/keep-parents-in-the-loop-with-ixl-analytics/", accessed: "2026-10-09" },
    { label: "Khan Academy Kids", url: "https://www.khanacademy.org/kids", accessed: "2026-10-09" },
    { label: "Prodigy: memberships", url: "https://www.prodigygame.com/Memberships/math/", accessed: "2026-10-09" },
    { label: "BC Summer Reading Club: about", url: "https://bcsrc.ca/about-bcsrc/", accessed: "2026-10-09" },
    { label: "Surrey Libraries: kids", url: "https://www.surreylibraries.ca/kids", accessed: "2026-10-09" },
    { label: "Mathnasium franchise site (describes Mathnasium as a math-only education franchise)", url: "https://franchise.mathnasium.com/", accessed: "2026-10-09" },
  ],
  related: ["kumon-vs-mathnasium", "kumon-cost-bc", "is-kumon-worth-it", "tutor-cost-bc"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>Kumon BC centres listed $180-$260 per subject per month in October 2026, plus an $80 enrolment fee.<Cite n={1} /><Cite n={2} /></>,
          <>One Vancouver tutoring company lists K-7 math from $38-$40 an hour; a Vancouver tutoring blog gives about $30-$100.<Cite n={5} /><Cite n={6} /></>,
          <>Mathnasium, Oxford Learning and Eye Level do not publish prices on the pages we read. Ask each centre.</>,
          <>Free options exist: Khan Academy Kids, Prodigy&apos;s free tier and the BC Summer Reading Club.<Cite n={17} /><Cite n={18} /><Cite n={19} /></>,
          <>Prices vary by location and change. Check with the provider before you sign up.</>,
        ]}
      />

      <p>
        Parents look for Kumon alternatives for many reasons: the budget, the travel, the subjects, the family schedule, or a
        wish to try a different format. This guide lists the main Kumon alternatives in BC by type, with what
        each one is, how it works, what it costs as listed in October 2026, and who it may suit. We make Unica workbooks, which
        are one of the options here, so we keep every other option to facts from its own pages.
      </p>

      <Section title="How to choose a Kumon alternative" id="how-to-choose">
        <p>Before you compare names, answer these questions. They narrow the list fast.</p>
        <ul>
          <li><strong>Practice or explanation?</strong> Some children need daily practice to build speed. Others need a person to explain a topic they do not understand.</li>
          <li><strong>Math, reading or both?</strong> Some programs teach math only. If reading is the concern, check the subject list first.</li>
          <li><strong>Budget.</strong> Costs below run from free to a few hundred dollars a month per subject.</li>
          <li><strong>Screen time.</strong> Apps work on a tablet or computer. Centres, tutors and workbooks can be on paper.</li>
          <li><strong>Travel.</strong> A centre means a drive one or more times a week. Tutors, apps and workbooks can happen at home.</li>
          <li><strong>Your time.</strong> Home practice often needs a parent to keep the routine and check the work.</li>
        </ul>
      </Section>

      <Section title="Private tutors" id="private-tutors">
        <p>
          <strong>What it is:</strong> one adult working with your child, at home, at the tutor&apos;s place or online.{" "}
          <strong>How it works:</strong> the tutor plans each session around your child&apos;s needs, so the quality depends on the tutor.
        </p>
        <p>
          <strong>Cost:</strong> one Vancouver tutoring company lists starting rates for K to 7 math of $38 an hour online and $40 an
          hour in person.<Cite n={5} /> A Vancouver tutoring blog puts most math tutors between $30 and $100 an hour, with agencies often
          starting at $45.<Cite n={6} /> One hour a week at $40 is about $160 in a 4-week month and $200 in a 5-week month. See our{" "}
          <Link href="/resources/tutor-cost-bc">guide to tutor costs in BC</Link>.
        </p>
        <p><strong>May suit:</strong> a child who needs explanation, not only practice, or a specific gap before a test. Reading tutors are common too.</p>
      </Section>

      <Section title="Other learning centres in BC" id="learning-centres">
        <p>These centres have BC locations on their own sites. All of them start with some kind of assessment. Prices are set by each centre.</p>

        <h3>Mathnasium</h3>
        <p>
          Math only.<Cite n={21} /> The North Vancouver centre&apos;s page describes a diagnostic assessment first, then a customized learning
          plan. It says most students attend two to three times a week, and that the membership price is the same online or in
          person.<Cite n={7} /> <strong>Cost:</strong> a flat monthly membership plus a one-time enrolment fee; the price is not
          published, so ask the centre.<Cite n={7} /> For a side-by-side view, read{" "}
          <Link href="/resources/kumon-vs-mathnasium">Kumon vs Mathnasium</Link>.
        </p>

        <h3>Oxford Learning</h3>
        <p>
          Reading, writing and math. Oxford Learning lists 20 locations in BC, from Abbotsford and Metro Vancouver to
          Victoria.<Cite n={8} /> Its Beyond Tutoring program for grades 1 to 8 starts with an assessment and then builds a
          customized program.<Cite n={10} /> Its FAQ says regular programs run at small tables with three students to one
          teacher.<Cite n={9} /> <strong>Cost:</strong> not published; the FAQ says it depends on the program, how often your child
          attends, and the city.<Cite n={9} />
        </p>

        <h3>Sylvan Learning</h3>
        <p>
          Math, reading, writing and other subjects. Sylvan lists a centre in Vancouver - Kerrisdale, with a free Insight assessment for one
          subject.<Cite n={11} /> <strong>Cost:</strong> that centre lists $60-$75 per session depending on the plan, plus a one-time
          $199 registration fee, and says the rates are set by that centre.<Cite n={11} /> Session length is not listed on the page.
        </p>

        <h3>Eye Level</h3>
        <p>
          Math and English, ages 4 to 15.<Cite n={13} /> Eye Level lists a Vancouver-East centre on Kingsway.<Cite n={12} /> Its FAQ
          describes a diagnostic test to find the starting point and a self-directed, step-by-step program.<Cite n={14} />{" "}
          <strong>Cost:</strong> not published; ask the centre.
        </p>
      </Section>

      <Section title="Online practice" id="online-practice">
        <p>Apps can be low-cost or free, and some adjust to your child as they work. The trade-off is screen time, and no paper.</p>
        <ul>
          <li>
            <strong>IXL:</strong> math and language arts, K to 12. The Canadian family page lists CAD 12.95 a month for one subject
            and CAD 19.95 for math and language arts.<Cite n={15} /> Its diagnostics give a personalized plan of skill
            recommendations, and its reports show progress.<Cite n={16} />
          </li>
          <li>
            <strong>Khan Academy Kids:</strong> a free app for ages 2 to 8, with early reading, writing, language and math.<Cite n={17} />
          </li>
          <li>
            <strong>Prodigy:</strong> math and English games. The math and English content is free; paid memberships (listed at $9.95-$19.95 a
            month, less when billed yearly; currency not shown) add science and game extras. Prodigy says its math is aligned with
            provincial curriculum for grades 1 to 8 and uses an adaptive algorithm.<Cite n={18} />
          </li>
        </ul>
      </Section>

      <Section title="Free options" id="free-options">
        <p>
          The BC Summer Reading Club is a free literacy program for children aged 5 to 14, run through public libraries across the
          province each summer.<Cite n={19} /> Some libraries also run reading programs during the year. For example, Surrey
          Libraries&apos; Reading Buddies matches young readers with teen volunteers, and its kids&apos; page lists digital resources
          to help with homework.<Cite n={20} /> Ask your local branch what it offers. Free options cost nothing, but none of them
          include a teacher who checks your child&apos;s work.
        </p>
      </Section>

      <Section title="Workbooks at home, including Unica" id="workbooks">
        <p>
          Workbooks keep practice on paper and at home, with no drive. A store-bought grade workbook is the cheapest version, but
          it does not know your child&apos;s level. A personalized workbook service is the other version.
        </p>
        <p>
          Unica is one example. A free online math assessment finds your child&apos;s math level. We mail personalized math
          workbooks for ages 5 to 14 home; the program follows the BC curriculum at your child&apos;s level. The plan is 15-30
          minutes a day, 5 days a week. A parent app lets you scan a problem to see the steps and check answers.{" "}
          <strong>Cost:</strong> CAD 79.99 a month for math, delivery included, with the first month
          free and cancel anytime. See <Link href="/#price">pricing</Link>.
        </p>
      </Section>

      <Section title="Alternatives to Kumon for reading" id="reading">
        <p>
          Kumon teaches math and reading.<Cite n={4} /> If you want an alternative to Kumon for reading, skip math-only programs such as
          Mathnasium.<Cite n={21} /> Options that cover reading:
        </p>
        <ul>
          <li>A private reading tutor.</li>
          <li>Oxford Learning (reading and writing for grades 1 to 8),<Cite n={10} /> Sylvan (reading and writing),<Cite n={11} /> Eye Level (English).<Cite n={13} /></li>
          <li>IXL language arts,<Cite n={15} /> Khan Academy Kids for early readers,<Cite n={17} /> Prodigy English.<Cite n={18} /></li>
          <li>Library programs such as the BC Summer Reading Club and Reading Buddies.<Cite n={19} /><Cite n={20} /></li>
          <li>Reading workbooks at home. Unica is math only for now.</li>
        </ul>
      </Section>

      <Section title="Kumon alternatives at a glance" id="summary">
        <DataTable
          caption="Kumon alternatives in BC: format, subjects and cost (October 2026)"
          columns={["Option", "Format", "Subjects", "Typical cost", "Source"]}
          rows={[
            ["Kumon (for reference)", "Centre visits plus worksheets at home; online centre", "Math, reading", "$180-$260 per subject / month at BC centres, plus $80 enrolment; $150 online", <><Cite n={1} /><Cite n={2} /><Cite n={3} /></>],
            ["Private tutor", "One-on-one, home or online", "Any", "About $30-$100 an hour; one company lists K-7 math from $38-$40", <><Cite n={5} /><Cite n={6} /></>],
            ["Mathnasium", "Centre or online", "Math", "Monthly membership plus enrolment fee; price not published", <><Cite n={7} /><Cite n={21} /></>],
            ["Oxford Learning", "Centre, 3 students per teacher", "Reading, writing, math", "Not published", <Cite key="src" n={9} />],
            ["Sylvan (Kerrisdale)", "Centre", "Math, reading, writing and more", "$60-$75 per session, plus $199 registration", <Cite key="src" n={11} />],
            ["Eye Level", "Centre", "Math, English", "Not published", <Cite key="src" n={12} />],
            ["IXL", "Online", "Math, language arts", "CAD 12.95-19.95 / month", <Cite key="src" n={15} />],
            ["Khan Academy Kids", "App, ages 2-8", "Reading, math", "Free", <Cite key="src" n={17} />],
            ["Prodigy", "Game, online", "Math, English", "Free; memberships $9.95-$19.95 / month", <Cite key="src" n={18} />],
            ["Library programs", "Library, summer and some year-round", "Reading", "Free", <><Cite n={19} /><Cite n={20} /></>],
            ["Unica workbooks", "Paper workbooks mailed home", "Math", "CAD 79.99 / month", "unicalearning.com"],
          ]}
          note="Prices as listed on each provider's own pages in October 2026. They vary by location and change; confirm with the provider."
        />
        <Callout label="Tip">
          <p>
            Ask every provider the same three questions: the full monthly cost for your child, how many hours a week it takes
            (including home practice), and how you will see progress.
          </p>
        </Callout>
      </Section>

      <AssessmentCta slug={meta.slug}>
        Not sure which option fits? Start with the free online math assessment. It shows your child&apos;s math level and gaps,
        whatever you choose next.
      </AssessmentCta>
    </>
  );
}
