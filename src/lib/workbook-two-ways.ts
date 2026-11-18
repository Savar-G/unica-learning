// Solve it two ways: the two methods a question prints under "Use 2 ways", from what kind of question it is (Luis,
// 2026-11-17, from the live U10 Book 1: a pattern printed "split a number into parts / use a fact you know, then the
// zeros", an expanded form "add the tens, then the ones / make a ten first", and "300 + 0" asked for two ways).
//
// The pair comes from the question's skill first, then its operation. A skill with no two sensible methods (place value,
// expanded form, estimates, comparing, rounding) gets none, and a trivial sum (one that adds or takes away 0, or a
// one-step fact such as 300 + 200) gets none: the generator does not pick such a question for Use 2 ways.
// Pure TypeScript: no network, database, clock or randomness.
import type { QuestionPackage } from "./question-package";

export type MethodPair = readonly [string, string];

/** Skills whose questions have no two methods worth writing out. */
const NO_TWO_WAYS = /place-value|expanded|digit|estimate|round|compare|order|count|likelihood|benchmark|value/;

const skillOf = (p: QuestionPackage): string => p.templateId?.split("#")[0] ?? "";
const numbersIn = (text: string): number[] => (text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+/g) ?? []).map(Number);

/** A sum or difference with no second method: adding or taking away 0, all small facts, or all whole tens or hundreds. */
export function trivialCalculation(numbers: readonly number[]): boolean {
  if (numbers.length < 2) return true;
  if (numbers.some((n) => n === 0)) return true;
  // A teen fact around 10: "10 + ? = 17" is one step.
  if (numbers.includes(10) && numbers.every((n) => n < 20)) return true;
  const big = numbers.filter((n) => n >= 10);
  if (!big.length) return false;
  const round = (unit: number) => numbers.every((n) => n % unit === 0 && n / unit < 10);
  return round(100) || round(10);
}

/**
 * U4 to U9's methods, unchanged (D-226 puts their Use 2 ways on the Number stories page; their small facts are the
 * point there): by the words the question uses.
 */
function earlyMethods(p: QuestionPackage): MethodPair | null {
  const t = `${p.operation?.kind ?? ""} ${p.text}`.toLowerCase();
  const small = Math.max(0, ...(p.text.match(/\d+/g) ?? []).map(Number)) < 20;
  if (small && /subtract|−|\s-\s|left|take|eats|gives|fewer|less|the rest/.test(t)) return ["count back", "count up from the smaller number"];
  const numbers = (p.text.match(/\d+/g) ?? []).map(Number);
  const pastTen = numbers.length >= 2 && numbers.reduce((a, b) => a + b, 0) > 10;
  if (small && /add|\+|more|in all|together|gets/.test(t)) return ["count on from the bigger number", pastTen ? "make a ten first" : "use your fingers"];
  if (/multiply|×|\beach\b|groups? of|packs? of|times/.test(t)) return ["split a number into parts", "use a fact you know, then the zeros"];
  if (/divide|÷|share|equally/.test(t)) return ["share in groups", "use a times fact"];
  if (/subtract|−|\s-\s|left|take|eats|gives|fewer|less/.test(t)) return ["take away the tens, then the ones", "count up from the smaller number"];
  if (/add|\+|more|in all|together|gets/.test(t)) return ["add the tens, then the ones", "make a ten first"];
  return null;
}

/** Whether a question's Use 2 ways follows the kind-of-question rules below: from U10 (U4 to U9 keep earlyMethods). */
export const twoWaysByKind = (p: QuestionPackage): boolean => (p.level ?? 0) >= 10;

/** The two methods of a question, or null when it has no sensible pair (then it is not a Use 2 ways question). */
export function twoWaysMethods(p: QuestionPackage): MethodPair | null {
  if (!twoWaysByKind(p)) return p.templateId?.startsWith("6.4-lcm#") ? ["list both sets of multiples", "test multiples of the larger number"] : earlyMethods(p);
  const skill = skillOf(p);
  if (skill === "6.4-lcm") return ["list both sets of multiples", "test multiples of the larger number"];
  const text = p.text.toLowerCase();
  if (/pattern|rule|jump/.test(skill)) {
    const down = /take away|taken away|subtract|goes down|count back|decreas/.test(text) || /decreasing/.test(skill);
    if (/how much is (?:added|taken away)|what is the jump|what is the rule/.test(text))
      return [down ? "subtract the second number from the first" : "subtract the first number from the second", down ? "count back from the first number to the second" : "count on from the first number to the second"];
    // Back from a later number to the first: one jump the other way.
    if (/what is its first number/.test(text))
      return [down ? "add one jump to the second number" : "take away one jump from the second number", down ? "count on from the second number" : "count back from the second number"];
    // Several jumps ahead: one at a time, or all at once. (One jump, "What comes next?", is a single step: no pair.)
    if (/number \d+ is \?|what is number \d+/.test(text))
      return ["write each number of the pattern in turn", down ? "take away all the jumps at once" : "add all the jumps at once"];
    return null;
  }
  if (NO_TWO_WAYS.test(skill)) return null;
  const kind = p.operation?.kind ?? (/[×]|\btimes\b|groups? of|each (?:box|bag|row|pack)/.test(text) ? "multiply"
    : /[÷]|\bshare|equally\b/.test(text) ? "divide"
    : /−|\s-\s|\bleft\b|\btake(?:s)? away\b|\bfewer\b|\bless than\b|\bgives?\b|\beats?\b/.test(text) ? "subtract"
    : /\+|\bmore\b|\bin all\b|\btogether\b|\bgets\b/.test(text) ? "add" : null);
  if (!kind) return null;
  const numbers = numbersIn(p.text);
  if (["add", "subtract", "missing-addend"].includes(kind) && trivialCalculation(numbers)) return null;
  const small = Math.max(0, ...numbers) < 20;
  switch (kind) {
    case "add": case "missing-addend":
      if (small) return ["count on from the bigger number", numbers.reduce((a, b) => a + b, 0) > 10 ? "make a ten first" : "use your fingers"];
      return ["add the tens, then the ones", numbers.some((n) => n % 10 >= 5) ? "make a friendly number first" : "count on in tens, then in ones"];
    case "subtract":
      if (small) return ["count back", "count up from the smaller number"];
      return ["take away the tens, then the ones", "count up from the smaller number"];
    case "multiply": return ["split a number into parts", "use a fact you know, then the zeros"];
    case "divide": return ["share in groups", "use a times fact"];
    default: return null;
  }
}
