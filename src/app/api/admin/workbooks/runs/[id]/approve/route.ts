import { after } from "next/server";
import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { adminClient } from "@/lib/supabase-auth";
import { captureBook1AfterApproval } from "@/lib/workbook-book1-capture-server";
import { approveCheckingNewMarks } from "@/lib/next-book-refresh";
import { approvalCheckDeps } from "@/lib/next-book-refresh-server";

// #314: "Approve for print" on a run's draft. Body { revision }: the revision the admin looked at; only the current one
// is approved, and only when every check passes (checked here, not in the browser). Answers { ok: true, workbookId } or
// { ok: false, reasons } (409). Admins only: everyone else gets 404.
// #870: after an approval commits and the answer is sent, the Book 1 baseline is captured once from the run frame's
// planning capture (src/lib/workbook-book1-capture.ts). It never changes the approval or the answer; the reminders run
// repairs a capture that failed.
// D-308: a next-book draft whose plan did not use every mark is not approved unless the body says { despiteNewMarks:
// true } ("Approve anyway"); the answer is { ok: false, askUpdate: "New marks since this draft: ..." } (409), and the
// page asks "Update first?". An approval anyway is noted in the workbook audit ("approved-with-new-marks").
export async function POST(request: Request, ctx: RouteContext<"/api/admin/workbooks/runs/[id]/approve">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const body = await request.json().catch(() => null) as { revision?: unknown; despiteNewMarks?: unknown } | null;
  const revision = body?.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) return Response.json({ ok: false, reasons: ["The version is missing. Reload the page."] }, { status: 400 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const o = { runId: id.toLowerCase(), revision, actor: { id: admin.userId, email: admin.email } };
    const result = await approveCheckingNewMarks({ ...o, despiteNewMarks: body?.despiteNewMarks === true }, approvalCheckDeps(db, o));
    if (result.status === "not-found") return new Response("Not found", { status: 404 });
    if (result.status === "ask-update") return Response.json({ ok: false, askUpdate: result.line }, { status: 409 });
    if (result.status === "refused") return Response.json({ ok: false, reasons: result.reasons }, { status: 409 });
    if (result.noted === false) console.error("[workbook ship] approved with new marks, audit note not written", id);
    // Its own client: every database call of the capture stops after 60 s.
    after(() => captureBook1AfterApproval(adminClient(AbortSignal.timeout(60_000), { retry: false }) ?? db, { runId: id.toLowerCase(), revision, actorId: admin.userId }));
    return Response.json({ ok: true, workbookId: result.workbookId });
  } catch (e) {
    console.error("[workbook ship] approve failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
