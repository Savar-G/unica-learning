// The photo check's in-memory store (#855), for tests: the same claim and finish rules as claim_photo_check and
// finish_photo_check (supabase/migrations/20261111234014_scan_photo_check.sql).
import { PHOTO_CHECK_STALE_SECONDS, type PhotoCheck, type PhotoCheckStore } from "@/lib/scan-photo-check";

export interface MemoryPhoto { parent: string; state: "saved" | "pending" | "deleted"; sent: boolean; check: PhotoCheck | null; straight: Uint8Array | null }

export function memoryPhotoCheckStore(o: { eligible?: Iterable<string>; now?: () => number } = {}) {
  const eligible = new Set(o.eligible ?? []);
  const now = o.now ?? Date.now;
  const photos = new Map<string, MemoryPhoto>();
  const writes: string[] = [];
  const store: PhotoCheckStore = {
    async eligible(parent) { return eligible.has(parent); },
    async claim({ parent, photo, token }) {
      const p = photos.get(photo);
      if (!p || p.parent !== parent || p.state !== "saved" || p.sent) return false;
      const stale = p.check?.state === "pending" && Date.parse(p.check.at) < now() - PHOTO_CHECK_STALE_SECONDS * 1000;
      if (p.check !== null && !stale) return false;
      p.check = { state: "pending", token, at: new Date(now()).toISOString() };
      writes.push(`claim:${photo}`);
      return true;
    },
    async straight({ parent, photo }) {
      const p = photos.get(photo);
      return p && p.parent === parent ? p.straight : null;
    },
    async finish({ parent, photo, token, result }) {
      const p = photos.get(photo);
      if (!p || p.parent !== parent || p.check?.state !== "pending" || p.check.token !== token) return false;
      p.check = result;
      writes.push(`finish:${photo}`);
      return true;
    },
  };
  return { store, photos, writes, eligible };
}
