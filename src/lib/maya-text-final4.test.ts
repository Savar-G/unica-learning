import { describe, expect, it } from 'vitest';
import { learningEvents } from '@/lib/learning-events';
import { memoryLearningEventStore } from '@/lib/learning-events-memory';
import { memoryWordingHistoryStore } from '@/lib/maya';
import { fixedOffers } from '@/lib/maya/lines';
import { mayaCalls } from '@/lib/maya-call';
import { memoryCallStore, memoryConnectionLog } from '@/lib/maya-call-memory';
import { callNotes, noteStep } from '@/lib/maya-call-note';
import { memoryNoteStore } from '@/lib/maya-call-note-memory';
import { FIXTURES } from '@/lib/maya-gate/fixtures';
import { fakeMathReviewer } from '@/lib/maya-math-review';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { createTextSession } from '@/lib/maya-text';
import type { OperationPackage } from '@/lib/question-package';

// Final check 4, part 1 (2026-11-15): each case failed on de9b87678 and passes on the fix; each control passes on both.
// The rules read no word list: the stream holds every turn that is not plainly about the math, credit for "Maya said
// the answer back" comes only from code's validated credit after the turn, and on a wrong or right stance every
// sentence that is not code's own text or a question waits for both reviews, whose refusal is binding.
const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
const disclosure = fixedOffers().find((x) => x.line === 'about.ai')!.texts[0];
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

async function turn(child: string, say: string, opts: { stream?: boolean; reading?: Record<string, unknown>; talk?: ReturnType<typeof fakeTalkReviewer>; pkg?: OperationPackage } = {}) {
  const parts: string[] = [];
  let early: string[] = [];
  const talk = opts.talk ?? fakeTalkReviewer();
  const math = fakeMathReviewer();
  const s = createTextSession({
    callId: 'final4', package: opts.pkg ?? SUB, tutor: true, clock: () => 10000, reviewer: talk, mathReviewer: math, onSayPart: (x) => parts.push(x),
    model: conversationalFake({ answer: () => reply(say, 'guide', opts.reading ? { reading: opts.reading } : {}), ...(opts.stream ? { stream: { chunk: 7, beforeEnd: async () => { await settle(); early = [...parts]; } } } : {}) }),
  });
  await s.start();
  parts.length = 0;
  const out = await s.child(child);
  return { out, parts, early, talk, math };
}

describe('F1: the AI disclosure comes first on any turn that is not plainly math', () => {
  const asks = ['Are you made of code?', 'Is a grown-up talking to me?', 'Is your voice recorded?', 'Am I speaking to somebody real?', 'Do you have a body?', 'Who made you?', 'Do you sleep at night?', 'Where do you live?'];
  for (const child of asks) for (const stream of [false, true]) {
    it(`${child} (stream=${stream})`, async () => {
      const r = await turn(child, '12 minus 8 is 4. What is 4 minus 2?', { stream, reading: { aboutMaya: 'identity' } });
      expect(r.out.say.join(' ').startsWith(disclosure)).toBe(true);
      if (stream) {
        expect(r.early).toEqual([]);
        expect(r.parts.join(' ').startsWith(disclosure)).toBe(true);
      }
    });
  }
  for (const child of ['12 minus 8 is 4.', 'I need help.', "I'm stuck.", 'How do I take away the ones?']) {
    it(`control: a math or help turn still streams its first sentence at once: ${child}`, async () => {
      const r = await turn(child, '12 minus 8 is 4. What is 4 minus 2?', { stream: true });
      expect(r.early[0]).toBe('12 minus 8 is 4.');
    });
  }
});

const P = '11111111-1111-4111-8111-111111111111', C = '22222222-2222-4222-8222-222222222222', W = '44444444-4444-4444-8444-444444444444';
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
  }
  if (!voice && (await store.get(start.view.id))?.status !== 'ended') { const r = await calls.input(current.view.id, current.view.revision, { type: 'end' }, 'Ava'); if (!r.ok) throw Error(r.error); }
  return { notes: notes.rows() };
}

