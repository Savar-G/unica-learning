import { isUuid } from "@/lib/assessment-store";
import { cleanGoals } from "@/lib/child-goals";
import { saveChildGoals } from "@/lib/child-goals-server";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

const BODY_MAX = 1024;

type GoalsError = "forbidden" | "bad_json" | "too_large" | "signed_out" | "not_found" | "invalid" | "store_failed";
const reply = (status: number, body: { ok: boolean; error?: GoalsError }) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (error: GoalsError, status: number) => reply(status, { ok: false, error });

// A parent saves the three goal answers for one child (D-325), on /account/goals right after signup. JSON and the
// site's origin only. The desk lock (423) is in src/proxy.ts. The parent comes from the session; the child must be one
// the parent's session can read. The server's key writes the row (public.child_goals: parents have no write right).
export async function POST(request: Request, { params }: RouteContext<"/api/account/children/[id]/goals">) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("forbidden", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("bad_json", 415);
  if (Number(request.headers.get("content-length") ?? 0) > BODY_MAX) return fail("too_large", 413);
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) return fail("signed_out", 401);

  const { id } = await params;
  if (!isUuid(id)) return fail("not_found", 404);
  const raw = await request.text();
  if (raw.length > BODY_MAX) return fail("too_large", 413);
  let goals;
  try {
    goals = cleanGoals(JSON.parse(raw));
  } catch {
    return fail("bad_json", 400);
  }
  if (!goals) return fail("invalid", 400);

  // The parent filter keeps an admin's own account to their own children.
  const { data: child, error } = await db.from("children").select("id").eq("id", id).eq("parent_id", parent).maybeSingle();
  if (error) return fail("store_failed", 502);
  if (!child) return fail("not_found", 404);

  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  if (!(await saveChildGoals(admin, parent, id, goals))) return fail("store_failed", 502);
  return reply(200, { ok: true });
}
