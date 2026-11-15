// More true math read by code alone (two-layer true math, speed round of 2026-11-15). The claim reader
// (tutor-math.ts readClaims) reads relations; these readers read whole clauses of other common shapes in Maya's words
// and say whether each is true by code: an instruction with a number ("write 4 in the ones", "carry the 1"), checked
// against the kind's own step texts; "you can't take 8 from 2"; "66 is right"; a counting list after a counting
// instruction; a mention of one of the question's own operations ("in 52 − 28"); a few questions that ask and claim
// nothing. Each reader matches a whole clause, anchored, with no other words: a clause that does not match, or that
// matches with a fact code cannot prove, is left as it was, so it still goes to the math-truth review. A reader never
// refuses: the claim reader and the kinds refuse.
import { expressionKey, type TutorStepFact } from "./tutor-kind";
import { numberOf } from "./tutor-math";

/** What the readers check a clause against: the kind's step texts, the question's own operations and numbers, and the kind's own read. */
export interface TutorReadFacts {
  /** The kind's steps (TutorKind.steps): code's own true texts, with each step's place. */
  steps: readonly TutorStepFact[];
  /**
   * The question's own operations (expressionKey): the question and each operation its step texts work ("12 − 8" in
   * 52 − 28). Never a mistake's operation (the stream scope also lets "5 − 2" be said).
   */
  expressions: ReadonlySet<string>;
  /** The places of the steps whose text works each operation ("4-2" is the tens step of 52 − 28). */
  expressionPlaces?: ReadonlyMap<string, ReadonlySet<number>>;
  /** The question's own numbers (TutorKind.streamScope) and the answer. */
  numbers: ReadonlySet<number>;
  /** The question's own operation (expressionKey), when it is one of whole numbers ("52-28"). */
  question?: string;
  /** The kind's own read (TutorKind.coveredClaims): the clauses of a sentence it read whole and found true. */
  covered?: (sentence: string) => readonly string[];
}

