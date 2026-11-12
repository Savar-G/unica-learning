// How a child likes to learn (#126): questions the parent answers on the report, after the assessment and before
// payment, and later from the account. Stored on public.children. The book plan reads the learning styles and interests
// through bookMix; a child with no answer gets the default mix. #195 (D-107) adds how the child feels about math, the
// parent's main goal and the time each week, for the learner profile; they do not change the mix. Shared by the form
// (client), the route and the admin pages (server). Never sent to analytics: no answer travels with an event.
// D-325: the feeling and the goal are now asked right after signup, before the first test (src/lib/child-goals.ts,
// /account/goals), with the math help the child gets now; the learning card no longer asks or writes them (toRow).
// The ids are also in the check constraints of supabase/migrations/20261012_add_learning_style.sql,
// 20261016_add_learning_questions.sql and 20261111204124_child_goals_on_children.sql; change both
// (src/lib/state-lists.test.ts proves the lists).

export const LEARNING_STYLES = [
  { id: "pictures", label: "Pictures and diagrams" },
  { id: "stories", label: "Stories and real-life problems" },
  { id: "worked", label: "Step-by-step worked examples" },
  { id: "hands_on", label: "Hands-on: drawing, counting objects" },
] as const;
export type LearningStyle = (typeof LEARNING_STYLES)[number]["id"];

/** "Choose one or two." */
export const STYLE_MAX = 2;

/** The settings of the story problems. */
export const INTERESTS = [
  { id: "animals", label: "Animals" },
  { id: "sports", label: "Sports" },
  { id: "space", label: "Space" },
  { id: "cooking", label: "Cooking" },
  { id: "games", label: "Games" },
  { id: "music", label: "Music" },
  { id: "art", label: "Art and drawing" },
  { id: "nature", label: "Nature" },
  { id: "vehicles", label: "Cars and trains" },
  { id: "building", label: "Building things" },
] as const;
export type Interest = (typeof INTERESTS)[number]["id"];

/** "How does {child} feel about math right now?" One answer. avoids keeps its id for the planner (workbook-signals). */
export const MATH_FEELINGS = [
  { id: "enjoys", label: "Enjoys it" },
  { id: "okay", label: "It's okay" },
  { id: "finds_hard", label: "Finds it hard" },
  { id: "avoids", label: "Gets upset or avoids it" },
] as const;
export type MathFeeling = (typeof MATH_FEELINGS)[number]["id"];

/**
 * "What is your main goal for {child} in math?" One answer. keep_up is only in older answers (the card before D-325):
 * the signup does not offer it (SIGNUP_GOALS). catch_up and get_ahead keep their meaning for the planner.
 */
export const LEARNING_GOALS = [
  { id: "catch_up", label: "Catch up to grade level" },
  { id: "confident", label: "Feel confident at grade level" },
  { id: "next_grade", label: "Get ready for the next grade" },
  { id: "get_ahead", label: "Get ahead with more challenge" },
  { id: "not_sure", label: "Not sure yet" },
  { id: "keep_up", label: "Keep up" },
] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number]["id"];
/** The goals the signup offers, in order. */
export const SIGNUP_GOALS = LEARNING_GOALS.filter((g) => g.id !== "keep_up");

/** "What math help does {child} get now, other than school?" One answer (D-325). Column children.math_help. */
export const MATH_HELPS = [
  { id: "school_only", label: "Only school" },
  { id: "parent", label: "A parent or family member" },
  { id: "tutor", label: "A tutor or learning centre" },
  { id: "app", label: "A math app or website" },
] as const;
export type MathHelp = (typeof MATH_HELPS)[number]["id"];

/** "How much time each week?" One answer. A book plans 15-30 minutes a day, 5 days a week: about 1 to 2.5 hours. */
export const WEEKLY_TIMES = [
  { id: "under_1h", label: "Under 1 hour" },
  { id: "1_to_2h", label: "1 to 2 hours" },
  { id: "2_to_3h", label: "2 to 3 hours" },
  { id: "over_3h", label: "More than 3 hours" },
] as const;
export type WeeklyTime = (typeof WEEKLY_TIMES)[number]["id"];

