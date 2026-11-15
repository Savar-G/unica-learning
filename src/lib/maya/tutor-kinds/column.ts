// The column kind of the tutor core (D-345): whole-number addition and subtraction of every size, by place, with
// trades. The first kind of the registry, moved here from tutor.ts when the interface was frozen (tutor-kind.ts); F1
// extended it from 2 digits to every size Maya teaches (six places, to the hundred thousands): carries into a new place, trades
// across zeros (10000 - 2001), and word problems whose text prints both numbers.
//
// Decimals (decimal-add, decimal-subtract) do not fit yet: the core's claim reader (tutor-math.ts) reads "2.5" as 2
// and 5, so it refuses every true decimal equation, and the board's columns do not draw a decimal point.
import type { OperationPackage, WorkedStep } from "@/lib/question-package";
import { standardNumber } from "../say-check";
import { exactValue, guardedProblems, type KindRead } from "../tutor-math";
import { expressionKey, noteFromEquation, type TutorCommand, type TutorKind, type TutorStepFact } from "../tutor-kind";
import { clauseWith, countedInText, finalQuestion, isGroup, THING, WHO, WORD } from "./asks";

type ColumnStep = Extract<WorkedStep, { kind: "add-column" | "subtract-column" }>;

const isColumn = (s: WorkedStep): s is ColumnStep => s.kind === "add-column" || s.kind === "subtract-column";

/** The places the board's columns draw, ones first, as the package names them. */
const PLACE_ORDER = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"] as const;
type ColumnPlace = (typeof PLACE_ORDER)[number];
const placeIndex = (place: string) => PLACE_ORDER.indexOf(place as ColumnPlace);
const placeLeft = (place: string): ColumnPlace | null => PLACE_ORDER[placeIndex(place) + 1] ?? null;
const placeRight = (place: string): ColumnPlace | null => (placeIndex(place) > 0 ? PLACE_ORDER[placeIndex(place) - 1] : null);
/** One unit of a place: "ten", "hundred", "ten thousand". */
const unitOf = (place: string) => (place === "ones" ? "one" : place.replace(/s$/, ""));
/** A count of a place: "1 ten", "5 tens". */
const countOf = (n: number, place: string) => `${n} ${n === 1 ? unitOf(place) : place}`;
/** The place's value: 1, 10, 100, 1000, 10000. */
const worth = (place: string) => 10 ** placeIndex(place);
/** The board's column name of a place ("ten thousands" is "ten_thousands"). */
const boardColumn = (place: string) => place.replace(/ /g, "_");

/** Maya's teaching limit for whole numbers (maya-teaching/limits.ts): six places, as the board and the spoken place names. */
const MAX_OPERAND = 999_999;

