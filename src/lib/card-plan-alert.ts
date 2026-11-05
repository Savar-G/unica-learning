import "server-only";
import { ADMIN_PATH } from "@/lib/admin-view";
import type { CardRow, CardRows, PlanStart, SendOutcome } from "@/lib/card-reconcile";
import { sendEmailOnce, type MailTransport, type SendLedger } from "@/lib/email-delivery";

// The team's one alert about a stuck plan start (#554). A plan start's request got no answer, and 24 hours later Stripe lists no plan
// from it. The record stays open, as the request may still land, so a person has to look. The alert goes through the email delivery
// module, with the record as its send ledger: a refused alert releases its claim for the next sweep, and an unknown one keeps it.
// The email holds only what the team needs to act, with no family name: the card setup and the admin link.

interface AlertKey {
  cardId: string;
  generation: number;
}

/** The record as the alert's send ledger. */
function alertLedger(rows: CardRows): SendLedger<AlertKey, AlertKey> {
  const note = async (key: AlertKey, outcome: Parameters<CardRows["notePlanAlert"]>[2]) => {
    try {
      await rows.notePlanAlert(key.cardId, key.generation, outcome);
    } catch (e) {
      console.error("[billing] plan start alert not noted; the claim stays held", e instanceof Error ? e.message : "failed");
    }
  };
  return {
    claim: async (key) => (await rows.claimPlanAlert(key.cardId, key.generation)) ? key : null,
    sent: (key, emailId) => note(key, { state: "sent", emailId }),
    refused: (key, error) => note(key, { state: "released", error }),
    unknown: (key, error) => note(key, { state: "unknown", error }),
  };
}

export function planStartAlertEmail(cardId: string, origin: string): { subject: string; text: string } {
  return {
    subject: "A plan start needs the team",
    text: [
      "A plan start got no answer from Stripe, and 24 hours later we still find no plan from it. The request may still land, so nobody can safely press start again.",
      "",
      `Card setup: ${cardId}`,
      `Open the card: ${origin}${ADMIN_PATH}/next-steps`,
      "",
      "Open the family in Stripe. If you find no plan from this start, press \"I checked Stripe: close this start\" on the card. The next press then starts a new plan.",
      "If the plan shows up first, nothing more is needed: the record closes by itself, and the parent gets the confirmation email.",
    ].join("\n"),
  };
}

const noAddress: MailTransport = { send: async () => ({ status: "refused", error: "SIGNUP_NOTIFY_EMAIL is not set" }) };

/** Sends the alert once. `to`: SIGNUP_NOTIFY_EMAIL, the address of the other internal alerts; with none, it is refused and tried again. */
export function sendPlanStartAlert(rows: CardRows, row: CardRow, start: PlanStart, { to, origin, transport }: { to: string | null; origin: string; transport?: MailTransport }): Promise<SendOutcome> {
  return sendEmailOnce(alertLedger(rows), { cardId: row.cardId, generation: start.generation }, { sender: { to: "savar" }, to: to ?? "", ...planStartAlertEmail(row.cardId, origin) }, { transport: to ? transport : noAddress });
}
