import { pageMetadata } from "@/lib/metadata";
import { SupportPage } from "@/components/support-page";
import { PLANS, cad } from "@/lib/site";
import { BUSINESS_NAME, SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

export const metadata = pageMetadata({
  path: "/terms",
  title: "Terms",
  description: `${BUSINESS_NAME} prices, free assessments, payments, cancellations, and refunds.`,
  index: false,
});

export default function Terms() {
  return <SupportPage label="Updated 17 October 2026" title="Terms">
    <p className="lead">These terms apply to the free math assessment and the learning program offered by {BUSINESS_NAME}. A parent or guardian must create the account and choose the plan.</p>
    <h2>The offer</h2>
    <p>{BUSINESS_NAME} offers a personalized math learning program for ages 6-12, grades 1-7. The program includes paper workbooks made for your child. Math is CAD {cad(PLANS.one.price)} per month. Your first month is free. Prices are in Canadian dollars. Delivery across Canada is included.</p>
    <h2>Assessment and availability</h2>
    <p>The online math assessment is free, and every family in Canada can take it. You do not need a card for the assessment. Workbooks follow the British Columbia school curriculum today. After the report, families on that curriculum can choose a plan. For other curricula, you can join the workbook waitlist after the report. We will email you when those books are ready. Joining the waitlist does not require a card, and you will not be charged.</p>
    <h2>Online assessment accounts</h2>
    <p>A parent or guardian must create and manage the account. To create an account with a password, you confirm your email address with a one-time code that we email to you. Online math assessments are open to families in Canada. The child should complete the test on a laptop or tablet, without a calculator or help with the answers. The report stays in the parent account and is sent by email. We may send assessment reminders, with no more than two per test and an unsubscribe link.</p>
    <p>When enabled, an artificial intelligence (AI) model reviews the child&apos;s typed working and drawings and writes report text from measured result facts. We send this work to the model through OpenRouter, an AI service. We mark answers with assessment rules. The <a href="/privacy">privacy policy</a> lists the data sent for AI processing. Do not put names or contact details in typed working or drawings. AI comments can be wrong; uncertain work comments are left out. Contact us to ask about a result.</p>
    <h2>Assessment data and deletion</h2>
    <p>We keep account and child data while you are a customer: while you have an active workbook subscription, or a saved card for a first workbook that has not shipped yet. When your subscription ends, we delete the family&apos;s account and assessment data 6 calendar months after the end date. A later test does not change this deadline. If no card has been saved, we delete them 12 calendar months after the latest test activity across all the family&apos;s children. For these free-test families, starting, answering, or finishing a later test starts a new period. An account with no test has no test-based deadline. A daily job checks the deadlines. If it cannot confirm your payment status, it keeps the data and checks again later.</p>
    <p>To request deletion at any time, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> from the account email address. We confirm that the request is yours. We then remove the parent account, children, tests, answers, typed working, drawings, reviews, reports, account links, card setup and waitlist records, and assessment email records. If deletion is interrupted, we keep the request and retry. Account deletion does not cancel a workbook subscription or remove historical reservation and payment records. Ask us about those separately. The <a href="/privacy">privacy policy</a> explains retention and copies outside account storage.</p>
    <h2>Adding your card and payments</h2>
    <p>After the report, a family on the British Columbia curriculum can choose the plan and add a card on a secure payment page. We charge nothing when you add it. If you cannot add your card, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> for help.</p>
    <p>Your first month is free. It starts when your first workbook ships. On day 30 we charge CAD {cad(PLANS.one.price)}, then CAD {cad(PLANS.one.price)} each month until you cancel. We email you a reminder 7 days before the first charge, with a link to manage or cancel your plan. If you cancel before day 30, you pay nothing.</p>
    <h2>Cancellation, pauses, and refunds</h2>
    <p>You can cancel at any time or pause without a penalty. To cancel, use the link in your reminder email, or email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>. A cancellation takes effect at the end of the month you are in, so if you cancel during your free first month, you pay nothing. To pause, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> using the email address of your account or booking. We will confirm the change and when it takes effect.</p>
    <h2>Questions or help</h2>
    <p>Contact {BUSINESS_NAME} at <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> for help with an assessment, delivery, payment, cancellation, or refund.</p>
  </SupportPage>;
}
