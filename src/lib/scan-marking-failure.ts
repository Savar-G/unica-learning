// #868: names a clean 429 of one marking transport attempt (`MarkingFailure`), from the HTTP answer itself, never from
// the model's output. The rule is the evaluation's envelope rule (`clean429Envelope`, clean429-v1); the store checks the kept body again
// before it frees a hold. A time-out, 408, 5xx or lost answer is never clean: it may have been charged.
import type { MarkingFailure } from "@/lib/scan-marking";
import { clean429Envelope } from "@/lib/scan-marking-comparison";

/** The longest error body kept as evidence (the database refuses a longer one too). */
export const MAX_EVIDENCE_CHARS = 20_000;
/** RFC 7231 IMF-fixdate, the only HTTP-date form read here: "Sun, 06 Nov 1994 08:49:37 GMT". */
const IMF_FIXDATE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
/** Retry-After as whole delay seconds or an IMF-fixdate, in ms from `now`; null for anything else (the default wait). */
function retryAfterMs(value: string | null, now: number): number | null {
  const text = value?.trim() ?? "";
  if (/^\d{1,6}$/.test(text)) return Number(text) * 1000;
  if (!IMF_FIXDATE.test(text)) return null;
  const at = Date.parse(text);
  // The date must be a real one: its weekday and day, printed back, give the same text.
  return Number.isFinite(at) && new Date(at).toUTCString() === text ? Math.max(0, at - now) : null;
}

/** The clean 429 an HTTP error answer shows, or null: any other status, an answer, a refusal, or any sign the model ran. */
export function markingFailure(status: number, body: string, headers: Headers, now = Date.now()): MarkingFailure | null {
  // The store checks the body again; one too long to send it is not clean.
  if (status !== 429 || body.length > MAX_EVIDENCE_CHARS) return null;
  let envelope: unknown;
  try { envelope = JSON.parse(body); } catch { return null; }
  return clean429Envelope(envelope) ? { kind: "rate-limit", retryAfterMs: retryAfterMs(headers.get("retry-after"), now), evidence: { status, body } } : null;
}
