// The freeze of a level from the working copy (UNI-242): approvals bound to one revision, display codes from positions,
// the checks of a full level, insert-only items with content only, and a book built from the stored snapshot that is
// byte for byte the book of the frozen file. One contract runs on the memory store and on the Supabase store over a fake
// PostgREST (with its 1,000-row cap). The live tables are probed in a rolled-back transaction (docs/workbook-v2-bank.md).
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBook, type BuildResult } from "@/lib/workbook-v2/build/build-book";
import { canonicalJson } from "@/lib/workbook-v2/hash";
import { openRenderer } from "@/lib/workbook-v2/render/typst";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { testAssets } from "@/lib/workbook-v2/testing/typst";
import { freezeLevel, snapshotName } from "./freeze-level";
import { approveAll, editSheet, fullLevelDraft, LOW_CAPACITY_AT, QUICK_FREEZE, SENTINEL, sheetIdOf, STORY_AT, withSentinelNotes } from "./freeze.fixtures";
import { importDraft } from "./import-draft";
import { memoryBankStore } from "./memory-store";
import { approvalProblems, reviewItem } from "./reviews";
import type { MemoryBankTables } from "./memory-store";
import { displayCode, frontPage, frozenItems, frozenSnapshot, hashOf, manifestHash, snapshotItems, withDisplayCodes } from "./snapshot-items";
import { readBookSnapshot, readSnapshot } from "./snapshot-read";
import { fakeBankSupabase, withExtraQuestions } from "./store.fixtures";
import { supabaseBankStore } from "./supabase-store";
import type { BankStore, LevelRows, SnapshotItemKind, SnapshotItemRow, SnapshotWrite } from "./types";

type Rec = Record<string, unknown>;
const recs = (value: unknown) => value as Rec[];
let tags = 0;
const freshTag = () => `fz${Date.now().toString(36)}${++tags}`;
const levelOf = (draft: Rec) => String((draft.level as Rec).id);

/** The pinned Typst when it is installed (always in the engine CI job), else the fake renderer that draws the model. */
let typst: Promise<Renderer> | null = null;
function bookRenderer(): Promise<Renderer> {
  const required = process.env.WORKBOOK_V2_REQUIRE_TYPST === "1";
  if (!existsSync(testAssets().program)) {
    if (required) throw new Error("Pinned Typst is required (run npm run typst:install).");
    console.warn('Built with the fake renderer: run "npm run typst:install" to compare the Typst PDF and page images.');
    return Promise.resolve(fakeRenderer());
  }
  return (typst ??= openRenderer(testAssets()));
}

const bookRequest = (tag: string) => ({
  bookId: `book-${tag}`, childId: "invented-child",
  sheets: [[1, 1], [STORY_AT.topic, STORY_AT.sheet]].map(([t, s]) => ({
    sheetId: sheetIdOf(tag, t, s), attempt: 1, startsDay: true, qr: { front: `invented-${t}-${s}-front`, back: `invented-${t}-${s}-back` },
  })),
});

function built(result: BuildResult) {
  if (result.status !== "built") throw new Error(result.problems.join("\n"));
  return result;
}

/** Imports a full level with notes everywhere, and approves every item. */
async function importedLevel(store: BankStore, tag: string, options?: { topics?: number }): Promise<Rec> {
  const draft = withSentinelNotes(fullLevelDraft(tag, options));
  const imported = await importDraft(draft, store);
  if (!imported.ok) throw new Error(imported.problems.join("\n"));
  await approveAll(store, levelOf(draft));
  return draft;
}

/** A snapshot write of exactly the items that the rows give, with true hashes. */
function writeOf(rows: LevelRows, version: number, name = snapshotName(String(rows.level?.id), version)): SnapshotWrite {
  const snapshot = frozenSnapshot(rows, name);
  const items = frozenItems(rows, name);
  if (!snapshot || !items || !rows.level) throw new Error("no level");
  return {
    levelId: rows.level.id, expected: String(rows.version), version, name, frozenBy: "Test admin", minEngineVersion: "test",
    contentHash: hashOf(snapshot), manifestHash: manifestHash(items), items,
  };
}

