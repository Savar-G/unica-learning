// Maya's minutes ledger (#330, spec #297): how many minutes a child may still talk with Maya this week, and how long
// one call may last.
//
// - A child has WEEK_SECONDS (30 minutes) a week. The week starts on Monday at 00:00 in the family's time zone
//   (`parents.time_zone`, else the child's province, else DEFAULT_TIME_ZONE).
// - A call may last CALL_SECONDS (10 minutes), or the minutes left this week when fewer. Under MIN_CALL_SECONDS left, no
//   call starts. The grant's seconds are the call's time limit (`limitMs`, src/lib/maya/session.ts `limitsOf`): Maya
//   closes in the last minute and the audio ends at the limit.
// - A parent's "Try Maya" calls (#336) use a separate cap per parent and local day (MAYA_DEMO_DAILY_MINUTES, default
//   DEMO_DAILY_MINUTES), never the child's minutes.
// - Counted on the server: the grant is made before the call, under a lock per child (or per parent for a demo), in one
//   database transaction (`grant_maya_minutes`, migration add_maya_minutes), so two starts at once cannot both spend
//   the same minutes. A retry with the same call id gets the same grant again. While the call is open, its whole grant
//   counts. When the call ends, a trigger settles the grant at the call's connected seconds (the time the child and
//   Maya were both in the room, src/lib/maya-voice.ts `connectedSeconds`, which joins every reconnect of the one call),
//   at most the grant. A grant whose call was never made counts nothing after GRANT_CALL_WAIT_MS.
//
// Seams: the store (Supabase: src/lib/maya-minutes-store.ts; memory: src/lib/maya-minutes-memory.ts) and the clock. Pure
// otherwise: no network, database or Next.js.

export const WEEK_SECONDS = 30 * 60;
export const CALL_SECONDS = 10 * 60;
/** Fewer seconds left than this: no call starts (a call needs time for its closing). */
export const MIN_CALL_SECONDS = 60;
/** The default daily cap of a parent's "Try Maya" calls, in minutes (configuration: MAYA_DEMO_DAILY_MINUTES). */
export const DEMO_DAILY_MINUTES = 10;
/** A grant with no call row after this long was never used (the start failed): it counts nothing. */
export const GRANT_CALL_WAIT_MS = 2 * 60_000;
/** The time zone of a family with none stored and no known province: the BC launch (D-126). */
export const DEFAULT_TIME_ZONE = "America/Vancouver";

/** The time zone of each signup province (src/lib/signup.ts CURRICULA), for a family with none stored. */
const PROVINCE_ZONES: Readonly<Record<string, string>> = {
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  SK: "America/Regina",
  MB: "America/Winnipeg",
  ON: "America/Toronto",
};

export type MinutesKind = "child" | "parent_demo";

/** Whether `tz` is an IANA time zone this runtime knows. */
export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length < 1 || tz.length > 64 || !/^[A-Za-z][A-Za-z0-9_+/-]*$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The family's time zone: the stored one, else the province's, else DEFAULT_TIME_ZONE. */
export function familyTimeZone(stored: string | null | undefined, province?: string | null): string {
  if (validTimeZone(stored)) return stored;
  return (province && PROVINCE_ZONES[province]) || DEFAULT_TIME_ZONE;
}

/** The daily cap of a parent's demo calls (seconds) from the environment: whole minutes 1 to 60, else the default. */
export function demoDailySeconds(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env.MAYA_DEMO_DAILY_MINUTES?.trim();
  const n = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return (n >= 1 && n <= 60 ? n : DEMO_DAILY_MINUTES) * 60;
}

// ---------- weeks and days in a time zone ----------

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The local calendar date and weekday (0 = Monday) of an instant in a time zone. */
function localDate(at: number, tz: string): { y: number; m: number; d: number; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short" })
      .formatToParts(new Date(at)).map((p) => [p.type, p.value]),
  );
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), weekday: WEEKDAYS.indexOf(parts.weekday) };
}

/** The zone's offset from UTC at an instant (ms; local = UTC + offset). */
function offsetAt(at: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(new Date(at)).map((x) => [x.type, x.value]),
  );
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return local - Math.floor(at / 1000) * 1000;
}

/** The instant of 00:00 local time on a calendar date (given as a UTC date at midnight) in a time zone. */
function localMidnight(utcDate: number, tz: string): number {
  let at = utcDate - offsetAt(utcDate, tz);
  at = utcDate - offsetAt(at, tz); // again, in case the offset changed between the guess and the answer
  return at;
}

const isoDate = (utcDate: number) => new Date(utcDate).toISOString().slice(0, 10);

/** A ledger period: its first local day (YYYY-MM-DD, the database's `period`) and when the next one starts. */
export interface Period {
  start: string;
  /** When the next period starts (ms since 1970). */
  resetsAt: number;
}