export const NOTE_MAX = 500;

export interface LearningAnswers {
  /** None, one or two. */
  styles: LearningStyle[];
  interests: Interest[];
  /** "What does {child} find hard in math?" (before #195: "Anything else we should know?"). Empty when not answered. */
  note: string;
  /** Null is no answer. */
  feeling: MathFeeling | null;
  goal: LearningGoal | null;
  weeklyTime: WeeklyTime | null;
}

/** The columns on public.children. Null is no answer. */
export interface LearningRow {
  learning_styles: string[] | null;
  interests: string[] | null;
  learning_note: string | null;
  math_feeling: string | null;
  learning_goal: string | null;
  weekly_time: string | null;
}

export const LEARNING_COLUMNS = "learning_styles, interests, learning_note, math_feeling, learning_goal, weekly_time";
export const LEARNING_ROUTE = "/api/account/learning";
/** The account page with the questions for one child. */
export const learningPath = (childId: string) => `/account/learning/${childId}`;

export interface LearningRequest extends LearningAnswers {
  child: string;
}
export type LearningError = "bad_json" | "signed_out" | "invalid" | "not_found" | "store_failed";
export type LearningResult = { ok: true } | { ok: false; error: LearningError };

const STYLE_IDS: readonly string[] = LEARNING_STYLES.map((s) => s.id);
const INTEREST_IDS: readonly string[] = INTERESTS.map((i) => i.id);
const FEELING_IDS: readonly string[] = MATH_FEELINGS.map((f) => f.id);
const GOAL_IDS: readonly string[] = LEARNING_GOALS.map((g) => g.id);
const TIME_IDS: readonly string[] = WEEKLY_TIMES.map((t) => t.id);

/** One known id, null for no answer, or undefined when the value is not one of the offered answers. */
function knownId<T extends string>(value: unknown, known: readonly string[]): T | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && known.includes(value) ? (value as T) : undefined;
}

/** A list of known ids with no repeats, or null. A missing list is no answer. */
function knownIds<T extends string>(value: unknown, known: readonly string[], max: number): T[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) return null;
  if (!value.every((v) => typeof v === "string" && known.includes(v))) return null;
  return new Set(value).size === value.length ? (value as T[]) : null;
}

/** The parent's answers from a request body, or null when anything is not one of the offered answers. */
export function parseLearning(body: unknown): LearningAnswers | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const styles = knownIds<LearningStyle>(b.styles, STYLE_IDS, STYLE_MAX);
  const interests = knownIds<Interest>(b.interests, INTEREST_IDS, INTEREST_IDS.length);
  if (!styles || !interests) return null;
  if (b.note !== undefined && b.note !== null && typeof b.note !== "string") return null;
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > NOTE_MAX) return null;
  const feeling = knownId<MathFeeling>(b.feeling, FEELING_IDS);
  const goal = knownId<LearningGoal>(b.goal, GOAL_IDS);
  const weeklyTime = knownId<WeeklyTime>(b.weeklyTime, TIME_IDS);
  if (feeling === undefined || goal === undefined || weeklyTime === undefined) return null;
  return { styles, interests, note, feeling, goal, weeklyTime };
}

/** The card's own columns. The feeling and the goal belong to the signup questions (D-325): the card never writes them. */
export function toRow(a: LearningAnswers): Omit<LearningRow, "math_feeling" | "learning_goal"> {
  return {
    learning_styles: a.styles.length ? a.styles : null,
    interests: a.interests.length ? a.interests : null,
    learning_note: a.note || null,
    weekly_time: a.weeklyTime,
  };
}

/** Whether the parent answered the learning card itself: the signup's feeling and goal do not count (D-325). */
export function cardAnswered(a: LearningAnswers | null): boolean {
  return !!a && (a.styles.length > 0 || a.interests.length > 0 || !!a.note || !!a.weeklyTime);
}

