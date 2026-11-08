// #735: credit needs a committed value.
import { createSession, step, fallbacks, teachSteps, type Proposal, type SessionEvent } from '@/lib/maya';
import type { OperationPackage } from '@/lib/question-package';
import { it, expect } from 'vitest';
import { FIXTURES } from '@/lib/maya-gate/fixtures';
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
