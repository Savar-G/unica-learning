// Resource article: /resources/bc-fsa-grade-4-and-7
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-fsa-grade-4-and-7",
  title: "BC FSA for Grade 4 and 7: sample tests, what it measures and how to prepare",
  description: "BC FSA Grade 4 and 7: what the Foundation Skills Assessment covers, when it runs, how results are reported, and where the official sample tests are.",
  category: "BC school guides",
  lead: "The Foundation Skills Assessment (FSA) is a provincial check of literacy and numeracy that every BC student takes in Grade 4 and Grade 7.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What is the FSA in BC?",
      a: "The Foundation Skills Assessment is an annual provincewide assessment of BC students in Grades 4 and 7. It looks at literacy and numeracy and gives parents, teachers, schools, districts and the ministry information on progress.",
    },
    {
      q: "Where can I find the FSA Grade 4 sample test?",
      a: "The BC ministry posts official FSA samples on its Foundation Skills Assessment samples page. For Grade 4 it has a collaboration activity, online questions, printable literacy and numeracy questions, a response booklet and possible solutions.",
    },
    {
      q: "When do students write the FSA?",
      a: "For 2026-2027, schools give the FSA between September 28 and November 6, 2026. The ministry lists new dates each school year on its FSA page.",
    },
    {
      q: "Does the FSA count toward report card marks?",
      a: "No. The ministry's FSA brochure for parents says the FSA does not impact student marks or report cards. FSA results are also not reported on student transcripts.",
    },
    {
      q: "What do FSA results look like?",
      a: "Results use three levels: Emerging, On Track and Extending. Teachers mark the FSA with the same provincial proficiency scale used on K-9 report cards, but for the FSA the Developing and Proficient levels are joined into one level called On Track. A student report uses descriptive, strength-based language.",
    },
  ],
  sources: [
    { label: "BC Ministry of Education and Child Care: Foundation Skills Assessment (FSA)", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: Foundation Skills Assessment Samples", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment/fsa-samples", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: Foundation Skills Assessment Specifications (PDF)", url: "https://www2.gov.bc.ca/assets/gov/education/administration/kindergarten-to-grade-12/assessment/fsa_description_and_specs.pdf", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: Foundation Skills Assessment Specifications page", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment/specifications", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: All about the Foundation Skills Assessment, information for parents and caregivers (PDF)", url: "https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/assessment/fsa/en-foundation-skills-assessment-for-parents-and-caregivers.pdf", accessed: "2026-10-09" },
  ],
  related: ["bc-grade-4-math-and-reading", "bc-grade-7-math-and-reading", "bc-proficiency-scale"],
};

