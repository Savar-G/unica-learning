import { SCAN_PENDING_WINDOW_MS } from "@/lib/scan-photo-active";
// The in-memory store of the crop job, for tests: it keeps the same rules as the database's fence (fence_scan_object,
// begin_scan_calibration, reopen_scan_calibration and finish_scan_calibration), with a clock the test passes in. The real policies are proved on the
// hosted database by scripts/scan-crops-hosted.ts; this store cannot prove them.
import { SCAN_LEASE_MS, scanPartPath, type BeginAnswer, type FinishAnswer, type PhotoRef, type ScanCalibrationResult, type ScanCropStore, type ScanFrame, type StoredScanCalibration } from "@/lib/scan-crops";

export interface MemoryScanPhoto {
  parent: string;
  state: "pending" | "saved" | "deleted" | "expired" | "rejected";
  createdAt: number;
  expiresAt: number;
  bytes: Uint8Array;
  frame: Omit<ScanFrame, "photo"> & { printedRevision: string | null };
  storedBytes: number;
}

export function memoryScanCropStore(o: { now: () => number }) {
  const photos = new Map<string, MemoryScanPhoto>();
  const calibrations = new Map<string, StoredScanCalibration & { leaseUntil: number; attempts: number }>();
  const objects = new Map<string, Uint8Array>();
  const printed = new Map<string, Uint8Array>();
  const frozen = new Set<string>();
  const refusals: string[] = [];
  /** Runs between the bytes arriving and the file's commit, as a held upload does. */
  const hooks: { beforeCommit?: (part: string) => Promise<void> } = {};

  const active = (p: MemoryScanPhoto) => p.expiresAt > o.now() && (p.state === "saved" || (p.state === "pending" && p.createdAt > o.now() - SCAN_PENDING_WINDOW_MS));
  const own = (ref: PhotoRef) => { const p = photos.get(ref.photo); return p && p.parent === ref.parent ? p : null; };

  const store: ScanCropStore = {
    async begin(ref): Promise<BeginAnswer> {
      // (As the Supabase store reads the family fence's refusal: for this job, the photo has ended.)
      if (frozen.has(ref.parent)) return { status: "terminal" };
      const p = own(ref);
      if (!p) return { status: "unknown" };
      if (!active(p)) return { status: "terminal" };
      if (!p.frame.book.printedRevision || !p.frame.page.printContract) return { status: "unavailable", reason: "no-contract" };
      if (p.frame.printedRevision !== p.frame.book.printedRevision) return { status: "unavailable", reason: "other-revision" };
      const c = calibrations.get(ref.photo);
      if (!c) {
        calibrations.set(ref.photo, { state: "running", token: ref.token, revision: p.frame.printedRevision!, result: null, leaseUntil: o.now() + SCAN_LEASE_MS, attempts: 1 });
        return { status: "started", previous: null };
      }
      if (c.state !== "running") return { status: c.state };
      if (c.leaseUntil > o.now()) return { status: "busy" };
      if (c.attempts >= 5) { c.state = "refused"; c.result = { reason: "failed" }; return { status: "refused" }; }
      const previous = c.token;
      c.token = ref.token; c.leaseUntil = o.now() + SCAN_LEASE_MS; c.attempts++;
      return { status: "started", previous };
    },
    async reopen(ref): Promise<BeginAnswer> {
      if (frozen.has(ref.parent)) return { status: "terminal" };
      const p = own(ref);
      if (!p) return { status: "unknown" };
      if (!active(p)) return { status: "terminal" };
      const c = calibrations.get(ref.photo);
      if (!c) return store.begin(ref);
      // Only a ready result of an older sheet check, as reopen_scan_calibration: anything else answers as begin does.
      const version = (c.result as { sheetCheck?: unknown } | null)?.sheetCheck;
      if (c.state !== "ready" || (typeof version === "number" && version >= ref.sheetCheck)) return store.begin(ref);
      const previous = c.token;
      Object.assign(c, { state: "running", result: null, token: ref.token, leaseUntil: o.now() + SCAN_LEASE_MS, attempts: 1 });
      return { status: "started", previous };
    },
    async frame(ref) {
      const p = own(ref);
      if (!p) return null;
      return { photo: { id: ref.photo, printedRevision: p.frame.printedRevision, active: active(p) }, book: p.frame.book, page: p.frame.page };
    },
    async calibration(ref) {
      const c = calibrations.get(ref.photo);
      return c && own(ref) ? { state: c.state, token: c.token, revision: c.revision, result: c.result } : null;
    },
    async photoBytes(ref) { return own(ref)!.bytes; },
    async printedBytes(path) { return printed.get(path) ?? null; },
    async put(ref) {
      await hooks.beforeCommit?.(ref.part);
      // The fence reads the state when the file commits, not when the job started.
      const p = own(ref), c = calibrations.get(ref.photo);
      if (frozen.has(ref.parent) || !p || !active(p) || !c || c.state !== "running" || c.token !== ref.token || c.leaseUntil <= o.now()) {
        refusals.push(ref.part);
        return false;
      }
      objects.set(scanPartPath(ref.parent, ref.photo, ref.token, ref.part), ref.bytes);
      return true;
    },
    async clearLease(ref) {
      const prefix = `${ref.parent}/${ref.photo}/${ref.token}-`;
      for (const name of [...objects.keys()]) if (name.startsWith(prefix)) objects.delete(name);
    },
    async clearAll(ref) {
      const prefix = `${ref.parent}/${ref.photo}/`;
      for (const name of [...objects.keys()]) if (name.startsWith(prefix)) objects.delete(name);
    },
    async finish(ref): Promise<FinishAnswer> {
      if (frozen.has(ref.parent)) return "terminal";
      const p = own(ref);
      if (!p) return "unknown";
      if (!active(p)) return "terminal";
      const c = calibrations.get(ref.photo);
      if (!c || c.state !== "running" || c.token !== ref.token || c.leaseUntil <= o.now()) return "stale";
      if (ref.state === "ready") {
        const parts = ref.result.parts;
        if (!parts || ref.bytes < 1) return "invalid";
        if (parts.some((part) => !objects.has(scanPartPath(ref.parent, ref.photo, ref.token, part)))) return "missing";
        p.storedBytes += ref.bytes;
      }
      c.state = ref.state; c.result = ref.result as ScanCalibrationResult;
      return ref.state;
    },
  };

  return {
    store, photos, calibrations, objects, printed, frozen, refusals, hooks,
    /** The terminal state: recorded first, with the files left for the later cleanup, as the database does. */
    terminate(photo: string, state: "deleted" | "expired") { photos.get(photo)!.state = state; },
    filesOf(photo: string) { return [...objects.keys()].filter((n) => n.split("/")[1] === photo).map((n) => n.split("/")[2]); },
  };
}
