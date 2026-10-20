import { pageMetadata } from "@/lib/metadata";
import { SupportPage } from "@/components/support-page";
import { BUSINESS_NAME, SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";

export const metadata = pageMetadata({
  path: "/privacy",
  title: "Privacy policy",
  description: `How ${BUSINESS_NAME} uses your information and cookies, and how to contact us about your privacy.`,
  index: false,
});

export default function Privacy() {
  return <SupportPage label="Updated 18 October 2026" title="Privacy policy">
    <p className="lead">{BUSINESS_NAME} is responsible for the information you share through this website. This policy explains what we collect, why we use it, and the choices you have.</p>
    <h2>What you share with us</h2>
    <p>Before the online assessment, families booked through a reservation form. For those bookings, we keep the name, email address, Canadian postal code, chosen plan and subject, the child&apos;s grade, and their school curriculum.</p>
    <p>For an online assessment account, we ask for your name, email address, postal code (not when you sign up with your email on a phone), and each child&apos;s first name, grade, and school curriculum. To confirm your email address, we email you a one-time code. We keep the child&apos;s test answers, answer times, typed working, drawings and the pen strokes that made them, results, work reviews, and reports. We also keep account sign-in records, card setup or waitlist records, and records of assessment emails and unsubscribe requests. We do not ask for a child&apos;s date of birth.</p>
    <p>When you send us a message through our contact form, we get your name, email address and message by email. We use them only to reply to you, and we do not add them to your account or to any list.</p>
    <p>After the assessment, you can tell us how your child likes to learn, what they are interested in, and anything else about how they learn. These answers are optional. We keep them with the child&apos;s account and use them only to plan your child&apos;s books. You can change or clear them from your account.</p>
    <p>We also keep information about how you found us, such as a link or advertisement, and the page you came from. After a booking through the old reservation form, we asked how you heard about us. That answer was optional and is kept with the booking.</p>
    <p>Some links to our website, such as the links in our ads, have tags that tell us where the link was. A link from a Meta or Google ad can also hold a click reference from that company. When you arrive from an ad or from a link with tags, we count the visit. For this count, we keep the tags and the time. We keep only whether a click reference was there, not the reference itself. We do not keep your IP address, and we do not use a cookie for this count. Your browser keeps the tags and a random visit number until you close the tab. If you then create an account, we keep the tags, the click reference and the visit number with your account, so we know which ad or link brought you.</p>
    <h2>How we use your information</h2>
    <p>We use your details to run your child&apos;s assessment, manage your plan or waitlist entry, and email you about the next step. We share the details needed by the companies that help us run the website, send emails, and handle payments.</p>
    <p>If you send us photos of completed pages, we use them to plan your child&apos;s next book and show their progress. You can ask us to delete them.</p>
    <p>For online assessments, we mark the answers and use the results to show your child&apos;s working level and areas for practice. Drawings are stored privately. The parent and our authorized team can view them after sign-in. The pen strokes show the order and timing of each line in a drawing. Only our authorized team can view them. The emailed report links to the account; it does not include the drawings.</p>
    <p>We send the report by email and keep it in your account. We may send assessment reminders when a test has not started or has stopped, with no more than two reminders per test. These emails include an unsubscribe link. You can stop reminders and emails about our plans without deleting your account.</p>
    <h2>AI processing of your child&apos;s work</h2>
    <p>When enabled, we use OpenRouter to review your child&apos;s typed working and drawings with an artificial intelligence (AI) model, to write report text from the measured results, and to suggest what your child&apos;s first workbook should focus on. OpenRouter is a service that sends each request to the company that runs the AI model we choose. Answer marking still uses our assessment rules.</p>
    <p>An AI review request can include the question, its level, the expected answer, your child&apos;s answer, whether it was correct, possible error labels, typed working, and the drawing as an image. Report requests include the result facts needed for the report. Workbook planning requests include the measured results, your child&apos;s answers to the test questions, and what you tell us about how your child learns: learning style, interests, feelings about math, your main goal and the time each week. We do not send account names, email addresses, postal codes, or account identifiers in these requests. Typed working, a drawing or a typed answer can still contain personal information if your child puts it there. Please keep names and contact details out of the work and the answers.</p>
    <p>AI comments can be wrong. We leave a work comment out when the review is not sufficiently certain. Our team can review the work and its confidence result. Contact us if you want us to check a result.</p>
    <p>When you add your card, we send your name, email address, and postal code to our payment provider. We also send your plan, subject, price, your child&apos;s grade and school curriculum, and a reference for your booking. You enter your card details on its secure page. Our booking form does not collect your card number.</p>
    <h2>Cookies and your choice</h2>
    <p>Cookies are small pieces of information saved on your device. If you accept optional cookies, we count page visits and steps in the signup, the assessment, and the plan choice to understand how people use our website. These counts can include your chosen plan, subject and school curriculum. They do not include your name, email address, postal code, or your child&apos;s grade. We do not record your screen or the text you enter.</p>
    <p>If you accept optional cookies, we also use tools from Meta (Facebook and Instagram) and Google Ads to measure whether our ads lead to signups. Meta learns which of our main pages you open and when you create an account. It does not run on pages whose web address holds a reference to your account, report or payment. Google Ads learns when you create an account, open a report, or add a card. We do not send them your name, email address, postal code, or anything about your child. Meta and Google can connect this to an account you have with them, to tell us how many people our ads brought. These tools never send anything from the pages your child uses for the assessment.</p>
    <p>You can reject optional cookies and still take the free math assessment, choose a plan, or join the waitlist. Use Cookie settings at the bottom of any page to change your choice.</p>
    <p>Your device also saves your cookie choice, keeps the link tags of your visit until you close the tab, and briefly keeps details needed when you return from adding your card. These help the website work and are separate from the optional cookies.</p>
    <h2>Companies that help us</h2>
    <p>Other companies help us keep form details, send emails, take payments, make the website available, count visits, and measure our ads. The company that makes the website available may use information about your device and connection to keep it working and protect it from misuse.</p>
    <details>
      <summary>See the companies we use</summary>
      <ul>
        <li>Supabase manages account sign-in and stores form details, assessment records, and private drawings.</li>
        <li>Resend sends sign-in codes, account links, reports, reminders, and notices to our team.</li>
        <li>OpenRouter processes the assessment work and report facts described above when AI processing is enabled. It sends each request to the company that runs the AI model we choose.</li>
        <li>Stripe handles adding your card and payments.</li>
        <li>Vercel makes the website available to you.</li>
        <li>PostHog counts visits and signup steps only if you accept optional cookies.</li>
        <li>Meta (Facebook and Instagram) and Google Ads measure whether our ads lead to signups. They run only if you accept optional cookies, and they never send anything from the pages your child uses.</li>
      </ul>
    </details>
    <p>Some of these companies may handle information outside Canada. Information handled there may be subject to the laws of those countries.</p>
    <h2>How long we keep information</h2>
    <p>While you are a customer, we keep your family account and your children&apos;s data so we can provide your service. You are a customer while you have an active workbook subscription, or a saved card for a first workbook that has not shipped yet.</p>
    <p>When your subscription ends, we delete the family account and its assessment data 6 calendar months after the end date that our payment provider records. A later test does not change this deadline.</p>
    <p>If you never saved a card, we delete the family account and its assessment data 12 calendar months after the latest test activity across all children in the family. Test activity includes starting, answering, or finishing a test. A new test or later test activity starts a new 12-month period. An account with no test has no test-based deletion deadline; contact us to delete it.</p>
    <p>A daily deletion job checks these deadlines. If it cannot confirm your payment status with our payment provider, it keeps your data and checks again later. You can request deletion at any time.</p>
    <p>On a verified deletion request, we remove the parent account, all children, tests, answers, typed working, stored drawings and pen strokes, work reviews, reports, account links, card setup and waitlist records, and assessment email records. If a service failure interrupts deletion, we keep the request and retry the remaining steps.</p>
    <p>Before we delete a family account, we keep a copy of each test without names. It holds the grade, province and month of the test, the questions, the answers and their times, the results, the learning choices you picked, and the type of device, screen size and kind of browser used. It has no names, email, postal code, drawings, typed working or anything written in your own words, and it is not linked to your family. We use it to improve our tests and workbooks.</p>
    <p>The family account deletion does not cancel a workbook subscription or remove historical reservation and payment records. Contact us about cancellation and those records. We keep other service and payment records for as long as needed to provide the service and meet legal recordkeeping requirements. Copies already received in an email or saved on your device are outside our account storage.</p>
    <h2>Your questions and choices</h2>
    <p>To ask about your information, request a copy, correct it, ask for deletion, or ask us to stop using it, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>. We may need to confirm that the request is yours before we act on it. If stopping the use of your information affects a service you requested, we will explain this to you.</p>
  </SupportPage>;
}
