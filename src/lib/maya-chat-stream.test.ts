import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { CallSeams } from "@/lib/maya-call";
import type { ChatReply } from "@/lib/maya-chat";
import { chatStream, readChatStream, type ChatStreamEvent } from "@/lib/maya-chat-stream";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { MAYA_NOTICE_VERSION } from "@/lib/maya-notice";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";

vi.mock("server-only", () => ({}));
const local = vi.hoisted(() => ({ books: null as unknown, seams: null as unknown }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => local.books }));
vi.mock("@/lib/maya-call-store", () => ({ mayaCallStore: () => (local.seams as CallSeams).store }));
vi.mock("@/lib/maya-call-seams", () => ({ callSeams: () => local.seams }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));
import { runChat } from "@/lib/maya-chat-server";

// #1107: the stream contract (chatStream on the server, readChatStream on the desk), and the chat server's admission
// before any streamed word: the database claim and every refusal come first, with no model call and no stream.

const usage = { used: 1, left: 59, resetsAt: 0, backAt: "tomorrow" };
const done = (text = "done"): ChatReply => ({ usage, chat: null, error: text });
const lines = async (stream: ReadableStream<Uint8Array>) => (await new Response(stream).text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as ChatStreamEvent);
const body = (...events: string[]) => new ReadableStream<Uint8Array>({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(e)); c.close(); } });

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

describe("chatStream: the route's answer for a child turn", () => {
  it("answers the reply itself when no sentence came first (the JSON contract of older desks)", async () => {
    // Falsifier: a stream (a 200 header) for a refusal.
    const keep = vi.fn();
    expect(await chatStream(async () => done("busy"), keep)).toEqual({ reply: done("busy") });
    expect(keep).not.toHaveBeenCalled();
  });

  it("answers the failure itself when the request fails before any sentence", async () => {
    const failed = await chatStream(async () => { throw Error("db down"); });
    expect(failed).toMatchObject({ failed: expect.any(Error) });
  });

  it("streams the queued and later sentences in order, then exactly one final reply", async () => {
    let finish: (r: ChatReply) => void = () => {};
    const keep = vi.fn();
    const ran = await chatStream(async (say) => {
      say.part("One.", 0);
      await Promise.resolve();
      say.part("Two.", 1);
      return new Promise<ChatReply>((r) => { finish = r; });
    }, keep);
    if (!("stream" in ran)) throw Error("expected a stream");
    expect(keep).toHaveBeenCalledTimes(1);
    setTimeout(() => finish(done("final")), 5);
    expect(await lines(ran.stream)).toEqual([
      { type: "say", index: 0, text: "One." }, { type: "say", index: 1, text: "Two." }, { type: "final", reply: done("final") },
    ]);
  });

  it("ends a stream whose request fails after a sentence with one error event", async () => {
    const ran = await chatStream(async (say) => { say.part("One.", 0); await new Promise((r) => setTimeout(r, 5)); throw Error("save failed"); });
    if (!("stream" in ran)) throw Error("expected a stream");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await lines(ran.stream)).toEqual([{ type: "say", index: 0, text: "One." }, { type: "error", error: "unavailable" }]);
  });

  it("a reader that goes away never stops the turn: it finishes, and the kept promise settles with its reply", async () => {
    // Falsifier: cancelling the stream rejects or abandons the turn.
    let finish: (r: ChatReply) => void = () => {};
    let kept: Promise<unknown> | null = null;
    const ran = await chatStream(async (say) => { say.part("One.", 0); return new Promise<ChatReply>((r) => { finish = r; }); }, (work) => { kept = work; });
    if (!("stream" in ran)) throw Error("expected a stream");
    const reader = ran.stream.getReader();
    await reader.read();
    await reader.cancel();
    finish(done("saved"));
    expect(await kept).toEqual({ reply: done("saved") });
  });
});

