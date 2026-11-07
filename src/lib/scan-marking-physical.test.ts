import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import sharp from "sharp";
import fixtures from "./scan-marking-comparison.test-fixtures.json";
import metadata from "../../data/scan-marking-endpoint-evidence-20261106.json";
import type { QuestionPackage } from "./question-package";
import { COMPARISON_FORMATS, SYNTHETIC_IDS, hashBytes, hashValue, labelledOutput, preflightEndpoint, validateComparisonManifest, type ComparisonPhoto, type ComparisonResult, type EndpointSnapshot } from "./scan-marking-comparison";
import { FROZEN_KIT, PHYSICAL_MODEL, PHYSICAL_VERSION, parseTruthCsv, physicalPhotoId, physicalReport, physicalSettings, physicalTruth, truthTemplate, validateMapping, writeTruthCsv, type PhysicalMapping, type PhysicalPage, type PhysicalSet } from "./scan-marking-physical";
import { calibratePhysicalPhoto, executePhysical, fakePhysicalHttp, physicalBudget, regularBytes, replayPhysical, sealPhysicalPlan } from "../../scripts/scan-marking-physical-cli";
import { durableJson, fileJournal } from "../../scripts/scan-marking-comparison-cli";
import type { EvaluationBudget, EvaluationJournal } from "./scan-marking-comparison-run";
import { blankPage, drawMark, drawPrintedContent, drawQr, pagePng } from "./scan-synthetic";
import { SCAN_MARKS, type PagePrintContract } from "./workbook-print-contract";
import type { WorkbookInput } from "./workbook-content";

const root = process.cwd(), folders: string[] = [];
afterEach(async () => { for (const p of folders.splice(0)) await rm(p, { recursive: true, force: true }); });
const temp = async () => { const p = await mkdtemp(resolve(tmpdir(), "robin-phone-proof-")); folders.push(p); return p; };
const evidence = () => preflightEndpoint(PHYSICAL_MODEL, metadata.snapshots[PHYSICAL_MODEL.model as keyof typeof metadata.snapshots] as EndpointSnapshot, metadata.zdr);
function pages(): PhysicalPage[] {
  const frame: ComparisonPhoto["frame"] = { parentId: SYNTHETIC_IDS.parent, childId: SYNTHETIC_IDS.child, workbookId: SYNTHETIC_IDS.workbook, pageId: "synthetic-physical-page-3", pageNumber: 3, photo: "synthetic-physical-template", printedRevision: "a".repeat(28), ready: true,
    questions: COMPARISON_FORMATS.map((format, i) => {
      const pkg = structuredClone(fixtures.packages[format]) as unknown as QuestionPackage; pkg.id = `synthetic-item-${i}`;
      pkg.ref = { source: "workbook", workbookId: SYNTHETIC_IDS.workbook, page: 3, question: i + 1 };
      return { number: i + 1, package: pkg, teaching: null, regions: pkg.item!.regions.map((r, k) => ({ id: r.id, kind: r.kind, box: { x: 10 + k * 210, y: 10 + i * 110, width: 200, height: 100 } })) };
    }) };
  return [{ pdfPage: 2, printedPage: 3, label: "UL-ROBIN-D01-P1", frame }];
}
const mapping = (): PhysicalMapping => ({ version: 1, madeUpRobinOnly: true, photos: [{ file: "iphone.jpg", pdf_page: 2, device: "iphone", clarity: "clear" }, { file: "android.jpg", pdf_page: 2, device: "android", clarity: "unclear" }] });
function blankTruth() {
  // These supplied synthetic test readings are blank. No key or model fills human truth.
  return truthTemplate(mapping(), pages()).map(r => r.parent_methods_required === "true" ? r : { ...r, intended_result: "blank", reading_state: "blank" });
}
async function setAndPlan(proofClass: PhysicalSet["proofClass"] = "physical-input") {
  const out = await temp(); await mkdir(resolve(out, "images"));
  await durableJson(resolve(out, "owner.json"), { owner: "local-test-owner" }, true);
  const bytes = await sharp({ create: { width: 1000, height: 1400, channels: 3, background: "white" } }).jpeg().toBuffer();
  const truths = physicalTruth(mapping(), pages(), writeTruthCsv(blankTruth()));
  const set: PhysicalSet = { version: PHYSICAL_VERSION, proofClass, kit: FROZEN_KIT, draftSha256: hashBytes("supplied-synthetic-test-draft"), revision: "a".repeat(28), truthSha256: hashBytes("supplied-synthetic-blank-readings"), mappingSha256: hashValue(mapping()), missing: [], photos: [], inventory: mapping().photos.map(m => ({ file: m.file, rawSha256: hashBytes(bytes), reason: null })) };
  for (const m of mapping().photos) {
    const id = physicalPhotoId(m.file), photo: ComparisonPhoto = { id, clear: m.clarity === "clear", image: { path: `images/${id}.jpg`, sha256: hashBytes(bytes), width: 1000, height: 1400, metadataFree: true }, frame: { ...pages()[0].frame, photo: id }, truth: truths.get(m.file)! };
    await writeFile(resolve(out, photo.image.path), bytes); await writeFile(resolve(out, `images/${id}-oriented.jpg`), bytes);
    set.photos.push({ mapping: m, status: "ready", reason: null, rawSha256: hashBytes(bytes), normalizedSha256: hashBytes(bytes), calibration: { suppliedSyntheticGeometry: true }, crops: [], photo });
  }
  await durableJson(resolve(out, "set.json"), set, true);
  const { plan, run } = await sealPhysicalPlan(out, set, root, 15_000_000);
  return { out, set, plan, run };
}
const response = (p: ComparisonPhoto, output: unknown = labelledOutput(p)) => Response.json({ id: "gen-local-supplied-synthetic", model: PHYSICAL_MODEL.model, provider: PHYSICAL_MODEL.providerName,
  usage: { cost: 0.001, prompt_tokens: 12, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 0 } }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] });
