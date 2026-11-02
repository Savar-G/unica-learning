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
import { PDFDocument } from "pdf-lib";
import { renderWorkbook } from "@/lib/workbook-render";
import { renderableDraft } from "@/lib/workbook-fit";
import type { RunPlace } from "@/lib/workbook-job-deps";
import { runAiCallLog, saveRunAiCalls } from "@/lib/workbook-job-store";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import { workbookFiles } from "@/lib/workbook-store";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";


export async function runWorkbookEditWith(db: SupabaseClient<Database>, id: string, place: RunPlace) {
  const edit = await db.from("workbook_edits").select("draft_id,parent_id").eq("id", id).single();
  if (edit.error) throw new Error(edit.error.message);
  const run = await db.from("workbook_runs").select("id").eq("draft_id", edit.data.draft_id).single();
  if (run.error) throw new Error(run.error.message);
  const log = runAiCallLog(saveRunAiCalls(db, run.data.id));
  const env = place.env ?? process.env;
  const fake = workbookFakeAi(env);
  const live = fake ? null : workbookAi(env, { subscription: place.subscription, primary: place.primary, onStart: log.add, onCall: log.add });
  const template = workbookTemplate(await fixedTemplateFonts()), engine = chromiumPrintEngine(), files = workbookFiles(db);
  const solver = (fake ? workbookFakeSolver(env) : live?.solve?.solver) ?? {
    model: "unavailable", solve: async () => { throw new Error("The solve checker is unavailable."); },
  };
  const generation = { ai: fake ?? live?.ai ?? null, solver, fit: renderFitCheck({ template, engine, parentId: edit.data.parent_id }),
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
      async renderPage(snapshot, draft, page) {
        const one = renderableDraft(draft);
        one.pages = one.pages.filter((p) => p.number === page);
        const result = await renderWorkbook({ draft: one, parentId: snapshot.parentId, template, engine, fileKey: randomBytes(12).toString("hex") });
        if (result.status !== "rendered") throw new Error(result.problems.map((p) => p.reason).join(" "));
        const p = result.workbook.pages[0];
        const image = result.files.find((f) => f.path === p.image!.path)!;
        try { await files.put(image); } catch (e) { await files.remove([image.path]).catch(() => undefined); throw e; }
        return { page: { number: page, image: p.image!, questions: p.questions.map((q) => ({ number: q.number, box: q.box })) }, paths: [image.path] };
      },
      async assemble(snapshot, pages) {
        const pdf = await PDFDocument.create();
        for (const p of pages) {
          const source = await db.storage.from("workbook-pages").download(p.image.path);
          if (source.error) throw new Error(source.error.message);
          const image = await pdf.embedPng(await source.data.arrayBuffer());
          pdf.addPage([612, 792]).drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
        }
        const pdfPath = `${snapshot.parentId}/${snapshot.draft.id}/workbook-${randomBytes(12).toString("hex")}.pdf`;
        try { await files.put({ path: pdfPath, bytes: await pdf.save(), contentType: "application/pdf" }); }
        catch (e) { await files.remove([pdfPath]).catch(() => undefined); throw e; }
        return { pdfPath, paths: [pdfPath] };
      },
    });
  } finally { clearInterval(timer); await log.flush(); }
}
