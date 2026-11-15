// Final check 11, part 2 (true math, 2026-11-15, head 7958a012a): N1 to N4, fail closed. See maya-final-check11.test.ts
// for part 1. N1: the terminal review key told "one" from "1". N2: the standard reader joined "two thousand × six hundred
// forty" into 2640. N3: the place-value reader refused a true comparison from the prefix of its right side. N4: the
// column reader ignored an enclosing negation. Synthetic packages only, local review clients, no paid call.
import { describe, expect, it } from 'vitest';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { aiMathReviewer, fakeMathReviewer, type MathReviewer } from '@/lib/maya-math-review';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { createTextSession } from '@/lib/maya-text';
import { teachingPackage } from '@/lib/maya-teaching';
import { storedPlaceValue } from '@/lib/maya-teaching/place-value-samples';
import { workedSteps, type Operation, type OperationPackage } from '@/lib/question-package';
import { answerReadWhole, createSession } from '@/lib/maya/session';
import { childFacts, tutorKind } from '@/lib/maya/tutor';
import { sayNumbers, sentenceKey, standardNumber } from '@/lib/maya/say-check';

const SUB = SAMPLE_PACKAGES['subtract-52-28'] as OperationPackage;
const num = (value: number) => ({ type: 'number' as const, value });

/** A multiplication question with its own worked steps (as multiply.test.ts builds them). */
function product(a: number, b: number): OperationPackage {
  const operation: Operation = { kind: 'multiply', operands: [a, b] };
  const easier: Operation = { kind: 'multiply', operands: [2, 2] };
  return {
    ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2,
    id: `t-${a}x${b}`, text: `${a} × ${b} = ?`, skill: { standard: '4.8', skills: ['4.8-multiplication-facts'] },
    answer: { value: num(a * b), accepted: [], unit: null }, operation, steps: workedSteps(operation),
    wrongAnswers: [{ value: num(a * b + 1), cause: 'careless', description: 'One more than the answer.', step: null }],
    easierExample: { text: '2 × 2 = ?', operation: easier, answer: num(4), steps: workedSteps(easier) },
  } as OperationPackage;
}

/** A column subtraction story across zeros (as column.test.ts builds it). */
function tickets(): OperationPackage {
  const operation = { kind: 'subtract' as const, operands: [10000, 2001] as [number, number] };
  return {
    id: 'subtract-10000-2001', operationSource: 'maya-teaching', ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null,
    text: 'Noor has 10000 tickets and gives 2001 away. How many tickets are left?',
    answer: { value: num(7999), accepted: [], unit: null }, operation, steps: workedSteps(operation),
    skill: { standard: '4.4', skills: [] }, level: 12, difficulty: 2,
    wrongAnswers: [{ value: num(8009), cause: 'O1', description: 'Takes the smaller digit from the larger', step: null }],
    easierExample: { text: '7 − 3 = ?', operation: { kind: 'subtract', operands: [7, 3] }, answer: num(4), steps: workedSteps({ kind: 'subtract', operands: [7, 3] }) },
  } as OperationPackage;
}

const tutorPackage = (raw: unknown, id: string) => {
  const s = createSession({ callId: id, package: raw as never, conversational: true, tutor: true });
  if (!s.tutor || !s.package) throw new Error(`${id} is not a tutor question`);
  return s.package as OperationPackage;
};
const placeValue = () => tutorPackage(teachingPackage(storedPlaceValue({ variant: '1.3', n0: 48942, place: 'hundreds', name: 'Ali', sign: 'the school' })), 'place-value');

