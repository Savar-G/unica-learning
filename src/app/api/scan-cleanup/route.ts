import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase-auth";
import { cleanupScanPhotos, scanJson } from "@/lib/scan-photo-server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return scanJson({ error: "unavailable" }, 503);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return scanJson({ error: "refused" }, 401);
  const db = adminClient(AbortSignal.timeout(55_000));
  if (!db) return scanJson({ error: "unavailable" }, 503);
  try { return scanJson({ removed: await cleanupScanPhotos(db, Date.now() + 45_000) }); }
  catch { return scanJson({ error: "unavailable" }, 503); }
}
