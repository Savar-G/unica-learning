import { beforeAll, describe, expect, it } from "vitest";
import { createSession } from "@/lib/maya";
import { teachingPackage } from "@/lib/maya-teaching";
import { workbookAnswerPages } from "@/lib/parent-workbook-answers";
import { workbookStore } from "@/lib/workbook-store";
import { publishV2Book } from "./job";
import { memoryFiles, memoryPublishStore } from "./memory-store";
import { CHILD, PARENT, REAL_CHILD, SECOND_CHILD, STORE_OPTIONS, deps, fakeSupabase, fullRequest, request } from "./publish.fixtures";
import { allocateAnswer, publishAnswer, v2Files, v2PublishStore } from "./supabase-store";
import type { AllocationCandidate, PublishPayload, V2PublishStore, V2Storage } from "./types";

// The v2 publish store (P3): the memory store and the Supabase store pass the same tests. The Supabase store talks to a
// fake PostgREST and Storage whose two functions keep the rules of the memory store (publish.fixtures.ts).

interface Made { store: V2PublishStore; files: V2Storage; counts: () => { allocations: number; books: number; files: number } }

const adapters: [string, () => Made][] = [
  ["in memory", () => {
    const store = memoryPublishStore(STORE_OPTIONS);
    const files = memoryFiles();
    return { store, files, counts: () => ({ allocations: store.tables.allocations.length, books: store.tables.books.length, files: files.files.size }) };
  }],
  ["Supabase", () => {
    const fake = fakeSupabase();
    const m = fake.memory;
    return { store: v2PublishStore(fake.db), files: v2Files(fake.db), counts: () => ({ allocations: m.store.tables.allocations.length, books: m.store.tables.books.length, files: m.files.files.size }) };
  }],
];

const candidate = (o: Partial<AllocationCandidate> = {}): AllocationCandidate => {
  const workbookId = o.workbookId ?? "77777777-7777-4777-8777-777777777777";
  const inputHash = o.inputHash ?? "a".repeat(64);
  return {
    childId: CHILD, workbookId, requestKey: "store-test-key", inputHash, inputPath: `${PARENT}/${workbookId}/${inputHash}.json`, allocatedAt: "2026-11-27T02:35:00.000Z",
    allocation: { format: 1, snapshotId: "s", snapshotHash: "b".repeat(64), levels: [3], pagesPerDay: 4, book: { bookId: workbookId, childId: CHILD, sheets: [] }, days: [], qrTokens: [] },
    ...o,
  };
};

