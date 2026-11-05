import { emailConfigProblem, sendEmail } from "@/lib/email-delivery";
import { requestDeleteCode } from "@/lib/family-delete-code";
import { supabaseDeleteCodes, supabaseDeleteStore } from "@/lib/family-delete-server";
import { familyRetryTime } from "@/lib/family-time-server";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const STATUS = { no_confirmed_email: 409, protected: 403, not_found: 404, busy: 409, email_failed: 502, unavailable: 503 } as const;

// "Email me a code" for the family delete (D-255). JSON and the site's origin only; while the child's desk is open,
// src/proxy.ts answers this path with 423. The body is not read: the address is the one the Auth server gives for this session.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply(403, { ok: false, error: "forbidden" });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  const user = data.user;
  if (!user) return reply(401, { ok: false, error: "signed_out" });
  if (!(await parentDashboardAccess(user.id))) return reply(404, { ok: false, error: "not_found" });
  const service = adminClient();
  if (!service) return reply(503, { ok: false, error: "unavailable" });

  let result;
  try {
    result = await requestDeleteCode(user.id.toLowerCase(), { email: user.email, confirmed: Boolean(user.email_confirmed_at) }, {
      codes: supabaseDeleteCodes(service), store: supabaseDeleteStore(service), send: (message) => sendEmail(message), configProblem: emailConfigProblem,
    });
  } catch (e) {
    console.error("[family-delete] code failed", e instanceof Error ? e.message : "failed");
    return reply(503, { ok: false, error: "unavailable" });
  }
  if (result.ok) return reply(200, result);
  if (result.error === "too_many" || result.error === "locked") return reply(429, { ...result, ...await familyRetryTime(db, result.retryAt) });
  return reply(STATUS[result.error], result);
}
