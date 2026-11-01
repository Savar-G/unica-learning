// Code's wordings of a whole-number question (round 5 to round 7, #380): the words a parent reads aloud, filled from
// the same operation data as the answer key. The book plan (src/lib/workbook-generator.ts) plans a wording for each
// slot; at U1 to U9 the generator's item builder (src/lib/workbook-generator-items.ts) prints only a wording of code's
// for a whole-number +, -, missing part, × or ÷ (round 7, R380-12-1): the AI's text is never printed there, so "Mia has
// 7 shells. She gives away 5. How many does she have now?" can never be printed over add [7, 5]. The AI may choose the
// person and the thing to count, from lists code offers.
//
// A wording is a frame: {a} and {b} are the operation's numbers, {t} their total (a + b; a × b for groups; the number
// shared for ÷), {name} the person, {thing} the thing to count. Its `op` is what it works on them: add [a, b],
// subtract [t, b], missing-addend [a, t], multiply [a, b], divide [t, b].
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { operationResult, operationText, type Figure, type Operation } from "@/lib/question-package";

/** What a wording asks: put together, take away, a missing part, compare, the ten-frame, equal groups, sharing. */
export type Action = "join" | "separate" | "part" | "compare" | "frame" | "groups" | "share";
/** The whole-number operations code words. */
export type WordedKind = "add" | "subtract" | "missing-addend" | "multiply" | "divide";
/** The kinds of question a wording belongs to (the book plan's kinds with an operation), and a number line's. */
export type WordingKind = "story" | "picture" | "fact" | "missing-part" | "line";

export interface Frame {
  f: string;
  act: Action;
  op: WordedKind;
  kind: WordingKind;
  /** The picture the wording names: the item must draw it. */
  figure?: "ten-frame" | "dots" | "array" | "number-line";
  /** A missing part's picture shows the part given. */
  shows?: "part";
  /** A missing part to 10: its total is 10. */
  ten?: true;
  /** On 1 more and 1 less: "only" there, "never" there. */
  step?: "only" | "never";
  /** A share with no remainder. */
  exact?: true;
  /** Asks only where the skill has met subtraction (a compare). */
  sub?: true;
}

const frame = (op: WordedKind, act: Action, kind: WordingKind, over: Omit<Partial<Frame>, "op" | "act" | "kind"> = {}) => (f: string): Frame => ({ f, op, act, kind, ...over });
const join = (kind: WordingKind, over: Omit<Partial<Frame>, "op" | "act" | "kind"> = {}) => frame("add", "join", kind, over);
const away = (kind: WordingKind, over: Omit<Partial<Frame>, "op" | "act" | "kind"> = {}) => frame("subtract", "separate", kind, over);
const part = (kind: WordingKind, over: Omit<Partial<Frame>, "op" | "act" | "kind"> = {}) => frame("missing-addend", "part", kind, { step: "never", ...over });
const more = (kind: WordingKind) => frame("missing-addend", "compare", kind, { step: "never", sub: true });
const tenFrame = frame("missing-addend", "frame", "picture", { figure: "ten-frame", shows: "part", ten: true, step: "never" });
const groups = (kind: WordingKind, over: Omit<Partial<Frame>, "op" | "act" | "kind"> = {}) => frame("multiply", "groups", kind, over);
const share = (kind: WordingKind, over: Omit<Partial<Frame>, "op" | "act" | "kind"> = {}) => frame("divide", "share", kind, { exact: true, ...over });

/**
 * Every wording code writes, each a whole short question a parent reads aloud ("How many in all?", "How many are
 * left?"), the setup kept short to make room. Many per kind (round 7), so a slot late in the book still has a wording
 * the book has not used 3 times.
 */
