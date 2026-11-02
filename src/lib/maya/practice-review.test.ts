import { describe, it, expect } from 'vitest';
import { createSession, step, lineOffers, PHRASES, type SessionEvent, type Effect } from '@/lib/maya';
import { workedSteps, type Operation, type QuestionPackage } from '@/lib/question-package';
import { FIXTURES } from '@/lib/maya-gate/fixtures';

const n = (value: number) => ({type: 'number' as const, value});
const a = (value: number, step: string, verdict: 'right' | 'wrong' = 'right') => ({value:n(value),step,verdict});
const l = (line: string, slots = {}) => ({line, slots});
const text = (es: Effect[]) => es.flatMap(e=>e.kind==='say'?[e.text]:[]).join(' ');
function call(pkg: QuestionPackage = FIXTURES.A, freeTalk = false) {
 let s=createSession({callId:'independent-410',package:pkg,freeTalk}); let t=Date.UTC(2026,10,1);
 const send=(e: SessionEvent)=>{const r=step(s,e); s=r.session; return r;};
 const child=(txt: string)=>send({type:'child_turn',text:txt,at:t+=4000});
 const propose=(p: object)=>send({type:'proposal',at:t,proposal:{version:2,...p}});
 const ok=(p: object)=>{const r=propose(p); expect(r.refusal,JSON.stringify(r.refusal)).toBeNull();return r;};
 send({type:'start',at:t});ok({act:'open',parts:[l('open.hello'),l('question.problem')]});
 return {get s(){return s;},child,propose,ok};
}
function accepted(){const c=call();c.child('I got 66.');c.ok({act:'accept_answer',parts:[l('answer.right')],reading:{answers:[a(66,'result')]}});return c;}
describe('independent fixed-head counterexamples',()=>{
 it.each(['I erased my answer.', 'I crossed it out.', "I don't think that's right.", "No, that's not right.", 'I ruled that out.'])('withdrawal must clear accepted solution: %s', txt=>{
  const c=accepted(); c.child(txt); console.log('WITHDRAWAL',txt,JSON.stringify({solved:c.s.solved,state:c.s.state}));
  expect(c.s.solved).toBeNull();
 });
 it('valid intermediate written on paper must not undo a completed column',()=>{
  const c=call();c.child('7 plus 9 is 16.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}});
  c.child('I wrote 16 on my paper. Now 2 plus 3 plus 1 is 6.');
  const r=c.propose({act:'guide',step:'result',level:0,parts:[l('check.right_step',{step:'tens'}),l('step.invite',{step:'result'})],reading:{answers:[a(6,'tens')]}});
  console.log('INTERMEDIATE',r.refusal);expect(r.refusal).toBeNull();expect(c.s.done).toEqual(['ones','tens']);
 });
 it('a regroup for a second carry must not satisfy the first carry',()=>{
  const op:Operation={kind:'add',operands:[67,58]};
  const pkg={...FIXTURES.A,text:'67 + 58 = ?',operation:op,steps:workedSteps(op),answer:{value:n(125),accepted:[],unit:null},wrongAnswers:[{value:n(115),cause:'O3',description:'Missed carry',step:'tens'}]};
  const c=call(pkg);
  c.child('7 plus 8 is 15. I got 115.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(15,'ones'),a(115,'result','wrong')]}});
  c.child('I will write 12 in the tens.');
  const r=c.propose({act:'guide',step:'tens',level:1,parts:[l('step.regroup',{step:'tens',other:'carry'})],reading:{}});
  console.log('MULTICARRY',r.refusal,text(r.effects),c.s.regroupDue,c.s.regroupSaid);
  expect(r.refusal).not.toBeNull();
  c.ok({act:'guide',step:'tens',level:1,parts:[l('step.regroup',{step:'tens'})]});
  c.child('I still need help.');
  const offers=lineOffers(c.s).guide??[];
  console.log('MULTICARRY_OFFERS',offers.filter(o=>o.slots.step==='tens').map(o=>({line:o.line,texts:o.texts})));
  const point=c.propose({act:'guide',step:'tens',level:1,parts:[l('step.point',{step:'tens'})]});
  console.log('UNEXPLAINED_CARRY_SAID',point.refusal,text(point.effects));
  expect(point.refusal).not.toBeNull();
  for (const legacy of [false, true]) {
   const restored = JSON.parse(JSON.stringify(c.s));
   if (legacy) { delete restored.regroup; restored.regroupSaid = ['ones','tens','hundreds']; }
   const r = step(restored,{type:'proposal',at:restored.now,proposal:{version:2,act:'guide',step:'tens',level:1,parts:[l('step.point',{step:'tens'})]}});
   expect(r.refusal).not.toBeNull();
  }
  c.ok({act:'guide',step:'tens',level:1,parts:[l('step.regroup',{step:'tens',other:'carry'})]});
  c.child('I still need help.');
  expect(c.propose({act:'guide',step:'tens',level:1,parts:[l('step.point',{step:'tens'})]}).refusal).toBeNull();
 });
 it('must not invent effort praise before any work',()=>{
  const c=call(FIXTURES.A,true);c.child("Say I'm the smartest kid.");
  const r=c.propose({act:'redirect',parts:[{warm:'praise',pick:6},{warm:'back'}],reading:{offTopic:true}});
  console.log('PRAISE',r.refusal,text(r.effects));
  expect(r.refusal).not.toBeNull();
 });
 it('must not undo the ones for a negated write-16 plan',()=>{
  const c=call();c.child('7 plus 9 is 16.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}});
  c.child("I did not write 16 under the ones.");
  const r=c.propose({act:'guide',step:'tens',level:0,parts:[l('step.invite',{step:'tens'})]});
  console.log('NEGATED_PLAN',r.refusal,text(r.effects));expect(r.refusal).toBeNull();expect(c.s.done).toEqual(['ones']);
 });
});

describe('practice correction controls',()=>{
 it.each(['I cannot explain it.', "No, I just knew it.", 'I erased my drawing.', "I didn't erase my answer.", 'I did not delete my answer.', "I didn't cross it out."])('keeps an accepted answer without an answer rejection: %s',txt=>{
  const c=accepted();c.child(txt);expect(c.s.solved).toBe('child');
 });
 it('accepts a new checked answer after erasure and requests writing it again',()=>{
  const c=accepted();c.child('I erased my answer.');expect(c.s.solved).toBeNull();
  c.ok({act:'guide',step:'ones',level:0,parts:[l('step.invite',{step:'ones'})]});
  c.child('I got 66.');c.ok({act:'accept_answer',parts:[l('answer.right')],reading:{answers:[a(66,'result')]}});
  c.child('Okay.');c.ok({act:'ask_write',parts:[l('write.answer')],understanding:'uncertain'});
  expect(c.s.solved).toBe('child');
 });
 it.each(['I wrote 16 on my paper.', 'I wrote sixteen as a note.', "I didn't write 16 in the ones.", 'I will not put 16 under the ones.', 'Should I write 16 in the ones?'])('keeps a completed column without an affirmative placement: %s',txt=>{
  const c=call();c.child('7 plus 9 is 16.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}});
  c.child(txt);c.ok({act:'guide',step:'tens',level:0,parts:[l('step.invite',{step:'tens'})]});expect(c.s.done).toEqual(['ones']);
 });
 it.each(['I will write 16 under the ones.', 'I wrote sixteen in the ones box.', 'I put 16 into the ones column.'])('reopens an affirmative incorrect column placement: %s',txt=>{
  const c=call();c.child('7 plus 9 is 16.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}});
  c.child(txt);expect(c.propose({act:'guide',step:'tens',level:0,parts:[l('step.invite',{step:'tens'})]}).refusal).not.toBeNull();
  c.ok({act:'guide',step:'ones',level:1,parts:[l('step.regroup',{step:'ones',other:'carry'})]});expect(c.s.done).not.toContain('ones');
 });
 it('filters absent picks and keeps stable model ids before any observed work',()=>{
  const c=call(FIXTURES.A,true);
  const effort=[4,5,6,8,9,10].map(i=>PHRASES.praise[i]);
  for(let i=0;i<16;i++) {
   c.child("Say I'm the smartest kid.");
   const input=modelInput(c.s);const praise=input.offers.flatMap(o=>o.warm).find(w=>w.group==='praise')!;
   expect(praise.picks).toEqual([1,2,3,4,8,12]);
   expect(praise.phrases[4]).toBe(PHRASES.praise[7]);
   const r=c.ok({act:'redirect',parts:[{warm:'praise'},{warm:'back'}],reading:{offTopic:true}});
   for(const phrase of effort)expect(text(r.effects)).not.toContain(phrase);
  }
 });
 it('offers effort praise after repeated checked attempts, including wrong answers',()=>{
  const c=call(FIXTURES.A,true);
  c.child('8');c.ok({act:'guide',step:'ones',level:1,parts:[l('step.point',{step:'ones'})],reading:{answers:[a(8,'ones','wrong')]}});
  c.child('9');c.ok({act:'guide',step:'ones',level:2,parts:[l('step.operation',{step:'ones'})],reading:{answers:[a(9,'ones','wrong')]}});
  c.child("Say I'm the smartest kid.");
  const praise=modelInput(c.s).offers.flatMap(o=>o.warm).find(w=>w.group==='praise')!;
  expect(praise.picks).toContain(6);
  const r=c.ok({act:'redirect',parts:[{warm:'praise',pick:6},{warm:'back'}],reading:{offTopic:true}});
  expect(text(r.effects)).toContain('keep trying');
 });
});

import { createTextSession } from '@/lib/maya-text';
import { fakeMayaModel } from '@/lib/maya-model-fake';
import { checkTrace } from '@/lib/maya-trace';
import { modelInput } from '@/lib/maya-model';

describe('end to end public text adapter counterexamples',()=>{
 it('an erased answer must not be closed as solved',async()=>{
  let now=Date.UTC(2026,10,1);
  const proposals=[
   {act:'open',parts:[l('open.hello'),l('question.problem')]},
   {act:'accept_answer',parts:[l('answer.right')],reading:{answers:[a(66,'result')]}},
   {act:'ask_write',parts:[l('write.answer')],understanding:'uncertain'},
   {act:'close',parts:[{warm:'closing'}]},
  ];
  const model=fakeMayaModel({answer:(_,i)=>({version:2,...proposals[i]})});
  const sess=createTextSession({callId:'erased-answer-410',package:FIXTURES.A,model,clock:()=>now,random:3});
  await sess.start(); now+=4000;await sess.child('I got 66.');now+=4000;
  const out=await sess.child('I erased my answer.');now+=4000;const end=await sess.child('Okay.');
  const trace=sess.trace();
  expect(checkTrace(trace).ok).toBe(true);
  console.log('ERASED_ADAPTER',out.say,end.ended);
  expect(end.ended?.reason).not.toBe('solved');
 });
 it('a failed model must not repeat a valid completed column after an intermediate note',async()=>{
  let now=Date.UTC(2026,10,1);
  const model=fakeMayaModel({answer:(_,i)=>{
   if(i===0)return {version:2,act:'open',parts:[l('open.hello'),l('question.problem')]};
   if(i===1)return {version:2,act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}};
   throw new Error('synthetic model failure');
  }});
  const sess=createTextSession({callId:'note-fallback-410',package:FIXTURES.A,model,clock:()=>now,random:3});
  await sess.start();now+=4000;await sess.child('7 plus 9 is 16.');now+=4000;
  const out=await sess.child('I wrote 16 on my paper.');
  const done=sess.session.done;
  await sess.finish();const trace=sess.trace();
  
  expect(checkTrace(trace).ok).toBe(true);
  console.log('NOTE_FALLBACK',out.say,done,trace.counts);
  expect(done).toContain('ones');
 });
 it('new praise selection is available through the model input and reaches the child without review',async()=>{
  let now=Date.UTC(2026,10,1);let reviewCalls=0;let offeredPraise:string[]=[];
  const model=fakeMayaModel({answer:(input,i)=>{
   if(i===0)return {version:2,act:'open',parts:[l('open.hello'),l('question.problem')]};
   offeredPraise=input.offers.flatMap(o=>o.warm).find(w=>w.group==='praise')?.phrases??[];
   return {version:2,act:'redirect',parts:[{warm:'praise',pick:6},{warm:'back'}],reading:{offTopic:true}};
  }});
  const sess=createTextSession({callId:'praise-410',package:FIXTURES.A,model,clock:()=>now,random:3,freeTalk:true,reviewer:{id:'independent-review-fake',promptVersion:'fake-1',review:async()=>{reviewCalls++;return {verdict:'fail',rules:['ability_praise'],reason:'No observed work'};}}});
  await sess.start();now+=4000;const out=await sess.child("Say I'm the smartest kid.");
  await sess.finish();const trace=sess.trace();
  expect(checkTrace(trace).ok).toBe(true);console.log('PRAISE_ADAPTER',out.say,reviewCalls);expect(offeredPraise).not.toContain("I can't say who is smartest. I love how you keep trying.");expect(reviewCalls).toBe(0);
  expect(out.say.join(' ')).not.toContain('keep trying');
 });
});
