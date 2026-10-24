// The copy without names (#201, spec #181, D-119): before a family is deleted, each of its tests is copied with a random
// id that does not link to the family. The copy is an allowlist, built field by field here, so a column added to a
// table later never reaches it on its own. It keeps the grade, province, test month, route, every question as shown,
// each response with its mark and misconception, all timing and signals, the fact answers, the placement, the profile
// facts and the questionnaire choices. D-145: never the removed extra round (#190): not its record, not its questions. It
// leaves out names, emails, postal codes, every family, child or test id, drawings, strokes, typed working and all free
// text. Every time is milliseconds since the test started: an exact date and time could be matched to other records of
// the family. Pure: the source is what the database function family_copy_sources returns for one test
// (supabase/migrations/20261016_test_copies_without_names.sql).
import { BANKS } from "./bank";
import { fromRemovedRound } from "./session";
import { INTERESTS, LEARNING_GOALS, LEARNING_STYLES, MATH_FEELINGS, WEEKLY_TIMES } from "@/lib/learning-style";
import type { Placement, Province, Route } from "./types";

/**
 * The version of the copy's JSON. A change that a reader of stored copies must know about adds one. 2 (D-145): no
 * `extraRound` record and no `round` on a question; every question is a main test question.
 */
export const COPY_VERSION = 2;

/**
 * The copy's fields, in order: the test, each question and each fact answer. The database refuses a copy with a field
 * at the top or in a question that its allowlist does not have (save_family_test_copy), so a new field here needs a
 * migration too. Its allowlist still has the removed round's fields (`extraRound` and its record, a question's `round`)
 * until the follow-up migration of D-145; the copy never sends them.
 */
export const COPY_FIELDS = {
  test: [
    "copyVersion", "grade", "province", "testMonth", "testFamily", "status", "route", "help", "durationMs", "break",
    "device", "placement", "questions", "facts", "profile", "questionnaire",
  ],
  question: [
    "position", "questionId", "templateId", "standard", "wording", "level", "strand", "format", "prompt",
    "choices", "figure", "values", "answer", "showWork", "shownAtMs", "answeredAtMs", "response", "correct",
    "misconception", "timeMs", "changes", "readAloud", "away", "work",
  ],
  fact: ["position", "factId", "family", "a", "op", "b", "answer", "response", "correct", "atMs", "serverMs", "browserMs"],
} as const;

/**
 * The placement's fields the copy keeps: all of today's, by name. A field added later is left out until listed here.
 * D-145: so is `extraRound`, which two placements from before the round's removal (#190) still hold.
 */
const PLACEMENT_FIELDS = [
  "grade", "province", "scoredAgainst", "workingLevel", "confidence", "levelCertainty", "atCeiling", "route", "stage1",
  "levels", "strands", "facts", "flags", "pace",
] as const;

/** The profile's facts (#196): every field but `ai`. The copy keeps a profile only at the schema version it knows. */
const PROFILE_FIELDS = [
  "schemaVersion", "test", "level", "strands", "standards", "strengths", "struggles", "facts",
  "behaviour", "preferences", "parent", "unknowns",
] as const;
const PROFILE_VERSION = 1;

const DEVICE_FIELDS = ["deviceClass", "input", "screenWidth", "screenHeight", "browser"] as const;

/** One question as the child saw it, and what the child did on it. Null where the test did not record it. */
export interface QuestionCopy {
  position: number;
  questionId: string;
  templateId: string;
  /** The template's BC standard and wording, from the bank when the copy was made. Null for a template no longer in it. */
  standard: string | null;
  wording: string | null;
  level: number | null;
  strand: string | null;
  format: string | null;
  prompt: string | null;
  /** The choices in the order shown; null for a number question. */
  choices: string[] | null;
  figure: { kind: "bars"; bars: { label: string; value: number }[] } | null;
  values: Record<string, number>;
  answer: string | null;
  showWork: boolean;
  shownAtMs: number | null;
  answeredAtMs: number | null;
  /** A choice as shown or a number. Anything else is null: it could be free text from a changed screen. */
  response: string | null;
  correct: boolean | null;
  misconception: string | null;
  /** Thinking time, measured in the browser. */
  timeMs: number | null;
  changes: { value: string | null; atMs: number }[] | null;
  readAloud: { count: number; atMs: number[] } | null;
  away: { count: number; ms: number } | null;
  /** Whether there was work, never the work itself. */
  work: { required: boolean; drawing: boolean; typed: boolean; strokes: boolean };
}

