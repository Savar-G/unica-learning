import { NextResponse } from "next/server";
import { closeDesk } from "@/lib/desk-server";
import { checkParentPin } from "@/lib/parent-pin-server";
import { parentId, sessionClient } from "@/lib/supabase-auth";
import type { LeaveResult } from "@/lib/desk";

// Leaving the child's desk (#301): body `{ pin }`, the signed-in parent's PIN (#300), checked on the server. The parent
// comes from the session, never from the body. A right PIN ends desk mode on this device; a wrong one costs an attempt.
// JSON only, so a form on another site cannot send it.
export async function POST(request: Request) {
  const reply = (status: number, body: LeaveResult) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const parent = await parentId(await sessionClient());
  if (!parent) return reply(401, { ok: false, error: "signed_out" });
  const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
  if (typeof body?.pin !== "string") return reply(400, { ok: false, error: "invalid" });
  const result = await checkParentPin(parent, body.pin);
  if (!result.ok) {
    const status = result.error === "locked" ? 429 : result.error === "wrong" ? 403 : result.error === "unavailable" ? 503 : 400;
    return reply(status, result);
  }
  const response = reply(200, { ok: true });
  closeDesk(response);
  return response;
}