export const FRAMES: readonly Frame[] = [
  // Stories.
  ...["{a} {thing} and {b} more. How many in all?", "{a} {thing} here, {b} there. How many in all?", "{a} {thing}. {name} adds {b}. How many now?",
    "{name} picks {a} {thing}, then {b}. How many now?", "{name} has {a} {thing} and gets {b}. How many now?",
    "{name} sees {a} {thing}, then {b} more. How many in all?", "{a} {thing} on a mat, {b} in a bag. How many in all?",
    "{name} had {a} {thing}. A friend gave {b} more. How many now?", "{a} {thing} in a box. {name} puts in {b}. How many now?",
    "{name} finds {a} {thing} and {b} more. How many in all?", "{a} big {thing} and {b} small {thing}. How many in all?"].map(join("story")),
  ...["{t} {thing}. {name} takes {b}. How many are left?", "{t} {thing}. {b} go away. How many are left?", "{name} has {t} {thing} and gives {b} away. How many now?",
    "{t} {thing}. {name} hides {b}. How many are left?", "{name} had {t} {thing}. {b} fell off. How many are left?",
    "{t} {thing} on a shelf. {name} uses {b}. How many are left?", "{t} {thing}. {b} roll away. How many are left?",
    "{name} has {t} {thing} and gives {b} to a friend. How many now?", "{t} {thing} in a bag. {name} takes out {b}. How many are left?",
    "{name} had {t} {thing} and lost {b}. How many are left?"].map(away("story")),
  ...["{name} has {a} {thing}. How many more make {t}?", "{a} {thing} in a box. How many more make {t}?", "{a} {thing} now. How many more make {t}?",
    "{name} needs {t} {thing} and has {a}. How many more?", "{a} {thing} on the table. How many more to make {t}?",
    "{name} wants {t} {thing} but has {a}. How many more?"].map(part("story")),
  ...["{a} cats and {t} dogs. How many more dogs?", "{a} red {thing}, {t} blue. How many more blue?", "{a} big {thing}, {t} small. How many more small?",
    "{name} has {a}. Ben has {t}. How many more has Ben?"].map(more("story")),
  // Pictures.
  join("picture", { figure: "ten-frame" })("Ten-frame: {a} and {b}. How many in all?"),
  join("picture", { figure: "dots" })("{a} dots and {b} dots. How many in all?"),
  join("picture", { figure: "dots" })("{a} dots, then {b} more. How many now?"),
  join("picture", { figure: "ten-frame" })("{a} and {b} on the ten-frame. How many in all?"),
  join("picture", { figure: "ten-frame" })("Ten-frame: {a}, then {b} more. How many now?"),
  join("picture", { figure: "dots" })("{a} dots and {b} more dots. How many now?"),
  join("picture", { figure: "dots" })("Count the dots: {a} and {b}. How many in all?"),
  join("picture", { figure: "dots" })("Look at the dots: {a} and {b}. How many dots?"),
  join("picture", { figure: "ten-frame" })("The ten-frame shows {a} and {b}. How many in all?"),
  away("picture", { figure: "ten-frame" })("{t} dots. Take away {b}. How many are left?"),
  away("picture", { figure: "ten-frame" })("{t} dots. {b} hop off. How many are left?"),
  away("picture", { figure: "dots" })("{t} dots. {b} are crossed out. How many are left?"),
  away("picture", { figure: "dots" })("Look: {t} dots, {b} crossed out. How many are left?"),
  tenFrame("Ten-frame: {a} dots. How many more make 10?"),
  tenFrame("{a} dots. How many boxes are empty?"),
  tenFrame("Ten-frame: {a} dots. How many to fill it?"),
  tenFrame("The ten-frame has {a}. How many more fill it?"),
  part("picture", { figure: "ten-frame", shows: "part" })("{a} dots. How many more make {t}?"),
  part("picture", { figure: "ten-frame", shows: "part" })("{a} dots. How many more dots make {t}?"),
  part("picture", { figure: "dots", shows: "part" })("Here are {a} dots. How many more make {t}?"),
  // Bare facts.
  ...["{a} + {b} = ?", "? = {a} + {b}", "What is {a} + {b}?", "{a} and {b} make what?", "Add {a} and {b}. What do you get?", "Find {a} + {b}."]
    .map((f) => join("fact", { step: "never" })(f)),
  ...["What is {b} more than {a}?", "{a} and {b} more is what?", "What number is {b} more than {a}?", "Start at {a}. Count on {b}. What number is it?"]
    .map((f) => join("fact", { step: "only" })(f)),
  ...["What is {b} less than {t}?", "{t} take away {b} is what?", "What number is {b} less than {t}?", "Start at {t}. Count back {b}. What number is it?"]
    .map((f) => away("fact", { step: "only" })(f)),
  ...["{t} - {b} = ?", "? = {t} - {b}", "What is {t} - {b}?", "{t} take away {b}. What is left?", "Find {t} - {b}."].map((f) => away("fact", { step: "never" })(f)),
  // Missing parts.
  ...["{a} and how many more make {t}?", "{a} + ? = {t}", "? + {a} = {t}", "{t} = {a} + ?", "{t} = ? + {a}", "{t} {thing}: {a} are red. How many are not red?", "What do you add to {a} to make {t}?",
    "How far is {a} from {t}?", "What goes with {a} to make {t}?", "{t} is {a} and how many more?"].map(part("missing-part")),
  // Equal groups and sharing.
  ...["{a} groups of {b}. How many in all?", "{a} bags of {b} {thing}. How many {thing}?", "{a} rows of {b} {thing}. How many in all?",
    "{name} has {a} boxes with {b} {thing} in each. How many {thing}?", "{a} plates, {b} {thing} on each. How many {thing}?"].map(groups("story")),
  groups("picture", { figure: "array" })("{a} rows of {b} squares. How many squares?"),
  groups("picture", { figure: "array" })("The array has {a} rows of {b}. How many in all?"),
  groups("picture", { figure: "dots" })("{a} groups of {b} dots. How many dots?"),
  ...["{a} × {b} = ?", "? = {a} × {b}", "What is {a} × {b}?", "Find {a} × {b}."].map((f) => groups("fact")(f)),
  ...["Share {t} {thing} among {b} friends. How many each?", "{t} {thing} in {b} equal groups. How many in each group?",
    "{name} puts {t} {thing} in bags of {b}. How many bags?", "{b} friends share {t} {thing} fairly. How many each?"].map(share("story")),
  ...["{t} ÷ {b} = ?", "? = {t} ÷ {b}", "What is {t} ÷ {b}?", "Find {t} ÷ {b}."].map((f) => share("fact", { exact: undefined })(f)),
  // A number line.
  join("line", { figure: "number-line" })("Start at {a}. Hop {b} more. Where do you land?"),
  join("line", { figure: "number-line" })("Hop from {a}, {b} hops up. Where do you land?"),
  join("line", { figure: "number-line" })("{a} + {b} = ? Hop on the line."),
  away("line", { figure: "number-line" })("Start at {t}. Hop back {b}. Where do you land?"),
  away("line", { figure: "number-line" })("{t} - {b} = ? Hop back on the line."),
  part("line", { figure: "number-line" })("Start at {a}. How many hops to {t}?"),
  part("line", { figure: "number-line" })("How many hops from {a} to {t}?"),
];

