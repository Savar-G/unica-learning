import { describe, expect, it } from "vitest";
import type { ReviewComment } from "@/lib/workbook-edit";
import type { ReviewSend, ReviewVersion } from "@/lib/admin-store";
import { author, authorCounts, changedPages, commentPlan, commentResult, historyGroups, pageCounts, sendLabel, versionStatus } from "@/lib/workbook-review-display";

const comment = (overrides: Partial<ReviewComment> = {}): ReviewComment => ({ id: "c", draftId: "d", revision: 2, page: 22, question: null, x: 0, y: 0, note: "Change text", item: null, actor: { id: "a", email: "savar@example.test" }, createdAt: "2026-11-08T23:00:00Z", status: "done", error: null, batchId: "made", before: null, after: null, ...overrides });
const made: ReviewSend = { id: "made", createdAt: "2026-11-08T23:56:00Z", finishedAt: "2026-11-08T23:57:00Z", revision: 3, baseRevision: 2, status: "done" };
const kept: ReviewSend = { id: "kept", createdAt: "2026-11-09T00:00:00Z", finishedAt: "2026-11-09T00:01:00Z", revision: null, baseRevision: 3, status: "failed" };
const version = { revision: 3, createdAt: "2026-11-08T23:57:00Z", byUser: "a", byEmail: "savar@example.test" } as ReviewVersion;
const names = { a: "Savar", b: "Cedric" };

describe("review display", () => {
  it("reports the version and a later send without erasing the applied comments", () => {
    const cs = [comment(), ...[22, 52, 81].map((page, i) => comment({ id: String(i), page, batchId: "kept", resultNote: "Kept" }))];
    expect(versionStatus(version, [kept, made], cs, names)).toEqual({ line: "Version 3, made Nov 8, 3:57 pm by Savar. 1 comment applied in this version.", later: "Last send, Nov 8, 4:01 pm: nothing changed. 3 comments were kept as they were (pages 22, 52 and 81)." });
    expect(commentResult(cs[1], kept)).toBe("Kept as is");
    expect(commentResult(cs[0], made)).toBe("Applied");
  });
  it("says how many comments a version holds in total and in this version", () => {
    const earlier: ReviewSend = { id: "earlier", createdAt: "2026-11-07T23:00:00Z", finishedAt: "2026-11-07T23:05:00Z", revision: 2, baseRevision: 1, status: "done" };
    const cs = [comment(), comment({ id: "e1", batchId: "earlier" }), comment({ id: "e2", batchId: "earlier" })];
    expect(versionStatus(version, [made, earlier], cs, names).line).toBe("Version 3, made Nov 8, 3:57 pm by Savar. 3 comments applied in total (1 in this version).");
  });
  it("groups prior comments by send and counts only open comments on badges", () => {
    const cs = [comment(), comment({ id: "p", status: "pending", batchId: null }), comment({ id: "f", status: "failed", batchId: "kept", error: "unknown" })];
    expect(historyGroups(cs, [kept, made]).groups.map(g => g.send.id)).toEqual(["kept", "made"]);
    expect(pageCounts(cs, 22)).toEqual({ pending: 2, earlier: true });
    expect(commentResult(cs[2], kept)).toContain("Not applied");
  });
  it("uses stored names and counts everyone whose comments will be sent", () => {
    const cs = [comment({ status: "pending" }), comment({ id: "b", status: "pending", actor: { id: "b", email: "c@example.test" } })];
    expect(author("missing", "other@example.test", names)).toBe("other");
    expect(authorCounts(cs, names)).toEqual([{ name: "Savar", count: 1 }, { name: "Cedric", count: 1 }]);
    expect(sendLabel(cs, names)).toBe("Send all comments (2) from Savar and Cedric");
  });
  it("describes the existing route", () => {
    const day = { content: { kind: "day" }, questions: [] };
    expect(commentPlan(day, comment())).toBe("Wording: applies by itself in a minute");
    expect(commentPlan(day, comment({ note: "Change the layout" }))).toBe("Layout: goes to the team, usually the same day");
  });
  it("compares saved page image paths", () => {
    const v = (path: string) => ({ rendering: { pages: [{ number: 1, image: { path } }] } }) as ReviewVersion;
    expect(changedPages(v("new"), v("old"))).toEqual([1]);
    expect(changedPages(v("same"), v("same"))).toEqual([]);
    expect(changedPages(v("new"), undefined)).toEqual([]);
  });
});
