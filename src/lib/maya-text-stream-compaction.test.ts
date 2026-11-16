import { afterEach, expect, it, vi } from "vitest";
import { createTextSession, type SavedTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";

const TRADE = "We trade 1 ten for 10 ones.";
const SECOND = "12 minus 8 is 4.";
const CHILD = "I don't get 2 minus 8.";
const deferred = () => Promise.withResolvers<void>();
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });


it.each(["raw", "input"] as const)("reconciliation retains 70 deferred ticks at compaction under %s priority", async kind => {
  // Falsifier: rollback loses an intervening tick/priority, retains an unsent part, or corrupts recovery at 64 events.
  const saved = deferred(), release = deferred(), finish = deferred(), raw = deferred();
  const proposal = reply(`${TRADE} ${SECOND}`, "guide", {gate:"none", reading: kind === "raw" ? {safety:"concern"} : {}});
  const model = conversationalFake({answer:()=>proposal});
  model.propose = async (_i,_signal,onText) => {
    const whole=JSON.stringify(proposal);
    onText?.(whole.slice(0,whole.indexOf(',"act"')));
    await raw.promise;
    if(kind === "raw") onText?.(whole);
    await finish.promise;
    return proposal;
  };
  const heard:string[]=[];const snapshots:SavedTextSession[]=[];
  const session=createTextSession({callId:"compact-hold",package:SAMPLE_PACKAGES["subtract-52-28"],model,clock:()=>0,tutor:true,channel:"chat",grade:3,random:42,reviewer:fakeTalkReviewer(),mathReviewer:fakeMathReviewer(),onSayPart:text=>heard.push(text),persist:async()=>{
    snapshots.push(await session.saved());
    if(snapshots.length===1){saved.resolve();await release.promise;} return true;
  }});
  await session.start();
  const turn=session.child(CHILD);
  try {
    await saved.promise;
    const ticks=Array.from({length:70},()=>session.tick());
    const priority = kind === "input" ? session.safety("concern") : Promise.resolve(null);
    raw.resolve();
    await new Promise<void>(r=>setImmediate(r));
    release.resolve();finish.resolve();
    await Promise.all([turn,priority,...ticks]);
    await vi.waitFor(async () => expect((await session.saved()).checkpoint).toBeTruthy());
    const latest=await session.saved();
    const idle=conversationalFake({answer:()=>{throw Error("no model in recovery");}});
    const fresh=createTextSession({callId:"compact-hold",package:SAMPLE_PACKAGES["subtract-52-28"],model:idle,clock:()=>0,channel:"chat",resume:latest});
    const trace=await fresh.finish({reason:"child_stopped"});
    expect(latest.checkpoint).toBeTruthy();
    expect(trace.turns.filter(t=>t.kind==="tick")).toHaveLength(70);
    expect(trace.turns.filter(t=>t.kind==="child")).toHaveLength(1);
    expect(trace.turns.flatMap(t=>t.kind==="maya"?t.output?.say??[]:[]).join(" ")).not.toContain(TRADE);
    expect(trace.board.some(b=>b.commands.some(c=>(c as {op?:string}).op==="regroup"))).toBe(false);
    expect(trace.outcome?.safetyFlag).toBe(true);
    expect(trace.outcome?.assistance).toBe("independent");
    expect(heard).toEqual([]);
  } finally {raw.resolve();release.resolve();finish.resolve();await turn;}
});