function memoryBudget() {
  const holds = new Map<string, number | null>(); let next = 0, settles = 0;
  const budget: EvaluationBudget = { refresh: async () => ({ verified: true }), reserve: async () => { const id = String(++next); holds.set(id, null); return { id }; }, settle: async (id, cost) => { settles++; holds.set(id, cost); }, defer: async () => {} };
  return { budget, holds, settles: () => settles };
}
function execution(input: Awaited<ReturnType<typeof setAndPlan>>, mem: ReturnType<typeof memoryBudget>) {
  let n = 0;
  return { ...input, root, budget: () => mem.budget, env: () => ({ SCAN_MARKING_OPENROUTER_API_KEY: "local-fake-no-credential" }), preflight: async () => ({ evidence: evidence(), maximumMicros: 100_000 }), fetch: async () => response(input.set.photos[n++].photo) };
}

describe("physical human truth", () => {
  it("requires exact photo, item, region and page coverage with explicit clarity", () => {
    const rows = blankTruth(), csv = writeTruthCsv(rows);
    expect(physicalTruth(mapping(), pages(), csv).size).toBe(2);
    expect(rows.filter(r => r.region_id === "parent-methods")).toHaveLength(2);
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(rows.slice(1)))).toThrow("missing-or-extra");
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv([...rows, rows[0]]))).toThrow("duplicate");
    for (const column of ["pdf_page", "printed_page", "page_id", "question", "format", "item_id", "region_id", "photo_clarity", "device"]) {
      const bad = structuredClone(rows); bad[0][column] = "wrong";
      expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(bad))).toThrow(/identity|missing-or-extra/);
    }
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(truthTemplate(mapping(), pages())))).toThrow("incomplete");
  });
  it("rejects malformed quoting and does not remove empty or extra rows", () => {
    const csv = writeTruthCsv(blankTruth());
    for (const text of [csv + '"unfinished', csv.replace('"2"', '"2"suffix'), csv.replace('"2"', '2"'), csv + "\r\n", csv.replace("photo_clarity", "photo")]) expect(() => parseTruthCsv(text)).toThrow();
    const rows = blankTruth(); rows[0].notes = 'a comma, a quote " and\na second line';
    expect(parseTruthCsv(writeTruthCsv(rows))[0].notes).toBe(rows[0].notes);
  });
  it("does not infer uncertain or written labels and never scores parent methods", () => {
    const bad = blankTruth(); bad[0].reading_state = "written";
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(bad))).toThrow("needs-text");
    bad[0].reading_state = "uncertain"; bad[0].intended_result = "uncertain";
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(bad))).toThrow("needs-issue");
    bad[0].reading_issue = "blurry";
    expect(physicalTruth(mapping(), pages(), writeTruthCsv(bad)).get("iphone.jpg")![0].result).toBe("uncertain");
    const parent = bad.find(r => r.parent_methods_required === "true")!; parent.intended_result = "right";
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(bad))).toThrow("parent-methods");
  });
  it("counts absent phone pages and rejects unsafe photo maps and symlinks", async () => {
    const one = mapping(); one.photos.pop(); expect(validateMapping(one, pages())).toEqual(["android:pdf-2"]);
    for (const name of ["../photo.jpg", "/photo.jpg", "folder/photo.jpg", "a..jpg"]) { const m = mapping(); m.photos[0].file = name; expect(() => validateMapping(m, pages())).toThrow("unsafe"); }
    const m = mapping(); m.photos[0].clarity = undefined as never; expect(() => validateMapping(m, pages())).toThrow("clarity");
    const dir = await temp(); await writeFile(resolve(dir, "actual.jpg"), "supplied synthetic"); await symlink(resolve(dir, "actual.jpg"), resolve(dir, "alias.jpg"));
    await expect(regularBytes(resolve(dir, "alias.jpg"))).rejects.toThrow();
  });
});

