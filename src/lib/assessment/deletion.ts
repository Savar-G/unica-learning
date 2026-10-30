import { copyFamilyTests, type FamilyCopyStore } from "./anonymous-copy";

/** A saved card or an uncertain payment state keeps a family out of automatic deletion. */
export type RetentionCardState = "clear" | "saved" | "unknown";

/** A thrown external operation has an uncertain outcome. Only a settled result releases its own hold. */
export async function withFamilyCardOperation<T>(store: { begin(): Promise<boolean>; end(): Promise<void> }, action: () => Promise<T>): Promise<T> {
  const held = await store.begin();
  const result = await action();
  if (held) await store.end();
  return result;
}

/** `copies`: the copies without names this run wrote (#201); a retry after an earlier run's copies writes 0. */
export type FamilyDeletionResult = { state: "deleted"; images: number; copies: number } | { state: "busy" | "excluded" };

/** The external worker must enforce its time limit. Saving the cursor first also survives termination. */
export interface RetentionBatchStore {
  cursor(): Promise<string | null>;
  advance(parent: string): Promise<void>;
  run(parent: string, limitMs: number): Promise<FamilyDeletionResult>;
}

export async function runRetentionBatch(ids: string[], store: RetentionBatchStore, remainingMs: () => number, maximumFamilyMs = 30_000) {
  if (!Number.isFinite(maximumFamilyMs) || maximumFamilyMs <= 0) throw new Error("Invalid deletion budget");
  const counts = { eligible: ids.length, deleted: 0, busy: 0, excluded: 0, failed: 0, images: 0, copies: 0 };
  const cursor = await store.cursor();
  const order = cursor === null ? ids : [...ids.filter((id) => id > cursor), ...ids.filter((id) => id <= cursor)];
  const budget = Math.min(maximumFamilyMs, remainingMs());
  let attempted = false;
  for (const id of order) {
    // Do not repeatedly advance past a family that receives only the tail of a route's budget.
    const remaining = remainingMs();
    if (budget <= 0 || remaining <= 0 || (attempted && remaining < budget)) break;
    await store.advance(id);
    const limit = Math.min(budget, remainingMs());
    if (limit <= 0) break;
    attempted = true;
    try {
      const result = await store.run(id, limit);
      counts[result.state]++;
      if (result.state === "deleted") { counts.images += result.images; counts.copies += result.copies; }
    } catch { counts.failed++; }
  }
  return counts;
}

export interface ImageEntry { name: string; folder: boolean }

/**
 * The private Storage buckets that hold a family's files under `<parent id>/`: the whiteboard drawings and the
 * workbook page images and PDFs (#299). A deletion empties the family's folder in each; complete_family_deletion checks
 * the same buckets.
 */
export const FAMILY_BUCKETS = ["shown-work", "workbook-pages"] as const;
export type FamilyBucket = (typeof FAMILY_BUCKETS)[number];

/**
 * External boundary. The database must freeze writes for this family before this interface is used. The copy half
 * (#201) saves each test's copy without names under the same lease.
 */
export interface FamilyDeletionStore extends FamilyCopyStore {
  listImages(prefix: string, offset: number, limit: number, bucket: FamilyBucket): Promise<ImageEntry[]>;
  removeImages(paths: string[], bucket: FamilyBucket): Promise<void>;
  renew(): Promise<void>;
  removeAuth(): Promise<void>;
  complete(): Promise<void>;
}

/** Drain bounded pages from offset zero. Each removal persists progress and cannot shift an unread offset. */
async function removeFamilyImages(store: FamilyDeletionStore, prefix: string, bucket: FamilyBucket): Promise<number> {
  const read = async () => {
    await store.renew();
    return store.listImages(prefix, 0, 100, bucket);
  };
  let page = await read();
  let removed = 0;
  while (page.length) {
    for (const entry of page) {
      if (!entry.name || entry.name.includes("/") || entry.name === "." || entry.name === "..") throw new Error("Invalid storage name");
    }
    const before = removed;
    const files = page.filter((entry) => !entry.folder);
    if (files.length) {
      await store.renew();
      await store.removeImages(files.map((entry) => `${prefix}/${entry.name}`), bucket);
      removed += files.length;
    }
    for (const folder of page.filter((entry) => entry.folder)) removed += await removeFamilyImages(store, `${prefix}/${folder.name}`, bucket);
    const next = await read();
    if (next.some((entry) => !entry.folder && files.some((file) => file.name === entry.name))
      || (removed === before && next.some((entry) => page.some((old) => old.name === entry.name)))) throw new Error("Storage not empty");
    // A short page is not an end marker. Continue until the exact family folder is empty.
    page = next;
  }
  return removed;
}

/**
 * Idempotent ordered deletion. A failed step leaves the durable request for a later retry. The copy without names
 * comes first (#201): nothing is removed until the database confirms a copy of every test of the frozen family, so a
 * failed copy stops the deletion. A retry finds the saved copies and writes none twice.
 */
export async function deleteFamily(store: FamilyDeletionStore, parentId: string): Promise<{ images: number; copies: number }> {
  parentId = parentId.toLowerCase();
  await store.renew();
  const copies = await copyFamilyTests(store);
  let images = 0;
  for (const bucket of FAMILY_BUCKETS) images += await removeFamilyImages(store, parentId, bucket);
  await store.renew();
  await store.removeAuth();
  await store.complete();
  return { images, copies };
}
