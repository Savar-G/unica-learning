// The words on /thank-you for each state (#66, #82). Pure, so the states can be checked without a browser.
import { BRAND } from "@/lib/site";
import type { BookingReceipt } from "@/lib/receipt";

export interface ResultState {
  /**
   * "saved" only when Stripe confirmed the setup on the server; "unconfirmed" for any card return it could not check;
   * "cancelled" when an old booking came back from Stripe without a card (the old /?card=cancelled return).
   */
  card: "saved" | "unconfirmed" | "cancelled" | null;
  /** The parent chose a plan on the child's report (#66): the assessment is done and they have an account. */
  fromReport: boolean;
  /** A receipt from the old booking form, at most 5 minutes old (receipt.ts). */
  receipt: BookingReceipt | null;
}

export interface ResultCopy {
  title: string;
  lead: string;
  /** Show the support email. */
  support: boolean;
  /** The one button. */
  next: { href: string; label: string };
}

export function resultCopy({ card, fromReport, receipt }: ResultState): ResultCopy {
  const title = card === "saved" ? "Your card is saved."
    : card === "unconfirmed" ? "We could not check whether your card was added."
    : card === "cancelled" ? "Your card was not added."
    : receipt === "waitlist" ? "You are on the waitlist."
    : receipt === "reserved" ? "We received your request."
    : "Thank you for your interest.";
  const lead = card === "saved" && fromReport ? "You have not been charged. We charge your first month when your first workbook ships. Your child's report stays in your account."
    : card === "saved" ? "You have not been charged. We charge your first month when your first workbook ships. Your child can take the free online math assessment now, on a laptop or tablet."
    : card === "unconfirmed" ? "If you finished adding your card, contact us before you try again. We can check for you."
    : card === "cancelled" ? "Nothing was charged. Your child can take the free online math assessment first, on a laptop or tablet."
    : receipt === "waitlist" ? "We will email you when books for your selected curriculum are ready. You did not add a card and nothing was charged. Your child can take the free online math assessment now."
    : receipt === "reserved" ? "You have not been charged. Your child can take the free online math assessment now, on a laptop or tablet."
    : `Thanks for visiting ${BRAND}. Your child can take the free online math assessment, on a laptop or tablet.`;
  // A card that could not be checked gets no new step: a second attempt could add a second card.
  const next = fromReport ? { href: "/account", label: "Back to your account" }
    : card === "unconfirmed" ? { href: "/", label: "Back to home" }
    : START;
  return { title, lead, support: card === "unconfirmed", next };
}

const START = { href: "/start", label: "Take free math assessment" };
