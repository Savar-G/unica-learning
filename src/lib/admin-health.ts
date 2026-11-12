// "What to fix" (/admin/health, D-331): the failure and quality counts of the last 7 and 30 days, sorted by what is
// worst. Pure: no network, database or clock. The database counts (function admin_health_v1: one row per measure with
// the failures and the things counted for each window); this module gives each row its words, its link, its tone and
// its place in the list. Test families follow the "Show test families" switch: the function leaves them out unless it is on.

export const HEALTH_KEYS = [
  "runs_failed", "fit_failed", "gate_flags", "marking_waiting", "photo_refused", "photo_unknown",
  "maya_technical", "maya_flagged", "email_failed", "report_missing", "feedback_new",
] as const;
export type HealthKey = (typeof HEALTH_KEYS)[number];

/** One row of admin_health_v1. */
export interface HealthRow {
  key: HealthKey;
  n7: number;
  d7: number;
  n30: number;
  d30: number;
  /** The oldest answer still waiting (marking_waiting, feedback_new), else the latest failure. Null: none. */
  at: string | null;
}

export type HealthTone = "bad" | "warn" | "ok" | "muted";

interface Spec {
  label: string;
  /** What the count is a count of, in a few plain words ("failed" and "counted" make the sentence). */
  fails: string;
  counted: string;
  /** The list behind the number. */
  href: string;
  link: string;
  /** What `at` means on this row. */
  atLabel: string;
  /** One failure in the last 7 days is already bad (a safety flag, a missing report). */
  strict?: boolean;
  /** The rate of the last 7 days that makes it bad. Default 10%. */
  badRate?: number;
  /** For a thing that waits: it is worth a look after warnHours and bad after badHours of the oldest one. */
  wait?: { warnHours: number; badHours: number };
}

const SPECS: Record<HealthKey, Spec> = {
  runs_failed: { label: "Workbook runs that failed or stopped", fails: "failed or stopped", counted: "runs", href: "/admin/workbooks", link: "Production", atLabel: "Last one", badRate: 0.2 },
  fit_failed: { label: "Workbook questions that failed a check", fails: "failed or not checked", counted: "questions", href: "/admin/workbooks", link: "Production", atLabel: "Last draft", badRate: 0.05 },
  gate_flags: { label: "Questions the quality gates flagged", fails: "flagged", counted: "gate checks", href: "/admin/workbooks", link: "Production", atLabel: "Last one", badRate: 0.15 },
  marking_waiting: { label: "Answers waiting for our team to mark", fails: "waiting now", counted: "answers read in the window", href: "/admin/scans", link: "Marking", atLabel: "Oldest waiting", wait: { warnHours: 12, badHours: 48 } },
  photo_refused: { label: "Photos the check sent back", fails: "sent back", counted: "photos checked", href: "/admin/scans", link: "Marking", atLabel: "Last one", badRate: 0.3 },
  photo_unknown: { label: "Photo checks that could not decide", fails: "undecided", counted: "photo checks", href: "/admin/scans", link: "Marking", atLabel: "Last one", badRate: 0.1 },
  maya_technical: { label: "Maya chats that ended on a technical issue", fails: "ended on a technical issue", counted: "ended chats and calls", href: "/admin/maya", link: "Maya calls", atLabel: "Last one", badRate: 0.1 },
  maya_flagged: { label: "Maya chats flagged for safety or content", fails: "flagged", counted: "ended chats and calls", href: "/admin/maya", link: "Maya calls", atLabel: "Last one", strict: true },
  email_failed: { label: "Emails that bounced or failed", fails: "bounced or failed", counted: "emails to parents", href: "/admin/emails", link: "Emails", atLabel: "Last one", badRate: 0.05 },
  report_missing: { label: "Finished tests with no report after 1 hour", fails: "with no report", counted: "finished tests", href: "/admin/tests", link: "Tests", atLabel: "Last one", strict: true },
  feedback_new: { label: "Parent feedback not read yet", fails: "not read", counted: "messages", href: "/admin/feedback", link: "Feedback", atLabel: "Oldest unread", wait: { warnHours: 72, badHours: 168 } },
};

/** Below this many things counted, a rate says too little: the page shows the counts only. */
export const MIN_FOR_RATE = 5;

export interface Measure {
  key: HealthKey;
  label: string;
  tone: HealthTone;
  n7: number;
  d7: number;
  n30: number;
  d30: number;
  /** Failures over things counted, in percent, or null when too few were counted to read a rate. */
  rate7: number | null;
  rate30: number | null;
  /** "3 of 5 runs", the count without a rate. */
  text7: string;
  text30: string;
  at: string | null;
  atLabel: string;
  href: string;
  link: string;
  /** One plain sentence: why the row has its place. */
  why: string;
}

