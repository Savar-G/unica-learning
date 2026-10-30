import { describe, expect, it } from "vitest";
import {
  createSession, deleteFamily, FAMILY_BUCKETS, runRetentionBatch, storedTest, withFamilyCardOperation,
  type AnonymousTestCopy, type FamilyCopyStore, type FamilyDeletionStore, type ImageEntry,
} from "@/lib/assessment";

/** A family with no test: nothing to copy, and the database confirms at once. */
const noTests: FamilyCopyStore = { async copySources() { return []; }, async saveCopy() { return false; }, async confirmCopies() { return true; } };

describe("family card operation", () => {
  it("keeps a durable hold when the external write result is unknown", async () => {
    let held = false;
    let remoteWrite = false;
    const store = { async begin() { held = true; return true; }, async end() { held = false; } };
    await expect(withFamilyCardOperation(store, async () => {
      remoteWrite = true;
      throw new Error("response lost");
    })).rejects.toThrow("response lost");
    expect(remoteWrite).toBe(true);
    expect(held).toBe(true);
    // A later known result can release its own hold. It cannot release the uncertain operation.
    let settledHold = false;
    expect(await withFamilyCardOperation({ async begin() { settledHold = true; return true; }, async end() { settledHold = false; } }, async () => "Checkout URL")).toBe("Checkout URL");
    expect(settledHold).toBe(false);
    expect(held).toBe(true);
  });
});

describe("scheduled family deletion", () => {
  it("uses an explicit foreground budget while retaining the HTTP default", async () => {
    const attempts: number[] = [];
    const store = { async cursor() { return null; }, async advance() {}, async run(_id: string, limit: number) {
      attempts.push(limit);
      if (limit < 80_000) throw Error("fresh 64-customer pass does not fit");
      return { state: "deleted" as const, images: 0, copies: 0 };
    } };
    expect(await runRetentionBatch(["family"], store, () => 840_000)).toMatchObject({ failed: 1 });
    expect(await runRetentionBatch(["family"], store, () => 840_000, 600_000)).toMatchObject({ deleted: 1 });
    expect(attempts).toEqual([30_000, 600_000]);
  });
  it("starts the first family when a reduced route budget decreases between clock reads", async () => {
    const times = [25_000, 24_999, 24_998, 0];
    const cursors: string[] = [], attempts: number[] = [];
    expect(await runRetentionBatch(["family"], {
      async cursor() { return null; },
      async advance(id) { cursors.push(id); },
      async run(_id, limit) { attempts.push(limit); return { state: "deleted", images: 0, copies: 0 }; },
    }, () => times.shift() ?? 0)).toMatchObject({ deleted: 1, failed: 0 });
    expect(cursors).toEqual(["family"]);
    expect(attempts).toEqual([24_998]);
  });
  it("saves progress before a slow failure and starts the next run with later families", async () => {
    let cursor: string | null = null;
    let remaining = 45_000;
    const attempts: string[] = [];
    const store = {
      async cursor() { return cursor; },
      async advance(id: string) { cursor = id; },
      async run(id: string, limit: number) {
        expect(cursor).toBe(id); // Progress survives a process stop inside the external call.
        expect(limit).toBeLessThanOrEqual(45_000);
        attempts.push(id);
        if (id === "a-slow") { remaining = 0; throw new Error("slow failed service"); }
        remaining -= 1;
        return { state: "deleted" as const, images: 2, copies: 0 };
      },
    };
    expect(await runRetentionBatch(["a-slow", "b-later", "c-later"], store, () => remaining)).toMatchObject({ deleted: 0, failed: 1 });
    remaining = 45_000;
    expect(await runRetentionBatch(["a-slow", "b-later", "c-later"], store, () => remaining)).toMatchObject({ eligible: 3, deleted: 2, images: 4, failed: 1 });
    expect(attempts).toEqual(["a-slow", "b-later", "c-later", "a-slow"]);
  });
  it("permits a complete fresh payment decision beyond ten seconds within the route budget", async () => {
    let remaining = 45_000;
    let deleted = false;
    const result = await runRetentionBatch(["family"], {
      async cursor() { return null; },
      async advance() {},
      async run(_id, limit) {
        if (limit <= 12_000) { remaining -= limit; throw Error("payment deadline"); }
        remaining -= 12_000;
        deleted = true;
        return { state: "deleted", images: 0, copies: 0 };
      },
    }, () => remaining);
    expect(deleted).toBe(true);
    expect(result).toMatchObject({ eligible: 1, deleted: 1, failed: 0 });
    expect(remaining).toBe(33_000);
  });
  it("leaves a later family next in the queue instead of repeatedly giving it a partial budget", async () => {
    let remaining = 45_000;
    let cursor: string | null = null;
    const attempts: string[] = [];
    const store = {
      async cursor() { return cursor; },
      async advance(id: string) { cursor = id; },
      async run(id: string, limit: number) {
        attempts.push(id);
        if (id === "a-slow" || limit <= 20_000) { remaining -= limit; throw Error("deadline"); }
        remaining -= 20_000;
        return { state: "deleted" as const, images: 0, copies: 0 };
      },
    };
    expect(await runRetentionBatch(["a-slow", "b-later"], store, () => remaining)).toMatchObject({ failed: 1, deleted: 0 });
    expect(cursor).toBe("a-slow");
    remaining = 45_000;
    expect(await runRetentionBatch(["a-slow", "b-later"], store, () => remaining)).toMatchObject({ failed: 0, deleted: 1 });
    expect(attempts).toEqual(["a-slow", "b-later"]);
    expect(cursor).toBe("b-later");
  });
});

