import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import ts from "typescript";
import { calibratePhoto, cropBox, cropPlan, sheetChecker, straightenedPage, type Raster } from "../src/lib/scan-calibration";
import { normalizeScanPhoto } from "../src/lib/scan-photo-image";
import { printContractForPhoto, printContractProblem, regionsProblem } from "../src/lib/workbook-print-contract";
import { pageUrl } from "../src/lib/workbook-render";
import type { WorkbookInput } from "../src/lib/workbook-content";
import { expectedItems } from "../src/lib/scan-observation";
import { markingRegions } from "../src/lib/scan-marking-regions";
import { markingRequest, readMarkingOutput, validMarkingOutput } from "../src/lib/scan-marking";
import { FIXED40_V7_MANIFEST_SHA256, assertComparisonResultIdentity, selectComparisonModels, assertComparisonResume, deferredAttempt, endpointPolicy, hashBytes, hashValue, labelledOutput, syntheticPrintRevision, transportUsage, upgradeFixed40Manifest, type AttemptRecord, type ComparisonManifest, type ComparisonModel, type ComparisonPhoto, type ComparisonResult, type EndpointEvidence } from "../src/lib/scan-marking-comparison";
import { runComparisonPhoto, type EvaluationBudget, type EvaluationJournal } from "../src/lib/scan-marking-comparison-run";
import { FROZEN_KIT, PHYSICAL_MODELS, PHYSICAL_VERSION, physicalDevices, physicalModels, reviewedPhysicalSource, assertPhysicalFrame, physicalCreditPreflight, physicalEstimate, physicalEstimateLines, physicalFixedReport, physicalFixedSideBySide, physicalPhotoId, physicalReport, reviewedPhysicalStates, physicalScoringInput, physicalSettings, physicalSideBySide, physicalTruth, truthTemplate, validateMapping, writeTruthCsv, type PhysicalMapping, type PhysicalPage, type PhysicalPhoto, type PhysicalDevice, type PhysicalSet, type PhysicalState } from "../src/lib/scan-marking-physical";
import { durableJson, fileJournal, loadComparisonAssets, refreshEvidence, rpcEvaluationBudget } from "./scan-marking-comparison-cli";

