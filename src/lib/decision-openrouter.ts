// The OpenRouter adapter of the decision client (spec #850): POST /api/alpha/decisions with the model and its one provider
// pinned (no fallbacks). No SDK: one fetch per try, so tests fake fetch. The cost comes from the HTTP answer's usage
// (usage.cost, US dollars), never from a model's words.
// API (read 2026-11-11): https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request and the
// Multimodal Decisions guide, https://openrouter.ai/docs/guides/community/multimodal-decisions. Images go in the top-level
// `state` array as `image_url` parts with a base64 data URL; text items in that array are plain strings. A question's
// answer can be `{"type":"refusal"}`. Jev gives no `confidence` on a yes/no answer: it is max(p, 1 - p) here. The
// endpoint is alpha: its shape can change, and any answer that is not the typed answer asked for is "malformed".
import { DecisionError, type DecisionAnswer, type DecisionClient, type DecisionErrorKind, type DecisionPart, type DecisionQuestion, type DecisionRequest, type DecisionResult } from "@/lib/decision-client";

export const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
/** One try stops after this long. A time-out, a lost connection, a 408, a 429 or a 5xx gets one more try. */
export const DECISION_REQUEST_TIMEOUT_MS = 20_000;

function statePart(p: DecisionPart): unknown {
  if (p.type === "text") return p.text;
  return { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${Buffer.from(p.data).toString("base64")}` } };
}

function question(q: DecisionQuestion): Record<string, unknown> {
  if (q.type === "noul") {
    const criteria = { ...(q.yes ? { true: q.yes } : {}), ...(q.no ? { false: q.no } : {}) };
    return { type: "noul", instructions: q.instructions, ...(Object.keys(criteria).length ? { criteria } : {}) };
  }
  if (q.type === "choice") return { type: "choice", instructions: q.instructions, criteria: { ...q.options } };
  return { type: "score", instructions: q.instructions, criteria: [...q.levels] };
}

/** The request body. Exported for the comparison script's cost estimate, which sizes the same body. */
export function decisionBody(model: string, provider: string, request: Pick<DecisionRequest, "input" | "questions">) {
  return {
    model,
    state: request.input.map(statePart),
    questions: Object.fromEntries(Object.entries(request.questions).map(([key, q]) => [key, question(q)])),
    provider: { only: [provider], order: [provider], allow_fallbacks: false },
  };
}

/**
 * An error worth one more try: a time-out, a lost connection, a 408, a 429 or a 5xx. Not a DecisionError subclass, so that
 * this module does not use decision-client.ts's class while the two modules load each other.
 */
class Retryable extends Error {
  constructor(readonly kind: DecisionErrorKind, message: string, readonly usd: number | null = null) {
    super(message);
  }
}

interface Body {
  error?: { code?: number | string; message?: string; metadata?: unknown };
  answers?: Record<string, unknown>;
  usage?: { cost?: unknown };
  provider?: unknown;
  id?: unknown;
}

const short = (s: unknown) => String(s ?? "").slice(0, 160);
const retryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;
/** OpenRouter's and the providers' words for a safety block (moderation, a content filter). */
const BLOCK_WORDS = /moderat|flagged|safety|content[ _-]?(?:policy|filter)|prohibited|blocked/i;
const probability = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
const costOf = (body: Body | null) => {
  const cost = body?.usage?.cost;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null;
};

/** One answer, checked against its question. Throws "malformed" or "refused". */
function readAnswer(key: string, q: DecisionQuestion, raw: unknown, usd: number | null): DecisionAnswer {
  const bad = (why: string) => new DecisionError("malformed", `the answer to ${short(key)} ${why}`, usd);
  if (!raw || typeof raw !== "object") throw bad("is missing");
  const a = raw as Record<string, unknown>;
  if (a.type === "refusal") throw new DecisionError("refused", `the model refused ${short(key)}`, usd);
  if (a.type !== q.type) throw bad(`is of type ${short(a.type)}, not ${q.type}`);
  if (a.confidence !== undefined && !probability(a.confidence)) throw bad("has a confidence that is not from 0 to 1");
  if (q.type === "noul") {
    if (!probability(a.noul)) throw bad("has no probability from 0 to 1");
    return { type: "noul", yes: a.noul, confidence: (a.confidence as number | undefined) ?? Math.max(a.noul, 1 - a.noul) };
  }
  const given = a.probabilities;
  if (given !== undefined && (!given || typeof given !== "object" || !Object.values(given).every(probability))) throw bad("has probabilities that are not from 0 to 1");
  const probs = (given ?? {}) as Record<string, number>;
  if (q.type === "choice") {
    const options = Object.keys(q.options);
    if (typeof a.choice !== "string" || !options.includes(a.choice)) throw bad("names an option that was not asked");
    if (Object.keys(probs).some((k) => !options.includes(k))) throw bad("has a probability for an option that was not asked");
    const probabilities = Object.fromEntries(options.map((o) => [o, probs[o] ?? 0]));
    return { type: "choice", choice: a.choice, probabilities, confidence: (a.confidence as number | undefined) ?? (probs[a.choice] ?? 0) };
  }
  const levels = q.levels.length;
  if (typeof a.score !== "number" || !Number.isFinite(a.score) || a.score < 0 || a.score > levels - 1) throw bad("has a score outside the levels");
  if (Object.keys(probs).some((k) => !/^\d+$/.test(k) || Number(k) >= levels)) throw bad("has a probability for a level that was not asked");
  const probabilities = Array.from({ length: levels }, (_, n) => probs[String(n)] ?? 0);
  return { type: "score", score: a.score, probabilities, confidence: (a.confidence as number | undefined) ?? Math.max(...probabilities) };
}

/** The kind of a failed HTTP answer. A safety block is "blocked"; every other failure is "unavailable". */
function failure(status: number, message: string, usd: number | null): DecisionError | Retryable {
  const text = `OpenRouter answered ${status}: ${short(message)}`;
  if (retryableStatus(status)) return new Retryable(status === 408 ? "timeout" : "unavailable", text, usd);
  return new DecisionError(BLOCK_WORDS.test(message) ? "blocked" : "unavailable", text, usd);
}

/** One try. Error messages hold codes and OpenRouter's words, never the input. */
async function once(fetch: typeof globalThis.fetch, init: RequestInit, request: DecisionRequest, timeout: number): Promise<DecisionResult> {
  let res: Response;
  try {
    res = await fetch(DECISIONS_URL, { ...init, signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]) });
  } catch (e) {
    if (request.signal.aborted) throw new DecisionError("timeout", "time is up");
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw timedOut
      ? new Retryable("timeout", `OpenRouter did not answer in time (${timeout} ms)`)
      : new Retryable("unavailable", `OpenRouter could not be reached: ${short(e instanceof Error ? e.message : e)}`);
  }
  let text: string;
  try {
    text = await res.text();
  } catch {
    if (request.signal.aborted) throw new DecisionError("timeout", "time is up");
    throw new Retryable("unavailable", "OpenRouter's answer was cut off");
  }
  let body: Body | null = null;
  try {
    body = JSON.parse(text) as Body;
  } catch {
    body = null;
  }
  const usd = costOf(body);
  if (!res.ok) throw failure(res.status, body?.error?.message ?? text, usd);
  if (!body || typeof body !== "object") throw new DecisionError("malformed", "OpenRouter answered 200 with a body that is not JSON");
  if (body.error) {
    const message = `${short(body.error.message)} ${JSON.stringify(body.error.metadata ?? "")}`;
    throw new DecisionError(BLOCK_WORDS.test(message) ? "blocked" : "unavailable", `OpenRouter error ${short(body.error.code)}: ${short(body.error.message)}`, usd);
  }
  if (!body.answers || typeof body.answers !== "object") throw new DecisionError("malformed", "OpenRouter answered with no answers", usd);
  const answers: Record<string, DecisionAnswer> = {};
  for (const [key, q] of Object.entries(request.questions)) answers[key] = readAnswer(key, q, body.answers[key], usd);
  return { answers, usd, provider: typeof body.provider === "string" ? body.provider : null, id: typeof body.id === "string" ? body.id : null };
}

export function openRouterDecisionClient({
  apiKey,
  model,
  provider,
  fetch = globalThis.fetch,
  maxRetries = 1,
  timeout = DECISION_REQUEST_TIMEOUT_MS,
}: {
  apiKey: string;
  model: string;
  /** The OpenRouter provider slug the model is pinned to. */
  provider: string;
  /** For tests: the fetch to use. */
  fetch?: typeof globalThis.fetch;
  maxRetries?: number;
  timeout?: number;
}): DecisionClient {
  return {
    model,
    async decide(request) {
      if (!Object.keys(request.questions).length) throw new DecisionError("malformed", "a decision needs at least one question");
      const init: RequestInit = {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-openrouter-title": "Unica Learning" },
        body: JSON.stringify(decisionBody(model, provider, request)),
      };
      for (let attempt = 0; ; attempt++) {
        if (request.signal.aborted) throw new DecisionError("timeout", "time is up");
        try {
          return await once(fetch, init, request, timeout);
        } catch (e) {
          if (!(e instanceof Retryable)) throw e;
          if (attempt >= maxRetries || request.signal.aborted) throw new DecisionError(request.signal.aborted ? "timeout" : e.kind, e.message, e.usd);
        }
      }
    },
  };
}
