// Blog post: /blog/does-my-child-need-a-tutor
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx. Rules: docs/blog-style.md.
import Link from "next/link";
import type { BlogMeta } from "@/lib/blog";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: BlogMeta = {
  slug: "does-my-child-need-a-tutor",
  title: "Does my child need a tutor, a learning centre or practice at home?",
  description:
    "Does your child need a math tutor? How to read a BC report card, what to ask the teacher, and when a tutor, a centre or home practice fits, with BC prices.",
  category: "Math at home",
  lead: "Not every child who finds math hard needs a tutor. Here is how to tell what kind of help your child needs, and what each option costs in BC.",
  published: "2026-11-22",
  updated: "2026-11-22",
  faqs: [
    {
      q: "How do I know if my child needs a math tutor?",
      a: "Look for a pattern, not one bad test: Emerging or Developing in math on more than one report, homework that ends in tears most nights, or a skill from an earlier grade that is still missing. Talk to the teacher first. If the teacher sees the same gap and school support is not enough, outside help makes sense.",
    },
    {
      q: "Does Emerging on a BC report card mean my child needs a tutor?",
      a: "Not on its own. The BC Ministry of Education says Emerging means your child is beginning to understand something and may need more support to move ahead, and that it does not mean your child is unsuccessful. Ask the teacher which topics are behind and what support the school offers before you pay for help.",
    },
    {
      q: "How much does a math tutor cost in BC?",
      a: "One Vancouver tutoring company lists $38 an hour online and $40 in person for Kindergarten to Grade 7 math, as listed in November 2026. Learning centres usually charge by the month. One South Surrey centre lists $496 a month for 2 hours a week, plus a $250 enrolment fee. Prices vary by tutor and by centre.",
    },
    {
      q: "Is tutoring better than practice at home?",
      a: "They do different jobs. A tutor can explain a topic your child does not understand. Practice builds speed and memory once the idea makes sense. Many children with small gaps need regular practice more than new explanations, and a tutor is a better fit when the idea itself has not clicked.",
    },
    {
      q: "How long should a child see a math tutor?",
      a: "Set a goal and a check date before you start, for example one topic in 8 to 10 weeks. At the check date, ask the tutor what your child can now do that they could not do before, and compare with the next report card. Stop or change the plan if nothing has moved.",
    },
  ],
  sources: [
    { label: "BC Government: K-12 Student Reporting Policy", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/legislation-policy/public-schools/student-reporting", accessed: "2026-11-22" },
    { label: "BC Ministry of Education and Child Care: K-12 Student Reporting, information for parents and caregivers (PDF)", url: "https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/reporting/K-12-student-reporting-one-pager-for-parents-and-caregivers.pdf", accessed: "2026-11-22" },
    { label: "BC Curriculum: Mathematics 3", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/3/core", accessed: "2026-11-22" },
    { label: "Nickow, Oreopoulos and Quan: The Impressive Effects of Tutoring on PreK-12 Learning (NBER Working Paper 27476, 2020)", url: "https://www.nber.org/papers/w27476", accessed: "2026-11-22" },
    { label: "Dunlosky: Strengthening the Student Toolbox (American Educator, Fall 2013)", url: "https://www.aft.org/ae/fall2013/dunlosky", accessed: "2026-11-22" },
    { label: "Math Tutor Network Vancouver: Rates", url: "https://www.mathtutornetwork.com/rates.html", accessed: "2026-11-22" },
    { label: "Oxford Learning: South Surrey Panorama centre page", url: "https://oxfordlearning.com/locations/south-surrey-tutoring/", accessed: "2026-11-22" },
    { label: "Sylvan Learning of Surrey & Newton: membership pricing", url: "https://www.sylvanlearning.com/locations/ca/bc/surrey-tutoring/surrey-newton/pricing/", accessed: "2026-11-22" },
  ],
  related: ["/resources/tutor-cost-bc", "/resources/bc-proficiency-scale", "/blog/emerging-in-math-report-card", "/resources/kumon-alternatives"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>BC report cards for Kindergarten to Grade 9 use four levels. Proficient is the goal for every student.<Cite n={2} /></>,
          <>Emerging means your child may need more support to move ahead. It does not mean they are unsuccessful.<Cite n={2} /></>,
          <>A review of tutoring experiments found the largest effects when teachers or trained aides did the tutoring.<Cite n={4} /></>,
          <>In BC, one company lists K-7 math tutoring at $38-$40 an hour. One Surrey centre lists $496 a month for 2 hours a week.<Cite n={6} /><Cite n={7} /></>,
        ]}
      />

      <p>
        Your child may need a tutor if they are behind on an idea they do not understand, and school support has not closed the
        gap. If your child understands the idea but is slow or forgets it, regular practice at home is often the better first
        step. A learning centre sits in between: a set program, a fixed schedule and a monthly fee.
      </p>
      <p>
        The hard part is telling those cases apart. This guide shows you how to read the signs, what to ask the teacher, and
        what each kind of help gives your child and costs in BC.
      </p>

      <Section title="What are the signs that my child needs help in math?" id="signs">
        <p>One hard week is not a sign. Look for a pattern that lasts a month or more:</p>
        <ul>
          <li>Emerging or Developing in math on more than one report, or a drop from Proficient.</li>
          <li>Homework that takes far longer than the teacher says it should, or ends in tears most nights.</li>
          <li>Counting on fingers for facts your child&apos;s grade expects them to know.</li>
          <li>Your child says &quot;I&apos;m bad at math&quot; or avoids anything with numbers.</li>
          <li>The teacher mentions the same topic in more than one update.</li>
        </ul>
        <p>
          Check the fact question against the curriculum, not against what you learned as a child. BC&apos;s Grade 3 math says that
          by the end of Grade 3 most students should be able to recall addition facts to 20. It also says memorizing
          multiplication facts is not intended at that level.<Cite n={3} /> A Grade 3 child who does not yet know 7 x 8 by heart is
          not behind. A Grade 3 child who still counts on fingers for 8 + 7 in June may need practice.
        </p>
        <p>
          The report card words help too. The Ministry says Developing means your child understands some things in an area of
          learning but still has other areas to work on.<Cite n={2} /> Our guide to{" "}
          <Link href="/resources/bc-proficiency-scale">the BC proficiency scale</Link> explains all four levels, and{" "}
          <Link href="/blog/emerging-in-math-report-card">what to do after an Emerging in math</Link> covers that case in detail.
        </p>
      </Section>

      <Section title="Should I talk to the teacher before I hire a tutor?" id="teacher">
        <p>
          Yes. The teacher sees your child do math every day, and BC policy expects that contact. Families get at least 5
          communications of learning a year, and the informal ones can be phone calls, conferences or emails. The policy says
          communication of student learning is ongoing through the year.<Cite n={1} /> You do not need to wait for the next report
          card to ask.
        </p>
        <Callout label="Questions for the teacher" tone="sun">
          <ul>
            <li>Which math topics is my child behind on, and from which grade?</li>
            <li>Is it the idea they do not understand, or speed and memory?</li>
            <li>What help does the school offer, and how often?</li>
            <li>What should we practise at home, and for how long each day?</li>
            <li>When should we check again?</li>
          </ul>
        </Callout>
        <p>
          The second question matters most. A gap in understanding needs someone to explain. A gap in speed or memory needs
          practice. Write the answers down and bring them to any tutor or centre you visit, so you pay for help aimed at the gap.
        </p>
      </Section>

      <AssessmentCta slug="blog-does-my-child-need-a-tutor">
        Want a clear list of the gaps before you choose? Our free online math assessment shows your child&apos;s level and gaps.
      </AssessmentCta>

      <Section title="What does each kind of help give my child?" id="options">
        <DataTable
          caption="Three kinds of math help in BC, with listed prices from November 2026"
          columns={["", "Private tutor", "Learning centre", "Practice at home"]}
          rows={[
            ["What it gives", "One adult explains, at your child's pace", "A set program and schedule, in a small group or one-on-one", "Short, regular practice on the right level"],
            ["Best for", "An idea that has not clicked", "A child who works well with a routine outside home", "Facts and skills your child understands but is slow at"],
            ["Example BC price", <>$38 an hour online, $40 in person, K-7 math, at one Vancouver company<Cite n={6} /></>, <>$496 a month for 2 hours a week, plus $250 enrolment, at Oxford Learning South Surrey Panorama<Cite n={7} /></>, "Free with your own materials, or the price of a book or program"],
            ["Your time", "Lessons at home or online", "Driving to the centre, often twice a week", "10 to 30 minutes a day with you nearby"],
          ]}
          note={<>Prices as listed on each provider&apos;s page, November 22, 2026. Prices vary by tutor and by centre; ask for a written quote.</>}
        />
        <p>
          Prices differ a lot by place and by type. Sylvan Learning of Surrey &amp; Newton lists $69 a session month to month, or
          less with a 6 or 12 month commitment, plus a $149 registration fee.<Cite n={8} /> At 2 sessions a week, that is roughly
          $550 to $620 a month at the month-to-month rate (our arithmetic). Math Tutor Network adds a $5 fee for lessons shorter
          than 1.5 hours.<Cite n={6} /> For more rates and a calculator, see{" "}
          <Link href="/resources/tutor-cost-bc">how much a tutor costs in BC</Link>.
        </p>
      </Section>

      <Section title="What does research say about tutoring?" id="research">
        <p>
          A 2020 review by Nickow, Oreopoulos and Quan pooled the results of experiments on tutoring programs from preschool to
          Grade 12. They found that tutoring programs had consistent and substantial positive effects on learning.<Cite n={4} />{" "}
          The details matter for a parent:
        </p>
        <ul>
          <li>Effects were larger when teachers or paraprofessionals (trained aides) tutored than when volunteers or parents did.<Cite n={4} /></li>
          <li>Effects were strongest in the earlier grades.<Cite n={4} /></li>
          <li>Tutoring during the school day showed larger effects than tutoring after school.<Cite n={4} /></li>
        </ul>
        <p>
          The review studied organized programs, not one family hiring one tutor, so it cannot tell you what a given tutor will
          do for your child. It does point to one thing worth asking any tutor: what training they have to teach. Ask, too, how
          the tutor will link their sessions to what your child&apos;s class is working on.
        </p>
      </Section>

      <Section title="When is practice at home enough?" id="practice">
        <p>
          Often, when your child understands the idea but makes slow or careless mistakes. Here the research on practice helps.
          In a review of study methods, John Dunlosky and his colleagues rated two as the most effective: practice testing and
          distributed practice.<Cite n={5} />
        </p>
        <ul>
          <li><strong>Practice testing</strong> means answering questions from memory. A correct answer makes the memory stronger, and a wrong answer shows what to review.<Cite n={5} /></li>
          <li><strong>Distributed practice</strong> means spreading practice over time. Children remember skills for longer when practice is spread out than when it is crammed into one long session.<Cite n={5} /></li>
        </ul>
        <p>For a child in Kindergarten to Grade 9, that can look like this:</p>
        <ul>
          <li>10 to 20 minutes a day, 5 days a week, at the same time each day.</li>
          <li>A few questions from earlier topics mixed in with the new one.</li>
          <li>Your child works first; you check after, and go back over only the wrong ones.</li>
          <li>Work at the level your child is at, not only the grade they are in.</li>
        </ul>
        <p>
          That last point is where home practice often goes wrong. A Grade 5 book is no help if the gap is from Grade 3. Find the
          level first, then practise there.
        </p>
      </Section>

      <Section title="How do I decide what my child needs?" id="decide">
        <p>Use the teacher&apos;s answers and what you see at home:</p>
        <ul>
          <li><strong>The idea has not clicked</strong> (for example, your child cannot explain what a fraction is): a tutor, or the school&apos;s own support, who can explain it a new way.</li>
          <li><strong>The idea makes sense but is slow or shaky:</strong> regular practice at home, at the right level.</li>
          <li><strong>Many small gaps from earlier grades:</strong> find the gaps first, then a plan that works through them in order, at home or at a centre.</li>
          <li><strong>Homework is a daily fight:</strong> talk to the teacher about the amount, and keep home practice short and calm.</li>
        </ul>
        <p>
          Whatever you pick, set a goal and a date to check, such as one topic in 8 to 10 weeks. If nothing has moved by then,
          change the plan. Our guide to <Link href="/resources/kumon-alternatives">math help options in BC</Link> compares centres,
          tutors and programs.
        </p>
        <p>
          Unica Learning is one home option: a free online math assessment, then paper workbooks made for your child&apos;s level
          and mailed home, for about 15 to 30 minutes of work a day. See <Link href="/compare">how it compares</Link> with tutors and
          learning centres.
        </p>
      </Section>
    </>
  );
}
