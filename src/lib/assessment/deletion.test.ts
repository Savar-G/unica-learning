import { describe, expect, it } from "vitest";
import { deleteFamily, retentionDue, type FamilyDeletionStore, type ImageEntry } from "@/lib/assessment";

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
        ? [{ name: "test", folder: true }]
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