describe("a sentence's drawing in the stream (#1107)", () => {
  const batch = { transactionId: "call-b3", commands: [{ op: "highlight", id: "h1" }] } as never;
  it("carries the drawing saved with the sentence, and the desk reads it with the sentence", async () => {
    const ran = await chatStream(async (say) => { say.part("We trade 1 ten for 10 ones.", 0, [batch]); return done("final"); });
    if (!("stream" in ran)) throw Error("expected a stream");
    const heard: unknown[] = [];
    const r = await readChatStream(ran.stream, (i, t, board) => heard.push([i, t, board]));
    expect(heard).toEqual([[0, "We trade 1 ten for 10 ones.", [batch]]]);
    expect(r).toEqual(done("final"));
  });
  it.each([
    ["a batch with no id", [{ commands: [] }]],
    ["too many batches", [batch, batch, batch]],
  ])("refuses a say event with %s", async (_, board) => {
    await expect(readChatStream(body(`${JSON.stringify({ type: "say", index: 0, text: "One.", board })}\n`), () => {})).rejects.toThrow();
  });
});

describe("readChatStream: the desk's read", () => {
  it("hears each sentence and returns the final reply", async () => {
    const heard: [number, string][] = [];
    const r = await readChatStream(body('{"type":"say","index":0,"text":"One."}\n{"type":"say","ind', 'ex":1,"text":"Two."}\n', `${JSON.stringify({ type: "final", reply: done("x") })}\n`), (i, t) => heard.push([i, t]));
    expect(heard).toEqual([[0, "One."], [1, "Two."]]);
    expect(r).toEqual(done("x"));
  });

  it.each([
    ["no final", ['{"type":"say","index":0,"text":"One."}\n']],
    ["an error event", ['{"type":"say","index":0,"text":"One."}\n{"type":"error","error":"unavailable"}\n']],
    ["a line that is not an event", ['{"type":"say","index":-1,"text":"One."}\n']],
    ["a cut final", ['{"type":"final","reply":{"usage":']],
  ])("treats a stream with %s as a failed request (partial words are never a finished turn)", async (_, chunks) => {
    await expect(readChatStream(body(...chunks), () => {})).rejects.toThrow();
  });
});

