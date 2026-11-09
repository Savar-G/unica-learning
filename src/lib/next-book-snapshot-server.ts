// Server entry for the next-book snapshot (#476). It wires the Supabase store, the Book 1 source loaders and the planner
// the planner owner passes in. There is intentionally no route, cron or default planner here; the caller authorizes the
// session (an admin for "Prepare from snapshot" and "Update with new marks", the server's own scan trigger otherwise).
import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { adminClient } from "./supabase-auth";
import { workbookProgressSourceStore } from "./workbook-progress-source-store";
import { book1BaselineSql, book1SourceReader } from "./workbook-book1-store";
import { captureBook1Progress } from "./workbook-book1-preview";
import { workbookPreviewRequest, type WorkbookPreviewRequest, type WorkbookProgressSourceStoreV2 } from "./workbook-progress-source";
import { RUN_ATTEMPTS, STALE_SECONDS } from "./workbook-job";
import { nextBookSnapshotStore } from "./next-book-snapshot-store";
import { newEvidenceSince, prepareNextBook, readNextBookSnapshot, refreshNextBookSnapshot, type CaptureRequest, type NextBookCapture,
  type NextBookDeps, type NextBookPlanner, type NextBookTrigger, type SnapshotActor } from "./next-book-snapshot";

/** Which taught step the snapshot's sample is for. The planner owner decides; this slice adds no policy. */
export type NextBookSelection = (scope: Omit<CaptureRequest, "scope" | "cutoff">) => Promise<WorkbookPreviewRequest["selection"] | null>;

/**
 * The capture through the existing Book 1 loaders: read the frozen sources, capture, read again and refuse a change in
 * between (as loadWorkbookProgressSources does). A book with no marked scan is held (#628).
 */
export function book1Capture(sources: WorkbookProgressSourceStoreV2, selection: NextBookSelection): NextBookCapture {
  return async r => {
    const step = await selection({ snapshotId: r.snapshotId, parentId: r.parentId, childId: r.childId, workbookId: r.workbookId, printedRevision: r.printedRevision });
    if (!step) return { status: "unavailable", reason: "no-selection" };
    const request = workbookPreviewRequest({ version: 1, requestId: r.snapshotId, parentId: r.parentId, childId: r.childId, workbookId: r.workbookId,
      printedRevision: r.printedRevision, selection: step, cutoff: r.cutoff, scope: r.scope });
    if (!request) return { status: "unavailable", reason: "invalid-request" };
    try {
      const start = await sources.capture(request);
      if (!start) return { status: "unavailable", reason: "scope-unavailable" };
      if (start.version !== 2 || !start.book1) return { status: "unavailable", reason: "book1-sources-unavailable" };
      const captured = await captureBook1Progress(request, start);
      const end = await sources.capture(request);
      if (!end || !isDeepStrictEqual(start, end)) return { status: "unavailable", reason: "changed-during-read" };
      if (captured.availability === "held") return { status: "held", reason: "no-marked-scans" };
      if (captured.availability !== "captured") return { status: "unavailable", reason: captured.reasons[0] };
      return { status: "captured", sources: start, fence: captured.fence, snapshot: captured.retained.snapshot, history: captured.retained.history,
        held: captured.retained.held };
    } catch (e) {
      return { status: "unavailable", reason: e instanceof Error && e.message === "invalid-source" ? "invalid-source" : "source-error" };
    }
  };
}

export interface NextBookServerOptions { planner: NextBookPlanner; selection: NextBookSelection }

/** Wire the store and loaders on one service client. Null when the server has no service key. */
export function nextBookSnapshotServer(options: NextBookServerOptions, db: SupabaseClient<Database> | null = adminClient()) {
  if (!db) return null;
  const store = nextBookSnapshotStore(db);
  const capture = book1Capture(workbookProgressSourceStore(db, book1SourceReader(book1BaselineSql(db))), options.selection);
  const deps: NextBookDeps = { store, capture, planner: options.planner, run: { maxAttempts: RUN_ATTEMPTS, staleSeconds: STALE_SECONDS } };
  return {
    prepare: (trigger: NextBookTrigger, now = Date.now()) => prepareNextBook(trigger, deps, now),
    read: (snapshotId: string) => readNextBookSnapshot(store, snapshotId),
    newEvidenceSince: (snapshotId: string) => newEvidenceSince(store, snapshotId),
    refresh: (draftId: string, actor: SnapshotActor, now = Date.now()) => refreshNextBookSnapshot(draftId, actor, deps, now),
  };
}
