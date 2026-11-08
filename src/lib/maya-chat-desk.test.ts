import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { chatGradeLine } from "@/lib/maya-chat";

vi.mock("server-only", () => ({}));
// No Stripe in these cases: a child's open plan opens chat with no Stripe read, and the family is on no list.
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => state.db }));
import { deskChat } from "@/lib/maya-chat-server";

type Row = Record<string, unknown>;
const PARENT = "parent", CHILD = "child";
const planRow = (kind: string, next_charge_at: string | null = kind === "free_month" ? "2099-01-01T00:00:00Z" : null, child_id = CHILD) => ({ parent_id: PARENT, child_id, kind, next_charge_at, ends_at: null, monthly_cents: 7999, ending_free: false });
const ENDED = "Chat with Maya is closed because your family's plan has ended. Ask a grown-up.";
const FAILED = "Chat with Maya is paused because the last payment did not go through. Ask a grown-up.";
const PAUSED = "Chat with Maya is paused because your family paused the plan. Ask a grown-up.";
const OTHER = "Chat with Maya is closed because your family's plan is not running. Ask a grown-up.";
/** PostgREST in memory: eq filters; a table named in `broken` fails. Anything else this desk does not need fails too. */
function db({ plans = [] as Row[], broken = "" } = {}) {
  const tables: Record<string, Row[]> = { child_plan_states: plans, test_accounts: [], maya_chat_families: [], children: [{ id: CHILD, parent_id: PARENT, first_name: "Leah" }, { id: "sib", parent_id: PARENT, first_name: "Ben" }] };
  return createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    if (table === broken) return Response.json({ message: "read failed" }, { status: 500 });
    if (table === "maya_chat_messages") return new Response(null, { status: 200, headers: { "content-range": "*/4" } });
    if (!(table in tables)) return Response.json({ message: `not in this fixture: ${table}` }, { status: 500 });
    let rows = tables[table];
    for (const [key, raw] of url.searchParams) if (raw.startsWith("eq.")) rows = rows.filter((r) => String(r[key]) === raw.slice(3));
    return Response.json(rows);
  } } });
}
const desk = (d: ReturnType<typeof db>, grade = 4) => { state.db = d; return deskChat(d, PARENT, { id: CHILD, grade }, "America/Vancouver"); };
afterEach(() => { vi.unstubAllEnvs(); state.db = null; });

