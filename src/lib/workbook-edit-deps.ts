// Shared by the dev/server route and the Mac worker. The AI factory keeps the D-200 subscription fallback.
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { workbookAi } from "@/lib/workbook-ai";
import { workbookFakeAi, workbookFakeSolver } from "@/lib/workbook-ai-fake";
import { workbookDraftStore } from "@/lib/workbook-draft-store";
import { runWorkbookEdit } from "@/lib/workbook-edit";
import { workbookEditStore } from "@/lib/workbook-edit-store";
import { renderFitCheck } from "@/lib/workbook-fit";
import type { RunPlace } from "@/lib/workbook-job-deps";
import { runAiCallLog, saveRunAiCalls } from "@/lib/workbook-job-store";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { workbookFiles } from "@/lib/workbook-store";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { workbookEditRendering } from "@/lib/workbook-edit-rendering";
import { runWorkbookLayoutEditWith } from "@/lib/workbook-layout-edit-deps";


export async function runWorkbookEditWith(db: SupabaseClient<Database>, id: string, place: RunPlace) {
  const edit = await db.from("workbook_edits").select("draft_id,parent_id,edit_kind").eq("id", id).single();
  if (edit.error) throw new Error(edit.error.message);
  if (edit.data.edit_kind === "layout") return runWorkbookLayoutEditWith(db, id, place);
  const run = await db.from("workbook_runs").select("id, parent_id, child_id").eq("draft_id", edit.data.draft_id).single();
  if (run.error) throw new Error(run.error.message);
  const log = runAiCallLog(saveRunAiCalls(db, run.data.id));
  const env = place.env ?? process.env;
  const fake = workbookFakeAi(env);
  const live = fake ? null : workbookAi(env, { subscription: place.subscription, primary: place.primary, singleDispatch: true, onStart: log.add, onCall: log.add,
    usage: { parentId: run.data.parent_id, childId: run.data.child_id, runId: run.data.id } });
  const template = workbookTemplate(await fixedTemplateFonts()), engine = chromiumPrintEngine(), files = workbookFiles(db);
  const rendering = workbookEditRendering(db, template, engine);
  const solver = (fake ? workbookFakeSolver(env) : live?.solve?.solver) ?? {
    model: "unavailable", solve: async () => { throw new Error("The solve checker is unavailable."); },
  };
  const generation = { ai: fake ?? live?.ai ?? null, solver, fit: renderFitCheck({ template, engine, parentId: edit.data.parent_id, fullness: true }),
    store: workbookDraftStore(db), qrToken: () => randomBytes(16).toString("base64url"), timeLimitMs: place.timeLimitMs };
  const started = Date.now(), lease = randomUUID();
  const timer = setInterval(() => { void db.from("workbook_edits").update({ heartbeat_at: new Date().toISOString() })
    .eq("id", id).eq("status", "running").eq("lease", lease).gt("heartbeat_at", new Date(Date.now() - 6 * 60_000).toISOString()).then(() => undefined); }, 30_000);
  try {
    return await runWorkbookEdit(id, {
      store: workbookEditStore(db), build: place.build, runner: place.subscription ? "mac" : "server", newId: () => lease, generation,
      remove: (paths) => files.remove(paths),
      shouldYield: place.subscription ? undefined : () => Date.now() - started > 120_000,
      handOff: place.handOff,
      renderPage: rendering.renderPage, assemble: rendering.assemble,
    });
  } finally { clearInterval(timer); await log.flush(); }
}
