// Reviews and snapshots in Supabase (migration 20261127205833_bank_freeze_snapshots). The tables are insert only and
// service-only; bank_freeze_level writes a snapshot in one transaction. Item reads page past PostgREST's 1,000-row cap.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import type { BankStore, JsonObject, ReviewDecision, ReviewKind, ReviewRow, SnapshotItemKind, SnapshotItemRow, SnapshotWriteResult } from "./types";
import { REVIEW_DECISIONS, REVIEW_KINDS, SNAPSHOT_ITEM_KINDS } from "./types";

type SnapshotMethods = Pick<BankStore, "readReviews" | "addReview" | "readSnapshots" | "readSnapshotMeta" | "readSnapshotItems" | "writeSnapshot">;
type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type AllPages = <T>(what: string, page: Page<T>) => Promise<T[]>;

const SNAPSHOT_COLUMNS = "id, level_id, version, name, content_hash, manifest_hash, min_engine_version, item_count, frozen_by, frozen_at";
const ITEM_COLUMNS = "kind, key, position, content, hash";
const NON_SHEET_KINDS = SNAPSHOT_ITEM_KINDS.filter((kind) => kind !== "sheet");

/** A refusal of bank_freeze_level: a stale read, a taken version, an item not approved, or items that do not match. */
const REFUSED = "PT409";

function oneOf<T extends string>(list: readonly T[], value: string, what: string): T {
  if ((list as readonly string[]).includes(value)) return value as T;
  throw new Error(`bank read: unknown ${what} "${value}"`);
}

const isObject = (value: Json): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

interface ItemRecord { kind: string; key: string; position: number; content: Json; hash: string }
function itemOf(row: ItemRecord): SnapshotItemRow {
  if (!isObject(row.content)) throw new Error(`bank read: snapshot item ${row.kind} "${row.key}" is not an object`);
  return { kind: oneOf<SnapshotItemKind>(SNAPSHOT_ITEM_KINDS, row.kind, "item kind"), key: row.key, position: row.position, content: row.content, hash: row.hash };
}

interface ReviewRecord { id: number; level_id: string; item_kind: string; item_key: string; revision: number; reviewer: string; decision: string; comment: string | null; created_at: string }
const reviewOf = (row: ReviewRecord): ReviewRow => ({
  ...row, item_kind: oneOf<ReviewKind>(REVIEW_KINDS, row.item_kind, "review kind"), decision: oneOf<ReviewDecision>(REVIEW_DECISIONS, row.decision, "decision"),
});

export function supabaseSnapshotStore(db: SupabaseClient<Database>, allPages: AllPages): SnapshotMethods {
  return {
    readReviews: async (levelId) => (await allPages("reviews", (from, to) => db.from("bank_reviews")
      .select("id, level_id, item_kind, item_key, revision, reviewer, decision, comment, created_at").eq("level_id", levelId).order("id").range(from, to))).map(reviewOf),

    addReview: async (review) => {
      const { data, error } = await db.from("bank_reviews").insert(review)
        .select("id, level_id, item_kind, item_key, revision, reviewer, decision, comment, created_at").single();
      if (error) throw new Error(`bank review: ${error.message}`);
      return reviewOf(data);
    },

    readSnapshots: async (levelId) => allPages("snapshots", (from, to) => db.from("bank_snapshots")
      .select(SNAPSHOT_COLUMNS).eq("level_id", levelId).order("version").range(from, to)),

    readSnapshotMeta: async (snapshotId) => {
      const { data, error } = await db.from("bank_snapshots").select(SNAPSHOT_COLUMNS).eq("id", snapshotId).maybeSingle();
      if (error) throw new Error(`bank read snapshot: ${error.message}`);
      return data;
    },

    readSnapshotItems: async (snapshotId, sheetIds) => {
      const items = () => db.from("bank_snapshot_items").select(ITEM_COLUMNS).eq("snapshot_id", snapshotId);
      if (!sheetIds) return (await allPages("snapshot items", (from, to) => items().order("kind").order("key").range(from, to))).map(itemOf);
      const [rest, sheets] = await Promise.all([
        allPages("snapshot items", (from, to) => items().in("kind", NON_SHEET_KINDS).order("kind").order("key").range(from, to)),
        sheetIds.length === 0 ? Promise.resolve([]) : allPages("snapshot sheets", (from, to) => items().eq("kind", "sheet").in("key", [...sheetIds]).order("key").range(from, to)),
      ]);
      return [...rest, ...sheets].map(itemOf);
    },

    writeSnapshot: async (write): Promise<SnapshotWriteResult> => {
      // The items are plain JSON already; the round trip drops nothing.
      const payload: Json = JSON.parse(JSON.stringify(write));
      const { data, error } = await db.rpc("bank_freeze_level", { p_freeze: payload });
      if (error) {
        if (error.code === REFUSED) return { ok: false, problem: error.message };
        throw new Error(`bank freeze: ${error.message}`);
      }
      const answer = isObject(data) ? data : {};
      if (typeof answer.snapshotId !== "string" || typeof answer.version !== "number") throw new Error("bank freeze: unexpected answer");
      return { ok: true, snapshotId: answer.snapshotId, version: answer.version };
    },
  };
}
