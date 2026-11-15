// The evaluate kind of the tutor core (D-345, F5): a whole-number expression worked in the order of operations, one
// "operate" step at a time. It teaches multi-step expressions ("9 × 880 + 9 × 40", "(8150 − 500) ÷ 9"), stories that
// code turned into one expression, one-step chains ("98378 + 1000 + 100") and patterns that add or take away the same
// number each time ("A pattern starts at 20 and adds ? each time. The 3rd term is 36."). Every step's operands,
// operation and result come from the package and are computed again here; a package code cannot read whole keeps the
// controller.
import type { OperationPackage, WorkedStep } from "@/lib/question-package";
import { expressionKey, noteFromEquation, type TutorCommand, type TutorKind, type TutorStepFact } from "../tutor-kind";
import { countedInText, finalQuestion, isGroup, sentencesIn, THING, WHO, WORD as FREE } from "./asks";

type OperateStep = Extract<WorkedStep, { kind: "operate" }>;
type Sign = OperateStep["op"];

const SAY: Record<Sign, string> = { "+": "plus", "−": "minus", "×": "times", "÷": "divided by" };
const KEY: Record<Sign, string> = { "+": "+", "−": "-", "×": "*", "÷": "/" };

/** One sign applied to two whole numbers, or null when it leaves the whole numbers. */
function apply(a: number, sign: Sign, b: number): number | null {
  if (sign === "+") return a + b;
  if (sign === "−") return a - b >= 0 ? a - b : null;
  if (sign === "×") return a * b;
  return b !== 0 && a % b === 0 ? a / b : null;
}

type Token = number | Sign | "(" | ")";

