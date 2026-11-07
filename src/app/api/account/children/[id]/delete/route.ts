import { isUuid } from "@/lib/assessment-store";
import { childDeletePlans, childDeleteStore, runChildDeletion } from "@/lib/child-delete-server";
import { codeProof } from "@/lib/family-delete-code";
import { requestFamilyDelete } from "@/lib/family-delete";
import { supabaseDeleteCodes } from "@/lib/family-delete-server";
import { familyRetryTime } from "@/lib/family-time-server";
import { planManagementAccess } from "@/lib/parent-dashboard-access";
import { stripe } from "@/lib/stripe";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

export const maxDuration = 60;
const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== `${url.protocol}//${request.headers.get("host") ?? url.host}`) return reply(403, { ok: false, error: "forbidden" });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  const user = data.user;
  if (!user?.email || !user.email_confirmed_at) return reply(401, { ok: false, error: "signed_out" });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await planManagementAccess(user.id))) return reply(404, { ok: false, error: "not_found" });
  let body: unknown;
  try { body = await request.json(); } catch { return reply(400, { ok: false, error: "invalid" }); }
  const service = adminClient(AbortSignal.timeout(45_000));
  const s = stripe();
  if (!service || !s) return reply(503, { ok: false, error: "unavailable" });
  const parent = user.id.toLowerCase(), child = id.toLowerCase();
  try {
    const result = await requestFamilyDelete(parent, body, codeProof(supabaseDeleteCodes(service), parent, user.email, { child }), {
      store: childDeleteStore(service, child), plans: childDeletePlans(service, s, child),
    });
    if (!result.ok) {
      if (result.error === "locked") return reply(429, { ...result, ...await familyRetryTime(db, result.retryAt) });
      const statuses = { invalid: 400, wrong_code: 403, code_ended: 403, protected: 403, not_found: 404, busy: 409, plan_start: 409, not_finished: 502, unavailable: 503 };
      return reply(statuses[result.error], result);
    }
    // The request is durable. A failed copy or file removal stays pending for the scheduled retry.
    let state: "deleted" | "pending" = "pending";
    try { state = await runChildDeletion(service, parent, child); }
    catch { console.error("[child-delete] saved request needs retry"); }
    return reply(200, { ...result, state });
  } catch {
    // A request write can have succeeded with its answer lost. Do not claim that nothing changed.
    return reply(503, { ok: false, error: "unavailable" });
  }
}
