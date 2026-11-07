import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { runWorkbookLayoutEdit } from "@/lib/workbook-layout-edit";
import { workbookLayoutEditStore } from "@/lib/workbook-layout-edit-store";
import { workbookEditRendering } from "@/lib/workbook-edit-rendering";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { chromiumPrintEngine } from "@/lib/print-engine-chromium";
import type { RunPlace } from "@/lib/workbook-job-deps";

/** This module never constructs an AI client. API fallback cannot participate in a layout-only batch. */
export async function runWorkbookLayoutEditWith(db: SupabaseClient<Database>, id: string, place: RunPlace) {
  if (!place.subscription) return "not-claimed";
  const files = workbookEditRendering(db, workbookTemplate(await fixedTemplateFonts()), chromiumPrintEngine());
  const lease = randomUUID();
  const timer = setInterval(() => { void db.from("workbook_edits").update({ heartbeat_at: new Date().toISOString() })
    .eq("id", id).eq("status", "running").eq("lease", lease).gt("heartbeat_at", new Date(Date.now() - 6 * 60_000).toISOString()).then(() => undefined); }, 30_000);
  try {
    return await runWorkbookLayoutEdit(id, { store: workbookLayoutEditStore(db), build: place.build ?? null,
      runner: "mac", newId: () => lease,
      renderPage: (snapshot, page) => files.renderPage(snapshot, snapshot.draft, page), assemble: files.assemble });
  } finally { clearInterval(timer); }
}
