import Link from "next/link";
import { AssessmentCta, KeyFacts, ResourcesShell, Section } from "@/components/article";
import { Eyebrow } from "@/ds";
import { pageMetadata } from "@/lib/metadata";
import { pageJsonLd } from "@/lib/structured-data";

const title = "Free online math assessment for K to Grade 9";
const PAGE = { path: "/math-assessment", title, description: "Find your child's math level and gaps with a free online assessment for Kindergarten to Grade 9 in Canada. Get a parent report. No card needed." };
export const metadata = pageMetadata(PAGE);

export default function MathAssessmentPage() {
  return (
    <ResourcesShell navSrc="assessment-guide-nav" jsonLd={pageJsonLd(PAGE)}>
      <main id="main" className="res res-article">
        <header className="res-head">
          <Eyebrow>Free math assessment</Eyebrow>
          <h1>Find your child&apos;s math level and gaps.</h1>
          <p className="res-lead">A free online math assessment for children from Kindergarten to Grade 9 in Canada. Your child answers the questions. You get a report with their math level and gaps.</p>
        </header>
        <div className="res-body">
          <KeyFacts items={["No card is needed for the assessment or report.", "Use a laptop or tablet. Your child takes the test alone. They can pause and return to their saved answers.", "The questions adapt to how your child does.", "The report arrives by email and stays in your parent account."]} />
          <AssessmentCta slug="assessment-guide">See which math skills need practice. No paid plan is required.</AssessmentCta>
          <Section title="What the assessment checks">
            <p>The assessment checks math skills such as numbers and operations, fractions, patterns, and shapes and measurement. The questions start at your child&apos;s school grade and adjust to their answers. It also checks number facts.</p>
            <p>The result is an estimate of your child&apos;s working math level and the areas that need practice. It does not measure reading, diagnose a learning condition, or replace your child&apos;s teacher&apos;s assessment. It does not predict FSA results.</p>
          </Section>
          <Section title="What you see in the report">
            <ul>
              <li>Your child&apos;s working math level compared with their school grade.</li>
              <li>The math areas that look secure and the areas that need more practice.</li>
              <li>Number-fact accuracy, plus speed from Grade 5.</li>
              <li>Examples of your child&apos;s written work, when they show it during the test.</li>
            </ul>
            <p><Link href="/sample-report">Read the full sample math report</Link>. The sample uses a fictional child. Your report uses your own child&apos;s answers.</p>
          </Section>
          <Section title="How to start">
            <ol>
              <li>Create a parent account and confirm your email with a code.</li>
              <li>Add your child and their school grade.</li>
              <li>Open the test on a laptop or tablet. Let your child answer without help so the report reflects their own work.</li>
              <li>Read the report. BC-curriculum families can choose a plan. Other curricula can join the workbook waitlist.</li>
            </ol>
            <p>If you sign up on a phone, you can open the test later on a laptop or tablet.</p>
          </Section>
          <Section title="What happens after the report?">
            <p>You can use the report to discuss practice with your child&apos;s teacher or tutor. The paid program is currently open to families on the British Columbia curriculum. Other curricula can join the workbook waitlist, with no card required. If you choose the program, it starts from your child&apos;s level and gaps, with paper workbooks mailed home. <Link href="/pricing">Read the program prices and free first-month terms</Link>.</p>
            <p><Link href="/curriculum">See the math curriculum</Link>, or <Link href="/compare">compare the program with other types of math support</Link>.</p>
          </Section>
        </div>
      </main>
    </ResourcesShell>
  );
}
