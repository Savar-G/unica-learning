import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildReferencePhotoPath, formatImportResult, importReferenceRecords, type ImportResult, type ReferenceStore } from "./import";
import { contentPath, MemoryReferenceStore } from "./import-store.fixtures";
import { sha256Hex } from "./read-file";
import type { PageRecord } from "./types";

// What one page is: its text, its status and its photo. A row must never hold a mix of two of these.
interface Page {
  title: string;
  status: "machine_read" | "double_read";
  // The stored photo in a row; the file to send in a run (none: the run sends no photo).
  photo: Uint8Array | null;
}

const REFS = ["demo:Z:1a", "demo:Z:2b"];
const OLD = new Uint8Array([1, 2, 3, 4]);
const NEW = new Uint8Array([5, 6, 7, 8]);
const START: Page = { title: "Old text", status: "double_read", photo: OLD };

// Each kind of run against a stored page START. The photo null keeps the stored photo.
const KINDS: Record<string, Page> = {
  "text and photo": { title: "New text", status: "machine_read", photo: NEW },
  "photo only": { ...START, photo: NEW },
  "text only": { ...START, title: "New text" },
  "lower status, no photo sent": { ...START, status: "machine_read", photo: null },
};

type StartForm = "today's path" | "new path" | "no row";

function makePage(sourceRef: string, title: string): PageRecord {
  return {
    kind: "page",
    source_ref: sourceRef,
    topic: { title, number: 1 },
    sections: [
      {
        instruction: "Add.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "3 + 4 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [3, 4] },
            responses: [{ position: "after_equals", cue: null, answer: "7", answer_source: "computed" }],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
  };
}

const pageText = (page: Page, photo = page.photo): string =>
  JSON.stringify([page.title, page.status, photo && sha256Hex(photo)]);

// The page that each row of the store holds now. A photo that is not in the bucket is "missing".
function pagesOf(store: MemoryReferenceStore): Map<string, string> {
  return new Map(
    [...store.rows].map(([ref, row]) => {
      const object = row.path === null ? null : store.objects.get(row.path);
      const photo = object === undefined ? "missing" : object && sha256Hex(object.bytes);
      return [ref, JSON.stringify([(row.transcript as PageRecord).topic.title, row.transcript_status, photo])];
    }),
  );
}

const newPathOf = (ref: string, photo: Uint8Array): string => contentPath(ref, "jpg", photo);

function startStore(form: StartForm): MemoryReferenceStore {
  const store = new MemoryReferenceStore();
  if (form === "no row") return store;
  for (const ref of REFS) {
    const path = form === "new path" ? newPathOf(ref, OLD) : `${ref.replaceAll(":", "/")}.jpg`;
    store.objects.set(path, { bytes: OLD, contentType: "image/jpeg" });
    store.rows.set(ref, {
      source_ref: ref,
      kind: "page",
      path,
      transcript: makePage(ref, START.title),
      transcript_status: START.status,
      updated_at: "start",
    });
  }
  return store;
}

// The same store with a step before and after each call.
function watched(
  store: MemoryReferenceStore,
  step: { before?: (n: number) => Promise<void> | void; after?: (n: number) => Promise<void> | void },
): ReferenceStore {
  let n = 0;
  return new Proxy(store, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const call = n;
        n += 1;
        await step.before?.(call);
        const result: unknown = await Reflect.apply(value, target, args);
        await step.after?.(call);
        return result;
      };
    },
  });
}

// At the end of a run: a photo that it names is in the bucket, and no row uses it. A later run can use it again.
function expectNoNamedPhotoInUse(store: MemoryReferenceStore, result: ImportResult, label: string): void {
  const usedPaths = [...store.rows.values()].map((row) => row.path);
  for (const path of [...result.leftoverPhotos, ...(result.unreferencedPhotos ?? [])]) {
    expect(usedPaths, label).not.toContain(path);
    expect([...store.objects.keys()], label).toContain(path);
  }
}