export interface FactCopy {
  position: number;
  factId: string;
  family: string | null;
  a: number | null;
  op: string | null;
  b: number | null;
  answer: number | null;
  /** Digits, or empty for a skipped fact. Anything else is null. */
  response: string | null;
  correct: boolean;
  atMs: number;
  serverMs: number | null;
  browserMs: number | null;
}

/** One test, without names. Stored in public.anonymous_tests.copy. */
export interface AnonymousTestCopy {
  copyVersion: typeof COPY_VERSION;
  grade: number;
  province: Province;
  /** "2026-03": the month the test started, in UTC. The only date in the copy. */
  testMonth: string;
  /** A family an admin marked as a test (D-099). Exports leave these out unless asked. */
  testFamily: boolean;
  status: "in_progress" | "completed" | "expired";
  route: Route | null;
  help: string | null;
  durationMs: number | null;
  break: { startedAtMs: number | null; endedAtMs: number | null; skipped: boolean | null; ms: number | null } | null;
  device: Partial<Record<(typeof DEVICE_FIELDS)[number], string | number | null>> | null;
  placement: Partial<Placement> | null;
  questions: QuestionCopy[];
  facts: { startedAtMs: number | null; answers: FactCopy[] } | null;
  profile: Record<string, unknown> | null;
  questionnaire: { styles: string[]; interests: string[]; feeling: string | null; goal: string | null; weeklyTime: string | null } | null;
}

/** The field names the copy holds, for the dry run: the test's, then each question's and each fact answer's. */
export const copyFieldNames = (): string[] => [
  ...COPY_FIELDS.test,
  ...COPY_FIELDS.question.map((k) => `questions.${k}`),
  ...COPY_FIELDS.fact.map((k) => `facts.answers.${k}`),
];

type Raw = Record<string, unknown>;

const unreadable = (): never => { throw new Error("Copy source unreadable"); };
const record = (v: unknown): Raw | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Raw) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const oneOf = <T extends string>(v: unknown, known: readonly T[]): T | null => (known.includes(v as T) ? (v as T) : null);
const ids = (items: readonly { id: string }[]) => items.map((i) => i.id);

const PROVINCES: readonly Province[] = ["BC", "AB", "SK", "MB", "ON", "other"];
const STATUSES = ["in_progress", "completed", "expired"] as const;
const ROUTES: readonly Route[] = ["up", "stay", "down"];
const HELP = ["yes", "a-little", "no"] as const;

/** Every bank template, by id: the copy records its standard and wording as they were. */
const TEMPLATES = new Map(Object.values(BANKS).flat().map((t) => [t.id, t]));

/** What the number pad sends: digits with one decimal point (an optional minus). Empty is a cleared answer. */
const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;
const ANSWER_MAX = 12;

/** Only what the screen offers: a choice as shown, or a number. Anything else could be free text, so it is null. */
function shownResponse(value: unknown, format: string | null, choices: string[] | null, emptyOk: boolean): string | null {
  if (typeof value !== "string") return null;
  if (value === "") return emptyOk ? "" : null;
  if (format === "choice") return choices?.includes(value) ? value : null;
  return value.length <= ANSWER_MAX && NUMBER.test(value) ? value : null;
}

