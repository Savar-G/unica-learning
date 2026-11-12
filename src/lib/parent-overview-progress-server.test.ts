import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { firstObservation, type ExpectedItem } from "@/lib/scan-observation";
import { parentViewReader } from "@/lib/parent-view-server";

vi.mock("server-only", () => ({}));

const parent = "parent", child = "child", book = "book", page = "page", revision = "print";
const expected: ExpectedItem = {
  identity: { workbookId: book, printedRevision: revision, pageId: page, itemId: "item" },
  number: 1, method: "parent", scoredRegions: [], mastery: { eligible: true, reason: null },
  teaching: { curriculum: { key: "bc", version: "1" }, part: "practice", slot: "1", practiceType: "now-you", itemStep: { unit: "U1", skill: "add", step: 1 } },
};
const event = { key: `marking:${createHash("sha256").update(`${book}:${revision}:${page}:item`).digest("hex")}`, parentId: parent, childId: child, source: "marking", question: { source: "workbook", workbookId: book, page: 1, question: 1 }, skill: { standard: "2.4", skills: [] } };
const mark = (result: "right" | "wrong") => ({ id: "row", expected, observation: { ...firstObservation(expected, "photo"), state: "parent-checked", method: "parent", actor: "admin", result, resultVersion: 2 }, original_event: event, event_id: "event", evidence_at: "2026-11-01T00:00:00Z", model: null, prompt: null });

function reader(items: ReturnType<typeof mark>[], questionId = "item", secondTries: { result: string }[] = [], marking: { revision: number; status: { revision: number; profile_revision: number } | null } = { revision: 1, status: { revision: 1, profile_revision: 1 } }, revisions: number[] = []) {
  const requests: string[] = [];
  const selects: string[] = [];
  const db = createClient<never>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), table = url.pathname.replace("/rest/v1/", "");
    requests.push(table);
    if (url.searchParams.has("select")) selects.push(`${table}?${url.searchParams.get("select")}`);
    if (table === "rpc/scan_marking_command") {
      const body = JSON.parse(String(init?.body));
      // A queued revision answers first, so a test can move the revision between the reads.
      return Response.json(body.p_action === "revision" ? revisions.shift() ?? marking.revision : body.p_data.after ? [] : items);
    }
    if (table === "children") return Response.json([{ id: child }]);
    if (table === "workbooks") return Response.json([{ id: book, printed_revision: revision }]);
    if (table === "child_profiles") return Response.json([{ build_token: "token", assessment_id: "test-1" }]);
    if (table === "scan_marking_revisions") return Response.json(marking.status ? [marking.status] : []);
    if (table === "workbook_questions") return Response.json(url.searchParams.has("id") ? [] : [{ id: "question-row", page_id: page, question_number: 1, qid: questionId, standard: "2.4" }]);
    if (table === "skill_state_history") return Response.json([]);
    if (table === "workbook_second_tries") return Response.json(secondTries);
    throw new Error(`Unexpected ${table}`);
  } } }) as never;
  return { value: parentViewReader(db, parent, db, {}), requests, selects };
}

describe("stored overview marks", () => {
  it("reads again when the marking revision moves between the reads, and gives up after three tries", async () => {
    const moved = reader([mark("right")], "item", [], undefined, [1, 2]);
    expect((await moved.value.overviewProgress(child))?.marks).toEqual([{ area: "number", level: 2, correct: true }]);
    expect(moved.requests.filter((t) => t === "rpc/scan_marking_command" ).length).toBeGreaterThan(3);
    await expect(reader([], "item", [], undefined, [1, 2, 3, 4, 5, 6]).value.overviewProgress(child)).rejects.toThrow("overview progress changed");
  });
  it("reads no workbook question with no marked item, and only two package fields with one", async () => {
    const none = reader([]);
    expect((await none.value.overviewProgress(child))?.marks).toEqual([]);
    expect(none.requests).not.toContain("workbook_questions");
    const one = reader([mark("right")]);
    expect((await one.value.overviewProgress(child))?.skillMarks).toEqual([{ standard: "2.4", right: true, review: false, at: expect.any(String) }]);
    expect([...new Set(one.selects.filter((q) => q.startsWith("workbook_questions?")))]).toEqual(["workbook_questions?id,page_id,question_number,qid:package->>id,standard:package->skill->>standard"]);
  });
  it("uses the effective correction for the original and leaves second tries outside the score", async () => {
    const r = reader([mark("wrong")], "item", [{ result: "right" }]);
    expect((await r.value.overviewProgress(child))?.marks).toEqual([{ area: "number", level: 2, correct: false }]);
    const corrected = reader([mark("right")]);
    expect((await corrected.value.overviewProgress(child))?.marks).toEqual([{ area: "number", level: 2, correct: true }]);
    expect(corrected.requests).not.toContain("workbook_second_tries");
  });
  it("requires the stored question identity and the current printed revision", async () => {
    expect((await reader([mark("right")], "another-item").value.overviewProgress(child))?.marks).toEqual([]);
    const stale = mark("right");
    stale.expected = { ...expected, identity: { ...expected.identity, printedRevision: "old" } };
    stale.observation = { ...stale.observation, identity: stale.expected.identity };
    expect((await reader([stale]).value.overviewProgress(child))?.marks).toEqual([]);
    const foreign = mark("right");
    foreign.original_event = { ...event, childId: "another-child" };
    await expect(reader([foreign]).value.overviewProgress(child)).rejects.toThrow("overview mark source mismatch");
  });
  it("refuses duplicate effective originals instead of counting twice", async () => {
    await expect(reader([mark("right"), { ...mark("wrong"), id: "second" }]).value.overviewProgress(child)).rejects.toThrow("duplicate original result");
  });
});
