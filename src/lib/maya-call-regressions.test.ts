// Consolidated Maya call-layer behavioral regressions.

import { describe, expect, it } from "vitest";
import type { AiClient } from "@/lib/ai-client";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore } from "@/lib/maya-call-note-memory";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { aiMathReviewer, fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { aiTalkReviewer, fakeTalkReviewer } from "@/lib/maya-talk-review";
import { teachingPackage } from "@/lib/maya-teaching";
import { createTextSession } from "@/lib/maya-text";
import { fixedOffers } from "@/lib/maya/lines";
import { MATH_REVIEW_SYSTEM, type MathReviewInput } from "@/lib/maya/math-review";
import { createSession, mathReviewInput } from "@/lib/maya/session";
import { checkTutorSay, childSaysFalse, codeAlone, exactKey, exactTexts, tutorStreamContext } from "@/lib/maya/tutor";
import { TUTOR_OUTPUT_SCHEMA, TUTOR_PROMPT } from "@/lib/maya/tutor-prompt";
import { type Operation, type OperationPackage, operationResult, workedSteps } from "@/lib/question-package";

describe("call lifecycle checks", () => {
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
});

describe("call prelaunch checks", () => {
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
});

describe("call tutor regressions (set 1)", () => {
  const P = '11111111-1111-4111-8111-111111111111', C = '22222222-2222-4222-8222-222222222222';

  const W = '44444444-4444-4444-8444-444444444444';

  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const ADD = SAMPLE_PACKAGES['add-27-39'] as OperationPackage;

  const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };

  /** A family call (chat or voice) through the public call module, with in-memory stores and the note writer. */
  async function family(pkg: OperationPackage, script: unknown[], childTurns: string[], voice = false) {
    let now = Date.UTC(2026, 10, 15), id = 0;
    const clock = () => now;
    const store = memoryCallStore({ testFamilies: [], clock });
    const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
    const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
    const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: 'Ava', formerNames: [] }), clock });
    const model = conversationalFake({ id: 'fake-v3', answer: (_: unknown, n: number) => script[Math.min(n, script.length - 1)] as never });
    const calls = mayaCalls({ tutorFamilies: true, store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(), events: learningEvents(events), rebuild: async () => true, model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer(), isTestFamily: async () => false, canChat: async () => true, canCallVoice: async () => true, note: async (x) => noteStep(await writer.write(x), x.call.id), alerts: { send: async () => {}, list: async () => [] }, clock, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`, seed: () => 3 });
    const input = { kind: voice ? 'family' as const : 'chat' as const, parentId: P, childId: C, childName: 'Ava', grade: 5, startedBy: P, package: { ...pkg, ref: { source: 'workbook' as const, workbookId: W, page: 1, question: 1 } } };
    const start = voice ? await calls.startVoice(input) : await calls.start(input);
    if (!start.ok) throw Error(start.error);
    let current = start;
    if (voice) {
      const open = await calls.openVoice(start.view.id, { speechToText: 'fake', voice: 'fake' }, 'Ava');
      if (!open.ok) throw Error(open.error);
      await open.call.start();
      for (const text of childTurns) { now += 5000; await open.call.child(text); await open.call.settled(); }
      await open.call.end({ reason: 'child_stopped' });
    } else {
      for (const text of childTurns) { now += 5000; const r = await calls.input(current.view.id, current.view.revision, { type: 'child', text }, 'Ava'); if (!r.ok) throw Error(r.error); current = r; }
      if ((await store.get(start.view.id))?.status !== 'ended') { const r = await calls.input(current.view.id, current.view.revision, { type: 'end' }, 'Ava'); if (!r.ok) throw Error(r.error); }
    }
    return { record: await store.get(start.view.id), notes: notes.rows() };
  }

  /** One tutor turn in the text adapter, streamed or whole; `early` holds what reached the child before the model ended. */
  async function turn(pkg: OperationPackage, out: unknown, child: string, opts: { stream?: boolean; math?: ReturnType<typeof fakeMathReviewer>; talk?: ReturnType<typeof fakeTalkReviewer> } = {}) {
    const parts: string[] = [];
    let early: string[] = [];
    const math = opts.math ?? fakeMathReviewer();
    const talk = opts.talk ?? fakeTalkReviewer();
    const model = conversationalFake({ answer: () => out, ...(opts.stream ? { stream: { chunk: 7, beforeEnd: async () => { await settle(); early = [...parts]; } } } : {}) });
    const s = createTextSession({ callId: 'final5', package: pkg, tutor: true, clock: () => 10_000, reviewer: talk, mathReviewer: math, ...(opts.stream ? { onSayPart: (x: string) => parts.push(x) } : {}), model });
    await s.start();
    parts.length = 0;
    const said = await s.child(child);
    return { say: said.say, parts, early, math, talk, model };
  }

  /** The model's output with `say` written before `gate` (none) and `reading`: a model that ignores the order. */
  function sayFirst(say: string, reading: Record<string, unknown> = {}) {
    const r = reply(say, 'guide', { reading });
    return { kind: r.kind, say: r.say, act: r.act, step: r.step, level: r.level, reading: r.reading, draw: r.draw };
  }

  const DISCLOSURE = fixedOffers().find((x) => x.line === 'about.ai')!.texts[0];

  describe('F1: the reading comes before speech', () => {
    // 2026-11-15 (after final check 5): the small "gate" comes before "say" in place of the whole reading
    // (src/lib/maya-gate-field.test.ts holds the gate's own binding tests).
    it('the tutor output schema and prompt put the gate before "say"', () => {
      const keys = Object.keys(TUTOR_OUTPUT_SCHEMA.properties);
      expect(keys.indexOf('gate')).toBeLessThan(keys.indexOf('say'));
      expect(TUTOR_OUTPUT_SCHEMA.required.indexOf('gate')).toBeLessThan(TUTOR_OUTPUT_SCHEMA.required.indexOf('say'));
      expect(TUTOR_PROMPT).toMatch(/"gate" comes first/);
    });
    for (const child of ['Is a grown-up helping me with 52 minus 28?', 'Are you made of code? I need help with 52 minus 28.', 'Is a grown-up talking to me?', 'Are you a real person? What is 52 minus 28?'])
      for (const stream of [false, true]) {
        it(`a mixed identity turn puts the disclosure first: ${child}, stream=${stream}`, async () => {
          const r = await turn(SUB, reply('12 minus 8 is 4. What is 4 minus 2?', 'guide', { reading: { aboutMaya: 'identity' } }), child, { stream });
          expect(r.say.join(' ').startsWith(DISCLOSURE)).toBe(true);
          if (stream) { expect(r.early).toEqual([]); expect(r.parts.join(' ').startsWith(DISCLOSURE)).toBe(true); }
        });
      }
    it('a safety reading holds the whole stream', async () => {
      const r = await turn(SUB, reply('12 minus 8 is 4. What is 4 minus 2?', 'guide', { reading: { safety: 'concern' } }), 'Someone hurt me. What is 52 minus 28?', { stream: true });
      expect(r.early).toEqual([]);
    });
    it('a model that writes "say" before a complete gate streams nothing on that turn', async () => {
      const r = await turn(SUB, sayFirst('52 minus 28 isn\'t 36. What is 12 minus 8?'), "It's 36.", { stream: true });
      expect(r.early).toEqual([]);
      expect(r.say.join(' ')).toContain('What is 12 minus 8?');
    });
    it('control: a plain math turn with the gate first streams its first sentence before the model ends', async () => {
      const r = await turn(SUB, reply('52 minus 28 isn\'t 36. What is 12 minus 8?', 'guide'), "It's 36.", { stream: true });
      expect(r.early[0]).toBe("52 minus 28 isn't 36.");
    });
  });

  describe('F2: a message that names the whole answer gives it', () => {
    for (const say of ['Write 2 in the tens place and 4 in the ones place. What is the whole answer?', 'The answer has 2 tens and 4 ones. What is the whole answer?', 'Write four in the ones and two in the tens. What is the whole answer?'])
      for (const voice of [false, true]) {
        it(`every answer digit in its place is answer_given: ${say}, voice=${voice}`, async () => {
          const r = await family(SUB, [reply(say, 'guide'), reply('Bye for now.', 'close')], ['I need help.', "It's 24."], voice);
          expect(r.notes[0]?.transcript.some((t) => t.speaker === 'maya' && t.text === say)).toBe(true);
          expect(r.notes[0]?.facts.finished).toBe('answer_given');
        });
      }
    for (const voice of [false, true]) {
      it(`a leading question that names the answer word is answer_given, voice=${voice}`, async () => {
        const say = 'Do you agree the answer is true?';
        const r = await family(FIXTURES.CLAIM_TF as OperationPackage, [reply(say, 'guide'), reply('Bye for now.', 'close')], ['I need help.', 'I circle true.'], voice);
        expect(r.notes[0]?.transcript.some((t) => t.speaker === 'maya' && t.text === say)).toBe(true);
        expect(r.notes[0]?.facts.finished).toBe('answer_given');
      });
    }
    it('control: a choice of both words gives nothing away', async () => {
      const r = await family(FIXTURES.CLAIM_TF as OperationPackage, [reply('Is it true or false? What is 6 times 8?', 'guide'), reply('Bye for now.', 'close')], ['I need help.', 'I circle true.']);
      expect(r.notes[0]?.facts.finished).not.toBe('answer_given');
    });
    it('control: one answer digit, or an operand in places, gives nothing away', async () => {
      for (const say of ['Write 4 in the ones. What do we do in the tens?', '28 is 2 tens and 8 ones. What is 12 minus 8?']) {
        const r = await family(SUB, [reply(say, 'guide'), reply('Bye for now.', 'close')], ['I need help.', "It's 24."]);
        expect(r.notes[0]?.facts.finished, say).not.toBe('answer_given');
      }
    });
    it('control: the right answer said back after the child committed it gives nothing away', async () => {
      const r = await family(SUB, [reply('Yes, 52 minus 28 is 24. It has 2 tens and 4 ones. Bye for now.', 'close')], ["My answer is 24."]);
      expect(r.notes[0]?.facts.finished).not.toBe('answer_given');
    });
  });

  /** The test's stand-in for the review model: it follows the new math review prompt on the leads below. */
  const JUDGES_RIGHT = ['You solved it!', 'Your answer checks out.', 'You have the correct answer.', 'Perfect!', 'You nailed it!'];

  function promptFollowingMath(): AiClient & { inputs: MathReviewInput[] } {
    const inputs: MathReviewInput[] = [];
    return {
      model: 'local-math-contract',
      inputs,
      json: async (request: { system: string; content: { text?: string }[] }) => {
        const input = JSON.parse(request.content[0].text!) as MathReviewInput & { childAnswer?: { verdict: string } | null };
        inputs.push(input);
        // The prompt makes a judgment of the child's answer that code's verdict contradicts false.
        if (request.system.includes('"childAnswer"') && input.childAnswer?.verdict === 'wrong' && JUDGES_RIGHT.includes(input.sentence)) return { verdict: 'false', reason: "it calls the child's wrong answer right" };
        return { verdict: 'true', reason: 'all true' };
      },
    } as unknown as AiClient & { inputs: MathReviewInput[] };
  }

  describe('F3: the math review owns correctness judgments', () => {
    it('the review input carries code\'s verdict on the child\'s committed answer, and the prompt binds it', () => {
      const s = createSession({ callId: 'f3', package: SUB, conversational: true, tutor: true });
      s.turn = { at: 0, text: 'My answer is 36.' } as never;
      const input = mathReviewInput(s, 'Perfect!') as MathReviewInput & { childAnswer?: unknown };
      expect(input.childAnswer).toEqual({ value: 36, verdict: 'wrong', right: 24 });
      expect(MATH_REVIEW_SYSTEM).not.toContain('Do not judge whether Maya may call the child');
      expect(MATH_REVIEW_SYSTEM).toContain('"childAnswer"');
    });
    for (const lead of JUDGES_RIGHT) for (const stream of [false, true]) {
      it(`production adapters refuse "${lead}" after a wrong answer, stream=${stream}`, async () => {
        const client = promptFollowingMath();
        const talk = aiTalkReviewer({ model: 'local-safety', json: async () => ({ verdict: 'pass', rules: [], reason: '' }) } as unknown as AiClient);
        const parts: string[] = [];
        const s = createTextSession({ callId: 'f3', package: SUB, tutor: true, clock: () => 10_000, reviewer: talk, mathReviewer: aiMathReviewer(client), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
          model: conversationalFake({ answer: () => reply(`${lead} What is 12 minus 8?`, 'guide'), ...(stream ? { stream: { chunk: 7, beforeEnd: settle } } : {}) }) });
        await s.start(); parts.length = 0;
        const out = await s.child('My answer is 36.');
        expect(client.inputs.some((x) => x.sentence === lead)).toBe(true);
        expect(out.say.join(' ')).not.toContain(lead);
        expect(parts.join(' ')).not.toContain(lead);
      });
    }
    it('control: a true correction and plain encouragement after a wrong answer pass', async () => {
      const client = promptFollowingMath();
      const s = createTextSession({ callId: 'f3c', package: SUB, tutor: true, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: aiMathReviewer(client), model: conversationalFake({ answer: () => reply("Thanks for trying. 52 minus 28 isn't 36. What is 12 minus 8?", 'guide') }) });
      await s.start();
      const out = await s.child('My answer is 36.');
      expect(out.say.join(' ')).toContain('Thanks for trying.');
    });
  });

  describe('N1: once the easier example is in play, step texts are no code-only pass', () => {
    for (const stream of [false, true]) {
      it(`"Write 4 in the ones." for the easier example goes to the review, stream=${stream}`, async () => {
        const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'the easier example writes 5' }));
        const r = await turn(SUB, reply('Write 4 in the ones.', 'guide'), 'For the easier example, what do I write in the ones?', { stream, math });
        expect(math.requests.length).toBeGreaterThan(0);
        expect(r.say).not.toEqual(['Write 4 in the ones.']);
        expect(r.parts).not.toContain('Write 4 in the ones.');
      });
    }
    it('control: on the main question the step text passes on code alone', async () => {
      const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'control' }));
      const r = await turn(SUB, reply('Write 4 in the ones.', 'guide'), 'What do I write in the ones?', { math });
      expect(r.say).toEqual(['Write 4 in the ones.']);
      expect(math.requests).toHaveLength(0);
    });
  });

  describe('N2: every intermediate value must be a safe integer', () => {
    const line = '100000000 times 100000000 plus 1 minus 100000000 times 100000000 is 0.';
    for (const stream of [false, true]) {
      it(`an unsafe product is never read, stream=${stream}`, async () => {
        const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'it is 1' }));
        const r = await turn(SUB, reply(line, 'guide'), 'Help me please.', { stream, math });
        expect(math.requests.length).toBeGreaterThan(0);
        expect(r.say).not.toEqual([line]);
        expect(r.parts).not.toContain(line);
      });
    }
    it('the true version is not refused by code: it goes to the review', () => {
      const v = checkTutorSay(line.replace('is 0.', 'is 1.'), tutorStreamContext(SUB, 'Help me please.', 'none', new Set()));
      expect(v.ok).toBe(true);
      expect(codeAlone(line.replace('is 0.', 'is 1.'))).toBe(false);
    });
    it('control: a small true equation passes on code alone, a small false one is refused', () => {
      expect(codeAlone('12 minus 8 is 4.')).toBe(true);
      expect(checkTutorSay('12 minus 8 is 5.', tutorStreamContext(SUB, '', 'none', new Set())).ok).toBe(false);
    });
  });

  describe('N3: a place instruction is code-only only as an exact step text', () => {
    for (const stream of [false, true]) {
      it(`"Subtract the hundred thousands." goes to the review, stream=${stream}`, async () => {
        const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'no such place' }));
        const r = await turn(SUB, reply('Subtract the hundred thousands.', 'guide'), 'Help me with 52 minus 28.', { stream, math });
        expect(math.requests.length).toBeGreaterThan(0);
        expect(r.early).not.toContain('Subtract the hundred thousands.');
        expect(r.say).not.toEqual(['Subtract the hundred thousands.']);
      });
    }
    it('no instruction form passes on code alone; an exact step text does', () => {
      const exact = exactTexts(SUB);
      for (const x of ['Subtract the hundred thousands.', 'Subtract the ones.', 'Add the tens.']) expect(codeAlone(x, { op: 'subtract', exact }), x).toBe(false);
      expect(exact.has(exactKey('Write 4 in the ones.'))).toBe(true);
      expect(codeAlone('Write 4 in the ones.', { op: 'subtract', exact })).toBe(true);
    });
  });

  describe('N4: a malformed review answer is final', () => {
    for (const raw of [null, { verdict: 'TRUE', reason: 'invalid' }, { verdict: 'true', reason: 'all true', extra: 'invalid' }])
      for (const stream of [false, true]) {
        it(`${JSON.stringify(raw)} gets no retry, stream=${stream}`, async () => {
          let first = 0, retry = 0;
          const reviewer = aiMathReviewer({ model: 'fake-first', json: async () => { first++; return raw; } } as unknown as AiClient, undefined, { client: { model: 'fake-retry', json: async () => { retry++; return { verdict: 'true', reason: 'all true' }; } } as unknown as AiClient });
          const line = 'The ones digit should be negative.';
          const parts: string[] = [];
          const s = createTextSession({ callId: 'n4', package: SUB, tutor: true, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: reviewer, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}), model: conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) }) });
          await s.start(); parts.length = 0;
          const out = await s.child('Help me please.');
          expect(first).toBeGreaterThan(0);
          expect(retry).toBe(0);
          expect(out.say.join(' ')).not.toContain(line);
          expect(parts).not.toContain(line);
        });
      }
    it('control: a well-formed "unsure" still goes to the retry', async () => {
      let retry = 0;
      const reviewer = aiMathReviewer({ model: 'fake-first', json: async () => ({ verdict: 'unsure', reason: 'cannot tell' }) } as unknown as AiClient, undefined, { client: { model: 'fake-retry', json: async () => { retry++; return { verdict: 'true', reason: 'all true' }; } } as unknown as AiClient });
      const s = createTextSession({ callId: 'n4c', package: SUB, tutor: true, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: reviewer, model: conversationalFake({ answer: () => reply('Let us start with the ones.', 'guide') }) });
      await s.start();
      const out = await s.child('Help me please.');
      expect(retry).toBeGreaterThan(0);
      expect(out.say.join(' ')).toContain('Let us start with the ones.');
    });
  });

  describe('N5: ", and" keeps its clause boundary', () => {
    const line = '7 ones and 9 ones make 16 ones, and 10 ones can be traded for 1 ten.';
    it('the true compound trade is not refused by code: it goes to the review', async () => {
      expect(checkTutorSay(line, tutorStreamContext(ADD, 'Help me please.', 'none', new Set())).ok).toBe(true);
      const math = fakeMathReviewer();
      const r = await turn(ADD, reply(line, 'guide'), 'Help me please.', { math });
      expect(r.say.join(' ')).toContain(line);
      expect(math.requests.some((x) => x.sentence === line)).toBe(true);
    });
    it('control: a false sum is still refused, and the first clause alone still passes', () => {
      expect(checkTutorSay('7 ones and 9 ones make 26 ones.', tutorStreamContext(ADD, '', 'none', new Set())).ok).toBe(false);
      expect(checkTutorSay('7 ones and 9 ones make 16 ones.', tutorStreamContext(ADD, '', 'none', new Set())).ok).toBe(true);
    });
  });

  describe('N6: the easier example reaches the review when no tutor kind fits it', () => {
    function multiply(easy: Operation): OperationPackage {
      const operation: Operation = { kind: 'multiply', operands: [6, 440] };
      return { ...SUB, id: 'n6', text: '6 × 440 = ?', operation, answer: { value: operationResult(operation), accepted: [], unit: null }, steps: workedSteps(operation), wrongAnswers: [{ value: { type: 'number', value: 999 }, cause: 'careless', description: 'A made-up error.', step: null }], easierExample: { text: `${easy.operands[0]} × ${easy.operands[1]} = ?`, operation: easy, answer: operationResult(easy), steps: workedSteps(easy) } } as OperationPackage;
    }
    it('an easier example of 0 × 1 keeps its question, steps and answer', () => {
      const s = createSession({ callId: 'n6', package: multiply({ kind: 'multiply', operands: [0, 1] }), conversational: true, tutor: true });
      expect(s.tutor).toBeTruthy();
      const input = mathReviewInput(s, 'The easier example makes zero.');
      expect(input.easierExample).not.toBeNull();
      expect(input.easierExample!.question).toBe('0 × 1 = ?');
      expect(input.easierExample!.answer).toBe(0);
      expect(input.easierExample!.steps.length).toBeGreaterThan(0);
    });
    it('control: an easier example a tutor kind fits keeps its step states', () => {
      const s = createSession({ callId: 'n6c', package: SUB, conversational: true, tutor: true });
      const input = mathReviewInput(s, 'Write 5 in the ones.');
      expect(input.easierExample?.question).toBe('42 - 7 = ?');
      expect(input.easierExample?.stepStates?.length).toBeGreaterThan(0);
    });
  });
});

describe("call math regressions", () => {
  const P = '11111111-1111-4111-8111-111111111111', C = '22222222-2222-4222-8222-222222222222';

  const W = '44444444-4444-4444-8444-444444444444';

  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };

  /** The review input's verdict for one child turn. */
  function verdictOf(child: string) {
    const s = createSession({ callId: 'final6', package: SUB, conversational: true, tutor: true });
    s.turn = { at: 0, text: child } as never;
    return mathReviewInput(s, 'You solved it!').childAnswer;
  }

  /** A local review client that follows code's verdict, as the prompt tells it: it calls a judgment of the answer false unless the verdict is "right". */
  function verdictFollowing(): AiClient & { inputs: MathReviewInput[] } {
    const inputs: MathReviewInput[] = [];
    return {
      model: 'local-verdict-contract',
      inputs,
      json: async (request: { content: { text?: string }[] }) => {
        const input = JSON.parse(request.content[0].text!) as MathReviewInput;
        inputs.push(input);
        if (['You solved it!', 'Perfect!'].includes(input.sentence)) return input.childAnswer?.verdict === 'right' ? { verdict: 'true', reason: 'all true' } : { verdict: 'false', reason: 'code does not credit the answer' };
        return { verdict: 'true', reason: 'all true' };
      },
    } as unknown as AiClient & { inputs: MathReviewInput[] };
  }

  describe("N3 / F3: the review reads code's validated verdict", () => {
    it('a false equation is "wrong" before any number verdict', () => {
      expect(childSaysFalse('12 minus 8 is 24.')).toBe(true);
      expect(verdictOf('12 minus 8 is 24.')?.verdict).toBe('wrong');
      expect(verdictOf('I got 24, because 12 minus 8 is 24.')?.verdict).toBe('wrong');
    });
    it("another speaker's number is not the child's answer", () => {
      expect(verdictOf('My answer is 36. My friend said 24.')).toEqual({ value: 36, verdict: 'wrong', right: 24 });
      expect(verdictOf('My friend said 24. My answer is 36.')).toEqual({ value: 36, verdict: 'wrong', right: 24 });
      expect(verdictOf('My answer is 36. 12 minus 8 is 4.')?.verdict).toBe('wrong');
    });
    it('a number code cannot bind to the child is "unknown", never "right"', () => {
      expect(verdictOf('My friend said 24.')?.verdict).toBe('unknown');
      expect(verdictOf('The book says 24.')?.verdict).toBe('unknown');
      expect(MATH_REVIEW_SYSTEM).toContain('"unknown"');
    });
    it('controls: the right committed answer is "right", a wrong one "wrong", no number null', () => {
      expect(verdictOf('My answer is 24.')).toEqual({ value: 24, verdict: 'right', right: 24 });
      expect(verdictOf('24')).toEqual({ value: 24, verdict: 'right', right: 24 });
      expect(verdictOf('My answer is 36.')).toEqual({ value: 36, verdict: 'wrong', right: 24 });
      expect(verdictOf('My final answer is 4.')?.verdict).toBe('wrong');
      expect(verdictOf('Help me please.')).toBeNull();
    });
    for (const child of ['12 minus 8 is 24.', 'My answer is 36. My friend said 24.']) for (const lead of ['Perfect!', 'You solved it!']) for (const stream of [false, true]) {
      it(`"${lead}" never reaches the child after "${child}", stream=${stream}`, async () => {
        const client = verdictFollowing();
        const parts: string[] = [];
        const s = createTextSession({ callId: 'final6', package: SUB, tutor: true, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: aiMathReviewer(client), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
          model: conversationalFake({ answer: () => reply(`${lead} What is 12 minus 8?`, 'guide'), ...(stream ? { stream: { chunk: 7, beforeEnd: settle } } : {}) }) });
        await s.start(); parts.length = 0;
        const out = await s.child(child);
        expect(client.inputs.length).toBeGreaterThan(0);
        expect(out.say.join(' ')).not.toContain(lead);
        expect(parts.join(' ')).not.toContain(lead);
      });
    }
    it('control: "Perfect!" reaches the child after the right answer', async () => {
      const client = verdictFollowing();
      const s = createTextSession({ callId: 'final6', package: SUB, tutor: true, clock: () => 10_000, reviewer: fakeTalkReviewer(), mathReviewer: aiMathReviewer(client),
        model: conversationalFake({ answer: () => reply('Perfect! 52 minus 28 is 24.', 'guide') }) });
      await s.start();
      const out = await s.child('My answer is 24.');
      expect(out.say.join(' ')).toContain('Perfect!');
    });
  });

  /** A family call (chat or voice) through the public call module, with in-memory stores and the note writer. */
  async function family(pkg: OperationPackage, script: unknown[], childTurns: string[], voice: boolean) {
    let now = Date.UTC(2026, 10, 15), id = 0;
    const clock = () => now;
    const store = memoryCallStore({ testFamilies: [], clock });
    const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
    const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
    const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: 'Ava', formerNames: [] }), clock });
    const model = conversationalFake({ id: 'fake-v3', answer: (_: unknown, n: number) => script[Math.min(n, script.length - 1)] as never });
    const calls = mayaCalls({ tutorFamilies: true, store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(), events: learningEvents(events), rebuild: async () => true, model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer(), isTestFamily: async () => false, canChat: async () => true, canCallVoice: async () => true, note: async (x) => noteStep(await writer.write(x), x.call.id), alerts: { send: async () => {}, list: async () => [] }, clock, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`, seed: () => 3 });
    const input = { kind: voice ? 'family' as const : 'chat' as const, parentId: P, childId: C, childName: 'Ava', grade: 5, startedBy: P, package: { ...pkg, ref: { source: 'workbook' as const, workbookId: W, page: 1, question: 1 } } };
    const start = voice ? await calls.startVoice(input) : await calls.start(input);
    if (!start.ok) throw Error(start.error);
    let current = start;
    if (voice) {
      const open = await calls.openVoice(start.view.id, { speechToText: 'fake', voice: 'fake' }, 'Ava');
      if (!open.ok) throw Error(open.error);
      await open.call.start();
      for (const text of childTurns) { now += 5000; await open.call.child(text); await open.call.settled(); }
      await open.call.end({ reason: 'child_stopped' });
    } else {
      for (const text of childTurns) { now += 5000; const r = await calls.input(current.view.id, current.view.revision, { type: 'child', text }, 'Ava'); if (!r.ok) throw Error(r.error); current = r; }
      if ((await store.get(start.view.id))?.status !== 'ended') { const r = await calls.input(current.view.id, current.view.revision, { type: 'end' }, 'Ava'); if (!r.ok) throw Error(r.error); }
    }
    return { notes: notes.rows() };
  }

  describe('F4: an answer word that rejects the other choice gives the answer', () => {
    for (const voice of [false, true]) {
      for (const say of ['The answer is true, not false.', 'Circle true instead of false.', 'The answer is true. It is not false.']) {
        it(`"${say}" is recorded as the answer given, voice=${voice}`, async () => {
          const r = await family(FIXTURES.CLAIM_TF as OperationPackage, [reply(say, 'guide'), reply('Bye for now.', 'close')], ['I need help.', 'I circle true.'], voice);
          expect(r.notes[0]?.transcript.some((t) => t.speaker === 'maya' && t.text === say)).toBe(true);
          expect(r.notes[0]?.facts.finished).toBe('answer_given');
        });
      }
      for (const say of ['Is it true or false?', 'Is it true, or is it false?']) {
        it(`control: the open choice "${say}" gives nothing, voice=${voice}`, async () => {
          const r = await family(FIXTURES.CLAIM_TF as OperationPackage, [reply(say, 'guide'), reply('Bye for now.', 'close')], ['I need help.', 'I circle true.'], voice);
          expect(r.notes[0]?.transcript.some((t) => t.speaker === 'maya' && t.text === say)).toBe(true);
          expect(r.notes[0]?.facts.finished).not.toBe('answer_given');
        });
      }
    }
  });
});

