import { isUuid } from "@/lib/assessment-store";
import { reportPath } from "@/lib/report-view";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import { testFail } from "@/lib/test-api";

// Whether the report of the parent's finished test is built yet: its page, or null while the report job works. The end
// screen of the test asks this every few seconds, then opens the report. Read with the parent's session (RLS: own rows).
export async function GET(_request: Request, ctx: RouteContext<"/api/account/assessments/[id]/report">) {
  const db = await sessionClient();
  const parent = await parentId(db);
  if (!parent) return testFail("signed_out", 401);
  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);
  const { data, error } = await db.from("reports").select("id").eq("assessment_id", id).maybeSingle();
  if (error) return testFail("store_failed", 503);
  return Response.json({ ok: true, href: data ? reportPath(data.id) : null }, { headers: { "Cache-Control": "no-store" } });
}
