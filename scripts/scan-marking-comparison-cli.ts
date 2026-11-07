// No keychain access, rendering, generator or implicit inference. --estimate is offline.
import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import type { WorkbookInput } from "../src/lib/workbook-content";
import { COMPARISON_SETTINGS, SYNTHETIC_IDS, assessComparisonEndpoint, assertComparisonResultIdentity, assertComparisonResume, cheapestPassing, comparisonReports, hashBytes, hashValue, selectComparisonModels, assertSelectedComparisonResults, syntheticPrintRevision, validateComparisonManifest, type AttemptRecord, type ComparisonManifest, type ComparisonPhoto, type ComparisonPreflight, type ComparisonResult, type Endpoint, type EndpointEvidence, type EndpointSnapshot } from "../src/lib/scan-marking-comparison";
import { runComparisonMatrix, runComparisonPhoto, type EvaluationBudget, type EvaluationJournal } from "../src/lib/scan-marking-comparison-run";

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
    refresh: async input => {
      const result = await rpc("refresh_scan_marking_evaluation_price", { p_model: input.current.model, p_endpoint: input.current.endpoint.tag, p_previous_evidence: hashValue(input.approved), p_evidence: hashValue(input.current), p_maximum: input.maximumMicros, p_details: JSON.stringify(input.current) });
      if (result && typeof result === "object") {
        if ("verified" in result && result.verified === true) return { verified: true };
        if ("refused" in result && typeof result.refused === "string") return { refused: result.refused };
      }
      throw new Error("ledger-price-refresh-shape");
    },
    reserve: async input => {
      const result = await rpc("reserve_scan_marking_evaluation_checked", { p_run: input.run, p_attempt: input.attempt, p_model: input.model, p_endpoint: input.endpoint, p_evidence: input.evidence, p_pixels: input.pixels, p_maximum: input.maximumMicros, p_run_maximum: input.maxRunMicros });
      if (result && typeof result === "object") {
        if ("id" in result && typeof result.id === "string" && /^[0-9a-f-]{36}$/.test(result.id)) return { id: result.id };
        if ("refused" in result && typeof result.refused === "string") return { refused: result.refused };
      }
      throw new Error("ledger-admission-shape");
    },
    settle: async (id, cost) => { if (await rpc("settle_scan_marking_evaluation", { p_id: id, p_cost: cost }) !== true) throw new Error("ledger-settlement-refused"); },
  };
}

