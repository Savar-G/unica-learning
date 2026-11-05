import { cookies } from "next/headers";
import { after } from "next/server";
import { passwordProver } from "@/lib/desk-server";
import { FAMILY_DELETED_PATH, PLANS_STOPPED_COOKIE, requestFamilyDelete } from "@/lib/family-delete";
import { familyDeleteAlert, finishFamilyDelete, stripeFamilyPlans, supabaseDeleteStore } from "@/lib/family-delete-server";
import { familyRetryTime } from "@/lib/family-time-server";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { LAST_CHILD_COOKIE } from "@/lib/parent-shell";
import { stripe } from "@/lib/stripe";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

// The deletion runs after the answer, with its own limits, and the daily job takes over if it stops.
export const maxDuration = 120;

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const STATUS = { invalid: 400, wrong_password: 403, protected: 403, not_found: 404, busy: 409, locked: 429, not_finished: 502, unavailable: 503 } as const;

/**
 * Ends every device's session, with one retry. Supabase answers a failure as `{ error }`, and only a broken network call
 * rejects, so both count. A failure changes nothing about the request: the deletion removes the Auth user and its sessions,
 * and until then src/proxy.ts refuses this family on the account paths, whatever access token a device still has.
 */
async function endEverySession(db: Awaited<ReturnType<typeof sessionClient>>): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await db.auth.signOut({ scope: "global" });
      if (!error) return true;
      console.error("[family-delete] sign-out failed", error.code ?? error.status ?? "failed");
    } catch (e) {
      console.error("[family-delete] sign-out failed", e instanceof Error ? e.message : "failed");
    }
  }
  return false;
}

// The parent deletes the whole family (#556): body `{ password, confirm }`. JSON and the site's origin only. While the
// child's desk is open, src/proxy.ts answers this path with 423. The parent and the email come from the session, and the
// password is checked on a client of its own. See src/lib/family-delete.ts for the order of the steps.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply(403, { ok: false, error: "forbidden" });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const db = await sessionClient();
  const { data } = await db.auth.getUser();
  const user = data.user;
  if (!user?.email) return reply(401, { ok: false, error: "signed_out" });
  if (!(await parentDashboardAccess(user.id))) return reply(404, { ok: false, error: "not_found" });
  let body: unknown;
  try { body = await request.json(); } catch { return reply(400, { ok: false, error: "invalid" }); }
  const service = adminClient();
  const s = stripe();
  if (!service || !s) return reply(503, { ok: false, error: "unavailable" });

  const parent = user.id.toLowerCase();
  let result;
  try {
    result = await requestFamilyDelete(parent, body, passwordProver(user.id, user.email), { store: supabaseDeleteStore(service), plans: stripeFamilyPlans(service, s) });
  } catch (e) {
    console.error("[family-delete] request failed", e instanceof Error ? e.message : "failed");
    return reply(503, { ok: false, error: "unavailable" });
  }
  if (!result.ok) {
    if (result.error === "locked") return reply(429, { ...result, ...await familyRetryTime(db, result.retryAt) });
    if (result.error === "not_finished" && result.plansStopped > 0) {
      const plansStopped = result.plansStopped;
      after(() => familyDeleteAlert(parent, { plansStopped, state: "not_queued" }));
    }
    return reply(STATUS[result.error], result);
  }

  // The request is saved, so the rest cannot change the answer. Every device signs out while the Auth user still exists.
  await endEverySession(db);
  const jar = await cookies();
  for (const { name } of jar.getAll()) if (/^sb-.+-auth-token/.test(name)) jar.delete(name);
  jar.set({ name: LAST_CHILD_COOKIE, value: "", path: "/account", maxAge: 0 });
  jar.set({ name: PLANS_STOPPED_COOKIE, value: "1", path: FAMILY_DELETED_PATH, maxAge: 24 * 3600, httpOnly: true, secure: true, sameSite: "lax" });
  const plansStopped = result.plansStopped;
  after(() => finishFamilyDelete(parent, plansStopped));
  return reply(200, { ok: true });
}
