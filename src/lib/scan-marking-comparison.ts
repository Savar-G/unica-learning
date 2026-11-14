// Synthetic evaluation only. Production marking, reading and scoring remain the authority.
import { createHash } from "node:crypto";
import models from "../../data/scan-marking-models.json";
import evaluationModels from "../../data/scan-marking-evaluation-models.json";
import type { OpenRouterProvider } from "@/lib/ai-openrouter";
import { markingRequest, MARKING_MAX_TOKENS, MARKING_PROMPT_VERSION, readMarkingOutput, TWO_WAYS_METHOD_MARKS, type MarkingFrame } from "@/lib/scan-marking";
import { expectedItems, READING_ISSUES, type ExpectedItem, type Observation, type ReadingIssue } from "@/lib/scan-observation";
import { markingRegions } from "@/lib/scan-marking-regions";
import type { MethodJudgment } from "@/lib/scan-marking-methods";
import { isPrintedRevision } from "@/lib/workbook-print-contract";
import { canonical, digestOf } from "@/lib/workbook-digest";
import type { WorkbookInput } from "@/lib/workbook-content";

export const COMPARISON_MODELS = Object.freeze(models.map(m => Object.freeze({ ...m })));
/** Evaluation additions require explicit selection. The historical default remains unchanged. */
export const COMPARISON_ALLOWED_MODELS = Object.freeze([...COMPARISON_MODELS, ...evaluationModels.map(m => Object.freeze({ ...m }))]);
export type ComparisonModel = (typeof COMPARISON_MODELS)[number];
/** Select only already-pinned pairs, in canonical order. Selection is part of the immutable run plan. */
export function selectComparisonModels(ids: readonly string[] | null): readonly ComparisonModel[] {
  if (ids === null) return COMPARISON_MODELS;
  const selectable = COMPARISON_ALLOWED_MODELS;
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !selectable.some(m => m.model === id))) throw new Error("invalid-comparison-model-selection");
  return selectable.filter(m => ids.includes(m.model));
}
export const SYNTHETIC_IDS = Object.freeze({ parent: "00000000-0000-4000-8000-000000000543", child: "00000000-0000-4000-8000-000000000542", workbook: "5ca70000-0000-4000-8000-000000000542" });
export const COMPARISON_FORMATS = ["whole", "fraction", "decimal", "tick-and-number", "circle", "show-work", "spot-the-error", "write-words", "two-ways"] as const;
export type ComparisonFormat = typeof COMPARISON_FORMATS[number];
export const hashBytes = (v: Uint8Array | string) => createHash("sha256").update(v).digest("hex");
export const hashValue = (v: unknown) => hashBytes(JSON.stringify(v));
const hash = (v: string) => /^[a-f0-9]{64}$/.test(v);
const fail = (s: string): never => { throw new Error(s); };

export interface Endpoint {
  model_id: string; provider_name: string; tag: string; service_tier?: string | null;
  status?: number; quantization: string; supported_parameters: string[];
  context_length: number; max_completion_tokens: number; max_prompt_tokens?: number | null;
  pricing: Record<string, unknown>; safety_retention?: boolean;
}
export interface EndpointSnapshot {
  data: { id: string; architecture: { input_modalities: string[] }; endpoints: Endpoint[] };
}
export interface EndpointEvidence {
  model: string; endpoint: Endpoint; zdrListed: boolean; safetyRetention: boolean | null;
  excludedEndpoints: string[];
  policy: "strict-zdr" | "safety-retention" | "not-zdr" | "unverified-retention";
  source: string; snapshotHash: string; zdrHash: string;
}
export type ComparisonPreflight = { model: string; status: "ready"; evidence: EndpointEvidence; maximumMicros: number } | { model: string; status: "blocked"; reason: string };
/** These fields define the reviewed route and policy. Price and public telemetry may change. */
export const endpointPolicy = (e: EndpointEvidence) => ({ model: e.model, provider: e.endpoint.provider_name, tag: e.endpoint.tag, quantization: e.endpoint.quantization,
  excludedEndpoints: e.excludedEndpoints, supported: [...e.endpoint.supported_parameters].sort(), maxPrompt: e.endpoint.max_prompt_tokens ?? null,
  maxCompletion: e.endpoint.max_completion_tokens, context: e.endpoint.context_length, zdrListed: e.zdrListed, safetyRetention: e.safetyRetention, policy: e.policy });
