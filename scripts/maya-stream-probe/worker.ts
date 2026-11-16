import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mayaCalls, type CallResult, type CallSeams, type CallStore } from "@/lib/maya-call";
import { mayaCallStore } from "@/lib/maya-call-store";
import { sweepAbandonedCalls, sweepSeams, type SweepCallSource } from "@/lib/maya-call-sweep";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import type { OperationPackage } from "@/lib/question-package";
import type { Batch } from "@/lib/board";
import { BOOK, CHILD, IDS, PARENT, PROJECT_URL, probeClient, type Timing } from "./adapter";

export type Config = { url: string; key: string; role: "inspect" | "writer" | "reader" | "verify" | "cleanup"; index: number; fakePort?: number };
const STUCK = "I don't get 2 minus 8.";
const TRADE = "We trade 1 ten for 10 ones.";
const FIRST = "12 minus 8 is 4.";
const NEXT = "What do you get for 4 minus 2 in the tens?";
const pkg = { ...(SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage), ref: { source: "workbook" as const, workbookId: BOOK, page: 1, question: 1 } };
const names = ["pending-retry", "pending-end", "pending-sweep", "confirmed-retry", "confirmed-end", "confirmed-sweep", "normal", "json"];
const hash = (batches: Batch[]) => createHash("sha256").update(JSON.stringify(batches)).digest("hex");
const ok = (r: CallResult) => { assert(r.ok, "Public call refused"); return r; };
const never = () => new Promise<void>(() => {});
const send = (message: unknown) => process.send?.(message);
let stage = "setup";

