import { EventEmitter } from 'node:events';
import { llm, voice, initializeLogger } from '@livekit/agents';
import { describe, it, expect, vi } from 'vitest';
import { templateSkills } from '@/lib/assessment';
import { learningEvents } from '@/lib/learning-events';
import { memoryLearningEventStore } from '@/lib/learning-events-memory';
import { memoryWordingHistoryStore, TIME_LIMITS } from '@/lib/maya';
import { RECONNECT_GRACE_MS, REJOIN_AFTER_LEAVE_MS } from '@/lib/maya-voice';
import { mayaCalls, type CallSeams } from '@/lib/maya-call';
import { memoryCallStore, memoryConnectionLog } from '@/lib/maya-call-memory';
import { ruleMayaModel } from '@/lib/maya-model-fake';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import type { QuestionPackage } from '@/lib/question-package';
import { VoiceCallRun, voiceSession, type Timers, type CallUpdate } from './agent';
import { CONTINUE_ID, voiceContinuation, voiceOpening } from './opening';
import { CallTelemetry, setTelemetry, type Emitted } from './telemetry';

initializeLogger({ pretty: false, level: 'silent' });
const P='11111111-1111-4111-8111-111111111111', C='22222222-2222-4222-8222-222222222222', T='33333333-3333-4333-8333-333333333333';
const T0=Date.UTC(2026,10,1,16);
const pkg: QuestionPackage = { ...SAMPLE_PACKAGES['add-27-39'], id: `${T}:s1-4`, ref: {source:'assessment',assessmentId:T,questionId:'s1-4'}, templateId:'2-add-2-digit', skill:{standard:'2.4',skills:templateSkills('2-add-2-digit').map(k=>k.id)} };
function barrier<T=void>() { let resolve!: (v:T)=>void; const promise=new Promise<T>(r=>resolve=r); return {promise,resolve}; }
const flush=()=>new Promise<void>(r=>setImmediate(r));
async function fixture() {
  let now=T0, sequence=0;
  const due=new Map<number,{at:number;run:()=>void}>();
  const timers:Timers={now:()=>now,set:(ms,run)=>{const id=++sequence;due.set(id,{at:now+Math.max(ms,0),run});return id;},clear:id=>void due.delete(id as number)};
  const store=memoryCallStore({testFamilies:[P]}), connections=memoryConnectionLog(store, () => now);
  const eventStore=memoryLearningEventStore({children:[{id:C,parentId:P}],tests:[{id:T,childId:C}]});
  const rebuild=vi.fn(async()=>true);
  const model=ruleMayaModel();
  const seams:CallSeams={store,connections,alerts:{send:async()=>{},list:async()=>[]},history:memoryWordingHistoryStore(),events:learningEvents(eventStore),rebuild,model:()=>model,isTestFamily:async()=>true,clock:()=>now,newId:()=> '00000000-0000-4000-8000-000000000001',seed:()=>42};
  const calls=mayaCalls(seams);
  const made=await calls.startVoice({kind:'admin_test',startedBy:null,parentId:P,childId:C,childName:'Leah',package:pkg});
  if(!made.ok)throw Error(made.error);
  const id=made.view.id;
  const open=async()=>{const o=await calls.openVoice(id,{speechToText:'fake',voice:'fake'},'Leah');if(!o.ok)throw Error(o.error);return o.call;};
  const call=await open();
  const makeRun=(handle=call)=>{
    const session=Object.assign(new EventEmitter(),{agentState:'listening',userState:'listening',generateReply:vi.fn(),say:vi.fn((_text: string)=>({waitForPlayout:async()=>{}})),close:vi.fn(async()=>{})});
    const updates:CallUpdate[]=[], closed=vi.fn(async()=>{});
    const run=new VoiceCallRun(session as unknown as voice.AgentSession,handle,{timers,notify:u=>updates.push(u),closed});
    return {run,session,updates,closed};
  };
  const advance=async(ms:number)=>{const end=now+ms;for(;;){const first=[...due].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;due.delete(first[0]);now=Math.max(now,first[1].at);first[1].run();await flush();}now=end;await flush();};
  return {call,calls,store,connections,eventStore,rebuild,seams,model,open,id,makeRun,timers,advance,setNow:(ms:number)=>{now=T0+ms;}};
}
describe('replacement worker recovery through public interfaces', () => {
  it.each([0, 400])('R408-11 makes append ownership atomic with %s ms of clock difference', async (skew) => {
    const f = await fixture();
    await f.call.connection('agent_joined');
    await f.call.connection('child_joined');
    const entered = barrier(), release = barrier();
    const append = f.connections.append.bind(f.connections);
    let hold = true;
    f.connections.append = async (...args) => {
      if (hold && args[0].kind === 'agent_left') { hold = false; entered.resolve(); await release.promise; }
      return append(...args);
    };
    f.setNow(100 + skew);
    const obsolete = f.call.connection('agent_left');
    await entered.promise;
    let replacementNow = T0 + 100;
    const calls = mayaCalls({ ...f.seams, clock: () => replacementNow });
    const opened = await calls.openVoice(f.id, { speechToText: 'fake', voice: 'fake' }, null);
    if (!opened.ok) throw Error(opened.error);
    const newer = opened.call;
    await newer.connection('agent_left');
    await newer.connection('agent_joined');
    await newer.connection('child_joined');
    const count = f.connections.rows().length;
    release.resolve();
    await obsolete;
    expect(f.connections.rows()).toHaveLength(count);
    expect(f.call.lost).toBe(true);
    replacementNow = T0 + 10_100;
    await newer.end({ reason: 'child_stopped' });
    expect(f.store.rows()[0].connectedSeconds).toBe(10);
  });

  it.each(['saved output', 'legacy trace', 'unavailable model'])('R408-14 replays %s once and finalizes after held playback', async (source) => {
    const f = await fixture();
    await f.call.start();
    let final = await f.call.child('66');
    for (const text of ['I wrote it.', 'yes']) final = await f.call.child(text);
    expect(f.call.ended).toBe(true);
    expect(final.say.length).toBeGreaterThan(0);
    expect(f.store.rows()[0].status).toBe('live');
    if (source === 'legacy trace') {
      const row = f.store.rows()[0];
      const live = row.live!;
      delete live.pendingVoice;
      expect(await f.store.update(row.id, row.revision, { live })).toBe(true);
    }
    if (source === 'unavailable model') f.seams.model = () => null;
    const opened = await f.calls.openVoice(f.id, { speechToText: 'fake', voice: 'fake' }, null);
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw Error(opened.error);
    const restored = opened.call;
    const r = f.makeRun(restored);
    const release = barrier(), completed = barrier();
    const propose = vi.spyOn(f.model, 'propose');
    r.session.say.mockReturnValue({ waitForPlayout: () => release.promise });
    r.closed.mockImplementation(async () => { completed.resolve(); });
    try {
      await r.run.agentJoined();
      await r.run.childJoined();
      await r.run.childJoined();
      expect(r.session.say).toHaveBeenCalledOnce();
      expect(r.session.say.mock.calls[0][0]).toBe(final.say.join(' '));
      expect(f.store.rows()[0].status).toBe('live');
      expect(r.updates.filter(u => u.ended)).toHaveLength(0);
      expect(r.closed).not.toHaveBeenCalled();
      expect(r.session.generateReply).not.toHaveBeenCalled();
      expect(propose).not.toHaveBeenCalled();
      release.resolve();
      await completed.promise;
      expect(f.store.rows()[0].status).toBe('ended');
      expect(r.updates.filter(u => u.ended)).toHaveLength(1);
      expect(r.closed).toHaveBeenCalledOnce();
    } finally { release.resolve(); await r.run.hangUp(); }
  });
});

