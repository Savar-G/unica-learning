import { describe, expect, it } from "vitest";
import { printSteps, stageTrack, workbookStage } from "@/lib/admin-book";

describe("workbookStage", () => {
  it("maps each status, and a delivery receipt, to its Production stage", () => {
    expect(workbookStage("draft", false)).toBe("review");
    expect(workbookStage("approved", false)).toBe("approved");
    expect(workbookStage("printed", false)).toBe("printed");
    expect(workbookStage("shipped", false)).toBe("shipped");
    expect(workbookStage("shipped", true)).toBe("delivered");
  });
});

describe("stageTrack", () => {
  it("marks the stages before the book's stage done and its own now", () => {
    expect(stageTrack("printed").map((s) => s.state)).toEqual(["done", "done", "done", "done", "now", "later", "later"]);
  });
  it("marks every stage done for a delivered book", () => {
    expect(stageTrack("delivered").every((s) => s.state === "done")).toBe(true);
  });
});

describe("printSteps", () => {
  const states = (status: Parameters<typeof printSteps>[0], delivered = false) => printSteps(status, delivered).map((s) => `${s.step}:${s.state}`);
  it("has exactly one step to do now until the book is delivered", () => {
    expect(states("draft")).toEqual(["approve:now", "print:later", "ship:later", "deliver:later"]);
    expect(states("approved")).toEqual(["approve:done", "print:now", "ship:later", "deliver:later"]);
    expect(states("printed")).toEqual(["approve:done", "print:done", "ship:now", "deliver:later"]);
    expect(states("shipped")).toEqual(["approve:done", "print:done", "ship:done", "deliver:now"]);
    expect(states("shipped", true)).toEqual(["approve:done", "print:done", "ship:done", "deliver:done"]);
  });
});
