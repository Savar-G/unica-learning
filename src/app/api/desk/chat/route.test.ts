import { setProductObserver } from "@/lib/product-monitoring";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { gate, run } = vi.hoisted(() => ({ gate: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/desk-chat-request", () => ({ deskChatContext: gate }));
vi.mock("@/lib/maya-chat-server", () => ({ runChat: run }));
import { POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const book = "22222222-2222-4222-8222-222222222222";
const typed = { type: "start", id, workbookId: book, reference: "page 3, number 3" };
const request = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/desk/chat", {
  method: "POST", headers: { origin }, body: JSON.stringify(body),
});
afterEach(() => { setProductObserver(null); vi.restoreAllMocks(); });
beforeEach(() => { setProductObserver(null); vi.clearAllMocks(); gate.mockResolvedValue({ ok: true, ctx: { child: "selected-child" } }); run.mockResolvedValue({ chat: null }); });

it("passes the typed reference under the server's selected-child context", async () => {
  expect((await POST(request(typed))).status).toBe(200);
  expect(run).toHaveBeenCalledWith({ child: "selected-child" }, typed);
});
it.each([
  { ...typed, question: { source: "workbook", workbookId: book, page: 3, question: 1 } },
  { ...typed, workbookId: "guessed" }, { ...typed, reference: "x".repeat(101) },
  { type: "start", id, question: { source: "assessment", workbookId: book, page: 3, question: 1 } },
])("rejects an invalid or competing selection before the desk check", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(gate).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
it("rejects a foreign origin before the desk check", async () => {
  expect((await POST(request(typed, "https://other.test"))).status).toBe(403);
  expect(gate).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
it.each(["signed_out", "forbidden", "unavailable"])("preserves the %s desk refusal before selection", async error => {
  gate.mockResolvedValue({ ok: false, error, status: 403 });
  expect((await POST(request(typed))).status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});

// #1107: a child turn streams only when the desk asks and the admitted turn has a checked sentence; else JSON as before.
const MSG = "33333333-3333-4333-8333-333333333333";
const child = { type: "child", id, messageId: MSG, revision: 2, text: "Is it 36?" };
const streaming = (body: unknown) => new Request("http://localhost/api/desk/chat", {
  method: "POST", headers: { origin: "http://localhost", accept: "application/x-ndjson, application/json" }, body: JSON.stringify(body),
});
const done = { usage: { used: 1, left: 59 }, chat: null, admission: "accepted" };
it("checks the selected desk before passing a structured board action", async () => {
  const action = { type: "exchange", id, revision: 2,
    target: { lessonId: "a-lesson", turnId: "a-turn", boardRevision: 2, objectId: "exchange-before", batchId: "call-b2" },
    fates: [{ batchId: "call-b2", fate: "shown" }] };
  run.mockResolvedValue(done);
  const res = await POST(streaming(action));
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  expect(run).toHaveBeenCalledWith({ child: "selected-child" }, action);
  run.mockClear();
  expect((await POST(request({ ...action, target: { ...action.target, boardRevision: 0 } }))).status).toBe(400);
  gate.mockResolvedValue({ ok: false, error: "forbidden", status: 403 });
  expect((await POST(request(action))).status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});
it("checks the selected desk before passing a board selection", async () => {
  const action = { type: "select", id, revision: 2,
    target: { lessonId: "a-lesson", turnId: "a-lesson:m2", boardRevision: 2, question: "52 - 28 = ?", objectId: "exchange-before", batchId: "call-b2", selectionId: "tap-1" },
    fates: [{ batchId: "call-b2", fate: "shown" }] };
  run.mockResolvedValue(done);
  const res = await POST(streaming(action));
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  expect(run).toHaveBeenCalledWith({ child: "selected-child" }, action);
  run.mockClear();
  expect((await POST(request({ ...action, target: { ...action.target, objectId: "../x" } }))).status).toBe(400);
  expect((await POST(request({ ...action, revision: -1 }))).status).toBe(400);
  gate.mockResolvedValue({ ok: false, error: "forbidden", status: 403 });
  expect((await POST(request(action))).status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});
it("streams an admitted turn's checked sentences, then its one final reply", async () => {
  // Falsifier: the JSON-only route answers one JSON body after the whole turn.
  const batch = { transactionId: "call-b2", commands: [{ op: "highlight", id: "h1" }] };
  run.mockImplementation(async (_ctx, _action, options) => { options.say.part("12 minus 8 is 4.", 0, [batch]); options.say.part("What is 4 minus 2?", 1); return done; });
  const res = await POST(streaming(child));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^application\/x-ndjson/);
  const events = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  expect(events).toEqual([{ type: "say", index: 0, text: "12 minus 8 is 4.", board: [batch] }, { type: "say", index: 1, text: "What is 4 minus 2?" }, { type: "final", reply: done }]);
});
it.each([
  ["a refusal", { usage: {}, chat: null, error: "conflict", admission: "refused" }],
  ["busy", { usage: {}, chat: null, error: "busy", admission: "accepted" }],
])("answers %s with no sentence as the JSON reply, even to a desk that asked for a stream", async (_, reply) => {
  run.mockResolvedValue(reply);
  const res = await POST(streaming(child));
  expect(res.headers.get("content-type")).toMatch(/^application\/json/);
  expect(await res.json()).toEqual(reply);
});
it("answers a failure before any sentence with the JSON 503, not a 200 stream", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  run.mockRejectedValue(Error("db down"));
  const res = await POST(streaming(child));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "unavailable" });
});
it("keeps the desk check before any stream", async () => {
  gate.mockResolvedValue({ ok: false, error: "forbidden", status: 403 });
  const res = await POST(streaming(child));
  expect(res.status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});
it("keeps older desks and other actions on JSON with no ear", async () => {
  run.mockResolvedValue(done);
  await POST(request(child));
  expect(run).toHaveBeenLastCalledWith({ child: "selected-child" }, child);
  await POST(streaming({ type: "read", id }));
  expect(run).toHaveBeenLastCalledWith({ child: "selected-child" }, { type: "read", id });
});

it("records one handled stream error after a sentence, with no child text in the event", async () => {
  const observer = vi.fn(); setProductObserver(observer);
  run.mockImplementation(async (_ctx, _action, options) => {
    options.say.part("PRIVATE CHILD WORDS", 0);
    throw Error("PRIVATE CHILD WORDS");
  });
  const response = await POST(streaming(child));
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('"type":"error"');
  expect(observer.mock.calls.filter(([e]) => e.code === "maya.failed")).toEqual([[{ code: "maya.failed", attributes: { callId: id, step: "stream" } }]]);
  expect(JSON.stringify(observer.mock.calls)).not.toContain("PRIVATE");
});