export function assessComparisonEndpoint(model: ComparisonModel, snapshot: EndpointSnapshot, zdr: { data: Endpoint[] }, approved?: EndpointEvidence): ComparisonPreflight {
  try {
    const evidence = preflightEndpoint(model, snapshot, zdr);
    if (approved && hashValue(endpointPolicy(evidence)) !== hashValue(endpointPolicy(approved))) fail("pinned-endpoint-policy-or-capability-changed");
    const maximumMicros = reserveMaximum(evidence);
    if (!Number.isSafeInteger(maximumMicros) || maximumMicros < 1 || maximumMicros > 15_000_000) fail("reservation-over-run-cap");
    return { model: model.model, status: "ready", evidence, maximumMicros };
  } catch (error) { return { model: model.model, status: "blocked", reason: error instanceof Error ? error.message : "preflight-failed" }; }
}
/** Compare exact API identities. A display name such as Google Vertex is not the API identity. */
export function preflightEndpoint(model: ComparisonModel, snapshot: EndpointSnapshot, zdr: { data: Endpoint[] }): EndpointEvidence {
  if (snapshot.data.id !== model.model || !snapshot.data.architecture.input_modalities.includes("image")) fail("catalog-image-or-model");
  const matches = snapshot.data.endpoints.filter(e => e.model_id === model.model && e.provider_name === model.providerName && e.tag === model.endpoint);
  if (matches.length !== 1) fail("pinned-endpoint-missing-or-duplicate");
  const endpoint = matches[0];
  if (endpoint.status !== 0 || (endpoint.service_tier != null && endpoint.service_tier !== "standard") || /\/(flex|priority)(\/|$)/.test(endpoint.tag)) fail("pinned-endpoint-unavailable");
  if (!["response_format", "structured_outputs"].every(p => endpoint.supported_parameters.includes(p)) || endpoint.max_completion_tokens < MARKING_MAX_TOKENS) fail("pinned-endpoint-schema-or-settings");
  const listed = zdr.data.filter(e => e.model_id === model.model && e.provider_name === model.providerName && e.tag === model.endpoint);
  if (listed.length > 1) fail("duplicate-zdr-evidence");
  const safetyRetention = listed.length ? listed[0].safety_retention ?? null : null;
  return { model: model.model, endpoint, excludedEndpoints: snapshot.data.endpoints.filter(e => e.tag.startsWith(`${model.endpoint}/`)).map(e => e.tag).sort(), zdrListed: listed.length === 1, safetyRetention,
    policy: !listed.length ? "not-zdr" : safetyRetention === true ? "safety-retention" : safetyRetention === false ? "strict-zdr" : "unverified-retention",
    source: `https://openrouter.ai/api/v1/models/${model.model}/endpoints`, snapshotHash: hashValue(snapshot), zdrHash: hashValue(zdr) };
}
export function comparisonProvider(model: ComparisonModel, evidence: EndpointEvidence): OpenRouterProvider {
  if (evidence.model !== model.model || evidence.endpoint.tag !== model.endpoint || evidence.endpoint.provider_name !== model.providerName) fail("route-evidence-mismatch");
  return { only: [model.endpoint], order: [model.endpoint], allow_fallbacks: false, require_parameters: true,
    ignore: evidence.excludedEndpoints,
    ...(evidence.zdrListed ? { zdr: true as const } : {}) };
}

export interface LabelledReading { regionId: string; state: "written" | "blank" | "uncertain"; text: string | null; issue: ReadingIssue | null; verdict?: MethodJudgment | null }
export interface TruthRow { itemId: string; format: ComparisonFormat; result: "right" | "wrong" | "blank" | "uncertain"; readings: LabelledReading[] }
export interface ComparisonPhoto {
  id: string; clear: boolean; image: { path: string; sha256: string; width: number; height: number; metadataFree: true };
  frame: MarkingFrame; truth: TruthRow[];
}
export interface ComparisonManifest {
  version: 1; synthetic: true;
  identity: { name: "Robin"; madeUp: true; containsRealData: false; profileSource: "sampleChild/samplePlanInput" };
  source: { synthetic: true; draftSha256: string; renderSha256: string; fixtureSha256: string };
  photos: ComparisonPhoto[];
}
/** A selected-page test booklet is never approved or registered as a production workbook. Freeze its measured source. */
export function syntheticPrintRevision(rendered: WorkbookInput): string {
  if (rendered.id !== SYNTHETIC_IDS.workbook || rendered.childId !== SYNTHETIC_IDS.child || !rendered.pdfSha256 || !hash(rendered.pdfSha256) || rendered.pages.some(p => !p.printContract)) fail("measured-synthetic-book-required");
  return digestOf(canonical({ syntheticOnly: true, rendered }));
}
export function comparisonItemFormat(frame: MarkingFrame, itemId: string): ComparisonFormat {
  const q = frame.questions.find(q => q.package?.id === itemId)!;
  const format = q.package?.item?.format;
  const rs = markingRegions(q);
  if (!rs.length) fail("unsupported-or-unmeasured-format");
  if (format === "write-number") {
    if (rs.some(r => r.kind === "fraction")) return "fraction";
    if (rs.some(r => r.kind === "number" && !Number.isInteger(r.answer))) return "decimal";
    return "whole";
  }
  if (!COMPARISON_FORMATS.includes(format as ComparisonFormat)) fail("unsupported-format");
  return format as ComparisonFormat;
}
/** Build labels for fixture review. The request never receives this data. */
export function labelledOutput(photo: ComparisonPhoto) {
  const items = expectedItems(photo.frame);
  return { readings: items.flatMap((e, n) => photo.truth.find(t => t.itemId === e.identity.itemId)!.readings.map((r, k) => ({
    item: `i${n + 1}`, region: `r${n + 1}${k === 0 ? "" : `-${k + 1}`}`, state: r.state, text: r.text, issue: r.issue, verdict: r.verdict ?? null, reason: null,
  }))) };
}
/** The saved v7 comparison set. Its photos leave every two-ways item empty, because v7 drew nothing for a parent-only item. */
export const FIXED40_V7_MANIFEST_SHA256 = "c206c70d6ea3b8cb8efcd59691bf90289227c0c3e8955b0ccd9a93bf39627497";
/**
 * The same photos, frames and truth for prompt v8. Only the old parent rows change: they become blank AI-marked rows,
 * which is what those photos show. Code writes no other truth.
 */
