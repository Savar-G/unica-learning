// B2, "draw while speaking" (Chief of Staff design, 2026-11-15: derive the drawing FROM the sentence). Default on: for
// each accepted sentence of Maya's message, code reads each clause with a closed reader. A clause read in full as a board
// action on the active problem (a digit in a place, a trade, a step's equation as a note, a place to look at, the place
// value chart, a long-multiplication row), whose values equal code's own computed values and that changes what the
// board shows, draws. Code builds the command from that read with the question's kind, so the board cannot say
// anything the sentence does not. Each sentence that draws is its own batch, in sentence order: voice releases it when
// Maya finishes saying it, chat animates the batches in that order. Pure TypeScript: no clock, no network.
//
// The model draws nothing itself: it may only mark a sentence "no draw" (`noDraw`). A refused, held or replaced
// sentence, and code's own fallback line, never reach this file. A proposal from before B2 (a `draw` list with no
// sentences) keeps the old rule: one batch at the end of the message.
import type { OperationPackage } from "@/lib/question-package";
import { sentencesOf } from "./say-check";
import { tutorBoardNumbers, tutorKind, safeCommand } from "./tutor";
import type { TutorCommand } from "./tutor-kind";

/** Why a clause code read as a board action drew nothing (the trace's `boardReads`). */
export const READ_REASONS = ["no_draw", "unread_sentence", "no_drawing", "not_a_step", "differs", "needs_earlier", "repeat", "unsafe"] as const;
export type ReadReason = (typeof READ_REASONS)[number];

/** One clause code read as a board action: the sentence (0-based), the clause, and whether it drew (else why not). */
export interface BoardRead {
  sentence: number;
  clause: string;
  drew: boolean;
  reason?: ReadReason;
}

/**
 * One sentence's batch: the sentence (0-based), its commands in clause order, the keys of what they drew, and `after`:
 * the earlier batches of the same message (by index) it builds on. The desk skips a batch whose earlier batch it
 * skipped or cancelled, and the server's board drops it too.
 */
export interface TiedDrawing {
  sentence: number;
  commands: TutorCommand[];
  keys: string[];
  after: number[];
}

/** A drawing request as an older proposal writes it (before B2 it had no sentence). */
export interface DrawRequest {
  offer: string;
  place?: string;
  sentence?: number;
}

/** A proposal from before B2: a `draw` list whose requests name no sentence. It keeps one batch at the end. */
export const legacyDraw = (draw: readonly DrawRequest[] | undefined): boolean => !!draw && draw.length > 0 && draw.every((d) => d.sentence === undefined);

/** The key that stops a note from being written twice (notes have no kind key). */
const noteKey = (text: string) => `note:${text}`;

/**
 * The board drawings of one accepted tutor message, read from its sentences (B2). `drawn`: what the call drew (sent or
 * shown; never twice). `sent`: keys sent with no word yet from the child's screen: earlier work counts only when it is
 * SHOWN (B1). `noDraw`: sentence numbers (1 for the first) the model marked "no draw", or "all". `noteId(batch, i)`.
 *
 * Each clause that draws is ONE of the kind's own actions (`kindActions`: a key and the commands `draw` gives for it),
 * equal to what the clause says in every field. What it needs first comes ONLY from the kind's declared graph
 * (`TutorKind.boardNeeds`): each needed key is either shown on the child's board, or drawn by an earlier clause of
 * this message (then the batch names that batch in `after`), or the clause draws nothing.
 */
