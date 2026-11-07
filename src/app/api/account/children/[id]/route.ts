import { cleanFirstName, type ChildNameError, type ChildNameResult } from "@/lib/account";
import { isUuid } from "@/lib/assessment-store";
import { planManagementAccess } from "@/lib/parent-dashboard-access";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { STALE_SECONDS } from "@/lib/workbook-job";

/** A first name is at most 60 characters: this leaves room for the JSON around it, and no more. */
const BODY_MAX = 1024;

const reply = (status: number, body: ChildNameResult) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (error: ChildNameError, status: number) => reply(status, { ok: false, error });

// A parent changes a child's first name, from the Account tab (#555). JSON and the site's origin only: a form on another
// site cannot send it with the parent's cookies. The desk lock (423) is in src/proxy.ts. The parent comes from the
// session; the body gives only the name. Parents have no update right on first_name, so the server's key writes it,
// through the service-only function rename_child (migration child_rename), which keeps it to the parent's own child; the
// family write fence on public.children refuses a family being deleted. Only the name changes here: the grade goes
// through support, because it changes placement.
//
// A workbook being made prints the name in the id of each kept page, and a resume with another name fails the run
// (workbook-generator.ts), so the name waits until that run ends. rename_child checks the runs and writes the name in
// one transaction under the child's row lock, which start_workbook_run takes too, so no run starts in between. It locks
// the child's runs too, so a resume being made is seen. A run that has stopped by the app's rule (runState,
// STALE_SECONDS) does not block: the rename ends it, with its lease, so it cannot go on with the old name (migration
// child_rename_stops_runs). The function keeps the former name, which
// the call note writer hides as it hides the name now (src/lib/maya-call-note.ts).
export async function PATCH(request: Request, { params }: RouteContext<"/api/account/children/[id]">) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("forbidden", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("bad_json", 415);
  if (Number(request.headers.get("content-length") ?? 0) > BODY_MAX) return fail("too_large", 413);
  const parent = await parentId(await sessionClient());
  if (!parent) return fail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  // The same answer as an unknown child: a family the switch does not open to has no such route yet.
  if (!(await planManagementAccess(parent, admin))) return fail("not_found", 404);

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

  const { data, error } = await admin.rpc("rename_child", { p_parent: parent, p_child: id.toLowerCase(), p_first_name: firstName, p_stale_seconds: STALE_SECONDS });
  if (error) {
    if (error.code === "55000") return fail("unavailable", 409);
    console.error("[account] name change failed", error.code);
    return fail("store_failed", 502);
  }
  if (data === "saved") return reply(200, { ok: true });
  if (data === "not_found") return fail("not_found", 404);
  if (data === "book_in_progress") return fail("book_in_progress", 409);
  if (data === "too_many") return fail("too_many_names", 409);
  console.error("[account] name change: unknown answer");
  return fail("store_failed", 502);
}