it('R408-15 obsolete worker cleanup cannot issue a client disconnect for the live replacement',async()=>{
  const f=await fixture();await f.call.start();const a=f.makeRun(f.call);
  await a.run.agentJoined();await a.run.childJoined();
  const b=f.makeRun(await f.open());await b.run.agentJoined();await b.run.childJoined();
  const row=f.store.rows()[0];expect(row.status).toBe('live');expect(b.session.close).not.toHaveBeenCalled();
  const from=a.updates.length;
  await a.run.hangUp();
  expect(f.store.rows()[0]).toEqual(row);expect(b.session.close).not.toHaveBeenCalled();
  console.log('OLD_WORKER_AFTER_REPLACEMENT',JSON.stringify({old:a.updates.slice(from),replacementRevision:row.revision,status:row.status}));
  try {expect(a.updates.slice(from).filter(u=>u.error==='technical_issue'||u.ended)).toEqual([]);}
  finally {await b.run.hangUp();}
});

// These controls use the real call and its in-memory stores. Only the media session and clock are supplied.
function closeLog(callId: string, scopeId = "close-job", sink?: () => void) {
  const events: Emitted[] = [];
  setTelemetry(new CallTelemetry({ callId, scopeId, sink: e => { sink?.(); events.push(e); } }));
  return () => events.filter((e): e is Extract<Emitted, { ev: "close_origin" }> => e.ev === "close_origin");
}