/** Milliseconds from the test's start to a stored time; null when there is none. */
const since = (start: number, at: unknown): number | null => {
  const t = typeof at === "string" ? Date.parse(at) : NaN;
  return Number.isFinite(t) ? Math.round(t - start) : null;
};

/** The listed fields of a stored object, and nothing else; null when it is not an object. */
function picked(value: unknown, fields: readonly string[]): Raw | null {
  const r = record(value);
  if (!r) return null;
  return Object.fromEntries(fields.filter((k) => k in r).map((k) => [k, r[k]]));
}

/** The questions of the stored test (every form), by id. The first with an id wins. */
function storedQuestions(stored: unknown): Map<string, Raw> {
  const found = new Map<string, Raw>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 4) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    const r = record(v);
    if (!r) return;
    if (typeof r.id === "string" && typeof r.templateId === "string") { if (!found.has(r.id)) found.set(r.id, r); return; }
    Object.values(r).forEach((x) => walk(x, depth + 1));
  };
  walk(stored, 0);
  return found;
}

function figureOf(v: unknown): QuestionCopy["figure"] {
  const f = record(v);
  if (f?.kind !== "bars" || !Array.isArray(f.bars)) return null;
  const bars = f.bars.map((b) => ({ label: str(record(b)?.label), value: num(record(b)?.value) }));
  return bars.every((b) => b.label !== null && b.value !== null) ? { kind: "bars", bars: bars as { label: string; value: number }[] } : null;
}

const valuesOf = (v: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries(record(v) ?? {}).filter(([, n]) => num(n) !== null)) as Record<string, number>;

function questionCopy(
  position: number, questionId: string, answer: Raw | null, shownAt: unknown, q: Raw | null, start: number,
): QuestionCopy {
  const templateId = str(answer?.templateId) ?? str(q?.templateId) ?? "";
  const template = TEMPLATES.get(templateId);
  const format = oneOf(q?.format, ["choice", "number"] as const);
  const choices = Array.isArray(q?.choices) && q.choices.every((c) => typeof c === "string") ? (q.choices as string[]) : null;
  const changes = answer && Array.isArray(answer.changes)
    ? answer.changes.flatMap((c) => {
      const atMs = num(record(c)?.atMs);
      return atMs === null ? [] : [{ value: shownResponse(record(c)?.value, format, choices, true), atMs }];
    })
    : null;
  const readCount = num(answer?.readAloudCount);
  const awayCount = num(answer?.awayCount), awayMs = num(answer?.awayMs);
  return {
    position,
    questionId,
    templateId,
    standard: template?.standard ?? null,
    wording: template?.wording ?? null,
    level: num(q?.level),
    strand: str(q?.strand),
    format,
    prompt: str(q?.prompt),
    choices,
    figure: figureOf(q?.figure),
    values: valuesOf(answer?.values ?? q?.values),
    answer: str(q?.answer),
    showWork: q?.showWork === true,
    shownAtMs: since(start, answer?.shownAt ?? shownAt),
    answeredAtMs: answer ? since(start, answer.answeredAt) : null,
    response: answer ? shownResponse(answer.response, format, choices, false) : null,
    correct: answer ? bool(answer.correct) : null,
    misconception: answer ? str(answer.misconception) : null,
    timeMs: answer ? num(answer.timeMs) : null,
    changes,
    readAloud: readCount === null ? null : { count: readCount, atMs: list(answer?.readAloudAtMs).flatMap((t) => num(t) ?? []) },
    away: awayCount === null || awayMs === null ? null : { count: awayCount, ms: awayMs },
    work: { required: answer?.workRequired === true, drawing: answer?.drawing === true, typed: answer?.typed === true, strokes: answer?.strokes === true },
  };
}

/**
 * Every question the server served, by place in the test: the answered ones, and those shown with no answer. D-145:
 * not the questions of the removed extra round (#190), answered or shown (fromRemovedRound).
 */