/** External-system fake. Auth refuses deletion while even an unreferenced image remains. */
function system(count = 1007) {
  const images = new Set(Array.from({ length: count }, (_, i) => `family/test/q${String(i).padStart(4, "0")}.png`));
  images.add("foreign/test/keep.png");
  let auth = true;
  let pending = true;
  let failStorage = false;
  let failAuth = false;
  // One test, copied once (#201). The link from the test to its copy goes with the family.
  const test = { id: "test-1", copied: false, testFamily: false, grade: 3, province: "BC", status: "in_progress", route: null, help: null,
    startedAt: "2026-01-05T10:00:00Z", completedAt: null, stored: storedTest(createSession({ grade: 3, province: "BC" }, 7)), placement: null,
    answers: [], shows: [], facts: null, profile: null, learning: null, device: null };
  const copies: AnonymousTestCopy[] = [];
  const log: string[] = [];
  let failCopy = false;
  const store: FamilyDeletionStore = {
    async copySources() { log.push("copy"); return auth ? [{ ...test, copied: copies.length > 0 }] : []; },
    async saveCopy(id, copy) {
      if (failCopy) { failCopy = false; throw new Error("copy unavailable"); }
      expect(id).toBe(test.id);
      copies.push(copy);
      return true;
    },
    async confirmCopies() { return !auth || copies.length === 1; },
    async listImages(prefix, offset, limit) {
      const entries: ImageEntry[] = prefix === "family"
        ? ([...images].some((p) => p.startsWith("family/")) ? [{ name: "test", folder: true }] : [])
        : [...images].filter((p) => p.startsWith(`${prefix}/`)).sort().map((p) => ({ name: p.slice(prefix.length + 1), folder: false }));
      return entries.slice(offset, offset + limit);
    },
    async removeImages(paths) {
      if (failStorage) { failStorage = false; throw new Error("storage unavailable"); }
      log.push("images");
      paths.forEach((p) => images.delete(p));
    },
    async renew() {},
    async removeAuth() {
      if ([...images].some((p) => p.startsWith("family/"))) throw new Error("images remain");
      if (failAuth) { failAuth = false; throw new Error("auth unavailable"); }
      log.push("auth");
      auth = false;
    },
    async complete() { pending = false; },
  };
  return {
    store, images, copies, log, state: () => ({ auth, pending }),
    failStorage: () => { failStorage = true; }, failAuth: () => { failAuth = true; }, failCopy: () => { failCopy = true; },
  };
}