/** The stored answers, or null when the parent gave none (skipped, or never asked). */
export function fromRow(row: LearningRow): LearningAnswers | null {
  const a: LearningAnswers = {
    styles: (row.learning_styles ?? []).filter((s): s is LearningStyle => STYLE_IDS.includes(s)),
    interests: (row.interests ?? []).filter((i): i is Interest => INTEREST_IDS.includes(i)),
    note: row.learning_note ?? "",
    feeling: knownId<MathFeeling>(row.math_feeling, FEELING_IDS) ?? null,
    goal: knownId<LearningGoal>(row.learning_goal, GOAL_IDS) ?? null,
    weeklyTime: knownId<WeeklyTime>(row.weekly_time, TIME_IDS) ?? null,
  };
  return a.styles.length || a.interests.length || a.note || a.feeling || a.goal || a.weeklyTime ? a : null;
}

export const styleLabel = (id: LearningStyle) => LEARNING_STYLES.find((s) => s.id === id)?.label ?? id;
export const interestLabel = (id: Interest) => INTERESTS.find((i) => i.id === id)?.label ?? id;
export const feelingLabel = (id: MathFeeling) => MATH_FEELINGS.find((f) => f.id === id)?.label ?? id;
export const goalLabel = (id: LearningGoal) => LEARNING_GOALS.find((g) => g.id === id)?.label ?? id;
export const weeklyTimeLabel = (id: WeeklyTime) => WEEKLY_TIMES.find((t) => t.id === id)?.label ?? id;
export const helpLabel = (id: MathHelp) => MATH_HELPS.find((h) => h.id === id)?.label ?? id;

const NO_ANSWER = "No answer";

/**
 * The learning card's answers as label and value rows for the admin child page, in the card's order. The feeling and
 * the goal show with the parent goals (D-325, goalFacts in src/lib/child-goals.ts).
 */
export function answerFacts(a: LearningAnswers | null): [string, string][] {
  return [
    ["Learns best from", a?.styles.length ? a.styles.map(styleLabel).join("; ") : NO_ANSWER],
    ["Interests", a?.interests.length ? a.interests.map(interestLabel).join(", ") : NO_ANSWER],
    ["Finds hard in math", a?.note || "-"],
    ["Time each week", a?.weeklyTime ? weeklyTimeLabel(a.weeklyTime) : NO_ANSWER],
  ];
}

/**
 * What a book is made of. shares: the percent of the book's practice in each style (story problems, picture or array
 * versions, worked examples, hands-on drawing and counting); they add up to 100. settings: the interests the story
 * problems are set in; empty means a mix of everyday settings.
 */
export interface BookMix {
  shares: Record<LearningStyle, number>;
  settings: Interest[];
  /** No style was chosen: the default mix. */
  isDefault: boolean;
}

const evenShares = () => Object.fromEntries(STYLE_IDS.map((id) => [id, 100 / STYLE_IDS.length])) as Record<LearningStyle, number>;

export const DEFAULT_MIX: BookMix = { shares: evenShares(), settings: [], isDefault: true };

// One style leads with 55% and the other three keep 15% each; two styles share the lead with 40% each and the other
// two keep 10%. Every style stays in the book, so the child still practises each way of seeing a problem.
const LEAN: Record<number, { chosen: number; other: number }> = { 1: { chosen: 55, other: 15 }, 2: { chosen: 40, other: 10 } };

/** The book plan for a child: the stored answers, or the default mix when there are none. */
export function bookMix(a: LearningAnswers | null): BookMix {
  const settings = a?.interests ?? [];
  const lean = a ? LEAN[a.styles.length] : undefined;
  if (!a || !lean) return { ...DEFAULT_MIX, settings };
  const shares = Object.fromEntries(STYLE_IDS.map((id) => [id, a.styles.includes(id as LearningStyle) ? lean.chosen : lean.other])) as Record<LearningStyle, number>;
  return { shares, settings, isDefault: false };
}
