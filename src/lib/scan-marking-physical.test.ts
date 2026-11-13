import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import sharp from "sharp";
import fixtures from "./scan-marking-comparison.test-fixtures.json";
import type { QuestionPackage } from "./question-package";
import { COMPARISON_FORMATS, SYNTHETIC_IDS, hashBytes, hashValue, labelledOutput, reserveMaximum, validateComparisonManifest, type ComparisonManifest, type ComparisonPhoto, type ComparisonResult, type EndpointEvidence } from "./scan-marking-comparison";
import { reviewedPhysicalStates, FROZEN_KIT, PHYSICAL_EXPECTED, PHYSICAL_MODELS, PHYSICAL_PARALLEL_REQUESTS, PHYSICAL_VERSION, parseTruthCsv, physicalCreditPreflight, physicalEstimate, physicalEstimateLines, physicalFixedReport, physicalFixedSideBySide, physicalPhotoId, physicalReport, physicalSettings, physicalSideBySide, physicalTruth, truthTemplate, validateMapping, writeTruthCsv, type PhysicalMapping, type PhysicalPage, type PhysicalSet } from "./scan-marking-physical";
import { calibratePhysicalPhoto, executePhysical, fakePhysicalHttp, openPreparedPhysical, physicalBudget, regularBytes, replayPhysical, sealPhysicalPlan } from "../../scripts/scan-marking-physical-cli";
import { durableJson, fileJournal } from "../../scripts/scan-marking-comparison-cli";
import type { EvaluationBudget, EvaluationJournal } from "./scan-marking-comparison-run";
import { blankPage, drawMark, drawPrintedContent, drawQr, pagePng } from "./scan-synthetic";
import { SCAN_MARKS, type PagePrintContract } from "./workbook-print-contract";
import type { WorkbookInput } from "./workbook-content";
import { TWO_WAYS_METHOD_MARKS } from "./scan-marking";
import { expectedItems } from "./scan-observation";

const root = process.cwd(), folders: string[] = [];
afterEach(async () => { for (const p of folders.splice(0)) await rm(p, { recursive: true, force: true }); });
const temp = async () => { const p = await mkdtemp(resolve(tmpdir(), "robin-phone-proof-")); folders.push(p); return p; };
const [SONNET, TERRA] = PHYSICAL_MODELS;
const evidences = () => reviewedPhysicalStates().map(s => s.evidence);
/** The enabled rows of public.scan_marking_evaluation_prices on 2026-11-07 (evidence_hash, maximum_micros). Fixtures, not code. */
const LEDGER_ENABLED: Record<string, { hash: string; maximumMicros: number }> = {
  "anthropic/claude-sonnet-5.5": { hash: "caf1ec5580ae81b87df0bcd396c58c594ef3acb67457633c76f05d3352ba6278", maximumMicros: 4_040_960 },
  "openai/gpt-6.1-terra": { hash: "669916576e5f10e6cff3a77539a98f68f35bbf2452276568e2b02bf6c70bc71e", maximumMicros: 2_335_721 },
};
/** Refreshes as refresh_scan_marking_evaluation_price does: only from an enabled reviewed row. */
function ledgerBudget(mem: ReturnType<typeof memoryBudget>, enabled = LEDGER_ENABLED) {
  const refreshed: string[] = [];
  const budget: EvaluationBudget = { ...mem.budget, refresh: async ({ approved }) => {
    if (enabled[approved.model]?.hash !== hashValue(approved)) return { refused: "reviewed-price-missing" };
    refreshed.push(approved.model); return { verified: true };
  } };
  return { budget, refreshed };
}
const FAKE_KEY = "local-fake-no-credential";
const enough = async () => Response.json({ data: { total_credits: 40, total_usage: 1 } });
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
function blankTruth(): Record<string, string>[] {
  // These supplied synthetic test readings are blank. No key or model fills human truth.
  return truthTemplate(mapping(), pages()).map(r => ({ ...r, intended_result: "blank", reading_state: "blank" }));
}
async function setAndPlan(proofClass: PhysicalSet["proofClass"] = "physical-input", maxMicros = 15_000_000) {
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
  const { plan, run } = await sealPhysicalPlan(out, set, root, maxMicros);
  return { out, set, plan, run };
}
const modelOf = (init?: RequestInit) => PHYSICAL_MODELS.find(m => m.model === JSON.parse(String(init?.body)).model)!;
const response = (p: ComparisonPhoto, m: typeof SONNET, output: unknown = labelledOutput(p)) => Response.json({ id: "gen-local-supplied-synthetic", model: m.model, provider: m.providerName,
  usage: { cost: 0.001, prompt_tokens: 12, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 0 } }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] });
function memoryBudget() {
  const holds = new Map<string, number | null>(); let next = 0, settles = 0;
  const budget: EvaluationBudget = { refresh: async () => ({ verified: true }), reserve: async () => { const id = String(++next); holds.set(id, null); return { id }; }, settle: async (id, cost) => { settles++; holds.set(id, cost); }, defer: async () => {} };
  return { budget, holds, settles: () => settles };
}
function execution(input: Awaited<ReturnType<typeof setAndPlan>>, mem: ReturnType<typeof memoryBudget>) {
  const fetcher: typeof fetch = async (_url, init) => response(input.set.photos[0].photo, modelOf(init));
  return { ...input, root, budget: () => mem.budget, env: () => ({ SCAN_MARKING_OPENROUTER_API_KEY: FAKE_KEY }), preflight: async () => evidences().map(evidence => ({ evidence, maximumMicros: 100_000 })), fetch: fetcher, creditFetch: enough as typeof fetch };
}

