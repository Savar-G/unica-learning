import { randomBytes } from "node:crypto";
import { isAuthSessionMissingError, type AuthError } from "@supabase/supabase-js";
import { cleanChild, cleanDetails, fail, validPassword, type AccountResult, type FinishPayload } from "@/lib/account";
import { createFamily, isPhone, linkOrigin, sendSignInLink } from "@/lib/account-server";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

// The one step that writes a family: the parent row and the first child (#63, #82). The id and the email come from the
// session, never from the request body.
//
// Supabase keeps the first password of an unconfirmed address, so someone else may have set a password for this email
// before its owner proved it. Three rules keep that password away from a family:
// 1. Only a session that proved the email may make a family (the email code, a sign-in or reset link, or Google). A
//    password sign-in alone writes nothing.
// 2. Before any step that can fail, the password becomes one that nobody knows, and every other session ends. The
//    password from the signup form (or from /account/finish) is set after that.
// 3. An existing family changes nothing: no new child, no new password.
//
// Both password changes go through the parent's own session (PUT /auth/v1/user). Supabase Auth then ends every other
// session of the user in the same transaction and keeps the parent's. An admin password change (updateUserById) ends
// every session, the parent's too: the parent is signed out with a password nobody knows (2026-10-12, every first
// signup failed). Checked on the hosted project; see docs/assessment-signup.md.

/** Sign-in methods (the access token's amr claim) that prove the email: "otp" is the email code and every emailed link. */
const PROVED = new Set(["otp", "magiclink", "recovery", "email/signup", "invite", "oauth"]);

/** The sign-in methods recorded in a session's access token. getUser has already checked the token with Auth. */
function signInMethods(jwt: string): string[] {
  try {
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")) as { amr?: { method?: unknown }[] };
    return Array.isArray(claims.amr) ? claims.amr.map((a) => String(a?.method)) : [];
  } catch {
    return [];
  }
}

/** A password that nobody knows. The suffix covers every character class a project password rule can ask for. */
const unknownPassword = () => `${randomBytes(32).toString("base64url")}aA1!`;

/**
 * The answer when Auth refuses a password change. A session that ended, or one that "Secure password change" calls too
 * old (more than 24 hours, if that setting is ever turned on), needs a new sign-in. "Require current password" blocks
 * every finish, so it gets its own answer (#121). Only the parent's own password can be weak.
 */
function passwordFailed(logLabel: "password reset" | "password save", error: AuthError, chosenPassword: boolean) {
  if (chosenPassword && error.code === "weak_password") return fail("weak_password", 400);
  console.error(`[account] ${logLabel} failed`, error.code, error.message);
  if (error.code === "current_password_required") return fail("password_change_blocked", 503);
  if (isAuthSessionMissingError(error) || error.code === "reauthentication_needed") return fail("signed_out", 401);
  return fail("store_failed", 502);
}

export async function POST(request: Request) {
  const session = await sessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user?.email) return fail("signed_out", 401);
  if (!user.email_confirmed_at) return fail("unconfirmed", 403);
  const jwt = (await session.auth.getSession()).data.session?.access_token;
  if (!jwt) return fail("signed_out", 401);

  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  const { data: existing, error: readError } = await admin.from("parents").select("id").eq("id", user.id).maybeSingle();
  if (readError) {
    console.error("[account] parent read failed", readError.message);
    return fail("store_failed", 502);
  }
  if (existing) return Response.json({ ok: true, existing: true } satisfies AccountResult);

  if (!signInMethods(jwt).some((method) => PROVED.has(method))) return fail("unproved", 403);

  const { error: resetError } = await session.auth.updateUser({ password: unknownPassword() });
  if (resetError) return passwordFailed("password reset", resetError, false);

  let body: Partial<FinishPayload>;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  const details = cleanDetails(body);
  const child = cleanChild(body.child);
  if (!details || !child || (body.password !== undefined && !validPassword(body.password))) return fail("invalid", 400);

  if (body.password !== undefined) {
    const { error } = await session.auth.updateUser({ password: body.password });
    if (error) return passwordFailed("password save", error, true);
  }

  // An already-running Auth password change can end our session after our own changes. Check again before the
  // service-key write. This narrows the race; Auth and create_family still do not share a transaction (#121).
  const { data: { user: currentUser }, error: sessionError } = await session.auth.getUser();
  if (sessionError && !isAuthSessionMissingError(sessionError)) {
    console.error("[account] session check failed", sessionError.code, sessionError.message);
    return fail("store_failed", 502);
  }
  if (currentUser?.id !== user.id) return fail("signed_out", 401);

  const family = await createFamily(admin, user.id, { ...details, email: user.email.toLowerCase() }, child);
  if (family.status === "exists") return Response.json({ ok: true, existing: true } satisfies AccountResult);
  if (family.status === "busy") return fail("busy", 429);
  if (family.status === "unavailable") return fail("unavailable", 409);
  if (family.status !== "created") return fail("store_failed", 502);

  const linkSent = isPhone(request.headers) && (await sendSignInLink(admin, user.id, family.child, linkOrigin(request))) === "sent";
  return Response.json({ ok: true, linkSent } satisfies AccountResult);
}
