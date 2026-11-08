// The child's own work beside a topic claim's word (C3b), for A4's allow-list `ownWork` (claim.ts): a scale or
// minute-hand claim is an evaluate ("60 + 2 × 10"), so its own work is one of its parts ("60 plus 20 is 80"), and a
// child often gives two pieces of work joined by "and" ("6 times 3 is 18 and 18 is more than 16"). Both are allow-lists:
// every piece must be own work by A4's own check, or the equation of one part of the evaluate, with that part's own
// numbers and code's result. A speaker, a copy or any other text in any piece fails the whole. Pure TypeScript.
import { equivalent, type Operation } from "@/lib/question-package";
import { partProblems } from "./evaluate";
import { plainNumber, wholeTurn } from "./numbers";

/** The words between a part's numbers, by its operation, and whether they may come in either order. */
const PART_WORDS: Partial<Record<Operation["kind"], { words: string; swap: boolean }>> = {
  add: { words: "plus|and|\\+", swap: true },
  subtract: { words: "minus|take away|−|-", swap: false },
  multiply: { words: "times|x|×|multiplied by", swap: true },
  divide: { words: "divided by|÷", swap: false },
};

/** The text is the equation of one part of an evaluate operation: "<a> <sign word> <b> is <result>". */
function partSaid(text: string, operation: Operation): boolean {
  const body = wholeTurn(text);
  if (body === null) return false;
  return partProblems(operation).some((part) => {
    const op = PART_WORDS[part.operation.kind];
    if (!op || part.answer.type !== "number") return false;
    const m = new RegExp(`^(.+?)\\s+(?:${op.words})\\s+(.+?)\\s+(?:is|equals|makes|make|=)\\s+(.+)$`).exec(body);
    if (!m) return false;
    const [a, b, v] = [m[1], m[2], m[3]].map(plainNumber);
    const [x, y] = part.operation.operands as number[];
    const same = (p: number | null, q: number) => p !== null && equivalent({ type: "number", value: p }, { type: "number", value: q });
    return same(v, part.answer.value) && ((same(a, x) && same(b, y)) || (op.swap && same(a, y) && same(b, x)));
  });
}

/**
 * Topic-claim work that A4's `ownWork` does not read by itself: the text is a part of an evaluate claim, or two or more
 * pieces joined by "and" where each piece is `own` work or a part. `own` is A4's own check for one piece.
 */
export function topicOwnWork(text: string, operation: Operation, own: (piece: string) => boolean): boolean {
  const piece = (t: string) => partSaid(t, operation) || own(t);
  if (operation.kind === "evaluate" && partSaid(text, operation)) return true;
  const pieces = text.split(/,?\s+and\s+/i).map((t) => t.trim());
  return pieces.length > 1 && pieces.every((t) => t !== "" && piece(t));
}