/** The tokens of an expression of whole numbers, signs and brackets, or null for anything else. */
function tokensOf(expression: string): Token[] | null {
  const text = expression.replace(/-/g, "−").replace(/[x*]/g, "×").replace(/\//g, "÷");
  if (!/^[\d\s()+−×÷]+$/.test(text)) return null;
  const tokens: Token[] = [];
  for (const m of text.matchAll(/\d+|[()+−×÷]/g)) tokens.push(/^\d+$/.test(m[0]) ? Number(m[0]) : (m[0] as Token));
  return tokens;
}

/**
 * The value of the tokens, or null: `order` "standard" (brackets, then × and ÷, then + and −, left to right),
 * "no-brackets" (the brackets left out) or "left-to-right" (no brackets and no order: each sign as it comes).
 */
function evaluate(tokens: readonly Token[], order: "standard" | "no-brackets" | "left-to-right"): number | null {
  const list = order === "standard" ? tokens : tokens.filter((t) => t !== "(" && t !== ")");
  let at = 0;
  const precedence = order !== "left-to-right";
  const atom = (): number | null => {
    const t = list[at++];
    if (t === "(") {
      const v = sum();
      if (list[at++] !== ")") return null;
      return v;
    }
    return typeof t === "number" ? t : null;
  };
  const product = (): number | null => {
    let v = atom();
    while (v !== null && (list[at] === "×" || list[at] === "÷")) {
      const sign = list[at++] as Sign;
      const r = atom();
      v = r === null ? null : apply(v, sign, r);
    }
    return v;
  };
  const sum = (): number | null => {
    let v = precedence ? product() : atom();
    while (v !== null && typeof list[at] === "string" && list[at] !== ")" && list[at] !== "(") {
      const sign = list[at++] as Sign;
      if (precedence && (sign === "×" || sign === "÷")) return null;
      const r = precedence ? product() : atom();
      v = r === null ? null : apply(v, sign, r);
    }
    return v;
  };
  const v = sum();
  return at === list.length ? v : null;
}

const operateSteps = (pkg: OperationPackage) => pkg.steps.filter((s): s is OperateStep => s.kind === "operate");

const ORDINAL_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const ORDINAL = String.raw`(\d+)(?:st|nd|rd|th)|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)`;
const ordinalOf = (digits: string | undefined, word: string | undefined) => (digits ? Number(digits) : ORDINAL_WORDS[(word ?? "").toLowerCase()]);
const ordinalText = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** A pattern that adds or takes away the same number each time, as the question prints it. */
export interface Pattern {
  start: number;
  /** The change each time: positive when it adds, negative when it takes away. */
  step: number;
  /** The term the question names (the 3rd in "The 3rd term is 36", the 4th in "What is the 4th term?"). */
  term: number;
  /** Whether the question asks for the change (the step is its answer) or for the term. */
  asks: "step" | "term";
}

/** The term `n` of a pattern (the 1st term is the start). */
export const termOf = (p: Pattern, n: number) => p.start + (n - 1) * p.step;

/** Whether the question's text speaks of a pattern or its terms. */
const speaksOfPattern = (text: string) => /\bpattern\b|\bterms?\b/i.test(text);

/** The pattern of the question, read from its text and proved against its answer, or null. */
export function patternOf(pkg: OperationPackage): Pattern | null {
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
  if (answer === null) return null;
  const rule = /\bstarts at (\d+) and (adds|subtracts|takes away) (\d+|\?) each time\b/i.exec(pkg.text);
  if (!rule) return null;
  const start = Number(rule[1]);
  const sign = /adds/i.test(rule[2]) ? 1 : -1;
  const given = new RegExp(String.raw`\b(?:the|its) (?:${ORDINAL}) term is (\d+)\b`, "i").exec(pkg.text);
  const asked = new RegExp(String.raw`\bwhat is (?:the|its) (?:${ORDINAL}) term\b`, "i").exec(pkg.text);
  if (rule[3] === "?" && given && !asked) {
    const p: Pattern = { start, step: sign * answer, term: ordinalOf(given[1], given[2]), asks: "step" };
    return p.term >= 2 && termOf(p, p.term) === Number(given[3]) ? p : null;
  }
  if (rule[3] !== "?" && asked && !given) {
    const p: Pattern = { start, step: sign * Number(rule[3]), term: ordinalOf(asked[1], asked[2]), asks: "term" };
    return p.term >= 2 && termOf(p, p.term) === answer ? p : null;
  }
  return null;
}

/**
 * F5: an "evaluate" operation of whole numbers with no unknowns, worked only by "operate" steps that code computes again
 * here in the package's order, each from the expression's numbers or an earlier step's value, and a number answer the
 * last step gives. A question that speaks of a pattern fits only when its pattern is read and proved (patternOf). A
 * printed claim, a comparison or any other step keeps the controller (F4 owns claims and comparisons).
 */
function fits(pkg: OperationPackage): boolean {
  const op = pkg.operation;
  if (op.kind !== "evaluate" || (op.values && Object.keys(op.values).length > 0)) return false;
  if (pkg.answer.value.type !== "number") return false;
  const extra = pkg as unknown as Record<string, unknown>;
  if (["claim", "spot", "comparison", "missing", "placeValue", "pattern"].some((k) => extra[k] !== undefined && extra[k] !== null)) return false;
  if (!pkg.steps.every((s) => s.kind === "operate" || s.kind === "result")) return false;
  const tokens = tokensOf(op.operands[0]);
  if (!tokens || evaluate(tokens, "standard") !== pkg.answer.value.value) return false;
  const steps = operateSteps(pkg);
  if (steps.length === 0) return false;
  const known = new Set<number>(tokens.filter((t): t is number => typeof t === "number"));
  for (const st of steps) {
    if (!(st.op in SAY) || !known.has(st.left) || !known.has(st.right) || apply(st.left, st.op, st.right) !== st.value) return false;
    known.add(st.value);
  }
  if (steps.at(-1)!.value !== pkg.answer.value.value) return false;
  if (speaksOfPattern(pkg.text)) return patternOf(pkg) !== null && patternAsks(pkg.text);
  return storyMatches(pkg.text, steps) && printedAgrees(pkg.text, tokens, pkg.answer.value.value) && storyAsks(pkg.text);
}

/**
 * Pre-launch check 2: a pattern question is its rule and one closed ask, nothing else: "A pattern starts at 13 and adds
 * 5 each time. What is the 4th term?" or "... The 3rd term is 23.". "What is the 4th term minus 2?" keeps the controller.
 */
function patternAsks(text: string): boolean {
  const s = sentencesIn(text).map((x) => x.toLowerCase());
  return s.length === 2 && /^a pattern starts at \d+ and (?:adds|subtracts|takes away) (?:\d+|\?) each time\.$/.test(s[0]) &&
    new RegExp(String.raw`^(?:what is (?:the|its) (?:${ORDINAL}) term\?|(?:the|its) (?:${ORDINAL}) term is \d+\.)$`).test(s[1]);
}

/** The closed question forms of a story whose expression gives what is there at the end, or the total. */
const STORY_ASKS = [
  new RegExp(String.raw`^how many ${THING} (?:does|do) ${WHO} have (?:now|left|after \d+ ${FREE})$`),
  new RegExp(String.raw`^how many ${THING} (?:are|is) (?:left|still (?:at|in|on) (?:the )?${FREE})$`),
  new RegExp(String.raw`^how many ${THING} (?:is that|are there) (?:in all|altogether|in total)$`),
  new RegExp(String.raw`^how many ${THING} (?:live|are) (?:in (?:the )?${FREE}|there) now$`),
  // "How many live there now?": the people the story counts.
  /^how many live (?:there|here) now$/,
];
/** Closed asks that name no counted thing: a height after the growth, a new code, a perimeter. */
const STORY_VALUE_ASKS = [
  new RegExp(String.raw`^how tall is (?:it|the ${FREE}) (?:now|after \d+ ${FREE})$`),
  /^what is the new (?:code|number|total)$/,
  /^what is (?:its|the) perimeter(?: in [a-z]+)?$/,
];

/**
 * Pre-launch check 2: a story's final question asks for the expression's result, in a closed form: what is there at the
 * end ("How many buttons are left?"), the total, a height after the growth, a new code or a perimeter. A counted thing
 * must be counted after a printed number and must not be a group. "How many buttons did it sell?" asks for a printed
 * number, and keeps the controller. A bare printed expression is read by printedAgrees.
 */
function storyAsks(text: string): boolean {
  const bare = text.replace(/\d[\d,]*/g, " ").replace(/[+−×÷\-x*/=?().:]/g, " ").replace(/\b(?:what is|find|work out|calculate)\b/gi, " ").trim();
  if (bare === "") return true;
  const q = finalQuestion(text);
  if (q === null) return false;
  if (STORY_VALUE_ASKS.some((re) => re.test(q))) return true;
  const m = STORY_ASKS.map((re) => re.exec(q)).find(Boolean);
  return !!m && (m[1] === undefined || (countedInText(text, m[1]) && !isGroup(m[1])));
}

/** The numbers of a token list, in order. */
const numbersOf = (tokens: readonly Token[]) => tokens.filter((t): t is number => typeof t === "number");
const sameNumbers = (x: readonly number[], y: readonly number[]) => x.length === y.length && [...x].sort((p, q) => p - q).every((n, i) => n === [...y].sort((p, q) => p - q)[i]);

/**
 * Pre-launch review B, F14: a bare printed expression must be the stored one. "What is 9 × 880 + 9 × 40?" stored as
 * 9 × 880 + 9 × 50 would teach 8370. The printed numbers must be the stored numbers, and the printed math must give the
 * stored answer: "E = ?" and "What is E?" have E's signs and value; "9 × ? = 8150 − 500" holds with the answer as its "?". Any
 * other bare text keeps the controller. A story's words are read by `storyMatches`.
 */
function printedAgrees(text: string, stored: readonly Token[], answer: number): boolean {
  const bare = text.replace(/\d[\d,]*/g, " ").replace(/[+−×÷\-x*/=?().:]/g, " ").replace(/\b(?:what is|find|work out|calculate)\b/gi, " ").trim();
  if (bare !== "") return true;
  let math = text.replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/\b(?:what is|find|work out|calculate)\b/gi, " ").replace(/:/g, " ").trim();
  // The question mark of "What is E?" is not an unknown; the "?" of "E = ?" is the answer's place.
  if (!/=\s*\?$/.test(math)) math = math.replace(/\?$/, "").trim();
  const sides = math.split("=").map((x) => x.trim());
  if (sides.length > 2 || sides.some((x) => x === "")) return false;
  const unknown = (x: string) => x.includes("?");
  const parse = (x: string) => tokensOf(x.replace(/\?/g, String(answer)));
  if (sides.length === 1 || sides[1] === "?") {
    // "What is E?", "E = ?": E itself, with no unknown in it.
    if (unknown(sides[0])) return false;
    const printed = parse(sides[0]);
    const signs = (t: readonly Token[]) => t.filter((x) => typeof x === "string" && x !== "(" && x !== ")").sort().join();
    return printed !== null && sameNumbers(numbersOf(printed), numbersOf(stored)) && signs(printed) === signs(stored) && evaluate(printed, "standard") === answer;
  }
  // "9 × ? = 8150 − 500": one "?", and both sides equal with the answer in its place.
  if ((math.match(/\?/g) ?? []).length !== 1) return false;
  const [left, right] = sides.map(parse);
  if (left === null || right === null) return false;
  const printed = [...numbersOf(tokensOf(sides[0].replace(/\?/g, " ")) ?? []), ...numbersOf(tokensOf(sides[1].replace(/\?/g, " ")) ?? [])];
  const l = evaluate(left, "standard");
  return sameNumbers(printed, numbersOf(stored)) && l !== null && l === evaluate(right, "standard");
}

