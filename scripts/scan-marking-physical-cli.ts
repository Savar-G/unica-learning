import { lstat, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { AI_PRODUCTS, productKey } from "@/lib/ai-product-keys";
import { expectedItems } from "@/lib/scan-observation";
import { labelledOutput, selectComparisonModels, type ComparisonManifest, type ComparisonModel, type ComparisonPhoto } from "@/lib/scan-marking-comparison";
import { durableJson, refreshEvidence } from "@/lib/scan-marking-comparison-io";
import { FROZEN_KIT, PHYSICAL_MODELS, physicalDevices, physicalEstimate, physicalEstimateLines, physicalFixedReport, physicalFixedSideBySide, physicalModels, physicalReport, physicalSettings, physicalSideBySide, reviewedPhysicalSource, truthTemplate, writeTruthCsv, type PhysicalMapping, type PhysicalSet, type PhysicalState } from "@/lib/scan-marking-physical";
import { SOURCE_FILES, assertPhysicalOwnership, calibratePhysicalPhoto, executePhysical, fakePhysicalHttp, loadPhysicalKit, newOutput, openPreparedPhysical, physicalBudget, prepareFixedSet, preparePhysical, regularBytes, replayPhysical, sealPhysicalPlan, writeBytes, type PhysicalPlan } from "@/lib/scan-marking-physical-io";

export { SOURCE_FILES, assertPhysicalOwnership, calibratePhysicalPhoto, executePhysical, fakePhysicalHttp, loadPhysicalKit, openPreparedPhysical, physicalBudget, prepareFixedSet, preparePhysical, regularBytes, replayPhysical, sealPhysicalPlan, type PhysicalPlan };

const ROOT = resolve(import.meta.dirname, "..");

export async function physicalMain() {
  const { values: v } = parseArgs({ options: { kit: { type: "string" }, photos: { type: "string" }, truth: { type: "string" }, out: { type: "string" }, template: { type: "boolean" }, estimate: { type: "boolean" }, run: { type: "boolean" }, replay: { type: "string" }, "fake-http": { type: "boolean" }, example: { type: "boolean" }, help: { type: "boolean" }, "fixed-set": { type: "string" }, models: { type: "string" }, devices: { type: "string" }, "max-usd": { type: "string", default: "15" }, "source-root": { type: "string", default: ROOT } } });
  if (v.help) { console.log("node scripts/scan-marking-physical.mjs --kit DIR --photos DIR --truth CSV --out EMPTY_DIR [--estimate | --fake-http | --run]\nDefault models: Sonnet 5.5 on google-vertex/global and Terra 6.1 on azure. --models model@endpoint[,model@endpoint]: other pinned pairs, one per model (production: anthropic/claude-sonnet-5.5@anthropic).\n--devices iphone|android|iphone,android (default both): a one-phone run is labelled as such and never meets the two-phone #852 bar.\n--fixed-set DIR: add the saved fixed 40 synthetic photos on prompt v8 to the same step.\n--run --out on a folder a refused credit check left: goes on from it.\n--template: write region-level CSV with empty human labels; no --truth needed.\n--replay RUN_DIR --out EMPTY_DIR: saved reader interpretation only.\nDefault: free preparation and offline estimate. See docs/scan-marking-physical.md for photos.json and truth columns."); return; }
  if (!v.out) throw Error("--out-required");
  if ([v.template, v.estimate, v.run, v.replay, v["fake-http"], v.example].filter(Boolean).length > 1) throw Error("choose-one-mode");
  if (v.example) {
    if (!v.kit || v.run || v.photos || v.truth || v.replay || v.template || v["fake-http"] || v.estimate) throw Error("example-requires-only-kit-and-out");
    console.log(await makePhysicalExample(v.kit, v.out)); return;
  }
  if (v.replay) { if (v.run || v.template || v["fake-http"] || v.kit || v.photos || v.truth) throw Error("replay-is-offline-only"); console.log(await replayPhysical(v.replay, v.out, v["source-root"]!)); return; }
  // A refused credit check leaves a prepared folder. --run --out on that folder goes on from it.
  if (v.run && await lstat(resolve(v.out, "plan.json")).then(() => true, () => false)) {
    const open = await openPreparedPhysical(v.out, v["source-root"]!);
    await paidRun(open.out, open.set, open.plan, open.states, open.fixed, v["source-root"]!);
    return;
  }
  if (!v.kit || !v.photos || (!v.truth && !v.template) || (v.run && (v.template || v.estimate || v["fake-http"]))) throw Error("use---kit---photos---truth---out-and-one-mode");
  if (v["fixed-set"] && v.template) throw Error("fixed-set-needs-a-run-or-estimate");
  const models = v.models ? selectComparisonModels(v.models.split(",").map(m => m.trim())) : PHYSICAL_MODELS, devices = physicalDevices(v.devices ? v.devices.split(",").map(d => d.trim()) : undefined);
  const maxMicros = Number(v["max-usd"]) * 1e6; physicalSettings(maxMicros, models, devices);
  const prepared = await preparePhysical({ kit: v.kit, photos: v.photos, truth: v.truth, out: v.out, template: v.template, fake: v["fake-http"], devices });
  if (!prepared.set) { console.log(resolve(prepared.out, "human-truth.csv")); return; }
  const { out, set } = prepared, fixed = v["fixed-set"] ? await prepareFixedSet(v["fixed-set"], out) : null;
  const { plan, run, states } = await sealPhysicalPlan(out, set, v["source-root"]!, maxMicros, fixed, models);
  await assertPhysicalOwnership(out, set, plan, v["source-root"]!, true);
  const estimate = physicalEstimate(set.photos.length, states, maxMicros, fixed?.photos.length ?? 0);
  for (const line of physicalEstimateLines(estimate)) console.log(line);
  await durableJson(resolve(out, "estimate.json"), { run, proofClass: "local-estimate", ...estimate, ...reviewedPhysicalSource(models),
    currentAggregateLiabilityMicros: null, reason: "The expected cost uses the reviewed prices the ledger has enabled. The live ledger is read only at paid admission, and credits only before a paid run. No stored baseline.", limits: plan.settings }, true);
  await durableJson(resolve(out, "report.json"), physicalReport(set, [], plan.evidences, run));
  if (v.run && estimate.overStop) throw Error("estimate-over-run-stop");
  if (v["fake-http"]) await fakePhysicalHttp(out, set, plan, run, fakeControl, fixed);
  if (v.run) { await paidRun(out, set, plan, states, fixed, v["source-root"]!); return; }
  const saved = JSON.parse((await regularBytes(resolve(out, "report.json"))).toString()) as ReturnType<typeof physicalReport>;
  console.log(physicalSideBySide(saved));
  if (fixed && v["fake-http"]) console.log(physicalFixedSideBySide(JSON.parse((await regularBytes(resolve(out, "fixed40-report.json"))).toString()) as ReturnType<typeof physicalFixedReport>));
  console.log(resolve(out, "report.json"));
}
async function paidRun(out: string, set: PhysicalSet, plan: PhysicalPlan, states: PhysicalState[], fixed: ComparisonManifest | null, root: string) {
  await executePhysical({ out, set, plan, root, fixed, env: () => {
    if (!productKey("marking", process.env)) throw Error("dedicated-marking-key-required-no-fallback");
    return Object.fromEntries(Object.values(AI_PRODUCTS).map((name) => [name, process.env[name]]));
  }, budget: () => { if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) throw Error("ledger-credential-required"); return physicalBudget(process.env.SUPABASE_SERVICE_ROLE_KEY, fetch, (value, attempt, dispatchRun) => durableJson(resolve(out, `admission-${attempt}.json`), { run: dispatchRun, attempt, ledger: value }, true)); }, preflight: async () => {
    await mkdir(resolve(out, "preflight"), { recursive: true, mode: 0o700 });
    const fresh = await refreshEvidence(resolve(out, "preflight"), states.map(s => ({ model: s.evidence.model, status: "ready" as const, ...s })), fetch, physicalModels(plan.settings.models).map(m => `${m.model}@${m.endpoint}`));
    return fresh.map(s => { if (s.status !== "ready") throw Error(`live-preflight:${s.reason}`); return { evidence: s.evidence, maximumMicros: s.maximumMicros }; });
  } });
  console.log(physicalSideBySide(JSON.parse((await regularBytes(resolve(out, "report.json"))).toString()) as ReturnType<typeof physicalReport>));
  if (fixed) console.log(physicalFixedSideBySide(JSON.parse((await regularBytes(resolve(out, "fixed40-report.json"))).toString()) as ReturnType<typeof physicalFixedReport>));
  console.log(resolve(out, "report.json"));
}

