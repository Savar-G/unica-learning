import { pageMetadata } from "@/lib/metadata";
import { SupportPage } from "@/components/support-page";

export const metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy policy",
  description: "How Pagewise uses parent signup details, payment services, and optional website analytics.",
  index: false,
});

export default function Privacy() {
  return <SupportPage label="Privacy · 8 October 2026" title="Privacy policy">
    <p className="support-note"><strong>Draft for review.</strong> Business contact details, data retention periods, and the process for privacy requests need confirmation before this policy is final.</p>
    <p className="lead">This notice describes the information used by the Pagewise website and its assessment booking form.</p>
    <h2>Information in the booking form</h2>
    <p>The form asks for the parent&apos;s name, email address, Canadian postal code, plan, subject, child&apos;s grade, and school curriculum. It also records the button used to open the form, referral information, and campaign tags.</p>
    <p>We use these details to record an assessment request or waitlist entry and to contact the parent about the next step. The form does not ask for a child&apos;s name, date of birth, or completed workbook photos.</p>
    <h2>Services that receive information</h2>
    <ul>
      <li>Supabase stores the booking and waitlist information.</li>
      <li>Resend sends a signup notification to the Pagewise team when email notifications are configured.</li>
      <li>Stripe receives the parent&apos;s contact and plan details when card setup is available. Parents enter their card details on Stripe&apos;s page. The Pagewise form does not collect the card number.</li>
      <li>Vercel hosts the website. Hosting services can process technical information, such as the IP address and browser information, to serve and protect the site.</li>
    </ul>
    <h2>Optional analytics and cookies</h2>
    <p>If you accept analytics cookies, PostHog records page visits and booking steps to help us understand how people use the website. Analytics does not receive the parent&apos;s name, email address, postal code, or child&apos;s grade from the booking form. Session recordings and automatic form capture are disabled.</p>
    <p>You can reject analytics and still use the form. You can change your choice at any time with the Cookie settings button. The browser stores this choice. It also temporarily stores information needed to return from the card setup page.</p>
    <h2>Information we still need to confirm</h2>
    <p>The final policy must identify the business responsible for the information and its privacy contact. It must also state the retention periods, the process for access or deletion requests, and the locations where service providers process information.</p>
    <p>This draft covers the website. A separate notice is needed before Pagewise collects completed assessment or workbook photos.</p>
  </SupportPage>;
}