export function upgradeFixed40Manifest(saved: ComparisonManifest): ComparisonManifest {
  const manifest = JSON.parse(JSON.stringify(saved)) as ComparisonManifest;
  for (const photo of manifest.photos) for (const row of photo.truth as (Omit<TruthRow, "result"> & { result: string })[]) {
    if (row.format !== "two-ways") continue;
    if (row.result !== "parent" || row.readings.length) fail("fixed40-two-ways-row");
    const q = photo.frame.questions.find(q => q.package?.id === row.itemId);
    row.result = "blank";
    row.readings = markingRegions(q ?? { package: null, regions: null }).map(r => ({ regionId: r.id, state: "blank", text: "", issue: null, verdict: null }));
  }
  return manifest;
}
/** Images and source artifacts are hashed by the file adapter, before any network or credential access. */
export function validateComparisonManifest(manifest: ComparisonManifest): void {
  if (manifest.version !== 1 || manifest.synthetic !== true || manifest.identity?.name !== "Robin" || manifest.identity.madeUp !== true || manifest.identity.containsRealData !== false || manifest.identity.profileSource !== "sampleChild/samplePlanInput" || manifest.source?.synthetic !== true) fail("synthetic-provenance-required");
  if (![manifest.source.draftSha256, manifest.source.renderSha256, manifest.source.fixtureSha256].every(hash)) fail("source-hashes-required");
  if (!Array.isArray(manifest.photos) || manifest.photos.length !== 40) fail("exactly-40-photos-required");
  const ids = new Set<string>(), images = new Set<string>(), coverage = new Set<string>(), controls = new Set<string>();
  let clear = 0;
  for (const p of manifest.photos) {
    if (!/^synthetic-[a-z0-9-]+$/.test(p.id) || ids.has(p.id) || !hash(p.image.sha256) || images.has(p.image.sha256)) fail("duplicate-or-invalid-photo");
    ids.add(p.id); images.add(p.image.sha256);
    if (typeof p.clear !== "boolean" || p.image.metadataFree !== true || !p.image.path || !Number.isSafeInteger(p.image.width) || !Number.isSafeInteger(p.image.height) || p.image.width < 1 || p.image.height < 1 || p.image.width * p.image.height > 48_000_000) fail("image-contract");
    if (p.clear) clear++;
    const f = p.frame;
    if (!f.ready || f.photo !== p.id || f.parentId !== SYNTHETIC_IDS.parent || f.childId !== SYNTHETIC_IDS.child || f.workbookId !== SYNTHETIC_IDS.workbook || !/^synthetic-[a-z0-9-]+$/.test(f.pageId) || !isPrintedRevision(f.printedRevision) || !Number.isSafeInteger(f.pageNumber) || f.pageNumber < 1) fail("synthetic-frame-identity");
    const items = expectedItems(f), regionIds = new Set<string>();
    if (!items.length || items.length > 200 || items.length !== p.truth.length || new Set(items.map(e => e.identity.itemId)).size !== items.length || new Set(items.map(e => e.number)).size !== items.length || new Set(p.truth.map(t => t.itemId)).size !== p.truth.length) fail("fixed-truth-items");
    if (!items.some(e => e.method === "code")) fail("photo-needs-automated-item");
    for (const e of items) {
      const t = p.truth.find(t => t.itemId === e.identity.itemId);
      if (!t) throw new Error("truth-item-missing");
      if (t.format !== comparisonItemFormat(f, e.identity.itemId)) fail("truth-format-mismatch");
      coverage.add(t.format); controls.add(t.result);
      if (e.method !== "code" || !["right", "wrong", "blank", "uncertain"].includes(t.result)) fail("truth-result");
      const q = f.questions.find(q => q.package?.id === e.identity.itemId)!;
      const regions = markingRegions(q);
      if (t.readings.length !== regions.length) fail("truth-regions");
      for (let k = 0; k < regions.length; k++) {
        const r = t.readings[k], key = `${t.itemId}:${r.regionId}`;
        if (r.regionId !== regions[k].id || regionIds.has(key) || !["written", "blank", "uncertain"].includes(r.state) || (r.text !== null && (typeof r.text !== "string" || r.text.length > 200)) || (r.issue !== null && !READING_ISSUES.includes(r.issue)) || (r.state === "uncertain" && r.issue === null) || (r.state === "blank" && (r.text !== "" || r.issue !== null))) fail("invalid-labelled-reading");
        regionIds.add(key);
      }
    }
    const labelled = readMarkingOutput(f, labelledOutput(p));
    for (const t of p.truth) {
      const o = labelled.find(o => o.identity.itemId === t.itemId)!;
      // A word or method form code cannot check stays unsure. Ground truth may still be wrong.
      if (t.format === "two-ways" && !TWO_WAYS_METHOD_MARKS && o.result === null) continue; // Our team marks it until the method rules ship.
      if (o.result !== (t.result === "uncertain" ? null : t.result) && !((t.format === "write-words" || t.format === "two-ways") && t.result === "wrong" && o.result === null)) fail("truth-disagrees-with-labelled-reading");
    }
  }
  if (!clear || COMPARISON_FORMATS.some(f => !coverage.has(f)) || ["right", "wrong", "blank", "uncertain"].some(s => !controls.has(s))) fail("first-book-coverage-or-controls-missing");
}

