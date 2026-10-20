import { progressSnapshot } from "@/lib/admin-progress";
import { adminSession, progressRows } from "@/lib/admin-store";

// Live test progress for the admin pages (admin-progress.ts): GET ?ids=a,b gives those tests; no ids gives every test a
// child can go on with now. Admins only, as the other admin routes: everyone else gets 404 and nothing is read. The
// admin's browser asks every few seconds while the page is open, so the answer is small: no answers, no stored test.
export async function GET(request: Request) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  const raw = new URL(request.url).searchParams.get("ids");
  const now = new Date();
  try {
    const rows = await progressRows(admin, now, raw ? raw.split(",") : undefined);
    return Response.json(progressSnapshot(rows, now), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[admin] progress failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "read_failed" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
