// Tools for writing question templates. The grade 1-2 bank (#74) uses them; the grade 3-5 and 6-7 banks (#75, #76) can too.
import type { MisconceptionId } from "../misconceptions";
import type { Rng } from "../rng";
import type { CodedWrong, Level, TaggedProvince, Template } from "../types";

/** A template with the grade tag of all five provinces (D-083: every tag is done before launch). */
export type TaggedTemplate = Template & { grades: Record<TaggedProvince, Level> };

/** Draws until `ok` accepts, so a template never yields a question where a wrong answer equals the right one. */
export function draw<T>(rng: Rng, make: (rng: Rng) => T, ok: (v: T) => boolean): T {
  for (let i = 0; i < 1000; i++) {
    const v = make(rng);
    if (ok(v)) return v;
  }
  throw new Error("Template could not draw valid numbers");
}

/** Shapes a prompt can show. The glyph is for the eye; the word is for "read it to me". */
export const SHAPES = [
  { glyph: "●", word: "circle" },
  { glyph: "■", word: "square" },
  { glyph: "▲", word: "triangle" },
  { glyph: "★", word: "star" },
] as const;
export type Shape = (typeof SHAPES)[number];

/** n copies of a glyph: row(3) is "● ● ●". */
export const row = (n: number, glyph = "●") => Array.from({ length: n }, () => glyph).join(" ");

/** Short first names from many backgrounds, for word problems. A name never needs a pronoun. */
export const NAMES = ["Mia", "Liam", "Ava", "Noah", "Zara", "Arjun", "Lucas", "Mei", "Omar", "Sofia", "Kai", "Leah", "Ravi", "Emma", "Jonah", "Priya", "Theo", "Amara", "Ben", "Nia"] as const;

/** Two different names. */
export function twoNames(rng: Rng): [string, string] {
  const [a, b] = rng.shuffle(NAMES);
  return [a, b];
}

/** "a, b or c": the choices in words, for read-aloud. The order is alphabetical so it gives no hint. */
export const orList = (items: readonly string[]) => {
  const sorted = [...items].sort();
  return sorted.length < 2 ? sorted.join("") : `${sorted.slice(0, -1).join(", ")} or ${sorted[sorted.length - 1]}`;
};

/** A coded wrong answer. */
export const wrong = (value: string | number, misconception: MisconceptionId): CodedWrong => ({ value: String(value), misconception });

/**
 * A "what comes next" or "what is missing" question for a repeating pattern of shapes.
 * `core` holds indexes into SHAPES; the pattern repeats it to `length` items and asks for item `ask`.
 * Choices: the answer, then other shapes. A wrong choice equal to the item just before the gap is
 * coded A2 (repeats the last item); any other wrong choice shows the child did not see the core.
 */
export function shapePattern(rng: Rng, core: readonly number[], length: number, ask: number) {
  if (ask < 1 || ask > length) throw new Error("shapePattern asks for an item after the first, at most one past the end");
  // Items 0 to `length` - 1 are shown; asking for item `length` means "what comes next".
  const items = Array.from({ length: Math.max(length, ask + 1) }, (_, i) => SHAPES[core[i % core.length]]);
  const answer = items[ask];
  const before = items[ask - 1];
  const others = rng.shuffle(SHAPES.filter((s) => s !== answer));
  // Prefer the shape just before the gap (a common slip), then any other shape.
  const picks = [before, ...others.filter((s) => s !== before)].filter((s) => s !== answer).slice(0, 2);
  const shown = items.map((s, i) => (i === ask ? "?" : s.glyph)).join(" ");
  const spoken = items.map((s, i) => (i === ask ? "what shape" : s.word)).join(", ");
  const label = (s: Shape) => `${s.glyph} ${s.word}`;
  return {
    shown,
    spoken,
    answer: label(answer),
    wrong: picks.map((s) => wrong(label(s), s === before ? "A2" : "pattern-core")),
    choiceWords: [answer, ...picks].map((s) => s.word),
  };
}

/** A shape pattern question: "what comes next" when `gap` is `length`, else "what is missing". */
export function shapeQuestion(rng: Rng, core: readonly number[], length: number, gap = length) {
  const p = shapePattern(rng, core, length, gap);
  const next = gap === length;
  const options = orList(p.choiceWords.map((w) => `a ${w}`));
  return {
    prompt: `${next ? "What comes next?" : "What shape is missing?"} ${p.shown}`,
    readAloud: `Look at the pattern: ${p.spoken}. ${next ? "Which shape comes next" : "Which shape is missing"}: ${options}?`,
    answer: p.answer,
    wrong: p.wrong,
  };
}

/**
 * "What shape is number `ask`?" for a repeating pattern shown twice and then "...". A child who loses count by one
 * lands on a neighbour (coded one-to-one); any other wrong shape shows the core was missed.
 */
export function predictShape(rng: Rng, core: readonly number[], ask: number) {
  const at = (position: number) => SHAPES[core[(position - 1) % core.length]];
  const answer = at(ask);
  const neighbours = [at(ask - 1), at(ask + 1)].filter((s, i, all) => s !== answer && all.indexOf(s) === i);
  const others = rng.shuffle(SHAPES.filter((s) => s !== answer && !neighbours.includes(s)));
  const picks = [...neighbours, ...others].slice(0, 2);
  const shown = Array.from({ length: core.length * 2 }, (_, i) => at(i + 1));
  const label = (s: Shape) => `${s.glyph} ${s.word}`;
  return {
    prompt: `The pattern keeps going: ${shown.map((s) => s.glyph).join(" ")} … What shape is number ${ask}?`,
    readAloud: `The pattern is ${shown.map((s) => s.word).join(", ")}, and it keeps going. What shape is number ${ask} in the pattern: ${orList([answer, ...picks].map((s) => `a ${s.word}`))}?`,
    answer: label(answer),
    wrong: picks.map((s) => wrong(label(s), neighbours.includes(s) ? "one-to-one" : "pattern-core")),
  };
}

/** "a small apple" -> "A small apple". */
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
