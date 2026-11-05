import { describe, expect, it, vi, afterEach } from "vitest";
import { createAdaptiveSession, givenQuestions, nextQuestion, restoreSession, startAttempt, storedTest, UNKNOWN_RESPONSE } from "@/lib/assessment";
import { answerQuestion, changeAnswer, doneChecking, finishTest, nextStep, StoreError } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";
const now = Date.UTC(2026,10,5,18);
function family() {
  const s = createAdaptiveSession({ grade: 4, province: "BC" }, 7);
  const row: MemoryTest = { ...startAttempt("a1",now), parentId:"p1",childId:"c1",seed:7,test:storedTest(s),answers:[] };
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
  it("withholds a result for an unfinished assessment or a family that does not own it",async()=>{
    const m=family(); await answerBlock(m);
    expect(await finishTest(m.store,"p1","a1","no",now+10_000)).toMatchObject({ok:false,error:"incomplete"});
    expect(await doneChecking(m.store,"p2","a1","block-1",now+10_000)).toMatchObject({ok:false,error:"not_found"});
    expect(m.tests[0].placement).toBeUndefined();
  });
});
