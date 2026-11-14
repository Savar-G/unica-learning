// Runs the re-review-of-#741 gate cases on their own, for a run against another tree (the full gate runs them too).
import { describe, expect, it, vi } from "vitest";
import { C3B_REVIEW_BEHAVIOURS } from "./c3b-review-cases";
import { judgeSaved, runGateBehaviour } from "./call";
import { memoryTraceStore } from "./gate";

vi.mock("server-only", () => ({}));

describe("the re-review of #741 gate cases", () => {
  it.each(C3B_REVIEW_BEHAVIOURS.map((b) => [b.id, b] as const))("%s", async (_, b) => {
    const store = memoryTraceStore();
    const run = await runGateBehaviour(b, store);
    expect(run.error ?? null).toBeNull();
    expect(judgeSaved(b, store).failures).toEqual([]);
  });
});
