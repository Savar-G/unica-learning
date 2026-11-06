// No keychain access, rendering, generator or implicit inference. --estimate is offline.
import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import type { WorkbookInput } from "../src/lib/workbook-content";
import { COMPARISON_MODELS, COMPARISON_SETTINGS, SYNTHETIC_IDS, assertComparisonResume, cheapestPassing, hashBytes, hashValue, preflightEndpoint, projectMatrix, reserveMaximum, scoreComparison, syntheticPrintRevision, validateComparisonManifest, type AttemptRecord, type ComparisonManifest, type ComparisonPhoto, type ComparisonResult, type Endpoint, type EndpointEvidence, type EndpointSnapshot } from "../src/lib/scan-marking-comparison";
import { runComparisonPhoto, type EvaluationBudget, type EvaluationJournal } from "../src/lib/scan-marking-comparison-run";

const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;
const inside = (root: string, path: string) => {
  const result = resolve(root, path);
  if (isAbsolute(path) || !result.startsWith(resolve(root) + sep)) throw new Error("asset-path-must-stay-in-manifest-folder");
  return result;
};
export async function durableJson(path: string, value: unknown, exclusive = false) {
  const temporary = exclusive ? path : `${path}.${process.pid}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + "\n"); await file.sync(); } finally { await file.close(); }
  if (!exclusive) await rename(temporary, path);
  const directory = await open(dirname(path), "r");
  try { await directory.sync(); } finally { await directory.close(); }
}
export function fileJournal(folder: string): EvaluationJournal {
  return {
    begin: async key => {
      try { await durableJson(resolve(folder, `${key}.json`), { state: "starting" }, true); return true; }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return false; throw e; }
    },
    save: (key, value) => durableJson(resolve(folder, `${key}.json`), value),
  };
}
export async function loadComparisonAssets(manifestPath: string) {
  const manifest = await json<ComparisonManifest>(manifestPath);
  validateComparisonManifest(manifest);
  const images = new Map<string, Uint8Array>(), root = dirname(resolve(manifestPath));
  for (const photo of manifest.photos) {
    const bytes = await readFile(inside(root, photo.image.path));
    if (hashBytes(bytes) !== photo.image.sha256) throw new Error("photo-hash-mismatch");
    const meta = await sharp(bytes).metadata();
    if (meta.format !== "jpeg" || meta.width !== photo.image.width || meta.height !== photo.image.height || meta.exif || meta.iptc || meta.xmp || meta.icc || (meta.orientation && meta.orientation !== 1)) throw new Error("photo-not-normalized-metadata-free-jpeg");
    images.set(photo.id, bytes);
  }
  for (const [file, expected] of [["synthetic-draft.json", manifest.source.draftSha256], ["rendered-workbook.json", manifest.source.renderSha256], ["fixture-manifest.json", manifest.source.fixtureSha256]]) {
    if (hashBytes(await readFile(resolve(root, file))) !== expected) throw new Error("synthetic-source-hash-mismatch");
  }
  const fixture = await json<{ synthetic: boolean; childName: string; childId: string; workbookId: string; apiCalls: number; stored: boolean }>(resolve(root, "fixture-manifest.json"));
  const draft = await json<{ model: string; childId: string; id: string; profileBuild: unknown; pages: { content?: { kind?: string; child?: string } }[] }>(resolve(root, "synthetic-draft.json"));
  if (fixture.synthetic !== true || fixture.childName !== "Robin" || fixture.apiCalls !== 0 || fixture.stored !== false || draft.model !== "fake" || draft.profileBuild !== null || draft.id !== fixture.workbookId || draft.childId !== fixture.childId || !draft.pages.some(p => p?.content?.kind === "cover" && p.content.child === "Robin") || manifest.photos.some(p => p.frame.childId !== draft.childId || p.frame.workbookId !== draft.id)) throw new Error("source-is-not-the-approved-synthetic-booklet");
  const rendered = await json<WorkbookInput>(resolve(root, "rendered-workbook.json")), revision = syntheticPrintRevision(rendered);
  if (!revision || rendered.id !== draft.id || rendered.childId !== draft.childId || rendered.profileBuild !== null) throw new Error("synthetic-render-contract-required");
  for (const p of manifest.photos) {
    const page = rendered.pages.find(page => page.number === p.frame.pageNumber);
    const questions = page?.questions.map(q => ({ number: q.number, package: q.package, regions: q.regions ?? null, teaching: q.teaching ?? null }));
    if (!page?.printContract || p.frame.printedRevision !== revision || hashValue(p.frame.questions) !== hashValue(questions) || page.image?.width !== p.image.width || page.image.height !== p.image.height) throw new Error("frame-does-not-match-frozen-synthetic-render");
  }
  return { manifest, images };
}
/** Seal already prepared whole-page synthetic images and labelled frames. This does not render or invent truth. */
export async function prepareComparisonManifest(specPath: string, output: string) {
  const spec = await json<ComparisonManifest & { photos: (ComparisonPhoto & { pageNumber?: number })[] }>(specPath), sourceRoot = dirname(resolve(specPath));
  const rendered = await json<WorkbookInput>(resolve(sourceRoot, "rendered-workbook.json")), revision = syntheticPrintRevision(rendered);
  if (!revision || rendered.id !== SYNTHETIC_IDS.workbook || rendered.childId !== SYNTHETIC_IDS.child) throw new Error("approved-synthetic-render-required");
  // A proposal must already contain explicit attestations and every truth row.
  for (const photo of spec.photos) {
    const pageNumber = photo.pageNumber ?? photo.frame?.pageNumber, page = rendered.pages.find(p => p.number === pageNumber);
    if (!page?.printContract) throw new Error("measured-rendered-page-required");
    photo.frame = { parentId: SYNTHETIC_IDS.parent, childId: SYNTHETIC_IDS.child, workbookId: rendered.id, pageId: `synthetic-page-${page.number}`, pageNumber: page.number, photo: photo.id, printedRevision: revision, ready: true,
      questions: page.questions.map(q => ({ number: q.number, package: q.package, regions: q.regions ?? null, teaching: q.teaching ?? null })) };
    const bytes = await readFile(inside(sourceRoot, photo.image.path));
    const meta = await sharp(bytes).metadata();
    photo.image = { ...photo.image, sha256: hashBytes(bytes), width: meta.width ?? 0, height: meta.height ?? 0 };
  }
  for (const [file, field] of [["synthetic-draft.json", "draftSha256"], ["rendered-workbook.json", "renderSha256"], ["fixture-manifest.json", "fixtureSha256"]] as const) spec.source[field] = hashBytes(await readFile(resolve(sourceRoot, file)));
  validateComparisonManifest(spec);
  if (dirname(resolve(output)) !== sourceRoot) throw new Error("prepared-manifest-must-stay-with-source-assets");
  await durableJson(resolve(output), spec, true);
  await loadComparisonAssets(output);
}

/** Explicit service RPC boundary. No generated-type cast and no second inference client. */
export function rpcEvaluationBudget(url: string, serviceKey: string, base: typeof fetch = fetch): EvaluationBudget {
  if (url !== "https://cdjobwsyzndtltzfpyqa.supabase.co") throw new Error("unexpected-ledger-project");
  const rpc = async (name: string, args: unknown): Promise<unknown> => {
    const response = await base(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("ledger-rpc-failed");
    return response.json();
  };
  return {
    reserve: async input => {
      const result = await rpc("reserve_scan_marking_evaluation", { p_run: input.run, p_attempt: input.attempt, p_model: input.model, p_endpoint: input.endpoint, p_evidence: input.evidence, p_pixels: input.pixels, p_maximum: input.maximumMicros, p_run_maximum: input.maxRunMicros });
      if (result && typeof result === "object") {
        if ("id" in result && typeof result.id === "string" && /^[0-9a-f-]{36}$/.test(result.id)) return { id: result.id };
        if ("refused" in result && typeof result.refused === "string") return { refused: result.refused };
      }
      throw new Error("ledger-admission-shape");
    },
    settle: async (id, cost) => { if (await rpc("settle_scan_marking_evaluation", { p_id: id, p_cost: cost }) !== true) throw new Error("ledger-settlement-refused"); },
  };
}

async function snapshots(folder: string): Promise<EndpointEvidence[]> {
  const zdr = await json<{ data: Endpoint[] }>(resolve(folder, "zdr-endpoints-20261106.json"));
  return Promise.all(COMPARISON_MODELS.map(async model => preflightEndpoint(model, await json<EndpointSnapshot>(resolve(folder, `${model.model.replaceAll("/", "--")}-endpoints.json`)), zdr)));
}
const policyFields = (e: EndpointEvidence) => ({ model: e.model, provider: e.endpoint.provider_name, tag: e.endpoint.tag, quantization: e.endpoint.quantization,
  excludedEndpoints: e.excludedEndpoints, supported: [...e.endpoint.supported_parameters].sort(), pricing: e.endpoint.pricing, maxPrompt: e.endpoint.max_prompt_tokens, maxCompletion: e.endpoint.max_completion_tokens, context: e.endpoint.context_length, policy: e.policy });
async function refreshEvidence(folder: string, approved: EndpointEvidence[]) {
  const publicJson = async <T>(url: string): Promise<T> => {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!response.ok) throw new Error("public-preflight-http-failed");
    return response.json() as Promise<T>;
  };
  const catalog = await publicJson<{ data: { id: string; architecture: { input_modalities: string[] } }[] }>("https://openrouter.ai/api/v1/models");
  const zdr = await publicJson<{ data: Endpoint[] }>("https://openrouter.ai/api/v1/endpoints/zdr");
  const checkedAt = new Date().toISOString();
  await durableJson(resolve(folder, "live-catalog.json"), { checkedAt, catalog });
  await durableJson(resolve(folder, "live-zdr.json"), { checkedAt, zdr });
  const failures: { model: string; reason: string }[] = [];
  for (const model of COMPARISON_MODELS) {
    try {
      if (!catalog.data.find(m => m.id === model.model)?.architecture.input_modalities.includes("image")) throw new Error("catalog-model-or-image-missing");
      const snapshot = await publicJson<EndpointSnapshot>(`https://openrouter.ai/api/v1/models/${model.model}/endpoints`);
      await durableJson(resolve(folder, `${model.model.replaceAll("/", "--")}-live.json`), { checkedAt, snapshot });
      const current = preflightEndpoint(model, snapshot, zdr);
      if (hashValue(policyFields(current)) !== hashValue(policyFields(approved.find(e => e.model === model.model)!))) throw new Error("pinned-endpoint-policy-price-or-capability-changed");
    } catch (e) { failures.push({ model: model.model, reason: e instanceof Error ? e.message : "preflight-failed" }); }
  }
  await durableJson(resolve(folder, "preflight.json"), { checkedAt, failures });
  if (failures.length) throw new Error("preflight-failed-see-preflight-json-no-substitution");
}

