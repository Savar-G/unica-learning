// B2, "draw while speaking": each of the tutor's drawings is tied to ONE sentence of her message, and goes to the board
// as its own batch, in the order of her sentences. Voice releases a batch when Maya finishes saying its sentence; chat
// animates the batches in that order. Pure TypeScript: no clock, no network.
//
// The model names the sentence (`sentence`, 1 for the first) beside each drawing request. Code checks it:
// - at most one drawing per sentence (one mark per idea): a second request for the same sentence is dropped;
// - the match check (drawingMatches): code reads the whole sentence with a closed reader, and every command of the
//   drawing's batch is stated by its own clause. A mismatch drops the whole drawing, never the sentence;
// - every command is safe (tutor.ts, safeCommand), as before.
// A dropped drawing goes in the trace (`drawDrops` on the attempt). A drawing request with no `sentence` (a proposal
// from before B2) keeps the old rule: one batch, released at the end of the message, with no match check.
import type { OperationPackage } from "@/lib/question-package";
import { sentencesOf } from "./say-check";
import { tutorBoardNumbers, tutorKind, safeCommand } from "./tutor";
import type { TutorCommand } from "./tutor-kind";

/** Why code did not draw a drawing the model asked for (B2). */
export const DRAW_DROP_REASONS = ["no_sentence", "same_sentence", "nothing_new", "unsafe", "mismatch"] as const;
export type DrawDropReason = (typeof DRAW_DROP_REASONS)[number];

/** One drawing request code did not draw: the offer, the sentence it named (0-based; null when none is valid), why. */
export interface DrawDrop {
  offer: string;
  sentence: number | null;
  reason: DrawDropReason;
}

/** One drawing that goes to the board: the sentence it is tied to (0-based) and the commands the kind built. */
export interface TiedDrawing {
  sentence: number;
  offer: string;
  commands: TutorCommand[];
  keys: string[];
}

/** A drawing request as the model writes it. `sentence`: 1 for the first sentence of "say". */
export interface DrawRequest {
  offer: string;
  place?: string;
  sentence?: number;
}

/** Whether a message's drawing requests use the B2 ties: any request names a sentence. */
export const tiesSentences = (draw: readonly DrawRequest[]): boolean => draw.some((d) => d.sentence !== undefined);

/**
 * The drawings of one tutor message, each tied to its sentence (B2). `sentences`: the message's sentences
 * (sentencesOf). `noteId(drawing, i)`: the id of the i-th note of the drawing-th batch. The drawings come back in the
 * order of their sentences; each is built on the ones before it (a digit after the trade it needs).
 */
export function tieDrawings(pkg: OperationPackage, draw: readonly DrawRequest[], sentences: readonly string[], drawn: readonly string[], noteId: (drawing: number, i: number) => string): { drawings: TiedDrawing[]; drops: DrawDrop[] } {
  const kind = tutorKind(pkg);
  const numbers = tutorBoardNumbers(pkg);
  const drops: DrawDrop[] = [];
  const asked: { d: DrawRequest; at: number }[] = [];
  for (const d of draw) {
    const at = typeof d.sentence === "number" && Number.isInteger(d.sentence) && d.sentence >= 1 && d.sentence <= sentences.length ? d.sentence - 1 : null;
    if (at === null) { drops.push({ offer: d.offer, sentence: null, reason: "no_sentence" }); continue; }
    // One mark per idea: the first request for a sentence stands.
    if (asked.some((x) => x.at === at)) { drops.push({ offer: d.offer, sentence: at, reason: "same_sentence" }); continue; }
    asked.push({ d, at });
  }
  asked.sort((a, b) => a.at - b.at);
  const drawings: TiedDrawing[] = [];
  const done = [...drawn];
  for (const { d, at } of asked) {
    const { commands, keys } = kind.draw(pkg, [{ offer: d.offer, ...(d.place === undefined ? {} : { place: d.place }) }], done, (i) => noteId(drawings.length, i));
    if (commands.length === 0) { drops.push({ offer: d.offer, sentence: at, reason: "nothing_new" }); continue; }
    if (!commands.every((c) => safeCommand(c, numbers))) { drops.push({ offer: d.offer, sentence: at, reason: "unsafe" }); continue; }
    if (!drawingMatches(sentences[at], d.offer, commands)) { drops.push({ offer: d.offer, sentence: at, reason: "mismatch" }); continue; }
    drawings.push({ sentence: at, offer: d.offer, commands, keys });
    done.push(...keys);
  }
  return { drawings, drops };
}

