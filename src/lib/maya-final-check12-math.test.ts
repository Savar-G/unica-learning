// Final check 12, part 2 (true math, 2026-11-15, head 0c74423ea): N1 to N6, each class fixed at one point, fail closed.
// N1: a repair in another surface form ("a half" for "1/2", "-" for "minus", "=" for "is") started a new review after a
//     terminal one. N2: an unsafe intermediate in a place-value continuation gave 7999 and refused a true sentence.
// N3: "My answer is 6 halves." gave the review the fact "The child said 6: the right answer". N4 to N6: a kind refused a
//     claim it read only in part (an enclosing negation, an unread continuation, an unread division).
// Rules: the review key is built from the reader's number and operator tokens, and a repair's review reads the sentences
// refused earlier in the turn; one shared exact evaluator; child facts only from the whole-phrase reader; one full-read
// guard for every kind refusal. Synthetic packages only, local review clients, no paid call.
import { describe, expect, it } from 'vitest';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { aiMathReviewer, fakeMathReviewer, type MathReviewer } from '@/lib/maya-math-review';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { createTextSession } from '@/lib/maya-text';
import { teachingPackage } from '@/lib/maya-teaching';
import { storedPlaceValue } from '@/lib/maya-teaching/place-value-samples';
import { workedSteps, type Operation, type OperationPackage } from '@/lib/question-package';
import { createSession, mathReviewInput, step } from '@/lib/maya/session';
import { missingWork } from '@/lib/maya/missing-number';
import { sayNumbers, sentenceKey } from '@/lib/maya/say-check';

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




/** A framed missing factor ("2 × ? = 1340"), as Maya's missing-number code builds it (multiply.test.ts). */
function missingFactor(known: number, total: number): OperationPackage {
  const w = missingWork({ sign: '×', known, unknownFirst: false, total })!;
  const e = missingWork({ sign: '×', known: 2, unknownFirst: false, total: 8 })!;
  return {
    ref: { source: 'workbook', workbookId: 'test', page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2,
    id: `m-${known}-${total}`, text: `${known} × ? = ${total}`, operationSource: 'maya-teaching',
    answer: { value: num(w.answer), accepted: [], unit: null }, operation: w.operation, steps: w.steps,
    skill: { standard: '4.8', skills: ['4.8-multiplication-facts'] },
    wrongAnswers: [{ value: num(w.answer + 1), cause: 'careless', description: 'One more than the answer.', step: null }],
    easierExample: { text: '2 × ? = 8', operation: e.operation, answer: num(e.answer), steps: e.steps },
  } as OperationPackage;
}

describe('N1: a repair in another surface form keeps the terminal result', () => {
  const variants = [
    ['a half for 1/2', '12 minus 8 is 4 with a half added.', '12 minus 8 is 4 with 1/2 added.'],
    ['a sign for minus', '12 minus 8 is 4 with a negative sign.', '12 - 8 is 4 with a negative sign.'],
    ['= for is', '12 minus 8 is 4 with a negative sign.', '12 minus 8 = 4 with a negative sign.'],
  ] as const;
  it('binding: each variant has the key of the sentence it repairs; a different number does not', () => {
    for (const [, line, repair] of variants) expect(sentenceKey(repair), repair).toBe(sentenceKey(line));
    expect(sentenceKey('12 minus 8 is 4 with a half added.')).not.toBe(sentenceKey('12 minus 8 is 4 with a quarter added.'));
    expect(sentenceKey('Twenty hundred is 2000.')).toBe(sentenceKey('Two thousand two thousand is 2000.'));
  });
  for (const [name, line, repair] of variants) {
    for (const stream of [false, true]) {
      for (const terminal of ['false', 'error', 'timeout', 'retry-error', 'retry-false'] as const) {
        it(`binding: ${name}, after ${terminal} (${stream ? 'voice' : 'chat'})`, async () => {
          let first = 0;
          let retries = 0;
          const client = {
            model: 'local-first',
            json: async () => {
              first++;
              if (first === 1) {
                if (terminal === 'false') return { verdict: 'false', reason: 'the added part changes 4' };
                if (terminal === 'error') throw Error('connection failed');
                if (terminal === 'timeout') await new Promise((r) => setTimeout(r, 60));
                if (terminal.startsWith('retry')) return { verdict: 'unsure', reason: 'cannot tell' };
              }
              return { verdict: 'true', reason: 'all true' };
            },
          };
          const retry = { model: 'local-retry', json: async () => { retries++; if (terminal === 'retry-error') throw Error('connection failed'); return { verdict: 'false', reason: 'the added part changes 4' }; } };
          const math = aiMathReviewer(client as never, undefined, { client: retry as never });
          const parts: string[] = [];
          const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repair : line, 'guide'), ...(stream ? { stream: { chunk: 7 } } : {}) } as never);
          const s = createTextSession({ callId: 'surface-key', package: SUB, tutor: true, clock: () => Date.now(), reviewTimeLimitMs: terminal === 'timeout' ? 20 : 1000, mathReviewer: math, reviewer: fakeTalkReviewer(), model, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
          await s.start();
          parts.length = 0;
          const out = await s.child('Help me please.');
          expect(first).toBe(1);
          expect(out.say).not.toContain(repair);
          expect(parts).not.toContain(repair);
          if (terminal.startsWith('retry')) expect(retries).toBe(1);
        });
      }
    }
  }
  it('binding: a repair with another key is reviewed with the refused sentence and its reason', async () => {
    const line = '12 minus 8 is 4 with a negative sign.';
    const repair = 'Twelve take away eight leaves four, with a negative sign.';
    const inputs: { sentence: string; refused?: { sentence: string; reason: string }[] }[] = [];
    const math = aiMathReviewer({ model: 'local', json: async (r: { content: { text: string }[] }) => { const i = JSON.parse(r.content[0].text); inputs.push(i); return i.sentence === line ? { verdict: 'false', reason: 'a negative sign changes 4' } : (i.refused?.length ? { verdict: 'false', reason: 'the same math as a refused sentence' } : { verdict: 'true', reason: 'all true' }); } } as never);
    const model = conversationalFake({ answer: (b: { repair?: unknown }) => reply(b.repair ? repair : line, 'guide') } as never);
    const s = createTextSession({ callId: 'refused-list', package: SUB, tutor: true, clock: () => Date.now(), mathReviewer: math, reviewer: fakeTalkReviewer(), model, channel: 'chat' });
    await s.start();
    const out = await s.child('Help me please.');
    const second = inputs.find((i) => i.sentence !== line);
    expect(second?.refused).toEqual([{ sentence: line, reason: 'a negative sign changes 4' }]);
    expect(out.say).not.toContain(repair);
  });
});

