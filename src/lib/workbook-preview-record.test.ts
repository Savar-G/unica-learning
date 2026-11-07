import { describe, expect, it, vi } from "vitest";
import { createWorkbookPreviewRecord, previewPayloadHash, replayWorkbookPreview } from "./workbook-preview-record";
import { workbookPreviewRepository } from "./workbook-preview-store";
import { previewActor, previewSourceFixture } from "./workbook-progress-source.fixture";
import { historyId } from "./workbook-progress-history.fixture";
vi.mock("server-only", () => ({}));

describe("immutable versioned preview record", () => {
  it("reads back through the public validator after a JSON restart without mutable source reads", () => {
    const f = previewSourceFixture(), record = createWorkbookPreviewRecord(previewActor, f.request, f.frozen);
    const restarted = JSON.parse(JSON.stringify(record));
    const before = replayWorkbookPreview(restarted, previewActor, f.request);
    expect(before?.outcome).toMatchObject({ availability: "unavailable", plan: null, decision: null, consumedVersions: [] });
    expect(before?.outcome.requiredSample).toHaveLength(123);
    f.frozen.books[0].items = []; f.frozen.books[0].frames = [];
    expect(replayWorkbookPreview(restarted, previewActor, f.request)).toEqual(before);
    expect(record.hash).toBe(previewPayloadHash(record.payload));
  });
  it.each(["invalid-json", "hash", "owner", "child", "book", "revision", "cutoff", "scope", "selection", "actor", "engine", "sourceHash", "requestHash", "context", "result", "plan", "decision", "sample", "extra-key"])("refuses persisted %s conflicts even with a matching payload hash", kind => {
    const f = previewSourceFixture(), record = createWorkbookPreviewRecord(previewActor, f.request, f.frozen), d = JSON.parse(record.payload);
    if (kind === "invalid-json") { record.payload = "{"; record.hash = previewPayloadHash(record.payload); }
    else if (kind === "hash") record.hash = "a".repeat(64);
    else {
      if (kind === "owner") d.request.parentId = historyId(88);
      if (kind === "child") d.request.childId = historyId(88);
      if (kind === "book") d.request.workbookId = historyId(88);
      if (kind === "revision") d.request.printedRevision = "b".repeat(28);
      if (kind === "cutoff") d.request.cutoff++;
      if (kind === "scope") d.request.scope = "backstop";
      if (kind === "selection") d.request.selection.step++;
      if (kind === "actor") d.actorId = historyId(88);
      if (kind === "engine") d.engine = "old-engine";
      if (kind === "sourceHash") d.sourceHash = "a".repeat(64);
      if (kind === "requestHash") d.requestHash = "a".repeat(64);
      if (kind === "context") d.frozen.books[0].questions[0].teaching.version++;
      if (kind === "result") d.frozen.books[0].items[0].result_version++;
      if (kind === "plan") d.outcome.plan = {};
      if (kind === "decision") d.outcome.decision = { action: "advance" };
      if (kind === "sample") d.outcome.requiredSample.pop();
      if (kind === "extra-key") d.extra = "data";
      record.payload = JSON.stringify(d); record.hash = previewPayloadHash(record.payload);
    }
    expect(replayWorkbookPreview(record, previewActor, f.request)).toBeNull();
  });
  it("does not alias the caller's record or request", () => {
    const f = previewSourceFixture(), record = createWorkbookPreviewRecord(previewActor, f.request, f.frozen);
    const a = replayWorkbookPreview(record, previewActor, f.request)!;
    a.outcome.requiredSample.length = 0;
    expect(replayWorkbookPreview(record, previewActor, f.request)?.outcome.requiredSample).toHaveLength(123);
  });
  it("refuses oversized private input", () => {
    const f = previewSourceFixture();
    f.frozen.books[0].frames[0].frame.versions.outline = "x".repeat(4_000_000);
    expect(() => createWorkbookPreviewRecord(previewActor, f.request, f.frozen)).toThrow("preview-bound");
  });
  it("uses the isolated SQL contract and rejects corrupt readback or denied SQL", async () => {
    const f = previewSourceFixture(), record = createWorkbookPreviewRecord(previewActor, f.request, f.frozen);
    const command = vi.fn().mockResolvedValue({ status: "saved" });
    const repo = workbookPreviewRepository({ command });
    expect(await repo.save(previewActor, f.request, record)).toBe("saved");
    expect(command.mock.calls[0][0]).toMatchObject({ p_action: "save", p_actor: previewActor, p_parent: f.request.parentId, p_payload: record.payload, p_hash: record.hash });
    command.mockResolvedValue({ status: "found", ...record });
    expect(await repo.read(previewActor, f.request)).toEqual(record);
    command.mockResolvedValue({ status: "found", payload: "{}", hash: previewPayloadHash("{}") });
    await expect(repo.read(previewActor, f.request)).rejects.toThrow("preview-invalid-record");
    command.mockResolvedValue({ status: "unavailable" });
    await expect(repo.read(previewActor, f.request)).rejects.toThrow("preview-unavailable");
  });
});