describe.each(adapters)("the %s v2 publish store", (_name, make) => {
  it("says which family may get a v2 book", async () => {
    const { store } = make();
    expect(await store.family(CHILD)).toEqual({ status: "test", parentId: PARENT });
    expect(await store.family(REAL_CHILD)).toEqual({ status: "not-test" });
    expect(await store.family("66666666-6666-4666-8666-666666666666")).toEqual({ status: "unknown-child" });
  });

  it("allocates the next number of the child, and gives back the allocation of a request key or an input hash", async () => {
    const { store, counts } = make();
    const first = await store.allocate(candidate());
    expect(first).toMatchObject({ status: "allocated", parentId: PARENT, workbookNumber: 3 });
    const sameKey = await store.allocate(candidate({ workbookId: "88888888-8888-4888-8888-888888888888", inputHash: "c".repeat(64), inputPath: `${PARENT}/88888888-8888-4888-8888-888888888888/${"c".repeat(64)}.json` }));
    expect(sameKey).toMatchObject({ status: "existing", workbookId: "77777777-7777-4777-8777-777777777777", workbookNumber: 3 });
    const sameHash = await store.allocate(candidate({ requestKey: "another-key-1" }));
    expect(sameHash).toMatchObject({ status: "existing", requestKey: "store-test-key" });
    expect(counts().allocations).toBe(1);
  });

  it.each([
    ["a family that is not a test family", { childId: REAL_CHILD }, /only for test families/],
    ["an input file outside the workbook's folder", { inputPath: `${PARENT}/99999999-9999-4999-8999-999999999999/x.json` }, /folder/],
  ])("refuses an allocation for %s and saves nothing", async (_case, change, reason) => {
    const { store, counts } = make();
    const result = await store.allocate(candidate(change));
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.reason).toMatch(reason);
    expect(counts().allocations).toBe(0);
  });

  it("refuses a request key of another child", async () => {
    const { store } = make();
    await store.allocate(candidate());
    expect(await store.allocate(candidate({ childId: SECOND_CHILD, workbookId: "88888888-8888-4888-8888-888888888888", inputHash: "c".repeat(64), inputPath: `${PARENT}/88888888-8888-4888-8888-888888888888/${"c".repeat(64)}.json` })))
      .toEqual({ status: "refused", reason: "the request key belongs to another child" });
  });

  it("counts a file whose path exists already as stored", async () => {
    const { files } = make();
    const file = { path: `${PARENT}/77777777-7777-4777-8777-777777777777/${"d".repeat(64)}.png`, contentType: "image/png" as const, bytes: new Uint8Array([1, 2, 3]) };
    expect(await files.put(file)).toBe("stored");
    expect(await files.put(file)).toBe("existing");
    expect(await files.get(file.path)).toEqual(new Uint8Array([1, 2, 3]));
    expect(await files.get(`${PARENT}/none.png`)).toBeNull();
  });

  it("publishes a book once: the same input again writes nothing and gives back the same revision", async () => {
    const { store, files, counts } = make();
    const first = await publishV2Book(deps(store, files), request());
    if (first.status !== "published") throw new Error(JSON.stringify(first));
    const before = counts();
    const again = await publishV2Book(deps(store, files, { seed: "e" }), request());
    expect(again).toMatchObject({ status: "existing", record: { workbookId: first.record.workbookId, printedRevision: first.record.printedRevision } });
    expect(counts()).toEqual(before);
    expect(await store.findByInputHash(first.record.inputHash)).toEqual({ workbookId: first.record.workbookId, printedRevision: first.record.printedRevision });
    const stored = await store.storedBook(first.record.workbookId);
    expect(stored).toMatchObject({ inputHash: first.record.inputHash, rendererVersion: "typst@0.0.0", fontHashes: { "A.ttf": "a", "B.ttf": "b", "page.typ": "t" } });
    expect(stored?.pages).toHaveLength(8);
  });

  it("refuses a book of a family that is not a test family, a mismatched allocation (even when published), and incomplete payloads", async () => {
    const { store, files, counts } = make();
    let payload: PublishPayload | null = null;
    const spy: V2PublishStore = { ...store, family: store.family, allocate: store.allocate, findByInputHash: store.findByInputHash, storedBook: store.storedBook, publish: async (p) => { payload = p; return { status: "refused", reason: "held" }; } };
    await publishV2Book(deps(spy, files), request());
    const p = payload as unknown as PublishPayload;
    expect(await store.publish({ ...p, workbook: { ...p.workbook, childId: REAL_CHILD } })).toEqual({ status: "refused", reason: "v2 books are only for test families" });
    expect(await store.publish({ ...p, workbook: { ...p.workbook, number: 9 } })).toEqual({ status: "refused", reason: "the book does not match its allocation" });
    // Incomplete payloads, swapped QR tokens, overlapping sheet sides, or missing day time logs are refused cleanly.
    for (const bad of [
      { ...p, questions: [], itemAnswers: [] },
      { ...p, itemAnswers: p.itemAnswers.slice(1) },
      { ...p, itemAnswers: undefined as unknown as PublishPayload["itemAnswers"] },
      { ...p, sheets: [] },
      { ...p, timeLogs: [] },
      { ...p, pages: p.pages.map((pg, i) => (i === 0 ? { ...pg, qrToken: p.pages[1].qrToken } : i === 1 ? { ...pg, qrToken: p.pages[0].qrToken } : pg)) },
      { ...p, sheets: p.sheets.map((s, i) => (i === 1 ? { ...s, frontPageNumber: 2, backPageNumber: 3 } : s)) },
      { ...p, sheets: p.sheets.map((s) => (s.day === 2 ? { ...s, startsDay: false } : s)), timeLogs: p.timeLogs.filter((t) => t.day !== 2) },
    ]) {
      expect((await store.publish(bad)).status).toBe("refused");
    }
    expect(counts().books).toBe(0);
    // Once published, a retry with the same input hash but mismatched child/id/number is refused rather than returning 'existing'.
    expect((await store.publish(p)).status).toBe("published");
    expect(await store.publish({ ...p, workbook: { ...p.workbook, number: p.workbook.number + 1 } })).toEqual({ status: "refused", reason: "the book does not match its allocation" });
    expect(await store.publish({ ...p, workbook: { ...p.workbook, childId: SECOND_CHILD } })).toEqual({ status: "refused", reason: "the book does not match its allocation" });
    expect(await store.publish(p)).toMatchObject({ status: "existing", workbookId: p.workbook.id });
    expect(counts().books).toBe(1);
  });
});

