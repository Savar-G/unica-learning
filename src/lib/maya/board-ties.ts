// B2, "draw while speaking": each of the tutor's drawings is tied to ONE sentence of her message, and goes to the board
// as its own batch, in the order of her sentences. Voice releases a batch when Maya finishes saying its sentence; chat
// animates the batches in that order. Pure TypeScript: no clock, no network.
//
// The model names the sentence (`sentence`, 1 for the first) beside each drawing request. Code checks it:
// - at most one drawing per sentence (one mark per idea): a second request for the same sentence is dropped;
// - the match check: the drawing shows the step and the numbers the sentence says (sayNumbers, the standard reader,
//   on the sentence; the drawing's step and values from the commands the kind built). A mismatch drops the drawing,
//   never the sentence;
// - every command is safe (tutor.ts, safeCommand), as before.
// A dropped drawing goes in the trace (`drawDrops` on the attempt). A drawing request with no `sentence` (a proposal
// from before B2) keeps the old rule: one batch, released at the end of the message, with no match check.
import type { OperationPackage } from "@/lib/question-package";
import { sayNumbers, sentencesOf } from "./say-check";
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
// Review of #1094 (round 2): one place, fail closed. Each plain positive form reads ONE clause into a structured action
// (what it does, its operation, every value, every place, every quantity). Each drawing builds the same structure from
// the command the kind built. A drawing ties only when its action EQUALS the action of one single clause of its
// sentence: no field is taken from another clause, and an equation has the same operation and operands in the same
// roles ("8 plus 4 is 12" is not 12 − 8 = 4). A drawing with no action code can read (a division step, a trade through
// several places) ties to nothing.

/** One action as code reads it: `key` holds every field; `values` and `places` say what it names. */
interface Action {
  key: string;
  values: number[];
  places: string[];
}

const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"] as const;
/** Words that name a trade: a clause about a trade that is not a plain positive trade must not stand beside one. */
const TRADE_WORDS = /\b(?:borrow\w*|trad(?:e|es|ed|ing)|carr(?:y|ies|ied|ying)|regroup\w*|exchang\w*)\b/i;
/** The place words a clause names (plural forms only: "one" and "ten" are numbers). */
const PLACE_WORDS = /\b(hundred thousands|ten thousands|thousands|hundreds|tens|ones)\b/gi;

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

/** Words that may open a clause and change nothing it says. */
const LEAD = /^(?:(?:so|now|then|first|next|okay|ok|and|great|good|right|alright|\{name\}),?\s+)+/;
/** A clause that makes another one depend on something: never read as a plain statement. */
const CONDITION = /^(?:if|unless|when|whenever|once|until|before|after|in case|as soon as)\b/;

/** One clause's action, or null when it is not whole one plain positive form. */
function clauseAction(clause: string): Action | null {
  for (const f of FORMS) {
    const m = clause.match(f.re);
    if (m) return f.read(m);
  }
  return null;
}

/**
 * The clauses of a sentence with their actions (null: not a plain positive statement), or null when the sentence is a
 * question, quotes someone, or holds a condition: then no drawing goes with it.
 */