describe("physical human truth", () => {
  it("requires exact photo, item, region and page coverage with explicit clarity", () => {
    const rows = blankTruth(), csv = writeTruthCsv(rows);
    expect(physicalTruth(mapping(), pages(), csv).size).toBe(2);
    expect(rows.filter(r => r.format === "two-ways").map(r => r.region_id)).toEqual(["method-1", "method-2", "answer", "method-1", "method-2", "answer"]);
    expect(rows.every(r => !("parent_methods_required" in r) && r.intended_result !== "parent" && r.reading_state !== "parent")).toBe(true);
    expect(rows.filter(r => r.methods_required === "true").map(r => r.format)).toEqual(Array(6).fill("two-ways"));
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
  it("does not infer uncertain or written labels and refuses a parent label", () => {
    const bad = blankTruth(); bad[0].reading_state = "written";
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(bad))).toThrow("needs-text");
    bad[0].reading_state = "uncertain"; bad[0].intended_result = "uncertain";
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(bad))).toThrow("needs-issue");
    bad[0].reading_issue = "blurry";
    expect(physicalTruth(mapping(), pages(), writeTruthCsv(bad)).get("iphone.jpg")![0].result).toBe("uncertain");
    const parent = structuredClone(blankTruth()); for (const r of parent.filter(r => r.format === "two-ways")) { r.intended_result = "parent"; r.reading_state = "parent"; }
    expect(() => physicalTruth(mapping(), pages(), writeTruthCsv(parent))).toThrow("incomplete");
  });
  it("reads human labels for both methods and the answer of a two-ways item", () => {
    const rows = blankTruth();
    for (const r of rows.filter(r => r.format === "two-ways" && r.photo === "iphone.jpg")) {
      r.intended_result = "right"; r.reading_state = "written";
      r.final_written_answer = r.region_id === "answer" ? "430" : r.region_id === "method-1" ? "3440 ÷ 8 = 430" : "8 × 430 = 3440";
    }
    const truth = physicalTruth(mapping(), pages(), writeTruthCsv(rows)).get("iphone.jpg")!.find(t => t.format === "two-ways")!;
    expect(truth.result).toBe("right");
    expect(truth.readings.map(r => [r.regionId, r.state, r.text])).toEqual([["method-1", "written", "3440 ÷ 8 = 430"], ["method-2", "written", "8 × 430 = 3440"], ["answer", "written", "430"]]);
  });
  it("lets a human say a method is wrong when its arithmetic is true", () => {
    const rows = blankTruth();
    for (const r of rows.filter(r => r.format === "two-ways" && r.photo === "iphone.jpg")) {
      r.intended_result = "wrong"; r.reading_state = "written";
      r.final_written_answer = r.region_id === "answer" ? "430" : r.region_id === "method-1" ? "3440 ÷ 8 = 430" : "8 × 430 = 3440";
    }
    expect(physicalTruth(mapping(), pages(), writeTruthCsv(rows)).get("iphone.jpg")!.find(t => t.format === "two-ways")!.result).toBe("wrong");
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
  it("pins both models on one prompt and settings without admitting the set as fixed40", async () => {
    const input = await setAndPlan();
    expect(physicalSettings(15_000_000)).toMatchObject({ models: [{ model: "anthropic/claude-sonnet-5.5", endpoint: "google-vertex/global", providerName: "Google" }, { model: "openai/gpt-6.1-terra", endpoint: "azure", providerName: "Azure" }], prompt: "whole-page-scalar-readings-v9", effort: "low", outputTokens: 4096, fallbacks: false, parallelRequests: 1 });
    expect(PHYSICAL_PARALLEL_REQUESTS).toBe(1);
    expect(PHYSICAL_EXPECTED).toEqual({ photos: 20, itemLabels: 148, aiMarked: 148, parent: 0 });
    expect(() => validateComparisonManifest({ ...input.set, version: 1, synthetic: true } as never)).toThrow();
    const initial = physicalReport(input.set, [], evidences(), input.run);
    expect(initial).toMatchObject({ complete: false, passed: false, totalPhotos: 2, counts: { photos: 2, itemLabels: 18, aiMarked: 18, parent: 0 } });
    // D-267's clear denominator holds only AI-markable items; the one with team items keeps all 9.
    const clear = TWO_WAYS_METHOD_MARKS ? 9 : 8;
    expect(initial.models.map(m => [m.model, m.denominator, m.clearDenominator, m.clearDenominatorWithTeam, m.parentMethods])).toEqual([[SONNET.model, 18, clear, 9, 0], [TERRA.model, 18, clear, 9, 0]]);
  });
  it.each(["changed-plan", "changed-image", "stale-result", "old-exit", "old-refund", "old-unknown"])("stops %s before preflight or any budget access", async kind => {
    const input = await setAndPlan(); let preflight = 0, budgets = 0;
    if (kind === "changed-plan") input.plan.settings.maxMicros--;
    else if (kind === "changed-image") await writeFile(resolve(input.out, input.set.photos[0].photo.image.path), "changed");
    else await writeFile(resolve(input.out, `${kind}.json`), "{}");
    await expect(executePhysical({ ...execution(input, memoryBudget()), budget: () => { budgets++; throw Error("must not read credentials"); }, preflight: async () => { preflight++; return []; } })).rejects.toThrow();
    expect(preflight).toBe(0); expect(budgets).toBe(0);
  });
  it("keeps refused and missing photos out of dispatch and in the full report", async () => {
    const input = await setAndPlan(); input.set.photos[0].status = "refused"; input.set.photos[0].reason = "wrong-page-qr"; input.set.missing.push("iphone:pdf-3");
    const report = physicalReport(input.set, [], evidences(), input.run);
    expect(report).toMatchObject({ passed: false, complete: false, refusedPhotos: 1, totalPhotos: 2 });
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
    const results = await executePhysical({ ...opts, budget: () => budget }); expect(results).toHaveLength(4); expect(mem.settles()).toBe(4);
    expect(results.map(r => r.model)).toEqual([SONNET.model, TERRA.model, SONNET.model, TERRA.model]);
    await expect(executePhysical(opts)).rejects.toThrow("stale-run");
  });
  it.each(["response", "reserved", "settlement"])("makes %s failure fatal and preserves unsettled holds", async stage => {
    const input = await setAndPlan(), mem = memoryBudget(), opts = execution(input, mem); let fetched = 0;
    const journal = fileJournal(resolve(input.out, "journal"));
    const broken: EvaluationJournal = { ...journal, save: async (key, value) => { if ((value as { state: string }).state === stage) throw Error("local disk fault"); await journal.save(key, value); } };
    await expect(executePhysical({ ...opts, journal: broken, budget: () => stage === "settlement" ? { ...mem.budget, settle: async () => { throw Error("local ledger fault"); } } : mem.budget,
      fetch: async (_url, init) => { fetched++; return response(input.set.photos[0].photo, modelOf(init)); } })).rejects.toThrow("fatal");
    expect(fetched).toBe(stage === "reserved" ? 0 : 1); expect([...mem.holds.values()]).toEqual([null]); expect(mem.settles()).toBe(0);
  });
  // #816: each case gets its own fresh folder (the execution marker makes a folder single-use) and its own test, so
  // three fixture-and-run cycles of disk work never share one time limit. The clock and the wait are injected, so no
  // case reads wall time, and none of them may wait.
  describe("stops unknown usage and counts malformed output as a schema failure", () => {
    const stillClock = () => { const waits: number[] = []; return { waits, now: () => 1000, wait: async (ms: number) => { waits.push(ms); } }; };
    it("stops an unknown 503 outcome and keeps its hold", async () => {
      const unknown = await setAndPlan(), mem = memoryBudget(), clock = stillClock(); let fetched = 0;
      await expect(executePhysical({ ...execution(unknown, mem), now: clock.now, wait: clock.wait, fetch: async () => { fetched++; return Response.json({ error: "unknown upstream outcome" }, { status: 503 }); } })).rejects.toThrow(/unknown-usage|fatal/);
      expect(fetched).toBe(1); expect([...mem.holds.values()]).toEqual([null]); expect(clock.waits).toEqual([]);
    });
    it("stops a lost response and reports its hold for reconciliation", async () => {
      const lost = await setAndPlan(), lostBudget = memoryBudget(), clock = stillClock(); let lostCalls = 0;
      await expect(executePhysical({ ...execution(lost, lostBudget), now: clock.now, wait: clock.wait, fetch: async () => { lostCalls++; throw Error("local lost response"); } })).rejects.toThrow("unknown-usage");
      expect(lostCalls).toBe(1); expect([...lostBudget.holds.values()]).toEqual([null]); expect(clock.waits).toEqual([]);
      expect(JSON.parse(await readFile(resolve(lost.out, "report.json"), "utf8"))).toMatchObject({ reconciliationRequired: true, heldMicros: 100_000, spentOrHeldMicros: 100_000 });
    });
    it("counts malformed output as a schema failure", async () => {
      const invalid = await setAndPlan(), budget = memoryBudget(), clock = stillClock();
      const results = await executePhysical({ ...execution(invalid, budget), now: clock.now, wait: clock.wait, fetch: async (_url, init) => response(invalid.set.photos[0].photo, modelOf(init), { readings: [] }) });
      expect(clock.waits).toEqual([]);
      const invalidReport = physicalReport(invalid.set, results, evidences(), invalid.run);
      expect(invalidReport.passed).toBe(false);
      expect(invalidReport.models[1]).toMatchObject({ schemaFailures: 2, schemaUnvalidated: 2 });
    });
  });
  it("retains a clean 429 hold, waits 15 minutes and retries the pair only once", async () => {
    const input = await setAndPlan(), mem = memoryBudget(); let now = 1000, fetched = 0; const waits: number[] = [];
    const results = await executePhysical({ ...execution(input, mem), now: () => now, wait: async ms => { waits.push(ms); now += ms; }, fetch: async () => { fetched++; return Response.json({ error: { code: 429, message: "Local synthetic rate limit" } }, { status: 429 }); } });
    expect(fetched).toBe(2); expect(waits.reduce((a, b) => a + b, 0)).toBe(900_000); expect(Math.max(...waits)).toBeLessThanOrEqual(30_000);
    expect(results).toHaveLength(1); expect(results[0].attempts).toHaveLength(2); expect([...mem.holds.values()]).toEqual([null, null]);
    const held = physicalReport(input.set, results, evidences(), input.run);
    expect(held.passed).toBe(false); expect(held.models[0]).toMatchObject({ missingRuns: 2, latencyP50Ms: 0 }); expect(held.models[1]).toMatchObject({ missingRuns: 2 });
  });
  it("uses only the additive aggregate ledger boundary and propagates a budget hold", async () => {
    const urls: string[] = [], admissions: unknown[] = [];
    const budget = physicalBudget("local-placeholder", async (url, init) => { urls.push(String(url)); expect(JSON.parse(String(init?.body)).p_run_maximum).toBe(15_000_000); return Response.json({ refused: "aggregate-marking-test-budget", liability_micros: 14_999_999 }); }, async (value, attempt, run) => { admissions.push({ value, attempt, run }); });
    expect(await budget.reserve({ run: "a".repeat(64), attempt: "b".repeat(64), model: SONNET.model, endpoint: SONNET.endpoint, evidence: "c".repeat(64), pixels: 100, maximumMicros: 2, maxRunMicros: 15_000_000 })).toEqual({ refused: "aggregate-marking-test-budget" });
    expect(urls).toEqual(["https://cdjobwsyzndtltzfpyqa.supabase.co/rest/v1/rpc/reserve_scan_marking_physical_evaluation_checked"]);
    expect(admissions).toEqual([{ value: { refused: "aggregate-marking-test-budget", liability_micros: 14_999_999 }, attempt: "b".repeat(64), run: "a".repeat(64) }]);
  });
  it("stops a changed dispatch plan before a second reservation", async () => {
    const input = await setAndPlan(), mem = memoryBudget(); let fetched = 0;
    await expect(executePhysical({ ...execution(input, mem), fetch: async () => {
      fetched++; await durableJson(resolve(input.out, "dispatch-plan.json"), { stale: true }); return response(input.set.photos[0].photo, SONNET);
    } })).rejects.toThrow("dispatch-plan-changed");
    expect(fetched).toBe(1); expect(mem.holds.size).toBe(1);
  });
  it("replays saved HTTP without inference and rejects a copied or edited result", async () => {
    const input = await setAndPlan("local-fake"); await fakePhysicalHttp(input.out, input.set, input.plan, input.run);
    const original = JSON.parse(await readFile(resolve(input.out, "results.json"), "utf8")) as ComparisonResult[];
    // The fake reads every label; items our team marks are not model unsure under D-267, so it passes.
    expect(physicalReport(input.set, original, evidences(), input.run).passed).toBe(true);
    const refused = structuredClone(input.set); refused.photos[0].status = "refused"; refused.photos[0].reason = "wrong-page-qr";
    expect(physicalReport(refused, original, evidences(), input.run)).toMatchObject({ passed: false, complete: false, refusedPhotos: 1 });
    const missing = structuredClone(input.set); missing.missing.push("android:pdf-11");
    expect(physicalReport(missing, original, evidences(), input.run)).toMatchObject({ passed: false, complete: false });
    const parent = await temp(), out = resolve(parent, "replay");
    await replayPhysical(input.out, out, root);
    expect(JSON.parse(await readFile(resolve(out, "report.json"), "utf8"))).toMatchObject({ proofClass: "saved-reader-replay", realHandwritingProven: false });
    const results = JSON.parse(await readFile(resolve(input.out, "results.json"), "utf8")) as ComparisonResult[];
    results[0].run = "d".repeat(64); await durableJson(resolve(input.out, "results.json"), results);
    await expect(replayPhysical(input.out, resolve(parent, "bad"), root)).rejects.toThrow();
  });
});

