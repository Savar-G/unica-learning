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
/** What the pair is chosen from: a built question, or a step template's filled text before it is built. */
export type TwoWaysInput = Pick<QuestionPackage, "text" | "templateId" | "operation"> & { level?: number | null };

/**
 * Skills whose questions have no two methods worth writing out. Probability and experiments too (the U19 proof's
 * "A spinner has 5 equal parts ... How far off is the prediction?" printed "split a number into parts", Luis 2026-11-18).
 */
const NO_TWO_WAYS = /place-value|expanded|digit|estimate|round|compare|order|count|likelihood|benchmark|value|probab|experiment|outcome|chance|two-events/;
/** Probability wording in a question of another skill. */
const PROBABILITY_TEXT = /\bspin(?:s|ner)?\b|\bprobability\b|\bchance\b|\bpredict(?:ion|s|ed)?\b|\boutcomes?\b|\bat random\b/;

const skillOf = (p: Pick<QuestionPackage, "templateId">): string => p.templateId?.split("#")[0] ?? "";
const numbersIn = (text: string): number[] => (text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+/g) ?? []).map(Number);

/** A sum or difference with no second method: adding or taking away 0, all small facts, or all whole tens or hundreds. */
export function trivialCalculation(numbers: readonly number[]): boolean {
  if (numbers.length < 2) return true;
  // (Adding or taking away 0 or 1 is one step: "50 + 1".)
  if (numbers.some((n) => n === 0 || n === 1)) return true;
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
function earlyMethods(p: Pick<TwoWaysInput, "text" | "operation">): MethodPair | null {
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

/**
 * Whether a question's Use 2 ways follows the kind-of-question rules below: U10 and U19 only, the levels with a family
 * (Cedric, 2026-11-21); every other level keeps the methods it printed before (earlyMethods).
 */
export const TWO_WAYS_LEVELS: ReadonlySet<number> = new Set([10, 19]);
export const twoWaysByKind = (p: Pick<TwoWaysInput, "level">): boolean => TWO_WAYS_LEVELS.has(p.level ?? 0);

/** The two methods of a question, or null when it has no sensible pair (then it is not a Use 2 ways question). */
export function twoWaysMethods(p: TwoWaysInput): MethodPair | null {
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
  if (NO_TWO_WAYS.test(skill) || PROBABILITY_TEXT.test(text)) return null;
  const kind = p.operation?.kind ?? (/[×]\s*\?|\?\s*[×]/.test(text) ? "missing-factor" : /[×]|\btimes\b|groups? of|each (?:box|bag|row|pack)/.test(text) ? "multiply"
    : /[÷]|\bshare|equally\b/.test(text) ? "divide"
    : /−|\s-\s|\bleft\b|\btake(?:s)? away\b|\bfewer\b|\bless than\b|\bgives?\b|\beats?\b/.test(text) ? "subtract"
    : /\+|\bmore\b|\bin all\b|\btogether\b|\bgets\b/.test(text) ? "add" : null);
  if (!kind) return null;
  const numbers = numbersIn(p.text);
  if (["add", "subtract", "missing-addend"].includes(kind) && trivialCalculation(numbers)) return null;
  // From U10 a sum or difference of numbers under 20 is a fact to know, not one to work out two ways (the U19 proof's
  // "4 + 15", Luis 2026-11-18). (U4 to U9 keep earlyMethods, where these small facts are the point.)
  if (["add", "subtract", "missing-addend"].includes(kind) && Math.max(0, ...numbers) < 20) return null;
  // A times-table fact (7 × 8, 56 ÷ 7, 7 × ? = 56) is a fact to know, not one to work out two ways (Cedric, 2026-11-21).
  if (["multiply", "divide", "missing-factor"].includes(kind) && timesFact(kind, numbers)) return null;
  switch (kind) {
    case "add": case "missing-addend":
      return ["add the tens, then the ones", "make a friendly number first"];
    case "subtract":
      return ["take away the tens, then the ones", "count up from the smaller number"];
    case "multiply": {
      // A tens product (60 × 7) strips the zeros; a number just under a ten (19 × 6) rounds up. Any other product has no
      // second method here (Cedric, 2026-11-21: "round up, then take away" for non-round factors only). Only the two
      // factors count: "13 boxes with 14 books each" is not a tens product because the story also says 20.
      const factors = factorsOf(p, numbers);
      if (!factors) return null;
      if (factors.some((n) => n >= 20 && n % 10 === 0)) return ["split a number into parts", "use a fact you know, then the zeros"];
      if (factors.some((n) => n >= 18 && n < 100 && n % 10 >= 8)) return ["split a number into parts", "round up, then take away"];
      return null;
    }
    case "divide": return ["share in groups", "use a times fact"];
    case "missing-factor": return ["divide", "count up in groups"];
    default: return null;
  }
}

/** The two factors of a product: its operation's, else "a × b" in the text, else the question's only two numbers; null when unclear. */
function factorsOf(p: Pick<TwoWaysInput, "text" | "operation">, numbers: readonly number[]): [number, number] | null {
  const op = p.operation;
  if (op && op.kind === "multiply" && typeof op.operands[0] === "number" && typeof op.operands[1] === "number") return [op.operands[0], op.operands[1]];
  const times = /(\d[\d,]*)\s*×\s*(\d[\d,]*)/.exec(p.text);
  if (times) return [Number(times[1].replace(/,/g, "")), Number(times[2].replace(/,/g, ""))];
  return numbers.length === 2 ? [numbers[0], numbers[1]] : null;
}

/** A times-table fact: both factors, or the divisor and the quotient, are 12 or less. */
function timesFact(kind: string, numbers: readonly number[]): boolean {
  if (numbers.length < 2) return false;
  if (kind === "multiply") return numbers.every((n) => n <= 12);
  const [a, b] = numbers;
  const [by, whole] = kind === "divide" ? [b, a] : [a, b];
  return whole % by === 0 && by <= 12 && whole / by <= 12;
}

/**
 * Why a written Use 2 ways question cannot print from U10, or null: it needs two methods of its kind. On a day that
 * reviews no adding or subtracting skill the slot goes to the writer, whose "4 + 15 = ?" the book check then failed (the
 * U19 sweep's Day 8, Luis 2026-11-19). The writer's redo is asked again with this reason.
 */
export function writtenTwoWaysProblem(level: number, place: string | null | undefined, p: TwoWaysInput): string | null {
  if (place !== "solve-it-two-ways" || !TWO_WAYS_LEVELS.has(level) || twoWaysMethods({ ...p, level })) return null;
  return "Use 2 ways needs a sum or product with two methods: numbers of 20 or more, not a times-table fact, not a probability story";
}
