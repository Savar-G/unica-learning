import { timingSafeEqual } from "node:crypto";
import { deletionCandidates, runFamilyDeletion } from "@/lib/family-deletion-store";
import { pilotOn } from "@/lib/pilot";
import { adminClient } from "@/lib/supabase-auth";

export const maxDuration = 60;

/** Daily Vercel cron. Dry mode reads the full paged set and returns counts only. No email or analytics. */
export async function GET(request: Request) {
  if (!pilotOn()) return new Response("Not found", { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const counts = { eligible: 0, deleted: 0, busy: 0, excluded: 0, failed: 0, images: 0 };
  try {
    const ids = await deletionCandidates(db);
    counts.eligible = ids.length;
    if (new URL(request.url).searchParams.get("dry") === "1") return Response.json({ ok: true, dry: true, ...counts });
    // A bounded run leaves unclaimed and interrupted work for the next run. Each claim rechecks eligibility.
    const stopAt = Date.now() + 45_000;
    for (const id of ids) {
      if (Date.now() >= stopAt) break;
      try {
        const result = await runFamilyDeletion(db, id);
        counts[result.state]++;
        if (result.state === "deleted") counts.images += result.images;
      } catch { counts.failed++; }
    }
    return Response.json({ ok: counts.failed === 0, ...counts });
  } catch (e) {
    console.error("[deletion] retention unavailable", e instanceof Error ? e.message : "failed");
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
