import { NextResponse } from "next/server";
import { hashToken, startPath } from "@/lib/sign-in-link";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

// The button on /sign-in/link posts here (#63). Opening the link only shows that page, so a mail scanner that opens
// links cannot use up a parent's link. This marks the link used, signs the parent in on this device and opens the
// child's start screen.
export async function POST(request: Request) {
  // Only our own page may post here. Another site could otherwise sign a visitor in to the account of whoever owns the link.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const token = (await request.formData().catch(() => null))?.get("t");
  const back = (error: boolean) =>
    NextResponse.redirect(new URL(`/sign-in/link?t=${encodeURIComponent(String(token ?? ""))}${error ? "&error=1" : ""}`, request.url), 303);

  const hash = hashToken(token);
  const admin = adminClient();
  if (!hash || !admin) return back(!!hash);

  // One statement, so two clicks at the same moment cannot both use the link.
  const now = new Date().toISOString();
  const { data: link } = await admin.from("sign_in_links")
    .update({ used_at: now })
    .eq("token_hash", hash).is("used_at", null).gt("expires_at", now)
    .select("parent_id, child_id").maybeSingle();
  if (!link) return back(false);

  // A magic link made here and verified at once: it starts a normal Supabase session in this browser's cookies.
  // Supabase sends no email for it.
  const { data: user } = await admin.auth.admin.getUserById(link.parent_id);
  const email = user.user?.email;
  const generated = email ? await admin.auth.admin.generateLink({ type: "magiclink", email }) : null;
  const tokenHash = generated?.data.properties?.hashed_token;
  const { error } = tokenHash ? await (await sessionClient()).auth.verifyOtp({ type: "email", token_hash: tokenHash }) : { error: generated?.error ?? new Error("no email") };
  if (error) {
    console.error("[account] link sign-in failed", link.parent_id, error.message);
    return back(true);
  }
  // ?via=link lets the start screen count sign-ins by link.
  return NextResponse.redirect(new URL(`${startPath(link.child_id)}?via=link`, request.url), 303);
}
