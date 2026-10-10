import { cleanChild, cleanParent, type AccountResult, type AccountSignupPayload } from "@/lib/account";
import { pilotOn } from "@/lib/pilot";
import { adminClient } from "@/lib/supabase-auth";

// Creates the parent's auth user, parent row and first child with the secret key, then the browser signs in with the
// password. The user is created already confirmed: email confirmation is off for the pilot (#62); emails move to Resend in #63.
export async function POST(request: Request) {
  if (!pilotOn()) return Response.json({ ok: false, error: "off" } satisfies AccountResult, { status: 404 });
  let body: Partial<AccountSignupPayload>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" } satisfies AccountResult, { status: 400 });
  }
  // Bots fill every field; pretend it worked so they move on.
  if (body.website) return Response.json({ ok: true } satisfies AccountResult);

  const parent = cleanParent(body);
  const child = cleanChild(body.child);
  if (!parent || !child) return Response.json({ ok: false, error: "invalid" } satisfies AccountResult, { status: 400 });

  const admin = adminClient();
  if (!admin) {
    console.error("[account] SUPABASE_SECRET_KEY is not set");
    return Response.json({ ok: false, error: "store_failed" } satisfies AccountResult, { status: 503 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: parent.email,
    password: parent.password,
    email_confirm: true,
    user_metadata: { name: parent.name },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.code === "user_already_exists") {
      return Response.json({ ok: false, error: "account_exists" } satisfies AccountResult, { status: 409 });
    }
    if (error?.code === "weak_password") return Response.json({ ok: false, error: "weak_password" } satisfies AccountResult, { status: 400 });
    console.error("[account] create user failed", error?.code, error?.message);
    return Response.json({ ok: false, error: "store_failed" } satisfies AccountResult, { status: 502 });
  }

  const id = data.user.id;
  const { error: parentError } = await admin.from("parents").insert({ id, name: parent.name, email: parent.email, postal: parent.postal, source: parent.source });
  const { error: childError } = parentError
    ? { error: parentError }
    : await admin.from("children").insert({ parent_id: id, first_name: child.firstName, grade: child.grade, province: child.province });
  if (childError) {
    // Remove the half-made account, so the parent can try again with the same email. The parent row goes with it (cascade).
    console.error("[account] store failed", childError.message);
    await admin.auth.admin.deleteUser(id);
    return Response.json({ ok: false, error: "store_failed" } satisfies AccountResult, { status: 502 });
  }
  return Response.json({ ok: true } satisfies AccountResult);
}
