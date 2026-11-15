// The Sentry tunnel's request (src/app/sentry-tunnel/route.ts, docs/sentry.md). Every report from the browser passes
// here before Sentry, so this is where the replay rules are enforced on our own server, whatever the SDK does inside:
// - Headers: only the content type and the user agent go on. Sentry's handler would forward the visitor's IP address
//   and the Referer, which on the desk holds a QR token.
// - Replays: each address in a replay's details (its page list) and in its recording loses its query, hash, QR token,
//   scan page and admin record (scrubUrl). The browser sends recordings uncompressed (useCompression false) so they can
//   be read here; a recording that cannot be read is dropped, not forwarded.
import { scrubUrl } from "@/lib/sentry-scrub";

const KEEP = ["content-type", "user-agent"];
/** A tunnel request larger than this is refused (Vercel takes 4.5 MB). */
export const MAX_ENVELOPE_BYTES = 4_000_000;
/** The most items one envelope may hold. */
const MAX_ITEMS = 100;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function indexOfNewline(bytes: Uint8Array, from: number): number {
  for (let i = from; i < bytes.length; i++) if (bytes[i] === 10) return i;
  return -1;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** A string that is an address (absolute, or a site path) loses what scrubUrl removes; any other string stays. */
function scrubAddress(value: string): string {
  if (!/^(https?:\/\/|\/(?!\/))/i.test(value) || /\s/.test(value)) return value;
  return scrubUrl(value);
}

function walk(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubAddress(value);
  if (depth > 64 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) value[i] = walk(value[i], depth + 1); return value; }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) record[key] = walk(record[key], depth + 1);
  return record;
}

/** One item's new payload, or null to drop the item. */
function scrubItem(type: string, payload: Uint8Array): Uint8Array | null {
  if (type === "replay_event") {
    try { return encoder.encode(JSON.stringify(walk(JSON.parse(decoder.decode(payload))))); } catch { return null; }
  }
  if (type === "replay_recording") {
    // `{"segment_id":n}\n` then the recording: JSON when uncompressed. Anything else (compressed bytes) is dropped.
    const cut = indexOfNewline(payload, 0);
    if (cut < 0) return null;
    try {
      const recording = walk(JSON.parse(decoder.decode(payload.subarray(cut + 1))));
      return concat([payload.subarray(0, cut + 1), encoder.encode(JSON.stringify(recording))]);
    } catch { return null; }
  }
  return payload;
}

/**
 * A Sentry envelope with every replay item cleaned (see the file header), or null when it cannot be read. Items of
 * other types pass unchanged: errors, spans, logs and metrics were cleaned in the browser (src/lib/sentry-scrub.ts).
 */
export function scrubEnvelope(bytes: Uint8Array): Uint8Array | null {
  const headerEnd = indexOfNewline(bytes, 0);
  if (headerEnd < 0) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, headerEnd + 1)];
  let at = headerEnd + 1;
  let count = 0;
  while (at < bytes.length) {
    // An envelope holds a few items; a body with more is not one the SDK sent.
    if (++count > MAX_ITEMS) return null;
    const itemHeaderEnd = indexOfNewline(bytes, at);
    const headerBytes = bytes.subarray(at, itemHeaderEnd < 0 ? bytes.length : itemHeaderEnd);
    if (!headerBytes.length) { at += 1; continue; }
    let header: { type?: unknown; length?: unknown };
    try { header = JSON.parse(decoder.decode(headerBytes)); } catch { return null; }
    if (itemHeaderEnd < 0) return null;
    const start = itemHeaderEnd + 1;
    let end: number;
    if (header.length !== undefined) {
      // Only a whole, non-negative length: a negative one would send the reader back to the same item for ever.
      if (typeof header.length !== "number" || !Number.isSafeInteger(header.length) || header.length < 0) return null;
      end = start + header.length;
      if (end > bytes.length) return null;
    } else {
      const newline = indexOfNewline(bytes, start);
      end = newline < 0 ? bytes.length : newline;
    }
    const payload = scrubItem(typeof header.type === "string" ? header.type : "", bytes.subarray(start, end));
    // The reader always moves forward.
    if (end + 1 <= at) return null;
    at = end + 1;
    if (payload === null) continue;
    const nextHeader = typeof header.length === "number" ? { ...header, length: payload.length } : header;
    parts.push(encoder.encode(JSON.stringify(nextHeader) + "\n"), payload, encoder.encode("\n"));
  }
  return concat(parts);
}

/** The request to forward: the cleaned envelope and the KEEP headers only. Null when the envelope is refused. */
export async function bareRequest(request: Request): Promise<Request | null> {
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_ENVELOPE_BYTES) return null;
  const clean = scrubEnvelope(body);
  if (!clean) return null;
  const headers = new Headers();
  for (const name of KEEP) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("content-length", String(clean.length));
  return new Request(request.url, { method: "POST", headers, body: clean as BodyInit });
}
