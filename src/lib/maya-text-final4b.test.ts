import { describe, expect, it } from 'vitest';
import { fakeMathReviewer } from '@/lib/maya-math-review';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { createTextSession } from '@/lib/maya-text';
import { checkTutorSay, tutorStreamContext } from '@/lib/maya/tutor';
import type { OperationPackage } from '@/lib/question-package';

// Final check 4, part 2 (2026-11-15): each case failed on de9b87678 and passes on the fix; each control passes on both.
// A code-only pass must be true with no context: a bare answer, a question about a digit the number does not hold, a
// step text of another problem and an unsafe number go to the math review; an answer claim is refused only when code
// read its whole subject; a direction word is no judgment.
const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
const ctx = tutorStreamContext(SUB, 'Help me please.', 'none', new Set());
const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };

async function call(line: string, child: string, stream: boolean, mathVerdict: 'true' | 'false' = 'false') {
  const parts: string[] = [];
  const math = fakeMathReviewer(() => (mathVerdict === 'true' ? { verdict: 'true', reason: 'true' } : { verdict: 'false', reason: 'false in this context' }));
  const model = conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7, beforeEnd: settle } } : {}) });
  let now = Date.UTC(2026, 10, 15);
  const s = createTextSession({ callId: 'final4b', package: SUB, model, clock: () => (now += 100), random: 3, tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: math, reviewTimeLimitMs: 15, ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
  await s.start();
  parts.length = 0;
  const out = await s.child(child);
  return { said: out.say.join(' '), parts: parts.join(' '), math, model };
}

describe('Q1: a closed form passes on code alone only when it is true with no context', () => {
  for (const stream of [false, true]) {
    it(`"The tens." after a place question goes to the math review (stream=${stream})`, async () => {
      const r = await call('The tens.', 'In 52, is the 2 in the ones or the tens?', stream);
      expect(r.said).not.toContain('The tens.');
      expect(r.parts).not.toContain('The tens.');
      expect(r.math.requests.length).toBeGreaterThan(0);
    });
    it(`a value question about a digit 52 does not hold goes to the math review (stream=${stream})`, async () => {
      const r = await call('What is the value of the 8 in 52?', 'Help me with the digits of 52.', stream);
      expect(r.said).not.toContain('the 8 in 52');
      expect(r.math.requests.length).toBeGreaterThan(0);
    });
  }
  it('control: a value question about a digit 52 holds passes on code alone', () => {
    expect(checkTutorSay('What is the value of the 5 in 52?', ctx)).toMatchObject({ ok: true, math: [] });
  });
  it('control: a full true equation passes on code alone', async () => {
    const r = await call('12 minus 8 is 4.', 'Help me please.', false);
    expect(r.said).toBe('12 minus 8 is 4.');
    expect(r.math.requests).toHaveLength(0);
  });
});

describe('X1: a step text counts only for the active problem', () => {
  for (const stream of [false, true]) {
    it(`"Write 4 in the ones." while the child works 42 minus 7 goes to the math review (stream=${stream})`, async () => {
      const r = await call('Write 4 in the ones.', 'For the easier example, 42 minus 7, what do I write in the ones?', stream);
      expect(r.said).not.toContain('Write 4 in the ones.');
      expect(r.parts).not.toContain('Write 4 in the ones.');
      expect(r.math.requests.length).toBeGreaterThan(0);
    });
  }
  it('control: on the main question it passes on code alone', async () => {
    const r = await call('Write 4 in the ones.', 'Help me please.', false);
    expect(r.said).toBe('Write 4 in the ones.');
    expect(r.math.requests).toHaveLength(0);
  });
});

describe('I1: an unsafe number never passes on code alone', () => {
  for (const stream of [false, true]) {
    it(`"9999999999999999 is 10000000000000000." goes to the math review (stream=${stream})`, async () => {
      const r = await call('9999999999999999 is 10000000000000000.', 'Help me please.', stream);
      expect(r.said).not.toContain('9999999999999999');
      expect(r.parts).not.toContain('9999999999999999');
      expect(r.math.requests.length).toBeGreaterThan(0);
    });
  }
  it('control: a safe true equation still passes on code alone', () => {
    expect(checkTutorSay('52 minus 28 is 24.', ctx)).toMatchObject({ ok: true, math: [] });
  });
});

describe('A1: an answer claim is refused only when code read its whole subject', () => {
  for (const stream of [false, true]) {
    it(`"The difference between 52 and 28 is the answer." goes to the math review (stream=${stream})`, async () => {
      const r = await call('The difference between 52 and 28 is the answer.', 'Help me please.', stream, 'true');
      expect(r.said).toBe('The difference between 52 and 28 is the answer.');
      expect(r.model.briefs).toHaveLength(1);
      expect(r.math.requests.length).toBeGreaterThan(0);
    });
  }
  it('control: "25 is the answer." is still refused by code', () => {
    expect(checkTutorSay('25 is the answer.', ctx)).toMatchObject({ ok: false, reason: 'false_equation' });
  });
});

describe('D1: a direction word is no judgment', () => {
  for (const stream of [false, true]) {
    // Savar's call 2 (2026-11-15): a message that corrects ends with one question.
    it(`"Start with the ones on the right." after "My answer is 36." waits for the reviews and is said (stream=${stream})`, async () => {
      const r = await call('Start with the ones on the right. What is 12 minus 8?', 'My answer is 36.', stream, 'true');
      expect(r.said).toBe('Start with the ones on the right. What is 12 minus 8?');
      expect(r.model.briefs).toHaveLength(1);
      expect(r.math.requests.length).toBeGreaterThan(0);
    });
  }
  it('control: "Yes, that is right." after "My answer is 36." is never said', async () => {
    const r = await call('Yes, that is right. What is 12 minus 8?', 'My answer is 36.', false, 'true');
    expect(r.said).not.toContain('that is right');
  });
});
