import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase-auth";
import { scanJson } from "@/lib/scan-photo-server";
import { recoverScanMarking, scanMarkingServerReadiness } from "@/lib/scan-marking-server";

export const maxDuration = 180;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return scanJson({ error: "unavailable" }, 503);
  const supplied = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return scanJson({ error: "refused" }, 401);
  if (scanMarkingServerReadiness().mode === "off") return scanJson({ status: "off" });
  const db = adminClient(AbortSignal.timeout(170_000));
  if (!db) return scanJson({ error: "unavailable" }, 503);
  try { return scanJson(await recoverScanMarking(db)); }
  catch { return scanJson({ error: "unavailable" }, 503); }
}
export const GET = POST;
