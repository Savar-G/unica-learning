// Division facts: 35 ÷ 5 = with nothing left, up to 100 ÷ 10. `divisors` is the set of tables. An ordered row prints one
// table in order, one quotient after the other. A divisor is never 0 or 1. A dividend of 0 comes only with a quotient of 0.
import { faceOf, FORMS, identity, readDivisionLimits, swappedOf, type DivisionForm, type DivisionQuestion } from "./division";
import { solveDivision } from "./division-rows";
import { tableRank, tableRuns, type FactOrder } from "./facts";
import { readLimitFields, wholeNumber, within, type Item, type Range, type Shape } from "./shape";
import { smallSpace } from "./small-space";

export interface DivFactLimits { divisors: number[]; quotient: Range; order: FactOrder; form: DivisionForm }

const DIVISORS: Range = { min: 2, max: 10 };
const QUOTIENTS: Range = { min: 0, max: 10 };
const ALL_DIVISORS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const quotientOf = ({ dividend, divisor }: DivisionQuestion): number => dividend / divisor;
const answer = (q: DivisionQuestion) => wholeNumber(quotientOf(q));
const item = (question: DivisionQuestion): Item<DivisionQuestion> => ({ question, answer: answer(question) });

function table(divisor: number, { quotient, form }: DivFactLimits): DivisionQuestion[] {
  const out: DivisionQuestion[] = [];
  for (let n = quotient.min; n <= quotient.max; n++) out.push({ dividend: divisor * n, divisor, form, parts: 1 });
  return out;
}
const tables = (limits: DivFactLimits): DivisionQuestion[][] => limits.divisors.map((divisor) => table(divisor, limits));

export const divFact: Shape<DivFactLimits, DivisionQuestion> = {
  id: "div.fact",
  version: 1,
  answerKind: "whole-number",
  readLimits: (raw) => readDivisionLimits<DivFactLimits>(
    readLimitFields(raw, { quotient: QUOTIENTS }, { order: ["mixed", "up", "down"], form: FORMS }, { divisors: DIVISORS }),
    { divisors: ALL_DIVISORS, quotient: QUOTIENTS }, (l) => tables(l).flat().length,
  ),
  ...smallSpace({
    list: (limits: DivFactLimits) => tables(limits).flat(), item,
    // From the first difference on: the harder table (2, 10 and 5 first, then by size), then the larger quotient.
    difficulty: (q: DivisionQuestion) => tableRank(q.divisor) * 11 + quotientOf(q),
    // The largest divisor and the largest quotient of the limits are one question, which is the widest in each number.
    width: (q: DivisionQuestion) => q.dividend * 100 + q.divisor,
  }),
  answer,
  solveAgain: (rows) => solveDivision(rows, ({ dividend, divisor, quotient, parts }) => parts === 1 && within(divisor, DIVISORS) && within(quotient, QUOTIENTS) && dividend <= 100),
  /** A child knows the product, so the fact is worked in lines. */
  steps(q) {
    const quotient = quotientOf(q);
    return [`${q.divisor} × ${quotient} = ${q.dividend}`, `${q.dividend} ÷ ${q.divisor} = ${quotient}`, String(quotient)].map((text) => ({ text, marks: [] }));
  },
  face: (q) => faceOf(q, 0),
  identity,
  orderedRuns: (limits, items) => tableRuns(tables(limits), limits.order, items),
  swapped: (question, limits) => swappedOf(question, (turned) => turned.form === limits.form && limits.divisors.includes(turned.divisor) && within(quotientOf(turned), limits.quotient)),
};