export function deriveDrawings(pkg: OperationPackage, sentences: readonly string[], drawn: readonly string[], sent: readonly string[], noDraw: readonly number[] | "all", noteId: (batch: number, i: number) => string, opener?: (sentence: string) => string | null): { drawings: TiedDrawing[]; reads: BoardRead[] } {
  const kind = tutorKind(pkg);
  const offers = new Set(kind.drawings(pkg).map((d) => d.id));
  const actions = kindActions(pkg);
  const graph = kind.boardNeeds(pkg);
  const noteNeeds = kind.noteNeeds?.(pkg) ?? [];
  const numbers = tutorBoardNumbers(pkg);
  const facts = problemFacts(pkg);
  const steps = facts.steps;
  const drawings: TiedDrawing[] = [];
  const reads: BoardRead[] = [];
  const mine: string[] = [];
  // Earlier work counts only when the child's screen CONFIRMED it shown (B1), or when an earlier clause of this same
  // message draws it. A batch sent with no word yet does not count.
  const confirmed = drawn.filter((k) => !sent.includes(k));
  const all = () => [...drawn, ...mine];
  sentences.forEach((sentence, at) => {
    // A judgment or agreement opener the say check validated for this sentence ("Yes, ..." when code found the child
    // right) carries no action: the rest of the sentence is read. Any other opener stays part of the sentence.
    const parsed = parseSentence(opener?.(sentence) ?? sentence, facts);
    const said = parsed.clauses.flatMap((c) => (c.read && (c.read.type === "action" || c.read.type === "equation") ? [{ text: c.text, action: c.read.action }] : []));
    if (said.length === 0) return;
    const skip = (reason: ReadReason) => said.forEach((c) => reads.push({ sentence: at, clause: c.text, drew: false, reason }));
    if (noDraw === "all" || noDraw.includes(at + 1)) return skip("no_draw");
    if (!parsed.ok) return skip("unread_sentence");
    const commands: TutorCommand[] = [];
    const keys: string[] = [];
    const after = new Set<number>();
    for (const c of said) {
      const tried = drawClause(c.action);
      if ("reason" in tried) { reads.push({ sentence: at, clause: c.text, drew: false, reason: tried.reason }); continue; }
      reads.push({ sentence: at, clause: c.text, drew: true });
      commands.push(...tried.commands);
      keys.push(...tried.keys);
      mine.push(...tried.keys);
      for (const n of tried.needs) { const d = drawings.findIndex((x) => x.keys.includes(n)); if (d >= 0) after.add(d); }
    }
    if (commands.length) drawings.push({ sentence: at, commands, keys, after: [...after].sort((x, y) => x - y) });

    /** What a needed key list allows: every key shown, or drawn earlier in this message (returned), else null. */
    function ready(needs: readonly string[]): string[] | null {
      const fromHere: string[] = [];
      for (const n of needs) {
        if (confirmed.includes(n)) continue;
        if (mine.includes(n)) { fromHere.push(n); continue; }
        return null;
      }
      return fromHere;
    }
    /** A note's commands with this batch's own note ids. */
    function withIds(cs: readonly TutorCommand[]): TutorCommand[] {
      let i = commands.filter((x) => x.op === "write").length;
      return cs.map((x) => (x.op === "write" ? { ...x, id: noteId(drawings.length, i++) } : x));
    }

    /** One clause's action as one of the kind's own actions, or why it draws nothing. */
    function drawClause(a: Action): { commands: TutorCommand[]; keys: string[]; needs: string[] } | { reason: ReadReason } {
      const match = [...actions].find(([, cs]) => cs.length === 1 && commandAction(cs[0])?.key === a.key);
      if (match) {
        const [key, cs] = match;
        const note = cs[0].op === "write" && typeof cs[0].text === "string" ? noteKey(cs[0].text) : null;
        if (all().includes(key) || (note && all().includes(note))) return { reason: "repeat" };
        const needs = ready(graph[key] ?? []);
        if (!needs) return { reason: "needs_earlier" };
        if (!cs.every((x) => safeCommand(x, numbers))) return { reason: "unsafe" };
        return { commands: withIds(cs), keys: [key, ...(note ? [note] : [])], needs };
      }
      if (a.eq) {
        // Only the question's own equation and each step's own computation draw a note: never a twin, a reversed
        // subtraction ("8 − 2" in 52 − 28) or any other true equation.
        if (!steps.has(a.key)) return { reason: "not_a_step" };
        if (!offers.has("note")) return { reason: "no_drawing" };
        const eq = a.eq;
        const ascii = eq.operands.map((x, i) => (i === 0 ? String(x) : ` ${eq.ops[i - 1] === "−" ? "-" : eq.ops[i - 1]} ${x}`)).join("");
        const r = kind.draw(pkg, [{ offer: "note", place: `${ascii} = ${eq.result}` }], [...confirmed, ...mine, ...noteNeeds], () => "x");
        const cs = r.commands;
        if (cs.length !== 1 || commandAction(cs[0])?.key !== a.key || typeof cs[0].text !== "string") return { reason: "differs" };
        const note = noteKey(cs[0].text);
        if (all().includes(note)) return { reason: "repeat" };
        const needs = ready(noteNeeds);
        if (!needs) return { reason: "needs_earlier" };
        if (!cs.every((x) => safeCommand(x, numbers))) return { reason: "unsafe" };
        return { commands: withIds(cs), keys: [note], needs };
      }
      // A clause of an action this board draws, with other values; or one it never draws.
      const type = a.key.split("|")[0];
      return [...actions.values()].some((cs) => cs.some((x) => commandAction(x)?.key.split("|")[0] === type)) ? { reason: "differs" } : { reason: "no_drawing" };
    }
  });
  return { drawings, reads };
}

