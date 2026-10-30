import { NextResponse } from "next/server";
import { closeDesk, passwordProver } from "@/lib/desk-server";
import { resetForgottenPin, type ForgotPinResult } from "@/lib/parent-pin-server";
import { sessionClient } from "@/lib/supabase-auth";

// Forgot PIN (#301): body `{ password, pin }`. The parent enters their account password (checked by Supabase Auth on a
// client of its own) and a new PIN. The new PIN replaces the old one, and desk mode ends on this device. The parent and
// the email come from the session, never from the body. JSON only.
export async function POST(request: Request) {
  const reply = (status: number, body: ForgotPinResult) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const { data } = await (await sessionClient()).auth.getUser();
  const user = data.user;
  if (!user?.email) return reply(401, { ok: false, error: "signed_out" });
  const body = await request.json().catch(() => null);
  const { status, result } = await resetForgottenPin(user.id, body, passwordProver(user.id, user.email));
  const response = reply(status, result);
  if (result.ok) closeDesk(response);
  return response;
}