export async function main() {
  const { values } = parseArgs({ options: { manifest: { type: "string" }, snapshots: { type: "string" }, out: { type: "string" }, estimate: { type: "boolean" }, run: { type: "boolean" }, report: { type: "boolean" }, prepare: { type: "string" }, "make-photos": { type: "string" }, "max-usd": { type: "string" }, "max-attempts": { type: "string", default: "1" } } });
  if (values["make-photos"]) {
    if (!values.out || values.run) throw new Error("--make-photos requires --out DIR and no --run");
    console.log(await (await import("./scan-marking-synthetic-photos")).makeComparisonPhotos(values["make-photos"], values.out)); return;
  }
  if (values.prepare) {
    if (!values.out || values.run) throw new Error("--prepare requires --out manifest.json and no --run");
    await prepareComparisonManifest(values.prepare, values.out); console.log("Synthetic manifest sealed. No inference ran."); return;
  }
  if (!values.manifest || !values.snapshots || !values.out || [values.estimate, values.run, values.report].filter(Boolean).length !== 1) throw new Error("Use --manifest FILE --snapshots DIR --out DIR and exactly one of --estimate, --run, --report. --run also requires --max-usd <=15.");
  const maxAttempts = Number(values["max-attempts"]);
  if (maxAttempts !== 1 && maxAttempts !== 2) throw new Error("--max-attempts must be 1 or 2");
  const { manifest, images } = await loadComparisonAssets(values.manifest);
  const evidence = await snapshots(values.snapshots), maxima = evidence.map(reserveMaximum);
  const plan = { manifestHash: hashValue(manifest), models: COMPARISON_MODELS, settings: COMPARISON_SETTINGS, maxAttempts, evidence };
  const run = hashValue(plan), out = resolve(values.out, run);
  if (values.estimate) {
    console.log(JSON.stringify({ run, dispatchReady: false, reason: "Live preflight, reviewed SQL price bounds and first-photo usage projection are required before the full matrix.", photos: 40, models: 13, requests: 40 * 13 * maxAttempts, bounds: evidence.map((e, n) => ({ model: e.model, endpoint: e.endpoint.tag, policy: e.policy, evidenceHash: hashValue(e), maximumReservationMicros: maxima[n], maxPixels: Math.max(...manifest.photos.map(p => p.image.width * p.image.height)) })), firstProbeUpperBoundUsd: maxima.reduce((a, b) => a + b, 0) / 1e6,
      planningOnly: "USD 1.54 for one attempt or USD 8.42 for two attempts assumes 4000 image-inclusive input tokens. These are unverified estimates.", keyTotalUsd: 50, sharedUtcMonthUsd: 50, evaluationMaxUsd: 15 }, null, 2)); return;
  }
  await mkdir(out, { recursive: true });
  const planPath = resolve(out, "plan.json");
  try { await durableJson(planPath, plan, true); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST" || hashValue(await json(planPath)) !== hashValue(plan)) throw e; }
  const journalDir = resolve(out, "attempts"), resultsDir = resolve(out, "results");
  await mkdir(journalDir, { recursive: true }); await mkdir(resultsDir, { recursive: true });
  const resultPath = (model: string, photo: string) => resolve(resultsDir, `${hashValue({ model, photo })}.json`);
  const readResults = async () => Promise.all((await readdir(resultsDir)).filter(p => p.endsWith(".json")).sort().map(p => json<ComparisonResult>(resolve(resultsDir, p))));
  const writeReport = async () => {
    const results = await readResults(), reports = COMPARISON_MODELS.map((model, n) => scoreComparison(manifest, model, results, evidence[n]));
    await durableJson(resolve(out, "report.json"), { run, syntheticOnly: true, realHandwritingProven: false, settings: COMPARISON_SETTINGS, reports, cheapestMeasuredPassing: cheapestPassing(reports), productionSwitch: "blocked-until-explicit-host-policy-choice", evidence });
  };
  if (values.report) { await writeReport(); console.log(resolve(out, "report.json")); return; }
  const maxUsd = Number(values["max-usd"]);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 15 || !Number.isSafeInteger(maxUsd * 1e6)) throw new Error("--run requires --max-usd greater than 0 and at most 15");
  // Credential lookup occurs only in explicit --run, after synthetic asset validation.
  if (!process.env.SCAN_MARKING_OPENROUTER_API_KEY?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) throw new Error("dedicated-marking-and-ledger-credentials-required");
  await refreshEvidence(out, evidence);
  const budget = rpcEvaluationBudget("https://cdjobwsyzndtltzfpyqa.supabase.co", process.env.SUPABASE_SERVICE_ROLE_KEY);
  const journal = fileJournal(journalDir);
  // A crash can leave a held dispatch without a result. Never infer permission from a missing result file.
  const priorResults = await readResults();
  assertComparisonResume(await Promise.all((await readdir(journalDir)).filter(p => p.endsWith(".json")).map(p => json<AttemptRecord>(resolve(journalDir, p)))), priorResults);
  const dispatch = async (n: number, photoIndex: number) => {
    const model = COMPARISON_MODELS[n], photo = manifest.photos[photoIndex], path = resultPath(model.model, photo.id);
    try { return await json<ComparisonResult>(path); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    const result = await runComparisonPhoto({ run, photo, image: images.get(photo.id)!, model, evidence: evidence[n], maximumMicros: maxima[n], maxRunMicros: Math.floor(maxUsd * 1e6), budget, journal, env: process.env, maxAttempts });
    await durableJson(path, result, true); await writeReport();
    if (!result.attempts.length) throw new Error("admission-refused-stopped-run");
    if (result.attempts.some(a => a.usage.costMicros === null || a.usage.inputTokens === null || a.usage.outputTokens === null || a.usage.reasoningTokens === null)) throw new Error("unknown-usage-stopped-run-no-blind-retry");
    return result;
  };
  try {
    // Probe every model on the same FIRST photo before any second-photo dispatch.
    for (let n = 0; n < COMPARISON_MODELS.length; n++) await dispatch(n, 0);
    for (let photoIndex = 1; photoIndex < manifest.photos.length; photoIndex++) {
      for (let n = 0; n < COMPARISON_MODELS.length; n++) {
        const results = await readResults(), first = new Map(results.filter(r => r.photo === manifest.photos[0].id).map(r => [r.model, r.attempts.at(-1)!.usage]));
        if (results.some(r => r.attempts.some(a => a.usage.costMicros === null))) throw new Error("unknown-cost-stopped-run");
        const spent = results.flatMap(r => r.attempts).reduce((sum, a) => sum + a.usage.costMicros!, 0);
        const remaining = new Map(COMPARISON_MODELS.map(m => [m.model, manifest.photos.length - results.filter(r => r.model === m.model).length]));
        const projected = projectMatrix(evidence, first, spent, remaining, maxAttempts);
        await durableJson(resolve(out, "projection.json"), { projectedMicros: projected, maxMicros: Math.floor(maxUsd * 1e6), measuredSpentMicros: spent, remaining: Object.fromEntries(remaining), firstPhotoUsage: Object.fromEntries(first) });
        if (projected === null || projected > Math.floor(maxUsd * 1e6)) throw new Error("first-photo-projection-missing-or-over-cap");
        await dispatch(n, photoIndex);
      }
    }
  } finally { await writeReport(); }
  console.log(resolve(out, "report.json"));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(`Comparison stopped: ${error instanceof Error ? error.message : "unknown error"}. Inspect the saved files. No alternate route was used.`); process.exitCode = 1; });