/** The write with one item changed (and its hash made true again, so only the content check can refuse it). */
function tampered(write: SnapshotWrite, kind: SnapshotItemKind, change: (item: SnapshotItemRow) => SnapshotItemRow): SnapshotWrite {
  let done = false;
  const items = write.items.map((item) => {
    if (done || item.kind !== kind) return item;
    done = true;
    const changed = change(structuredClone(item));
    return { ...changed, hash: hashOf(changed.content) };
  });
  return { ...write, items };
}

interface ContractStore { store: BankStore; tables: MemoryBankTables; calls?: string[] }

function runFreezeContract(name: string, makeStore: () => ContractStore) {
  describe(`a freeze on the ${name} store`, () => {
    it("refuses until each edited item is approved at its new revision, then freezes content only and builds the same book from the stored snapshot", async () => {
      const { store } = makeStore();
      const tag = freshTag();
      const draft = await importedLevel(store, tag);
      const levelId = levelOf(draft);

      // An edit makes revision 2 of a sheet and a question; the approvals of revision 1 do not count for them.
      const edited = structuredClone(draft);
      const sheet = recs(edited.sheets)[0];
      (sheet.front as Rec).instruction = "Multiply. Begin with the ones.";
      recs(edited.questions)[0].difficulty = 2;
      expect(await importDraft(edited, store)).toMatchObject({ ok: true, counts: { changed: 2 } });
      const renderer = fakeRenderer();
      const refused = await freezeLevel(store, levelId, { renderer, frozenBy: "Test admin", checks: QUICK_FREEZE });
      const question = String(recs(edited.questions)[0].id);
      expect(refused).toEqual({ ok: false, problems: [
        `Sheet "${String(sheet.id)}" was approved at revision 1 and changed to revision 2 since: approve revision 2.`,
        `Question "${question}" was approved at revision 1 and changed to revision 2 since: approve revision 2.`,
      ] });
      expect(renderer.drawn.render).toEqual([]);
      expect(await store.readSnapshots(levelId)).toEqual([]);

      const review = (kind: "sheet" | "question", key: string) => reviewItem(store, { level_id: levelId, item_kind: kind, item_key: key, revision: 2, reviewer: "Test reviewer", decision: "approved", comment: "Checked again." });
      expect(await review("sheet", String(sheet.id))).toMatchObject({ ok: true });
      expect(await review("question", question)).toMatchObject({ ok: true });
      const frozen = await freezeLevel(store, levelId, { renderer, frozenBy: "Test admin", checks: QUICK_FREEZE });
      if (!frozen.ok) throw new Error(frozen.problems.join("\n"));
      expect(frozen).toMatchObject({ version: 1, name: snapshotName(levelId, 1) });

      // Display codes from positions: the 11th topic is "3-11", and its 3rd sheet starts on page 205.
      const topics = recs(frozen.snapshot.topics);
      expect(topics.map((t) => t.code)).toEqual(Array.from({ length: 20 }, (_, i) => `3-${i + 1}`));
      expect(recs(frozen.snapshot.sheets).find((s) => s.id === sheetIdOf(tag, 11, 3))?.firstPage).toBe(205);
      expect(recs(frozen.snapshot.sheets).map((s) => s.firstPage)).toEqual(Array.from({ length: 200 }, (_, i) => 2 * i + 1));
      // The capacity report warns of the row with less than one full unseen repeat.
      expect(frozen.warnings).toContain(`Sheet "${sheetIdOf(tag, LOW_CAPACITY_AT.topic, LOW_CAPACITY_AT.sheet)}", back side, row "few-questions": its limits allow 3 questions for 2 places, so the next attempt of the sheet repeats questions of this row.`);
      expect(frozen.capacity).toHaveLength(200);

      // No note and no word of a note in any stored item, nor in the snapshot.
      const items = await store.readSnapshotItems(frozen.snapshotId);
      expect(items).toHaveLength(1 + 20 + 200 + recs(draft.questions).length + recs(draft.scenarios).length + recs(draft.regionPacks).length);
      for (const item of items) {
        expect(JSON.stringify(item)).not.toContain('"basis"');
        expect(JSON.stringify(item)).not.toContain(SENTINEL);
      }
      expect(JSON.stringify(frozen.snapshot)).not.toContain('"basis"');
      expect(JSON.stringify(frozen.snapshot)).not.toContain(SENTINEL);

      // The whole snapshot and one book's part come back from the store.
      const whole = await readSnapshot(store, frozen.snapshotId);
      if (!whole.ok) throw new Error(whole.problem);
      expect(canonicalJson(whole.snapshot)).toBe(canonicalJson(frozen.snapshot));
      expect(whole.hash).toBe(frozen.hash);
      const request = bookRequest(tag);
      const part = await readBookSnapshot(store, frozen.snapshotId, request.sheets.map((s) => s.sheetId));
      if (!part.ok) throw new Error(part.problem);
      expect(recs(part.snapshot.sheets).map((s) => s.id)).toEqual(request.sheets.map((s) => s.sheetId));

      const drawer = await bookRenderer();
      const fromFile = built(await buildBook({ snapshot: structuredClone(frozen.snapshot), book: request }, drawer));
      const fromStore = built(await buildBook({ snapshot: whole.snapshot, book: request }, drawer));
      const fromBookRows = built(await buildBook({ snapshot: part.snapshot, book: request, whole: part.whole }, drawer));
      expect(fromStore.record).toEqual(fromFile.record);
      // The book built from one book's rows records the whole snapshot: the same snapshot hash and input hash.
      expect(fromBookRows.record).toEqual(fromFile.record);
      expect(fromFile.record.snapshot.hash).toBe(frozen.hash);
      expect(part.hash).toBe(fromFile.record.snapshot.hash);
      for (const other of [fromStore, fromBookRows]) {
        expect(Buffer.from(other.pdf).equals(Buffer.from(fromFile.pdf))).toBe(true);
        expect(other.pages).toHaveLength(fromFile.pages.length);
        other.pages.forEach((page, i) => expect(Buffer.from(page.image).equals(Buffer.from(fromFile.pages[i].image))).toBe(true));
      }

      // A second write of the same version, or one made from a stale read, is refused and writes nothing.
      const write = { levelId, version: 1, name: "other-name-v1", frozenBy: "Test admin", minEngineVersion: "x", contentHash: frozen.hash, manifestHash: frozen.manifestHash, items };
      const rows = await store.readLevel(levelId);
      expect(await store.writeSnapshot({ ...write, expected: String(rows.version) })).toMatchObject({ ok: false, problem: expect.stringContaining("version 1 is taken") });
      expect(await store.writeSnapshot({ ...write, version: 2, expected: "2000-01-01T00:00:00+00:00" })).toMatchObject({ ok: false, problem: expect.stringContaining("changed since it was read") });
      expect(await store.readSnapshots(levelId)).toHaveLength(1);
    }, 120_000);

    it("never lets an approval or a snapshot cover content that was not reviewed", async () => {
      const { store, tables } = makeStore();
      const draft = await importedLevel(store, freshTag(), { topics: 1 });
      const levelId = levelOf(draft);
      let rows = await store.readLevel(levelId);
      if (!rows.level) throw new Error("no level");
      const [sheet] = [...rows.sheets].sort((a, b) => a.position - b.position);
      const changed = structuredClone(sheet.content) as Rec;
      (changed.front as Rec).instruction = "Changed after the approval.";
      const edit = (sheets: typeof rows.sheets) => store.writeLevel({ expected: rows.version, level: rows.level!, topics: [], questions: [], scenarios: [], regionPacks: [], sheets });

      // An edit that keeps its revision, or takes a lower one, is refused; a change of state alone is not.
      expect(await edit([{ ...sheet, content: changed as typeof sheet.content }])).toMatchObject({ ok: false, problem: expect.stringContaining("an edit needs a new revision") });
      expect(await edit([{ ...sheet, revision: 0 }])).toMatchObject({ ok: false, problem: expect.stringContaining("would go back from revision 1 to 0") });
      // A review of a revision the item is not at is refused by the store too, not only by reviewItem.
      const future = { level_id: levelId, item_kind: "sheet" as const, item_key: sheet.sheet_id, revision: 2, reviewer: "Test reviewer", decision: "approved" as const, comment: null };
      expect(await store.addReview(future)).toMatchObject({ ok: false, problem: expect.stringContaining("is not a live item at revision 2") });
      expect((await store.readReviews(levelId)).some((r) => r.revision === 2)).toBe(false);

      // A snapshot write must be the approved working copy, item for item: sheets, word problems, topics and the header.
      rows = await store.readLevel(levelId);
      const write = writeOf(rows, 1);
      const other = write.items.filter((item) => item.kind === "sheet")[1];
      const swapped: [SnapshotItemKind, (item: SnapshotItemRow) => SnapshotItemRow][] = [
        ["sheet", (item) => ({ ...item, content: { ...other.content, id: item.key } })],
        ["question", (item) => ({ ...item, content: { ...item.content, difficulty: 9 } })],
        ["scenario", (item) => ({ ...item, content: { ...item.content, place: "a changed place" } })],
        ["region_pack", (item) => ({ ...item, content: { ...item.content, spelling: {} } })],
        ["topic", (item) => ({ ...item, content: { ...item.content, title: "A changed title" } })],
        ["level", (item) => ({ ...item, content: { ...item.content, level: { id: levelId, name: "4" } } })],
        ["sheet", (item) => ({ ...item, position: item.position + 1 })],
      ];
      for (const [kind, change] of swapped) {
        expect(await store.writeSnapshot(tampered(write, kind, change))).toMatchObject({ ok: false, problem: expect.stringContaining("is not the approved working copy") });
      }
      expect(await store.readSnapshots(levelId)).toEqual([]);
      const first = await store.writeSnapshot(write);
      if (!first.ok) throw new Error(first.problem);

      // Two concurrent writes of the next version: one is written, the other is refused.
      const both = await Promise.all([store.writeSnapshot(writeOf(rows, 2)), store.writeSnapshot(writeOf(rows, 2, `${levelId}-v2b`))]);
      expect(both.filter((one) => one.ok)).toHaveLength(1);
      expect(both.find((one) => !one.ok)).toMatchObject({ problem: expect.stringContaining("version 2 is taken") });
      expect((await store.readSnapshots(levelId)).map((s) => s.version)).toEqual([1, 2]);

      // A book read refuses items added to a snapshot after its freeze (the database refuses the insert itself).
      const sheetIds = [sheet.sheet_id];
      expect(await readBookSnapshot(store, first.snapshotId, sheetIds)).toMatchObject({ ok: true, whole: { id: write.name, hash: write.contentHash } });
      const frozenRows = tables.snapshotItems.get(first.snapshotId) ?? [];
      const pack = frozenRows.find((item) => item.kind === "region_pack");
      if (!pack) throw new Error("no region pack");
      const extraPack = { ...pack, key: "XX", position: 9, content: { ...pack.content, id: "XX" }, hash: hashOf({ ...pack.content, id: "XX" }) };
      tables.snapshotItems.set(first.snapshotId, [...frozenRows, extraPack]);
      expect(await readBookSnapshot(store, first.snapshotId, sheetIds)).toMatchObject({ ok: false, problem: expect.stringContaining("do not match its manifest") });
      const extraSheet = { ...frozenRows.find((item) => item.kind === "sheet")!, key: "added-later", position: 99 };
      extraSheet.content = { ...extraSheet.content, id: "added-later" };
      extraSheet.hash = hashOf(extraSheet.content);
      tables.snapshotItems.set(first.snapshotId, [...frozenRows, extraSheet]);
      expect(await readBookSnapshot(store, first.snapshotId, ["added-later"])).toMatchObject({ ok: false, problem: expect.stringContaining('has no sheet "added-later"') });

      // A deleted row that comes back must take a revision above every review of its key.
      const levelNow = await store.readLevel(levelId);
      tables.sheets.delete(sheet.sheet_id);
      const back = await store.writeLevel({ expected: levelNow.version, level: levelNow.level!, topics: [], questions: [], scenarios: [], regionPacks: [], sheets: [{ ...sheet, content: changed as typeof sheet.content }] });
      expect(back).toMatchObject({ ok: false, problem: expect.stringContaining("comes back at revision 1") });
    }, 60_000);
  });
}

