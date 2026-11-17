// Unica's own Challenge templates: hard numeric work with more than one step, or named qualitative reasoning, for
// the U10, U16 and selected U19 day steps with too few hard templates. A Challenge prints 3 cards a day on the day's step
// (D-228), each harder than that day's practice (Codex at 24751f16, B3), so these steps needed 3 hard ones. They are
// appended to Cedric's templates of the step when the curriculum loads; his data stays as he wrote it. Each is logged in
// data/curriculum/author-changes.md ("Unica Challenge templates"). The step's name is checked, so a renumbered step
// (Cedric's v2, PR #508) fails the curriculum test instead of taking a template that is not its own.
import type { CurriculumData, CurriculumStep, StepTemplate } from "./types";
import { U10_APPLICATION_TEMPLATES } from "./u10-application-templates";
import { U19_APPLICATION_TEMPLATES } from "./u19-application-templates";

export interface HouseTemplates {
  skill: string;
  step: number;
  /** Stories for a stories page (any place), not the Challenge's: absent means Challenge-only. */
  stories?: boolean;
  /** The step's name when these were written: the curriculum test fails when it changes. */
  name: string;
  /**
   * These Challenge-only templates still count when the generator chooses a step for a stories page or a Solve it two
   * ways page, as they did before #744. Only the Grade 5 set that U16 books were reviewed with has it; new Challenge
   * templates leave it out, so adding one never moves another page to its step.
   */
  routes?: boolean;
  /** Extra normal practice forms, separate from this step's Challenge-only templates. */
  practice?: readonly StepTemplate[];
  /** Qualitative reasoning may use checked choices; other Challenge additions require a numeric result. */
  answerKind?: "number" | "choice";
  templates: readonly StepTemplate[];
}

const hard = (format: StepTemplate["format"], text: string, answer: string, slots: Record<string, string>, derived: Record<string, string>, check: string): StepTemplate =>
  ({ format, difficulty: "hard", text, answer, slots, derived, check });

/** Unica's Challenge templates are the Challenge's (and Show what you know's): no practice or story page takes one. */
const CHALLENGE_ONLY = new WeakSet<StepTemplate>();
export const isChallengeOnly = (t: StepTemplate): boolean => CHALLENGE_ONLY.has(t);
/** Numeric error examples must not replace ordinary divisibility practice or change its row layout. */
const SPOT_ONLY = new WeakSet<StepTemplate>();
const spotPractice = (t: StepTemplate): StepTemplate => { SPOT_ONLY.add(t); return t; };
export const isSpotOnly = (t: StepTemplate): boolean => SPOT_ONLY.has(t);
/** Authored reasoning forms for a later application page, kept separate from the first independent drills. */
const APPLICATION_PRACTICE = new WeakSet<StepTemplate>();
const applicationPractice = (t: StepTemplate): StepTemplate => { APPLICATION_PRACTICE.add(t); return t; };
export const isApplicationPractice = (t: StepTemplate): boolean => APPLICATION_PRACTICE.has(t);

/** Unica's Challenge-only templates that do not choose a page's step (all but the `routes` set). */
const NOT_ROUTED = new WeakSet<StepTemplate>();
/**
 * A step's templates for choosing a page's step (stories, Solve it two ways): every template except Unica's
 * Challenge-only ones, so adding a Challenge template never moves another page to that step (#744). The Grade 5 set
 * marked `routes` stays, as before #744.
 */
export const routingTemplates = (step: { templates?: readonly StepTemplate[] } | null | undefined): readonly StepTemplate[] =>
  (step?.templates ?? []).filter((t) => !NOT_ROUTED.has(t) && !SPOT_ONLY.has(t));

const medium = (text: string, answer: string, slots: Record<string, string>, derived: Record<string, string>, check: string): StepTemplate =>
  ({ format: "story", difficulty: "medium", text, answer, slots, derived, check });

/** Prime classification applied to a claim, a code requirement and equal grouping, within the same number range. */
function primePractice(upper: boolean): StepTemplate[] {
  const slots = { i: "template_i", j: "template_j", f: "template_flip" };
  const derived = upper
    ? { p: "[31, 37, 41, 43, 47, 53, 59, 61, 67][i]", c: "[51, 57, 77, 87, 91][j % 5]", d: "[3, 3, 7, 3, 7][j % 5]" }
    : { p: "[11, 13, 17, 19, 23, 29][j]", c: "[9, 15, 21, 25, 27][i]", d: "[3, 3, 3, 5, 3][i]" };
  return [
    { format: "true-false", difficulty: "medium", text: "{c} has a factor {d} besides 1 and itself. True or false: {claim}.",
      answer: "'true' if f == 0 else 'false'", slots,
      derived: { ...derived, claim: "str(c) + ' is composite' if f == 0 else str(c) + ' is prime'" } },
    applicationPractice({ format: "missing", difficulty: "medium", text: "One of {p} and {c} is composite. Find that number, then write its smallest factor greater than 1.",
      answer: "d", slots, derived }),
    applicationPractice({ format: "true-false", difficulty: "medium", text: "{name} says that {c} is prime because it is odd. True or false: {name} is correct.",
      answer: "'false'", slots, derived }),
    applicationPractice({ format: "story", difficulty: "medium", text: "A club has {c} members. They can form equal teams of {d}, with more than one team. Is {c} prime or composite? Write prime or composite.",
      answer: "'composite'", slots, derived }),
    applicationPractice({ format: "choose", difficulty: "medium", text: "A game code must have exactly two positive factors. Which code works: {p} or {c}?",
      answer: "str(p)", slots, derived }),
  ];
}