describe("physical plans, journals and accounting", () => {
  it("uses the fixed model, prompt and settings without admitting the set as fixed40", async () => {
    const input = await setAndPlan();
    expect(physicalSettings(15_000_000)).toMatchObject({ model: { model: "anthropic/claude-sonnet-5.5", endpoint: "google-vertex/global" }, prompt: "whole-page-scalar-readings-v7", effort: "low", outputTokens: 4096, fallbacks: false });
    expect(() => validateComparisonManifest({ ...input.set, version: 1, synthetic: true } as never)).toThrow();
    const initial = physicalReport(input.set, [], evidence(), input.run);
    expect(initial).toMatchObject({ complete: false, passed: false, denominator: 16, clearDenominator: 8, totalPhotos: 2, parentMethods: 2 });
  });
  it.each(["changed-plan", "changed-image", "stale-result", "old-exit", "old-refund", "old-unknown"])("stops %s before preflight or any budget access", async kind => {
    const input = await setAndPlan(); let preflight = 0, budgets = 0;
    if (kind === "changed-plan") input.plan.settings.maxMicros--;
    else if (kind === "changed-image") await writeFile(resolve(input.out, input.set.photos[0].photo.image.path), "changed");
    else await writeFile(resolve(input.out, `${kind}.json`), "{}");
    await expect(executePhysical({ ...execution(input, memoryBudget()), budget: () => { budgets++; throw Error("must not read credentials"); }, preflight: async () => { preflight++; return { evidence: evidence(), maximumMicros: 1 }; } })).rejects.toThrow();
    expect(preflight).toBe(0); expect(budgets).toBe(0);
  });
  it("keeps refused and missing photos out of dispatch and in the full report", async () => {
    const input = await setAndPlan(); input.set.photos[0].status = "refused"; input.set.photos[0].reason = "wrong-page-qr"; input.set.missing.push("iphone:pdf-3");
    const report = physicalReport(input.set, [], evidence(), input.run);
    expect(report).toMatchObject({ passed: false, complete: false, refusedPhotos: 1, totalPhotos: 2, denominator: 16 });
    await rm(resolve(input.out, input.set.photos[0].photo.image.path)); await rm(resolve(input.out, `images/${input.set.photos[0].photo.id}-oriented.jpg`));
    // Reseal a refused set as preparation would do. It still cannot authorize inference.
    await durableJson(resolve(input.out, "set.json"), input.set); await rm(resolve(input.out, "plan.json")); await rm(resolve(input.out, "plan-hash.json"));
    const sealed = await sealPhysicalPlan(input.out, input.set, root, 15_000_000);
    let fetched = 0;
    await expect(executePhysical({ ...execution({ ...input, ...sealed }, memoryBudget()), preflight: async () => { fetched++; throw Error("must not run"); } })).rejects.toThrow("incomplete"); expect(fetched).toBe(0);
  });
  it("saves raw HTTP before settlement and refuses another execution", async () => {
    const input = await setAndPlan(), mem = memoryBudget(); const opts = execution(input, mem);
    const budget = { ...mem.budget, settle: async (id: string, cost: number | null) => {
      const records = await Promise.all((await readdir(resolve(input.out, "journal"))).map(f => readFile(resolve(input.out, "journal", f), "utf8")));
      expect(records.some(r => JSON.parse(r).state === "response" && JSON.parse(r).body)).toBe(true);
      await mem.budget.settle(id, cost);
    } };
    const results = await executePhysical({ ...opts, budget: () => budget }); expect(results).toHaveLength(2); expect(mem.settles()).toBe(2);
    await expect(executePhysical(opts)).rejects.toThrow("stale-run");
  });
  it.each(["response", "reserved", "settlement"])("makes %s failure fatal and preserves unsettled holds", async stage => {
    const input = await setAndPlan(), mem = memoryBudget(), opts = execution(input, mem); let fetched = 0;
    const journal = fileJournal(resolve(input.out, "journal"));
    const broken: EvaluationJournal = { ...journal, save: async (key, value) => { if ((value as { state: string }).state === stage) throw Error("local disk fault"); await journal.save(key, value); } };
    await expect(executePhysical({ ...opts, journal: broken, budget: () => stage === "settlement" ? { ...mem.budget, settle: async () => { throw Error("local ledger fault"); } } : mem.budget,
      fetch: async () => { fetched++; return response(input.set.photos[0].photo); } })).rejects.toThrow("fatal");
    expect(fetched).toBe(stage === "reserved" ? 0 : 1); expect([...mem.holds.values()]).toEqual([null]); expect(mem.settles()).toBe(0);
  });
  it("stops unknown usage and counts malformed output as a schema failure", async () => {
    const unknown = await setAndPlan(), mem = memoryBudget(); let fetched = 0;
    await expect(executePhysical({ ...execution(unknown, mem), fetch: async () => { fetched++; return Response.json({ error: "unknown upstream outcome" }, { status: 503 }); } })).rejects.toThrow(/unknown-usage|fatal/);
    expect(fetched).toBe(1); expect([...mem.holds.values()]).toEqual([null]);
    const lost = await setAndPlan(), lostBudget = memoryBudget(); let lostCalls = 0;
    await expect(executePhysical({ ...execution(lost, lostBudget), fetch: async () => { lostCalls++; throw Error("local lost response"); } })).rejects.toThrow("unknown-usage");
    expect(lostCalls).toBe(1); expect([...lostBudget.holds.values()]).toEqual([null]);
    expect(JSON.parse(await readFile(resolve(lost.out, "report.json"), "utf8"))).toMatchObject({ reconciliationRequired: true, heldMicros: 100_000, spentOrHeldMicros: 100_000 });
    const invalid = await setAndPlan(), budget = memoryBudget();
    const results = await executePhysical({ ...execution(invalid, budget), fetch: async () => response(invalid.set.photos[0].photo, { readings: [] }) });
    expect(physicalReport(invalid.set, results, evidence(), invalid.run)).toMatchObject({ passed: false, schemaFailures: 2, schemaUnvalidated: 2 });
  });
  it("retains a clean 429 hold, waits 15 minutes and retries the pair only once", async () => {
    const input = await setAndPlan(), mem = memoryBudget(); let now = 1000, fetched = 0; const waits: number[] = [];
    const results = await executePhysical({ ...execution(input, mem), now: () => now, wait: async ms => { waits.push(ms); now += ms; }, fetch: async () => { fetched++; return Response.json({ error: { code: 429, message: "Local synthetic rate limit" } }, { status: 429 }); } });
    expect(fetched).toBe(2); expect(waits.reduce((a, b) => a + b, 0)).toBe(900_000); expect(Math.max(...waits)).toBeLessThanOrEqual(30_000);
    expect(results).toHaveLength(1); expect(results[0].attempts).toHaveLength(2); expect([...mem.holds.values()]).toEqual([null, null]);
    expect(physicalReport(input.set, results, evidence(), input.run)).toMatchObject({ passed: false, missingRuns: 2, latencyP50Ms: 0 });
  });
  it("uses only the additive aggregate ledger boundary and propagates a budget hold", async () => {
    const urls: string[] = [], admissions: unknown[] = [];
    const budget = physicalBudget("local-placeholder", async (url, init) => { urls.push(String(url)); expect(JSON.parse(String(init?.body)).p_run_maximum).toBe(15_000_000); return Response.json({ refused: "aggregate-marking-test-budget", liability_micros: 14_999_999 }); }, async (value, attempt, run) => { admissions.push({ value, attempt, run }); });
    expect(await budget.reserve({ run: "a".repeat(64), attempt: "b".repeat(64), model: PHYSICAL_MODEL.model, endpoint: PHYSICAL_MODEL.endpoint, evidence: "c".repeat(64), pixels: 100, maximumMicros: 2, maxRunMicros: 15_000_000 })).toEqual({ refused: "aggregate-marking-test-budget" });
    expect(urls).toEqual(["https://cdjobwsyzndtltzfpyqa.supabase.co/rest/v1/rpc/reserve_scan_marking_physical_evaluation_checked"]);
    expect(admissions).toEqual([{ value: { refused: "aggregate-marking-test-budget", liability_micros: 14_999_999 }, attempt: "b".repeat(64), run: "a".repeat(64) }]);
  });
  it("stops a changed dispatch plan before a second reservation", async () => {
    const input = await setAndPlan(), mem = memoryBudget(); let fetched = 0;
    await expect(executePhysical({ ...execution(input, mem), fetch: async () => {
      fetched++; await durableJson(resolve(input.out, "dispatch-plan.json"), { stale: true }); return response(input.set.photos[0].photo);
    } })).rejects.toThrow("dispatch-plan-changed");
    expect(fetched).toBe(1); expect(mem.holds.size).toBe(1);
  });
  it("replays saved HTTP without inference and rejects a copied or edited result", async () => {
    const input = await setAndPlan("local-fake"); await fakePhysicalHttp(input.out, input.set, input.plan, input.run);
    const original = JSON.parse(await readFile(resolve(input.out, "results.json"), "utf8")) as ComparisonResult[];
    expect(physicalReport(input.set, original, evidence(), input.run).passed).toBe(true);
    const refused = structuredClone(input.set); refused.photos[0].status = "refused"; refused.photos[0].reason = "wrong-page-qr";
    expect(physicalReport(refused, original, evidence(), input.run)).toMatchObject({ passed: false, complete: false, denominator: 16, refusedPhotos: 1 });
    const missing = structuredClone(input.set); missing.missing.push("android:pdf-11");
    expect(physicalReport(missing, original, evidence(), input.run)).toMatchObject({ passed: false, complete: false, denominator: 16 });
    const parent = await temp(), out = resolve(parent, "replay");
    await replayPhysical(input.out, out, root);
    expect(JSON.parse(await readFile(resolve(out, "report.json"), "utf8"))).toMatchObject({ proofClass: "saved-reader-replay", realHandwritingProven: false });
    const results = JSON.parse(await readFile(resolve(input.out, "results.json"), "utf8")) as ComparisonResult[];
    results[0].run = "d".repeat(64); await durableJson(resolve(input.out, "results.json"), results);
    await expect(replayPhysical(input.out, resolve(parent, "bad"), root)).rejects.toThrow();
  });
});

