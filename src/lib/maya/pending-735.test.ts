// Consolidated pending regression tests for open issue #735 (all skipped until #735 lands).

import { describe, expect, it, vi } from "vitest";
import { createSession, fallbacks, hardFeeling, phraseOffers, type Proposal, type SessionEvent, step, teachSteps } from "@/lib/maya";
import { runGateBehaviour } from "@/lib/maya-gate/call";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { type Behaviour, memoryTraceStore, type Plan } from "@/lib/maya-gate/gate";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { placePartsTeachingPackage } from "@/lib/maya-teaching/place-value-parts";
import { storedBuild } from "@/lib/maya-teaching/place-value-parts-samples";
import { createTextSession } from "@/lib/maya-text";
import { type OperationPackage, workedSteps } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

describe("place-value-parts decimal confirm (#735)", () => {
  const made = placePartsTeachingPackage(storedBuild({ wholes: 6, tenths: 4 }));

  if (!made || "held" in made) throw new Error("6 wholes and 4 tenths is held");

  const BUILD_64 = made.package;

  const firstAct = async (id: string, text: string, plan: Plan): Promise<string | undefined> => {
    const fixture = "PVB" as Behaviour["fixture"];
    const b = { id, title: id, fixture, status: "passing", steps: [{ child: text, read: { start: "has_work", answers: [[6.4, "result", "right"]] }, maya: [plan] }], expect: { outcome: {} } } as Behaviour;
    const saved = FIXTURES.PVB;
    FIXTURES.PVB = BUILD_64;
    try {
      const store = memoryTraceStore();
      await runGateBehaviour(b, store);
      const turns = (JSON.parse(store.load(id)!) as { turns: { kind: string; output?: { act: string } }[] }).turns.filter((t) => t.kind === "maya");
      return turns[1]?.output?.act;
    } finally {
      FIXTURES.PVB = saved;
    }
  };

  describe("#735, pending: another speaker's or a copied decimal answer on the build is not the child's", () => {
    for (const text of ["My mom said 6.4.", "My dad told me 6.4.", "I copied 6.4."]) {
      it.skip(`${text} is not accepted at once (the model proposes the accept)`, async () => {
        expect(await firstAct("735-model", text, { act: "accept_answer", lines: ["answer.right"] })).not.toBe("accept_answer");
      });
      it.skip(`${text} is not accepted at once (the model fails; code's fallback)`, async () => {
        expect(await firstAct("735-fallback", text, { throws: true })).not.toBe("accept_answer");
      });
    }
  });
});

describe("free-text recognition gaps (#735)", () => {
  const operation={kind:'add' as const,operands:[3,0] as [number,number]};

  const easier={kind:'add' as const,operands:[0,0] as [number,number]};

  const pkg={...FIXTURES.A,text:'3 + 0',operation,steps:workedSteps(operation),answer:{value:{type:'number' as const,value:3},accepted:[],unit:null},wrongAnswers:[{value:{type:'number' as const,value:4},cause:'O3',description:'Wrong sum',step:null}],easierExample:{text:'0 + 0',operation:easier,steps:workedSteps(easier),answer:{type:'number' as const,value:0}}};

  it.skip.each(['Can you please help me?','Could you please help me?','Would you help me?','Maya, help me.','I need some help.','Help me with this.','I am stuck on this.'])('P2: progress for %s',async(form)=>{
   let at=1000;const s=createTextSession({callId:'735-help',package:pkg,confirmWorkbook:true,grade:2,clock:()=>at,model:fakeMayaModel({answer:()=>{throw new Error('offline')}})});
   await s.start();for(let i=0;i<8&&!s.ended;i++){at+=4000;await s.child(form);}
   expect(s.session.ladder.hint>0||s.session.exampleShown>0||!!s.ended).toBe(true);
  });

  it.skip.each(["I'm stuck?",'I need help?','Please help me!!'])('P3: recognize punctuation variant %s',async(form)=>{
   let at=1000;const s=createTextSession({callId:'735-punctuation',package:pkg,confirmWorkbook:true,grade:2,clock:()=>at,model:fakeMayaModel({answer:()=>{throw new Error('offline')}})});
   await s.start();for(let i=0;i<8&&!s.ended;i++){at+=4000;await s.child(form);}
   expect(s.session.ladder.hint>0||s.session.exampleShown>0||!!s.ended).toBe(true);
  });

  it.skip.each(['I feel low.','I felt bad today.',"I'm devastated.",'I feel downhearted.','My dog is gone forever.','I am not feeling even a little happy.','I feel good for nothing.'])('P2: recognize distress in %s',(text)=>{expect(hardFeeling(text)).toBe(true);});

  it.skip('P3: recognize a repeated intensifier',()=>{expect(hardFeeling('I feel really really really bad.')).toBe(true);});

  it.skip.each(['I am happy because I have no homework.','I am happy. It is not raining.',"I am happy because I didn't lose.",'I am not sad, I am happy!','I have never been this happy!','Nothing makes me happier than my dog.'])('P3: withhold cheer on actual happy news %s',(text)=>{
   let s=createSession({callId:'735-happy',package:FIXTURES.A,grade:2});s=step(s,{type:'start',at:1000}).session;
   for(const p of fallbacks(s)){const out=step(s,{type:'proposal',at:1000,proposal:p,fallback:true});s=out.session;if(!out.refusal)break;}
   s=step(s,{type:'child_turn',at:5000,text}).session;expect(phraseOffers(s,'happy')).toEqual([]);
  });
});

