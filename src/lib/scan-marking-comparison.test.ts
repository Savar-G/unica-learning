import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import fixtures from "./scan-marking-comparison.test-fixtures.json";
import publicEvidence from "../../data/scan-marking-endpoint-evidence-20261106.json";
import { COMPARISON_FORMATS, COMPARISON_MODELS, SYNTHETIC_IDS, assertComparisonResume, cheapestPassing, comparisonProvider, hashBytes, hashValue, labelledOutput, preflightEndpoint, projectMatrix, reserveMaximum, scoreComparison, transportUsage, validateComparisonManifest, type ComparisonFormat, type ComparisonManifest, type ComparisonModel, type ComparisonPhoto, type ComparisonResult, type EndpointSnapshot, type LabelledReading } from "@/lib/scan-marking-comparison";
import { runComparisonPhoto, type EvaluationBudget, type EvaluationJournal } from "@/lib/scan-marking-comparison-run";
import { markingRequest, readMarkingOutput, validMarkingOutput } from "@/lib/scan-marking";
import { checkQuestionPackage, type QuestionPackage } from "@/lib/question-package";
import { markingRegions } from "@/lib/scan-marking-regions";
import { fileJournal, rpcEvaluationBudget } from "../../scripts/scan-marking-comparison-cli";
import { syntheticChoiceCenters, syntheticReading, syntheticTextSvg } from "../../scripts/scan-marking-synthetic-photos";
import sharp from "sharp";