/** Words of a story that say each operation (D-345 review of #1018: a story's words must give the operation). */
const CUES: Record<Sign | "total", RegExp> = {
  "+": /\b(?:more|buys?|bought|gets?|got|adds?|added|gains?|gained|finds?|found|earns?|earned|receives?|received|joins?|joined|comes?|came|arrives?|arrived|moves? in|moved in|plus|grows?|grew)\b/i,
  "−": /\b(?:sells?|sold|gives?(?: away)?|gave|uses?|used|eats?|ate|loses?|lost|spends?|spent|takes?\b.*\b(?:off|away|out)|took\b.*\b(?:off|away|out)|moves? away|moved away|sends?\b.*\baway|sent\b.*\baway|leave|removes?|removed|breaks?|broke|fewer|less|minus)\b/i,
  "×": /\b(?:each|every|per|times)\b|\d+\s+(?:[a-z]+\s+)?[a-z]+s of\b/i,
  "÷": /\b(?:shares?|shared|splits?|split|divides?|divided|equal groups|among|between)\b/i,
  total: /\b(?:in all|altogether|total|together|in total|both)\b/i,
};

/**
 * Whether the question's words give each operation of its expression. A bare expression ("What is 9 × 880 + 9 × 40?",
 * "9 × ? = 8150 − 500") and a rectangle's perimeter (2 × (length + width)) need no words. In a story, each step whose
 * printed number stands in one clause (cut at ".", "?", "!", ",", "and" and "then") needs that clause to say its
 * operation and not the opposite one (a product: either number's clause says "each" or "boxes of"); a sum of two
 * worked values needs "in all", "altogether" or "total". Any other story keeps the controller.
 */
