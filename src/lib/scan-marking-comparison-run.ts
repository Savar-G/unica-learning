import { markingAiClient } from "@/lib/scan-marking-ai";
import { markingRequest, runScanMarking, validMarkingOutput, type MarkingStore } from "@/lib/scan-marking";
import { expectedItems, firstObservation, type Observation } from "@/lib/scan-observation";
import { SYNTHETIC_IDS, comparisonProvider, hashBytes, hashValue, transportUsage, type ComparisonAttempt, type ComparisonModel, type ComparisonPhoto, type ComparisonResult, type EndpointEvidence } from "@/lib/scan-marking-comparison";

export interface EvaluationBudget {
  reserve(input: { run: string; attempt: string; model: string; endpoint: string; evidence: string; pixels: number; maximumMicros: number; maxRunMicros: number }): Promise<{ id: string } | { refused: string }>;
  settle(id: string, costMicros: number | null): Promise<void>;
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
}): Promise<ComparisonResult> {
  const { photo, model, evidence, journal, budget } = options;
  if (!Number.isSafeInteger(options.maxRunMicros) || options.maxRunMicros < 1 || options.maxRunMicros > 15_000_000 || !Number.isSafeInteger(options.maximumMicros) || options.maximumMicros < 1 || options.maximumMicros > 15_000_000 || (options.maxAttempts !== undefined && ![1, 2].includes(options.maxAttempts))) throw new Error("invalid-comparison-spend-limit");
  if (photo.frame.parentId !== SYNTHETIC_IDS.parent || photo.frame.childId !== SYNTHETIC_IDS.child || photo.frame.workbookId !== SYNTHETIC_IDS.workbook || photo.frame.photo !== photo.id || !photo.id.startsWith("synthetic-") || hashBytes(options.image) !== photo.image.sha256) throw new Error("synthetic-photo-or-image-hash-required");
  const now = options.now ?? Date.now;
  let observations: Observation[] = [], schemaValid = false, failure: string | null = null;
  const attempts: ComparisonAttempt[] = [];
  let currentKey: string | null = null, current: ComparisonAttempt | null = null;
  const base = options.fetch ?? globalThis.fetch;
  const captured: typeof fetch = async (input, init) => {
    const start = now();
    try {
      const response = await base(input, init);
      let envelope: unknown = null;
      try { envelope = await response.clone().json(); } catch { /* Unknown cost retains its hold. */ }
      current!.usage = transportUsage(envelope);
      current!.latencyMs = Math.max(0, now() - start);
      current!.error = response.ok ? null : `http-${response.status}`;
      // Persist transport evidence before the production parser can reject the answer.
      await journal.save(currentKey!, { state: "response", attempt: current, envelope });
      return response;
    } catch {
      current!.latencyMs = Math.max(0, now() - start); current!.error = "transport-or-journal-failure";
      throw new Error("transport-or-journal-failure");
    }
  };
  const factory = markingAiClient(options.env, captured, { model: model.model, provider: comparisonProvider(model, evidence), maxRetries: (options.maxAttempts ?? 1) - 1 });
  const store: MarkingStore = {
    frame: async () => photo.frame,
    claim: async () => ({ token: "synthetic", extraction: null, items: expectedItems(photo.frame).map(expected => ({ expected, observation: firstObservation(expected, photo.id), originalEvent: null, eventId: null, at: "2000-01-01T00:00:00.000Z", model: null, prompt: null })) }),
    image: async () => options.image,
    admit: async () => {
      if (attempts.length >= (options.maxAttempts ?? 1)) return "attempts";
      if (current && (current.usage.costMicros === null || current.usage.inputTokens === null || current.usage.outputTokens === null || current.usage.reasoningTokens === null || current.usage.provider !== model.providerName)) { failure = "unknown-usage-no-retry"; return "attempts"; }
      const key = hashValue({ run: options.run, model, photo: photo.id, attempt: attempts.length + 1 });
      if (!await journal.begin(key)) { failure = "existing-attempt-no-redispatch"; return "attempts"; }
      const reservation = await budget.reserve({ run: options.run, attempt: key, model: model.model, endpoint: model.endpoint, evidence: hashValue(evidence), pixels: photo.image.width * photo.image.height, maximumMicros: options.maximumMicros, maxRunMicros: options.maxRunMicros });
      if ("refused" in reservation) { failure = reservation.refused; await journal.save(key, { state: "refused", reason: reservation.refused }); return "budget"; }
      currentKey = key;
      current = { id: reservation.id, usage: transportUsage(null), latencyMs: 0, error: null };
      attempts.push(current);
      await journal.save(key, { state: "reserved", attempt: current });
      return { dispatch: reservation.id };
    },
    settle: async (id) => {
      const attempt = attempts.find(a => a.id === id)!;
      // Ignore model JSON and the adapter's convenience cost. Only the captured HTTP envelope is authoritative.
      await budget.settle(id, attempt.usage.costMicros);
      await journal.save(currentKey!, { state: attempt.usage.costMicros === null ? "unknown" : "settled", attempt });
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
  return { model: model.model, photo: photo.id, status: failure ? "failed" : "complete", failure, attempts, observations, schemaValid,
    requestHash: hashValue(markingRequest(photo.frame, new Uint8Array())), photoHash: photo.image.sha256, evidenceHash: hashValue(evidence) };
}