export interface TransportUsage {
  generationId: string | null; provider: string | null; model: string | null;
  costMicros: number | null; inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; imageTokens: number | null;
}
const natural = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
const record = (v: unknown): Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {};
/** Only the HTTP envelope supplies usage. JSON inside message.content has no authority. */
export function transportUsage(value: unknown): TransportUsage {
  const data = record(value), usage = record(data.usage), details = record(usage.completion_tokens_details), inputs = record(usage.prompt_tokens_details);
  const cost = usage.cost;
  return { generationId: typeof data.id === "string" ? data.id : null, provider: typeof data.provider === "string" ? data.provider : null, model: typeof data.model === "string" ? data.model : null,
    costMicros: typeof cost === "number" && Number.isFinite(cost) && cost >= 0 && Number.isSafeInteger(Math.ceil(cost * 1e6)) ? Math.ceil(cost * 1e6) : null,
    inputTokens: natural(usage.prompt_tokens), outputTokens: natural(usage.completion_tokens), reasoningTokens: natural(details.reasoning_tokens), imageTokens: natural(inputs.image_tokens) };
}
/** Evaluation scheduling only. This is separate from the production prompt and schema. */
export const COMPARISON_DEFERRAL_POLICY = Object.freeze({ version: "clean429-v1", delayMs: 900_000, finalBatches: 1, globalConcurrency: 1, modelConcurrency: 1 });
export interface CapturedResponse { status: number; body: string | null; openrouter_metadata: unknown; envelope: unknown }
/** Whether a parsed answer holds generation or usage evidence at any depth, JSON inside a string included. */
export function showsGeneration(v: unknown): boolean {
  if (typeof v === "string") { try { return showsGeneration(JSON.parse(v)); } catch { return false; } }
  return v !== null && typeof v === "object" && Object.entries(v).some(([k, x]) => ["id", "generation_id", "generationId", "usage", "choices"].includes(k) || showsGeneration(x));
}
/** A transport error envelope, never a label or the model's answer, authorizes a hold. */
export function clean429(value: CapturedResponse | undefined): boolean {
  if (!value || value.status !== 429 || typeof value.body !== "string" || !value.body.length) return false;
  try {
    const data = record(JSON.parse(value.body)), error = record(data.error);
    return hashValue(data) === hashValue(value.envelope) && error.code === 429 && typeof error.message === "string" && error.message.length > 0
      && !showsGeneration(data) && hashValue(value.openrouter_metadata ?? null) === hashValue(data.openrouter_metadata ?? error.metadata ?? null);
  } catch { return false; }
}
export interface ComparisonAttempt {
  id: string; usage: TransportUsage; latencyMs: number; error: string | null;
  reservedMicros?: number;
  response?: CapturedResponse;
  deferral?: { policy: "clean429-v1"; receivedAt: number; retryAt: number; reservedMicros: number; batch: 0 | 1; key: string; run: string; model: string; photo: string };
}
export function deferredAttempt(a: ComparisonAttempt | undefined): boolean {
  const d = a?.deferral;
  return !!a && !!d && d.policy === COMPARISON_DEFERRAL_POLICY.version && clean429(a.response) && a.error === "http-429"
    && [a.usage.generationId, a.usage.costMicros, a.usage.inputTokens, a.usage.outputTokens, a.usage.reasoningTokens, a.usage.imageTokens].every(v => v === null) && natural(d.receivedAt) !== null && d.retryAt === d.receivedAt + COMPARISON_DEFERRAL_POLICY.delayMs
    && natural(d.reservedMicros) !== null && d.reservedMicros > 0 && d.reservedMicros <= 15_000_000 && a.reservedMicros === d.reservedMicros && [0, 1].includes(d.batch) && hash(d.key) && hash(d.run);
}
export interface ComparisonResult {
  run: string; model: string; photo: string; status: "complete" | "failed" | "deferred"; failure: string | null; attempts: ComparisonAttempt[];
  batch?: 0 | 1;
  observations: Observation[]; schemaValid: boolean; requestHash: string; photoHash: string; evidenceHash: string;
}
export interface AttemptRecord { state: string; attempt?: { id: string; usage: { costMicros: number | null } }; result?: ComparisonResult; run?: string; key?: string; response?: CapturedResponse }
/** Recover only terminal snapshots from this run. Partial transport/accounting writes remain a stop. */
export function recoverComparisonResults(records: readonly AttemptRecord[], results: readonly ComparisonResult[], manifest: ComparisonManifest, history: readonly EndpointEvidence[], run: string): ComparisonResult[] {
  const recovered = [...results];
  if (new Set(records.map(r => r.key)).size !== records.length) fail("duplicate-journal-key");
  assertComparisonResultIdentity(manifest, recovered, history, run);
  for (const record of records) {
    if (record.run !== run || !record.key || !hash(record.key)) fail("journal-run-identity-mismatch");
    if (!record.result) continue;
    const next = record.result;
    assertComparisonResultIdentity(manifest, [next], history, run);
    if (!next.attempts.some(a => a.id === record.attempt?.id)) fail("journal-result-attempt-mismatch");
    const old = recovered.find(r => r.model === next.model && r.photo === next.photo);
    if (!old) recovered.push(next);
    else {
      const subset = (a: ComparisonResult, b: ComparisonResult) => a.attempts.every(x => b.attempts.some(y => hashValue(x) === hashValue(y)));
      if (!subset(old, next) && !subset(next, old)) fail("journal-result-conflict");
      if (next.attempts.length > old.attempts.length) recovered.splice(recovered.indexOf(old), 1, next);
      else if (next.attempts.length === old.attempts.length && hashValue(old) !== hashValue(next)) fail("journal-result-conflict");
    }
  }
  if (recovered.some(r => r.attempts.some(a => !records.some(v => v.attempt?.id === a.id)))) fail("result-without-journal");
  assertComparisonResume(records, recovered);
  return recovered;
}
/** A subset run must not import a result from an excluded pair. */
export function assertSelectedComparisonResults(results: readonly ComparisonResult[], modelIds: readonly string[]): void {
  const selected = selectComparisonModels(modelIds);
  if (results.some(r => !selected.some(m => m.model === r.model))) fail("result-outside-comparison-selection");
}
/** An orphaned durable attempt blocks every model, not only a retry of its own photo. */
export function assertComparisonResume(records: readonly AttemptRecord[], results: readonly ComparisonResult[]): void {
  if (results.some(r => r.failure === "journal-failure" || r.failure === "reservation-or-settlement-failed" || r.attempts.some(a => a.error === "journal-failure" || a.error === "transport-or-journal-failure"))) fail("journal-or-budget-failure-stopped-run");
  const ids = results.flatMap(r => r.attempts.map(a => a.id)), saved = new Set(ids);
  if (ids.length !== saved.size) fail("duplicate-dispatch-in-results");
  if (results.some(r => r.attempts.some(a => !deferredAttempt(a) && [a.usage.costMicros, a.usage.inputTokens, a.usage.outputTokens, a.usage.reasoningTokens].some(v => natural(v) === null)))) fail("unknown-usage-stopped-run-no-blind-retry");
  for (const record of records) {
    if (record.state === "refused" && !record.attempt) continue; // No reservation or HTTP dispatch occurred.
    const result = results.find(r => r.attempts.some(a => a.id === record.attempt?.id));
    if (record.run && record.run !== result?.run) fail("journal-run-identity-mismatch");
    const attempt = result?.attempts.find(a => a.id === record.attempt?.id);
    if (record.run && attempt && (hashValue(record.attempt) !== hashValue(attempt) || hashValue(record.response) !== hashValue(attempt.response))) fail("journal-attempt-evidence-mismatch");
    if (record.state === "deferred" && attempt && deferredAttempt(attempt) && hashValue(record.attempt) === hashValue(attempt)
      && record.run === result!.run && record.key === attempt.deferral!.key && hashValue(record.response) === hashValue(attempt.response)) continue;
    if (record.state !== "settled" || !record.attempt || natural(record.attempt.usage.costMicros) === null || !saved.has(record.attempt.id)) fail("unresolved-attempt-stopped-resume");
  }
}
export function assertComparisonResultIdentity(manifest: ComparisonManifest, results: readonly ComparisonResult[], history: readonly EndpointEvidence[], run: string): void {
  if (!hash(run)) fail("invalid-comparison-run");
  const seen = new Set<string>();
  for (const result of results) {
    const photo = manifest.photos.find(p => p.id === result.photo), model = COMPARISON_ALLOWED_MODELS.find(m => m.model === result.model);
    const evidence = history.find(e => e.model === result.model && hashValue(e) === result.evidenceHash);
    const key = `${result.model}:${result.photo}`;
    if (result.run !== run || !photo || !model || !evidence || seen.has(key) || result.photoHash !== photo.image.sha256 || result.requestHash !== hashValue(markingRequest(photo.frame, new Uint8Array())) || evidence.endpoint.tag !== model.endpoint || evidence.endpoint.provider_name !== model.providerName
      || result.attempts.some(a => a.deferral && (!deferredAttempt(a) || a.deferral.run !== run || a.deferral.model !== result.model || a.deferral.photo !== result.photo
        || a.deferral.key !== hashValue({ run, model, photo: result.photo, attempt: a.deferral.batch === 1 ? 1 : result.attempts.indexOf(a) + 1, ...(a.deferral.batch === 1 ? { batch: 1 } : {}) })))) fail("resume-result-identity-mismatch");
    seen.add(key);
  }
}
/** Why an item goes to our team instead of the AI. */
export type TeamReason = "two-ways-method-marks-off" | "team-method" | "parent-method" | "unscored-method" | "unavailable-method";
const TEAM_REASON_TEXT: Record<TeamReason, string> = { "two-ways-method-marks-off": "two-ways method marking is off", "team-method": "its method is team", "parent-method": "its method is parent", "unscored-method": "its method is unscored", "unavailable-method": "its method is unavailable" };
/**
 * D-267 counts unsure only on the items the AI is meant to mark. An item our team marks by design is not model unsure:
 * one whose method is the team's, and a two-ways item while the method rules are off. That is a temporary state while a
 * format's AI marking is off, not a way around the bar: the switch is read from the marking itself, so once
 * TWO_WAYS_METHOD_MARKS is on every two-ways item is the AI's again, in the count and the total. It decides only from
 * the page's own question (its expected item), never from a truth row, so a label cannot move an item out of the bar.
 * An item with no expected item is the AI's, so a mismatch can never make the bar easier to pass. Wrong marks and
 * wrong marked right count every item.
 */
