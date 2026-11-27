import { timingSafeEqual } from "node:crypto";
import { isUuid } from "@/lib/workbook-content";
import { FULL_BOOK_SNAPSHOT, fullBookPlan } from "@/lib/workbook-v2-publish/full-book";
import { REQUEST_KEY } from "@/lib/workbook-v2-publish/input";
import { publishV2Book } from "@/lib/workbook-v2-publish/job";
import { serverDeps } from "@/lib/workbook-v2-publish/server";

// The v2 publish check (UNI-141): builds the full-size invented book (src/lib/workbook-v2-publish/full-book.ts) for a
// child of a test family inside this function, uploads its files and writes it into today's workbook tables, and answers
// with the timing record of the run (docs/workbook-v2-engine.md, "Publishing"). Call it with
// "Authorization: Bearer <CRON_SECRET>" and the body {"childId": "<uuid>", "requestKey": "<8 to 120 characters>"}, and
// optionally "sheets" (2, 4 or 6, or a multiple of 6 up to 60: the first sheets of the plan). The same request key again writes
// nothing and gives back the same book. It is off in production unless WORKBOOK_V2_TEST_PUBLISH=on, and each function
// instance runs one book at a time (a second call while one runs gets 429).

export const maxDuration = 60;

/** Whether this instance is building a book now. */
let busy = false;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

interface Body { childId: string; requestKey: string; sheets: number }

function readBody(raw: unknown): Body | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "The body is a JSON object.";
  const { childId, requestKey, sheets = 60, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `The body has unknown fields: ${Object.keys(rest).join(", ")}.`;
  if (!isUuid(childId)) return "childId is a UUID.";
  if (typeof requestKey !== "string" || !REQUEST_KEY.test(requestKey)) return "requestKey is 8 to 120 letters, digits, :, _ or -.";
  // Whole days of the same size and a multiple of 4 pages: 2, 4 or 6 sheets of the first day, or whole days of 6.
  const n = sheets as number;
  if (!Number.isInteger(n) || n < 2 || n > 60 || n % 2 !== 0 || (n > 6 && n % 6 !== 0)) return "sheets is 2, 4 or 6, or a multiple of 6 up to 60.";
  return { childId, requestKey, sheets: sheets as number };
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  if (process.env.VERCEL_ENV === "production" && process.env.WORKBOOK_V2_TEST_PUBLISH !== "on") return new Response("Off in production", { status: 404 });

  const body = readBody(await request.json().catch(() => null));
  if (typeof body === "string") return Response.json({ error: body }, { status: 400 });

  if (busy) return new Response("A book is being built", { status: 429, headers: { "Retry-After": "30" } });
  busy = true;
  try {
    const deps = serverDeps();
    if (!deps) return new Response("Not configured", { status: 503 });
    const sheets = fullBookPlan(body.sheets);
    const result = await publishV2Book(deps, { requestKey: body.requestKey, childId: body.childId, snapshot: structuredClone(FULL_BOOK_SNAPSHOT), sheets });
    switch (result.status) {
      case "published": case "existing": return Response.json(result.record, { status: result.record.httpStatus });
      case "refused": return Response.json({ error: result.detail, reason: result.reason }, { status: result.reason === "not-test-family" ? 403 : 422 });
      case "invalid": return Response.json({ error: "The book cannot be made.", problems: result.problems }, { status: 422 });
      case "failed": return Response.json({ error: "The book did not build.", problems: result.problems }, { status: 500 });
    }
  } finally {
    busy = false;
  }
}
