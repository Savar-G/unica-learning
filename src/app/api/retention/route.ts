import { timingSafeEqual } from "node:crypto";
import { runRetentionBatch } from "@/lib/assessment";
import { advanceDeletionCursor, deletionCandidates, deletionCursor, runFamilyDeletion } from "@/lib/family-deletion-store";
import { adminClient } from "@/lib/supabase-auth";

export const maxDuration = 60;

/** Daily Vercel cron. Dry mode reads the full paged set and returns counts only. No email or analytics. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  const stopAt = Date.now() + 45_000;
  const db = adminClient(AbortSignal.timeout(55_000));
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const counts = { eligible: 0, deleted: 0, busy: 0, excluded: 0, failed: 0, images: 0, copies: 0 };
  try {
    const ids = await deletionCandidates(db);
    counts.eligible = ids.length;
    if (new URL(request.url).searchParams.get("dry") === "1") return Response.json({ ok: true, dry: true, ...counts });
    const result = await runRetentionBatch(ids, {
      async cursor() { return deletionCursor(db); },
      async advance(id) { await advanceDeletionCursor(db, id); },
      async run(id, limitMs) {
        const worker = adminClient(AbortSignal.timeout(limitMs));
        if (!worker) throw new Error("Deletion unavailable");
        return runFamilyDeletion(worker, id, db, Date.now() + limitMs);
      },
    }, () => stopAt - Date.now());
    return Response.json({ ok: result.failed === 0, ...result });
  } catch (e) {
    console.error("[deletion] retention unavailable", e instanceof Error ? e.message : "failed");
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