describe("Sonnet and Terra side by side", () => {
  /** Fake readings: Terra reads the decimal item as wrong and is unsure of the whole-number item; Sonnet reads the labels. */
  const terraDiffers = (p: ComparisonPhoto, m: { model: string }) => {
    const out = labelledOutput(p) as { readings: { item: string; region: string; state: string; text: string | null; issue: string | null }[] };
    if (m.model !== TERRA.model) return out;
    const items = expectedItems(p.frame), decimal = `i${items.findIndex(e => p.truth.find(t => t.itemId === e.identity.itemId)!.format === "decimal") + 1}`;
    return { readings: out.readings.map(r => r.item === decimal ? { ...r, state: "written", text: "431", issue: null } : r.item === "i1" ? { ...r, state: "uncertain", text: null, issue: "blurry" } : r) };
  };
  // Blank truth on the two-ways item: code reads it blank with the method rules on, and our team marks it with them off.
  const twoWaysBlank = TWO_WAYS_METHOD_MARKS ? { blank: 2, unsure: 0, clearUnsure: 0, clearUnsureRate: 0, unsureRate: 0 } : { blank: 0, unsure: 2, clearUnsure: 1, clearUnsureRate: 1, unsureRate: 1 };
  const team = TWO_WAYS_METHOD_MARKS ? 0 : 1;
  async function fakeRun() {
    const input = await setAndPlan("local-fake");
    await fakePhysicalHttp(input.out, input.set, input.plan, input.run, terraDiffers);
    const results = JSON.parse(await readFile(resolve(input.out, "results.json"), "utf8")) as ComparisonResult[];
    return { input, results, report: physicalReport(input.set, results, evidences(), input.run) };
  }
  it("runs both models on the same photos, truth, prompt and reader", async () => {
    const { input, results } = await fakeRun();
    expect(results).toHaveLength(4);
    for (const photo of input.set.photos) {
      const pair = results.filter(r => r.photo === photo.photo.id);
      expect(pair.map(r => r.model)).toEqual([SONNET.model, TERRA.model]);
      expect(new Set(pair.map(r => r.requestHash)).size).toBe(1);
      expect(new Set(pair.map(r => r.photoHash)).size).toBe(1);
      expect(pair.every(r => r.attempts[0].usage.provider === PHYSICAL_MODELS.find(m => m.model === r.model)!.providerName)).toBe(true);
    }
  });
  it("reports wrong marks, wrong marked right, clear unsure, two-ways, cost and latency for each model", async () => {
    const { report } = await fakeRun(), [sonnet, terra] = report.models;
    // Our team marks the two-ways item while the method rules are off: D-267 leaves it out, so a perfect reader passes.
    expect(sonnet).toMatchObject({ model: SONNET.model, endpoint: "google-vertex/global", wrongMarks: 0, wrongAsRight: 0, clearUnsure: 0, clearUnsureWithTeam: team, passed: true, complete: true,
      twoWays: { items: 2, right: 0, wrong: 0, wrongMarks: 0, wrongAsRight: 0, ...twoWaysBlank } });
    expect(terra).toMatchObject({ model: TERRA.model, endpoint: "azure", wrongMarks: 2, wrongAsRight: 0, clearUnsure: 1, clearUnsureWithTeam: 1 + team, passed: false, complete: true,
      twoWays: { items: 2, right: 0, wrong: 0, wrongMarks: 0, wrongAsRight: 0, ...twoWaysBlank } });
    for (const m of report.models) { expect(m.costPerPageUsd).toBe(0); expect(m.latencyP50Ms).not.toBeNull(); expect(m.latencyP95Ms).not.toBeNull(); }
    expect(report.passed).toBe(false);
  });
  it("shows the two-ways unsure rate apart from the whole-page unsure rate, for each model", async () => {
    const { report } = await fakeRun(), [sonnet, terra] = report.models;
    expect(sonnet).toMatchObject({ clearUnsureRate: 0, clearUnsureRateWithTeam: team / 9, twoWays: { clearItems: 1, clearUnsure: twoWaysBlank.clearUnsure, clearUnsureRate: twoWaysBlank.clearUnsureRate, unsureRate: twoWaysBlank.unsureRate } });
    expect(terra).toMatchObject({ clearUnsureRate: 1 / (9 - team), clearUnsureRateWithTeam: (1 + team) / 9, twoWays: { clearItems: 1, clearUnsure: twoWaysBlank.clearUnsure, clearUnsureRate: twoWaysBlank.clearUnsureRate } });
    const text = physicalSideBySide(report);
    expect(text).toContain("Clear unsure rate");
    expect(text).toContain("Two-ways unsure (clear)");
    expect(text).toContain("D-267 at most 5%");
    // Both counts, each with its numbers: the D-267 figure on AI-markable items, and the one with team items.
    expect(text).toContain(`1/${9 - team} (${(1 / (9 - team) * 100).toFixed(1)}%; D-267 at most 5%, AI-markable items only)`);
    expect(text).toContain(`${1 + team}/9 (${((1 + team) / 9 * 100).toFixed(1)}%; with ${team} team item${team === 1 ? "" : "s"})`);
    if (!TWO_WAYS_METHOD_MARKS) expect(text).toContain("reads 100% while the method switch is off");
  });
  it("re-scores saved model output through the current method rules on replay, with no new call", async () => {
    const { input } = await fakeRun(), journal = resolve(input.out, "journal");
    // Saved results from older rules: every item read Right. Replay must use what the current rules make of the raw output.
    const results = JSON.parse(await readFile(resolve(input.out, "results.json"), "utf8")) as ComparisonResult[];
    const older = (r: ComparisonResult) => ({ ...r, observations: r.observations.map(o => ({ ...o, result: "right" as const, state: "scored" as const })) });
    await durableJson(resolve(input.out, "results.json"), results.map(older));
    for (const file of await readdir(journal)) {
      const record = JSON.parse(await readFile(resolve(journal, file), "utf8"));
      if (record.result) { record.result = older(record.result); await durableJson(resolve(journal, file), record); }
    }
    const parent = await temp(), out = resolve(parent, "replay");
    await replayPhysical(input.out, out, root);
    const report = JSON.parse(await readFile(resolve(out, "report.json"), "utf8"));
    expect(report).toMatchObject({ proofClass: "saved-reader-replay", rescoredItems: 36 });
    expect(report.models.map((m: { wrongMarks: number }) => m.wrongMarks)).toEqual([0, 2]);
  });
  it("lists each disagreement by photo and item, with the truth and each model's result", async () => {
    const { report, input } = await fakeRun();
    expect(report.disagreements).toHaveLength(4);
    expect(report.disagreements.filter(d => d.format === "two-ways")).toHaveLength(0);
    const decimal = report.disagreements.filter(d => d.format === "decimal");
    expect(decimal).toHaveLength(2);
    expect(decimal[0]).toEqual({ photo: "iphone.jpg", pdfPage: 2, question: 3, itemId: input.set.photos[0].photo.truth.find(t => t.format === "decimal")!.itemId, format: "decimal", truth: "blank", results: { [SONNET.model]: "blank", [TERRA.model]: "wrong" } });
    expect(report.disagreements.filter(d => d.question === 1).map(d => d.results[TERRA.model])).toEqual(["unsure", "unsure"]);
  });
  it("prints a side-by-side table with no key or child data", async () => {
    const { report } = await fakeRun(), text = physicalSideBySide(report);
    for (const row of ["Wrong marks", "Wrong marked right", "Clear unsure", "Two-ways", "Cost per page", "Latency p50", "Latency p95", "Disagreements", "Sonnet", "Terra", "AI-marked 18", "parent 0", `AI-marked 18, of which ${TWO_WAYS_METHOD_MARKS ? 0 : 2} team-marked; parent 0`]) expect(text).toContain(row);
    expect(text).not.toContain(FAKE_KEY);
  });
  it("states on its first line how many items went to the team and why", async () => {
    const { report } = await fakeRun(), first = physicalSideBySide(report).split("\n")[0];
    expect(report.team).toEqual(TWO_WAYS_METHOD_MARKS ? { items: 0, reasons: {} } : { items: 2, reasons: { "two-ways-method-marks-off": 2 } });
    expect(first).toBe(TWO_WAYS_METHOD_MARKS ? "0 items went to the team." : "2 items went to the team: two-ways method marking is off.");
  });
  it("keeps the same side-by-side result in saved replay", async () => {
    const { input, report } = await fakeRun(), parent = await temp(), out = resolve(parent, "replay");
    await replayPhysical(input.out, out, root);
    const saved = JSON.parse(await readFile(resolve(out, "report.json"), "utf8"));
    expect(saved.proofClass).toBe("saved-reader-replay");
    expect(saved.disagreements).toEqual(report.disagreements);
    expect(saved.models.map((m: { wrongMarks: number }) => m.wrongMarks)).toEqual([0, 2]);
  });
  it("retries only the deferred pair of the right model after a clean 429", async () => {
    const input = await setAndPlan(), mem = memoryBudget(); let now = 1000; const calls: string[] = [];
    const results = await executePhysical({ ...execution(input, mem), now: () => now, wait: async ms => { now += ms; }, fetch: async (_url, init) => {
      const m = modelOf(init); calls.push(m.model);
      if (calls.length === 2) return Response.json({ error: { code: 429, message: "Local synthetic rate limit" } }, { status: 429 });
      return response(input.set.photos[0].photo, m);
    } });
    expect(calls).toEqual([SONNET.model, TERRA.model, TERRA.model, SONNET.model, TERRA.model]);
    expect(results).toHaveLength(4); expect(results.every(r => r.status === "complete")).toBe(true);
  });
  it("stops a served model that is not the planned one", async () => {
    const input = await setAndPlan(), mem = memoryBudget();
    await expect(executePhysical({ ...execution(input, mem), fetch: async () => Response.json({ id: "gen", model: "other/model", provider: "Other", usage: {}, choices: [] }) })).rejects.toThrow();
    expect(mem.settles()).toBe(0);
  });
});

