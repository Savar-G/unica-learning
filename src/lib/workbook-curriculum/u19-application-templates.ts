import type { StepTemplate } from "./types";

export interface ApplicationTemplateEntry {
  skill: string;
  step: number;
  name: string;
  templates: readonly StepTemplate[];
}

/** Later practice transfers the rule to a constraint, a changed situation or a claim. */
export const U19_APPLICATION_TEMPLATES: readonly ApplicationTemplateEntry[] = [
  {
    skill: "6.4-divisibility", step: 1, name: "Last-digit rules: 2, 5, 10",
    templates: [
      { format: "story", difficulty: "medium",
        text: "A hall has {n} chairs. Which row size uses every chair with no remainder: 2 chairs or 5 chairs? Write the row size.",
        answer: "2 if n % 2 == 0 else 5", slots: { base: "template_n0", f: "template_f" },
        derived: { n: "base - base % 10 + (2 if f == 0 else 5)" } },
      { format: "missing", difficulty: "medium",
        text: "A ticket code begins with {prefix}. Put one digit after it so the complete code is divisible by 10. Write the missing digit.",
        answer: "(10 - (prefix * 10) % 10) % 10", slots: { base: "template_n0" },
        derived: { prefix: "base // 10" }, check: "prefix >= 1" },
      { format: "true-false", difficulty: "medium",
        text: "There are {n} stickers in complete packs of 5. One sticker is removed. True or false: the {left} remaining stickers can be split into two equal groups.",
        answer: "'true' if left % 2 == 0 else 'false'", slots: { base: "template_n0", f: "template_f" },
        derived: { n: "base - base % 10 + 5 * f", left: "n - 1" }, check: "n >= 10" },
      { format: "bare", difficulty: "medium",
        text: "Three cards show {a}, {b} and {c}. How many of these numbers can be divided by 2 with no remainder?",
        answer: "(1 if a % 2 == 0 else 0) + (1 if b % 2 == 0 else 0) + (1 if c % 2 == 0 else 0)",
        slots: { a: "template_n0" }, derived: { b: "a + 1", c: "a + 2" } },
    ],
  },
  {
    skill: "6.4-divisibility", step: 2, name: "Digit-sum rules: 3 and 9",
    templates: [
      { format: "missing", difficulty: "medium",
        text: "A three-digit code starts with {prefix}. Choose its last digit from 0 to 8 so the code is divisible by 9. Write that digit.",
        answer: "(9 - (prefix // 10 + prefix % 10) % 9) % 9", slots: { n: "template_n" },
        derived: { prefix: "10 + n % 90" } },
      { format: "true-false", difficulty: "medium",
        text: "{n} is divisible by 3. Add {added} to get {total}. True or false: the new total is also divisible by 3.",
        answer: "'true' if total % 3 == 0 else 'false'", slots: { base: "template_n", f: "template_f" },
        derived: { n: "base - base % 3", added: "3 if f == 0 else 1", total: "n + added" }, check: "n >= 100" },
      { format: "story", difficulty: "medium",
        text: "A club has {n} members. One member is absent. Can the {left} members present form groups of 3 with nobody remaining? Write yes or no.",
        answer: "'yes' if left % 3 == 0 else 'no'", slots: { base: "template_n", f: "template_f" },
        derived: { n: "base - base % 3 + f", left: "n - 1" }, check: "left >= 100" },
      { format: "choose", difficulty: "medium",
        text: "A game accepts only codes divisible by 9. Which code will it accept: {a}, {b} or {c}? Write the code.",
        answer: "valid", slots: { n: "template_n", f: "template_f", g: "template_g" },
        derived: { valid: "n - n % 9", pos: "f + g", a: "valid if pos == 0 else valid + 1", b: "valid if pos == 1 else valid + 2", c: "valid if pos == 2 else valid + 3" },
        check: "valid >= 100" },
    ],
  },
  {
    skill: "6.4-divisibility", step: 3, name: "Rules for 4, 6 and 8",
    templates: [
      { format: "story", difficulty: "medium",
        text: "A warehouse has {n} bolts. One bolt is removed for testing. Can the {left} remaining bolts fill packs of 8 with no remainder? Write yes or no.",
        answer: "'yes' if left % 8 == 0 else 'no'", slots: { base: "template_n", f: "template_f" },
        derived: { n: "base - base % 8 + (1 if f == 0 else 2)", left: "n - 1" }, check: "left >= 1000" },
      { format: "true-false", difficulty: "medium",
        text: "{n} is divisible by 6. Add {added} to get {total}. True or false: the new total is also divisible by 6.",
        answer: "'true' if total % 6 == 0 else 'false'", slots: { base: "template_n", f: "template_f" },
        derived: { n: "base - base % 6", added: "6 if f == 0 else 3", total: "n + added" }, check: "n >= 1000" },
      { format: "bare", difficulty: "medium",
        text: "Three labels show {a}, {b} and {c}. How many of these numbers are divisible by 4?",
        answer: "(1 if a % 4 == 0 else 0) + (1 if b % 4 == 0 else 0) + (1 if c % 4 == 0 else 0)",
        slots: { n: "template_n", f: "template_f" },
        derived: { a: "n - n % 4 + 2 * f", b: "a + 2", c: "a + 4" }, check: "a >= 1000" },
      { format: "choose", difficulty: "medium",
        text: "{name} says every even number is divisible by 6. Which of these even numbers proves the claim wrong: {a} or {b}? Write the number.",
        answer: "wrong", slots: { n: "template_n", f: "template_f" },
        derived: { valid: "n - n % 6", wrong: "valid + 2", a: "valid if f == 0 else wrong", b: "wrong if f == 0 else valid" }, check: "valid >= 1000" },
    ],
  },
  ...([1, 2] as const).map((step): ApplicationTemplateEntry => {
    const slots = step === 1 ? { a: "number1", b: "number2", f: "flip" }
      : { a: "number1", b: "number2", f: "template_f" };
    const limit = step === 1 ? 24 : 72;
    const check = `a != b and lcm(a, b) <= ${limit} and lcm(a, b) >= ${step === 1 ? 6 : 36}`;
    return { skill: "6.4-lcm", step, name: step === 1 ? "List multiples" : "Two-digit numbers", templates: [
      { format: "story", difficulty: "medium",
        text: "Red beads come in packs of {a}. Blue beads come in packs of {b}. Buy at least one complete pack of each colour, with the same number of beads of each colour. What is the smallest number of beads of each colour you can buy?",
        answer: "lcm(a, b)", slots, check },
      { format: "true-false", difficulty: "medium",
        text: "One light flashes every {a} seconds and another every {b} seconds. Both flash at zero seconds. True or false: both flash at {c} seconds.",
        answer: "'true' if c % a == 0 and c % b == 0 else 'false'", slots,
        derived: { c: "lcm(a, b) if f == 0 else lcm(a, b) - 1" }, check },
      { format: "choose", difficulty: "medium",
        text: "A ribbon must be cut into equal pieces of either {a} cm or {b} cm, with no ribbon remaining. Which length works for both piece sizes: {p} cm or {q} cm? Write the length in centimetres.",
        answer: "lcm(a, b)", slots,
        derived: { p: "lcm(a, b) if f == 0 else lcm(a, b) - 1", q: "lcm(a, b) - 1 if f == 0 else lcm(a, b)" }, check },
      { format: "missing", difficulty: "medium",
        text: "A robot marks every {a} steps. Another marks every {b} steps. Both start at zero. Write the first positive step number that both robots mark.",
        answer: "lcm(a, b)", slots, check },
    ] };
  }),
  {
    skill: "6.13-classify-angles", step: 1, name: "Acute, right and obtuse",
    templates: [
      { format: "story", difficulty: "medium",
        text: "A door starts closed, then opens until the angle between the door and its closed position is {opening}. What kind of angle is it now? Write acute or obtuse.",
        answer: "'acute' if f == 0 else 'obtuse'", slots: { f: "flip" },
        derived: { opening: "'less than a square corner' if f == 0 else 'greater than a square corner but less than a straight angle'" } },
      { format: "choose", difficulty: "medium",
        text: "A folding stand needs an obtuse opening. Which setting meets that condition? A) {a} B) {b}. Write A or B.",
        answer: "'A' if f == 0 else 'B'", slots: { f: "flip", k: "template_k_3" },
        derived: { target: "'wider than a square corner but less than a straight angle'", other: "'less than a square corner' if k == 0 else 'exactly a square corner'", a: "target if f == 0 else other", b: "other if f == 0 else target" } },
      { format: "true-false", difficulty: "medium",
        text: "{name} labels an opening as acute. The opening is {opening}. True or false: the label is correct.",
        answer: "'true' if f == 0 else 'false'", slots: { f: "flip", k: "template_k_3" },
        derived: { opening: "'less than a square corner' if f == 0 else ('exactly a square corner' if k == 0 else 'wider than a square corner but less than a straight angle')" } },
      { format: "bare", difficulty: "medium",
        text: "A pattern has {a} acute angles, {r} right angles and {b} obtuse angles. How many of these angles are not square corners?",
        answer: "a + b", slots: { k: "template_k", f: "flip" },
        derived: { a: "1 + k % 2", r: "1 + f", b: "1 + (k + 1) % 2" } },
    ],
  },
  {
    skill: "6.13-classify-angles", step: 2, name: "Straight and reflex",
    templates: [
      { format: "story", difficulty: "medium",
        text: "A robot turns in one direction through {turn}. What kind of angle has it turned through? Write straight or reflex.",
        answer: "'straight' if f == 0 else 'reflex'", slots: { f: "flip" },
        derived: { turn: "'exactly half a turn' if f == 0 else 'more than half a turn but less than a full turn'" } },
      { format: "choose", difficulty: "medium",
        text: "A pointer must turn through a reflex angle. Which instruction works? A) {a} B) {b}. Write A or B.",
        answer: "'A' if f == 0 else 'B'", slots: { f: "flip", k: "template_g" },
        derived: { target: "'turn more than half a turn but less than a full turn'", other: "'turn exactly half a turn' if k == 0 else 'turn less than half a turn'", a: "target if f == 0 else other", b: "other if f == 0 else target" } },
      { format: "true-false", difficulty: "medium",
        text: "{name} calls a turn reflex because it is bigger than a square corner. The turn is {turn}. True or false: the turn is reflex.",
        answer: "'true' if f == 0 else 'false'", slots: { f: "flip", k: "template_g" },
        derived: { turn: "'more than half a turn but less than a full turn' if f == 0 else ('exactly half a turn' if k == 0 else 'more than a quarter turn but less than half a turn')" } },
      { format: "bare", difficulty: "medium",
        text: "A display has {a} straight angles and {b} reflex angles. How many angles in the display are at least half a turn but less than a full turn?",
        answer: "a + b", slots: { k: "template_k", f: "flip" },
        derived: { a: "1 + k % 2", b: "1 + f" } },
    ],
  },
];
