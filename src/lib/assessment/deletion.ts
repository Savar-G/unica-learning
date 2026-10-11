/** A saved card or an uncertain payment state keeps a family out of automatic deletion. */
export type RetentionCardState = "clear" | "saved" | "unknown";

/** Calendar months in UTC, including the shorter anniversary of 29 February. No test means no test-based deadline. */
export function retentionDue(testActivity: string[], cards: RetentionCardState, now: number): boolean {
  if (cards !== "clear" || testActivity.length === 0 || !Number.isFinite(now)) return false;
  const times = testActivity.map(Date.parse);
  if (times.some((n) => !Number.isFinite(n))) return false;
  const last = new Date(Math.max(...times));
  const day = last.getUTCDate();
  last.setUTCDate(1);
  last.setUTCFullYear(last.getUTCFullYear() + 1);
  const days = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate();
  last.setUTCDate(Math.min(day, days));
  return now >= last.getTime();
}

export interface ImageEntry { name: string; folder: boolean }

/** External boundary. The database must freeze writes for this family before this interface is used. */
export interface FamilyDeletionStore {
  listImages(prefix: string, offset: number, limit: number): Promise<ImageEntry[]>;
  removeImages(paths: string[]): Promise<void>;
  renew(): Promise<void>;
  removeAuth(): Promise<void>;
  complete(): Promise<void>;
}

/** Collect each folder before removing anything: deleting during offset paging would skip objects. */
async function familyImages(store: FamilyDeletionStore, prefix: string): Promise<string[]> {
  const entries: ImageEntry[] = [];
  for (let offset = 0; ; offset += 100) {
    await store.renew();
    const page = await store.listImages(prefix, offset, 100);
    entries.push(...page);
    if (page.length < 100) break;
  }
  const paths: string[] = [];
  for (const entry of entries) {
    // Storage names cannot escape the exact family prefix, including during a corrupt response.
    if (!entry.name || entry.name.includes("/") || entry.name === "." || entry.name === "..") throw new Error("Invalid storage name");
    const path = `${prefix}/${entry.name}`;
    if (entry.folder) paths.push(...await familyImages(store, path));
    else paths.push(path);
  }
  return paths;
}

/** Idempotent ordered deletion. A failed step leaves the durable request for a later retry. */
export async function deleteFamily(store: FamilyDeletionStore, parentId: string): Promise<{ images: number }> {
  const paths = await familyImages(store, parentId);
  for (let i = 0; i < paths.length; i += 100) {
    await store.renew();
    await store.removeImages(paths.slice(i, i + 100));
  }
  if ((await familyImages(store, parentId)).length !== 0) throw new Error("Storage not empty");
  await store.renew();
  await store.removeAuth();
  await store.complete();
  return { images: paths.length };
}