/** The numbers printed in a question's text, commas taken out ("10,000" is 10000). */
const printedNumbers = (text: string) => [...text.replace(/(\d),(?=\d{3}\b)/g, "$1").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

/** Words of a story that add: something gained, joined or counted together. */
const ADD_WORDS = /\b(?:gets?|got|buys?|bought|collects?|collected|finds?|found|earns?|earned|receives?|received|joins?|joined|adds?|added|gains?|gained|wins?|won|comes?|came|arrives?|arrived|grows?|grew|more|plus|in all|altogether|total|together|both|combined|sum)\b/i;
/** Words of a story that take away or compare: something given, used or lost, what is left, or how many more. */
const SUBTRACT_WORDS = /\b(?:gives?|gave|given|away|sells?|sold|spends?|spent|uses?|used|eats?|ate|eaten|loses?|lost|removes?|removed|breaks?|broke|broken|takes?|took|taken|left|leftover|remains?|remaining|fewer|less|minus|difference|how (?:many|much) (?:more|fewer|less|longer|shorter|taller|older|younger|heavier|lighter|further|farther)|more than|fewer than|less than)\b/i;

/**
 * Pre-launch review B, F12: a question's words must give its stored operation, or the kind does not fit (a story of 52
 * counters and 28 more, stored as 52 − 28, would teach 24). A printed sign between the two numbers must be the
 * operation's; a story must say the operation (add: something gained or counted together; subtract: something taken
 * away, what is left, or "how many more"), must not say the other one, and must print no third number.
 */
function wordsAgree(text: string, kind: "add" | "subtract", a: number, b: number): boolean {
  const t = text.replace(/(\d),(?=\d{3}\b)/g, "$1").trim();
  const signs = [...t.matchAll(/\d\s*([+\-−–×x÷*/=])\s*[\d?]/g)].map((m) => m[1]).filter((x) => x !== "=");
  if (signs.length > 0) return printedEquation(t, kind, a, b);
  const words = t.replace(/\d+/g, " ");
  if (!/[a-z]{3,}/i.test(words)) return false;
  if (!printedNumbers(t).every((n) => n === a || n === b)) return false;
  // Final check 2, N05: a story asks one question and ends with it ("... How many are left? Then add 28." is refused),
  // and a subtraction story prints the number it takes from first.
  if (!t.endsWith("?") || t.indexOf("?") !== t.length - 1) return false;
  if (kind === "subtract" && !(firstAt(t, a) >= 0 && firstAt(t, a) < firstAt(t, b))) return false;
  // "How many more points does Mia score?" compares: a subtraction. Its "more" is not a gain.
  const gains = ADD_WORDS.test(words.replace(/\bhow (?:many|much) more\b|\bmore than\b/gi, " "));
  const takes = SUBTRACT_WORDS.test(words);
  if (!(kind === "add" ? gains && !takes : takes && !gains)) return false;
  return asksResult(t, kind, a, b);
}

/** The closed question forms of an addition story: a total, or what someone has now. */
const ADD_ASKS = [
  new RegExp(String.raw`^how many ${THING} (?:is that |are there |does ${WHO} have |do ${WHO} have )?(?:in all|altogether|in total|together)$`),
  new RegExp(String.raw`^how many ${THING} (?:does|do) ${WHO} have now$`),
  // "they" are both of the story's people: a total.
  new RegExp(String.raw`^how many ${THING} did (?:they|both of them) ${WORD}(?: in all| altogether| together)?$`),
];
/** The closed question forms of a subtraction story: what is left, or what someone has now. */
const LEFT_ASKS = [
  new RegExp(String.raw`^how many ${THING} (?:are|is) left$`),
  new RegExp(String.raw`^how many ${THING} (?:does|do) ${WHO} have (?:left|now)$`),
];
/** A subtraction story that compares: "How many more points does Ava score?". */
const COMPARE_ASK = new RegExp(String.raw`^how many (?:more|fewer) ${THING} (?:does|do|did) ${WHO} ${WORD}$`);
/** Words of a clause that say something was taken or given. */
const TAKEN = /\b(?:gives?|gave|given|away|sells?|sold|spends?|spent|uses?|used|eats?|ate|eaten|loses?|lost|removes?|removed|breaks?|broke|broken|takes?|took|taken)\b/;
/** Words of a clause that say a later or earlier moment, or the result itself. */
const MOMENT = /\b(?:left|leftover|remains?|remaining|now|at first|before|in all|altogether|total|together)\b/;

/**
 * Pre-launch check 2: the story's final question asks for the stored operation's result, in a closed form, about the
 * thing its first number counts. A subtraction's first number is what someone has (no take word and no "now" or "left"
 * in its clause) and its second number is what is taken; a comparison asks how many more the first number's person has;
 * an addition's first number is a start and its second is what is gained. "How many counters did she have at first?"
 * and "How many boxes are left?" (a group, not the things it holds) keep the controller.
 */
function asksResult(t: string, kind: "add" | "subtract", a: number, b: number): boolean {
  const q = finalQuestion(t);
  if (q === null) return false;
  const first = clauseWith(t, a);
  const second = clauseWith(t, b);
  if (first === null || second === null || first === second) return false;
  const thingOf = (m: RegExpExecArray | null) => (m && countedInText(t, m[1]) && !isGroup(m[1]) ? m : null);
  if (kind === "add") {
    const m = thingOf(ADD_ASKS.map((re) => re.exec(q)).find(Boolean) ?? null);
    return !!m && !MOMENT.test(first) && !TAKEN.test(first) && ADD_WORDS.test(second) && !TAKEN.test(second);
  }
  const left = thingOf(LEFT_ASKS.map((re) => re.exec(q)).find(Boolean) ?? null);
  if (left) return !MOMENT.test(first) && !TAKEN.test(first) && TAKEN.test(second);
  const more = thingOf(COMPARE_ASK.exec(q));
  if (!more) return false;
  // The person asked about is the person of the first number; neither clause takes anything.
  const who = more[2].split(" ").at(-1)!;
  return new RegExp(String.raw`\b${who}\b`).test(first) && !new RegExp(String.raw`\b${who}\b`).test(second) && !TAKEN.test(first) && !TAKEN.test(second) && !MOMENT.test(first);
}

/** Where the number `n` is first printed in `t` (commas taken out), as a whole number; -1 when it is not. */
function firstAt(t: string, n: number): number {
  const m = new RegExp(`(?<![\\d.])${n}(?![\\d.])`).exec(t);
  return m ? m.index : -1;
}

/**
 * Final check 2, N05: a printed equation is the whole question, and it is the stored one in its order: "52 − 28 = ?"
 * for a stored 52 − 28 ("What is 52 − 28?" too). "28 − 52 = ?" and "52 − 28 = ? Then add 28." keep the controller.
 */
function printedEquation(t: string, kind: "add" | "subtract", a: number, b: number): boolean {
  const sign = kind === "add" ? "\\+" : "[-−–]";
  const eq = new RegExp(`^(?:${a}\\s*${sign}\\s*${b}\\s*=\\s*\\?|what is ${a}\\s*${sign}\\s*${b}\\s*\\?)\\s*\\.?$`, "i");
  return eq.test(t);
}

/**
 * A whole-number addition or subtraction whose work is only its columns, to the hundred thousands, with both numbers printed
 * in its text and words that agree with its operation: the kind reads all of it. A question that hides its numbers (a
 * geometry count worked as 4 + 0) keeps the controller.
 */
function fits(pkg: OperationPackage): boolean {
  const op = pkg.operation;
  if (op.kind !== "add" && op.kind !== "subtract") return false;
  const [a, b] = op.operands;
  if (![a, b].every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_OPERAND)) return false;
  if (op.kind === "subtract" && a < b) return false;
  if (pkg.answer.value.type !== "number" || pkg.answer.value.value !== (op.kind === "add" ? a + b : a - b)) return false;
  const work = pkg.steps.filter((s) => s.kind !== "result");
  const kind = op.kind === "add" ? "add-column" : "subtract-column";
  if (work.length === 0 || !work.every((s) => s.kind === kind && placeIndex(s.place) !== -1)) return false;
  const printed = printedNumbers(pkg.text);
  return printed.includes(a) && printed.includes(b) && wordsAgree(pkg.text, op.kind, a, b);
}

