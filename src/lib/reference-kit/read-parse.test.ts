import { describe, expect, it } from "vitest";
import { assembleCandidateRecord } from "./read-parse";

describe("assembleCandidateRecord", () => {
  it("stores the level in upper case, so that two page ids never differ only in letter case", () => {
    const lower = assembleCandidateRecord({ kind: "page", level: "m", sheet: "1a" }, "sample", "codex");
    const upper = assembleCandidateRecord({ kind: "page", level: "M", sheet: "1a" }, "sample", "claude");
    expect(lower.extraErrors).toEqual([]);
    expect((lower.candidate as { source_ref: string }).source_ref).toBe("sample:M:1a");
    expect((upper.candidate as { source_ref: string }).source_ref).toBe("sample:M:1a");
  });

  it("reports a level with other characters as an error for the retry", () => {
    const bad = assembleCandidateRecord({ kind: "page", level: "M-2", sheet: "1a" }, "sample", "codex");
    expect(bad.extraErrors.map((e) => e.path)).toEqual(["level"]);
  });
});
