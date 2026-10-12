import { cleanChild, cleanDetails, fail, validPassword, type AccountResult, type FinishPayload } from "@/lib/account";
import { createFamily, isPhone, linkOrigin, sendSignInLink } from "@/lib/account-server";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

// The one step that writes a family: the parent row and the first child (#63, #82). The parent proved their email
// before this, with the email code (password signup) or with Google, so the id and the email come from that session,
// never from the request body. Password signup sends its password here: it is set only now, after the proof, so a
// password that someone else chose for this email before the owner confirmed it never stays on the account.
// An existing account changes nothing: no new child, and its password stays the same.
export async function POST(request: Request) {
  const { data: { user } } = await (await sessionClient()).auth.getUser();
  if (!user?.email) return fail("signed_out", 401);
  if (!user.email_confirmed_at) return fail("unconfirmed", 403);

  let body: Partial<FinishPayload>;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  const details = cleanDetails(body);
  const child = cleanChild(body.child);
  if (!details || !child || (body.password !== undefined && !validPassword(body.password))) return fail("invalid", 400);

  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  const { data: existing, error: readError } = await admin.from("parents").select("id").eq("id", user.id).maybeSingle();
  if (readError) {
    console.error("[account] parent read failed", readError.message);
    return fail("store_failed", 502);
  }
  if (existing) return Response.json({ ok: true, existing: true } satisfies AccountResult);

  if (body.password !== undefined) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password: body.password });
    if (error) {
      if (error.code === "weak_password") return fail("weak_password", 400);
      console.error("[account] password save failed", error.code, error.message);
      return fail("store_failed", 502);
    }
  }

  const family = await createFamily(admin, user.id, { ...details, email: user.email.toLowerCase() }, child);
  if (family.status === "exists") return Response.json({ ok: true, existing: true } satisfies AccountResult);
  if (family.status === "busy") return fail("busy", 429);
  if (family.status === "unavailable") return fail("unavailable", 409);
  if (family.status !== "created") return fail("store_failed", 502);

  const linkSent = isPhone(request.headers) && (await sendSignInLink(admin, user.id, family.child, linkOrigin(request))) === "sent";
  return Response.json({ ok: true, linkSent } satisfies AccountResult);
}
