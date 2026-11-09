import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import { workbookRunStore } from "@/lib/workbook-job-store";
import { workbookDraftStore } from "@/lib/workbook-draft-store";
import { workbookShipStore } from "@/lib/workbook-ship-store";
import { sampleWorkbook } from "@/lib/workbook-sample";
vi.mock("server-only", () => ({}));

const id = "00000000-0000-4000-8000-000000000001";
const actor = { id, email: "admin@example.invalid" };
const draft: GeneratedWorkbook = {
  id, childId: id, number: 2, levels: [10], profileBuild: null, model: "fake",
  pages: [1, 2, 3, 4].map((number) => ({
    number, type: "blank", dayLabel: null, day: null, pageOfDay: null,
    qrToken: `token-${String(number).padStart(12, "0")}`, fit: { status: "not-needed" }, attempts: 0,
    questions: [], omissions: [], content: { kind: "blank", id: `UL-W02-P${number}`, level: 10 },
  })),
  counts: { pages: 4, questions: 0, checked: 0, notChecked: 0, failed: 0, failedPages: 0 },
};

function refusedDb(message: string, code = "55000") {
  const writes: string[] = [];
  const db = createClient<Database>("https://fixture.invalid", "synthetic", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/children") && init?.method === "GET") return Response.json({ parent_id: id });
      writes.push(url.pathname.split("/").at(-1)!);
      return Response.json({ code, message }, { status: 400 });
    } },
  });
  return { db, writes };
}

const cases = [
  ["plan_cancelled", "This family's plan is cancelled"],
  ["plan_control_pending", "A pause, cancellation or restart for this family is still in progress"],
  ["pause_previous_book_required", "This family's pause requires the previous workbook to be shipped first"],
  ["plan_paused", "This family's plan is paused"],
] as const;
const actions = [
  { name: "prepare", write: "start_workbook_run", suffix: ", so no new workbook can be prepared.", call: (db: ReturnType<typeof refusedDb>["db"]) => workbookRunStore(db).start(id, actor, { maxAttempts: 3, staleSeconds: 360 }), result: (reason: string) => ({ status: "refused", reason }) },
  { name: "save run draft", write: "save_workbook_run_draft", suffix: ", so this workbook draft cannot be saved.", call: (db: ReturnType<typeof refusedDb>["db"]) => workbookRunStore(db).saveDraft(id, id, draft), result: (refused: string) => ({ refused }) },
  { name: "approve", write: "approve_workbook_draft", suffix: ". Approval must wait.", call: (db: ReturnType<typeof refusedDb>["db"]) => workbookShipStore(db).approve({ draftId: id, revision: 1, actor, workbook: sampleWorkbook({ workbookId: id, parentId: id, childId: id, number: 2, qrTokens: ["first-page-token-123456", "second-page-token-123456", "third-page-token-123456"] }) }), result: (reason: string) => ({ status: "refused", reason }) },
  { name: "mark printed", write: "mark_workbook", suffix: ". This workbook cannot be marked printed.", call: (db: ReturnType<typeof refusedDb>["db"]) => workbookShipStore(db).mark({ workbookId: id, to: "printed", actor }), result: (reason: string) => ({ status: "refused", reason }) },
  { name: "ship", write: "mark_workbook", suffix: ". This workbook cannot be marked shipped.", call: (db: ReturnType<typeof refusedDb>["db"]) => workbookShipStore(db).mark({ workbookId: id, to: "shipped", actor }), result: (reason: string) => ({ status: "refused", reason }) },
  { name: "save draft", write: "workbook_drafts", suffix: ".", call: (db: ReturnType<typeof refusedDb>["db"]) => workbookDraftStore(db).save(draft), result: (reason: string) => ({ status: "refused", reason }) },
];

describe.each(actions)("$name plan refusals", (action) => {
  it.each(cases)("shows %s as a plan refusal for this action", async (code, sentence) => {
    const f = refusedDb(code);
    expect(await action.call(f.db)).toEqual(action.result(sentence + action.suffix));
    expect(f.writes).toEqual([action.write]);
  });
  it.each(["family_unavailable", "child_unavailable", "immutable row", "unknown future refusal"])("keeps deletion meaning for other 55000 messages: %s", async (message) => {
    const f = refusedDb(message);
    expect(await action.call(f.db)).toEqual(action.result("the family is being deleted"));
    expect(f.writes).toEqual([action.write]);
  });
  it("does not treat a different SQL error as a plan refusal", async () => {
    const f = refusedDb("plan_paused", "XX000");
    await expect(action.call(f.db)).rejects.toThrow("plan_paused");
  });
});
