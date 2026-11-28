// The result of one attempt of a sheet, from the first try of each of its questions. Pure: the items, the marks and the
// mastery percent decide it. The mastery percent is data (90 or 80, say), never a branch on a level.

/** The first try of a question. A blank counts as wrong. A question with no mark is unmarked. */
export const FIRST_TRIES = ["right", "wrong", "blank"] as const;
export type FirstTry = (typeof FIRST_TRIES)[number];

/** The mark of one question. A correction is kept for the parent and never changes the first try. */
export interface ItemMark { itemId: string; firstTry: FirstTry; correction?: FirstTry }

export interface ResultConfig {
  /** The share of right first tries that masters a sheet, a whole number from 1 to 100. */
  masteryPercent: number;
}

/** "unknown" is a sheet with too few marks to say: less than MARKED_ENOUGH percent of its questions, and no proven fail. */
export const SHEET_RESULTS = ["mastered", "repeat", "unknown"] as const;
export type SheetResultKind = (typeof SHEET_RESULTS)[number];

/** The share of questions, in percent, that must have a mark before a sheet without a proven fail has a result. */
export const MARKED_ENOUGH = 80;

export interface SheetResult {
  ok: true;
  result: SheetResultKind;
  total: number;
  /** The questions with a first try: right, wrong or blank. */
  itemsScored: number;
  right: number;
  /** Wrong and blank first tries. */
  mistakes: number;
  /** The most mistakes that a sheet may have and still be mastered. */
  maxMistakes: number;
}

export type SheetResultOutcome = SheetResult | { ok: false; problems: string[] };

const isPercent = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 1 && n <= 100;

/** What is wrong with the input, each problem one time. */
function problemsOf(itemIds: readonly string[], marks: readonly ItemMark[], config: ResultConfig): string[] {
  const problems: string[] = [];
  if (itemIds.length === 0) problems.push("A sheet with no questions has no result.");
  if (!isPercent(config.masteryPercent)) problems.push(`The mastery percent must be a whole number from 1 to 100, not ${JSON.stringify(config.masteryPercent)}.`);
  const known = new Set<string>();
  for (const id of itemIds) {
    if (known.has(id)) problems.push(`The question "${id}" is on the sheet more than once.`);
    known.add(id);
  }
  const marked = new Set<string>();
  for (const { itemId, firstTry, correction } of marks) {
    if (!known.has(itemId)) problems.push(`The mark of "${itemId}" is for no question of the sheet.`);
    if (marked.has(itemId)) problems.push(`The question "${itemId}" has more than one mark.`);
    if (!FIRST_TRIES.includes(firstTry)) problems.push(`The first try of "${itemId}" must be right, wrong or blank.`);
    if (correction !== undefined && !FIRST_TRIES.includes(correction)) problems.push(`The correction of "${itemId}" must be right, wrong or blank.`);
    marked.add(itemId);
  }
  return problems;
}

/**
 * The result of a sheet. A proven fail comes first: more mistakes than `maxMistakes` is "repeat", whatever is unmarked.
 * Else a sheet with less than MARKED_ENOUGH percent marked is "unknown". Else it is "mastered" when the right first tries
 * are at least the mastery percent of the marked ones, and "repeat" when not.
 */
export function sheetResult(items: readonly { id: string }[], marks: readonly ItemMark[], config: ResultConfig): SheetResultOutcome {
  const itemIds = items.map((item) => item.id);
  const problems = problemsOf(itemIds, marks, config);
  if (problems.length > 0) return { ok: false, problems };
  const total = itemIds.length;
  const right = marks.filter((m) => m.firstTry === "right").length;
  const itemsScored = marks.length;
  const mistakes = itemsScored - right;
  const maxMistakes = total - Math.ceil((total * config.masteryPercent) / 100);
  const result: SheetResultKind = mistakes > maxMistakes ? "repeat"
    : itemsScored * 100 < total * MARKED_ENOUGH ? "unknown"
      : right * 100 >= itemsScored * config.masteryPercent ? "mastered" : "repeat";
  return { ok: true, result, total, itemsScored, right, mistakes, maxMistakes };
}

/** A printed question of a book, with the sheet and the attempt it is on. Its id is unique in the book. */
export interface ResultItem { id: string; sheetId: string; attempt: number }

/** The result of one attempt of a sheet. */
export interface SheetAttemptResult extends SheetResult { sheetId: string; attempt: number }

export type SheetResultsOutcome = { ok: true; sheets: SheetAttemptResult[] } | { ok: false; problems: string[] };

/**
 * The result of each sheet attempt that `items` hold, in the order of their first question. Each mark goes to the
 * attempt of its question, and `sheetResult` decides each attempt with the mastery percent of `config` (the config of
 * the level: the percent is data, never a branch). A mark of no question is a problem.
 */
export function sheetResults(marks: readonly ItemMark[], items: readonly ResultItem[], config: ResultConfig): SheetResultsOutcome {
  const problems: string[] = [];
  const groups = new Map<string, { sheetId: string; attempt: number; items: { id: string }[]; marks: ItemMark[] }>();
  const groupOf = new Map<string, string>();
  for (const item of items) {
    const key = `${item.sheetId}\u0000${item.attempt}`;
    const group = groups.get(key) ?? { sheetId: item.sheetId, attempt: item.attempt, items: [], marks: [] };
    groups.set(key, group);
    group.items.push({ id: item.id });
    if (groupOf.has(item.id) && groupOf.get(item.id) !== key) problems.push(`The question "${item.id}" is on more than one sheet.`);
    groupOf.set(item.id, key);
  }
  for (const mark of marks) {
    const key = groupOf.get(mark.itemId);
    if (key === undefined) problems.push(`The mark of "${mark.itemId}" is for no question of the book.`);
    else groups.get(key)?.marks.push(mark);
  }
  const sheets: SheetAttemptResult[] = [];
  for (const { sheetId, attempt, items: own, marks: marked } of groups.values()) {
    const outcome = sheetResult(own, marked, config);
    if (outcome.ok) sheets.push({ sheetId, attempt, ...outcome });
    else problems.push(...outcome.problems.map((p) => `The sheet "${sheetId}", attempt ${attempt}: ${p}`));
  }
  return problems.length > 0 ? { ok: false, problems: [...new Set(problems)] } : { ok: true, sheets };
}
