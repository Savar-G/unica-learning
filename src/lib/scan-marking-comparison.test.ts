import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import fixtures from "./scan-marking-comparison.test-fixtures.json";
import publicEvidence from "../../data/scan-marking-endpoint-evidence-20261106.json";
import { COMPARISON_DEFERRAL_POLICY, COMPARISON_FORMATS, COMPARISON_MODELS, COMPARISON_SETTINGS, SYNTHETIC_IDS, assessComparisonEndpoint, assertComparisonResultIdentity, assertComparisonResume, cheapestPassing, clean429, comparisonProvider, comparisonReports, deferredAttempt, hashBytes, hashValue, labelledOutput, preflightEndpoint, projectMatrix, recoverComparisonResults, reserveMaximum, scoreComparison, selectComparisonModels, transportUsage, validateComparisonManifest, type AttemptRecord, type CapturedResponse, type ComparisonFormat, type ComparisonManifest, type ComparisonModel, type ComparisonPhoto, type ComparisonPreflight, type ComparisonResult, type EndpointSnapshot, type LabelledReading } from "@/lib/scan-marking-comparison";
import { runComparisonMatrix, runComparisonPhoto, type EvaluationBudget, type EvaluationJournal } from "@/lib/scan-marking-comparison-run";
import { markingRequest, readMarkingOutput, validMarkingOutput } from "@/lib/scan-marking";
import { checkQuestionPackage, type QuestionPackage } from "@/lib/question-package";
import { markingRegions } from "@/lib/scan-marking-regions";
import { fileJournal, refreshEvidence, rpcEvaluationBudget } from "../../scripts/scan-marking-comparison-cli";
import { syntheticChoiceCenters, syntheticReading, syntheticTextSvg } from "../../scripts/scan-marking-synthetic-photos";
import { suppliedMethodText } from "./scan-marking-methods";
import sharp from "sharp";