export function storyMatches(text: string, steps: readonly OperateStep[]): boolean {
  const bare = text.replace(/\d[\d,]*/g, " ").replace(/[+−×÷\-x*/=?().:]/g, " ").replace(/\b(?:what is|find|work out|calculate)\b/gi, " ").trim();
  if (bare === "") return true;
  if (/\brectangle\b/i.test(text) && /\bperimeter\b/i.test(text) && steps.length === 2) {
    const [sum, twice] = steps;
    const length = /\blength (\d+)/i.exec(text)?.[1];
    const width = /\bwidth (\d+)/i.exec(text)?.[1];
    return sum.op === "+" && twice.op === "×" && twice.left === 2 && twice.right === sum.value && [sum.left, sum.right].sort().join() === [Number(length), Number(width)].sort().join();
  }
  const clauses = text.replace(/(\d),(?=\d{3}\b)/g, "$1").split(/[.?!,]|\s+(?:and|then)\s+/i);
  const clauseOf = (n: number) => {
    const found = clauses.filter((c) => new RegExp(String.raw`(?<!\d)${n}(?!\d)`).test(c));
    return found.length === 1 ? found[0] : null;
  };
  // Each worked value keeps the printed numbers it came from: a sum such as 30 + 4 × 3 ("A plant is 30 cm tall and
  // grows 4 cm each week") finds its "grows" in the clause of the 4.
  const sources = new Map<number, number[]>();
  const printedOf = (n: number) => sources.get(n) ?? [n];
  for (const st of steps) {
    const opposite = st.op === "+" ? CUES["−"] : st.op === "−" ? CUES["+"] : null;
    const direct = [st.left, st.right].filter((n) => !sources.has(n)).map(clauseOf);
    const behind = [st.left, st.right].flatMap(printedOf).map(clauseOf);
    if (direct.includes(null) || behind.includes(null)) return false;
    if (opposite && direct.some((c) => opposite.test(c!))) return false;
    const said = behind.some((c) => CUES[st.op].test(c!));
    // Two worked values added: a total ("in all") or the operation's own word.
    if (!said && !(st.op === "+" && direct.length === 0 && CUES.total.test(text))) return false;
    sources.set(st.value, [st.left, st.right].flatMap(printedOf));
  }
  return true;
}

