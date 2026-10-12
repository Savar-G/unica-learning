import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/sign-in-link";
import { sessionClient } from "@/lib/supabase-auth";

// Google sends the parent back here through Supabase (#63). The code becomes a session in this browser's cookies.
// A parent who is new to us has no parent row yet; /account sends them to /account/finish.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const { error } = code ? await (await sessionClient()).auth.exchangeCodeForSession(code) : { error: new Error("no code") };
  if (error) {
    console.error("[account] google sign-in failed", error.message);
    return NextResponse.redirect(new URL("/sign-in?error=google", request.url), 303);
  }
  return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url), 303);
}
