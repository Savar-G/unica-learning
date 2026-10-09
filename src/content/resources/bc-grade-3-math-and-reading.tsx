// Resource article: /resources/bc-grade-3-math-and-reading
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-grade-3-math-and-reading",
  title: "Grade 3 math and reading in BC: what your child learns",
  description: "What Grade 3 math and reading cover in the BC curriculum, in plain words: fractions, multiplication, practice questions and tips if your child needs help.",
  category: "BC curriculum",
  lead: "A plain-language guide to Grade 3 math and reading in the BC curriculum, with practice questions you can try at home.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What is in the BC Grade 3 math curriculum?",
      a: "Grade 3 math covers numbers to 1000, fractions, adding and subtracting to 1000, multiplication and division ideas, patterns, equations with an unknown number, measurement in standard units, time concepts, 3D objects, graphs, chance, and money to 100 dollars.",
    },
    {
      q: "Does my child need to memorize times tables in Grade 3?",
      a: "No. The BC curriculum says memorization of multiplication facts is not intended at this level. Children learn what multiplication and division mean, using groups, arrays, sharing and skip-counting.",
    },
    {
      q: "Does my Grade 3 child need to tell time on a clock?",
      a: "The curriculum says telling time is not expected at this level. Grade 3 focuses on the ideas of time, such as seconds, minutes, hours, days and weeks, and how the units relate.",
    },
    {
      q: "Where can I find Grade 3 math questions and reading practice?",
      a: "The BC curriculum does not publish worksheets. This page has eight example math questions with answers and three reading practice ideas. Your child's teacher can also say what the class is working on.",
    },
    {
      q: "What should I do if my Grade 3 child is struggling?",
      a: "Talk to the teacher, find the skill that is stuck, and practise it for a few minutes a day with objects and drawings. Grade 3 builds on place value and addition facts to 20, so check those first.",
    },
  ],
  sources: [
    { label: "BC Curriculum: Mathematics, Grade 3 (Big Ideas, Curricular Competencies, Content)", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/3", accessed: "2026-10-09" },
    { label: "BC Curriculum: English Language Arts, Grade 3 (Big Ideas, Curricular Competencies, Content)", url: "https://curriculum.gov.bc.ca/curriculum/english-language-arts/3", accessed: "2026-10-09" },
  ],
  related: ["bc-grade-2-math-and-reading", "bc-proficiency-scale"],
};

