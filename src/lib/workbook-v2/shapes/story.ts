// A row of word problems. It is a shape like the others for the build, but its limits are not content of its own: they are
// the defined questions that the row names, bound to the scenario and the region pack of one book (themes/bind.ts). It is
// not in SHAPES, because the shape harness makes limits from data and a story needs the questions of its snapshot.
import { answerLine, type Answer, type FlowToken, type StoryFace, type Step } from "../contract";
import { pick, seedFrom } from "../hash";
import { choosePhrasing, fill, PLACEHOLDER } from "../themes/fill";
import { eachChoice, rangeCount, rangeValue, widestValues } from "../themes/ranges";
import { solve, type Expr } from "../themes/solver";
import type { DefinedQuestion, RegionPack, Scenario, SlotRange } from "../themes/types";
import type { Item, Shape } from "./shape";

export const STORY_SHAPE_ID = "story";

/** A defined question with the scenario and the region pack of a book, and the numbers that its slots can hold there. */
export interface BoundQuestion { question: DefinedQuestion; scenario: Scenario; pack: RegionPack; ranges: Readonly<Record<string, SlotRange>> }

/** The questions of a row for one book: those of its region, each with the scenario of its theme. */
export interface StoryLimits {
  /** The questions that the row names, of every region. */
  ids: readonly string[];
  interest: string;
  region: string;
  questions: readonly BoundQuestion[];
  /** The phrasings that the child has seen, each as `<question>/<phrasing>`: the choice takes another one while there is one. */
  seen: readonly string[];
}

/** One printed word problem: everything that its page and its answer need, as data. */
export interface StoryQuestion {
  question: string;
  phrasing: string;
  scenario: string;
  region: string;
  difficulty: number;
  /** The numbers in the order that the phrasing prints them. */
  slots: { name: string; value: number }[];
  solver: Expr;
  tokens: FlowToken[];
  unit: string;
}

const valuesOf = (question: StoryQuestion): Record<string, number> => Object.fromEntries(question.slots.map(({ name, value }) => [name, value]));

function answerOf(question: StoryQuestion): Answer {
  const solved = solve(question.solver, valuesOf(question));
  if (!solved.ok) throw new Error(`the question "${question.question}" cannot be solved: ${solved.problem}`);
  return { parts: [{ name: "answer", kind: "quantity", value: String(solved.value), unit: question.unit }] };
}

/** The word problem of a bound question with one phrasing and these numbers. A question that cannot fill is a fault: the snapshot was checked. */
export function storyItem({ question, scenario, pack }: BoundQuestion, phrasingIndex: number, values: Readonly<Record<string, number>>): Item<StoryQuestion> {
  const filled = fill(question, values, scenario, pack, phrasingIndex);
  if (!filled.ok) throw new Error(`the question "${question.id}" cannot be filled: ${filled.problem}`);
  const phrasing = question.phrasings[phrasingIndex];
  const order = phrasing.tokens.flatMap(({ text }) => [...text.matchAll(PLACEHOLDER)].map((m) => m[1])).filter((name) => Object.hasOwn(question.slots, name));
  const story: StoryQuestion = {
    question: question.id, phrasing: phrasing.id, scenario: scenario.id, region: pack.id, difficulty: question.difficulty,
    slots: order.map((name) => ({ name, value: values[name] })), solver: question.solver, tokens: filled.tokens, unit: filled.unit,
  };
  return { question: story, answer: answerOf(story) };
}

/** The question with the longest answer, so that the answer area is measured with it. */
export function longestAnswer(bound: BoundQuestion): Record<string, number> {
  let best = widestValues(bound.ranges);
  let length = 0;
  eachChoice(bound.ranges, (values) => {
    const solved = solve(bound.question.solver, values);
    if (solved.ok && String(solved.value).length > length) [best, length] = [values, String(solved.value).length];
    return true;
  });
  return best;
}

export const storyShape: Shape<StoryLimits, StoryQuestion> = {
  id: STORY_SHAPE_ID,
  version: 1,
  answerKind: "quantity",
  readLimits: () => ({ ok: false, problem: "a story row is read with the questions of its snapshot" }),
  generate(limits, seed) {
    const bound = limits.questions[pick(seedFrom(seed, "question"), limits.questions.length)];
    const values = Object.fromEntries(Object.entries(bound.ranges).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, range]) => [name, rangeValue(range, pick(seedFrom(seed, "slot", name), rangeCount(range)))]));
    const prefix = `${bound.question.id}/`;
    const seen = limits.seen.filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
    return storyItem(bound, choosePhrasing(bound.question, seedFrom(seed, "phrasing"), seen), values);
  },
  answer: answerOf,
  // A story is read again from its page by checks/story-answers.ts, which compares its numbers, its unit and its formula.
  solveAgain: () => null,
  steps(question) {
    const solved = solve(question.solver, valuesOf(question));
    if (!solved.ok) throw new Error(`the question "${question.question}" cannot be solved: ${solved.problem}`);
    const lines: Step[] = solved.lines.map((text) => ({ text, marks: [] }));
    return [...lines, { text: answerLine(answerOf(question)), marks: [] }];
  },
  difficulty: (question) => question.difficulty,
  difficultyRange: ({ questions }) => ({ easiest: Math.min(...questions.map((b) => b.question.difficulty)), hardest: Math.max(...questions.map((b) => b.question.difficulty)) }),
  worstCase: (limits) => storyItem(limits.questions[0], 0, widestValues(limits.questions[0].ranges)),
  forms: ({ questions }) => questions.flatMap((bound) => [storyItem(bound, 0, widestValues(bound.ranges)), storyItem(bound, 0, longestAnswer(bound))]),
  // A child calls a story with other numbers the same story: a sheet repeats a defined question only when it must.
  count: ({ questions }) => questions.length,
  identity: (question) => question.question,
  face: (question): StoryFace => ({ kind: "story", tokens: question.tokens, unit: question.unit, blank: "answer" }),
};