const equation = (st: OperateStep) => `${st.left} ${st.op} ${st.right} = ${st.value}`;

/** Why this step comes now, in plain words (the order of operations). */
function reason(pkg: OperationPackage, st: OperateStep): string {
  const p = patternOf(pkg);
  if (p && p.asks === "step" && st.rule === "brackets") return `the change from the start to the ${ordinalText(p.term)} term`;
  if (p && p.asks === "step" && st.op === "÷") return `the ${ordinalText(p.term)} term is ${p.term - 1} jumps after the start, so share the change into ${p.term - 1}`;
  if (p && p.asks === "term" && st.op === "×") return `the ${ordinalText(p.term)} term is ${p.term - 1} jumps after the start`;
  if (st.rule === "brackets") return "work the brackets first";
  if (st.rule === "multiply-divide") return /[+−]/.test(pkg.operation.operands[0] as string) ? "multiply and divide before you add or subtract" : "multiply and divide from left to right";
  return "add and subtract from left to right";
}

function steps(pkg: OperationPackage): TutorStepFact[] {
  const ops = operateSteps(pkg);
  return ops.map((st, i) => {
    const parts = [equation(st), reason(pkg, st)];
    if (i < ops.length - 1) parts.push(`that leaves ${st.rest}`);
    return { id: st.id, work: parts.join("; "), result: st.value };
  });
}

/** The values the pattern's terms take up to the term the question names (never a wrong answer). */
const termsOf = (p: Pattern | null) => (p ? Array.from({ length: p.term }, (_, k) => termOf(p, k + 1)) : []);