/** The week of an instant in a time zone: it starts on Monday at 00:00 local time. */
export function weekOf(at: number, tz: string): Period {
  const { y, m, d, weekday } = localDate(at, tz);
  const monday = Date.UTC(y, m - 1, d) - weekday * DAY_MS;
  return { start: isoDate(monday), resetsAt: localMidnight(monday + 7 * DAY_MS, tz) };
}

/** The local day of an instant in a time zone. */
export function dayOf(at: number, tz: string): Period {
  const { y, m, d } = localDate(at, tz);
  const day = Date.UTC(y, m - 1, d);
  return { start: isoDate(day), resetsAt: localMidnight(day + DAY_MS, tz) };
}

// ---------- the ledger ----------

/** What the store needs to grant a call's seconds. */
export interface GrantRequest {
  callId: string;
  parentId: string;
  /** The child for a child's call; null for a parent's demo call. */
  childId: string | null;
  kind: MinutesKind;
  period: string;
  periodSeconds: number;
  callSeconds: number;
  minSeconds: number;
}

/** The store seam. Both calls throw when the store cannot answer. */
export interface MinutesStore {
  /**
   * Grants the call min(callSeconds, periodSeconds - used) seconds, or 0 (and stores nothing) when that is under
   * minSeconds. Atomic per child (per parent for a demo): two grants at once never both spend the same seconds. A call
   * that already has a grant gets it again. `usedSeconds`: the period's seconds used before this grant.
   */
  grant(request: GrantRequest): Promise<{ seconds: number; usedSeconds: number }>;
  /** The period's seconds used: settled calls at their seconds, open calls at their whole grant. */
  used(query: { parentId: string; childId: string | null; kind: MinutesKind; period: string }): Promise<number>;
}

export type Grant =
  | { ok: true; seconds: number; limitMs: number; leftSeconds: number }
  | { ok: false; reason: "none_left"; leftSeconds: number; resetsAt: number };

export interface Usage {
  usedSeconds: number;
  leftSeconds: number;
  weekSeconds: number;
  /** When the minutes come back (ms since 1970). */
  resetsAt: number;
}

export interface MinutesLedger {
  /** The seconds a child's call may last, granted from this week's minutes. A retry with the same call id gets the same. */
  grantChild(input: { callId: string; parentId: string; childId: string; timeZone: string }): Promise<Grant>;
  /** The seconds a parent's "Try Maya" call may last, from today's demo cap. Never the child's minutes. */
  grantDemo(input: { callId: string; parentId: string; timeZone: string }): Promise<Grant>;
  /** The child's minutes used and left this week. */
  usage(input: { parentId: string; childId: string; timeZone: string }): Promise<Usage>;
}

export function createMinutesLedger(seams: { store: MinutesStore; clock: () => number; demoDailySeconds?: number }): MinutesLedger {
  const { store, clock } = seams;
  const demoCap = seams.demoDailySeconds ?? DEMO_DAILY_MINUTES * 60;

  async function grant(base: Omit<GrantRequest, "period" | "periodSeconds" | "callSeconds" | "minSeconds">, period: Period, periodSeconds: number): Promise<Grant> {
    const r = await store.grant({ ...base, period: period.start, periodSeconds, callSeconds: CALL_SECONDS, minSeconds: MIN_CALL_SECONDS });
    const leftBefore = Math.max(0, periodSeconds - r.usedSeconds);
    if (r.seconds <= 0) return { ok: false, reason: "none_left", leftSeconds: leftBefore, resetsAt: period.resetsAt };
    return { ok: true, seconds: r.seconds, limitMs: r.seconds * 1000, leftSeconds: Math.max(0, leftBefore - r.seconds) };
  }

  return {
    grantChild: ({ callId, parentId, childId, timeZone }) =>
      grant({ callId, parentId, childId, kind: "child" }, weekOf(clock(), timeZone), WEEK_SECONDS),
    grantDemo: ({ callId, parentId, timeZone }) =>
      grant({ callId, parentId, childId: null, kind: "parent_demo" }, dayOf(clock(), timeZone), demoCap),
    async usage({ parentId, childId, timeZone }) {
      const week = weekOf(clock(), timeZone);
      const usedSeconds = Math.min(WEEK_SECONDS, await store.used({ parentId, childId, kind: "child", period: week.start }));
      return { usedSeconds, leftSeconds: WEEK_SECONDS - usedSeconds, weekSeconds: WEEK_SECONDS, resetsAt: week.resetsAt };
    },
  };
}

/** Seconds as whole minutes for a parent: used rounds up, left rounds down, so the two never promise more than there is. */
export function usageMinutes(u: Pick<Usage, "usedSeconds" | "leftSeconds">): { used: number; left: number } {
  return { used: Math.ceil(u.usedSeconds / 60), left: Math.floor(u.leftSeconds / 60) };
}
