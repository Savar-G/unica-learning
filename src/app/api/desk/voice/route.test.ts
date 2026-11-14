import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  context: { ok: true } as { ok: true; ctx?: unknown } | { ok: false; error: string; status: number },
  gate: "open" as "open" | "closed" | "too_young",
  ran: [] as unknown[],
  gates: 0,
  fail: false,
}));
const CTX = { db: {}, parent: "p", child: "c", name: "Leah", grade: 4, zone: "America/Vancouver" };
vi.mock("@/lib/desk-chat-request", () => ({ deskChatContext: async () => (state.context.ok ? { ok: true, ctx: CTX } : state.context) }));
vi.mock("@/lib/maya-voice-desk-server", () => ({
  voiceGate: async () => { state.gates++; if (state.fail) throw Error("read failed"); return state.gate; },
  runVoice: async (_ctx: unknown, action: unknown) => { state.ran.push(action); return { call: null, usage: null }; },
}));
const { POST } = await import("./route");

const ID = "55555555-5555-4555-8555-555555555555";
const BOOK = "44444444-4444-4444-8444-444444444444";
const question = { source: "workbook", workbookId: BOOK, page: 1, question: 2 };
const post = (body: unknown, headers: Record<string, string> = { origin: "https://example.invalid" }) =>
  POST(new Request("https://example.invalid/api/desk/voice", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
beforeEach(() => { state.context = { ok: true }; state.gate = "open"; state.ran = []; state.gates = 0; state.fail = false; });

describe("POST /api/desk/voice", () => {
  it("refuses a request from another site before anything runs", async () => {
    const r = await post({ type: "read", id: ID }, { origin: "https://evil.invalid" });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ call: null, usage: null, error: "forbidden" });
    expect((await post({ type: "read", id: ID }, {})).status).toBe(403);
    expect(state.ran).toEqual([]);
  });

  it.each([
    ["not JSON", "{"],
    ["null", "null"],
    ["a list", "[]"],
    ["no id", { type: "read" }],
    ["a bad id", { type: "read", id: "not-a-uuid" }],
    ["an unknown type", { type: "end", id: ID }],
    ["a start with no question", { type: "start", id: ID }],
    ["a start of an assessment question", { type: "start", id: ID, question: { source: "assessment", assessmentId: BOOK, questionId: "s1-1" } }],
    ["a start with a bad workbook id", { type: "start", id: ID, question: { ...question, workbookId: "x" } }],
    ["a start with page 0", { type: "start", id: ID, question: { ...question, page: 0 } }],
    ["a start with a fractional question", { type: "start", id: ID, question: { ...question, question: 1.5 } }],
    ["a start with a huge question", { type: "start", id: ID, question: { ...question, question: 2 ** 60 } }],
    ["a body that is too long", { type: "read", id: ID, pad: "x".repeat(2100) }],
  ])("answers 400 for %s and runs nothing", async (_name, body) => {
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ call: null, usage: null, error: "invalid" });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(state.ran).toEqual([]);
  });

  it("answers the desk's refusal when no parent is signed in or the desk is not open", async () => {
    state.context = { ok: false, error: "signed_out", status: 401 };
    expect((await post({ type: "read", id: ID })).status).toBe(401);
    state.context = { ok: false, error: "forbidden", status: 403 };
    expect(await (await post({ type: "read", id: ID })).json()).toMatchObject({ error: "forbidden" });
    expect(state.ran).toEqual([]);
  });

  it("passes only the action's own fields on, never a parent or child from the body", async () => {
    const r = await post({ type: "start", id: ID, question: { ...question, parentId: "someone", childId: "else" }, parentId: "x", childId: "y" });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(state.ran).toEqual([{ type: "start", id: ID, question: { source: "workbook", workbookId: BOOK, page: 1, question: 2 } }]);
    await post({ type: "token", id: ID, parentId: "x" });
    expect(state.ran[1]).toEqual({ type: "token", id: ID });
  });

  it.each(["closed", "too_young"] as const)("refuses a start or a token with 403 when voice is %s for this child", async (gate) => {
    state.gate = gate;
    for (const body of [{ type: "start", id: ID, question }, { type: "token", id: ID }]) {
      const r = await post(body);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ call: null, usage: null, error: "unavailable" });
    }
    expect(state.ran).toEqual([]);
  });

  it("still reads and cancels a call when voice is closed, with no voice gate read", async () => {
    state.gate = "closed";
    expect((await post({ type: "read", id: ID })).status).toBe(200);
    expect((await post({ type: "cancel", id: ID })).status).toBe(200);
    expect(state.ran).toEqual([{ type: "read", id: ID }, { type: "cancel", id: ID }]);
    expect(state.gates).toBe(0);
  });

  it("closes with 503 when the gate cannot be read", async () => {
    state.fail = true;
    const r = await post({ type: "start", id: ID, question });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ call: null, usage: null, error: "unavailable" });
    expect(state.ran).toEqual([]);
  });
});
