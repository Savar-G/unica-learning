import { MAX_CHILDREN, cleanChild, type AccountResult } from "@/lib/account";
import { pilotOn } from "@/lib/pilot";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

// Adds a child to the signed-in parent. The parent comes from the session cookie, never from the request body.
export async function POST(request: Request) {
  if (!pilotOn()) return Response.json({ ok: false, error: "off" } satisfies AccountResult, { status: 404 });
  const id = await parentId(await sessionClient());
  if (!id) return Response.json({ ok: false, error: "signed_out" } satisfies AccountResult, { status: 401 });

  let child;
  try {
    child = cleanChild(await request.json());
  } catch {
    return Response.json({ ok: false, error: "bad_json" } satisfies AccountResult, { status: 400 });
  }
  if (!child) return Response.json({ ok: false, error: "invalid" } satisfies AccountResult, { status: 400 });

  const admin = adminClient();
  if (!admin) {
    console.error("[account] SUPABASE_SECRET_KEY is not set");
    return Response.json({ ok: false, error: "store_failed" } satisfies AccountResult, { status: 503 });
  }
  const { count, error: countError } = await admin.from("children").select("id", { count: "exact", head: true }).eq("parent_id", id);
  if (countError) {
    console.error("[account] count failed", countError.message);
    return Response.json({ ok: false, error: "store_failed" } satisfies AccountResult, { status: 502 });
  }
  if ((count ?? 0) >= MAX_CHILDREN) return Response.json({ ok: false, error: "too_many" } satisfies AccountResult, { status: 409 });

  const { error } = await admin.from("children").insert({ parent_id: id, first_name: child.firstName, grade: child.grade, province: child.province });
  if (error) {
    console.error("[account] add child failed", error.message);
    return Response.json({ ok: false, error: "store_failed" } satisfies AccountResult, { status: 502 });
  }
  return Response.json({ ok: true } satisfies AccountResult);
}