const ROOT = resolve(import.meta.dirname, "..");
// Paths resolved by the launcher are supplied explicitly because the bundled file lives in a temporary directory.
export const SOURCE_FILES = ["scripts/scan-marking-physical.mjs", "scripts/scan-marking-physical-cli.ts", "src/lib/scan-marking-physical.ts", "src/lib/scan-marking.ts", "src/lib/scan-marking-ai.ts", "src/lib/scan-marking-comparison.ts", "src/lib/scan-marking-comparison-run.ts", "scripts/scan-marking-comparison-cli.ts", "src/lib/scan-calibration.ts", "src/lib/scan-photo-image.ts", "src/lib/scan-marking-regions.ts", "src/lib/scan-marking-numbers.ts", "src/lib/scan-observation.ts", "src/lib/workbook-print-contract.ts", "src/lib/ai-openrouter.ts", "src/lib/ai-client.ts", "data/scan-marking-models.json", "data/scan-marking-physical-reviewed-evidence-20261107.json", "data/scan-marking-physical-reviewed-evidence-20261114.json", "supabase/migrations/20261107_scan_marking_physical_evaluation.sql", "package-lock.json"];
export async function regularBytes(path: string, max = 25 * 1024 * 1024): Promise<Buffer> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const stat = await file.stat(); if (!stat.isFile() || stat.size > max || stat.size < 1) throw Error("unsafe-or-oversized-file"); return await file.readFile(); }
  finally { await file.close(); }
}
async function directory(path: string) {
  if (!(await lstat(path)).isDirectory() || (await lstat(path)).isSymbolicLink()) throw Error("directory-or-symlink");
  return realpath(path);
}
async function newOutput(path: string) {
  try { await mkdir(path, { mode: 0o700 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; }
  const out = await directory(path);
  if ((await readdir(out)).length) throw Error("output-must-be-empty-no-resume");
  await durableJson(resolve(out, "owner.json"), { owner: randomUUID(), version: PHYSICAL_VERSION }, true);
  return out;
}
async function json<T>(path: string): Promise<T> { return JSON.parse((await regularBytes(path)).toString("utf8")) as T; }
const raster = async (bytes: Uint8Array): Promise<Raster> => {
  const { data, info } = await sharp(bytes, { limitInputPixels: 48_000_000 }).flatten({ background: "white" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw Error("rgb-decode-required");
  return { data, width: info.width, height: info.height, channels: 3 };
};
const jpeg = (r: Raster) => sharp(Buffer.from(r.data), { raw: { width: r.width, height: r.height, channels: r.channels } }).jpeg({ quality: 88 }).toBuffer();

export async function loadPhysicalKit(path: string) {
  const root = await directory(path);
  for (const [name, hash] of Object.entries(FROZEN_KIT)) if (hashBytes(await regularBytes(resolve(root, name))) !== hash) throw Error(`frozen-kit-hash:${name}`);
  const book = await json<WorkbookInput>(resolve(root, "rendered-workbook.json"));
  if (book.pdfSha256 !== FROZEN_KIT["Robin-marking-test-booklet.pdf"] || book.profileBuild !== null || book.pages.length !== 12) throw Error("frozen-kit-book-identity");
  const draftBytes = await regularBytes(resolve(root, "synthetic-draft.json"));
  const draft = JSON.parse(draftBytes.toString()) as { id: string; childId: string; model: string; profileBuild: unknown };
  if (draft.id !== book.id || draft.childId !== book.childId || draft.model !== "fake" || draft.profileBuild !== null) throw Error("synthetic-draft-provenance");
  const revision = syntheticPrintRevision(book), pages: PhysicalPage[] = [];
  const printed = new Map<number, Raster>();
  for (const [index, page] of book.pages.entries()) {
    if (!page.printContract || !page.image || printContractProblem(page.printContract, { workbookId: book.id, page: page.number, image: page.image })) throw Error("invalid-measured-print-contract");
    // The original build wrote page-N.png. Never resolve its Storage path or render again.
    const bytes = await regularBytes(resolve(root, `page-${page.number}.png`));
    if (hashBytes(bytes) !== page.printContract.fingerprints.image) throw Error("frozen-print-image-changed");
    const decoded = await raster(bytes);
    if (decoded.width !== page.image.width || decoded.height !== page.image.height) throw Error("frozen-print-size-changed");
    if (!page.questions.length) continue;
    const frame: ComparisonPhoto["frame"] = { parentId: "00000000-0000-4000-8000-000000000543", childId: book.childId, workbookId: book.id, pageId: `synthetic-physical-page-${page.number}`, pageNumber: page.number, photo: "synthetic-physical-template", printedRevision: revision, ready: true,
      questions: page.questions.map(q => ({ number: q.number, package: q.package, regions: q.regions ?? null, teaching: q.teaching ?? null })) };
    if (!page.printContract.label || frame.questions.some(q => regionsProblem(q.regions, page.image) || q.regions?.some(r => !r.box))) throw Error("unmeasured-physical-region");
    for (const e of expectedItems(frame)) if (e.method !== "code" || !markingRegions(frame.questions.find(q => q.number === e.number)!).length) throw Error("unsupported-physical-item");
    pages.push({ pdfPage: index + 1, printedPage: page.number, label: page.printContract.label, frame }); printed.set(page.number, decoded);
  }
  if (pages.length !== 10 || pages.reduce((n, p) => n + p.frame.questions.length, 0) !== 74) throw Error("frozen-kit-coverage");
  return { book, pages, revision, printed, draftSha256: hashBytes(draftBytes) };
}

/** Public geometry interfaces only. There is no rectangular resize to force a page to fit. */
export async function calibratePhysicalPhoto(raw: Uint8Array, page: WorkbookInput["pages"][number], revision: string, printed: Raster, others: readonly Raster[]) {
  const normalized = await normalizeScanPhoto(raw);
  if (normalized.token !== page.qrToken) throw Error("wrong-page-qr");
  const photo = await raster(normalized.bytes);
  const contract = printContractForPhoto({ printedRevision: revision }, { printContract: page.printContract ?? null }, { printedRevision: revision });
  const writing = page.questions.flatMap(q => (q.regions ?? []).flatMap(r => r.box ? [r.box] : []));
  const result = calibratePhoto({ photo, printed, contract, pageLink: pageUrl(page.qrToken), writing });
  if (result.status !== "calibrated") throw Error(`calibration:${result.reason}`);
  // The frozen kit is measured on photos that hold all four marks: a page placed by its QR code (#912) is not one of them.
  if (result.calibration.placedBy === "qr") throw Error("calibration:marks-missing");
  const sheet = sheetChecker({ photo, printed, transform: result.calibration.transform, writing, sheet: result.calibration })(others);
  if (sheet.verdict !== "this-page") throw Error(`sheet:${sheet.verdict}`);
  if (contract.status !== "available") throw Error("no-contract");
  const plan = cropPlan(page.questions.map(q => ({ ...q, regions: q.regions ?? null }))), straight = await jpeg(straightenedPage(photo, result.calibration, contract.contract));
  if (plan.notSupported.length) throw Error("unsupported-measured-crop");
  const crops = [];
  for (const c of plan.crops) { const bytes = await jpeg(cropBox(photo, result.calibration, contract.contract, c.box)); crops.push({ ...c, sha256: hashBytes(bytes) }); }
  return { straight, oriented: normalized.bytes, calibration: result.calibration, sheet, crops };
}

export async function preparePhysical(options: { kit: string; photos: string; truth?: string; out: string; template?: boolean; fake?: boolean; devices?: readonly PhysicalDevice[] }) {
  const devices = physicalDevices(options.devices);
  if ([options.kit, options.photos].some(p => resolve(options.out) === resolve(p) || resolve(options.out).startsWith(resolve(p) + "/"))) throw Error("output-must-be-outside-inputs");
  const out = await newOutput(options.out);
  const inventory: { file: string; rawSha256: string | null; reason: string | null }[] = [];
  try {
    const kit = await loadPhysicalKit(options.kit), folder = await directory(options.photos);
    const mappingBytes = await regularBytes(resolve(folder, "photos.json")), mapping = JSON.parse(mappingBytes.toString()) as PhysicalMapping;
    const missing = validateMapping(mapping, kit.pages, devices);
    for (const file of (await readdir(folder)).sort()) {
      if (file === "photos.json") continue;
      try { const bytes = await regularBytes(resolve(folder, file)); inventory.push({ file, rawSha256: hashBytes(bytes), reason: mapping.photos.some(p => p.file === file) ? null : "unmapped-photo-or-file" }); }
      catch { inventory.push({ file, rawSha256: null, reason: "unsafe-unreadable-or-oversized-photo" }); }
    }
    for (const m of mapping.photos) if (!inventory.some(p => p.file === m.file)) inventory.push({ file: m.file, rawSha256: null, reason: "missing-photo" });
    await durableJson(resolve(out, "inventory.json"), inventory, true);
    if (options.template) {
      const file = await open(resolve(out, "human-truth.csv"), "wx", 0o600);
      try { await file.writeFile(writeTruthCsv(truthTemplate(mapping, kit.pages))); await file.sync(); } finally { await file.close(); }
      await durableJson(resolve(out, "template-report.json"), { version: PHYSICAL_VERSION, missing, inventory, paid: false, requiresHumanLabels: true, ...(devices.length < 2 ? { devices } : {}) }, true);
      return { out, set: null };
    }
    if (!options.truth) throw Error("completed-human-truth-required");
    const truthBytes = await regularBytes(options.truth, 4 * 1024 * 1024), truths = physicalTruth(mapping, kit.pages, truthBytes.toString("utf8"));
    await mkdir(resolve(out, "images"), { mode: 0o700 });
    const photos: PhysicalPhoto[] = [];
    for (const m of mapping.photos) {
      const pageInfo = kit.pages.find(p => p.pdfPage === m.pdf_page)!, page = kit.book.pages.find(p => p.number === pageInfo.printedPage)!;
      const id = physicalPhotoId(m.file), raw = inventory.find(p => p.file === m.file)!;
      const photo: ComparisonPhoto = { id, clear: m.clarity === "clear", image: { path: `images/${id}.jpg`, sha256: hashBytes("refused:" + m.file), width: page.image!.width, height: page.image!.height, metadataFree: true },
        frame: { ...pageInfo.frame, photo: id }, truth: truths.get(m.file)! };
      const entry: PhysicalPhoto = { mapping: m, rawSha256: raw.rawSha256, status: raw.reason ? "incomplete" : "refused", reason: raw.reason, normalizedSha256: null, calibration: null, crops: null, photo };
      photos.push(entry);
      if (raw.reason) continue;
      try {
        const bytes = await regularBytes(resolve(folder, m.file)); if (hashBytes(bytes) !== raw.rawSha256) throw Error("raw-photo-changed");
        const checked = await calibratePhysicalPhoto(bytes, page, kit.revision, kit.printed.get(page.number)!, [...kit.printed.values()].filter(p => p !== kit.printed.get(page.number)));
        await writeBytes(resolve(out, photo.image.path), checked.straight);
        await writeBytes(resolve(out, `images/${id}-oriented.jpg`), checked.oriented);
        photo.image.sha256 = hashBytes(checked.straight); entry.normalizedSha256 = hashBytes(checked.oriented);
        entry.status = "ready"; entry.reason = null; entry.calibration = { ...checked.calibration, sheet: checked.sheet }; entry.crops = checked.crops;
        assertPhysicalFrame(photo);
      } catch (e) { entry.reason = e instanceof Error ? e.message : "invalid-image"; }
    }
    const set: PhysicalSet = { version: PHYSICAL_VERSION, proofClass: options.fake ? "local-fake" : "physical-input", kit: FROZEN_KIT, draftSha256: kit.draftSha256, revision: kit.revision, truthSha256: hashBytes(truthBytes), mappingSha256: hashBytes(mappingBytes), photos, inventory,
      missing: [...missing, ...inventory.filter(p => p.reason).map(p => `${p.file}:${p.reason}`)], ...(devices.length < 2 ? { devices } : {}) };
    await durableJson(resolve(out, "set.json"), set, true);
    return { out, set };
  } catch (e) {
    await durableJson(resolve(out, "validation-report.json"), { version: PHYSICAL_VERSION, passed: false, complete: false, error: e instanceof Error ? e.message : "validation-failed", inventory, refusedOrIncomplete: inventory.length }, true);
    throw e;
  }
}
async function writeBytes(path: string, bytes: Uint8Array) { const file = await open(path, "wx", 0o600); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); } }

export interface PhysicalPlan { version: typeof PHYSICAL_VERSION; owner: string; source: Record<string, string>; setHash: string; settings: ReturnType<typeof physicalSettings>; evidences: EndpointEvidence[]; requests: { photo: string; image: string; request: string }[]; fixed: { manifest: string; photos: { photo: string; image: string; request: string }[] } | null }
async function sourceHashes(root: string) {
  const hashes = new Map<string, string>();
  const visit = async (path: string): Promise<void> => {
    if (hashes.has(path)) return;
    if (!path.startsWith(resolve(root) + "/")) throw Error("source-outside-checkout");
    const bytes = await regularBytes(path, 8 * 1024 * 1024); hashes.set(path, hashBytes(bytes));
    if (!/\.[cm]?tsx?$/.test(path)) return;
    // Bind transitive local source too, including the fraction reader and checked-package logic.
    const imports: string[] = [];
    const syntax = ts.createSourceFile(path, bytes.toString(), ts.ScriptTarget.Latest, true);
    const scan = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      ts.forEachChild(node, scan);
    };
    scan(syntax);
    for (const spec of imports) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      const base = spec.startsWith("@/") ? resolve(root, "src", spec.slice(2)) : resolve(path, "..", spec);
      let found = false;
      for (const candidate of /\.(json|[cm]?tsx?)$/.test(base) ? [base] : [base + ".ts", base + ".tsx", base + "/index.ts"]) {
        try { await lstat(candidate); } catch { continue; }
        await visit(candidate); found = true; break;
      }
      if (!found) throw Error(`local-source-import-unresolved:${path.slice(resolve(root).length + 1)}:${spec}`);
    }
  };
  for (const file of SOURCE_FILES) await visit(resolve(root, file));
  return Object.fromEntries([...hashes].map(([p, hash]) => [p.slice(resolve(root).length + 1), hash]).sort(([a], [b]) => a.localeCompare(b)));
}
/** The saved v7 photos and frames for prompt v8. The copy is the bound input of this run. */
export async function prepareFixedSet(source: string, out: string): Promise<ComparisonManifest> {
  const folder = await directory(source), bytes = await regularBytes(resolve(folder, "manifest.json"));
  if (hashBytes(bytes) !== FIXED40_V7_MANIFEST_SHA256) throw Error("fixed-set-identity");
  const manifest = upgradeFixed40Manifest(JSON.parse(bytes.toString()) as ComparisonManifest), target = resolve(out, "fixed40");
  await mkdir(resolve(target, "photos"), { recursive: true, mode: 0o700 });
  for (const p of manifest.photos) await writeBytes(resolve(target, p.image.path), await regularBytes(resolve(folder, p.image.path)));
  for (const name of ["synthetic-draft.json", "fixture-manifest.json", "rendered-workbook.json"]) await writeBytes(resolve(target, name), await regularBytes(resolve(folder, name)));
  await durableJson(resolve(target, "manifest.json"), manifest, true);
  // The existing loader checks every image, frame and source hash, and the strict manifest rules.
  return (await loadComparisonAssets(resolve(target, "manifest.json"))).manifest;
}
export async function sealPhysicalPlan(out: string, set: PhysicalSet, root: string, maxMicros: number, fixed: ComparisonManifest | null = null, models: readonly ComparisonModel[] = PHYSICAL_MODELS) {
  const states = reviewedPhysicalStates(models);
  const owner = await json<{ owner: string }>(resolve(out, "owner.json"));
  const plan: PhysicalPlan = { version: PHYSICAL_VERSION, owner: owner.owner, source: await sourceHashes(root), setHash: hashValue(set), settings: physicalSettings(maxMicros, models, set.devices), evidences: states.map(s => s.evidence),
    requests: set.photos.map(p => ({ photo: p.photo.id, image: p.photo.image.sha256, request: hashValue(markingRequest(p.photo.frame, new Uint8Array())) })),
    fixed: fixed && { manifest: hashValue(fixed), photos: fixed.photos.map(p => ({ photo: p.id, image: p.image.sha256, request: hashValue(markingRequest(p.frame, new Uint8Array())) })) } };
  await durableJson(resolve(out, "plan.json"), plan, true);
  await durableJson(resolve(out, "plan-hash.json"), { run: hashValue(plan) }, true);
  return { plan, run: hashValue(plan), states };
}
/** No preflight, credential read or reservation can precede these current-run checks. */
export async function assertPhysicalOwnership(out: string, set: PhysicalSet, plan: PhysicalPlan, root: string, pristine = false) {
  await directory(out);
  const saved = await json<PhysicalPlan>(resolve(out, "plan.json")), owner = await json<{ owner: string }>(resolve(out, "owner.json")), identity = await json<{ run: string }>(resolve(out, "plan-hash.json"));
  if (hashValue(saved) !== hashValue(plan) || identity.run !== hashValue(plan) || owner.owner !== plan.owner || plan.version !== PHYSICAL_VERSION || plan.setHash !== hashValue(set) || hashValue(await json(resolve(out, "set.json"))) !== plan.setHash || hashValue(plan.settings) !== hashValue(physicalSettings(plan.settings.maxMicros, plan.settings.models, set.devices)) || hashValue(plan.source) !== hashValue(await sourceHashes(root))) throw Error("saved-plan-or-current-run-ownership");
  const files = await readdir(out);
  if (pristine && (files.some(f => !["owner.json", "inventory.json", "images", "set.json", "plan.json", "plan-hash.json", "estimate.json", "report.json", "side-by-side.json", "fixed40", "preflight", "credit-preflight.json"].includes(f)))) throw Error("stale-run-files-no-dispatch");
  const expectedImages: string[] = [];
  await directory(resolve(out, "images"));
  for (const p of set.photos.filter(p => p.status === "ready")) {
    assertPhysicalFrame(p.photo);
    const req = plan.requests.find(r => r.photo === p.photo.id);
    if (!req || req.image !== p.photo.image.sha256 || req.request !== hashValue(markingRequest(p.photo.frame, new Uint8Array()))) throw Error("plan-request-identity");
    for (const [name, hash] of [[p.photo.image.path, p.photo.image.sha256], [`images/${p.photo.id}-oriented.jpg`, p.normalizedSha256]]) {
      if (!/^images\/synthetic-physical-[a-f0-9]{24}(-oriented)?\.jpg$/.test(name!)) throw Error("unsafe-plan-image-path");
      expectedImages.push(basename(name!));
      if (hashBytes(await regularBytes(resolve(out, name!))) !== hash) throw Error("immutable-normalized-image");
    }
  }
  if (hashValue((await readdir(resolve(out, "images"))).sort()) !== hashValue(expectedImages.sort())) throw Error("unowned-image-files");
  if (plan.fixed) {
    const manifest = await json<ComparisonManifest>(resolve(out, "fixed40/manifest.json"));
    if (hashValue(manifest) !== plan.fixed.manifest) throw Error("fixed-set-changed");
    for (const p of manifest.photos) {
      const saved = plan.fixed.photos.find(x => x.photo === p.id);
      if (!saved || saved.image !== p.image.sha256 || saved.request !== hashValue(markingRequest(p.frame, new Uint8Array())) || hashBytes(await regularBytes(resolve(out, "fixed40", p.image.path))) !== saved.image) throw Error("fixed-set-changed");
    }
  }
  return identity.run;
}
/** A folder a refused credit check left behind stays usable. It reopens only while no run has started. */
export async function openPreparedPhysical(out: string, root: string) {
  const folder = await directory(out);
  if ((await readdir(folder)).includes("execution.json")) throw Error("run-already-started-no-resume");
  const set = await json<PhysicalSet>(resolve(folder, "set.json")), plan = await json<PhysicalPlan>(resolve(folder, "plan.json"));
  const run = await assertPhysicalOwnership(folder, set, plan, root, true);
  const fixed = plan.fixed ? await json<ComparisonManifest>(resolve(folder, "fixed40/manifest.json")) : null;
  return { out: folder, set, plan, run, states: reviewedPhysicalStates(plan.settings.models), fixed };
}

