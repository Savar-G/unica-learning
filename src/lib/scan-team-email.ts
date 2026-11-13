import "server-only";
import { ADMIN_PATH } from "@/lib/admin-view";
import { sendEmailOnceInTime, type MailTransport, type ReleasableLedger } from "@/lib/email-delivery";
import { resendTransport, TIME_LIMIT_MS } from "@/lib/email-resend";
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
  waitingCount(signal?: AbortSignal): Promise<number>;
  /** Claims the team day. False: another run holds it, or its email went or may have gone. */
  claimDay(day: string, waiting: number, signal?: AbortSignal): Promise<boolean>;
  /** The email went. Never throws. */
  sent(day: string, emailId: string, signal?: AbortSignal): Promise<void>;
  /** The email did not go: true when the day was given back. Never throws. */
  released(day: string, error: string, signal?: AbortSignal): Promise<boolean>;
  /** The email may have gone: the day stays claimed. Never throws. */
  unknown(day: string, error: string, signal?: AbortSignal): Promise<void>;
}

export type ScanTeamEmailResult =
  | { status: "no_address" | "too_early" | "none_waiting" | "already_sent" | "refused" | "unknown" | "sent" | "out_of_time"; waiting?: number }
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

interface RunTime { now(): number; endAt: number }
const DATABASE_MS = 2_000;
// Resend stops a request after 15 seconds. Keep two more seconds for the ledger write.
const SEND_ROOM_MS = TIME_LIMIT_MS + DATABASE_MS;
const OUT_OF_TIME = new Error("scan_team_email_out_of_time");

async function inTime<T>(call: (signal?: AbortSignal) => Promise<T>, time?: RunTime, reserve = 0): Promise<T> {
  if (!time) return call();
  const room = Math.min(DATABASE_MS, time.endAt - time.now() - reserve);
  if (room <= 0) throw OUT_OF_TIME;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(OUT_OF_TIME); controller.abort(); }, room);
  });
  try { return await Promise.race([call(controller.signal), stopped]); }
  finally { clearTimeout(timer); }
}

function dayLedger(store: ScanTeamEmailStore, waiting: number, time?: RunTime): ReleasableLedger<string, string> {
  return {
    claim: async (day) => (await inTime((signal) => store.claimDay(day, waiting, signal), time, SEND_ROOM_MS)) ? day : null,
    sent: (day, emailId) => inTime((signal) => store.sent(day, emailId, signal), time),
    refused: async (day, error) => { await inTime((signal) => store.released(day, error, signal), time); },
    unknown: (day, error) => inTime((signal) => store.unknown(day, error, signal), time),
    release: (day) => inTime((signal) => store.released(day, "The send did not start: the time ran out", signal), time),
  };
}

export async function runScanTeamEmail(
  store: ScanTeamEmailStore,
  now: number,
  { to, origin, transport = resendTransport(), time }: { to: string | null | undefined; origin: string; transport?: MailTransport; time?: RunTime },
): Promise<ScanTeamEmailResult> {
  const address = to?.trim();
  if (!address) {
    console.error("[scan team email] SIGNUP_NOTIFY_EMAIL is not set; no email");
    return { status: "no_address" };
  }
  const day = scanTeamEmailDay(now);
  if (now < localDateTime(day, PACIFIC_ZONE, SCAN_TEAM_EMAIL_HOUR)) return { status: "too_early" };
  const mayStart = () => !time || time.endAt - time.now() >= SEND_ROOM_MS;
  if (!mayStart()) return { status: "out_of_time" };
  try {
    const waiting = await inTime((signal) => store.waitingCount(signal), time, SEND_ROOM_MS);
    if (!Number.isSafeInteger(waiting) || waiting < 1) return { status: "none_waiting" };
    if (!mayStart()) return { status: "out_of_time" };
    const message = { sender: { to: "savar" } as const, to: address, ...scanTeamEmail(waiting, origin) };
    const controller = new AbortController();
    const timer = time ? setTimeout(() => controller.abort(), Math.max(0, time.endAt - time.now() - DATABASE_MS)) : undefined;
    try {
      const bounded: MailTransport = { send: (message, options) => transport.send(message, { ...options, signal: controller.signal }) };
      const outcome = await sendEmailOnceInTime(dayLedger(store, waiting, time), day, message, { transport: bounded, inTime: mayStart });
      if (outcome.status === "busy") return { status: "already_sent" };
      if (outcome.status === "not_sent") return { status: "out_of_time", waiting };
      return { status: outcome.status, waiting };
    } finally { clearTimeout(timer); }
  } catch (e) {
    if (e === OUT_OF_TIME) return { status: "out_of_time" };
    throw e;
  }
}
