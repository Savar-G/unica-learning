import { expect, it } from "vitest";
import { deleteChild, type ChildDeletionStore } from "@/lib/child-delete";
import { requestFamilyDelete } from "@/lib/family-delete";
import { memoryDeleteStore, memoryFamily, memoryPlans } from "@/lib/family-delete-memory";

function harness() {
  const files = new Set(["shown-work/parent/test/a.png", "workbook-pages/parent/book/b.pdf", "scan-photos/parent/photo/photo.jpg", "shown-work/parent/sibling/keep.png"]);
  const log: string[] = [];
  let copied = false, exists = true, fail = "";
  const store: ChildDeletionStore = {
    copySources: async () => [{ id: "test", copied, grade: 2, province: "BC", status: "completed", startedAt: "2026-11-01T00:00:00Z", stored: {}, answers: [], shows: [] }],
    saveCopy: async (_id, copy) => { if (fail === "copy") throw Error("copy"); expect(JSON.stringify(copy)).not.toContain("parent"); copied = true; log.push("copy"); return true; },
    confirmCopies: async () => copied,
    roots: async () => [{ bucket: "shown-work", prefix: "parent/test" }, { bucket: "workbook-pages", prefix: "parent/book" }, { bucket: "scan-photos", prefix: "parent/photo" }],
    renew: async () => {},
    listImages: async (prefix, _offset, _limit, bucket) => [...files].filter(p => p.startsWith(`${bucket}/${prefix}/`)).map(p => ({ name: p.split("/").at(-1)!, folder: false })),
    removeImages: async (paths, bucket) => { if (fail === "files") throw Error("files"); for (const p of paths) files.delete(`${bucket}/${p}`); log.push("files"); },
    complete: async () => { if (fail === "rows") throw Error("rows"); exists = false; log.push("rows"); },
  };
  return { store, files, log, fail: (at: string) => { fail = at; }, exists: () => exists };
}

it("copies tests, removes only the child's files, then removes rows", async () => {
  const h = harness();
  expect(await deleteChild(h.store)).toEqual({ images: 3, copies: 1 });
  expect(h.files).toEqual(new Set(["shown-work/parent/sibling/keep.png"]));
  expect(h.log).toEqual(["copy", "files", "files", "files", "rows"]);
  expect(h.exists()).toBe(false);
});
it.each(["copy", "files", "rows"])("can resume after a failure at %s without a second copy", async (step) => {
  const h = harness(); h.fail(step);
  await expect(deleteChild(h.store)).rejects.toThrow(step);
  expect(h.exists()).toBe(true);
  expect(h.files.has("shown-work/parent/sibling/keep.png")).toBe(true);
  h.fail(""); await deleteChild(h.store);
  expect(h.log.filter(s => s === "copy")).toHaveLength(1);
  expect(h.exists()).toBe(false);
});
it("removes nothing when a copy is not confirmed", async () => {
  const h = harness(); h.store.confirmCopies = async () => false;
  await expect(deleteChild(h.store)).rejects.toThrow("Copy incomplete");
  expect(h.files.size).toBe(4);
  expect(h.exists()).toBe(true);
});
it("the shared plan check refuses unknown reads before a child request", async () => {
  const f = memoryFamily({ plans: { child: ["plan"] }, fail: { read: true } });
  const result = await requestFamilyDelete("parent", { code: "123456", confirm: "DELETE" }, async () => "ok", { store: memoryDeleteStore(f), plans: memoryPlans(f) });
  expect(result).toEqual({ ok: false, error: "unavailable" });
  expect(f.plans.child).toEqual(["plan"]); expect(f.fenced).toBe(false);
});
