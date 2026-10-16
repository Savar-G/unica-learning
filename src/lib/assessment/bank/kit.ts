// Tools for writing question templates. The grade 1-2 bank (#74) uses them; the grade 3-5 and 6-7 banks (#75, #76) can too.
import type { MisconceptionId } from "../misconceptions";
import type { Rng } from "../rng";
import type { CodedWrong, Level, TaggedProvince, Template } from "../types";

/** A template with the grade tag of all five provinces (D-083: every tag is done before launch). */
export type TaggedTemplate = Template & { grades: Record<TaggedProvince, Level> };

/**
 * The BC skill map skills a template tests (#193), main skill first. A plain list when every skill is in the
 * template's own standard; with a note when a skill comes from another standard (a prerequisite, or a skill the
 * question also needs), so a reviewer sees why.
 */
export type SkillTag = readonly string[] | { readonly skills: readonly string[]; readonly note: string };

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

/** The space between glyphs: it does not break, so a row of dots or a pattern stays on one line to count. */
export const GAP = "\u00a0";

/** A shape as a choice: the glyph for the eye, the word for a reader. */
const shapeLabel = (s: Shape) => `${s.glyph} ${s.word}`;

/** n copies of a glyph: row(3) is "● ● ●". */
export const row = (n: number, glyph = "●") => Array.from({ length: n }, () => glyph).join(GAP);

/** Short first names from many backgrounds, for word problems. A name never needs a pronoun. */
export const NAMES = ["Mia", "Liam", "Ava", "Noah", "Zara", "Arjun", "Lucas", "Mei", "Omar", "Sofia", "Kai", "Leah", "Ravi", "Emma", "Jonah", "Priya", "Theo", "Amara", "Ben", "Nia"] as const;

/** Two different names. */
export function twoNames(rng: Rng): [string, string] {
  const [a, b] = rng.shuffle(NAMES);
  return [a, b];
}

/**
 * "a, b or c": the choices in words, in an order drawn from the seed. A fixed order (alphabetical, or answer first)
 * would put the answer in the same place every time, and a child who listens could learn that.
 */
export const orList = (rng: Rng, items: readonly string[]) => {
  const mixed = rng.shuffle(items);
  return mixed.length < 2 ? mixed.join("") : `${mixed.slice(0, -1).join(", ")} or ${mixed[mixed.length - 1]}`;
};

/** A coded wrong answer. */
export const wrong = (value: string | number, misconception: MisconceptionId): CodedWrong => ({ value: String(value), misconception });

/**
 * A "what comes next" or "what is missing" question for a repeating pattern of shapes.
 * `core` holds indexes into SHAPES; the pattern repeats it to `length` items and asks for item `ask`.
 * Choices: the answer, then other shapes. A wrong choice equal to the item just before the gap is
 * coded A2 (repeats the last item); any other wrong choice shows the child did not see the core.
 */
function shapePattern(rng: Rng, core: readonly number[], length: number, ask: number) {
  if (ask < 1 || ask > length) throw new Error("shapePattern asks for an item after the first, at most one past the end");
  // Items 0 to `length` - 1 are shown; asking for item `length` means "what comes next".
  const items = Array.from({ length: Math.max(length, ask + 1) }, (_, i) => SHAPES[core[i % core.length]]);
  const answer = items[ask];
  const before = items[ask - 1];
  const others = rng.shuffle(SHAPES.filter((s) => s !== answer));
  // Prefer the shape just before the gap (a common slip), then the pattern's own shapes (a child who misses the core
  // picks one of them), then any other shape.
  const coreShapes = core.map((i) => SHAPES[i]);
  const picks = [...new Set([before, ...coreShapes, ...others])].filter((s) => s !== answer).slice(0, 2);
  const shown = items.map((s, i) => (i === ask ? "?" : s.glyph)).join(GAP);
  // "Next" questions speak the shapes shown; "missing" questions say where the gap is.
  const spoken = items.flatMap((s, i) => (i !== ask ? [s.word] : ask < length ? ["a missing shape"] : [])).join(", ");
  return {
    shown,
    spoken,
    answer: shapeLabel(answer),
    wrong: picks.map((s) => wrong(shapeLabel(s), s === before ? "A2" : coreShapes.includes(s) ? "pattern-core" : "pattern-new-shape")),
    choiceWords: [answer, ...picks].map((s) => s.word),
  };
}