/** One column step as the tutor sees it: the numbers worked, its result, and the trade it needs. */
export interface TutorStep {
  id: string;
  place: string;
  /** The numbers worked in this column after any trade (12 and 8 for the ones of 52 - 28; a carry 1, 2 and 3 for the tens of 27 + 39). */
  operands: number[];
  op: "+" | "-";
  /** The column's result before writing (12 - 8 = 4; 7 + 9 = 16). */
  total: number;
  /** The digit written in the answer (0 when `blank`). */
  write: number;
  /** Subtraction: this column took 1 from the left. Addition: this column carries 1 to the left. */
  trade: boolean;
  /** Subtraction: the top digit as printed, before the trades. */
  printedTop?: number;
  /** Subtraction: this column gave 1 to the column on its right. */
  lent?: boolean;
  /** Subtraction: the leftmost column is 0 after its trade, and a 0 on the left of an answer is not written. */
  blank?: boolean;
  /** Addition: the column holds only the carried 1 and no printed digit (the new place of 78 + 56). */
  carryOnly?: boolean;
}

/**
 * Subtraction: the value a place shows between its two trades, when it both gives 1 and takes 10. A place with a digit
 * gives first (223 - 129: the tens are 2 - 1 = 1, then 11); a 0 place takes first (1002 - 4: the tens are 0 + 10 = 10,
 * then 9). Null for a place with one trade or none.
 */
function between(st: TutorStep): { value: number; expression: string } | null {
  if (st.op !== "-" || !st.trade || !st.lent || st.printedTop === undefined) return null;
  return st.printedTop > 0 ? { value: st.printedTop - 1, expression: `${st.printedTop} − 1` } : { value: st.printedTop + 10, expression: `${st.printedTop} + 10` };
}

/** Subtraction: how a place's top after its trades is made ("2 + 10", or "2 + 10 − 1" when it also gave 1). */
const afterTrade = (st: TutorStep) => (st.lent ? `${st.printedTop} + 10 − 1` : `${st.printedTop} + 10`);

export function tutorSteps(pkg: OperationPackage): TutorStep[] {
  return pkg.steps.filter(isColumn).map((st) => {
    if (st.kind === "subtract-column") {
      const top = st.top - (st.lent ? 1 : 0) + (st.regrouped ? 10 : 0);
      const bottom = st.bottom ?? 0;
      return {
        id: st.id, place: st.place, operands: [top, bottom], op: "-" as const, total: top - bottom, write: st.write ?? 0, trade: st.regrouped, printedTop: st.top,
        ...(st.lent ? { lent: true } : {}), ...(st.write === null ? { blank: true } : {}),
      };
    }
    const operands = st.carryIn ? [st.carryIn, ...st.digits] : [...st.digits];
    return { id: st.id, place: st.place, operands, op: "+" as const, total: st.total, write: st.write, trade: st.carryOut > 0, ...(st.carryIn > 0 && st.digits.length === 0 ? { carryOnly: true } : {}) };
  });
}

const opWord = (op: "+" | "-") => (op === "+" ? "+" : "−");
export const stepEquation = (st: TutorStep) => (st.operands.length < 2 ? `${st.total}` : `${st.operands.join(` ${opWord(st.op)} `)} = ${st.total}`);

/** The places a subtraction trades through to give `st` its 10, nearest first: past every 0 to the first place with a digit. */
function tradeChain(steps: readonly TutorStep[], st: TutorStep): TutorStep[] {
  const chain: TutorStep[] = [];
  let at = steps.indexOf(st) + 1;
  while (at < steps.length) {
    chain.push(steps[at]);
    // A place that also took 1 from its left had 0 to give: the trade goes on past it.
    if (!(steps[at].trade && steps[at].printedTop === 0)) break;
    at++;
  }
  return chain;
}

