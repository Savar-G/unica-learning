import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runAiCallLog, type RunAiCall } from "@/lib/workbook-job-store";
import type { AiCallRecord } from "@/lib/ai-fallback";

const call = (provider: AiCallRecord["provider"], ms = 1234.6): AiCallRecord => ({ name: "workbook_page", provider, model: "m", outcome: "answered", ms, usd: provider === "api" ? 0.1 : 0, note: null });

describe("runAiCallLog", () => {
  it("writes the calls in batches, one write after another, and the rest on flush", async () => {
    const writes: RunAiCall[][] = [];
    const log = runAiCallLog(async (calls) => { writes.push(calls); }, { batch: 2 });
    log.add("write", call("subscription"));
    log.add("solve", call("api"));
    log.add("write", call("subscription"));
    await log.flush();
    expect(writes.map((w) => w.length)).toEqual([2, 1]);
    expect(writes[0][0]).toEqual({ kind: "write", provider: "subscription", model: "m", outcome: "answered", ms: 1235, usd: 0, note: null });
    expect(writes[0][1]).toMatchObject({ kind: "solve", provider: "api", usd: 0.1 });
  });

  it("never throws when a write fails", async () => {
    const log = runAiCallLog(async () => { throw new Error("db down"); }, { batch: 1 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    log.add("write", call("api"));
    await expect(log.flush()).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
