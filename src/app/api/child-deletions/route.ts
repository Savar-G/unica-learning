import { timingSafeEqual } from "node:crypto";
import { retryChildDeletions } from "@/lib/child-delete-server";
import { adminClient } from "@/lib/supabase-auth";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  const db = adminClient(AbortSignal.timeout(45_000));
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const counts = await retryChildDeletions(db, Date.now() + 40_000);
    return Response.json({ ok: counts.failed === 0, ...counts });
  } catch {
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
