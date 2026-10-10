import { MAX_CHILDREN, cleanChild, fail, type AccountResult } from "@/lib/account";
import { pilotOn } from "@/lib/pilot";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// Adds a child to the signed-in parent. The parent comes from the session cookie, never from the request body.
export async function POST(request: Request) {
  if (!pilotOn()) return fail("off", 404);
  const id = await parentId(await sessionClient());
  if (!id) return fail("signed_out", 401);

  let child;
  try {
    child = cleanChild(await request.json());
  } catch {
    return fail("bad_json", 400);
  }
  if (!child) return fail("invalid", 400);

  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  // Two requests at the same moment can pass this check together; the cap only has to stop a runaway script.
  const { count, error: countError } = await admin.from("children").select("id", { count: "exact", head: true }).eq("parent_id", id);
  if (countError) {
    console.error("[account] count failed", countError.message);
    return fail("store_failed", 502);
  }
  if ((count ?? 0) >= MAX_CHILDREN) return fail("too_many", 409);

  const { error } = await admin.from("children").insert({ parent_id: id, first_name: child.firstName, grade: child.grade, province: child.province });
  if (error) {
    console.error("[account] add child failed", error.message);
    return fail("store_failed", 502);
  }
  return Response.json({ ok: true } satisfies AccountResult);
}
