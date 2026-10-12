// The report's next step (#66): what the browser sends to the card and waitlist routes, and what they answer.
// Shared by the report page (client) and the routes (server).
import type { PlanId } from "@/lib/site";

export const CARD_ROUTE = "/api/account/card";
export const WAITLIST_ROUTE = "/api/account/waitlist";

/** Where the parent opened the report: from the report email, or in the account. */
export type ReportSrc = "email" | "account";

export interface CardRequest {
  report: string;
  plan: PlanId;
  src: ReportSrc;
}

export interface WaitlistRequest {
  report: string;
}

export type NextStepError = "bad_json" | "signed_out" | "invalid" | "not_found" | "store_failed";

/**
 * stripe: go to cardUrl, Stripe's page to save the card. later: no Stripe key, or Stripe failed, so Savar emails a
 * link (the alert tells him). saved: a card is saved for this child already (with its plan), so no second one is.
 */
export type CardResult =
  | { ok: true; state: "stripe"; cardUrl: string }
  | { ok: true; state: "later" }
  | { ok: true; state: "saved"; plan: PlanId }
  | { ok: false; error: NextStepError };

/** joined: this click added the child. already: the child was on the waitlist before, so nothing new was stored. */
export type WaitlistResult = { ok: true; state: "joined" | "already" } | { ok: false; error: NextStepError };
