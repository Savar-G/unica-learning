// File, preflight, and ledger I/O helpers shared by the scan-marking comparison and physical evaluation CLIs.
import { open, readFile, rename } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import sharp from "sharp";
import type { WorkbookInput } from "@/lib/workbook-content";
import { SYNTHETIC_IDS, assessComparisonEndpoint, comparisonManifestFromBytes, deferredAttempt, hashBytes, hashValue, selectComparisonModels, syntheticPrintRevision, validateComparisonManifest, type ComparisonManifest, type ComparisonPhoto, type ComparisonPreflight, type Endpoint, type EndpointSnapshot } from "@/lib/scan-marking-comparison";
import type { EvaluationBudget, EvaluationJournal } from "@/lib/scan-marking-comparison-run";

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
      try { await durableJson(resolve(folder, `${key}.json`), { state: "starting", key }, true); return true; }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return false; throw e; }
    },
    save: (key, value) => durableJson(resolve(folder, `${key}.json`), value),
  };
}
export async function loadComparisonAssets(manifestPath: string) {
  const manifest = comparisonManifestFromBytes(await readFile(manifestPath));
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
    if (!page?.printContract || p.frame.printedRevision !== revision || hashValue(p.frame.questions) !== hashValue(questions) || page.image?.width !== p.image.width || page.image?.height !== p.image.height) throw new Error("frame-does-not-match-frozen-synthetic-render");
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
    defer: async ({ run, key, attempt }) => {
      if (!deferredAttempt(attempt) || attempt.deferral!.run !== run || attempt.deferral!.key !== key) throw new Error("invalid-deferral-evidence");
      if (await rpc("defer_scan_marking_evaluation", { p_run: run, p_attempt: key, p_id: attempt.id, p_response: attempt.response, p_received_at: attempt.deferral!.receivedAt }) !== true) throw new Error("ledger-deferral-refused");
    },
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
export const readyEvidence = (states: readonly ComparisonPreflight[]) => states.flatMap(s => s.status === "ready" ? [s.evidence] : []);
