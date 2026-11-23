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

  it("stores the level in upper case when the reader gives the whole page id", () => {
    const given = assembleCandidateRecord({ kind: "page", source_ref: "sample:m:1a" }, "sample", "codex");
    expect(given.extraErrors).toEqual([]);
    expect((given.candidate as { source_ref: string }).source_ref).toBe("sample:M:1a");
  });

  it("refuses a level whose upper case form would be other letters", () => {
    const sharp = assembleCandidateRecord({ kind: "page", level: "\u00df", sheet: "1a" }, "sample", "codex");
    expect(sharp.extraErrors.map((e) => e.path)).toEqual(["level"]);
  });

  it("reports a level with other characters as an error for the retry", () => {
    const bad = assembleCandidateRecord({ kind: "page", level: "M-2", sheet: "1a" }, "sample", "codex");
    expect(bad.extraErrors.map((e) => e.path)).toEqual(["level"]);
  });
});
