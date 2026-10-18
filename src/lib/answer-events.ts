// The answer timeline (#184): what the child did on one question before Next, as the browser measured it from when the
// question appeared. Shared by the test screen (client), which records it, and the answer route (server), which bounds
// it before the test attempt module stores it with the answer. No network, database or clock.
import { RESPONSE_MAX } from "@/lib/assessment";
import { QUESTION_TIME_CAP_MS } from "@/lib/test-api";

/** One change of the answer before Next: the value then, and the milliseconds since the question appeared. */
export interface AnswerChange {
  value: string;
  atMs: number;
}

/** What the child did on one question before Next. Every time is in milliseconds since the question appeared. */
export interface AnswerEvents {
  /** Each change of the answer, in order (the first ANSWER_CHANGES_MAX). The last one is the answer sent. */
  changes: AnswerChange[];
  /** "Read it to me": how many times the child started it, and when (the first READ_ALOUD_TIMES_MAX). */
  readAloud: { count: number; atMs: number[] };
  /** Time away from the tab: how many times the tab was hidden, and for how long in total. */
  away: { count: number; ms: number };
}

/** The most answer changes stored for one answer: the first ones. */
export const ANSWER_CHANGES_MAX = 50;
/** The most read-aloud times stored for one answer: the first ones. The count goes on. */
export const READ_ALOUD_TIMES_MAX = 20;
/** The highest count stored (read-aloud uses, times away). */
export const EVENT_COUNT_MAX = 1000;

type Parsed<T> = T | undefined;

/** A time in milliseconds since the question appeared: a whole number up to the cap of the time on one question. */
const time = (raw: unknown): Parsed<number> =>
  typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.min(Math.round(raw), QUESTION_TIME_CAP_MS) : undefined;
const count = (raw: unknown): Parsed<number> =>
  typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.min(Math.round(raw), EVENT_COUNT_MAX) : undefined;
const record = (raw: unknown): Record<string, unknown> | undefined =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;

/** Every item parsed, or undefined when one is not usable. */
function all<T>(items: unknown[], parse: (item: unknown) => Parsed<T>): Parsed<T[]> {
  const out: T[] = [];
  for (const item of items) {
    const parsed = parse(item);
    if (parsed === undefined) return undefined;
    out.push(parsed);
  }
  return out;
}

function change(raw: unknown): Parsed<AnswerChange> {
  const c = record(raw);
  const atMs = time(c?.atMs);
  if (typeof c?.value !== "string" || atMs === undefined) return undefined;
  return { value: [...c.value].slice(0, RESPONSE_MAX).join(""), atMs };
}

/**
 * The `events` of an answer request, with every size bounded: the first ANSWER_CHANGES_MAX changes, the first
 * READ_ALOUD_TIMES_MAX read-aloud times, counts up to EVENT_COUNT_MAX, times up to QUESTION_TIME_CAP_MS, and values up
 * to RESPONSE_MAX characters. Null when there are none, or when they are not usable (the wrong shape, a negative or
 * missing number): the answer is stored without them, never refused for them.
 */
export function parseAnswerEvents(raw: unknown): AnswerEvents | null {
  const events = record(raw);
  const read = record(events?.readAloud);
  const away = record(events?.away);
  if (!events || !Array.isArray(events.changes) || !read || !Array.isArray(read.atMs) || !away) return null;
  const changes = all(events.changes.slice(0, ANSWER_CHANGES_MAX), change);
  const readTimes = all(read.atMs, time);
  const readCount = count(read.count);
  const awayCount = count(away.count);
  const awayMs = time(away.ms);
  if (!changes || !readTimes || readCount === undefined || awayCount === undefined || awayMs === undefined) return null;
  return {
    changes,
    // Every time kept is a use, even when the count sent is lower.
    readAloud: { count: Math.min(Math.max(readCount, readTimes.length), EVENT_COUNT_MAX), atMs: readTimes.slice(0, READ_ALOUD_TIMES_MAX) },
    away: { count: awayCount, ms: awayMs },
  };
}

/**
 * #249: the events of one question over two visits: the earlier ones, then the later visit's, each later time counted
 * from the start of the first visit (`earlierMs`, the time of the visits before, plus the time in this visit). Changes
 * and read-aloud times keep the first ones up to their caps; every time stays within the time cap of one question;
 * counts and time away add up within their caps. Null when neither visit has events; the earlier events alone when
 * the later visit sent none.
 */
export function mergeEvents(earlier: AnswerEvents | null, earlierMs: number, later: AnswerEvents | null): AnswerEvents | null {
  if (!later) return earlier;
  const shift = (atMs: number) => Math.min(Math.max(0, Math.round(earlierMs + atMs)), QUESTION_TIME_CAP_MS);
  const before = earlier ?? { changes: [], readAloud: { count: 0, atMs: [] }, away: { count: 0, ms: 0 } };
  return {
    changes: [...before.changes, ...later.changes.map((c) => ({ value: c.value, atMs: shift(c.atMs) }))].slice(0, ANSWER_CHANGES_MAX),
    readAloud: {
      count: Math.min(before.readAloud.count + later.readAloud.count, EVENT_COUNT_MAX),
      atMs: [...before.readAloud.atMs, ...later.readAloud.atMs.map(shift)].slice(0, READ_ALOUD_TIMES_MAX),
    },
    away: { count: Math.min(before.away.count + later.away.count, EVENT_COUNT_MAX), ms: Math.min(before.away.ms + later.away.ms, QUESTION_TIME_CAP_MS) },
  };
}

/**
 * Records the events of one question in the browser, bounded as the server bounds them. Every `at` is milliseconds since
 * the question appeared, by the caller's clock. `shown` is the answer already on the screen when the question appears
 * (#249: an answered question the child went back to): it is not a change, and nor is any value equal to the last one.
 */
export function answerRecorder(shown = "") {
  const changes: AnswerChange[] = [];
  const readAloud = { count: 0, atMs: [] as number[] };
  const away = { count: 0, ms: 0 };
  let hiddenAt: number | null = null;
  let last = shown;
  const ms = (at: number) => Math.min(Math.max(0, Math.round(at)), QUESTION_TIME_CAP_MS);
  return {
    /** The answer changed to `value` (a choice tapped, a key pressed on the number pad). The same value again is no change. */
    change(value: string, at: number) {
      if (value === last) return;
      last = value;
      if (changes.length < ANSWER_CHANGES_MAX) changes.push({ value, atMs: ms(at) });
    },
    /** "Read it to me" started. */
    readAloud(at: number) {
      readAloud.count = Math.min(readAloud.count + 1, EVENT_COUNT_MAX);
      if (readAloud.atMs.length < READ_ALOUD_TIMES_MAX) readAloud.atMs.push(ms(at));
    },
    /** The tab was hidden (another tab or app came in front). */
    hidden(at: number) {
      if (hiddenAt !== null) return;
      hiddenAt = at;
      away.count = Math.min(away.count + 1, EVENT_COUNT_MAX);
    },
    /** The tab is in front again. */
    visible(at: number) {
      if (hiddenAt === null) return;
      away.ms = ms(away.ms + Math.max(0, at - hiddenAt));
      hiddenAt = null;
    },
    /** The events so far, to send with the answer at `at`. Time away that still runs counts up to `at`. */
    events(at: number): AnswerEvents {
      const running = hiddenAt === null ? 0 : Math.max(0, at - hiddenAt);
      return { changes: [...changes], readAloud: { count: readAloud.count, atMs: [...readAloud.atMs] }, away: { count: away.count, ms: ms(away.ms + running) } };
    },
  };
}