export async function comparisonSnapshots(folder: string, modelIds: readonly string[] | null = null): Promise<ComparisonPreflight[]> {
  const zdr = await json<{ data: Endpoint[] }>(resolve(folder, "zdr-endpoints-20261106.json"));
  return Promise.all(selectComparisonModels(modelIds).map(async model => {
    try { return assessComparisonEndpoint(model, await json<EndpointSnapshot>(resolve(folder, `${model.model.replaceAll("/", "--")}-endpoints.json`)), zdr); }
    catch (error) { return { model: model.model, status: "blocked" as const, reason: error instanceof Error ? error.message : "snapshot-missing" }; }
  }));
}
export async function refreshEvidence(folder: string, approved: readonly ComparisonPreflight[], base: typeof fetch = fetch, modelIds: readonly string[] | null = null): Promise<ComparisonPreflight[]> {
  const selected = selectComparisonModels(modelIds);
  const publicJson = async <T>(url: string): Promise<T> => {
    const response = await base(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (!response.ok) throw new Error("public-preflight-http-failed");
    return response.json() as Promise<T>;
  };
  const catalog = await publicJson<{ data: { id: string; architecture: { input_modalities: string[] } }[] }>("https://openrouter.ai/api/v1/models");
  const zdr = await publicJson<{ data: Endpoint[] }>("https://openrouter.ai/api/v1/endpoints/zdr");
  const checkedAt = new Date().toISOString();
  await durableJson(resolve(folder, "live-catalog.json"), { checkedAt, catalog });
  await durableJson(resolve(folder, "live-zdr.json"), { checkedAt, zdr });
  const states: ComparisonPreflight[] = [];
  for (const model of selected) {
    try {
      const prior = approved.find(e => e.model === model.model);
      if (!prior || prior.status === "blocked") throw new Error(prior?.reason ?? "reviewed-snapshot-missing");
      if (!catalog.data.find(m => m.id === model.model)?.architecture.input_modalities.includes("image")) throw new Error("catalog-model-or-image-missing");
      const snapshot = await publicJson<EndpointSnapshot>(`https://openrouter.ai/api/v1/models/${model.model}/endpoints`);
      await durableJson(resolve(folder, `${model.model.replaceAll("/", "--")}-live.json`), { checkedAt, snapshot });
      states.push(assessComparisonEndpoint(model, snapshot, zdr, prior.evidence));
    } catch (error) { states.push({ model: model.model, status: "blocked", reason: error instanceof Error ? error.message : "preflight-failed" }); }
  }
  await durableJson(resolve(folder, "preflight.json"), { checkedAt, states });
  return states;
}
const readyEvidence = (states: readonly ComparisonPreflight[]) => states.flatMap(s => s.status === "ready" ? [s.evidence] : []);

export async function main() {
  const { values } = parseArgs({ options: { manifest: { type: "string" }, snapshots: { type: "string" }, models: { type: "string" }, out: { type: "string" }, estimate: { type: "boolean" }, run: { type: "boolean" }, report: { type: "boolean" }, preflight: { type: "boolean" }, prepare: { type: "string" }, "make-photos": { type: "string" }, "max-usd": { type: "string" }, "max-attempts": { type: "string", default: "1" } } });
  if (values["make-photos"]) {
    if (!values.out || values.run) throw new Error("--make-photos requires --out DIR and no --run");
    console.log(await (await import("./scan-marking-synthetic-photos")).makeComparisonPhotos(values["make-photos"], values.out)); return;
  }
  if (values.prepare) {
    if (!values.out || values.run) throw new Error("--prepare requires --out manifest.json and no --run");
    await prepareComparisonManifest(values.prepare, values.out); console.log("Synthetic manifest sealed. No inference ran."); return;
  }
  if (!values.manifest || !values.snapshots || !values.out || [values.estimate, values.run, values.report, values.preflight].filter(Boolean).length !== 1) throw new Error("Use --manifest FILE --snapshots DIR --out DIR and exactly one of --estimate, --preflight, --run, --report. --run also requires --max-usd <=15.");
  const maxAttempts = Number(values["max-attempts"]);
  if (maxAttempts !== 1 && maxAttempts !== 2) throw new Error("--max-attempts must be 1 or 2");
  const selected = selectComparisonModels(values.models === undefined ? null : values.models.split(","));
  const selectedIds = selected.map(m => m.model);
  const { manifest, images } = await loadComparisonAssets(values.manifest);
  const approved = await comparisonSnapshots(values.snapshots, selectedIds), evidence = readyEvidence(approved);
  const plan = { manifestHash: hashValue(manifest), models: selected, settings: COMPARISON_SETTINGS, maxAttempts, approved };
  const run = hashValue(plan), out = resolve(values.out, run);
  if (values.estimate) {
    console.log(JSON.stringify({ run, dispatchReady: false, reason: "Live preflight, reviewed SQL price bounds and first-photo usage projection are required before the full matrix.", photos: 40, models: selected.length, requests: 40 * selected.length * maxAttempts, blocked: approved.filter(s => s.status === "blocked"), bounds: approved.flatMap(s => s.status === "ready" ? [{ model: s.model, endpoint: s.evidence.endpoint.tag, policy: s.evidence.policy, evidenceHash: hashValue(s.evidence), maximumReservationMicros: s.maximumMicros, maxPixels: Math.max(...manifest.photos.map(p => p.image.width * p.image.height)), evidence: s.evidence }] : []), firstProbeUpperBoundUsd: approved.reduce((sum, s) => sum + (s.status === "ready" ? s.maximumMicros : 0), 0) / 1e6,
      planningOnly: "USD 1.54 for one attempt or USD 8.42 for two attempts assumes 4000 image-inclusive input tokens. These are unverified estimates.", keyTotalUsd: 50, sharedUtcMonthUsd: 50, evaluationMaxUsd: 15 }, null, 2)); return;
  }
  await mkdir(out, { recursive: true });
  const planPath = resolve(out, "plan.json");
  try { await durableJson(planPath, plan, true); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST" || hashValue(await json(planPath)) !== hashValue(plan)) throw e; }
  const journalDir = resolve(out, "attempts"), resultsDir = resolve(out, "results");
  await mkdir(journalDir, { recursive: true }); await mkdir(resultsDir, { recursive: true });
  const resultPath = (model: string, photo: string) => resolve(resultsDir, `${hashValue({ model, photo })}.json`);
  const readResults = async () => {
    const results = await Promise.all((await readdir(resultsDir)).filter(p => p.endsWith(".json")).sort().map(p => json<ComparisonResult>(resolve(resultsDir, p))));
    assertSelectedComparisonResults(results, selectedIds);
    return results;
  };
  const historyPath = resolve(out, "evidence-history.json"), statePath = resolve(out, "model-states.json");
  let history = [...evidence], states = approved;
  const blocks = new Map<string, string>();
  try { history = await json<EndpointEvidence[]>(historyPath); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  try {
    const saved = await json<{ states: ComparisonPreflight[]; blocks: Record<string, string> }>(statePath);
    states = saved.states; for (const [model, reason] of Object.entries(saved.blocks)) blocks.set(model, reason);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const writeReport = async () => {
    const results = await readResults();
    assertComparisonResultIdentity(manifest, results, history, run);
    const reports = comparisonReports(manifest, states, results, history, blocks).filter(r => selectedIds.includes(r.model));
    await durableJson(resolve(out, "report.json"), { run, syntheticOnly: true, realHandwritingProven: false, settings: COMPARISON_SETTINGS, reports, blockedOrIncomplete: reports.filter(r => r.status !== "tested"), cheapestMeasuredPassing: cheapestPassing(reports), selectionScope: "fully-tested-passing-available-pairs-only", productionSwitch: "blocked-until-explicit-host-policy-choice", evidence: history });
  };
  if (values.report) { await writeReport(); console.log(resolve(out, "report.json")); return; }
  // Check unresolved local liability before any configuration or paid dispatch.
  const priorResults = await readResults();
  const records = await Promise.all((await readdir(journalDir)).filter(p => p.endsWith(".json")).map(p => json<AttemptRecord>(resolve(journalDir, p))));
  assertComparisonResume(records, priorResults);
  assertComparisonResultIdentity(manifest, priorResults, history, run);
  states = await refreshEvidence(out, approved, fetch, selectedIds);
  for (const e of readyEvidence(states)) if (!history.some(prior => hashValue(prior) === hashValue(e))) history.push(e);
  await durableJson(historyPath, history);
  const save = async (currentBlocks: ReadonlyMap<string, string>, projection: unknown) => {
    for (const [model, reason] of currentBlocks) blocks.set(model, reason);
    await durableJson(statePath, { states, blocks: Object.fromEntries(blocks) });
    if (projection) await durableJson(resolve(out, "projection.json"), projection);
    await writeReport();
  };
  if (values.preflight) { await save(blocks, null); console.log(resolve(out, "preflight.json")); return; }
  const maxUsd = Number(values["max-usd"]);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0 || maxUsd > 15 || !Number.isSafeInteger(maxUsd * 1e6)) throw new Error("--run requires --max-usd greater than 0 and at most 15");
  // Credential lookup occurs only in explicit --run, after synthetic and resume validation.
  if (!process.env.SCAN_MARKING_OPENROUTER_API_KEY?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) throw new Error("dedicated-marking-and-ledger-credentials-required");
  const budget = rpcEvaluationBudget("https://cdjobwsyzndtltzfpyqa.supabase.co", process.env.SUPABASE_SERVICE_ROLE_KEY), journal = fileJournal(journalDir);
  for (let n = 0; n < states.length; n++) {
    const state = states[n], prior = approved.find(s => s.model === state.model);
    if (state.status !== "ready" || prior?.status !== "ready") continue;
    const refreshed = await budget.refresh({ approved: prior.evidence, current: state.evidence, maximumMicros: state.maximumMicros });
    if ("refused" in refreshed) states[n] = { model: state.model, status: "blocked", reason: refreshed.refused };
  }
  // A saved model block is persistent for this run. It never authorizes retry of an omitted or refused attempt.
  states = states.map(s => blocks.has(s.model) ? { model: s.model, status: "blocked", reason: blocks.get(s.model)! } : s);
  try {
    await runComparisonMatrix({ run, manifest, preflight: states, history, results: priorResults, records, maxRunMicros: Math.floor(maxUsd * 1e6), maxAttempts, save,
      dispatch: async (model, photo, current, maximumMicros) => {
        const result = await runComparisonPhoto({ run, photo, image: images.get(photo.id)!, model, evidence: current, maximumMicros, maxRunMicros: Math.floor(maxUsd * 1e6), budget, journal, env: process.env, maxAttempts });
        await durableJson(resultPath(model.model, photo.id), result, true);
        assertComparisonResume(await Promise.all((await readdir(journalDir)).filter(p => p.endsWith(".json")).map(p => json<AttemptRecord>(resolve(journalDir, p)))), await readResults());
        await writeReport();
        return result;
      },
    });
  } finally { await save(blocks, null); }

  console.log(resolve(out, "report.json"));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(`Comparison stopped: ${error instanceof Error ? error.message : "unknown error"}. Inspect the saved files. No alternate route was used.`); process.exitCode = 1; });