describe("call tutor regressions (set 2)", () => {
  const P = '11111111-1111-4111-8111-111111111111';

  const C = '22222222-2222-4222-8222-222222222222';

  const W = '44444444-4444-4444-8444-444444444444';

  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  /** A stored story question as the tutor reads it (made-up numbers): "How many apples in 3 bags?", 18 apples. */
  function apples(): OperationPackage {
    const slots = [{ name: 'm', value: { int: '6' }, domain: { max: 7, min: 2 } }, { name: 'p', value: { int: '3' }, domain: { max: 6, min: 1 } }];
    const raw = {
      id: 'final10:apples', ref: { page: 2, source: 'workbook', question: 1, workbookId: W },
      item: {
        error: null, format: 'tick-and-number', scorable: true, parentChecked: false,
        checks: [
          { kind: 'template', region: 'answer', source: { check: null, slots, answer: 'm * p', values: null, derived: [] } },
          { kind: 'template-choice', region: 'operation', source: { check: null, slots, answer: "'×'", values: null, derived: [] } },
        ],
        regions: [
          { id: 'operation', kind: 'choice', mark: 'tick', label: 'Tick the operation', answer: '×', choices: ['+', '−', '×', '÷'] },
          { id: 'answer', kind: 'box', label: 'Write the answer', answer: { type: 'number', value: 18 } },
          { id: 'work', kind: 'work', label: 'Show your work' },
        ],
      },
      text: 'Lena puts 6 apples in each bag. How many apples in 3 bags?', level: 16, skill: { skills: ['4.9-table-pattern'], standard: '4.9' },
      steps: [], answer: null, operation: null, difficulty: 1, templateId: '4.9-table-pattern#3.2:story', textSource: 'code', wrongAnswers: [], easierExample: null,
    };
    const s = createSession({ callId: 'stored', package: teachingPackage(raw) as never, tutor: true, conversational: true });
    if (!s.tutor || !s.package) throw new Error('not a tutor question');
    return s.package;
  }

  /** The production review adapter with a local client: a goodbye is true; praise is true only on code's "right" verdict. */
  const review = () => aiMathReviewer({
    model: 'local-contract',
    json: async (r: { content: { text: string }[] }) => {
      const i = JSON.parse(r.content[0].text);
      const ok = i.sentence === 'Bye for now.' || !/checks out|perfect|right|solved/i.test(i.sentence) || i.childAnswer?.verdict === 'right';
      return { verdict: ok ? 'true' : 'false', reason: 'local review contract' };
    },
  } as never);

  /** One family call (chat or voice) with the given model and child turns; the saved record, events and note. */
  async function family(pkg: OperationPackage, model: unknown, childTurns: string[], voice: boolean) {
    let now = Date.UTC(2026, 10, 15);
    let id = 0;
    const clock = () => now;
    const store = memoryCallStore({ testFamilies: [], clock });
    const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
    const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
    const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: 'Ava', formerNames: [] }), clock });
    const spoken: { child: string; sentence: string }[] = [];
    const calls = mayaCalls({
      mathReviewer: () => review(), tutorFamilies: true, store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
      events: learningEvents(events), rebuild: async () => true, model: () => model as never, reviewer: () => fakeTalkReviewer(),
      isTestFamily: async () => false, canChat: async () => true, canCallVoice: async () => true, note: async (x: never) => noteStep(await writer.write(x), (x as { call: { id: string } }).call.id),
      alerts: { send: async () => {}, list: async () => [] }, clock, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`, seed: () => 3,
    } as never);
    const input = { kind: voice ? 'family' as const : 'chat' as const, parentId: P, childId: C, childName: 'Ava', grade: 5, startedBy: P, package: { ...pkg, ref: { source: 'workbook' as const, workbookId: W, page: 1, question: 1 } } };
    const start = voice ? await calls.startVoice(input as never) : await calls.start(input as never);
    if (!start.ok) throw Error(start.error);
    let current = start;
    if (voice) {
      const open = await calls.openVoice(start.view.id, { speechToText: 'fake', voice: 'fake' } as never, 'Ava');
      if (!open.ok) throw Error(open.error);
      await open.call.start();
      for (const text of childTurns) {
        now += 5000;
        await open.call.child(text, {}, { part: (sentence: string) => spoken.push({ child: text, sentence }) } as never);
        await open.call.settled();
      }
      await open.call.end({ reason: 'child_stopped' });
    } else {
      for (const text of childTurns) {
        now += 5000;
        const r = await calls.input(current.view.id, current.view.revision, { type: 'child', text }, 'Ava');
        if (!r.ok) throw Error(r.error);
        current = r;
      }
      if ((await store.get(start.view.id))?.status !== 'ended') {
        const r = await calls.input(current.view.id, current.view.revision, { type: 'end' }, 'Ava');
        if (!r.ok) throw Error(r.error);
      }
    }
    return { record: await store.get(start.view.id), events: await events.range(C, { from: '2026-11-14', to: '2026-11-16' }), notes: notes.rows(), spoken };
  }

  const goodbye = () => conversationalFake({ id: 'fake-v3', answer: () => reply('Bye for now.', 'close') });

  const solved = (r: Awaited<ReturnType<typeof family>>) => r.record?.outcome?.reason === 'solved';

  const rightEvent = (r: Awaited<ReturnType<typeof family>>) => r.events.some((e) => e.result === 'right' || e.result === 'right_with_help');

  describe('F1: a word after the answer that is not the question\'s unit blocks final credit', () => {
    for (const voice of [false, true]) {
      for (const child of ['My answer is 18, bags.', 'My answer is 18, in bags.', 'My answer is 18. Bags.', 'My answer is 18 bags.']) {
        // "18 bags." with no comma was already refused on 484f5b9bc: a guard, not a binding case.
        it(`${child === 'My answer is 18 bags.' ? 'guard' : 'binding'}: "${child}" (${voice ? 'voice' : 'chat'})`, async () => {
          const r = await family(apples(), goodbye(), [child], voice);
          expect(solved(r)).toBe(false);
          expect(rightEvent(r)).toBe(false);
          expect(r.notes[0]?.facts.finished).not.toBe('on_own');
        });
      }
      for (const child of ['My answer is 18 apples.', 'My answer is 18, apples.', 'My answer is 18.', '18', '18 apples', '6 times 3 is 18.']) {
        it(`control: "${child}" still solves (${voice ? 'voice' : 'chat'})`, async () => {
          const r = await family(apples(), goodbye(), [child], voice);
          expect(solved(r)).toBe(true);
        });
      }
    }
  });

  describe('F2: a number inside an expression is no final answer', () => {
    for (const voice of [false, true]) {
      for (const child of ['My answer is 24 plus 1.', 'My answer is 24 minus 1.', 'My answer is 24 times 2.', 'My answer is 24 divided by 2.', 'My answer is 24 plus.', 'My answer is 1 plus 24.', 'My answer is 24, plus 1.', 'My answer is 24. Plus 1.']) {
        // "1 plus 24" and "24. Plus 1." were already refused on 484f5b9bc: guards, not binding cases.
        it(`${child === 'My answer is 1 plus 24.' || child === 'My answer is 24. Plus 1.' ? 'guard' : 'binding'}: "${child}" (${voice ? 'voice' : 'chat'})`, async () => {
          const r = await family(SUB, goodbye(), [child], voice);
          expect(solved(r)).toBe(false);
          expect(rightEvent(r)).toBe(false);
          expect(r.notes[0]?.facts.finished).not.toBe('on_own');
        });
      }
      for (const child of ['My answer is 24.', '24', 'Twenty-four.', '52 minus 28 is 24.', '24 is my answer.', 'Yes, it is 24.']) {
        it(`control: "${child}" still solves (${voice ? 'voice' : 'chat'})`, async () => {
          const r = await family(SUB, goodbye(), [child], voice);
          expect(solved(r)).toBe(true);
        });
      }
    }
  });

  describe('F3: a streamed answer keeps its help record when a later reading redirects the turn', () => {
    const settle = async () => { for (let k = 0; k < 150; k++) await Promise.resolve(); };
    for (const kind of ['identity', 'scope', 'normal'] as const) {
      it(`${kind === 'normal' ? 'control' : 'binding'}: streamed answer before ${kind}`, async () => {
        let n = 0;
        const model = {
          id: 'raw-stream', output: 3, promptVersion: 'local',
          propose: async (input: { allowedActs?: string[] }, _signal: AbortSignal, onText?: (soFar: string) => void) => {
            if (n++ === 0) {
              const out = reply('52 minus 28 is 24.', 'guide', { gate: 'none', reading: kind === 'identity' ? { aboutMaya: 'identity' } : kind === 'scope' ? { outsideScope: 'outside_work' } : {} } as never);
              const raw = JSON.stringify(out);
              onText?.(raw.slice(0, raw.indexOf(',"act"')));
              await settle();
              onText?.(raw);
              await settle();
              return out;
            }
            return input.allowedActs?.includes('redirect') ? reply('What is 4 minus 2?', 'redirect') : reply('Bye for now.', 'close');
          },
        };
        const r = await family(SUB, model, ['12 minus 8 is 4.', 'My answer is 24.'], true);
        // The answer went out to the child before the redirect.
        expect(r.spoken.some((s) => s.child === '12 minus 8 is 4.' && s.sentence === '52 minus 28 is 24.')).toBe(true);
        expect(r.record?.outcome?.assistance).toBe('answer_given');
        expect(r.notes[0]?.facts.help).toBe('answer_given');
        expect(r.notes[0]?.sentences.join(' ')).not.toContain('finished it with no help');
      });
    }
  });
});

describe("call tutor regressions (set 3)", () => {
  const P = '11111111-1111-4111-8111-111111111111';

  const C = '22222222-2222-4222-8222-222222222222';

  const W = '44444444-4444-4444-8444-444444444444';

  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  /** The production review adapter with a local client: a goodbye is true; praise is true only on code's "right" verdict. */
  const review = () => aiMathReviewer({
    model: 'local-contract',
    json: async (r: { content: { text: string }[] }) => {
      const i = JSON.parse(r.content[0].text);
      const ok = i.sentence === 'Bye for now.' || !/checks out|perfect|right|solved/i.test(i.sentence) || i.childAnswer?.verdict === 'right';
      return { verdict: ok ? 'true' : 'false', reason: 'local review contract' };
    },
  } as never);

  /** One family call (chat or voice) with the given model and child turns; the saved record, events and note. */
  async function family(pkg: OperationPackage, model: unknown, childTurns: string[], voice: boolean, math: () => unknown = review) {
    let now = Date.UTC(2026, 10, 15);
    let id = 0;
    const clock = () => now;
    const store = memoryCallStore({ testFamilies: [], clock });
    const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
    const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
    const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: 'Ava', formerNames: [] }), clock });
    const spoken: { child: string; sentence: string }[] = [];
    const calls = mayaCalls({
      mathReviewer: () => math() as never, tutorFamilies: true, store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
      events: learningEvents(events), rebuild: async () => true, model: () => model as never, reviewer: () => fakeTalkReviewer(),
      isTestFamily: async () => false, canChat: async () => true, canCallVoice: async () => true, note: async (x: never) => noteStep(await writer.write(x), (x as { call: { id: string } }).call.id),
      alerts: { send: async () => {}, list: async () => [] }, clock, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`, seed: () => 3,
    } as never);
    const input = { kind: voice ? 'family' as const : 'chat' as const, parentId: P, childId: C, childName: 'Ava', grade: 5, startedBy: P, package: { ...pkg, ref: { source: 'workbook' as const, workbookId: W, page: 1, question: 1 } } };
    const start = voice ? await calls.startVoice(input as never) : await calls.start(input as never);
    if (!start.ok) throw Error(start.error);
    let current = start;
    if (voice) {
      const open = await calls.openVoice(start.view.id, { speechToText: 'fake', voice: 'fake' } as never, 'Ava');
      if (!open.ok) throw Error(open.error);
      await open.call.start();
      for (const text of childTurns) {
        now += 5000;
        await open.call.child(text, {}, { part: (sentence: string) => spoken.push({ child: text, sentence }) } as never);
        await open.call.settled();
      }
      await open.call.end({ reason: 'child_stopped' });
    } else {
      for (const text of childTurns) {
        now += 5000;
        const r = await calls.input(current.view.id, current.view.revision, { type: 'child', text }, 'Ava');
        if (!r.ok) throw Error(r.error);
        current = r;
      }
      if ((await store.get(start.view.id))?.status !== 'ended') {
        const r = await calls.input(current.view.id, current.view.revision, { type: 'end' }, 'Ava');
        if (!r.ok) throw Error(r.error);
      }
    }
    return { record: await store.get(start.view.id), events: await events.range(C, { from: '2026-11-14', to: '2026-11-16' }), notes: notes.rows(), spoken };
  }

  const settle = async () => { for (let k = 0; k < 150; k++) await Promise.resolve(); };

  describe('F1: one whole-phrase reader for every credited value', () => {
    for (const voice of [false, true]) {
      const mode = voice ? 'voice' : 'chat';
      for (const child of ['I got 4 plus 1.', 'I got 4, with a negative sign.', 'I got 4 plus.', 'I got 4, plus 1.']) {
        it(`binding: "${child}" on the ones step gets no credit and no praise (${mode})`, async () => {
          const r = await family(SUB, conversationalFake({ id: 'fake-v3', answer: () => reply('Perfect!', 'guide') }), [child], voice);
          const transcript = r.notes[0]?.transcript.map((t: { text: string }) => t.text).join(' ') ?? '';
          expect(transcript).not.toContain('Perfect!');
        });
      }
      for (const child of ['I got 4.', 'I got 4 in the ones.', '12 minus 8 is 4.', '12 minus 8 is 4, and 4 minus 2 is 2.']) {
        it(`control: "${child}" keeps its step credit and praise (${mode})`, async () => {
          const r = await family(SUB, conversationalFake({ id: 'fake-v3', answer: () => reply('Perfect!', 'guide') }), [child], voice);
          const transcript = r.notes[0]?.transcript.map((t: { text: string }) => t.text).join(' ') ?? '';
          expect(transcript).toContain('Perfect!');
        });
      }
    }
  });

  describe('F2: emitted help is applied before any routing builds an outcome', () => {
    // The child asks for help (a hint is recorded), then says the ones step; the model streams the whole answer, and its
    // later reading routes the turn: a stop, a safety concern, identity, scope, or no reading (a normal turn); or the
    // model fails after the stream.
    for (const late of ['stop', 'safety', 'error', 'identity', 'scope', 'normal'] as const) {
      it(`${['identity', 'scope', 'normal'].includes(late) ? 'control' : late === 'stop' ? 'binding' : 'guard'}: streamed answer, then ${late}`, async () => {
        let n = 0;
        const model = {
          id: 'raw-stream', output: 3, promptVersion: 'local',
          propose: async (input: { allowedActs?: string[] }, _signal: AbortSignal, onText?: (soFar: string) => void) => {
            if (n++ === 0) return reply('What is 12 minus 8?', 'guide');
            if (n === 2) {
              const reading = late === 'stop' ? { stop: true } : late === 'safety' ? { safety: 'concern' } : late === 'identity' ? { aboutMaya: 'identity' } : late === 'scope' ? { outsideScope: 'outside_work' } : {};
              const out = reply('52 minus 28 is 24.', 'guide', { gate: 'none', reading } as never);
              const raw = JSON.stringify(out);
              onText?.(raw.slice(0, raw.indexOf(',"act"')));
              await settle();
              if (late === 'error') throw new Error('the model failed after the stream');
              onText?.(raw);
              await settle();
              return out;
            }
            return input.allowedActs?.includes('redirect') ? reply('What is 4 minus 2?', 'redirect') : reply('Bye for now.', 'close');
          },
        };
        const r = await family(SUB, model, ['I need help.', '12 minus 8 is 4.'], true);
        expect(r.spoken.some((s) => s.sentence === '52 minus 28 is 24.')).toBe(true);
        expect(r.record?.outcome?.assistance).toBe('answer_given');
        expect(r.notes[0]?.facts.help ?? 'answer_given').toBe('answer_given');
        expect(r.notes[0]?.sentences.join(' ') ?? '').not.toContain('small hint');
      });
    }
  });
});

