// Server entry for the next-book snapshot (#476). It wires the Supabase store, the Book 1 source loaders and the planner
// the caller passes (nextBookPlanner() in src/lib/next-book-planner.ts). There is intentionally no route or cron here; the
// caller authorizes the session (an admin for "Prepare from snapshot" and "Update with new marks", the server's own scan trigger otherwise).
import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { adminClient } from "./supabase-auth";
import { workbookProgressSourceStore } from "./workbook-progress-source-store";
import { book1BaselineSql, book1SourceReader } from "./workbook-book1-store";
import { captureNextBookEvidence, sourcesRequest } from "./next-book-capture";
import { workbookPreviewRequest, type WorkbookProgressSourceStoreV2 } from "./workbook-progress-source";
import { RUN_ATTEMPTS, STALE_SECONDS } from "./workbook-job";
import { nextBookSnapshotStore } from "./next-book-snapshot-store";
import { newEvidenceSince, prepareNextBook, readNextBookSnapshot, refreshNextBookSnapshot, type NextBookCapture,
  type NextBookDeps, type NextBookPlanner, type NextBookTrigger, type SnapshotActor } from "./next-book-snapshot";

/**
 * The capture through the existing Book 1 loaders: read the frozen sources, capture every mark in scope
 * (src/lib/next-book-capture.ts), read again and refuse a change in between (as loadWorkbookProgressSources does). A book
 * with no marked scan is held (#628); the freeze also holds a capture with no final mark in its ledger.
 */
export function book1Capture(sources: WorkbookProgressSourceStoreV2): NextBookCapture {
  return async r => {
    const request = workbookPreviewRequest(sourcesRequest(r));
    if (!request) return { status: "unavailable", reason: "invalid-request" };
    try {
      const start = await sources.capture(request);
      if (!start) return { status: "unavailable", reason: "scope-unavailable" };
      if (start.version !== 2 || !start.book1) return { status: "unavailable", reason: "book1-sources-unavailable" };
      const captured = captureNextBookEvidence(r, start);
      const end = await sources.capture(request);
      if (!end || !isDeepStrictEqual(start, end)) return { status: "unavailable", reason: "changed-during-read" };
      return captured;
    } catch (e) {
      return { status: "unavailable", reason: e instanceof Error && e.message === "invalid-source" ? "invalid-source" : "source-error" };
    }
  };
}

/** The planner is the only piece the callers choose: it binds every issued skill, so no step selection is wired. */
export interface NextBookServerOptions { planner: NextBookPlanner }

/** Wire the store and loaders on one service client. Null when the server has no service key. */
export function nextBookSnapshotServer(options: NextBookServerOptions, db: SupabaseClient<Database> | null = adminClient()) {
  if (!db) return null;
  const store = nextBookSnapshotStore(db);
  const capture = book1Capture(workbookProgressSourceStore(db, book1SourceReader(book1BaselineSql(db))));
  const deps: NextBookDeps = { store, capture, planner: options.planner, run: { maxAttempts: RUN_ATTEMPTS, staleSeconds: STALE_SECONDS } };
  return {
    prepare: (trigger: NextBookTrigger, now = Date.now()) => prepareNextBook(trigger, deps, now),
    read: (snapshotId: string) => readNextBookSnapshot(store, snapshotId),
    newEvidenceSince: (snapshotId: string) => newEvidenceSince(store, snapshotId),
    refresh: (draftId: string, actor: SnapshotActor, now = Date.now()) => refreshNextBookSnapshot(draftId, actor, deps, now),
  };
}
