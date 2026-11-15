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

/** The places a board column or a sentence names, as words ("ten thousands"). Plural forms only: "one" and "ten" are numbers. */
const PLACE_WORDS = /\b(hundred thousands|ten thousands|thousands|hundreds|tens|ones)\b/gi;
const PLACES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands"] as const;
/** Words that name a trade: a trade drawing matches a sentence that says one. */
const TRADE_WORDS = /\b(?:borrow\w*|trad(?:e|es|ed|ing)|carr(?:y|ies|ied|ying)|regroup\w*)\b/i;

const placeOf = (column: unknown): string | null => {
  if (typeof column !== "string") return null;
  const p = column.replace(/_/g, " ").toLowerCase();
  return (PLACES as readonly string[]).includes(p) ? p : null;
};

/** The whole numbers a sentence says, by the standard reader (sayNumbers). */
const numbersOf = (text: string): number[] => sayNumbers(text).flatMap((t) => (t.q && t.q[1] === 1 ? [t.q[0]] : []));

/** The places a sentence names. */
const placesOf = (text: string): string[] => [...text.matchAll(PLACE_WORDS)].map((m) => m[1].toLowerCase().replace(/\s+/g, " "));

const valueOf = (v: unknown): number | null => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" && Number.isInteger(v) ? v : null);

/** What one drawing shows, read from its commands by its offer: the values it writes and the places it is about. */
interface DrawingFacts {
  values: number[];
  places: string[];
  /** How a sentence must name it: by a value, by a place (or a trade word), or by either. */
  by: "value" | "place" | "either" | "all";
}

function drawingFacts(offer: string, commands: readonly TutorCommand[]): DrawingFacts {
  const puts = commands.filter((c) => c.op === "put");
  const last = puts.at(-1);
  const target = (c: TutorCommand | undefined) => (c && typeof c.target === "object" && c.target !== null ? (c.target as Record<string, unknown>) : {});
  const putFacts = (cs: readonly TutorCommand[]) => ({
    values: cs.flatMap((c) => { const v = valueOf(c.value); return v === null ? [] : [v]; }),
    places: cs.flatMap((c) => { const p = placeOf(target(c).column); return p ? [p] : []; }),
  });
  const writes = commands.filter((c) => c.op === "write");
  switch (offer) {
    // The thing asked for is the last thing written: the earlier trades and digits are the work it needs first.
    case "digit":
    case "value":
    case "answer":
    case "row":
      return { ...putFacts(last ? [last] : []), by: "value" };
    case "step":
      return { values: putFacts(puts).values, places: [], by: "value" };
    case "note":
    case "try":
      // A note writes one equation: the sentence says it, with all its numbers.
      return { values: writes.flatMap((c) => (typeof c.text === "string" ? numbersOf(c.text) : [])), places: [], by: "all" };
    case "division": {
      const c = commands.find((x) => x.op === "division");
      return { values: [valueOf(c?.dividend), valueOf(c?.divisor)].flatMap((v) => (v === null ? [] : [v])), places: [], by: "value" };
    }
    case "chart": {
      const c = commands.find((x) => x.op === "place_chart");
      const n = valueOf(c?.number);
      return { values: n === null ? [] : [n], places: n === null ? [] : PLACES.slice(0, String(n).length), by: "either" };
    }
    case "band": {
      const c = commands.find((x) => x.op === "mark");
      const piece = target(c).piece;
      const p = typeof piece === "string" ? placeOf(piece.replace(/^band-/, "")) : null;
      return { values: [], places: p ? [p] : [], by: "place" };
    }
    case "trade": {
      const places = commands.filter((c) => c.op === "regroup").flatMap((c) => [placeOf(c.from), placeOf(c.to)].flatMap((p) => (p ? [p] : [])));
      return { values: putFacts(puts).values, places: [...new Set(places)], by: "place" };
    }
    default: {
      // A drawing this file does not know: any value or place it shows.
      const f = putFacts(puts);
      return { values: [...f.values, ...writes.flatMap((c) => (typeof c.text === "string" ? numbersOf(c.text) : []))], places: f.places, by: "either" };
    }
  }
}

/**
 * Whether a drawing matches the sentence it is tied to (B2): the sentence says the drawing's step and numbers.
 * - a written value (a digit, a row, a value, the answer, a division step): the sentence says that number;
 * - a note: the sentence says every number of its equation;
 * - a trade or a highlight: the sentence names its place, or (a trade) says borrow, trade, carry or regroup;
 * - a chart: the sentence says its number or names one of its places;
 * and never a place conflict: when the sentence names places and the drawing is about one, it is one of them.
 */
export function drawingMatches(sentence: string, offer: string, commands: readonly TutorCommand[]): boolean {
  const f = drawingFacts(offer, commands);
  const said = numbersOf(sentence);
  const named = placesOf(sentence);
  const byValue = f.values.some((v) => said.includes(v));
  const byPlace = f.places.some((p) => named.includes(p)) || (offer === "trade" && TRADE_WORDS.test(sentence));
  const shown = f.by === "all" ? f.values.length > 0 && f.values.every((v) => said.includes(v))
    : f.by === "value" ? byValue
    : f.by === "place" ? byPlace
    : byValue || byPlace;
  if (!shown) return false;
  // A chart holds every place of its number: no place conflict to read.
  if (f.by === "either" || named.length === 0 || f.places.length === 0) return true;
  return f.places.some((p) => named.includes(p));
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