it.each(["rpc", "disconnect"])("keeps the %s origin despite equal child_stopped outcome and synchronous SDK Close reentry", async path => {
  const f = await fixture();
  const log = closeLog(f.id);
  const r = f.makeRun();
  r.session.close.mockImplementation(async () => { r.session.emit(voice.AgentSessionEventTypes.Close, { reason: "user_initiated" }); });
  if (path === "rpc") await r.run.hangUp();
  else { await r.run.childLeft("hang_up", 1); await f.advance(REJOIN_AFTER_LEAVE_MS); }
  expect(f.store.rows()[0].outcome?.reason).toBe("child_stopped");
  const origins = log().filter(e => e.phase === "origin");
  expect(origins).toHaveLength(1);
  expect(origins[0]).toMatchObject({ entry: path === "rpc" ? "explicit_rpc" : "participant_disconnect", reason: path === "rpc" ? "unknown" : "client_initiated", callId: f.id, workerId: "close-job", segment: r.run.segment });
  expect(log().find(e => e.phase === "media_close")?.seq).toBeLessThan(log().find(e => e.entry === "sdk_close")!.seq);
  expect(log().find(e => e.entry === "sdk_close")).toMatchObject({ phase: "observation", originId: origins[0].closeId, reason: "user_initiated" });
  expect(r.session.close).toHaveBeenCalledOnce();
});

it("keeps the origin across asynchronous SDK Close and a later participant leave", async () => {
  const f = await fixture(); const log = closeLog(f.id); const r = f.makeRun();
  await r.run.hangUp();
  r.session.emit(voice.AgentSessionEventTypes.Close, { reason: "user_initiated" });
  await r.run.childLeft("hang_up", 1);
  expect(log().filter(e => e.phase === "origin").map(e => e.entry)).toEqual(["explicit_rpc"]);
  expect(log().at(-1)).toMatchObject({ entry: "participant_disconnect", phase: "observation", originId: log()[0].closeId });
  expect(r.session.close).toHaveBeenCalledOnce();
});

it("a rejoin during the disconnect save leaves the later RPC as the close origin", async () => {
  const f = await fixture(); await f.call.start(); const log = closeLog(f.id); const r = f.makeRun();
  await r.run.agentJoined(); await r.run.childJoined();
  const entered = barrier(), release = barrier();
  const append = f.connections.append.bind(f.connections);
  let held = false;
  f.connections.append = async (...args) => {
    if (!held && args[0].kind === "child_left") { held = true; entered.resolve(); await release.promise; }
    return append(...args);
  };
  const leaving = r.run.childLeft("hang_up", 1);
  await entered.promise;
  try { await r.run.childJoined(); } finally { release.resolve(); }
  await leaving;
  expect(f.store.rows()[0].status).toBe("live");
  expect(r.session.close).not.toHaveBeenCalled();
  expect(log().filter(e => e.phase === "origin")).toEqual([]);
  expect(log()[0]).toMatchObject({ entry: "participant_disconnect", phase: "observation", originId: null });
  await r.run.hangUp();
  expect(r.session.close).toHaveBeenCalledOnce();
  expect(f.store.rows()[0].outcome?.reason).toBe("child_stopped");
  const origins = log().filter(e => e.phase === "origin");
  expect(origins.map(e => e.entry)).toEqual(["explicit_rpc"]);
  expect(log().find(e => e.phase === "media_close")).toMatchObject({ entry: "explicit_rpc", originId: origins[0].closeId });
});