export function teamReason(e: ExpectedItem | undefined): TeamReason | null {
  if (e === undefined) return null;
  if (e.method !== "code") return `${e.method}-method`;
  return e.twoWays === true && !TWO_WAYS_METHOD_MARKS ? "two-ways-method-marks-off" : null;
}
export const teamMarked = (e: ExpectedItem | undefined) => teamReason(e) !== null;
export type TeamItems = { items: number; reasons: Partial<Record<TeamReason, number>> };
/** The items of a set that go to our team, by reason. Each gate report states this on its first line. */
export function teamItemsOf(photos: readonly ComparisonPhoto[]): TeamItems {
  const team: TeamItems = { items: 0, reasons: {} };
  for (const photo of photos) {
    const items = expectedItems(photo.frame);
    for (const t of photo.truth) {
      const reason = teamReason(items.find(e => e.identity.itemId === t.itemId));
      if (reason) { team.items++; team.reasons[reason] = (team.reasons[reason] ?? 0) + 1; }
    }
  }
  return team;
}
/** "3 items went to the team: two-ways method marking is off", or "0 items went to the team". */
export function teamLine(team: TeamItems): string {
  if (!team.items) return "0 items went to the team.";
  const reasons = (Object.entries(team.reasons) as [TeamReason, number][]).filter(([, n]) => n > 0);
  const why = reasons.map(([r, n]) => reasons.length > 1 ? `${TEAM_REASON_TEXT[r]} (${n})` : TEAM_REASON_TEXT[r]).join("; ");
  return `${team.items} item${team.items === 1 ? "" : "s"} went to the team: ${why}.`;
}
const percentile = (values: number[], p: number) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] : null;
export function scoreComparison(manifest: ComparisonManifest, model: ComparisonModel, results: readonly ComparisonResult[], evidence: EndpointEvidence, history: readonly EndpointEvidence[] = []) {
  let wrongMarks = 0, wrongAsRight = 0, unsure = 0, clearUnsure = 0, denominator = 0, wrongMarkDenominator = 0, clearDenominator = 0, parentMethods = 0;
  // The D-267 bar is clearUnsure / clearDenominator, on AI-markable items. The "with team" pair is reported beside it.
  let teamItems = 0, clearTeamItems = 0, clearUnsureWithTeam = 0, clearDenominatorWithTeam = 0;
  let failures = 0, schemaFailures = 0, schemaUnvalidated = 0, missingRuns = 0, invalidRuns = 0, missingCosts = 0, measuredMicros = 0, heldMicros = 0, missingHoldBounds = 0, deferredAttempts = 0, retries = 0, completedPhotos = 0;
  const failureReasons: Record<string, number> = {};
  const latencies: number[] = [], providers = new Set<string>();
  const acceptedHashes = [evidence, ...history].filter(e => e.model === model.model && hashValue(endpointPolicy(e)) === hashValue(endpointPolicy(evidence))).map(hashValue);
  for (const photo of manifest.photos) {
    const items = expectedItems(photo.frame), team = new Set(photo.truth.filter(t => teamMarked(items.find(e => e.identity.itemId === t.itemId))).map(t => t.itemId));
    parentMethods += items.filter(e => e.method === "parent").length;
    denominator += photo.truth.length; teamItems += team.size;
    if (photo.clear) { clearDenominatorWithTeam += photo.truth.length; clearDenominator += photo.truth.length - team.size; clearTeamItems += team.size; }
    const found = results.filter(r => r.model === model.model && r.photo === photo.id), result = found.length === 1 ? found[0] : null;
    const actual = result?.attempts.filter(a => !deferredAttempt(a)) ?? [];
    const usable = result?.status === "complete" && result.schemaValid && actual.length > 0 && actual.every(a => a.usage.provider === model.providerName && a.usage.model === model.model && a.usage.generationId !== null && a.usage.costMicros !== null && a.usage.inputTokens !== null && a.usage.outputTokens !== null && a.usage.reasoningTokens !== null) && result.photoHash === photo.image.sha256 && acceptedHashes.includes(result.evidenceHash) && result.requestHash === hashValue(markingRequest(photo.frame, new Uint8Array()));
    for (const attempt of result?.attempts ?? []) {
      if (deferredAttempt(attempt)) deferredAttempts++;
      if (attempt.usage.costMicros === null) {
        missingCosts++;
        if (attempt.reservedMicros === undefined) missingHoldBounds++; else heldMicros += attempt.reservedMicros;
      } else measuredMicros += attempt.usage.costMicros;
      if (attempt.usage.provider) providers.add(attempt.usage.provider);
    }
    retries += Math.max(0, (result?.attempts.length ?? 0) - 1);
    // Deferred and absent photos have no answer to score. Completeness remains a separate hard gate.
    if (!result || result.status === "deferred") { missingRuns++; continue; }
    if (actual.length > 0) completedPhotos++;
    if (!usable) failures++;
    if (!usable) invalidRuns++;
    if (!usable) { const reason = result?.failure ?? "missing-or-invalid-result"; failureReasons[reason] = (failureReasons[reason] ?? 0) + 1; }
    if (result && !result.schemaValid) schemaUnvalidated++;
    if (result?.failure === "schema-invalid" || result?.failure === "invalid-json") schemaFailures++;
    if (result?.attempts.length) latencies.push(result.attempts.reduce((n, a) => n + a.latencyMs, 0));
    for (const truth of photo.truth) {
      const observations = usable ? result!.observations.filter(o => o.identity.itemId === truth.itemId && o.identity.workbookId === photo.frame.workbookId && o.identity.printedRevision === photo.frame.printedRevision && o.identity.pageId === photo.frame.pageId) : [];
      const o = observations.length === 1 ? observations[0] : null;
      if (usable && (!o || !["right", "wrong", "blank", null].includes(o.result))) failures++;
      if (!o || o.result === null) { unsure++; if (photo.clear) { clearUnsureWithTeam++; if (!team.has(truth.itemId)) clearUnsure++; } }
      else { wrongMarkDenominator++; if (o.result !== truth.result) { wrongMarks++; if (truth.result === "wrong" && o.result === "right") wrongAsRight++; } }
      if (truth.result === "uncertain" && o?.result != null) failures++;
      if (o?.result === null && (!o.issue || !READING_ISSUES.includes(o.issue))) failures++;
    }
  }
  const complete = completedPhotos === manifest.photos.length && results.filter(r => r.model === model.model).length === manifest.photos.length;
  const passed = complete && failures === 0 && wrongMarkDenominator > 0 && clearDenominator > 0 && wrongMarks * 100 <= wrongMarkDenominator && wrongAsRight === 0 && clearUnsure * 20 <= clearDenominator && missingCosts === 0 && providers.size === 1 && providers.has(model.providerName);
  return { model: model.model, host: model.host, endpoint: model.endpoint, policy: evidence.policy, passed, complete, wrongMarks, wrongMarkDenominator, denominator, aiMarked: denominator - parentMethods, wrongAsRight, unsure, clearUnsure, clearDenominator, teamItems, clearTeamItems, clearUnsureWithTeam, clearDenominatorWithTeam, parentMethods, failures, missingRuns, invalidRuns, schemaFailures, schemaUnvalidated, refusals: failureReasons.refusal ?? 0, failureReasons, missingCosts,
    measuredMicros, heldMicros, missingHoldBounds, deferredAttempts, spentOrHeldMicros: missingHoldBounds ? null : measuredMicros + heldMicros, costPerPageUsd: missingCosts || !complete ? null : measuredMicros / manifest.photos.length / 1e6,
    latencyP50Ms: percentile(latencies, 0.5), latencyP95Ms: percentile(latencies, 0.95), retries, providers: [...providers] };
}
export function cheapestPassing<T extends { model: string; complete: boolean; passed: boolean; costPerPageUsd: number | null }>(reports: T[]) {
  if (reports.some(r => !COMPARISON_ALLOWED_MODELS.some(m => m.model === r.model) || reports.filter(other => other.model === r.model).length !== 1)) return null;
  return [...reports].filter(r => r.complete && r.passed && r.costPerPageUsd !== null).sort((a, b) => a.costPerPageUsd! - b.costPerPageUsd! || a.model.localeCompare(b.model))[0] ?? null;
}
export function comparisonReports(manifest: ComparisonManifest, states: readonly ComparisonPreflight[], results: readonly ComparisonResult[], history: readonly EndpointEvidence[], blocks: ReadonlyMap<string, string>) {
  return COMPARISON_ALLOWED_MODELS.filter(model => COMPARISON_MODELS.some(m => m.model === model.model)
    || states.some(s => s.model === model.model) || results.some(r => r.model === model.model) || blocks.has(model.model)).map(model => {
    const state = states.find(s => s.model === model.model), reason = blocks.get(model.model) ?? (state?.status === "blocked" ? state.reason : null);
    const testedPhotos = results.filter(r => r.model === model.model && r.status !== "deferred" && r.attempts.some(a => !deferredAttempt(a))).length;
    if (reason || state?.status !== "ready") {
      const attempts = results.filter(r => r.model === model.model).flatMap(r => r.attempts), missingCosts = attempts.filter(a => a.usage.costMicros === null).length;
      const measuredMicros = attempts.reduce((sum, a) => sum + (a.usage.costMicros ?? 0), 0), heldMicros = attempts.reduce((sum, a) => sum + (a.usage.costMicros === null ? a.reservedMicros ?? 0 : 0), 0);
      const missingHoldBounds = attempts.filter(a => a.usage.costMicros === null && a.reservedMicros === undefined).length;
      const retainedEvidence = state?.status === "ready" ? state.evidence : history.find(e => e.model === model.model && e.endpoint.tag === model.endpoint && e.endpoint.provider_name === model.providerName
        && results.some(r => r.model === model.model && r.evidenceHash === hashValue(e)));
      return { ...(retainedEvidence && testedPhotos > 0 ? scoreComparison(manifest, model, results, retainedEvidence, history) : {}), model: model.model, host: model.host, endpoint: model.endpoint, status: "blocked", reason: reason ?? "missing-evidence", testedPhotos, complete: false, passed: false, costPerPageUsd: null,
        measuredMicros: attempts.length ? measuredMicros : null, heldMicros, missingHoldBounds, spentOrHeldMicros: missingHoldBounds ? null : measuredMicros + heldMicros, missingCosts };
    }
    return { ...scoreComparison(manifest, model, results, state.evidence, history), status: testedPhotos === 40 ? "tested" : "incomplete", testedPhotos };
  });
}

