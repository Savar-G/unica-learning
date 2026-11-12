import { progressSnapshot } from "@/lib/admin-progress";
import { adminSession, progressRows } from "@/lib/admin-store";

// Live test progress for the admin pages (admin-progress.ts): POST {"ids": [...]} gives those tests (up to PROGRESS_MAX).
// The ids go in the body, not the address: a page can watch up to 500 tests, too long for one request URL. Admins only,
// with the same checks as the other admin routes (a live admin, the site's own origin, and JSON): everyone else gets 404
// and nothing is read. The admin's browser asks every few seconds while the page is open, so the answer is small: one
// short row per test (public.admin_test_progress_for).
export async function POST(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("Unsupported media type", { status: 415 });
  const noStore = { "cache-control": "no-store" };
  let ids: unknown;
  try { ids = ((await request.json()) as { ids?: unknown } | null)?.ids; }
  catch { ids = null; }
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) return Response.json({ error: "ids_required" }, { status: 400, headers: noStore });
  try {
    const rows = await progressRows(admin, ids);
    return Response.json(progressSnapshot(rows, new Date()), { headers: noStore });
  } catch (e) {
    console.error("[admin] progress failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "read_failed" }, { status: 503, headers: noStore });
  }
}
