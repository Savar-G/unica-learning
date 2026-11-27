// A draft of a level and the rows of the working copy, both ways. A draft is a snapshot file in which the level, a topic,
// a sheet, a side, a row, a question, a scenario and a region pack may hold `basis` (docs/workbook-v2-engine.md, "The
// freeze"). Every note goes to a `basis` column; no note stays in `content`. Reading the rows back gives the draft again,
// field for field.
import type { Json } from "@/lib/database";
import { plainCopy } from "@/lib/workbook-v2/bank/plain";
import { validateSnapshot } from "@/lib/workbook-v2/bank/snapshot";
import { BASIS, contentOf, misplacedNotes } from "@/lib/workbook-v2/build/freeze-bank";
import { STORY_SHAPE_ID } from "@/lib/workbook-v2/shapes/story";
import type { BankSheetKind, JsonObject, LevelRow, LevelRows, QuestionRow, RegionPackRow, ScenarioRow, SheetBasis, SheetRow, TopicRow } from "./types";

type Rec = Record<string, unknown>;
type Fresh<T> = Omit<T, "revision" | "status">;

/**
 * The fields that a draft does not hold: the admin tool keeps them. A new row starts with these values; an import never
 * changes them on a row that is there.
 */
export const KEPT_FIELDS = {
  topics: { child_title: null, standards_tags: [] as string[] },
  scenarios: { level_band: null },
  regionPacks: { clock_format: null, date_format: null, grade_names: null },
} as const;
type Kept<T, K extends keyof typeof KEPT_FIELDS> = Omit<T, keyof (typeof KEPT_FIELDS)[K]>;

/** The rows that a draft becomes, before the import gives each its revision and status. */
export interface DraftRows {
  level: Omit<LevelRow, "status">;
  topics: Kept<Omit<TopicRow, "status">, "topics">[];
  sheets: Fresh<SheetRow>[];
  questions: Fresh<QuestionRow>[];
  scenarios: Kept<Fresh<ScenarioRow>, "scenarios">[];
  regionPacks: Kept<Fresh<RegionPackRow>, "regionPacks">[];
}

export type DraftCheck = { ok: true; draft: Rec; rows: DraftRows } | { ok: false; problems: string[] };

const SIDES = ["front", "back"] as const;
const MAX_WALK_DEPTH = 32;
const SLUG_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REGION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const isRec = (value: unknown): value is Rec => typeof value === "object" && value !== null && !Array.isArray(value);
const recs = (value: unknown): Rec[] => (Array.isArray(value) ? value.filter(isRec) : []);
const charLen = (text: string): number => [...text].length;
/** Validated plain data, read as the JSON it is. */
const json = (value: unknown): Json => value as Json;
const object = (value: unknown): JsonObject => value as JsonObject;
const without = (value: Rec, ...keys: string[]): Rec => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const noteOf = (value: Rec): JsonObject | null => (Object.hasOwn(value, BASIS) ? object(value[BASIS]) : null);
const ownNote = (map: object | undefined, key: string): JsonObject | undefined =>
  (map && Object.hasOwn(map, key) ? (map as Record<string, JsonObject | undefined>)[key] : undefined);
const withNote = (value: Rec, note: JsonObject | null | undefined): Rec => (note ? { ...value, [BASIS]: note } : value);