/** The places a kind's drawing may name, and none. */
const SIM_PLACES = ["", "ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];

/**
 * The kind's own keyed board actions for a question: each key with the commands `draw` gives for it, found by asking
 * for every drawing it offers (each place) from an empty board until nothing new comes. Notes, which have no fixed key,
 * are not here. Exported for the contract.
 */
export function kindActions(pkg: OperationPackage): Map<string, TutorCommand[]> {
  const kind = tutorKind(pkg);
  const offers = kind.drawings(pkg).map((d) => d.id).filter((o) => o !== "note");
  const out = new Map<string, TutorCommand[]>();
  const drawn: string[] = [];
  let note = 0;
  for (let round = 0; round < 60; round++) {
    let grew = false;
    for (const offer of offers) for (const place of SIM_PLACES) {
      const r = kind.draw(pkg, [{ offer, place }], drawn, () => `tutor-note-action-${note++}`);
      const fresh = r.keys.filter((k) => !drawn.includes(k) && !k.startsWith("note:"));
      if (fresh.length === 0) continue;
      if (r.keys.length === r.commands.length) r.keys.forEach((k, i) => { if (!out.has(k) && !k.startsWith("note:")) out.set(k, [r.commands[i]]); });
      else if (r.keys.length === 1) out.set(r.keys[0], [...r.commands]);
      drawn.push(...r.keys);
      grew = true;
    }
    if (!grew) break;
  }
  return out;
}

/** The equation keys of the question and of each of its steps, as code computed them ("equation|12−8=4"). */
function stepEquations(pkg: OperationPackage): Set<string> {
  const keys = new Set<string>();
  const op = pkg.operation;
  const sign: Record<string, string> = { add: "+", subtract: "−", multiply: "×", divide: "÷" };
  if (op && sign[op.kind] && op.operands.length === 2 && pkg.answer.value.type === "number") keys.add(`equation|${op.operands[0]}${sign[op.kind]}${op.operands[1]}=${pkg.answer.value.value}`);
  for (const st of tutorKind(pkg).steps(pkg)) {
    for (const m of st.work.matchAll(/(\d+(?: [+−×÷] \d+)+) = (\d+)/g)) keys.add(`equation|${m[1].replace(/ /g, "")}=${m[2]}`);
  }
  return keys;
}

// ---------- The reader ----------
//
// Review of #1094 (rounds 2 and 3): one place, fail closed. Each plain positive form reads ONE clause into a structured
// action (what it does, its operation, every value, every place, every quantity); a few reason forms read a clause as a
// true math fact. A sentence is read only when EVERY clause is one of these. Each command of a drawing's batch builds
// the same structure, and each must equal the action of its own clause: no field is taken from another clause, an
// equation has the same operation and operands in the same roles ("8 plus 4 is 12" is not 12 − 8 = 4), and earlier
// work the kind draws first (a trade before a digit) must be stated too.

/** One action as code reads it: `key` holds every field; `values` and `places` say what it names. */
interface Action {
  key: string;
  values: number[];
  places: string[];
  /** An equation's parts, in order. */
  eq?: { operands: number[]; ops: string[]; result: number };
}

const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"] as const;

/** A board column or a spoken place word ("ten", "ones", "ten_thousands") as a place, or null. */
function placeOf(word: unknown): string | null {
  if (typeof word !== "string") return null;
  const w = word.replace(/_/g, " ").toLowerCase().trim().replace(/\s+/g, " ");
  const plural = w.endsWith("s") ? w : `${w}s`;
  return (PLACES as readonly string[]).includes(plural) ? plural : null;
}

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A number as a clause says it ("45,672", "twelve", "forty-two", "three hundred five"), or null. */
function toNumber(text: string): number | null {
  const t = text.trim();
  if (/^\d{1,3}(?:,\d{3})+$|^\d+$/.test(t)) return Number(t.replace(/,/g, ""));
  let total = 0;
  let part = 0;
  let last: "unit" | "ten" | "scale" | null = null;
  for (const w of t.split(/[- ]+/)) {
    const small = SMALL.indexOf(w);
    const ten = TENS.indexOf(w);
    if (small >= 0) { if (last === "unit") return null; part += small; last = "unit"; }
    else if (ten >= 0) { if (last === "unit" || last === "ten") return null; part += (ten + 2) * 10; last = "ten"; }
    else if (w === "hundred") { if (part === 0 || part >= 100) return null; part *= 100; last = "scale"; }
    else if (w === "thousand") { if (part === 0) return null; total += part * 1000; part = 0; last = "scale"; }
    else return null;
  }
  return last === null ? null : total + part;
}

const NUM_WORDS = [...SMALL, ...TENS, "hundred", "thousand"].join("|");
const N = String.raw`(\d[\d,]*|(?:${NUM_WORDS})(?:[- ](?:${NUM_WORDS}))*)`;
const OP_WORDS = String.raw`plus|minus|times|multiplied by|divided by|take away|[+\-−–×*÷/]|x`;
const PL = String.raw`(hundred thousands?|ten thousands?|thousands?|hundreds?|tens?|ones?)`;
const AT = String.raw`(?: place| column)?`;
const WHO = String.raw`(?:(?:we|you|let's|let us) )?(?:can )?`;

const OP_OF: Record<string, string> = { plus: "+", "+": "+", minus: "−", "take away": "−", "-": "−", "−": "−", "–": "−", times: "×", "multiplied by": "×", "×": "×", x: "×", "*": "×", "divided by": "÷", "÷": "÷", "/": "÷" };

/** An equation's action from its expression ("12 minus 8", "12 − 8") and result, or null when code cannot read it whole. */
function equationAction(expression: string, result: string): Action | null {
  const parts = expression.trim().split(new RegExp(String.raw` (${OP_WORDS}) `));
  if (parts.length < 3 || parts.length % 2 === 0) return null;
  const operands = parts.filter((_, i) => i % 2 === 0).map(toNumber);
  const ops = parts.filter((_, i) => i % 2 === 1).map((o) => OP_OF[o]);
  const r = toNumber(result);
  if (r === null || operands.some((x) => x === null) || ops.some((o) => !o)) return null;
  const key = `equation|${operands.map((x, i) => (i === 0 ? String(x) : `${ops[i - 1]}${x}`)).join("")}=${r}`;
  return { key, values: [...(operands as number[]), r], places: [], eq: { operands: operands as number[], ops, result: r } };
}

const write = (value: number | null, place: string | null | undefined): Action | null =>
  value === null || (place !== undefined && place !== null && !placeOf(place)) ? null : { key: `write|${value}|${place ? placeOf(place) : "-"}`, values: [value], places: place ? [placeOf(place)!] : [] };

const trade = (fromPlace: string, give: number | null, toPlace: string, get: number | null): Action | null => {
  const from = placeOf(fromPlace);
  const to = placeOf(toPlace);
  return from && to && give !== null && get !== null ? { key: `trade|${give} ${from}|${get} ${to}`, values: [give, get], places: [from, to] } : null;
};

/** The plain positive forms, each read whole into one action (anchored). Anything else is not read as positive. */
const FORMS: { re: RegExp; read: (m: RegExpMatchArray) => Action | null }[] = [
  // An equation: "12 minus 8 is 4", "6 times 870 is 5220".
  { re: new RegExp(String.raw`^((?:${N.slice(1, -1)})(?: (?:${OP_WORDS}) (?:${N.slice(1, -1)}))+) (?:is|equals|makes|gives|=) ${N}$`), read: (m) => equationAction(m[1], m[2]) },
  // Writing a value: "write 4 in the ones", "4 goes in the ones place", "the ones digit is 4", "write 240".
  { re: new RegExp(String.raw`^${WHO}(?:write|put) (?:a |the )?${N}(?: (?:in|into|under|below) the ${PL}${AT})?$`), read: (m) => write(toNumber(m[1]), m[2] ?? null) },
  { re: new RegExp(String.raw`^(?:the )?${N} goes (?:in|into) the ${PL}${AT}$`), read: (m) => write(toNumber(m[1]), m[2]) },
  { re: new RegExp(String.raw`^the ${PL} digit is ${N}$`), read: (m) => write(toNumber(m[2]), m[1]) },
  // A trade with both of its quantities: "we trade 1 ten for 10 ones", "we trade 10 ones for 1 ten".
  { re: new RegExp(String.raw`^${WHO}(?:trade|regroup|exchange|borrow|carry) (?:a |the )?${N} ${PL} (?:for|into) ${N} ${PL}$`), read: (m) => trade(m[2], toNumber(m[1]), m[4], toNumber(m[3])) },
  // A place: "look at the ten thousands".
  { re: new RegExp(String.raw`^${WHO}(?:look at|see) the ${PL}${AT}$`), read: (m) => (placeOf(m[1]) ? { key: `place|${placeOf(m[1])}`, values: [], places: [placeOf(m[1])!] } : null) },
  // A chart and a division: "let's put 45,672 in a place value chart", "let's share 84 into 4 groups".
  { re: new RegExp(String.raw`^${WHO}(?:put|write) ${N} in (?:a|the) (?:place value |place-value )?(?:place )?chart$`), read: (m) => {
    const n = toNumber(m[1]);
    return n === null ? null : { key: `chart|${n}`, values: [n], places: [] };
  } },
  { re: new RegExp(String.raw`^${WHO}(?:share|divide|split) ${N} (?:into|by|between|among) ${N}(?: (?:equal )?groups)?$`), read: (m) => {
    const a = toNumber(m[1]);
    const b = toNumber(m[2]);
    return a === null || b === null ? null : { key: `divide|${a}|${b}`, values: [a, b], places: [] };
  } },
];

/** What is true of the active problem, for the state facts: its numbers, and each place's values as the trades change them. */
export interface ProblemFacts {
  numbers: ReadonlySet<number>;
  /** "place|from|to": a place's value before and after a trade of the question ("ones|2|12", "tens|5|4"). */
  states: ReadonlySet<string>;
  /** The equation keys of the question and of each of its steps ("equation|12−8=4"). */
  steps: ReadonlySet<string>;
}

const PLACE_VALUE: Record<string, number> = { ones: 1, tens: 10, hundreds: 100, thousands: 1000, "ten thousands": 10000, "hundred thousands": 100000 };

/**
 * The facts of a question's work the state forms read: for a whole-number subtraction of two numbers, the value of
 * each place of the top number before and after each borrow, worked as on paper. Other questions have no states.
 */
export function problemFacts(pkg: OperationPackage): ProblemFacts {
  const ops = (pkg.operation?.operands ?? []).filter((x): x is number => typeof x === "number");
  const states = new Set<string>();
  if (pkg.operation?.kind === "subtract" && ops.length === 2 && ops.every((x) => Number.isInteger(x) && x >= 0) && ops[0] >= ops[1]) {
    const top = [...String(ops[0])].reverse().map(Number);
    const bottom = [...String(ops[1])].reverse().map(Number);
    const history = top.map((d) => [d]);
    const cur = [...top];
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] >= (bottom[i] ?? 0)) continue;
      const j = cur.findIndex((d, k) => k > i && d > 0);
      if (j < 0) break;
      for (let k = j; k > i; k--) {
        if (k === j) cur[k] -= 1;
        else { cur[k] += 10; history[k].push(cur[k]); cur[k] -= 1; }
        history[k].push(cur[k]);
      }
      cur[i] += 10;
      history[i].push(cur[i]);
    }
    history.forEach((h, i) => {
      const place = PLACES[i];
      if (place) for (let a = 0; a < h.length; a++) for (let b = a + 1; b < h.length; b++) if (h[a] !== h[b]) states.add(`${place}|${h[a]}|${h[b]}`);
    });
  }
  return { numbers: new Set(ops), states, steps: stepEquations(pkg) };
}

