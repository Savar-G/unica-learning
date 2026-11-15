// Final check 12, part 1 (2026-11-15, head 0c74423ea): three parent-record findings, fail closed.
// F1: after a right "My answer is 24.", a new answer code cannot read in full ("My answer is 24 plus 1.") kept the old
//     success: solved, a right event and "finished it with no help".
// F2: a priority route (identity, a stop, scope, safety) skipped the correction of a new wrong answer ("My answer is 36.").
// F3: Maya streamed the whole answer while the model answer was still pending; a hang-up, the deadline or a replacement
//     turn then saved "a small hint".
// Rules: the answer state is reconciled on every child turn before any routing or outcome; the help ledger is written
// the moment a sentence is emitted, and every terminal save reads it.
// Family calls through the public call module, in-memory stores, a passed-in clock, fake reviewers.
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
import { fakeMathReviewer } from '@/lib/maya-math-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import type { OperationPackage } from '@/lib/question-package';

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