/** One tutor turn: the model says `line` after the child's words, in chat or streamed voice. */
async function call(pkg: OperationPackage, line: string, child: string, stream: boolean, math: MathReviewer = fakeMathReviewer()) {
  const parts: string[] = [];
  const model = conversationalFake({ answer: () => reply(line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) });
  const s = createTextSession({ callId: 'final10-2', package: pkg, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, reviewTimeLimitMs: 1000, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
  await s.start();
  parts.length = 0;
  const out = await s.child(child);
  return { s, out, parts };
}



/** A whole number in words, for the key property ("4072": "four thousand seventy-two"). */
function words(n: number): string {
  const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const below100 = (x: number) => (x < 20 ? small[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? `-${small[x % 10]}` : ''}`);
  const below1000 = (x: number) => (x < 100 ? below100(x) : `${small[Math.floor(x / 100)]} hundred${x % 100 ? ` ${below100(x % 100)}` : ''}`);
  return n < 1000 ? below1000(n) : `${below1000(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${below1000(n % 1000)}` : ''}`;
}

describe('N1: the terminal review key is a function of the standard reader\'s tokens', () => {
  it('property: a sentence and each of its digit or word variants give the same key', () => {
    const shapes = ['{a} minus {b} is {c} with {d} negative sign.', 'So {a} plus {b} makes {c}!', 'The {d} in the tens means {a} tens.', '{a} times {b} is {c}, and {d} more.'];
    let seed = 7;
    const rand = (max: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
    for (let k = 0; k < 200; k++) {
      const values = { a: rand(9999), b: rand(999), c: rand(99), d: rand(3) };
      for (const shape of shapes) {
        const fill = (form: (n: number) => string) => shape.replace(/\{([abcd])\}/g, (_m, key: 'a' | 'b' | 'c' | 'd') => form(values[key]));
        const key = sentenceKey(fill(String));
        expect(sentenceKey(fill(words)), fill(words)).toBe(key);
        // Mixed forms, case and punctuation.
        const mixed = shape.replace(/\{([abcd])\}/g, (_m, name: 'a' | 'b' | 'c' | 'd') => (name === 'a' || name === 'd' ? words(values[name]) : String(values[name]))).toUpperCase().replace(/[.!]$/, '?');
        expect(sentenceKey(mixed), mixed).toBe(key);
      }
    }
  });
  it('binding: "one" and "1" give one key; a different number gives another', () => {
    expect(sentenceKey('12 minus 8 is 4 with one negative sign.')).toBe(sentenceKey('12 minus 8 is 4 with 1 negative sign.'));
    expect(sentenceKey('Carry the ten.')).toBe(sentenceKey('Carry the 10.'));
    expect(sentenceKey('12 minus 8 is 4 with one negative sign.')).not.toBe(sentenceKey('12 minus 8 is 4 with 2 negative signs.'));
  });
  for (const stream of [false, true]) {
    for (const kind of ['false', 'error', 'timeout', 'retry-error'] as const) {
      it(`binding: a repair from "one" to "1" after ${kind} is not reviewed again (${stream ? 'voice' : 'chat'})`, async () => {
        const line = '12 minus 8 is 4 with one negative sign.';
        const repaired = '12 minus 8 is 4 with 1 negative sign.';
        let first = 0;
        let retries = 0;
        const client = {
          model: 'local-first',
          json: async () => {
            first++;
            if (first === 1) {
              if (kind === 'false') return { verdict: 'false', reason: 'a negative sign changes the value' };
              if (kind === 'error') throw Error('connection failed');
              if (kind === 'timeout') await new Promise((r) => setTimeout(r, 40));
              if (kind === 'retry-error') return { verdict: 'unsure', reason: 'cannot tell' };
            }
            return { verdict: 'true', reason: 'all true' };
          },
        };
        const retry = { model: 'local-retry', json: async () => { retries++; throw Error('connection failed'); } };
        const math = aiMathReviewer(client as never, undefined, kind === 'retry-error' ? { client: retry as never } : undefined);
        const parts: string[] = [];
        const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repaired : line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
        const s = createTextSession({ callId: 'one-key', package: SUB, tutor: true, clock: () => Date.now(), reviewTimeLimitMs: kind === 'timeout' ? 15 : 1000, mathReviewer: math, reviewer: fakeTalkReviewer(), model, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
        await s.start();
        parts.length = 0;
        const out = await s.child('Help me with 52 minus 28.');
        expect(first).toBe(1);
        expect(out.say).not.toContain(repaired);
        expect(parts).not.toContain(repaired);
        if (kind === 'retry-error') expect(retries).toBe(1);
      });
    }
  }
});

describe('N2: the standard reader never joins number groups across an operator', () => {
  it('binding: "two thousand × six hundred forty" is two numbers, never 2640', () => {
    const tokens = sayNumbers('My answer is two thousand × six hundred forty.');
    expect(tokens.map((t) => t.q?.[0])).toEqual([2000, 640]);
    expect(sayNumbers('two thousand, six hundred forty').map((t) => t.q?.[0])).toEqual([2000, 640]);
    expect(standardNumber('two thousand six hundred forty')).toBe(2640);
  });
  for (const stream of [false, true]) {
    it(`binding: the review is never told "the child said 2640" (${stream ? 'voice' : 'chat'})`, async () => {
      const math = fakeMathReviewer();
      await call(product(6, 440), 'Let us check that.', 'My answer is two thousand × six hundred forty.', stream, math);
      expect(math.requests.length).toBeGreaterThan(0);
      expect(math.requests[0].childFacts.join(' ')).not.toContain('The child said 2640');
      expect(math.requests[0].childAnswer?.verdict).not.toBe('right');
    });
  }
  it('control: the words of 2640 still read as 2640', () => {
    const text = 'My answer is two thousand six hundred forty.';
    expect(childFacts(product(6, 440), text, (v) => answerReadWhole(product(6, 440), text, v, true)).join(' ')).toContain('The child said 2640');
  });
});

describe('N3 and N4: a kind reader refuses only a clause it reads in full', () => {
  for (const stream of [false, true]) {
    const mode = stream ? 'voice' : 'chat';
    const cases: { name: string; pkg: () => OperationPackage; line: string; falseLine: string }[] = [
      { name: 'N3 a right side that goes on', pkg: placeValue, line: 'In 48,942, the value of the 8 is greater than 9,000 minus 2,000.', falseLine: 'In 48,942, the value of the 8 is greater than 9,000 plus 2,000.' },
      { name: 'N4 an enclosing negation', pkg: tickets, line: 'It is not true that 1 thousand is 2 thousands.', falseLine: 'It is not true that 1 thousand is 10 hundreds.' },
    ];
    for (const c of cases) {
      it(`binding: ${c.name}: the true sentence is said (${mode})`, async () => {
        const r = await call(c.pkg(), c.line, 'Help me please.', stream, fakeMathReviewer());
        expect(r.out.say).toContain(c.line);
      });
      it(`control: ${c.name}: the false sentence is never said (${mode})`, async () => {
        const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'false' }));
        const r = await call(c.pkg(), c.falseLine, 'Help me please.', stream, math);
        expect(r.out.say).not.toContain(c.falseLine);
        expect(r.parts).not.toContain(c.falseLine);
      });
    }
    it(`control: a direct false column claim is still refused by code (${mode})`, async () => {
      const math = fakeMathReviewer();
      const r = await call(tickets(), '1 thousand is 2 thousands.', 'Help me please.', stream, math);
      expect(r.out.say).not.toContain('1 thousand is 2 thousands.');
    });
  }
  it('N3: the place-value kind reads no part of a right side that goes on', () => {
    expect(tutorKind(placeValue()).claimProblems(placeValue(), 'In 48,942, the value of the 8 is greater than 9,000 minus 2,000.')).toEqual([]);
  });
});