const callCount = (store: MemoryReferenceStore): number => store.calls.length;

// Rows without the clock columns, and every object of the bucket.
const endState = (store: MemoryReferenceStore) => ({
  rows: [...store.rows].map(([ref, row]) => [ref, { ...row, updated_at: undefined, created_at: undefined }]),
  objects: [...store.objects],
});

describe("a replace never pairs the text of a page with another photo", () => {
  let root: string;
  let folders: number;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "unica-ref-replace-"));
    folders = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // The folders of one run that sends these pages (by default, both pages alike).
  function writeRun(page: Page, refs: string[] = REFS, ext = "jpg") {
    folders += 1;
    const recordsDir = join(root, `run-${folders}`, "records");
    const photosDir = join(root, `run-${folders}`, "photos");
    for (const dir of [recordsDir, photosDir]) mkdirSync(dir, { recursive: true });
    const { photo } = page;
    for (const [i, ref] of refs.entries()) {
      writeFileSync(join(recordsDir, `p${i}.json`), JSON.stringify(makePage(ref, page.title)));
      if (photo) writeFileSync(join(photosDir, `p${i}.${ext}`), photo);
    }
    writeFileSync(join(recordsDir, "status.json"), JSON.stringify(Object.fromEntries(refs.map((ref) => [ref, page.status]))));
    const photos = photo
      ? refs.map((ref, i) => ({ file: `p${i}.${ext}`, sha256: sha256Hex(photo), original_name: "p.jpg", width: 9, height: 9, source_ref: ref }))
      : [];
    writeFileSync(join(photosDir, "photos-manifest.json"), JSON.stringify({ version: 1, photos }));
    return (store: ReferenceStore, over: { dryRun?: boolean; replace?: boolean } = {}): Promise<ImportResult> =>
      importReferenceRecords({ recordsDir, photosDir, store, replace: true, ...over });
  }

  const faults = ["the call fails", "the answer is lost", "the process stops before the call", "the process stops after the call"] as const;
  const faultCases = Object.keys(KINDS).flatMap((kind) =>
    (["today's path", "new path", ...(KINDS[kind].photo ? ["no row"] : [])] as StartForm[]).map((form) => ({ kind, form })),
  );

  it.each(faultCases)("$kind, $form: a failure at any step and the next run", async ({ kind, form }) => {
    const page = KINDS[kind];
    const run = writeRun(page);
    const clean = startStore(form);
    expect((await run(clean)).problems).toEqual([]);
    const steps = callCount(clean);
    const wanted = pageText(page, page.photo ?? START.photo);
    expect([...pagesOf(clean).values()]).toEqual([wanted, wanted]);
    const allowed = new Set([wanted, ...(form === "no row" ? [] : [pageText(START)])]);

    for (const fault of faults) {
      for (let at = 0; at < steps; at += 1) {
        const label = `${fault}, call ${at + 1} of ${steps}`;
        const store = startStore(form);
        let stopped = false;
        // The import catches an error of a call, so a wrong page is kept here and not thrown.
        const wrongPages: string[] = [];
        const checkPages = () => {
          for (const [ref, held] of pagesOf(store)) if (!allowed.has(held)) wrongPages.push(`${label}, ${ref}: ${held}`);
        };
        const failing = watched(store, {
          before: (n) => {
            if (stopped) throw new Error("the process is gone");
            if (n !== at) return;
            if (fault === "the process stops before the call") stopped = true;
            if (fault === "the call fails" || stopped) throw new Error("no connection");
          },
          after: (n) => {
            checkPages();
            if (n !== at) return;
            if (fault === "the process stops after the call") stopped = true;
            if (fault === "the answer is lost") throw new Error("no answer");
          },
        });
        const failed = await run(failing).catch((err: Error) => err);
        if (!(failed instanceof Error)) {
          // A process that stops after its last call had already finished its work.
          const lastCall = fault === "the process stops after the call" && at === steps - 1;
          expect(failed.ok, label).toBe(lastCall);
          if (!lastCall) expect(formatImportResult(failed), label).toContain("problem:");
        }
        checkPages();
        if (!(failed instanceof Error) && (fault === "the call fails" || fault === "the answer is lost")) {
          expectNoNamedPhotoInUse(store, failed, label);
          const call = clean.calls[at];
          const ref = REFS.find((r) => call.endsWith(`:${r}`));
          const sent = page.photo ?? OLD;
          const uploads = clean.calls.includes(`uploadObject:${newPathOf(REFS[0], sent)}`);
          const rowCallFailed = /^(insertRow|updateRow):/.test(call) && fault === "the call fails";
          // An upload with an answer, and a row that was not written.
          if (ref && uploads && rowCallFailed) {
            expect(failed.unreferencedPhotos, label).toEqual([newPathOf(ref, sent)]);
            expect(formatImportResult(failed), label).toContain("unreferenced_photo:");
          }
          // An upload with no answer.
          if (call.startsWith("uploadObject:")) {
            expect(failed.unreferencedPhotos, label).toEqual([]);
            expect(failed.problems.join(), label).toContain("may be in storage");
          }
        }

        const retry = await run(watched(store, { after: checkPages }));
        expect(wrongPages).toEqual([]);
        expect(retry.problems, label).toEqual([]);
        expect(endState(store), label).toEqual(endState(clean));
        expectNoNamedPhotoInUse(store, retry, label);
        const again = await run(store);
        expect(again.counts, label).toMatchObject({ inserted: 0, replaced: 0, skipped: 2, photosUploaded: 0 });
        expect(again.leftoverPhotos, label).toEqual([]);
      }
    }
  });

  const writeCalls = (store: MemoryReferenceStore) => store.calls.filter((call) => /^(insertRow|uploadObject|updateRow):/.test(call));

  it.each(faultCases)("$kind, $form: the dry run writes nothing, lists what the real run does and gives each new path", async ({ kind, form }) => {
    const page = KINDS[kind];
    const run = writeRun(page);
    const [dryStore, store] = [startStore(form), startStore(form)];
    const before = structuredClone(endState(dryStore));
    const dry = await run(dryStore, { dryRun: true });
    expect(writeCalls(dryStore)).toEqual([]);
    expect(endState(dryStore)).toEqual(before);
    const real = await run(store);
    expect({ ...dry, dryRun: false }).toEqual(real);
    expect(real.newPhotoPaths).toEqual(
      page.photo === NEW && form !== "no row" ? REFS.map((ref) => ({ ref, path: newPathOf(ref, NEW) })) : [],
    );
    expect(writeCalls(store).some((call) => call.startsWith("uploadObject:"))).toBe(page.photo === NEW || form === "no row");
  });

  it("keeps each older path while its object has the bytes of the photo, also when the text changes", async () => {
    const refs = Array.from({ length: 59 }, (_, i) => `demo:Z:${i + 1}a`);
    const store = new MemoryReferenceStore();
    for (const ref of refs) {
      const path = `${ref.replaceAll(":", "/")}.jpg`;
      store.objects.set(path, { bytes: OLD, contentType: "image/jpeg" });
      store.rows.set(ref, { source_ref: ref, kind: "page", path, transcript: makePage(ref, START.title), transcript_status: START.status, updated_at: "start" });
    }
    const before = structuredClone(endState(store));
    const same = writeRun(START, refs);
    for (const replace of [true, false]) {
      store.calls = [];
      expect(await same(store, { replace })).toMatchObject({ ok: true, counts: { skipped: 59, replaced: 0, skippedDifferent: 0, photosUploaded: 0 }, newPhotoPaths: [], leftoverPhotos: [] });
      expect(writeCalls(store)).toEqual([]);
      expect(endState(store)).toEqual(before);
    }

    const changed = await writeRun({ ...START, title: "New text" }, refs)(store);
    expect(changed).toMatchObject({ ok: true, counts: { replaced: 59, photosUploaded: 0 }, newPhotoPaths: [], leftoverPhotos: [] });
    expect([...store.rows.values()].map((row) => row.path)).toEqual(refs.map((ref) => `${ref.replaceAll(":", "/")}.jpg`));
    expect([...store.objects]).toEqual(before.objects);
  });

  // What happens at the path of the photo after the plan and before the row gets it.
  const atThePath: Array<{ name: string; form: StartForm; page: Page; path: string; change: (store: MemoryReferenceStore, path: string) => void; problem: RegExp | null }> = (
    [
      { name: "other bytes", bytes: OLD, problem: /has other bytes/ },
      { name: "the photo, from another run", bytes: NEW, problem: null },
    ] as const
  ).flatMap(({ name, bytes, problem }) =>
    (["today's path", "no row"] as StartForm[]).map((form) => ({
      name,
      form,
      page: KINDS["text and photo"],
      path: newPathOf(REFS[0], NEW),
      change: (store: MemoryReferenceStore, path: string) => store.objects.set(path, { bytes, contentType: "image/jpeg" }),
      problem,
    })),
  );
  it.each([
    ...atThePath,
    { name: "the object of the kept path is gone", form: "new path" as const, page: KINDS["text only"], path: newPathOf(REFS[0], OLD), change: (store: MemoryReferenceStore, path: string) => store.objects.delete(path), problem: /is not in the bucket any more/ },
    { name: "the object of the kept older path is gone", form: "today's path" as const, page: KINDS["text only"], path: "demo/Z/1a.jpg", change: (store: MemoryReferenceStore, path: string) => store.objects.delete(path), problem: /is not in the bucket any more/ },
  ])("$name at the path after the plan ($form)", async ({ form, page, path, change, problem }) => {
    const run = writeRun(page, [REFS[0]]);
    const clean = startStore(form);
    await run(clean);
    // The last read of the object before the row write (and before an upload).
    const lookups = clean.calls.flatMap((call, i) => (call === `objectSha256:${path}` ? [i] : []));
    const at = clean.calls.findIndex((call) => call.startsWith("uploadObject:")) - 1;
    const store = startStore(form);
    const before = structuredClone([...store.rows]);
    const result = await run(
      watched(store, {
        before: (n) => {
          if (n === (at >= 0 ? at : lookups.at(-1))) change(store, path);
        },
      }),
    );
    if (problem === null) {
      expect(result.problems).toEqual([]);
      expect(result.counts.photosUploaded).toBe(0);
      expect(pagesOf(store).get(REFS[0])).toBe(pageText(page));
      return;
    }
    expect(result).toMatchObject({ ok: false, stopped: true, counts: { replaced: 0, inserted: 0 } });
    expect(result.problems.join("\n")).toMatch(problem);
    expect([...store.rows]).toEqual(before);
    expect(writeCalls(store)).toEqual([]);
  });

  it("stops when the object that it uploaded does not have the bytes of the photo", async () => {
    const store = startStore("today's path");
    const upload = store.uploadObject.bind(store);
    store.uploadObject = (path, bytes, contentType) => upload(path, bytes.slice(1), contentType);
    const result = await writeRun(KINDS["text and photo"])(store);
    expect(result.problems.join("\n")).toMatch(/has other bytes/);
    expect([...pagesOf(store).values()]).toEqual([pageText(START), pageText(START)]);
  });

  it.each(["text", "path", "status", "updated_at", "row"])("writes nothing for a row whose %s a person changed after the plan", async (what) => {
    const store = startStore("today's path");
    const run = writeRun(KINDS["text and photo"], [REFS[0]]);
    const planned = startStore("today's path");
    await run(planned);
    const firstWrite = planned.calls.findIndex((call) => call.startsWith("uploadObject:"));
    const lastRead = planned.calls.slice(0, firstWrite).findLastIndex((call) => call.startsWith("findExisting:"));
    let byPerson: unknown;
    const result = await run(
      watched(store, {
        before: (n) => {
          const row = store.rows.get(REFS[0]);
          if (n !== lastRead || row === undefined) return;
          if (what === "text") row.transcript = makePage(REFS[0], "Changed by hand");
          if (what === "path") row.path = "demo/Z/2b.jpg";
          if (what === "status") row.transcript_status = "human_checked";
          if (what === "updated_at") row.updated_at = "later";
          if (what === "row") store.rows.delete(REFS[0]);
          byPerson = structuredClone([...store.rows]);
        },
      }),
    );
    expect(result).toMatchObject({ ok: false, stopped: true, replacedRefs: [] });
    expect(formatImportResult(result)).toContain(`problem: ${REFS[0]}: the row changed or was removed`);
    expect([...store.rows]).toEqual(byPerson);
    expect(writeCalls(store)).toEqual([]);
  });

  // Every way in which the run would use a path: an upload, or a photo that is there already.
  const takers: Array<{ name: string; form: StartForm; kind: keyof typeof KINDS; path: string; objectIsThere: boolean; stops: boolean }> = [
    ...([true, false] as const).flatMap((objectIsThere) =>
      (["no row", "today's path", "new path"] as const).map((form) => ({
        name: "a new photo", form, kind: "text and photo", path: newPathOf(REFS[0], NEW), objectIsThere, stops: true,
      })),
    ),
    { name: "the older path that the row keeps with its photo", form: "today's path", kind: "text only", path: "demo/Z/1a.jpg", objectIsThere: true, stops: true },
    { name: "the path that the row keeps with its photo", form: "new path", kind: "text only", path: newPathOf(REFS[0], OLD), objectIsThere: true, stops: true },
    { name: "the path of the row, with no object there now", form: "new path", kind: "text only", path: newPathOf(REFS[0], OLD), objectIsThere: false, stops: true },
    { name: "the path that the row keeps with no photo sent", form: "today's path", kind: "lower status, no photo sent", path: "demo/Z/1a.jpg", objectIsThere: true, stops: false },
    { name: "the old path that the row leaves", form: "today's path", kind: "text and photo", path: "demo/Z/1a.jpg", objectIsThere: true, stops: false },
  ];
  it.each(takers)("$name ($form, object there: $objectIsThere) that a row of another page uses: stops $stops", async ({ form, kind, path, objectIsThere, stops }) => {
    for (const dryRun of [true, false]) {
      for (const replace of form === "no row" ? [true, false] : [true]) {
        const store = startStore(form);
        store.objects.set(path, { bytes: kind === "text and photo" && stops ? NEW : OLD, contentType: "image/jpeg" });
        if (!objectIsThere) store.objects.delete(path);
        const other = "demo:Z:9a";
        store.rows.set(other, { source_ref: other, kind: "page", path, transcript: makePage(other, "Other page"), transcript_status: "human_checked", updated_at: "start" });
        const before = structuredClone([endState(store)]);
        const result = await writeRun(KINDS[kind])(store, { dryRun, replace });
        expect(result.ok, `${dryRun}`).toBe(!stops);
        if (stops) {
          expect(result.stopped).toBeUndefined();
          expect(result.problems).toHaveLength(1);
          expect(result.problems[0]).toContain(`"${path}"`);
          expect(result.problems[0]).toContain(`"${other}"`);
          expect(writeCalls(store)).toEqual([]);
          expect([endState(store)]).toEqual(before);
        }
        expect(store.rows.get(other)).toMatchObject({ path, transcript: makePage(other, "Other page") });
      }
    }
  });

  it.each(["demo/Z/1a.png", "demo/Z/1a.jpeg", "elsewhere/x.jpg", "demo/Z/1a.jpg", newPathOf(REFS[0], OLD)])(
    "names no old photo at %s when no object is there",
    async (path) => {
      for (const dryRun of [true, false]) {
        const store = startStore("today's path");
        store.objects.clear();
        for (const row of store.rows.values()) row.path = row.source_ref === REFS[0] ? path : null;
        const result = await writeRun(KINDS["photo only"])(store, { dryRun });
        expect(result).toMatchObject({ ok: true, counts: { replaced: 2 }, leftoverPhotos: [] });
      }
    },
  );

  it("takes .jpeg and .jpg as one type: new paths end in .jpg, and the other ending with the same bytes is the same", async () => {
    const sha = sha256Hex(OLD);
    for (const sent of ["jpg", "jpeg", "JPG", "JPEG"]) {
      expect(buildReferencePhotoPath(REFS[0], `a.${sent}`, sha)).toMatchObject({ ok: true, path: newPathOf(REFS[0], OLD) });
      for (const stored of ["demo/Z/1a.jpg", "demo/Z/1a.jpeg", newPathOf(REFS[0], OLD), newPathOf(REFS[0], OLD).replace(/jpg$/, "jpeg")]) {
        for (const [bytes, replaced] of [[OLD, 0], [NEW, 1]] as const) {
          const store = startStore("today's path");
          store.rows.delete(REFS[1]);
          store.objects.clear();
          const row = store.rows.get(REFS[0]);
          if (row) row.path = stored;
          store.objects.set(stored, { bytes, contentType: "image/jpeg" });
          const run = writeRun(START, [REFS[0]], sent);
          const result = await run(store);
          const label = `${sent}, ${stored}, ${replaced}`;
          if (replaced && stored === newPathOf(REFS[0], OLD)) {
            expect(result.ok, label).toBe(false);
            continue;
          }
          expect(result, label).toMatchObject({ ok: true, counts: { replaced, skipped: 1 - replaced, photosUploaded: replaced } });
          if (replaced === 0) expect(writeCalls(store), label).toEqual([]);
          expect(store.rows.get(REFS[0])?.path, label).toBe(replaced ? newPathOf(REFS[0], OLD) : stored);
        }
      }
    }
  });

  it("says which photos may be leftovers when the rows cannot be read at the end", async () => {
    const store = startStore("today's path");
    const refsByPath = store.refsByPath.bind(store);
    store.refsByPath = async (paths) => {
      if (store.calls.some((call) => call.startsWith("updateRow:"))) throw new Error("no connection");
      return refsByPath(paths);
    };
    const result = await writeRun(KINDS["photo only"])(store);
    expect(result).toMatchObject({ ok: false, counts: { replaced: 2 }, leftoverPhotos: [] });
    expect(result.problems.join("\n")).toContain('"demo/Z/1a.jpg", "demo/Z/2b.jpg"');
  });

  it.each([false, true])("names the old photo in the run whose row write lost its answer (status changed by a person then: %s)", async (changed) => {
    const store = startStore("today's path");
    const update = store.updateRow.bind(store);
    store.updateRow = async (row, seen) => {
      await update(row, seen);
      if (changed) Object.assign(store.rows.get(REFS[0]) ?? {}, { transcript_status: "double_read" });
      throw new Error("no answer");
    };
    const result = await writeRun(KINDS["text and photo"], [REFS[0]])(store);
    expect(result).toMatchObject({ ok: false, counts: { replaced: 0 }, leftoverPhotos: ["demo/Z/1a.jpg"] });
    expect(result.problems.join("\n")).toContain(changed ? "may or may not be replaced" : "holds the new values");
  });

  describe("two runs that overlap", () => {
    const REF = REFS[0];
    // The photo and the text of each run are its own, also when both runs are of one kind.
    const pageOfRun = (kind: string, name: string): Page => {
      const page = KINDS[kind];
      return {
        title: page.title === START.title ? page.title : `Text ${name}`,
        status: page.status,
        photo: page.photo === NEW ? new TextEncoder().encode(`photo ${name}`) : page.photo,
      };
    };
    const wantedText = (page: Page): string => pageText(page, page.photo ?? START.photo);
    // What a run can make of the page. With no photo it keeps the photo of the row: that of the start, or
    // the photo that the other run gave to this same text.
    const outcomesOf = (page: Page, other: Page): string[] =>
      page.photo
        ? [pageText(page)]
        : [START.photo, other.title === page.title ? other.photo : null].flatMap((photo) => (photo ? [pageText(page, photo)] : []));
    const kindPairs = Object.keys(KINDS).flatMap((a) => Object.keys(KINDS).map((b) => ({ a, b })));
    const pairCases = kindPairs.flatMap((pair) => (["today's path", "new path"] as StartForm[]).map((form) => ({ ...pair, form })));
    const heldOf = (store: MemoryReferenceStore) => pagesOf(store).get(REF);

    it.each(pairCases)("$a, with $b of another run at any step ($form)", async ({ a, b, form }) => {
      const [pageA, pageB] = [pageOfRun(a, "A"), pageOfRun(b, "B")];
      const [runA, runB] = [writeRun(pageA, [REF]), writeRun(pageB, [REF])];
      const alone = startStore(form);
      alone.rows.delete(REFS[1]);
      expect((await runA(alone)).problems).toEqual([]);
      const steps = callCount(alone);
      const updateAt = alone.calls.indexOf(`updateRow:${REF}`);
      const uploadAt = alone.calls.findIndex((call) => call.startsWith("uploadObject:"));
      expect(updateAt).toBeGreaterThan(0);

      for (let at = 1; at <= steps; at += 1) {
        const label = `before call ${at + 1} of ${steps}`;
        const store = startStore(form);
        store.rows.delete(REFS[1]);
        const allowed = [pageText(START), ...outcomesOf(pageA, pageB), ...outcomesOf(pageB, pageA)];
        const wrongPages: string[] = [];
        const checkPages = () => {
          const held = heldOf(store);
          if (held === undefined || !allowed.includes(held)) wrongPages.push(`${label}: ${held}`);
        };
        let resultB: ImportResult | undefined;
        const between = async (n: number) => {
          if (n !== at) return;
          resultB = await runB(watched(store, { after: checkPages }));
          expectNoNamedPhotoInUse(store, resultB, label);
        };
        const resultA = await runA(watched(store, { before: between, after: checkPages }));
        expectNoNamedPhotoInUse(store, resultA, label);
        await between(at === steps ? at : -1);
        checkPages();
        expect(wrongPages).toEqual([]);

        if (at <= updateAt) {
          // Run B wrote the row after run A read it: run A does not write the row and says so.
          expect(resultB?.problems, label).toEqual([]);
          expect(heldOf(store), label).toBe(wantedText(pageB));
          expect(resultA, label).toMatchObject({ ok: false, counts: { replaced: 0 }, replacedRefs: [], newPhotoPaths: [], statusLowered: [] });
          expect(formatImportResult(resultA), label).toContain(`problem: ${REF}: the row changed`);
          const uploaded = resultA.counts.photosUploaded;
          expect(resultA.unreferencedPhotos, label).toHaveLength(uploaded);
          if (uploadAt > 0 && at > uploadAt) expect(uploaded, label).toBe(1);
        } else {
          // Run A wrote the row first, so run B replaced the row of run A, or refused to.
          expect(resultA.ok, label).toBe(true);
          expect(heldOf(store), label).toBe(resultB?.ok ? outcomesOf(pageB, pageA).at(-1) : wantedText(pageA));
        }
      }
    });

    it.each(Object.keys(KINDS))("%s twice with the same files gives one row and never an error about bytes", async (kind) => {
      const [runA, runB] = [writeRun(KINDS[kind], [REF]), writeRun(KINDS[kind], [REF])];
      for (let at = 1; at <= 8; at += 1) {
        const store = startStore("today's path");
        let resultB: ImportResult | undefined;
        const resultA = await runA(
          watched(store, {
            before: async (n) => {
              if (n === at) resultB = await runB(store);
            },
          }),
        );
        expect(heldOf(store)).toBe(wantedText(KINDS[kind]));
        expect(resultA.ok || formatImportResult(resultA).includes(`${REF}: the row changed`) || formatImportResult(resultA).includes("Unexpected overwrite")).toBe(true);
        expect(resultB === undefined || resultB.ok).toBe(true);
      }
    });

    it.each([true, false])("a first import: the unique key lets one run write the row, at any step (replace %s)", async (replace) => {
      const pages = ["A", "B"].map((name) => pageOfRun("text and photo", name));
      const [runA, runB] = pages.map((page) => writeRun(page, [REF]));
      const alone = startStore("no row");
      await runA(alone, { replace });
      const insertAt = alone.calls.indexOf(`insertRow:${REF}`);
      expect(insertAt).toBeGreaterThan(1);
      for (let at = 1; at <= insertAt; at += 1) {
        const store = startStore("no row");
        const resultA = await runA(
          watched(store, {
            before: async (n) => {
              if (n === at) expect((await runB(store, { replace })).problems).toEqual([]);
            },
          }),
          { replace },
        );
        // Run B wrote the row first. Run A writes nothing over it and names its own photo.
        expect(heldOf(store)).toBe(wantedText(pages[1]));
        expect(resultA.counts.inserted).toBe(0);
        expect(resultA.unreferencedPhotos).toEqual([newPathOf(REF, pages[0].photo ?? OLD)]);
        expect(formatImportResult(resultA)).toContain("when the row of another run stays, look at that row and at --replace");
        expect(resultA.ok).toBe(!replace);
        if (replace) expect(formatImportResult(resultA)).toContain(`problem: ${REF}: another run wrote this row first`);
        else expect(resultA.skippedDifferentRefs).toEqual([REF]);
      }
    });

    it("holds one whole page at each moment, for any order of the calls of two runs", async () => {
      const kinds = fc.constantFrom(...Object.keys(KINDS));
      const forms = fc.constantFrom<StartForm>("today's path", "new path", "no row");
      await fc.assert(
        fc.asyncProperty(kinds, kinds, forms, fc.array(fc.nat(1), { maxLength: 40 }), async (a, b, form, order) => {
          fc.pre(form !== "no row" || (KINDS[a].photo !== null && KINDS[b].photo !== null));
          const pages = [pageOfRun(a, "A"), pageOfRun(b, "B")];
          const store = startStore(form);
          store.rows.delete(REFS[1]);
          const allowed = [
            ...(form === "no row" ? [] : [pageText(START)]),
            ...outcomesOf(pages[0], pages[1]),
            ...outcomesOf(pages[1], pages[0]),
          ];
          const wrongPages: Array<string | undefined> = [];
          const checkPages = () => {
            const held = heldOf(store);
            if (held === undefined ? form !== "no row" : !allowed.includes(held)) wrongPages.push(held);
          };

          // Each call waits until it is the turn of its run. A run that has ended has no turns.
          const waiting = new Map<number, () => void>();
          const live = new Set([0, 1]);
          const turn = [...order];
          const next = () => {
            if (waiting.size === 0 || waiting.size < live.size) return;
            const wish = turn.shift() ?? 0;
            const run = waiting.has(wish) ? wish : [...waiting.keys()][0];
            const go = waiting.get(run);
            waiting.delete(run);
            go?.();
          };
          const results = await Promise.all(
            pages.map(async (page, i) => {
              const result = await writeRun(page, [REF])(
                watched(store, {
                  before: () =>
                    new Promise<void>((go) => {
                      waiting.set(i, go);
                      next();
                    }),
                  after: checkPages,
                }),
              );
              expectNoNamedPhotoInUse(store, result, `run ${i}`);
              live.delete(i);
              next();
              return result;
            }),
          );
          expect(wrongPages).toEqual([]);
          expect(results.some((result) => result.ok)).toBe(true);
        }),
        { numRuns: 300 },
      );
    });
  });
});
