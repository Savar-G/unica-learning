import { userAgent } from "next/server";
import { cleanChild, cleanParent, fail, type AccountResult, type AccountSignupPayload } from "@/lib/account";
import { createParent, linkOrigin, sendSignInLink, signupCap } from "@/lib/account-server";
import { pilotOn } from "@/lib/pilot";
import { adminClient } from "@/lib/supabase-auth";

// Creates the parent's auth user, parent row and first child with the secret key, then the browser signs in with the
// password. The user is created already confirmed: the pilot does not ask parents to confirm their email.
// On a phone, the parent also gets the sign-in link for the laptop or tablet (#63, D-082).
// Known pilot risk: "account_exists" tells a caller that an email has an account.
export async function POST(request: Request) {
  if (!pilotOn()) return fail("off", 404);
  let body: Partial<AccountSignupPayload>;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  // Bots fill every field; pretend it worked so they move on.
  if (body.website) return Response.json({ ok: true } satisfies AccountResult);

  const parent = cleanParent(body);
  const child = cleanChild(body.child);
  if (!parent || !child) return fail("invalid", 400);

  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);

  const cap = await signupCap(admin);
  if (cap) return cap === "busy" ? fail("busy", 429) : fail("store_failed", 502);

  const { data, error } = await admin.auth.admin.createUser({
    email: parent.email,
    password: parent.password,
    email_confirm: true,
    user_metadata: { name: parent.name },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.code === "user_already_exists") return fail("account_exists", 409);
    if (error?.code === "weak_password") return fail("weak_password", 400);
    console.error("[account] create user failed", error?.code, error?.message);
    return fail("store_failed", 502);
  }

  const id = data.user.id;
  const childId = await createParent(admin, id, parent, child);
  if (!childId) {
    // Remove the half-made account, so the parent can try again with the same email.
    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) console.error("[account] ORPHAN auth user, delete it in the dashboard:", id, deleteError.message);
    return fail("store_failed", 502);
  }

  const phone = userAgent(request).device.type === "mobile";
  const linkSent = phone && (await sendSignInLink(admin, id, childId, linkOrigin(request))) === "sent";
  return Response.json({ ok: true, linkSent } satisfies AccountResult);
}
