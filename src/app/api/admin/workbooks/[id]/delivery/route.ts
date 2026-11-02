import { adminSession } from "@/lib/admin-store";
import { confirmDelivery } from "@/lib/workbook-delivery";
import { workbookDeliveryStore } from "@/lib/workbook-delivery-store";
import { familyProvince, familyZone } from "@/lib/family-time";
import { isUuid } from "@/lib/workbook-content";
import { toJson } from "@/lib/database";

export async function POST(request: Request, ctx: RouteContext<"/api/admin/workbooks/[id]/delivery">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.localTime !== "string" || typeof body.childId !== "string" || typeof body.number !== "number") return Response.json({ status: "refused", reason: "invalid_time" }, { status: 400 });
  try {
    const book = await admin.db.from("workbooks").select("parent_id").eq("id", id).maybeSingle();
    if (book.error) throw book.error;
    if (!book.data) return new Response("Not found", { status: 404 });
    const [parent, children] = await Promise.all([
      admin.db.rpc("admin_parents").select("time_zone, postal").eq("id", book.data.parent_id).maybeSingle(),
      admin.db.rpc("admin_children").select("id, province, created_at").eq("parent_id", book.data.parent_id),
    ]);
    if (parent.error || children.error || !parent.data) throw new Error("Family unavailable");
    // Preserve the saved zone when retrying, even if the family later moves.
    const store = workbookDeliveryStore(admin.db);
    const saved = await store.receipt(id);
    const timeZone = saved?.timeZone ?? familyZone({ timeZone: parent.data.time_zone, postal: parent.data.postal, province: familyProvince(children.data) });
    if (JSON.stringify(toJson(body.timeZone)) !== JSON.stringify(toJson(timeZone))) return Response.json({ status: "refused", reason: "zone_changed" }, { status: 409 });
    const result = await confirmDelivery(store, { workbookId: id, childId: body.childId, number: body.number, localTime: body.localTime, timeZone }, Date.now());
    return Response.json(result, { status: result.status === "confirmed" ? 200 : 409, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ status: "refused", reason: "unavailable" }, { status: 503 });
  }
}
