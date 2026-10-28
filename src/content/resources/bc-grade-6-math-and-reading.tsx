// Resource article: /resources/bc-grade-6-math-and-reading
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-grade-6-math-and-reading",
  title: "Grade 6 math and reading in BC: what your child learns",
  description: "Grade 6 math and reading in the BC curriculum: ratios, percents, decimals, persuasion and more. Practice questions and tips for parents.",
  category: "BC curriculum",
  lead: "A plain-language guide to the BC curriculum for Grade 6 math and English language arts, with practice questions and ways to help at home.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What math is taught in Grade 6 in BC?",
      a: "The BC curriculum for Grade 6 math covers place value from thousandths to billions, order of operations, factors and multiples, improper fractions and mixed numbers, introductory ratios, whole-number percents, multiplying and dividing decimals, patterns and one-step equations, area, angles, volume, triangles, transformations, line graphs, probability and money.",
    },
    {
      q: "Does Grade 6 math include ratios and percents?",
      a: "Yes. Grade 6 introduces ratios, including part-to-part and part-to-whole ratios, and whole-number percents and percentage discounts.",
    },
    {
      q: "Is there a provincial test in Grade 6?",
      a: "No. The provincial Foundation Skills Assessment (FSA) is given in Grade 4 and Grade 7. The next one for your child comes in Grade 7.",
    },
    {
      q: "How can I find Grade 6 math questions to practise?",
      a: "The BC curriculum site lists topics but not worksheets. The example questions on this page match the Grade 6 topics. Your child’s teacher can tell you what the class is working on now.",
    },
  ],
  sources: [
    { label: "BC curriculum: Mathematics, Grade 6 (Big Ideas, Content, Curricular Competencies)", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/6", accessed: "2026-10-09" },
    { label: "BC curriculum: English Language Arts, Grade 6 (Big Ideas, Content, Curricular Competencies)", url: "https://curriculum.gov.bc.ca/curriculum/english-language-arts/6", accessed: "2026-10-09" },
    { label: "Province of British Columbia: Foundation Skills Assessment (FSA)", url: "https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/program-management/assessment/foundation-skills-assessment", accessed: "2026-10-09" },
  ],
  related: ["bc-grade-5-math-and-reading", "bc-grade-7-math-and-reading", "bc-proficiency-scale"],
};

