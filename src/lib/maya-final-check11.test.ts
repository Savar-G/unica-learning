// Final check 11 (2026-11-15, head 7958a012a): six findings, fail closed.
// Part 1. F1: a step credit read only part of the child's phrase ("I got 4 plus 1." credited the ones of 52 − 28).
// F2: a terminal stop built the outcome before the help in streamed sentences was applied (the note said "a small hint").
// Part 2. N1: the terminal review key told "one" from "1". N2: the number reader joined "two thousand × six hundred
// forty" into 2640. N3: the place-value reader refused "the value of the 8 is greater than 9,000 minus 2,000" from its
// prefix. N4: the column reader refused the inner claim of "It is not true that 1 thousand is 2 thousands."
// Rules: one whole-phrase reader for every credited value; emitted help is applied where each streamed sentence is
// accepted, before any routing; the review key is a function of the standard reader's tokens; a run never joins across
// an operator; a reader refuses only a clause it reads in full.
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
import type { OperationPackage } from '@/lib/question-package';

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