// ---------- The match check ----------
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
  return { key, values: [...(operands as number[]), r], places: [] };
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
  // A number in places: "52 is 4 tens and 12 ones" (a description; no drawing writes it).
  { re: new RegExp(String.raw`^${N} (?:is|equals|makes) ${N} ${PL}(?: and ${N} ${PL})?$`), read: (m) => {
    const n = toNumber(m[1]);
    const a = toNumber(m[2]);
    const b = m[4] === undefined ? null : toNumber(m[4]);
    return n === null || a === null || (m[4] !== undefined && b === null) || !placeOf(m[3]) || (m[5] !== undefined && !placeOf(m[5])) ? null
      : { key: `parts|${n}|${a} ${placeOf(m[3])}${m[4] === undefined ? "" : `|${b} ${placeOf(m[5])}`}`, values: [n, a, ...(b === null ? [] : [b])], places: [placeOf(m[3])!, ...(m[5] ? [placeOf(m[5])!] : [])] };
  } },
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

/**
 * The plain reason forms (review of #1094, round 3): a clause that leads up to the drawing's statement, read whole as a
 * TRUE math fact ("you can't take 8 from 2" holds because 2 is less than 8). No other clause is read: any clause that is
 * neither one of these nor a positive form (above) leaves the sentence unread, and nothing is drawn with it.
 */
const REASONS: { re: RegExp; holds: (m: RegExpMatchArray) => boolean }[] = [
  { re: new RegExp(String.raw`^(?:you|we) (?:can't|cannot|can not) take ${N} (?:away )?from ${N}$`), holds: (m) => lessThan(m[2], m[1]) },
  { re: new RegExp(String.raw`^${N} is (?:smaller|less) than ${N}$`), holds: (m) => lessThan(m[1], m[2]) },
  { re: new RegExp(String.raw`^${N} is (?:bigger|greater|more) than ${N}$`), holds: (m) => lessThan(m[2], m[1]) },
];
const lessThan = (a: string, b: string) => { const x = toNumber(a); const y = toNumber(b); return x !== null && y !== null && x < y; };

/** Words that may open a clause and change nothing it says. */
const LEAD = /^(?:(?:so|now|then|first|next|okay|ok|and|great|good|right|alright|\{name\}),?\s+)+/;

/** One clause read whole: its action (a positive form), or a true reason (no action), or null when code cannot read it. */
function readClause(clause: string): { action: Action | null } | null {
  for (const f of FORMS) {
    const m = clause.match(f.re);
    if (m) { const a = f.read(m); return a ? { action: a } : null; }
  }
  for (const r of REASONS) {
    const m = clause.match(r.re);
    if (m) return r.holds(m) ? { action: null } : null;
  }
  return null;
}

/**
 * The actions of a sentence, one per clause it states, when code reads the WHOLE sentence with its closed reader: every
 * clause is a plain positive form or a true reason form. Null when any clause is unread (a "do not", a "but", a
 * condition, a lead-in such as "Do not do this:"), and for a question or a quote.
 */
function sentenceActions(sentence: string): Action[] | null {
  const s = sentence.trim().replace(/[’‘]/g, "'").toLowerCase();
  if (/[?"“”]/.test(s)) return null;
  const clauses = s.replace(/[.!]+[')\]]*$/, "").split(/,\s+|;\s+|:\s+|\s+(?=(?:so|but|then|because)\s)/).map((c) => `${c.trim()} `.replace(LEAD, "").trim()).filter(Boolean);
  const actions: Action[] = [];
  for (const c of clauses) {
    const read = readClause(c);
    if (!read) return null;
    if (read.action) actions.push(read.action);
  }
  return actions;
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

/**
 * Whether a drawing's batch matches the sentence it is tied to (B2, review of #1094 round 3). Fail closed, whole batch:
 * - code reads the WHOLE sentence (sentenceActions): every clause is a plain positive form or a true reason form;
 * - EVERY command of the batch is one action code reads (commandAction), and each action is stated by its own clause
 *   of the sentence, equal in every field (kind, operation, values, places, amounts). Earlier work the kind draws first
 *   (a trade before a digit) must be stated too: "We trade 1 ten for 10 ones, so write 4 in the ones." Work already on
 *   the board is not in the batch, so it needs no clause.
 * Otherwise the whole drawing is dropped (never a part of its batch), and the sentence is still said.
 */
export function drawingMatches(sentence: string, _offer: string, commands: readonly TutorCommand[]): boolean {
  void _offer;
  const said = sentenceActions(sentence);
  if (!said || commands.length === 0) return false;
  const free = [...said];
  for (const c of commands) {
    const a = commandAction(c);
    const at = a ? free.findIndex((x) => x.key === a.key) : -1;
    if (at < 0) return false;
    free.splice(at, 1);
  }
  return true;
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
