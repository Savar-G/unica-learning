import {describe,it,expect} from "vitest";
// The PR #624 review's regression tests (Codex), kept as written apart from types.
import {createSession,step,readAnswer, type Proposal, type SessionEvent} from "@/lib/maya";
import {FIXTURES} from "@/lib/maya-gate/fixtures";
const n=(value:number)=>({type:"number" as const,value});
const ln=(line:string,slots={})=>({line,slots});
type NoAt=SessionEvent extends infer E?E extends SessionEvent?Omit<E,"at">:never:never;
function call(){let s=createSession({callId:"review",package:FIXTURES.A,freeTalk:true});let at=1000;const send=(e:NoAt)=>{const r=step(s,{at,...e} as SessionEvent);s=r.session;return r;};send({type:"start"});const open=send({type:"proposal",proposal:{version:2,act:"open",parts:[ln("open.hello"),ln("question.problem")]}});expect(open.refusal).toBeNull();return {get s(){return s},child(text:string){at+=4000;return send({type:"child_turn",text})},p(p:Record<string,unknown>){return send({type:"proposal",proposal:{version:2,...p} as Proposal})}}}
function tens(){const c=call();c.child("Seven plus nine is sixteen.");expect(c.p({act:"guide",step:"tens",level:0,parts:[ln("check.right_step",{step:"ones"}),ln("step.invite",{step:"tens"})],reading:{start:"has_work",answers:[{value:n(16),step:"ones",verdict:"right"}]}}).refusal).toBeNull();return c;}
describe("independent review regressions",()=>{
 it("does not accept an earlier 66 over a later explicit answer of 56",()=>{const text="I got 66. I added 2 and 3 so my answer is 56.";const c=call();c.child(text);const r=c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}});expect(r.refusal).not.toBeNull();expect(c.s.solved).toBeNull();});
 it("does not accept a yes followed by explicit uncertainty",()=>{const c=call();c.child("I think 66.");expect(c.p({act:"confirm",parts:[ln("confirm.heard",{heard:"66"})]}).refusal).toBeNull();c.child("Yes, I have no clue if 66 is right.");expect(readAnswer("Yes, I have no clue if 66 is right.").sure).toBe(false);const r=c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}});expect(r.refusal).not.toBeNull();expect(c.s.solved).toBeNull();});
 it("does not treat a subtraction as an addition setup echo",()=>{const c=tens();c.child("So 2 plus 3 minus 1?");const r=c.p({act:"guide",step:"tens",level:2,parts:[ln("step.operation",{step:"tens"})]});expect(r.refusal?.code).toBe("hint_too_high");});
 it("does not unlock new help when the child says they are not stuck",()=>{const c=tens();c.child("I'm not stuck.");const r=c.p({act:"guide",step:"tens",level:1,parts:[ln("step.point",{step:"tens"})]});expect(r.refusal?.code).toBe("hint_too_high");});
});
describe("controls",()=>{
 it.each(["66","I got 66.","I'm sure it's 66."])("accepts plain correct answer %s",text=>{const c=call();c.child(text);expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).toBeNull();});
 it.each(["56","Not 66, so 56.","66 or 56?","I got 66. I added 2 and 3, so my answer is 56."])("does not accept 66 for %s",text=>{const c=call();c.child(text);expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).not.toBeNull();});
 it.each(["So 2 plus 3 plus 1?","Yes, I think 66 is right.","I don't know about the ten."])("safety blocks teaching after %s",text=>{const c=tens();c.child(text);const r=c.p({act:"guide",step:"tens",level:2,parts:[ln("step.operation",{step:"tens"})],reading:{safety:"immediate"}});expect(r.refusal?.code).toBe("safety_first");expect(r.effects.filter(e=>e.kind==="say")).toEqual([]);expect(c.s.safety.severity).toBe("immediate");});
 it("missing understanding stays uncertain",()=>{const c=call();c.child("66");expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).toBeNull();c.child("Okay.");expect(c.p({act:"ask_write",parts:[ln("write.answer")]}).refusal).toBeNull();expect(c.s.understanding).toBe("uncertain");});
});