const copy = <T>(v: T): T => structuredClone(v);
const snapshot = (model: ComparisonModel): EndpointSnapshot => copy(publicEvidence.snapshots[model.model as keyof typeof publicEvidence.snapshots]) as EndpointSnapshot;
const evidence = (m = COMPARISON_MODELS[0]) => preflightEndpoint(m, snapshot(m), copy(publicEvidence.zdr));
function readingText(region: ReturnType<typeof markingRegions>[number], wrong: boolean): string {
  if (region.kind === "number") return String(wrong ? region.answer + 1 : region.answer);
  if (region.kind === "text") return wrong ? "made up wrong words" : region.answer;
  if (region.kind === "choice") return wrong ? region.choices.find(c => c !== region.answer)! : region.answer;
  if (wrong) return "999/1000";
  return region.answer.type === "mixed" ? `${region.answer.whole} ${region.answer.numerator}/${region.answer.denominator}` : region.answer.type === "fraction" ? `${region.answer.numerator}/${region.answer.denominator}` : String(region.answer.value);
}
function photo(n = 0): ComparisonPhoto {
  const id = `synthetic-photo-${n}`, state = ["right", "wrong", "blank", "uncertain"][n % 20] ?? "right";
  const frame: ComparisonPhoto["frame"] = { parentId: SYNTHETIC_IDS.parent, childId: SYNTHETIC_IDS.child, workbookId: SYNTHETIC_IDS.workbook, pageId: "synthetic-page-3", pageNumber: 3, printedRevision: "a".repeat(28), photo: id, ready: true,
    questions: COMPARISON_FORMATS.map((format, i) => {
      const pkg = copy(fixtures.packages[format as keyof typeof fixtures.packages]) as unknown as QuestionPackage;
      pkg.id = `synthetic-item-${i}`; pkg.ref = { source: "workbook", workbookId: SYNTHETIC_IDS.workbook, page: 3, question: i + 1 };
      expect(checkQuestionPackage(pkg).ok).toBe(true);
      return { number: i + 1, package: pkg, teaching: null, regions: pkg.item!.regions.map((r, k) => ({ id: r.id, kind: r.kind, box: { x: 10 + k * 210, y: 10 + i * 110, width: 200, height: 100 } })) };
    }) };
  return { id, clear: state !== "uncertain", image: { path: `${id}.jpg`, sha256: hashBytes(id), width: 1000, height: 1400, metadataFree: true }, frame,
    truth: frame.questions.map((q, i) => ({ itemId: q.package!.id, format: COMPARISON_FORMATS[i] as ComparisonFormat,
      result: COMPARISON_FORMATS[i] === "two-ways" ? "parent" : state as "right" | "wrong" | "blank" | "uncertain",
      readings: markingRegions(q).map(r => ({ regionId: r.id, state: state === "blank" ? "blank" : state === "uncertain" ? "uncertain" : "written", text: state === "blank" ? "" : state === "uncertain" ? null : readingText(r, state === "wrong"), issue: state === "uncertain" ? "blurry" : null }) as LabelledReading) })) };
}
function manifest(): ComparisonManifest {
  return { version: 1, synthetic: true, identity: { name: "Robin", madeUp: true, containsRealData: false, profileSource: "sampleChild/samplePlanInput" }, source: { synthetic: true, draftSha256: hashBytes("draft"), renderSha256: hashBytes("render"), fixtureSha256: hashBytes("fixture") }, photos: Array.from({ length: 40 }, (_, n) => photo(n)) };
}
function result(p: ComparisonPhoto, m = COMPARISON_MODELS[0], cost = 1000): ComparisonResult {
  return { model: m.model, photo: p.id, status: "complete", failure: null, attempts: [{ id: hashBytes(p.id + m.model), latencyMs: 100, error: null, usage: { generationId: "gen-synthetic", provider: m.providerName, model: m.model, costMicros: cost, inputTokens: 4000, outputTokens: 100, reasoningTokens: 0, imageTokens: 2000 } }], observations: readMarkingOutput(p.frame, labelledOutput(p)), schemaValid: true, requestHash: hashValue(markingRequest(p.frame, new Uint8Array())), photoHash: p.image.sha256, evidenceHash: hashValue(evidence(m)) };
}
function memory() {
  const files = new Map<string, unknown>(), calls: string[] = [], amounts = new Map<string, number | null>();
  let counter = 0, held = 0;
  const journal: EvaluationJournal = { begin: async key => { if (files.has(key)) return false; files.set(key, { state: "starting" }); return true; }, save: async (key, value) => { files.set(key, copy(value)); } };
  const budget: EvaluationBudget = {
    reserve: async input => { calls.push("reserve"); if (held + input.maximumMicros > input.maxRunMicros) return { refused: "run-budget" }; held += input.maximumMicros; const id = String(++counter); amounts.set(id, null); return { id }; },
    settle: async (id, cost) => { calls.push("settle"); amounts.set(id, cost); },
  };
  return { journal, budget, files, calls, amounts };
}
const response = (p: ComparisonPhoto, m = COMPARISON_MODELS[0], overrides = {}) => Response.json({ id: "gen-synthetic", provider: m.providerName, model: m.model, usage: { cost: 0.001, prompt_tokens: 4000, completion_tokens: 100, completion_tokens_details: { reasoning_tokens: 0 }, prompt_tokens_details: { image_tokens: 2000 } }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(labelledOutput(p)) } }], ...overrides });
const runOptions = (p: ComparisonPhoto, mem: ReturnType<typeof memory>) => {
  p.image.sha256 = hashBytes(new Uint8Array([1, 2, 3]));
  return { run: hashBytes("fixed-run"), photo: p, image: new Uint8Array([1, 2, 3]), model: COMPARISON_MODELS[0], evidence: evidence(), maximumMicros: 2_000_000, maxRunMicros: 15_000_000, budget: mem.budget, journal: mem.journal, env: { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" } };
};

describe("fixed model and endpoint policy", () => {
  it("keeps exactly the authorized 13 pairs immutable and distinguishes display names", () => {
    expect(COMPARISON_MODELS).toHaveLength(13);
    expect(hashValue(COMPARISON_MODELS)).toBe("47c71636e08297a0f5837960ab2c6168cd988be2632d867c3284b613bc0e4583");
    expect(Object.isFrozen(COMPARISON_MODELS)).toBe(true); expect(COMPARISON_MODELS.every(Object.isFrozen)).toBe(true);
    expect(COMPARISON_MODELS.find(m => m.model.includes("3.7"))).toBeUndefined();
    for (const m of COMPARISON_MODELS) expect(preflightEndpoint(m, snapshot(m), publicEvidence.zdr).endpoint.provider_name).toBe(m.providerName);
  });
  it("checks exact endpoint schema support and rejects aggregate-only or substituted evidence", () => {
    const m = COMPARISON_MODELS[0], s = snapshot(m);
    s.data.endpoints.find(e => e.tag === m.endpoint)!.supported_parameters = ["response_format"];
    expect(() => preflightEndpoint(m, s, publicEvidence.zdr)).toThrow("schema");
    expect(() => preflightEndpoint(m, snapshot(COMPARISON_MODELS[1]), publicEvidence.zdr)).toThrow("model");
    const missing = snapshot(m); missing.data.endpoints = [];
    expect(() => preflightEndpoint(m, missing, publicEvidence.zdr)).toThrow("missing");
    const noImage = snapshot(m); noImage.data.architecture.input_modalities = ["text"];
    expect(() => preflightEndpoint(m, noImage, publicEvidence.zdr)).toThrow("image");
  });
  it("reports Safety Retention distinctly and does not assert ZDR for Alibaba", () => {
    for (const m of COMPARISON_MODELS.filter(m => m.model.startsWith("google/"))) expect(evidence(m).policy).toBe("safety-retention");
    expect(evidence(COMPARISON_MODELS.find(m => m.providerName === "Alibaba")!).policy).toBe("not-zdr");
    expect(evidence(COMPARISON_MODELS.at(-1)!).policy).toBe("strict-zdr");
  });
  it("excludes suffix routes when the pinned slug is a provider prefix", () => {
    const m = COMPARISON_MODELS.find(m => m.endpoint === "azure")!, e = evidence(m), route = comparisonProvider(m, e);
    expect(route.only).toEqual(["azure"]); expect(route.allow_fallbacks).toBe(false);
    expect(route.ignore).toEqual(snapshot(m).data.endpoints.filter(e => e.tag.startsWith("azure/")).map(e => e.tag).sort());
  });
});

describe("synthetic manifest and fixed truth", () => {
  it("draws only labelled synthetic text and keeps decimal/fraction/blank/uncertain readings explicit", () => {
    const p = photo(), decimal = markingRegions(p.frame.questions[2])[0], fraction = markingRegions(p.frame.questions[1])[0];
    expect(syntheticReading(decimal, 0).text).toBe("6.1"); expect(syntheticReading(fraction, 0).text).toBe("1/9");
    expect(syntheticReading(decimal, 2)).toMatchObject({ state: "blank", text: "", issue: null });
    expect(syntheticReading(decimal, 3)).toMatchObject({ state: "uncertain", text: null, issue: "blurry" });
    expect(syntheticTextSvg("even", { x: 0, y: 0, width: 100, height: 100 })).toContain("polyline");
    expect(() => syntheticTextSvg("unsupported", { x: 0, y: 0, width: 100, height: 100 })).toThrow("glyph");
  });
  it("locates the printed tick boxes from pixels and refuses an unproven option count", async () => {
    const bytes = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="white"/>${[10,100,190,280].map(x => `<rect x="${x}" y="30" width="30" height="30" fill="none" stroke="black" stroke-width="3"/>`).join("")}</svg>`)).png().toBuffer();
    const region = { id: "operation", kind: "choice" as const, mark: "tick" as const, choices: ["+", "-", "x", "/"], answer: "+", box: { x: 0, y: 0, width: 400, height: 100 } };
    const centers = await syntheticChoiceCenters(bytes, region);
    expect(centers.map(c => [c.x, c.y])).toEqual([[24.5,44.5],[114.5,44.5],[204.5,44.5],[294.5,44.5]]);
    await expect(syntheticChoiceCenters(bytes, { ...region, choices: ["+", "-"] })).rejects.toThrow("geometry");
  });
  it("accepts all first-book formats with wrong/right/blank/uncertain controls and parent-only methods", () => {
    const m = manifest(); expect(() => validateComparisonManifest(m)).not.toThrow();
    expect(new Set(m.photos.flatMap(p => p.truth.map(t => t.format))).size).toBe(9);
    expect(validMarkingOutput(m.photos[0].frame, labelledOutput(m.photos[0]))).toBe(true);
  });
  it.each(["identity", "source", "photo", "hash", "region", "truth", "formats", "old-whole-only", "count"])("rejects invalid %s before dispatch", kind => {
    const m = manifest();
    if (kind === "identity") m.identity.madeUp = false as true;
    if (kind === "source") m.source.renderSha256 = "missing";
    if (kind === "photo") m.photos[1].id = m.photos[0].id;
    if (kind === "hash") m.photos[1].image.sha256 = m.photos[0].image.sha256;
    if (kind === "region") m.photos[0].truth[0].readings[0].regionId = "another-region";
    if (kind === "truth") m.photos[0].truth[0].result = "wrong";
    if (kind === "formats") m.photos[0].truth[0].format = "fraction";
    if (kind === "old-whole-only") for (const p of m.photos) { p.frame.questions = [p.frame.questions[0]]; p.truth = [p.truth[0]]; }
    if (kind === "count") m.photos.pop();
    expect(() => validateComparisonManifest(m)).toThrow();
  });
  it("rejects duplicate, extra, missing, unsupported and unreasoned schema readings", () => {
    const p = photo(), good = labelledOutput(p);
    for (const mutate of [(o: typeof good) => o.readings.pop(), (o: typeof good) => o.readings.push(o.readings[0]), (o: typeof good) => { o.readings[0].item = "unrequested"; }, (o: typeof good) => { o.readings[0].state = "uncertain"; o.readings[0].issue = null; }]) {
      const bad = copy(good); mutate(bad); expect(validMarkingOutput(p.frame, bad)).toBe(false);
    }
    expect(validMarkingOutput(p.frame, { ...good, cost: 0 })).toBe(false);
  });
});

describe("production request, durable dispatch and transport accounting", () => {
  it("sends the same production prompt/schema/full-page route to all 13 hosts without keys or truth", async () => {
    const p = photo(), bodies: Record<string, unknown>[] = [];
    for (const model of COMPARISON_MODELS) {
      const mem = memory();
      const r = await runComparisonPhoto({ ...runOptions(p, mem), model, evidence: evidence(model), fetch: async (_url, init) => {
        mem.calls.push("fetch"); bodies.push(JSON.parse(String(init?.body))); return response(p, model);
      } });
      expect(r.status).toBe("complete"); expect(mem.calls).toEqual(["reserve", "fetch", "settle"]);
      const body = bodies.at(-1)!;
      expect(body.provider).toEqual(comparisonProvider(model, evidence(model)));
      expect(body.model).toBe(model.model); expect(body.max_tokens).toBe(4096);
      const sent = JSON.stringify(body);
      expect(sent).not.toContain("Robin"); expect(sent).not.toContain(SYNTHETIC_IDS.workbook); expect(sent).not.toContain("made up wrong words");
      expect(sent).not.toContain("synthetic-item"); expect(sent).not.toContain("costMicros");
      expect(JSON.stringify(body.messages)).toContain("data:image/jpeg;base64,AQID");
    }
    expect(new Set(bodies.map(b => JSON.stringify([b.messages, b.response_format, b.reasoning]))).size).toBe(1);
  });
  it("fails closed without the dedicated key and never reserves or fetches", async () => {
    const p = photo(), mem = memory();
    const r = await runComparisonPhoto({ ...runOptions(p, mem), env: { OPENROUTER_API_KEY: "shared" }, fetch: async () => { throw new Error("must not fetch"); } });
    expect(r.status).toBe("failed"); expect(mem.calls).toEqual([]);
  });
  it("holds unknown usage, prevents blind retry, and never redispatches the same crashed/unknown attempt", async () => {
    const p = photo(), mem = memory(); let fetched = 0;
    const options = { ...runOptions(p, mem), maxAttempts: 2 as const, fetch: async () => { fetched++; return new Response("lost", { status: 503 }); } };
    const first = await runComparisonPhoto(options), second = await runComparisonPhoto(options);
    expect(fetched).toBe(1); expect(first.status).toBe("failed"); expect(second.status).toBe("failed");
    expect(first.attempts[0].usage.costMicros).toBeNull(); expect([...mem.amounts.values()]).toEqual([null]);
  });
  it("persists each known-cost retry separately and includes rejected response cost", async () => {
    const p = photo(), mem = memory(); let fetched = 0;
    const r = await runComparisonPhoto({ ...runOptions(p, mem), maxAttempts: 2, fetch: async () => {
      mem.calls.push("fetch"); fetched++;
      if (fetched === 1) return Response.json({ id: "gen-retry", provider: COMPARISON_MODELS[0].providerName, model: COMPARISON_MODELS[0].model, usage: { cost: 0.002, prompt_tokens: 4000, completion_tokens: 1, completion_tokens_details: { reasoning_tokens: 0 } }, error: { message: "temporary" } }, { status: 503 });
      return response(p);
    } });
    expect(r.status).toBe("complete"); expect(r.attempts.map(a => a.usage.costMicros)).toEqual([2000, 1000]);
    expect(mem.calls).toEqual(["reserve", "fetch", "settle", "reserve", "fetch", "settle"]);
  });
  it.each(["schema", "refusal", "provider", "model", "usage"])("records %s as a failure and settles only HTTP usage", async kind => {
    const p = photo(), mem = memory();
    const changes = kind === "schema" ? { choices: [{ finish_reason: "stop", message: { content: '{"readings":[],"cost":0}' } }] } : kind === "refusal" ? { choices: [{ finish_reason: "stop", message: { refusal: "refused" } }] } : kind === "provider" ? { provider: "another-host" } : kind === "model" ? { model: "another-model" } : { usage: {} };
    const r = await runComparisonPhoto({ ...runOptions(p, mem), fetch: async () => response(p, COMPARISON_MODELS[0], changes) });
    expect(r.status).toBe("failed"); expect([...mem.amounts.values()]).toEqual([kind === "usage" ? null : 1000]);
    if (kind === "refusal") expect(r.failure).toBe("refusal");
  });
  it("a budget refusal or failed durable reservation causes zero HTTP attempts", async () => {
    for (const broken of [false, true]) {
      const mem = memory(), p = photo(); let fetched = 0;
      const r = await runComparisonPhoto({ ...runOptions(p, mem), maxRunMicros: 1, journal: broken ? { ...mem.journal, save: async () => { throw new Error("disk failure"); } } : mem.journal, fetch: async () => { fetched++; return response(p); } });
      expect(r.status).toBe("failed"); expect(fetched).toBe(0);
    }
  });
  it("a saved reservation followed by a journal write failure never dispatches or releases an unknown hold", async () => {
    const mem = memory(), p = photo(); let fetched = 0;
    const options = { ...runOptions(p, mem), journal: { ...mem.journal, save: async () => { throw new Error("disk failure after reservation"); } }, fetch: async () => { fetched++; return response(p); } };
    const failed = await runComparisonPhoto(options);
    expect(failed.status).toBe("failed"); expect(fetched).toBe(0); expect([...mem.amounts.values()]).toEqual([null]);
    expect((await runComparisonPhoto(options)).status).toBe("failed"); expect(fetched).toBe(0);
  });
  it("rejects a real identity or changed image at the public runner before reservation", async () => {
    const mem = memory(), p = photo(), options = runOptions(p, mem);
    p.frame.childId = "a-real-child";
    await expect(runComparisonPhoto(options)).rejects.toThrow("synthetic");
    p.frame.childId = SYNTHETIC_IDS.child;
    await expect(runComparisonPhoto({ ...options, image: new Uint8Array([99]) })).rejects.toThrow("image-hash");
    expect(mem.calls).toEqual([]);
  });
  it("uses exclusive durable files across concurrent spawn-then-use callers", async () => {
    const folder = await mkdtemp(resolve(tmpdir(), "marking-journal-"));
    try {
      const a = fileJournal(folder), b = fileJournal(folder), key = hashBytes("attempt");
      const accepted = await Promise.all([a.begin(key), b.begin(key)]);
      expect(accepted.filter(Boolean)).toHaveLength(1);
      await a.save(key, { state: "unknown" }); expect(await b.begin(key)).toBe(false);
      expect(JSON.parse(await readFile(resolve(folder, `${key}.json`), "utf8"))).toEqual({ state: "unknown" });
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
  it("an unresolved crash for one model blocks subsequent dispatch to every model on resume", () => {
    const r = result(photo()), attempt = r.attempts[0];
    expect(() => assertComparisonResume([{ state: "settled", attempt }], [r])).not.toThrow();
    for (const state of ["starting", "reserved", "response", "unknown"]) expect(() => assertComparisonResume([{ state, attempt }], [r])).toThrow("unresolved");
    expect(() => assertComparisonResume([{ state: "settled", attempt }], [])).toThrow("unresolved");
    expect(() => assertComparisonResume([{ state: "settled", attempt: { ...attempt, usage: { costMicros: null } } }], [r])).toThrow("unresolved");
  });
  it("the RPC adapter checks budget response and settlement refusal without an inference request", async () => {
    const urls: string[] = [];
    const budget = rpcEvaluationBudget("https://cdjobwsyzndtltzfpyqa.supabase.co", "synthetic-service", async url => { urls.push(String(url)); return Response.json(urls.length === 1 ? { refused: "shared-month-budget" } : false); });
    expect(await budget.reserve({ run: hashBytes("run"), attempt: hashBytes("attempt"), model: "m", endpoint: "e", evidence: hashBytes("e"), maximumMicros: 1, maxRunMicros: 15_000_000, pixels: 100 })).toEqual({ refused: "shared-month-budget" });
    await expect(budget.settle("synthetic", 0)).rejects.toThrow("settlement");
    expect(urls.every(url => url.includes("/rest/v1/rpc/"))).toBe(true);
  });
});

describe("D267 denominators, projection and selection", () => {
  it("counts every automated item, keeps parent methods separate, and measures clear-photo unsure", () => {
    const m = manifest(), results = m.photos.map(p => result(p)), report = scoreComparison(m, COMPARISON_MODELS[0], results, evidence());
    expect(report.denominator).toBe(320); expect(report.parentMethods).toBe(40); expect(report.clearDenominator).toBe(304);
    expect(report.wrongMarkDenominator).toBe(302); expect(report.wrongMarks).toBe(0); expect(report.wrongAsRight).toBe(0); expect(report.unsure).toBe(18); expect(report.clearUnsure).toBe(2); expect(report.passed).toBe(true);
    const missing = scoreComparison(m, COMPARISON_MODELS[0], results.slice(1), evidence());
    expect(missing.denominator).toBe(320); expect(missing.complete).toBe(false); expect(missing.passed).toBe(false); expect(missing.missingRuns).toBe(1);
    const refused = copy(results); refused[0].status = "failed"; refused[0].failure = "refusal"; refused[0].schemaValid = false;
    const refusalReport = scoreComparison(m, COMPARISON_MODELS[0], refused, evidence());
    expect(refusalReport.refusals).toBe(1); expect(refusalReport.schemaFailures).toBe(0); expect(refusalReport.schemaUnvalidated).toBe(1);
  });
  it("zero wrong-as-right is binding even below the aggregate wrong-mark threshold", () => {
    const m = manifest(), results = m.photos.map(p => result(p)); results[1].observations[0].result = "right";
    const report = scoreComparison(m, COMPARISON_MODELS[0], results, evidence());
    expect(report.wrongMarks).toBe(1); expect(report.wrongAsRight).toBe(1); expect(report.passed).toBe(false);
  });
  it("the 1 percent limit uses definite marks; unsure results cannot dilute its denominator", () => {
    const m = manifest(), results = m.photos.map(p => result(p));
    for (let i = 0; i < 4; i++) results[0].observations[i].result = "wrong";
    const report = scoreComparison(m, COMPARISON_MODELS[0], results, evidence());
    expect(report.wrongMarks).toBe(4); expect(report.wrongMarkDenominator).toBe(302); expect(report.passed).toBe(false);
  });
  it("schema, refusal, duplicate, missing-cost and excess clear unsure cannot pass", () => {
    const m = manifest();
    for (const kind of ["schema", "failed", "duplicate", "cost", "unsure", "missing-item"]) {
      const results = m.photos.map(p => result(p));
      if (kind === "schema") results[0].schemaValid = false;
      if (kind === "failed") results[0].status = "failed";
      if (kind === "duplicate") results.push(results[0]);
      if (kind === "cost") results[0].attempts[0].usage.costMicros = null;
      if (kind === "unsure") for (const r of results) for (const o of r.observations) { o.result = null; o.issue = "blurry"; }
      if (kind === "missing-item") results[0].observations.shift();
      expect(scoreComparison(m, COMPARISON_MODELS[0], results, evidence()).passed).toBe(false);
    }
  });
  it("uses measured first-photo image-inclusive tokens, output liability and all retries; unknown usage blocks", () => {
    const es = COMPARISON_MODELS.map(m => evidence(m)), first = new Map(COMPARISON_MODELS.map(m => [m.model, result(photo(), m).attempts[0].usage])), remaining = new Map(COMPARISON_MODELS.map(m => [m.model, 39]));
    const one = projectMatrix(es, first, 1000, remaining, 1), two = projectMatrix(es, first, 1000, remaining, 2);
    expect(one).toBeGreaterThan(1000); expect(two).toBe(2 * one! - 1000);
    first.get(COMPARISON_MODELS[0].model)!.costMicros = null;
    expect(projectMatrix(es, first, 1000, remaining, 1)).toBeNull();
    expect(transportUsage({ choices: [{ message: { content: '{"usage":{"cost":0}}' } }] }).costMicros).toBeNull();
    expect(es.map(reserveMaximum).every(n => Number.isSafeInteger(n) && n > 0)).toBe(true);
  });
  it("selects only the cheapest measured passing report after every model has the complete fixed set", () => {
    const m = manifest(), reports = COMPARISON_MODELS.map((model, n) => scoreComparison(m, model, m.photos.map(p => result(p, model, 100 + n)), evidence(model)));
    expect(cheapestPassing(reports)?.model).toBe(COMPARISON_MODELS[0].model);
    expect(cheapestPassing(reports.slice(1))).toBeNull(); reports[1].complete = false;
    expect(cheapestPassing(reports)).toBeNull();
  });
});