const WORD_NUMBER = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
/** A whole number in digits ("1,340" too) or one number word below 100 ("forty-two"). */
const N = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+|(?:${WORD_NUMBER})(?:-(?:${WORD_NUMBER}))?)`;
/** A place, plural or not. */
const P = String.raw`(?:hundred thousands?|ten thousands?|ones?|tens?|hundreds?|thousands?)`;
const PLACES: Record<string, number> = { one: 1, ten: 10, hundred: 100, thousand: 1000, "ten thousand": 10000, "hundred thousand": 100000 };
const placeOf = (word: string | undefined): number | null => (word ? PLACES[word.toLowerCase().replace(/s$/, "")] ?? null : null);
const value = (word: string): number | null => numberOf(word.replace(/,/g, ""));

/** Spoken words before the math of a clause that add no claim. */
const LEAD = String.raw`(?:(?:so|and|now|then|next|first|also|yes|okay|ok|right|great|good|careful|remember|\{name\})[\s,!]+)*`;
/** Who does the step, with an optional helper verb. */
const WHO = String.raw`(?:(?:we|you|i|let's|let us)(?:'ll| will| can| need to| have to| should| just| already| then| also| now)*\s+)?(?:(?:already|just|also|then|now)\s+)?`;
const WHERE = String.raw`(in|into|on|above|over|on top of|at the top of|below|under)`;
const PLACE_PHRASE = String.raw`(?:the\s+)?(${P})(?:\s+(?:place|column|row|spot))?`;

/** One written instruction or state, as code compares it with the step texts. */
interface Instruction { verb: "write" | "carry" | "bring"; n: number; carried: boolean; at: "in" | "above" | "below"; place: number | null; make?: number; from?: number | null; only?: true }

const atOf = (w: string | undefined): Instruction["at"] => (!w || /^(?:in|into|on)$/i.test(w) ? "in" : /^(?:below|under)$/i.test(w) ? "below" : "above");

const WRITE = String.raw`(?:write|writes|wrote|written|put|puts)(?:\s+down)?\s+(?:the\s+|that\s+|a\s+)?(carried\s+)?(${N})(?:\s+${WHERE}\s+${PLACE_PHRASE})?`;
const CARRY = String.raw`(?:carry|carries|carried)\s+(?:the\s+|that\s+|a\s+)?(?:(${N})(?=\s|$))?(?:\s*\b(${P}))?(?:\s+(?:to|into|over to|up to|onto|over into)\s+${PLACE_PHRASE})?`;
const WRITE_FORM = new RegExp(String.raw`^${LEAD}${WHO}${WRITE}$`, "i");
/** "We wrote 2 in the tens and 4 in the ones." */
const WRITE_TWO_FORM = new RegExp(String.raw`^${LEAD}${WHO}${WRITE}\s+and\s+(${N})\s+${WHERE}\s+${PLACE_PHRASE}$`, "i");
const WRITE_CARRY_FORM = new RegExp(String.raw`^${LEAD}${WHO}${WRITE}\s+and\s+(?:then\s+)?${WHO}${CARRY}$`, "i");
const CARRY_FORM = new RegExp(String.raw`^${LEAD}${WHO}${CARRY}$`, "i");
/** "4 is already in the ones place", "the carried 1 is in the hundreds". */
const STATE_FORM = new RegExp(String.raw`^${LEAD}(only\s+)?(?:the\s+|that\s+|a\s+)?(carried\s+)?(${N})\s+(?:is|was|goes|went)\s+(?:already\s+|now\s+)?(?:written\s+|put\s+)?${WHERE}\s+${PLACE_PHRASE}$`, "i");
const BRING_FORM = new RegExp(String.raw`^${LEAD}${WHO}(?:bring|brings|brought)\s+down\s+(?:the\s+)?(${N})\s+to\s+make\s+(${N})$`, "i");

function carryOf(n: string | undefined, unit: string | undefined, to: string | undefined): Instruction | null {
  // "carry the ten" is 1 ten; "carry 1 ten" too; a bare "carry" names nothing.
  // "carried the ten": a place word alone is 1 of that place.
  if (n !== undefined && unit === undefined && /^(?:ten|hundred|thousand)$/i.test(n)) [n, unit] = [undefined, n];
  const count = n !== undefined ? value(n) : unit !== undefined ? 1 : null;
  if (count === null) return null;
  // "the 1 ten" goes into the tens; "to the hundreds" names the place. Both said must name one place: "carry 1 hundred
  // to the tens" is not read (review of #1047).
  if (unit !== undefined && to !== undefined && placeOf(unit) !== placeOf(to)) return null;
  return { verb: "carry", n: count, carried: false, at: "in", place: placeOf(to) ?? placeOf(unit) };
}

/** The instructions of one clause read whole, or null when the clause is not only instructions. */
export function instructionsOf(clause: string, defaultPlace: number | null = null): Instruction[] | null {
  const text = clause.trim().replace(/[’]/g, "'").replace(/[.!]+$/, "");
  let m = WRITE_CARRY_FORM.exec(text);
  if (m) {
    const n = value(m[2]);
    const carry = carryOf(m[5], m[6], m[7]);
    if (n === null || !carry) return null;
    return [{ verb: "write", n, carried: !!m[1], at: atOf(m[3]), place: placeOf(m[4]) ?? defaultPlace }, carry];
  }
  m = WRITE_TWO_FORM.exec(text);
  if (m && m[4] !== undefined) {
    const [a, b] = [value(m[2]), value(m[5])];
    return a === null || b === null ? null : [{ verb: "write", n: a, carried: !!m[1], at: atOf(m[3]), place: placeOf(m[4]) }, { verb: "write", n: b, carried: false, at: atOf(m[6]), place: placeOf(m[7]) }];
  }
  m = WRITE_FORM.exec(text);
  if (m) {
    const n = value(m[2]);
    return n === null ? null : [{ verb: "write", n, carried: !!m[1], at: atOf(m[3]), place: placeOf(m[4]) ?? defaultPlace }];
  }
  m = STATE_FORM.exec(text);
  if (m) {
    const n = value(m[3]);
    return n === null ? null : [{ verb: "write", n, carried: !!m[2], at: atOf(m[4]), place: placeOf(m[5]), ...(m[1] ? { only: true as const } : {}) }];
  }
  m = CARRY_FORM.exec(text);
  if (m) {
    const carry = carryOf(m[1], m[2], m[3]);
    return carry ? [carry] : null;
  }
  m = BRING_FORM.exec(text);
  if (m) {
    const [n, make] = [value(m[1]), value(m[2])];
    return n === null || make === null ? null : [{ verb: "bring", n, carried: false, at: "in", place: null, make }];
  }
  return null;
}

/**
 * A sentence split as the core splits it for coverage (unreadMath): clauses at even indexes, the separators (":", ";",
 * a comma outside a number) at odd ones. A kind's coveredClaims names clauses of this split.
 */
export function splitClauses(sentence: string): string[] {
  return sentence.replace(/[’]/g, "'").replace(/[−–]/g, "-").trim().replace(/[.!?]+\s*$/, "").split(/(\s*[:;]\s*|(?<!\d),\s*|,(?!\d{3}(?!\d))\s*)/);
}

/** A clause as the core compares a kind's coveredClaims with it. */
export const clauseKey = (clause: string) => clause.replace(/[’]/g, "'").replace(/[−–]/g, "-").trim().replace(/[.!?]+$/, "").toLowerCase();

/** The operations a kind's step texts work ("12 − 8 = 4", "1 + 2 + 3 = 6"), as keys, with the question's own. */
export function workExpressions(steps: readonly TutorStepFact[], question: string | undefined): Set<string> {
  return new Set([...(question ? [question] : []), ...workPlaces(steps).keys()]);
}

/** Each operation the step texts work, with the places of the steps that work it. */
export function workPlaces(steps: readonly TutorStepFact[]): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  const re = new RegExp(String.raw`${N}(?:\s*(?:\+|-|−|minus|plus|×|times)\s*${N})+(?=\s*=)`, "gi");
  for (const st of steps) for (const m of st.work.replace(/[−–]/g, "-").matchAll(re)) {
    const e = expressionOf(m[0]);
    if (!e) continue;
    const places = out.get(e.key) ?? new Set<number>();
    const place = placeOf(st.place);
    if (place !== null) places.add(place);
    out.set(e.key, places);
  }
  return out;
}

/** The clauses of a text, split as the core splits them (at ":", ";", "," outside a number, and a full stop). */
const clausesOf = (text: string) => text.split(/\s*[:;.]\s*|(?<!\d),\s*|,(?!\d{3}(?!\d))\s*/).map((x) => x.trim()).filter(Boolean);

/** The instructions the kind's step texts give, each with its step's place when the text names none. */
function stepInstructions(steps: readonly TutorStepFact[]): Instruction[] {
  const out: Instruction[] = [];
  // Each instruction keeps the place of the step that gives it ("from"): a carry with no place said is that step's.
  for (const st of steps) for (const c of clausesOf(st.work)) out.push(...(instructionsOf(c, placeOf(st.place)) ?? []).map((x) => ({ ...x, from: placeOf(st.place) })));
  return out;
}

/** An instruction of Maya's is true when a step text gives the same: the same number, place (when she names one) and spot. */
function instructionTrue(said: Instruction, facts: readonly Instruction[]): boolean {
  return facts.some((f) => f.verb === said.verb && f.n === said.n && f.carried === said.carried && f.at === said.at && (said.place === null || f.place === said.place) && f.make === said.make && !!f.only === !!said.only);
}

const MINUS = String.raw`(?:minus|take away|−|-)`;
/** "You can't take 8 from 2 ones", "we cannot do 2 minus 8": true when the first number is bigger (whole numbers). */
const CANT_TAKE = new RegExp(String.raw`^${LEAD}(?:(?:but|and)\s+)?(?:we|you|i)?\s*(?:can't|cannot|can not|couldn't)\s+(?:take|subtract)(?:\s+away)?\s+(?:the\s+)?(${N})(?:\s+(${P}))?\s+(?:from|away from)\s+(?:the\s+|just\s+|only\s+)?(${N})(?:\s+(${P}))?(?:\s+(?:yet|alone|by itself))?$`, "i");
const CANT_DO = new RegExp(String.raw`^${LEAD}(?:we|you|i)?\s*(?:can't|cannot|can not|couldn't)\s+do\s+(${N})(?:\s+(${P}))?\s+${MINUS}\s+(${N})(?:\s+(${P}))?(?:\s+(?:yet|alone|by itself))?$`, "i");
/** "2 is too small to take 8 from", "1 ten is too small to take 5": true when the first number is smaller. */
const TOO_SMALL = new RegExp(String.raw`^${LEAD}(?:(?:but|and)\s+)?(?:the\s+)?(${N})(?:\s+(${P}))?\s+(?:is|are)\s+too\s+small\s+to\s+(?:take|subtract)(?:\s+away)?\s+(${N})(?:\s+(${P}))?(?:\s+(?:from|away))?(?:\s+from\s+(?:it|them))?$`, "i");

/** Whether `a` and `b` (with their place words) are a smaller-than pair code can compare: a count against a count in one place. */
function smaller(a: string, ua: string | undefined, b: string, ub: string | undefined): boolean | null {
  const [x, y] = [value(a), value(b)];
  if (x === null || y === null) return null;
  // Each count in its own place; a count with no place word is ones ("take 8 from 2 ones"). "2 tens minus 8" is 20 and
  // 8, so it is not too small (review of #1047).
  const [px, py] = [ua === undefined ? 1 : placeOf(ua), ub === undefined ? 1 : placeOf(ub)];
  if (px === null || py === null) return null;
  return x * px < y * py;
}

/** "66 is right", "16 is right for 7 + 9", "Not 56", "36 isn't right", "56 isn't it". */
const IS_RIGHT = new RegExp(String.raw`^${LEAD}(?:(?:but|and)\s+)?(?:your\s+|the\s+)?(${N})\s+(?:is|was)\s+(?:right|correct)(?:\s+for\s+(.+))?$`, "i");
const NOT_IT = new RegExp(String.raw`^${LEAD}(?:(?:but|and)\s+)?(?:not\s+(${N})|(?:your\s+|the\s+)?(${N})\s+(?:isn't|is not|wasn't|was not)\s+(?:right|correct|it|the answer))$`, "i");

/** An expression of whole numbers with + and − ("27 + 39", "12 minus 8", "1 + 2 + 3"), its key and value; or null. */
function expressionOf(text: string): { key: string; value: number } | null {
  const parts = text.trim().replace(/[−–]/g, "-").split(/\s*(\+|plus|-|minus|take away|×|times)\s*/i);
  if (parts.length < 3 || parts.length % 2 === 0) return null;
  const operands: number[] = [];
  const ops: string[] = [];
  for (const [k, part] of parts.entries()) {
    if (k % 2 === 1) { ops.push(/^(?:\+|plus)$/i.test(part) ? "+" : /^(?:×|times)$/i.test(part) ? "*" : "-"); continue; }
    if (!new RegExp(String.raw`^${N}$`, "i").test(part)) return null;
    const n = value(part);
    if (n === null) return null;
    operands.push(n);
  }
  // A product only alone ("4 × 2"): a mix of × with + or − is not read here.
  if (ops.includes("*") && !ops.every((o) => o === "*")) return null;
  let total = operands[0];
  for (const [k, op] of ops.entries()) total = op === "*" ? total * operands[k + 1] : total + (op === "+" ? operands[k + 1] : -operands[k + 1]);
  return { key: expressionKey(operands, ops), value: total };
}

/** A clause that only names one of the question's own operations: "in 52 − 28", "now try 12 − 8", "back to 27 + 39". */
const MENTION = new RegExp(String.raw`^${LEAD}(?:(?:but|and)\s+)?(?:(?:in|for|back to|now back to|let's try|try|let's do|let's look at|look at|we look at|then|now)\s+)?(?:the\s+)?(.+?)(?:\s+again)?$`, "i");

/** Counting instructions: the start, the direction, how many and where to stop, when said. */
const COUNT_FORMS: readonly RegExp[] = [
  // "Count up 8 more from 7", "count back 2 from 4", "count up from 8 to 12"
  new RegExp(String.raw`^${LEAD}${WHO}(?:count|counting)\s+(?<dir>up|on|down|back)(?:\s+(?<k>${N}))?(?:\s+more)?\s+from\s+(?<a>${N})(?:\s+to\s+(?<b>${N}))?(?:\s+to check)?$`, "i"),
  // "Start at 9 and count up 7 more", "start at 8 and count up to 12"
  new RegExp(String.raw`^${LEAD}${WHO}start\s+(?:at|from|on)\s+(?<a>${N})\s+and\s+count\s+(?<dir>up|on|down|back)?\s*(?:(?<k>${N})(?:\s+more)?|to\s+(?<b>${N}))$`, "i"),
];

interface Count { a: number; up: boolean; k: number | null; b: number | null }

function countOf(clause: string): Count | null {
  for (const re of COUNT_FORMS) {
    const m = re.exec(clause.trim().replace(/[’]/g, "'").replace(/[.!]+$/, ""));
    if (!m?.groups) continue;
    const g = m.groups;
    const a = value(g.a);
    const k = g.k === undefined ? null : value(g.k);
    const b = g.b === undefined ? null : value(g.b);
    if (a === null || (g.k !== undefined && k === null) || (g.b !== undefined && b === null)) return null;
    const up = !/^(?:down|back)$/i.test(g.dir ?? "up");
    if (b !== null && (up ? b <= a : b >= a)) return null;
    // "Count up 7 from 9 to 12": the count and the end must agree (review of #1047).
    if (k !== null && b !== null && b !== (up ? a + k : a - k)) return null;
    return { a, up, k, b };
  }
  return null;
}

/** The operation a counting instruction works: "count up 7 from 9" is 9 + 7, "count up from 8 to 12" is 12 − 8. */
function countKeys(c: Count): string[] {
  if (c.k !== null) return c.up ? [expressionKey([c.a, c.k], ["+"])] : [expressionKey([c.a, c.k], ["-"])];
  if (c.b !== null) return c.up ? [expressionKey([c.b, c.a], ["-"]), expressionKey([c.a, c.b - c.a], ["+"])] : [expressionKey([c.a, c.a - c.b], ["-"])];
  return [];
}

/** Questions that ask and claim nothing, with no number: "How many tens are left?", "How many is that?" */
const BARE_QUESTIONS: readonly RegExp[] = [
  new RegExp(String.raw`^${LEAD}how many(?:\s+(?:${P}|blocks|bundles|sticks|fingers|ones|more))?\s+(?:are|is)\s+(?:left|there|that|still up|left over)(?:\s+now)?$`, "i"),
  /^what (?:number )?is (?:it|that)$/i,
];
/** Questions about the child's own words: "How did you get 66?", "Did you say 5?" (they ask; the number is the child's). */
const CHILD_QUESTION = new RegExp(String.raw`^${LEAD}(?:how did you get|did you (?:say|mean|get|write)|you said|was it)\s+(${N})(?:\s+this time)?(?:\s+or\s+(${N}))?$`, "i");
/** Fixed clauses with no number that claim nothing: they also stand between clauses as a plain link. */
const NO_NUMBER: readonly RegExp[] = [
  new RegExp(String.raw`^${LEAD}(?:the\s+)?${P}\s+(?:are|is)\s+(?:done|finished)$`, "i"),
  /^(?:no|nope|yes|yep|yeah|not quite|not yet|hmm+|careful|good question|great question|okay|ok|well|look|great|nice|good|exactly|that's true|that's it|like you said(?: before)?|the other way around|after the trade)$/i,
  // The order rules, said as code says them: true of any expression, with no number.
  /^(?:add and subtract from left to right|multiply and divide from left to right|multiply and divide before you add (?:and|or) subtract|before you add (?:and|or) subtract|work the brackets first|a digit's value is the digit times its place|count the places from the right)$/i,
  // Praise of the work that names no number: it cannot change the math beside it.
  /^(?:and |but |so )?(?:that was the (?:hard|tricky) part|that fixed it|it worked|that's the key move|now you try|you try)$/i,
];

/** A sum or difference of counts of one place ("4 tens minus 2 tens"), as the digits' key ("4-2"), or a plain expression. */
function placeExpressionOf(text: string): { key: string; value: number } | null {
  const plain = expressionOf(text);
  if (plain) return plain;
  const units = [...text.matchAll(new RegExp(String.raw`\b(${N})\s+(${P})\b`, "gi"))];
  if (units.length < 2 || new Set(units.map((u) => placeOf(u[2]))).size !== 1) return null;
  return expressionOf(text.replace(new RegExp(String.raw`\b(${N})\s+${P}\b`, "gi"), "$1"));
}

/** Questions that hold only the question's own operations: "How much is 12 minus 8?", "What is the whole answer to 52 − 28?" */
const OWN_QUESTIONS: readonly RegExp[] = [
  new RegExp(String.raw`^${LEAD}(?:what|what number) is the (?:whole |final )?answer (?:to|for) (.+)$`, "i"),
  new RegExp(String.raw`^${LEAD}how much is (.+)$`, "i"),
  new RegExp(String.raw`^${LEAD}(.+?) is how many (${P})$`, "i"),
];
/** "What number is 6 tens and 6 ones?": a question that names counts of places and asks their number. */
const NUMBER_OF = new RegExp(String.raw`^${LEAD}what number is ${N}\s+${P}(?:\s+and\s+${N}\s+${P})*$`, "i");

/** Where a clause stands in its sentence, for the readers whose truth hangs on what is around them. */
export interface ClauseContext {
  /** The sentence is a question. */
  asks: boolean;
  /** Another clause of the sentence names a place ("In the tens, write 4"): a clause with no place of its own is not read. */
  placeElsewhere: boolean;
  /** The places the other clauses of the sentence name (1, 10, ...). */
  places?: readonly number[];
  /** The clause comes after a ":" whose clause before it holds a number or a place ("Now add the tens: 1 + 2 + 3"). */
  boundByColon: boolean;
  /**
   * The value the clause after this one's ":" shows, when code read that clause whole and true and its last number is
   * a result of the question's work ("Yes, 4 is right: 12 minus 8 is 4" shows 4).
   */
  shownBy?: number;
  /** The places a place named alone beside it gives ("Now add the tens: 1 + 2 + 3"). */
  framedBy?: readonly number[];
  /** The clause right before it offers a new question ("Want to try a twin question"): an expression here only names it. */
  offer?: boolean;
}

/** A clause that offers a new question and claims nothing ("Want to try a twin question", "Let's try a new, easier problem first"). */
export const OFFER = /^(?:(?:so|now|then)\s+)?(?:do you\s+)?(?:want to try|let's try|now try|try|how about)\s+(?:a\s+|the\s+|one\s+)?(?:new\s+|easier\s+|harder\s+|twin\s+)*(?:question|problem|one)(?:\s+first)?$/i;
/** The part of an offer split off at its comma ("Let's try a new, easier problem first"). */
export const OFFER_TAIL = /^(?:new|easier|harder|twin)\s+(?:new\s+|easier\s+|harder\s+|twin\s+)*(?:question|problem|one)(?:\s+first)?$/i;

/** "Picture 4 blocks and take 2 away", "Hold up 4 fingers and put 2 down", "Think of 4 tens and take away 2 tens". */
const THINGS = String.raw`(?:blocks?|things?|fingers?|sticks?|bundles?|apples?|tens|ones|sticks of ten|bundles of ten)`;
const MODEL = new RegExp(String.raw`^${LEAD}(?:picture|think of|hold up|imagine|start with)\s+(${N})\s+(${THINGS})\s+(?:and|then)\s+(?:take away|take|cross out|put down|put|cover|remove)\s+(${N})(?:\s+(${THINGS}|of them))?(?:\s+(?:away|down))?$`, "i");
/** "5 is the tens digit of 52", "the tens digit of 52 is 5": a digit of a number, checked. */
const DIGIT_OF = new RegExp(String.raw`^${LEAD}(?:maybe\s+)?(?:(?:the\s+)?(${N})\s+is\s+the\s+(${P})\s+digit\s+(?:of|from|in)\s+(\d+)|the\s+(?:${P})\s+digit\s+(?:of|in)\s+(\d+)\s+is\s+(${N}))$`, "i");

/** The places a clause names (1, 10, ...). */
export const placesIn = (clause: string) => [...clause.matchAll(new RegExp(String.raw`\b(${P})\b`, "gi"))].map((m) => placeOf(m[1])).filter((x): x is number => x !== null);
/** Whether a clause names a place ("the tens", "ones column"). */
export const namesPlace = (clause: string) => new RegExp(String.raw`\b${P}\b`, "i").test(clause);
/** Whether a clause holds a number in digits or words. */
export const holdsNumber = (clause: string) => new RegExp(String.raw`\b${N}\b`, "i").test(clause);

/**
 * Whether code reads this one clause whole and finds it true (or asking only). The clause comes as the core split it;
 * a clause no reader matches is not read.
 */
export function readClause(clause: string, at: ClauseContext, facts: TutorReadFacts | undefined, answer: number | undefined, trades: readonly number[]): boolean {
  const text = clause.trim().replace(/[’]/g, "'").replace(/[−–]/g, "-").replace(/[.!]+$/, "");
  if (!text) return false;
  const own = namesPlace(text);
  /** A clause whose meaning needs no other clause: it names its own place, or no other clause names one. */
  const alone = own || !at.placeElsewhere;
  if (NO_NUMBER.some((re) => re.test(text))) return true;
  if (at.asks && (BARE_QUESTIONS.some((re) => re.test(text)) || CHILD_QUESTION.test(text) || NUMBER_OF.test(text))) return true;
  if (at.asks && facts) for (const re of OWN_QUESTIONS) {
    const q = re.exec(text);
    if (!q) continue;
    const e = placeExpressionOf(q[1]);
    // "4 tens minus 2 tens is how many tens?": the place asked is the place of the counts.
    if (q[2] !== undefined && placesIn(q[1]).some((p) => p !== placeOf(q[2]))) continue;
    if (q[2] !== undefined && placesIn(q[1]).length === 0) continue;
    if (e !== null && facts.expressions.has(e.key)) return true;
  }
  // Arithmetic truths, like an equation: whatever the clause is about, the numbers hold.
  let m = CANT_TAKE.exec(text);
  if (m) return smaller(m[3], m[4], m[1], m[2]) === true;
  m = CANT_DO.exec(text);
  if (m) return smaller(m[1], m[2], m[3], m[4]) === true;
  m = TOO_SMALL.exec(text);
  if (m) return smaller(m[1], m[2], m[3], m[4]) === true;
  m = IS_RIGHT.exec(text);
  if (m) {
    const n = value(m[1]);
    if (n === null) return false;
    if (m[2] === undefined) return alone && !at.boundByColon && ((answer !== undefined && n === answer) || (at.shownBy !== undefined && at.shownBy === n));
    // "16 is right for 7 + 9": an operation of this question's own work (review of #1047).
    const e = expressionOf(m[2]);
    return e !== null && e.value === n && !!facts && facts.expressions.has(e.key);
  }
  m = NOT_IT.exec(text);
  if (m) {
    // Not right for any step either: a number that is not the question's at all ("Not 56" in 27 + 39).
    const n = value(m[1] ?? m[2]);
    return !at.asks && n !== null && answer !== undefined && n !== answer && !trades.includes(n) && !!facts && !facts.numbers.has(n);
  }
  if (!facts) return false;
  const said = instructionsOf(text);
  if (said) {
    // "Multiply the tens: 4 × 2 = 8; Write 8": a write with no place of its own is the step of the place the sentence
    // names, so it must match that step; with no place named anywhere, any step that writes it.
    const steps = stepInstructions(facts.steps);
    // Another clause that names a place says which step the instruction is in ("In the ones, carry 1 to the hundreds"):
    // it must be an instruction of that step (review of #1047), whatever place the instruction itself names.
    const places = at.places ?? [];
    const inPlace = places.length === 0 ? steps : steps.filter((f) => f.from !== null && f.from !== undefined && places.includes(f.from));
    // "Write 6 and carry 1": one step's two instructions, never a write of one step and a carry of another ("Write 6 in
    // the tens and carry 1 to the tens", review of #1047).
    const froms = [...new Set(inPlace.map((f) => f.from ?? null))];
    const oneStep = said.some((x) => x.verb === "carry") && said.length > 1;
    return !at.boundByColon && (!oneStep ? said.every((x) => instructionTrue(x, inPlace)) : froms.some((from) => said.every((x) => instructionTrue(x, inPlace.filter((f) => (f.from ?? null) === from)))));
  }
  const count = countOf(text);
  if (count) return alone && !at.boundByColon && countKeys(count).some((k) => facts.expressions.has(k));
  m = MODEL.exec(text);
  if (m) {
    // "Picture 4 blocks and take 2 away": a model of one of the question's own subtractions. Both things are one kind
    // ("4 ones and take 2 tens away" is not read, review of #1047); a place names the step it models.
    const [a, b] = [value(m[1]), value(m[3])];
    const [first, second] = [m[2].toLowerCase(), m[4]?.toLowerCase()];
    if (second !== undefined && second !== "of them" && second.replace(/s$/, "") !== first.replace(/s$/, "")) return false;
    const place = /^(?:tens|ones)$/.test(first) ? placeOf(first) : null;
    const key = a === null || b === null ? "" : expressionKey([a, b], ["-"]);
    const steps = facts.expressionPlaces?.get(key);
    return a !== null && b !== null && b <= a && alone && !at.boundByColon && facts.expressions.has(key) && (place === null || (!!steps && steps.has(place)));
  }
  m = DIGIT_OF.exec(text);
  if (m) {
    const [d, n] = [value(m[1] ?? m[6]), value(m[3] ?? m[5])];
    const place = placeOf(m[2] ?? m[4]);
    return d !== null && n !== null && place !== null && d < 10 && Math.floor(n / place) % 10 === d && n >= place;
  }
  m = MENTION.exec(text);
  if (m) {
    const e = expressionOf(m[1]);
    if (e === null) return false;
    // The question itself ("In 27 + 39, ..."): nothing around it can make it another question.
    if (e.key === facts.question) return true;
    // After an offer of a new question ("Want to try a twin question: 38 + 27?"): it names that question, and claims nothing.
    if (at.offer) return true;
    // Beside a place it is the work of ("Now add the tens: 1 + 2 + 3"): that place's own step.
    if ((at.framedBy ?? []).length > 0) return !own && (at.framedBy ?? []).every((p) => facts.expressionPlaces?.get(e.key)?.has(p) ?? false);
    return !own && !at.placeElsewhere && !at.boundByColon && facts.expressions.has(e.key);
  }
  return false;
}

/**
 * The clauses of a sentence (`parts`: clauses at even indexes, separators at odd) that a counting list reads whole: a
 * counting instruction, then ":" and the numbers counted, each one step on from the last ("Start at 9 and count up 7
 * more: 10, 11, 12"), never past how many or where to stop. Returns the indexes of the list's numbers (readClause reads
 * the instruction).
 */
export function countedList(parts: readonly string[]): Set<number> {
  const read = new Set<number>();
  const lone = new RegExp(String.raw`^${N}$`, "i");
  for (let k = 0; k + 2 < parts.length; k += 2) {
    const c = countOf(parts[k]);
    if (!c || !parts[k + 1].includes(":")) continue;
    const run: { at: number; n: number }[] = [];
    for (let j = k + 2; j < parts.length; j += 2) {
      const raw = parts[j].trim().replace(/(?:\.{2,}|…)$/, "").trim();
      const n = lone.test(raw) ? value(raw) : null;
      if (n === null) break;
      run.push({ at: j, n });
      // The list goes on only through commas.
      if (j + 1 < parts.length && parts[j + 1].trim() !== ",") break;
    }
    if (run.length < 2) continue;
    const step = c.up ? 1 : -1;
    if (run[0].n !== c.a && run[0].n !== c.a + step) continue;
    if (run.some((x, i) => x.n !== run[0].n + i * step)) continue;
    const last = run.at(-1)!.n;
    if (c.k !== null && Math.abs(last - c.a) > c.k) continue;
    if (c.b !== null && (c.up ? last > c.b : last < c.b)) continue;
    for (const x of run) read.add(x.at);
  }
  return read;
}

/** The operations a clause works, as keys ("4 × 2 = 8" works "*2,4"). */
export function expressionsIn(clause: string): string[] {
  const re = new RegExp(String.raw`${N}(?:\s*(?:\+|-|−|minus|plus|×|times)\s*${N})+`, "gi");
  return [...clause.replace(/[−–]/g, "-").matchAll(re)].flatMap((m) => { const e = expressionOf(m[0]); return e ? [e.key] : []; });
}