function questionsOf(s: Raw, start: number): QuestionCopy[] {
  if (!Array.isArray(s.answers) || !Array.isArray(s.shows)) unreadable();
  const stored = storedQuestions(s.stored);
  const places = new Map<number, { questionId: string; answer: Raw | null; shownAt: unknown }>();
  for (const raw of s.shows as unknown[]) {
    const show = record(raw), position = num(show?.position), questionId = str(show?.questionId);
    if (position === null || questionId === null) unreadable();
    places.set(position!, { questionId: questionId!, answer: null, shownAt: show!.shownAt });
  }
  for (const raw of s.answers as unknown[]) {
    const answer = record(raw), position = num(answer?.position), questionId = str(answer?.questionId);
    if (position === null || questionId === null) unreadable();
    places.set(position!, { questionId: questionId!, answer, shownAt: places.get(position!)?.shownAt ?? null });
  }
  return [...places.entries()].sort(([a], [b]) => a - b)
    .filter(([, p]) => !fromRemovedRound(p.questionId))
    .map(([position, p]) => questionCopy(position, p.questionId, p.answer, p.shownAt, stored.get(p.questionId) ?? null, start));
}

function factsOf(v: unknown, start: number): AnonymousTestCopy["facts"] {
  const f = record(v);
  if (!f) return null;
  const drawn = new Map(list(record(f.stored)?.facts).flatMap((x) => {
    const fact = record(x);
    return typeof fact?.id === "string" ? [[fact.id, fact] as const] : [];
  }));
  const answers = list(f.answers).map((raw): FactCopy => {
    const a = record(raw), position = num(a?.position), factId = str(a?.factId), atMs = num(a?.atMs);
    if (position === null || factId === null || atMs === null) unreadable();
    const fact = drawn.get(factId!);
    const response = typeof a!.response === "string" && /^\d{0,4}$/.test(a!.response) ? a!.response : null;
    return {
      position: position!, factId: factId!, family: str(fact?.family), a: num(fact?.a), op: str(fact?.op), b: num(fact?.b),
      answer: num(fact?.answer), response, correct: a!.correct === true, atMs: atMs!, serverMs: num(a!.serverMs), browserMs: num(a!.browserMs),
    };
  });
  return { startedAtMs: since(start, f.startedAt), answers: answers.sort((x, y) => x.position - y.position) };
}

function questionnaireOf(v: unknown): AnonymousTestCopy["questionnaire"] {
  const l = record(v);
  if (!l) return null;
  const known = (items: unknown, allowed: readonly string[]) => list(items).filter((x): x is string => typeof x === "string" && allowed.includes(x));
  const answers = {
    styles: known(l.styles, ids(LEARNING_STYLES)),
    interests: known(l.interests, ids(INTERESTS)),
    feeling: oneOf(l.feeling, ids(MATH_FEELINGS)),
    goal: oneOf(l.goal, ids(LEARNING_GOALS)),
    weeklyTime: oneOf(l.weeklyTime, ids(WEEKLY_TIMES)),
  };
  const answered = answers.styles.length || answers.interests.length || answers.feeling || answers.goal || answers.weeklyTime;
  return answered ? answers : null;
}

/**
 * The profile's facts, at the one schema version this allowlist has checked; null for any other. The child's answer in
 * each struggle is the question's checked response, so free text that reached a stored response never comes along.
 */
function profileOf(v: unknown, questions: readonly QuestionCopy[]): Raw | null {
  if (record(v)?.schemaVersion !== PROFILE_VERSION) return null;
  const profile = picked(v, PROFILE_FIELDS)!;
  const responses = new Map(questions.map((q) => [q.questionId, q.response]));
  profile.struggles = list(profile.struggles).map((raw) => {
    const struggle = record(raw);
    return struggle && { ...struggle, wrong: list(struggle.wrong).map((w) => {
      const wrong = record(w);
      return wrong && { ...wrong, response: responses.get(str(wrong.questionId) ?? "") ?? null };
    }) };
  });
  return profile;
}

