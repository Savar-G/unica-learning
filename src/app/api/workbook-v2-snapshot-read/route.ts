import { timingSafeEqual } from "node:crypto";
import { isUuid } from "@/lib/workbook-content";
import { bankServerStore } from "@/lib/workbook-v2-bank/server";
import { timedBookRead } from "@/lib/workbook-v2-bank/snapshot-read";

// The snapshot read check (UNI-242, architecture spec 9.1): reads what one book needs of a frozen snapshot from Supabase
// inside this function (the header, topics, word problems and the book's sheets) and answers with the timing record of the
// round trip: { httpStatus, snapshotId, sheetCount, rowCount, payloadBytes, totalMs, parts }, where the parts add up to
// totalMs. Call it with "Authorization: Bearer <CRON_SECRET>" and the body {"snapshotId": "<uuid>", "sheetIds": [...]}
// (1 to 60 different sheet ids). It writes nothing. It is off in production unless WORKBOOK_V2_TEST_PUBLISH=on. A body
// over 8 KB is refused before it is parsed, and a read that takes more than 10 seconds is aborted and answers 504.

const SHEET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_SHEETS = 60;
/** 60 sheet ids of 64 characters and a UUID fit in about 4 KB. */
const MAX_BODY_BYTES = 8 * 1024;
const READ_DEADLINE_MS = 10_000;

/** The body as text, or null when it is longer than `max` bytes: no more than `max` + 1 bytes are read. */
async function cappedText(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

interface Body { snapshotId: string; sheetIds: string[] }

function readBody(raw: unknown): Body | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "The body is a JSON object.";
  const { snapshotId, sheetIds, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return "The body has only snapshotId and sheetIds.";
  if (!isUuid(snapshotId)) return "snapshotId is a UUID.";
  if (!Array.isArray(sheetIds) || sheetIds.length < 1 || sheetIds.length > MAX_SHEETS) return `sheetIds is a list of 1 to ${MAX_SHEETS} sheet ids.`;
  if (!sheetIds.every((id): id is string => typeof id === "string" && SHEET_ID.test(id))) return "Each sheet id uses only small letters, digits and dashes.";
  if (new Set(sheetIds).size !== sheetIds.length) return "Each sheet id is in sheetIds once.";
  return { snapshotId, sheetIds };
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  if (process.env.VERCEL_ENV === "production" && process.env.WORKBOOK_V2_TEST_PUBLISH !== "on") return new Response("Off in production", { status: 404 });

  const text = await cappedText(request, MAX_BODY_BYTES);
  if (text === null) return Response.json({ error: `The body is ${MAX_BODY_BYTES} bytes at most.` }, { status: 413 });
  const body = readBody(parsed(text));
  if (typeof body === "string") return Response.json({ error: body }, { status: 400 });

  const store = bankServerStore();
  if (!store) return new Response("Not configured", { status: 503 });
  // At the deadline the reads are aborted: the request that runs stops, and no further page is read.
  const stop = new AbortController();
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"late">((resolve) => { timer = setTimeout(() => { resolve("late"); stop.abort(); }, READ_DEADLINE_MS); });
  const reading = timedBookRead(store, body.snapshotId, body.sheetIds, () => performance.now(), stop.signal);
  reading.catch(() => {}); // an aborted read rejects after the 504 is sent
  const read = await Promise.race([reading, deadline]).finally(() => clearTimeout(timer));
  if (read === "late" || performance.now() - started >= READ_DEADLINE_MS) {
    stop.abort();
    return Response.json({ error: `The read took more than ${READ_DEADLINE_MS / 1000} seconds.` }, { status: 504 });
  }
  if (!read.ok) return Response.json({ error: read.problem }, { status: read.httpStatus });
  return Response.json(read.record, { status: read.record.httpStatus });
}