describe("cost estimate and credit preflight", () => {
  const states = () => evidences().map(evidence => ({ evidence, maximumMicros: reserveMaximum(evidence) }));
  const estimate = () => physicalEstimate(20, states(), 15_000_000);
  const credits = (total: unknown, usage: unknown, status = 200) => (async () => Response.json({ data: { total_credits: total, total_usage: usage } }, { status })) as typeof fetch;
  it("estimates both models from the pinned prices, and the in-flight need from the largest request", () => {
    const e = estimate(), worst = Math.max(...states().map(s => s.maximumMicros));
    expect(e.models.map(m => [m.model, m.requests])).toEqual([[SONNET.model, 20], [TERRA.model, 20]]);
    expect(e.models.map(m => m.totalMicros)).toEqual([460_000, 230_000]);
    expect(e.estimateMicros).toBe(690_000);
    expect(e.inFlightMicros).toBe(PHYSICAL_PARALLEL_REQUESTS * worst);
    expect(e.overStop).toBe(false);
    expect(physicalEstimate(20, states(), e.estimateMicros - 1).overStop).toBe(true);
  });
  it("reads remaining credits from the credits route with the marking key", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fetcher: typeof fetch = async (url, init) => { calls.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") }); return Response.json({ data: { total_credits: 40, total_usage: 1 } }); };
    const result = await physicalCreditPreflight(FAKE_KEY, estimate(), fetcher);
    expect(calls).toEqual([{ url: "https://openrouter.ai/api/v1/credits", auth: `Bearer ${FAKE_KEY}` }]);
    expect(result).toMatchObject({ enough: true, remainingMicros: 39_000_000, requiredMicros: estimate().estimateMicros + estimate().inFlightMicros });
    expect(result.reason).toBeNull();
  });
  it.each([
    ["USD 1.07 left", credits(101.07, 100), 1_070_000],
    ["one microdollar too little", null, null],
    ["more usage than credits", credits(1, 2), -1_000_000],
  ] as const)("refuses with %s", async (name, fetcher, remaining) => {
    const e = estimate(), required = e.estimateMicros + e.inFlightMicros;
    const result = await physicalCreditPreflight(FAKE_KEY, e, fetcher ?? credits((required - 1) / 1e6, 0));
    expect(result).toMatchObject({ enough: false, reason: "insufficient-credits", remainingMicros: remaining ?? required - 1, requiredMicros: required });
    expect(name).toBeTruthy();
  });
  it("starts when remaining exactly covers the estimate and in-flight need", async () => {
    const e = estimate(), required = e.estimateMicros + e.inFlightMicros;
    expect(await physicalCreditPreflight(FAKE_KEY, e, credits(required / 1e6, 0))).toMatchObject({ enough: true });
  });
  it.each([
    ["HTTP 403", credits(40, 1, 403)],
    ["HTTP 500", credits(40, 1, 500)],
    ["a lost connection", (async () => { throw Error(`socket ${FAKE_KEY}`); }) as typeof fetch],
    ["a body that is not JSON", (async () => new Response("no")) as typeof fetch],
    ["a missing field", (async () => Response.json({ data: { total_credits: 40 } })) as typeof fetch],
    ["a text amount", credits("40", 1)],
    ["a negative amount", credits(-1, 0)],
  ] as const)("refuses on %s, and never repeats the key", async (_name, fetcher) => {
    const result = await physicalCreditPreflight(FAKE_KEY, estimate(), fetcher);
    expect(result).toMatchObject({ enough: false, reason: "credit-read-failed", remainingMicros: null });
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
  });
  it("leaves the prepared folder usable after a refused credit check", async () => {
    const input = await setAndPlan(), mem = memoryBudget(), silent = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(executePhysical({ ...execution(input, mem), preflight: async () => states(), creditFetch: credits(101.07, 100) })).rejects.toThrow("credit-preflight:insufficient-credits");
      expect(await readdir(input.out)).not.toContain("execution.json");
      expect(await readdir(input.out)).not.toContain("dispatch-plan.json");
      const results = await executePhysical({ ...execution(input, mem), preflight: async () => states(), creditFetch: credits(40, 1) });
      expect(results).toHaveLength(4);
      expect(await readdir(input.out)).toContain("execution.json");
      expect(JSON.parse(await readFile(resolve(input.out, "credit-preflight.json"), "utf8"))).toMatchObject({ enough: true });
      await expect(executePhysical({ ...execution(input, mem), preflight: async () => states(), creditFetch: credits(40, 1) })).rejects.toThrow("stale-run");
    } finally { silent.mockRestore(); }
  });
  it("asks for the ledger before the execution marker, so a missing ledger key leaves the folder usable", async () => {
    const input = await setAndPlan(), mem = memoryBudget(), silent = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(executePhysical({ ...execution(input, mem), preflight: async () => states(), budget: () => { throw Error("ledger-credential-required"); } })).rejects.toThrow("ledger-credential-required");
      expect(await readdir(input.out)).not.toContain("execution.json");
      expect(await executePhysical({ ...execution(input, mem), preflight: async () => states() })).toHaveLength(4);
    } finally { silent.mockRestore(); }
  });
  it("seals the plan from the reviewed evidence that the price ledger has enabled", async () => {
    const input = await setAndPlan(), open = await openPreparedPhysical(input.out, root);
    for (const state of [...reviewedPhysicalStates(), ...open.states]) {
      expect(hashValue(state.evidence)).toBe(LEDGER_ENABLED[state.evidence.model].hash);
      expect(state.maximumMicros).toBe(LEDGER_ENABLED[state.evidence.model].maximumMicros);
    }
    const plan = JSON.parse(await readFile(resolve(input.out, "plan.json"), "utf8"));
    expect(plan.evidences.map((e: EndpointEvidence) => hashValue(e))).toEqual([LEDGER_ENABLED[SONNET.model].hash, LEDGER_ENABLED[TERRA.model].hash]);
  });
  it("passes the ledger's price check with the reviewed evidence, and a refused check leaves the folder usable", async () => {
    const input = await setAndPlan(), mem = memoryBudget(), silent = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      let paid = 0; const fetcher: typeof fetch = async (u, i) => { paid++; return execution(input, mem).fetch(u, i); };
      const stale = ledgerBudget(mem, { ...LEDGER_ENABLED, [TERRA.model]: { hash: "0".repeat(64), maximumMicros: 1 } });
      await expect(executePhysical({ ...execution(input, mem), fetch: fetcher, preflight: async () => states(), budget: () => stale.budget })).rejects.toThrow("price-refresh:reviewed-price-missing");
      expect(paid).toBe(0); expect(await readdir(input.out)).not.toContain("execution.json");
      expect((await openPreparedPhysical(input.out, root)).run).toBe(input.run);
      const ledger = ledgerBudget(mem);
      expect(await executePhysical({ ...execution(input, mem), fetch: fetcher, preflight: async () => states(), budget: () => ledger.budget })).toHaveLength(4);
      expect(ledger.refreshed).toEqual([SONNET.model, TERRA.model]); expect(paid).toBe(4);
    } finally { silent.mockRestore(); }
  });
  it("reopens a prepared folder only before a run has started", async () => {
    const input = await setAndPlan(), mem = memoryBudget(), silent = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const open = await openPreparedPhysical(input.out, root);
      expect(open.run).toBe(input.run); expect(open.set).toEqual(JSON.parse(JSON.stringify(input.set))); expect(open.states.map(s => s.evidence.model)).toEqual([SONNET.model, TERRA.model]);
      await executePhysical({ ...execution(input, mem), preflight: async () => states() });
      await expect(openPreparedPhysical(input.out, root)).rejects.toThrow("already-started");
    } finally { silent.mockRestore(); }
  });
  it("refuses a paid run at USD 1.07 before any ledger access or model request, and prints the three amounts", async () => {
    const input = await setAndPlan(), mem = memoryBudget(); let budgets = 0, paid = 0;
    const printed: string[] = [], spy = vi.spyOn(console, "log").mockImplementation((...a) => { printed.push(a.join(" ")); });
    try {
      await expect(executePhysical({ ...execution(input, mem), preflight: async () => states(), budget: () => { budgets++; return mem.budget; }, fetch: async () => { paid++; throw Error("must not run"); }, creditFetch: credits(101.07, 100) })).rejects.toThrow("credit-preflight:insufficient-credits");
    } finally { spy.mockRestore(); }
    expect(budgets).toBe(0); expect(paid).toBe(0); expect(mem.holds.size).toBe(0);
    const text = printed.join("\n");
    expect(text).toContain("Estimate: USD 0.07"); expect(text).toContain("In-flight need: USD 4.04"); expect(text).toContain("Remaining: USD 1.07");
    expect(text).not.toContain(FAKE_KEY);
    const saved = await readFile(resolve(input.out, "credit-preflight.json"), "utf8");
    expect(JSON.parse(saved)).toMatchObject({ enough: false, reason: "insufficient-credits", remainingMicros: 1_070_000 });
    expect(saved).not.toContain(FAKE_KEY);
  });
  it("refuses a paid run when the credits read fails, and prints that remaining is unknown", async () => {
    const input = await setAndPlan(), mem = memoryBudget(); let paid = 0;
    const printed: string[] = [], spy = vi.spyOn(console, "log").mockImplementation((...a) => { printed.push(a.join(" ")); });
    try {
      await expect(executePhysical({ ...execution(input, mem), preflight: async () => states(), fetch: async () => { paid++; throw Error("must not run"); }, creditFetch: credits(40, 1, 403) })).rejects.toThrow("credit-preflight:credit-read-failed");
    } finally { spy.mockRestore(); }
    expect(paid).toBe(0); expect(mem.holds.size).toBe(0);
    expect(printed.join("\n")).toContain("Remaining: unknown");
  });
  it("reads credits once, before the first reservation, and sends one request at a time", async () => {
    const input = await setAndPlan(), mem = memoryBudget(), order: string[] = []; let active = 0, most = 0;
    await executePhysical({ ...execution(input, mem), preflight: async () => states(),
      creditFetch: (async () => { order.push("credits"); return enough(); }) as typeof fetch,
      budget: () => ({ ...mem.budget, reserve: async i => { order.push("reserve"); return mem.budget.reserve(i); } }),
      fetch: async (_url, init) => { active++; most = Math.max(most, active); await new Promise(r => setTimeout(r, 1)); active--; return response(input.set.photos[0].photo, modelOf(init)); } });
    expect(order[0]).toBe("credits"); expect(order.filter(o => o === "credits")).toHaveLength(1); expect(order.filter(o => o === "reserve")).toHaveLength(4);
    expect(most).toBe(1);
  });
  it("stops before the credits read when the estimate is over the run stop", async () => {
    const low = await setAndPlan("physical-input", 1000), mem = memoryBudget(); let read = 0;
    const printed = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(executePhysical({ ...execution(low, mem), preflight: async () => states(), creditFetch: (async () => { read++; return enough(); }) as typeof fetch })).rejects.toThrow("estimate-over-run-stop");
    } finally { printed.mockRestore(); }
    expect(read).toBe(0); expect(mem.holds.size).toBe(0);
  });
});

