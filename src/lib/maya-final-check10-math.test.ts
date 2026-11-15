// Final check 10, part 2 (true math, 2026-11-15, head 484f5b9bc): four findings and two retained ones, fail closed.
// N1: "6, with a negative sign." on 3 × 2 was credited right: the clause after the comma was skipped.
// N2: "Twenty hundred is 2000." passed with no review (the claim reader valued a run the standard reader cannot), and
//     "My answer is two thousand two thousand." got an invented verdict (4000, wrong).
// N3: a repair that changed only "." to "!" started a new math review after a terminal false, error or time-out.
// N4: "10000 minus 2001 is seven thousand nine hundred ninety-nine." was refused (the column reader read 7000).
// Retained N04: "One and a half is three halves." was refused (0.5 compared with 1.5).
// Retained N08: "In 48,942, the value of the 8 is greater than 1,000." was refused (8 compared with 1000).
// Rule: one standard number-word reader for every path; a reader refuses only a clause it reads in full; a partial read
// is unread and goes to the math review; a terminal review result holds for every surface form of its sentence.
// Synthetic packages only (repo builders and gate fixtures), local review clients, no paid call.
import { describe, expect, it } from 'vitest';
import { conversationalFake, reply } from '@/lib/maya-model-fake';
import { aiMathReviewer, fakeMathReviewer, type MathReviewer } from '@/lib/maya-math-review';
import { fakeTalkReviewer } from '@/lib/maya-talk-review';
import { SAMPLE_PACKAGES } from '@/lib/maya-samples';
import { createTextSession } from '@/lib/maya-text';
import { teachingPackage } from '@/lib/maya-teaching';
import { storedPlaceValue } from '@/lib/maya-teaching/place-value-samples';
import { FIXTURES } from '@/lib/maya-gate/fixtures';
import { workedSteps, type Operation, type OperationPackage } from '@/lib/question-package';
import { createSession } from '@/lib/maya/session';
import { codeAlone, tutorKind, tutorStreamContext } from '@/lib/maya/tutor';
import { sentenceKey, standardNumber } from '@/lib/maya/say-check';

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
const fractions = () => tutorPackage((FIXTURES as Record<string, unknown>).COMPARE_FRACTIONS, 'fractions');
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

/** The production review adapter with a local client: true only when code's verdict on the child is "right". */
function verdictReader() {
  const inputs: { childAnswer: { value: unknown; verdict: string } | null }[] = [];
  const math = aiMathReviewer({
    model: 'local-verdict-reader',
    json: async (r: { content: { text: string }[] }) => {
      const x = JSON.parse(r.content[0].text);
      inputs.push(x);
      return x.childAnswer?.verdict === 'right' ? { verdict: 'true', reason: 'all true' } : { verdict: 'false', reason: 'no right answer' };
    },
  } as never);
  return { math, inputs };
}

describe('the one standard number-word reader', () => {
  it('values standard runs and refuses the rest', () => {
    expect(standardNumber('seven thousand nine hundred ninety-nine')).toBe(7999);
    expect(standardNumber('a hundred')).toBe(100);
    expect(standardNumber('twenty hundred')).toBeNull();
    expect(standardNumber('two thousand two thousand')).toBeNull();
  });
  it('keys a sentence by what it says, not its surface', () => {
    expect(sentenceKey('12 minus 8 is 4 with a negative sign.')).toBe(sentenceKey('12 Minus 8 is 4,  with a negative sign!'));
    expect(sentenceKey('Twelve minus eight is four.')).toBe(sentenceKey('12 minus 8 is 4'));
    expect(sentenceKey('12 minus 8 is 4.')).not.toBe(sentenceKey('12 minus 8 is 5.'));
  });
});