/** The wordings the book plan takes for a kind of question (add, take away and missing part only). */
export function framesFor(kind: string, step: boolean, subtraction: boolean): Frame[] {
  if (kind === "line") return [];
  // A missing part takes every missing-part wording: its stories, the ten-frame and compare too.
  const ofKind = (x: Frame) => (kind === "missing-part" ? x.op === "missing-addend" && x.kind !== "line" : x.kind === kind);
  return FRAMES.filter((x) => ofKind(x) && (x.op === "add" || x.op === "subtract" || x.op === "missing-addend") && stepFits(x, step)
    && (subtraction || (x.op !== "subtract" && !x.sub)));
}

const stepFits = (x: Frame, step: boolean) => (step ? x.step !== "never" : x.step !== "only");

/** The numbers a wording works on a planned pair: a and 10 - a for a missing part to 10 (null when a is not 1 to 9). */
export const framePair = (f: Frame, pair: number[]): number[] | null => (f.ten ? (pair[0] >= 1 && pair[0] <= 9 ? [pair[0], 10 - pair[0]] : null) : pair);

/** What a wording works on a planned pair [a, b]: its operation and picture (add, take away and missing part). */
export function frameDoes(f: Frame, [a, b]: number[]) {
  const t = a + b;
  const operands: [number, number] = f.op === "add" ? [a, b] : f.op === "subtract" ? [t, b] : [a, t];
  return {
    operation: { kind: f.op as "add" | "subtract" | "missing-addend", operands },
    figure: (f.figure === "ten-frame" || f.figure === "dots" ? f.figure : null) as "ten-frame" | "dots" | null,
    figureShows: (f.shows ?? null) as "part" | "total" | null,
  };
}

