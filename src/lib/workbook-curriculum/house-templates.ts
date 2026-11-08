// Unica's own Challenge templates (Savar, 2026-11-03): hard templates with a number answer and more than one step, for
// the U16 day steps whose Challenge had one medium template only. A Challenge prints 3 cards a day on the day's step
// (D-228), each harder than that day's practice (Codex at 24751f16, B3), so these steps needed 3 hard ones. They are
// appended to Cedric's templates of the step when the curriculum loads; his data stays as he wrote it. Each is logged in
// data/curriculum/author-changes.md ("Unica Challenge templates"). The step's name is checked, so a renumbered step
// (Cedric's v2, PR #508) fails the curriculum test instead of taking a template that is not its own.
import type { CurriculumData, CurriculumStep, StepTemplate } from "./types";

export interface HouseTemplates {
  skill: string;
  step: number;
  /** Stories for a stories page (any place), not the Challenge's: absent means Challenge-only. */
  stories?: boolean;
  /** The step's name when these were written: the curriculum test fails when it changes. */
  name: string;
  templates: readonly StepTemplate[];
}

const hard = (format: StepTemplate["format"], text: string, answer: string, slots: Record<string, string>, derived: Record<string, string>, check: string): StepTemplate =>
  ({ format, difficulty: "hard", text, answer, slots, derived, check });

/** Unica's Challenge templates are the Challenge's (and Show what you know's): no practice or story page takes one. */
const CHALLENGE_ONLY = new WeakSet<StepTemplate>();
export const isChallengeOnly = (t: StepTemplate): boolean => CHALLENGE_ONLY.has(t);

const medium = (text: string, answer: string, slots: Record<string, string>, derived: Record<string, string>, check: string): StepTemplate =>
  ({ format: "story", difficulty: "medium", text, answer, slots, derived, check });