async function work(config: Config) {
  assert(Number.isInteger(config.index) && config.index >= 0 && config.index < IDS.length);
  const id = IDS[config.index], mode = names[config.index];
  const all = config.role === "inspect" || config.role === "cleanup";
  let now = Date.now(), saves = 0, proposals = 0, reviewCalls = 0, notes = 0, appended = 0, rebuilt = 0;
  const timings: Timing[] = [];
  let ownerRead = false, ownerResponseAt: number | null = null;
  const dispatches: { index: number; afterOwnerResponseMs: number }[] = [];
  const transport: typeof fetch = config.fakePort ? (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, PROJECT_URL);
    url.protocol = "http:"; url.hostname = "127.0.0.1"; url.port = String(config.fakePort);
    return fetch(url, init);
  } : fetch;
  const adapter = probeClient({ url: config.url, key: config.key, ids: all ? IDS : [id], fetch: transport, timing(t) {
    timings.push(t);
    if (t.phase === "owner_reread") ownerResponseAt = performance.now();
  } });
  const base = mayaCallStore(adapter.db);
  const load = async () => { adapter.phase("load"); return base.get(id); };
  if (config.role === "inspect" || config.role === "cleanup") {
    stage = config.role;
    adapter.phase(config.role);
    const query = config.role === "inspect" ? adapter.db.from("maya_calls").select("id").in("id", IDS) : adapter.db.from("maya_calls").delete().in("id", IDS).select("id");
    const { data, error } = await query;
    assert.equal(error, null);
    stage = config.role === "inspect" ? "inspect occupied IDs" : "cleanup result";
    if (config.role === "inspect") assert.equal(data?.length, 0, "Probe IDs are occupied. Do not overwrite them. Review the prior run before exact-ID cleanup.");
    return { role: config.role, rows: data?.length ?? 0, timings };
  }
  const spend = memorySpendStore({ clock: () => now });
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [] });
  const events = learningEvents(eventStore);
  const noted = new Set<string>();
  const heard: { text: string; board: Batch[] }[] = [];
  const written = Promise.withResolvers<void>();
  const store: CallStore = { ...base,
    async get(callId) { adapter.phase(ownerRead ? "owner_reread" : "load"); ownerRead = false; return base.get(callId); },
    async update(callId, revision, change) { adapter.phase("revision_or_final_write"); return base.update(callId, revision, change); },
    async checkpoint(callId, revision, live) {
      saves++;
      adapter.phase(saves % 2 ? "pending_write" : "confirmation_write");
      const accepted = await base.checkpoint!(callId, revision, live);
      assert(accepted, "Checkpoint refused");
      if (saves === 6) written.resolve();
      const cut = mode.startsWith("pending") ? 1 : mode.startsWith("confirmed") ? 3 : -1;
      if (config.role === "writer" && saves === cut) {
        assert.equal(heard.length, mode.startsWith("confirmed") ? 1 : 0);
        send({ kind: "boundary", id, revision, confirmed: heard.length, boardHash: hash(heard.flatMap(h => h.board)), timings, dispatches });
        await never(); // The controller kills this owned process. No final save or shutdown handler runs.
      }
      ownerRead = true;
      return accepted;
    },
  };
  const model = conversationalFake({ id: "fake", answer: () => reply(`${TRADE} ${FIRST}`, "guide") });
  model.propose = async (input, _signal, onText) => {
    proposals++;
    assert.equal(config.role, "writer", "Recovery asked a model");
    const reservation = randomUUID();
    await spend.reserve({ id: reservation, charge: "child", parentId: PARENT, childId: CHILD, callId: id, what: "model", micros: 100, week: "2026-11-16", weekMicros: 10_000_000, month: "2026-11-01", force: false });
    const child = (input as unknown as { childTurn?: string }).childTurn;
    const proposal = child === STUCK ? reply(`${TRADE} ${FIRST} ${NEXT}`, "guide") : reply("Let's look at 52 minus 28.", "open");
    if (onText && mode !== "json") {
      const whole = JSON.stringify(proposal);
      onText(whole.slice(0, whole.indexOf(',"act"')));
      if (config.index < 6) await never();
      // Wait for the three real pending/confirmation pairs, without an assumed transport delay.
      await written.promise;
    }
    await spend.settle(reservation, 100);
    return proposal;
  };
  const seams: CallSeams = {
    tutorFamilies: true, streamChat: config.role === "writer" && mode !== "json", store,
    history: memoryWordingHistoryStore(),
    events: { ...events, async append(e) { appended++; return events.append(e); } },
    rebuild: async () => { rebuilt++; return true; }, model: () => model,
    reviewer: () => fakeTalkReviewer(() => { reviewCalls++; assert.equal(config.role, "writer"); return { verdict: "pass" }; }),
    mathReviewer: () => fakeMathReviewer(() => { reviewCalls++; assert.equal(config.role, "writer"); return { verdict: "true", reason: "fixed synthetic math" }; }),
    isTestFamily: async p => p === PARENT, canChat: async (p, c) => p === PARENT && c === CHILD,
    canCallVoice: async () => false, clock: () => now, newId: randomUUID, seed: () => 42,
    note: async ({ call }) => { assert(!noted.has(call.id), "Duplicate note"); noted.add(call.id); notes++; return "done"; },
    alerts: { send: async () => {}, list: async () => [] },
  };
  const calls = mayaCalls(seams);
  let boardHash: string | undefined;
  if (config.role === "writer") {
    stage = "start";
    const view = ok(await calls.start({ id, kind: "chat", parentId: PARENT, childId: CHILD, startedBy: PARENT, childName: "Synthetic learner", grade: 3, package: pkg })).view;
    stage = "child";
    const result = ok(await calls.input(id, view.revision, { type: "child", text: STUCK }, "Synthetic learner", { part(text, index, board) {
      assert(ownerResponseAt !== null, "Dispatch without an ownership response");
      dispatches.push({ index, afterOwnerResponseMs: performance.now() - ownerResponseAt });
      heard[index] = { text, board: board ?? [] };
    } }));
    assert(config.index >= 6, "Interrupted writer reached final save");
    assert.equal(heard.length > 0, mode === "normal");
    assert(result.view.transcript.some(t => t.speaker === "maya" && t.text.includes(TRADE) && t.text.includes(FIRST)));
    const saved = (await load())!;
    assert.equal(saved.live!.text.log!.some(e => e.kind === "part_pending"), mode === "normal");
    ok(await calls.input(id, result.view.revision, { type: "end" }, null));
  } else if (config.role === "reader") {
    stage = "load interrupted";
    const original = (await load())!;
    assert(original?.live && original.status === "live");
    assert(original.live.text.log!.some(e => e.kind === "part_pending"));
    assert.equal(original.live.text.log!.filter(e => e.kind === "part_confirmed").length, mode.startsWith("confirmed") ? 1 : 0);
    // A synthetic replacement acquisition uses the real store's revision fence. This is not the admission claim RPC.
    adapter.phase("replacement_acquire");
    assert(await base.update(id, original.revision, {}));
    stage = "settle interrupted";
    now += mode.endsWith("sweep") ? 20 * 60_000 : 121_000;
    if (mode.endsWith("sweep")) {
      const source: SweepCallSource = {
        async liveCalls(_before, after) { const row = await load(); return !after && row?.status === "live" ? [row] : []; },
        async unfinishedCalls() { return []; }, readPlace: async () => null, writePlace: async () => {},
      };
      const swept = await sweepAbandonedCalls({ calls: mayaCalls(sweepSeams(seams)), source, clock: () => now, timeLimitMs: 10_000 });
      assert.equal(swept.ended, 1); assert.equal(swept.failed, 0); assert.equal(swept.cut, false);
    } else {
      const r = ok(await calls.input(id, original.revision + 1, mode.endsWith("retry") ? { type: "child", text: STUCK } : { type: "end" }, null));
      if (r.view.status !== "ended") ok(await calls.input(id, r.view.revision, { type: "end" }, null));
    }
    adapter.phase("old_owner_checkpoint");
    stage = "reject stale owner";
    assert.equal(await base.checkpoint!(id, original.revision, original.live), false);
    adapter.phase("old_owner_final_save");
    assert.equal(await base.update(id, original.revision, { live: original.live }), false);
    assert.equal(proposals, 0); assert.equal(reviewCalls, 0);
    stage = "one effect per end";
    assert.equal(appended, 1); assert.equal(notes, 1); assert.equal(rebuilt, 1);
  }
  stage = "read ended";
  const ended = (await load())!;
  assert.equal(ended.status, "ended");
  assert.equal(ended.live, null); assert.equal(ended.notePending, null);
  assert(ended.learningEventId); assert(ended.profileRebuiltAt); assert(ended.trace);
  const trace = checkTrace(ended.trace);
  stage = "trace check";
  assert(trace.ok, "Trace failed its public checker");
  stage = "repeat end";
  const final = ok(await calls.input(id, ended.revision, { type: "end" }, null));
  const again = ok(await calls.input(id, final.view.revision, { type: "end" }, null));
  assert.equal(again.view.revision, ended.revision);
  assert.equal(final.view.transcript.filter(t => t.speaker === "child" && t.text === STUCK).length, 1);
  if (config.index < 6) {
    stage = `confirmed prefix only (${ended.outcome?.reason ?? "missing outcome"})`;
    const confirmed = mode.startsWith("confirmed");
    const words = final.view.transcript.map(t => t.text).join(" ");
    assert.equal(words.includes(TRADE), confirmed); assert(!words.includes(FIRST));
    assert.equal(ended.outcome?.reason, "technical_issue"); assert.equal(ended.outcome?.safetyFlag, false);
    assert.equal(ended.outcome?.assistance, confirmed ? "hint" : "independent");
    assert(ended.trace.turns.some(t => t.kind === "technical" && t.detail.includes("unknown")));
    const trade = final.view.batches.filter(b => b.commands.some(c => (c as { op?: unknown }).op === "regroup"));
    assert.equal(trade.length, confirmed ? 1 : 0);
    boardHash = hash(trade);
  }
  if (config.role === "verify") { assert.equal(proposals + reviewCalls + notes + appended + rebuilt, 0); }
  return { id, mode, role: config.role, status: ended.status, revision: ended.revision, proposals, reviewCalls, notes, appended, rebuilt, boardHash, timings, dispatches };
}

process.once("message", (config: Config) => {
  const timeout = setTimeout(() => { send({ kind: "error", message: "Worker time limit" }); process.exit(2); }, 25_000);
  work(config).then(result => { clearTimeout(timeout); send({ kind: "result", result }); process.disconnect(); }, (error: unknown) => {
    const location = error instanceof Error ? /worker\.cjs:\d+:\d+/.exec(error.stack ?? "")?.[0] : undefined;
    clearTimeout(timeout); send({ kind: "error", stage, location }); process.exit(2);
  });
});
