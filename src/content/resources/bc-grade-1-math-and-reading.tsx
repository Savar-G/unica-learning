// Resource article: /resources/bc-grade-1-math-and-reading
import Link from "next/link";
import type { ResourceMeta } from "@/lib/resources";
import { AssessmentCta, Callout, Cite, DataTable, KeyFacts, Section } from "@/components/article";

export const meta: ResourceMeta = {
  slug: "bc-grade-1-math-and-reading",
  title: "Grade 1 math and reading in BC: what your child learns",
  description: "What Grade 1 math and reading cover in the BC curriculum, in plain words, with practice questions to try at home and tips for when your child needs help.",
  category: "BC curriculum",
  lead: "A plain-language guide to Grade 1 math and reading in the BC curriculum, with practice questions you can try at home.",
  updated: "2026-10-09",
  faqs: [
    {
      q: "What math does my child learn in Grade 1 in BC?",
      a: "Grade 1 math in the BC curriculum covers numbers to 20, adding and subtracting to 20, repeating patterns, measuring with non-standard units, 2D shapes and 3D objects, concrete graphs made with real objects, how likely familiar events are, and Canadian coins.",
    },
    {
      q: "Where can I find Grade 1 math worksheets for the BC curriculum?",
      a: "The BC curriculum lists what children learn, not worksheets. You can make practice at home from the content list: counting to 20, ways to make 10, adding and subtracting small numbers, and patterns. The practice questions on this page are a start.",
    },
    {
      q: "What reading skills should my child have in Grade 1 in BC?",
      a: "The Grade 1 English Language Arts curriculum includes matching letters to sounds, hearing and blending sounds in words, reading familiar sight words, retelling a story in their own words, and writing simple sentences with a capital letter and end punctuation.",
    },
    {
      q: "How can I help my Grade 1 child with reading practice at home?",
      a: "Read together for a few minutes each day. Let your child sound out words, point to words as they read, and retell the story afterward. Keep it short and fun.",
    },
    {
      q: "What if my Grade 1 child is behind in math or reading?",
      a: "Talk to the teacher first and ask what they see in class. Then practise one small skill at a time for a few minutes a day, such as ways to make 10 or one letter sound.",
    },
  ],
  sources: [
    { label: "BC Curriculum: Mathematics, Grade 1 (Big Ideas, Curricular Competencies, Content)", url: "https://curriculum.gov.bc.ca/curriculum/mathematics/1", accessed: "2026-10-09" },
    { label: "BC Curriculum: English Language Arts, Grade 1 (Big Ideas, Curricular Competencies, Content)", url: "https://curriculum.gov.bc.ca/curriculum/english-language-arts/1", accessed: "2026-10-09" },
  ],
  related: ["bc-grade-2-math-and-reading", "bc-proficiency-scale"],
};

