import { beforeEach, describe, expect, it, vi } from "vitest";
import { sourceDbFixture, previewActor } from "./workbook-progress-source.fixture";
import { createWorkbookPreviewRecord, replayWorkbookPreview, type WorkbookPreviewRecord, type WorkbookPreviewRepository } from "./workbook-preview-record";
import { saveAdminWorkbookPreview, readAdminWorkbookPreview } from "./workbook-preview-server";
const mocks = vi.hoisted(() => ({ adminSession: vi.fn(), adminClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./admin-store", () => ({ adminSession: mocks.adminSession }));
vi.mock("./supabase-auth", () => ({ adminClient: mocks.adminClient }));

function repository() {
  let saved: WorkbookPreviewRecord | null = null;
  const repo: WorkbookPreviewRepository = {
    read: vi.fn(async (actor, req) => { if (saved && !replayWorkbookPreview(saved, actor, req)) throw Error("conflict"); return saved; }),
    save: vi.fn(async (_actor, _req, record) => { if (saved) return saved.hash === record.hash ? "duplicate" : "conflict"; saved = structuredClone(record); return "saved"; }),
  };
  return repo;
}
beforeEach(() => { vi.resetAllMocks(); mocks.adminSession.mockResolvedValue({ userId: previewActor }); });
describe("checked Admin server boundary", () => {
  it("checks the live Admin before source credentials and reads back the exact saved outcome", async () => {
    const f = sourceDbFixture(), repo = repository(); mocks.adminClient.mockReturnValue(f.db);
    const result = await saveAdminWorkbookPreview(f.request, repo);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expect(result.document.outcome).toMatchObject({ availability: "unavailable", plan: null, decision: null });
    expect(mocks.adminSession.mock.invocationCallOrder[0]).toBeLessThan(mocks.adminClient.mock.invocationCallOrder[0]);
    expect(repo.save).toHaveBeenCalledOnce();
    const calls = f.calls.length;
    const retry = await saveAdminWorkbookPreview(f.request, repo);
    expect(retry).toMatchObject({ ok: true, status: "duplicate" });
    expect(await readAdminWorkbookPreview(f.request, repo)).toMatchObject({ ok: true });
    expect(f.calls).toHaveLength(calls);
    expect(repo.save).toHaveBeenCalledOnce();
  });
  it("denies a session with service credentials but no live Admin", async () => {
    const f = sourceDbFixture(), repo = repository(); mocks.adminSession.mockResolvedValue(null); mocks.adminClient.mockReturnValue(f.db);
    expect(await saveAdminWorkbookPreview(f.request, repo)).toEqual({ ok: false, reason: "admin-required" });
    expect(await readAdminWorkbookPreview(f.request, repo)).toEqual({ ok: false, reason: "admin-required" });
    expect(mocks.adminClient).not.toHaveBeenCalled(); expect(repo.read).not.toHaveBeenCalled(); expect(repo.save).not.toHaveBeenCalled();
  });
  it("does not save after Admin access is revoked during the source read", async () => {
    const f = sourceDbFixture(), repo = repository(); mocks.adminClient.mockReturnValue(f.db);
    mocks.adminSession.mockResolvedValueOnce({ userId: previewActor }).mockResolvedValue(null);
    expect(await saveAdminWorkbookPreview(f.request, repo)).toEqual({ ok: false, reason: "admin-required" });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("rejects a request-ID conflict without reading or replacing source truth", async () => {
    const f = sourceDbFixture(), repo = repository();
    await repo.save(previewActor, f.request, createWorkbookPreviewRecord(previewActor, f.request, f.frozen));
    expect(await saveAdminWorkbookPreview({ ...f.request, cutoff: f.request.cutoff + 1 }, repo)).toEqual({ ok: false, reason: "saved-preview-unavailable" });
    expect(mocks.adminClient).not.toHaveBeenCalled(); expect(repo.save).toHaveBeenCalledOnce();
  });
  it("returns unavailable if the family access check fails on saved readback", async () => {
    const f = sourceDbFixture(), repo = repository();
    vi.mocked(repo.read).mockRejectedValue(Error("family-frozen"));
    expect(await readAdminWorkbookPreview(f.request, repo)).toEqual({ ok: false, reason: "saved-preview-unavailable" });
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
  it("never accepts caller correction completeness", async () => {
    const f = sourceDbFixture(), repo = repository();
    expect(await saveAdminWorkbookPreview({ ...f.request, corrections: { complete: true, rows: [] } }, repo)).toEqual({ ok: false, reason: "invalid-request" });
    expect(mocks.adminSession).not.toHaveBeenCalled(); expect(repo.read).not.toHaveBeenCalled();
  });
});
