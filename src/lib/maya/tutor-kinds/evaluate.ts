// The evaluate kind of the tutor core (D-345, F5): a whole-number expression worked in the order of operations, one
// "operate" step at a time. It teaches multi-step expressions ("9 × 880 + 9 × 40", "(8150 − 500) ÷ 9"), stories that
// code turned into one expression, one-step chains ("98378 + 1000 + 100") and patterns that add or take away the same
// number each time ("A pattern starts at 20 and adds ? each time. The 3rd term is 36."). Every step's operands,
// operation and result come from the package and are computed again here; a package code cannot read whole keeps the
// controller.
import type { OperationPackage, WorkedStep } from "@/lib/question-package";
import { expressionKey, noteFromEquation, type TutorCommand, type TutorKind, type TutorStepFact } from "../tutor-kind";

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
  return !speaksOfPattern(pkg.text) || patternOf(pkg) !== null;
}

const equation = (st: OperateStep) => `${st.left} ${st.op} ${st.right} = ${st.value}`;

/** Why this step comes now, in plain words (the order of operations). */
function reason(pkg: OperationPackage, st: OperateStep): string {
  const p = patternOf(pkg);
  if (p && p.asks === "step" && st.rule === "brackets") return `the change from the start to the ${ordinalText(p.term)} term`;
  if (p && p.asks === "step" && st.op === "÷") return `${p.term - 1} equal jumps make that change, so share it into ${p.term - 1}`;
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

const RELATION = String.raw`(?:is|=|equals|will be|would be|comes to|makes)`;

/**
 * The pattern claims of one sentence that are false: a term's value ("the 3rd term is 36"), a term's jumps from the
 * start ("the 3rd term is 2 jumps after the start"), the change each time ("it adds 8 each time") and the start
 * ("it starts at 20"). Fail closed: a term claim code cannot read is refused, and a question with no pattern refuses
 * every term claim.
 */
export function patternClaimProblems(pkg: OperationPackage, sentence: string): string[] {
  const text = sentence.replace(/[−–]/g, "-");
  const p = fits(pkg) ? patternOf(pkg) : null;
  const problems: string[] = [];
  let rest = text;
  const read = (re: RegExp, check: (m: RegExpExecArray) => string | null) => {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpExecArray;
      const problem = check(m);
      if (problem) problems.push(problem);
      return " ";
    });
  };
  const term = (m: RegExpExecArray, at: number) => ordinalOf(m[at], m[at + 1]);
  read(new RegExp(String.raw`\b(?:(?:the|its)\s+)?(?:${ORDINAL})\s+term\s+${RELATION}\s+(\d+)\s+(?:jumps?|steps?)\s+(?:after|from|past)\s+(?:the\s+)?(?:start|1st term|first term)\b`, "gi"), (m) => {
    if (!p) return "this question has no pattern";
    const n = term(m, 1);
    return Number(m[3]) === n - 1 ? null : `the ${ordinalText(n)} term is ${n - 1} jumps after the start, not ${m[3]}`;
  });
  read(new RegExp(String.raw`\b(?:(?:the|its)\s+)?(?:${ORDINAL})\s+term\s+${RELATION}\s+(\d+)\b(?!\s*(?:[+\-×÷*/x]|plus|minus|times|divided))`, "gi"), (m) => {
    if (!p) return "this question has no pattern";
    const n = term(m, 1);
    return Number(m[3]) === termOf(p, n) ? null : `the ${ordinalText(n)} term is ${termOf(p, n)}, not ${m[3]}`;
  });
  read(/\b(?:adds|add|adding|goes up by|takes away|take away|subtracts|subtract|goes down by|changes by|jumps? (?:of|by))\s+(\d+)\s+each\s+(?:time|step)\b/gi, (m) => {
    if (!p) return null;
    return Number(m[1]) === Math.abs(p.step) ? null : `the pattern changes by ${Math.abs(p.step)} each time, not ${m[1]}`;
  });
  read(/\bstarts?\s+(?:at|with)\s+(\d+)\b/gi, (m) => {
    if (!p) return null;
    return Number(m[1]) === p.start ? null : `the pattern starts at ${p.start}, not ${m[1]}`;
  });
  // A term claim left that code could not read: "the 3rd term is the answer plus 8", "is the 3rd term".
  if (/\bterms?\b[^.?!]*(?:\b(?:is|equals|will be|would be|comes to|makes)\b|=)|(?:\b(?:is|equals)\b|=)\s*the\s+(?:\w+\s+)?term\b/i.test(rest) && /\d/.test(rest)) problems.push("it says what a term is in a form code cannot check");
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
