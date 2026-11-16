import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createHarness, STUCK, TRADE, FIRST } from "./core";
import { admitted, startServer } from "./server";
import { chatStream, readChatStream, CHAT_STREAM_TYPE } from "@/lib/maya-chat-stream";

const cleanups: (() => Promise<unknown>)[] = [];
beforeEach(() => vi.clearAllMocks());
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function setup(options: Parameters<typeof createHarness>[0] = {}) {
  const h = createHarness({ sentenceMs: 0, finalMs: 0, ...options });
  cleanups.push(() => h.close());
  return h;
}
async function begin(h: ReturnType<typeof createHarness>) {
  const r = await h.run({ type: "start", id: randomUUID() });
  expect(r.error).toBeUndefined();
  expect(r.chat).not.toBeNull();
  return r.chat!;
}

it("rejects external Host and Origin, including requests sent to the bound loopback server", async () => {
  const running = await startServer(new Map(), 0);
  cleanups.push(() => running.close());
  expect(running.server.address()).toMatchObject({ address: "127.0.0.1" });
  expect(admitted("attacker.test", running.url, running.url, "POST")).toBe(false);
  for (const headers of [{ Host: "attacker.test" }, { Origin: "https://attacker.test" }, {}] as Record<string, string>[]) {
    const r = await fetch(`${running.url}/local/reset`, { method: "POST", headers });
    expect(r.status).toBe(403);
  }
  const r = await fetch(`${running.url}/local/state`);
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ fake: true, memoryOnly: true, records: [] });
});

it("delivers checked words and a board before final, then reconciles the actual stream parser", async () => {
  const h = setup({ sentenceMs: 15, finalMs: 200 });
  const view = await begin(h);
  let final = false;
  const heard: string[] = [], boards: unknown[] = [];
  const ran = await chatStream(say => h.run({ type: "child", id: view.id, revision: view.revision, messageId: randomUUID(), text: STUCK }, say).then(r => { final = true; return r; }));
  expect("stream" in ran).toBe(true);
  if (!("stream" in ran)) throw Error("No early stream");
  const reading = readChatStream(ran.stream, (_i, text, board) => { heard.push(text); boards.push(...board); expect(final).toBe(false); });
  await vi.waitFor(() => expect(heard[0]).toBe(TRADE));
  expect(final).toBe(false);
  expect(boards.length).toBeGreaterThan(0);
  const result = await reading;
  expect(result.error).toBeUndefined();
  expect(heard.join(" ")).toContain(FIRST);
  expect(result.chat!.transcript.at(-1)!.text).toBe(heard.join(" "));
  expect(result.chat!.batches).toEqual(expect.arrayContaining(boards));
  const second = await h.run({ type: "child", id: view.id, revision: result.chat!.revision, messageId: randomUUID(), text: "2" });
  expect(second.error).toBeUndefined();
  expect(second.chat!.transcript.at(-1)!.text).toContain("4 minus 2 is 2.");
});

it.each(["pending", "confirmed"] as const)("recovers %s prefix through retry, direct end and sweep", async mode => {
  for (const how of ["retry", "end", "sweep"] as const) {
    const h = setup(); h.arm(mode);
    const view = await begin(h);
    const heard: string[] = [];
    const old = h.run({ type: "child", id: view.id, revision: view.revision, messageId: randomUUID(), text: STUCK }, { part: t => heard.push(t) });
    await h.boundary;
    expect(h.state().held).toBe(true);
    expect(h.state().records[0].delivery.map(e => e.kind)).toContain("part_pending");
    expect(heard).toEqual(mode === "confirmed" ? [TRADE] : []);
    const proposals = h.state().proposals;
    const recovered = await h.recover(view.id, how);
    expect(recovered.reply.error).toBeUndefined();
    expect(h.state().proposals).toBe(proposals);
    const transcript = recovered.reply.chat!.transcript.map(t => t.text).join(" ");
    expect(transcript.includes(TRADE)).toBe(mode === "confirmed");
    expect(transcript).not.toContain(FIRST);
    const ended = how === "retry" ? await h.run({ type: "end", id: view.id, revision: recovered.reply.chat!.revision }) : recovered.reply;
    expect(ended.chat!.ended).toBe(true);
    const record = (await h.store.get(view.id))!;
    expect(record.outcome!.assistance).toBe(mode === "confirmed" ? "hint" : "independent");
    expect(h.state().notes).toBe(1);
    expect((await old).error).toBe("conflict");
  }
});

it("keeps private stores separate and refuses streaming when the private writer is false", async () => {
  const a = setup({ streamChat: false }), b = setup();
  const view = await begin(a);
  expect(await b.calls.view(view.id)).toBeNull();
  const heard: string[] = [];
  const result = await a.run({ type: "child", id: view.id, revision: view.revision, messageId: randomUUID(), text: STUCK }, { part: t => heard.push(t) });
  expect(result.error).toBeUndefined(); expect(heard).toEqual([]);
  expect(result.chat!.transcript.at(-1)!.text).toContain(TRADE);
  expect(a.state().records[0].delivery).toEqual([]);
});

it("keeps JSON clients runnable and makes a disconnected retry use one admitted local turn", async () => {
  const h = setup({ finalMs: 150 });
  const view = await begin(h);
  const action = { type: "child", id: view.id, revision: view.revision, messageId: randomUUID(), text: STUCK };
  const ran = await chatStream(say => h.run(action, say));
  if (!("stream" in ran)) throw Error("No stream");
  await ran.stream.cancel();
  const busy = await h.run(action);
  expect(busy.chat?.pending).toBe(true);
  await vi.waitFor(() => expect(h.state().records[0].revision).toBeGreaterThan(view.revision));
  const done = await h.run(action);
  expect(done.error).toBeUndefined(); expect(done.chat?.pending).toBe(false);
  expect(done.chat!.transcript.filter(t => t.speaker === "child" && t.text === STUCK)).toHaveLength(1);
  const json = await h.run({ ...action, messageId: randomUUID(), revision: done.chat!.revision, text: "2" });
  expect(json.error).toBeUndefined();
});

it("serves whole JSON and NDJSON over the local HTTP adapter", async () => {
  const running = await startServer(new Map(), 0); cleanups.push(() => running.close());
  const post = async (body: unknown, accept = "application/json") => fetch(`${running.url}/api/desk/chat`, { method: "POST", headers: { Origin: running.url, "Content-Type": "application/json", Accept: accept }, body: JSON.stringify(body) });
  const opened = await post({ type: "start", id: randomUUID() });
  expect(opened.status).toBe(200);
  const view = (await opened.json()).chat;
  const response = await post({ type: "child", id: view.id, revision: view.revision, messageId: randomUUID(), text: STUCK }, CHAT_STREAM_TYPE);
  expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe(CHAT_STREAM_TYPE);
  const result = await readChatStream(response.body!, () => {});
  expect(result.error).toBeUndefined();
  expect(result.chat!.transcript.at(-1)!.text).toContain(TRADE);
  const legacy = await post({ type: "child", id: view.id, revision: result.chat!.revision, messageId: randomUUID(), text: "2" });
  expect(legacy.status).toBe(200); expect(legacy.headers.get("content-type")).toBe("application/json");
  const whole = await legacy.json();
  expect(whole.error).toBeUndefined(); expect(whole.chat.transcript.at(-1).text).toContain("4 minus 2 is 2.");
});