/** Each step as plain facts for the brief, in the order a child works them. */
function steps(pkg: OperationPackage): TutorStepFact[] {
  const all = tutorSteps(pkg);
  return all.map((st) => {
    const parts: string[] = [];
    const right = placeRight(st.place);
    if (st.op === "-") {
      // A lent and traded place (a 0 on the way of a trade): it got 10 and gave 1.
      const passedThrough = st.lent && st.trade && st.printedTop === 0;
      if (st.trade && !passedThrough) {
        const chain = tradeChain(all, st);
        const from = chain.at(-1)!;
        if (chain.length === 1) {
          parts.push(st.place === "ones"
            ? `${st.printedTop} ones is too small to take ${st.operands[1]}: trade 1 ${unitOf(from.place)} for 10 ones, so ${st.printedTop} ones become ${st.operands[0]}`
            : `${countOf(st.printedTop!, st.place)} is too small to take ${st.operands[1]}: trade 1 ${unitOf(from.place)} for 10 ${st.place}, so the ${st.place} now have ${st.operands[0]}`);
        } else {
          // Across zeros: each 0 place has nothing to give, so the trade starts at the first place with a digit and
          // every place on the way gets 10 and gives 1 of them on.
          const zeros = chain.slice(0, -1).map((x) => `the ${x.place}`);
          const trades = [...chain].reverse().map((x) => {
            const to = placeRight(x.place)!;
            return `1 ${unitOf(x.place)} for 10 ${to}`;
          });
          // Each trade by name while the step stays short; a longer run names the first trade and the rule for the rest.
          parts.push(chain.length <= 4
            ? `${countOf(st.printedTop!, st.place)} is too small to take ${st.operands[1]}, and ${zeros.length === 1 ? zeros[0] : `${zeros.slice(0, -1).join(", ")} and ${zeros.at(-1)}`} ${zeros.length === 1 ? "has" : "have"} 0 to give: trade ${trades.slice(0, -1).join(", then ")} and then ${trades.at(-1)}`
            : `${countOf(st.printedTop!, st.place)} is too small to take ${st.operands[1]}, and ${zeros[0]} to ${zeros.at(-1)} have 0 to give: trade ${trades[0]}, then 1 of each 0 place for 10 of the place on its right`);
          parts.push(st.place === "ones" ? `so ${st.printedTop} ones become ${st.operands[0]}` : `so the ${st.place} now have ${st.operands[0]}`);
        }
      }
      if (passedThrough) parts.push(`the ${st.place} got 10 ${st.place} from the trade and gave 1 ${unitOf(st.place)} to the ${right}, so the ${st.place} now have ${st.operands[0]}`);
      else if (st.lent && st.printedTop !== undefined) {
        parts.push(`1 ${unitOf(st.place)} was traded away, so ${countOf(st.printedTop, st.place)} ${st.printedTop === 1 ? "is" : "are"} now ${st.operands[0]}`);
      }
      if (st.blank) {
        parts.push(`the ${st.place} have nothing left, and a 0 on the left of the answer is not written`);
        return { id: st.id, place: st.place, work: parts.join("; "), result: "nothing to write" };
      }
      parts.push(stepEquation(st));
      parts.push(`write ${st.write} in the ${st.place}`);
      return { id: st.id, place: st.place, work: parts.join("; "), result: st.write };
    }
    if (st.carryOnly) parts.push(`only the carried 1 is in the ${st.place}`);
    else if (st.operands.length === 1) parts.push(`only the ${st.operands[0]} is in the ${st.place}, with nothing to add to it`);
    else parts.push(stepEquation(st));
    if (st.trade) parts.push(`trade 10 ${st.place} for 1 ${unitOf(placeLeft(st.place) ?? st.place)}: write ${st.write} and carry 1 to the ${placeLeft(st.place)}`);
    else parts.push(`write ${st.write} in the ${st.place}`);
    return { id: st.id, place: st.place, work: parts.join("; "), result: st.write };
  });
}

/** The digits of a number by place, ones first, to `places` places. */
const digitsOf = (x: number, places: number) => Array.from({ length: places }, (_, i) => Math.floor(x / 10 ** i) % 10);
const fromDigits = (d: readonly number[]) => d.reduce((t, x, i) => t + x * 10 ** i, 0);

/** What a number the child said means for this question: right, a known mistake, or not one of its values. */
function numberMeaning(pkg: OperationPackage, n: number): string {
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
  const [a, b] = pkg.operation.operands as [number, number];
  const steps = tutorSteps(pkg);
  if (n === answer) return "the right answer to the whole question";
  const meanings: string[] = [];
  const work = new Set(workValues(pkg));
  const mistake = (text: string) => {
    // A value of the work is never a mistake, even when a wrong way of working also gives it.
    if (!work.has(n)) meanings.push(`a likely mistake: ${text}`);
  };
  for (const [i, st] of steps.entries()) {
    if (st.blank) continue;
    if (n === st.write) meanings.push(`right for the ${st.place} digit (${stepEquation(st)})`);
    else if (n === st.total) meanings.push(`right for the ${st.place} (${stepEquation(st)})`);
    if (st.op === "-" && st.trade && n === st.operands[0]) meanings.push(`the ${st.place} after the trade (${afterTrade(st)})`);
    const mid = between(st);
    if (mid && n === mid.value) meanings.push(`the ${st.place} between the two trades (${mid.expression})`);
    if (st.op === "-" && st.trade && st.printedTop !== undefined && st.operands[1] > st.printedTop && n === st.operands[1] - st.printedTop) mistake(`the small digit taken from the big one in the ${st.place} (${st.operands[1]} − ${st.printedTop}) instead of trading first`);
    if (st.op === "-" && st.lent && !st.trade && st.printedTop !== undefined && st.printedTop >= st.operands[1] && n === st.printedTop - st.operands[1]) mistake(`the ${st.place} without taking away the traded ${unitOf(st.place)} (${st.printedTop} − ${st.operands[1]})`);
    if (st.op === "+" && i > 0 && steps[i - 1].trade && st.operands.length > 1 && (n === st.total - 1 || n === (st.total - 1) % 10)) mistake(`the ${st.place} without the carried 1`);
  }
  const places = Math.max(String(a).length, String(b).length);
  const [da, db] = [digitsOf(a, places), digitsOf(b, places)];
  const sub = pkg.operation.kind === "subtract";
  const trades = steps.filter((st) => st.trade);
  if (sub && meanings.length === 0 && trades.length > 0) {
    // Smaller-from-larger in every column (52 - 28 read as 36), and a trade with no 1 taken from the next place (52 - 28
    // read as 34).
    if (n === fromDigits(da.map((x, i) => Math.abs(x - db[i])))) mistake("the smaller digit taken from the bigger one in each column, with no trade");
    if (n === fromDigits(da.map((x, i) => (x - db[i] + 10) % 10))) {
      mistake(places === 2 && trades.length === 1 && trades[0].place === "ones"
        ? "traded for the ones but did not take the ten away from the tens"
        : "traded for a column but did not take 1 away from the next place");
    }
  }
  const carries = steps.filter((st) => st.op === "+" && st.trade);
  if (!sub && meanings.length === 0 && carries.length > 0) {
    // Every column's own sum with no carry: each column writes its last digit, and the leftmost writes its whole sum.
    const sums = da.map((x, i) => x + db[i]);
    const forgot = sums.reduce((t, s, i) => t + (i === places - 1 ? s : s % 10) * 10 ** i, 0);
    if (n === forgot) mistake(places === 2 ? "forgot the carried 1 in the tens" : "forgot a carried 1");
    const whole = Number(sums.slice().reverse().map(String).join(""));
    if (n === whole) mistake(places === 2 && carries.length === 1 && carries[0].place === "ones" ? "wrote the whole ones total instead of carrying" : "wrote a column's whole total instead of carrying");
  }
  if (meanings.length) return meanings.join("; ");
  if (n === a || n === b) return "a number of the question";
  if ([...da, ...db].includes(n)) return "a digit of the question";
  return "not a value of this question";
}

