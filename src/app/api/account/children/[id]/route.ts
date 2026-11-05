import { cleanFirstName, type ChildNameError, type ChildNameResult } from "@/lib/account";
import { isUuid } from "@/lib/assessment-store";
import { parentDashboardAccess } from "@/lib/parent-dashboard-access";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";

/** A first name is at most 60 characters: this leaves room for the JSON around it, and no more. */
const BODY_MAX = 1024;

const reply = (status: number, body: ChildNameResult) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (error: ChildNameError, status: number) => reply(status, { ok: false, error });

// A parent changes a child's first name, from the Account tab (#555). JSON and the site's origin only: a form on another
// site cannot send it with the parent's cookies. The desk lock (423) is in src/proxy.ts. The parent comes from the
// session; the body gives only the name. Parents have no update right on first_name, so the server's key writes it, and
// the parent_id filter keeps it to the parent's own children; the family write fence on public.children refuses a family
// being deleted. Only the name changes here: the grade goes through support, because it changes placement.
//
// A workbook being made prints the name in the id of each kept page, and a resume with another name fails the run
// (workbook-generator.ts), so the name waits until that run ends. A run that first reads the name in the moment between
// this check and the write fails on resume with that message, and a new run then uses the new name.
export async function PATCH(request: Request, { params }: RouteContext<"/api/account/children/[id]">) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("forbidden", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("bad_json", 415);
  if (Number(request.headers.get("content-length") ?? 0) > BODY_MAX) return fail("too_large", 413);
  const parent = await parentId(await sessionClient());
  if (!parent) return fail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  // The same answer as an unknown child: a family the switch does not open to has no such route yet.
  if (!(await parentDashboardAccess(parent, admin))) return fail("not_found", 404);

  const { id } = await params;
  if (!isUuid(id)) return fail("not_found", 404);
  const raw = await request.text();
  if (raw.length > BODY_MAX) return fail("too_large", 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("bad_json", 400);
  }
  const firstName = cleanFirstName((body as { firstName?: unknown } | null)?.firstName);
  if (!firstName) return fail("invalid", 400);

  const child = id.toLowerCase();
  const runs = await admin.from("workbook_runs").select("id").eq("child_id", child).eq("parent_id", parent).in("status", ["queued", "running"]).limit(1);
  if (runs.error) {
    console.error("[account] run read failed", runs.error.code);
    return fail("store_failed", 502);
  }
  if (runs.data.length) return fail("book_in_progress", 409);

  const { data, error } = await admin.from("children").update({ first_name: firstName }).eq("id", child).eq("parent_id", parent).select("id");
  if (error) {
    if (error.code === "55000") return fail("unavailable", 409);
    console.error("[account] name change failed", error.code);
    return fail("store_failed", 502);
  }
  if (!data.length) return fail("not_found", 404);
  return reply(200, { ok: true });
}
