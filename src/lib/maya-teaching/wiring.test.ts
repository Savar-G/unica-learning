import { describe, expect, it, vi } from "vitest";
import { heldReason } from "@/lib/maya";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";
import { selectWorkbookQuestion } from "@/lib/maya-workbook-question";
import { teachingPackage } from "./index";
import { eachHasStory, subtractFromTenThousand } from "./samples";

vi.mock("server-only", () => ({}));

// Every path that starts a session on a workbook question teaches from the adapter's package: the call start (chat,
// voice and admin calls all go through it), workbook selection and the desk's held list. The stored package stays.

describe("the adapter in front of every session", () => {
  it("starts a call on a stored one-step question with no operation, and keeps the stored package as it was", async () => {
    const f = await mayaWorkbookFixture();
    const stored = subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]);
    const before = structuredClone(stored);
    const text = await f.calls.start({ kind: "admin_test", parentId: f.ids.parent, childId: f.ids.child, childName: "Iris", startedBy: "test", package: stored });
    expect(text.ok).toBe(true);
    const voice = await f.calls.startVoice({ kind: "admin_test", parentId: f.ids.parent, childId: f.ids.child, childName: "Iris", startedBy: "test", package: stored });
    expect(voice.ok).toBe(true);
    if (!text.ok) return;
    const record = await f.store.get(text.view.id);
    expect(record?.live?.package.operation).toEqual({ kind: "subtract", operands: [10000, 3615] });
    expect(record?.live?.package.operationSource).toBe("maya-teaching");
    expect(record?.question).toEqual(stored.ref);
    expect(stored).toEqual(before);
  });

  it("drops forged teaching data on a stored package and teaches from the printed question", async () => {
    const f = await mayaWorkbookFixture();
    const stored = eachHasStory("crate", 284, "apples", "Nora", 7);
    const forged = { ...stored, operationSource: "maya-teaching", operation: { kind: "add", operands: [1, 1] } };
    // The forged teaching data is dropped and made again from the printed question: the call teaches 284 × 7.
    const r = await f.calls.start({ kind: "admin_test", parentId: f.ids.parent, childId: f.ids.child, childName: "Iris", startedBy: "test", package: forged });
    expect(r.ok).toBe(true);
    if (r.ok) expect((await f.store.get(r.view.id))?.live?.package.operation).toEqual({ kind: "multiply", operands: [284, 7] });
  });

  it("lets workbook selection pick a one-step question it held before, and returns the stored package", async () => {
    const f = await mayaWorkbookFixture();
    const stored = { ...subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]), ref: { source: "workbook" as const, workbookId: f.ids.workbook, page: 4, question: 3 } };
    const books = { ...f.reader.books, question: async () => ({ status: "found" as const, package: stored, schemaVersion: 2 }) } as unknown as typeof f.reader.books;
    const picked = await selectWorkbookQuestion({ childId: f.ids.child, workbookId: f.ids.workbook, page: 4, question: 3 }, { ...f.reader, books });
    expect(picked.ok).toBe(true);
    if (picked.ok) expect(picked.package).toBe(stored);
  });

  it("marks the desk's question as held by the adapter's package, not the stored one", () => {
    const stored = subtractFromTenThousand("Leo", "stickers", [3, 6, 1, 4]);
    expect(heldReason(stored)).not.toBeNull();
    expect(heldReason(teachingPackage(stored))).toBeNull();
  });
});