function numberMeaning(pkg: OperationPackage, n: number): string {
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
  if (n === answer) return "the right answer to the whole question";
  const ops = operateSteps(pkg);
  const meanings: string[] = [];
  for (const [i, st] of ops.entries()) if (n === st.value) meanings.push(`right for step ${i + 1} (${equation(st)})`);
  const p = patternOf(pkg);
  for (const [k, t] of termsOf(p).entries()) if (n === t) meanings.push(`the ${ordinalText(k + 1)} term of the pattern`);
  if (meanings.length) return meanings.join("; ");
  // Likely mistakes code can compute: the brackets left out, or each sign worked as it comes (no order of operations).
  const tokens = tokensOf(pkg.operation.operands[0] as string) ?? [];
  if (tokens.includes("(") && n === evaluate(tokens, "no-brackets")) meanings.push("a likely mistake: the brackets were not worked first");
  else if (n === evaluate(tokens, "left-to-right") && n !== evaluate(tokens, "no-brackets")) meanings.push("a likely mistake: worked each sign from left to right instead of multiplying and dividing first");
  if (p && p.asks === "step" && p.term > 2 && (termOf(p, p.term) - p.start) % p.term === 0 && n === Math.abs(termOf(p, p.term) - p.start) / p.term) meanings.push(`a likely mistake: shared the change into ${p.term} jumps, but the ${ordinalText(p.term)} term is only ${p.term - 1} jumps after the start`);
  if (p && p.asks === "term" && n === p.start + p.term * p.step) meanings.push(`a likely mistake: ${p.term} jumps instead of ${p.term - 1}; the start is the 1st term`);
  // A step skipped: the last step worked on a number from before the step it needed.
  for (const [i, st] of ops.entries()) {
    if (i === 0) continue;
    const prev = ops[i - 1];
    const usesPrev = st.left === prev.value ? "left" : st.right === prev.value ? "right" : null;
    if (!usesPrev) continue;
    const skipped = usesPrev === "left" ? apply(prev.left, st.op, st.right) : apply(st.left, st.op, prev.right);
    if (skipped !== null && n === skipped && skipped !== answer) meanings.push(`a likely mistake: skipped step ${i} (${equation(prev)}) before step ${i + 1}`);
  }
  if (meanings.length) return [...new Set(meanings)].join("; ");
  if (tokens.includes(n)) return "a number of the question";
  return "not a value of this question";
}

function workValues(pkg: OperationPackage): number[] {
  return [...operateSteps(pkg).map((st) => st.value), ...termsOf(patternOf(pkg))];
}

function streamScope(pkg: OperationPackage): { numbers: number[]; expressions: string[] } {
  const ops = operateSteps(pkg);
  const tokens = tokensOf(pkg.operation.operands[0] as string) ?? [];
  const p = patternOf(pkg);
  const answer = pkg.answer.value.type === "number" ? [pkg.answer.value.value] : [];
  const numbers = [
    ...tokens.filter((t): t is number => typeof t === "number"),
    ...answer,
    ...ops.flatMap((st) => [st.left, st.right, st.value]),
    ...termsOf(p),
    ...(p ? [p.start, Math.abs(p.step), p.term, p.term - 1] : []),
  ];
  const expressions = ops.map((st) => expressionKey([st.left, st.right], [KEY[st.op]]));
  return { numbers: [...new Set(numbers)], expressions: [...new Set(expressions)] };
}

function stepQuestion(pkg: OperationPackage, done: readonly string[]): string | null {
  const next = operateSteps(pkg).find((st) => !done.includes(st.id));
  return next ? `What is ${next.left} ${SAY[next.op]} ${next.right}?` : null;
}

/** A step's equation as a note, when the note's form can hold it (numbers of at most 5 digits). */
const noteSteps = (pkg: OperationPackage) => operateSteps(pkg).filter((st) => noteFromEquation(equation(st)) !== null);

const NOTE = { id: "note", does: "writes one true equation of numbers on the board (\"place\": \"9 × 880 = 7920\")" };