const copy = <T>(v: T): T => structuredClone(v);
const snapshot = (model: ComparisonModel): EndpointSnapshot => copy(publicEvidence.snapshots[model.model as keyof typeof publicEvidence.snapshots]) as EndpointSnapshot;
const evidence = (m = COMPARISON_MODELS[0]) => preflightEndpoint(m, snapshot(m), copy(publicEvidence.zdr));
function readingText(region: ReturnType<typeof markingRegions>[number], wrong: boolean): string {
  if (region.kind === "number") return String(wrong ? region.answer + 1 : region.answer);
  if (region.kind === "text") return wrong ? "made up wrong words" : region.answer;
  if (region.kind === "choice") return wrong ? region.choices.find(c => c !== region.answer)! : region.answer;
  if (region.kind === "method") return suppliedMethodText(region, region.id === "method-2" ? 1 : 0, wrong);
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
      result: state as "right" | "wrong" | "blank" | "uncertain",
      readings: markingRegions(q).map(r => ({ regionId: r.id, state: state === "blank" ? "blank" : state === "uncertain" ? "uncertain" : "written", text: state === "blank" ? "" : state === "uncertain" ? null : readingText(r, state === "wrong"), issue: state === "uncertain" ? "blurry" : null }) as LabelledReading) })) };
}
function manifest(): ComparisonManifest {
  return { version: 1, synthetic: true, identity: { name: "Robin", madeUp: true, containsRealData: false, profileSource: "sampleChild/samplePlanInput" }, source: { synthetic: true, draftSha256: hashBytes("draft"), renderSha256: hashBytes("render"), fixtureSha256: hashBytes("fixture") }, photos: Array.from({ length: 40 }, (_, n) => photo(n)) };
}
function result(p: ComparisonPhoto, m = COMPARISON_MODELS[0], cost = 1000): ComparisonResult {
  return { run: hashBytes("fixed-run"), model: m.model, photo: p.id, status: "complete", failure: null, attempts: [{ id: hashBytes(p.id + m.model), latencyMs: 100, error: null, usage: { generationId: "gen-synthetic", provider: m.providerName, model: m.model, costMicros: cost, inputTokens: 4000, outputTokens: 100, reasoningTokens: 0, imageTokens: 2000 } }], observations: readMarkingOutput(p.frame, labelledOutput(p)), schemaValid: true, requestHash: hashValue(markingRequest(p.frame, new Uint8Array())), photoHash: p.image.sha256, evidenceHash: hashValue(evidence(m)) };
}
function memory() {
  const files = new Map<string, unknown>(), calls: string[] = [], amounts = new Map<string, number | null>();
  let counter = 0, held = 0;
  const journal: EvaluationJournal = { begin: async key => { if (files.has(key)) return false; files.set(key, { state: "starting" }); return true; }, save: async (key, value) => { files.set(key, copy(value)); } };
  const budget: EvaluationBudget = {
    refresh: async () => ({ verified: true }),
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
    expect(hashValue(COMPARISON_MODELS)).toBe("1c61503c7d953b7c6427312dc88b9651a0a0647d2313a30425c81f4b886de5a2");
    expect(COMPARISON_MODELS.find(m => m.model === "xiaomi/mimo-v2.6-flash")).toEqual({ model: "xiaomi/mimo-v2.6-flash", host: "Makora", providerName: "Makora", endpoint: "makora/fp8" });
    expect(COMPARISON_MODELS.some(m => /Cohere|DeepInfra/.test(m.host))).toBe(false);
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

describe("per-model preflight and refreshed prices", () => {
  it.each(["base", "tier"])("includes %s cache-read liability in refreshed admission", scope => {
    const model = COMPARISON_MODELS[0], live = snapshot(model);
    const endpoint = live.data.endpoints.find(e => e.tag === model.endpoint)!;
    if (scope === "base") endpoint.pricing.input_cache_read = "0.000012";
    else endpoint.pricing.overrides = [{ input_cache_read: "0.000012" }];
    const state = assessComparisonEndpoint(model, live, publicEvidence.zdr, evidence(model));
    expect(state.status).toBe("ready");
    if (state.status !== "ready") throw Error("expected verified price refresh");
    expect(state.maximumMicros).toBeGreaterThanOrEqual(Math.ceil((1048576 * 0.000012 + 4096 * 0.000000212) * 1e6));
  });
  it("blocks an explicitly unknown cache-read tariff", () => {
    const model = COMPARISON_MODELS[0], live = snapshot(model);
    live.data.endpoints.find(e => e.tag === model.endpoint)!.pricing.input_cache_read = null;
    expect(assessComparisonEndpoint(model, live, publicEvidence.zdr, evidence(model)).status).toBe("blocked");
  });
  const approved = () => COMPARISON_MODELS.map(model => assessComparisonEndpoint(model, snapshot(model), publicEvidence.zdr));
  it("refreshes price-only drift while binding reservation and projection to the new evidence", () => {
    const model = COMPARISON_MODELS[0], original = evidence(model), live = snapshot(model);
    const endpoint = live.data.endpoints.find(e => e.tag === model.endpoint)!;
    endpoint.pricing.prompt = "0.0000000812"; endpoint.pricing.completion = "0.000000424";
    const state = assessComparisonEndpoint(model, live, publicEvidence.zdr, original);
    expect(state.status).toBe("ready"); if (state.status !== "ready") throw Error("ready required");
    expect(state.maximumMicros).toBe(reserveMaximum(state.evidence)); expect(state.maximumMicros).toBeGreaterThan(reserveMaximum(original));
    const first = new Map([[model.model, result(photo()).attempts[0].usage]]), remaining = new Map([[model.model, 39]]);
    expect(projectMatrix([state.evidence], first, 1000, remaining, 1)).toBeGreaterThan(projectMatrix([original], first, 1000, remaining, 1)!);
    expect(hashValue(state.evidence)).not.toBe(hashValue(original));
  });
  it.each(["status", "image", "schema", "zdr", "retention", "host", "quantization", "suffix", "cap"])("blocks %s drift without an alternate route", kind => {
    const model = COMPARISON_MODELS[0], original = evidence(model), live = snapshot(model), zdr = copy(publicEvidence.zdr);
    const endpoint = live.data.endpoints.find(e => e.tag === model.endpoint)!;
    if (kind === "status") endpoint.status = -2;
    if (kind === "image") live.data.architecture.input_modalities = ["text"];
    if (kind === "schema") endpoint.supported_parameters = ["response_format"];
    if (kind === "zdr") zdr.data = zdr.data.filter(e => e.model_id !== model.model);
    if (kind === "retention") zdr.data.find(e => e.model_id === model.model)!.safety_retention = true;
    if (kind === "host") endpoint.provider_name = "Cohere";
    if (kind === "quantization") endpoint.quantization = "unknown";
    if (kind === "suffix") live.data.endpoints.push({ ...endpoint, tag: `${model.endpoint}/flex` });
    if (kind === "cap") endpoint.pricing.prompt = "1";
    expect(assessComparisonEndpoint(model, live, zdr, original).status).toBe("blocked");
  });
  it("saves live evidence and isolates one unavailable model while accepting another price refresh", async () => {
    const folder = await mkdtemp(resolve(tmpdir(), "marking-preflight-")), models = COMPARISON_MODELS;
    try {
      const calls: string[] = [];
      const states = await refreshEvidence(folder, approved(), async input => {
        const url = String(input); calls.push(url);
        if (url.endsWith("/endpoints/zdr")) return Response.json(publicEvidence.zdr);
        if (url.endsWith("/models")) return Response.json({ data: models.map(m => ({ id: m.model, architecture: { input_modalities: ["image"] } })) });
        const model = models.find(m => url.includes(`${m.model}/endpoints`))!, live = snapshot(model), endpoint = live.data.endpoints.find(e => e.tag === model.endpoint)!;
        if (model === models[0]) endpoint.pricing.prompt = "0.0000000812";
        if (model === models[3]) endpoint.status = -2;
        return Response.json(live);
      });
      expect(calls).toHaveLength(15); expect(calls.every(url => url.startsWith("https://openrouter.ai/api/v1/"))).toBe(true);
      expect(states.filter(s => s.status === "ready")).toHaveLength(12);
      expect(states[3]).toMatchObject({ model: models[3].model, status: "blocked" }); expect(states[0].status).toBe("ready");
      expect(JSON.parse(await readFile(resolve(folder, "preflight.json"), "utf8")).states).toEqual(states);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
  it("sends the refreshed hash, exact serialized evidence and reservation to the configuration RPC", async () => {
    const original = evidence(), current = copy(original); current.endpoint.pricing.prompt = "0.0000000812";
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const budget = rpcEvaluationBudget("https://cdjobwsyzndtltzfpyqa.supabase.co", "synthetic", async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json({ verified: true }); });
    const maximumMicros = reserveMaximum(current);
    expect(await budget.refresh({ approved: original, current, maximumMicros })).toEqual({ verified: true });
    expect(calls[0].url).toMatch(/refresh_scan_marking_evaluation_price$/);
    expect(calls[0].body).toMatchObject({ p_previous_evidence: hashValue(original), p_evidence: hashValue(current), p_maximum: maximumMicros, p_details: JSON.stringify(current) });
  });
  it("retains immutable photo and request identity across a price refresh and rejects mixed resume state", () => {
    const data = manifest(), prior = evidence(), current = copy(prior); current.endpoint.pricing.prompt = "0.0000000812";
    const results = data.photos.map(p => result(p));
    expect(() => assertComparisonResultIdentity(data, results, [prior, current], hashBytes("fixed-run"))).not.toThrow();
    expect(scoreComparison(data, COMPARISON_MODELS[0], results, current, [prior]).passed).toBe(true);
    for (const field of ["photoHash", "requestHash", "evidenceHash"] as const) {
      const bad = copy(results); bad[0][field] = hashBytes("changed");
      expect(() => assertComparisonResultIdentity(data, bad, [prior, current], hashBytes("fixed-run"))).toThrow("identity");
    }
  });
  it("dispatches and reports both explicitly selected evaluation pairs through all 40 photos", async () => {
    const data = manifest(), selected = selectComparisonModels(["openai/gpt-6.1-terra", "google/gemini-3.8-flash"]);
    const bytes = new Uint8Array([1, 2, 3]), mem = memory(), results: ComparisonResult[] = [], bodies: Record<string, unknown>[] = [];
    for (const p of data.photos) p.image.sha256 = hashBytes(bytes);
    const history = selected.map(model => {
      // The fake Terra evidence copies the existing Azure fixture. Live policy checks use public snapshots.
      const original = evidence(COMPARISON_MODELS.find(m => m.model === model.model) ?? COMPARISON_MODELS.find(m => m.endpoint === "azure")!);
      return { ...original, model: model.model, endpoint: { ...original.endpoint, model_id: model.model } };
    });
    const preflight = history.map(e => ({ model: e.model, status: "ready" as const, evidence: e, maximumMicros: 10_000 }));
    const run = hashBytes("two-evaluation-models");
    await runComparisonMatrix({ run, manifest: data, preflight, history, results, records: [], maxRunMicros: 15_000_000, maxAttempts: 1, save: async () => {},
      dispatch: (model, p, proof, maximumMicros, batch, prior) => runComparisonPhoto({ run, photo: p, image: bytes, model, evidence: proof, maximumMicros, maxRunMicros: 15_000_000,
        budget: mem.budget, journal: mem.journal, env: { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" }, maxAttempts: 1, batch, prior,
        fetch: async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return response(p, model); } }),
    });
    expect(results).toHaveLength(80); expect(bodies).toHaveLength(80);
    for (const model of selected) {
      expect(results.filter(r => r.model === model.model).map(r => r.photo)).toEqual(data.photos.map(p => p.id));
      expect(bodies.filter(b => b.model === model.model).every(b => JSON.stringify(b.provider) === JSON.stringify(comparisonProvider(model, history.find(e => e.model === model.model)!)))).toBe(true);
    }
    expect(new Set(bodies.map(b => JSON.stringify([b.messages, b.response_format, b.reasoning]))).size).toBe(1);
    expect(() => assertComparisonResultIdentity(data, results, history, run)).not.toThrow();
    const reports = comparisonReports(data, preflight, results, history, new Map()).filter(r => selected.some(m => m.model === r.model));
    expect(reports.map(r => r.model)).toEqual(selected.map(m => m.model));
    expect(reports.every(r => r.status === "tested" && r.complete && r.passed)).toBe(true);
    const terra = reports.filter(r => r.model === "openai/gpt-6.1-terra");
    expect(cheapestPassing(terra)?.model).toBe("openai/gpt-6.1-terra");
  });
  it("dispatches the full same 40-photo set for available pairs when one model is blocked", async () => {
    const data = manifest(), states = approved(), results: ComparisonResult[] = [], calls: string[] = [];
    // Every pair first reads all formats. Later photos need only one item to test
    // the same 40-photo schedule, without repeating full-format parsing at every identity check.
    for (const p of data.photos.slice(1)) {
      p.frame.questions = p.frame.questions.slice(0, 1);
      p.truth = p.truth.filter(t => t.itemId === p.frame.questions[0].package!.id);
    }
    states[3] = { model: COMPARISON_MODELS[3].model, status: "blocked", reason: "pinned-endpoint-unavailable" };
    const blocks = await runComparisonMatrix({ run: hashBytes("fixed-run"), manifest: data, preflight: states, history: COMPARISON_MODELS.map(m => evidence(m)), results, records: [], maxRunMicros: 15_000_000, maxAttempts: 1, save: async () => {},
      dispatch: async (model, p, e) => { calls.push(`${model.model}:${p.id}`); return { ...result(p, model), evidenceHash: hashValue(e) }; } });
    expect(blocks.has(COMPARISON_MODELS[3].model)).toBe(true); expect(calls).toHaveLength(480);
    for (const model of COMPARISON_MODELS.filter((_, n) => n !== 3)) expect(results.filter(r => r.model === model.model).map(r => r.photo)).toEqual(data.photos.map(p => p.id));
    expect(calls.slice(0, 12).every(c => c.endsWith(data.photos[0].id))).toBe(true);
    expect(results.some(r => r.model === COMPARISON_MODELS[3].model)).toBe(false);
  });
  it("blocks only the over-cap model projection and completes an affordable pair", async () => {
    const data = manifest(), cheap = evidence(COMPARISON_MODELS[0]), expensive = evidence(COMPARISON_MODELS[1]);
    expensive.endpoint.pricing = { prompt: "0.00000001", completion: "0.00001" };
    const states: ComparisonPreflight[] = [cheap, expensive].map(e => ({ model: e.model, status: "ready", evidence: e, maximumMicros: reserveMaximum(e) }));
    const results: ComparisonResult[] = [];
    const blocks = await runComparisonMatrix({ run: hashBytes("fixed-run"), manifest: data, preflight: states, history: [cheap, expensive], results, records: [], maxRunMicros: 100_000, maxAttempts: 1, save: async () => {},
      dispatch: async (model, p, e) => ({ ...result(p, model), evidenceHash: hashValue(e) }) });
    expect(blocks.get(expensive.model)).toBe("model-projection-missing-or-over-cap");
    expect(results.filter(r => r.model === cheap.model)).toHaveLength(40); expect(results.filter(r => r.model === expensive.model)).toHaveLength(1);
  });
  it("an unknown charge stops every paid model, including when its model is now blocked", async () => {
    const data = manifest(), states = approved(), history = COMPARISON_MODELS.map(m => evidence(m));
    let dispatches = 0;
    const options = { run: hashBytes("fixed-run"), manifest: data, preflight: states, history, results: [] as ComparisonResult[], records: [], maxRunMicros: 15_000_000, maxAttempts: 1 as const, save: async () => {},
      dispatch: async (model: ComparisonModel, p: ComparisonPhoto) => { dispatches++; const r = result(p, model); r.attempts[0].usage.costMicros = null; return r; } };
    await expect(runComparisonMatrix(options)).rejects.toThrow("unknown-usage"); expect(dispatches).toBe(1);
    states[0] = { model: COMPARISON_MODELS[0].model, status: "blocked", reason: "unavailable" };
    await expect(runComparisonMatrix(options)).rejects.toThrow("unknown-usage"); expect(dispatches).toBe(1);
    await expect(runComparisonMatrix({ ...options, results: [], records: [{ state: "reserved" }] })).rejects.toThrow("unresolved"); expect(dispatches).toBe(1);
  });
  it("resumes settled photos under their original evidence without repeating a dispatch", async () => {
    const data = manifest(), model = COMPARISON_MODELS[0], prior = evidence(model), current = copy(prior);
    current.endpoint.pricing.prompt = "0.0000000812";
    const results = data.photos.slice(0, 3).map(p => result(p, model));
    const records = results.map(r => ({ state: "settled", attempt: r.attempts[0] })), calls: string[] = [];
    await runComparisonMatrix({ run: hashBytes("fixed-run"), manifest: data, preflight: [{ model: model.model, status: "ready", evidence: current, maximumMicros: reserveMaximum(current) }], history: [prior, current], results, records, maxRunMicros: 15_000_000, maxAttempts: 1, save: async () => {},
      dispatch: async (m, p, e) => { calls.push(p.id); return { ...result(p, m), evidenceHash: hashValue(e) }; } });
    expect(calls).toEqual(data.photos.slice(3).map(p => p.id)); expect(results).toHaveLength(40);
    expect(scoreComparison(data, model, results, current, [prior]).passed).toBe(true);
  });
  it("a price admission refusal blocks one model while a shared ledger refusal stops dispatch", async () => {
    const data = manifest(), states = approved().slice(0, 2), history = states.flatMap(s => s.status === "ready" ? [s.evidence] : []);
    for (const reason of ["price-unverified", "unresolved-evaluation-cost"]) {
      const results: ComparisonResult[] = [], calls: string[] = [];
      const run = runComparisonMatrix({ run: hashBytes("fixed-run"), manifest: data, preflight: states, history, results, records: [], maxRunMicros: 15_000_000, maxAttempts: 1, save: async () => {},
        dispatch: async (model, p) => {
          calls.push(model.model); const r = result(p, model);
          return model === COMPARISON_MODELS[0] ? { ...r, status: "failed", failure: reason, attempts: [], observations: [], schemaValid: false } : r;
        } });
      if (reason === "price-unverified") {
        expect((await run).get(COMPARISON_MODELS[0].model)).toBe(reason);
        expect(calls.filter(m => m === COMPARISON_MODELS[1].model)).toHaveLength(40);
        expect(calls.filter(m => m === COMPARISON_MODELS[0].model)).toHaveLength(1);
      } else { await expect(run).rejects.toThrow("admission-refused"); expect(calls).toHaveLength(1); }
    }
  });
  it("lists undispatched and previously tested blocked models without a pass or invented cost per page", () => {
    const data = manifest(), states = approved(), history = COMPARISON_MODELS.map(m => evidence(m));
    const results = COMPARISON_MODELS.slice(0, 2).flatMap((model, n) => data.photos.map(p => result(p, model, 100 + n)));
    const blocks = new Map([[COMPARISON_MODELS[0].model, "unavailable"], [COMPARISON_MODELS[3].model, "unavailable"]]);
    const reports = comparisonReports(data, states, results, history, blocks);
    expect(reports[0]).toMatchObject({ status: "blocked", passed: false, complete: false, costPerPageUsd: null, testedPhotos: 40, measuredMicros: 4000 });
    expect(reports[3]).toMatchObject({ status: "blocked", passed: false, complete: false, costPerPageUsd: null, testedPhotos: 0, measuredMicros: null });
    expect(reports[3]).not.toHaveProperty("wrongMarks"); expect(reports[3]).not.toHaveProperty("unsure");
    expect(reports[2]).toMatchObject({ status: "incomplete", passed: false, complete: false, costPerPageUsd: null });
    expect(cheapestPassing(reports)?.model).toBe(COMPARISON_MODELS[1].model);
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
  it("accepts all first-book formats with wrong/right/blank/uncertain controls and no parent path", () => {
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

it.each(["http", "schema", "json", "refusal"])("retains fatal settlement state after %s even when cleanup succeeds", async kind => {
  const data = manifest(), mem = memory(), results: ComparisonResult[] = [];
  const history = COMPARISON_MODELS.slice(0, 2).map(m => evidence(m));
  const options = runOptions(data.photos[0], mem);
  let dispatched = 0, fetched = 0, settlements = 0;
  const budget: EvaluationBudget = { ...mem.budget, settle: async (id, cost) => {
    settlements++;
    if (settlements === 1) throw Error("synthetic settlement interruption");
    await mem.budget.settle(id, cost);
  } };
  const dispatch = async (m: ComparisonModel, p: ComparisonPhoto) => {
    dispatched++;
    if (dispatched > 1) return result(p, m);
    return runComparisonPhoto({ ...options, maxAttempts: 2, budget, fetch: async () => {
      fetched++;
      if (kind === "http") return new Response(await response(p).text(), { status: 503 });
      const content = kind === "json" ? "not JSON" : '{"readings":[]}';
      return response(p, m, { choices: [{ finish_reason: "stop", message: kind === "refusal" ? { refusal: "refused" } : { content } }] });
    } });
  };
  const matrix = () => runComparisonMatrix({ run: hashBytes("fixed-run"), manifest: data, preflight: history.map(e => ({ model: e.model, status: "ready", evidence: e, maximumMicros: options.maximumMicros })),
    history, results, records: [...mem.files.values()] as Parameters<typeof assertComparisonResume>[0], maxRunMicros: 15_000_000, maxAttempts: 2, save: async () => {}, dispatch });
  await expect(matrix()).rejects.toThrow("budget");
  expect(dispatched).toBe(1); expect(fetched).toBe(1);
  expect(mem.calls.filter(c => c === "reserve")).toHaveLength(1);
  expect(results[0].failure).toBe("reservation-or-settlement-failed");
  expect(results[0].attempts[0].error).toBe("reservation-or-settlement-failed");
  expect(results[0].attempts[0].usage.costMicros).toBe(1000);
  if (kind === "http") {
    expect(settlements).toBe(2);
    expect([...mem.files.values()]).toEqual([expect.objectContaining({ state: "settled" })]);
  }
  await expect(matrix()).rejects.toThrow("budget");
  expect(dispatched).toBe(1); expect(fetched).toBe(1);
});

it("uses nullable enum branches accepted by the observed provider schema rule", async () => {
  const p = photo(), mem = memory();
  function incompatible(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const node = value as Record<string, unknown>;
    return (Array.isArray(node.type) && Array.isArray(node.enum)) || "maxLength" in node || Object.values(node).some(incompatible);
  }
  const r = await runComparisonPhoto({ ...runOptions(p, mem), fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    if (incompatible(wire.response_format.json_schema.schema)) return Response.json({ error: { code: 400, message: "Enum value 'unreadable' does not match declared type '['string', 'null']'" } }, { status: 400 });
    return response(p);
  } });
  expect(r.status).toBe("complete");
  expect(r.schemaValid).toBe(true);
  const output = labelledOutput(p);
  output.readings[0].text = "1".repeat(200);
  expect(validMarkingOutput(p.frame, output)).toBe(true);
  output.readings[0].text = "1".repeat(201);
  expect(validMarkingOutput(p.frame, output)).toBe(false);
});

it("keeps a fake400 response and OpenRouter metadata before and after settlement", async () => {
  const p = photo(), mem = memory(); let beforeSettlement: unknown;
  const metadata = { provider_name: "Google", raw: "Synthetic provider schema error" };
  const envelope = { error: { code: 400, message: "Synthetic invalid schema", metadata }, openrouter_metadata: metadata };
  const body = JSON.stringify(envelope);
  const budget: EvaluationBudget = { ...mem.budget, settle: async (id, cost) => {
    beforeSettlement = copy([...mem.files.values()][0]);
    await mem.budget.settle(id, cost);
  } };
  const r = await runComparisonPhoto({ ...runOptions(p, mem), budget, fetch: async () => new Response(body, { status: 400 }) });
  expect(r.failure).toBe("http-400");
  expect(beforeSettlement).toMatchObject({ state: "response", status: 400, body, openrouter_metadata: metadata, envelope });
  expect([...mem.files.values()]).toEqual([expect.objectContaining({ state: "unknown", status: 400, body, openrouter_metadata: metadata, envelope })]);
  expect([...mem.amounts.values()]).toEqual([null]);
});

it("keeps each retry's own response after both settlements", async () => {
  const p = photo(), mem = memory(); let fetched = 0;
  const bodies: string[] = [];
  const r = await runComparisonPhoto({ ...runOptions(p, mem), maxAttempts: 2, fetch: async () => {
    fetched++;
    const base = JSON.parse(await response(p).text());
    base.openrouter_metadata = { request: fetched };
    if (fetched === 1) base.error = { message: "Synthetic temporary error" };
    const body = JSON.stringify(base); bodies.push(body);
    return new Response(body, { status: fetched === 1 ? 503 : 200 });
  } });
  expect(r.status).toBe("complete"); expect(fetched).toBe(2);
  expect([...mem.files.values()]).toEqual(bodies.map((body, i) => expect.objectContaining({
    state: "settled", status: i === 0 ? 503 : 200, body, openrouter_metadata: { request: i + 1 },
  })));
});

it("probes the Sonnet reference first without changing the fixed model data", async () => {
  const data = manifest(), history = [evidence(), evidence(COMPARISON_MODELS.at(-1)!)], order: string[] = [];
  await runComparisonMatrix({ run: hashBytes("fixed-run"), manifest: data, preflight: history.map(e => ({ model: e.model, status: "ready", evidence: e, maximumMicros: reserveMaximum(e) })),
    history, results: [], records: [], maxRunMicros: 15_000_000, maxAttempts: 1, save: async () => {},
    dispatch: async (m, p) => { order.push(m.model); return result(p, m); },
  });
  expect(order[0]).toBe("anthropic/claude-sonnet-5.5");
});

it.each(["begin", "reserved", "settled"])("retains a fatal %s journal failure for global resume", async stage => {
  const p = photo(), mem = memory(); let fetched = 0;
  const r = await runComparisonPhoto({ ...runOptions(p, mem), maxAttempts: 2,
    journal: { begin: async key => { if (stage === "begin") throw Error("disk failure"); return mem.journal.begin(key); },
      save: async (key, value) => { if ((value as { state: string }).state === stage) throw Error("disk failure"); await mem.journal.save(key, value); } },
    fetch: async () => { fetched++; return response(p); },
  });
  expect(r.failure).toBe("journal-failure");
  expect(fetched).toBe(stage === "settled" ? 1 : 0);
  expect(mem.calls.filter(c => c === "reserve")).toHaveLength(stage === "begin" ? 0 : 1);
  expect(() => assertComparisonResume([], [r])).toThrow("journal");
});

it.each([1, 2] as const)("stops retries, the matrix and resume after a response journal failure with %s attempts", async maxAttempts => {
  const data = manifest(), mem = memory(), results: ComparisonResult[] = [];
  const model = COMPARISON_MODELS[0], proof = evidence(model);
  const options = runOptions(data.photos[0], mem);
  let writesFailed = false, dispatched = 0, fetched = 0;
  const journal: EvaluationJournal = { ...mem.journal, save: async (key, value) => {
    if (!writesFailed && (value as { state: string }).state === "response") { writesFailed = true; throw Error("synthetic disk failure"); }
    await mem.journal.save(key, value);
  } };
  await expect(runComparisonMatrix({ run: hashBytes("fixed-run"), manifest: data, preflight: [{ model: model.model, status: "ready", evidence: proof, maximumMicros: options.maximumMicros }],
    history: [proof], results, records: [], maxRunMicros: 15_000_000, maxAttempts, save: async () => {},
    dispatch: async (_model, p) => {
      dispatched++;
      if (dispatched > 1) return result(p);
      return runComparisonPhoto({ ...options, maxAttempts, journal, fetch: async () => { fetched++; return response(p); } });
    },
  })).rejects.toThrow("journal");
  expect(dispatched).toBe(1); expect(fetched).toBe(1);
  expect(mem.calls.filter(c => c === "reserve")).toHaveLength(1);
  expect(results[0].failure).toBe("journal-failure");
  expect(results[0].attempts[0].usage.costMicros).toBe(1000);
  expect(() => assertComparisonResume([], results)).toThrow("journal");
});

describe("D267 denominators, projection and selection", () => {
  it("R1-01 rejects one definite mark on an unclear item even below the wrong-mark allowance", async () => {
    const data = manifest(), results = data.photos.map(p => result(p));
    expect(scoreComparison(data, COMPARISON_MODELS[0], results, evidence()).passed).toBe(true);
    const index = data.photos.findIndex(p => !p.clear), p = data.photos[index], output = labelledOutput(p);
    output.readings[0] = labelledOutput(data.photos[0]).readings[0];
    results[index] = await runComparisonPhoto({ ...runOptions(p, memory()), fetch: async () => response(p, COMPARISON_MODELS[0], {
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
    }) });
    const score = scoreComparison(data, COMPARISON_MODELS[0], results, evidence());
    expect(score.wrongMarks).toBe(1);
    expect(score.wrongMarks * 100).toBeLessThan(score.wrongMarkDenominator);
    expect(score.passed).toBe(false);
  });
  it("R1-02 refuses a state array through the strict validator and public runner", async () => {
    const p = photo(), output = labelledOutput(p);
    (output.readings[0] as unknown as { state: unknown }).state = ["written"];
    expect(validMarkingOutput(p.frame, output)).toBe(false);
    const r = await runComparisonPhoto({ ...runOptions(p, memory()), fetch: async () => response(p, COMPARISON_MODELS[0], {
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
    }) });
    expect(r.status).toBe("failed");
    expect(r.schemaValid).toBe(false);
  });
  it("counts every item as AI-marked, with no parent path, and measures clear-photo unsure", () => {
    const m = manifest(), results = m.photos.map(p => result(p)), report = scoreComparison(m, COMPARISON_MODELS[0], results, evidence());
    expect(report.denominator).toBe(360); expect(report.aiMarked).toBe(360); expect(report.parentMethods).toBe(0); expect(report.clearDenominator).toBe(342);
    expect(report.wrongMarkDenominator).toBe(340); expect(report.wrongMarks).toBe(0); expect(report.wrongAsRight).toBe(0); expect(report.unsure).toBe(20); expect(report.clearUnsure).toBe(2); expect(report.passed).toBe(true);
    const missing = scoreComparison(m, COMPARISON_MODELS[0], results.slice(1), evidence());
    expect(missing.denominator).toBe(360); expect(missing.complete).toBe(false); expect(missing.passed).toBe(false); expect(missing.missingRuns).toBe(1);
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
    expect(report.wrongMarks).toBe(4); expect(report.wrongMarkDenominator).toBe(340); expect(report.passed).toBe(false);
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
  it("selects only fully tested passing available pairs and excludes incomplete models", () => {
    const m = manifest(), reports = COMPARISON_MODELS.map((model, n) => scoreComparison(m, model, m.photos.map(p => result(p, model, 100 + n)), evidence(model)));
    expect(cheapestPassing(reports)?.model).toBe(COMPARISON_MODELS[0].model);
    expect(cheapestPassing(reports.slice(1))?.model).toBe(COMPARISON_MODELS[1].model);
    reports[0].complete = false;
    expect(cheapestPassing(reports)?.model).toBe(COMPARISON_MODELS[1].model);
    reports[1].passed = false;
    expect(cheapestPassing(reports)?.model).toBe(COMPARISON_MODELS[2].model);
  });
});


it.each(["legacy", "other-run"])("rejects a persisted %s result before any matrix side effect", async kind => {
  const data = manifest(), model = COMPARISON_MODELS[0], proof = evidence(model), saved = result(data.photos[0], model);
  if (kind === "legacy") Reflect.deleteProperty(saved, "run");
  else saved.run = hashBytes("other immutable plan");
  const run = hashBytes("fixed-run");
  expect(() => assertComparisonResultIdentity(data,[saved],[proof],run)).toThrow("resume-result-identity-mismatch");
  let savedReports = 0, dispatches = 0;
  await expect(runComparisonMatrix({ run, manifest:data, preflight:[{model:model.model,status:"ready",evidence:proof,maximumMicros:reserveMaximum(proof)}], history:[proof], results:[saved], records:[], maxRunMicros:15_000_000,maxAttempts:1,
    save:async()=>{savedReports++;}, dispatch:async(m,p)=>{dispatches++;return result(p,m);},
  })).rejects.toThrow("resume-result-identity-mismatch");
  expect(savedReports).toBe(0); expect(dispatches).toBe(0);
});

it("persists the current run on a new public photo result", async () => {
  const p=photo(), mem=memory(), options=runOptions(p,mem);
  const r=await runComparisonPhoto({...options,fetch:async()=>response(p)});
  expect(r.run).toBe(options.run); expect(r.status).toBe("complete");
});

const rateEnvelope = () => ({ error: { code: 429, message: "Rate limit exceeded", metadata: { provider_name: "fixture host", raw: '{"error":{"message":"rate limit"}}' } } });
const rateResponse = () => Response.json(rateEnvelope(), { status: 429 });
function rateHarness(modelCount = 2) {
  const data = manifest(), files = new Map<string, AttemptRecord>(), rows = new Map<string, { maximum: number; cost: number | null; deferred: boolean }>();
  const images = new Uint8Array([1, 2, 3]), results: ComparisonResult[] = [], modelSet = COMPARISON_MODELS.slice(0, modelCount);
  for (const p of data.photos) p.image.sha256 = hashBytes(images);
  const history = modelSet.map(m => evidence(m)), states = history.map(e => ({ model: e.model, status: "ready" as const, evidence: e, maximumMicros: reserveMaximum(e) }));
  let time = 1_000_000, serial = 0, active = 0, peak = 0;
  const requests: { model: string; photo: string; batch: number; at: number }[] = [], saves: unknown[] = [];
  const liability = () => [...rows.values()].reduce((sum, row) => sum + (row.cost ?? row.maximum), 0);
  const budget: EvaluationBudget = {
    refresh: async () => ({ verified: true }),
    reserve: async input => {
      if ([...rows.values()].some(r => r.cost === null && !r.deferred)) return { refused: "unresolved-evaluation-cost" };
      if (liability() + input.maximumMicros > input.maxRunMicros) return { refused: "run-budget" };
      const id = `fixture-${++serial}`; rows.set(id, { maximum: input.maximumMicros, cost: null, deferred: false }); return { id };
    },
    settle: async (id, cost) => { rows.get(id)!.cost = cost; },
    defer: async ({ attempt }) => { if (!deferredAttempt(attempt)) throw Error("not clean"); rows.get(attempt.id)!.deferred = true; },
  };
  const journal: EvaluationJournal = { begin: async key => { if (files.has(key)) return false; files.set(key, { state: "starting" }); return true; }, save: async (key, value) => { files.set(key, copy(value as AttemptRecord)); } };
  const dispatch = (respond: (m: ComparisonModel, p: ComparisonPhoto, batch: number) => Response) => async (m: ComparisonModel, p: ComparisonPhoto, e: ReturnType<typeof evidence>, maximum: number, batch: 0 | 1 = 0, prior?: ComparisonResult) => {
    const r = await runComparisonPhoto({ run: hashBytes("fixed-run"), photo: p, image: images, model: m, evidence: e, maximumMicros: maximum, maxRunMicros: 15_000_000, budget, journal,
      env: { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" }, maxAttempts: 2, now: () => time, batch, prior,
      fetch: async () => { active++; peak = Math.max(peak, active); requests.push({ model: m.model, photo: p.id, batch, at: time }); try { return respond(m, p, batch); } finally { active--; } },
    });
    return r;
  };
  const options = { run: hashBytes("fixed-run"), manifest: data, preflight: states, history, results, records: [] as AttemptRecord[], maxRunMicros: 15_000_000, maxAttempts: 2 as const,
    now: () => time, wait: async (ms: number) => { expect(ms).toBeGreaterThan(0); expect(ms).toBeLessThanOrEqual(30_000); time += ms; }, save: async (_blocks: ReadonlyMap<string, string>, projection: unknown) => { saves.push(copy(projection)); } };
  return { data, files, rows, results, history, states, budget, journal, requests, saves, liability, options, dispatch, get peak() { return peak; }, setTime: (v: number) => { time = v; } };
}

describe("durable clean HTTP 429 deferral", () => {
  it.each(["usage", "id", "nested-usage", "raw-generation", "code", "status", "body", "metadata", "content"])("refuses %s as a clean hold", async kind => {
    const envelope: Record<string, unknown> = rateEnvelope();
    const captured: CapturedResponse = { status: 429, body: "", envelope, openrouter_metadata: rateEnvelope().error.metadata };
    if (kind === "usage") envelope.usage = {};
    if (kind === "id") envelope.id = null;
    if (kind === "nested-usage") (envelope.error as Record<string, unknown>).usage = null;
    if (kind === "raw-generation") (envelope.error as ReturnType<typeof rateEnvelope>["error"]).metadata.raw = '{"id":"gen-secret"}';
    if (kind === "code") (envelope.error as Record<string, unknown>).code = 503;
    if (kind === "status") captured.status = 503;
    if (kind === "content") { delete envelope.error; envelope.choices = [{ message: { content: JSON.stringify(rateEnvelope()) } }]; }
    captured.body = kind === "body" ? "unreadable" : JSON.stringify(envelope);
    if (kind === "metadata") captured.openrouter_metadata = { different: true };
    expect(clean429(captured)).toBe(false);
  });
  it("defers only its model, counts the hold, waits exactly 15 minutes, and keeps both raw attempts", async () => {
    const h = rateHarness();
    await runComparisonMatrix({ ...h.options, dispatch: h.dispatch((m, p, batch) => m.model === COMPARISON_MODELS[0].model && batch === 0 ? rateResponse() : response(p, m)) });
    const first = h.requests.filter(r => r.model === COMPARISON_MODELS[0].model), other = h.requests.filter(r => r.model === COMPARISON_MODELS[1].model);
    expect(first).toHaveLength(41); expect(other).toHaveLength(40); expect(first.filter(r => r.batch === 0)).toHaveLength(1);
    expect(other.every(r => r.at < first[1].at)).toBe(true); expect(first[1].at - first[0].at).toBe(900_000); expect(h.peak).toBe(1);
    const retried = h.results.find(r => r.model === first[0].model && r.photo === first[0].photo)!;
    expect(retried.status).toBe("complete"); expect(retried.attempts).toHaveLength(2);
    expect(new Set(retried.attempts.map(a => a.id)).size).toBe(2);
    expect(retried.attempts[0].usage).toEqual(transportUsage(null)); expect(retried.attempts[0].response?.envelope).toEqual(rateEnvelope());
    expect(retried.attempts[0].response?.openrouter_metadata).toEqual(rateEnvelope().error.metadata);
    const score = scoreComparison(h.data, COMPARISON_MODELS[0], h.results, h.history[0]);
    expect(score).toMatchObject({ complete: true, schemaFailures: 0, failures: 0, measuredMicros: 40_000, heldMicros: h.states[0].maximumMicros, costPerPageUsd: null });
    expect(cheapestPassing([score])).toBeNull(); expect(h.liability()).toBe(80_000 + score.heldMicros);
    expect(() => assertComparisonResume([...h.files.values()], h.results)).not.toThrow();
    const projections = h.saves.filter((p): p is { spentOrHeldMicros: number } => !!p && typeof p === "object" && "spentOrHeldMicros" in p);
    expect(projections.every(p => p.spentOrHeldMicros >= score.heldMicros)).toBe(true);
  });
  it("stops the model on its second 429 and cold resume cannot create a third batch", async () => {
    const h = rateHarness();
    const dispatch = h.dispatch((m, p) => m.model === COMPARISON_MODELS[0].model ? rateResponse() : response(p, m));
    const blocks = await runComparisonMatrix({ ...h.options, dispatch });
    expect(blocks.get(COMPARISON_MODELS[0].model)).toBe("second-429-not-fully-tested");
    expect(h.requests.filter(r => r.model === COMPARISON_MODELS[0].model)).toHaveLength(2);
    const reports = comparisonReports(h.data, h.states, h.results, h.history, blocks);
    expect(reports[0]).toMatchObject({ testedPhotos: 0, complete: false, heldMicros: h.states[0].maximumMicros * 2, measuredMicros: 0, costPerPageUsd: null });
    const score = scoreComparison(h.data, COMPARISON_MODELS[0], h.results, h.history[0]);
    expect(score).toMatchObject({ schemaFailures: 0, schemaUnvalidated: 0, failures: 0, unsure: 0, missingRuns: 40 });
    const before = h.requests.length;
    await runComparisonMatrix({ ...h.options, results: recoverComparisonResults([...h.files.values()], [], h.data, h.history, h.options.run), records: [...h.files.values()], dispatch });
    expect(h.requests).toHaveLength(before);
  });
  it("keeps schema-invalid known-usage photos as results and never retries them", async () => {
    const h = rateHarness(1);
    await runComparisonMatrix({ ...h.options, dispatch: h.dispatch((m, p, batch) => p.id === h.data.photos[0].id ? response(p, m, { choices: [{ finish_reason: 'stop', message: { content: '{"readings":[]}' } }] }) : batch === 0 ? rateResponse() : response(p, m)) });
    expect(h.requests.filter(r => r.photo === h.data.photos[0].id)).toHaveLength(1);
    expect(h.requests.filter(r => r.batch === 0)).toHaveLength(2);
    expect(scoreComparison(h.data, COMPARISON_MODELS[0], h.results, h.history[0])).toMatchObject({ complete: true, schemaFailures: 1, passed: false, failures: 1 });
  });
  it("queues multiple deferred models with separate timers and retained holds", async () => {
    const h = rateHarness(3);
    await runComparisonMatrix({ ...h.options, dispatch: h.dispatch((m, p, batch) => batch === 0 ? rateResponse() : response(p, m)) });
    expect(h.requests.filter(r => r.batch === 0)).toHaveLength(3); expect(h.requests.filter(r => r.batch === 1)).toHaveLength(120);
    expect(h.liability()).toBe(h.states.reduce((sum, s) => sum + s.maximumMicros, 120_000)); expect(h.peak).toBe(1);
    const reports = comparisonReports(h.data, h.states, h.results, h.history, new Map());
    expect(reports.slice(0, 3).every(r => r.testedPhotos === 40 && r.costPerPageUsd === null && r.heldMicros > 0)).toBe(true);
  });
  it("binds the aggregate cap to multiple holds rather than treating them as zero", async () => {
    const h = rateHarness(2), cap = h.states[0].maximumMicros + h.states[1].maximumMicros;
    const blocks = await runComparisonMatrix({ ...h.options, maxRunMicros: cap, dispatch: h.dispatch(() => rateResponse()) });
    expect(h.requests).toHaveLength(2); expect(h.liability()).toBe(cap);
    expect([...blocks.values()]).toEqual(["next-reservation-over-run-cap", "next-reservation-over-run-cap"]);
  });
  it("cold resume retains the first timer at its exact boundary and recovers a missing result file", async () => {
    const h = rateHarness(1), dispatch = h.dispatch((m, p, batch) => batch === 0 ? rateResponse() : response(p, m));
    const initial = await dispatch(COMPARISON_MODELS[0], h.data.photos[0], h.history[0], h.states[0].maximumMicros, 0);
    const retryAt = initial.attempts[0].deferral!.retryAt;
    h.setTime(retryAt - 1);
    await expect(dispatch(COMPARISON_MODELS[0], h.data.photos[0], h.history[0], h.states[0].maximumMicros, 1, initial)).rejects.toThrow("too-early");
    expect(h.requests).toHaveLength(1);
    const recovered = recoverComparisonResults([...h.files.values()], [], h.data, h.history, h.options.run);
    await runComparisonMatrix({ ...h.options, results: recovered, records: [...h.files.values()], dispatch });
    expect(h.requests[1].at).toBe(retryAt); expect(h.requests).toHaveLength(41);
    expect(h.requests.filter(r => r.batch === 0)).toHaveLength(1);
  });
  it.each(["starting", "reserved", "response", "deferred", "terminal", "result", "waiting"])("a cold resume after %s never duplicates a request or omits a hold", async boundary => {
    const h = rateHarness(1), snapshots: { files: AttemptRecord[]; result?: ComparisonResult }[] = [];
    const journal: EvaluationJournal = { begin: async key => { const yes = await h.journal.begin(key); if (boundary === "starting") snapshots.push({ files: copy([...h.files.values()]) }); return yes; }, save: async (key, value) => {
      await h.journal.save(key, value);
      const v = value as AttemptRecord;
      if (v.state === boundary && !v.result || boundary === "terminal" && v.result) snapshots.push({ files: copy([...h.files.values()]) });
    } };
    const last = await runComparisonPhoto({ run: h.options.run, photo: h.data.photos[0], image: new Uint8Array([1, 2, 3]), model: COMPARISON_MODELS[0], evidence: h.history[0], maximumMicros: h.states[0].maximumMicros, maxRunMicros: 15_000_000, budget: h.budget, journal, env: { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" }, now: h.options.now, fetch: async () => rateResponse() });
    if (["result", "waiting"].includes(boundary)) snapshots.push({ files: copy([...h.files.values()]), result: copy(last) });
    expect(snapshots.length).toBeGreaterThan(0);
    const snapshot = snapshots.at(-1)!;
    if (["starting", "reserved", "response", "deferred"].includes(boundary)) {
      expect(() => recoverComparisonResults(snapshot.files, [], h.data, h.history, h.options.run)).toThrow();
    } else {
      const recovered = recoverComparisonResults(snapshot.files, snapshot.result ? [snapshot.result] : [], h.data, h.history, h.options.run);
      expect(recovered[0].attempts[0].deferral!.retryAt).toBe(1_900_000);
      expect(recovered[0].attempts[0].deferral!.reservedMicros).toBe(h.liability());
    }
    expect([...h.rows.values()]).toHaveLength(1); expect(last.attempts[0].usage.costMicros).toBeNull();
  });
  it.each(["settle", "defer", "response", "deferred"])("keeps a %s failure fatal even after later cleanup succeeds", async stage => {
    const h = rateHarness(1); let failed = false, fetched = 0;
    const failOnce = () => { if (!failed) { failed = true; throw Error("fixture fault"); } };
    const budget = { ...h.budget, settle: async (id: string, cost: number | null) => { if (stage === "settle") failOnce(); await h.budget.settle(id, cost); }, defer: async (input: Parameters<NonNullable<EvaluationBudget["defer"]>>[0]) => { if (stage === "defer") failOnce(); await h.budget.defer!(input); } };
    const r = await runComparisonPhoto({ run: h.options.run, photo: h.data.photos[0], image: new Uint8Array([1, 2, 3]), model: COMPARISON_MODELS[0], evidence: h.history[0], maximumMicros: h.states[0].maximumMicros, maxRunMicros: 15_000_000, budget,
      journal: { ...h.journal, save: async (key, value) => { if ((value as AttemptRecord).state === stage) failOnce(); await h.journal.save(key, value); } },
      env: { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" }, maxAttempts: 2, now: h.options.now, fetch: async () => { fetched++; return rateResponse(); } });
    expect(fetched).toBe(1); expect(r.status).toBe("failed"); expect(() => assertComparisonResume([...h.files.values()], [r])).toThrow();
    expect(h.liability()).toBe(h.states[0].maximumMicros);
    expect(r.attempts[0].response?.status).toBe(429); expect(r.attempts[0].response?.body).toBe(JSON.stringify(rateEnvelope()));
  });
  it("rejects copied raw holds, orphan journals, bare labels and cross-run records", async () => {
    const h = rateHarness(1), dispatch = h.dispatch(() => rateResponse());
    const r = await dispatch(COMPARISON_MODELS[0], h.data.photos[0], h.history[0], h.states[0].maximumMicros, 0);
    const bad = copy(r); bad.run = hashBytes("prior run");
    expect(() => assertComparisonResultIdentity(h.data, [bad], h.history, h.options.run)).toThrow("identity");
    const forged = copy(r); forged.attempts[0].response!.body = '{"error":{"code":500,"message":"failure"}}';
    expect(() => assertComparisonResume([], [forged])).toThrow("unknown-usage");
    const records = copy([...h.files.values()]); records[0].run = hashBytes("other run");
    expect(() => recoverComparisonResults(records, [r], h.data, h.history, h.options.run)).toThrow("identity");
    expect(() => assertComparisonResume([...h.files.values()].map(v => ({ ...v, result: undefined })), [])).toThrow();
    const label = copy(r); delete label.attempts[0].deferral; label.failure = "clean429";
    expect(() => assertComparisonResume([], [label])).toThrow("unknown-usage");
  });
  it("changes the plan identity without changing the 13 pins or prompt/schema settings", () => {
    const prior = { manifestHash: hashValue(manifest()), models: COMPARISON_MODELS, settings: COMPARISON_SETTINGS, maxAttempts: 1, approved: COMPARISON_MODELS.map(model => assessComparisonEndpoint(model, snapshot(model), publicEvidence.zdr)) };
    expect(hashValue({ ...prior, deferralPolicy: COMPARISON_DEFERRAL_POLICY })).not.toBe(hashValue(prior));
    expect(COMPARISON_DEFERRAL_POLICY).toEqual({ version: "clean429-v1", delayMs: 900_000, finalBatches: 1, globalConcurrency: 1, modelConcurrency: 1 });
    expect(COMPARISON_SETTINGS.promptVersion).toBe("whole-page-scalar-readings-v8");
    expect(hashValue(COMPARISON_MODELS)).toBe("1c61503c7d953b7c6427312dc88b9651a0a0647d2313a30425c81f4b886de5a2");
  });
});

it("keeps distinct deferred model deadlines across a cold resume", async () => {
  const h = rateHarness(2), dispatch = h.dispatch((m, p, batch) => batch === 0 ? rateResponse() : response(p, m));
  for (let n = 0; n < 2; n++) {
    h.setTime(1_000_000 + n * 10_000);
    h.results.push(await dispatch(COMPARISON_MODELS[n], h.data.photos[0], h.history[n], h.states[n].maximumMicros, 0));
  }
  h.setTime(1_900_000);
  const results = recoverComparisonResults([...h.files.values()], [], h.data, h.history, h.options.run);
  await runComparisonMatrix({ ...h.options, results, records: [...h.files.values()], dispatch });
  expect(h.requests.find(r => r.batch === 1 && r.model === COMPARISON_MODELS[0].model)?.at).toBe(1_900_000);
  expect(h.requests.find(r => r.batch === 1 && r.model === COMPARISON_MODELS[1].model)?.at).toBe(1_910_000);
  expect(h.requests.filter(r => r.batch === 0)).toHaveLength(2);
});

it("passes exact raw evidence to the deferral RPC and treats a refusal as fatal", async () => {
  const h = rateHarness(1);
  const r = await h.dispatch(() => rateResponse())(COMPARISON_MODELS[0], h.data.photos[0], h.history[0], h.states[0].maximumMicros, 0);
  const attempt = r.attempts[0], calls: { url: string; body: unknown }[] = [];
  const budget = rpcEvaluationBudget("https://cdjobwsyzndtltzfpyqa.supabase.co", "synthetic-service", async (url, init) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json(calls.length === 1); });
  const input = { run: r.run, key: attempt.deferral!.key, attempt };
  await budget.defer!(input);
  expect(calls[0]).toEqual({ url: "https://cdjobwsyzndtltzfpyqa.supabase.co/rest/v1/rpc/defer_scan_marking_evaluation", body: { p_run: r.run, p_attempt: input.key, p_id: attempt.id, p_response: attempt.response, p_received_at: attempt.deferral!.receivedAt } });
  await expect(budget.defer!(input)).rejects.toThrow("ledger-deferral-refused");
  await expect(budget.defer!({ ...input, key: hashBytes("copied key") })).rejects.toThrow("invalid-deferral-evidence");
  expect(calls).toHaveLength(2);
});

it("keeps a known-cost failed request before a clean 429 and defers only the missing answer", async () => {
  const h = rateHarness(1); let count = 0;
  const initial = await runComparisonPhoto({ run: h.options.run, photo: h.data.photos[0], image: new Uint8Array([1, 2, 3]), model: COMPARISON_MODELS[0], evidence: h.history[0], maximumMicros: h.states[0].maximumMicros, maxRunMicros: 15_000_000, budget: h.budget, journal: h.journal, env: { SCAN_MARKING_OPENROUTER_API_KEY: "synthetic" }, now: h.options.now, maxAttempts: 2,
    fetch: async () => { count++; return count === 1 ? Response.json({ id: "gen-failed", provider: COMPARISON_MODELS[0].providerName, model: COMPARISON_MODELS[0].model, usage: { cost: 0.002, prompt_tokens: 4000, completion_tokens: 1, completion_tokens_details: { reasoning_tokens: 0 } }, error: { code: 503, message: "Temporary" } }, { status: 503 }) : rateResponse(); } });
  expect(initial.status).toBe("deferred"); expect(initial.attempts).toHaveLength(2); expect(count).toBe(2);
  expect(scoreComparison(h.data, COMPARISON_MODELS[0], [initial], h.history[0])).toMatchObject({ failures: 0, schemaFailures: 0, measuredMicros: 2000, heldMicros: h.states[0].maximumMicros });
  h.setTime(initial.attempts[1].deferral!.retryAt);
  const final = await h.dispatch((m, p) => response(p, m))(COMPARISON_MODELS[0], h.data.photos[0], h.history[0], h.states[0].maximumMicros, 1, initial);
  expect(final.status).toBe("complete"); expect(final.attempts.map(a => a.usage.costMicros)).toEqual([2000, null, 1000]);
  expect(() => assertComparisonResume([...h.files.values()], [final])).not.toThrow();
});

it("reports an unclassified unknown reservation separately from measured cost", async () => {
  const h = rateHarness(1);
  const r = await h.dispatch(() => new Response("unreadable", { status: 503 }))(COMPARISON_MODELS[0], h.data.photos[0], h.history[0], h.states[0].maximumMicros, 0);
  expect(r.status).toBe("failed");
  expect(scoreComparison(h.data, COMPARISON_MODELS[0], [r], h.history[0])).toMatchObject({ measuredMicros: 0, heldMicros: h.states[0].maximumMicros, spentOrHeldMicros: h.states[0].maximumMicros, costPerPageUsd: null });
  expect(() => assertComparisonResume([...h.files.values()], [r])).toThrow("unknown-usage");
});

it.each(["successful-result", "second-429"])("recovers an interrupted final batch after %s without repeating it", async kind => {
  const h = rateHarness(1);
  const base = h.dispatch((m, p, batch) => batch === 0 || kind === "second-429" ? rateResponse() : response(p, m));
  let interrupted = false;
  await expect(runComparisonMatrix({ ...h.options, dispatch: async (...args) => {
    const r = await base(...args);
    if (args[4] === 1 && !interrupted && (kind === "second-429" || args[1].id === h.data.photos[3].id)) { interrupted = true; throw Error("process interrupted before result write"); }
    return r;
  } })).rejects.toThrow("process interrupted");
  const recovered = recoverComparisonResults([...h.files.values()], h.results, h.data, h.history, h.options.run);
  const blocks = await runComparisonMatrix({ ...h.options, results: recovered, records: [...h.files.values()], dispatch: base });
  expect(h.requests.filter(r => r.batch === 0)).toHaveLength(1);
  if (kind === "second-429") {
    expect(h.requests).toHaveLength(2); expect(blocks.get(COMPARISON_MODELS[0].model)).toBe("second-429-not-fully-tested");
  } else {
    expect(h.requests).toHaveLength(41);
    expect(new Set(h.requests.filter(r => r.batch === 1).map(r => r.photo)).size).toBe(40);
    expect(scoreComparison(h.data, COMPARISON_MODELS[0], recovered, h.history[0])).toMatchObject({ complete: true, measuredMicros: 40000, heldMicros: h.states[0].maximumMicros });
  }
});


it("retains every measured metric after a saved model block is reloaded", () => {
  const data=manifest(),model=COMPARISON_MODELS[0],proof=evidence(model);
  const failed=result(data.photos[0],model);failed.status="failed";failed.failure="schema-invalid";failed.schemaValid=false;failed.observations=[];
  const blocks=new Map([[model.model,"second-429-not-fully-tested"]]);
  const before=comparisonReports(data,[{model:model.model,status:"ready",evidence:proof,maximumMicros:reserveMaximum(proof)}],[failed],[proof],blocks)[0];
  const reloaded=JSON.parse(JSON.stringify([{model:model.model,status:"blocked",reason:"second-429-not-fully-tested"}])) as ComparisonPreflight[];
  const after=comparisonReports(data,reloaded,[failed],[proof],blocks)[0];
  expect(before).toMatchObject({schemaFailures:1,failures:1,testedPhotos:1,measuredMicros:1000,status:"blocked",passed:false,complete:false,costPerPageUsd:null});
  expect(after).toEqual(before);
});