describe("the Supabase v2 publish store", () => {
  it("reads a lost answer of the write as the book it wrote (P2)", async () => {
    const fake = fakeSupabase();
    fake.loseNext.add("publish_v2_workbook");
    const result = await publishV2Book(deps(v2PublishStore(fake.db), v2Files(fake.db)), request());
    expect(result.status).toBe("existing");
    expect(fake.memory.store.tables.books).toHaveLength(1);
    expect(fake.calls.filter((c) => c === "POST /rest/v1/rpc/publish_v2_workbook")).toHaveLength(1);
  });

  it("checks the answers of its functions", () => {
    expect(() => publishAnswer({ status: "published" })).toThrow(/unexpected answer/);
    expect(() => allocateAnswer({ status: "allocated", workbookId: 3 })).toThrow(/unexpected answer/);
    expect(publishAnswer({ status: "refused", reason: "no" })).toEqual({ status: "refused", reason: "no" });
  });
});

describe("a full-size book in today's tables (F1, C1)", () => {
  let fake: ReturnType<typeof fakeSupabase>;
  let workbookId: string;
  beforeAll(async () => {
    fake = fakeSupabase();
    const result = await publishV2Book(deps(v2PublishStore(fake.db), v2Files(fake.db)), fullRequest());
    if (result.status !== "published") throw new Error(JSON.stringify(result));
    expect(result.record.counts).toEqual({ pages: 108, questions: 1378, itemAnswers: 1378, sheets: 54, timeLogs: 9 });
    workbookId = result.record.workbookId;
  }, 60_000);

  it("reads back every one of its 1,378 questions through today's workbook store, Maya teaching, and parent answer keys", async () => {
    const book = await workbookStore(fake.db).workbook(workbookId);
    const questions = book?.pages.flatMap((p) => p.questions) ?? [];
    expect(book?.pages).toHaveLength(108);
    expect(questions).toHaveLength(1378);
    expect(questions.every((q) => q.content.status === "found" && q.regions !== null)).toBe(true);
    expect(book?.pages.every((p) => p.printContract !== null)).toBe(true);
    expect(book?.printedRevision).toMatch(/^[0-9a-f]{28}$/);
    expect((await workbookStore(fake.db).pageIndex(workbookId)).reduce((n, p) => n + p.questions, 0)).toBe(1378);
    // Maya can teach the supported arithmetic and story items across the whole book.
    const teachable = questions.filter((q) => q.content.status === "found"
      && createSession({ callId: `full-${q.number}`, package: teachingPackage(q.content.package) }).package !== null).length;
    expect(teachable).toBeGreaterThan(1300);
    // Parent answer keys preserve units on all 42 quantity word problems.
    const answers = workbookAnswerPages(book!);
    expect(answers).not.toBeNull();
    const quantityAnswers = fake.memory.store.tables.books[0].payload.itemAnswers.filter((a) => a.answerKind === "quantity");
    expect(quantityAnswers).toHaveLength(42);
    for (const a of quantityAnswers) {
      const q = answers!.find((p) => p.number === a.pageNumber)?.questions.find((x) => x.number === a.questionNumber);
      expect(q?.answers).toEqual([{ part: 1, value: `${a.answerValue} ${a.unit}`, alternatives: [] }]);
    }
  });

  it("finds a page by its QR token", async () => {
    const payload = fake.memory.store.tables.books[0].payload;
    const found = await workbookStore(fake.db).pageByToken(payload.pages[57].qrToken);
    expect(found).toMatchObject({ workbook: { id: workbookId, childId: CHILD }, page: 58 });
  });
});
