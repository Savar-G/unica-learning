import { cookies } from "next/headers";
import { parentId, sessionClient, adminClient } from "@/lib/supabase-auth";
import { activityInput, ACTIVITY_CONSENT_COOKIE, telemetryRequestAllowed } from "@/lib/customer-activity";

export async function POST(request: Request) {
  const reply = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (!telemetryRequestAllowed(request, (await cookies()).get(ACTIVITY_CONSENT_COOKIE)?.value)) return reply(403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415);
  if (Number(request.headers.get("content-length")) > 1000) return reply(413);
  const parent = await parentId(await sessionClient());
  if (!parent) return reply(401);
  let input;
  try { const raw = await request.text(); if (raw.length > 1000) return reply(413); input = activityInput(JSON.parse(raw)); }
  catch { return reply(400); }
  if (!input) return reply(400);
  const db = adminClient(AbortSignal.timeout(4000), { retry: false });
  if (!db) return reply(503);
  try {
    const { data, error } = await db.rpc("record_customer_activity", { p_parent: parent, p_child: input.child, p_book: input.book,
      p_request: input.request, p_event: input.event, p_page: input.page, p_actor: parent, p_note: null });
    if (error) return reply(503);
    return reply(data === "saved" || data === "duplicate" ? 204 : data === "rate_limited" ? 429 : 403);
  } catch { return reply(503); }
}