for (const stream of [false, true]) {
  const mode = stream ? 'voice' : 'chat';
  describe(`N1: a clause after the answer leaves it unread (${mode})`, () => {
    it('binding: "6, with a negative sign." gets no credit and no praise', async () => {
      const { math, inputs } = verdictReader();
      const r = await call(product(3, 2), 'Perfect!', '6, with a negative sign.', stream, math);
      expect(inputs[0]?.childAnswer?.verdict).not.toBe('right');
      expect(r.s.session.solved).toBeNull();
      expect(r.out.say).not.toContain('Perfect!');
      expect(r.parts).not.toContain('Perfect!');
    });
    it('control: "6" is right and the praise is said', async () => {
      const { math } = verdictReader();
      const r = await call(product(3, 2), 'Perfect!', '6', stream, math);
      expect(r.out.say).toEqual(['Perfect!']);
    });
  });

  describe(`N2: a number-word run with no standard value is unread (${mode})`, () => {
    it('binding: "Twenty hundred is 2000." goes to the math review', async () => {
      const pkg = tickets();
      const line = 'Twenty hundred is 2000.';
      expect(codeAlone(line, tutorStreamContext(pkg, 'Help me with 10000 minus 2001.', 'none', new Set()))).toBe(false);
      const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'an unread number run must be reviewed' }));
      const r = await call(pkg, line, 'Help me with 10000 minus 2001.', stream, math);
      expect(math.requests.length).toBeGreaterThan(0);
      expect(r.out.say).not.toContain(line);
      expect(r.parts).not.toContain(line);
    });
    it('binding: "My answer is two thousand two thousand." gets the verdict "unknown"', async () => {
      const math = fakeMathReviewer();
      await call(product(6, 440), 'Let us check that.', 'My answer is two thousand two thousand.', stream, math);
      expect(math.requests[0]?.childAnswer?.verdict).toBe('unknown');
      expect(math.requests[0]?.childAnswer?.value).toBeNull();
    });
    it('control: "My answer is two thousand six hundred forty." is right', async () => {
      const math = fakeMathReviewer();
      await call(product(6, 440), 'Let us check that.', 'My answer is two thousand six hundred forty.', stream, math);
      expect(math.requests[0]?.childAnswer).toMatchObject({ value: 2640, verdict: 'right' });
    });
  });

  describe(`N3: a terminal review result holds for every surface form (${mode})`, () => {
    for (const kind of ['false', 'error', 'timeout', 'retry-error'] as const) {
      it(`binding: a repair that changes only "." to "!" after ${kind} is not reviewed again`, async () => {
        const line = '12 minus 8 is 4 with a negative sign.';
        const repaired = '12 minus 8 is 4 with a negative sign!';
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
        const s = createTextSession({ callId: 'punctuation', package: SUB, tutor: true, clock: () => Date.now(), reviewTimeLimitMs: kind === 'timeout' ? 15 : 1000, mathReviewer: math, reviewer: fakeTalkReviewer(), model, ...(stream ? {} : { channel: 'chat' as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
        await s.start();
        parts.length = 0;
        const out = await s.child('Help me with 52 minus 28.');
        expect(first).toBe(1);
        expect(out.say).not.toContain(repaired);
        expect(parts).not.toContain(repaired);
        if (kind === 'retry-error') expect(retries).toBe(1);
      });
    }
  });

  describe(`N4 and the retained N04 and N08: a reader refuses only a clause it reads in full (${mode})`, () => {
    const cases: { name: string; pkg: () => OperationPackage; line: string; falseLine: string }[] = [
      { name: 'N4 a compound number word', pkg: tickets, line: '10000 minus 2001 is seven thousand nine hundred ninety-nine.', falseLine: '10000 minus 2001 is seven thousand nine hundred ninety-eight.' },
      { name: 'N04 a mixed number', pkg: fractions, line: 'One and a half is three halves.', falseLine: 'One and a half is five halves.' },
      { name: 'N08 the value of a digit, thousands', pkg: placeValue, line: 'In 48,942, the value of the 8 is greater than 1,000.', falseLine: 'In 48,942, the value of the 8 is less than 1,000.' },
      { name: 'N08 the value of a digit, hundreds', pkg: placeValue, line: 'In 48,942, the value of the 9 is greater than 100.', falseLine: 'In 48,942, the value of the 9 is less than 100.' },
    ];
    for (const c of cases) {
      it(`binding: ${c.name}: the true sentence is said`, async () => {
        const r = await call(c.pkg(), c.line, 'Help me please.', stream, fakeMathReviewer());
        expect(r.out.say).toContain(c.line);
      });
      it(`control: ${c.name}: the false sentence is never said`, async () => {
        const math = fakeMathReviewer(() => ({ verdict: 'false', reason: 'false' }));
        const r = await call(c.pkg(), c.falseLine, 'Help me please.', stream, math);
        expect(r.out.say).not.toContain(c.falseLine);
        expect(r.parts).not.toContain(c.falseLine);
      });
    }
    it('N4: the column reader no longer reads only "seven thousand"', () => {
      expect(tutorKind(tickets()).claimProblems(tickets(), '10000 minus 2001 is seven thousand nine hundred ninety-nine.')).toEqual([]);
    });
  });
}
