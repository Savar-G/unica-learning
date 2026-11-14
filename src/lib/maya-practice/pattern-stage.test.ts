import { expect, it, vi } from "vitest";
import { PRACTICE_CASES, runPractice, scriptedSimulator, fakeJudge, fakeValidityJudge, memoryPracticeStore, judgeRun, traceFile } from "@/lib/maya-practice";
import type { MayaTrace } from "@/lib/maya-trace";
import { ruleMayaModel } from "@/lib/maya-model-fake";
vi.mock("server-only",()=>({}));
async function run(words: string[]) {
 const c=PRACTICE_CASES.find(c=>c.id==="PTP4")!,store=memoryPracticeStore();
 await runPractice(c,1,1,{maya:ruleMayaModel(),simulator:scriptedSimulator(words),validity:fakeValidityJudge(),judge:fakeJudge(),store,freeTalk:false});
 return { verdict:judgeRun(c,"PTP4-r1",store,{stage:"code"}),trace:JSON.parse(store.load(traceFile("PTP4-r1"))!) as MayaTrace };
}
it("allows the persona's own remaining addition on child turn two after a product confirmation",async()=>{
 const {verdict,trace}=await run(["I think I start with 8 times 9 is 72.","Yes, 72 beads from the 8 days. Then I add 32 to get 104.","I wrote it."]);
 const children=trace.turns.flatMap((t,i)=>t.kind==="child"?[i]:[]);
 expect(children.length).toBeGreaterThanOrEqual(2);
 const acts=trace.turns.slice(children[0]+1,children[1]).flatMap((t)=>t.kind==="maya"&&t.output?[t.output.act]:[]);
 expect(acts).toContain("confirm");expect(acts).not.toContain("guide");expect(acts).not.toContain("example_step");
 expect(verdict.invalid).not.toContainEqual(expect.objectContaining({code:"knew_too_much"}));
 expect(verdict.invalid).not.toContainEqual(expect.objectContaining({code:"number_not_allowed"}));
});
it("does not open the final answer on the first child turn",async()=>{
 const {verdict}=await run(["I got 104.","I wrote it."]);
 expect(verdict.invalid).toContainEqual(expect.objectContaining({code:"knew_too_much"}));
});
it("does not allow an unrelated number on the second child turn",async()=>{
 const {verdict}=await run(["I think I start with 8 times 9 is 72.","I got 103.","I wrote it."]);
 expect(verdict.invalid).toContainEqual(expect.objectContaining({code:"number_not_allowed"}));
});
