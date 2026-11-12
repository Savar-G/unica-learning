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

function reader(items: ReturnType<typeof mark>[], questionId = "item", secondTries: { result: string }[] = [], marking: { revision: number; status: { revision: number; profile_revision: number } | null } = { revision: 1, status: { revision: 1, profile_revision: 1 } }) {
  const requests: string[] = [];
  const db = createClient<never>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input)), table = url.pathname.replace("/rest/v1/", "");
    requests.push(table);
    if (table === "rpc/scan_marking_command") {
      const body = JSON.parse(String(init?.body));
      return Response.json(body.p_action === "revision" ? marking.revision : body.p_data.after ? [] : items);
    }
    if (table === "children") return Response.json([{ id: child }]);
    if (table === "workbooks") return Response.json([{ id: book, printed_revision: revision }]);
    if (table === "child_profiles") return Response.json([{ build_token: "token" }]);
    if (table === "scan_marking_revisions") return Response.json(marking.status ? [marking.status] : []);
    if (table === "workbook_questions") return Response.json(url.searchParams.has("id") ? [] : [{ id: "question-row", page_id: page, question_number: 1, package: { id: questionId, skill: { standard: "2.4" } } }]);
    if (table === "skill_state_history") return Response.json([]);
    if (table === "workbook_second_tries") return Response.json(secondTries);
    throw new Error(`Unexpected ${table}`);
  } } }) as never;
  return { value: parentViewReader(db, parent, db, {}), requests };
}

describe("stored overview marks", () => {
  it("treats the stored states as current only when the profile includes every published mark", async () => {
    const ready = async (marking: Parameters<typeof reader>[3]) => (await reader([], "item", [], marking).value.overviewProgress(child))?.statesReady;
    expect(await ready({ revision: 0, status: null })).toBe(true);
    expect(await ready({ revision: 1, status: { revision: 1, profile_revision: 1 } })).toBe(true);
    expect(await ready({ revision: 2, status: { revision: 2, profile_revision: 1 } })).toBe(false);
    expect(await ready({ revision: 1, status: null })).toBe(false);
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
