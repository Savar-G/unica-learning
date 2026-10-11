import { cleanChild, cleanDetails, fail, type AccountResult, type FinishPayload } from "@/lib/account";
import { createParent, isPhone, linkOrigin, sendSignInLink, signupCap } from "@/lib/account-server";
import { pilotOn } from "@/lib/pilot";
import { adminClient, sessionClient } from "@/lib/supabase-auth";

// A parent who signed in with Google for the first time has an auth user but no parent row. This writes the parent row
// and the first child (#63). The id and email come from the session, never from the request body.
export async function POST(request: Request) {
  if (!pilotOn()) return fail("off", 404);
  const { data: { user } } = await (await sessionClient()).auth.getUser();
  if (!user?.email) return fail("signed_out", 401);

  let body: Partial<FinishPayload>;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  const details = cleanDetails(body);
  const child = cleanChild(body.child);
  if (!details || !child) return fail("invalid", 400);

  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  const { data: existing } = await admin.from("parents").select("id").eq("id", user.id).maybeSingle();
  if (existing) return fail("account_exists", 409);

  const cap = await signupCap(admin);
  if (cap) return cap === "busy" ? fail("busy", 429) : fail("store_failed", 502);

  const childId = await createParent(admin, user.id, { ...details, email: user.email.toLowerCase() }, child);
  if (!childId) return fail("store_failed", 502);

  const linkSent = isPhone(request.headers) && (await sendSignInLink(admin, user.id, childId, linkOrigin(request))) === "sent";
  return Response.json({ ok: true, linkSent } satisfies AccountResult);
}
