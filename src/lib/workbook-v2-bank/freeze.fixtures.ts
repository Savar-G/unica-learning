// Synthetic full levels for the freeze tests: 20 invented topics of 10 invented sheets (200 sheets), built from the
// invented topic. Every sheet is a column-multiplication sheet with one row a side; one sheet is a sheet of word
// problems, so that the questions, scenarios and region packs travel through the freeze too. All content is invented.
import { TEMPLATES, type PageTemplate } from "@/lib/workbook-v2/layout/templates";
import { inventedDraft } from "@/lib/workbook-v2/testing/sample";
import { FULL_LEVEL } from "@/lib/workbook-v2/build/freeze-bank";
import { liveItems } from "./reviews";
import type { BankStore, SheetRow } from "./types";

type Rec = Record<string, unknown>;
const recs = (value: unknown) => value as Rec[];

/** The topic and the place in it of the sheet of word problems. */
export const STORY_AT = { topic: 2, sheet: 1 };
/** The topic and the place in it of the sheet whose back row allows only one attempt without a repeat. */
export const LOW_CAPACITY_AT = { topic: 3, sheet: 2 };
/** Limits of mul.column that allow 3 questions (14 x 2, 23 x 2, 33 x 2... see the test), so 2 places repeat on the next attempt. */
export const LOW_CAPACITY_LIMITS = {
  digits: { min: 2, max: 2 }, a: { min: 11, max: 13 }, b: { min: 2, max: 2 }, carries: { min: 0, max: 0 }, carryIntoTens: { min: 0, max: 0 },
  carryIntoHundreds: { min: 0, max: 0 }, carryIntoThousands: { min: 0, max: 0 }, product: { min: 10, max: 99 }, zeroInProduct: "never", wholeTens: "allowed",
};

export const sheetIdOf = (tag: string, topic: number, sheet: number) => `${tag}-t${topic}-s${sheet}`;

/** Templates with two places on each side: each place costs three drawings in the bank check. */
export const SMALL_TEMPLATES: ReadonlyMap<string, PageTemplate> = new Map([...TEMPLATES].map(([id, t]) => [id, {
  ...t, sides: { front: { ...t.sides.front, places: t.sides.front.places.slice(0, 2) }, back: { ...t.sides.back, places: t.sides.back.places.slice(0, 2) } },
}]));
/** The quickest freeze that still runs every check of a level once. */
export const QUICK_FREEZE = { seeds: 1, figureSamples: 0, templates: SMALL_TEMPLATES };

/**
 * A full level `synth-test-<tag>`: 20 topics of 10 sheets, with notes (basis) on the level, every topic and sheet, and
 * the rows, questions, scenarios and region packs of the invented draft. `topics` makes a level with fewer topics.
 */
export function fullLevelDraft(tag: string, { topics = FULL_LEVEL.topics }: { topics?: number } = {}): Rec {
  const base = inventedDraft();
  const [mul, , story] = recs(base.sheets);
  const oneRow = (side: Rec, items: number): Rec => ({ ...side, rows: [{ ...recs(side.rows)[0], items }] });
  const storySide = (side: Rec): Rec => {
    const row = recs(side.rows)[0];
    return { ...side, rows: [{ ...row, items: 1, limits: { questions: (row.limits as { questions: string[] }).questions.slice(0, 1) } }] };
  };
  const draftTopics: Rec[] = [];
  const sheets: Rec[] = [];
  for (let t = 1; t <= topics; t++) {
    const ids: string[] = [];
    for (let s = 1; s <= FULL_LEVEL.sheets; s++) {
      const id = sheetIdOf(tag, t, s);
      ids.push(id);
      const firstPage = 1 + 2 * ((t - 1) * FULL_LEVEL.sheets + (s - 1));
      const isStory = t === STORY_AT.topic && s === STORY_AT.sheet;
      const sheet: Rec = isStory
        ? { ...structuredClone(story), id, firstPage, front: storySide(story.front as Rec), back: storySide(story.back as Rec) }
        : { ...structuredClone(mul), id, firstPage, front: oneRow(mul.front as Rec, 2), back: oneRow(mul.back as Rec, 2), basis: { note: `Invented sheet ${t}.${s}.` } };
      if (t === LOW_CAPACITY_AT.topic && s === LOW_CAPACITY_AT.sheet) {
        const back = sheet.back as Rec;
        back.rows = [{ ...recs(back.rows)[0], id: "few-questions", limits: LOW_CAPACITY_LIMITS }];
      }
      sheets.push(sheet);
    }
    draftTopics.push({ id: `topic-${t}`, code: `3-${t}`, title: `Invented topic ${t}`, sheets: ids, basis: { note: `Invented topic ${t}.` } });
  }
  return { ...base, id: `synth-full-${tag}`, level: { id: `synth-test-${tag}`, name: "3" }, topics: draftTopics, sheets };
}

/** A made-up source, put in every place a draft may hold a note, so a test can look for it in the snapshot. */
export const SENTINEL = "made-up-source-b1f7: page 99 of an invented book";

/** The draft with the made-up source in the level, a topic, a sheet, a side, a row, a question, a scenario and a region pack. */
export function withSentinelNotes(draft: Rec): Rec {
  const copy = structuredClone(draft);
  const note = (one: Rec) => Object.assign(one, { basis: { source: SENTINEL } });
  note(copy);
  for (const topic of recs(copy.topics)) note(topic);
  for (const sheet of recs(copy.sheets)) {
    note(sheet);
    for (const side of [sheet.front, sheet.back] as Rec[]) {
      note(side);
      for (const row of recs(side.rows)) note(row);
    }
  }
  for (const list of ["questions", "scenarios", "regionPacks"]) for (const one of recs(copy[list])) note(one);
  return copy;
}

/** Approves the current revision of every item of the level that is not retired. */
export async function approveAll(store: BankStore, levelId: string, reviewer = "Test reviewer"): Promise<number> {
  const items = liveItems(await store.readLevel(levelId));
  // The store directly: reviewItem reads the whole level for each review, and its rules have tests of their own.
  for (const item of items) await store.addReview({ level_id: levelId, item_kind: item.kind, item_key: item.key, revision: item.revision, reviewer, decision: "approved", comment: null });
  return items.length;
}

/** Changes one sheet of the working copy directly (as an admin edit would, with no draft checks), as a new revision. */
export async function editSheet(store: BankStore, levelId: string, sheetId: string, change: (content: Rec) => void): Promise<void> {
  const rows = await store.readLevel(levelId);
  const sheet = rows.sheets.find((s) => s.sheet_id === sheetId);
  if (!rows.level || !sheet) throw new Error(`no sheet ${sheetId}`);
  const content = structuredClone(sheet.content) as Rec;
  change(content);
  const written = await store.writeLevel({
    expected: rows.version, level: rows.level, topics: [], questions: [], scenarios: [], regionPacks: [],
    sheets: [{ ...sheet, content: content as SheetRow["content"], revision: sheet.revision + 1, status: "draft" }],
  });
  if (!written.ok) throw new Error(written.problem);
}
