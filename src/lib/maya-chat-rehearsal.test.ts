import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { mayaCalls, type CallResult } from "@/lib/maya-call";
import { memoryCallStore } from "@/lib/maya-call-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { learningEvents } from "@/lib/learning-events";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
vi.mock("server-only", () => ({}));
import { writeNoteAfterCall } from "@/lib/maya-call-note-server";

// The rehearsal family (#530): a test family on the chat list, marked as the rehearsal, receives the parent note of its
// chat, which every other test family is refused. A chat runs to its end through the shared call module on its
// in-memory seams; its `note` seam is the server note writer on a fake database that keeps the inserted notes.

const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222";
const pkg = { ...SAMPLE_PACKAGES["add-27-39"], ref: { source: "workbook" as const, workbookId: "33333333-3333-4333-8333-333333333333", page: 1, question: 1 } };
type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  const inserted: Row[] = [];
  const db = createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    if (init?.method === "POST") {
      inserted.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
    let rows = tables[table] ?? [];
    for (const [key, raw] of url.searchParams) if (raw.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === raw.slice(3));
    return Response.json(rows[0] ?? null);
  } } });
  return { db, inserted };
}

async function chatToTheEnd(tables: Record<string, Row[]>) {
  const { db, inserted } = fakeDb({ children: [{ id: child, first_name: "Leah" }], ...tables });
  const calls = mayaCalls({ store: memoryCallStore({ testFamilies: [] }), history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: child, parentId: parent }] })), rebuild: async () => true,
    model: () => ruleMayaModel(), isTestFamily: async () => true, canChat: async () => true, note: writeNoteAfterCall(db),
    alerts: { send: async () => {}, list: async () => [] }, clock: () => Date.parse("2026-11-05T17:00:00Z"),
    newId: () => "44444444-4444-4444-8444-444444444444", seed: () => 42 });
  const ok = (r: CallResult) => { if (!r.ok) throw Error(r.error); return r; };
  let r = ok(await calls.start({ kind: "chat", parentId: parent, childId: child, childName: "Leah", package: pkg, startedBy: parent }));
  for (const text of ["I think it's 66.", "Because 7 and 9 make 16, so I carried the one.", "I wrote it."]) {
    if (r.view.status === "ended") break;
    r = ok(await calls.input(r.view.id, r.view.revision, { type: "child", text }, "Leah"));
  }
  if (r.view.status !== "ended") ok(await calls.input(r.view.id, r.view.revision, { type: "end" }, "Leah"));
  return inserted;
}

afterEach(() => vi.unstubAllEnvs());
describe("the rehearsal family's parent note (#530)", () => {
  it("writes a real note for the rehearsal family's chat", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", ""); vi.stubEnv("AI_REVIEW_FAKE", "");
    const notes = await chatToTheEnd({ test_accounts: [{ parent_id: parent }], maya_chat_families: [{ parent_id: parent, rehearsal: true }] });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ parent_id: parent, child_id: child, writer: "code" });
    expect(JSON.stringify(notes[0])).not.toContain("Leah");
  });
  it.each([
    ["a test family off the list", []],
    ["a listed test family that is not the rehearsal", [{ parent_id: parent, rehearsal: false }]],
  ])("writes no note for %s", async (_, list) => {
    vi.stubEnv("OPENROUTER_API_KEY", ""); vi.stubEnv("AI_REVIEW_FAKE", "");
    expect(await chatToTheEnd({ test_accounts: [{ parent_id: parent }], maya_chat_families: list })).toEqual([]);
  });
  it("does not let a rehearsal mark on another family through", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", ""); vi.stubEnv("AI_REVIEW_FAKE", "");
    const other = "55555555-5555-4555-8555-555555555555";
    expect(await chatToTheEnd({ test_accounts: [{ parent_id: parent }], maya_chat_families: [{ parent_id: other, rehearsal: true }] })).toEqual([]);
  });
});
