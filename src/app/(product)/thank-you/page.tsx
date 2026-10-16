import { pageMetadata } from "@/lib/metadata";
import { BookingResult } from "@/components/booking-result";
import { SupportPage } from "@/components/support-page";
import { recordCardSaved } from "@/lib/next-step-server";
import { checkoutEvidence } from "@/lib/saved-card-server";
import { BRAND } from "@/lib/site";
import { REPORT_SOURCE, stripe } from "@/lib/stripe";

export const metadata = pageMetadata({
  path: "/thank-you",
  title: "Your next step",
  description: `What happens next after you add your card or join the waitlist with ${BRAND}.`,
  index: false,
});

export default async function ThankYou({ searchParams }: PageProps<"/thank-you">) {
  const { session_id, card: legacyCard, from } = await searchParams;
  // Only Stripe's own record below can confirm a card. "cancelled" (an old booking back from Stripe without a card,
  // #82) claims nothing, so the address may set it. Every other card return starts as "could not check".
  let card: "saved" | "unconfirmed" | "cancelled" | null = !session_id && legacyCard === "cancelled" ? "cancelled"
    : session_id || legacyCard ? "unconfirmed" : null;
  let confirmationRef: string | null = null;
  // The report's plan choice (#66) returns here with from=report; the reserve form does not.
  let path: "report" | "signup" = from === REPORT_SOURCE ? "report" : "signup";
  const client = stripe();
  if (client && typeof session_id === "string" && /^cs_(test_|live_)?[A-Za-z0-9]{10,200}$/.test(session_id)) {
    try {
      const session = await client.checkout.sessions.retrieve(session_id, { expand: ["setup_intent"] });
      // The parent is back from Stripe now, so now is when the site learned of the card.
      const evidence = checkoutEvidence(session, new Date());
      if (evidence) {
        card = "saved";
        confirmationRef = evidence.ref;
        // Stripe's metadata, not the address, decides the path of a confirmed card.
        path = evidence.metadata.source === REPORT_SOURCE ? "report" : "signup";
        if (path === "report") await recordCardSaved(evidence);
      }
    } catch {
      // A failed lookup must not claim that Stripe saved a card.
    }
  }
  return <SupportPage label="Your next step" title="">
    <BookingResult card={card} confirmationRef={confirmationRef} path={path} />
  </SupportPage>;
}
