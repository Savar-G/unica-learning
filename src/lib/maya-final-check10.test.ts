// Final check 10 (2026-11-15, head 484f5b9bc): three tutor-core findings, fail closed.
// F1: a unit clause after a comma ("My answer is 18, bags.") was skipped, so a wrong unit got final credit.
// F2: an operand of a wrong expression ("My answer is 24 plus 1.") was credited as the whole answer.
// F3: a streamed sentence that gave the answer lost its help record when a later identity or scope reading redirected
// the turn, so the child's repeat of the answer was recorded as independent ("finished it with no help").
// Rule: final-answer credit only when the child's whole answer phrase is read in full (the number, at most the question's
// unit, and nothing else after it); the help record comes from every sentence Maya emitted in the turn, before routing.
// Family calls through the public call module, in-memory stores, a local review client, a passed-in clock.
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
import { aiMathReviewer } from '@/lib/maya-math-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { createSession } from '@/lib/maya/session';
import { teachingPackage } from '@/lib/maya-teaching';
import type { OperationPackage } from '@/lib/question-package';

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