it("no input stays live through the recorded 13.551 second interval", async () => {
  const f = await fixture(); await f.call.start(); const log = closeLog(f.id); const r = f.makeRun();
  await r.run.agentJoined(); await r.run.childJoined();
  await f.advance(13_551);
  expect(f.store.rows()[0].status).toBe("live");
  expect(r.session.close).not.toHaveBeenCalled(); expect(log()).toEqual([]);
  await r.run.hangUp();
});

it("a transport drop keeps grace and a reconnect does not create an initiating close", async () => {
  const f = await fixture(); await f.call.start(); const log = closeLog(f.id); const r = f.makeRun();
  await r.run.agentJoined(); await r.run.childJoined();
  await r.run.childLeft("dropped", 9); await f.advance(29_999);
  expect(r.session.close).not.toHaveBeenCalled();
  await r.run.childJoined(); await f.advance(1);
  expect(f.store.rows()[0].status).toBe("live");
  expect(log().filter(e => e.phase === "origin")).toEqual([]);
  expect(log()[0]).toMatchObject({ entry: "participant_disconnect", reason: "signal_close", phase: "observation", originId: null });
  await r.run.hangUp();
});

// #1029 review: a child who leaves, comes back without the microphone (no childJoined), and leaves again. The second
// leave starts its own wait; the first wait's generation is old, so it alone would leave the call live to the deadline.
it.each([["hang_up", "hang_up"], ["hang_up", "dropped"], ["dropped", "hang_up"], ["dropped", "dropped"]] as const)("ends after two leaves with no microphone rejoin between: %s then %s", async (first, second) => {
  const f = await fixture(); await f.call.start(); const r = f.makeRun();
  await r.run.agentJoined(); await r.run.childJoined();
  await r.run.childLeft(first, 1); await f.advance(1000);
  await r.run.childLeft(second, 1);
  const wait = second === "hang_up" ? REJOIN_AFTER_LEAVE_MS : RECONNECT_GRACE_MS;
  await f.advance(wait - 1);
  expect(f.store.rows()[0].status).toBe("live"); expect(r.session.close).not.toHaveBeenCalled();
  await f.advance(1); await r.run.done;
  expect(f.store.rows()[0].outcome?.reason).toBe(second === "hang_up" ? "child_stopped" : "technical_issue");
  expect(r.session.close).toHaveBeenCalledOnce();
});

it("a single leave with no rejoin still ends as the child stopping after the wait", async () => {
  const f = await fixture(); await f.call.start(); const r = f.makeRun();
  await r.run.agentJoined(); await r.run.childJoined();
  await r.run.childLeft("hang_up", 1);
  await f.advance(REJOIN_AFTER_LEAVE_MS - 1);
  expect(f.store.rows()[0].status).toBe("live"); expect(r.session.close).not.toHaveBeenCalled();
  await f.advance(1); await r.run.done;
  expect(f.store.rows()[0].outcome?.reason).toBe("child_stopped");
  expect(r.session.close).toHaveBeenCalledOnce();
});

