import { adminSession } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/assessment-store";
import { emailConfigProblem } from "@/lib/email-delivery";
import { workbookDelivery } from "@/lib/workbook-email";
import { sendWorkbookNotice } from "@/lib/workbook-email-server";

export async function POST(request: Request, ctx: RouteContext<"/api/admin/cards/[id]/workbook-email">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("JSON required", { status: 415 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let value: unknown;
  try { value = await request.json(); } catch { return Response.json({ error: "invalid" }, { status: 400 }); }
  if (!value || typeof value !== "object") return Response.json({ error: "invalid" }, { status: 400 });
  const body = value as Record<string, unknown>;
  if (body.kind !== "welcome" && body.kind !== "dispatch") return Response.json({ error: "invalid" }, { status: 400 });
  const number = body.kind === "welcome" ? 0 : body.workbookNumber;
  const delivery = body.kind === "dispatch" ? workbookDelivery(body.delivery) : null;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 0 || number > 10000
    || (body.kind === "dispatch" && (!delivery || number < 1))) return Response.json({ error: "invalid" }, { status: 400 });
  const db = adminClient();
  if (!db || emailConfigProblem()) return Response.json({ error: "unavailable" }, { status: 503 });
  try {
    const result = await sendWorkbookNotice(db, { cardId: id.toLowerCase(), kind: body.kind, workbookNumber: number, delivery });
    return Response.json({ status: result.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    if (message === "card_not_saved") return Response.json({ error: "card_not_saved" }, { status: 409 });
    if (message.includes("welcome_sending")) return Response.json({ error: "welcome_sending" }, { status: 409 });
    console.error("[workbook email] send failed before provider call", message);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
