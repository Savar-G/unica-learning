// One contract for every BankStore (B1-3, B1-4, B1-6): the memory store, the Supabase store over a fake PostgREST, and
// (with BANK_STORE_LIVE=1, SUPABASE_URL and SUPABASE_SECRET_KEY) the Supabase store on the live project, on synthetic
// levels `synth-test-*` that are deleted afterwards.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database";
import { checkDraft } from "./draft";
import { importDraft, planImport, runBankImport } from "./import-draft";
import { memoryBankStore } from "./memory-store";
import { fakeBankSupabase, synthDraft, withExtraQuestions } from "./store.fixtures";
import { BANK_PAGE_ROWS, supabaseBankStore } from "./supabase-store";
import type { BankStore, LevelRows } from "./types";

type Rec = Record<string, unknown>;
const recs = (value: unknown) => value as Rec[];

let tagCount = 0;
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const freshTag = () => `${RUN}${++tagCount}`;

/** Every revision of a level by kind and id, for comparing two reads. */
function revisions(rows: LevelRows): Record<string, number> {
  return Object.fromEntries([
    ...rows.sheets.map((r) => [`sheet:${r.sheet_id}`, r.revision]),
    ...rows.questions.map((r) => [`question:${r.id}`, r.revision]),
    ...rows.scenarios.map((r) => [`scenario:${r.id}`, r.revision]),
    ...rows.regionPacks.map((r) => [`pack:${r.id}`, r.revision]),
  ]);
}

const isEmpty = (rows: LevelRows) =>
  rows.level === null && [rows.topics, rows.sheets, rows.questions, rows.scenarios, rows.regionPacks].every((list) => list.length === 0);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const one of Object.values(value)) deepFreeze(one);
    Object.freeze(value);
  }
  return value;
}

const levelOf = (draft: Rec) => String((draft.level as Rec).id);