it("grace expiry retains the disconnect reason and technical outcome", async () => {
  const f = await fixture(); await f.call.start(); const log = closeLog(f.id); const r = f.makeRun();
  await r.run.agentJoined(); await r.run.childJoined(); await r.run.childLeft("dropped", 9);
  await f.advance(30_000); await r.run.done;
  expect(log().find(e => e.phase === "origin")).toMatchObject({ entry: "participant_disconnect", reason: "signal_close" });
  expect(f.store.rows()[0].outcome?.reason).toBe("technical_issue");
});

it.each(["deadline", "silence"])("records %s separately from an RPC without changing the saved outcome", async path => {
  const f = await fixture(); await f.call.start(); const log = closeLog(f.id); const r = f.makeRun();
  await r.run.agentJoined(); await r.run.childJoined();
  if (path === "deadline") {
    f.setNow(TIME_LIMITS.endAtMs); await r.run.tick();
  } else {
    // Drive the public clock and tick seams through check-in, then no-response close.
    f.setNow(15_000); await r.run.tick();
    f.setNow(45_000); await r.run.tick();
    await flush();
  }
  await r.run.done;
  expect(f.store.rows()[0].outcome?.reason).toBe(path === "deadline" ? "time_limit" : "no_response");
  expect(log().filter(e => e.phase === "origin")).toMatchObject([{ entry: path === "deadline" ? "deadline" : "controller_end", reason: path === "deadline" ? "time_limit" : "no_response" }]);
  expect(r.session.close).toHaveBeenCalledOnce();
});

it.each(["sdk_close", "sdk_error", "worker_shutdown"])("records the actual %s entry and no error text", async entry => {
  const f = await fixture(); const log = closeLog(f.id); const r = f.makeRun();
  if (entry === "sdk_close") r.session.emit(voice.AgentSessionEventTypes.Close, { reason: "https://secret.invalid/token" });
  else if (entry === "sdk_error") r.session.emit(voice.AgentSessionEventTypes.Error, { error: { recoverable: false, message: "private provider text" } });
  else await r.run.workerShutdown();
  await r.run.done;
  expect(log().find(e => e.phase === "origin")).toMatchObject({ entry, reason: entry === "sdk_error" ? "fatal" : "unknown" });
  expect(JSON.stringify(log())).not.toMatch(/secret|private provider/);
  expect(f.store.rows()[0].outcome?.reason).toBe("technical_issue");
});

it("a recoverable SDK error stays an observation and cannot become the later hang-up origin", async () => {
  const f = await fixture(); const log = closeLog(f.id); const r = f.makeRun();
  r.session.emit(voice.AgentSessionEventTypes.Error, { error: { recoverable: true, message: "private" } });
  expect(r.session.close).not.toHaveBeenCalled(); await r.run.hangUp();
  expect(log().filter(e => e.phase === "origin").map(e => e.entry)).toEqual(["explicit_rpc"]);
});

it.each([null, -1, 999, 1.5, "CLIENT_INITIATED", "https://private.invalid"])("closes with unknown protocol reason for %s", async reason => {
  const f = await fixture(); const log = closeLog(f.id); const r = f.makeRun();
  await r.run.childLeft("hang_up", reason); await f.advance(REJOIN_AFTER_LEAVE_MS);
  expect(log()[0]).toMatchObject({ entry: "participant_disconnect", reason: "unknown" });
  expect(f.store.rows()[0].outcome?.reason).toBe("child_stopped");
  expect(JSON.stringify(log())).not.toContain("private.invalid");
});

it("a failed observer cannot prevent media closure or the call end", async () => {
  const f = await fixture(); closeLog(f.id, "broken", () => { throw Error("diagnostic sink"); }); const r = f.makeRun();
  await r.run.hangUp();
  expect(r.session.close).toHaveBeenCalledOnce(); expect(f.store.rows()[0].status).toBe("ended");
  expect(r.closed).toHaveBeenCalledOnce();
});

