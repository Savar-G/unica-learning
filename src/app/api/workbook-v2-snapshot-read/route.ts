import { timingSafeEqual } from "node:crypto";
import { isUuid } from "@/lib/workbook-content";
import { bankServerStore } from "@/lib/workbook-v2-bank/server";
import { timedBookRead } from "@/lib/workbook-v2-bank/snapshot-read";

// The snapshot read check (UNI-242, architecture spec 9.1): reads what one book needs of a frozen snapshot from Supabase
// inside this function (the header, topics, word problems and the book's sheets) and answers with the timing record of the
// round trip: { httpStatus, snapshotId, sheetCount, rowCount, payloadBytes, totalMs, parts }, where the parts add up to
// totalMs. Call it with "Authorization: Bearer <CRON_SECRET>" and the body {"snapshotId": "<uuid>", "sheetIds": [...]}
// (1 to 60 different sheet ids). It writes nothing. It is off in production unless WORKBOOK_V2_TEST_PUBLISH=on.

const SHEET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_SHEETS = 60;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

interface Body { snapshotId: string; sheetIds: string[] }

function readBody(raw: unknown): Body | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "The body is a JSON object.";
  const { snapshotId, sheetIds, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `The body has unknown fields: ${Object.keys(rest).join(", ")}.`;
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

  const body = readBody(await request.json().catch(() => null));
  if (typeof body === "string") return Response.json({ error: body }, { status: 400 });

  const store = bankServerStore();
  if (!store) return new Response("Not configured", { status: 503 });
  const read = await timedBookRead(store, body.snapshotId, body.sheetIds, () => performance.now());
  if (!read.ok) return Response.json({ error: read.problem }, { status: read.httpStatus });
  return Response.json(read.record, { status: read.record.httpStatus });
}