export default function Body() {
  return (
    <>
      <p>
        Grade 6 math in BC is a big step. Your child meets ratios, percents, mixed numbers and multiplying and dividing decimals. This guide explains the BC curriculum for Grade 6 in plain words, so you know what to expect and how to help.
      </p>

      <KeyFacts
        items={[
          <>BC Grade 6 math has five groups of ideas: number, computational fluency, patterning (linear relations), geometry and measurement, and data and probability.<Cite n={1} /></>,
          <>Grade 6 English language arts (ELA) covers reading, listening and viewing, plus writing, speaking and representing.<Cite n={2} /></>,
          <>The provincial Foundation Skills Assessment runs in Grades 4 and 7, not Grade 6.<Cite n={3} /></>,
        ]}
      />

      <Section title="What Grade 6 math covers in BC">
        <p>
          Each grade in the BC math curriculum has five big ideas, one for each of the same five areas. Here is what each area means for Grade 6.<Cite n={1} />
        </p>
        <DataTable
          caption="Grade 6 math in the BC curriculum, in plain words"
          columns={["Group", "What your child learns"]}
          rows={[
            ["Number", "Place value from thousandths to billions. Factors, multiples, prime and composite numbers. Improper fractions and mixed numbers. Introductory ratios, whole-number percents and percentage discounts."],
            ["Computational fluency", "Multiplication and division facts to 100. Multiplying and dividing decimals, such as 0.125 x 3 or 7.2 ÷ 9. Order of operations with brackets. Quotients that can be decimals or fractions."],
            ["Patterning", "Increasing and decreasing patterns shown with expressions, tables and graphs. One-step equations such as 3x = 12 and x + 5 = 11."],
            ["Geometry and measurement", "Perimeter of complex shapes. Area of triangles, parallelograms and trapezoids. Angles: straight, acute, right, obtuse and reflex. Volume and capacity. Types of triangles. Plotting points on a Cartesian plane and combining slides, flips and turns."],
            ["Data and probability", "Creating and reading line graphs. Single-outcome probability: listing outcomes, and comparing experiment results with what you expect."],
            ["Money", "Informed choices about saving and buying, simple budgeting and consumer math."],
          ]}
          note="Source: BC curriculum, Mathematics 6, Content."
        />
      </Section>

      <Section title="What Grade 6 reading and writing cover">
        <p>
          Grade 6 ELA in BC has two parts. One is understanding what you read, hear and view. The other is creating and sharing your own ideas in writing, speaking and pictures.<Cite n={2} />
        </p>
        <ul>
          <li><strong>Kinds of text.</strong> Narrative, exposition and report forms, and categories such as fantasy, humour, adventure and biography.</li>
          <li><strong>Story parts.</strong> Narrative structure, characterization and setting. Sensory detail, sound devices, simile and metaphor.</li>
          <li><strong>Persuasion.</strong> How writers use emotional and logical appeals to persuade.</li>
          <li><strong>Reading strategies.</strong> Context clues, visualizing, questioning, predicting, summarizing and making inferences.</li>
          <li><strong>Writing.</strong> Paragraphs with unity, development and coherence. Varied sentences, pronouns, transition words, and spotting run-ons and fragments. All standard punctuation and Canadian spelling.</li>
          <li><strong>Language and presentation.</strong> Regional dialects, Canadian versus American English, formal versus informal language (such as texting versus an essay), and choosing the right medium for the audience.</li>
        </ul>
        <p>These items come from the Grade 6 ELA content.<Cite n={2} /></p>
      </Section>

      <Section title="Grade 6 math practice questions">
        <p>These example questions match the Grade 6 topics above. Cover the answers, let your child try, then check together.</p>
        <ol>
          <li>Which is larger, 0.45 or 0.405? <em>Answer: 0.45.</em></li>
          <li>Work out 3 + 4 x (8 - 2). <em>Answer: 27.</em></li>
          <li>List all the factors of 18. <em>Answer: 1, 2, 3, 6, 9, 18.</em></li>
          <li>Write 11/4 as a mixed number. <em>Answer: 2 3/4.</em></li>
          <li>A class has 10 boys and 15 girls. What is the ratio of boys to girls in simplest form? <em>Answer: 2 : 3.</em></li>
          <li>A $50 shirt is 20% off. What is the sale price? <em>Answer: $40.</em></li>
          <li>Multiply 0.125 x 3, then divide 7.2 by 9. <em>Answer: 0.375 and 0.8.</em></li>
          <li>A triangle has a base of 10 cm and a height of 6 cm. What is its area? <em>Answer: 30 square centimetres.</em></li>
        </ol>
        <h3>Reading practice ideas</h3>
        <ul>
          <li>Find an ad or a short opinion piece. Ask: what is the writer trying to make you feel, and what reasons do they give?</li>
          <li>Rewrite a text message as a polite email to a teacher. Talk about what changed.</li>
          <li>Ask your child to write two paragraphs that argue for something they care about.</li>
        </ul>
      </Section>

      <Section title="Where Grade 6 can feel hard">
        <p>
          Every child is different, but these are good places to look if homework feels like a struggle.
        </p>
        <ul>
          <li><strong>Ratios.</strong> A ratio compares amounts. Use real objects, such as 2 red counters for every 3 blue ones.</li>
          <li><strong>Percents.</strong> Link them to 100 and to fractions: 50% is half, 25% is a quarter.</li>
          <li><strong>Decimal operations.</strong> Estimate first, so a misplaced decimal point looks wrong.</li>
          <li><strong>Area formulas.</strong> Rather than memorize, ask how a parallelogram can turn into a rectangle.</li>
        </ul>
        <p>Find the weak spot, tell the teacher, and practise a little each day.</p>
      </Section>

      <Section title="How to help at home">
        <ul>
          <li><strong>Use percents and ratios in daily life.</strong> Work out a sale price, a tip or a recipe made bigger.</li>
          <li><strong>Check estimates.</strong> Ask: should the answer be bigger or smaller than 10? This catches slips.</li>
          <li><strong>Draw it.</strong> A fraction strip, a 10 x 10 grid or a sketch of a shape makes a hard idea clear.</li>
          <li><strong>Keep facts sharp.</strong> A few minutes of multiplication and division facts helps with factors, ratios and decimals.</li>
          <li><strong>Talk about what they read.</strong> Ask what the author wants you to think, and whether you agree.</li>
        </ul>
        <Callout label="Tip">
          <p>If an answer looks wrong, ask your child to walk you through each step. They often find the slip themselves.</p>
        </Callout>
      </Section>

      <Section title="If your child is behind or ahead">
        <p>
          Start with the teacher. Ask what your child does well, where they struggle, and how you can help at home.
        </p>
        <p>
          If your child is behind, check fractions, decimals and multiplication facts first, because Grade 6 topics build on them. If your child is ahead, look for problems that connect ideas, such as a percent problem that also uses a ratio. Wide reading and writing about it keep them stretched.
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
