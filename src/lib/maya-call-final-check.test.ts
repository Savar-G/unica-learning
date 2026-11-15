import { describe, expect, it } from 'vitest';
import { learningEvents } from '@/lib/learning-events';
import { memoryLearningEventStore } from '@/lib/learning-events-memory';
import { memoryWordingHistoryStore } from '@/lib/maya';
import { mayaCalls } from '@/lib/maya-call';
import { memoryCallStore, memoryConnectionLog } from '@/lib/maya-call-memory';
import { callNotes, noteStep } from '@/lib/maya-call-note';
import { memoryNoteStore } from '@/lib/maya-call-note-memory';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { FIXTURES } from '@/lib/maya-gate/fixtures';
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
 const calls=mayaCalls({tutorFamilies:true,store,connections:memoryConnectionLog(store,clock),history:memoryWordingHistoryStore(),events:learningEvents(events),rebuild:async()=>{rebuilt.push(await events.range(C,{from:'2026-11-14',to:'2026-11-16'}));return true},model:()=>model,reviewer:()=>fakeTalkReviewer(),isTestFamily:async()=>false,canChat:async()=>true,canCallVoice:async()=>true,note:async x=>noteStep(await writer.write(x),x.call.id),alerts:{send:async()=>{},list:async()=>[]},clock,newId:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`,seed:()=>3});
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

// Final check 1 of the pre-launch review (Sol, 2026-11-15): each P1 case failed on 4b2959e1a; each control passes on both.
const PKG = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
describe('final check 1 (2026-11-15)', () => {
it('P1: a told word answer must not become a small hint in the parent note',async()=>{
 const r=await family(FIXTURES.CLAIM_TF as OperationPackage,[reply('The answer is true. Circle true on your page.','guide'),reply('Bye for now.','close')],['I need help.','I circle true.']);
 expect(r.notes[0]?.transcript.some(t=>t.speaker==='maya'&&t.text==='The answer is true. Circle true on your page.')).toBe(true);
 expect(r.notes[0]?.facts.finished).toBe('answer_given');
});
it('control: a told numeric answer is recorded as answer_given',async()=>{
 const r=await family(PKG,[reply('52 minus 28 is 24. Write 24 on your paper.','guide'),reply('Bye for now.','close')],['I need help.',"It's 24."]);
 expect(r.notes[0]?.facts.finished).toBe('answer_given');
});
it('P1: progress and a help request on one turn must not name the completed step as stuck',async()=>{
 const r=await family(PKG,[reply('4 minus 2 is 2. What is the whole answer?','guide',{reading:{answers:[{step:'ones',value:{type:'number',value:4},verdict:'right'}]}}),reply('Bye for now.','close')],['12 minus 8 is 4. I need help with the tens.',"It's 24."]);
 expect(r.events[0]?.result).toBe('right_with_help');
 expect(r.notes[0]?.facts.stuckOn).toBe('taking away in the tens');
});
it('control: a separate help request names the tens',async()=>{
 const r=await family(PKG,[reply('Now the tens. What is 4 minus 2?','guide'),reply('4 minus 2 is 2. What is the whole answer?','guide'),reply('Bye for now.','close')],['12 minus 8 is 4.','I need help with the tens.',"It's 24."]);
 expect(r.notes[0]?.facts.stuckOn).toBe('taking away in the tens');
});
for(const severity of [undefined,'concern']) {
 it(`${severity?'control: explicit severity':'P1: safety kind alone'} after the call time limit must retain guidance and the flag`,async()=>{
 const r=await family(PKG,[{...reply('What is 12 minus 8?','guide',{reading:severity?{safety:severity}:{}}),kind:'safety'}],['Someone is hurting me right now.'],false,601000);
 expect(r.record?.outcome?.safetyFlag).toBe(true);
 expect(r.notes[0]?.facts.safety).toBe(true);
 expect(r.notes[0]?.transcript.some(t=>t.speaker==='maya'&&t.text.includes('grown-up'))).toBe(true);
 });
}

});
