import { NextResponse } from "next/server";
import { closeDesk, passwordProver } from "@/lib/desk-server";
import { resetForgottenPin, serverPins, type ForgotPinResult } from "@/lib/parent-pin-server";
import { sessionClient } from "@/lib/supabase-auth";

// Forgot PIN (#301, review R349-1): body `{ password, pin }`. The request carries the account password, which the
// server checks with Supabase Auth on a client of its own; a session that signed in before the desk opened proves
// nothing. Password tries have their own limit per parent (claim_pin_reset_attempt). A right password replaces the
// PIN and ends desk mode on this device. The parent and the email come from the session, never from the body. JSON only.
export async function POST(request: Request) {
  const reply = (status: number, body: ForgotPinResult) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const { data } = await (await sessionClient()).auth.getUser();
  const user = data.user;
  if (!user?.email) return reply(401, { ok: false, error: "signed_out" });
  const body = await request.json().catch(() => null);
  const { status, result } = await resetForgottenPin(user.id, body, passwordProver(user.id, user.email), serverPins());
  const response = reply(status, result);
  if (result.ok) closeDesk(response);
  return response;
}
