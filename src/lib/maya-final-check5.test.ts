// Final check 5 of the tutor core (2026-11-15, head dd1aafb1e). Part 1: the reading before speech (F1), the answer given
// by place digits or a leading word (F2), the math review owns correctness judgments (F3). Part 2: the easier example in
// play without its numbers (N1), an unsafe intermediate value (N2), a place instruction that is no exact step (N3), a
// malformed review answer and the retry (N4), ", and" between two place quantities (N5), the easier example's facts when
// no tutor kind fits it (N6). Each case failed on dd1aafb1e; each control passes on both heads. Fake models, fake or
// local AI clients, in-memory stores and a passed-in clock.
import { describe, expect, it } from 'vitest';
import { learningEvents } from '@/lib/learning-events';
import { memoryLearningEventStore } from '@/lib/learning-events-memory';
import { memoryWordingHistoryStore } from '@/lib/maya';
import { mayaCalls } from '@/lib/maya-call';
import { memoryCallStore, memoryConnectionLog } from '@/lib/maya-call-memory';
import { callNotes, noteStep } from '@/lib/maya-call-note';
import { memoryNoteStore } from '@/lib/maya-call-note-memory';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { aiTalkReviewer, fakeTalkReviewer } from '@/lib/maya-talk-review';
import { aiMathReviewer, fakeMathReviewer } from '@/lib/maya-math-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { FIXTURES } from '@/lib/maya-gate/fixtures';
import { fixedOffers } from '@/lib/maya/lines';
import { createTextSession } from '@/lib/maya-text';
import { createSession, mathReviewInput } from '@/lib/maya/session';
import { checkTutorSay, codeAlone, exactKey, exactTexts, tutorStreamContext } from '@/lib/maya/tutor';
import { TUTOR_OUTPUT_SCHEMA, TUTOR_PROMPT } from '@/lib/maya/tutor-prompt';
import { MATH_REVIEW_SYSTEM, type MathReviewInput } from '@/lib/maya/math-review';
import type { AiClient } from '@/lib/ai-client';
import { operationResult, workedSteps, type Operation, type OperationPackage } from '@/lib/question-package';

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