/** Values of the work that are never a wrong answer: each column's result, digit, top after its trades and between them. */
function workValues(pkg: OperationPackage): number[] {
  return tutorSteps(pkg).flatMap((st) => {
    const mid = between(st);
    return [...(st.blank ? [st.operands[0]] : [st.write, st.total, st.operands[0]]), ...(mid ? [mid.value] : [])];
  });
}

/** The numbers and operations a streamed sentence may hold. */
function streamScope(pkg: OperationPackage): { numbers: number[]; expressions: string[] } {
  const steps = tutorSteps(pkg);
  const [a, b] = pkg.operation.operands as [number, number];
  const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
  const places = Math.max(String(a).length, String(b).length);
  const numbers = [
    a, b, ...(answer === null ? [] : [answer]), ...digitsOf(a, places), ...digitsOf(b, places), 1, 10,
    ...steps.flatMap((st) => [...st.operands, st.total, st.write, ...(st.printedTop === undefined ? [] : [st.printedTop])]),
    ...steps.flatMap((st) => [st.total * worth(st.place), st.write * worth(st.place), ...(between(st) ? [between(st)!.value] : [])]),
  ];
  const expressions = [
    expressionKey([a, b], [pkg.operation.kind === "add" ? "+" : "-"]),
    ...steps.flatMap((st) => {
      const op = st.op === "+" ? "+" : "-";
      const keys = [expressionKey(st.operands, st.operands.slice(1).map(() => op))];
      if (st.op === "-") keys.push(expressionKey([st.operands[1], st.operands[0]], ["-"]));
      if (st.op === "-" && st.printedTop !== undefined) keys.push(expressionKey([st.printedTop, 10], ["+"]), expressionKey([st.printedTop, 1], ["-"]), expressionKey([st.printedTop, st.operands[1]], ["-"]), expressionKey([st.operands[1], st.printedTop], ["-"]));
      if (st.op === "-" && st.lent && st.trade) keys.push(expressionKey([st.printedTop! + 10, 1], ["-"]), expressionKey([st.printedTop!, 10, 1], ["+", "-"]), expressionKey([st.printedTop! - 1, 10], ["+"]));
      if (st.op === "+") keys.push(expressionKey(st.operands.filter((_, i) => !(i === 0 && st.operands.length > 2)), st.operands.slice(2).map(() => "+")), expressionKey([st.total, 10], ["-"]));
      return keys;
    }),
  ];
  return { numbers, expressions };
}

/** The next open step's question, or the whole question when every step is done. */
function stepQuestion(pkg: OperationPackage, done: readonly string[]): string {
  const next = tutorSteps(pkg).find((st) => !done.includes(st.id) && !st.blank);
  if (!next) {
    const [a, b] = pkg.operation.operands as [number, number];
    return `So what is ${a} ${pkg.operation.kind === "add" ? "plus" : "minus"} ${b}?`;
  }
  if (next.operands.length < 2) return `What do we write in the ${next.place}?`;
  return `What do you get for ${next.operands.join(next.op === "+" ? " plus " : " minus ")}?`;
}

const DRAWINGS = [
  { id: "trade", does: "shows the next trade on the question (it crosses out a top digit and gives the place on its right 10 more, through every 0 on the way; for addition, the carried 1)" },
  { id: "digit", does: "writes the answer digit in the place given (\"place\": \"ones\", \"tens\", \"hundreds\", \"thousands\", \"ten thousands\" or \"hundred thousands\"), after the trades it needs" },
  { id: "note", does: "writes one true equation of numbers below the question (\"place\": \"12 − 8 = 4\")" },
];

/**
 * The commands for the model's drawing requests, in order, and the keys of what they drew. `drawn`: what the call drew
 * already (never twice: the board would refuse it, and a refused board must never cost the child Maya's words).
 * "trade": the next trade (a borrow in the top row, through every 0 place on its way, or a carry above the answer).
 * "digit": an answer digit (`place`: ones to hundred thousands), with every trade it needs first. "note": a true equation
 * written beside the question.
 */
