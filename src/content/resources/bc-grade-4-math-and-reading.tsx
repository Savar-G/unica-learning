// Resource article: /resources/bc-grade-4-math-and-reading
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-grade-4-math-and-reading",
  title: "Grade 4 math and reading in BC: what your child learns",
  description: "Grade 4 math and reading in the BC curriculum: topics, practice questions, FSA facts and how to help at home. Plain words for parents.",
  category: "BC curriculum",
  lead: "A plain-language guide to the BC curriculum for Grade 4 math and English language arts, with practice questions and ways to help at home.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What math does my child learn in Grade 4 in BC?",
      a: "The BC curriculum for Grade 4 math covers numbers to 10 000, fractions and decimals to hundredths, adding and subtracting to 10 000, multiplying and dividing, patterns and one-step equations, time, polygons, perimeter, line symmetry, graphs, probability experiments and money.",
    },
    {
      q: "Does my child have to know all the multiplication facts in Grade 4?",
      a: "No. The curriculum says students should be able to recall the 2s, 5s and 10s facts by the end of Grade 4. It says memorizing facts is not the goal at this level, and that students become more fluent over time.",
    },
    {
      q: "Is there a provincial test in Grade 4?",
      a: "Yes. The Foundation Skills Assessment (FSA) runs in Grade 4 and Grade 7. In 2026-27 schools give it between September 28 and November 6, 2026. It looks at literacy and numeracy, and it does not affect report card marks.",
    },
    {
      q: "Where can I find Grade 4 math worksheets for BC?",
      a: "The BC curriculum site lists what is taught but does not publish worksheets. The practice questions on this page show the style of question at this level. For more, ask your child’s teacher what the class is working on.",
    },
  ],
  sources: [
    { label: "BC curriculum: Mathematics, Grade 4 (Big Ideas, Content, Curricular Competencies)", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/4", accessed: "2026-10-09" },
    { label: "BC curriculum: English Language Arts, Grade 4 (Big Ideas, Content, Curricular Competencies)", url: "https://curriculum.gov.bc.ca/curriculum/english-language-arts/4", accessed: "2026-10-09" },
    { label: "Province of British Columbia: Foundation Skills Assessment (FSA)", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: All about the Foundation Skills Assessment, information for parents and caregivers (PDF)", url: "https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/assessment/fsa/en-foundation-skills-assessment-for-parents-and-caregivers.pdf", accessed: "2026-10-09" },
  ],
  related: ["bc-grade-3-math-and-reading", "bc-grade-5-math-and-reading", "bc-fsa-grade-4-and-7"],
};

export default function Body() {
  return (
    <>
      <p>
        Grade 4 math in BC builds on number sense. Your child works with numbers to 10 000, fractions and decimals, and multiplies and divides two- or three-digit numbers by one-digit numbers. This guide explains the BC curriculum for Grade 4 in plain words, so you know what to expect and how to help.
      </p>

      <KeyFacts
        items={[
          <>BC Grade 4 math has five groups of ideas: number, computational fluency, patterning, geometry and measurement, and data and probability.<Cite n={1} /></>,
          <>Grade 4 English language arts (ELA) covers reading, listening and viewing, plus writing, speaking and representing.<Cite n={2} /></>,
          <>Grade 4 is an FSA year. The provincial Foundation Skills Assessment runs in Grade 4 and Grade 7, and in 2026-27 schools give it from September 28 to November 6, 2026.<Cite n={3} /></>,
        ]}
      />

      <Section title="What Grade 4 math covers in BC">
        <p>
          Each grade in the BC math curriculum has five big ideas, one for each of the same five areas. Here is what each area means for Grade 4.<Cite n={1} />
        </p>
        <DataTable
          caption="Grade 4 math in the BC curriculum, in plain words"
          columns={["Group", "What your child learns"]}
          rows={[
            ["Number", "Numbers to 10 000 and place value. Decimals to hundredths. Comparing and ordering fractions that share a bottom number. How fractions and decimals connect."],
            ["Computational fluency", "Adding and subtracting to 10 000. Multiplying and dividing, including two- or three-digit numbers by one-digit numbers. Adding and subtracting decimals. Multiplication facts: 2s, 5s and 10s by the end of the year."],
            ["Patterning", "Increasing and decreasing patterns shown in words, numbers and tables. One-step equations with an unknown, such as ___ + 4 = 15."],
            ["Geometry and measurement", "Telling time on analog and digital clocks, including 12- and 24-hour clocks. Regular and irregular polygons. Perimeter. Line symmetry."],
            ["Data and probability", "Bar graphs and pictographs where one symbol stands for a group. Simple probability experiments with spinners, dice and tallies."],
            ["Money", "Calculations with decimal notation, making change with amounts to 100 dollars, and simple choices about earning, spending, saving and giving."],
          ]}
          note="Source: BC curriculum, Mathematics 4, Content. The curriculum also sets “competencies” such as reasoning, problem solving and explaining your thinking."
        />
        <p>
          The curriculum asks students to explain how they solved a problem, not only to give an answer. Expect your child to draw, use objects or talk through steps.<Cite n={1} />
        </p>
      </Section>

      <Section title="What Grade 4 reading and writing cover">
        <p>
          Grade 4 ELA in BC has two parts. One is understanding what you read, hear and view. The other is creating and sharing your own ideas in writing, speaking and pictures.<Cite n={2} />
        </p>
        <ul>
          <li><strong>Kinds of text.</strong> Stories, reports and other forms, with different purposes and categories such as fantasy, humour, adventure and biography.</li>
          <li><strong>Story parts.</strong> Theme, character, setting, plot and conflict. Imagery and figurative language such as simile and metaphor.</li>
          <li><strong>Reading strategies.</strong> Using context clues, using phonics and word structure, visualizing, questioning, predicting, summarizing and making inferences.</li>
          <li><strong>Information text.</strong> Finding main ideas and details, and using text features such as headings, the index, glossary, diagrams and charts.</li>
          <li><strong>Writing.</strong> Paragraphs with a topic sentence and supporting details. Past, present and future tenses. Commas, quotation marks for dialogue and apostrophes. Canadian spelling.</li>
          <li><strong>Word knowledge.</strong> Roots, prefixes and suffixes.</li>
        </ul>
        <p>These items come from the Grade 4 ELA content and competencies.<Cite n={2} /></p>
      </Section>

      <Section title="The FSA in Grade 4">
        <p>
          The Foundation Skills Assessment is a yearly provincial assessment of literacy and numeracy for all students in Grades 4 and 7. In 2026-27, schools give it from September 28 to November 6, 2026. Students answer online questions and questions in a paper booklet.<Cite n={3} />
        </p>
        <p>
          Each student gets an individual report that shows performance on proficiency levels, with descriptive, strength-based language.<Cite n={3} /> The levels are Emerging, On Track and Extending. The ministry says the FSA does not affect student marks or report cards.<Cite n={4} /> Read our full guide to the <Link href="/resources/bc-fsa-grade-4-and-7">BC FSA for Grade 4 and 7</Link>.
        </p>
      </Section>

      <Section title="Grade 4 math practice questions">
        <p>These example questions match the Grade 4 topics above. Cover the answers, let your child try, then check together.</p>
        <ol>
          <li>What is the value of the 6 in 4 608? <em>Answer: 600.</em></li>
          <li>Which is bigger, 3/8 or 5/8? <em>Answer: 5/8.</em></li>
          <li>Add: 3 482 + 2 759. <em>Answer: 6 241.</em></li>
          <li>Multiply 23 x 4. <em>Answer: 92.</em></li>
          <li>Divide 84 by 4. <em>Answer: 21.</em></li>
          <li>Add: 0.7 + 0.35. <em>Answer: 1.05.</em></li>
          <li>Find the missing number: ___ + 4 = 15. <em>Answer: 11.</em></li>
          <li>A rectangle is 6 cm long and 4 cm wide. What is its perimeter? <em>Answer: 20 cm.</em></li>
        </ol>
        <h3>Reading practice ideas</h3>
        <ul>
          <li>After a chapter, ask your child to tell the story in three sentences: who, what happened, how it ended.</li>
          <li>Read a short article together. Ask for the main idea and two details that support it.</li>
          <li>Ask your child to write one paragraph about their day. It needs a topic sentence and at least two details.</li>
        </ul>
      </Section>

      <Section title="Where Grade 4 can feel hard">
        <p>
          Every child is different, but these are good places to look if homework feels like a struggle.
        </p>
        <ul>
          <li><strong>Place value.</strong> Moving from hundreds to thousands is easy to mix up. Ask what each digit is worth.</li>
          <li><strong>Fractions.</strong> A fraction is a number, and also a part of a whole. Pictures help your child see both.</li>
          <li><strong>Multi-step word problems.</strong> Ask your child to say the problem in their own words before they calculate.</li>
          <li><strong>Writing a full paragraph.</strong> Plan first: a topic sentence, then two or three details.</li>
        </ul>
        <p>Find the weak spot, tell the teacher, and practise a little each day.</p>
      </Section>

      <Section title="How to help at home">
        <ul>
          <li><strong>Make number talk normal.</strong> Ask how your child got an answer. There is often more than one way.</li>
          <li><strong>Practise 2s, 5s and 10s.</strong> Skip count in the car or at the table.</li>
          <li><strong>Use real money and clocks.</strong> Let your child make change at the till or work out when a show ends.</li>
          <li><strong>Cut things into equal parts.</strong> A pizza or a chocolate bar shows fractions well.</li>
          <li><strong>Read 15 minutes a day.</strong> Let your child pick the book, then talk about it.</li>
        </ul>
        <Callout label="Tip">
          <p>Keep it short and regular. Ten calm minutes on most days is easier to keep up than one long weekend session.</p>
        </Callout>
      </Section>

      <Section title="If your child is behind or ahead">
        <p>
          Start with the teacher. Ask what your child does well, where they struggle, and what the class is working on now. Ask what you can practise at home.
        </p>
        <p>
          If your child is behind, go back to the last topic they felt sure about and build up from there. Place value and multiplication facts are good places to check first. If your child is ahead, keep them curious with problems that ask for reasoning and explanation, not only more of the same.
        </p>
        <p>
          Unica Learning makes personalized math workbooks for ages 5 to 14 and mails them home. The books follow the BC curriculum at your child’s level, not just their grade.
        </p>
        <AssessmentCta slug={meta.slug}>
          The free online math assessment shows your child’s math level and gaps, on a laptop or tablet.
        </AssessmentCta>
      </Section>
    </>
  );
}
