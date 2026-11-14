// #868: names a clean provider failure of one marking transport attempt (`MarkingFailure`), from the HTTP answer
// itself, never from the model's output. The 429 rule is the evaluation runner's `clean429` (clean429-v1); the store
// checks the kept body again before it frees a hold.
import type { MarkingFailure } from "@/lib/scan-marking";
import { clean429, showsGeneration } from "@/lib/scan-marking-comparison";

/** The longest error body kept as evidence (the database refuses a longer one too). */
export const MAX_EVIDENCE_CHARS = 20_000;
/** Retry-After as delay seconds or an HTTP date, in ms from `now`; null when absent or unreadable. */
function retryAfterMs(value: string | null, now: number): number | null {
  const text = value?.trim() ?? "";
  if (/^\d{1,6}$/.test(text)) return Number(text) * 1000;
  const at = text ? Date.parse(text) : NaN;
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/** The clean failure an HTTP error answer shows, or null: an answer, a refusal, or any sign the model ran. */
export function markingFailure(status: number, body: string, headers: Headers, now = Date.now()): MarkingFailure | null {
  // The store checks the body again; one too long to send it is not clean.
  if (body.length > MAX_EVIDENCE_CHARS) return null;
  let envelope: unknown = null, json = true;
  try { envelope = JSON.parse(body); } catch { json = false; }
  if (status === 429) {
    const error = envelope && typeof envelope === "object" && !Array.isArray(envelope) ? (envelope as { error?: { metadata?: unknown } }).error : undefined;
    const metadata = (envelope as { openrouter_metadata?: unknown } | null)?.openrouter_metadata ?? error?.metadata ?? null;
    return clean429({ status, body, envelope, openrouter_metadata: metadata })
      ? { kind: "rate-limit", retryAfterMs: retryAfterMs(headers.get("retry-after"), now), evidence: { status, body } } : null;
  }
  if (status === 408 || status >= 500) return !json || !showsGeneration(envelope) ? { kind: "provider-error", retryAfterMs: null, evidence: { status, body } } : null;
  return null;
}

/** A fetch that reports each attempt's clean failure (or null) to `onFailure`. A request that never answers is no answer. */
export function failureFetch(onFailure: (failure: MarkingFailure | null) => void, base: typeof globalThis.fetch = globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    let res: Response;
    try {
      res = await base(input, init);
    } catch (e) {
      onFailure({ kind: "no-answer", retryAfterMs: null, evidence: null });
      throw e;
    }
    if (res.ok) { onFailure(null); return res; }
    const body = await res.clone().text().catch(() => null);
    onFailure(body === null ? null : markingFailure(res.status, body, res.headers));
    return res;
  };
}