/** A shape pattern question: "what comes next" when `gap` is `length`, else "what is missing". */
export function shapeQuestion(rng: Rng, core: readonly number[], length: number, gap = length) {
  const p = shapePattern(rng, core, length, gap);
  const next = gap === length;
  return {
    prompt: `${next ? "What comes next?" : "What shape is missing?"} ${p.shown}`,
    readAloud: `Look at the pattern: ${p.spoken}. ${next ? "Which shape comes next?" : "Which shape is missing?"}`,
    answer: p.answer,
    wrong: p.wrong,
  };
}

/**
 * "What is the 11th shape?" for a repeating pattern shown twice and then "...". A child who loses count by one
 * lands on a neighbour (coded one-to-one); any other wrong shape shows the core was missed.
 */
export function predictShape(rng: Rng, core: readonly number[], ask: number) {
  const at = (position: number) => SHAPES[core[(position - 1) % core.length]];
  const answer = at(ask);
  const neighbours = [at(ask - 1), at(ask + 1)].filter((s, i, all) => s !== answer && all.indexOf(s) === i);
  // After the neighbours, prefer the pattern's own shapes; a shape not in the pattern is coded as such.
  const coreShapes = core.map((i) => SHAPES[i]);
  const others = rng.shuffle(SHAPES.filter((s) => s !== answer && !neighbours.includes(s)));
  const picks = [...new Set([...neighbours, ...coreShapes, ...others])].filter((s) => s !== answer).slice(0, 2);
  const shown = Array.from({ length: core.length * 2 }, (_, i) => at(i + 1));
  return {
    prompt: `The pattern keeps going: ${shown.map((s) => s.glyph).join(GAP)} … What is the ${ordinal(ask)} shape?`,
    readAloud: `The pattern is ${shown.map((s) => s.word).join(", ")}, and it keeps going. What is the ${ordinal(ask)} shape in the pattern?`,
    answer: shapeLabel(answer),
    wrong: picks.map((s) => wrong(shapeLabel(s), neighbours.includes(s) ? "one-to-one" : coreShapes.includes(s) ? "pattern-core" : "pattern-new-shape")),
  };
}

/** Keeps a sum or an equation on one line: the spaces around + − × and = do not break. */
const keepTogether = (text: string) => text.replace(/ ([+−×=]) /g, "\u00a0$1\u00a0");

/** The template, with every sum in its prompt and choices kept on one line (a split "2 +" / "9" confuses a young reader). */
export function keepSumsTogether<T extends Template>(template: T): T {
  return {
    ...template,
    fill(rng) {
      const f = template.fill(rng);
      return {
        ...f,
        prompt: keepTogether(f.prompt),
        answer: keepTogether(f.answer),
        wrong: f.wrong.map((w) => ({ ...w, value: keepTogether(w.value) })),
      };
    },
  };
}

/**
 * Two clues that put three things in order, told from the big end ("is longer than") or the small end ("is shorter
 * than") at random, so the longest is not always the one named first.
 */
export function orderClues(rng: Rng, [big, mid, small]: readonly [string, string, string], more: string, less: string) {
  return rng.int(0, 1) === 1
    ? `${cap(big)} is ${more} than ${mid}. ${cap(mid)} is ${more} than ${small}.`
    : `${cap(small)} is ${less} than ${mid}. ${cap(mid)} is ${less} than ${big}.`;
}

/** Pattern letters as a browser voice should say them: "A A B" is "letter A, letter A, letter B" (a lone "A" is read as "uh"). */
export const sayLetters = (code: string) => code.split(" ").map((l) => `letter ${l}`).join(", ");

/** "twos", "fives", "tens": a voice may read "2s" as "two s". */
export const skipWord = (step: number) => ({ 2: "twos", 3: "threes", 4: "fours", 5: "fives", 10: "tens" })[step] ?? `${step}s`;

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st. */
export const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
};

/** count(1, "ten") is "1 ten"; count(3, "ten") is "3 tens". */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "a small apple" -> "A small apple". */
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
