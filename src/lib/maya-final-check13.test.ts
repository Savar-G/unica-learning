// Final check 13 (2026-11-15, head 094e5c673), issue #1086: the review key read "take away" as two words and "is equal
// to" as "= = to", so a repair that only changed the operator or relation wording started a new review after a terminal
// one, and one wrong "true" sent the false sentence. Rule: the key reads operator and relation words from the SAME table
// the claim reader parses them with (math-words.ts). Fake reviewers, no paid call.
import { describe, expect, it } from 'vitest';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { aiMathReviewer, fakeMathReviewer } from '@/lib/maya-math-review';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { createTextSession } from '@/lib/maya-text';
import { OPERATOR_PHRASES, RELATION_PHRASES } from '@/lib/maya/math-words';
import { sentenceKey } from '@/lib/maya/say-check';
import { falseClaims } from '@/lib/maya/tutor-math';
import type { OperationPackage } from '@/lib/question-package';

const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
const LINE = '12 minus 8 is 4 with a negative sign.';

describe('#1086: one table for the reader and the key', () => {
  it('binding: every operator or relation phrase of one meaning gives one key', () => {
    const minus = ['minus', 'take away', '-'].map((op) => sentenceKey(`12 ${op} 8 is 4 with a negative sign.`));
    expect(new Set(minus).size).toBe(1);
    const equals = ['is', 'is equal to', 'equals', '=', 'is the same as'].map((rel) => sentenceKey(`12 minus 8 ${rel} 4 with a negative sign.`));
    expect(new Set(equals).size).toBe(1);
    expect(sentenceKey('12 minus 8 is not 4.')).toBe(sentenceKey("12 minus 8 isn't equal to 4."));
    expect(sentenceKey('12 minus 8 is not 4.')).not.toBe(sentenceKey('12 minus 8 is 4.'));
    expect(sentenceKey('12 minus 8 is 4.')).not.toBe(sentenceKey('12 plus 8 is 4.'));
  });
  it('property: each phrase of the table gives the key of its first phrase of the same meaning', () => {
    for (const op of ['+', '-', '*', '/'] as const) {
      const phrases = OPERATOR_PHRASES.filter((x) => x.op === op).map((x) => x.re.replace(/\\/g, '').replace('groups?', 'groups'));
      const keys = phrases.map((p) => sentenceKey(`6 ${p} 2 is 4.`));
      expect(new Set(keys).size, `${op}: ${phrases.join(', ')}`).toBe(1);
    }
    for (const kind of [{ negated: false, now: false }, { negated: true, now: false }, { negated: false, now: true }]) {
      const phrases = RELATION_PHRASES.filter((x) => x.negated === kind.negated && x.now === kind.now).map((x) => x.re);
      const keys = phrases.map((p) => sentenceKey(`4 tens ${p} 3 tens.`));
      expect(new Set(keys).size, phrases.join(', ')).toBe(1);
    }
  });
  it('the claim reader reads the same words: "take away" and "is equal to" are read as before', () => {
    expect(falseClaims('12 take away 8 is equal to 5.')).not.toEqual([]);
    expect(falseClaims('12 take away 8 is equal to 4.')).toEqual([]);
  });
  for (const repair of ['12 take away 8 is 4 with a negative sign.', '12 minus 8 is equal to 4 with a negative sign.']) {
    for (const terminal of ['false', 'error', 'timeout', 'retry-error', 'retry-false', 'malformed'] as const) {
      for (const stream of [false, true]) {
        it(`binding: "${repair}" after ${terminal} keeps the terminal result (${stream ? 'voice' : 'chat'})`, async () => {
          let first = 0;
          let retries = 0;
          const math = aiMathReviewer({
            model: 'local-first',
            json: async () => {
              first++;
              if (first === 1) {
                if (terminal === 'false') return { verdict: 'false', reason: 'the negative sign changes four' };
                if (terminal === 'error') throw Error('connection failed');
                if (terminal === 'timeout') await new Promise((r) => setTimeout(r, 75));
                if (terminal === 'malformed') return { verdict: 'not-a-verdict', reason: 'bad' };
                if (terminal.startsWith('retry')) return { verdict: 'unsure', reason: 'cannot tell' };
              }
              return { verdict: 'true', reason: 'all true' };
            },
          } as never, undefined, { client: { model: 'local-retry', json: async () => { retries++; if (terminal === 'retry-error') throw Error('connection failed'); return { verdict: 'false', reason: 'the negative sign changes four' }; } } as never });
          const parts: string[] = [];
          const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repair : LINE, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
          const s = createTextSession({ callId: 'compound-key', package: SUB, tutor: true, clock: () => Date.now(), reviewTimeLimitMs: terminal === 'timeout' ? 20 : 1000, model, mathReviewer: math, reviewer: fakeTalkReviewer(), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : { channel: 'chat' as const }) });
          await s.start();
          parts.length = 0;
          const out = await s.child('Help me please.');
          expect(first).toBe(1);
          expect(out.say).not.toContain(repair);
          expect(parts).not.toContain(repair);
          expect(retries).toBe(terminal.startsWith('retry') ? 1 : 0);
        });
      }
    }
  }
  for (const stream of [false, true]) {
    it(`control: a single-word relation keeps the refusal too (${stream ? 'voice' : 'chat'})`, async () => {
      const repair = '12 minus 8 equals 4 with a negative sign.';
      let calls = 0;
      const math = fakeMathReviewer(() => ({ verdict: ++calls === 1 ? 'false' : 'true', reason: calls === 1 ? 'the negative sign changes four' : 'all true' }));
      const parts: string[] = [];
      const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repair : LINE, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
      const s = createTextSession({ callId: 'retained-key', package: SUB, tutor: true, clock: () => Date.now(), model, reviewer: fakeTalkReviewer(), mathReviewer: math, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : { channel: 'chat' as const }) });
      await s.start();
      const out = await s.child('Help me please.');
      expect(calls).toBe(1);
      expect(out.say).not.toContain(repair);
      expect(parts).not.toContain(repair);
    });
  }
});