/** Checks raw input for values PostgreSQL jsonb/text or strict readback rejects: `-0`, NUL (`\u0000`), and unpaired UTF-16 surrogates. */
function encodingProblems(raw: unknown): string[] {
  const problems: string[] = [];
  const checkString = (text: string, place: string) => {
    if (text.includes("\u0000")) problems.push(`${place} contains a NUL character, which PostgreSQL rejects.`);
    if (!text.isWellFormed()) problems.push(`${place} contains an unpaired UTF-16 surrogate, which PostgreSQL jsonb rejects.`);
  };
  const walk = (value: unknown, place: string, inside: readonly object[]) => {
    if (typeof value === "number" && Object.is(value, -0)) {
      problems.push(`${place} holds negative zero (-0), which JSON does not preserve.`);
      return;
    }
    if (typeof value === "string") {
      checkString(value, place);
      return;
    }
    if (!value || typeof value !== "object" || inside.includes(value) || inside.length >= MAX_WALK_DEPTH) return;
    const next = [...inside, value];
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${place}[${i}]`, next));
      return;
    }
    for (const key of Object.keys(value)) {
      checkString(key, `${place} key ${JSON.stringify(key)}`);
      walk((value as Rec)[key], `${place}.${key}`, next);
    }
  };
  walk(raw, "The draft", []);
  return problems;
}

/** Validates PostgreSQL column length and identifier constraints before any store call. */
function columnProblems(draft: Rec): string[] {
  const problems: string[] = [];
  const checkPattern = (value: unknown, pattern: RegExp, label: string) => {
    if (typeof value !== "string" || !pattern.test(value)) problems.push(`${label} ${JSON.stringify(value)} does not match the database identifier constraint.`);
  };
  const checkLen = (value: unknown, min: number, max: number, label: string) => {
    if (typeof value !== "string") return;
    const len = charLen(value);
    if (len < min || len > max) problems.push(`${label} must be ${min} to ${max} characters long (got ${len}).`);
  };
  const level = draft.level as Rec;
  checkPattern(level.id, SLUG_ID, "level.id");
  checkLen(level.name, 1, 8, "level.name");
  const levelPos = Number(level.name);
  if (!Number.isSafeInteger(levelPos) || levelPos < 0) problems.push(`level.name ${JSON.stringify(level.name)} must be a non-negative integer position.`);
  if (typeof draft.defaultRegion === "string") checkPattern(draft.defaultRegion, REGION_ID, "defaultRegion");
  recs(draft.topics).forEach((t, i) => {
    checkPattern(t.id, SLUG_ID, `topics[${i}].id`);
    checkLen(t.code, 1, 8, `topics[${i}].code`);
    checkLen(t.title, 1, 200, `topics[${i}].title`);
  });
  recs(draft.sheets).forEach((s, i) => {
    checkPattern(s.id, SLUG_ID, `sheets[${i}].id`);
  });
  recs(draft.questions).forEach((q, i) => {
    checkPattern(q.id, SLUG_ID, `questions[${i}].id`);
    checkLen(q.scenarioKind, 1, 64, `questions[${i}].scenarioKind`);
    checkLen(q.unit, 1, 80, `questions[${i}].unit`);
  });
  recs(draft.scenarios).forEach((s, i) => {
    checkPattern(s.id, SLUG_ID, `scenarios[${i}].id`);
    checkLen(s.interest, 1, 64, `scenarios[${i}].interest`);
    checkLen(s.kind, 1, 64, `scenarios[${i}].kind`);
  });
  recs(draft.regionPacks).forEach((p, i) => {
    checkPattern(p.id, REGION_ID, `regionPacks[${i}].id`);
  });
  return problems;
}

/** Each place that holds a note that is not an object: a note is a record about a source. */
function notesThatAreNotObjects(draft: Rec): string[] {
  const places: string[] = [];
  const look = (value: unknown, place: string) => {
    if (isRec(value) && Object.hasOwn(value, BASIS) && !isRec(value[BASIS])) places.push(place);
  };
  look(draft, "the level");
  for (const list of ["topics", "questions", "scenarios", "regionPacks"]) recs(draft[list]).forEach((one, i) => look(one, `${list}[${i}]`));
  recs(draft.sheets).forEach((sheet, i) => {
    look(sheet, `sheets[${i}]`);
    for (const side of SIDES) {
      look(sheet[side], `sheets[${i}].${side}`);
      if (isRec(sheet[side])) recs(sheet[side].rows).forEach((row, j) => look(row, `sheets[${i}].${side}.rows[${j}]`));
    }
  });
  return places.map((place) => `The draft has a note "${BASIS}" at ${place} that is not an object.`);
}

/** The sheets must be listed in the order of the topics, so the rows give the same list back. */
function orderProblems(draft: Rec): string[] {
  const inTopicOrder = recs(draft.topics).flatMap((topic) => (Array.isArray(topic.sheets) ? topic.sheets : []));
  const listed = recs(draft.sheets).map((sheet) => sheet.id);
  const same = inTopicOrder.length === listed.length && inTopicOrder.every((id, i) => id === listed[i]);
  return same ? [] : ["The draft lists its sheets in another order than its topics do: list them topic by topic, in the order of each topic."];
}

const kindOf = (sheet: Rec): BankSheetKind =>
  SIDES.some((side) => isRec(sheet[side]) && recs(sheet[side].rows).some((row) => row.shape === STORY_SHAPE_ID)) ? "word" : "practice";

function sheetRow(levelId: string, topic: Rec, position: number, sheet: Rec): Fresh<SheetRow> {
  const basis: SheetBasis = {};
  const sheetNote = noteOf(sheet);
  if (sheetNote) basis.sheet = sheetNote;
  const content: Rec = {};
  for (const side of SIDES) {
    const raw = sheet[side] as Rec;
    const sideNote = noteOf(raw);
    if (sideNote) basis[side] = sideNote;
    const rows = recs(raw.rows).map((row) => {
      const rowNote = noteOf(row);
      if (rowNote) basis.rows = { ...basis.rows, [String(row.id)]: rowNote };
      return without(row, BASIS);
    });
    content[side] = { ...without(raw, BASIS), rows };
  }
  return {
    sheet_id: String(sheet.id), level_id: levelId, topic_id: String(topic.id), position, first_page: Number(sheet.firstPage),
    kind: kindOf(sheet), content: object(content), basis,
  };
}

/** The rows of a valid draft. */
function rowsOf(draft: Rec): DraftRows {
  const level = draft.level as Rec;
  const levelId = String(level.id);
  const topics = recs(draft.topics);
  const sheetsById = new Map(recs(draft.sheets).map((sheet) => [sheet.id, sheet]));
  return {
    level: {
      id: levelId, display_name: String(level.name), position: Number(level.name),
      config: { draft: { id: json(draft.id), format: json(draft.format) } }, basis: noteOf(draft),
      default_region: typeof draft.defaultRegion === "string" ? draft.defaultRegion : null,
    },
    topics: topics.map((topic, position) => ({
      level_id: levelId, id: String(topic.id), code: String(topic.code), position, title: String(topic.title), basis: noteOf(topic),
    })),
    sheets: topics.flatMap((topic) => (topic.sheets as string[]).map((id, position) => sheetRow(levelId, topic, position, sheetsById.get(id) as Rec))),
    questions: recs(draft.questions).map((q, position) => ({
      level_id: levelId, id: String(q.id), position, scenario_kind: String(q.scenarioKind), regions: Array.isArray(q.regions) ? q.regions.map(String) : null,
      slots: object(q.slots), unit: String(q.unit), solver: json(q.solver), difficulty: Number(q.difficulty), phrasings: q.phrasings as Json[], basis: noteOf(q),
    })),
    scenarios: recs(draft.scenarios).map((s, position) => ({
      level_id: levelId, id: String(s.id), position, interest: String(s.interest), kind: String(s.kind),
      content: object(without(s, "id", "interest", "kind", BASIS)), basis: noteOf(s),
    })),
    regionPacks: recs(draft.regionPacks).map((p, position) => ({
      level_id: levelId, id: String(p.id), position, units: object(p.units), coins: object(p.coins), spelling: object(p.spelling), basis: noteOf(p),
    })),
  };
}

/**
 * Checks a draft before anything is written: a plain copy, notes only where a draft may have them (each an object), a
 * valid snapshot once the notes are removed, and sheets in the order of their topics. The input is never changed.
 */
export function checkDraft(given: unknown): DraftCheck {
  if (!isRec(given)) return { ok: false, problems: ["The draft must be an object."] };
  const plain = plainCopy("The draft", given);
  if (!plain.ok) return plain;
  const encoding = encodingProblems(given);
  if (encoding.length > 0) return { ok: false, problems: encoding };
  const draft = plain.value as Rec;
  const content = contentOf(draft);
  const misplaced = misplacedNotes(content);
  if (misplaced.length > 0) return { ok: false, problems: misplaced };
  const snapshot = validateSnapshot(content);
  if (!snapshot.ok) return snapshot;
  const problems = [...notesThatAreNotObjects(draft), ...orderProblems(draft), ...columnProblems(draft)];
  return problems.length > 0 ? { ok: false, problems } : { ok: true, draft, rows: rowsOf(draft) };
}

const byPosition = <T extends { position: number }>(rows: readonly T[]): T[] => [...rows].sort((a, b) => a.position - b.position);
const live = <T extends { status: string }>(rows: readonly T[]): T[] => rows.filter((row) => row.status !== "retired");

function sheetOf(row: SheetRow): Rec {
  const content = row.content as Rec;
  const side = (name: (typeof SIDES)[number]) => {
    const raw = content[name] as Rec;
    const rows = recs(raw.rows).map((one) => withNote(one, ownNote(row.basis.rows, String(one.id))));
    return withNote({ ...raw, rows }, ownNote(row.basis, name));
  };
  return withNote({ id: row.sheet_id, firstPage: row.first_page, front: side("front"), back: side("back") }, ownNote(row.basis, "sheet"));
}

/** The draft that the rows of a level hold, from the rows that are not retired; null when there is no level. */
export function draftFromRows(rows: LevelRows): Rec | null {
  const { level } = rows;
  if (!level) return null;
  const topics = byPosition(live(rows.topics));
  const sheets = live(rows.sheets);
  const sheetsOf = (topicId: string) => byPosition(sheets.filter((sheet) => sheet.topic_id === topicId));
  const draft = level.config.draft as Rec | undefined;
  const stories = level.default_region === null ? {} : {
    defaultRegion: level.default_region,
    regionPacks: byPosition(live(rows.regionPacks)).map((p) => withNote({ id: p.id, units: p.units, coins: p.coins, spelling: p.spelling }, p.basis)),
    scenarios: byPosition(live(rows.scenarios)).map((s) => withNote({ id: s.id, interest: s.interest, kind: s.kind, ...s.content }, s.basis)),
    questions: byPosition(live(rows.questions)).map((q) => withNote({
      id: q.id, scenarioKind: q.scenario_kind, ...(q.regions === null ? {} : { regions: q.regions }), slots: q.slots, unit: q.unit, solver: q.solver,
      difficulty: q.difficulty, phrasings: q.phrasings,
    }, q.basis)),
  };
  return withNote({
    format: draft?.format, id: draft?.id, level: { id: level.id, name: level.display_name }, ...stories,
    topics: topics.map((topic) => withNote({ id: topic.id, code: topic.code, title: topic.title, sheets: sheetsOf(topic.id).map((sheet) => sheet.sheet_id) }, topic.basis)),
    sheets: topics.flatMap((topic) => sheetsOf(topic.id).map(sheetOf)),
  }, level.basis);
}
