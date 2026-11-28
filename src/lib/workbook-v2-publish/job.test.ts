import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildBook, PART_OF_BOOK } from "@/lib/workbook-v2/build/build-book";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { writeBook } from "./contract-writer";
import { allocationOf, bookInput } from "./input";
import { publishOnce, publishV2Book, type JobDeps } from "./job";
import { CHILD, PARENT, REAL_CHILD, deps, memory, request } from "./publish.fixtures";
import type { PublishPayload, V2PublishStore } from "./types";

// The v2 book job (UNI-141): its order, test families only, one book for one input, and a lost answer read before a retry.

/** A store and a file store that log each call, in order. */
function logged() {
  const { store, files } = memory();
  const log: string[] = [];
  const wrap = <T extends object>(name: string, target: T): T => new Proxy(target, {
    get: (t, key) => {
      const value = Reflect.get(t, key);
      return typeof value === "function" ? (...args: unknown[]) => {
        const first = args[0] as { contentType?: string } | undefined;
        log.push(`${name}.${String(key)}${first?.contentType ? `:${first.contentType}` : ""}`);
        return value.apply(t, args);
      } : value;
    },
  });
  return { store, files, log, wrappedStore: wrap("store", store), wrappedFiles: wrap("files", files) };
}

describe("the v2 book job", () => {
  it("allocates and saves the input before the build, then uploads, then writes once (P1)", async () => {
    const { log, wrappedStore, wrappedFiles, store, files } = logged();
    const d = deps(wrappedStore, wrappedFiles);
    const renderer: JobDeps["renderer"] = async () => { log.push("build"); return fakeRenderer(); };
    const result = await publishV2Book({ ...d, renderer }, request());
    expect(result.status).toBe("published");
    const firstPng = log.indexOf("files.put:image/png");
    expect(log.slice(0, 6)).toEqual(["store.family", "store.allocate", "store.findByInputHash", "files.put:application/json", "build", "store.family"]);
    expect(log[6]).toBe("files.put:application/pdf");
    expect(firstPng).toBe(7);
    expect(log.at(-1)).toBe("store.publish");
    expect(log.filter((l) => l === "store.publish")).toHaveLength(1);
    // Every file is in the family's folder of this workbook, named by its hash.
    const { workbookId, inputHash } = store.tables.allocations[0];
    expect([...files.files.keys()].every((p) => p.startsWith(`${PARENT}/${workbookId}/`))).toBe(true);
    expect(files.files.has(`${PARENT}/${workbookId}/${inputHash}.json`)).toBe(true);
    expect(files.files.size).toBe(1 + 1 + 8);
  });

  it("gives the next workbook number of the child and records each count, byte and time", async () => {
    const { store, files } = memory();
    const result = await publishV2Book(deps(store, files), request());
    if (result.status !== "published") throw new Error(JSON.stringify(result));
    const { record } = result;
    expect(store.tables.allocations[0].workbookNumber).toBe(3);
    expect(record).toMatchObject({ httpStatus: 201, status: "published", counts: { pages: 8, questions: 78, itemAnswers: 78, sheets: 4, timeLogs: 2 } });
    expect(record.bytes.pdf + record.bytes.images + record.bytes.input).toBe(record.bytes.total);
    const t = record.timingMs;
    expect(t.allocate + t.build + t.upload + t.publish + t.overhead).toBe(t.total);
    expect(Object.values(t).every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
  });

  it("keeps the sums of the record whatever the clock gives (property)", async () => {
    await fc.assert(fc.asyncProperty(fc.array(fc.double({ min: 0, max: 5000, noNaN: true }), { minLength: 40, maxLength: 40 }), async (steps) => {
      const { store, files } = memory();
      let t = 0;
      let i = 0;
      const d = { ...deps(store, files), clock: () => (t += steps[i++ % steps.length]) };
      const result = await publishV2Book(d, request({ sheets: request().sheets.slice(0, 2) }));
      if (result.status !== "published") return false;
      const { timingMs: x, bytes: b } = result.record;
      return x.allocate + x.build + x.upload + x.publish + x.overhead === x.total && x.overhead >= 0 && b.pdf + b.images + b.input === b.total;
    }), { numRuns: 15, seed: 141 });
  });

  it("builds nothing and writes nothing new on a second run of the same request (P2)", async () => {
    const { store, files } = memory();
    const first = await publishV2Book(deps(store, files), request());
    const d = deps(store, files, { seed: "b" });
    const failingFiles = { ...files, put: async () => { throw new Error("storage outage"); } };
    const second = await publishV2Book({ ...d, files: failingFiles }, request());
    if (first.status !== "published" || second.status !== "existing") throw new Error(JSON.stringify([first.status, second.status]));
    expect(second.record.workbookId).toBe(first.record.workbookId);
    expect(second.record.printedRevision).toBe(first.record.printedRevision);
    expect(second.record.httpStatus).toBe(200);
    expect(second.record.bytes).toEqual({ pdf: 0, images: 0, input: 0, total: 0 });
    expect(d.opened()).toBe(0);
    expect(store.tables.allocations).toHaveLength(1);
    expect(store.tables.books).toHaveLength(1);
    expect(files.files.size).toBe(10);
  });

  it("refuses to upload built files if test-family status is removed during the build", async () => {
    const { store, files } = memory();
    let familyCalls = 0;
    const revokingStore: V2PublishStore = {
      ...store,
      family: async (childId) => (++familyCalls === 1 ? store.family(childId) : { status: "not-test" }),
    };
    const result = await publishV2Book(deps(revokingStore, files), request());
    expect(result).toMatchObject({ status: "refused", reason: "not-test-family" });
    // Only the pre-build input file was written; neither the PDF nor any page PNG was uploaded.
    expect([...files.files.keys()].every((p) => p.endsWith(".json"))).toBe(true);
    expect(store.tables.books).toHaveLength(0);
  });

  it("stops launching new uploads and waits for in-flight uploads before rejecting", async () => {
    const { store, files } = memory();
    let active = 0;
    let calls = 0;
    const flakyFiles = {
      get: files.get,
      put: async (file: Parameters<typeof files.put>[0]) => {
        if (file.contentType === "application/json") return files.put(file);
        const n = ++calls;
        active++;
        await new Promise((r) => setTimeout(r, n === 1 ? 5 : 20));
        active--;
        if (n === 1) throw new Error("upload failed");
        return files.put(file);
      },
    };
    await expect(publishV2Book(deps(store, flakyFiles), request())).rejects.toThrow("upload failed");
    expect(active).toBe(0);
    expect(calls).toBeLessThan(9);
  });

  it("builds again after a run that stopped before its write, with the same ids and tokens", async () => {
    const { store, files } = memory();
    const failing: V2PublishStore = { ...store, publish: async () => { throw new Error("the function stopped"); }, findByInputHash: store.findByInputHash };
    await expect(publishV2Book(deps(failing, files), request())).rejects.toThrow("the function stopped");
    const result = await publishV2Book(deps(store, files, { seed: "c" }), request());
    if (result.status !== "published") throw new Error(result.status);
    expect(result.record.workbookId).toBe(store.tables.allocations[0].workbookId);
    expect(store.tables.books[0].payload.pages.map((p) => p.qrToken)).toEqual(store.tables.allocations[0].allocation.qrTokens);
  });

  it("refuses a request key that was used for another book", async () => {
    const { store, files } = memory();
    await publishV2Book(deps(store, files), request());
    const other = await publishV2Book(deps(store, files, { seed: "d" }), request({ region: "CA" }));
    expect(other).toEqual({ status: "invalid", problems: ["the request key was used for another book"] });
    expect(store.tables.books).toHaveLength(1);
  });

  it("refuses a retry that changes the pages per day of the same sheets", async () => {
    const { store, files } = memory();
    const sheets = request().sheets.slice(0, 2).map((sheet, i) => ({ ...sheet, startsDay: i === 0, day: 1 }));
    expect(await publishV2Book(deps(store, files), request({ sheets, pagesPerDay: 2 }))).toMatchObject({ status: "published" });
    const retry = deps(store, files, { seed: "d" });
    expect(await publishV2Book(retry, request({ sheets, pagesPerDay: 2 }))).toMatchObject({ status: "existing" });
    expect(await publishV2Book(retry, request({ sheets, pagesPerDay: 4 }))).toEqual({
      status: "invalid", problems: ["the request key was used for another book"],
    });
  });

  it("returns an already published book when its old sheet order fails the new preflight", async () => {
    const { store, files } = memory();
    const first = deps(store, files);
    const good = request();
    const legacy = request({ sheets: good.sheets.map((sheet, i) => ({ ...good.sheets[[1, 0, 2, 3][i]], day: sheet.day, startsDay: sheet.startsDay })) });
    const workbookId = first.uuid();
    const qrTokens = Array.from({ length: good.sheets.length * 2 }, () => first.token());
    const planned = allocationOf(good, { parentId: PARENT, workbookId, qrTokens, allocatedAt: first.now().toISOString() });
    if (!planned.ok) throw new Error(planned.problems.join("\n"));
    const book = bookInput(legacy, workbookId, qrTokens);
    const built = await buildBook({ snapshot: legacy.snapshot, book }, fakeRenderer(), PART_OF_BOOK);
    if (built.status !== "built") throw new Error(built.problems.join("\n"));
    const inputHash = built.record.inputHash;
    const allocation = await store.allocate({
      ...planned.candidate, inputHash, inputPath: `${PARENT}/${workbookId}/${inputHash}.json`,
      allocation: { ...planned.candidate.allocation, book },
    });
    if (allocation.status !== "allocated") throw new Error(allocation.status);
    const retry = deps(store, files, { seed: "d" });
    expect(await publishV2Book(retry, legacy)).toMatchObject({ status: "invalid", problems: [expect.stringContaining("later in the level")] });
    const stored = await store.publish(writeBook(built, allocation).payload);
    expect(stored.status).toBe("published");
    expect(await publishV2Book(retry, legacy)).toMatchObject({ status: "existing", record: { workbookId, inputHash } });
    expect(await publishV2Book(retry, { ...legacy, scenario: "sports" })).toMatchObject({ status: "invalid" });
    expect(store.tables.allocations).toHaveLength(1);
    expect(files.files.size).toBe(0);
    expect(retry.opened()).toBe(0);
  });

  it.each([
    ["a child of a family that is not a test family", REAL_CHILD, "not-test-family"],
    ["a child that is not known", "66666666-6666-4666-8666-666666666666", "unknown-child"],
  ])("refuses %s, with no row, no file and no build (M2)", async (_case, childId, reason) => {
    const { store, files } = memory();
    const d = deps(store, files);
    const result = await publishV2Book(d, request({ childId }));
    expect(result).toMatchObject({ status: "refused", reason });
    expect(store.tables.allocations).toHaveLength(0);
    expect(files.files.size).toBe(0);
    expect(d.opened()).toBe(0);
  });

  it.each<[string, Parameters<typeof request>[0], number]>([
    // At 2 pages a day, days of 1, 1 and 2 sheets: the last day takes one more sheet so that the book has an even number.
    ["a last day with one more sheet", { sheets: request().sheets.map((s, i) => ({ ...s, startsDay: i < 3, day: Math.min(i, 2) + 1 })) }, 2],
    // A book of one day: 1 sheet a day and one more, which only the pages a day that the request sets can say.
    ["a book of one day with one more sheet", { pagesPerDay: 2, sheets: request().sheets.slice(0, 2).map((s, i) => ({ ...s, startsDay: i === 0, day: 1 })) }, 2],
  ])("publishes %s, and saves the pages a day of the request", async (_case, change, pagesPerDay) => {
    const { store, files } = memory();
    const result = await publishV2Book(deps(store, files), request(change));
    expect(result.status).toBe("published");
    expect(store.tables.allocations.map((a) => a.allocation.pagesPerDay)).toEqual([pagesPerDay]);
    expect(store.tables.books.map((b) => b.payload.workbook.pagesPerDay)).toEqual([pagesPerDay]);
  });

  it.each([
    ["a request key that is too short", { requestKey: "short" }, /request key/],
    ["pages that are not a multiple of 4", { sheets: request().sheets.slice(0, 3) }, /multiple of 4/],
    ["a day that does not start with its first sheet", { sheets: request().sheets.map((s, i) => ({ ...s, startsDay: i === 1 })) }, /each day starts/],
    ["a sheet the snapshot does not have", { sheets: request().sheets.map((s, i) => (i === 0 ? { ...s, sheetId: "no-such-sheet" } : s)) }, /no sheet/],
    // 60 sheets are 120 pages, and with the 4 of the cover 124: more than a book has.
    ["more than 120 pages with the cover", { sheets: Array.from({ length: 30 }, (_, d) => request().sheets.slice(0, 2).map((s, i) => ({ ...s, startsDay: i === 0, day: d + 1 }))).flat() }, /the pages of a book and the 4 of its cover are a multiple of 4, up to 120, and this book has 124/],
    ["a middle day with more sheets than the pages a day set for the book", { pagesPerDay: 2, sheets: request().sheets.map((s, i) => ({ ...s, startsDay: i === 0 || i === 2, day: i < 2 ? 1 : 2 })) }, /^day 1 has 2 sheets, and at 2 pages a day each day has 1 \(the last day may have one more/m],
    ["pages a day that are not even", { pagesPerDay: 3 }, /pages a day is an even whole number from 2 to 20, and this book has 3/],
    ["new sheets out of the level order", { sheets: request().sheets.map((s, i, all) => ({ ...all[[1, 0, 2, 3][i]], startsDay: s.startsDay, day: s.day })) }, /^Level check, sheet "times-facts", page 1, slot "page": this new sheet comes after a new sheet that is later in the level\.$/m],
  ])("refuses %s before anything is written", async (_case, change, problem) => {
    const { store, files } = memory();
    const result = await publishV2Book(deps(store, files), request(change));
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.problems.join("\n")).toMatch(problem);
    expect(store.tables.allocations).toHaveLength(0);
    expect(files.files.size).toBe(0);
  });
});

describe("one write under the input hash (P2: a lost answer)", () => {
  async function payloadOf() {
    const { store, files } = memory();
    let captured: PublishPayload | null = null;
    const spy: V2PublishStore = { ...store, publish: async (p) => { captured = p; return store.publish(p); }, findByInputHash: store.findByInputHash };
    await publishV2Book(deps(spy, files), request({ childId: CHILD }));
    return { store, payload: captured! };
  }

  it("reads the book after a lost answer and gives it back, with no second write", async () => {
    const { payload, store } = await payloadOf();
    store.tables.books.length = 0;
    let writes = 0;
    const lossy: V2PublishStore = { ...store, findByInputHash: store.findByInputHash, publish: async (p) => { writes++; await store.publish(p); throw new Error("the answer was lost"); } };
    const result = await publishOnce(lossy, payload);
    expect(result).toEqual({ status: "existing", ref: { workbookId: payload.workbook.id, printedRevision: payload.workbook.printedRevision } });
    expect(writes).toBe(1);
    expect(store.tables.books).toHaveLength(1);
  });

  it("tries one more time when the first write did not happen, and reads again when that fails too", async () => {
    const { payload, store } = await payloadOf();
    store.tables.books.length = 0;
    let writes = 0;
    let reads = 0;
    const flaky: V2PublishStore = { ...store, findByInputHash: async (h) => { reads++; return store.findByInputHash(h); }, publish: async (p) => { writes++; if (writes === 1) throw new Error("network"); return store.publish(p); } };
    expect((await publishOnce(flaky, payload)).status).toBe("published");
    expect([writes, reads]).toEqual([2, 1]);
    const broken: V2PublishStore = { ...flaky, publish: async () => { writes++; throw new Error("down"); } };
    writes = 0;
    reads = 0;
    store.tables.books.length = 0;
    await expect(publishOnce(broken, payload)).rejects.toThrow("down");
    expect([writes, reads]).toEqual([2, 2]);
  });
});
