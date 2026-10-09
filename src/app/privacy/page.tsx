import { pageMetadata } from "@/lib/metadata";
import { SupportPage } from "@/components/support-page";
import { BUSINESS_NAME, SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

export const metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy policy",
  description: "How Pagewise Learning uses your information and cookies, and how to contact us about your privacy.",
  index: false,
});

export default function Privacy() {
  return <SupportPage label="Updated 8 October 2026" title="Privacy policy">
    <p className="lead">{BUSINESS_NAME} is responsible for the information you share through this website. This policy explains what we collect, why we use it, and the choices you have.</p>
    <h2>What you share with us</h2>
    <p>When you request an assessment or join the waitlist, we ask for your name, email address, Canadian postal code, chosen plan and subject, your child&apos;s grade, and their school curriculum. The form does not ask for your child&apos;s name, date of birth, or photos of their work.</p>
    <p>We also keep information about how you found us, such as a link or advertisement, and which button you used to open the form.</p>
    <h2>How we use your information</h2>
    <p>We use your details to manage your assessment request or waitlist entry and email you about the next step. We share the details needed by the companies that help us run the website, send emails, and handle payments.</p>
    <p>If you send us photos of completed pages, we use them to plan your child&apos;s next book and show their progress. You can ask us to delete them.</p>
    <p>When you add your card, we send your name, email address, and postal code to our payment provider. We also send your plan, subject, price, your child&apos;s grade and school curriculum, and a reference for your booking. You enter your card details on its secure page. Our booking form does not collect your card number.</p>
    <h2>Cookies and your choice</h2>
    <p>Cookies are small pieces of information saved on your device. If you accept optional cookies, we count page visits and steps in the booking form to understand how people use our website. These counts can include your chosen plan, subject and school curriculum. They do not include your name, email address, postal code, or your child&apos;s grade. We do not record your screen or the text you enter.</p>
    <p>You can reject optional cookies and still book an assessment or join the waitlist. Use Cookie settings at the bottom of any page to change your choice.</p>
    <p>Your device also saves your cookie choice and briefly keeps details needed when you return from adding your card. These help the website work and are separate from the optional cookies.</p>
    <h2>Companies that help us</h2>
    <p>Other companies help us keep form details, send emails, take payments, make the website available, and count visits. The company that makes the website available may use information about your device and connection to keep it working and protect it from misuse.</p>
    <details>
      <summary>See the companies we use</summary>
      <ul>
        <li>Supabase keeps the details you send through the booking form.</li>
        <li>Resend sends email notices to our team about new requests.</li>
        <li>Stripe handles adding your card and payments.</li>
        <li>Vercel makes the website available to you.</li>
        <li>PostHog counts visits and booking steps only if you accept optional cookies.</li>
      </ul>
    </details>
    <p>Some of these companies may handle information outside Canada. Information handled there may be subject to the laws of those countries.</p>
    <h2>How long we keep information</h2>
    <p>We keep information for as long as we need it to manage your request or provide your service, and to meet any legal recordkeeping requirements. You can ask us to delete information we no longer need. Some records may need to be kept to meet legal requirements.</p>
    <h2>Your questions and choices</h2>
    <p>To ask about your information, request a copy, correct it, ask for deletion, or ask us to stop using it, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>. We may need to confirm that the request is yours before we act on it. If stopping the use of your information affects a service you requested, we will explain this to you.</p>
  </SupportPage>;
}