export const HOUSE_TEMPLATES: readonly HouseTemplates[] = [
  // Compare stories for a U16 stories page (Savar, 2026-11-04: join, take-away and compare on one page; the steps U16
  // reaches with Grade 5 numbers tell joins and take-aways only).
  {
    skill: "4.4-subtract-within-10000", step: 5, name: "Take away from 10 000, then check", stories: true,
    templates: [medium("{name} scores {a} points. A friend scores {c} points. How many more points does {name} score?", "a - c", { b0: "template_b0", c0: "template_c0" }, { a: "max(b0, c0)", c: "min(b0, c0)" }, "max(b0, c0) - min(b0, c0) >= 100 and min(b0, c0) >= 1000")],
  },
  {
    skill: "4.4-add-within-10000", step: 5, name: "Story problems", stories: true,
    templates: [medium("{name} has {a} stickers and wants {s}. How many more stickers does {name} need?", "s - a", { u1: "u1", u2: "u2", u3: "u3", u4: "u4", u5: "u5", u6: "u6", u7: "u7", u8: "u8" }, { a: "1000 + u1 * 400 + u2 * 40 + u3 * 4 + u4", s: "1000 + u1 * 400 + u2 * 40 + u3 * 4 + u4 + 1000 + u5 * 300 + u6 * 30 + u7 * 3 + u8" }, "s <= 9999")],
  },
  {
    skill: "5.1-place-value-million", step: 1, name: "Value of a digit to 10 000s",
    templates: [
      hard("missing", "{n} + 1000 + 100 = __", "n + 1100", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n >= 50000 and n <= 98899"),
      hard("bare", "In {n}, what is the value of the thousands digit plus the value of the tens digit?", "n // 1000 % 10 * 1000 + n // 10 % 10 * 10", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n >= 50000"),
      hard("story", "{name}'s bike lock code is {n}. {They} adds 1000 to it, then takes 10 off. What is the new code?", "n + 990", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n <= 99009"),
    ],
  },
  {
    skill: "5.1-place-value-million", step: 2, name: "Value of a digit to 100 000s",
    templates: [
      hard("missing", "{n} + 10000 + 1000 = __", "n + 11000", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n >= 500000 and n <= 988999"),
      hard("bare", "What is the value of the ten thousands digit of {n} plus the value of its hundreds digit?", "n // 10000 % 10 * 10000 + n // 100 % 10 * 100", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n >= 500000"),
      hard("story", "{name}'s town has {n} people. {add} people move in and 1000 people move away. How many people live in the town now?", "n + add - 1000", { n0: "value" }, { n: "n0", add: "(n0 % 3 + 1) * 10000" }, "'0' not in str(n) and n + add <= 999999"),
    ],
  },
  {
    skill: "5.1-place-value-million", step: 3, name: "Zeros as placeholders",
    templates: [
      hard("missing", "{n} + 100 + 10 = __", "n + 110", { n0: "value" }, { n: "n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)" }, "n >= 500000 and n <= 999889"),
      hard("bare", "In {n}, what is the value of the hundred thousands digit plus the value of the thousands digit?", "n // 100000 % 10 * 100000 + n // 1000 % 10 * 1000", { n0: "value" }, { n: "n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)" }, "n // 1000 % 10 > 0 and n >= 500000"),
      hard("story", "{name}'s school collects {n} cans for recycling. It collects {add} more and sends 100 away. How many cans does the school have now?", "n + add - 100", { n0: "value" }, { n: "n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)", add: "(n0 % 9 + 1) * 1000" }, "n + add <= 999999"),
    ],
  },
  {
    skill: "5.9-multiply-tens", step: 1, name: "One multiple of 10",
    templates: [
      hard("bare", "What is {a} × {b} + {a} × {c}?", "a * (b + c)", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0 // 10 * 10", c: "(b0 % 9 + 1) * 10" }, "b0 >= 10 and a >= 2 and a * (b + c) >= 4500 and a * (b + c) <= 9000"),
      hard("missing", "{a} × __ = {p} - {q}", "b", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0 // 10 * 10", q: "(a0 % 5 + 1) * 100", p: "a * b + q" }, "b0 >= 10 and a >= 2 and p >= 4500 and p <= 9000"),
      hard("story", "{name}'s shop has {a} boxes with {b} {things} in each. It sells {c} {things}. How many {things} are left?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0 // 10 * 10", c: "a * b // 2 // 10 * 10" }, "b0 >= 10 and a >= 2 and c > 0"),
    ],
  },
  {
    skill: "5.9-multiply-tens", step: 2, name: "Two multiples of 10",
    templates: [
      hard("bare", "What is {a} × {b} - {c}?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0 // 10 * 10", b: "b0 // 10 * 10", c: "(a0 % 9 + 1) * 100" }, "a0 >= 10 and b0 >= 10 and a * b - c >= 41000"),
      hard("missing", "__ × {a} = {p} + {q}", "b", { a0: "operand1", b0: "operand2" }, { a: "a0 // 10 * 10", b: "b0 // 10 * 10", q: "(b0 % 7 + 1) * 100", p: "a * b - q" }, "a0 >= 10 and b0 >= 10 and a * b - q >= 41000"),
      hard("story", "{name}'s school orders {a} boxes with {b} {things} in each. It gives away {c} {things}. How many {things} does the school have now?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0 // 10 * 10", b: "b0 // 10 * 10", c: "a * b // 4 // 10 * 10" }, "a0 >= 10 and b0 >= 10 and c > 0"),
    ],
  },
  {
    skill: "5.9-multiply-tens", step: 3, name: "Facts that end in zero",
    templates: [
      hard("bare", "What is {a} × {b} + {c}?", "a * b + c", { a0: "operand1", b0: "operand2" }, { at: "5 if a0 % 2 == 0 else 2 * (a0 // 10 % 4 + 1)", bt: "2 * (1 + b0 // 10 % 45) if a0 % 2 == 0 else 5 * (1 + b0 // 10 % 18)", a: "at * 10", b: "bt * 10", c: "(b0 % 9 + 1) * 100" }, "b0 >= 10 and a * b + c >= 4100 and a * b + c <= 8100"),
      hard("missing", "{p} - __ = {a} × {b}", "c", { a0: "operand1", b0: "operand2" }, { at: "5 if a0 % 2 == 0 else 2 * (a0 // 10 % 4 + 1)", bt: "2 * (1 + b0 // 10 % 45) if a0 % 2 == 0 else 5 * (1 + b0 // 10 % 18)", a: "at * 10", b: "bt * 10", c: "(a0 % 9 + 1) * 10", p: "a * b + c" }, "b0 >= 10 and a * b + c >= 4100 and a * b + c <= 8100"),
      hard("story", "{name}'s school sends {k} full buses of {a} people to a game, and {c} people leave early. How many people are still at the game?", "a * k - c", { a0: "operand1", b0: "operand2" }, { at: "5 if a0 % 2 == 0 else 2 * (a0 // 10 % 4 + 1)", bt: "2 * (1 + b0 // 10 % 45) if a0 % 2 == 0 else 5 * (1 + b0 // 10 % 18)", a: "at * 10", b: "bt * 10", k: "bt % 9 + 2", c: "a * k // 5 // 10 * 10" }, "b0 >= 10 and c > 0"),
      hard("story", "A game gives {a} points for each level. {name} plays {k} levels, then loses {c} points. How many points does {name} have now?", "a * k - c", { a0: "operand1", b0: "operand2" }, { at: "5 if a0 % 2 == 0 else 2 * (a0 // 10 % 4 + 1)", bt: "2 * (1 + b0 // 10 % 45) if a0 % 2 == 0 else 5 * (1 + b0 // 10 % 18)", a: "at * 10", b: "bt * 10", k: "bt % 9 + 2", c: "(a0 % 9 + 1) * 10" }, "b0 >= 10 and c < a * k"),
    ],
  },
  {
    skill: "5.9-distributive", step: 1, name: "3-digit × 1-digit with an area model",
    templates: [
      hard("bare", "What is {a} × {b} - {c}?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0", c: "(a0 % 9 + 1) * 10" }, "'0' not in str(a0) and a * b - c >= 5000"),
      hard("missing", "{a} × __ = {p} + {q}", "b", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0", q: "(a0 % 5 + 1) * 10", p: "a * b - q" }, "'0' not in str(a0) and a * b - q >= 5000"),
      // (Its story is Cedric's v2 hard template, "A school orders {a} boxes of {b} pencils and {c} boxes of {d} pencils".)
    ],
  },
  {
    skill: "5.9-distributive", step: 2, name: "Zeros and trades",
    templates: [
      hard("bare", "What is {a} × {b} + {c}?", "a * b + c", { a0: "operand1", b0: "operand2" }, { a: "a0 // 100 * 100 + a0 % 10", b: "b0", c: "(a0 % 9 + 1) * 10" }, "a0 >= 100 and a0 % 10 > 0 and a * b + c >= 5000 and a * b + c <= 9999"),
      hard("missing", "__ × {b} = {p} - {q}", "a", { a0: "operand1", b0: "operand2" }, { a: "a0 // 100 * 100 + a0 % 10", b: "b0", q: "(b0 % 5 + 1) * 10", p: "a * b + q" }, "a0 >= 100 and a0 % 10 > 0 and p >= 5000 and p <= 9999"),
      hard("story", "{name}'s farm packs {a} eggs each day for {b} days. It sells {c} eggs. How many eggs does the farm have now?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0 // 100 * 100 + a0 % 10", b: "b0", c: "a * b // 2 // 10 * 10" }, "a0 >= 100 and a0 % 10 > 0 and c > 0"),
    ],
  },
  {
    skill: "5.10-pattern-rule", step: 1, name: "Increasing rule",
    templates: [
      hard("bare", "A pattern starts at {s} and adds {d} each time. What is its 8th term plus its 2nd term?", "2 * s + 8 * d", { s: "start", d: "step" }, {}, "2 * s + 8 * d >= 100 and 2 * s + 8 * d <= 200"),
      hard("missing", "A pattern starts at {s} and adds __ each time. Its 9th term is {t}.", "d", { s: "start", d: "step" }, { t: "s + 8 * d" }, "t >= 100 and t <= 200"),
      hard("story", "{name} has {s} {things} and gets {d} more each day. How many {things} does {name} have after 8 days?", "s + 8 * d", { s: "start", d: "step" }, {}, "s + 8 * d >= 100 and s + 8 * d <= 200"),
    ],
  },
];

/**
 * Code's two-step Challenge cards (Savar, 2026-11-03: "for U4, if a day is still short, code-built two-step cards from
 * the day's own step, only as the last fill"): two operations on the step's own numbers, to the top of its range. The
 * generator takes them only for a Challenge, after the step's own templates (step-items: isTwoStep).
 */
const TWO_STEP = new WeakSet<StepTemplate>();
export const isTwoStep = (t: StepTemplate): boolean => TWO_STEP.has(t);
/** The levels whose number steps get two-step Challenge cards. */
export const TWO_STEP_LEVELS: ReadonlySet<string> = new Set(["U4"]);
function twoStepTemplates(step: CurriculumStep): StepTemplate[] {
  // A likelihood step has no numbers to add: its last cards reason from a bag's cubes to never, sometimes or always.
  if (/likelihood/.test(step.skill)) {
    const slots = { a: "two_step", b: "two_step" };
    const made = [
      hard("choose", "A bag has only {a} blue cubes. {name} picks one cube without looking. It is red. Circle never, sometimes or always.", "'never'", slots, {}, "a >= 2 and b >= 2"),
      hard("choose", "A bag has {a} red cubes and {b} blue cubes. {name} picks one cube without looking. It is red. Circle never, sometimes or always.", "'sometimes'", slots, {}, "a >= 2 and b >= 2"),
      hard("choose", "A bag has only {a} red cubes. {name} picks one cube without looking. It is red. Circle never, sometimes or always.", "'always'", slots, {}, "a >= 2 and b >= 2"),
    ];
    for (const t of made) TWO_STEP.add(t);
    return made;
  }
  const ranges = Object.values(step.numbers ?? {}).flatMap((d) => (Array.isArray(d) ? [] : [d as { min: number; max: number }]));
  const top = Math.max(0, ...ranges.map((r) => r.max));
  // (A number step to 20 at most whose ranges are whole numbers: no likelihood or picture step.)
  if (top < 6 || top > 20 || ranges.some((r) => !Number.isInteger(r.min) || !Number.isInteger(r.max))) return [];
  const slots = { a: "two_step", b: "two_step", c: "two_step" };
  const made = [
    hard("bare", "What is {a} + {b} + {c}?", "a + b + c", slots, {}, `a >= 2 and a + b + c <= ${top} and a + b + c >= ${Math.ceil(top / 2)}`),
    hard("missing", "{a} - {b} + {c} = __", "a - b + c", slots, {}, `b < a and a - b + c <= ${top} and a >= ${Math.ceil(top / 2)}`),
    hard("missing", "{a} is {b} and {c} and __", "a - b - c", slots, {}, `b + c < a and a >= ${Math.ceil(top / 2)}`),
    hard("story", "{name} has {a} {things}. {They} gets {b} more, then {c} more. How many {things} does {name} have now?", "a + b + c", slots, {}, `a >= 2 and b >= 2 and c >= 2 and a + b + c <= ${top}`),
    hard("story", "{name} has {a} {things}. {They} gives {b} away, then gets {c} more. How many {things} does {name} have now?", "a - b + c", slots, {}, `a >= ${Math.ceil(top / 2)} and b >= 2 and c >= 2 and b < a and a - b + c <= ${top}`),
  ];
  for (const t of made) TWO_STEP.add(t);
  return made;
}

/** The curriculum data with Unica's templates appended to their steps. Throws when a step is missing or renamed. */
export function withHouseTemplates(data: CurriculumData, house: readonly HouseTemplates[] = HOUSE_TEMPLATES): CurriculumData {
  const byKey = new Map(house.map((h) => [`${h.skill}#${h.step}`, h]));
  const found = new Set<string>();
  const twoStepSkills = new Set(data.skills.filter((k) => TWO_STEP_LEVELS.has(k.level)).map((k) => k.id));
  const steps = data.steps.map((s): CurriculumStep => {
    const h = byKey.get(`${s.skill}#${s.number}`);
    if (!h && twoStepSkills.has(s.skill)) {
      const two = twoStepTemplates(s);
      if (!two.length) return s;
      const top = /likelihood/.test(s.skill) ? 9 : Math.max(...Object.values(s.numbers ?? {}).flatMap((d) => (Array.isArray(d) ? [] : [(d as { max: number }).max])));
      return { ...s, numbers: { ...s.numbers, two_step: { min: 1, max: top } }, templates: [...(s.templates ?? []), ...two] };
    }
    if (!h) return s;
    if (s.name !== h.name) throw new Error(`Unica templates for ${h.skill} step ${h.step} were written for "${h.name}", not "${s.name}"`);
    found.add(`${s.skill}#${s.number}`);
    if (!h.stories) for (const t of h.templates) CHALLENGE_ONLY.add(t);
    return { ...s, templates: [...(s.templates ?? []), ...h.templates] };
  });
  const missing = [...byKey.keys()].filter((k) => !found.has(k));
  if (missing.length) throw new Error(`Unica templates name steps the curriculum does not have: ${missing.join(", ")}`);
  return { ...data, steps };
}

/**
 * Shorter words for U4's long templates and U16's hundreds-place question. Each keeps its slots, answer, difficulty
 * and task. Only the named level changes; other levels keep Cedric's words. U4's part-part-whole form prints the
 * given parts and whole without a picture note. The source text is checked: a changed template is not rewritten.
 * Logged in data/curriculum/author-changes.md ("Unica's shorter U4 wording").
 */
export interface LevelRewrite { level: number; skill: string; step: number; template: number; from: string; to: string }

export const LEVEL_REWRITES: readonly LevelRewrite[] = [
  { level: 16, skill: "5.1-place-value-million", step: 3, template: 2, from: "What is the value of the digit in the hundreds place of {n}?", to: "{n}: value of the hundreds digit?" },
  { level: 4, skill: "K3-part-part-whole", step: 3, template: 1, from: "(picture: part {sa}, part {sb}, whole {sc}) Find the missing number.", to: "Parts {sa}, {sb}. Whole {sc}." },
  { level: 4, skill: "K5-two-more-less", step: 3, template: 3, from: "{name} has {s} {things}. {name} gets 2 more. How many {things} does {name} have now?", to: "{name} has {s} {things} and gets 2 more. How many {things} now?" },
  { level: 4, skill: "K1-count-scattered", step: 3, template: 4, from: "{name} counts {c} {things} in a circle and says {a}. Is that right? If not, say the right number.", to: "{c} {things} in a circle. {name} counts {a}. Right? If not, fix it." },
  ...[1, 2, 3].map((step) => ({ level: 4, skill: "1.2-decompose-within-10", step, template: 3, from: "{name} has {w} {things}. {p} of them {be} red and the rest are blue. How many are blue?", to: "{w} {things}: {p} red, the rest blue. How many are blue?" })),
  ...[1, 2].map((step) => ({ level: 4, skill: "1.1-subitize-to-10", step, template: 2, from: "True or false: if you count {n} {things}, the last number you say is {shown}.", to: "True or false: counting {n} {things}, you end on {shown}." })),
  ...[1, 2].map((step) => ({ level: 4, skill: "1.1-subitize-to-10", step, template: 3, from: "{name} has {n} {things}. {name} gets 1 more. How many {things} now?", to: "{name} has {n} {things} and gets 1 more. How many {things} now?" })),
  { level: 4, skill: "1.1-count-to-20", step: 1, template: 1, from: "Count on: {s}, __, __. What are the next two numbers?", to: "Count on: {s}, __, __." },
  { level: 4, skill: "1.1-count-to-20", step: 2, template: 1, from: "Count on: {s}, __, __. What are the next two numbers?", to: "Count on: {s}, __, __." },
  { level: 4, skill: "1.1-count-to-20", step: 1, template: 5, from: "Count on: {s}, __, __, __, __. Write the next four numbers.", to: "Count on: {s}, __, __, __, __." },
  { level: 4, skill: "1.1-count-to-20", step: 2, template: 5, from: "Count on: {s}, __, __, __, __. Write the next four numbers.", to: "Count on: {s}, __, __, __, __." },
  { level: 4, skill: "1.1-count-to-20", step: 3, template: 1, from: "Count back: {s}, __, __. What are the next two numbers?", to: "Count back: {s}, __, __." },
  { level: 4, skill: "1.1-count-to-20", step: 3, template: 5, from: "Count back: {s}, __, __, __, __. Write the next four numbers.", to: "Count back: {s}, __, __, __, __." },
  { level: 4, skill: "1.1-count-to-20", step: 1, template: 2, from: "{name} counts {things}. {name} says {s}. What does {name} say next?", to: "{name} counts {things}: {s}. What comes next?" },
  { level: 4, skill: "1.1-count-to-20", step: 2, template: 2, from: "{name} counts {things}. {name} says {s}. What does {name} say next?", to: "{name} counts {things}: {s}. What comes next?" },
  { level: 4, skill: "1.1-count-to-20", step: 3, template: 2, from: "{name} counts down from {s} at the rink. What does {name} say next?", to: "{name} counts back: {s}. What comes next?" },
  { level: 4, skill: "1.1-count-to-20", step: 1, template: 4, from: "Which number comes right after {s}: {x} or {y}?", to: "After {s}: {x} or {y}?" },
  { level: 4, skill: "1.1-count-to-20", step: 2, template: 4, from: "Which number comes right after {s}: {x} or {y}?", to: "After {s}: {x} or {y}?" },
  { level: 4, skill: "1.1-count-to-20", step: 3, template: 4, from: "Which number comes right before {s}: {x} or {y}?", to: "Before {s}: {x} or {y}?" },
  { level: 4, skill: "1.1-subitize-to-10", step: 3, template: 3, from: "{name} has {w} {things}. {p} are red and the rest are blue. How many are blue?", to: "{w} {things}: {p} red, the rest blue. How many blue?" },
  { level: 4, skill: "1.10-likelihood-words", step: 1, template: 1, from: "{name} says {animals} can drive a car. Circle never, sometimes or always.", to: "Can {animals} drive a car?" },
  { level: 4, skill: "1.10-likelihood-words", step: 1, template: 3, from: "The sun will rise tomorrow. Circle never, sometimes or always.", to: "The sun will rise tomorrow. How often?" },
  { level: 4, skill: "1.10-likelihood-words", step: 1, template: 4, from: "{name} thinks about this: {ev}. Circle never, sometimes or always.", to: "{ev}. How often?" },
  { level: 4, skill: "1.10-likelihood-words", step: 1, template: 5, from: "{st}. Is that never, sometimes or always?", to: "{st}. How often?" },
  { level: 4, skill: "K3-part-part-whole", step: 3, template: 5, from: "Out of {w} {things}, {name} puts {p} in a {container}. {name} says the rest is {claim}. Is that right? If not, say how many.", to: "{w} {things}. {p} put away. {claim} left out? Fix if wrong." },
  { level: 4, skill: "K3-make-10", step: 3, template: 5, from: "{name} has {p} {things} and wants {w}. How many more?", to: "{p} {things}. How many more make {w}?" },
  { level: 4, skill: "K5-two-more-less", step: 3, template: 5, from: "{name} says 2 more than {s} is {claim}. Is that right? If not, say the right number.", to: "2 more than {s} is {claim}. Right? Fix if wrong." },
  { level: 4, skill: "K1-write-numerals", step: 3, template: 4, from: "{name} wrote {a} for the number {n}. Is that right? If not, write the right number.", to: "{name} writes {a} for {n}. Right? Fix if wrong." },
  { level: 4, skill: "1.2-decompose-within-10", step: 1, template: 5, from: "{name} says {w} is {a} and {claim}. Is that right? If not, write what goes with {a}.", to: "{w} is {a} and {claim}. Right? Fix if wrong." },
  { level: 4, skill: "1.2-decompose-within-10", step: 2, template: 5, from: "{name} says {w} is {a} and {claim}. Is that right? If not, write what goes with {a}.", to: "{w} is {a} and {claim}. Right? Fix if wrong." },
  { level: 4, skill: "K5-two-more-less", step: 3, template: 1, from: "What is 2 more than {s}?", to: "2 more than {s}?" },
  { level: 4, skill: "K1-number-sequence", step: 3, template: 1, from: "What comes just after {n}?", to: "What comes after {n}?" },
  { level: 4, skill: "K1-number-sequence", step: 3, template: 4, from: "What comes just before {n}? A) {x}  B) {y}", to: "Before {n}? A) {x} B) {y}" },
  { level: 4, skill: "K1-number-sequence", step: 3, template: 5, from: "{name} counts up and says {n}, then {m}. Which number did {name} skip?", to: "{name} counts up: {n}, then {m}. What was skipped?" },
];

/** A template as a book of this level prints it: Unica's shorter words where there are some, else Cedric's. */
export function templateAtLevel(level: number, step: CurriculumStep, index: number, t: StepTemplate): StepTemplate {
  const r = LEVEL_REWRITES.find((x) => x.level === level && x.skill === step.skill && x.step === step.number && x.template === index + 1 && x.from === t.text);
  return r ? { ...t, text: r.to } : t;
}