describe("committed value credit (#735)", () => {
  const n=(value:number)=>({type:'number' as const,value});

  function rig(pkg=FIXTURES.A){
   let s=createSession({callId:'review698',package:pkg}); let at=1000;
   const send=(e:Record<string, unknown>)=>{const r=step(s,{at,...e} as SessionEvent);s=r.session;return r;};
   const child=(text:string)=>send({type:'child_turn',at:at+=4000,text});
   const prop=(p:Proposal | Record<string, unknown>)=>send({type:'proposal',proposal:Object.assign({version:2},p)});
   const tick=(t:number)=>{at=t;return send({type:'tick'});};
   const fb=(refused:unknown[]=[])=>{const rejects:unknown[]=[];for(const p of fallbacks(s,refused)){const r=prop(p);if(!r.refusal)return {act:p.act,say:r.effects.filter(x=>x.kind==='say'),reading:p.reading, rejects};rejects.push(r.refusal)}return {act:'DEAD',rejects};};
   const show=(id:string)=>{const r=prop({act:'guide',step:id,level:3,parts:[{line:'step.show',slots:{step:id}}],reading:{help:'show'}});expect(r.refusal).toBeNull();};
   send({type:'start'});fb();
   return {get s(){return s},child,prop,fb,show,send,tick};
  }

  function setup(kind='h3'){
   const r=rig();
   if(kind==='done'){
   r.child('7 plus 9 is 16.');r.fb();r.child('2 plus 3 plus 1 is 6.');r.fb();expect(r.s.done).toEqual(['ones','tens']);
   }else if(kind!=='open'){
   r.child('Show me the ones.');r.show('ones');
   if(kind==='passed'){r.child('16.');r.fb();r.child('Show me the tens.');r.show('tens');r.child('6.');r.fb();expect(r.s.passed).toEqual(['ones','tens']);}
   }
   return r;
  }

  it.skip('does not credit uncommitted subtraction and multiplication steps',()=>{
   for(const [pkg,value] of [[FIXTURES.B,4],[FIXTURES.C,24]] as const) {
    const steps=teachSteps(pkg as OperationPackage);const first=steps[0].id;const next=steps[1]?.id ?? 'result';
    for(const text of [`Is it ${value}?`,`Maybe ${value}.`,`My friend said ${value}.`,`Please help me with ${value}.`,`You said ${value}.`]){
     const r=rig(pkg);r.child(text);const p={act:'guide',step:next,level:0,parts:[{line:'check.right_step',slots:{step:first}},{line:'step.invite',slots:{step:next}}],reading:{answers:[{value:n(value),step:first,verdict:'right'}]}};
     r.prop(p);r.fb([p]);expect(r.s.done,`${pkg.text} ${text}`).not.toContain(first);
    }
   }
  });

  it.skip('hedged or interrogative finals require confirmation',()=>{
   for(const text of ['I think 66.','Is it 66']) for(const mode of ['direct','kept','fallback']){
    const r=setup('open');r.child(text);const p={act:'accept_answer',parts:[{line:'answer.right'}],reading:{answers:[{value:n(66),step:'result',verdict:'right'}]}};
    if(mode==='direct') expect(r.prop(p).refusal,text).not.toBeNull();else expect(r.fb(mode==='kept'?[p]:[]).act,text).toBe('confirm');expect(r.s.solved,text).toBeNull();
   }
  });
});
