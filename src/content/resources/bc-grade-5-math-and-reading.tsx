// Resource article: /resources/bc-grade-5-math-and-reading
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-grade-5-math-and-reading",
  title: "Grade 5 math and reading in BC: what your child learns",
  description: "Grade 5 math and reading in the BC curriculum: topics, practice questions and how to help at home. A plain-language guide for parents.",
  category: "BC curriculum",
  lead: "A plain-language guide to the BC curriculum for Grade 5 math and English language arts, with practice questions and ways to help at home.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What math is taught in Grade 5 in BC?",
      a: "The BC curriculum for Grade 5 math covers numbers to 1 000 000, decimals to thousandths, equivalent fractions, multi-digit multiplication and division with remainders, one-step equations with a variable, area and perimeter, elapsed time, 2D shapes and 3D objects, transformations, double bar graphs, probability and money.",
    },
    {
      q: "Do Grade 5 students learn fractions and decimals?",
      a: "Yes. Grade 5 students work with equivalent fractions, compare and order fractions and decimals, and add and subtract decimals to thousandths.",
    },
    {
      q: "Is there a provincial test in Grade 5?",
      a: "No. The provincial Foundation Skills Assessment (FSA) is given in Grade 4 and Grade 7. Your child’s Grade 5 teacher still reports on progress during the year.",
    },
    {
      q: "How can I find Grade 5 math questions to practise?",
      a: "The BC curriculum site lists topics but not worksheets. The example questions on this page match the Grade 5 topics. Your child’s teacher can tell you what the class is working on now.",
    },
  ],
  sources: [
    { label: "BC curriculum: Mathematics, Grade 5 (Big Ideas, Content, Curricular Competencies)", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/5", accessed: "2026-10-09" },
    { label: "BC curriculum: English Language Arts, Grade 5 (Big Ideas, Content, Curricular Competencies)", url: "https://curriculum.gov.bc.ca/curriculum/english-language-arts/5", accessed: "2026-10-09" },
    { label: "Province of British Columbia: Foundation Skills Assessment (FSA)", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment", accessed: "2026-10-09" },
  ],
  related: ["bc-grade-4-math-and-reading", "bc-grade-6-math-and-reading", "bc-proficiency-scale"],
};

export default function Body() {
  return (
    <>
      <p>
        Grade 5 math in BC moves from whole numbers into bigger numbers, equivalent fractions and decimals to thousandths. Your child also measures the area of squares and rectangles, and meets variables and double bar graphs. This guide explains the BC curriculum for Grade 5 in plain words, so you know what to expect and how to help.
      </p>

      <KeyFacts
        items={[
          <>BC Grade 5 math has five groups of ideas: number, computational fluency, patterning, geometry and measurement, and data and probability.<Cite n={1} /></>,
          <>Grade 5 English language arts (ELA) covers reading, listening and viewing, plus writing, speaking and representing.<Cite n={2} /></>,
          <>The provincial Foundation Skills Assessment runs in Grades 4 and 7, not Grade 5.<Cite n={3} /></>,
        ]}
      />

      <Section title="What Grade 5 math covers in BC">
        <p>
          Each grade in the BC math curriculum has five big ideas, one for each of the same five areas. Here is what each area means for Grade 5.<Cite n={1} />
        </p>
        <DataTable
          caption="Grade 5 math in the BC curriculum, in plain words"
          columns={["Group", "What your child learns"]}
          rows={[
            ["Number", "Whole numbers to 1 000 000 and place value. Decimals to thousandths. Equivalent fractions (two ways to show the same amount). Comparing and ordering fractions and decimals."],
            ["Computational fluency", "Adding and subtracting whole numbers to 1 000 000 and decimals to thousandths. Multiplying and dividing with multi-digit numbers, including division with remainders. Multiplication and division facts to 100, with many facts recalled by the end of the year."],
            ["Patterning", "Rules for increasing and decreasing patterns, written with words, numbers, symbols and variables. One-step equations with a variable, such as 4 + X = 15."],
            ["Geometry and measurement", "Area of squares and rectangles, and how area and perimeter relate. Elapsed time. Sorting 2D shapes and 3D objects, including quadrilaterals, prisms and pyramids. Slides, flips and turns."],
            ["Data and probability", "Double bar graphs, where one symbol can stand for a group. Predicting single outcomes in probability experiments and writing them as fractions."],
            ["Money", "Calculations with decimals to $1000, making change, simple financial plans and a simple budget."],
          ]}
          note="Source: BC curriculum, Mathematics 5, Content."
        />
        <p>
          As in other grades, students are asked to explain their thinking and to solve problems in more than one way.<Cite n={1} />
        </p>
      </Section>

      <Section title="What Grade 5 reading and writing cover">
        <p>
          Grade 5 ELA in BC has two parts. One is understanding what you read, hear and view. The other is creating and sharing your own ideas in writing, speaking and pictures.<Cite n={2} />
        </p>
        <ul>
          <li><strong>Kinds of text.</strong> Narrative, exposition and report forms, and categories such as fantasy, humour, adventure and biography.</li>
          <li><strong>Story parts.</strong> Narrative structure and characterization. New in this grade: perspective, or point of view.</li>
          <li><strong>Language tools.</strong> Sensory detail, imagery, simile and metaphor.</li>
          <li><strong>Reading strategies.</strong> Context clues, phonics and word structure, visualizing, questioning, predicting, summarizing and making inferences.</li>
          <li><strong>Writing.</strong> Paragraphs with a topic sentence and supporting details. Tenses and subject-verb agreement. Commas, quotation marks for dialogue, apostrophes in contractions, capital letters in titles and headings, and Canadian spelling.</li>
        </ul>
        <p>These items come from the Grade 5 ELA content.<Cite n={2} /></p>
      </Section>

      <Section title="Grade 5 math practice questions">
        <p>These example questions match the Grade 5 topics above. Cover the answers, let your child try, then check together.</p>
        <ol>
          <li>What is the value of the 4 in 148 320? <em>Answer: 40 000.</em></li>
          <li>Fill in the blank: 2/3 = ___/12. <em>Answer: 8.</em></li>
          <li>Add: 4.75 + 3.208. <em>Answer: 7.958.</em></li>
          <li>Multiply 36 x 12. <em>Answer: 432.</em></li>
          <li>Divide 175 by 6. <em>Answer: 29 remainder 1.</em></li>
          <li>Solve: x + 18 = 45. <em>Answer: x = 27.</em></li>
          <li>A garden is 9 m long and 6 m wide. What are its area and perimeter? <em>Answer: area 54 square metres, perimeter 30 m.</em></li>
          <li>A movie starts at 3:45 p.m. and ends at 5:20 p.m. How long is it? <em>Answer: 1 hour 35 minutes.</em></li>
        </ol>
        <h3>Reading practice ideas</h3>
        <ul>
          <li>Pick a favourite story and ask: who is telling it? Then try to retell one scene from another character’s point of view.</li>
          <li>Find three examples of figurative language in a book and explain what each one means.</li>
          <li>Ask your child to write a paragraph on a topic they love, with a clear topic sentence and supporting details.</li>
        </ul>
      </Section>

      <Section title="Where Grade 5 can feel hard">
        <p>
          Every child is different, but these are good places to look if homework feels like a struggle.
        </p>
        <ul>
          <li><strong>Long multiplication and division.</strong> Many steps means many chances to slip. Ask your child to write each step in a tidy column.</li>
          <li><strong>Decimals.</strong> Line up the decimal points before adding or subtracting.</li>
          <li><strong>Equivalent fractions.</strong> Draw two equal bars to show that 2/3 and 8/12 are the same amount.</li>
          <li><strong>Area versus perimeter.</strong> Area covers the inside. Perimeter goes around the edge.</li>
        </ul>
        <p>Find the weak spot, tell the teacher, and practise a little each day.</p>
      </Section>

      <Section title="How to help at home">
        <ul>
          <li><strong>Practise facts in short bursts.</strong> Games and skip counting can make this more fun than long drills. The curriculum says memorizing facts is not the goal at this level.</li>
          <li><strong>Use real measuring.</strong> Measure a room, then work out its area and perimeter.</li>
          <li><strong>Handle money and decimals.</strong> Let your child compare prices at the store or plan a small budget.</li>
          <li><strong>Ask for a second way.</strong> After an answer, ask: can you solve it a different way?</li>
          <li><strong>Read every day.</strong> Talk about the characters and why they act as they do.</li>
        </ul>
        <Callout label="Tip">
          <p>If your child is stuck, ask them to draw the problem. A picture often shows the next step.</p>
        </Callout>
      </Section>

      <Section title="If your child is behind or ahead">
        <p>
          Start with the teacher. Ask what your child does well, where they struggle, and how you can help at home.
        </p>
        <p>
          If your child is behind, check place value and multiplication facts first, because new topics build on them. If your child is ahead, look for problems that ask them to explain or prove an answer. Reading harder books and writing about them also helps.
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