runFreezeContract("memory", () => { const store = memoryBankStore(); return { store, tables: store.tables }; });
runFreezeContract("Supabase (fake PostgREST)", () => { const fake = fakeBankSupabase(); return { store: supabaseBankStore(fake.db), tables: fake.memory.tables, calls: fake.calls }; });

describe("snapshot reads past the PostgREST row cap", () => {
  it("reads a snapshot of more than 1,000 items whole and for one book, with a question from the second page", async () => {
    const fake = fakeBankSupabase();
    const store = supabaseBankStore(fake.db);
    const draft = withExtraQuestions(fullLevelDraft(freshTag(), { topics: 1 }), 1000);
    const imported = await importDraft(draft, store);
    if (!imported.ok) throw new Error(imported.problems.join("\n"));
    const levelId = levelOf(draft);
    await approveAll(store, levelId);
    const write = writeOf(await store.readLevel(levelId), 1);
    expect(write.items.length).toBeGreaterThan(1000);
    const written = await store.writeSnapshot(write);
    if (!written.ok) throw new Error(written.problem);
    fake.calls.length = 0;
    const whole = await readSnapshot(store, written.snapshotId);
    if (!whole.ok) throw new Error(whole.problem);
    expect(recs(whole.snapshot.questions).map((q) => q.id)).toContain("extra-1000");
    const sheetId = String(recs(draft.sheets)[0].id);
    const part = await readBookSnapshot(store, written.snapshotId, [sheetId]);
    if (!part.ok) throw new Error(part.problem);
    expect(recs(part.snapshot.questions)).toHaveLength(recs(whole.snapshot.questions).length);
    expect(recs(part.snapshot.questions).map((q) => q.id)).toContain("extra-1000");
    expect(part.whole).toEqual({ id: write.name, hash: write.contentHash });
    expect(fake.calls.filter((call) => call.startsWith("GET /rest/v1/bank_snapshot_items?1000"))).toHaveLength(2);
  }, 120_000);
});