/** Things a story counts, in turn through the book (a page never has one twice). */
export const THINGS = ["shells", "apples", "cars", "stickers", "hats", "cups", "bugs", "kites", "rocks", "plums", "ducks", "boats", "socks", "books", "leaves", "eggs", "balls", "buttons", "beads", "shoes", "bells", "pens"];

/** Words counted after the number 1, which take their singular. */
const COUNTED = ["dots", "cats", "dogs", "groups", "bags", "rows", "boxes", "plates", "friends", "squares", "hops", "bags", ...THINGS];
const PLURAL_AFTER_1 = new RegExp(`\\b1 ((?:red |blue |big |small )?)(${[...new Set(COUNTED)].join("|")})\\b`, "g");
/** One of each thing: after the number 1 a story counts one shell, not 1 shells. */
const ONE: Record<string, string> = { leaves: "leaf", shoes: "shoe", boxes: "box" };
const singular = (w: string) => ONE[w] ?? w.replace(/s$/, "");

/** The numbers of a wording, {a}, {b} and {t}. */
export interface FrameNumbers {
  a: number;
  b: number;
  t: number;
}

/** A wording filled in: the numbers, the name, the thing (one thing after 1). */
export function fillFrame(f: string, n: FrameNumbers, name: string, thing: string): string {
  // "Ben" is the other person of a compare: another boy's name when the person is Ben.
  const other = name === "Ben" ? "Leo" : "Ben";
  return f.replaceAll("Ben", other).replaceAll("{a}", String(n.a)).replaceAll("{b}", String(n.b)).replaceAll("{t}", String(n.t))
    .replaceAll("{name}", name).replaceAll("{thing}", thing)
    .replace(PLURAL_AFTER_1, (_, colour: string, w: string) => `1 ${colour}${singular(w)}`)
    .replace(/\b1 more come\b/, "1 more comes").replace(/\b1 go away\b/, "1 goes away").replace(/\b1 are red\b/, "1 is red")
    .replace(/\b1 boxes are\b/, "1 box is").replace(/\b1 roll away\b/, "1 rolls away").replace(/\b1 hop off\b/, "1 hops off")
    .replace(/\b1 are crossed\b/, "1 is crossed").replace(/\b1 hops up\b/, "1 hop up").replace(/\b1 friends share\b/, "1 friend shares");
}

/** The numbers {a}, {b} and {t} of a whole-number operation code words, or null for another operation. */
export function frameNumbers(op: Operation): FrameNumbers | null {
  if (!isWorded(op)) return null;
  const [x, y] = op.operands as number[];
  switch (op.kind) {
    case "add": return { a: x, b: y, t: x + y };
    case "subtract": return { a: x - y, b: y, t: x };
    case "missing-addend": return { a: x, b: y - x, t: y };
    case "multiply": return { a: x, b: y, t: x * y };
    case "divide": return { a: Math.floor(x / y), b: y, t: x };
  }
  return null;
}

/** A whole-number +, -, missing part, × or ÷ of two numbers: an operation code words. */
export function isWorded(op: Operation | null | undefined): op is Operation {
  if (!op || !["add", "subtract", "missing-addend", "multiply", "divide"].includes(op.kind)) return false;
  const ops = op.operands as unknown[];
  return ops.length === 2 && ops.every((x) => Number.isSafeInteger(x) && (x as number) >= 0) && !(op.kind === "divide" && ops[1] === 0)
    && !(op.kind === "subtract" && (ops[0] as number) < (ops[1] as number));
}

/** An operation as a question in plain ASCII: "7 - 4 = ?", "3 + ? = 8"; the package's own text for another kind. */
export function operationQuestion(op: Operation): string {
  const [a, b] = op.operands as unknown[];
  if (op.kind === "missing-addend") return `${a} + ? = ${b}`;
  const sign = ({ add: "+", subtract: "-", multiply: "×", divide: "÷" } as Record<string, string>)[op.kind];
  return sign && op.operands.length === 2 ? `${a} ${sign} ${b} = ?` : `${operationText(op).replace(/−/g, "-")} = ?`;
}