function draw(pkg: OperationPackage, requests: readonly { offer: string; place?: string }[], _drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] } {
  void _drawn;
  const commands: TutorCommand[] = [];
  let notes = 0;
  for (const d of requests) {
    if (d.offer !== "note" || !d.place) continue;
    // Only a whole equation of numbers, rebuilt from its values: no other text reaches the board.
    const text = noteFromEquation(d.place);
    if (text) commands.push({ op: "write", id: noteId(notes++), text, place: { region: "main" } });
  }
  return { commands, keys: [] };
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORDINAL_NAMES: Record<string, string> = { first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th", sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th", eleventh: "11th", twelfth: "12th" };
const WORD = String.raw`(?:${[...ONES, ...TENS, "hundred"].join("|")})`;

/** A run of number words as one number ("twenty eight" is 28, "one hundred and four" is 104), or null. */
function wordsValue(run: string): number | null {
  let total = 0;
  let part = 0;
  for (const w of run.toLowerCase().split(/[\s-]+/).filter((x) => x && x !== "and")) {
    const small = ONES.indexOf(w);
    const tens = TENS.indexOf(w);
    if (small !== -1) { if (part % 10 !== 0 || (part > 0 && part < 20)) return null; part += small; }
    else if (tens !== -1) { if (part % 100 !== 0) return null; part += (tens + 2) * 10; }
    else if (w === "hundred") { if (part < 1 || part > 9) return null; total += part * 100; part = 0; }
    else return null;
  }
  return total + part;
}

/** The clause with its number words and ordinal words written in digits ("the third term is twenty eight" gives "the 3rd term is 28"). */
function inDigits(clause: string): string | null {
  let bad = false;
  const out = clause
    .replace(new RegExp(String.raw`\b(${Object.keys(ORDINAL_NAMES).join("|")})\b`, "gi"), (w) => ORDINAL_NAMES[w.toLowerCase()])
    .replace(new RegExp(String.raw`\b${WORD}(?:(?:\s+|-)(?:and\s+)?${WORD})*\b`, "gi"), (run) => {
      const v = wordsValue(run);
      if (v === null) bad = true;
      return String(v);
    });
  return bad ? null : out;
}

/** Words that make a clause speak of the pattern: every such clause must be one form code reads whole. */
const PATTERN_WORDS = /\b(?:terms?|pattern|each time|every time|each step|start(?:s|ed|ing)?|adds|added|adding|subtracts|subtracted|subtracting|takes away|took away|goes (?:up|down)|went (?:up|down)|grows?|grew|shrinks?|increases?|decreases?|jumps?|change|changes|share)\b/i;
/** On a question with no pattern, only these words speak of one. */
const NO_PATTERN_WORDS = /\b(?:terms?|pattern|each time|every time)\b/i;
const LEAD = /^(?:\{name\}|so|now|next|then|and|yes|okay|ok|great|remember|because)\b[\s,!.]*/i;
const UP = /^(?:adds|add|goes up by|grows by|increases by)$/;
const DOWN = /^(?:subtracts|subtract|takes away|take away|goes down by|shrinks by|decreases by)$/;

/**
 * The pattern claims of one sentence that are false or that code cannot read. The sentence is cut into clauses (at
 * ",", ";", ":" and "and", "but", "which", "because"), number words are read as numbers, and each clause that speaks of
 * the pattern (PATTERN_WORDS) must be one whole form code checks:
 * - "the 3rd term is 36" (the term's value);
 * - "the 3rd term is 2 jumps after the start";
 * - "it adds 8 each time", "it subtracts 3 each time" (the size and the direction of the change);
 * - "it starts at 20", "start at 20";
 * - "the change from the start to the 3rd term", "share the change into 2" (the kind's own step words).
 * Fail closed: any other clause about the pattern (a negation, a remainder, a sum, a word code cannot read) is
 * refused, and a question with no pattern refuses every clause about a term or a pattern.
 */
export function patternClaimProblems(pkg: OperationPackage, sentence: string): string[] {
  const p = fits(pkg) ? patternOf(pkg) : null;
  const words = p ? PATTERN_WORDS : NO_PATTERN_WORDS;
  if (!words.test(sentence)) return [];
  if (!p) return ["this question has no pattern"];
  const problems: string[] = [];
  const clauses = sentence.replace(/[−–]/g, "-").replace(/[.!?]+\s*$/, "").split(/\s*[:;]\s*|\s*,\s*|\s+(?:and|but|which|because)\s+/i);
  for (const raw of clauses) {
    if (!words.test(raw)) continue;
    let clause = raw.trim();
    for (let k = 0; k < 4; k++) clause = clause.replace(LEAD, "").trim();
    const c = inDigits(clause)?.toLowerCase().replace(/\s+/g, " ").trim();
    if (!c || /\bnot\b|n't\b|\bnever\b|\bno\b/.test(c)) { problems.push(`"${raw.trim()}" says something about the pattern in a form code cannot check`); continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(?:the|its) (\d+)(?:st|nd|rd|th) term (?:is|=|equals|will be) (\d+)$/.exec(c))) {
      const n = Number(m[1]);
      if (n < 1 || Number(m[2]) !== termOf(p, n)) problems.push(`the ${ordinalText(n)} term is ${termOf(p, n)}, not ${m[2]}`);
    } else if ((m = /^(?:the|its) (\d+)(?:st|nd|rd|th) term is (\d+) (?:jumps?|steps?) (?:after|from) the (?:start|1st term)$/.exec(c))) {
      if (Number(m[2]) !== Number(m[1]) - 1) problems.push(`the ${ordinalText(Number(m[1]))} term is ${Number(m[1]) - 1} jumps after the start, not ${m[2]}`);
    } else if ((m = /^(?:(?:it|the pattern|each term) )?(adds|add|goes up by|grows by|increases by|subtracts|subtract|takes away|take away|goes down by|shrinks by|decreases by) (\d+)(?: (?:each|every) (?:time|step))?$/.exec(c))) {
      const sign = UP.test(m[1]) ? 1 : DOWN.test(m[1]) ? -1 : 0;
      if (sign * Number(m[2]) !== p.step) problems.push(`the pattern ${p.step > 0 ? "adds" : "takes away"} ${Math.abs(p.step)} each time, not ${m[1]} ${m[2]}`);
    } else if ((m = /^(?:(?:it|the pattern) )?(?:starts?|started) (?:at|with) (\d+)$/.exec(c))) {
      if (Number(m[1]) !== p.start) problems.push(`the pattern starts at ${p.start}, not ${m[1]}`);
    } else if ((m = /^the change from the start to the (\d+)(?:st|nd|rd|th) term$/.exec(c))) {
      if (Number(m[1]) !== p.term) problems.push(`the question names the ${ordinalText(p.term)} term, not the ${ordinalText(Number(m[1]))}`);
    } else if ((m = /^share (?:it|the change) into (\d+)(?: (?:equal )?(?:jumps|parts))?$/.exec(c))) {
      if (p.asks !== "step" || Number(m[1]) !== p.term - 1) problems.push(`the change is shared into ${p.term - 1} jumps, not ${m[1]}`);
    } else problems.push(`"${raw.trim()}" says something about the pattern in a form code cannot check`);
  }
  return problems;
}

export const evaluateKind: TutorKind = {
  id: "evaluate",
  fits,
  steps,
  numberMeaning,
  workValues,
  streamScope,
  stepQuestion,
  drawings: (pkg) => (noteSteps(pkg).length > 0 ? [NOTE] : []),
  drawingExamples: (pkg) => {
    const st = noteSteps(pkg)[0];
    return st ? [{ offer: "note", place: equation(st) }] : [];
  },
  draw,
  // The core reads the equations; this kind reads the pattern's claims.
  claimProblems: patternClaimProblems,
  notes: (pkg) => {
    const p = patternOf(pkg);
    const notes = ["Work in the order of operations: brackets first, then × and ÷, then + and −, each from left to right."];
    if (p) notes.push(`The 1st term is the start (${p.start}); each later term is ${Math.abs(p.step)} ${p.step > 0 ? "more" : "less"} than the one before.`);
    return notes;
  },
};
