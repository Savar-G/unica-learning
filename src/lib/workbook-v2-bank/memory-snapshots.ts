// Reviews and snapshots in memory, with the rules of migration 20261127205833_bank_freeze_snapshots: every table is
// insert only, a snapshot item never holds `basis`, and a snapshot write is refused (and writes nothing) for a stale read,
// a version that is not the next one, an item that is not approved at its current revision, or items that do not match
// the working copy.
import { latestReview, liveItems } from "./reviews";
import type { BankStore, LevelRows, NewReview, ReviewRow, SnapshotItemRow, SnapshotMeta, SnapshotWrite, SnapshotWriteResult } from "./types";

export interface MemorySnapshotTables {
  reviews: ReviewRow[];
  snapshots: Map<string, SnapshotMeta>;
  snapshotItems: Map<string, readonly SnapshotItemRow[]>;
}

type SnapshotMethods = Pick<BankStore, "readReviews" | "addReview" | "readSnapshots" | "readSnapshotMeta" | "readSnapshotItems" | "writeSnapshot">;

const copy = <T>(value: T): T => structuredClone(value);
/** A frozen copy: what goes into an insert-only table can never change. */
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const one of Object.values(value)) frozen(one);
    Object.freeze(value);
  }
  return value;
}
const holdsBasis = (value: unknown): boolean =>
  Array.isArray(value) ? value.some(holdsBasis) : typeof value === "object" && value !== null && Object.entries(value).some(([key, one]) => key === "basis" || holdsBasis(one));
const NON_SHEET = new Set(["level", "topic", "question", "scenario", "region_pack"]);

export function memorySnapshotStore(
  tables: MemorySnapshotTables,
  readLevel: (levelId: string) => Promise<LevelRows>,
  versionOf: (levelId: string) => string | null,
  uuid: () => string,
): SnapshotMethods {
  let reviews = 0;
  let frozenAt = 0;

  const writeSnapshot = async (write: SnapshotWrite): Promise<SnapshotWriteResult> => {
    const { levelId } = write;
    const current = versionOf(levelId);
    if (current === null) throw new Error(`bank level ${levelId}: there is no such level`);
    if (current !== write.expected) return { ok: false, problem: `bank level ${levelId}: it changed since it was read` };
    const next = [...tables.snapshots.values()].filter((s) => s.level_id === levelId).reduce((top, s) => Math.max(top, s.version), 0) + 1;
    if (write.version !== next) return { ok: false, problem: `bank level ${levelId}: version ${write.version} is taken or skipped; the next version is ${next}` };
    const rows = await readLevel(levelId);
    const levelReviews = tables.reviews.filter((r) => r.level_id === levelId);
    const unapproved = liveItems(rows).filter((item) => latestReview(levelReviews, item)?.decision !== "approved");
    if (unapproved.length > 0) {
      return { ok: false, problem: `bank level ${levelId}: these items are not approved at their current revision: ${unapproved.map((i) => `${i.kind} "${i.key}" (revision ${i.revision})`).join(", ")}` };
    }
    const live = new Set(liveItems(rows).map((item) => `${item.kind}/${item.key}`));
    const given = new Set(write.items.filter((item) => item.kind !== "level" && item.kind !== "topic").map((item) => `${item.kind}/${item.key}`));
    const mismatch = [...live].filter((k) => !given.has(k)).concat([...given].filter((k) => !live.has(k)));
    if (mismatch.length > 0) return { ok: false, problem: `bank level ${levelId}: the snapshot items do not match the working copy: ${mismatch.join(", ")}` };
    if (write.items.some((item) => holdsBasis(item.content))) throw new Error('new row for relation "bank_snapshot_items" violates check constraint "bank_snapshot_items_content_check"');
    const keys = new Set(write.items.map((item) => `${item.kind}/${item.key}`));
    if (keys.size !== write.items.length) throw new Error('duplicate key value violates unique constraint "bank_snapshot_items_pkey"');
    if ([...tables.snapshots.values()].some((s) => s.name === write.name)) throw new Error('duplicate key value violates unique constraint "bank_snapshots_name_key"');
    const id = uuid();
    tables.snapshots.set(id, frozen({
      id, level_id: levelId, version: next, name: write.name, content_hash: write.contentHash, manifest_hash: write.manifestHash,
      min_engine_version: write.minEngineVersion, item_count: write.items.length, frozen_by: write.frozenBy, frozen_at: new Date(Date.UTC(2026, 10, 27, 0, 0, ++frozenAt)).toISOString(),
    }));
    tables.snapshotItems.set(id, frozen(copy(write.items)));
    return { ok: true, snapshotId: id, version: next };
  };

  return {
    readReviews: async (levelId) => tables.reviews.filter((r) => r.level_id === levelId).map(copy),
    addReview: async (review: NewReview) => {
      const row = frozen({ ...copy(review), id: ++reviews, created_at: new Date(Date.UTC(2026, 10, 27, 0, 0, reviews)).toISOString() });
      tables.reviews.push(row);
      return copy(row);
    },
    readSnapshots: async (levelId) => [...tables.snapshots.values()].filter((s) => s.level_id === levelId).sort((a, b) => a.version - b.version).map(copy),
    readSnapshotMeta: async (snapshotId) => copy(tables.snapshots.get(snapshotId) ?? null),
    readSnapshotItems: async (snapshotId, sheetIds) => {
      const items = tables.snapshotItems.get(snapshotId) ?? [];
      const wanted = sheetIds ? new Set(sheetIds) : null;
      return items.filter((item) => !wanted || NON_SHEET.has(item.kind) || wanted.has(item.key)).map(copy);
    },
    writeSnapshot,
  };
}
