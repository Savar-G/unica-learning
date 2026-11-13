import { describe, expect, it, vi, afterEach } from "vitest";
import { createAdaptiveSession, givenQuestions, lockAdaptiveBlock, nextQuestion, restoreSession, startAttempt, storedTest, UNKNOWN_RESPONSE, REPORTED_STRAND } from "@/lib/assessment";
import { answerQuestion, changeAnswer, doneChecking, finishTest, nextStep, StoreError } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";
const now = Date.UTC(2026,10,5,18);
function family(seed = 7) {
  const s = createAdaptiveSession({ grade: 4, province: "BC" }, seed);
  const row: MemoryTest = { ...startAttempt("a1",now), parentId:"p1",childId:"c1",seed,test:storedTest(s),answers:[] };
  return memoryAttemptStore({ tests:[row] });
}
async function answerBlock(m: ReturnType<typeof family>) {
  for (let i=0;i<6;i++) {
    const row=m.tests[0];
    const q=nextQuestion(restoreSession(row.test,row.answers))!;
    expect(await answerQuestion(m.store,"p1","a1",{questionId:q.id,response:UNKNOWN_RESPONSE,timeMs:20_000,work:{png:null,text:""}},now+1000+i)).toMatchObject({ok:true});
  }
}
afterEach(()=>vi.restoreAllMocks());
describe("durable assessment block locks",()=>{
  it("resumes on the current grid, commits one block for concurrent presses, and retries a lost response",async()=>{
    const m=family(); await answerBlock(m);
    expect(await nextStep(m.store,"p1","a1",now+10_000)).toMatchObject({ok:true,step:{status:"check",section:"block-1",numbers:[1,2,3,4,5,6]}});
    const results=await Promise.all([doneChecking(m.store,"p1","a1","block-1",now+20_000),doneChecking(m.store,"p1","a1","block-1",now+20_000)]);
    expect(results.every(r=>r.ok)).toBe(true);
    expect(m.tests[0].test.adaptive!.blocks).toHaveLength(2);
    expect(await doneChecking(m.store,"p1","a1","block-1",now+20_001)).toMatchObject({ok:true,step:{status:"question",number:7,question:{level:3},block:{number:2,first:7,end:12}}});
    const first=givenQuestions(m.tests[0].test,null)[0];
    expect(await changeAnswer(m.store,"p1","a1",{questionId:first.id,response:first.answer,timeMs:1000,work:{png:null,text:""},workChanged:false},now+30_000)).toMatchObject({ok:false,error:"conflict"});
    const resume=await nextStep(m.store,"p1","a1",now+30_000);
    expect(JSON.stringify(resume)).not.toMatch(/"answer"|"wrong"|misconception/);
    expect(resume).toMatchObject({ok:true,step:{number:7}});
  });
  it("an answer change races with the lock and routing uses the final stored answers",async()=>{
    const m=family(); await answerBlock(m);
    const first=givenQuestions(m.tests[0].test,null)[0];
    const results=await Promise.all([
      changeAnswer(m.store,"p1","a1",{questionId:first.id,response:first.answer,timeMs:1000,work:{png:null,text:""},workChanged:false},now+20_000),
      doneChecking(m.store,"p1","a1","block-1",now+20_000),
    ]);
    expect(results[1]).toMatchObject({ok:true});
    expect(m.tests[0].test.adaptive!.locked).toBe(1);
    const response=m.tests[0].answers[0].response;
    expect(response===UNKNOWN_RESPONSE || response===first.answer).toBe(true);
    expect(await changeAnswer(m.store,"p1","a1",{questionId:first.id,response:first.answer,timeMs:1000,work:{png:null,text:""},workChanged:false},now+21_000)).toMatchObject({ok:false,error:"conflict"});
  });
  it("a failed block save keeps review open and a retry succeeds",async()=>{
    vi.spyOn(console,"error").mockImplementation(()=>{});
    const m=family(); await answerBlock(m);
    m.fail.lockBlock=new StoreError("lock failed","fixture");
    expect(await doneChecking(m.store,"p1","a1","block-1",now+10_000)).toMatchObject({ok:false,error:"store_failed"});
    expect(m.tests[0].test.adaptive!.locked).toBe(0);
    delete m.fail.lockBlock;
    expect(await doneChecking(m.store,"p1","a1","block-1",now+20_000)).toMatchObject({ok:true});
  });
  it("closes without scoring when an area's only answers are excluded as rushed", async () => {
    const m = family(1);
    let result = await nextStep(m.store, "p1", "a1", now);
    for (let i = 0; i < 100 && result.ok && result.step.status !== "complete"; i++) {
      if (result.step.status === "check") result = await doneChecking(m.store, "p1", "a1", result.step.section, now + (i + 1) * 1000);
      else {
        const row = m.tests[0];
        const q = nextQuestion(restoreSession(row.test, row.answers))!;
        result = await answerQuestion(m.store, "p1", "a1", { questionId: q.id, response: REPORTED_STRAND[q.strand] === "shapes" ? q.wrong[0].value : q.answer, timeMs: 100, work: { png: null, text: "" } }, now + (i + 1) * 1000);
      }
    }
    expect(result).toMatchObject({ ok: true, step: { status: "complete", sufficientEvidence: false } });
    expect(await finishTest(m.store, "p1", "a1", "no", now + 120_000)).toMatchObject({ ok: false, error: "expired" });
    expect(m.tests[0].status).toBe("expired");
    expect(m.tests[0].placement).toBeUndefined();
  });

  it("withholds a result for an unfinished assessment or a family that does not own it",async()=>{
    const m=family(); await answerBlock(m);
    expect(await finishTest(m.store,"p1","a1","no",now+10_000)).toMatchObject({ok:false,error:"incomplete"});
    expect(await doneChecking(m.store,"p2","a1","block-1",now+10_000)).toMatchObject({ok:false,error:"not_found"});
    expect(m.tests[0].placement).toBeUndefined();
  });
});