/** Copy existing blank synthetic prints only. These are explicitly fake controls, never human truth. */
export async function makePhysicalExample(kitPath: string, output: string) {
  const kit = await loadPhysicalKit(kitPath), out = await newOutput(output), photos = resolve(out, "photos");
  await mkdir(photos, { mode: 0o700 });
  const mapping: PhysicalMapping = { version: 1, madeUpRobinOnly: true, photos: [] };
  for (const device of ["iphone", "android"] as const) for (const page of kit.pages) {
    const file = `fake-${device}-pdf-${page.pdfPage}.png`;
    await writeBytes(resolve(photos, file), await regularBytes(resolve(kitPath, `page-${page.printedPage}.png`)));
    mapping.photos.push({ file, pdf_page: page.pdfPage, device, clarity: "clear" });
  }
  await durableJson(resolve(photos, "photos.json"), mapping, true);
  const rows = truthTemplate(mapping, kit.pages).map(r => ({ ...r, intended_result: "blank", reading_state: "blank", notes: "LOCAL FAKE: known empty printed source region; no handwriting or model truth." }));
  await writeBytes(resolve(out, "fake-truth.csv"), Buffer.from(writeTruthCsv(rows)));
  await durableJson(resolve(out, "example.json"), { proofClass: "local-fake", realPhones: false, photos: mapping.photos.length, truthRows: rows.length, source: FROZEN_KIT, warning: "Known blank print controls only. Never use these labels for human photos." }, true);
  return out;
}

/** A built-in fake control: Terra is unsure of the first method on each two-ways item, so the report shows a disagreement. */
function fakeControl(photo: ComparisonPhoto, model: ComparisonModel): unknown {
  const output = labelledOutput(photo);
  if (model.model !== "openai/gpt-6.1-terra" || !photo.truth.some(t => t.format === "two-ways")) return output;
  const n = expectedItems(photo.frame).findIndex(e => e.twoWays) + 1;
  return { readings: output.readings.map(r => r.item === `i${n}` && r.region === `r${n}` ? { ...r, state: "uncertain" as const, text: null, issue: "blurry" as const } : r) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) physicalMain().catch(e => { console.error(`Physical evaluation stopped: ${e instanceof Error ? e.message : "unknown failure"}`); process.exitCode = 1; });