function draw(pkg: OperationPackage, requests: readonly { offer: string; place?: string }[], drawn: readonly string[], noteId: (i: number) => string): { commands: TutorCommand[]; keys: string[] } {
  const steps = tutorSteps(pkg);
  const commands: TutorCommand[] = [];
  const keys: string[] = [];
  const has = (k: string) => drawn.includes(k) || keys.includes(k);
  const cell = (place: string) => ({ objectId: "question", part: "cell", rowId: "answer", column: boardColumn(place) });
  const putDigit = (st: TutorStep) => {
    if (st.blank || has(`digit:${st.place}`)) return;
    commands.push({ op: "put", target: cell(st.place), value: String(st.write) });
    keys.push(`digit:${st.place}`);
  };
  const trade = (st: TutorStep) => {
    if (!st.trade || has(`trade:${st.place}`)) return;
    const left = placeLeft(st.place);
    if (!left) return;
    if (st.op === "-") {
      // The borrows from the far end of the trade first: a place with 0 has nothing to give until it gets its 10.
      for (const x of [...tradeChain(steps, st)].reverse()) {
        const to = placeRight(x.place)!;
        if (has(`trade:${to}`)) continue;
        commands.push({ op: "regroup", id: `tutor-trade-${boardColumn(to)}`, objectId: "question", rowId: "top", kind: "borrow", from: boardColumn(x.place), to: boardColumn(to) });
        keys.push(`trade:${to}`);
      }
      return;
    }
    putDigit(st);
    commands.push({ op: "regroup", id: `tutor-carry-${boardColumn(st.place)}`, objectId: "question", rowId: "answer", kind: "carry", from: boardColumn(st.place), to: boardColumn(left) });
    keys.push(`trade:${st.place}`);
  };
  let notes = 0;
  for (const d of requests) {
    if (d.offer === "trade") {
      const st = steps.find((x) => x.trade && !has(`trade:${x.place}`));
      if (st) trade(st);
    } else if (d.offer === "digit") {
      const place = (d.place ?? "").trim().toLowerCase().replace(/_/g, " ");
      const st = steps.find((x) => x.place === place && !x.blank) ?? steps.find((x) => !x.blank && !has(`digit:${x.place}`));
      if (!st) continue;
      // Every trade and digit to the right of this column first, so the board holds the method's own order.
      for (const x of steps) {
        if (x === st) break;
        trade(x);
        putDigit(x);
      }
      trade(st);
      putDigit(st);
    } else if (d.offer === "note" && d.place) {
      // Only a whole equation of numbers, rebuilt from its values: no other text reaches the board.
      const text = noteFromEquation(d.place);
      if (text) commands.push({ op: "write", id: noteId(notes++), text, place: { below: "question" } });
    }
  }
  return { commands, keys };
}

// ---------- The kind's own claims: place quantities in the thousands and ten thousands ----------

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const NUM = String.raw`(?:\d+|(?:${TENS.join("|")})(?:[- ](?:${SMALL.slice(1, 10).join("|")}))?|${SMALL.join("|")}|an?)`;
const UNIT = String.raw`(?:hundred thousands?|ten thousands?|thousands?|hundreds?|tens?|ones?)\b`;
const BIG = /\b(?:thousands?)\b/i;
const REL = String.raw`(?:is not equal to|isn't equal to|is not|isn't|are not|aren't|is the same as|is equal to|equals|is now|are now|becomes|become|became|turns into|turn into|turned into|=|is|are|makes|make)`;
const CLAIM_TOKEN = new RegExp(String.raw`\b(${NUM})\s+(${UNIT})|\b(${NUM})\b(?![\s-]+${UNIT})|(plus|\+|minus|take away|-)(?=\s|\d|$)|(?<![a-z'])(${REL})(?=\s|\d|$)|\b(and)\b|([a-z']+|[^\sa-z0-9])`, "gi");

function wordNumber(word: string): number | null {
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  if (w === "a" || w === "an") return 1;
  // Final check 10 (2026-11-15): number words go through the one standard reader.
  return standardNumber(w);
}

const unitWorth = (unit: string) => {
  const u = unit.toLowerCase().replace(/s$/, "");
  return u === "hundred thousand" ? 100000 : u === "ten thousand" ? 10000 : u === "thousand" ? 1000 : u === "hundred" ? 100 : u === "ten" ? 10 : 1;
};

type ClaimItem = { kind: "term"; value: number; place: number | null; unit: boolean } | { kind: "op"; sign: 1 | -1 } | { kind: "rel"; negated: boolean; now: boolean } | { kind: "and" } | { kind: "other"; word?: string };

/**
 * The false claims of a sentence that names a thousands, ten thousands or hundred thousands place, read again here:
 * "1 thousand is 100 hundreds", "the 0 thousands are now 10 thousands". Each side is a place quantity ("9 thousands and
 * 10 hundreds") or a number, joined by plus or minus. "is now" / "become" between two counts of one place says a trade:
 * in a subtraction a place gets 10, gives 1, or both (0 thousands become 9 thousands); in an addition it gives 10, gets
 * the carried 1, or both.
 */
function claimProblems(pkg: OperationPackage, sentence: string): string[] {
  // Final check 12: every refusal passes the one full-read guard (tutor-math.ts guardedProblems).
  return guardedProblems([...tradeProblems(sentence), ...relationProblems(pkg, sentence)]);
}

