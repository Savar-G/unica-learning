import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { normalizeTimeZone } from "@/lib/family-time";

// The family's time zone (#330): Parent home sends the browser's IANA time zone once, and the server stores it only
// when none is stored yet, so Maya's weekly minutes start on the family's own Monday. The parent comes from the
// session cookie. JSON only: a form on another site cannot send it with the parent's cookies.
export async function POST(request: Request) {
  const reply = (status: number, body: { ok: boolean; error?: string }) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const id = await parentId(await sessionClient());
  if (!id) return reply(401, { ok: false, error: "signed_out" });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { ok: false, error: "bad_json" });
  }
  const tz = normalizeTimeZone((body as { timeZone?: unknown } | null)?.timeZone);
  if (!tz) return reply(400, { ok: false, error: "bad_time_zone" });
  const db = adminClient();
  if (!db) return reply(503, { ok: false, error: "unavailable" });
  const { error } = await db.from("parents").update({ time_zone: tz }).eq("id", id).is("time_zone", null);
  if (error) {
    console.error("[account] time zone save failed", error.message);
    return reply(503, { ok: false, error: "unavailable" });
  }
  return reply(200, { ok: true });
}