describe("runChat: admission before any streamed word", () => {
  const ID = "55555555-5555-4555-8555-555555555555";
  const MSG = "66666666-6666-4666-8666-666666666666";

  async function setup(claim: () => Record<string, unknown> | null) {
    const f = await mayaWorkbookFixture();
    f.books.setStatus(f.ids.workbook, "shipped");
    let held: (() => void) | null = null;
    let hold = false;
    /** A process: its own model on the shared store (a fresh one after the first goes away). */
    const process = () => {
      const model = conversationalFake({
        answer: () => reply("7 ones and 9 ones make 16 ones. What do we write in the ones place?", "guide"),
        stream: { chunk: 9, beforeEnd: () => (hold ? new Promise<void>((r) => { held = r; }) : Promise.resolve()) },
      });
      local.seams = { ...f.seams, tutorFamilies: true, model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer(), canChat: async () => true } satisfies CallSeams;
      return model;
    };
    const model = process();
    local.books = f.books;
    /** The message the claim holds, for its recovery (recover_maya_chat_message), once its lease ran out. */
    let lapsed: { text: string } | null = null;
    const db = createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
      const url = new URL(String(input)), table = url.pathname.split("/").pop()!;
      if (table === "maya_notice_acceptances") return Response.json([{ parent_id: f.ids.parent, notice_version: MAYA_NOTICE_VERSION, accepted_by: f.ids.parent, accepted_at: "2026-11-06T12:00:00Z" }]);
      if (table === "maya_chat_messages") return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
      if (table === "workbook_pages") return Response.json({ id: "page-four" });
      if (table === "recover_maya_chat_message") {
        if (!lapsed) return Response.json({ status: "none" });
        // As the database: a new revision for the claim, then the message's own words.
        const old = (await f.store.get(ID))!;
        await f.store.update(ID, old.revision, {});
        const text = lapsed.text;
        lapsed = null;
        return Response.json({ status: "accepted", id: MSG, callId: ID, revision: old.revision + 1, text });
      }
      if (table === "take_maya_chat_message") {
        const input = JSON.parse(String(init?.body));
        return Response.json(claim() ?? { status: "accepted", revision: input.p_revision });
      }
      throw Error(`Unexpected database access: ${table}`);
    } } });
    const ctx = { db, parent: f.ids.parent, child: f.ids.child, name: "Iris", grade: 4, zone: "America/Vancouver" as const };
    const started = await runChat(ctx, { type: "start", id: ID, question: { source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 } });
    if (!started.chat) throw Error(`no chat: ${started.error}`);
    return { f, ctx, model, process, lapse: (text: string) => { lapsed = { text }; }, revision: started.chat.revision, hold: () => { hold = true; }, release: () => { hold = false; held?.(); } };
  }

  it.each([
    ["busy", { status: "busy", admitted: true }, "accepted"],
    ["done", { status: "done" }, "accepted"],
    ["a conflict", { status: "conflict", admitted: false }, "refused"],
    ["the day's cap", { status: "cap", admitted: false }, "refused"],
  ])("%s at the claim: no model call and no word for the desk", async (_, claim, admission) => {
    // Falsifier: the ear hears a sentence, or the model is asked, for a message the database did not admit now.
    const s = await setup(() => claim);
    const asked = s.model.briefs.length;
    const part = vi.fn();
    const r = await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Is it 56?" }, { say: { part } });
    expect(r.admission).toBe(admission);
    expect(part).not.toHaveBeenCalled();
    expect(s.model.briefs.length).toBe(asked);
  });

  it("another child's desk is refused before the claim, with no word", async () => {
    const s = await setup(() => null);
    const asked = s.model.briefs.length;
    const part = vi.fn();
    const r = await runChat({ ...s.ctx, child: s.f.ids.sibling }, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Is it 56?" }, { say: { part } });
    expect(r).toMatchObject({ chat: null, error: "not_found", admission: "refused" });
    expect(part).not.toHaveBeenCalled();
    expect(s.model.briefs.length).toBe(asked);
  });

  it("an admitted turn streams its first checked sentence before the model resolves, and the reply holds the same message", async () => {
    // Falsifier: runChat does not pass the ear to the admitted turn (nothing until the reply).
    const s = await setup(() => null);
    s.hold();
    const parts: string[] = [];
    let settled = false;
    const running = runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Is it 56?" }, { say: { part: (t, i) => { parts[i] = t; } } })
      .then((r) => { settled = true; return r; });
    await vi.waitFor(() => expect(parts.length).toBeGreaterThan(0), { timeout: 2000, interval: 5 });
    expect(settled).toBe(false);
    s.release();
    const r = await running;
    expect(r.admission).toBe("accepted");
    const maya = r.chat!.transcript.filter((t) => t.speaker === "maya").at(-1)!.text;
    expect(parts.join(" ")).toBe(maya);
  });

  it("a request after the first process went away recovers the admitted message from its saved parts: same words, no model call, the claim done", async () => {
    // Falsifier: the recovery asks the model again (a second paid answer) or takes the child's words as a new turn.
    const s = await setup(() => null);
    s.hold();
    const parts: string[] = [];
    void runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Is it 56?" }, { say: { part: (t, i) => { parts[i] = t; } } });
    await vi.waitFor(() => expect(parts.length).toBeGreaterThan(0), { timeout: 2000, interval: 5 });
    const heard = [...parts];
    // The first process goes away; its lease runs out; a fresh process answers the desk's next request.
    const fresh = s.process();
    s.lapse("Is it 56?");
    const r = await runChat(s.ctx, { type: "read", id: ID });
    expect(fresh.briefs).toHaveLength(0);
    const maya = r.chat!.transcript.filter((t) => t.speaker === "maya").at(-1)!.text;
    expect(maya.startsWith(heard.join(" "))).toBe(true);
    expect(r.chat!.transcript.filter((t) => t.speaker === "child" && t.text === "Is it 56?")).toHaveLength(1);
    expect(r.chat!.pending).toBe(false);
  });
});
