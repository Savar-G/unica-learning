import { parentId, sessionClient } from "@/lib/supabase-auth";
import { savePin, type PinFormResult } from "@/lib/parent-pin-server";

// The parent sets or changes their PIN (#300). The parent comes from the session cookie, never from the request body.
// JSON only: a form on another site cannot send it with the parent's cookies. A PIN that is already set needs the
// current PIN, which counts against the attempt limit. The PIN is checked and hashed on the server and never logged.
export async function POST(request: Request) {
  const reply = (status: number, body: PinFormResult | { ok: false; error: "signed_out" | "bad_json" }) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const id = await parentId(await sessionClient());
  if (!id) return reply(401, { ok: false, error: "signed_out" });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(400, { ok: false, error: "bad_json" });
  }
  const { status, result } = await savePin(id, body);
  return reply(status, result);
}
