import { describe, expect, it, vi } from "vitest";
import { evaluateWorkbookProgressSources, loadWorkbookProgressSources, workbookPreviewRequest } from "./workbook-progress-source";
import { previewSourceFixture } from "./workbook-progress-source.fixture";
import { previewNextWorkbookPlanFromHistory } from "./workbook-progress-history";
import { historyId } from "./workbook-progress-history.fixture";
vi.mock("server-only", () => ({}));

describe("trusted frozen workbook sources", () => {
  it("derives the complete printed sample without using marked rows and keeps absent proof unavailable", async () => {
    const f = previewSourceFixture();
    const first = evaluateWorkbookProgressSources(f.request, f.frozen);
    f.frozen.books.forEach(b => { b.items = []; b.events = []; });
    const empty = evaluateWorkbookProgressSources(f.request, f.frozen);
    expect(empty.requiredSample).toEqual(first.requiredSample);
    expect(empty.requiredSample).toHaveLength(123);
    expect(empty).toMatchObject({ availability: "unavailable", decision: null, plan: null, consumedVersions: [], sourceStatus: { priorMastery: "unavailable", corrections: "unavailable", issuedDecisions: "unavailable" } });
    expect(empty.reasons).toContain("corrections-unavailable");
  });
  it("holds current Days8-10 and includes them only in an explicit later/backstop scope", () => {
    const f = previewSourceFixture();
    for (const scope of ["day7", "later-book", "backstop"] as const) {
      const result = evaluateWorkbookProgressSources({ ...f.request, scope }, f.frozen);
      expect(result.requiredSample).toHaveLength(scope === "day7" ? 123 : 126);
      expect(result.scope.find(b => b.workbookId === f.request.workbookId)?.days).toEqual(scope === "day7" ? [1] : [1, 8, 9, 10]);
      expect(result.scope.find(b => b.workbookId !== f.request.workbookId)?.days).toEqual([1]);
    }
  });
  it("retains older Days8-10 while the current book remains limited to Day7", () => {
    const f = previewSourceFixture(), older = f.frozen.books[1], p = older.pages[0];
    p.day_label = "Day 8"; p.print_contract!.day = 8;
    older.book.print_manifest!.days = [{ day: 8, pages: [p.page_number] }];
    const result = evaluateWorkbookProgressSources(f.request, f.frozen);
    expect(result.requiredSample).toHaveLength(123);
    expect(result.scope.find(b => b.workbookId === older.book.id)?.days).toEqual([8]);
  });
  it("excludes optional printed pages from the required manifest sample", () => {
    const f = previewSourceFixture(), b = f.frozen.books[0];
    b.book.print_manifest!.days[0].pages = b.book.print_manifest!.days[0].pages.slice(1);
    expect(evaluateWorkbookProgressSources(f.request, f.frozen).requiredSample).toHaveLength(122);
  });
  it("binds delivery to the cutoff without losing Postgres microseconds", () => {
    const f = previewSourceFixture();
    f.frozen.books[0].delivery.deliveredAt = "2026-11-07T12:00:00.000000Z";
    expect(evaluateWorkbookProgressSources(f.request, f.frozen).availability).toBe("unavailable");
    f.frozen.books[0].delivery.deliveredAt = "2026-11-07T12:00:00.000001Z";
    expect(() => evaluateWorkbookProgressSources(f.request, f.frozen)).toThrow("invalid-source");
  });
  it("preserves the existing public history refusal for missing corrections", async () => {
    const f = previewSourceFixture();
    // A synthetic attestation can satisfy the old internal port. It cannot enter the new server request.
    expect((await previewNextWorkbookPlanFromHistory(f.h.store, f.h.input, f.h.planning)).ok).toBe(true);
    f.h.input.proof.corrections = "unavailable";
    expect(await previewNextWorkbookPlanFromHistory(f.h.store, f.h.input, f.h.planning)).toEqual({ ok: false, availability: "unavailable", reason: "corrections-unavailable" });
    expect(evaluateWorkbookProgressSources(f.request, f.frozen).reasons).toContain("corrections-unavailable");
  });
  it("rejects two retained canonical rows for one printed item", async () => {
    const f = previewSourceFixture(), b = f.frozen.books[0];
    b.items.push({ ...b.items[0], id: historyId(999_001) });
    expect(await loadWorkbookProgressSources({ capture: async () => structuredClone(f.frozen) }, f.request)).toEqual({ ok: false, reason: "invalid-source" });
  });
  it("rejects malformed retained parent-change JSON before it can become a saved input", async () => {
    const f = previewSourceFixture(); f.h.parentChange(0, "right");
    f.frozen.books[0].changes = f.h.changes;
    expect(evaluateWorkbookProgressSources(f.request, f.frozen).sourceStatus.retainedHistory).toBe("loaded-not-derived");
    f.frozen.books[0].changes[0].previous = { result_version: 2 };
    expect(await loadWorkbookProgressSources({ capture: async () => structuredClone(f.frozen) }, f.request)).toEqual({ ok: false, reason: "invalid-source" });
  });
  it.each(["packages", "sample", "priorMastery", "proof", "corrections", "planning", "complete"])("refuses browser %s truth", field => {
    const f = previewSourceFixture();
    expect(workbookPreviewRequest({ ...f.request, [field]: [] })).toBeNull();
  });
  it.each(["foreign-book", "foreign-child", "foreign-page", "foreign-question", "revision", "manifest", "legacy-context", "package", "orphan", "duplicate-page", "duplicate-question", "unconfirmed-delivery", "after-cutoff", "foreign-mark", "foreign-event", "foreign-frame"])("refuses %s sources", async kind => {
    const f = previewSourceFixture(), b = f.frozen.books[0];
    if (kind === "foreign-book") b.book.parent_id = historyId(99);
    if (kind === "foreign-child") b.book.child_id = historyId(99);
    if (kind === "foreign-page") b.pages[0].workbook_id = historyId(99);
    if (kind === "foreign-question") b.questions[0].parent_id = historyId(99);
    if (kind === "revision") b.book.printed_revision = "b".repeat(28);
    if (kind === "manifest") b.book.print_manifest = null;
    if (kind === "legacy-context") b.questions[0].teaching = null;
    if (kind === "package") b.questions[0].package = { version: "wrong" };
    if (kind === "orphan") b.questions[0].page_id = historyId(99);
    if (kind === "duplicate-page") b.pages.push(b.pages[0]);
    if (kind === "duplicate-question") b.questions.push(b.questions[0]);
    if (kind === "unconfirmed-delivery") b.delivery.auditId = 0;
    if (kind === "after-cutoff") b.delivery.deliveredAt = "2026-11-08T00:00:00Z";
    if (kind === "foreign-mark") b.items[0].child_id = historyId(99);
    if (kind === "foreign-event") b.events[0].child_id = historyId(99);
    if (kind === "foreign-frame") b.frames[0].child_id = historyId(99);
    const result = await loadWorkbookProgressSources({ capture: async () => structuredClone(f.frozen) }, f.request);
    expect(result.ok).toBe(false);
  });
  it.each(["revision", "catalog", "delivery", "profile-reference", "deleted"])("refuses changing %s fences", async kind => {
    const f = previewSourceFixture(); let n = 0;
    const result = await loadWorkbookProgressSources({ capture: async () => {
      if (++n === 2) {
        if (kind === "deleted") return null;
        if (kind === "revision") f.frozen.markingRevision!++;
        if (kind === "catalog") f.frozen.books[0].questions[0].schema_version++;
        if (kind === "delivery") f.frozen.books[0].delivery.auditId++;
        if (kind === "profile-reference") f.frozen.profileReferences.push({ parent_id: f.request.parentId, child_id: f.request.childId, assessment_id: null, revision: 18, schema_version: 1, build_token: historyId(77), built_at: "2026-11-07T12:00:00Z" });
      }
      return structuredClone(f.frozen);
    } }, f.request);
    expect(result).toEqual({ ok: false, reason: "changed-during-read" });
  });
  it("refuses absent scope and source errors without claiming empty evidence", async () => {
    const f = previewSourceFixture();
    expect(await loadWorkbookProgressSources({ capture: async () => null }, f.request)).toEqual({ ok: false, reason: "scope-unavailable" });
    expect(await loadWorkbookProgressSources({ capture: async () => { throw Error("private text"); } }, f.request)).toEqual({ ok: false, reason: "source-error" });
  });
});
