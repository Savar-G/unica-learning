import { after } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { cancelFamilyPlan, planCancelledAlert } from "@/lib/parent-plan-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";

const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status });

// The parent's "Cancel plan" button. JSON and the site's origin only: a form on another site cannot send it with the
// parent's cookies. The body names only the card setup; the Stripe customer comes from the parent's own row.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("forbidden", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("bad_json", 415);
  const parent = await parentId(await sessionClient());
  if (!parent) return fail("signed_out", 401);
  let body: { card?: unknown };
  try { body = await request.json(); } catch { return fail("bad_json", 400); }
  if (typeof body?.card !== "string" || !isUuid(body.card)) return fail("invalid", 400);
  const card = body.card.toLowerCase();
  try {
    const result = await cancelFamilyPlan(parent, card);
    if (!result.ok) return fail(result.error, result.error === "unavailable" ? 503 : result.error === "not_found" ? 404 : 409);
    if (result.changed) after(() => planCancelledAlert(card, result.child, result.endsAt));
    return Response.json({ ok: true, endsAt: result.endsAt });
  } catch (e) {
    console.error("[plan] cancel failed", e instanceof Error ? e.message : "failed");
    return fail("failed", 502);
  }
}