/** Additive RPC owns the aggregate USD 15 lock; existing RPCs own prices, unknowns and settlement. */
export function physicalBudget(serviceKey: string, base: typeof fetch = fetch, admission?: (value: unknown, attempt: string, run: string) => Promise<void>): EvaluationBudget {
  const budget = rpcEvaluationBudget("https://cdjobwsyzndtltzfpyqa.supabase.co", serviceKey, base);
  return { ...budget, reserve: async i => {
    const response = await base("https://cdjobwsyzndtltzfpyqa.supabase.co/rest/v1/rpc/reserve_scan_marking_physical_evaluation_checked", { method: "POST", headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({ p_run: i.run, p_attempt: i.attempt, p_model: i.model, p_endpoint: i.endpoint, p_evidence: i.evidence, p_pixels: i.pixels, p_maximum: i.maximumMicros, p_run_maximum: i.maxRunMicros }), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw Error("physical-ledger-rpc-failed");
    const result = await response.json();
    if (admission) await admission(result, i.attempt, i.run);
    if (result && typeof result.refused === "string") return { refused: result.refused };
    if (result && typeof result.id === "string" && /^[0-9a-f-]{36}$/.test(result.id)) return { id: result.id };
    throw Error("physical-ledger-admission-shape");
  } };
}

/** One serial pass over both models and at most one delayed retry of a clean 429. No paid resume. */
export async function executePhysical(options: { out: string; set: PhysicalSet; plan: PhysicalPlan; root: string; budget: () => EvaluationBudget; env: () => Readonly<Record<string, string | undefined>>; preflight: () => Promise<PhysicalState[]>; fetch?: typeof fetch; creditFetch?: typeof fetch; fixed?: ComparisonManifest | null; now?: () => number; wait?: (ms: number) => Promise<void>; journal?: EvaluationJournal }) {
  const { out, set, plan } = options, models = physicalModels(plan.settings.models);
  const preparationRun = await assertPhysicalOwnership(out, set, plan, options.root, true);
  if (set.missing.length || set.photos.some(p => p.status !== "ready")) throw Error("incomplete-physical-set-no-dispatch");
  if (set.proofClass !== "physical-input") throw Error("fake-set-cannot-run-paid");
  const fixedManifest = options.fixed ?? null;
  if (!!plan.fixed !== !!fixedManifest || (fixedManifest && hashValue(fixedManifest) !== plan.fixed!.manifest)) throw Error("fixed-set-changed");
  // The public preflight, the estimate and the credit read come first: a refusal here leaves the prepared folder usable.
  const live = await options.preflight();
  const liveState = (model: ComparisonModel) => live.find(s => s.evidence.model === model.model) ?? (() => { throw Error("endpoint-policy-changed"); })();
  for (const approved of plan.evidences) if (hashValue(endpointPolicy(liveState(models.find(m => m.model === approved.model) ?? (() => { throw Error("endpoint-policy-changed"); })()).evidence)) !== hashValue(endpointPolicy(approved))) throw Error("endpoint-policy-changed");
  const estimate = physicalEstimate(set.photos.length, live, plan.settings.maxMicros, fixedManifest?.photos.length ?? 0);
  if (estimate.overStop) { for (const line of physicalEstimateLines(estimate)) console.log(line); throw Error("estimate-over-run-stop"); }
  const env = options.env();
  const credit = await physicalCreditPreflight(env.SCAN_MARKING_OPENROUTER_API_KEY?.trim() ?? "", estimate, options.creditFetch ?? fetch);
  for (const line of physicalEstimateLines(estimate, credit.remainingMicros)) console.log(line);
  await durableJson(resolve(out, "credit-preflight.json"), credit);
  if (!credit.enough) throw Error(`credit-preflight:${credit.reason}`);
  // A missing ledger credential and a refused price check stop here too, so neither uses up the folder.
  const budget = options.budget();
  for (const model of models) {
    const state = liveState(model), refreshed = await budget.refresh({ approved: plan.evidences.find(e => e.model === model.model)!, current: state.evidence, maximumMicros: state.maximumMicros });
    if ("refused" in refreshed) throw Error(`price-refresh:${refreshed.refused}`);
  }
  // Exclusive irreversible execution marker precedes every ledger and provider request. An exit never grants a retry.
  await durableJson(resolve(out, "execution.json"), { run: preparationRun, owner: plan.owner, state: "started" }, true);
  await mkdir(resolve(out, "journal"), { mode: 0o700 });
  // A second immutable plan binds fresh endpoint evidence, including a changed verified price.
  const dispatchPlan = { ...plan, evidences: models.map(m => liveState(m).evidence) }, run = hashValue(dispatchPlan);
  const dispatchSeal = { preparationRun, run, plan: dispatchPlan, maximums: Object.fromEntries(models.map(m => [m.model, liveState(m).maximumMicros])) };
  await durableJson(resolve(out, "dispatch-plan.json"), dispatchSeal, true);
  let fatal = false, unsafeTransport = false;
  const file = options.journal ?? fileJournal(resolve(out, "journal"));
  const protect = async <T>(action: () => Promise<T>) => { try { return await action(); } catch (e) { fatal = true; throw e; } };
  const journal: EvaluationJournal = { begin: key => protect(() => file.begin(key)), save: (key, value) => protect(async () => {
    const record = value as { state?: string; attempt?: ComparisonResult["attempts"][number] };
    if (record.state === "response" && record.attempt) {
      const a = record.attempt;
      const served = models.find(m => m.model === a.usage.model);
      unsafeTransport = !deferredAttempt(a) && (!served || a.usage.provider !== served.providerName || !a.usage.generationId || [a.usage.costMicros, a.usage.inputTokens, a.usage.outputTokens, a.usage.reasoningTokens].some(v => v === null));
    }
    await file.save(key, value);
  }) };
  const guardedBudget: EvaluationBudget = { ...budget,
    reserve: i => { if (fatal) throw Error("fatal-journal-no-reservation"); return protect(async () => {
      const result = await budget.reserve(i);
      if ("id" in result) accounting.set(result.id, { id: result.id, reservedMicros: i.maximumMicros, settledMicros: null });
      return result;
    }); },
    settle: (id, cost) => { if (fatal || unsafeTransport) { fatal = true; throw Error("fatal-journal-or-unknown-transport-preserve-hold"); } return protect(async () => {
      await budget.settle(id, cost); accounting.get(id)!.settledMicros = cost;
    }); },
    defer: i => { if (fatal || !budget.defer) throw Error("fatal-or-missing-deferral-ledger"); return protect(() => budget.defer!(i)); } };
  const results: ComparisonResult[] = [], fixedResults: ComparisonResult[] = [];
  const accounting = new Map<string, { id: string; reservedMicros: number; settledMicros: number | null }>();
  const save = async () => {
    const ledger = { run, attempts: [...accounting.values()] };
    await durableJson(resolve(out, "accounting.json"), ledger);
    await durableJson(resolve(out, "results.json"), results);
    const report = physicalReport(set, results, dispatchPlan.evidences, run);
    const unsettled = fatal || ledger.attempts.some(a => a.settledMicros === null);
    const final = { ...report, models: report.models.map(m => ({ ...m, costPerPageUsd: unsettled ? null : m.costPerPageUsd })) };
    await durableJson(resolve(out, "report.json"), { ...final, ledgerAccounting: ledger, heldMicros: ledger.attempts.filter(a => a.settledMicros === null).reduce((n, a) => n + a.reservedMicros, 0),
      settledMicros: ledger.attempts.reduce((n, a) => n + (a.settledMicros ?? 0), 0), spentOrHeldMicros: ledger.attempts.reduce((n, a) => n + (a.settledMicros ?? a.reservedMicros), 0), reconciliationRequired: fatal });
    await durableJson(resolve(out, "side-by-side.json"), { text: physicalSideBySide(final) });
    if (fixedManifest) {
      await durableJson(resolve(out, "fixed40-results.json"), fixedResults);
      await durableJson(resolve(out, "fixed40-report.json"), physicalFixedReport(fixedManifest, fixedResults, dispatchPlan.evidences, run));
    }
  };
  const dispatch = async ({ photo, model, fixed }: { photo: ComparisonPhoto; model: ComparisonModel; fixed: boolean }, batch: 0 | 1, prior?: ComparisonResult) => {
    if (fatal) throw Error("fatal-run-no-dispatch");
    await assertPhysicalOwnership(out, set, plan, options.root);
    if (hashValue(await json(resolve(out, "dispatch-plan.json"))) !== hashValue(dispatchSeal)) throw Error("dispatch-plan-changed-no-dispatch");
    unsafeTransport = false;
    const state = liveState(model);
    const result = await runComparisonPhoto({ run, photo, image: await regularBytes(fixed ? resolve(out, "fixed40", photo.image.path) : resolve(out, photo.image.path)), model, evidence: state.evidence, maximumMicros: state.maximumMicros, maxRunMicros: plan.settings.maxMicros,
      budget: guardedBudget, journal, env, fetch: options.fetch, maxAttempts: 1, batch, prior, now: options.now });
    const list = fixed ? fixedResults : results, index = list.findIndex(r => r.photo === photo.id && r.model === model.model);
    if (index >= 0) list[index] = result; else list.push(result);
    await save();
    if (fatal || ["journal-failure", "reservation-or-settlement-failed", "existing-attempt-no-redispatch"].includes(result.failure ?? "")) {
      await durableJson(resolve(out, "fatal.json"), { run, state: "reconciliation-required", reason: result.failure, holdsMustNotBeReleased: true, attempts: result.attempts.map(a => ({ id: a.id, reservedMicros: a.reservedMicros })) }, true);
      throw Error("fatal-journal-or-ledger-stop");
    }
    assertComparisonResume([], results); // Unknowns stop before the next photo.
    if (!result.attempts.length) throw Error("admission-refused-stop");
    return result;
  };
  try {
    // Serial: one photo and one model at a time. The same photo goes to both models before the next photo.
    const pairs = [...set.photos.map(entry => ({ photo: entry.photo, fixed: false })), ...(fixedManifest?.photos ?? []).map(photo => ({ photo, fixed: true }))]
      .flatMap(p => models.map(model => ({ ...p, model })));
    for (const pair of pairs) { const result = await dispatch(pair, 0); if (result.status === "deferred") break; }
    const deferred = [...results, ...fixedResults].find(r => r.status === "deferred");
    if (deferred) {
      const now = options.now ?? Date.now, retryAt = deferred.attempts.at(-1)!.deferral!.retryAt;
      while (now() < retryAt) { await durableJson(resolve(out, "waiting.json"), { run, retryAt, retainedReservation: deferred.attempts.at(-1)!.reservedMicros }); await (options.wait ?? (ms => new Promise(r => setTimeout(r, ms))))(Math.min(30_000, retryAt - now())); }
      for (const pair of pairs) {
        const prior = (pair.fixed ? fixedResults : results).find(r => r.photo === pair.photo.id && r.model === pair.model.model); if (prior && prior.status !== "deferred") continue;
        // A delayed retry belongs only to the deferred pair. Undispatched pairs get their initial attempt.
        const result = await dispatch(pair, prior ? 1 : 0, prior);
        if (result.status === "deferred") break; // No second delay or third request.
      }
    }
    await durableJson(resolve(out, "exit.json"), { run, state: "finished" }, true);
  } catch (error) {
    fatal = true;
    if (!(await readdir(out)).includes("fatal.json")) await durableJson(resolve(out, "fatal.json"), { run, state: "reconciliation-required", holdsMustNotBeReleased: true, attempts: [...accounting.values()] }, true);
    throw error;
  } finally { await save(); }
  return results;
}

export async function replayPhysical(input: string, output: string, root: string) {
  const folder = await directory(input), set = await json<PhysicalSet>(resolve(folder, "set.json")), plan = await json<PhysicalPlan>(resolve(folder, "plan.json"));
  const preparationRun = await assertPhysicalOwnership(folder, set, plan, root);
  let run = preparationRun, evidences = plan.evidences;
  if ((await readdir(folder)).includes("dispatch-plan.json")) {
    const dispatch = await json<{ preparationRun: string; run: string; plan: PhysicalPlan }>(resolve(folder, "dispatch-plan.json"));
    if (dispatch.preparationRun !== preparationRun || dispatch.run !== hashValue(dispatch.plan) || hashValue({ ...dispatch.plan, evidences: plan.evidences }) !== hashValue(plan) || hashValue(dispatch.plan.evidences.map(endpointPolicy)) !== hashValue(plan.evidences.map(endpointPolicy))) throw Error("dispatch-plan-identity");
    run = dispatch.run; evidences = dispatch.plan.evidences;
  }
  const results = await json<ComparisonResult[]>(resolve(folder, "results.json"));
  const fixed = plan.fixed ? await json<ComparisonManifest>(resolve(folder, "fixed40/manifest.json")) : null;
  const fixedResults = fixed ? await json<ComparisonResult[]>(resolve(folder, "fixed40-results.json")) : [];
  const records: AttemptRecord[] = [];
  for (const file of await readdir(resolve(folder, "journal"))) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) throw Error("orphan-journal-file");
    const record = await json<AttemptRecord>(resolve(folder, "journal", file));
    if (record.key !== file.slice(0, -5) || record.run !== run) throw Error("orphan-journal-ownership");
    records.push(record);
  }
  assertComparisonResume(records, [...results, ...fixedResults]);
  // A model id alone names its first pinned pair, so the run's own pairs are passed.
  const pairs = physicalModels(plan.settings.models);
  assertComparisonResultIdentity(physicalScoringInput(set), results, evidences, run, pairs);
  if (fixed) assertComparisonResultIdentity(fixed, fixedResults, evidences, run, pairs);
  let rescored = 0;
  const interpret = (list: readonly ComparisonResult[], photoOf: (id: string) => ComparisonPhoto) => list.map(result => {
    const photo = photoOf(result.photo);
    const terminal = records.filter(r => r.result?.photo === result.photo && r.result?.run === run && hashValue(r.result) === hashValue(result));
    if (terminal.length !== 1) throw Error("saved-result-without-owned-terminal-journal");
    const last = result.attempts.at(-1)!;
    if (deferredAttempt(last)) return result;
    if (!last.response || hashValue(transportUsage(last.response.envelope)) !== hashValue(last.usage) || last.response.body === null || hashValue(JSON.parse(last.response.body)) !== hashValue(last.response.envelope)) throw Error("saved-http-envelope-mismatch");
    const envelope = last.response.envelope as { choices?: { message?: { content?: string } }[] };
    let output: unknown = null; try { output = JSON.parse(envelope.choices?.[0]?.message?.content ?? ""); } catch { /* Report invalid JSON as an observation failure. */ }
    // The prompt and schema are frozen, so a schema answer cannot change. The method rules can: replay scores the saved
    // model output through the current rules, so a rule-only change is scored again with no new call.
    const schemaValid = validMarkingOutput(photo.frame, output), observations = schemaValid ? readMarkingOutput(photo.frame, output) : [];
    if (schemaValid !== result.schemaValid) throw Error("saved-schema-validity-changed");
    rescored += observations.filter(o => { const saved = result.observations.find(s => s.identity.itemId === o.identity.itemId); return !saved || saved.result !== o.result || saved.state !== o.state; }).length;
    return { ...result, schemaValid, observations };
  });
  const interpreted = interpret(results, id => set.photos.find(p => p.photo.id === id)!.photo), robinRescored = rescored;
  const fixedInterpreted = fixed ? interpret(fixedResults, id => fixed.photos.find(p => p.id === id)!) : [], fixedRescored = rescored - robinRescored;
  const out = await newOutput(output);
  const report = { ...physicalReport(set, interpreted, evidences, run, true), rescoredItems: robinRescored };
  await durableJson(resolve(out, "report.json"), report, true);
  console.log(physicalSideBySide(report));
  if (fixed) {
    const fixedReport = { ...physicalFixedReport(fixed, fixedInterpreted, evidences, run, "saved-reader-replay"), rescoredItems: fixedRescored };
    await durableJson(resolve(out, "fixed40-report.json"), fixedReport, true);
    console.log(physicalFixedSideBySide(fixedReport));
  }
  return out;
}

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
    if (!process.env.SCAN_MARKING_OPENROUTER_API_KEY?.trim()) throw Error("dedicated-marking-key-required-no-fallback");
    return { SCAN_MARKING_OPENROUTER_API_KEY: process.env.SCAN_MARKING_OPENROUTER_API_KEY };
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
/** Real production transport and journal, with a local synthetic HTTP response and an in-memory ledger. Both models, no network. */
export async function fakePhysicalHttp(out: string, set: PhysicalSet, plan: PhysicalPlan, run: string, shape: (photo: ComparisonPhoto, model: ComparisonModel) => unknown = photo => labelledOutput(photo), fixed: ComparisonManifest | null = null) {
  if (set.proofClass !== "local-fake") throw Error("explicit-fake-set-required");
  await mkdir(resolve(out, "journal"), { mode: 0o700 });
  const results: ComparisonResult[] = [], held = new Map<string, number | null>(); let next = 0;
  const budget: EvaluationBudget = { refresh: async () => ({ verified: true }), reserve: async () => { const id = `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`; held.set(id, null); return { id }; }, settle: async (id, cost) => { held.set(id, cost); } };
  const fixedResults: ComparisonResult[] = [];
  const queue = [...set.photos.filter(p => p.status === "ready").map(p => ({ photo: p.photo, path: resolve(out, p.photo.image.path), list: results })),
    ...(fixed?.photos ?? []).map(photo => ({ photo, path: resolve(out, "fixed40", photo.image.path), list: fixedResults }))];
  for (const p of queue) for (const model of physicalModels(plan.settings.models)) {
    p.list.push(await runComparisonPhoto({ run, photo: p.photo, image: await regularBytes(p.path), model, evidence: plan.evidences.find(e => e.model === model.model)!, maximumMicros: 1, maxRunMicros: plan.settings.maxMicros, budget, journal: fileJournal(resolve(out, "journal")), env: { SCAN_MARKING_OPENROUTER_API_KEY: "local-fake-no-credential" }, maxAttempts: 1,
      fetch: async () => Response.json({ id: `gen-local-fake-${next}`, provider: model.providerName, model: model.model, usage: { cost: 0, prompt_tokens: 1, completion_tokens: 1, completion_tokens_details: { reasoning_tokens: 0 } }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(shape(p.photo, model)) } }] }) }));
  }
  await durableJson(resolve(out, "results.json"), results, true);
  await durableJson(resolve(out, "report.json"), physicalReport(set, results, plan.evidences, run));
  if (fixed) {
    await durableJson(resolve(out, "fixed40-results.json"), fixedResults, true);
    await durableJson(resolve(out, "fixed40-report.json"), physicalFixedReport(fixed, fixedResults, plan.evidences, run, "local-fake"));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) physicalMain().catch(e => { console.error(`Physical evaluation stopped: ${e instanceof Error ? e.message : "unknown failure"}`); process.exitCode = 1; });