export function runBankStoreContract(name: string, makeStore: () => BankStore, used: string[] = [], timeout = 30_000) {
  const draftFor = (make: (tag: string) => Rec = synthDraft) => {
    const draft = make(freshTag());
    used.push(levelOf(draft));
    return draft;
  };

  describe(`the ${name} bank store`, () => {
    it("imports a draft file kept outside git and reads it back field for field, with notes outside the content", async () => {
      const store = makeStore();
      const draft = draftFor();
      const folder = mkdtempSync(join(tmpdir(), "bank-draft-"));
      try {
        const file = join(folder, "draft.json");
        writeFileSync(file, JSON.stringify(draft));
        const result = await runBankImport(file, store);
        expect(result).toMatchObject({ ok: true, levelId: levelOf(draft), counts: { added: 20, changed: 0, unchanged: 0, retired: 0 } });
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
      expect(await store.exportLevelDraft(levelOf(draft))).toStrictEqual(draft);
      const rows = await store.readLevel(levelOf(draft));
      expect(Object.values(revisions(rows)).every((r) => r === 1)).toBe(true);
      expect(rows.sheets.map((s) => [s.position, s.kind, s.status]).sort()).toEqual([[0, "practice", "draft"], [1, "practice", "draft"], [2, "word", "draft"]]);
      for (const sheet of rows.sheets) expect(JSON.stringify(sheet.content)).not.toContain('"basis"');
      const story = rows.sheets.find((s) => s.kind === "word");
      expect(story?.basis).toEqual({ sheet: { note: "Invented sheet: word problems." }, rows: { "one-step": { note: "Invented row: one step, one of them a half." } } });
    }, timeout);

    it("keeps every revision on a re-import with no change", async () => {
      const store = makeStore();
      const draft = draftFor();
      await importDraft(draft, store);
      const before = await store.readLevel(levelOf(draft));
      expect(await importDraft(draft, store)).toMatchObject({ ok: true, counts: { added: 0, changed: 0, unchanged: 20, retired: 0 } });
      const after = await store.readLevel(levelOf(draft));
      expect(revisions(after)).toEqual(revisions(before));
      expect(after.version).not.toEqual(before.version);
      expect(await store.exportLevelDraft(levelOf(draft))).toStrictEqual(draft);
    }, timeout);

    it("bumps the revision of each edited sheet, question and scenario, and of nothing else", async () => {
      const store = makeStore();
      const draft = draftFor();
      await importDraft(draft, store);
      const before = revisions(await store.readLevel(levelOf(draft)));
      const edited = structuredClone(draft);
      const sheet = recs(edited.sheets)[0];
      (sheet.front as Rec).instruction = "Multiply. Begin with the ones.";
      recs(edited.questions)[0].difficulty = 2;
      recs(edited.scenarios)[1].basis = { note: "Invented scenario, checked again." };
      expect(await importDraft(edited, store)).toMatchObject({ ok: true, counts: { added: 0, changed: 3, unchanged: 17, retired: 0 } });
      const after = revisions(await store.readLevel(levelOf(draft)));
      const bumped = [`sheet:${String(sheet.id)}`, `question:${String(recs(edited.questions)[0].id)}`, `scenario:${String(recs(edited.scenarios)[1].id)}`];
      expect(after).toEqual({ ...before, ...Object.fromEntries(bumped.map((key) => [key, 2])) });
      expect(await store.exportLevelDraft(levelOf(draft))).toStrictEqual(edited);
    }, timeout);

    it("retires a question that a later draft leaves out, keeps its row, and brings it back as a draft", async () => {
      const store = makeStore();
      const base = draftFor();
      const withCopy = withExtraQuestions(base, 1, "kept-copy");
      await importDraft(withCopy, store);
      expect(await importDraft(base, store)).toMatchObject({ ok: true, counts: { retired: 1, changed: 0 } });
      const retired = (await store.readLevel(levelOf(base))).questions.find((q) => q.id === "kept-copy-1");
      expect(retired).toMatchObject({ status: "retired", revision: 2 });
      expect(await store.exportLevelDraft(levelOf(base))).toStrictEqual(base);
      expect(await importDraft(withCopy, store)).toMatchObject({ ok: true, counts: { changed: 1, retired: 0 } });
      const back = (await store.readLevel(levelOf(base))).questions.find((q) => q.id === "kept-copy-1");
      expect(back).toMatchObject({ status: "draft", revision: 3 });
      expect(await store.exportLevelDraft(levelOf(base))).toStrictEqual(withCopy);
    }, timeout);

    it("refuses an invalid draft before any write, and leaves its input as it was", async () => {
      const store = makeStore();
      const bad = (change: (draft: Rec) => void) => {
        const draft = draftFor();
        change(draft);
        return deepFreeze(draft);
      };
      const drafts = [
        bad((d) => { ((recs(d.sheets)[0].front as Rec).rows as Rec[])[0].limits = { ...((((recs(d.sheets)[0].front as Rec).rows as Rec[])[0].limits) as Rec), basis: { note: "x" } }; }),
        bad((d) => { recs(d.sheets)[0].firstPage = 380; }),
        bad((d) => { d.sheets = [...recs(d.sheets)].reverse(); }),
        bad((d) => { recs(d.questions)[0].basis = "a note that is not an object"; }),
        bad((d) => { d.unknown = true; }),
      ];
      for (const draft of drafts) {
        const copy = structuredClone(draft);
        const result = await importDraft(draft, store);
        expect(result.ok).toBe(false);
        expect(result.ok ? [] : result.problems.length).toBeGreaterThan(0);
        expect(draft).toStrictEqual(copy);
        expect(isEmpty(await store.readLevel(levelOf(draft)))).toBe(true);
      }
      const good = draftFor();
      await importDraft(good, store);
      const before = await store.readLevel(levelOf(good));
      const broken = structuredClone(good);
      recs(broken.sheets)[1].firstPage = 2;
      expect((await importDraft(broken, store)).ok).toBe(false);
      expect(await store.readLevel(levelOf(good))).toStrictEqual(before);
    }, timeout);

    it("refuses a write made from a stale read, and a sheet id that another level owns", async () => {
      const store = makeStore();
      const draft = draftFor();
      await importDraft(draft, store);
      const stale = await store.readLevel(levelOf(draft));
      await importDraft(draft, store);
      const checked = checkDraft(draft);
      if (!checked.ok) throw new Error(checked.problems.join("\n"));
      expect(await store.writeLevel(planImport(stale, checked.rows).write)).toMatchObject({ ok: false, problem: expect.stringContaining("changed since it was read") });

      const other = structuredClone(draft);
      const otherLevel = `${levelOf(draft)}-b`;
      used.push(otherLevel);
      (other.level as Rec).id = otherLevel;
      expect(await importDraft(other, store)).toMatchObject({ ok: false, problems: [expect.stringContaining("belong to another level")] });
      expect(isEmpty(await store.readLevel(otherLevel))).toBe(true);
      expect(await store.exportLevelDraft(levelOf(draft))).toStrictEqual(draft);
    }, timeout);

    it(`reads a level with more than ${BANK_PAGE_ROWS} questions`, async () => {
      const store = makeStore();
      const draft = withExtraQuestions(draftFor(), BANK_PAGE_ROWS + 50);
      expect(await importDraft(draft, store)).toMatchObject({ ok: true });
      expect((await store.readLevel(levelOf(draft))).questions).toHaveLength(BANK_PAGE_ROWS + 57);
      expect(await store.exportLevelDraft(levelOf(draft))).toStrictEqual(draft);
    }, timeout * 4);
  });
}

runBankStoreContract("memory", memoryBankStore);
runBankStoreContract("Supabase (fake PostgREST)", () => supabaseBankStore(fakeBankSupabase().db));

describe("the Supabase bank store over PostgREST", () => {
  it("reads in pages of 1,000 rows and sends one write", async () => {
    const fake = fakeBankSupabase();
    const store = supabaseBankStore(fake.db);
    const draft = withExtraQuestions(synthDraft(freshTag()), 1500);
    expect(await importDraft(draft, store)).toMatchObject({ ok: true });
    expect(fake.calls.filter((c) => c.startsWith("POST"))).toEqual(["POST /rest/v1/rpc/bank_write_level?"]);
    fake.calls.length = 0;
    await store.readLevel(levelOf(draft));
    expect(fake.calls.filter((c) => c.startsWith("GET /rest/v1/bank_questions"))).toEqual(["GET /rest/v1/bank_questions?0", "GET /rest/v1/bank_questions?1000"]);
  });
});

const live = process.env.BANK_STORE_LIVE === "1" ? { url: process.env.SUPABASE_URL ?? "", key: process.env.SUPABASE_SECRET_KEY ?? "" } : null;
describe.skipIf(!live)("live", () => {
  const db = createClient<Database>(live?.url ?? "https://unused.invalid", live?.key ?? "unused", { auth: { persistSession: false, autoRefreshToken: false } });
  const used: string[] = [];
  runBankStoreContract("live Supabase", () => supabaseBankStore(db), used, 120_000);
  afterAll(async () => {
    const levels = [...new Set(used)];
    if (levels.some((id) => !id.startsWith("synth-test-"))) throw new Error("live cleanup: refusing a level that is not synthetic");
    for (const table of ["bank_sheets", "bank_topics", "bank_questions", "bank_scenarios", "bank_region_packs"] as const) {
      const { error } = await db.from(table).delete().in("level_id", levels);
      if (error) throw new Error(`live cleanup ${table}: ${error.message}`);
    }
    const { error } = await db.from("bank_levels").delete().in("id", levels);
    if (error) throw new Error(`live cleanup bank_levels: ${error.message}`);
  }, 120_000);
});