describe("the checks of a freeze", () => {
  it("refuses a level of 19 topics in plain words, before anything is drawn", async () => {
    const store = memoryBankStore();
    const draft = await importedLevel(store, freshTag(), { topics: 19 });
    const renderer = fakeRenderer();
    expect(await freezeLevel(store, levelOf(draft), { renderer, frozenBy: "Test admin", checks: QUICK_FREEZE })).toEqual({ ok: false, problems: ["The level has 19 topics and a full level has 20."] });
    expect(renderer.drawn.render).toEqual([]);
  });

  it("refuses a reference to a question that the level does not have", async () => {
    const store = memoryBankStore();
    const tag = freshTag();
    const draft = await importedLevel(store, tag);
    await editSheet(store, levelOf(draft), sheetIdOf(tag, STORY_AT.topic, STORY_AT.sheet), (content) => {
      ((content.front as Rec).rows as Rec[])[0].limits = { questions: ["no-such-question"] };
    });
    await approveAll(store, levelOf(draft));
    const result = await freezeLevel(store, levelOf(draft), { renderer: fakeRenderer(), frozenBy: "Test admin", checks: QUICK_FREEZE });
    expect(result.ok ? "" : result.problems.join("\n")).toMatch(/no-such-question/);
  });

  it("refuses a row that is easier than the row above it", async () => {
    const store = memoryBankStore();
    const tag = freshTag();
    const draft = await importedLevel(store, tag);
    const id = sheetIdOf(tag, 5, 5);
    const mul = recs(draft.sheets)[0].front as Rec;
    await editSheet(store, levelOf(draft), id, (content) => {
      const [noCarry] = recs(mul.rows);
      const oneCarry = recs(((recs(fullLevelDraft(tag).sheets)[0].back as Rec).rows))[0];
      (content.front as Rec).rows = [{ ...oneCarry, id: "harder", items: 1 }, { ...noCarry, id: "easier", items: 1 }].map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "basis")));
    });
    await approveAll(store, levelOf(draft));
    const result = await freezeLevel(store, levelOf(draft), { renderer: fakeRenderer(), frozenBy: "Test admin", checks: QUICK_FREEZE });
    expect(result.ok ? [] : result.problems).toContain(`Sheet "${id}", front side, row "easier": this row is easier than the row above it.`);
  });

  it("refuses a level name that is not a number, a missing level and a freeze with no person", async () => {
    const store = memoryBankStore();
    const draft = await importedLevel(store, freshTag());
    const options = { renderer: fakeRenderer(), frozenBy: "Test admin", checks: QUICK_FREEZE };
    expect(await freezeLevel(store, "synth-test-none", options)).toEqual({ ok: false, problems: ['There is no bank level "synth-test-none".'] });
    expect(await freezeLevel(store, levelOf(draft), { ...options, frozenBy: " " })).toMatchObject({ ok: false });
    const level = store.tables.levels.get(levelOf(draft));
    if (!level) throw new Error("no level");
    level.row.display_name = "Calc 1";
    expect(await freezeLevel(store, levelOf(draft), options)).toEqual({ ok: false, problems: [`Level "${levelOf(draft)}" is named "Calc 1", and a level name must be a number from 1 to 99.`] });
  });

  it("freezes a topic whose title is the word basis: only a property named basis is a note", async () => {
    const store = memoryBankStore();
    const tag = freshTag();
    const draft = withSentinelNotes(fullLevelDraft(tag));
    recs(draft.topics)[0].title = "basis";
    expect(await importDraft(draft, store)).toMatchObject({ ok: true });
    await approveAll(store, levelOf(draft));
    const frozen = await freezeLevel(store, levelOf(draft), { renderer: fakeRenderer(), frozenBy: "Test admin", checks: QUICK_FREEZE });
    if (!frozen.ok) throw new Error(frozen.problems.join("\n"));
    expect(recs(frozen.snapshot.topics)[0].title).toBe("basis");
    expect(JSON.stringify(frozen.snapshot)).not.toContain(SENTINEL);
  }, 60_000);

  it("computes display codes from positions: topic 11, sheet 3 is \"3-11\" on page 205", () => {
    expect(displayCode("3", 11)).toBe("3-11");
    expect(frontPage(10 * 10 + 2)).toBe(205);
    expect([frontPage(0), frontPage(199)]).toEqual([1, 399]);
    const coded = withDisplayCodes(fullLevelDraft("dc"), "7");
    expect(recs(coded.topics)[10].code).toBe("7-11");
    expect(recs(coded.sheets).find((s) => s.id === sheetIdOf("dc", 11, 3))?.firstPage).toBe(205);
  });
});

