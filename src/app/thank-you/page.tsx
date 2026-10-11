import { pageMetadata } from "@/lib/metadata";
import { BookingResult } from "@/components/booking-result";
import { SupportPage } from "@/components/support-page";
import { recordCardSaved } from "@/lib/next-step-server";
import { BRAND } from "@/lib/site";
import { REPORT_SOURCE, stripe } from "@/lib/stripe";

export const metadata = pageMetadata({
  path: "/thank-you",
  title: "Your next step",
  description: `What happens next after you request an assessment, join the waitlist, or add your card with ${BRAND}.`,
  index: false,
});

export default async function ThankYou({ searchParams }: PageProps<"/thank-you">) {
  const { session_id, card: legacyCard, from } = await searchParams;
  let card: "saved" | "unconfirmed" | null = session_id || legacyCard ? "unconfirmed" : null;
  let confirmationRef: string | null = null;
  // The report's plan choice (#66) returns here with from=report; the reserve form does not.
  let path: "report" | "signup" = from === REPORT_SOURCE ? "report" : "signup";
  const client = stripe();
  if (client && typeof session_id === "string" && /^cs_(test_|live_)?[A-Za-z0-9]{10,200}$/.test(session_id)) {
    try {
      const session = await client.checkout.sessions.retrieve(session_id, { expand: ["setup_intent"] });
      const setup = session.setup_intent;
      if (session.mode === "setup" && session.status === "complete" && session.metadata?.ref
        && session.client_reference_id === session.metadata.ref
        && setup && typeof setup !== "string" && setup.status === "succeeded") {
        card = "saved";
        confirmationRef = session.metadata.ref;
        // Stripe's metadata, not the address, decides the path of a confirmed card.
        path = session.metadata.source === REPORT_SOURCE ? "report" : "signup";
        if (path === "report") await recordCardSaved(session.metadata.ref, typeof session.customer === "string" ? session.customer : null);
      }
    } catch {
      // A failed lookup must not claim that Stripe saved a card.
    }
  }
  return <SupportPage label="Your next step" title="">
    <BookingResult card={card} confirmationRef={confirmationRef} path={path} />
  </SupportPage>;
}
