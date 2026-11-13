import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { QuestionPackage } from "@/lib/question-package";
import { applyTransform, perspectiveTransform } from "@/lib/scan-calibration";
import { isFenceRefusal, readScanPreview, runScanCrops, scanPartPath, type ScanCropStore, type ScanFrame } from "@/lib/scan-crops";
import { memoryScanCropStore } from "@/lib/scan-crops-memory";
import { blankPage, cropCut, cutOut, drawBoxOutline, drawDigit, drawMark, drawPrintedContent, drawQr, greyRaster, pagePng, photoJpeg, photographed, readDigit, uprightCorners } from "@/lib/scan-synthetic";
import { SCAN_MARKS, sha256Hex, type Box, type PagePrintContract, type Point } from "@/lib/workbook-print-contract";
import { pageUrl } from "@/lib/workbook-render";

// The crop job through its public functions and the in-memory store, with a clock the test holds. Each test names what
// would disprove it. The real Storage fence and policies are proved on the hosted database: scripts/scan-crops-hosted.ts.

const W = 1275, H = 1650, REVISION = "a".repeat(28);
const PARENT = "00000000-0000-4000-8000-0000000000f1", PHOTO = "00000000-0000-4000-8000-0000000000a1";
const ref = { parent: PARENT, photo: PHOTO };
const token = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const POINTS: Record<(typeof SCAN_MARKS)[number], Point> = { tl: { x: 34.375, y: 34.375 }, tr: { x: 1240.625, y: 34.375 }, br: { x: 1240.625, y: 1615.625 }, bl: { x: 34.375, y: 1615.625 } };
const ANSWERS: { box: Box; digit: number }[] = Array.from({ length: 6 }, (_, i) => ({ box: { x: 120 + (i % 3) * 340, y: 800 + Math.floor(i / 3) * 300, width: 320, height: 280 }, digit: (i * 3 + 2) % 10 }));
const TOKEN = "test-page-token-0001";
const pkg = (id: string, value = 12): QuestionPackage => ({
  id, item: { format: "write-number", scorable: true, parentChecked: false, regions: [{ id: "a", kind: "box", label: null, answer: { type: "number", value } }], checks: [], error: null },
} as unknown as QuestionPackage);
const circle = (id: string): QuestionPackage => ({ id, item: { format: "circle", scorable: true, parentChecked: false, regions: [{ id: "a", kind: "choice", answer: "x" }], checks: [], error: null } } as unknown as QuestionPackage);

let printedPng: Uint8Array, photoBytes: Uint8Array, contract: PagePrintContract;

function drawn(written: boolean) {
  const r = blankPage(W, H);
  for (const m of SCAN_MARKS) drawMark(r, m, POINTS[m]);
  drawPrintedContent(r);
  drawQr(r, { x: 1020, y: 1440, width: 170, height: 170 }, pageUrl(TOKEN));
  for (const a of ANSWERS) { drawBoxOutline(r, a.box); if (written) drawDigit(r, a.box, a.digit); }
  return r;
}

