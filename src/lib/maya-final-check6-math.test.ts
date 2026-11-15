// Final check 6 of the tutor core (2026-11-15, head b02df0da9), the session's part. Each case failed on b02df0da9 and
// passes on the fix; each control passes on both heads. Rules:
//  N3 / F3: the child's verdict the math review reads is code's validated stance: a false equation in the child's turn is
//   "wrong" before any answer verdict; an explicit answer is read from its own sentence, never from the turn's last
//   number ("My friend said 24" is not the child's answer); "right" only from code's credit; else "unknown".
//  F4: a Maya sentence that names the answer word and rejects the other choice ("not", "instead of") gives the answer;
//   only an open choice ("true or false?") does not.
// Fake models, local AI clients and in-memory stores; no paid call.
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
import { aiMathReviewer, fakeMathReviewer } from '@/lib/maya-math-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { FIXTURES } from '@/lib/maya-gate/fixtures';
import { createTextSession } from '@/lib/maya-text';
import { createSession, mathReviewInput } from '@/lib/maya/session';
import { childSaysFalse } from '@/lib/maya/tutor';
import { MATH_REVIEW_SYSTEM, type MathReviewInput } from '@/lib/maya/math-review';
import type { AiClient } from '@/lib/ai-client';
import type { OperationPackage } from '@/lib/question-package';

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