export default function Body() {
  return (
    <>
      <KeyFacts
        items={[
          <>All BC students take the FSA in Grade 4 and Grade 7.<Cite n={1} /></>,
          <>It covers literacy and numeracy.<Cite n={1} /></>,
          <>2026-2027 window: September 28 to November 6, 2026.<Cite n={1} /></>,
          <>Results use three levels: Emerging, On Track, Extending. They are not on transcripts.<Cite n={3} /></>,
          <>The FSA does not affect report card marks.<Cite n={5} /></>,
          <>The ministry posts official sample tests for both grades.<Cite n={2} /></>,
        ]}
      />

      <Section title="What is the BC FSA for Grade 4 and 7?">
        <p>
          The Foundation Skills Assessment, or FSA, is a yearly provincewide assessment of the academic skills of BC students in Grade 4 and Grade 7. It gives parents, teachers, schools, districts and the ministry information on how students are doing in literacy and numeracy.<Cite n={1} />
        </p>
        <p>
          The ministry says the FSA is meant to complement what teachers learn through their own assessment all year.<Cite n={3} /> It is one snapshot. It is not a full picture of your child.
        </p>
      </Section>

      <Section title="What the FSA covers">
        <p>
          The FSA has a literacy part and a numeracy part. The literacy part asks students to read a range of texts, show they understand them and write about them. The numeracy part asks students to use math skills to solve real-life problems.<Cite n={3} /> It links to the BC curriculum for language arts and mathematics.<Cite n={4} />
        </p>
        <p>The assessment has these parts:</p>
        <ul>
          <li><strong>A group collaboration activity.</strong> The teacher leads it. Students talk about two literacy themes and choose one.<Cite n={3} /></li>
          <li><strong>A paper student booklet.</strong> Students write answers to three literacy questions and three numeracy questions.<Cite n={3} /></li>
          <li><strong>Online questions.</strong> The official sample has 30 literacy and 30 numeracy questions, plus two self-reflection questions.<Cite n={2} /></li>
        </ul>
        <p>
          The ministry&apos;s parent brochure says each part takes one hour or less, and the school can spread the parts over several days or weeks in the fall.<Cite n={5} />
        </p>
        <p>
          The Grade 4 FSA reflects the learning expected at the end of Grade 3. The Grade 7 FSA reflects the end of Grade 6.<Cite n={4} />
        </p>
      </Section>

      <Section title="When students write the FSA">
        <p>
          For 2026-2027, the ministry lists a window of September 28 to November 6, 2026.<Cite n={1} /> Your school picks the exact days inside that window. Ask the teacher or check the school newsletter.
        </p>
        <DataTable
          caption="FSA 2026-2027 key dates from the ministry"
          columns={["Step", "Date"]}
          rows={[
            ["Schools give the FSA", "September 28 to November 6, 2026"],
            ["Scoring and score entry deadline", "December 4, 2026"],
          ]}
          note={<>Source: ministry FSA page.<Cite n={1} /> Dates change each school year.</>}
        />
      </Section>

      <Section title="How FSA results are reported">
        <p>
          The FSA uses three levels: Emerging, On Track and Extending. Each student gets an overall score that is placed in one of the three levels.<Cite n={3} /> The ministry describes the levels as broad, strength-based and descriptive.<Cite n={3} />
        </p>
        <p>
          The student report is ready once the school finishes scoring. It shows performance on the proficiency levels in descriptive, strength-based language. Teachers can share it with students and parents, along with your child&apos;s written response booklet.<Cite n={1} /> Schools and districts usually get these reports by November.<Cite n={3} />
        </p>
        <Callout label="Same scale, three levels">
          <p>
            Teachers mark the FSA with the provincial proficiency scale, the same scale used on K-9 report cards. For the FSA, Developing and Proficient are joined into one level, On Track, so you can see if your child is on track in literacy and numeracy.<Cite n={5} /> Our guide to the <Link href="/resources/bc-proficiency-scale">BC proficiency scale</Link> explains the four report card levels.
          </p>
        </Callout>
        <h3>Does the FSA count toward report card marks?</h3>
        <p>
          No. The ministry&apos;s parent brochure says the FSA does not impact student marks or report cards, and that it is not a high-stakes assessment.<Cite n={5} /> FSA results are also not reported on student transcripts.<Cite n={3} />
        </p>
      </Section>

      <Section title="FSA Grade 4 practice test and sample test">
        <p>
          The official sample tests are free on the ministry&apos;s <a href="https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment/fsa-samples" rel="noopener" target="_blank">FSA samples page</a>. They show the format of the assessment and the balance of questions.<Cite n={4} /> For each grade, the page lists:
        </p>
        <ul>
          <li>a sample collaboration activity,</li>
          <li>online sample questions,</li>
          <li>printable literacy questions and printable numeracy questions,</li>
          <li>a sample student response booklet, and</li>
          <li>possible solutions.<Cite n={2} /></li>
        </ul>
        <p>
          We do not copy test items here. Use the ministry&apos;s page so you get the real samples. The ministry also posts a specifications document that explains how each grade is assessed.<Cite n={4} />
        </p>
      </Section>

      <Section title="How to prepare without stress">
        <p>
          The ministry describes the collaboration activity as a relaxed start that reduces student worry.<Cite n={3} /> The ministry&apos;s parent brochure says your child does not need to prepare for the FSA, and that talking about it at home can help a nervous child feel more confident.<Cite n={5} /> Here are calm ways to help:
        </p>
        <ol>
          <li>Look at the official sample together once, so the format is not a surprise. Keep it short and friendly.</li>
          <li>Read with your child most days. Talk about what the story means.</li>
          <li>Ask your child to explain how they solved a math problem, in words.</li>
          <li>Keep the tone light. Say the test is one check of what they have learned so far.</li>
          <li>Plan good sleep and a good breakfast on the days of the test.</li>
        </ol>
        <p>
          For what your child studies in each grade, read our guides to <Link href="/resources/bc-grade-4-math-and-reading">Grade 4 math and reading</Link> and <Link href="/resources/bc-grade-7-math-and-reading">Grade 7 math and reading</Link>.
        </p>
        <p>
          If you want steady practice at home, Unica Learning mails personalized math and reading workbooks for ages 6 to 12 that follow the BC curriculum at your child&apos;s level. Our placement assessment is not an FSA practice test and does not predict FSA results.
        </p>
      </Section>

      <Section title="What about FSA school rankings?">
        <p>
          Parents often search for FSA school rankings. The ministry has a clear position: it does not support the rating or ranking of schools based on FSA results. It says any measure of a school&apos;s success should include a wider range of student achievement and factors such as special programs and unique teachers.<Cite n={3} />
        </p>
        <p>
          If you see a ranking that uses FSA data, keep that position in mind. One assessment cannot show everything a school does.
        </p>
      </Section>

      <AssessmentCta slug={meta.slug}>
        Want to see where your child is in math and reading? A free placement assessment on paper finds their level and gaps.
      </AssessmentCta>
    </>
  );
}
