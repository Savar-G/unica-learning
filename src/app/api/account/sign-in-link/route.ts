import { fail, type AccountResult } from "@/lib/account";
import { linkOrigin, sendSignInLink } from "@/lib/account-server";
import { pilotOn } from "@/lib/pilot";
import { canResend, hashToken } from "@/lib/sign-in-link";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// Emails a new sign-in link (#63). Two callers:
// - the phone screen, signed in: { childId }. The child must belong to the signed-in parent.
// - a used or expired link, signed out: { token } of that old link, for 7 days after it was made. The new link goes to
//   the same parent and child, so the email only ever reaches the inbox that got the first one.
export async function POST(request: Request) {
  if (!pilotOn()) return fail("off", 404);
  let body: { childId?: unknown; token?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);

  let target: { parent: string; child: string };
  if (body.token !== undefined) {
    const hash = hashToken(body.token);
    const { data } = hash
      ? await admin.from("sign_in_links").select("parent_id, child_id, created_at").eq("token_hash", hash)
        .maybeSingle<{ parent_id: string; child_id: string; created_at: string }>()
      : { data: null };
    if (!data || !canResend(data.created_at)) return fail("invalid", 400);
    target = { parent: data.parent_id, child: data.child_id };
  } else {
    const parent = await parentId(await sessionClient());
    if (!parent) return fail("signed_out", 401);
    if (typeof body.childId !== "string") return fail("invalid", 400);
    target = { parent, child: body.childId };
  }

  const result = await sendSignInLink(admin, target.parent, target.child, linkOrigin(request));
  if (result === "not_found") return fail("invalid", 400);
  if (result === "too_many") return fail("too_many", 429);
  if (result === "failed") return fail("send_failed", 502);
  return Response.json({ ok: true } satisfies AccountResult);
}