describe("the in-memory lockBlock answers as lock_assessment_block does", ()=>{
  const unchanged = (m: ReturnType<typeof family>, resumeUntil: number) => {
    const row = m.tests[0];
    return m.store.lockBlock("a1", { expected: row.test.adaptive!.locked, adaptive: structuredClone(row.test.adaptive!), answers: row.answers, resumeUntil });
  };
  /** The real next lock, as the module asks for it after the child answers a block. */
  const nextLock = (m: ReturnType<typeof family>, resumeUntil: number) => {
    const row = m.tests[0];
    return m.store.lockBlock("a1", { expected: row.test.adaptive!.locked, adaptive: lockAdaptiveBlock(restoreSession(row.test, row.answers)).adaptive!, answers: row.answers, resumeUntil });
  };
  it("is closed for a complete test, before it compares the answers or the new block", async ()=>{
    const m=family(); m.tests[0].test.adaptive!.complete = true;
    expect(await unchanged(m, now + 1000)).toBe("closed");
  });
  it("is changed for a stale lock count, even on a complete test", async ()=>{
    const m=family(); m.tests[0].test.adaptive!.complete = true;
    const row = m.tests[0];
    expect(await m.store.lockBlock("a1", { expected: row.test.adaptive!.locked + 1, adaptive: row.test.adaptive!, answers: row.answers, resumeUntil: now })).toBe("changed");
  });
  it("refuses a new block that does not lock exactly one more block", async ()=>{
    const m=family(); await answerBlock(m);
    await expect(unchanged(m, now + 1000)).rejects.toThrow("Invalid assessment block transition");
  });
  it("moves the deadline and the last answer time only forward", async ()=>{
    const m=family(); await answerBlock(m);
    const later = m.tests[0].resumeUntil + 60_000;
    m.tests[0].resumeUntil = later;
    expect(await nextLock(m, later - 120_000)).toBe("stored");
    expect(m.tests[0].test.adaptive!.locked).toBe(1);
    expect(m.tests[0].resumeUntil).toBe(later);
    expect(m.tests[0].lastAnswerAt).toBe(Math.max(now + 1005, later - 120_000 - 24 * 60 * 60_000));
  });
});
