import { EventEmitter } from 'node:events';
import { llm, voice, initializeLogger } from '@livekit/agents';
import { describe, it, expect, vi } from 'vitest';
import { templateSkills } from '@/lib/assessment';
import { learningEvents } from '@/lib/learning-events';
import { memoryLearningEventStore } from '@/lib/learning-events-memory';
import { memoryWordingHistoryStore, TIME_LIMITS } from '@/lib/maya';
import { mayaCalls, type CallSeams } from '@/lib/maya-call';
import { memoryCallStore, memoryConnectionLog } from '@/lib/maya-call-memory';
import { ruleMayaModel } from '@/lib/maya-model-fake';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import type { QuestionPackage } from '@/lib/question-package';
import { VoiceCallRun, voiceSession, type Timers, type CallUpdate } from './agent';

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
  const seams:CallSeams={store,connections,history:memoryWordingHistoryStore(),events:learningEvents(eventStore),rebuild,model:()=>model,isTestFamily:async()=>true,clock:()=>now,newId:()=> '00000000-0000-4000-8000-000000000001',seed:()=>42};
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
