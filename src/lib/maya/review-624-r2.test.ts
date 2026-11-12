import {describe,it,expect} from "vitest";
// The PR #624 review round 3 regression checks (Codex): the six cases as written, unused helpers removed.
import {createSession,step, type Proposal, type SessionEvent} from "@/lib/maya";
import {FIXTURES} from "@/lib/maya-gate/fixtures";
const n=(value:number)=>({type:"number" as const,value});
const ln=(line:string,slots={})=>({line,slots});
type NoAt=SessionEvent extends infer E?E extends SessionEvent?Omit<E,"at">:never:never;
function call(){let s=createSession({callId:"review",package:FIXTURES.A,freeTalk:true});let at=1000;const send=(e:NoAt)=>{const r=step(s,{at,...e} as SessionEvent);s=r.session;return r;};send({type:"start"});const open=send({type:"proposal",proposal:{version:2,act:"open",parts:[ln("open.hello"),ln("question.problem")]}});expect(open.refusal).toBeNull();return {get s(){return s},child(text:string){at+=4000;return send({type:"child_turn",text})},p(p:Record<string,unknown>){return send({type:"proposal",proposal:{version:2,...p} as Proposal})}}}


describe("PR624 review requirements",()=>{
 it("does not hide an explicit final that is a known step value",()=>{const c=call();c.child("I got 66. I added 7 and 9 so my final is 16.");expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).not.toBeNull();});
 const rightOnes=(text:string,value=6)=>{const c=call();c.child(text);return c.p({act:"guide",step:"tens",level:0,parts:[ln("check.right_step",{step:"ones"}),ln("step.invite",{step:"tens"})],reading:{answers:[{value:n(value),step:"ones",verdict:"right"}]}});};
 it("does not skip a false equation before a carry",()=>{expect(rightOnes("7 plus 9 is 6 and I carry the 1.").refusal).not.toBeNull();});
 it("does not accept a digit from a false total",()=>{expect(rightOnes("7 plus 9 is 26, I put 6.").refusal).not.toBeNull();});
 it("does not ignore a wrong written digit",()=>{expect(rightOnes("7 plus 9 is 16, I wrote 5.",16).refusal).not.toBeNull();});
 it("asks about a corrected equation and its digit: the turn is not one template",()=>{expect(rightOnes("7 plus 9 is 6. No, I mean 7 plus 9 is 16, I wrote 6.").refusal?.code).toBe("answer_not_committed");});
 it("keeps an accepted result when a correction restates it with known working",()=>{const c=call();c.child("66");expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).toBeNull();c.child("Actually 66. 7 plus 9 is 16.");expect(c.s.solved).toBe("child");});
});