describe("fixed 40 set in the same paid step", () => {
  const states = () => evidences().map(evidence => ({ evidence, maximumMicros: reserveMaximum(evidence) }));
  /** Two photos stand in for the fixed set: the seal and the run do not depend on the count. */
  async function withFixed(maxMicros = 15_000_000) {
    const out = await temp(); await mkdir(resolve(out, "images"));
    await durableJson(resolve(out, "owner.json"), { owner: "local-test-owner" }, true);
    const bytes = await sharp({ create: { width: 1000, height: 1400, channels: 3, background: "white" } }).jpeg().toBuffer();
    const truths = physicalTruth(mapping(), pages(), writeTruthCsv(blankTruth()));
    const set: PhysicalSet = { version: PHYSICAL_VERSION, proofClass: "local-fake", kit: FROZEN_KIT, draftSha256: hashBytes("d"), revision: "a".repeat(28), truthSha256: hashBytes("t"), mappingSha256: hashValue(mapping()), missing: [], photos: [], inventory: mapping().photos.map(m => ({ file: m.file, rawSha256: hashBytes(bytes), reason: null })) };
    for (const m of mapping().photos) {
      const id = physicalPhotoId(m.file), photo: ComparisonPhoto = { id, clear: m.clarity === "clear", image: { path: `images/${id}.jpg`, sha256: hashBytes(bytes), width: 1000, height: 1400, metadataFree: true }, frame: { ...pages()[0].frame, photo: id }, truth: truths.get(m.file)! };
      await writeFile(resolve(out, photo.image.path), bytes); await writeFile(resolve(out, `images/${id}-oriented.jpg`), bytes);
      set.photos.push({ mapping: m, status: "ready", reason: null, rawSha256: hashBytes(bytes), normalizedSha256: hashBytes(bytes), calibration: {}, crops: [], photo });
    }
    await durableJson(resolve(out, "set.json"), set, true);
    await mkdir(resolve(out, "fixed40/photos"), { recursive: true });
    const fixedPhotos = ["synthetic-p3-right", "synthetic-p3-blank"].map(id => {
      const photo: ComparisonPhoto = { id, clear: true, image: { path: `photos/${id}.jpg`, sha256: hashBytes(bytes), width: 1000, height: 1400, metadataFree: true }, frame: { ...pages()[0].frame, photo: id }, truth: truths.get("iphone.jpg")! };
      return photo;
    });
    for (const p of fixedPhotos) await writeFile(resolve(out, "fixed40", p.image.path), bytes);
    const fixed: ComparisonManifest = { version: 1, synthetic: true, identity: { name: "Robin", madeUp: true, containsRealData: false, profileSource: "sampleChild/samplePlanInput" }, source: { synthetic: true, draftSha256: hashBytes("d"), renderSha256: hashBytes("r"), fixtureSha256: hashBytes("f") }, photos: fixedPhotos };
    await durableJson(resolve(out, "fixed40/manifest.json"), fixed, true);
    const { plan, run } = await sealPhysicalPlan(out, set, root, maxMicros, fixed);
    return { out, set, plan, run, fixed };
  }
  it("adds the fixed photos to the estimate, the in-flight need stays one request, and the credit check covers both sets", async () => {
    const e = physicalEstimate(20, states(), 15_000_000, 40);
    expect(e.models.map(m => [m.model, m.requests])).toEqual([[SONNET.model, 60], [TERRA.model, 60]]);
    expect(e.estimateMicros).toBe(2_070_000); expect(e.fixedMicros).toBe(1_380_000); expect(e.robinMicros).toBe(690_000);
    expect(e.inFlightMicros).toBe(physicalEstimate(20, states(), 15_000_000).inFlightMicros);
    expect(physicalEstimateLines(e).join("\n")).toContain("Robin USD 0.69, fixed 40 USD 1.38");
    const low = (async () => Response.json({ data: { total_credits: 5, total_usage: 0 } })) as typeof fetch;
    expect(await physicalCreditPreflight("k", e, low)).toMatchObject({ enough: false, requiredMicros: e.estimateMicros + e.inFlightMicros });
  });
  it("fake-runs both sets on both models, with a v8 row next to the saved v7 row", async () => {
    const input = await withFixed();
    await fakePhysicalHttp(input.out, input.set, input.plan, input.run, undefined, input.fixed);
    const saved = JSON.parse(await readFile(resolve(input.out, "fixed40-results.json"), "utf8")) as ComparisonResult[];
    expect(saved).toHaveLength(4);
    const report = physicalFixedReport(input.fixed, saved, evidences(), input.run);
    expect(report.rows.map(r => r.model)).toEqual([SONNET.model, TERRA.model]);
    expect(report.rows[0]).toMatchObject({ v8: { complete: false, wrongMarks: 0, wrongAsRight: 0, prompt: "whole-page-scalar-readings-v9" }, v7: { prompt: "whole-page-scalar-readings-v7", wrongMarks: 0, definite: 218, wrongAsRight: 0, clearUnsure: 1, clear: 219, costPerPageUsd: 0.01095165, latencyP50Ms: 2551, latencyP95Ms: 3164 } });
    expect(report.rows[1].v7).toMatchObject({ costPerPageUsd: 0.005076625, latencyP50Ms: 2270, latencyP95Ms: 3264 });
    const team = TWO_WAYS_METHOD_MARKS ? 0 : 2;
    expect(report.rows[0].v8).toMatchObject({ clearUnsure: 0, clear: 18 - team, clearUnsureRate: 0, clearUnsureWithTeam: team, clearWithTeam: 18, clearUnsureRateWithTeam: team / 18,
      twoWays: { items: 2, clearItems: 2, clearUnsure: team, clearUnsureRate: TWO_WAYS_METHOD_MARKS ? 0 : 1 } });
    const text = physicalFixedSideBySide(report);
    for (const piece of ["v8", "v7", "Sonnet 5.5", "Terra 6.1", "0/218", "1/219", "2W unsure", "Unsure+team", `0/${18 - team} 0.0%`, `${team}/18 ${(team / 18 * 100).toFixed(1)}%`, "1/219 0.5%"]) expect(text).toContain(piece);
    const v7Lines = text.split("\n").filter(line => line.includes("v7") && line.includes("1/219"));
    expect(v7Lines).toHaveLength(2);
    for (const line of v7Lines) expect(line.match(/n\/a/g)).toHaveLength(2);
    if (!TWO_WAYS_METHOD_MARKS) expect(text).toContain("reads 100% while the method switch is off");
    expect(text.split("\n")[0]).toBe(team ? `${team} items went to the team: two-ways method marking is off.` : "0 items went to the team.");
  });
  it("runs the fixed set after Robin in one serial queue, under one credit check, and replays both", async () => {
    const input = await withFixed(), mem = memoryBudget(), printed = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const real = { ...input, set: { ...input.set, proofClass: "physical-input" as const } };
      await durableJson(resolve(input.out, "set.json"), real.set);
      const sealed = await reseal(input.out, real.set, input.fixed);
      const calls: string[] = []; let credit = 0;
      const results = await executePhysical({ out: input.out, set: real.set, plan: sealed.plan, root, budget: () => mem.budget, env: () => ({ SCAN_MARKING_OPENROUTER_API_KEY: FAKE_KEY }), preflight: async () => states(), fixed: input.fixed,
        creditFetch: (async () => { credit++; return enough(); }) as typeof fetch,
        fetch: async (_u, init) => { const m = modelOf(init); calls.push(m.model); return response(input.set.photos[0].photo, m); } });
      expect(credit).toBe(1); expect(calls).toHaveLength(8); expect(results).toHaveLength(4);
      const fixedResults = JSON.parse(await readFile(resolve(input.out, "fixed40-results.json"), "utf8")) as ComparisonResult[];
      expect(fixedResults.map(r => r.photo)).toEqual(["synthetic-p3-right", "synthetic-p3-right", "synthetic-p3-blank", "synthetic-p3-blank"]);
      expect(JSON.parse(await readFile(resolve(input.out, "fixed40-report.json"), "utf8")).rows).toHaveLength(2);
    } finally { printed.mockRestore(); }
  });
  it("stops the run when the bound fixed set changes", async () => {
    const input = await withFixed(), mem = memoryBudget();
    const real = { ...input.set, proofClass: "physical-input" as const };
    await durableJson(resolve(input.out, "set.json"), real);
    const sealed = await reseal(input.out, real, input.fixed);
    await writeFile(resolve(input.out, "fixed40", input.fixed.photos[0].image.path), "changed");
    await expect(executePhysical({ out: input.out, set: real, plan: sealed.plan, root, budget: () => mem.budget, env: () => ({ SCAN_MARKING_OPENROUTER_API_KEY: FAKE_KEY }), preflight: async () => states(), fixed: input.fixed, creditFetch: enough as typeof fetch, fetch: async () => { throw Error("must not run"); } })).rejects.toThrow("fixed-set");
    expect(mem.holds.size).toBe(0);
  });
  const reseal = async (out: string, set: PhysicalSet, fixed: ComparisonManifest) => { await rm(resolve(out, "plan.json")); await rm(resolve(out, "plan-hash.json")); return sealPhysicalPlan(out, set, root, 15_000_000, fixed); };
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
