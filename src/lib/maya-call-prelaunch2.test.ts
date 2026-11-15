import { describe, expect, it } from 'vitest';
import { createTextSession } from '@/lib/maya-text';
import { learningEvents } from '@/lib/learning-events';
import { memoryLearningEventStore } from '@/lib/learning-events-memory';
import { memoryWordingHistoryStore } from '@/lib/maya';
import { mayaCalls } from '@/lib/maya-call';
import { memoryCallStore, memoryConnectionLog } from '@/lib/maya-call-memory';
import { callNotes, noteStep } from '@/lib/maya-call-note';
import { memoryNoteStore } from '@/lib/maya-call-note-memory';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import {fakeMathReviewer} from '@/lib/maya-math-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import type { OperationPackage } from '@/lib/question-package';
const P='11111111-1111-4111-8111-111111111111', C='22222222-2222-4222-8222-222222222222';
const W='44444444-4444-4444-8444-444444444444';
async function family(pkg: OperationPackage, script: unknown[], childTurns: string[], voice = false, delay = 5000) {
 let now=Date.UTC(2026,10,15), id=0;
 const clock=()=>now;
 const store=memoryCallStore({testFamilies:[],clock});
 const events=memoryLearningEventStore({children:[{id:C,parentId:P}]});
 const notes=memoryNoteStore({calls:()=>store.rows(),testFamilies:[]});
 const writer=callNotes({store:notes,ai:null,isTestFamily:async()=>false,childNames:async()=>({firstName:'Ava',formerNames:[]}),clock});
 const model=conversationalFake({id:'fake-v3',answer:(_: unknown, n: number) => script[Math.min(n, script.length - 1)] as never});
 const rebuilt: unknown[] = [];
 const calls=mayaCalls({tutorFamilies:true,store,connections:memoryConnectionLog(store,clock),history:memoryWordingHistoryStore(),events:learningEvents(events),rebuild:async()=>{rebuilt.push(await events.range(C,{from:'2026-11-14',to:'2026-11-16'}));return true},model:()=>model,reviewer:()=>fakeTalkReviewer(),mathReviewer:()=>fakeMathReviewer(),isTestFamily:async()=>false,canChat:async()=>true,canCallVoice:async()=>true,note:async x=>noteStep(await writer.write(x),x.call.id),alerts:{send:async()=>{},list:async()=>[]},clock,newId:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`,seed:()=>3});
 const input={kind:voice?'family' as const:'chat' as const,parentId:P,childId:C,childName:'Ava',grade:5,startedBy:P,package:{...pkg,ref:{source:'workbook' as const,workbookId:W,page:1,question:1}}};
 const start=voice?await calls.startVoice(input):await calls.start(input);
 if(!start.ok) throw Error(start.error);
 let current=start;
 if(voice){
  const open=await calls.openVoice(start.view.id,{speechToText:'fake',voice:'fake'},'Ava'); if(!open.ok)throw Error(open.error);
  await open.call.start();
  for(const text of childTurns){now+=delay;await open.call.child(text);await open.call.settled()}
  await open.call.end({reason:'child_stopped'});
 } else {
  for(const text of childTurns){now+=delay; const r=await calls.input(current.view.id,current.view.revision,{type:'child',text},'Ava');if(!r.ok)throw Error(r.error);current=r}
 }
 if (!voice && (await store.get(start.view.id))?.status !== 'ended') { const r=await calls.input(current.view.id,current.view.revision,{type:'end'},'Ava'); if(!r.ok) throw Error(r.error); }
 const record=await store.get(start.view.id);
 const heldEvents=await events.range(C,{from:'2026-11-14',to:'2026-11-16'});
 return {record,events:heldEvents,notes:notes.rows(),rebuilt};
}


// Pre-launch check 2, part 1 (Sol, 2026-11-15): each case failed on d6e32a97e; the controls pass on both.
const pkg = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
describe('pre-launch check 2, part 1 (2026-11-15)', () => {
for(const voice of [false,true]) {
 it(`control: a separate help turn correctly records tens, voice=${voice}`,async()=>{
  const r=await family(pkg,[reply('What is 4 minus 2?','guide'),reply('4 minus 2 is 2. What is the whole answer?','guide'),reply('Bye for now.','close')],['12 minus 8 is 4.','I need help with the tens.',"It's 24."],voice);
  expect(r.events[0]?.stuckStep).toBe('tens');
  expect(r.notes[0]?.facts.stuckOn).toBe('taking away in the tens');
 });
 it(`control: new wrong final answer without help clears success, voice=${voice}`,async()=>{
  const r=await family(pkg,[reply('Yes, 24. What did you write?','guide'),reply('What is 12 minus 8?','guide')],["It's 24.",'My answer is 36.'],voice);
  expect(r.events[0]?.result).toBe('blank');
  expect(r.notes[0]?.facts.finished).toBe('not_finished');
 });
 it(`progress followed by teaching the next step records the next step, voice=${voice}`,async()=>{
  const r=await family(pkg,[reply('4 minus 2 is 2. What is the whole answer?','guide'),reply('Bye for now.','close')],['12 minus 8 is 4.',"It's 24."],voice);
    expect(r.events[0]?.stuckStep).toBe('tens');
  expect(r.notes[0]?.facts.stuckOn).toBe('taking away in the tens');
 });
 for(const wrong of ['My answer is 36. Can you help me?', 'My answer is 36. I need help.', 'My answer is 36. Why?']) {
  it(`new wrong final answer clears success even with a question: ${wrong}, voice=${voice}`,async()=>{
   const r=await family(pkg,[reply('Yes, 24. What did you write?','guide'),reply('What is 12 minus 8?','guide')],["It's 24.",wrong],voice);
      expect(r.events[0]?.result).toBe('blank');
   expect(r.notes[0]?.facts.finished).toBe('not_finished');
  });
 }
}

for(const child of ['My answer is 36. Can you help me?', 'My answer is 36. I need help.', 'I got 36. Why?', 'I got 36.']) {
 it(`never affirms explicit wrong answer: ${child}`,async()=>{
  const s=createTextSession({callId:'stance-help',package:pkg,tutor:true,clock:()=>10000,
   model:conversationalFake({answer:()=>reply("Yes, that's right! What is 12 minus 8?",'guide')}),
   reviewer:fakeTalkReviewer(),mathReviewer:fakeMathReviewer()});
  await s.start(); const out=await s.child(child);
    expect(out.say.join(' ')).not.toContain("that's right");
 });
}


});
