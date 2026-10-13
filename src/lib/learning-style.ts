// How a child likes to learn (#126): two or three questions the parent answers on the report, after the assessment and
// before payment, and later from the account. Stored on public.children. The book plan reads them through bookMix;
// a child with no answer gets the default mix. Shared by the form (client), the route and the admin pages (server).
// Never sent to analytics: no learning-style value travels with an event.
// The ids are also in the check constraints of supabase/migrations/20261012_add_learning_style.sql; change both.

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

export const NOTE_MAX = 500;

export interface LearningAnswers {
  /** None, one or two. */
  styles: LearningStyle[];
  interests: Interest[];
  /** "Anything else we should know?" Empty when not answered. */
  note: string;
}

/** The columns on public.children. Null is no answer. */
export interface LearningRow {
  learning_styles: string[] | null;
  interests: string[] | null;
  learning_note: string | null;
}

export const LEARNING_COLUMNS = "learning_styles, interests, learning_note";
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
  return { styles, interests, note };
}

export function toRow(a: LearningAnswers): LearningRow {
  return {
    learning_styles: a.styles.length ? a.styles : null,
    interests: a.interests.length ? a.interests : null,
    learning_note: a.note || null,
  };
}

/** The stored answers, or null when the parent gave none (skipped, or never asked). */
export function fromRow(row: LearningRow): LearningAnswers | null {
  const a: LearningAnswers = {
    styles: (row.learning_styles ?? []).filter((s): s is LearningStyle => STYLE_IDS.includes(s)),
    interests: (row.interests ?? []).filter((i): i is Interest => INTEREST_IDS.includes(i)),
    note: row.learning_note ?? "",
  };
  return a.styles.length || a.interests.length || a.note ? a : null;
}

export const styleLabel = (id: LearningStyle) => LEARNING_STYLES.find((s) => s.id === id)?.label ?? id;
export const interestLabel = (id: Interest) => INTERESTS.find((i) => i.id === id)?.label ?? id;

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
