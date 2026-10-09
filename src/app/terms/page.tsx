import { pageMetadata } from "@/lib/metadata";
import { SupportPage } from "@/components/support-page";
import { PLANS } from "@/lib/site";

export const metadata = pageMetadata({
  path: "/terms",
  title: "Terms",
  description: "Pagewise assessment booking, card setup, pricing, and subscription terms for parent review.",
  index: false,
});

export default function Terms() {
  return <SupportPage label="Terms · 8 October 2026" title="Terms">
    <p className="support-note"><strong>Draft for review.</strong> The business identity, contact details, and procedures for cancellation and refunds need confirmation before these terms are final.</p>
    <p className="lead">These terms describe the offer shown on the Pagewise website. A parent or guardian must make the booking.</p>
    <h2>The offer</h2>
    <p>Pagewise offers personalized paper math and reading workbooks for ages 6-12, grades 1-7. One subject is CAD {PLANS.one.price} per month. Math and reading together are CAD {PLANS.both.price} per month. Delivery is included.</p>
    <h2>Assessment and availability</h2>
    <p>The placement assessment is free. Books for the British Columbia curriculum are available for reservation. Other curricula use the waitlist. A waitlist entry does not require a card and does not create a paid subscription.</p>
    <h2>Card setup and payment</h2>
    <p>For a British Columbia curriculum reservation, you add your card on Stripe&apos;s page. Nothing is charged at signup. If card setup is unavailable, the team will contact you with the next step.</p>
    <p>The first month is charged when the first workbook ships. The plan then renews each month until you cancel. If you cancel before the first workbook ships, you pay nothing.</p>
    <h2>Cancellation, pauses, and refunds</h2>
    <p>The offer includes cancellation at any time, pauses without a penalty, and a 30-day money-back guarantee. The final terms must state how to request a cancellation, pause, or refund and when each request takes effect.</p>
    <h2>Before the final terms are published</h2>
    <p>The final terms must include the business name and contact address, shipping arrangements, any applicable taxes, and the full cancellation and refund process. This draft does not add a delivery date or a learning result guarantee.</p>
  </SupportPage>;
}