describe("delete a frozen family", () => {
  it("writes the copy without names before it removes any image or Auth (#201)", async () => {
    const s = system(3);
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 3, copies: 1 });
    expect(s.log.filter((step, i) => step !== s.log[i - 1])).toEqual(["copy", "images", "auth"]);
    expect(s.copies).toHaveLength(1);
    expect(JSON.stringify(s.copies)).not.toContain("test-1");
    expect(s.state()).toEqual({ auth: false, pending: false });
  });
  it("deletes nothing when the copy fails, and a retry does not copy the test twice", async () => {
    const s = system(3);
    s.failCopy();
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("copy unavailable");
    expect(s.images.size).toBe(4);
    expect(s.state()).toEqual({ auth: true, pending: true });
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 3, copies: 1 });
    // A retry after the family's rows are gone (Auth removed, final cleanup lost) has nothing left to copy.
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 0, copies: 0 });
    expect(s.copies).toHaveLength(1);
  });
  it("deletes nothing when the database does not confirm a copy of every test, or cannot be read", async () => {
    for (const fault of ["unconfirmed", "unreadable", "missing"] as const) {
      const s = system(3);
      if (fault === "unconfirmed") s.store.confirmCopies = async () => false;
      if (fault === "unreadable") s.store.copySources = async () => [{ id: "test-1", grade: 3 }];
      // The migration is not applied: the database function does not exist.
      if (fault === "missing") s.store.copySources = async () => { throw new Error("Deletion dependency: family_copy_sources (PGRST202)"); };
      await expect(deleteFamily(s.store, "family")).rejects.toThrow();
      expect(s.images.size).toBe(4);
      expect(s.state()).toEqual({ auth: true, pending: true });
    }
  });
  it("makes removal progress across slow deadline-limited retries for nested families with short pages", async () => {
    const original = Array.from({ length: 1007 }, (_, i) => `family/${i < 501 ? "child-a/test/nested" : "child-b/test"}/q${String(i).padStart(4, "0")}.png`);
    const images = new Set([...original, "foreign/test/keep.png"]);
    const removed: string[] = [];
    let elapsed = 0;
    let authRemoved = false;
    let complete = false;
    let pageCap = 100;
    const store: FamilyDeletionStore = {
      ...noTests,
      async renew() { if (elapsed >= 10_000) throw new Error("deadline"); },
      async listImages(prefix, offset, limit) {
        elapsed += 1000;
        if (elapsed >= 10_000) throw new Error("deadline");
        const entries = new Map<string, ImageEntry>();
        for (const path of images) {
          if (!path.startsWith(`${prefix}/`)) continue;
          const rest = path.slice(prefix.length + 1);
          const name = rest.split("/")[0];
          entries.set(name, { name, folder: rest.includes("/") });
        }
        return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + Math.min(limit, pageCap));
      },
      async removeImages(paths) { paths.forEach((p) => { expect(images.delete(p)).toBe(true); removed.push(p); }); },
      async removeAuth() { expect([...images]).toEqual(["foreign/test/keep.png"]); authRemoved = true; },
      async complete() { complete = true; },
    };
    let attempts = 0;
    while (!complete && attempts++ < 20) {
      elapsed = 0;
      const before = removed.length;
      try { await deleteFamily(store, "family"); }
      catch (e) { expect((e as Error).message).toBe("deadline"); }
      // The first bounded attempt must remove data, unlike whole-tree collection.
      if (attempts === 1) expect(removed.length).toBeGreaterThan(before);
      if (!complete) expect(authRemoved).toBe(false);
      pageCap = 37; // A short service response must not be treated as the end of the folder.
    }
    expect(complete).toBe(true);
    expect(authRemoved).toBe(true);
    expect(removed.slice().sort()).toEqual(original.slice().sort());
    expect(new Set(removed).size).toBe(1007);
  });
  it("removes the family's files from every family bucket (drawings and workbook pages, #299) before Auth", async () => {
    const files = new Set([
      "shown-work/family/test/q1.png", "workbook-pages/family/book/page-1.png", "workbook-pages/family/book/page-2.png",
      "workbook-pages/family/book/workbook.pdf", "workbook-pages/foreign/book/page-1.png",
    ]);
    const buckets: string[] = [];
    let authRemoved = false;
    const store: FamilyDeletionStore = {
      ...noTests,
      async renew() {},
      async listImages(prefix, offset, limit, bucket) {
        buckets.push(bucket);
        const names = new Map<string, boolean>();
        for (const path of files) {
          if (!path.startsWith(`${bucket}/${prefix}/`)) continue;
          const rest = path.slice(bucket.length + prefix.length + 2).split("/");
          names.set(rest[0], rest.length > 1);
        }
        return [...names].sort().slice(offset, offset + limit).map(([name, folder]) => ({ name, folder }));
      },
      async removeImages(paths, bucket) { paths.forEach((p) => expect(files.delete(`${bucket}/${p}`)).toBe(true)); },
      async removeAuth() { expect([...files]).toEqual(["workbook-pages/foreign/book/page-1.png"]); authRemoved = true; },
      async complete() {},
    };
    expect(await deleteFamily(store, "family")).toEqual({ images: 4, copies: 0 });
    expect(new Set(buckets)).toEqual(new Set(FAMILY_BUCKETS));
    expect(FAMILY_BUCKETS).toEqual(["shown-work", "workbook-pages"]);
    expect(authRemoved).toBe(true);
  });

  it("removes the lowercase Storage folder for an uppercase UUID before deleting Auth", async () => {
    const id = "abcdefab-0000-4000-8000-abcdefabcdef";
    const images = new Set([`${id}/work.png`]);
    let authRemoved = false;
    const store: FamilyDeletionStore = {
      ...noTests,
      async renew() {},
      async listImages(prefix) { return images.has(`${prefix}/work.png`) ? [{ name: "work.png", folder: false }] : []; },
      async removeImages(paths) { paths.forEach((p) => images.delete(p)); },
      async removeAuth() { if (images.size) throw new Error("Storage remains"); authRemoved = true; },
      async complete() {},
    };
    expect(await deleteFamily(store, id.toUpperCase())).toEqual({ images: 1, copies: 0 });
    expect(images.size).toBe(0);
    expect(authRemoved).toBe(true);
  });
  it("removes all 1007 private images across pages before Auth and leaves another family intact", async () => {
    const s = system();
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 1007, copies: 1 });
    expect([...s.images]).toEqual(["foreign/test/keep.png"]);
    expect(s.state()).toEqual({ auth: false, pending: false });
  });
  it("keeps Auth and the request when Storage fails, then completes on retry", async () => {
    const s = system(203);
    s.failStorage();
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("storage unavailable");
    expect(s.state()).toEqual({ auth: true, pending: true });
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 203, copies: 0 });
    expect(s.state()).toEqual({ auth: false, pending: false });
  });
  it("retries Auth after Storage is empty without losing the request", async () => {
    const s = system(203);
    s.failAuth();
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("auth unavailable");
    expect(s.state()).toEqual({ auth: true, pending: true });
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 0, copies: 0 });
    expect(s.state()).toEqual({ auth: false, pending: false });
  });
  it("stops before Auth if the family is no longer fenced or the lease is lost", async () => {
    const s = system(1);
    s.store.renew = async () => { throw new Error("lease lost"); };
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("lease lost");
    expect(s.state()).toEqual({ auth: true, pending: true });
  });
  it("never follows a path outside the family", async () => {
    const s = system(1);
    s.store.listImages = async () => [{ name: "../foreign", folder: true }];
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("Invalid storage name");
    expect(s.state()).toEqual({ auth: true, pending: true });
  });
  it("refuses Auth deletion if a removal did not remove its objects", async () => {
    const s = system(1);
    s.store.removeImages = async () => {};
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("Storage not empty");
    expect(s.state()).toEqual({ auth: true, pending: true });
  });
  it("keeps an interrupted final cleanup available for another run", async () => {
    const s = system(1);
    const complete = s.store.complete;
    s.store.complete = async () => { throw new Error("database unavailable"); };
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("database unavailable");
    expect(s.state()).toEqual({ auth: false, pending: true });
    s.store.complete = complete;
    await deleteFamily(s.store, "family");
    expect(s.state()).toEqual({ auth: false, pending: false });
  });
});
