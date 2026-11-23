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

  it("folds a topic number that a reader still writes into the end of the title, once", () => {
    const topicOf = (topic: Record<string, unknown>) =>
      (assembleCandidateRecord({ kind: "page", level: "M", sheet: "1a", topic }, "sample", "codex")
        .candidate as { topic: Record<string, unknown> }).topic;

    expect(topicOf({ title: "Sample Topic With Remainders", number: 2 })).toEqual({
      title: "Sample Topic With Remainders 2",
    });
    expect(topicOf({ title: "Sample Topic With Remainders 2", number: 2 })).toEqual({
      title: "Sample Topic With Remainders 2",
    });
    expect(topicOf({ title: "Facts up to 3", number: 3 })).toEqual({ title: "Facts up to 3" });
    expect(topicOf({ title: "Sample Exercise (2)", number: 2 })).toEqual({ title: "Sample Exercise (2)" });
    expect(topicOf({ title: "Sample Exercise(2)", number: 2 })).toEqual({ title: "Sample Exercise(2)" });
    expect(topicOf({ title: "Sample Practice #2", number: 2 })).toEqual({ title: "Sample Practice #2" });
    expect(topicOf({ title: "Sample Practice No.2", number: 2 })).toEqual({ title: "Sample Practice No.2" });
    expect(topicOf({ title: "Sample Gas: NO2", number: 2 })).toEqual({ title: "Sample Gas: NO2 2" });
    expect(topicOf({ title: "Sample Exercise (12)", number: 2 })).toEqual({ title: "Sample Exercise (12) 2" });
    expect(topicOf({ title: "Facts up to 13", number: 3 })).toEqual({ title: "Facts up to 13 3" });
    expect(topicOf({ title: "Sample Topic" })).toEqual({ title: "Sample Topic" });
    // A null or sentinel number is not folded; validation still sees it.
    expect(topicOf({ title: "Sample Topic", number: null })).toEqual({ title: "Sample Topic", number: null });
    expect(topicOf({ title: "Sample Topic", number: "unclear" })).toEqual({
      title: "Sample Topic",
      number: "unclear",
    });
  });
});

