// No keychain access, rendering, generator or implicit inference. --estimate is offline.
import { flushAiUsage } from "@/lib/ai-usage";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { COMPARISON_DEFERRAL_POLICY, COMPARISON_SETTINGS, assertComparisonResultIdentity, assertComparisonResume, assertSelectedComparisonResults, cheapestPassing, comparisonReports, hashValue, recoverComparisonResults, selectComparisonModels, type AttemptRecord, type ComparisonPreflight, type ComparisonResult, type EndpointEvidence } from "@/lib/scan-marking-comparison";
import { runComparisonMatrix, runComparisonPhoto } from "@/lib/scan-marking-comparison-run";
import { comparisonSnapshots, durableJson, fileJournal, loadComparisonAssets, prepareComparisonManifest, readyEvidence, refreshEvidence, rpcEvaluationBudget } from "@/lib/scan-marking-comparison-io";

export { comparisonSnapshots, durableJson, fileJournal, loadComparisonAssets, prepareComparisonManifest, refreshEvidence, rpcEvaluationBudget };

const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;

export async function main() {
  const { values } = parseArgs({ options: { manifest: { type: "string" }, snapshots: { type: "string" }, models: { type: "string" }, out: { type: "string" }, estimate: { type: "boolean" }, run: { type: "boolean" }, report: { type: "boolean" }, preflight: { type: "boolean" }, prepare: { type: "string" }, "make-photos": { type: "string" }, "max-usd": { type: "string" }, "max-attempts": { type: "string", default: "1" } } });
  if (values["make-photos"]) {
    if (!values.out || values.run) throw new Error("--make-photos requires --out DIR and no --run");
    console.log(await (await import("@/lib/scan-marking-synthetic-photos")).makeComparisonPhotos(values["make-photos"], values.out)); return;
  }
  if (values.prepare) {
    if (!values.out || values.run) throw new Error("--prepare requires --out manifest.json and no --run");
    await prepareComparisonManifest(values.prepare, values.out); console.log("Synthetic manifest sealed. No inference ran."); return;
  }
  if (!values.manifest || !values.snapshots || !values.out || [values.estimate, values.run, values.report, values.preflight].filter(Boolean).length !== 1) throw new Error("Use --manifest FILE --snapshots DIR --out DIR and exactly one of --estimate, --preflight, --run, --report. --run also requires --max-usd <=15.");
  const maxAttempts = Number(values["max-attempts"]);
  if (maxAttempts !== 1 && maxAttempts !== 2) throw new Error("--max-attempts must be 1 or 2");
  const selection = values.models === undefined ? null : values.models.split(",");
  const selected = selectComparisonModels(selection);
  const selectedIds = selected.map(m => m.model);
  const { manifest, images } = await loadComparisonAssets(values.manifest);
  const approved = await comparisonSnapshots(values.snapshots, selection ?? selectedIds), evidence = readyEvidence(approved);
  const plan = { manifestHash: hashValue(manifest), models: selected, settings: COMPARISON_SETTINGS, deferralPolicy: COMPARISON_DEFERRAL_POLICY, maxAttempts, approved };
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
    assertSelectedComparisonResults(results, selection ?? selectedIds);
    return results;
  };
  const readRecords = async () => Promise.all((await readdir(journalDir)).filter(p => p.endsWith(".json")).map(async p => {
    const record = await json<AttemptRecord>(resolve(journalDir, p));
    if (p !== `${record.key}.json`) throw new Error("journal-filename-identity-mismatch");
    return record;
  }));
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
    assertComparisonResultIdentity(manifest, results, history, run, selected);
    const reports = comparisonReports(manifest, states, results, history, blocks, selected);
    await durableJson(resolve(out, "report.json"), { run, syntheticOnly: true, realHandwritingProven: false, settings: COMPARISON_SETTINGS, deferralPolicy: COMPARISON_DEFERRAL_POLICY, measuredMicros: reports.reduce((sum, r) => sum + (r.measuredMicros ?? 0), 0), heldMicros: reports.reduce((sum, r) => sum + r.heldMicros, 0), reports, blockedOrIncomplete: reports.filter(r => r.status !== "tested"), cheapestMeasuredPassing: cheapestPassing(reports), selectionScope: "fully-tested-passing-available-pairs-with-fully-measured-cost-only", productionSwitch: "blocked-until-explicit-host-policy-choice", evidence: history });
  };
  if (values.report) { await writeReport(); console.log(resolve(out, "report.json")); return; }
  // Check unresolved local liability before any configuration or paid dispatch.
  const records = await readRecords();
  const priorResults = recoverComparisonResults(records, await readResults(), manifest, history, run, selected);
  assertSelectedComparisonResults(priorResults, selection ?? selectedIds);
  for (const result of priorResults) await durableJson(resultPath(result.model, result.photo), result);
  states = await refreshEvidence(out, approved, fetch, selection ?? selectedIds);
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
    await runComparisonMatrix({ run, manifest, preflight: states, history, results: priorResults, records, models: selected, maxRunMicros: Math.floor(maxUsd * 1e6), maxAttempts, save, wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
      dispatch: async (model, photo, current, maximumMicros, batch, prior) => {
        const result = await runComparisonPhoto({ run, photo, image: images.get(photo.id)!, model, evidence: current, maximumMicros, maxRunMicros: Math.floor(maxUsd * 1e6), budget, journal, env: process.env, maxAttempts, batch, prior });
        await durableJson(resultPath(model.model, photo.id), result, !prior);
        assertComparisonResume(await readRecords(), await readResults());
        await writeReport();
        return result;
      },
    });
  } finally { await save(blocks, null); }

  console.log(resolve(out, "report.json"));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().finally(flushAiUsage).catch(error => { console.error(`Comparison stopped: ${error instanceof Error ? error.message : "unknown error"}. Inspect the saved files. No alternate route was used.`); process.exitCode = 1; });
