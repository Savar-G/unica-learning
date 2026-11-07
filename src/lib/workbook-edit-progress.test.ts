import { afterEach, describe, expect, it, vi } from "vitest";
import { readEditProgress, watchWorkbookEditProgress, workbookEditProgress } from "@/lib/workbook-edit-progress";

const now = Date.parse("2026-11-06T23:00:00Z");
const row = (extra = {}) => ({ id: "batch", base_revision: 1, status: "running", heartbeat_at: new Date(now).toISOString(),
  checkpoints: {}, frame: null, ...extra });
const comments = Array.from({ length: 12 }, (_, n) => ({ batch_id: "batch", page_number: n + 1 }));
const ready = (number: number) => ({ number, page: { number }, image: { number } });
const reply = () => ({ batch: workbookEditProgress(row(), comments, now) });
afterEach(() => vi.useRealTimers());

describe("saved edit checkpoint progress", () => {
  it("counts 12 distinct pages from 14 comments and distinguishes three failures from one ready page", () => {
    const result = workbookEditProgress(row({ checkpoints: {
      1: { number: 1, error: "cover unsupported" }, 2: { number: 2, error: "instructions unsupported" },
      6: { number: 6, error: "strict grid refused" }, 7: ready(7),
    } }), [...comments, comments[0], comments[0]], now);
    expect(result).toMatchObject({ total: 12, checked: 4, ready: 1, failed: 3, phase: "working" });
    expect(readEditProgress({ batch: result })).toEqual(result);
    expect(JSON.stringify(result)).not.toMatch(/cover unsupported|strict grid|checkpoints|image|question|model|token/);
  });
  it("does not count another batch, unrelated pages, response-only checkpoints or incomplete image saves", () => {
    const result = workbookEditProgress(row({ checkpoints: {
      1: { number: 1, responses: [{}] }, 2: { number: 2, page: { number: 2 } }, 3: { number: 3, image: { number: 3 } },
      4: { number: 5, error: "wrong identity" }, 5: { number: 5, page: { number: 5 }, image: { number: 99 } }, 99: ready(99),
    } }), [...comments, { batch_id: "other", page_number: 99 }], now);
    expect(result).toMatchObject({ total: 12, checked: 0, ready: 0, failed: 0 });
  });
  it("keeps a retained error out of the ready count even if old page data remains", () => {
    const result = workbookEditProgress(row({ checkpoints: { 1: { ...ready(1), error: "refused", pending: true } } }), comments, now);
    expect(result).toMatchObject({ checked: 1, ready: 0, failed: 1 });
  });
  it.each([
    [{ status: "queued" }, "waiting"], [{ status: "queued", frame: {} }, "retrying"],
    [{ status: "queued", checkpoints: { 1: ready(1) } }, "retrying"],
    [{ status: "running", heartbeat_at: new Date(now - 360_000).toISOString() }, "stalled"],
    [{ status: "done" }, "done"], [{ status: "failed" }, "failed"],
  ])("reports its persisted execution state: %s", (extra, phase) => {
    expect(workbookEditProgress(row(extra), comments, now).phase).toBe(phase);
  });
  it("does not call a completed set saved until the batch commits its revision", () => {
    const result = workbookEditProgress(row({ checkpoints: Object.fromEntries(comments.map(c => [c.page_number, ready(c.page_number)])) }), comments, now);
    expect(result).toMatchObject({ checked: 12, ready: 12, failed: 0, phase: "saving", status: "running" });
  });
  it("uses the exact six-minute stalled boundary", () => {
    const source = row({ heartbeat_at: new Date(now - 360_000).toISOString() });
    expect(workbookEditProgress(source, comments, now - 1).phase).toBe("working");
    expect(workbookEditProgress(source, comments, now).phase).toBe("stalled");
  });
  it.each([{ checkpoints: null }, { heartbeat_at: "invalid" }, { status: "invented" }, { base_revision: 0 }])("refuses invalid persisted state %s", extra => {
    expect(() => workbookEditProgress(row(extra), comments, now)).toThrow("edit_progress_shape");
  });
  it.each([{ checked: 3 }, { ready: -1 }, { failed: "0" }, { total: 501 }, { phase: "done" }, { heartbeatAt: "bad" }])("refuses an inconsistent HTTP result %s", extra => {
    expect(() => readEditProgress({ batch: { ...reply().batch, ...extra } })).toThrow("edit_progress_response");
  });
});

describe("single-flight edit progress watcher", () => {
  it("keeps one request in flight through a 130-second delay, then waits five seconds after its reply", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const read = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const update = vi.fn(() => true), unavailable = vi.fn();
    const stop = watchWorkbookEditProgress({ read, update, unavailable });
    await vi.advanceTimersByTimeAsync(1_000); expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(130_000); expect(read).toHaveBeenCalledTimes(1); expect(update).not.toHaveBeenCalled();
    finish(reply()); await vi.advanceTimersByTimeAsync(0); expect(update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999); expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(2);
    stop(); expect(unavailable).not.toHaveBeenCalled();
  });
  it("waits 30 seconds after a failed read and never refreshes a whole workbook itself", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockRejectedValueOnce(Error("upstream timeout")).mockResolvedValue(reply());
    const update = vi.fn(() => true), unavailable = vi.fn();
    const stop = watchWorkbookEditProgress({ read, update, unavailable });
    await vi.advanceTimersByTimeAsync(1_000); expect(unavailable).toHaveBeenCalledTimes(1); expect(update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(29_999); expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(read).toHaveBeenCalledTimes(2); expect(update).toHaveBeenCalledTimes(1);
    stop();
  });
  it("stops after a terminal response or a changed batch instead of starting another read", async () => {
    vi.useFakeTimers();
    const terminal = { batch: workbookEditProgress(row({ status: "failed" }), comments, now) };
    const read = vi.fn(async () => terminal), update = vi.fn(() => false), unavailable = vi.fn();
    const stop = watchWorkbookEditProgress({ read, update, unavailable });
    await vi.advanceTimersByTimeAsync(100_000);
    expect(read).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledExactlyOnceWith(terminal.batch);
    expect(unavailable).not.toHaveBeenCalled(); stop();
  });
  it("aborts on unmount and ignores a late response", async () => {
    vi.useFakeTimers(); let finish!: (value: unknown) => void; let signal!: AbortSignal;
    const read = vi.fn((s: AbortSignal) => { signal = s; return new Promise(resolve => { finish = resolve; }); });
    const update = vi.fn(() => true), unavailable = vi.fn();
    const stop = watchWorkbookEditProgress({ read, update, unavailable });
    await vi.advanceTimersByTimeAsync(1_000); stop(); expect(signal.aborted).toBe(true);
    finish(reply()); await vi.advanceTimersByTimeAsync(60_000);
    expect(read).toHaveBeenCalledTimes(1); expect(update).not.toHaveBeenCalled(); expect(unavailable).not.toHaveBeenCalled();
  });
  it("treats a malformed reply as unavailable and keeps the old saved result", async () => {
    vi.useFakeTimers(); const read = vi.fn(async () => ({ batch: { status: "done" } }));
    const update = vi.fn(() => true), unavailable = vi.fn(); const stop = watchWorkbookEditProgress({ read, update, unavailable });
    await vi.advanceTimersByTimeAsync(1_000); expect(unavailable).toHaveBeenCalledTimes(1); expect(update).not.toHaveBeenCalled();
    stop();
  });
});