/**
 * The plain reason forms (rounds 3 and 4): a clause read whole as a TRUE math fact of the active problem; never an
 * action. "you can't take 8 from 2" (2 is less than 8), "2 is less than 8", the state after a trade ("2 ones become 12
 * ones", "the 5 tens become 4 tens": a change a trade of this question makes), and a number in places ("52 is 4 tens
 * and 12 ones": one of the question's numbers, with exact values). Any clause that is neither a reason, an action form
 * nor a drawing lead-in leaves the sentence unread, and nothing is drawn with it.
 */
const REASONS: { re: RegExp; holds: (m: RegExpMatchArray, f: ProblemFacts) => boolean }[] = [
  { re: new RegExp(String.raw`^(?:you|we) (?:can't|cannot|can not) take ${N}(?: ${PL})? (?:away )?from ${N}(?: ${PL})?$`), holds: (m) => lessThan(m[3], m[1]) && (m[2] === undefined || m[4] === undefined || placeOf(m[2]) === placeOf(m[4])) },
  { re: new RegExp(String.raw`^${N} is (?:smaller|less) than ${N}$`), holds: (m) => lessThan(m[1], m[2]) },
  { re: new RegExp(String.raw`^${N} is (?:bigger|greater|more) than ${N}$`), holds: (m) => lessThan(m[2], m[1]) },
  { re: new RegExp(String.raw`^(?:the )?${N} ${PL} (?:become|becomes|turn into|turns into|change to|changes to|are now|is now) ${N} ${PL}$`), holds: (m, f) => {
    const a = toNumber(m[1]);
    const b = toNumber(m[3]);
    const p = placeOf(m[2]);
    return a !== null && b !== null && p !== null && placeOf(m[4]) === p && f.states.has(`${p}|${a}|${b}`);
  } },
  // "the ones are now 12", "now the ones are 12": a value a trade of this question gives that place.
  { re: new RegExp(String.raw`^(?:now )?the ${PL} (?:are|is)(?: now)? ${N}$`), holds: (m, f) => {
    const p = placeOf(m[1]);
    const n = toNumber(m[2]);
    return p !== null && n !== null && [...f.states].some((k) => k.startsWith(`${p}|`) && k.endsWith(`|${n}`));
  } },
  // A step's own equation said with its place: "4 tens minus 2 tens is 2 tens" (one place, the step's own numbers).
  { re: new RegExp(String.raw`^${N} ${PL} (${OP_WORDS}) ${N} ${PL} (?:is|equals|makes|leaves|gives) ${N} ${PL}$`), holds: (m, f) => {
    const places = [m[2], m[5], m[7]].map(placeOf);
    if (places.some((p) => p === null || p !== places[0])) return false;
    const a = equationAction(`${m[1]} ${m[3]} ${m[4]}`, m[6]);
    return a !== null && f.steps.has(a.key);
  } },
  { re: new RegExp(String.raw`^${N} (?:is|equals|makes) ${N} ${PL} and ${N} ${PL}$`), holds: (m, f) => {
    const [n, a, b] = [toNumber(m[1]), toNumber(m[2]), toNumber(m[4])];
    const [p, q] = [placeOf(m[3]), placeOf(m[5])];
    return n !== null && a !== null && b !== null && p !== null && q !== null && p !== q && f.numbers.has(n) && a * PLACE_VALUE[p] + b * PLACE_VALUE[q] === n;
  } },
];
const lessThan = (a: string, b: string) => { const x = toNumber(a); const y = toNumber(b); return x !== null && y !== null && x < y; };

