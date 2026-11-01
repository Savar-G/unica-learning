// Blog post: /blog/is-spirit-of-math-worth-it
// Writers: replace `meta` and `Body` only. Blocks: see src/components/article.tsx. Rules: docs/blog-style.md.
import Link from "next/link";
import type { BlogMeta } from "@/lib/blog";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: BlogMeta = {
  slug: "is-spirit-of-math-worth-it",
  title: "Is Spirit of Math worth it? A guide for BC parents",
  description:
    "Is Spirit of Math worth it? A weekly enrichment class for kids with a B+ average: what it asks, how it fits BC report cards, and what to ask about cost.",
  category: "Comparing options",
  lead: "Spirit of Math is built for children who already do well in math. Here is what it asks of a child, how that fits a BC report card, and how to decide.",
  published: "2026-11-01",
  updated: "2026-11-01",
  faqs: [
    {
      q: "Is Spirit of Math good for a child who is struggling in math?",
      a: "It is not built for that. Spirit of Math says it is for high-performing students, asks for a B+ average or higher, and says its instruction is not individualized. A child with gaps usually needs help aimed at those gaps first, from a tutor, a teacher or practice at home.",
    },
    {
      q: "How much does Spirit of Math cost in BC?",
      a: "Spirit of Math does not print tuition on its main website, and its program pages give no price. The Vancouver, West Vancouver and Richmond campuses share one phone number, 604-304-4032. Ask for the full year's tuition, the registration fee and the payment plan in writing.",
    },
    {
      q: "What grades does Spirit of Math teach?",
      a: "Spirit of Math lists weekly classes from Kindergarten to Grade 11, and summer camps for Grades 2 to 9. It says not every grade is offered at every campus, so check with the BC campus you want.",
    },
    {
      q: "How does Spirit of Math use a B+ average when BC report cards have no letter grades?",
      a: "BC report cards for Kindergarten to Grade 9 use the four-level proficiency scale, not letter grades. Spirit of Math's admissions list asks for a B+ or higher overall average. Ask the campus how it reads a BC report card, and bring your child's latest one to the interview.",
    },
    {
      q: "How long is a Spirit of Math class?",
      a: "Classes meet once a week. Spirit of Math's program page lists 90 minutes for Grades 1 to 8 and 120 minutes for Grades 9 to 11. There is weekly homework on top of the class.",
    },
  ],
  sources: [
    { label: "Spirit of Math: home page, FAQ and Get Started", url: "https://spiritofmath.com/", accessed: "2026-11-01" },
    { label: "Spirit of Math: Spirit of Math program page", url: "https://spiritofmath.com/spirit-of-math-program/", accessed: "2026-11-01" },
    { label: "Spirit of Math: Curriculum Overview 2025-26 (PDF)", url: "https://spiritofmath.com/wp-content/uploads/2025/12/Curriculum-Overview-2025-26-single-pages.pdf", accessed: "2026-11-01" },
    { label: "Spirit of Math: Campus Locator", url: "https://spiritofmath.com/campus-locator/", accessed: "2026-11-01" },
    { label: "BC Government: K-12 Student Reporting Policy", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/legislation-policy/public-schools/student-reporting", accessed: "2026-11-01" },
    { label: "BC Curriculum: Mathematics 3", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/3/core", accessed: "2026-11-01" },
    { label: "BC Curriculum: Mathematics 7", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/7/core", accessed: "2026-11-01" },
    { label: "Spirit of Math: About Spirit of Math", url: "https://spiritofmath.com/about-spirit-of-math/", accessed: "2026-11-01" },
    { label: "Spirit of Math: Fibonacci Virtual Campus", url: "https://spiritofmath.com/fibonaccivirtual/", accessed: "2026-11-01" },
  ],
  related: ["/resources/kumon-alternatives", "/resources/bc-proficiency-scale", "/resources/tutor-cost-bc", "/blog/mathnasium-cost-bc"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>One class a week for 39 weeks: 90 minutes for Grades 1 to 8, 120 minutes for Grades 9 to 11.<Cite n={2} /></>,
          <>Entry needs a B+ or higher overall average, an interview and an entrance assessment.<Cite n={3} /></>,
          <>BC has three campuses: Vancouver (West 4th Avenue), West Vancouver and Richmond.<Cite n={4} /></>,
          <>Tuition is not printed on spiritofmath.com. Ask the campus for the full year in writing.<Cite n={1} /></>,
        ]}
      />

      <p>
        Spirit of Math can be worth it for a child who already does well in math, likes hard puzzles and can keep up with a group
        class plus weekly homework. It is not designed for a child who is behind. The program says so itself: it is for
        high-performing students, and its teaching is not individualized.<Cite n={1} /><Cite n={3} />
      </p>
      <p>
        So the real question is not whether the program is good. It is whether your child fits what it asks. This guide walks
        through those asks, using Spirit of Math&apos;s own pages and the BC curriculum.
      </p>

      <Section title="What is Spirit of Math?" id="what-it-is">
        <p>
          Spirit of Math is an after-school math program that began in a Toronto classroom.<Cite n={8} /> Its headquarters are still in Toronto.<Cite n={3} />{" "}
          It runs weekly classes from Kindergarten to Grade 11 over a 39-week year.<Cite n={2} /> Children stay with the same group
          for the whole school year.<Cite n={3} />
        </p>
        <p>Spirit of Math names four parts of its method:<Cite n={8} /></p>
        <ul>
          <li><strong>Drills:</strong> short practice for speed and accuracy with facts and operations.</li>
          <li><strong>Core curriculum:</strong> math topics explored and practised in depth.<Cite n={3} /></li>
          <li><strong>Problem solving:</strong> at least 400 competition-level problems a year in every grade.<Cite n={3} /></li>
          <li><strong>Group work:</strong> children solve problems together and present their results to the class.<Cite n={3} /></li>
        </ul>
        <p>
          Students also do weekly homework, plus tests, assignments and a final exam each year.<Cite n={1} /> Spirit of Math states
          the difference from tutoring plainly: &quot;Tutoring fills gaps; Spirit of Math builds long-term problem
          solvers.&quot;<Cite n={1} />
        </p>
      </Section>

      <Section title="Who gets in, and what does B+ mean on a BC report card?" id="who-gets-in">
        <p>
          Every family goes through a screening with an interview. Spirit of Math asks for a B+ or higher overall average on the
          report card. The child and parents must also agree to the work it takes to keep up.<Cite n={3} />
        </p>
        <p>
          That B+ rule needs a second look in BC. Since July 1, 2023, BC report cards for Kindergarten to Grade 9 use the
          Provincial Proficiency Scale: Emerging, Developing, Proficient and Extending. Letter grades start in Grade
          10.<Cite n={5} /> A child in Grade 4 at a Richmond or Vancouver public school has no letter grade to show.
        </p>
        <Callout label="Before the interview" tone="sun">
          Ask the campus how it reads a BC report card, for example whether it expects Proficient or Extending in math. Bring the
          latest report card. Our guide to <Link href="/resources/bc-proficiency-scale">the BC proficiency scale</Link> explains
          what each level means.
        </Callout>
      </Section>

      <Section title="How far ahead of BC school is it?" id="how-far-ahead">
        <p>
          Spirit of Math says it does not try to rush children through topics. It goes deeper, and children end up doing work
          above their school grade because of that depth.<Cite n={3} /> Its entrance skills show how far above. Here they are
          next to what the BC curriculum expects:
        </p>
        <DataTable
          caption="Spirit of Math entrance skills next to the BC math curriculum"
          columns={["Spirit of Math asks", "What BC expects"]}
          rows={[
            ["For Grade 2 entry: adding and subtracting with regrouping to three digits", "Grade 3: adding and subtracting to 1000"],
            ["For Grade 2 entry: multiplication facts to 3", "Grade 3: multiplication as a concept; memorizing the facts is not intended yet"],
            ["For Grade 3 entry: adding, subtracting, multiplying and dividing signed (negative) numbers", "Grade 7: operations with integers"],
          ]}
          note={<>Spirit of Math Curriculum Overview 2025-26<Cite n={3} />; BC Mathematics 3<Cite n={6} /> and Mathematics 7<Cite n={7} />, read November 1, 2026.</>}
        />
        <p>
          Reading matters too. The entrance list asks for reading at a Grade 4 level for Grade 2 entry, and at a Grade 6 level
          for Grade 3 entry. The problem-solving work asks children to read critically.<Cite n={3} /> A child who is strong with
          numbers but still reads slowly may find the problems hard for reasons that have nothing to do with math.
        </p>
      </Section>

      <Section title="What does a week of Spirit of Math look like?" id="weekly-load">
        <p>
          The class is only part of the time. For a child in Grades 1 to 8, it is one 90-minute class a
          week.<Cite n={2} /> Add the drive: the three BC campuses are on West 4th Avenue in Vancouver, on 16th Street in West
          Vancouver and on Daniels Road in Richmond.<Cite n={4} /> There is no BC campus in Surrey, Burnaby, Coquitlam, Victoria
          or Kelowna. Families farther away can ask about Fibonacci Virtual, the online program, which its page describes as an
          after-school program for students who already excel in math.<Cite n={9} />
        </p>
        <p>
          Then there is homework every week. Spirit of Math does not give a number of hours, but its FAQ warns that a child who
          puts in no time at home may fall behind.<Cite n={1} /> Over the year come tests, assignments, a final exam and math
          contests: the curriculum lists the Spirit of Math Contest in several grades.<Cite n={1} /><Cite n={3} />
        </p>
        <Callout label="Count the hours" tone="sun">
          Add up class time, the drive both ways and homework for one week. Then look at what your child already does after
          school. A program that fits on paper can still be one activity too many.
        </Callout>
        <p>
          The same weekly class runs whether your child had a good week or a hard one. Children stay with one group all year,
          and the group moves on together.<Cite n={3} /> For a child who likes that rhythm, it can be a steady routine. For a
          child who needs extra time on one topic, it gives less room.
        </p>
      </Section>

      <AssessmentCta slug="blog-is-spirit-of-math-worth-it">
        Not sure where your child sits against those entrance skills? Our free online math assessment shows their level and gaps.
      </AssessmentCta>

      <Section title="What does Spirit of Math cost in BC?" id="cost">
        <p>
          Spirit of Math does not publish tuition on its website. Its home page, program page and campus list give no price, and
          the online program, Fibonacci Virtual, lists none either.<Cite n={1} /><Cite n={2} /><Cite n={4} /><Cite n={9} /> We did not put a
          number here because we could not find one on a page we could read.
        </p>
        <p>
          The three BC campuses share one phone number, 604-304-4032.<Cite n={4} /> When you call, ask for the full cost of the
          year, not a monthly figure, because the program runs as one 39-week year.<Cite n={2} /> To compare, our guides list
          what <Link href="/resources/tutor-cost-bc">a tutor costs in BC</Link> and{" "}
          <Link href="/blog/mathnasium-cost-bc">what Mathnasium costs</Link>.
        </p>
      </Section>

      <Section title="When is it worth it, and when is something else a better fit?" id="worth-it">
        <p>Spirit of Math is more likely to suit your child if they:</p>
        <ul>
          <li>already get Proficient or Extending in math and are bored by school work;</li>
          <li>enjoy puzzles and stick with a problem when the answer is not obvious;</li>
          <li>read well above grade level;</li>
          <li>can work in a group at the group&apos;s pace, and do homework every week.</li>
        </ul>
        <p>Something else is likely a better fit if your child:</p>
        <ul>
          <li>got Emerging or Developing in math, or has gaps from earlier grades;</li>
          <li>needs topics explained again at their own speed;</li>
          <li>already finds homework a fight, and one more weekly load would make it worse.</li>
        </ul>
        <p>
          For a child with gaps, the program itself points elsewhere: its teaching is not individualized, and children must keep
          up with the class.<Cite n={3} /> A tutor, a learning centre or steady practice at home can aim at the gaps first. Our
          guide to <Link href="/resources/kumon-alternatives">alternatives in BC</Link> compares those options.
        </p>
        <p>
          Ask your child too. A child who asks for harder problems and enjoys contests will treat the homework as a game. A child
          who is signing up to please you will feel the weekly load sooner. If you are unsure, the free assessment class is a low
          cost way to see how your child reacts to the work.
        </p>
      </Section>

      <Section title="What should you ask at the assessment class?" id="questions">
        <p>Every child starts with a free assessment class or placement interview.<Cite n={1} /> Use it to get answers in writing:</p>
        <ul>
          <li>What is the tuition for the full year, and is there a registration fee? Can we pay in parts?</li>
          <li>Which grades run at this campus this year, and on which days?</li>
          <li>How many children are in a class, and with how many teachers?</li>
          <li>How much homework a week should my child expect at this grade?</li>
          <li>What happens if my child falls behind the group, or we leave partway through the year?</li>
          <li>How do you read a BC report card with no letter grades?</li>
        </ul>
        <p>
          If you are weighing a home option too, Unica Learning starts with a free online math assessment, then mails paper
          workbooks made for your child&apos;s level. See <Link href="/compare">how it compares</Link> with learning centres and
          tutors.
        </p>
      </Section>
    </>
  );
}