describe('N2: one exact evaluator for every kind', () => {
  for (const stream of [false, true]) {
    it(`binding: an unsafe intermediate is never computed; the true sentence goes to the review (${stream ? 'voice' : 'chat'})`, async () => {
      const line = 'The value of the 8 is 8,000 plus 100000000 times 100000000 plus 1 minus 100000000 times 100000000 minus 1.';
      const math = fakeMathReviewer();
      const r = await call(placeValue(), line, 'Help me please.', stream, math);
      expect(math.requests.length).toBeGreaterThan(0);
      expect(r.out.say).toContain(line);
    });
    it(`control: the same form with factors 10 is said (${stream ? 'voice' : 'chat'})`, async () => {
      const line = 'The value of the 8 is 8,000 plus 10 times 10 plus 1 minus 10 times 10 minus 1.';
      const r = await call(placeValue(), line, 'Help me please.', stream, fakeMathReviewer());
      expect(r.out.say).toContain(line);
    });
  }
});

describe('N3: child facts come only from the whole-phrase reader', () => {
  it('binding: "My answer is 6 halves." never tells the review the child said 6 or gave the right answer', () => {
    expect(sayNumbers('My answer is 6 halves.').map((t) => t.q)).toEqual([[3, 1]]);
    let s = createSession({ callId: 'halves', package: product(3, 2) as never, tutor: true, conversational: true });
    s = step(s, { type: 'start', at: 0 }).session;
    s = step(s, { type: 'child_turn', at: 1, text: 'My answer is 6 halves.' }).session;
    const input = mathReviewInput(s, 'Let us check that.');
    expect(input.childFacts.join(' ')).not.toContain('The child said 6');
    expect(input.childFacts.join(' ')).not.toContain('right answer');
    expect(input.childFacts.join(' ')).toContain('did not read all of the child');
    expect(input.childAnswer?.verdict).not.toBe('right');
  });
  it('control: "My answer is 6." is read whole', () => {
    let s = createSession({ callId: 'six', package: product(3, 2) as never, tutor: true, conversational: true });
    s = step(s, { type: 'start', at: 0 }).session;
    s = step(s, { type: 'child_turn', at: 1, text: 'My answer is 6.' }).session;
    expect(mathReviewInput(s, 'Let us check that.').childFacts.join(' ')).toContain('The child said 6');
  });
});

describe('N4 to N6: one full-read guard for every kind refusal', () => {
  const cases: { name: string; pkg: () => OperationPackage; line: string; falseLine: string }[] = [
    { name: 'N4 place value, enclosing negation', pkg: placeValue, line: 'It is not true that the 8 is worth 1,000.', falseLine: 'It is not true that the 8 is worth 8,000.' },
    { name: 'N5a missing factor, enclosing negation', pkg: () => missingFactor(2, 1340), line: 'It is not true that the missing number is 671.', falseLine: 'It is not true that the missing number is 670.' },
    { name: 'N5b missing factor, continuation', pkg: () => missingFactor(2, 1340), line: 'The missing number is 671 minus 1.', falseLine: 'The missing number is 671 plus 1.' },
    { name: 'N6 column, unread division', pkg: tickets, line: '1 thousand is 2 thousands divided by 2.', falseLine: '1 thousand is 2 thousands divided by 1.' },
  ];
  for (const stream of [false, true]) {
    for (const c of cases) {
      it(`binding: ${c.name}: the true sentence is said (${stream ? 'voice' : 'chat'})`, async () => {
        const r = await call(c.pkg(), c.line, 'Help me please.', stream, fakeMathReviewer());
        expect(r.out.say).toContain(c.line);
      });
      it(`control: ${c.name}: the false twin is never said (${stream ? 'voice' : 'chat'})`, async () => {
        const r = await call(c.pkg(), c.falseLine, 'Help me please.', stream, fakeMathReviewer(() => ({ verdict: 'false', reason: 'false' })));
        expect(r.out.say).not.toContain(c.falseLine);
        expect(r.parts).not.toContain(c.falseLine);
      });
    }
    it(`control: a full false claim is still refused by code (${stream ? 'voice' : 'chat'})`, async () => {
      for (const [pkg, line] of [[placeValue(), 'The 8 is worth 800.'], [missingFactor(2, 1340), 'The missing number is 671.'], [tickets(), '1 thousand is 2 thousands.']] as const) {
        const r = await call(pkg, line, 'Help me please.', stream, fakeMathReviewer());
        expect(r.out.say, line).not.toContain(line);
      }
    });
  }
});