describe("public physical geometry", () => {
  it("accepts a measured synthetic page, applies orientation, and refuses the wrong QR or missing corners", async () => {
    const width = 850, height = 1100, image = blankPage(width, height), token = "synthetic-robin-physical-0001";
    const points = { tl: { x: 25, y: 25 }, tr: { x: 825, y: 25 }, br: { x: 825, y: 1075 }, bl: { x: 25, y: 1075 } };
    for (const mark of SCAN_MARKS) drawMark(image, mark, points[mark], 24, 4);
    drawPrintedContent(image); drawQr(image, { x: 680, y: 935, width: 125, height: 125 }, `https://unicalearning.com/tutor/p/${token}`);
    const bytes = await pagePng(image), contract: PagePrintContract = { version: 1, workbookId: SYNTHETIC_IDS.workbook, page: 3, label: "synthetic", day: 1, pageOfDay: 1,
      coordinates: { units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait", image: { width, height }, cssPage: { width, height }, scale: { x: 1, y: 1 } }, marks: { anchor: "outer-corner", order: [...SCAN_MARKS], points }, fingerprints: { content: "supplied-test-fixture", image: hashBytes(bytes) } };
    const page = { number: 3, qrToken: token, printContract: contract, questions: [] } as unknown as WorkbookInput["pages"][number];
    const good = await calibratePhysicalPhoto(bytes, page, "a".repeat(28), image, []); expect(good.calibration.pageFit).toBeGreaterThan(.975);
    const turned = await sharp(bytes).rotate(90).withMetadata({ orientation: 8 }).jpeg({ quality: 98 }).toBuffer();
    const oriented = await calibratePhysicalPhoto(turned, page, "a".repeat(28), image, []); const meta = await sharp(oriented.oriented).metadata(); expect(meta.exif).toBeUndefined(); expect(meta.width).toBe(width);
    await expect(calibratePhysicalPhoto(bytes, { ...page, qrToken: "synthetic-other-page-0001" }, "a".repeat(28), image, [])).rejects.toThrow("wrong-page");
    const cut = await sharp(bytes).extract({ left: 60, top: 0, width: width - 60, height }).png().toBuffer();
    await expect(calibratePhysicalPhoto(cut, page, "a".repeat(28), image, [])).rejects.toThrow("calibration");
    const wrong = structuredClone(contract); wrong.marks.points.tr.x -= 300;
    await expect(calibratePhysicalPhoto(bytes, { ...page, printContract: wrong }, "a".repeat(28), image, [])).rejects.toThrow("calibration");
  });
});
