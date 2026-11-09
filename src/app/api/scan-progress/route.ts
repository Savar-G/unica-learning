import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase-auth";
import { createWorkbookScanProgressSweep } from "@/lib/workbook-scan-progress-sweep-server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  const startedAt = Date.now();
  const signal = AbortSignal.timeout(55_000);
  const db = adminClient(signal);
  if (!db) return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  const sweep = createWorkbookScanProgressSweep(db, { env: {
    WORKBOOK_SCAN_PROGRESS_ENABLED: process.env.WORKBOOK_SCAN_PROGRESS_ENABLED,
    WORKBOOK_SCAN_REMINDERS_ENABLED: process.env.WORKBOOK_SCAN_REMINDERS_ENABLED,
    WORKBOOK_SCAN_TEST_PARENT_IDS: process.env.WORKBOOK_SCAN_TEST_PARENT_IDS,
  }, signal });
  if (!sweep) return Response.json({ ok: true, status: "off" });
  try {
    const result = await sweep.run({ now: () => Date.now(), endAt: startedAt + 55_000 });
    return Response.json({ ok: true, ...result });
  } catch {
    console.error("[scan progress] scheduled turn stopped");
    return Response.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}
