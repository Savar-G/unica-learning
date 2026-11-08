import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase-auth";
import { scanJson } from "@/lib/scan-photo-server";
import { RECOVERY_DB_LIMIT_MS, recoverScanMarking, scanMarkingServerReadiness } from "@/lib/scan-marking-server";

// The database client below stops at 170 s; recoverScanMarking starts a photo only in the first 40 s and keeps each
// model call short enough that its answer is saved before then (#726).
export const maxDuration = 180;
export async function POST(request: Request) {
  // The recovery run's start rule counts from here (RECOVERY_START_MS in scan-marking-server).
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret) return scanJson({ error: "unavailable" }, 503);
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return scanJson({ error: "refused" }, 401);
  if (scanMarkingServerReadiness().mode === "off") return scanJson({ status: "off" });
  const db = adminClient(AbortSignal.timeout(RECOVERY_DB_LIMIT_MS));
  if (!db) return scanJson({ error: "unavailable" }, 503);
  try { return scanJson(await recoverScanMarking(db, process.env, undefined, { startedAt })); }
  catch { return scanJson({ error: "unavailable" }, 503); }
}
export const GET = POST;
