import { cookies } from "next/headers";
import { adminSession } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { sameOrigin } from "@/lib/desk-server";
import { DESK_COOKIE, deskAccess } from "@/lib/desk";
import { contactInput } from "@/lib/customer-activity";

export async function POST(request: Request) {
  const reply = (status: number) => Response.json({ ok: status === 200 }, { status, headers: { "Cache-Control": "no-store" } });
  const admin = await adminSession();
  if (!admin) return reply(404);
  if (!sameOrigin(request)) return reply(403);
  if (deskAccess((await cookies()).get(DESK_COOKIE)?.value, admin.userId).state === "open") return reply(423);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415);
  if (Number(request.headers.get("content-length")) > 14000) return reply(413);
  let input;
  try { const raw = await request.text(); if (raw.length > 14000) return reply(413); input = contactInput(JSON.parse(raw)); }
  catch { return reply(400); }
  if (!input) return reply(400);
  const db = adminClient(AbortSignal.timeout(5000), { retry: false });
  if (!db) return reply(503);
  try {
    const { data, error } = await db.rpc("record_customer_activity", { p_parent: input.parent, p_child: input.child, p_book: null,
      p_request: input.request, p_event: "contact_note", p_page: null, p_actor: admin.userId, p_note: input.note });
    return reply(error ? 503 : data === "saved" || data === "duplicate" ? 200 : data === "rate_limited" ? 429 : 403);
  } catch { return reply(503); }
}
