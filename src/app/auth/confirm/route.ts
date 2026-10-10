import { NextResponse, type NextRequest } from "next/server";
import { pilotOn } from "@/lib/pilot";
import { safeNext } from "@/lib/sign-in-link";
import { sessionClient } from "@/lib/supabase-auth";

// The password reset email links here (#63). Its Supabase template builds the link from the redirect URL and the
// token hash: {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery. A token hash, unlike a code, works on any
// device, so a parent can ask on the laptop and open the email on a phone.
export async function GET(request: NextRequest) {
  if (!pilotOn()) return new Response(null, { status: 404 });
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const { error } = tokenHash && params.get("type") === "recovery"
    ? await (await sessionClient()).auth.verifyOtp({ type: "recovery", token_hash: tokenHash })
    : { error: new Error("bad link") };
  if (error) return NextResponse.redirect(new URL("/sign-in/reset?expired=1", request.url), 303);
  return NextResponse.redirect(new URL(safeNext(params.get("next")), request.url), 303);
}
