import "server-only";
import { sendEmailOnceInTime, type MailTransport, type ReleasableLedger } from "@/lib/email-delivery";
import { resendTransport, TIME_LIMIT_MS } from "@/lib/email-resend";
import { buildTeamDigest, digestDay, digestPeriod, readFrom, teamDigestEmail, type TeamDigestRows } from "@/lib/team-digest";

// Sends the team's daily digest (docs/team-digest.md). The reminders run calls `runTeamDigest` on every pass (every 15 minutes).
// From 7 a.m. Pacific, once per Pacific day, one email goes to SIGNUP_NOTIFY_EMAIL. The day is claimed in public.team_digest_days
// through the delivery module (send key: the day): a refused send gives the claim back, so the next run tries again; an unknown
// outcome keeps it, and nothing sends that day's email again.

/** The store seam: the database in production (src/lib/team-digest-store.ts), memory in tests (src/lib/team-digest-memory.ts). */
export interface TeamDigestStore {
  /** Every row the digest needs, from `from` up to `to` (instants), and the current states. */
  read(from: number, to: number, signal?: AbortSignal): Promise<TeamDigestRows>;
  /** Whether a run already claimed the day: a cheap check, so the runs after the send read nothing more. The claim still decides. */
  dayTaken(day: string, signal?: AbortSignal): Promise<boolean>;
  /** Claims the day. False: another run holds it, or its email went or may have gone. */
  claimDay(day: string, weekly: boolean, signal?: AbortSignal): Promise<boolean>;
  /** The email went. Never throws. */
  sent(day: string, emailId: string, signal?: AbortSignal): Promise<void>;
  /** The email did not go: true when the day was given back. Never throws. */
  released(day: string, error: string, signal?: AbortSignal): Promise<boolean>;
  /** The email may have gone: the day stays claimed. Never throws. */
  unknown(day: string, error: string, signal?: AbortSignal): Promise<void>;
}

export type TeamDigestResult =
  | { status: "off" | "no_address" | "too_early" | "already_sent" | "refused" | "unknown" | "sent" | "out_of_time"; weekly?: boolean }
  | { status: "failed" };

interface RunTime { now(): number; endAt: number }
const DATABASE_MS = 2_000;
/** The reads run in parallel; together they get this long. */
const READ_MS = 15_000;
const SEND_ROOM_MS = TIME_LIMIT_MS + DATABASE_MS;
const OUT_OF_TIME = new Error("team_digest_out_of_time");

async function inTime<T>(call: (signal?: AbortSignal) => Promise<T>, time: RunTime | undefined, limit: number, reserve = 0): Promise<T> {
  if (!time) return call();
  const room = Math.min(limit, time.endAt - time.now() - reserve);
  if (room <= 0) throw OUT_OF_TIME;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(OUT_OF_TIME); controller.abort(); }, room);
  });
  try { return await Promise.race([call(controller.signal), stopped]); }
  finally { clearTimeout(timer); }
}

function dayLedger(store: TeamDigestStore, weekly: boolean, time?: RunTime): ReleasableLedger<string, string> {
  return {
    claim: async (day) => (await inTime((signal) => store.claimDay(day, weekly, signal), time, DATABASE_MS, SEND_ROOM_MS)) ? day : null,
    sent: (day, emailId) => inTime((signal) => store.sent(day, emailId, signal), time, DATABASE_MS),
    refused: async (day, error) => { await inTime((signal) => store.released(day, error, signal), time, DATABASE_MS); },
    unknown: (day, error) => inTime((signal) => store.unknown(day, error, signal), time, DATABASE_MS),
    release: (day) => inTime((signal) => store.released(day, "The send did not start: the time ran out", signal), time, DATABASE_MS),
  };
}

export async function runTeamDigest(
  store: TeamDigestStore,
  now: number,
  { enabled, to, origin, transport = resendTransport(), time }: { enabled: string | null | undefined; to: string | null | undefined; origin: string; transport?: MailTransport; time?: RunTime },
): Promise<TeamDigestResult> {
  // TEAM_DIGEST_EMAIL_ENABLED: only the exact value "on" sends; unset or anything else reads nothing and sends nothing.
  if (enabled !== "on") return { status: "off" };
  const address = to?.trim();
  if (!address) {
    console.error("[team digest] SIGNUP_NOTIFY_EMAIL is not set; no email");
    return { status: "no_address" };
  }
  const { day, due } = digestDay(now);
  if (!due) return { status: "too_early" };
  const mayStart = () => !time || time.endAt - time.now() >= SEND_ROOM_MS;
  if (!mayStart()) return { status: "out_of_time" };
  const period = digestPeriod(day);
  const weekly = !!period.week;
  try {
    if (await inTime((signal) => store.dayTaken(day, signal), time, DATABASE_MS, SEND_ROOM_MS)) return { status: "already_sent" };
    const rows = await inTime((signal) => store.read(readFrom(period), period.to, signal), time, READ_MS, SEND_ROOM_MS);
    if (!mayStart()) return { status: "out_of_time" };
    const message = { sender: { to: "savar" } as const, to: address, ...teamDigestEmail(buildTeamDigest(rows, period), origin) };
    const controller = new AbortController();
    const timer = time ? setTimeout(() => controller.abort(), Math.max(0, time.endAt - time.now() - DATABASE_MS)) : undefined;
    try {
      const bounded: MailTransport = { send: (m, options) => transport.send(m, { ...options, signal: controller.signal }) };
      const outcome = await sendEmailOnceInTime(dayLedger(store, weekly, time), day, message, { transport: bounded, inTime: mayStart });
      if (outcome.status === "busy") return { status: "already_sent" };
      if (outcome.status === "not_sent") return { status: "out_of_time", weekly };
      return { status: outcome.status, weekly };
    } finally { clearTimeout(timer); }
  } catch (e) {
    if (e === OUT_OF_TIME) return { status: "out_of_time" };
    throw e;
  }
}
