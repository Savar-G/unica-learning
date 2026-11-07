import "server-only";
import { adminSession } from "./admin-store";
import { adminClient } from "./supabase-auth";
import { loadWorkbookProgressSources, workbookPreviewRequest } from "./workbook-progress-source";
import { workbookProgressSourceStore } from "./workbook-progress-source-store";
import { createWorkbookPreviewRecordAny, replayWorkbookPreviewAny, type WorkbookPreviewRepository } from "./workbook-preview-record";

/**
 * Public server boundary. Only selection IDs and cutoff enter from a browser. The SQL repository is a trusted
 * server dependency. There is intentionally no route, default repository, feature switch, worker or admission.
 */
export async function saveAdminWorkbookPreview(raw: unknown, repository: WorkbookPreviewRepository) {
  const request = workbookPreviewRequest(raw);
  if (!request) return { ok: false as const, reason: "invalid-request" };
  try {
    const admin = await adminSession();
    if (!admin) return { ok: false as const, reason: "admin-required" };
    // SQL rechecks live Admin membership, family fences, ownership and printed revision on every read.
    // Retry uses saved inputs before any source/profile read. A conflicting request ID is never recomputed.
    const existing = await repository.read(admin.userId, request);
    if (existing) {
      const document = await replayWorkbookPreviewAny(existing, admin.userId, request);
      const live = await adminSession();
      return document && live?.userId === admin.userId ? { ok: true as const, status: "duplicate" as const, document }
        : { ok: false as const, reason: "saved-preview-unavailable" };
    }
    const service = adminClient();
    if (!service) return { ok: false as const, reason: "source-unavailable" };
    const loaded = await loadWorkbookProgressSources(workbookProgressSourceStore(service), request);
    if (!loaded.ok) return loaded;
    const live = await adminSession();
    if (live?.userId !== admin.userId) return { ok: false as const, reason: "admin-required" };
    const record = await createWorkbookPreviewRecordAny(admin.userId, request, loaded.frozen);
    const status = await repository.save(admin.userId, request, record);
    if (status !== "saved" && status !== "duplicate") return { ok: false as const, reason: status };
    // Read through the persisted contract. A successful dispatch alone is not storage/restart proof.
    const saved = await repository.read(admin.userId, request);
    const document = saved && await replayWorkbookPreviewAny(saved, admin.userId, request);
    return document ? { ok: true as const, status, document } : { ok: false as const, reason: "saved-preview-unavailable" };
  } catch { return { ok: false as const, reason: "saved-preview-unavailable" }; }
}

export async function readAdminWorkbookPreview(raw: unknown, repository: WorkbookPreviewRepository) {
  const request = workbookPreviewRequest(raw);
  if (!request) return { ok: false as const, reason: "invalid-request" };
  try {
    const admin = await adminSession();
    if (!admin) return { ok: false as const, reason: "admin-required" };
    const record = await repository.read(admin.userId, request);
    const document = record && await replayWorkbookPreviewAny(record, admin.userId, request);
    const live = await adminSession();
    return document && live?.userId === admin.userId ? { ok: true as const, document } : { ok: false as const, reason: "saved-preview-unavailable" };
  } catch { return { ok: false as const, reason: "saved-preview-unavailable" }; }
}
