import "server-only";
// The v2 sheet-result rebuild with the database stores. Marking calls it after a mark is published or changed
// (src/lib/scan-marking-server.ts); a child with v1 books only costs one read and nothing more.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { markingCommand, scanMarkingReader } from "@/lib/scan-marking-reader";
import { childMarksFrom } from "./marks";
import { rebuildSheetResults, type RebuildOutcome } from "./rebuild";
import { supabaseBookStore } from "./supabase-store";
import type { MarkSource } from "./types";

/** Marking's per-child marks version (scan_marking_revisions.revision, which only goes up) and its effective set. */
export function scanMarkSource(db: SupabaseClient<Database>): MarkSource {
  const command = markingCommand(db);
  const reader = scanMarkingReader(db);
  return {
    async version(parentId, childId) {
      const value = await command("revision", parentId, null, null, { child: childId });
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("marking_revision_shape");
      return value;
    },
    async marks(parentId, childId) { return childMarksFrom(await reader.effective(parentId, childId)); },
  };
}

/** Rebuilds the child's v2 sheet results from the current marks. Pass a client with the secret key. */
export function rebuildV2SheetResults(db: SupabaseClient<Database>, childId: string): Promise<RebuildOutcome> {
  return rebuildSheetResults({ books: supabaseBookStore(db), marks: scanMarkSource(db) }, childId);
}
