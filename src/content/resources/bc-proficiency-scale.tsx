// Resource article: /resources/bc-proficiency-scale
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-proficiency-scale",
  title: "BC proficiency scale: what Emerging, Developing, Proficient and Extending mean",
  description: "The BC proficiency scale for parents: what each level means on a K-9 report card, what you get and when, and why there is no official percentage chart.",
  category: "BC school guides",
  lead: "In BC, children in Kindergarten to Grade 9 get a four-level proficiency scale on their report card instead of letter grades or percentages.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What is the BC proficiency scale?",
      a: "It is the four-level scale that BC schools use to report learning from Kindergarten to Grade 9. The levels are Emerging, Developing, Proficient and Extending. Each level describes how well a child shows the learning standards of the curriculum.",
    },
    {
      q: "What does Emerging mean on a BC report card?",
      a: "Emerging means a child is just beginning to show the learning in an area, but not yet consistently. The ministry says it is not failing. The child is still learning and may need more support to move ahead.",
    },
    {
      q: "Is Proficient a good mark in BC?",
      a: "Yes. Proficient is the goal for students. It means a child shows the expected learning consistently, or most of the time. It does not mean perfect, and it does not mean learning stops.",
    },
    {
      q: "How do I convert the BC proficiency scale to a percentage or letter grade?",
      a: "There is no official conversion. The ministry's reporting guidelines set percentage ranges only for the letter grades used in Grades 10 to 12. For Kindergarten to Grade 9, teachers place a child on the scale using their judgment of recent evidence of learning, not by averaging marks. A chart online that turns the four levels into percentages is not from the ministry.",
    },
    {
      q: "How many report cards does a BC student get each year?",
      a: "Schools must give at least five communications of learning a year: two informal updates, such as a conference, and three written updates. The third written update is the Summary of Learning at the end of the year. Schools set their own dates.",
    },
  ],
  sources: [
    { label: "BC Ministry of Education and Child Care: K-12 Student Reporting, information for parents and caregivers (PDF)", url: "https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/reporting/K-12-student-reporting-one-pager-for-parents-and-caregivers.pdf", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: K-12 Student Reporting Policy, Educator Summary Guide (PDF)", url: "https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/reporting/k-12-reporting-educator-summary-guide.pdf", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: K-12 Student Reporting Policy presentation (PDF)", url: "https://www2.gov.bc.ca/assets/gov/education/administration/kindergarten-to-grade-12/k-12-student-reporting-policy-presentation.pdf", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: K-12 Student Reporting Policy, Communicating Student Learning Guidelines (PDF, August 2023)", url: "https://www2.gov.bc.ca/assets/download/A5CA90B9C45D40B4999109A7400A1A39", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: All about the Foundation Skills Assessment, information for parents and caregivers (PDF)", url: "https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/assessment/fsa/en-foundation-skills-assessment-for-parents-and-caregivers.pdf", accessed: "2026-10-09" },
  ],
  related: ["bc-fsa-grade-4-and-7", "bc-grade-4-math-and-reading"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>Kindergarten to Grade 9 report cards use four levels: Emerging, Developing, Proficient and Extending.<Cite n={1} /></>,
          <>Proficient is the goal for students. Extending is not the standard for everyone.<Cite n={3} /></>,
          <>Grades 10 to 12 still use letter grades and percentages.<Cite n={2} /></>,
          <>The ministry sets percentage ranges only for Grades 10 to 12 letter grades. There is no official percentage for a K-9 level.<Cite n={4} /></>,
        ]}
      />

      <Section title="What is the BC proficiency scale?">
        <p>
          The BC proficiency scale is the way schools report your child&apos;s learning from Kindergarten to Grade 9. If your child is in those grades, you will not see letter grades on the report card. You will see where your child is on the scale.<Cite n={1} />
        </p>
        <p>
          The scale has four levels: Emerging, Developing, Proficient and Extending. A level shows how well your child meets the learning standards of the BC curriculum in each area they study.<Cite n={2} /> It is part of the K-12 Student Reporting Policy. Under that policy, all districts use the scale for Kindergarten to Grade 9.<Cite n={2} />
        </p>
        <p>
          The Grade 4 and 7 Foundation Skills Assessment (FSA) is marked with the same scale, but it joins Developing and Proficient into one level called On Track.<Cite n={5} />
        </p>
      </Section>

      <Section title="What the four levels mean">
        <p>The ministry describes each level in plain terms. Here is the short version.</p>
        <DataTable
          caption="The four levels of the BC proficiency scale"
          columns={["Level", "What it means", "What it does not mean"]}
          rows={[
            [
              "Emerging",
              "Your child is just beginning to show the learning, but not yet consistently. They may need more support to move ahead.",
              "It is not failing.",
            ],
            [
              "Developing",
              "Your child shows some understanding and is building skill, with growing consistency. Other parts still need work.",
              "It is not failing. All students develop in some areas at some points.",
            ],
            [
              "Proficient",
              "Your child shows the expected learning, consistently or most of the time. This is the goal for students.",
              "It does not mean perfect, and it does not mean learning stops.",
            ],
            [
              "Extending",
              "Your child shows the learning with more depth and complexity, and can apply it in new ways.",
              "It is not a bonus or a reward. It does not necessarily need more work or work from a higher grade.",
            ],
          ]}
          note={<>Paraphrased from the ministry&apos;s parent information and policy presentation.<Cite n={1} /><Cite n={3} /></>}
        />
        <p>
          Two points are easy to miss. First, the ministry says a child who hands in all their work is not automatically Extending. Proficient is the standard.<Cite n={3} /> Second, a child who uses supports, such as an IEP, should not automatically be marked Emerging or Developing. The level should match the learning the child has shown.<Cite n={2} />
        </p>
        <p>
          You may also see &ldquo;IE&rdquo; on a report. It means insufficient evidence of learning so far, and the ministry calls it temporary.<Cite n={3} /> In a few cases a report can also show W (withdrawal) or SG (standing granted), in any grade.<Cite n={2} />
        </p>
      </Section>

      <Section title="What parents get and when">
        <p>
          Schools must share at least five communications of learning in a school year. Two are informal, such as a parent-teacher conference, a call or an email. Three are written: two written Learning Updates and one Summary of Learning at the end of the school year or semester.<Cite n={2} /> The Summary of Learning is what many parents still call the final report card.<Cite n={2} />
        </p>
        <p>Each written update for Kindergarten to Grade 9 includes:</p>
        <ul>
          <li>A proficiency scale level for every area of learning your child is studying.<Cite n={2} /></li>
          <li>Short written feedback on strengths and areas to grow, in plain language.<Cite n={2} /></li>
          <li>Where to find your child&apos;s self-reflection on the Core Competencies and their goal setting.<Cite n={2} /></li>
          <li>Information about attendance.<Cite n={3} /></li>
        </ul>
        <p>
          Your school or district decides the dates and the format. Some use a printed report. Others use an online portal. Ask your school for its calendar.<Cite n={2} />
        </p>
        <Callout label="Report card examples">
          <p>
            We do not show a sample report card here, because the layout differs by district. Your school can show you what yours looks like. The ministry sets what must be on it, not how it looks.
          </p>
        </Callout>
      </Section>

      <Section title="What changes in Grades 10 to 12">
        <p>
          From Grade 10, students get a letter grade and a percentage for each course. The ministry keeps these so students can apply to college and university.<Cite n={1} /> The symbols and matching percentages are set in the Provincial Letter Grades Order.<Cite n={3} />
        </p>
        <p>
          Students in Grades 10 to 12 still get written feedback and self-reflection. On the last report of the year they also get a graduation status update, which shows progress toward the credits and assessments needed to graduate.<Cite n={2} />
        </p>
      </Section>

      <Section title="Can I convert the proficiency scale to a percentage or letter grade?">
        <p>
          Many parents search for a BC proficiency scale conversion chart. There is no official one. The ministry&apos;s reporting guidelines give a table of percentage ranges only for the letter grades used in Grades 10 to 12 (for example, B is 73 to 85 percent).<Cite n={4} /> For Kindergarten to Grade 9, the guidelines describe how a teacher places a child on the scale: they look at all the evidence of learning, give the most weight to recent work, and use professional judgment. They say averaging marks over a term does not give an accurate picture of learning.<Cite n={4} />
        </p>
        <p>
          So the scale describes how consistently a child shows the learning standards. It is not an average of test scores. The ministry also says Proficient does not mean perfect.<Cite n={3} /> If you see a chart online that says &ldquo;Proficient equals 73 to 85 percent&rdquo;, it was not made by the ministry.
        </p>
        <p>
          If you need a letter grade for a form or for a family conversation, ask the teacher what your child can do and what comes next. That answer is more useful than a number.
        </p>
      </Section>

      <Section title="If your child is at Emerging or Developing">
        <p>
          The ministry says neither level means your child is failing. Emerging means they are beginning. Developing means they understand some things and have others to work on.<Cite n={1} /> Treat it as a sign of where to help next.
        </p>
        <h3>Questions to ask the teacher</h3>
        <ol>
          <li>Which part of this area is the hardest for my child right now?</li>
          <li>What does a Proficient piece of work look like in this area?</li>
          <li>What can we practise at home, and for how long each day?</li>
          <li>When will you update me again?</li>
        </ol>
        <h3>What to do at home</h3>
        <ul>
          <li>Pick one skill at a time. Short, steady practice works better than one long session.</li>
          <li>Ask your child to explain their thinking out loud.</li>
          <li>Praise effort and progress. A level can change as the year goes on.</li>
        </ul>
        <p>
          If you want a structured plan at home, Unica Learning mails personalized math and reading workbooks that follow the BC curriculum at your child&apos;s level. Your child works 15 to 20 minutes a day, 5 days a week. It is a way to practise. It does not replace talking to your child&apos;s teacher.
        </p>
        <p>
          You can also read our guides to <Link href="/resources/bc-grade-4-math-and-reading">Grade 4 math and reading in BC</Link> and the <Link href="/resources/bc-fsa-grade-4-and-7">BC FSA for Grades 4 and 7</Link>.
        </p>
      </Section>

      <AssessmentCta slug={meta.slug}>
        Not sure which skills to practise? A free placement assessment on paper finds your child&apos;s level and the gaps.
      </AssessmentCta>
    </>
  );
}
