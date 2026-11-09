import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { checkOpenCancel } from "@/lib/plan-cancel-admin-server";
import { adminClient } from "@/lib/supabase-auth";
import { stripeWithin } from "@/lib/stripe";

export const maxDuration = 60;
const unavailable = () => Response.json({ ok: false, message: "The check could not finish. Refresh this page before you try again." }, { status: 503 });

export async function POST(request: Request, ctx: RouteContext<"/api/admin/parents/[id]/plan-cancels/[operation]">) {
  const signal = AbortSignal.timeout(50_000);
  if (!await adminSession(signal)) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("Unsupported media type", { status: 415 });
  const { id, operation } = await ctx.params;
  if (!isUuid(id) || !isUuid(operation)) return new Response("Not found", { status: 404 });
  const db = adminClient(signal, { retry: false }), client = stripeWithin(signal);
  if (!db || !client) return unavailable();
  try {
    const result = await checkOpenCancel(db, client, id.toLowerCase(), operation.toLowerCase());
    if (result.ok) return Response.json({ ok: true, message: result.state === "applied"
      ? "Stripe shows that the plan is cancelled or scheduled to end. This Cancel is closed."
      : "Stripe shows no scheduled cancellation for the current plan. This Cancel is closed. The parent can press Cancel again." });
    if (result.error === "stripe_unavailable") return Response.json({ ok: false, message: "Stripe could not be read. This Cancel is still open. Try again later." }, { status: 503 });
    if (result.error === "too_soon") return Response.json({ ok: false, message: "This Cancel is less than ten minutes old. Wait until ten minutes have passed, then check again." }, { status: 409 });
    if (result.error === "not_found") return Response.json({ ok: false, message: "This family has no open Cancel with that request. Refresh this page." }, { status: 404 });
    return unavailable();
  } catch { return unavailable(); }
}