export default function Body() {
  return (
    <>
      <p>
        Grade 1 math in the BC curriculum is about getting comfortable with small numbers: counting, making 10, and adding and subtracting up to 20. Grade 1 reading is about learning how letters and sounds make words, and how to tell a story. This guide explains both in plain words, so you know what to expect.
      </p>

      <KeyFacts
        items={[
          <>BC Grade 1 math has five big ideas: number, computational fluency, patterning, geometry and measurement, and data and probability.<Cite n={1} /></>,
          <>Children work with numbers to 20 and with adding and subtracting to 20.<Cite n={1} /></>,
          <>Grade 1 reading covers letters and sounds, sight words, retelling a story, and writing simple sentences.<Cite n={2} /></>,
        ]}
      />

      <Section title="What Grade 1 math covers in BC">
        <p>
          The Grade 1 math content list covers number, patterns, geometry and measurement, data and probability, and financial literacy.<Cite n={1} /> Here is what each part means for your child.
        </p>
        <DataTable
          caption="Grade 1 math content in the BC curriculum"
          columns={["Area", "What your child works on"]}
          rows={[
            ["Number", <>Counting forward and back, skip-counting by 2s and 5s, comparing and ordering numbers to 20, seeing 10 and some more, ways to make 10<Cite n={1} /></>],
            ["Adding and subtracting", <>Addition and subtraction to 20, using strategies like counting on, making 10 and doubles; seeing that adding and subtracting are linked<Cite n={1} /></>],
            ["Equal and not equal", <>Explaining what equal and not equal mean, and writing them with = and ≠<Cite n={1} /></>],
            ["Patterns", <>Repeating patterns: finding the part that repeats, making patterns, predicting what comes next<Cite n={1} /></>],
            ["Measurement", <>Measuring length with non-standard units, such as cubes or paper clips<Cite n={1} /></>],
            ["Shapes", <>Sorting 2D shapes and 3D objects, comparing them, and using position words such as up and down, in and out<Cite n={1} /></>],
            ["Data and chance", <>Making and reading concrete graphs (graphs built from real objects); saying if something is more likely or less likely<Cite n={1} /></>],
            ["Money", <>Naming the value of a nickel, dime, quarter, loonie and toonie, and acting out buying and selling<Cite n={1} /></>],
          ]}
          note="Summarized from the Grade 1 Mathematics content list."
        />
      </Section>

      <Section title="What Grade 1 reading and writing cover">
        <p>
          BC Grade 1 English Language Arts is where children learn to decode words and put ideas on paper.<Cite n={2} /> The content list includes:
        </p>
        <ul>
          <li><strong>Sounds in words.</strong> Hearing rhymes, splitting a word into sounds, and blending sounds back into a word.<Cite n={2} /></li>
          <li><strong>How print works.</strong> Reading left to right, leaving spaces between words, and matching letters to sounds.<Cite n={2} /></li>
          <li><strong>Reading strategies.</strong> Using pictures to predict, sounding out words, knowing common sight words, and fixing mistakes.<Cite n={2} /></li>
          <li><strong>Understanding a story.</strong> Naming the setting, character and events, and retelling in their own words.<Cite n={2} /></li>
          <li><strong>Writing.</strong> Neat printing with spaces, simple sentences, a capital letter to start, and a period, question mark or exclamation mark to end.<Cite n={2} /></li>
          <li><strong>Speaking and listening.</strong> Taking turns, asking questions about a topic, and sharing ideas.<Cite n={2} /></li>
        </ul>
      </Section>

      <Section title="Grade 1 math practice questions">
        <p>
          These are examples written for this guide, not taken from the curriculum. Try one or two at a time and let your child use fingers, blocks or drawings.
        </p>
        <ol>
          <li>What is 7 + 3? <em>Answer: 10.</em></li>
          <li>You have 10 grapes and eat 4. How many are left? <em>Answer: 6.</em></li>
          <li>Which is bigger, 14 or 19? <em>Answer: 19.</em></li>
          <li>Count by 2s: 2, 4, 6, __, 10. What is missing? <em>Answer: 8.</em></li>
          <li>Red, blue, red, blue, red, __. What comes next? <em>Answer: blue.</em></li>
          <li>10 and 6 more is what number? <em>Answer: 16.</em></li>
          <li>Two nickels are worth how many cents? <em>Answer: 10 cents (a nickel is 5 cents).</em></li>
          <li>Is 5 + 4 equal to 9? <em>Answer: Yes. Ask your child to say why.</em></li>
        </ol>
        <h3>Reading practice ideas</h3>
        <ul>
          <li>Say a word slowly, like c-a-t. Ask your child to say the sounds, then blend them into the word.</li>
          <li>After a picture book, ask: who was in it, where did it happen, what happened first?</li>
          <li>Make a rhyme game. How many words rhyme with &quot;hat&quot;?</li>
        </ul>
      </Section>

      <Section title="How to help at home">
        <ul>
          <li>Keep it short, about ten minutes, and stop while it is still fun.</li>
          <li>Count real things: stairs, snacks, toys. Go forward and back.</li>
          <li>Play &quot;make 10&quot; with ten blocks or fingers. Hide some and ask how many are hidden.</li>
          <li>Read a book together every day. Let your child read the words they know.</li>
          <li>Ask your child to explain how they got an answer. The method matters as much as the answer.</li>
          <li>Praise effort, and praise mistakes that they fix.</li>
        </ul>
        <Callout label="Tip">
          <p>The curriculum asks children to use more than one strategy to solve a problem.<Cite n={1} /> If your way looks different from what the teacher shows, ask your child to show you their way first.</p>
        </Callout>
      </Section>

      <Section title="If your child is behind or ahead">
        <p>
          Children learn at different speeds, and Grade 1 is early. Start by talking to the teacher. Ask which skill is hardest, which is easy, and what you can do at home. The teacher sees your child in class and can tell you what is typical.
        </p>
        <p>
          If your child is behind, find the one skill that is stuck, such as ways to make 10 or one letter sound. Practise only that for a few minutes a day. If your child is ahead, stay curious: try bigger numbers, harder books and word problems they make up. To read the report card, see our <Link href="/resources/bc-proficiency-scale">guide to the BC proficiency scale</Link>.
        </p>
        <p>
          Unica Learning mails personalized math workbooks that follow the BC curriculum at your child’s level, not only their grade.
        </p>
        <AssessmentCta slug={meta.slug}>A free placement assessment on paper shows your child’s level in math.</AssessmentCta>
      </Section>
    </>
  );
}
