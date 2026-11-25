// The parts of a shape that come from the list of its questions, for a space that is small enough to list for each one.
import { pick } from "../hash";
import type { Item, Shape } from "./shape";

interface SmallSpace<L, Q> {
  /** Every question of the limits, in the order of its tables. */
  list(limits: L): Q[];
  item(question: Q): Item<Q>;
  difficulty(question: Q): number;
  /** The characters of the longest number: more is wider. */
  width(question: Q): number;
  /** What tells two forms apart, for a shape with more than one. */
  form?(question: Q): string;
}

export function smallSpace<L, Q>({ list, item, difficulty, width, form }: SmallSpace<L, Q>): Pick<Shape<L, Q>, "list" | "generate" | "count" | "difficulty" | "difficultyRange" | "worstCase" | "forms"> {
  const widest = (questions: readonly Q[]): Item<Q> => item(questions.reduce((most, q) => (width(q) > width(most) ? q : most)));
  return {
    list, difficulty,
    generate(limits, seed) {
      const all = list(limits);
      return item(all[pick(seed, all.length)]);
    },
    count: (limits) => list(limits).length,
    difficultyRange(limits) {
      const scores = list(limits).map(difficulty);
      return { easiest: Math.min(...scores), hardest: Math.max(...scores) };
    },
    worstCase: (limits) => widest(list(limits)),
    ...(form && { forms(limits: L) {
      const all = list(limits);
      return [...new Set(all.map(form))].map((one) => widest(all.filter((q) => form(q) === one)));
    } }),
  };
}
