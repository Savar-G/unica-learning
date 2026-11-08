import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { chatGradeLine, chatPlanClosedLine } from "@/lib/maya-chat";

vi.mock("server-only", () => ({}));
// No Stripe in these cases: a child's open plan opens chat with no Stripe read, and the family is on no list.
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => state.db }));
import { deskChat } from "@/lib/maya-chat-server";

type Row = Record<string, unknown>;
const PARENT = "parent", CHILD = "child";
const planRow = (kind: string) => ({ parent_id: PARENT, child_id: CHILD, kind, next_charge_at: kind === "free_month" ? "2099-01-01T00:00:00Z" : null, ends_at: null, monthly_cents: 7999, ending_free: false });
/** PostgREST in memory: eq filters; a table named in `broken` fails. Anything else this desk does not need fails too. */
function db({ plans = [] as Row[], broken = "" } = {}) {
  const tables: Record<string, Row[]> = { child_plan_states: plans, test_accounts: [], maya_chat_families: [], children: [{ id: CHILD, parent_id: PARENT, first_name: "Leah" }] };
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

describe("what the desk says about chat, by the family's plan", () => {
  it("a family that never had a plan keeps the start-soon line (no note)", async () => {
    expect(await desk(db())).toEqual({ usage: null, note: null, planClosed: false });
    expect(await desk(db({ plans: [planRow("not_started")] }))).toEqual({ usage: null, note: null, planClosed: false });
  });

  it("an open plan gets the chat, with no note", async () => {
    const chat = await desk(db({ plans: [planRow("paying")] }));
    expect(chat.note).toBeNull();
    expect(chat.planClosed).toBe(false);
    expect(chat.usage?.used).toBe(4);
  });

  it.each(["ended", "payment_failed", "paused"])("a %s plan gets the closed-plan line, not start soon", async (kind) => {
    expect(await desk(db({ plans: [planRow(kind)] }))).toEqual({ usage: null, note: chatPlanClosedLine(), planClosed: true });
  });

  it("the closed-plan line comes before the grade line: a younger child of a closed family is closed too", async () => {
    expect((await desk(db({ plans: [planRow("ended")] }), 2)).note).toBe(chatPlanClosedLine());
    expect((await desk(db({ plans: [planRow("paying")] }), 2)).note).toBe(chatGradeLine());
  });

  it("a failed plan read says nothing about the plan: no closed line", async () => {
    expect(await desk(db({ plans: [planRow("ended")], broken: "child_plan_states" }))).toEqual({ usage: null, note: null, planClosed: false });
  });

  it("the emergency stop with an open plan is not a closed plan", async () => {
    vi.stubEnv("MAYA_CHAT_ENABLED", "off");
    expect(await desk(db({ plans: [planRow("paying")] }))).toEqual({ usage: null, note: null, planClosed: false });
  });
});
