// Resource article: /resources/bc-grade-2-math-and-reading
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-grade-2-math-and-reading",
  title: "Grade 2 math and reading in BC: what your child learns",
  description: "What Grade 2 math and reading cover in the BC curriculum, in plain words, with practice questions to try at home and tips if your child is behind or ahead.",
  category: "BC curriculum",
  lead: "A plain-language guide to Grade 2 math and reading in the BC curriculum, with practice questions you can try at home.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What is in the Grade 2 math curriculum in BC?",
      a: "Grade 2 math covers numbers to 100 and place value, adding and subtracting to 20 and then to 100, repeating and increasing patterns, measuring in centimetres and metres, 2D shapes and 3D objects, graphs, likelihood words, and counting money to 100 cents.",
    },
    {
      q: "Are there Grade 2 math questions I can practise at home?",
      a: "Yes. Good practice follows the curriculum: skip-counting by 2s, 5s and 10s, place value in two-digit numbers, adding and subtracting within 100, and counting coins. This page has eight example questions with answers.",
    },
    {
      q: "What reading should my child be doing in Grade 2 in BC?",
      a: "Grade 2 English Language Arts includes reading fluently at grade level, using phonics and sight words, retelling and finding the main idea, learning book words such as heading and table of contents, and writing sentences with correct punctuation. Many parents also search for reading practice for Grade 2, and daily reading together is the simplest start.",
    },
    {
      q: "Does my Grade 2 child need to know the times tables?",
      a: "Multiplication is not in the Grade 2 math content list. Skip-counting by 2s, 5s and 10s is, and it helps prepare for multiplication in Grade 3.",
    },
    {
      q: "What can I do if my Grade 2 child is behind?",
      a: "Talk to the teacher and ask which skill is the gap. Then practise that one skill for a few minutes a day, using objects, drawings and number lines.",
    },
  ],
  sources: [
    { label: "BC Curriculum: Mathematics, Grade 2 (Big Ideas, Curricular Competencies, Content)", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/2", accessed: "2026-10-09" },
    { label: "BC Curriculum: English Language Arts, Grade 2 (Big Ideas, Curricular Competencies, Content)", url: "https://curriculum.gov.bc.ca/curriculum/english-language-arts/2", accessed: "2026-10-09" },
    { label: "BC Curriculum: Mathematics, Grade 3 (Content)", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/3", accessed: "2026-10-09" },
  ],
  related: ["bc-grade-1-math-and-reading", "bc-grade-3-math-and-reading", "bc-proficiency-scale"],
};

export default function Body() {
  return (
    <>
      <p>
        Grade 2 math in the BC curriculum takes children from small numbers to numbers up to 100. They learn place value, then use it to add and subtract. Grade 2 reading asks for fluent reading, and children learn book words such as heading and table of contents. This guide explains what your child works on, in plain words.
      </p>

      <KeyFacts
        items={[
          <>BC Grade 2 math has five big ideas: numbers, computational fluency, patterning, geometry and measurement, and data and probability.<Cite n={1} /></>,
          <>Children work with numbers to 100 and break them into tens and ones.<Cite n={1} /></>,
          <>They add and subtract facts to 20, then add and subtract numbers to 100.<Cite n={1} /></>,
          <>Grade 2 English Language Arts covers reading fluently, retelling, text features and writing sentences.<Cite n={2} /></>,
        ]}
      />

      <Section title="What Grade 2 math covers in BC">
        <p>
          The Grade 2 content list in the BC curriculum has these main parts.<Cite n={1} />
        </p>
        <DataTable
          caption="Grade 2 math content in the BC curriculum"
          columns={["Area", "What your child works on"]}
          rows={[
            ["Number", <>Skip-counting by 2s, 5s and 10s from different starting points; comparing and ordering numbers to 100; tens and ones; even and odd numbers<Cite n={1} /></>],
            ["Facts to 20", <>Adding and subtracting within 20, using strategies such as making 10, doubles and adding on<Cite n={1} /></>],
            ["Adding and subtracting to 100", <>Breaking numbers apart, estimating, using friendly numbers and multiples of 10, and using number lines and hundred charts<Cite n={1} /></>],
            ["Patterns", <>Repeating patterns (find the core that repeats) and increasing patterns with numbers from 0 to 100<Cite n={1} /></>],
            ["Measurement", <>Measuring length, height and width in centimetres and metres<Cite n={1} /></>],
            ["Shapes", <>Sorting shapes by two attributes; describing triangles, squares, rectangles and circles; finding 2D shapes inside 3D objects<Cite n={1} /></>],
            ["Data and chance", <>Collecting data and making graphs; using words such as certain, more likely, less likely and equally likely<Cite n={1} /></>],
            ["Money", <>Counting mixed coins to 100 cents; wants and needs; spending and saving<Cite n={1} /></>],
          ]}
          note="Summarized from the Grade 2 Mathematics content list."
        />
      </Section>

      <Section title="What Grade 2 reading and writing cover">
        <p>
          The reading strategies in the Grade 2 English Language Arts content list are the same as in Grade 1. Children also learn to read fluently at grade level.<Cite n={2} /> The curriculum includes:
        </p>
        <ul>
          <li><strong>Reading strategies.</strong> Predicting, rereading, retelling, finding the main idea, using phonics, knowing sight words, and fixing mistakes.<Cite n={2} /></li>
          <li><strong>Story parts.</strong> Character, plot, setting and dialogue.<Cite n={2} /></li>
          <li><strong>Text features and book words.</strong> How text and pictures are laid out, such as bold and underlined words, and words such as heading, table of contents and diagram.<Cite n={2} /></li>
          <li><strong>Word patterns.</strong> Word families and patterns in spelling.<Cite n={2} /></li>
          <li><strong>Writing.</strong> Neat printing, compound sentences, punctuation and capital letters, and thinking about who will read it.<Cite n={2} /></li>
          <li><strong>Speaking.</strong> Asking questions, sharing opinions and taking turns.<Cite n={2} /></li>
        </ul>
      </Section>

      <Section title="Grade 2 math practice questions">
        <p>
          These example questions were written for this guide. They are not taken from the curriculum.
        </p>
        <ol>
          <li>What is the value of the 4 in 47? <em>Answer: 40 (4 tens).</em></li>
          <li>What is 38 + 25? <em>Answer: 63.</em></li>
          <li>What is 62 − 27? <em>Answer: 35.</em></li>
          <li>Count by 5s: 35, __, __, 50. <em>Answer: 40 and 45.</em></li>
          <li>Is 36 even or odd? What about 57? <em>Answer: 36 is even, 57 is odd.</em></li>
          <li>You have 3 dimes and 2 nickels. How many cents? <em>Answer: 40 cents.</em></li>
          <li>What number do you add to 25 to make 100? <em>Answer: 75.</em></li>
          <li>3, 6, 9, 12, __. What is the rule and what comes next? <em>Answer: add 3; 15.</em></li>
        </ol>
        <h3>Reading practice ideas</h3>
        <ul>
          <li>Read a short chapter together, taking turns by page. Ask your child to retell it in three sentences.</li>
          <li>Pick a non-fiction book and ask your child to find one fact using the headings.</li>
          <li>Write a short note or list together. Check for a capital letter and an end mark.</li>
        </ul>
      </Section>

      <Section title="How to help at home">
        <ul>
          <li>Use a hundred chart. Ask your child to find numbers and count by 2s, 5s and 10s.</li>
          <li>Use real coins to play shop. Ask for exact change.</li>
          <li>Make addition easier by using 10. For 28 + 6, move 2 to make 30, then add 4.</li>
          <li>Read for 10 to 15 minutes a day, aloud if possible.</li>
          <li>Ask &quot;how do you know?&quot; after answers, right or wrong.</li>
        </ul>
        <Callout label="Good to know">
          <p>Grade 2 children add and subtract with flexible strategies, such as friendly numbers and number lines, not only with the column method.<Cite n={1} /> Ask your child to show you how they think about it.</p>
        </Callout>
      </Section>

      <Section title="If your child is behind or ahead">
        <p>
          Start with the teacher. Ask which skill is hardest and what the class is working on now. Then work on one skill at a time. Place value (tens and ones) is a good one to check, because later adding and subtracting depends on it.<Cite n={1} />
        </p>
        <p>
          If your child finds Grade 2 easy, try numbers past 100, word problems they make up, and chapter books. Multiplication starts in Grade 3 in BC, so you can preview it with skip-counting and equal groups.<Cite n={3} /> You can also read our <Link href="/resources/bc-grade-3-math-and-reading">Grade 3 guide</Link>.
        </p>
        <p>
          Unica Learning mails personalized math workbooks that follow the BC curriculum at your child’s level, for 15 to 30 minutes a day, 5 days a week.
        </p>
        <AssessmentCta slug={meta.slug}>The free online math assessment shows your child’s math level and gaps, on a laptop or tablet.</AssessmentCta>
      </Section>
    </>
  );
}