const HOUR_MS = 3_600_000;
const rateOf = (n: number, d: number) => (d >= MIN_FOR_RATE ? Math.round((n / d) * 100) : null);
const ratio = (n: number, d: number) => (d > 0 ? n / d : 0);

function toneOf(s: Spec, r: HealthRow, now: Date): HealthTone {
  if (r.n30 === 0) return r.d30 === 0 && !s.wait ? "muted" : "ok";
  if (s.wait) {
    const hours = r.at ? (now.getTime() - new Date(r.at).getTime()) / HOUR_MS : 0;
    return hours >= s.wait.badHours ? "bad" : hours >= s.wait.warnHours ? "warn" : "ok";
  }
  if (s.strict) return r.n7 > 0 ? "bad" : "warn";
  if (r.n7 > 0 && r.d7 >= MIN_FOR_RATE && ratio(r.n7, r.d7) >= (s.badRate ?? 0.1)) return "bad";
  return "warn";
}

function whyOf(s: Spec, r: HealthRow, tone: HealthTone): string {
  if (tone === "muted") return "Nothing to count in the last 30 days.";
  if (r.n30 === 0) return `None ${s.fails} in the last 30 days.`;
  if (s.wait) return tone === "ok" ? "Waiting, but not for long." : `The oldest has waited the longest of its kind.`;
  if (s.strict) return r.n7 > 0 ? "Any in the last 7 days needs a look." : "None in the last 7 days, some in the last 30.";
  if (tone === "bad") return `Above ${Math.round((s.badRate ?? 0.1) * 100)}% in the last 7 days.`;
  return r.n7 > 0 ? "Some in the last 7 days, but the rate is low or the count is small." : "None in the last 7 days, some in the last 30.";
}

const TONE_RANK: Record<HealthTone, number> = { bad: 0, warn: 1, ok: 2, muted: 3 };

/** Every measure, the worst first: by tone, then the rate of the last 7 days, then the count of the last 30. */
export function healthMeasures(rows: readonly HealthRow[], now: Date): Measure[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return HEALTH_KEYS.map((key) => {
    const s = SPECS[key];
    const r = byKey.get(key) ?? { key, n7: 0, d7: 0, n30: 0, d30: 0, at: null };
    const tone = toneOf(s, r, now);
    const text = (n: number, d: number) => (s.wait ? `${n} waiting` : `${n} of ${d} ${s.counted}`);
    return {
      key, label: s.label, tone, n7: r.n7, d7: r.d7, n30: r.n30, d30: r.d30,
      rate7: s.wait ? null : rateOf(r.n7, r.d7), rate30: s.wait ? null : rateOf(r.n30, r.d30),
      text7: text(r.n7, r.d7), text30: text(r.n30, r.d30),
      at: r.at, atLabel: s.atLabel, href: s.href, link: s.link, why: whyOf(s, r, tone),
    };
  }).sort((a, b) =>
    TONE_RANK[a.tone] - TONE_RANK[b.tone]
    || ratio(b.n7, b.d7) - ratio(a.n7, a.d7)
    || b.n30 - a.n30
    || HEALTH_KEYS.indexOf(a.key) - HEALTH_KEYS.indexOf(b.key));
}

export interface HealthSummary {
  bad: number;
  warn: number;
  /** The oldest answer that still waits for the team, or null when none waits. */
  oldestWaiting: string | null;
}

export function healthSummary(measures: readonly Measure[]): HealthSummary {
  const marking = measures.find((m) => m.key === "marking_waiting");
  return {
    bad: measures.filter((m) => m.tone === "bad").length,
    warn: measures.filter((m) => m.tone === "warn").length,
    oldestWaiting: marking && marking.n30 > 0 ? marking.at : null,
  };
}

/** Rows of admin_health_v1 as typed numbers (the database returns bigint as number or string). */
export function readHealthRows(raw: readonly { key: string; n7: number | string; d7: number | string; n30: number | string; d30: number | string; at: string | null }[]): HealthRow[] {
  const known = new Set<string>(HEALTH_KEYS);
  return raw.filter((r) => known.has(r.key)).map((r) => ({ key: r.key as HealthKey, n7: Number(r.n7), d7: Number(r.d7), n30: Number(r.n30), d30: Number(r.d30), at: r.at }));
}