describe("what the desk says about chat, by the desk child's own plan (D-304, words approved 2026-11-08)", () => {
  it("a child that never had a plan keeps the start-soon line (no note)", async () => {
    expect(await desk(db())).toEqual({ usage: null, note: null, planClosed: false });
    expect(await desk(db({ plans: [planRow("not_started")] }))).toEqual({ usage: null, note: null, planClosed: false });
  });

  it("an open plan gets the chat, with no note", async () => {
    const chat = await desk(db({ plans: [planRow("paying")] }));
    expect(chat.note).toBeNull();
    expect(chat.planClosed).toBe(false);
    expect(chat.usage?.used).toBe(4);
  });

  it("an ended plan names the end", async () => {
    expect(await desk(db({ plans: [planRow("ended")] }))).toEqual({ usage: null, note: ENDED, planClosed: true });
  });
  it("a cancelled plan past its end date reads as ended", async () => {
    expect(await desk(db({ plans: [{ ...planRow("ending"), ends_at: "2000-01-01T00:00:00Z" }] }))).toEqual({ usage: null, note: ENDED, planClosed: true });
  });
  it("a failed payment names the payment", async () => {
    expect(await desk(db({ plans: [planRow("payment_failed")] }))).toEqual({ usage: null, note: FAILED, planClosed: true });
  });
  it("a paused plan with a stored resume date gives the day in the family's time zone, not UTC's", async () => {
    // 03:00 UTC on December 10 is still December 9 in Vancouver.
    expect(await desk(db({ plans: [planRow("paused", "2099-12-10T03:00:00Z")] }))).toEqual({ usage: null,
      note: "Chat with Maya is paused because your family paused the plan. It starts again on December 9, 2099.", planClosed: true });
  });
  it("a paused plan with no stored resume date, or one already past, gives no date", async () => {
    expect(await desk(db({ plans: [planRow("paused", null)] }))).toEqual({ usage: null, note: PAUSED, planClosed: true });
    expect(await desk(db({ plans: [planRow("paused", "2000-01-01T00:00:00Z")] }))).toEqual({ usage: null, note: PAUSED, planClosed: true });
  });
  it("a state with no usable kind does not guess: the not-running line", async () => {
    expect(await desk(db({ plans: [planRow("gold")] }))).toEqual({ usage: null, note: OTHER, planClosed: true });
    expect(await desk(db({ plans: [planRow("ending")] }))).toEqual({ usage: null, note: OTHER, planClosed: true });
  });

  describe("the reason is the desk child's own plan, never a sibling's", () => {
    it.each<[string, string, Row, Row, string | null]>([
      ["this child ended, a sibling paying", "ended / paying", planRow("ended"), planRow("paying", null, "sib"), ENDED],
      ["this child paying, a sibling ended", "paying / ended", planRow("paying"), planRow("ended", null, "sib"), null],
      ["this child failed, a sibling paused", "payment_failed / paused", planRow("payment_failed"), planRow("paused", "2099-12-10T20:00:00Z", "sib"), FAILED],
      ["this child paused, a sibling failed", "paused / payment_failed", planRow("paused", null), planRow("payment_failed", null, "sib"), PAUSED],
      ["this child with no plan, a sibling ended", "none / ended", planRow("not_started"), planRow("ended", null, "sib"), null],
      ["this child ended, a sibling with no plan", "ended / none", planRow("ended"), planRow("not_started", null, "sib"), ENDED],
    ])("%s", async (_, __, mine, sibling, line) => {
      for (const plans of [[mine, sibling], [sibling, mine]]) {
        const chat = await desk(db({ plans }));
        expect(chat.note).toBe(line);
        expect(chat.planClosed).toBe(line !== null);
        // A child whose own plan is open can chat; one with a stopped plan cannot.
        if (mine.kind === "paying") expect(chat.usage?.used).toBe(4);
        else expect(chat.usage).toBeNull();
      }
    });
    it("two paused children: this child's own resume date, not the sibling's", async () => {
      const plans = [planRow("paused", "2099-12-20T20:00:00Z"), planRow("paused", "2099-12-10T20:00:00Z", "sib")];
      expect((await desk(db({ plans }))).note).toBe("Chat with Maya is paused because your family paused the plan. It starts again on December 20, 2099.");
    });
  });

  it("the closed-plan line comes before the grade line: a younger child of a closed family is closed too", async () => {
    expect((await desk(db({ plans: [planRow("ended")] }), 2)).note).toBe(ENDED);
    expect((await desk(db({ plans: [planRow("paying")] }), 2)).note).toBe(chatGradeLine());
  });

  it("a failed plan read gives the not-running line: chat is closed, and the desk does not stay silent", async () => {
    expect(await desk(db({ plans: [planRow("ended")], broken: "child_plan_states" }))).toEqual({ usage: null, note: OTHER, planClosed: true });
    expect(await desk(db({ plans: [planRow("paying")], broken: "child_plan_states" }))).toEqual({ usage: null, note: OTHER, planClosed: true });
  });
  it("a chat check that fails is closed, and the line still names this child's plan", async () => {
    expect(await desk(db({ plans: [planRow("ended")], broken: "test_accounts" }))).toEqual({ usage: null, note: ENDED, planClosed: true });
  });
  it("no secret key: nothing can be read, so the not-running line", async () => {
    state.db = null;
    expect(await deskChat(db(), PARENT, { id: CHILD, grade: 4 }, "America/Vancouver")).toEqual({ usage: null, note: OTHER, planClosed: true });
  });

  it("the emergency stop with an open plan is not a closed plan", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "off");
    expect(await desk(db({ plans: [planRow("paying")] }))).toEqual({ usage: null, note: null, planClosed: false });
  });
});
