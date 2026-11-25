import { describe, expect, it } from "vitest";
import type { ReferenceRecord } from "@/lib/reference-record";
import { pairDigest, pickPageWinners, type PairedPage } from "./compare-pairing";

function record(sourceRef: string): ReferenceRecord {
  return {
    kind: "contents",
    source_ref: sourceRef,
    topics: [{ n: 1, title: "Invented topic", sheets: [1, 10], std_time_min: null }],
  } as ReferenceRecord;
}

function pair(name: string, a: string | null, b: string | null, mismatch = false): PairedPage {
  return {
    photo: `${name}.jpg`,
    originalName: `${name}.jpg`,
    photoSha256: mismatch ? null : name.padEnd(64, "0"),
    sameDigest: !mismatch,
    digestMismatch: mismatch ? { a: "a".repeat(64), b: "b".repeat(64) } : null,
    recA: a ? record(a) : null,
    recB: b ? record(b) : null,
    notesA: [],
    notesB: [],
  };
}

describe("pickPageWinners", () => {
  it("lets the photo win where both readers of that one photo give the page id", () => {
    const first = pair("01", "sample:M:1a", "sample:M:2a");
    const second = pair("02", "sample:M:1a", "sample:M:1a");
    const { winners, conflicts } = pickPageWinners([first, second]);
    expect(winners).toEqual([second]);
    expect(conflicts.map((c) => c.original_name)).toEqual(["01.jpg"]);
  });

  it("does not count two readings of two different photos as agreement: the first photo by name wins", () => {
    const first = pair("01", "sample:M:1a", "sample:M:2a");
    // Reader a read photo 02 and reader b read photo 03; both said 1a. They were paired by page id only.
    const crossed = pair("02", "sample:M:1a", "sample:M:1a", true);
    const { winners, conflicts } = pickPageWinners([crossed, first]);
    expect(winners).toEqual([first]);
    expect(conflicts.map((c) => c.original_name)).toEqual(["02.jpg"]);
  });

  it("returns reader A's photo digest for pairDigest when A has a record, never falling back to reader B's on mismatch", () => {
    const mismatchBoth = pair("01", "sample:M:1a", "sample:M:1a", true);
    expect(pairDigest(mismatchBoth)).toBe("a".repeat(64));

    const mismatchOnlyBHash: PairedPage = {
      ...mismatchBoth,
      digestMismatch: { a: null, b: "b".repeat(64) },
    };
    expect(pairDigest(mismatchOnlyBHash)).toBeNull();

    const onlyB = pair("03", null, "sample:M:1a", false);
    expect(pairDigest(onlyB)).toBe("03".padEnd(64, "0"));
  });
});
