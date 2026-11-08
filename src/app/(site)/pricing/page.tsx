import Link from "next/link";
import { DataTable, ResourcesShell, Section } from "@/components/article";
import { StartLink, StartNote } from "@/components/start-link";
import { Eyebrow } from "@/ds";
import { pageMetadata, SITE_URL } from "@/lib/metadata";
import { ADDITIONAL_CHILD_PRICE, BRAND, OFFER_ENDS, PLANS, TRIAL_DAYS, cad } from "@/lib/site";

const title = "Math program pricing and free first month";
export const metadata = pageMetadata({
  path: "/pricing", title,
  description: `Math is CAD ${cad(PLANS.one.price)}/month. Additional children: CAD ${cad(ADDITIONAL_CHILD_PRICE)} each. Delivery included. See the free first month, payment and cancellation terms.`,
});

export default function PricingPage() {
  return (
    <ResourcesShell navSrc="pricing-nav" jsonLd={{ "@context": "https://schema.org", "@type": "WebPage", name: title, url: `${SITE_URL}/pricing` }}>
      <main id="main" className="res res-article">
        <header className="res-head">
          <Eyebrow>Pricing</Eyebrow>
          <h1>A personalized math learning program for CAD {cad(PLANS.one.price)} a month.</h1>
          <p className="res-lead">A personalized math learning program for {PLANS.one.note}. Delivery across Canada is included. Your first month is free. Offer ends {OFFER_ENDS}.</p>
          <p>The free assessment is available across Canada. The paid program is currently open to families on the British Columbia curriculum. Other curricula can join the workbook waitlist after the report.</p>
        </header>
        <div className="res-body">
          <DataTable caption="Monthly family prices in Canadian dollars" columns={["Children", "Monthly price after the free first month"]} rows={[
            ["First child", `CAD ${cad(PLANS.one.price)}`],
            ["Each additional child", `CAD ${cad(ADDITIONAL_CHILD_PRICE)}`],
          ]} />
          <Section title="What is included">
            <ul>
              <li>A free online math assessment and report before you choose a plan.</li>
              <li>A program built from your child&apos;s level and gaps.</li>
              <li>Two paper workbooks a month, mailed home.</li>
              <li>The Teaching Assistant for spoken help when your child is stuck.</li>
              <li>The parent app for page scans, answer checks, solutions and progress reports.</li>
              <li>Rewards for completed practice and delivery across Canada.</li>
            </ul>
            <p>Each child takes their own assessment and gets their own workbooks and progress report. <Link href="/whats-included">See everything included in the program</Link>.</p>
          </Section>
          <Section title="When you pay">
            <ol>
              <li>Take the <Link href="/math-assessment">free online math assessment</Link>. No card is needed.</li>
              <li>Read the report. If your child follows the BC curriculum, choose a plan and add a card only if you want to continue. Other curricula receive a waitlist option with no card required.</li>
              <li>Your free first month starts when the first workbook arrives at your home. Nothing is charged when you add the card.</li>
              <li>On day {TRIAL_DAYS}, we charge the monthly price. Charges then repeat monthly until you cancel.</li>
            </ol>
            <p>We email you seven days before the first charge, with a link to manage or cancel the plan. Cancel before day {TRIAL_DAYS} and you pay nothing.</p>
          </Section>
          <Section title="Pauses, cancellation and program limits">
            <p>Cancel anytime from your account, through the link in your reminder email, or <Link href="/contact">contact us</Link>. Contact us to arrange a pause of up to two months a year.</p>
            <p>The program is for math. Reading is planned for later. Each book follows your child&apos;s level and gaps. Province-specific curriculum alignment is expanding, so the books may not yet cover every topic in your local curriculum.</p>
            <p><Link href="/compare">Compare {BRAND} with tutors and learning centres</Link>, or <Link href="/sample-report">read a sample assessment report</Link>.</p>
          </Section>
          <div className="res-cta">
            <p>Start with the free assessment. No card is needed.</p>
            <div><StartLink src="pricing-page">Take free assessment <span aria-hidden="true">→</span></StartLink><StartNote /></div>
          </div>
        </div>
      </main>
    </ResourcesShell>
  );
}