/** A sentence that trades or swaps: each "Q for Q" in it is a trade, and its two quantities must be worth the same. */
const TRADE_WORD = /\b(?:trade|trades|traded|trading|regroup|regroups|regrouped|exchange|exchanged|swap|swapped|change|changed|break|breaks|broke|carry|carried)\b/i;
const TRADE_VERB = String.raw`(?:trade|trades|traded|trading|regroup|regroups|regrouped|exchange|exchanged|swap|swapped|change|changed|break|breaks|broke|carry|carried)`;
/**
 * A trade's two quantities: what is given right after the trade word or a list word ("trade 1 thousand for 10 hundreds,
 * then 1 hundred for 10 tens"), with an optional "from the 5 tens" between it and "for".
 */
const TRADE_PAIR = new RegExp(String.raw`(?:\b(?:${TRADE_VERB}|then|and)|,)\s+(?:the\s+)?(${NUM})\s+(${UNIT})(?:\s+from\s+[^,.;:]*?)?\s+(?:for|into|as)\s+(${NUM})\s+(${UNIT})`, "gi");

/**
 * The false trades of a sentence ("Trade 1 thousand for 100 hundreds", "trade 1 ten for 100 ones"): in a sentence with
 * a trade word, each pair of place quantities joined by "for", "into" or "as" must be worth the same. Every place.
 */
function tradeProblems(sentence: string): KindRead[] {
  if (!TRADE_WORD.test(sentence)) return [];
  const text = sentence.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const problems: KindRead[] = [];
  for (const m of text.matchAll(TRADE_PAIR)) {
    const [x, y] = [wordNumber(m[1]), wordNumber(m[3])];
    if (x === null || y === null) continue;
    const [give, get] = [exactValue([x, unitWorth(m[2])], ["*"]), exactValue([y, unitWorth(m[4])], ["*"])];
    if (give === null || get === null) continue;
    if (give !== get) problems.push({ problem: `it trades ${give} for ${get}, which are not the same`, text, at: m.index!, end: m.index! + m[0].length });
  }
  return problems;
}

