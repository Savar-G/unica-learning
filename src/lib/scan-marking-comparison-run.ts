import { markingAiClient } from "@/lib/scan-marking-ai";
import { MARKING_MODEL, markingRequest, runScanMarking, validMarkingOutput, type MarkingStore } from "@/lib/scan-marking";
import { expectedItems, firstObservation, type Observation } from "@/lib/scan-observation";
import { COMPARISON_DEFERRAL_POLICY, COMPARISON_MODELS, SYNTHETIC_IDS, assertComparisonResultIdentity, assertComparisonResume, clean429, deferredAttempt, comparisonProvider, hashBytes, hashValue, projectMatrix, transportUsage, type CapturedResponse, type AttemptRecord, type ComparisonAttempt, type ComparisonManifest, type ComparisonModel, type ComparisonPhoto, type ComparisonPreflight, type ComparisonResult, type EndpointEvidence } from "@/lib/scan-marking-comparison";

export interface EvaluationBudget {
  refresh(input: { approved: EndpointEvidence; current: EndpointEvidence; maximumMicros: number }): Promise<{ verified: true } | { refused: string }>;
  reserve(input: { run: string; attempt: string; model: string; endpoint: string; evidence: string; pixels: number; maximumMicros: number; maxRunMicros: number }): Promise<{ id: string } | { refused: string }>;
  settle(id: string, costMicros: number | null): Promise<void>;
  defer?(input: { run: string; key: string; attempt: ComparisonAttempt }): Promise<void>;
}
/** One fixed matrix. Availability blocks are local; unresolved charged liability stops every model. */
export async function runComparisonMatrix(options: {
  run: string; manifest: ComparisonManifest; preflight: readonly ComparisonPreflight[]; history: readonly EndpointEvidence[];
  results: ComparisonResult[]; records: readonly AttemptRecord[]; maxRunMicros: number; maxAttempts: 1 | 2;
  dispatch(model: ComparisonModel, photo: ComparisonPhoto, evidence: EndpointEvidence, maximumMicros: number, batch: 0 | 1, prior?: ComparisonResult): Promise<ComparisonResult>;
  save(blocks: ReadonlyMap<string, string>, projection: unknown): Promise<void>;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}) {
  const { manifest, results } = options, blocks = new Map<string, string>();
  if (!Number.isSafeInteger(options.maxRunMicros) || options.maxRunMicros < 1 || options.maxRunMicros > 15_000_000) throw new Error("invalid-matrix-cap");
  assertComparisonResume(options.records, results);
  assertComparisonResultIdentity(manifest, results, options.history, options.run);
  for (const p of options.preflight) if (p.status === "blocked") blocks.set(p.model, p.reason);
  const spent = () => {
    assertComparisonResume([], results);
    return results.flatMap(r => r.attempts).reduce((sum, a) => sum + (deferredAttempt(a) ? a.deferral!.reservedMicros : a.usage.costMicros!), 0);
  };
  const deferred = (model: string) => results.filter(r => r.model === model).flatMap(r => r.attempts).filter(deferredAttempt);
  const dispatch = async (state: Extract<ComparisonPreflight, { status: "ready" }>, photo: ComparisonPhoto, batch: 0 | 1 = 0) => {
    const prior = results.find(r => r.model === state.model && r.photo === photo.id);
    if (prior && (batch === 0 || prior.status !== "deferred" || prior.batch === 1)) return;
    if (batch === 0 && deferred(state.model).length) return;
    if (spent() + state.maximumMicros > options.maxRunMicros) { blocks.set(state.model, "next-reservation-over-run-cap"); return; }
    const model = COMPARISON_MODELS.find(m => m.model === state.model)!;
    const result = await options.dispatch(model, photo, state.evidence, state.maximumMicros, batch, prior);
    if (prior) results.splice(results.indexOf(prior), 1, result); else results.push(result);
    assertComparisonResultIdentity(manifest, results, options.history, options.run);
    spent(); // Unknown usage stops here, before another model can dispatch.
    if (result.attempts.length === (prior?.attempts.length ?? 0)) {
      // Only a verified price rejection has no charged liability and is local to this model.
      if (result.failure === "price-unverified") blocks.set(state.model, result.failure);
      else throw new Error("admission-refused-stopped-run");
    }
  };
  const ready = options.preflight.filter((p): p is Extract<ComparisonPreflight, { status: "ready" }> => p.status === "ready");
  await options.save(blocks, null);
  const probes = [...ready].sort((a, b) => Number(b.model === MARKING_MODEL) - Number(a.model === MARKING_MODEL));
  for (const state of probes) await dispatch(state, manifest.photos[0]);
  for (let index = 1; index < manifest.photos.length; index++) {
    const first = new Map(results.filter(r => r.photo === manifest.photos[0].id && r.attempts.length).map(r => [r.model, r.attempts.at(-1)!.usage]));
    const remaining = new Map(ready.map(s => [s.model, manifest.photos.length - results.filter(r => r.model === s.model).length]));
    // Admit complete remaining model sets in ascending projected cost. An expensive model cannot stop cheaper pairs.
    const candidates = ready.filter(s => !blocks.has(s.model) && !deferred(s.model).length).map(s => ({ state: s, cost: projectMatrix([s.evidence], first, 0, remaining, options.maxAttempts) }));
    candidates.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || a.state.model.localeCompare(b.state.model));
    let projected = spent();
    for (const { state, cost } of candidates) {
      if (cost === null || projected + cost > options.maxRunMicros) blocks.set(state.model, "model-projection-missing-or-over-cap");
      else projected += cost;
    }
    await options.save(blocks, { projectedMicros: projected, maxMicros: options.maxRunMicros, spentOrHeldMicros: spent(), remaining: Object.fromEntries(remaining), firstPhotoUsage: Object.fromEntries(first), deferralPolicy: COMPARISON_DEFERRAL_POLICY });
    for (const state of ready) if (!blocks.has(state.model)) await dispatch(state, manifest.photos[index]);
  }
  // All initial model passes finish before any final batch. The saved first response owns the timer.
  const now = options.now ?? Date.now;
  for (const state of ready) {
    if (blocks.has(state.model)) continue;
    const holds = deferred(state.model);
    if (!holds.length) continue;
    if (holds.some(a => a.deferral!.batch === 1)) { blocks.set(state.model, "second-429-not-fully-tested"); continue; }
    const retryAt = Math.max(...holds.map(a => a.deferral!.retryAt));
    while (now() < retryAt) {
      if (!options.wait) throw new Error("deferred-wait-seam-required");
      await options.save(blocks, { state: "waiting-final-batch", model: state.model, retryAt, now: now(), spentOrHeldMicros: spent(), deferralPolicy: COMPARISON_DEFERRAL_POLICY });
      const remaining = retryAt - now();
      if (remaining > 0) await options.wait(Math.min(30_000, remaining));
    }
    for (const photo of manifest.photos) {
      if (blocks.has(state.model)) break;
      await dispatch(state, photo, 1);
      if (deferred(state.model).some(a => a.deferral!.batch === 1)) { blocks.set(state.model, "second-429-not-fully-tested"); break; }
    }
    await options.save(blocks, null);
  }
  await options.save(blocks, null);
  return blocks;
}
export interface EvaluationJournal {
  /** Exclusive durable creation. An existing attempt, including an unknown one, never grants dispatch. */
  begin(key: string): Promise<boolean>;
  save(key: string, value: unknown): Promise<void>;
}
/** One synthetic photo through the public production job. No family, photo or event rows are written. */
export async function runComparisonPhoto(options: {
  run: string; photo: ComparisonPhoto; image: Uint8Array; model: ComparisonModel; evidence: EndpointEvidence;
  maximumMicros: number; maxRunMicros: number; budget: EvaluationBudget; journal: EvaluationJournal;
  env: Readonly<Record<string, string | undefined>>; fetch?: typeof fetch; maxAttempts?: 1 | 2; now?: () => number;
  batch?: 0 | 1; prior?: ComparisonResult;
}): Promise<ComparisonResult> {
  const { photo, model, evidence, budget } = options;
  if (!Number.isSafeInteger(options.maxRunMicros) || options.maxRunMicros < 1 || options.maxRunMicros > 15_000_000 || !Number.isSafeInteger(options.maximumMicros) || options.maximumMicros < 1 || options.maximumMicros > 15_000_000 || (options.maxAttempts !== undefined && ![1, 2].includes(options.maxAttempts))) throw new Error("invalid-comparison-spend-limit");
  if (photo.frame.parentId !== SYNTHETIC_IDS.parent || photo.frame.childId !== SYNTHETIC_IDS.child || photo.frame.workbookId !== SYNTHETIC_IDS.workbook || photo.frame.photo !== photo.id || !photo.id.startsWith("synthetic-") || hashBytes(options.image) !== photo.image.sha256) throw new Error("synthetic-photo-or-image-hash-required");
  const now = options.now ?? Date.now;
  const batch = options.batch ?? 0;
  if (options.prior && (batch !== 1 || options.prior.run !== options.run || options.prior.model !== model.model || options.prior.photo !== photo.id || options.prior.status !== "deferred" || options.prior.batch === 1 || !deferredAttempt(options.prior.attempts.at(-1)!)
    || options.prior.photoHash !== photo.image.sha256 || options.prior.requestHash !== hashValue(markingRequest(photo.frame, new Uint8Array())))) throw new Error("invalid-final-batch-prior");
  if (options.prior) assertComparisonResume([], [options.prior]);
  if (options.prior?.attempts.some(a => a.deferral && now() < a.deferral.retryAt)) throw new Error("final-batch-too-early");
  let observations: Observation[] = [], schemaValid = false, failure: string | null = null;
  const attempts: ComparisonAttempt[] = [];
  let currentKey: string | null = null, current: ComparisonAttempt | null = null;
  let responseEvidence: CapturedResponse | null = null;
  let journalFailed = false, budgetFailed = false;
  const financial = async <T>(action: () => Promise<T>): Promise<T> => {
    try { return await action(); }
    catch {
      budgetFailed = true;
      failure = "reservation-or-settlement-failed";
      if (current) current.error = failure;
      throw new Error(failure);
    }
  };
  const journalFailure = () => {
    journalFailed = true;
    failure = "journal-failure";
    if (current) current.error = failure;
    return new Error(failure);
  };
  const journal: EvaluationJournal = {
    begin: async key => { try { return await options.journal.begin(key); } catch { throw journalFailure(); } },
    save: async (key, value) => { try { await options.journal.save(key, { run: options.run, key, model: model.model, photo: photo.id, batch, ...value as object }); } catch { throw journalFailure(); } },
  };
  const base = options.fetch ?? globalThis.fetch;
  const captured: typeof fetch = async (input, init) => {
    const start = now();
    try {
      const response = await base(input, init);
      let body: string | null = null, envelope: unknown = null;
      try { body = await response.clone().text(); } catch { /* Unknown cost retains its hold. */ }
      try { if (body !== null) envelope = JSON.parse(body); } catch { /* Keep a non-JSON error body verbatim. */ }
      const parsed = envelope !== null && typeof envelope === "object" && !Array.isArray(envelope) ? envelope as Record<string, unknown> : null;
      const errorMetadata = parsed?.error !== null && typeof parsed?.error === "object" && "metadata" in parsed.error ? parsed.error.metadata : null;
      responseEvidence = { status: response.status, body, openrouter_metadata: parsed?.openrouter_metadata ?? errorMetadata, envelope };
      current!.usage = transportUsage(envelope);
      current!.latencyMs = Math.max(0, now() - start);
      current!.error = response.ok ? null : `http-${response.status}`;
      current!.response = responseEvidence;
      if (clean429(responseEvidence)) {
        const receivedAt = now();
        current!.deferral = { policy: "clean429-v1", receivedAt, retryAt: receivedAt + COMPARISON_DEFERRAL_POLICY.delayMs, reservedMicros: options.maximumMicros, batch, key: currentKey!, run: options.run, model: model.model, photo: photo.id };
      }
      // Persist transport evidence before the production parser can reject the answer.
      await journal.save(currentKey!, { state: "response", attempt: current, ...responseEvidence });
      return response;
    } catch {
      current!.latencyMs = Math.max(0, now() - start); current!.error = journalFailed ? "journal-failure" : "transport-failure";
      throw new Error(current!.error);
    }
  };
  const factory = markingAiClient(options.env, captured, { model: model.model, provider: comparisonProvider(model, evidence), maxRetries: batch === 1 ? 0 : (options.maxAttempts ?? 1) - 1 });
  const store: MarkingStore = {
    frame: async () => photo.frame,
    claim: async () => ({ token: "synthetic", extraction: null, items: expectedItems(photo.frame).map(expected => ({ expected, observation: firstObservation(expected, photo.id), originalEvent: null, eventId: null, at: "2000-01-01T00:00:00.000Z", model: null, prompt: null })) }),
    image: async () => options.image,
    admit: async () => {
      if (journalFailed || budgetFailed) return "attempts";
      if (attempts.length >= (options.maxAttempts ?? 1)) return "attempts";
      if (current && (current.usage.costMicros === null || current.usage.inputTokens === null || current.usage.outputTokens === null || current.usage.reasoningTokens === null || current.usage.provider !== model.providerName)) { failure = "unknown-usage-no-retry"; return "attempts"; }
      const key = hashValue({ run: options.run, model, photo: photo.id, attempt: attempts.length + 1, ...(batch === 1 ? { batch } : {}) });
      if (!await journal.begin(key)) { failure = "existing-attempt-no-redispatch"; return "attempts"; }
      const reservation = await financial(() => budget.reserve({ run: options.run, attempt: key, model: model.model, endpoint: model.endpoint, evidence: hashValue(evidence), pixels: photo.image.width * photo.image.height, maximumMicros: options.maximumMicros, maxRunMicros: options.maxRunMicros }));
      if ("refused" in reservation) { failure = reservation.refused; await journal.save(key, { state: "refused", reason: reservation.refused }); return "budget"; }
      currentKey = key;
      current = { id: reservation.id, reservedMicros: options.maximumMicros, usage: transportUsage(null), latencyMs: 0, error: null };
      responseEvidence = null;
      attempts.push(current);
      await journal.save(key, { state: "reserved", attempt: current });
      return { dispatch: reservation.id };
    },
    settle: async (id) => {
      const attempt = attempts.find(a => a.id === id)!;
      // Ignore model JSON and the adapter's convenience cost. Only the captured HTTP envelope is authoritative.
      await financial(() => budget.settle(id, attempt.usage.costMicros));
      if (deferredAttempt(attempt) && !journalFailed && !budgetFailed) {
        await financial(async () => { if (!budget.defer) throw new Error("deferral-ledger-required"); await budget.defer({ run: options.run, key: currentKey!, attempt }); });
      }
      await journal.save(currentKey!, { state: deferredAttempt(attempt) && !journalFailed && !budgetFailed ? "deferred" : attempt.usage.costMicros === null ? "unknown" : "settled", attempt, response: responseEvidence, ...(responseEvidence ?? {}) });
    },
    extract: async (_ref, _token, value) => { observations = value; return true; },
    apply: async () => true, finish: async () => true, pause: async () => {}, publish: async () => {}, effective: async () => [],
  };
  let status: string;
  try {
    status = await runScanMarking(store, { parent: photo.frame.parentId, photo: photo.id }, "synthetic", before => {
      const transport = factory(before);
      if (!transport) return null;
      const client = transport.client;
      return { ...transport, client: { model: client.model, json: async (request, signal) => {
        let output: unknown;
        try { output = await client.json(request, signal); }
        catch (error) {
          const message = error instanceof Error ? error.message : "";
          failure ??= message === "the model refused" ? "refusal" : message === "the output is not valid JSON" ? "invalid-json" : current?.error ?? "invalid-run";
          throw error;
        }
        schemaValid = validMarkingOutput(photo.frame, output);
        if (!schemaValid) { failure = "schema-invalid"; throw new Error(failure); }
        return output;
      } } };
    }, () => "2000-01-01T00:00:00.000Z");
  } catch { status = "failed"; failure ??= "reservation-or-settlement-failed"; }
  if (attempts.some(a => a.usage.provider !== model.providerName || a.usage.model !== model.model || !a.usage.generationId)) failure ??= "served-provider-model-or-generation-mismatch";
  if (attempts.some(a => a.usage.costMicros === null || a.usage.inputTokens === null || a.usage.outputTokens === null || a.usage.reasoningTokens === null)) failure ??= "unknown-usage";
  if (status !== "finished" || !schemaValid || !attempts.length) failure ??= status;
  const isDeferred = !journalFailed && !budgetFailed && attempts.length > 0 && deferredAttempt(attempts.at(-1)!);
  if (journalFailed) failure = "journal-failure";
  else if (budgetFailed) failure = "reservation-or-settlement-failed";
  else if (isDeferred) failure = null;
  const result: ComparisonResult = { run: options.run, model: model.model, photo: photo.id, status: isDeferred ? "deferred" : failure ? "failed" : "complete", failure, batch, attempts: [...options.prior?.attempts ?? [], ...attempts], observations, schemaValid,
    requestHash: hashValue(markingRequest(photo.frame, new Uint8Array())), photoHash: photo.image.sha256, evidenceHash: hashValue(evidence) };
  // A terminal journal also closes the crash window before the separate result file is written.
  const finalAttempt = attempts.at(-1);
  if (currentKey && finalAttempt) {
    try { await journal.save(currentKey, { state: isDeferred ? "deferred" : finalAttempt.usage.costMicros === null ? "unknown" : "settled", attempt: finalAttempt, response: responseEvidence, ...(responseEvidence ?? {}), result }); }
    catch { result.failure = "journal-failure"; result.status = "failed"; }
  }
  return result;
}
