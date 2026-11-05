import { isUuid } from "@/lib/assessment-store";
import { childDeleteStore } from "@/lib/child-delete-server";
import { emailConfigProblem, sendEmail } from "@/lib/email-delivery";
import { requestDeleteCode } from "@/lib/family-delete-code";
import { supabaseDeleteCodes } from "@/lib/family-delete-server";
import { familyRetryTime } from "@/lib/family-time-server";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

const reply = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== `${url.protocol}//${request.headers.get("host") ?? url.host}`) return reply(403, { ok: false, error: "forbidden" });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  const user = data.user;
  if (!user) return reply(401, { ok: false, error: "signed_out" });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await parentDashboardAccess(user.id))) return reply(404, { ok: false, error: "not_found" });
  const service = adminClient();
  if (!service) return reply(503, { ok: false, error: "unavailable" });
  try {
    const result = await requestDeleteCode(user.id.toLowerCase(), { email: user.email, confirmed: !!user.email_confirmed_at }, {
      action: { child: id.toLowerCase() }, codes: supabaseDeleteCodes(service), store: childDeleteStore(service, id.toLowerCase()), send: message => sendEmail(message), configProblem: emailConfigProblem,
    });
    if (result.ok) return reply(200, result);
    if (result.error === "locked" || result.error === "too_many") return reply(429, { ...result, ...await familyRetryTime(db, result.retryAt) });
    const statuses = { no_confirmed_email: 409, protected: 403, busy: 409, plan_start: 409, not_found: 404, unavailable: 503, email_failed: 502 };
    return reply(statuses[result.error], result);
  } catch {
    return reply(503, { ok: false, error: "unavailable" });
  }
}
