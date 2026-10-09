import { pageMetadata } from "@/lib/metadata";
import { BookingResult } from "@/components/booking-result";
import { SupportPage } from "@/components/support-page";
import { stripe } from "@/lib/stripe";

export const metadata = pageMetadata({
  path: "/thank-you",
  title: "Your next step",
  description: "Next steps after a Pagewise assessment request, waitlist entry, or card setup.",
  index: false,
});

export default async function ThankYou({ searchParams }: PageProps<"/thank-you">) {
  const { session_id, card: legacyCard } = await searchParams;
  let card: "saved" | "unconfirmed" | null = session_id || legacyCard ? "unconfirmed" : null;
  let confirmationRef: string | null = null;
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
      }
    } catch {
      // A failed lookup must not claim that Stripe saved a card.
    }
  }
  return <SupportPage label="Your next step" title="">
    <BookingResult card={card} confirmationRef={confirmationRef} />
  </SupportPage>;
}