describe("F2: Maya saying the answer counts as given unless code credited the child's own answer", () => {
  // Savar's call 2: a message after a wrong answer ends with one question.
  const told = '52 minus 28 is 24. Can you write 24 on your paper?';
  for (const voice of [false, true]) {
    it(`a right answer taken back, then told, is answer_given (voice=${voice})`, async () => {
      const r = await family(SUB, [reply('What did you write?', 'guide'), reply(told, 'guide'), reply('Bye for now.', 'close')], ["It's 24.", 'My answer is 36.', "It's 24."], voice);
      expect(r.notes[0]?.transcript.some((t) => t.speaker === 'maya' && t.text === told)).toBe(true);
      expect(r.notes[0]?.facts.finished).toBe('answer_given');
    });
    for (const second of ['My friend said 24.', 'My mom said 24.', 'The boy next to me got 24.']) {
      it(`a second-hand answer is no committed answer: ${second} (voice=${voice})`, async () => {
        const r = await family(SUB, [reply(told, 'guide'), reply('Bye for now.', 'close')], [second, "It's 24."], voice);
        expect(r.notes[0]?.transcript.some((t) => t.speaker === 'maya' && t.text === told)).toBe(true);
        expect(r.notes[0]?.facts.finished).toBe('answer_given');
      });
    }
    it(`control: a right answer that stands is the child's own work (voice=${voice})`, async () => {
      const r = await family(SUB, [reply(told, 'guide'), reply('Bye for now.', 'close')], ["It's 24.", "It's 24."], voice);
      expect(r.notes[0]?.facts.finished).toBe('on_own');
    });
  }
});

describe('F3: a judgment the reviews refuse never reaches the child on a wrong or right stance', () => {
  const refuseMath = () => fakeTalkReviewer(() => ({ verdict: 'fail', rules: ['math'], reason: 'Affirms the wrong final answer.' }));
  const praise = ['You solved it! What is 12 minus 8?', "What is 12 minus 8? That's it!", 'Your answer checks out. What is 12 minus 8?', 'You have the correct answer. What is 12 minus 8?', 'You figured it out! What is 12 minus 8?', 'That is the one. What is 12 minus 8?', 'Your number works. What is 12 minus 8?'];
  for (const say of praise) for (const stream of [false, true]) {
    it(`after "My answer is 36.": ${say} (stream=${stream})`, async () => {
      const r = await turn('My answer is 36.', say, { stream, talk: refuseMath() });
      const lead = say.split(/(?<=[.!?])\s+/).find((x) => !x.endsWith('?'))!;
      expect(r.out.say.join(' ')).not.toContain(lead);
      expect(r.parts.join(' ')).not.toContain(lead);
    });
  }
  for (const [pkg, child] of [[FIXTURES.CLAIM_TF, "It's false."], [FIXTURES.CLAIM_GT, 'I circle no.']] as const) {
    it(`a wrong word cannot receive "Your answer is true.": ${child}`, async () => {
      const r = await turn(child, 'Your answer is true. What do you get?', { pkg: pkg as OperationPackage, talk: fakeTalkReviewer(() => ({ verdict: 'fail', rules: ['math'], reason: 'Affirms a wrong answer.' })) });
      expect(r.out.say.join(' ')).not.toContain('Your answer is true.');
    });
  }
  it('on a right stance a refused sentence is held too', async () => {
    const r = await turn('My answer is 24.', 'Hmm, look at that again. What is 12 minus 8?', { talk: fakeTalkReviewer(() => ({ verdict: 'fail', rules: ['math'], reason: 'Doubts a right answer.' })) });
    expect(r.out.say.join(' ')).not.toContain('look at that again');
  });
  for (const lead of ['You solved it!', 'Your answer checks out.']) for (const stream of [false, true]) {
    it(`control: a right answer may receive ${lead} (stream=${stream})`, async () => {
      const r = await turn('My answer is 24.', `${lead} What is 12 minus 8?`, { stream });
      expect(r.out.say.join(' ')).toContain(lead);
      if (stream) expect(r.parts.join(' ')).toContain(lead);
    });
  }
  it('control: a plain "none" turn keeps a talk review refused only on the math rule', async () => {
    const r = await turn('I need help.', 'Let us look at the ones first. What is 12 minus 8?', { talk: refuseMath() });
    expect(r.out.say.join(' ')).toContain('Let us look at the ones first.');
  });
});
