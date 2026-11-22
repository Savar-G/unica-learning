// A warm-up fact as the writer's item shape (G1, item 4; #1213): code's operation, operands, text, an easier fact and
// one careless wrong answer. Pure TypeScript: no Next.js, React, network, database, clock or Math.random.
import type { AiItem } from "@/lib/workbook-generator-items";
import { itemNumber } from "@/lib/workbook-item-plan";
import type { WarmUpFact } from "@/lib/workbook-personal-items";

/** A code fact as the writer's item shape (G1, item 4): code's operation, operands, text and one careless wrong answer. */
export function factItem(id: string, f: WarmUpFact): AiItem {
  const [a, b] = f.operands;
  const right = f.kind === "add" ? a + b : f.kind === "subtract" ? a - b : f.kind === "multiply" ? a * b : a / b;
  const op = (x: number, y: number) => ({ kind: f.kind, operands: [itemNumber(x), itemNumber(y)], expression: null, unit: null, denominator: null, values: [] });
  const easier =
    f.kind === "divide"
      ? (right === 2 ? { text: "6 ÷ 2 = ?", operation: op(6, 2) } : { text: "4 ÷ 2 = ?", operation: op(4, 2) })
      : f.kind === "multiply"
        ? (right === 4 ? { text: "2 × 3 = ?", operation: op(2, 3) } : { text: "2 × 2 = ?", operation: op(2, 2) })
        : f.kind === "add"
          ? (right === 3 ? { text: "1 + 1 = ?", operation: op(1, 1) } : { text: "2 + 1 = ?", operation: op(2, 1) })
          : (right === 1 ? { text: "3 − 1 = ?", operation: op(3, 1) } : { text: "2 − 1 = ?", operation: op(2, 1) });
  return {
    slot: id, skill: f.skill, difficulty: f.difficulty ?? 1, text: f.text, format: "write-number", figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null, name: null, thing: null,
    operation: op(a, b), easier,
    wrongAnswers: [{ value: itemNumber(right + 1), cause: "careless", description: "One more than the answer.", step: null }], shownWrong: null,
  };
}