/**
 * The plain drawing lead-ins (round 4): read in full, with no number, place, negation, condition or question. They
 * say that Maya draws now; they are neither an action nor a reason. "Let's show it", "let's put it on the board",
 * "let's draw the rows", "look", "watch".
 */
const LEAD_INS = [
  /^(?:let's|let us) (?:show|draw|put|write) (?:it|this|that|them|the rows|the trade|the steps|the work)(?: on the board)?$/,
  /^(?:look|watch)$/,
  // A bare trade word with no amount or place ("so we borrow: we trade 1 ten for 10 ones").
  /^(?:we|let's|let us) (?:borrow|trade|regroup)$/,
  // A place to work next, with no number: "Now the tens:", "Start with the ones:".
  /^(?:the|on to the|over to the) (?:hundred thousands|ten thousands|thousands|hundreds|tens|ones)(?: place| column)?$/,
  /^(?:let's |let us |we )?(?:start|begin) with the (?:hundred thousands|ten thousands|thousands|hundreds|tens|ones)(?: place| column)?$/,
];

/** Words that may open a clause and change nothing it says. */
// No judgment word ("yes", "right", "good"): a judgment counts only when the say check validated it (`opener`).
const LEAD = /^(?:(?:so|now|then|first|next|okay|ok|and|alright|\{name\}),?\s+)+/;

/** One clause read whole, or null when code cannot read it. An equation is kept apart: it is a note's action, else a fact. */
type Clause = { type: "action"; action: Action } | { type: "equation"; action: Action; holds: boolean } | { type: "reason" } | { type: "lead" };

/** Whether an equation's action holds (left to right, products and quotients first, exact division). */
function holds(key: string): boolean {
  const m = /^equation\|(.+)=(\d+)$/.exec(key);
  if (!m) return false;
  const tokens = m[1].match(/\d+|[+−×÷]/g) ?? [];
  let total = 0;
  let term = Number(tokens[0]);
  let sign = 1;
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = Number(tokens[i + 1]);
    if (op === "×") term *= n;
    else if (op === "÷") { if (n === 0 || term % n !== 0) return false; term /= n; }
    else { total += sign * term; sign = op === "+" ? 1 : -1; term = n; }
  }
  return total + sign * term === Number(m[2]);
}

function readClause(clause: string, facts: ProblemFacts): Clause | null {
  if (LEAD_INS.some((r) => r.test(clause))) return { type: "lead" };
  for (const f of FORMS) {
    const m = clause.match(f.re);
    if (!m) continue;
    const a = f.read(m);
    if (!a) return null;
    return a.key.startsWith("equation|") ? { type: "equation", action: a, holds: holds(a.key) } : { type: "action", action: a };
  }
  for (const r of REASONS) {
    const m = clause.match(r.re);
    if (m) return r.holds(m, facts) ? { type: "reason" } : null;
  }
  return null;
}

/**
 * The clauses of a sentence, when code reads the WHOLE sentence with its closed reader: every clause is an action
 * form, an equation, a true reason or a drawing lead-in. Null when any clause is unread (a "do not", a "but", a
 * condition, a lead-in such as "Do not do this:"), and for a question or a quote.
 */
function parseSentence(sentence: string, facts: ProblemFacts): { ok: boolean; clauses: { text: string; read: Clause | null }[] } {
  const s = sentence.trim().replace(/[’‘]/g, "'").toLowerCase();
  const parts = s.replace(/[.!?]+[')\]]*$/, "").split(/,\s+|;\s+|:\s+|\s+(?=(?:so|but|then|because)\s)/).map((c) => `${c.trim()} `.replace(LEAD, "").trim()).filter(Boolean);
  const clauses = parts.map((text) => ({ text, read: readClause(text, facts) }));
  // A question or a quote is never read; nor is a sentence with any clause code cannot read, or with a false equation.
  const ok = !/[?"“”]/.test(s) && clauses.every((c) => c.read !== null && !(c.read.type === "equation" && !c.read.holds));
  return { ok, clauses };
}

/** The action one board command shows, read from the command the kind built, or null when code cannot read one. */
function commandAction(c: TutorCommand): Action | null {
  const target = typeof c.target === "object" && c.target !== null ? (c.target as Record<string, unknown>) : {};
  const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" && Number.isInteger(v) ? v : null);
  switch (c.op) {
    case "put":
      return write(num(c.value), target.part === "cell" ? (placeOf(target.column) ?? "?") : null);
    case "write": {
      const m = typeof c.text === "string" ? /^(.+?) = (\d+)$/.exec(c.text) : null;
      return m ? equationAction(m[1], m[2]) : null;
    }
    // A borrow gives 1 of a place for 10 of the place on its right; a carry gives 10 for 1.
    case "regroup":
      return typeof c.from !== "string" || typeof c.to !== "string" ? null : c.kind === "borrow" ? trade(c.from, 1, c.to, 10) : c.kind === "carry" ? trade(c.from, 10, c.to, 1) : null;
    case "division": {
      const a = num(c.dividend);
      const b = num(c.divisor);
      return a === null || b === null ? null : { key: `divide|${a}|${b}`, values: [a, b], places: [] };
    }
    case "place_chart": {
      const n = num(c.number);
      return n === null ? null : { key: `chart|${n}`, values: [n], places: [] };
    }
    case "mark": {
      const p = typeof target.piece === "string" ? placeOf(target.piece.replace(/^band-/, "")) : null;
      return p ? { key: `place|${p}`, values: [], places: [p] } : null;
    }
    default:
      return null;
  }
}

// ---------- The cue word ----------

/**
 * The word of a message at which a drawing tied to sentence `index` (0-based) is released: the last word of that
 * sentence, counted as the voice counts words (speechWords over the whole message). A sentence past the end: the last word.
 */
export function sentenceCueWord(text: string, index: number): number {
  // The voice's own word count (speechWords in src/lib/board-speech.ts): whitespace-separated words.
  const words = (t: string) => t.match(/\S+/g) ?? [];
  const all = words(text).length;
  const sentences = sentencesOf(text);
  const upTo = words(sentences.slice(0, Math.max(0, index) + 1).join(" ")).length;
  return Math.max(1, Math.min(all, upTo));
}
