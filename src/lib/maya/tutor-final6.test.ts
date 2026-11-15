// Final check 6 of the tutor core (2026-11-15, head b02df0da9), the math reader's part. Each case failed on b02df0da9 and
// passes on the fix; each control passes on both heads. Rules, not word lists:
//  N1: a non-whole or unsafe intermediate value leaves its side unread (no code-only pass, no "true", no refusal).
//  N2: after the first sentence of a message that needs the math review, every later sentence of it needs one too.
//  N4: an answer claim with a stated scope code does not resolve goes to the review, never a refusal.
//  N5: an unsafe or unread answer value goes to the review, never a refusal.
// Fake models and fake reviewers; no paid call.
import { describe, expect, it } from 'vitest';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { createTextSession } from '@/lib/maya-text';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { fakeMathReviewer } from '@/lib/maya-math-review';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { checkTutorSay, tutorStreamContext, tutorStreamSentence } from '@/lib/maya/tutor';
import { answerClaims, answerProblems, readClaims } from '@/lib/maya/tutor-math';
import type { OperationPackage } from '@/lib/question-package';

const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
const HELP = 'Help me with 52 minus 28.';
const ctx = () => tutorStreamContext(SUB, HELP, 'none', new Set());

/** One tutor turn in the text adapter, whole or streamed. */
async function turn(line: string, child: string, stream: boolean, math: ReturnType<typeof fakeMathReviewer>) {
  const parts: string[] = [];
  const model = conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) });
  const s = createTextSession({ callId: 'final6', package: SUB, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
  await s.start();
  parts.length = 0;
  const out = await s.child(child);
  return { say: out.say, parts, model };
}

describe('N1: a non-whole intermediate value is never read by code', () => {
  const line = '1 one divided by 10000000000 is 0 ones.';
  it('the false sentence is not code-only: it goes to the math review', () => {
    expect(BigInt(1)).not.toBe(BigInt(0) * BigInt(10000000000));
    expect(checkTutorSay(line, ctx())).toMatchObject({ ok: true, math: [line] });
    expect(readClaims(line).problems).toEqual([]);
    expect(readClaims(line).unread.length).toBeGreaterThan(0);
  });
  it('the true sentence is not refused by code either', () => {
    expect(checkTutorSay('1 one divided by 10000000000 is not 0 ones.', ctx())).toMatchObject({ ok: true });
  });
  for (const stream of [false, true]) {
    it(`a "false" review keeps it from the child, stream=${stream}`, async () => {
      const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'one divided by a positive whole number is not zero' }));
      const r = await turn(line, HELP, stream, math);
      expect(r.say).not.toContain(line);
      expect(r.parts).not.toContain(line);
      expect(math.requests.map((x) => x.sentence)).toContain(line);
    });
  }
  it('control: a whole quotient is still read ("12 divided by 4 is 3" true, "is 4" refused)', () => {
    expect(readClaims('12 divided by 4 is 3')).toEqual({ problems: [], unread: [] });
    expect(readClaims('12 divided by 4 is 4.').problems.length).toBe(1);
    expect(readClaims('100000000 times 100000000 plus 24 is 5.').problems).toEqual([]);
  });
});

describe('N2: a review earlier in the message holds every later sentence', () => {
  const line = 'Let us try the easier example. Write 4 in the ones.';
  it('the whole-message check sends both sentences to the math review', () => {
    expect((42 - 7) % 10).toBe(5);
    expect(checkTutorSay(line, ctx())).toMatchObject({ ok: true, math: ['Let us try the easier example.', 'Write 4 in the ones.'] });
  });
  it('the stream holds the second sentence for the math review', () => {
    const v = tutorStreamSentence('Write 4 in the ones.', ['Let us try the easier example.'], ctx());
    expect(v).toMatchObject({ math: true });
  });
  for (const stream of [false, true]) {
    it(`the reviewer reads the second sentence, stream=${stream}`, async () => {
      const first = 'Let us try the easier example.';
      const math = fakeMathReviewer((input) => (input.sentence === first ? { verdict: 'true', reason: 'all true' } : { verdict: 'false', reason: 'the example writes 5 in the ones' }));
      const r = await turn(line, HELP, stream, math);
      expect(r.say).not.toContain(line);
      expect(r.say.join(' ')).not.toContain('Write 4 in the ones.');
      expect(r.parts.join(' ')).not.toContain('Write 4 in the ones.');
      expect(math.requests.map((x) => x.sentence)).toContain('Write 4 in the ones.');
    });
  }
  it('control: a message of code-only sentences still passes on code alone', () => {
    expect(checkTutorSay('Write 4 in the ones.', ctx())).toMatchObject({ ok: true, math: [] });
    expect(tutorStreamSentence('Write 4 in the ones.', [], ctx())).toBe('send');
  });
});

describe('N4: an answer claim with a stated scope goes to the review', () => {
  for (const line of ['In the ones column, the answer is 4.', 'For the easier example, the answer is 35.']) {
    it(`"${line}" is not refused`, () => {
      expect(answerProblems(line, 24)).toEqual([]);
      expect(checkTutorSay(line, ctx())).toMatchObject({ ok: true, math: [line] });
    });
    for (const stream of [false, true]) {
      it(`"${line}" reaches the child after a "true" review, stream=${stream}`, async () => {
        const math = fakeMathReviewer();
        const r = await turn(line, HELP, stream, math);
        expect(r.say.join(' ')).toContain(line);
        expect(math.requests.map((x) => x.sentence)).toContain(line);
      });
    }
  }
  it('a scoped claim that names the main answer is not read by code either', () => {
    expect(checkTutorSay('In the ones column, the answer is 24.', ctx())).toMatchObject({ ok: true, math: ['In the ones column, the answer is 24.'] });
    expect(answerClaims('In the ones column, the answer is 24.', 24).read).toHaveLength(0);
  });
  it('control: an unscoped wrong answer is still refused, and the right one still read', () => {
    expect(answerProblems('The answer is 4.', 24)).toEqual(['4 is not the answer to the question']);
    expect(answerProblems('So the answer is 25.', 24)).toEqual(['25 is not the answer to the question']);
    expect(answerProblems('25 is the answer.', 24)).toEqual(['25 is not the answer to the question']);
    expect(answerClaims('The answer is 24.', 24).read).toHaveLength(1);
  });
});

describe('N5: an unsafe answer value goes to the review', () => {
  const line = 'The answer is 100000000 times 100000000 plus 24 minus 100000000 times 100000000.';
  it('code neither refuses nor reads it', () => {
    expect(BigInt(100000000) * BigInt(100000000) + BigInt(24) - BigInt(100000000) * BigInt(100000000)).toBe(BigInt(24));
    expect(answerProblems(line, 24)).toEqual([]);
    expect(checkTutorSay(line, tutorStreamContext(SUB, 'Help me please.', 'none', new Set()))).toMatchObject({ ok: true, math: [line] });
  });
  for (const stream of [false, true]) {
    it(`it reaches the child after a "true" review, stream=${stream}`, async () => {
      const math = fakeMathReviewer();
      const r = await turn(line, 'Help me please.', stream, math);
      expect(r.say.join(' ')).toContain(line);
      expect(math.requests.map((x) => x.sentence)).toContain(line);
    });
  }
  it('control: "The answer is 52 minus 28." is read; "The answer is 52 plus 28." is refused', () => {
    expect(answerProblems('The answer is 52 minus 28.', 24)).toEqual([]);
    expect(answerProblems('The answer is 52 plus 28.', 24)).toEqual(['80 is not the answer to the question']);
  });
});