/** What code knows of the slot when it words a question. */
export interface WordingOptions {
  /** The item format: Spot the error prints the bare sum, Solve it two ways a fact, a Mixed set a story with no sign. */
  format: string;
  /** The item's picture: a wording that names a picture needs that picture. */
  figure: Figure | null;
  name: string;
  thing: string;
  /** The kinds of question to word it as, best first; the others follow. */
  kinds: readonly WordingKind[];
  /** A skill about 1 (or 2) more and less. */
  step: boolean;
  /** The skill has met subtraction (a compare asks how many more). */
  subtraction: boolean;
  /** Which wording of a kind to start from, so the slots of a page differ. */
  variant: number;
  /** The most characters the text has room for. */
  room?: number;
  /** The slot's planned wording and what it works: first when the item works the same. */
  planned?: { say: string; operation: { kind: string; operands: number[] }; figure: string | null } | null;
}

/** What a missing part's picture shows: the part given, the total, or neither. */
function pictureShows(f: Figure | null, n: FrameNumbers): "part" | "total" | null {
  const counts = f?.kind === "dots" ? f.groups : f?.kind === "ten-frame" ? f.counters : null;
  if (!counts || counts.length !== 1) return null;
  return counts[0] === n.a ? "part" : counts[0] === n.t ? "total" : null;
}

const hashOf = (key: string) => {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/**
 * Code's wordings of a whole-number operation, best first (round 7): each names exactly the numbers the operation works
 * and asks what it computes, in the item's format and with its picture. The planned wording comes first when the item
 * works the planned operation; then the kinds asked for, in turn from `variant`; the wordings within the room before
 * the others. Empty for an operation code does not word.
 */
export function codeWordings(op: Operation, o: WordingOptions): string[] {
  const n = frameNumbers(op);
  if (!n) return [];
  const bare = operationQuestion(op);
  if (o.format === "spot-the-error") return [bare];
  const remainder = op.kind === "divide" && operationResult(op).type === "remainder";
  const figure = o.figure?.kind ?? null;
  const fits = (x: Frame) => {
    if (x.op !== op.kind || (x.sub && !o.subtraction) || (x.exact && remainder)) return false;
    if (x.ten && n.t !== 10) return false;
    // A wording that names a picture needs that picture (and a missing part's, the part given); one that names none
    // goes with any picture or none.
    if (x.figure && x.figure !== figure) return false;
    if (x.shows && pictureShows(o.figure, n) !== x.shows) return false;
    if (o.format === "two-ways") return x.kind === "fact";
    if (o.format === "number-line") return x.kind === "line" || x.kind === "fact";
    // A Mixed set's child ticks the sign: its text names none.
    if (o.format === "tick-and-number") return !/[+×÷=-]/.test(x.f.replace(/\{\w+\}/g, ""));
    return x.kind !== "line" || figure === "number-line";
  };
  const order = [...o.kinds, ...(["story", "picture", "missing-part", "fact", "line"] as const).filter((k) => !o.kinds.includes(k))];
  const ranked = FRAMES.filter(fits)
    // On 1 more and 1 less the wordings about the step first; the others only after them (an item the AI made a
    // missing part still has its wordings).
    .map((x, j) => ({ x, s: stepFits(x, o.step) ? 0 : 1, k: order.indexOf(x.kind), h: hashOf(`${o.variant}:${j}`) }))
    .sort((p, q) => p.s - q.s || p.k - q.k || p.h - q.h)
    .map((r) => fillFrame(r.x.f, n, o.name, o.thing));
  const p = o.planned;
  const planned = p && p.operation.kind === op.kind && JSON.stringify(p.operation.operands) === JSON.stringify(op.operands) && (p.figure ?? null) === (figure === "dots" || figure === "ten-frame" ? figure : null) ? [p.say] : [];
  const all = [...new Set([...planned, ...ranked, ...(o.format === "tick-and-number" ? [] : [bare])])];
  const room = o.room ?? Infinity;
  return [...all.filter((w) => w.length <= room), ...all.filter((w) => w.length > room).sort((x, y) => x.length - y.length)];
}