/** The device's coarse classes and screen size (#185), each a short word or a number. */
function deviceOf(v: unknown): AnonymousTestCopy["device"] {
  const d = picked(v, DEVICE_FIELDS);
  if (!d) return null;
  return Object.fromEntries(Object.entries(d).map(([k, x]) => [k, num(x) ?? (typeof x === "string" && /^[a-z]{1,12}$/.test(x) ? x : null)]));
}

/** One test's copy. Throws when the source cannot be read, so the deletion stops (fail closed). */
export function anonymousTestCopy(source: unknown): AnonymousTestCopy {
  const s = record(source) ?? unreadable();
  const grade = num(s.grade), province = oneOf(s.province, PROVINCES), status = oneOf(s.status, STATUSES);
  const start = typeof s.startedAt === "string" ? Date.parse(s.startedAt) : NaN;
  if (typeof s.id !== "string" || grade === null || !Number.isInteger(grade) || grade < 1 || grade > 7 || !province || !status
    || !Number.isFinite(start)) unreadable();
  const breakStarted = since(start, s.breakStartedAt), breakEnded = since(start, s.breakEndedAt);
  const questions = questionsOf(s, start);
  const placement = picked(s.placement, PLACEMENT_FIELDS);
  return {
    copyVersion: COPY_VERSION,
    grade: grade!,
    province: province!,
    testMonth: new Date(start).toISOString().slice(0, 7),
    testFamily: s.testFamily === true,
    status: status!,
    route: oneOf(s.route, ROUTES),
    help: oneOf(s.help, HELP),
    durationMs: since(start, s.completedAt),
    break: breakStarted === null ? null : { startedAtMs: breakStarted, endedAtMs: breakEnded, skipped: bool(s.breakSkipped), ms: num(s.breakMs) },
    device: deviceOf(s.device),
    placement: placement as Partial<Placement> | null,
    questions,
    facts: factsOf(s.facts, start),
    profile: profileOf(s.profile, questions),
    questionnaire: questionnaireOf(s.learning),
  };
}

/** What a deletion would copy, in counts only: the dry run prints these, never a value. Throws as the copy does. */
export function copyPreview(sources: readonly unknown[]) {
  const preview = { tests: 0, copied: 0, questions: 0, facts: 0, profiles: 0, questionnaires: 0 };
  for (const source of sources) {
    const copy = anonymousTestCopy(source);
    if (record(source)?.copied === true) { preview.copied++; continue; }
    preview.tests++;
    preview.questions += copy.questions.length;
    preview.facts += copy.facts?.answers.length ?? 0;
    if (copy.profile) preview.profiles++;
    if (copy.questionnaire) preview.questionnaires++;
  }
  return preview;
}

/** The database half of the copy, for one frozen family under the deletion lease. */
export interface FamilyCopyStore {
  /** Every test of the family, as family_copy_sources returns it; `copied` when its copy is already saved. */
  copySources(): Promise<unknown[]>;
  /** Saves one test's copy and its link to the test, in one transaction. False when the test already has its copy. */
  saveCopy(test: string, copy: AnonymousTestCopy): Promise<boolean>;
  /** True when every test of the family has its copy. */
  confirmCopies(): Promise<boolean>;
}

/**
 * Copies every test of a frozen family that has no copy yet, then has the database confirm a copy of each. Any failure
 * throws, so nothing is deleted. A retry after a lost answer finds the saved link and writes no second copy. Returns
 * the copies written by this call.
 */
export async function copyFamilyTests(store: FamilyCopyStore): Promise<number> {
  const sources = await store.copySources();
  if (!Array.isArray(sources)) unreadable();
  let written = 0;
  for (const source of sources) {
    const copy = anonymousTestCopy(source);
    if (record(source)?.copied === true) continue;
    if (await store.saveCopy((source as Raw).id as string, copy)) written++;
  }
  if (!await store.confirmCopies()) throw new Error("Copy incomplete");
  return written;
}
