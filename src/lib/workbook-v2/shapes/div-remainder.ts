// Division of a number up to 89 by 2 to 9, with one digit in the quotient: 37 ÷ 4 = 9 R1. The quotient is 0, and the
// dividend less than the divisor, only when the limits allow a quotient of 0.
import { answerLine } from "../contract";
import { answerOf, divisionSteps, faceOf, FORMS, identity, partsOf, readDivisionLimits, readRemainder, remainderRange, workLinesOf, type DivisionForm, type DivisionQuestion, type RemainderLimit } from "./division";
import { solveDivision } from "./division-rows";
import { tableRank } from "./facts";
import { readLimitFields, within, type Item, type Range, type Shape } from "./shape";
import { smallSpace } from "./small-space";

export interface DivRemainderLimits { dividend: Range; divisors: number[]; quotient: Range; remainder: RemainderLimit; form: DivisionForm }

const DIVIDENDS: Range = { min: 1, max: 89 };
const DIVISORS: Range = { min: 2, max: 9 };
const QUOTIENTS: Range = { min: 0, max: 9 };
const WIDEST: Omit<DivRemainderLimits, "form"> = { dividend: DIVIDENDS, divisors: [2, 3, 4, 5, 6, 7, 8, 9], quotient: QUOTIENTS, remainder: "any" };

const item = (question: DivisionQuestion): Item<DivisionQuestion> => ({ question, answer: answerOf(question) });
const isZero = ({ dividend, divisor }: DivisionQuestion) => dividend < divisor;

/** The questions of each divisor, the dividend rising. */
function list({ dividend: dividends, divisors, quotient: quotients, remainder, form }: DivRemainderLimits): DivisionQuestion[] {
  const [remainders, parts] = [remainderRange(remainder), partsOf(remainder)];
  const out: DivisionQuestion[] = [];
  for (const divisor of divisors) {
    for (let quotient = quotients.min; quotient <= quotients.max; quotient++) {
      for (let rest = remainders.min; rest <= remainders.max && rest < divisor; rest++) {
        const dividend = quotient * divisor + rest;
        if (within(dividend, dividends)) out.push({ dividend, divisor, form, parts });
      }
    }
  }
  return out;
}

/** From the first difference on: something left, a quotient of 0, the harder table, then the larger dividend. */
function difficulty(q: DivisionQuestion): number {
  return (q.dividend % q.divisor > 0 ? 4000 : 0) + (isZero(q) ? 2000 : 0) + tableRank(q.divisor) * 100 + q.dividend;
}

export const divRemainder: Shape<DivRemainderLimits, DivisionQuestion> = {
  id: "div.remainder",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readDivisionLimits<DivRemainderLimits>(
    readLimitFields(raw, { dividend: DIVIDENDS, quotient: QUOTIENTS }, { form: FORMS }, { divisors: DIVISORS }, { remainder: readRemainder }),
    WIDEST, (l) => list(l).length,
  ),
  ...smallSpace({ list, item, difficulty, width: (q: DivisionQuestion) => String(q.dividend).length }),
  answer: answerOf,
  solveAgain: (rows) => solveDivision(rows, ({ dividend, divisor, quotient }) => within(dividend, DIVIDENDS) && within(divisor, DIVISORS) && within(quotient, QUOTIENTS)),
  steps: (q) => divisionSteps(q, answerLine(answerOf(q))),
  face: (q) => faceOf(q, workLinesOf(q)),
  identity,
};