it("a replacement registry and segment cannot borrow the old run's origin", async () => {
  const f = await fixture(); const oldLog = closeLog(f.id, "old-job"); const a = f.makeRun();
  const newer = await f.open(); const newLog = closeLog(f.id, "new-job"); const b = f.makeRun(newer);
  await a.run.hangUp();
  a.session.emit(voice.AgentSessionEventTypes.Close, { reason: "user_initiated" });
  expect(newLog()).toEqual([]);
  await b.run.workerShutdown();
  expect(oldLog().every(e => e.workerId === "old-job" && e.segment === a.run.segment)).toBe(true);
  expect(newLog().every(e => e.workerId === "new-job" && e.segment === b.run.segment)).toBe(true);
  expect(newLog().find(e => e.phase === "origin")).toMatchObject({ entry: "worker_shutdown" });
  expect(newLog().map(e => e.originId)).not.toContain(oldLog()[0].closeId);
  expect(b.run.segment).toBeGreaterThan(a.run.segment);
});

describe('a call that goes on with a chat lesson (#1200)', () => {
  it('takes the chat over when the child joins and says a short continuation line instead of the opening', async () => {
    const now = T0;
    let n = 0;
    const store = memoryCallStore({ testFamilies: [] }), connections = memoryConnectionLog(store, () => now);
    const eventStore = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
    const seams: CallSeams = { store, connections, alerts: { send: async () => {}, list: async () => [] }, history: memoryWordingHistoryStore(), events: learningEvents(eventStore), rebuild: async () => true, model: () => ruleMayaModel(), isTestFamily: async () => false, canChat: async () => true, canCallVoice: async () => true, clock: () => now, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, seed: () => 42 };
    const calls = mayaCalls(seams);
    const book: QuestionPackage = { ...SAMPLE_PACKAGES['add-27-39'], ref: { source: 'workbook', workbookId: '44444444-4444-4444-8444-444444444444', page: 1, question: 1 } };
    const chat = await calls.start({ kind: 'chat', parentId: P, childId: C, childName: 'Leah', grade: 4, package: book, startedBy: P });
    if (!chat.ok) throw Error(chat.error);
    const answered = await calls.input(chat.view.id, chat.view.revision, { type: 'child', text: '7 plus 9 is 16.' }, 'Leah');
    if (!answered.ok) throw Error(answered.error);
    const made = await calls.startVoice({ kind: 'family', parentId: P, childId: C, childName: 'Leah', package: book, startedBy: P, fromChat: chat.view.id });
    if (!made.ok) throw Error(made.error);
    const opened = await calls.openVoice(made.view.id, { speechToText: 'fake', voice: 'fake' }, 'Leah');
    if (!opened.ok) throw Error(opened.error);
    expect(voiceOpening(opened.call.session)).toBeNull();
    const continuation = voiceContinuation(opened.call);
    expect(continuation).toMatch(/^Let's keep going\./);
    const session = Object.assign(new EventEmitter(), { agentState: 'listening', userState: 'listening', generateReply: vi.fn(), say: vi.fn((_text: string) => ({ waitForPlayout: async () => {} })), close: vi.fn(async () => {}) });
    const timers: Timers = { now: () => now, set: () => 0, clear: () => {} };
    const run = new VoiceCallRun(session as unknown as voice.AgentSession, opened.call, { timers, notify: () => {}, closed: vi.fn(async () => {}), ...(continuation ? { continuation } : {}) });
    await run.childJoined();
    await flush();
    await opened.call.settled();
    expect(session.generateReply).not.toHaveBeenCalled();
    expect(session.say.mock.calls.map((c) => c[0])).toEqual([continuation]);
    expect(opened.call.resumed).toBe(false);
    expect(opened.call.session.startedAt).toBe(now);
    expect((await store.get(chat.view.id))!).toMatchObject({ status: 'ended', learningEventId: null });
    // A rejoin, or a worker that takes the call over, never says it again.
    const again = await calls.openVoice(made.view.id, { speechToText: 'fake', voice: 'fake' }, 'Leah');
    if (!again.ok) throw Error(again.error);
    expect(again.call.resumed).toBe(false);
    expect(voiceContinuation(again.call)).toBeNull();
    expect(again.call.acknowledged).toContain(CONTINUE_ID);
  });
});