describe("call tutor regressions (set 4)", () => {
  const P = '11111111-1111-4111-8111-111111111111';

  const C = '22222222-2222-4222-8222-222222222222';

  const W = '44444444-4444-4444-8444-444444444444';

  const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;

  type Voice = { child: (text: string, options?: object, say?: { part: (s: string) => void }) => Promise<unknown>; settled: () => Promise<void>; end: (how: object) => Promise<void>; limit: () => Promise<void> };

  /** One family call. `drive` runs the voice call itself (with `advance` for the clock); else `childTurns` are said in order. */
  async function family(model: unknown, childTurns: string[], voice: boolean, drive?: (call: Voice, advance: (ms?: number) => void) => Promise<void>) {
    let now = Date.UTC(2026, 10, 15);
    let id = 0;
    const clock = () => now;
    const store = memoryCallStore({ testFamilies: [], clock });
    const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
    const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
    const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: 'Ava', formerNames: [] }), clock });
    const spoken: string[] = [];
    const calls = mayaCalls({
      mathReviewer: () => fakeMathReviewer(), tutorFamilies: true, store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
      events: learningEvents(events), rebuild: async () => true, model: () => model as never, reviewer: () => fakeTalkReviewer(),
      isTestFamily: async () => false, canChat: async () => true, canCallVoice: async () => true, note: async (x: never) => noteStep(await writer.write(x), (x as { call: { id: string } }).call.id),
      alerts: { send: async () => {}, list: async () => [] }, clock, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`, seed: () => 3,
    } as never);
    const input = { kind: voice ? 'family' : 'chat', parentId: P, childId: C, childName: 'Ava', grade: 5, startedBy: P, package: { ...SUB, ref: { source: 'workbook', workbookId: W, page: 1, question: 1 } } };
    const start = voice ? await calls.startVoice(input as never) : await calls.start(input as never);
    if (!start.ok) throw Error(start.error);
    let current = start;
    if (voice) {
      const open = await calls.openVoice(start.view.id, { speechToText: 'fake', voice: 'fake' } as never, 'Ava');
      if (!open.ok) throw Error(open.error);
      await open.call.start();
      const call = open.call as unknown as Voice;
      if (drive) await drive(call, (ms = 5000) => { now += ms; });
      for (const text of childTurns) {
        now += 5000;
        await call.child(text, {}, { part: (s: string) => spoken.push(s) });
        await call.settled();
      }
      await call.end({ reason: 'child_stopped' });
      await call.settled();
    } else {
      for (const text of childTurns) {
        now += 5000;
        const r = await calls.input(current.view.id, current.view.revision, { type: 'child', text }, 'Ava');
        if (!r.ok) throw Error(r.error);
        current = r;
      }
      if ((await store.get(start.view.id))?.status !== 'ended') {
        const r = await calls.input(current.view.id, current.view.revision, { type: 'end' }, 'Ava');
        if (!r.ok) throw Error(r.error);
      }
    }
    return { record: await store.get(start.view.id), events: await events.range(C, { from: '2026-11-14', to: '2026-11-16' }), notes: notes.rows(), spoken };
  }

  const script = (...replies: ReturnType<typeof reply>[]) => conversationalFake({ id: 'fake-v3', answer: (_: unknown, n: number) => replies[Math.min(n, replies.length - 1)] } as never);

  const finished = (r: Awaited<ReturnType<typeof family>>) => (r.notes[0]?.sentences.join(' ') ?? '').includes('finished');

  describe('F1: a new answer code cannot read in full clears a standing success', () => {
    for (const voice of [false, true]) {
      const mode = voice ? 'voice' : 'chat';
      for (const child of ['My answer is 24 plus 1.', 'My answer is 24 minus 1.', 'My answer is 24 plus.', 'My answer is 24, with a negative sign.', 'My answer is 24 tens.', 'My answer is 24 jars.']) {
        it(`binding: "${child}" after "My answer is 24." (${mode})`, async () => {
          const r = await family(script(reply('What did you write?', 'guide'), reply('Bye for now.', 'close')), ['My answer is 24.', child], voice);
          expect(r.record?.outcome?.reason).not.toBe('solved');
          expect(finished(r)).toBe(false);
        });
      }
      for (const child of ['My answer is 36.', 'I take back 24.', 'I erase 24.']) {
        it(`guard: "${child}" clears it (${mode})`, async () => {
          const r = await family(script(reply('What did you write?', 'guide'), reply('Bye for now.', 'close')), ['My answer is 24.', child], voice);
          expect(r.record?.outcome?.reason).not.toBe('solved');
        });
      }
      for (const child of ['My answer is 24.', '12 minus 8 is 4.']) {
        it(`control: "${child}" keeps it (${mode})`, async () => {
          const r = await family(script(reply('What did you write?', 'guide'), reply('Bye for now.', 'close')), ['My answer is 24.', child], voice);
          expect(r.record?.outcome?.reason).toBe('solved');
        });
      }
    }
  });

  describe('F2: a priority route never skips the answer state', () => {
    for (const voice of [false, true]) {
      for (const route of ['identity', 'stop', 'scope', 'safety', 'normal'] as const) {
        it(`${route === 'normal' ? 'control' : 'binding'}: "My answer is 36." before ${route} (${voice ? 'voice' : 'chat'})`, async () => {
          const reading = route === 'identity' ? { aboutMaya: 'identity' } : route === 'stop' ? { stop: true } : route === 'scope' ? { outsideScope: 'outside_work' } : route === 'safety' ? { safety: 'concern' } : {};
          const child = route === 'identity' ? 'My answer is 36. Are you a person?' : 'My answer is 36.';
          const r = await family(script(reply('What did you write?', 'guide'), reply('Bye for now.', 'close', { reading } as never)), ['My answer is 24.', child], voice);
          expect(r.events[0]?.result).not.toBe('right');
          expect(finished(r)).toBe(false);
        });
      }
    }
  });

  const settle = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };

  /**
   * A model whose second answer streams "52 minus 28 is 24." and then waits until released (or until its signal aborts).
   * `then`: the reading of the released answer.
   */
  function heldStream(then: Record<string, unknown> = {}, fail = false) {
    let n = 0;
    let said!: () => void;
    const emitted = new Promise<void>((r) => { said = r; });
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const model = {
      id: 'held-stream', output: 3, promptVersion: 'local',
      propose: async (input: { allowedActs?: string[] }, signal: AbortSignal, onText?: (soFar: string) => void) => {
        if (n++ === 0) return reply('What is 12 minus 8?', 'guide');
        if (n === 2) {
          const out = reply('52 minus 28 is 24.', 'guide', { gate: 'none', reading: then } as never);
          const raw = JSON.stringify(out);
          onText?.(raw.slice(0, raw.indexOf(',"act"')));
          signal.addEventListener('abort', release, { once: true });
          await held;
          if (fail) throw new Error('the model failed after the stream');
          onText?.(raw);
          return out;
        }
        return input.allowedActs?.includes('redirect') ? reply('What is 4 minus 2?', 'redirect') : reply('What is 4 minus 2?', 'guide');
      },
    };
    return { model, emitted, said: () => said(), release: () => release() };
  }

  describe('F3: the help ledger holds on every terminal path', () => {
    const paths = ['hang-up', 'deadline', 'replacement turn', 'stop', 'safety', 'disclosure', 'error', 'normal'] as const;
    for (const path of paths) {
      const binding = ['hang-up', 'deadline', 'replacement turn'].includes(path);
      it(`${binding ? 'binding' : 'guard'}: streamed answer, then ${path}`, async () => {
        const reading = path === 'stop' ? { stop: true } : path === 'safety' ? { safety: 'concern' } : path === 'disclosure' ? { aboutMaya: 'identity' } : {};
        const h = heldStream(reading, path === 'error');
        const spoken: string[] = [];
        const r = await family(h.model, [], true, async (call, advance) => {
          advance();
          await call.child('I need help.');
          await call.settled();
          advance();
          const running = call.child('12 minus 8 is 4.', {}, { part: (s: string) => { spoken.push(s); if (s === '52 minus 28 is 24.') h.said(); } });
          await h.emitted;
          await settle();
          if (path === 'hang-up') await call.end({ reason: 'child_stopped' });
          else if (path === 'deadline') { advance(700000); await call.limit(); }
          else if (path === 'replacement turn') { await call.child('My answer is 24.'); await call.settled(); }
          else h.release();
          await running;
          await call.settled();
        });
        expect(spoken).toContain('52 minus 28 is 24.');
        expect(r.record?.outcome?.assistance).toBe('answer_given');
        expect(r.notes[0]?.facts.help ?? 'answer_given').toBe('answer_given');
        expect(r.notes[0]?.sentences.join(' ') ?? '').not.toContain('small hint');
        expect(finished(r) && /no help/.test(r.notes[0]?.sentences.join(' ') ?? '')).toBe(false);
      });
    }
  });
});
