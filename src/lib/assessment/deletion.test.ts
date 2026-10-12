import { describe, expect, it } from "vitest";
import { deleteFamily, retentionDue, runRetentionBatch, withFamilyCardOperation, type FamilyDeletionStore, type ImageEntry } from "@/lib/assessment";

describe("family retention", () => {
  it("keeps the whole family until twelve calendar months after the latest test activity", () => {
    const tests = ["2024-02-29T12:00:00Z", "2025-01-31T09:00:00Z"];
    expect(retentionDue(tests, "clear", Date.parse("2026-01-31T08:59:59Z"))).toBe(false);
    expect(retentionDue(tests, "clear", Date.parse("2026-01-31T09:00:00Z"))).toBe(true);
    expect(retentionDue([tests[0]], "clear", Date.parse("2025-02-28T12:00:00Z"))).toBe(true);
  });
  it("keeps saved, unknown, never-tested and invalid-date families", () => {
    const now = Date.parse("2026-10-11T00:00:00Z");
    expect(retentionDue(["2020-01-01"], "saved", now)).toBe(false);
    expect(retentionDue(["2020-01-01"], "unknown", now)).toBe(false);
    expect(retentionDue([], "clear", now)).toBe(false);
    expect(retentionDue(["bad"], "clear", now)).toBe(false);
  });
});

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
      return { state: "deleted" as const, images: 0 };
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
      async run(_id, limit) { attempts.push(limit); return { state: "deleted", images: 0 }; },
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
        return { state: "deleted" as const, images: 2 };
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
        return { state: "deleted", images: 0 };
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
        return { state: "deleted" as const, images: 0 };
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
  const store: FamilyDeletionStore = {
    async listImages(prefix, offset, limit) {
      const entries: ImageEntry[] = prefix === "family"
        ? ([...images].some((p) => p.startsWith("family/")) ? [{ name: "test", folder: true }] : [])
        : [...images].filter((p) => p.startsWith(`${prefix}/`)).sort().map((p) => ({ name: p.slice(prefix.length + 1), folder: false }));
      return entries.slice(offset, offset + limit);
    },
    async removeImages(paths) {
      if (failStorage) { failStorage = false; throw new Error("storage unavailable"); }
      paths.forEach((p) => images.delete(p));
    },
    async renew() {},
    async removeAuth() {
      if ([...images].some((p) => p.startsWith("family/"))) throw new Error("images remain");
      if (failAuth) { failAuth = false; throw new Error("auth unavailable"); }
      auth = false;
    },
    async complete() { pending = false; },
  };
  return { store, images, state: () => ({ auth, pending }), failStorage: () => { failStorage = true; }, failAuth: () => { failAuth = true; } };
}

describe("delete a frozen family", () => {
  it("makes removal progress across slow deadline-limited retries for nested families with short pages", async () => {
    const original = Array.from({ length: 1007 }, (_, i) => `family/${i < 501 ? "child-a/test/nested" : "child-b/test"}/q${String(i).padStart(4, "0")}.png`);
    const images = new Set([...original, "foreign/test/keep.png"]);
    const removed: string[] = [];
    let elapsed = 0;
    let authRemoved = false;
    let complete = false;
    let pageCap = 100;
    const store: FamilyDeletionStore = {
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
  it("removes the lowercase Storage folder for an uppercase UUID before deleting Auth", async () => {
    const id = "abcdefab-0000-4000-8000-abcdefabcdef";
    const images = new Set([`${id}/work.png`]);
    let authRemoved = false;
    const store: FamilyDeletionStore = {
      async renew() {},
      async listImages(prefix) { return images.has(`${prefix}/work.png`) ? [{ name: "work.png", folder: false }] : []; },
      async removeImages(paths) { paths.forEach((p) => images.delete(p)); },
      async removeAuth() { if (images.size) throw new Error("Storage remains"); authRemoved = true; },
      async complete() {},
    };
    expect(await deleteFamily(store, id.toUpperCase())).toEqual({ images: 1 });
    expect(images.size).toBe(0);
    expect(authRemoved).toBe(true);
  });
  it("removes all 1007 private images across pages before Auth and leaves another family intact", async () => {
    const s = system();
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 1007 });
    expect([...s.images]).toEqual(["foreign/test/keep.png"]);
    expect(s.state()).toEqual({ auth: false, pending: false });
  });
  it("keeps Auth and the request when Storage fails, then completes on retry", async () => {
    const s = system(203);
    s.failStorage();
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("storage unavailable");
    expect(s.state()).toEqual({ auth: true, pending: true });
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 203 });
    expect(s.state()).toEqual({ auth: false, pending: false });
  });
  it("retries Auth after Storage is empty without losing the request", async () => {
    const s = system(203);
    s.failAuth();
    await expect(deleteFamily(s.store, "family")).rejects.toThrow("auth unavailable");
    expect(s.state()).toEqual({ auth: true, pending: true });
    expect(await deleteFamily(s.store, "family")).toEqual({ images: 0 });
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
