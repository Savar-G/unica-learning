// Resource article: /resources/bc-grade-7-math-and-reading
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-grade-7-math-and-reading",
  title: "Grade 7 math and reading in BC: what your child learns",
  description: "Grade 7 math and reading in the BC curriculum: integers, circles, equations, FSA facts and practice questions. A plain-language guide for parents.",
  category: "BC curriculum",
  lead: "A plain-language guide to the BC curriculum for Grade 7 math and English language arts, with FSA facts, practice questions and ways to help at home.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What math is taught in Grade 7 in BC?",
      a: "The BC curriculum for Grade 7 math covers operations with integers and decimals, relationships between decimals, fractions, ratios and percents, linear relations, two-step equations, circumference and area of circles, volume of prisms and cylinders, Cartesian coordinates, transformations, circle graphs, experimental probability and financial percent calculations.",
    },
    {
      q: "Does Grade 7 math include negative numbers?",
      a: "Yes. Grade 7 students add, subtract, multiply and divide integers, which are positive and negative whole numbers. They also use the order of operations with brackets.",
    },
    {
      q: "Is there a provincial test in Grade 7?",
      a: "Yes. The Foundation Skills Assessment (FSA) runs in Grade 4 and Grade 7. In 2026-27 schools give it between September 28 and November 6, 2026. It looks at literacy and numeracy, and it does not affect report card marks.",
    },
    {
      q: "Where can I find Grade 7 math worksheets for BC?",
      a: "The BC curriculum site lists what is taught but does not publish worksheets. The practice questions on this page match the Grade 7 topics. Your child’s teacher can tell you what the class is working on now.",
    },
  ],
  sources: [
    { label: "BC curriculum: Mathematics, Grade 7 (Big Ideas, Content, Curricular Competencies)", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/7", accessed: "2026-10-09" },
    { label: "BC curriculum: English Language Arts, Grade 7 (Big Ideas, Content, Curricular Competencies)", url: "https://curriculum.gov.bc.ca/curriculum/english-language-arts/7", accessed: "2026-10-09" },
    { label: "Province of British Columbia: Foundation Skills Assessment (FSA)", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment", accessed: "2026-10-09" },
    { label: "BC Ministry of Education and Child Care: All about the Foundation Skills Assessment, information for parents and caregivers (PDF)", url: "https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/pdf/assessment/fsa/en-foundation-skills-assessment-for-parents-and-caregivers.pdf", accessed: "2026-10-09" },
  ],
  related: ["bc-grade-6-math-and-reading", "bc-fsa-grade-4-and-7", "bc-proficiency-scale"],
};

export default function Body() {
  return (
    <>
      <p>
        Grade 7 math in BC brings negative numbers, two-step equations and circles. The BC curriculum for Grade 7 also links decimals, fractions and percents more closely. This guide explains what your child learns in plain words, so you know what to expect and how to help.
      </p>

      <KeyFacts
        items={[
          <>BC Grade 7 math has five groups of ideas: number, computational fluency, patterning (linear relations), geometry and measurement, and data and probability.<Cite n={1} /></>,
          <>Grade 7 English language arts (ELA) covers reading, listening and viewing, plus writing, speaking and representing.<Cite n={2} /></>,
          <>Grade 7 is an FSA year. The provincial Foundation Skills Assessment runs in Grade 4 and Grade 7, and in 2026-27 schools give it from September 28 to November 6, 2026.<Cite n={3} /></>,
        ]}
      />

      <Section title="What Grade 7 math covers in BC">
        <p>
          Each grade in the BC math curriculum has five big ideas, one for each of the same five areas. Here is what each area means for Grade 7.<Cite n={1} />
        </p>
        <DataTable
          caption="Grade 7 math in the BC curriculum, in plain words"
          columns={["Group", "What your child learns"]}
          rows={[
            ["Number", "How decimals, fractions, ratios and percents connect (for example, 1/2 = 0.5 = 50%). Comparing and ordering decimals and fractions on a number line."],
            ["Computational fluency", "Adding, subtracting, multiplying and dividing integers and decimals. Order of operations with brackets. Multiplication and division facts to 100, used in flexible ways."],
            ["Patterning", "Linear relations shown with expressions, tables and graphs, in all four quadrants. Two-step equations such as 3x + 4 = 16."],
            ["Geometry and measurement", "Circumference and area of circles, and the constant ratio between circumference and diameter. Volume of rectangular prisms and cylinders. Cartesian coordinates. Combining slides, flips and turns, and tessellations."],
            ["Data and probability", "Building and reading circle graphs. Experimental probability with two independent events, such as tossing two coins."],
            ["Money", "Percent calculations with sales tax, tips, discounts and sale prices."],
          ]}
          note="Source: BC curriculum, Mathematics 7, Content."
        />
      </Section>

      <Section title="What Grade 7 reading and writing cover">
        <p>
          Grade 7 ELA in BC has two parts. One is understanding what you read, hear and view. The other is creating and sharing your own ideas in writing, speaking and pictures.<Cite n={2} />
        </p>
        <ul>
          <li><strong>Kinds of text.</strong> Narrative, exposition and report forms, and categories such as fantasy, humour, adventure and biography.</li>
          <li><strong>Story parts.</strong> Narrative structure, characterization and setting. Sensory detail, sound devices, simile and metaphor.</li>
          <li><strong>Argument.</strong> Reading and building arguments.</li>
          <li><strong>Reading strategies.</strong> Context clues, visualizing, questioning, predicting, summarizing and making inferences.</li>
          <li><strong>Writing.</strong> Paragraphs with unity, development and coherence. A mix of simple, compound and complex sentences, correct pronouns, transition words, and spotting run-ons and fragments. Canadian spelling.</li>
          <li><strong>Language and presentation.</strong> Regional dialects, Canadian versus American English, formal versus informal language, and choosing the right medium for the audience.</li>
        </ul>
        <p>These items come from the Grade 7 ELA content.<Cite n={2} /></p>
      </Section>

      <Section title="The FSA in Grade 7">
        <p>
          The Foundation Skills Assessment is a yearly provincial assessment of literacy and numeracy for all students in Grades 4 and 7. In 2026-27, schools give it from September 28 to November 6, 2026. Students answer online questions and questions in a paper booklet.<Cite n={3} />
        </p>
        <p>
          Each student gets an individual report that shows performance on proficiency levels, with descriptive, strength-based language.<Cite n={3} /> The levels are Emerging, On Track and Extending. The ministry says the FSA does not affect student marks or report cards.<Cite n={4} /> Read our full guide to the <Link href="/resources/bc-fsa-grade-4-and-7">BC FSA for Grade 4 and 7</Link>.
        </p>
      </Section>

      <Section title="Grade 7 math practice questions">
        <p>These example questions match the Grade 7 topics above. Cover the answers, let your child try, then check together.</p>
        <ol>
          <li>Work out -5 + 8. <em>Answer: 3.</em></li>
          <li>Work out 6 - (-4). <em>Answer: 10.</em></li>
          <li>Write 3/8 as a decimal and as a percent. <em>Answer: 0.375 and 37.5%.</em></li>
          <li>Multiply 2.4 x 1.5. <em>Answer: 3.6.</em></li>
          <li>Solve 2x - 5 = 11. <em>Answer: x = 8.</em></li>
          <li>A circle has a radius of 5 cm. Using 3.14 for pi, find the circumference and the area. <em>Answer: circumference 31.4 cm, area 78.5 square centimetres.</em></li>
          <li>A jacket costs $40 and is 15% off. What is the sale price? <em>Answer: $34.</em></li>
          <li>A circle graph shows that 25% of 60 students walk to school. How many is that? <em>Answer: 15 students.</em></li>
        </ol>
        <h3>Reading practice ideas</h3>
        <ul>
          <li>Read an opinion article together. Ask your child to name the claim and two pieces of evidence.</li>
          <li>Ask your child to write a short argument on a topic they care about, with a clear claim and reasons.</li>
          <li>Compare how the same news story is told in two places. What is the same, and what differs?</li>
        </ul>
      </Section>

      <Section title="Where Grade 7 can feel hard">
        <p>
          Every child is different, but these are good places to look if homework feels like a struggle.
        </p>
        <ul>
          <li><strong>Negative numbers.</strong> Use a number line. Subtracting a negative moves you right, as in 6 - (-4) = 10.</li>
          <li><strong>Equations.</strong> Do the same thing to both sides, like a balance scale.</li>
          <li><strong>Pi and circles.</strong> Keep radius and diameter apart: the diameter is twice the radius.</li>
          <li><strong>Longer writing.</strong> Plan the claim and the reasons before writing, then check each paragraph stays on one idea.</li>
        </ul>
        <p>Find the weak spot, tell the teacher, and practise a little each day.</p>
      </Section>

      <Section title="How to help at home">
        <ul>
          <li><strong>Use integers in real life.</strong> Temperature, bank balances and elevator floors all use negative numbers.</li>
          <li><strong>Let them work out percents.</strong> Sales, tips and tax are daily practice.</li>
          <li><strong>Measure circles.</strong> Measure the distance across and around a lid or a plate.</li>
          <li><strong>Ask for the steps.</strong> For equations, ask your child to check the answer by putting it back in.</li>
          <li><strong>Keep reading.</strong> Novels, news and articles all build the skills for argument and evidence.</li>
        </ul>
        <Callout label="Tip">
          <p>Grade 7 work is more abstract. If an idea is hard, go back to a picture, a number line or real objects first.</p>
        </Callout>
      </Section>

      <Section title="If your child is behind or ahead">
        <p>
          Start with the teacher. Ask what your child does well, where they struggle, and how you can help at home.
        </p>
        <p>
          If your child is behind, check fractions, decimals and percents first, because many Grade 7 topics build on them. If your child is ahead, look for problems that need several steps and an explanation. Wide reading and writing about it keep them stretched.
        </p>
        <p>
          Unica Learning makes personalized math workbooks for ages 6-12 and mails them home. The books follow the BC curriculum at your child’s level, not just their grade.
        </p>
        <AssessmentCta slug={meta.slug}>
          The free online math assessment shows your child’s math level and gaps, on a laptop or tablet.
        </AssessmentCta>
      </Section>
    </>
  );
}
