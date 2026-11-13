import "server-only";
import { ADMIN_PATH } from "@/lib/admin-view";
import { sendEmailOnce, type MailTransport, type SendLedger } from "@/lib/email-delivery";
import { PACIFIC_ZONE, localDateTime, localDay } from "@/lib/family-time";

// The team's daily email when answers wait for a team mark (#718, D-303). The reminders run calls `runScanTeamEmail` on every
// pass. From 8 a.m. Pacific, once per team day (a Pacific calendar day), when the waiting count is above 0, one email goes to
// SIGNUP_NOTIFY_EMAIL: the count and the /admin/scans link. It never holds a family, a child, an answer or a photo.
// The count is the real families' waiting answers (the database function scan_team_waiting_count, the same rule as the admin
// list). The day is claimed in public.scan_team_email_days through the delivery module (send key: the day): a refused send gives
// the claim back, so the next run tries again; an unknown outcome keeps it, and nothing sends the day's email again.

/** The store seam: the database in production (src/lib/scan-team-email-store.ts), memory in tests. */
export interface ScanTeamEmailStore {
  /** How many real families' answers wait for our team now. */
  waitingCount(): Promise<number>;
  /** Claims the team day. False: another run holds it, or its email went or may have gone. */
  claimDay(day: string, waiting: number): Promise<boolean>;
  /** The email went. Never throws. */
  sent(day: string, emailId: string): Promise<void>;
  /** The email did not go: gives the day back. Never throws. */
  released(day: string, error: string): Promise<void>;
  /** The email may have gone: the day stays claimed. Never throws. */
  unknown(day: string, error: string): Promise<void>;
}

export type ScanTeamEmailResult =
  | { status: "no_address" | "too_early" | "none_waiting" | "already_sent" | "refused" | "unknown" | "sent"; waiting?: number }
  | { status: "failed" };

export const SCAN_TEAM_EMAIL_HOUR = 8;

export const scanTeamEmailDay = (now: number): string => localDay(now, PACIFIC_ZONE);

/** The email: a count and the admin link, in plain words. No family, child or answer details. */
export function scanTeamEmail(waiting: number, origin: string): { subject: string; text: string } {
  const answers = waiting === 1 ? "1 answer is" : `${waiting} answers are`;
  return {
    subject: `${answers} waiting for our team to mark`,
    text: [`${answers} waiting for our team to mark.`, "", `Open the list: ${origin}${ADMIN_PATH}/scans`].join("\n"),
  };
}

function dayLedger(store: ScanTeamEmailStore, waiting: number): SendLedger<string, string> {
  return {
    claim: async (day) => (await store.claimDay(day, waiting)) ? day : null,
    sent: (day, emailId) => store.sent(day, emailId),
    refused: (day, error) => store.released(day, error),
    unknown: (day, error) => store.unknown(day, error),
  };
}

export async function runScanTeamEmail(
  store: ScanTeamEmailStore,
  now: number,
  { to, origin, transport }: { to: string | null | undefined; origin: string; transport?: MailTransport },
): Promise<ScanTeamEmailResult> {
  const address = to?.trim();
  if (!address) {
    console.error("[scan team email] SIGNUP_NOTIFY_EMAIL is not set; no email");
    return { status: "no_address" };
  }
  const day = scanTeamEmailDay(now);
  if (now < localDateTime(day, PACIFIC_ZONE, SCAN_TEAM_EMAIL_HOUR)) return { status: "too_early" };
  const waiting = await store.waitingCount();
  if (!Number.isSafeInteger(waiting) || waiting < 1) return { status: "none_waiting" };
  const message = { sender: { to: "savar" } as const, to: address, ...scanTeamEmail(waiting, origin) };
  const outcome = await sendEmailOnce(dayLedger(store, waiting), day, message, { transport });
  if (outcome.status === "busy") return { status: "already_sent" };
  return { status: outcome.status, waiting };
}
