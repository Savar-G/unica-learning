import { NextResponse } from "next/server";
import { closeDesk } from "@/lib/desk-server";
import { passwordIsFresh } from "@/lib/desk";
import { resetForgottenPin, type ForgotPinResult } from "@/lib/parent-pin-server";
import { sessionClient } from "@/lib/supabase-auth";

// Forgot PIN (#301): body `{ pin }`. The desk's form first signs in again in the browser with the account password
// (Supabase Auth limits those tries per device); this route then accepts only a session whose password sign-in is under
// 5 minutes old (its JWT's amr claim). The new PIN replaces the old one, and desk mode ends on this device. The parent
// comes from the session, never from the body. JSON only.
export async function POST(request: Request) {
  const reply = (status: number, body: ForgotPinResult) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, { ok: false, error: "bad_json" });
  const { data } = await (await sessionClient()).auth.getClaims();
  const parent = typeof data?.claims.sub === "string" ? data.claims.sub : null;
  if (!parent) return reply(401, { ok: false, error: "signed_out" });
  const body = await request.json().catch(() => null);
  const { status, result } = await resetForgottenPin(parent, body, passwordIsFresh(data?.claims, Math.floor(Date.now() / 1000)));
  const response = reply(status, result);
  if (result.ok) closeDesk(response);
  return response;
}