describe("reviews", () => {
  it("names a missing approval, a rejection and a stale approval in plain words", async () => {
    const store = memoryBankStore();
    const tag = freshTag();
    const draft = withSentinelNotes(fullLevelDraft(tag, { topics: 1 }));
    await importDraft(draft, store);
    const levelId = levelOf(draft);
    const rows = await store.readLevel(levelId);
    const [first, second] = rows.sheets.map((s) => s.sheet_id).sort();
    const review = (key: string, revision: number, decision: "approved" | "rejected") => reviewItem(store, { level_id: levelId, item_kind: "sheet", item_key: key, revision, reviewer: "Ana", decision, comment: null });
    expect(await review(first, 1, "approved")).toMatchObject({ ok: true });
    expect(await review(second, 1, "approved")).toMatchObject({ ok: true });
    expect(await review(second, 1, "rejected")).toMatchObject({ ok: true });
    const problems = approvalProblems(rows, await store.readReviews(levelId));
    expect(problems).toContain(`Sheet "${second}" (revision 1) was rejected by Ana: fix it, then approve revision 1.`);
    expect(problems.some((p) => p.includes(`"${first}"`))).toBe(false);
    expect(problems).toContain(`Region pack "CA" (revision 1) is not approved.`);
  });

  it("refuses a review of an old revision, of an unknown or retired item, and with no reviewer", async () => {
    const store = memoryBankStore();
    const draft = fullLevelDraft(freshTag(), { topics: 1 });
    await importDraft(withExtraQuestions(draft, 1, "dropped"), store);
    await importDraft(draft, store);
    const levelId = levelOf(draft);
    expect(await reviewItem(store, { level_id: levelId, item_kind: "question", item_key: "dropped-1", revision: 2, reviewer: "Ana", decision: "approved", comment: null }))
      .toMatchObject({ ok: false, problem: expect.stringContaining("is not an item of level") });
    const base = { level_id: levelId, item_kind: "question" as const, item_key: String(recs(draft.questions)[0].id), revision: 1, reviewer: "Ana", decision: "approved" as const, comment: null };
    expect(await reviewItem(store, { ...base, revision: 2 })).toEqual({ ok: false, problem: `Question "${base.item_key}" is at revision 1, not revision 2: review the current revision.` });
    expect(await reviewItem(store, { ...base, item_key: "no-such-question" })).toMatchObject({ ok: false, problem: expect.stringContaining("is not an item of level") });
    expect(await reviewItem(store, { ...base, reviewer: "  " })).toMatchObject({ ok: false });
    expect(await store.readReviews(levelId)).toEqual([]);
  });
});