/** Use the highest published tier. Discounts and caching cannot reduce a reservation. */
export function tokenPrices(evidence: EndpointEvidence) {
  const prices = [evidence.endpoint.pricing, ...(Array.isArray(evidence.endpoint.pricing.overrides) ? evidence.endpoint.pricing.overrides.map(record) : [])];
  const maximum = (field: string) => {
    if (prices.some(p => field in p && (p[field] === null || p[field] === ""))) fail("unverified-price");
    const values = prices.map(p => Number(p[field] ?? 0));
    if (values.some(v => !Number.isFinite(v) || v < 0)) fail("unverified-price");
    return Math.max(...values);
  };
  const input = Math.max(maximum("prompt"), maximum("image"), maximum("input_cache_read"), maximum("input_cache_write"), maximum("input_cache_write_1h"));
  const output = Math.max(maximum("completion"), maximum("internal_reasoning"));
  if (!input || !output) fail("missing-token-price");
  return { input, output };
}
/** Context-sized bound covers the first image-inclusive request. SQL also requires a reviewed enabled bound. */
export function reserveMaximum(evidence: EndpointEvidence): number {
  const prices = tokenPrices(evidence), tokens = evidence.endpoint.max_prompt_tokens ?? evidence.endpoint.context_length;
  if (!Number.isSafeInteger(tokens) || tokens < 1) fail("missing-context-bound");
  return Math.ceil((tokens * prices.input + MARKING_MAX_TOKENS * prices.output) * 1e6);
}
export function projectMatrix(evidence: readonly EndpointEvidence[], first: ReadonlyMap<string, TransportUsage>, spentOrHeldMicros: number, remaining: ReadonlyMap<string, number>, maxAttempts: number): number | null {
  if (![1, 2].includes(maxAttempts)) fail("attempt-limit");
  let projected = spentOrHeldMicros;
  for (const e of evidence) {
    const u = first.get(e.model);
    if (!u || u.costMicros === null || u.inputTokens === null || u.outputTokens === null || u.reasoningTokens === null || u.generationId === null || u.provider !== e.endpoint.provider_name || u.model !== e.model) return null;
    const prices = tokenPrices(e);
    // prompt_tokens includes image input; image_tokens is retained separately when the provider supplies it.
    projected += (remaining.get(e.model) ?? 0) * maxAttempts * Math.ceil((u.inputTokens * prices.input + MARKING_MAX_TOKENS * prices.output) * 1e6);
  }
  return projected;
}
export const COMPARISON_SETTINGS = Object.freeze({ photos: 40, maxProjectedUsd: 15, promptVersion: MARKING_PROMPT_VERSION, maxOutputTokens: MARKING_MAX_TOKENS, effort: "low", syntheticOnly: true });