/** The relations of a sentence that names a thousands or larger place (the kind's own second read). */
function relationProblems(pkg: OperationPackage, sentence: string): KindRead[] {
  if (!BIG.test(sentence)) return [];
  const text = sentence.replace(/[−–]/g, "-").replace(/(\d),(?=\d{3}\b)/g, "$1");
  const items: ClaimItem[] = [];
  /** Where each item is in `text`, for the full-read guard. */
  const spans: [number, number][] = [];
  for (const m of text.matchAll(CLAIM_TOKEN)) {
    const count = items.length;
    if (m[1] && /^(?:ten|hundred)$/i.test(m[1]) && /\bthe\s+$/i.test(text.slice(0, m.index))) {
      // "the ten thousands", "the hundred thousands": the name of a place, not a count of it.
      items.push({ kind: "other" });
    } else if (m[1]) {
      const n = wordNumber(m[1]);
      const place = unitWorth(m[2]);
      // "and" between two place quantities joins them into one ("9 thousands and 10 hundreds").
      const prev = items.at(-1);
      const before = items.at(-2);
      // Final check 12: every product and sum through the one shared evaluator; a value it cannot hold is unread.
      const worth = n === null ? null : exactValue([n, place], ["*"]);
      if (worth !== null && prev?.kind === "and" && before?.kind === "term" && before.unit) {
        items.pop();
        const joined = exactValue([before.value, worth], ["+"]);
        if (joined === null) { items.pop(); items.push({ kind: "other" }); continue; }
        before.value = joined;
        before.place = null;
        continue;
      }
      items.push(worth === null ? { kind: "other" } : { kind: "term", value: worth, place, unit: true });
    } else if (m[3]) {
      const n = wordNumber(m[3]);
      items.push(n === null ? { kind: "other" } : { kind: "term", value: n, place: null, unit: false });
    } else if (m[4]) items.push({ kind: "op", sign: /^(?:plus|\+)$/i.test(m[4]) ? 1 : -1 });
    else if (m[5]) {
      const r = m[5].toLowerCase();
      items.push({ kind: "rel", negated: /not|n't/.test(r), now: /\bnow\b|becom|became|turn/.test(r) });
    } else if (m[6]) items.push({ kind: "and" });
    else if (!(m[7]?.toLowerCase() === "the")) items.push({ kind: "other", word: m[7]?.toLowerCase() });
    // Keep the spans in step with the items: a pushed item gets its span; a joined quantity grows the span it joined.
    const span: [number, number] = [m.index!, m.index! + m[0].length];
    if (items.length > count) spans.push(span);
    else if (items.length < count) { spans.length = items.length; if (items.length > 0) spans[items.length - 1] = [spans[items.length - 1][0], span[1]]; }
  }
  type Side = { value: number; place: number | null; unit: boolean; next: number };
  const side = (at: number): Side | null => {
    const first = items[at];
    if (first?.kind !== "term") return null;
    const values = [first.value];
    const ops: ("+" | "-")[] = [];
    let place = first.place;
    let unit = first.unit;
    let next = at + 1;
    while (items[next]?.kind === "op" && items[next + 1]?.kind === "term") {
      const t = items[next + 1] as Extract<ClaimItem, { kind: "term" }>;
      ops.push((items[next] as Extract<ClaimItem, { kind: "op" }>).sign > 0 ? "+" : "-");
      values.push(t.value);
      unit ||= t.unit;
      place = null;
      next += 2;
    }
    // Final check 12: the one shared evaluator; a side it cannot hold exactly is not read.
    const value = exactValue(values, ops);
    return value === null ? null : { value, place, unit, next };
  };
  const subtract = pkg.operation.kind === "subtract";
  const trade = (x: Side, y: Side) => {
    if (x.place === null || !x.unit) return false;
    const after = y.unit ? (y.place === x.place ? y.value : null) : y.value * x.place;
    if (after === null) return false;
    const change = (after - x.value) / x.place;
    return subtract ? [10, -1, 9].includes(change) : [-10, 1, -9].includes(change);
  };
  const problems: KindRead[] = [];
  let i = 0;
  while (i < items.length) {
    const left = side(i);
    if (!left || items[left.next]?.kind !== "rel") { i++; continue; }
    const rel = items[left.next] as Extract<ClaimItem, { kind: "rel" }>;
    const right = side(left.next + 1);
    if (!right) { i = left.next + 1; continue; }
    // Final check 12: a part of a longer number, an enclosing negation or scope and an unread continuation ("is seven
    // thousand nine hundred ninety-nine", "It is not true that ...", "divided by 2") are left to the one full-read
    // guard (claimProblems): such a claim is unread, never refused here.
    const at = spans[i][0];
    const end = spans[right.next - 1][1];
    // Only a claim that holds a place quantity: two plain numbers are the core's to read.
    if (left.unit || right.unit) {
      const equal = left.value === right.value || (rel.now && trade(left, right));
      if (!rel.negated && !equal) problems.push({ problem: `it says ${left.value} and ${right.value} are the same`, text, at, end });
      if (rel.negated && left.value === right.value) problems.push({ problem: `it says ${left.value} and ${right.value} are not the same`, text, at, end });
    }
    i = right.next;
  }
  return problems;
}

/** Short facts about how the column method is worked, for the brief. */
function notes(pkg: OperationPackage): string[] {
  const steps = tutorSteps(pkg);
  const out: string[] = [];
  if (steps.length > 2) out.push("Work the columns from the ones to the left, one place at a time.");
  if (steps.some((st) => st.lent && st.trade && st.printedTop === 0)) out.push("A trade across zeros: a 0 place has nothing to give, so the trade starts at the first place with a digit, and each 0 place on the way gets 10 and gives 1 on, so it shows 9.");
  const last = steps.at(-1);
  if (last?.op === "+" && last.carryOnly) out.push(`The last carry makes a new place: the 1 is written in the ${last.place}.`);
  return out;
}

/**
 * B2: what each drawing needs on the board first. Subtraction: a borrow into a place needs the borrow into the place
 * it comes from when that place had 0 (a trade across zeros), and the digit on its right unless it is part of that
 * column's trade across zeros; a digit needs the borrow into its place, the borrow its
 * place gave, and the digit on its right. Addition: a carry needs its column's digit; a digit needs the carry into its
 * place and the digit on its right.
 */
function boardNeeds(pkg: OperationPackage): Record<string, string[]> {
  const steps = tutorSteps(pkg);
  const needs: Record<string, string[]> = {};
  const at = (place: string | null) => (place ? steps.find((x) => x.place === place) : undefined);
  const digit = (st: TutorStep | undefined) => (st && !st.blank ? [`digit:${st.place}`] : []);
  for (const st of steps) {
    const right = at(placeRight(st.place));
    if (st.op === "-") {
      const from = at(placeLeft(st.place));
      // A 0 place traded through on the way to the column on its right (a trade across zeros) is part of that column's
      // trade; any other borrow is its own column's work, after the digit on its right.
      const chained = st.printedTop === 0 && !!right?.trade;
      if (st.trade) needs[`trade:${st.place}`] = [...(from && from.trade && from.printedTop === 0 ? [`trade:${from.place}`] : []), ...(chained ? [] : digit(right))];
      if (!st.blank) needs[`digit:${st.place}`] = [...(st.trade ? [`trade:${st.place}`] : []), ...(st.lent && right ? [`trade:${right.place}`] : []), ...digit(right)];
    } else {
      if (st.trade) needs[`trade:${st.place}`] = [`digit:${st.place}`];
      if (!st.blank) needs[`digit:${st.place}`] = [...(right?.trade ? [`trade:${right.place}`] : []), ...digit(right)];
    }
  }
  return needs;
}

export const columnKind: TutorKind = {
  id: "column",
  fits,
  steps,
  numberMeaning,
  workValues,
  streamScope,
  stepQuestion,
  boardNeeds,
  // A question with no trade (90 - 40) offers no trade drawing.
  drawings: (pkg) => DRAWINGS.filter((d) => d.id !== "trade" || tutorSteps(pkg).some((st) => st.trade)),
  drawingExamples: (pkg) => {
    const steps = tutorSteps(pkg);
    const worked = steps.find((st) => st.operands.length > 1);
    return [
      { offer: "trade", place: "" },
      { offer: "digit", place: steps[0]?.place ?? "ones" },
      ...(worked ? [{ offer: "note", place: stepEquation(worked).replace("−", "-") }] : []),
    ];
  },
  draw,
  // The core reads the equations, the place quantities and the trades (tutor-math.ts); this kind reads the thousands
  // and larger places again with its own trade rule (a place may get 10, give 1, or both).
  claimProblems,
  op: (pkg) => (pkg.operation.kind === "add" ? "add" : "subtract"),
  notes,
};
