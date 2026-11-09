"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { requireAdmin, getChild } from "@/lib/admin-store";
import { PACIFIC_ZONE, addDays, localDateTime, localDay } from "@/lib/family-time";
import { adminClient } from "@/lib/supabase-auth";
import { saveAdminWorkbookPreview } from "@/lib/workbook-preview-server";
import { workbookPreviewRepository, workbookPreviewSql } from "@/lib/workbook-preview-store";

export async function makePreview(childId: string, form: FormData) {
  const admin = await requireAdmin();
  const child = await getChild(admin, childId);
  const service = adminClient();
  if (!child || !service) throw Error("Preview unavailable.");
  const date = String(form.get("cutoff") ?? "");
  const now = Date.now();
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date || date > localDay(now, PACIFIC_ZONE)) throw Error("Choose a valid date.");
  const cutoff = Math.min(now, localDateTime(addDays(date, 1), PACIFIC_ZONE) - 1);
  let selection: unknown;
  try { selection = JSON.parse(String(form.get("selection"))); } catch { throw Error("Choose a skill."); }
  const result = await saveAdminWorkbookPreview({ version: 1, requestId: randomUUID(), parentId: child.child.parent_id, childId,
    workbookId: String(form.get("workbook")), printedRevision: String(form.get("revision")), selection, cutoff,
    scope: form.get("scope") === "later-book" ? "later-book" : "day7" }, workbookPreviewRepository(workbookPreviewSql(service)));
  if (!result.ok) throw Error("The preview could not be saved. Check the book and try again.");
  redirect(`/admin/children/${childId}/preview-marks?preview=${result.document.request.requestId}`);
}