export const HOUSE_TEMPLATES: readonly HouseTemplates[] = [
  {
    skill: "6.13-classify-angles", step: 1, name: "Acute, right and obtuse",
    answerKind: "choice",
    // Extra teaching needs distinct definition checks after its examples and first practice use the original tasks.
    practice: [
      { format: "true-false", difficulty: "medium", text: "True or false: the {obj} makes {claim} angle.",
        answer: "'true' if f == 0 else 'false'", slots: { k: "template_k_2", f: "flip" },
        derived: { obj: "['corner of a book', 'corner of a door', 'tip of a thin pizza slice', 'tip of a sharp pencil', 'opening of a laptop tilted far back', 'opening of a book lying almost flat'][k]",
          kind: "['right', 'right', 'acute', 'acute', 'obtuse', 'obtuse'][k]", other: "'obtuse' if kind == 'acute' else 'acute'", chosen: "kind if f == 0 else other",
          claim: "'an acute' if chosen == 'acute' else ('an obtuse' if chosen == 'obtuse' else 'a right')" } },
      { format: "bare", difficulty: "medium", text: "There are {a} acute angles and {b} obtuse angles. How many of these angles are smaller than a square corner?",
        answer: "a", slots: { k: "template_k", f: "flip" }, derived: { a: "k + 1", b: "1 + (k + 1 + f) % 5" } },
    ],
    templates: [
      hard("bare", "An angle has two sides that meet at a point. Both sides are drawn longer without changing the opening between them. Does the angle stay the same size? Circle yes or no.", "'yes'", {}, {}, "True"),
      hard("compare", "Angle A has long sides and an opening smaller than a square corner. Angle B has short sides and an opening wider than a square corner but smaller than a straight angle. Which angle is larger? Circle A or B. A) Angle A B) Angle B", "'B'", {}, {}, "True"),
      hard("story", "{name} draws the two sides of an angle longer without changing the opening between them. {name} says the angle is now bigger. Is {name} right? Circle yes or no.", "'no'", {}, {}, "True"),
    ],
  },
  {
    skill: "6.4-prime-composite", step: 1, name: "Primes and composites to 30",
    practice: primePractice(false),
    templates: [
      hard("bare", "Add the prime numbers: {p}, {c}, {q}.", "p + q", { i: "template_i", j: "template_j" },
        { p: "[11, 13, 17, 19, 23, 29][j]", q: "[2, 3, 5, 7, 11][i]", c: "[9, 15, 21, 25, 27][i]" }, "p != q and p + q <= 30"),
      hard("missing", "One of these numbers is prime: {p} and {c}. Find the prime number, then subtract 2 from it. Write the result.", "p - 2", { i: "template_i", j: "template_j" },
        { p: "[11, 13, 17, 19, 23, 29][j]", c: "[9, 15, 21, 25, 27][i]" }, "p - 2 >= 2"),
      hard("story", "{name} has cards showing {p}, {c} and {q}. Find the two prime numbers. Subtract the smaller prime from the larger prime. What is the difference?", "p - q", { i: "template_i", j: "template_j" },
        { p: "[11, 13, 17, 19, 23, 29][j]", q: "[2, 3, 5, 7, 11][i]", c: "[9, 15, 21, 25, 27][i]" }, "p != q and p + q <= 30"),
    ],
  },
  {
    skill: "6.4-divisibility", step: 1, name: "Last-digit rules: 2, 5, 10",
    // Numeric normal practice keeps Spot the error on this step, without a generic division sum.
    practice: [
      spotPractice({ format: "bare", difficulty: "medium", text: "Write the multiple of 10 that is greater than {lo} and less than {hi}.",
        answer: "lo + 10", slots: { n: "template_n0" },
        derived: { lo: "n - n % 10", hi: "lo + 20" }, check: "hi <= 9999" }),
    ],
    templates: [
      hard("bare", "What is the smallest whole number greater than {n} that is divisible by both 2 and 5?", "n - n % 10 + 10", { n: "template_n0" }, {}, "n - n % 10 + 10 <= 9999"),
      hard("missing", "What is the greatest multiple of 10 that is less than {n}?", "((n - 1) // 10) * 10", { n: "template_n0" }, {}, "((n - 1) // 10) * 10 >= 10"),
      hard("story", "{name}'s score is greater than {lo} points and less than {top} points. The score is divisible by both 2 and 5. How many points does {name} have?", "n - n % 10 + 10", { n: "template_n0" },
        { lo: "n - n % 10 + 1", top: "n - n % 10 + 11" }, "top <= 9999"),
    ],
  },
  {
    skill: "6.4-divisibility", step: 2, name: "Digit-sum rules: 3 and 9",
    // Numeric normal practice keeps Spot the error on this step, without a generic division sum.
    practice: [
      spotPractice({ format: "bare", difficulty: "medium", text: "Write the multiple of 9 that is greater than {lo} and less than {hi}.",
        answer: "lo + 9", slots: { n: "template_n" },
        derived: { lo: "n - n % 9", hi: "lo + 18" }, check: "hi <= 9999" }),
    ],
    templates: [
      hard("bare", "Increase {n} to the next number divisible by 9. What is it?", "n - n % 9 + 9", { n: "template_n" }, {}, "n - n % 9 + 9 <= 9999"),
      hard("missing", "What is the smallest whole number greater than {n} that is divisible by 3 but not by 9?", "r if r % 9 != 0 else r + 3", { n: "template_n" },
        { r: "n - n % 3 + 3" }, "r + 3 <= 9999"),
      hard("story", "A lock code is a whole number greater than {lo} and less than {top}. It is divisible by 9. What is the code?", "n - n % 9 + 9", { n: "template_n" },
        { lo: "n - n % 9 + 1", top: "n - n % 9 + 10" }, "top <= 9999"),
    ],
  },
  {
    skill: "6.4-divisibility", step: 3, name: "Rules for 4, 6 and 8",
    // Numeric normal practice keeps Spot the error on this step, without a generic division sum.
    practice: [
      spotPractice({ format: "bare", difficulty: "medium", text: "Write the multiple of 8 that is greater than {lo} and less than {hi}.",
        answer: "lo + 8", slots: { n: "template_n" },
        derived: { lo: "n - n % 8", hi: "lo + 16" }, check: "hi <= 99999" }),
    ],
    templates: [
      hard("bare", "What is the smallest whole number greater than {n} that is divisible by both 4 and 6?", "n - n % 12 + 12", { n: "template_n" }, {}, "n - n % 12 + 12 <= 99999"),
      hard("missing", "The first multiple of both 6 and 8 after {n} is __.", "n - n % 24 + 24", { n: "template_n" }, {}, "n - n % 24 + 24 <= 99999"),
      hard("story", "A game score is greater than {lo} points and less than {top} points. It is divisible by both 4 and 8. How many points is the score?", "n - n % 8 + 8", { n: "template_n" },
        { lo: "n - n % 8 + 1", top: "n - n % 8 + 9" }, "top <= 99999"),
      // This step is the hardest on two consecutive days: its second set keeps the card-frame rule.
      hard("bare", "How many positive multiples of both 4 and 6 are below {n}?", "(n - 1) // 12", { n: "template_n" }, {}, "n > 12"),
      hard("missing", "What is the greatest whole number less than {n} that is divisible by both 6 and 8?", "((n - 1) // 24) * 24", { n: "template_n" }, {}, "n > 24"),
      hard("story", "{name}'s score is less than {n} points. It is divisible by both 4 and 6 but not by 8. What is the greatest number of points {name} could have?", "r if r % 8 != 0 else r - 12", { n: "template_n" },
        { r: "((n - 1) // 12) * 12" }, "r > 12"),
    ],
  },
  {
    skill: "6.4-prime-composite", step: 2, name: "Numbers to 100",
    practice: primePractice(true),
    templates: [
      hard("bare", "Add only the primes: {p}, {c}, {q}.", "p + q", { i: "template_i", j: "template_j" },
        { p: "[31, 37, 41, 43, 47][j % 5]", q: "[31, 37, 41, 43, 47][i % 5]", c: "[51, 57, 77, 87, 91][i % 5]" }, "p != q and p + q <= 100"),
      hard("missing", "One of these numbers is prime: {p} and {c}. Find the prime number, then add 31 to it. Write the result.", "p + 31", { i: "template_i", j: "template_j" },
        { p: "[31, 37, 41, 43, 47, 53, 59, 61, 67][i]", c: "[51, 57, 77, 87, 91][j % 5]" }, "p + 31 <= 100"),
      hard("story", "{name} has cards showing {p}, {c} and {q}. Add the two prime numbers, then subtract 31 from their sum. What is the result?", "p + q - 31", { i: "template_i", j: "template_j" },
        { p: "[31, 37, 41, 43, 47][j % 5]", q: "[31, 37, 41, 43, 47][i % 5]", c: "[51, 57, 77, 87, 91][i % 5]" }, "p != q and p + q - 31 <= 100"),
    ],
  },
  {
    skill: "6.4-lcm", step: 1, name: "List multiples",
    practice: [
      { format: "bare", difficulty: "medium", text: "What is the smallest positive number that is a multiple of both {a} and {b}?", answer: "lcm(a, b)",
        slots: { a: "number1", b: "number2" }, derived: {}, check: "a != b and lcm(a, b) <= 24" },
      { format: "missing", difficulty: "medium", text: "Find the smallest positive common multiple of {a} and {b}. Fill in the missing number: {a} × __.", answer: "lcm(a, b) // a",
        slots: { a: "number1", b: "number2" }, derived: {}, check: "a != b and lcm(a, b) <= 24" },
      { format: "true-false", difficulty: "medium", text: "True or false: the LCM of {a} and {b} is {c}.", answer: "'true' if f == 0 else 'false'",
        slots: { a: "number1", b: "number2", f: "flip" }, derived: { c: "lcm(a, b) if f == 0 else 2 * lcm(a, b)" },
        check: "a != b and c <= 24" },
      { format: "bare", difficulty: "medium", text: "The first list is {a}, {aa}, {aaa}. The second list is {b}, {bb}, {bbb}. Which number appears in both lists?", answer: "lcm(a, b)",
        slots: { a: "number1", b: "number2" }, derived: { aa: "2 * a", aaa: "3 * a", bb: "2 * b", bbb: "3 * b" },
        check: "a != b and aaa <= 24 and bbb <= 24 and lcm(a, b) <= min(aaa, bbb) and 2 * lcm(a, b) > min(aaa, bbb)" },
    ],
    templates: [
      hard("bare", "Find the two smallest positive common multiples of {a} and {b}. What is their sum?", "3 * lcm(a, b)", { i: "template_i" },
        { a: "[2, 2, 3, 4, 2][i % 5]", b: "[3, 4, 6, 8, 6][i % 5]" }, "3 * lcm(a, b) <= 24"),
      hard("missing", "Find the least common multiple of {a} and {b}. Subtract {a} from it. What is the result?", "lcm(a, b) - a", { i: "template_i" },
        { a: "[3, 4, 6, 6, 4][i % 5]", b: "[4, 6, 8, 9, 10][i % 5]" }, "lcm(a, b) - a > 0"),
      hard("story", "One bell rings every {a} seconds. Another bell rings every {b} seconds. They both ring now. How many seconds from now will they ring together for the second time, without counting now?", "2 * lcm(a, b)", { i: "template_i" },
        { a: "[2, 3, 4, 2, 3][i % 5]", b: "[3, 4, 6, 6, 6][i % 5]" }, "2 * lcm(a, b) <= 24"),
    ],
  },
  {
    skill: "6.4-lcm", step: 2, name: "Two-digit numbers",
    templates: [
      hard("bare", "Find the second smallest positive common multiple of {a} and {b}. Subtract {a} from it. What is the result?", "2 * lcm(a, b) - a", { i: "template_g0" },
        { a: "[9, 12, 12, 15, 18][i % 5]", b: "[12, 18, 16, 20, 24][i % 5]" }, "2 * lcm(a, b) - a <= 72"),
      hard("missing", "Count the positive multiples of {a} that are less than the least common multiple of {a} and {b}. How many are there?", "lcm(a, b) // a - 1", { i: "template_g0" },
        { a: "[9, 12, 12, 15, 18][i % 5]", b: "[12, 18, 16, 20, 24][i % 5]" }, "lcm(a, b) // a > 1"),
      hard("story", "One bell rings every {a} minutes. Another bell rings every {b} minutes. Both ring at minute {start} on a timer. At what minute on the timer will they next ring together?", "start + lcm(a, b)", { i: "template_g0" },
        { a: "[9, 12, 12, 15, 18][i % 5]", b: "[12, 18, 16, 20, 24][i % 5]", start: "i" }, "start + lcm(a, b) <= 72"),
    ],
  },
  {
    skill: "6.13-classify-angles", step: 2, name: "Straight and reflex", answerKind: "choice",
    practice: [
      { format: "true-false", difficulty: "medium", text: "True or false: {claim}.", answer: "'true' if f == 0 else 'false'",
        slots: { k: "template_k", f: "flip" }, derived: {
          claim: "['half a turn makes a straight angle', 'a reflex angle is less than one full turn', 'a straight angle is exactly half a turn', 'a reflex angle is more than half a turn'][k] if f == 0 else ['half a turn makes a reflex angle', 'a reflex angle is more than one full turn', 'a straight angle is more than half a turn', 'a reflex angle is less than half a turn'][k]" } },
      { format: "bare", difficulty: "medium", text: "There are {a} straight angles and {b} reflex angles. How many of these angles are greater than half a turn?", answer: "b",
        slots: { k: "template_k", f: "flip" }, derived: { a: "k + 1", b: "1 + (k + 1 + f) % 4" } },
    ],
    templates: [
      hard("bare", "A pointer makes two quarter turns in the same direction. What kind of angle has it turned through? Circle straight or reflex.", "'straight'", {}, {}, "True"),
      hard("compare", "A pointer makes half a turn, then a quarter turn in the same direction. What kind of angle has it turned through? Circle straight or reflex.", "'reflex'", {}, {}, "True"),
      hard("story", "{name} makes two half turns in the same direction. Has {name} made one full turn? Circle yes or no.", "'yes'", {}, {}, "True"),
    ],
  },
  {
    skill: "3.1-place-value-1000", step: 1, name: "Hundreds, tens and ones",
    templates: [
      hard("bare", "In {n}, add the hundreds value and the tens value. Then take away the ones digit.", "100 * nh + 10 * nt - no", { n0: "number" }, { nh: "5 + n0 % 4", nt: "2 + n0 // 10 % 8", no: "1 + n0 % 9", n: "100 * nh + 10 * nt + no" }, "n <= 899"),
      hard("missing", "{n} + 100 - 10 = __", "100 * (nh + 1) + 10 * (nt - 1) + no", { n0: "number" }, { nh: "5 + n0 % 4", nt: "2 + n0 // 10 % 8", no: "1 + n0 % 9", n: "100 * nh + 10 * nt + no" }, "n <= 899"),
      hard("story", "{name}'s code is {n}. Add 1 hundred and take away 1 ten. What is the new code?", "100 * (nh + 1) + 10 * (nt - 1) + no", { n0: "number" }, { nh: "5 + n0 % 4", nt: "2 + n0 // 10 % 8", no: "1 + n0 % 9", n: "100 * nh + 10 * nt + no" }, "n <= 899"),
    ],
  },
  {
    skill: "3.1-place-value-1000", step: 2, name: "Zero as a placeholder",
    practice: [
      { format: "missing", difficulty: "medium", text: "Complete the expanded form: {n} = {hundreds} + __.", answer: "rest",
        slots: { n0: "number", f: "template_flip" }, derived: {
          h: "n0 // 100", o: "1 + n0 % 9", hundreds: "100 * h", rest: "o if f == 0 else 10 * o", n: "hundreds + rest" } },
      { format: "bare", difficulty: "medium", text: "{name} writes {wrong} for {h} hundreds and {o} ones. Write the correct number.", answer: "100 * h + o",
        slots: { n0: "number" }, derived: { h: "n0 // 100", o: "1 + n0 % 9", wrong: "100 * h + 10 * o" } },
      { format: "bare", difficulty: "medium", text: "Keep {h} in the hundreds place. Put {o} and 0 in the other two places. Write the smaller number you can make.", answer: "100 * h + o",
        slots: { n0: "number" }, derived: { h: "n0 // 100", o: "1 + n0 % 9" } },
    ],
    templates: [
      hard("bare", "In {n}, replace the zero tens digit with {t}. What is the new number?", "100 * h + 10 * t + o", { n0: "number" }, { h: "3 + n0 % 6", t: "1 + n0 % 9", o: "1 + n0 // 10 % 9", n: "100 * h + o" }, "n <= 899"),
      hard("missing", "{n} + {t} tens - 100 = __", "100 * (h - 1) + 10 * t + o", { n0: "number" }, { h: "3 + n0 % 6", t: "1 + n0 % 9", o: "1 + n0 // 10 % 9", n: "100 * h + o" }, "n <= 899"),
      hard("story", "{name}'s lock code is {n}. Add {t} tens, then take away 1 hundred. What is the new code?", "100 * (h - 1) + 10 * t + o", { n0: "number" }, { h: "3 + n0 % 6", t: "1 + n0 % 9", o: "1 + n0 // 10 % 9", n: "100 * h + o" }, "n <= 899"),
    ],
  },
  {
    skill: "3.1-place-value-1000", step: 3, name: "Trading tens and ones (up to 19 tens)",
    templates: [
      hard("bare", "How many tens are in {h} hundreds and {t} tens?", "10 * h + t", { h0: "hundreds", t0: "tens" }, { h: "2 + h0 % 5", t: "10 + t0 % 10" }, "10 * h + t <= 99"),
      hard("missing", "{h} hundreds + {t} tens + {o} ones - 1 hundred = __", "100 * (h - 1) + 10 * t + o", { h0: "hundreds", t0: "tens", o0: "ones" }, { h: "2 + h0 % 5", t: "10 + t0 % 10", o: "10 + o0 % 10" }, "100 * h + 10 * t + o <= 999"),
      hard("story", "{name} has {h} boxes of 100 beads, {t} bags of 10 and {o} loose beads. {They} sells 1 box. How many beads are left?", "100 * (h - 1) + 10 * t + o", { h0: "hundreds", t0: "tens", o0: "ones" }, { h: "2 + h0 % 5", t: "10 + t0 % 10", o: "10 + o0 % 10" }, "100 * h + 10 * t + o <= 999"),
    ],
  },
  {
    skill: "3.1-estimate-quantity", step: 1, name: "Estimate with a group of 10 or 25",
    templates: [
      hard("bare", "Estimate the total of {a} groups with about {g} {things} each and {b} extra {things}.", "a * g + b", { g: "group_size", n0: "groups" }, { a: "3 + n0 % 6", b: "1 + n0 % 9" }, "a * g + b <= 250"),
      hard("missing", "{a} groups of about {g} {things}, and {b} extra {things}, make about __ {things}.", "a * g + b", { g: "group_size", n0: "groups" }, { a: "3 + n0 % 6", b: "1 + n0 % 9" }, "a * g + b <= 250"),
      hard("story", "{name} has {a} trays with about {g} {things} each. {They} removes {b} {things}. About how many remain?", "a * g - b", { g: "group_size", n0: "groups" }, { a: "3 + n0 % 6", b: "1 + n0 % 9" }, "a * g - b >= 20 and a * g - b <= 250"),
    ],
  },
  {
    skill: "3.1-estimate-quantity", step: 2, name: "Estimate with a group of 100",
    templates: [
      hard("bare", "There are {a} groups with about {g} cards in each group, and {b} extra cards. About how many cards are there?", "a * g + b", { g: "group_size", n0: "groups" }, { a: "3 + n0 % 5", b: "(1 + n0 % 5) * 10" }, "a * g + b <= 1000"),
      hard("missing", "{a} boxes hold about {g} cards each. Take away 1 box and {b} more cards. About __ cards are left.", "a * g - g - b", { g: "group_size", n0: "groups" }, { a: "3 + n0 % 5", b: "(1 + n0 % 5) * 10" }, "a * g - g - b >= 50"),
      hard("story", "There are {a} boxes with about {g} cards in each box. Someone takes {b} cards out of the boxes. About how many cards remain in the boxes?", "a * g - b", { g: "group_size", n0: "groups" }, { a: "3 + n0 % 5", b: "(1 + n0 % 5) * 10" }, "a * g - b >= 50 and a * g - b <= 1000"),
    ],
  },
  {
    skill: "3.1-estimate-quantity", step: 3, name: "Choose a sensible estimate",
    // A numeric correction stays on the estimation step, with the guide visible in Sam's printed task.
    practice: [
      spotPractice({ format: "bare", difficulty: "medium", text: "Use about {b} {guide} as a guide. {ask} Write the matching estimate.",
        answer: "str(b)", slots: { x: "choices" },
        derived: { i: "x % 5", v: "x // 5 % 8",
          b: "8 + v if i == 0 else (20 + 2 * v if i == 1 else (15 + v if i == 2 else (24 + 2 * v if i == 3 else 20 + v)))",
          guide: "'pencils per pencil case' if i == 0 else ('pages per picture book' if i == 1 else ('grapes per small bunch' if i == 2 else ('books per classroom shelf' if i == 3 else 'children per class')))",
          ask: "'About how many pencils fit in one pencil case?' if i == 0 else ('About how many pages are in one picture book?' if i == 1 else ('About how many grapes are in one small bunch?' if i == 2 else ('About how many books fit on one classroom shelf?' if i == 3 else 'About how many children are in one class?')))" } }),
    ],
    // The printed guide fixes this task's assumption. The child chooses its matching estimate, then scales it.
    // The choices rotate, so the sensible one is not always first.
    templates: [
      hard("bare", "Use about {b} children per class as a guide. Which is a sensible estimate for the number of children in one class: {p}, {q} or {r}? Use that estimate for each of two classes. About how many children are in the two classes?", "2 * b", { x: "choices", pos: "template_pos" }, { b: "20 + x % 8", t10: "b * 10", h100: "b * 100", p: "b if pos == 0 else (h100 if pos == 1 else t10)", q: "t10 if pos == 0 else (b if pos == 1 else h100)", r: "h100 if pos == 0 else (t10 if pos == 1 else b)" }, "h100 <= 3000"),
      hard("missing", "Use about {b} books per classroom shelf as a guide. Which is a sensible estimate for the number of books on one classroom shelf: {p}, {q} or {r}? Use that estimate for each of 3 shelves. About how many books are on the 3 shelves?", "3 * b", { x: "choices", pos: "template_pos" }, { b: "24 + 2 * (x % 4)", t10: "b * 10", h100: "b * 100", p: "b if pos == 0 else (h100 if pos == 1 else t10)", q: "t10 if pos == 0 else (b if pos == 1 else h100)", r: "h100 if pos == 0 else (t10 if pos == 1 else b)" }, "h100 <= 3000"),
      hard("story", "Use about {b} pages per short picture book as a guide. {name} reads 4 short picture books. Which is a sensible estimate for the number of pages in each book: {p}, {q} or {r}? Use that estimate to find about how many pages {name} reads.", "4 * b", { x: "choices", pos: "template_pos" }, { b: "20 + 2 * (x % 6)", t10: "b * 10", h100: "b * 100", p: "b if pos == 0 else (h100 if pos == 1 else t10)", q: "t10 if pos == 0 else (b if pos == 1 else h100)", r: "h100 if pos == 0 else (t10 if pos == 1 else b)" }, "h100 <= 3000"),
    ],
  },
  {
    skill: "3.6-increasing-pattern", step: 1, name: "Add 2, 5 or 10",
    practice: patternPractice(false),
    templates: [
      hard("bare", "Start at {a}. Add {d}, then add {d} again. What number do you reach?", "a + 2 * d", { a0: "start", d: "step" }, { a: "2 + a0 % 20" }, "a + 2 * d <= 100"),
      hard("missing", "Add the same amount each time: {a}, {b}, __, {e}. Write the missing number.", "a + 2 * d", { a0: "start", d: "step" }, { a: "2 + a0 % 20", b: "a + d", e: "a + 3 * d" }, "a + 3 * d <= 100"),
      hard("story", "{name} starts with {a} tiles. {They} adds {d} tiles each turn. How many tiles does {name} have after adding tiles on 3 turns?", "a + 3 * d", { a0: "start", d: "step" }, { a: "2 + a0 % 20" }, "a + 3 * d <= 100"),
    ],
  },
  {
    skill: "3.6-increasing-pattern", step: 2, name: "Other jumps",
    practice: patternPractice(false, 500),
    templates: [
      hard("bare", "Start at {a}. Add {d} four times. What number do you reach?", "a + 4 * d", { a0: "start", d: "step" }, { a: "3 + a0 % 90" }, "a + 4 * d <= 500"),
      hard("missing", "{a}, {b}, __, {e}, {f}. Each jump is equal. Write the missing term.", "a + 2 * d", { a0: "start", d: "step" }, { a: "3 + a0 % 90", b: "a + d", e: "a + 3 * d", f: "a + 4 * d" }, "a + 4 * d <= 500"),
      hard("story", "{name}'s display starts with {a} lights. Each new row adds {d} lights. How many lights are in the display after adding 3 new rows?", "a + 3 * d", { a0: "start", d: "step" }, { a: "3 + a0 % 90" }, "a + 3 * d <= 500"),
    ],
  },
  {
    skill: "3.6-decreasing-pattern", step: 1, name: "Take away 1, 2, 5 or 10",
    practice: [...patternPractice(true), { format: "choose", difficulty: "medium", text: "Start at {a} and subtract {d}. Which number do you reach: {p} or {q}?", answer: "str(right)",
      slots: { a0: "start", d: "step", flip: "template_flip" },
      derived: { a: "6 * d + 1 + a0 % (100 - 6 * d)", right: "a - d", wrong: "right + 1", p: "right if flip == 0 else wrong", q: "wrong if flip == 0 else right" }, check: "right >= 5" }],
    templates: [
      hard("bare", "Start at {a}. Take away {d} three times. What number is left?", "a - 3 * d", { a0: "start", d: "step" }, { a: "4 * d + 20 + a0 % (81 - 4 * d)" }, "a - 3 * d >= 2 and a <= 100"),
      hard("missing", "{a}, __, {c}, {e}. The same amount is taken away each time. Write the missing number.", "a - d", { a0: "start", d: "step" }, { a: "4 * d + 20 + a0 % (81 - 4 * d)", c: "a - 2 * d", e: "a - 3 * d" }, "a - 3 * d >= 2 and a <= 100"),
      hard("story", "A stack has {a} stamps. {name} takes out {d} each turn. How many stamps are in the stack after 4 turns?", "a - 4 * d", { a0: "start", d: "step" }, { a: "4 * d + 20 + a0 % (81 - 4 * d)" }, "a - 4 * d >= 2 and a <= 100"),
    ],
  },
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
    skill: "5.1-place-value-million", step: 1, name: "Value of a digit to 10 000s", routes: true,
    templates: [
      hard("missing", "{n} + 1000 + 100 = __", "n + 1100", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n >= 50000 and n <= 98899"),
      hard("bare", "In {n}, what is the value of the thousands digit plus the value of the tens digit?", "n // 1000 % 10 * 1000 + n // 10 % 10 * 10", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n >= 50000"),
      hard("story", "{name}'s bike lock code is {n}. {They} adds 1000 to it, then takes 10 off. What is the new code?", "n + 990", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n <= 99009"),
    ],
  },
  {
    skill: "5.1-place-value-million", step: 2, name: "Value of a digit to 100 000s", routes: true,
    templates: [
      hard("missing", "{n} + 10000 + 1000 = __", "n + 11000", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n >= 500000 and n <= 988999"),
      hard("bare", "What is the value of the ten thousands digit of {n} plus the value of its hundreds digit?", "n // 10000 % 10 * 10000 + n // 100 % 10 * 100", { n0: "value" }, { n: "n0" }, "'0' not in str(n) and n >= 500000"),
      hard("story", "{name}'s town has {n} people. {add} people move in and 1000 people move away. How many people live in the town now?", "n + add - 1000", { n0: "value" }, { n: "n0", add: "(n0 % 3 + 1) * 10000" }, "'0' not in str(n) and n + add <= 999999"),
    ],
  },
  {
    skill: "5.1-place-value-million", step: 3, name: "Zeros as placeholders", routes: true,
    templates: [
      hard("missing", "{n} + 100 + 10 = __", "n + 110", { n0: "value" }, { n: "n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)" }, "n >= 500000 and n <= 999889"),
      hard("bare", "In {n}, what is the value of the hundred thousands digit plus the value of the thousands digit?", "n // 100000 % 10 * 100000 + n // 1000 % 10 * 1000", { n0: "value" }, { n: "n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)" }, "n // 1000 % 10 > 0 and n >= 500000"),
      hard("story", "{name}'s school collects {n} cans for recycling. It collects {add} more and sends 100 away. How many cans does the school have now?", "n + add - 100", { n0: "value" }, { n: "n0 if '0' in str(n0) else n0 - n0 // (10 ** (1 + n0 % 4)) % 10 * 10 ** (1 + n0 % 4)", add: "(n0 % 9 + 1) * 1000" }, "n + add <= 999999"),
    ],
  },
  {
    skill: "5.9-multiply-tens", step: 1, name: "One multiple of 10", routes: true,
    templates: [
      hard("bare", "What is {a} × {b} + {a} × {c}?", "a * (b + c)", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0 // 10 * 10", c: "(b0 % 9 + 1) * 10" }, "b0 >= 10 and a >= 2 and a * (b + c) >= 4500 and a * (b + c) <= 9000"),
      hard("missing", "{a} × __ = {p} - {q}", "b", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0 // 10 * 10", q: "(a0 % 5 + 1) * 100", p: "a * b + q" }, "b0 >= 10 and a >= 2 and p >= 4500 and p <= 9000"),
      hard("story", "{name}'s shop has {a} boxes with {b} {things} in each. It sells {c} {things}. How many {things} are left?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0 // 10 * 10", c: "a * b // 2 // 10 * 10" }, "b0 >= 10 and a >= 2 and c > 0"),
    ],
  },
  {
    skill: "5.9-multiply-tens", step: 2, name: "Two multiples of 10", routes: true,
    templates: [
      hard("bare", "What is {a} × {b} - {c}?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0 // 10 * 10", b: "b0 // 10 * 10", c: "(a0 % 9 + 1) * 100" }, "a0 >= 10 and b0 >= 10 and a * b - c >= 41000"),
      hard("missing", "__ × {a} = {p} + {q}", "b", { a0: "operand1", b0: "operand2" }, { a: "a0 // 10 * 10", b: "b0 // 10 * 10", q: "(b0 % 7 + 1) * 100", p: "a * b - q" }, "a0 >= 10 and b0 >= 10 and a * b - q >= 41000"),
      hard("story", "{name}'s school orders {a} boxes with {b} {things} in each. It gives away {c} {things}. How many {things} does the school have now?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0 // 10 * 10", b: "b0 // 10 * 10", c: "a * b // 4 // 10 * 10" }, "a0 >= 10 and b0 >= 10 and c > 0"),
    ],
  },
  {
    skill: "5.9-multiply-tens", step: 3, name: "Facts that end in zero", routes: true,
    templates: [
      hard("bare", "What is {a} × {b} + {c}?", "a * b + c", { a0: "operand1", b0: "operand2" }, { at: "5 if a0 % 2 == 0 else 2 * (a0 // 10 % 4 + 1)", bt: "2 * (1 + b0 // 10 % 45) if a0 % 2 == 0 else 5 * (1 + b0 // 10 % 18)", a: "at * 10", b: "bt * 10", c: "(b0 % 9 + 1) * 100" }, "b0 >= 10 and a * b + c >= 4100 and a * b + c <= 8100"),
      hard("missing", "{p} - __ = {a} × {b}", "c", { a0: "operand1", b0: "operand2" }, { at: "5 if a0 % 2 == 0 else 2 * (a0 // 10 % 4 + 1)", bt: "2 * (1 + b0 // 10 % 45) if a0 % 2 == 0 else 5 * (1 + b0 // 10 % 18)", a: "at * 10", b: "bt * 10", c: "(a0 % 9 + 1) * 10", p: "a * b + c" }, "b0 >= 10 and a * b + c >= 4100 and a * b + c <= 8100"),
      hard("story", "{name}'s school sends {k} full buses of {a} people to a game, and {c} people leave early. How many people are still at the game?", "a * k - c", { a0: "operand1", b0: "operand2" }, { at: "5 if a0 % 2 == 0 else 2 * (a0 // 10 % 4 + 1)", bt: "2 * (1 + b0 // 10 % 45) if a0 % 2 == 0 else 5 * (1 + b0 // 10 % 18)", a: "at * 10", b: "bt * 10", k: "bt % 9 + 2", c: "a * k // 5 // 10 * 10" }, "b0 >= 10 and c > 0"),
      hard("story", "A game gives {a} points for each level. {name} plays {k} levels, then loses {c} points. How many points does {name} have now?", "a * k - c", { a0: "operand1", b0: "operand2" }, { at: "5 if a0 % 2 == 0 else 2 * (a0 // 10 % 4 + 1)", bt: "2 * (1 + b0 // 10 % 45) if a0 % 2 == 0 else 5 * (1 + b0 // 10 % 18)", a: "at * 10", b: "bt * 10", k: "bt % 9 + 2", c: "(a0 % 9 + 1) * 10" }, "b0 >= 10 and c < a * k"),
    ],
  },
  {
    skill: "5.9-distributive", step: 1, name: "3-digit × 1-digit with an area model", routes: true,
    templates: [
      hard("bare", "What is {a} × {b} - {c}?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0", c: "(a0 % 9 + 1) * 10" }, "'0' not in str(a0) and a * b - c >= 5000"),
      hard("missing", "{a} × __ = {p} + {q}", "b", { a0: "operand1", b0: "operand2" }, { a: "a0", b: "b0", q: "(a0 % 5 + 1) * 10", p: "a * b - q" }, "'0' not in str(a0) and a * b - q >= 5000"),
      // (Its story is Cedric's v2 hard template, "A school orders {a} boxes of {b} pencils and {c} boxes of {d} pencils".)
    ],
  },
  {
    skill: "5.9-distributive", step: 2, name: "Zeros and trades", routes: true,
    templates: [
      hard("bare", "What is {a} × {b} + {c}?", "a * b + c", { a0: "operand1", b0: "operand2" }, { a: "a0 // 100 * 100 + a0 % 10", b: "b0", c: "(a0 % 9 + 1) * 10" }, "a0 >= 100 and a0 % 10 > 0 and a * b + c >= 5000 and a * b + c <= 9999"),
      hard("missing", "__ × {b} = {p} - {q}", "a", { a0: "operand1", b0: "operand2" }, { a: "a0 // 100 * 100 + a0 % 10", b: "b0", q: "(b0 % 5 + 1) * 10", p: "a * b + q" }, "a0 >= 100 and a0 % 10 > 0 and p >= 5000 and p <= 9999"),
      hard("story", "{name}'s farm packs {a} eggs each day for {b} days. It sells {c} eggs. How many eggs does the farm have now?", "a * b - c", { a0: "operand1", b0: "operand2" }, { a: "a0 // 100 * 100 + a0 % 10", b: "b0", c: "a * b // 2 // 10 * 10" }, "a0 >= 100 and a0 % 10 > 0 and c > 0"),
    ],
  },
  {
    skill: "5.10-pattern-rule", step: 1, name: "Increasing rule", routes: true,
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
      hard("choose", "A bag has only {a} blue cubes. {name} picks one cube without looking. How often will the cube be red? Circle never, sometimes or always.", "'never'", slots, {}, "a >= 2 and b >= 2"),
      hard("choose", "A bag has {a} red cubes and {b} blue cubes. {name} picks one cube without looking. How often will the cube be red? Circle never, sometimes or always.", "'sometimes'", slots, {}, "a >= 2 and b >= 2"),
      hard("choose", "A bag has only {a} red cubes. {name} picks one cube without looking. How often will the cube be red? Circle never, sometimes or always.", "'always'", slots, {}, "a >= 2 and b >= 2"),
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
    hard("missing", "Split {a} into three parts. Two parts are {b} and {c}. What is the third part?", "a - b - c", slots, {}, `b + c < a and a >= ${Math.ceil(top / 2)}`),
    hard("story", "{name} has {a} {things}. {They} gets {b} more, then {c} more. How many {things} does {name} have now?", "a + b + c", slots, {}, `a >= 2 and b >= 2 and c >= 2 and a + b + c <= ${top}`),
    hard("story", "{name} has {a} {things}. {They} gives {b} away, then gets {c} more. How many {things} does {name} have now?", "a - b + c", slots, {}, `a >= ${Math.ceil(top / 2)} and b >= 2 and c >= 2 and b < a and a - b + c <= ${top}`),
  ];
  for (const t of made) TWO_STEP.add(t);
  return made;
}

/** Infer a rule or starting term as well as continuing the pattern. */
function patternPractice(down: boolean, maximum = 100): StepTemplate[] {
  const verb = down ? "takes away" : "adds";
  const command = down ? "take away" : "add";
  const difference = down ? "taken away" : "added";
  const slots = { a: "start", d: "step" };
  const derived = { b: down ? "a - d" : "a + d" };
  const check = `b > 0 and b <= ${maximum}`;
  return [
    { format: "missing", difficulty: "medium", text: `A pattern ${verb} {d} each time. Its second number is {b}. What is its first number?`,
      answer: "a", slots, derived, check },
    { format: "bare", difficulty: "medium", text: `The first two numbers in a pattern are {a} and {b}. How much is ${difference} each time?`,
      answer: "d", slots, derived, check },
    { format: "choose", difficulty: "medium", text: `A pattern begins {a}, {b}. Which rule fits? A) ${command} {oa}  B) ${command} {ob}. Write A or B.`,
      answer: "'A' if f == 0 else 'B'", slots: { ...slots, e: "step", f: "template_flip" },
      derived: { ...derived, oa: "d if f == 0 else e", ob: "e if f == 0 else d" }, check: `${check} and d != e` },
  ];
}

/** The curriculum data with Unica's templates appended to their steps. Throws when a step is missing or renamed. */
export function withHouseTemplates(data: CurriculumData, house: readonly HouseTemplates[] = HOUSE_TEMPLATES): CurriculumData {
  const byKey = new Map(house.map((h) => [`${h.skill}#${h.step}`, h]));
  const found = new Set<string>();
  const twoStepSkills = new Set(data.skills.filter((k) => TWO_STEP_LEVELS.has(k.level)).map((k) => k.id));
  const countBackSpot = spotPractice({ format: "bare", difficulty: "medium", text: "Count back by 1 from {s}. What number comes next?",
    answer: "s - 1", slots: { s: "start" } });
  const likelihoodPractice: StepTemplate[] = [
    { format: "choose", difficulty: "medium", text: "A bag has {r} red beads and {b} blue beads. Pick one without looking. Is picking red never, sometimes or always?",
      answer: "'never' if r == 0 else 'always' if b == 0 else 'sometimes'", slots: { r: "pick" }, derived: { b: "5 - r" }, check: "r != 1 and r != 4" },
    { format: "true-false", difficulty: "medium", text: "A bag has {r} red beads and {b} blue beads. Pick one without looking. True or false: you will always pick red.",
      answer: "'true' if b == 0 else 'false'", slots: { r: "pick" }, derived: { b: "5 - r" }, check: "r != 1 and r != 4" },
    { format: "story", difficulty: "medium", text: "A box contains {n} {colour} beads and no other beads. Pick one without looking. Is picking a {asked} bead never, sometimes or always?",
      answer: "'always' if f == 0 else 'never'", slots: { p: "pick", f: "flip" },
      derived: { n: "2 + p % 4", colour: "'red' if p % 2 == 0 else 'blue'", asked: "colour if f == 0 else ('blue' if p % 2 == 0 else 'red')" } },
  ];
  const steps = data.steps.map((source): CurriculumStep => {
    let s = source.skill === "1.1-count-to-20" && source.number === 3
      ? { ...source, templates: [...(source.templates ?? []), countBackSpot] } : source;
    if (source.skill === "1.10-likelihood-words" && source.number === 1) {
      if (source.name !== "Never, sometimes, always") throw new Error("Likelihood practice needs its named source step");
      s = { ...s, templates: [...(s.templates ?? []), ...likelihoodPractice] };
    }
    if (source.skill === "3.6-decreasing-pattern" && source.number === 2) {
      s = { ...s, templates: [...(s.templates ?? []), ...patternPractice(true, 500)] };
    }
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
    if (!h.stories) for (const t of h.templates) {
      CHALLENGE_ONLY.add(t);
      if (!h.routes) NOT_ROUTED.add(t);
    }
    return { ...s, templates: [...(s.templates ?? []), ...(h.practice ?? []), ...h.templates] };
  });
  const missing = [...byKey.keys()].filter((k) => !found.has(k));
  if (missing.length) throw new Error(`Unica templates name steps the curriculum does not have: ${missing.join(", ")}`);
  const applications = new Map([...U10_APPLICATION_TEMPLATES, ...U19_APPLICATION_TEMPLATES]
    .map(entry => [`${entry.skill}#${entry.step}`, entry]));
  return { ...data, steps: steps.map(step => {
    const entry = applications.get(`${step.skill}#${step.number}`);
    if (!entry) return step;
    if (entry.name !== step.name) throw new Error(`Application templates for ${entry.skill}#${entry.step} name a different step`);
    return { ...step, templates: [...(step.templates ?? []), ...entry.templates.map(applicationPractice)] };
  }) };
}

/**
 * Explicit instructions for source templates that need more context. Each keeps its slots, answer, difficulty
 * and task. Only the named level changes; other levels keep Cedric's words. U4's part-part-whole form prints the
 * given parts and whole without a picture note. The source text is checked: a changed template is not rewritten.
 * The 2026-11-16 content audit supersedes the older shortening rules.
 */
export interface LevelRewrite { level: number; skill: string; step: number; template: number; from: string; to: string }

export const LEVEL_REWRITES: readonly LevelRewrite[] = [
  { level: 10, skill: "2.5-increasing-pattern", step: 3, template: 2, from: "{name} saves {things} in a pattern. Day 1 {name} has {a}. Each day {name} adds {s} more. How many on day 2?", to: "On day 1, {name} has {a} {things}. Each day after day 1, {name} adds {s} {things}. How many {things} does {name} have on day 2?" },
  { level: 4, skill: "K3-part-part-whole", step: 3, template: 1, from: "(picture: part {sa}, part {sb}, whole {sc}) Find the missing number.", to: "The whole is {sc}. Its two parts are {sa} and {sb}. Write the missing number." },
  ...[1, 2].map((step) => ({ level: 4, skill: "1.1-subitize-to-10", step, template: 3, from: "{name} has {n} {things}. {name} gets 1 more. How many {things} now?", to: "{name} has {n} {things}. {name} gets 1 more. How many {things} does {name} have now?" })),
  { level: 4, skill: "1.10-likelihood-words", step: 1, template: 5, from: "{st}. Is that never, sometimes or always?", to: "{st}. Circle never, sometimes or always." },
  { level: 4, skill: "K3-make-10", step: 3, template: 5, from: "{name} has {p} {things} and wants {w}. How many more?", to: "{name} has {p} {things} and wants {w} {things}. How many more {things} does {name} need?" },
];

/** A template as a book of this level prints it: Unica's clarified instructions where needed, else Cedric's. */
export function templateAtLevel(level: number, step: CurriculumStep, index: number, t: StepTemplate): StepTemplate {
  const r = LEVEL_REWRITES.find((x) => x.level === level && x.skill === step.skill && x.step === step.number && x.template === index + 1 && x.from === t.text);
  return r ? { ...t, text: r.to } : t;
}
