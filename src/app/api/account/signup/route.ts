import { cleanChild, cleanParent, fail, type AccountResult, type AccountSignupPayload } from "@/lib/account";
import { pilotOn } from "@/lib/pilot";
import { adminClient } from "@/lib/supabase-auth";

// The admin API skips Supabase's own signup rate limit, so this route caps new accounts across the whole site.
// Pilot traffic is a handful of families; a script hits the cap at once.
const MAX_SIGNUPS_PER_10_MIN = 20;

// Creates the parent's auth user, parent row and first child with the secret key, then the browser signs in with the
// password. The user is created already confirmed: email confirmation is off for the pilot (#62); emails move to Resend in #63.
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

  const { count, error: countError } = await admin.from("parents")
    .select("id", { count: "exact", head: true })
    .gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if (countError) {
    console.error("[account] count failed", countError.message);
    return fail("store_failed", 502);
  }
  if ((count ?? 0) >= MAX_SIGNUPS_PER_10_MIN) {
    console.error("[account] signup cap reached");
    return fail("busy", 429);
  }

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
  const { error: parentError } = await admin.from("parents").insert({ id, name: parent.name, email: parent.email, postal: parent.postal, source: parent.source });
  const { error: childError } = parentError
    ? { error: parentError }
    : await admin.from("children").insert({ parent_id: id, first_name: child.firstName, grade: child.grade, province: child.province });
  if (childError) {
    // Remove the half-made account, so the parent can try again with the same email. The parent row goes with it (cascade).
    console.error("[account] store failed", childError.message);
    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) console.error("[account] ORPHAN auth user, delete it in the dashboard:", id, deleteError.message);
    return fail("store_failed", 502);
  }
  return Response.json({ ok: true } satisfies AccountResult);
}