export default function Body() {
  return (
    <>
      <p>
        Grade 3 math in the BC curriculum is a big step. Children work with numbers to 1000, meet fractions as numbers, and begin multiplication and division. Grade 3 reading asks for fluent reading with attention to punctuation, and for longer writing. This guide explains the BC curriculum for Grade 3 in plain words.
      </p>

      <KeyFacts
        items={[
          <>BC Grade 3 math has five big ideas: number, computational fluency, patterning, geometry and measurement, and data and probability.<Cite n={1} /></>,
          <>Children work with numbers to 1000 and with fractions.<Cite n={1} /></>,
          <>Multiplication and division are introduced as ideas. Memorizing facts is not intended at this level.<Cite n={1} /></>,
          <>Grade 3 English Language Arts includes fluent reading, story elements such as conflict and theme, and writing in varied forms.<Cite n={2} /></>,
        ]}
      />

      <Section title="What Grade 3 math covers in BC">
        <p>
          Here are the main parts of the Grade 3 content list.<Cite n={1} />
        </p>
        <DataTable
          caption="Grade 3 math content in the BC curriculum"
          columns={["Area", "What your child works on"]}
          rows={[
            ["Numbers to 1000", <>Skip-counting from any starting point; place value in hundreds, tens and ones; comparing and ordering; estimating large amounts<Cite n={1} /></>],
            ["Fractions", <>Fractions as numbers for equal parts of a whole, a set or a line; making and drawing fractions with objects<Cite n={1} /></>],
            ["Adding and subtracting", <>Adding and subtracting to 1000 with flexible strategies; estimating; facts to 20, with most children able to recall addition facts to 20 by the end of Grade 3<Cite n={1} /></>],
            ["Multiplication and division", <>Meaning of multiplication (groups, arrays, repeated addition) and division (sharing, grouping); linking them to skip-counting<Cite n={1} /></>],
            ["Patterns and equations", <>Increasing and decreasing patterns and their rules; one-step equations with an unknown, such as n + 15 = 20<Cite n={1} /></>],
            ["Measurement and time", <>Centimetres, metres, kilometres, millilitres, litres, grams and kilograms; ideas of perimeter and area; units of time<Cite n={1} /></>],
            ["3D objects", <>Faces, edges and vertices; names such as cube, prism, cone, cylinder and sphere<Cite n={1} /></>],
            ["Data and chance", <>Bar graphs, pictographs, charts and tables; more likely, less likely and equally likely<Cite n={1} /></>],
            ["Money", <>Counting coins and bills up to 100 dollars; different ways to pay and to earn money<Cite n={1} /></>],
          ]}
          note="Summarized from the Grade 3 Mathematics content list."
        />
        <Callout label="Good to know">
          <p>The curriculum says telling time is not expected at this level, and memorizing multiplication facts is not intended.<Cite n={1} /> If someone tells you your Grade 3 child should know the whole times table, that is not what the BC curriculum asks.</p>
        </Callout>
      </Section>

      <Section title="What Grade 3 reading and writing cover">
        <p>
          Grade 3 English Language Arts asks for fluent reading, with phrasing and attention to punctuation.<Cite n={2} /> The content list includes:
        </p>
        <ul>
          <li><strong>Story elements.</strong> Character, plot, setting, conflict and theme.<Cite n={2} /></li>
          <li><strong>Text features.</strong> Headings, diagrams, columns and sidebars.<Cite n={2} /></li>
          <li><strong>Language devices.</strong> Descriptive language, simile, alliteration, rhythm and rhyme.<Cite n={2} /></li>
          <li><strong>Reading strategies.</strong> Predicting, rereading, retelling, finding the main idea and details, and using phonics.<Cite n={2} /></li>
          <li><strong>Writing.</strong> Personal writing, letters, poems, multi-page stories and simple non-fiction.<Cite n={2} /></li>
          <li><strong>Conventions.</strong> Compound sentences, punctuation, apostrophes in contractions, and word roots and endings.<Cite n={2} /></li>
        </ul>
      </Section>

      <Section title="Grade 3 math practice questions">
        <p>
          These example questions were written for this guide. They are not taken from the curriculum.
        </p>
        <ol>
          <li>What is the value of the 4 in 342? <em>Answer: 40 (4 tens).</em></li>
          <li>What does the 0 in 408 tell you? <em>Answer: There are 0 tens.</em></li>
          <li>What is 365 + 248? <em>Answer: 613.</em></li>
          <li>What is 702 − 258? <em>Answer: 444.</em></li>
          <li>There are 4 bags with 6 apples in each. How many apples? <em>Answer: 24.</em></li>
          <li>20 stickers are shared equally among 5 friends. How many each? <em>Answer: 4.</em></li>
          <li>n + 15 = 20. What is n? <em>Answer: 5.</em></li>
          <li>5, 10, 20, 40, __. What is the rule and what is next? <em>Answer: doubling; 80.</em></li>
        </ol>
        <h3>Reading practice ideas</h3>
        <ul>
          <li>Read a chapter aloud. Ask your child to change their voice at commas and periods.</li>
          <li>After a story, ask: what was the problem, and how was it solved?</li>
          <li>Ask your child to write a short letter to a relative, then check punctuation together.</li>
        </ul>
      </Section>

      <Section title="How to help at home">
        <ul>
          <li>Build multiplication from real things: egg cartons, muffin trays, rows of chairs.</li>
          <li>Cut a pizza or sandwich into equal parts. Name each part as a fraction.</li>
          <li>Skip-count by 3s, 4s and 5s while walking.</li>
          <li>Use coins and bills for shop games up to 100 dollars.</li>
          <li>Read together and talk about the problem in the story.</li>
          <li>Ask for a quick estimate before an exact answer.</li>
        </ul>
      </Section>

      <Section title="If your child is behind or ahead">
        <p>
          Grade 3 builds on earlier skills, so gaps show up here. Talk to the teacher first. Ask which skill is the gap. Then check place value and addition and subtraction facts to 20, because fractions, multiplication and bigger numbers rely on them.<Cite n={1} /> Practise one skill a few minutes a day.
        </p>
        <p>
          If your child is ahead, try fractions in recipes, bigger numbers and longer books. See our <Link href="/resources/bc-grade-2-math-and-reading">Grade 2 guide</Link> to check the earlier skills, and our <Link href="/resources/bc-proficiency-scale">guide to the BC proficiency scale</Link> to read the report card.
        </p>
        <p>
          Unica Learning mails personalized math and reading workbooks that follow the BC curriculum at your child’s level.
        </p>
        <AssessmentCta slug={meta.slug}>A free placement assessment on paper shows your child’s level in math and reading.</AssessmentCta>
      </Section>
    </>
  );
}