beforeAll(async () => {
  printedPng = await pagePng(drawn(false));
  const size = { width: 1500, height: 1900 };
  photoBytes = await photoJpeg(photographed(drawn(true), size, uprightCorners(size, { width: W, height: H }, 70), { shade: 0.2 }));
  contract = {
    version: 1, workbookId: "w", page: 3, label: "D1-P1", day: 1, pageOfDay: 1,
    coordinates: { units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait", image: { width: W, height: H }, cssPage: { width: 816, height: 1056 }, scale: { x: W / 816, y: H / 1056 } },
    marks: { anchor: "outer-corner", order: [...SCAN_MARKS], points: POINTS },
    fingerprints: { content: "c", image: await sha256Hex(printedPng) },
  };
});

function setup(o: { book?: string | null; photoRevision?: string | null; contract?: PagePrintContract | null; bytes?: Uint8Array; questions?: ScanFrame["page"]["questions"] } = {}) {
  let clock = Date.parse("2026-11-05T12:00:00Z");
  const m = memoryScanCropStore({ now: () => clock });
  m.printed.set("page.png", printedPng);
  const book = o.book === undefined ? REVISION : o.book;
  m.photos.set(PHOTO, {
    parent: PARENT, state: "saved", createdAt: clock, expiresAt: clock + 90 * 86_400_000, bytes: o.bytes ?? photoBytes, storedBytes: 1000,
    frame: {
      printedRevision: o.photoRevision === undefined ? REVISION : o.photoRevision,
      book: { printedRevision: book },
      page: {
        printContract: o.contract === undefined ? contract : o.contract, imagePath: "page.png", qrToken: TOKEN, others: [],
        questions: o.questions ?? ANSWERS.map((a, i) => ({ number: i + 1, package: pkg(`q${i + 1}`), regions: [{ id: "a", kind: "box", box: a.box }] })),
      },
    },
  });
  return { ...m, advance: (ms: number) => { clock += ms; } };
}

const cropRaster = async (m: ReturnType<typeof setup>, part: string, t: string) => greyRaster(m.objects.get(scanPartPath(PARENT, PHOTO, t, part))!);

describe("making the crops", () => {
  it("stores the straightened page and one numbered crop per item, each holding its own written answer", async () => {
    // Disproved if crop 2 holds another question's digit, or a stored crop is not a real image of its box.
    const m = setup();
    const preview = await runScanCrops(m.store, ref, token(1));
    if (preview.status !== "ready") throw new Error(JSON.stringify(preview));
    expect(preview.crops.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(m.filesOf(PHOTO).sort()).toEqual([...["straight", ...preview.crops.map((c) => c.part)].map((p) => `${token(1)}-${p}.jpg`)].sort());
    for (const [i, a] of ANSWERS.entries()) {
      const crop = await cropRaster(m, `crop-${i + 1}`, token(1));
      expect(readDigit(crop, cropCut(a.box), a.box), `crop ${i + 1}`).toBe(a.digit);
      // Adjacent positive control: the neighbour's digit differs, and this crop does not hold it.
      const next = ANSWERS[(i + 1) % ANSWERS.length];
      expect(next.digit).not.toBe(a.digit);
    }
    const straight = await sharp(m.objects.get(scanPartPath(PARENT, PHOTO, token(1), "straight"))!).metadata();
    expect([straight.width, straight.height, preview.straight.width, preview.straight.height]).toEqual([W, H, W, H]);
    expect(m.photos.get(PHOTO)!.storedBytes).toBeGreaterThan(1000);
  });

  it("keeps a colour photo in colour, and reads it the same", async () => {
    // Disproved if the job only works on grey photos: a phone photo is colour.
    const grey = await greyRaster(photoBytes);
    const rgb = new Uint8Array(grey.width * grey.height * 3);
    for (let i = 0; i < grey.data.length; i++) { rgb[3 * i] = grey.data[i]; rgb[3 * i + 1] = Math.round(grey.data[i] * 0.97); rgb[3 * i + 2] = Math.round(grey.data[i] * 0.85); }
    const colour = await sharp(Buffer.from(rgb), { raw: { width: grey.width, height: grey.height, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
    const m = setup({ bytes: colour });
    expect((await runScanCrops(m.store, ref, token(1))).status).toBe("ready");
    const stored = m.objects.get(scanPartPath(PARENT, PHOTO, token(1), "crop-1"))!;
    const { channels, space } = await sharp(stored).metadata();
    expect([channels, space]).toEqual([3, "srgb"]);
    expect(readDigit(await greyRaster(stored), cropCut(ANSWERS[0].box), ANSWERS[0].box)).toBe(ANSWERS[0].digit);
  });

  it("the second call gets the first call's work, with no new files", async () => {
    const m = setup();
    await runScanCrops(m.store, ref, token(1));
    const before = m.filesOf(PHOTO).sort();
    const again = await runScanCrops(m.store, ref, token(2));
    expect(again.status).toBe("ready");
    expect(m.filesOf(PHOTO).sort()).toEqual(before);
  });

  it("two calls at once: one works and one waits, and they converge on one set of files", async () => {
    // Disproved if both write, which would leave two token sets.
    const m = setup();
    const answers = await Promise.all([runScanCrops(m.store, ref, token(1)), runScanCrops(m.store, ref, token(2))]);
    expect(answers.map((a) => a.status).sort()).toEqual(["busy", "ready"]);
    expect(new Set(m.filesOf(PHOTO).map((n) => n.slice(0, 36))).size).toBe(1);
    expect((await readScanPreview(m.store, ref)).status).toBe("ready");
  });

  it("crops only the single-box whole-number items of a mixed page, and names the others", async () => {
    const m = setup({ questions: [
      { number: 1, package: pkg("q1"), regions: [{ id: "a", kind: "box", box: ANSWERS[0].box }] },
      { number: 2, package: circle("q2"), regions: [{ id: "a", kind: "choice", box: ANSWERS[1].box }] },
      { number: 3, package: null, regions: null },
    ] });
    const preview = await runScanCrops(m.store, ref, token(1));
    if (preview.status !== "ready") throw new Error(JSON.stringify(preview));
    expect(preview.crops.map((c) => c.number)).toEqual([1]);
    expect(preview.notSupported).toEqual([2, 3]);
    expect(m.filesOf(PHOTO)).toHaveLength(2);
  });

  it("saves the calibration's geometry with the revision, and no image bytes", async () => {
    const m = setup();
    await runScanCrops(m.store, ref, token(1));
    const stored = await m.store.calibration(ref);
    expect(stored).toMatchObject({ state: "ready", revision: REVISION, result: { calibration: { revision: REVISION, version: 1 } } });
    expect(JSON.stringify(stored).length).toBeLessThan(5000);
  });
});

describe("results made before the sheet check", () => {
  it.each([undefined, 0])("rechecks a ready result with version %s before returning its crops", async (sheetCheck) => {
    // Disproved if an old ready result reaches the preview without reading the photo again.
    const m = setup();
    expect((await runScanCrops(m.store, ref, token(1))).status).toBe("ready");
    m.calibrations.get(PHOTO)!.result!.sheetCheck = sheetCheck;
    expect(await readScanPreview(m.store, ref)).toEqual({ status: "not-started" });
    let reads = 0;
    const store: ScanCropStore = { ...m.store, photoBytes: async (r) => { reads++; return m.store.photoBytes(r); } };
    const answers = await Promise.all([runScanCrops(store, ref, token(2)), runScanCrops(store, ref, token(3))]);
    expect(answers.map((a) => a.status).sort()).toEqual(["busy", "ready"]);
    expect(reads).toBe(1);
    expect(m.calibrations.get(PHOTO)).toMatchObject({ state: "ready", result: { sheetCheck: 1 } });
    expect(m.filesOf(PHOTO).every((name) => name.startsWith(token(2)))).toBe(true);
  });

  it("removes the old crops when the photo fails the new check", async () => {
    // Disproved if an old ready result survives a failed recheck or its files remain available.
    const m = setup();
    await runScanCrops(m.store, ref, token(1));
    delete m.calibrations.get(PHOTO)!.result!.sheetCheck;
    m.photos.get(PHOTO)!.bytes = await photoJpeg(blankPage(800, 1000));
    expect(await runScanCrops(m.store, ref, token(2))).toEqual({ status: "refused", reason: "marks-missing" });
    expect(m.filesOf(PHOTO)).toEqual([]);
    expect(await readScanPreview(m.store, ref)).toEqual({ status: "refused", reason: "marks-missing" });
  });
});

describe("refusals and books with no contract", () => {
  it("a legacy book keeps its photo and makes no files", async () => {
    // Disproved if a book with no contract gets a crop, or if its photo is touched.
    const m = setup({ book: null, contract: null, photoRevision: "2026-11-01 10:00:00+00" });
    expect(await runScanCrops(m.store, ref, token(1))).toEqual({ status: "unavailable", reason: "no-contract" });
    expect(m.filesOf(PHOTO)).toEqual([]);
    expect(m.photos.get(PHOTO)!.state).toBe("saved");
    expect(await m.store.calibration(ref)).toBeNull();
  });

  it("an old photo cannot use a new revision's contract", async () => {
    // Positive control: the first test here makes crops from the same bytes under its own revision.
    const m = setup({ book: "b".repeat(28) });
    expect(await runScanCrops(m.store, ref, token(1))).toEqual({ status: "unavailable", reason: "other-revision" });
    expect(m.filesOf(PHOTO)).toEqual([]);
  });

  it("a photo with no marks is refused with no files, and the photo stays", async () => {
    const blank = await photoJpeg(blankPage(800, 1000));
    const m = setup({ bytes: blank });
    expect(await runScanCrops(m.store, ref, token(1))).toEqual({ status: "refused", reason: "marks-missing" });
    expect(m.filesOf(PHOTO)).toEqual([]);
    expect(m.photos.get(PHOTO)!.state).toBe("saved");
    expect(await readScanPreview(m.store, ref)).toEqual({ status: "refused", reason: "marks-missing" });
  });

  it("refuses when the stored page image is not the one the contract fingerprints", async () => {
    // Disproved if a re-rendered or swapped page image can stand in for the printed one.
    const m = setup();
    m.printed.set("page.png", await pagePng(blankPage(W, H)));
    expect(await runScanCrops(m.store, ref, token(1))).toEqual({ status: "refused", reason: "printed-page-changed" });
    expect(m.filesOf(PHOTO)).toEqual([]);
  });
});

describe("the terminal state wins over a job in flight", () => {
  /** Holds the first crop's commit until the test lets it go. */
  function held(m: ReturnType<typeof setup>) {
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const arrived = new Promise<void>((r) => { reached = r; });
    m.hooks.beforeCommit = async (part) => { if (part === "crop-1") { reached(); await gate; } };
    return { release, arrived };
  }

  it("a deletion during a held upload: the late file is refused, no crop survives and no result is saved", async () => {
    // Disproved if a held upload restores a crop, or a late finish marks the photo ready.
    const m = setup();
    const { release, arrived } = held(m);
    const job = runScanCrops(m.store, ref, token(1));
    await arrived;
    m.terminate(PHOTO, "deleted");
    release();
    expect(await job).toEqual({ status: "unavailable", reason: "photo-ended" });
    expect(m.refusals).toContain("crop-1");
    expect(m.filesOf(PHOTO)).toEqual([]);
    expect(m.photos.get(PHOTO)!.state).toBe("deleted");
    expect((await m.store.calibration(ref))!.state).toBe("running");
    expect(await runScanCrops(m.store, ref, token(2))).toEqual({ status: "unavailable", reason: "photo-ended" });
    expect(m.filesOf(PHOTO)).toEqual([]);
  });

  it("clock expiry during a held upload, with no terminal row yet, refuses the same way", async () => {
    // Separate from deletion: only the clock moved, and nothing recorded a state.
    const m = setup();
    const { release, arrived } = held(m);
    const job = runScanCrops(m.store, ref, token(1));
    await arrived;
    m.advance(91 * 86_400_000);
    release();
    expect(await job).toEqual({ status: "unavailable", reason: "photo-ended" });
    expect(m.filesOf(PHOTO)).toEqual([]);
    expect(m.photos.get(PHOTO)!.state).toBe("saved");
    expect(await readScanPreview(m.store, ref)).toEqual({ status: "unavailable", reason: "photo-ended" });
  });

  it("a family frozen for deletion during a held upload refuses the file", async () => {
    const m = setup();
    const { release, arrived } = held(m);
    const job = runScanCrops(m.store, ref, token(1));
    await arrived;
    m.frozen.add(PARENT);
    release();
    expect(await job).toEqual({ status: "unavailable", reason: "photo-ended" });
    expect(m.refusals).toContain("crop-1");
    expect(m.filesOf(PHOTO)).toEqual([]);
    expect(await runScanCrops(m.store, ref, token(2))).toEqual({ status: "unavailable", reason: "photo-ended" });
  });

  it("a retry after a delete starts nothing", async () => {
    const m = setup();
    m.terminate(PHOTO, "expired");
    expect(await runScanCrops(m.store, ref, token(1))).toEqual({ status: "unavailable", reason: "photo-ended" });
    expect(await m.store.calibration(ref)).toBeNull();
  });
});

describe("reading Storage's answer", () => {
  it("knows the fence's refusal by the messages hosted Storage really sends, and nothing else", () => {
    // These two strings are what hosted Storage returned on 2026-11-05 (scripts/scan-crops-hosted.ts checks them again).
    expect(isFenceRefusal("database error, code: P0001")).toBe(true);
    expect(isFenceRefusal("database error, code: 55000")).toBe(true);
    for (const other of ["The resource already exists", "database error, code: 23505", "fetch failed", "Internal Server Error", "code: P00012"]) expect(isFenceRefusal(other), other).toBe(false);
  });
});

describe("leases", () => {
  it("a stalled job loses to the job that took over, and cannot remove its files", async () => {
    // Disproved if the old job's late write lands, or its late finish replaces the new result.
    const m = setup();
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const arrived = new Promise<void>((r) => { reached = r; });
    m.hooks.beforeCommit = async (part) => { if (part === "crop-2") { reached(); await gate; } };
    const stalled = runScanCrops(m.store, ref, token(1));
    await arrived;
    m.hooks.beforeCommit = undefined;
    m.advance(91_000);
    const next = await runScanCrops(m.store, ref, token(2));
    expect(next.status).toBe("ready");
    const after = m.filesOf(PHOTO).sort();
    release();
    expect(await stalled).toMatchObject({ status: "ready" });
    // The old job's refused write and its stale finish changed nothing.
    expect(m.filesOf(PHOTO).sort()).toEqual(after);
    expect(after.every((n) => n.startsWith(token(2)))).toBe(true);
    expect((await m.store.calibration(ref))!.token).toBe(token(2));
    for (const [i, a] of ANSWERS.entries()) expect(readDigit(await cropRaster(m, `crop-${i + 1}`, token(2)), cropCut(a.box), a.box)).toBe(a.digit);
  });

  it("gives up after five attempts, so a photo that keeps failing stops using work", async () => {
    const m = setup();
    m.photos.get(PHOTO)!.bytes = new Uint8Array([1, 2, 3]);
    for (let i = 0; i < 5; i++) {
      await expect(runScanCrops(m.store, ref, token(i + 1))).rejects.toThrow();
      m.advance(91_000);
    }
    expect(await runScanCrops(m.store, ref, token(6))).toEqual({ status: "refused", reason: "failed" });
  });
});

describe("comparing with the child's other pages", () => {
  /** A photo whose frame lists `count` other pages, and a store that counts how many it reads at once and can be slow. */
  function among(count: number, delay = 0) {
    const m = setup();
    m.photos.get(PHOTO)!.frame.page.others = Array.from({ length: count }, (_, i) => `other-${i}.png`);
    for (let i = 0; i < count; i++) m.printed.set(`other-${i}.png`, printedPng);
    let reading = 0, most = 0, reads = 0;
    const store: ScanCropStore = {
      ...m.store,
      async printedBytes(path) {
        if (!path.startsWith("other-")) return m.store.printedBytes(path);
        reading++; reads++; most = Math.max(most, reading);
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        reading--;
        return m.store.printedBytes(path);
      },
    };
    return { m, store, most: () => most, reads: () => reads };
  }

  it("reads them a few at a time, however long the child's history is", async () => {
    // Disproved if the job holds every page at once: 200 pages took 2.21 GB (the PR #637 review).
    const c = among(10, 2);
    const preview = await runScanCrops(c.store, ref, token(1));
    expect(preview.status).toBe("ready");
    expect(c.reads()).toBe(10);
    expect(c.most()).toBeLessThanOrEqual(4);
  }, 60_000);

  it("runs out of time safely: it refuses, stores nothing, and a later call checks again", async () => {
    // Disproved if a photo gets crops with its pages unchecked, or a slow day leaves a lasting refusal on it.
    const c = among(8, 400);
    const answer = await runScanCrops(c.store, ref, token(1), { sheetCheckMs: 50 });
    if (answer.status !== "refused") throw new Error(JSON.stringify(answer));
    expect(answer.reason).toBe("check-timeout");
    // It says when the lease is over: not before the rest of its 90 s, and no later than a little after it.
    expect(answer.retryInMs).toBeGreaterThan(80_000);
    expect(answer.retryInMs).toBeLessThanOrEqual(92_000);
    expect(c.m.filesOf(PHOTO)).toEqual([]);
    expect(await readScanPreview(c.store, ref)).toEqual({ status: "busy" });
    // A call inside the lease starts nothing.
    const reads = c.reads();
    expect(await runScanCrops(c.store, ref, token(3))).toEqual({ status: "busy" });
    expect(c.reads()).toBe(reads);
    // Once the lease has run out, the next call does the whole check.
    c.m.advance(91_000);
    expect((await runScanCrops(c.store, ref, token(2))).status).toBe("ready");
  }, 60_000);

  it("a page image it cannot read fails the job rather than passing the page unchecked", async () => {
    const c = among(2);
    c.m.printed.delete("other-1.png");
    await expect(runScanCrops(c.store, ref, token(1))).rejects.toThrow(/another page's image/);
    expect(c.m.filesOf(PHOTO)).toEqual([]);
  }, 60_000);

  it("refuses when the final batch consumes the remaining time, with no stored result or files", async () => {
    // Disproved if a final batch can cross the deadline after its timer is cleared and still store ready.
    const c = among(1), start = Date.now();
    let clock = start;
    const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
    const store: ScanCropStore = {
      ...c.store,
      async printedBytes(path) {
        const bytes = await c.store.printedBytes(path);
        if (path.startsWith("other-")) clock = start + 35_001;
        return bytes;
      },
    };
    try {
      expect(await runScanCrops(store, ref, token(1))).toMatchObject({ status: "refused", reason: "check-timeout" });
      expect(c.m.calibrations.get(PHOTO)).toMatchObject({ state: "running", result: null });
      expect(c.m.filesOf(PHOTO)).toEqual([]);
    } finally { now.mockRestore(); }
  });

  it.each(["frame", "photoBytes"] as const)("the deadline also bounds a held %s read", async (method) => {
    // Disproved if a held input read ignores the sheet-check limit or stores a late ready result.
    const m = setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const store: ScanCropStore = {
      ...m.store,
      [method]: async (r: Parameters<ScanCropStore[typeof method]>[0]) => { await held; return m.store[method](r); },
    };
    const job = runScanCrops(store, ref, token(1), { sheetCheckMs: 20 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const answer = await Promise.race([job, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 200); })]);
    clearTimeout(timer);
    release();
    await job;
    expect(answer).toMatchObject({ status: "refused", reason: "check-timeout" });
    expect(m.calibrations.get(PHOTO)).toMatchObject({ state: "running", result: null });
    expect(m.filesOf(PHOTO)).toEqual([]);
  });
});

describe("a question the photo's edge cuts off (#912)", () => {
  it("is not cropped, the preview names it, and every other question is cropped with its own answer", async () => {
    // The photo's left edge runs through the first column of answer boxes: questions 1 and 4. The page is placed by its QR
    // code, since both left marks are cut off. Disproved if a crop is made of a cut box (it would show white paper where
    // the answer was), or a question in the photo is lost or holds another answer.
    const size = { width: 1500, height: 1900 }, corners = uprightCorners(size, { width: W, height: H }, 70);
    const t = perspectiveTransform([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], corners)!;
    const left = Math.round(applyTransform(t, { x: 260, y: 0 }).x);
    const bytes = await photoJpeg(cutOut(photographed(drawn(true), size, corners, { shade: 0.2 }), { x: left, y: 0, width: size.width - left, height: size.height }));
    const m = setup({ bytes });
    const preview = await runScanCrops(m.store, ref, token(1));
    if (preview.status !== "ready") throw new Error(JSON.stringify(preview));
    expect(preview.cutOff).toEqual([1, 4]);
    expect(preview.crops.map((c) => c.number)).toEqual([2, 3, 5, 6]);
    expect(m.filesOf(PHOTO).sort()).toEqual(["straight", "crop-2", "crop-3", "crop-5", "crop-6"].map((p) => `${token(1)}-${p}.jpg`).sort());
    for (const n of [2, 3, 5, 6]) {
      const a = ANSWERS[n - 1];
      expect(readDigit(await cropRaster(m, `crop-${n}`, token(1)), cropCut(a.box), a.box), `crop ${n}`).toBe(a.digit);
    }
    // What marking reads: the stored result names the cut questions, and the calibration says how the page was placed.
    const stored = await m.store.calibration(ref);
    expect(stored?.result).toMatchObject({ cutOff: [1, 4], calibration: { placedBy: "qr", missingMarks: ["tl", "bl"] } });
    expect(await readScanPreview(m.store, ref)).toEqual(preview);
  });

  it("a whole photo names no question as cut off", async () => {
    const preview = await runScanCrops(setup().store, ref, token(1));
    expect(preview.status === "ready" && preview.cutOff).toBeFalsy();
  });
});
