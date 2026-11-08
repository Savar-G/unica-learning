import { isUuid } from "@/lib/assessment-store";
import { startCardUpdate } from "@/lib/billing";
import { liveCardUpdates } from "@/lib/billing-server";
import { planManagementAccess } from "@/lib/parent-dashboard-access";
import { ACCOUNT_PATH } from "@/lib/parent-shell";
import { parentId, sessionClient } from "@/lib/supabase-auth";

const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status });

// The Account tab's "Update card" (#554): answers with Stripe's hosted page. Behind planManagementAccess, so a family with a
// failed payment can pay, and a family with no plan and no dashboard gets the same 404 as an unknown row. JSON and the site's origin only: a form on another site cannot
// send it with the parent's cookies. The body names only the card setup; the Stripe customer comes from the parent's row.
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  if (request.headers.get("origin") !== origin) return fail("forbidden", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("bad_json", 415);
  const parent = await parentId(await sessionClient());
  if (!parent) return fail("signed_out", 401);
  if (!(await planManagementAccess(parent))) return fail("not_found", 404);
  let body: { card?: unknown } | null;
  try { body = await request.json(); } catch { return fail("bad_json", 400); }
  if (typeof body?.card !== "string" || !isUuid(body.card)) return fail("invalid", 400);
  const seams = liveCardUpdates();
  if (!seams) return fail("unavailable", 503);
  const result = await startCardUpdate(parent, body.card.toLowerCase(), {
    returnUrl: `${origin}/api/account/card-update/return`,
    cancelUrl: `${origin}${ACCOUNT_PATH}?card=unchanged`,
  }, seams);
  if (!result.ok) return fail(result.error, result.error === "not_found" ? 404 : 502);
  return Response.json({ ok: true, url: result.url });
}