function clausesOf(sentence: string): { text: string; action: Action | null }[] | null {
  const s = sentence.trim().replace(/[’‘]/g, "'").toLowerCase();
  if (/[?"“”]/.test(s)) return null;
  const clauses = s.replace(/[.!]+[')\]]*$/, "").split(/,\s+|;\s+|:\s+|\s+(?=(?:so|but|then|because)\s)/).map((c) => c.trim()).filter(Boolean);
  if (clauses.some((c) => CONDITION.test(c.replace(LEAD, "")))) return null;
  return clauses.map((c) => {
    const text = c.replace(LEAD, "").replace(/^(?:but|because)\s+/, "");
    return { text, action: /^(?:but|because)\s/.test(c) ? null : clauseAction(text) };
  });
}

/** The action a drawing shows, read from the command the kind built for it, or null when code cannot read one. */
function drawingAction(offer: string, commands: readonly TutorCommand[]): Action | null {
  const target = (c: TutorCommand | undefined) => (c && typeof c.target === "object" && c.target !== null ? (c.target as Record<string, unknown>) : {});
  const num = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" && Number.isInteger(v) ? v : null);
  switch (offer) {
    // The thing asked for is the last value written: the trades and digits before it are the work it needs first.
    case "digit":
    case "value":
    case "answer":
    case "row": {
      const last = commands.filter((c) => c.op === "put").at(-1);
      if (!last) return null;
      const t = target(last);
      return write(num(last.value), t.part === "cell" ? (placeOf(t.column) ?? "?") : null);
    }
    case "note":
    case "try": {
      const notes = commands.filter((c) => c.op === "write");
      const m = notes.length === 1 && typeof notes[0].text === "string" ? /^(.+?) = (\d+)$/.exec(notes[0].text) : null;
      return m ? equationAction(m[1], m[2]) : null;
    }
    case "trade": {
      // One trade only: a trade through several places has no single clause that says it all.
      const regroups = commands.filter((c) => c.op === "regroup");
      if (regroups.length !== 1) return null;
      const r = regroups[0];
      if (typeof r.from !== "string" || typeof r.to !== "string") return null;
      // A borrow gives 1 of the place on the left for 10 of the place on its right; a carry gives 10 for 1.
      return r.kind === "borrow" ? trade(r.from, 1, r.to, 10) : r.kind === "carry" ? trade(r.from, 10, r.to, 1) : null;
    }
    case "division": {
      const c = commands.find((x) => x.op === "division");
      const a = num(c?.dividend);
      const b = num(c?.divisor);
      return a === null || b === null ? null : { key: `divide|${a}|${b}`, values: [a, b], places: [] };
    }
    case "chart": {
      const n = num(commands.find((x) => x.op === "place_chart")?.number);
      return n === null ? null : { key: `chart|${n}`, values: [n], places: [] };
    }
    case "band": {
      const piece = target(commands.find((x) => x.op === "mark")).piece;
      const p = typeof piece === "string" ? placeOf(piece.replace(/^band-/, "")) : null;
      return p ? { key: `place|${p}`, values: [], places: [p] } : null;
    }
    default:
      return null;
  }
}

/** Whether a clause names the drawing at all: one of its values, one of its places, or (a trade) a trade word. */
function names(a: Action, offer: string, text: string): boolean {
  const said = sayNumbers(text).flatMap((t) => (t.q && t.q[1] === 1 ? [t.q[0]] : []));
  const named = [...text.matchAll(PLACE_WORDS)].map((m) => m[1].toLowerCase());
  return a.values.some((v) => said.includes(v)) || a.places.some((p) => named.includes(p)) || (offer === "trade" && TRADE_WORDS.test(text));
}

/**
 * Whether a drawing matches the sentence it is tied to (B2). Fail closed: the drawing's action must equal the action of
 * one single clause of the sentence, read whole from one plain positive form (every field: what it does, its operation,
 * its values, places and quantities). A question, a quote, a condition, a clause about the drawing that is not a plain
 * positive form ("Do not trade yet."), or any clause after the matching one that is not one: no match. A reason
 * before the matching clause may stand when it does not name the drawing ("You can't take 8 from 2, so we trade 1 ten
 * for 10 ones."). The sentence is still said.
 */
export function drawingMatches(sentence: string, offer: string, commands: readonly TutorCommand[]): boolean {
  const a = drawingAction(offer, commands);
  const clauses = clausesOf(sentence);
  if (!a || !clauses) return false;
  const at = clauses.findIndex((c) => c.action?.key === a.key);
  if (at < 0) return false;
  return !clauses.some((c, i) => c.action === null && (i > at || names(a, offer, c.text)));
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
