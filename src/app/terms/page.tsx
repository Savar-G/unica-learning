import { pageMetadata } from "@/lib/metadata";
import { SupportPage } from "@/components/support-page";
import { PLANS } from "@/lib/site";
import { BUSINESS_NAME, SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

export const metadata = pageMetadata({
  path: "/terms",
  title: "Terms",
  description: `${BUSINESS_NAME} prices, free assessments, payments, cancellations, and refunds.`,
  index: false,
});

export default function Terms() {
  return <SupportPage label="Updated 8 October 2026" title="Terms">
    <p className="lead">These terms apply to the assessments and workbooks offered by {BUSINESS_NAME}. A parent or guardian must make the booking.</p>
    <h2>The offer</h2>
    <p>{BUSINESS_NAME} offers personalized paper math and reading workbooks for ages 6-12, grades 1-7. One subject is CAD {PLANS.one.price} per month. Math and reading together are CAD {PLANS.both.price} per month. Prices are in Canadian dollars. Delivery across Canada is included.</p>
    <h2>Assessment and availability</h2>
    <p>The placement assessment is free. You can book an assessment for books that follow the British Columbia school curriculum. For other curricula, you can join the waitlist. We will email you when those books are ready. Joining the waitlist does not require a card, and you will not be charged.</p>
    <h2>Adding your card and payments</h2>
    <p>When you book for the British Columbia curriculum, you add your card on a secure payment page. We charge nothing when you sign up. If you cannot add your card, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> for help.</p>
    <p>The first month is charged when the first workbook ships. The plan then renews each month until you cancel. If you cancel before the first workbook ships, you pay nothing.</p>
    <h2>Cancellation, pauses, and refunds</h2>
    <p>You can cancel at any time or pause without a penalty. To cancel or pause, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> using the email address you used to book. We will confirm the change and when it takes effect.</p>
    <p>Every plan has a 30-day money-back guarantee, starting on the day of your first payment. If the plan is not right for your child within those 30 days, email us to request a full refund of your payment.</p>
    <h2>Questions or help</h2>
    <p>Contact {BUSINESS_NAME} at <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a> for help with an assessment, delivery, payment, cancellation, or refund.</p>
  </SupportPage>;
}