describe("snapshot items", () => {
  it("keeps the content of each item with its hash, and refuses a snapshot that holds a note", () => {
    const snapshot = { format: 1, id: "x-v1", level: { id: "x", name: "3" }, topics: [{ id: "t", code: "3-1", title: "T", sheets: ["s"] }], sheets: [{ id: "s", firstPage: 1 }] };
    const items = snapshotItems(snapshot);
    expect(items.map((i) => [i.kind, i.key, i.position])).toEqual([["level", "x", 0], ["topic", "t", 0], ["sheet", "s", 0]]);
    expect(manifestHash([...items].reverse())).toBe(manifestHash(items));
    expect(() => snapshotItems({ ...snapshot, sheets: [{ id: "s", firstPage: 1, basis: { note: SENTINEL } }] })).toThrow(/may not hold "basis"/);
    expect(() => snapshotItems({ ...snapshot, sheets: [{ id: "s", firstPage: 1, front: { rows: [{ id: "r", limits: { basis: "x" } }] } }] })).toThrow(/may not hold "basis"/);
    expect(snapshotItems({ ...snapshot, topics: [{ id: "t", code: "3-1", title: "basis", sheets: ["s"] }] })).toHaveLength(3);
  });

  it("refuses an item with a note in the memory store, as the database check does", async () => {
    const store = memoryBankStore();
    const draft = await importedLevel(store, freshTag(), { topics: 1 });
    const rows = await store.readLevel(levelOf(draft));
    const write = {
      levelId: levelOf(draft), expected: String(rows.version), version: 1, name: "x-v1", frozenBy: "Test admin", minEngineVersion: "x", contentHash: "0".repeat(64), manifestHash: "0".repeat(64),
      items: [...rows.sheets.map((s, i) => ({ kind: "sheet" as const, key: s.sheet_id, position: i, content: { basis: { note: SENTINEL } }, hash: "0".repeat(64) }))],
    };
    const live = await store.readLevel(levelOf(draft));
    const more: [SnapshotItemKind, string][] = [...live.questions.map((q): [SnapshotItemKind, string] => ["question", q.id]), ...live.scenarios.map((s): [SnapshotItemKind, string] => ["scenario", s.id]), ...live.regionPacks.map((p): [SnapshotItemKind, string] => ["region_pack", p.id])];
    const items = [...write.items, ...more.map(([kind, key], i) => ({ kind, key, position: i, content: {}, hash: "0".repeat(64) }))];
    await expect(store.writeSnapshot({ ...write, items })).rejects.toThrow(/bank_snapshot_items_content_check/);
    expect(store.tables.snapshots.size).toBe(0);
  });
});
