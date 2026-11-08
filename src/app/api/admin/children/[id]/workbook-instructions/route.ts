import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { adminClient } from "@/lib/supabase-auth";
import { instructionsEmpty, instructionsProblem, workbookInstructions } from "@/lib/workbook-instructions";
import { clearWorkbookInstructions, saveWorkbookInstructions } from "@/lib/workbook-instructions-store";
import { PLACEMENT_CEILING } from "@/lib/workbook-placement";

// Book instructions for a child (2026-11-08): PUT saves the set (an empty set clears it), DELETE clears it. They apply to
// every next "Prepare next workbook" run until an admin changes or clears them; a run already planned keeps its own.
// Answers { ok: true } or { ok: false, error }. Admins only: everyone else gets 404.

async function guard(request: Request, ctx: RouteContext<"/api/admin/children/[id]/workbook-instructions">) {
  const admin = await adminSession();
  if (!admin) return { response: new Response("Not found", { status: 404 }) };
  if (request.headers.get("origin") !== new URL(request.url).origin) return { response: new Response("Forbidden", { status: 403 }) };
  const { id } = await ctx.params;
  if (!isUuid(id)) return { response: new Response("Not found", { status: 404 }) };
  const db = adminClient();
  if (!db) return { response: Response.json({ ok: false, error: "unavailable" }, { status: 503 }) };
  return { admin, db, id: id.toLowerCase() };
}

export async function PUT(request: Request, ctx: RouteContext<"/api/admin/children/[id]/workbook-instructions">) {
  const g = await guard(request, ctx);
  if ("response" in g) return g.response;
  const body = await request.json().catch(() => null);
  const instructions = workbookInstructions(body);
  if (!instructions) return Response.json({ ok: false, error: "These instructions are not in the expected form. Reload the page and try again." }, { status: 400 });
  const problem = instructionsProblem(instructions, PLACEMENT_CEILING);
  if (problem) return Response.json({ ok: false, error: problem }, { status: 400 });
  try {
    if (instructionsEmpty(instructions)) {
      await clearWorkbookInstructions(g.db, g.id);
      return Response.json({ ok: true });
    }
    const saved = await saveWorkbookInstructions(g.db, g.id, instructions, { id: g.admin.userId, email: g.admin.email });
    if (saved === "not_found") return new Response("Not found", { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[book instructions] save failed", g.id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/children/[id]/workbook-instructions">) {
  const g = await guard(request, ctx);
  if ("response" in g) return g.response;
  try {
    await clearWorkbookInstructions(g.db, g.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[book instructions] clear failed", g.id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
