// Level 3 (BC grade 3) for the grades 3-5 bank: stage 1 for grade 3, and the "down" form for grade 4. These add to the
// grades 1-2 bank's level 3 templates (see ./index.ts), and bring the first fractions.
// Standards: curriculum map, section 1 (3.1-3.14); example items: section 3, grade 3. Province tags: see ./index.ts.
import { cap, count, draw, NAMES, wrong, type TaggedTemplate } from "../kit";
import { drawChoices, frac, parts, sayFrac, typedWrong } from "./say";

/** Adds column by column and drops every carry (O3). */
const noCarry = (a: number, b: number) => [100, 10, 1].reduce((s, p) => s + (((Math.floor(a / p) % 10) + (Math.floor(b / p) % 10)) % 10) * p, 0);

/** A whole cut into equal parts: what is cut, and what one part is called. */
const WHOLES = [
  { whole: "pizza", part: "slice" },
  { whole: "cake", part: "piece" },
  { whole: "pie", part: "piece" },
  { whole: "chocolate bar", part: "piece" },
  { whole: "sandwich", part: "piece" },
  { whole: "garden", part: "bed" },
] as const;

/** The denominators a grade 3 child meets: halves to twelfths. */
const DENS = [3, 4, 5, 6, 8, 10];

export const LEVEL_3: readonly TaggedTemplate[] = [
  // ---------- Number ----------
  {
    // Skip-counting from any start, across a hundred (3.1: "698, 699, 700, 701").
    id: "g35-3-skip-count",
    strand: "N", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.1",
    fill(rng) {
      const step = rng.pick([4, 5, 25, 50, 100]), back = rng.int(0, 1) === 1;
      // Five terms between 100 and 999 that cross a hundred.
      const start = draw(
        rng,
        (r) => r.int(100, 999),
        (s) => {
          const last = back ? s - 4 * step : s + 4 * step;
          return last >= 100 && last <= 999 && Math.floor(s / 100) !== Math.floor(last / 100);
        },
      );
      const seq = [0, 1, 2, 3].map((i) => (back ? start - i * step : start + i * step));
      const answer = back ? start - 4 * step : start + 4 * step;
      return {
        values: { start, step, back: back ? 1 : 0 },
        prompt: `What number comes next? ${seq.join(", ")}, ?`,
        readAloud: `What number comes next? ${seq.join(", ")}.`,
        answer: String(answer),
        wrong: typedWrong(answer, [[back ? seq[3] - 1 : seq[3] + 1, "skip-by-one"], [seq[3], "A2"]]),
      };
    },
  },
  {
    // Compare and order to 1000 (3.1), with numbers made from the same three digits.
    id: "g35-3-order-numbers",
    strand: "N", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.1",
    fill(rng) {
      const { v, answer, wrong: w } = drawChoices(
        rng,
        (r) => {
          const digits = r.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
          const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((p) => p.map((i) => digits[i]));
          return r.shuffle(perms).slice(0, 3).map(([h, t, o]) => h * 100 + t * 10 + o);
        },
        (nums) => {
          const list = (order: number[]) => order.join(", ");
          const by = (key: (n: number) => number) => [...nums].sort((a, b) => key(a) - key(b) || a - b);
          return {
            answer: list(by((n) => n)),
            candidates: [
              wrong(list(by((n) => n % 10)), "digit-compare"),
              wrong(list(by((n) => -n)), "more-less"),
              wrong(list(by((n) => Math.floor(n / 10) % 10)), "digit-compare"),
            ],
          };
        },
      );
      return {
        values: { a: v[0], b: v[1], c: v[2] },
        prompt: "Which list goes from least to greatest?",
        readAloud: "Which list of numbers goes from least to greatest?",
        answer,
        wrong: w,
      };
    },
  },
  {
    // Multiplication as an array (3.5). WNCP grade 3 multiplies to 5 x 5, so the factors stay at 5 or less.
    id: "g35-3-array",
    strand: "O", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.5",
    fill(rng) {
      const rows = rng.int(2, 5), each = rng.int(3, 5);
      const [thing, place] = rng.pick([["chairs", "in a room"], ["carrots", "in a garden"], ["stamps", "on a sheet"], ["muffins", "on a tray"], ["desks", "in a classroom"]] as const);
      const name = rng.pick(NAMES);
      return {
        values: { rows, each },
        prompt: `${name} sees ${rows} rows of ${thing} ${place}. There are ${each} ${thing} in each row. How many ${thing} are there in all?`,
        readAloud: `${name} sees ${rows} rows of ${thing} ${place}. There are ${each} ${thing} in each row. How many ${thing} are there in all?`,
        answer: String(rows * each),
        wrong: typedWrong(rows * each, [[rows + each, "operation"]]),
      };
    },
  },
  {
    // Division as grouping (3.5: "division as sharing, grouping"); 3-share-equally is the sharing kind.
    id: "g35-3-groups-of",
    strand: "O", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.5",
    fill(rng) {
      const size = rng.int(2, 5), groups = rng.int(3, 5);
      const total = size * groups;
      const [things, box] = rng.pick([["cupcakes", "box"], ["eggs", "carton"], ["pencils", "pack"], ["crayons", "cup"], ["books", "pile"]] as const);
      return {
        values: { size, groups },
        prompt: `There are ${total} ${things}. Each ${box} holds ${size} ${things}. How many ${box === "box" ? "boxes" : `${box}s`} can be filled?`,
        readAloud: `There are ${total} ${things}. Each ${box} holds ${size} ${things}. How many ${box === "box" ? "boxes" : `${box}s`} can be filled?`,
        answer: String(groups),
        wrong: typedWrong(groups, [[total - size, "operation"], [total + size, "operation"]]),
      };
    },
  },
  {
    // Adding to 1000 in a story (3.3), with a carry.
    id: "g35-3-story-add",
    strand: "O", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.3",
    fill(rng) {
      const [a, b] = draw(
        rng,
        (r) => [r.int(120, 580), r.int(115, 399)],
        ([a, b]) => ((a % 10) + (b % 10) >= 10 || (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) >= 10) && a + b < 1000,
      );
      const [place, x, y] = rng.pick([
        ["A library", "picture books", "chapter books"],
        ["A farm", "chickens", "ducks"],
        ["A school", "red chairs", "blue chairs"],
        ["A store", "big jars", "small jars"],
      ] as const);
      return {
        values: { a, b },
        prompt: `${place} has ${a} ${x} and ${b} ${y}. How many is that in all?`,
        readAloud: `${place} has ${a} ${x} and ${b} ${y}. How many is that in all?`,
        answer: String(a + b),
        wrong: typedWrong(a + b, [[noCarry(a, b), "O3"]]),
      };
    },
  },

  // ---------- Fractions ----------
  {
    // Part of a region (3.2; map, grade 3: Maria eats 3 of 8 slices).
    id: "g35-3-fraction-eaten",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: true, standard: "3.2",
    fill(rng) {
      const { whole, part } = rng.pick(WHOLES.filter((w) => w.whole !== "garden"));
      const name = rng.pick(NAMES);
      const { v: [d, n], answer, wrong: w } = drawChoices(
        rng,
        (r) => { const d = r.pick(DENS); return [d, r.int(2, d - 2)] as const; },
        ([d, n]) => ({
          answer: frac(n, d),
          candidates: [wrong(frac(n, d - n), "F4"), wrong(frac(d - n, d), "fraction-other-part"), wrong(frac(d, n), "fraction-flip")],
        }),
      );
      return {
        values: { d, n },
        prompt: `A ${whole} is cut into ${d} equal ${part}s. ${name} eats ${n} ${part}s. What fraction of the ${whole} did ${name} eat?`,
        readAloud: `A ${whole} is cut into ${d} equal ${part}s. ${name} eats ${n} ${part}s. What fraction of the ${whole} did ${name} eat?`,
        answer,
        wrong: w,
      };
    },
  },
  {
    // The part that is left (3.2).
    id: "g35-3-fraction-left",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: true, standard: "3.2",
    fill(rng) {
      const { whole, part } = rng.pick(WHOLES.filter((w) => w.whole !== "garden"));
      const name = rng.pick(NAMES);
      const { v: [d, n], answer, wrong: w } = drawChoices(
        rng,
        (r) => { const d = r.pick(DENS); return [d, r.int(1, d - 2)] as const; },
        ([d, n]) => ({
          answer: frac(d - n, d),
          candidates: [wrong(frac(n, d), "fraction-other-part"), wrong(frac(d - n, n), "F4"), wrong(frac(d, d - n), "fraction-flip")],
        }),
      );
      return {
        values: { d, n },
        prompt: `A ${whole} is cut into ${d} equal ${part}s. ${name} eats ${count(n, part)}. What fraction of the ${whole} is left?`,
        readAloud: `A ${whole} is cut into ${d} equal ${part}s. ${name} eats ${count(n, part)}. What fraction of the ${whole} is left?`,
        answer,
        wrong: w,
      };
    },
  },
  {
    // Part of a set (3.2). WNCP names fractions of a set in grade 4, so SK, MB and AB get 4; ON is unsure, so 4.
    id: "g35-3-fraction-of-set",
    strand: "F", grades: { BC: 3, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: false, standard: "3.2",
    fill(rng) {
      const [things, kind] = rng.pick([["marbles in a bag", "red"], ["children in a group", "wearing hats"], ["apples in a basket", "green"], ["fish in a tank", "striped"], ["cars in a lot", "blue"]] as const);
      const { v: [d, n], answer, wrong: w } = drawChoices(
        rng,
        (r) => { const d = r.int(5, 12); return [d, r.int(2, d - 2)] as const; },
        ([d, n]) => ({
          answer: frac(n, d),
          candidates: [wrong(frac(n, d - n), "F4"), wrong(frac(d - n, d), "fraction-other-part"), wrong(frac(d, n), "fraction-flip")],
        }),
      );
      const [noun] = things.split(" ");
      return {
        values: { d, n },
        prompt: `There are ${d} ${things}. ${n} of them are ${kind}. What fraction of the ${noun} are ${kind}?`,
        readAloud: `There are ${d} ${things}. ${n} of them are ${kind}. What fraction of the ${noun} are ${kind}?`,
        answer,
        wrong: w,
      };
    },
  },
  {
    // Fraction parts are equal shares (3.2; misconception F3).
    id: "g35-3-equal-parts",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.2",
    fill(rng) {
      const d = rng.pick([3, 4, 5, 6, 8]);
      const { whole } = rng.pick(WHOLES.filter((w) => w.whole !== "garden"));
      const name = rng.pick(NAMES);
      return {
        values: { d },
        prompt: `${name} wants to cut a ${whole} into ${parts(d)}. How must ${name} cut it?`,
        readAloud: `${name} wants to cut a ${whole} into ${parts(d)}. How must ${name} cut it?`,
        answer: `Into ${d} pieces that are all the same size`,
        wrong: [
          wrong(`Into ${d} pieces of any size`, "F3"),
          wrong(`Into ${d} pieces, with one piece bigger than the others`, "F3"),
          wrong(`Into ${d + 1} pieces that are all the same size`, "denominator-meaning"),
        ],
      };
    },
  },
  {
    // A fraction on a number line from 0 to 1 (3.2: "linear model"; misconception F5). WNCP and ON put fractions on a
    // number line later than grade 3 (unsure), so they get 4.
    id: "g35-3-fraction-number-line",
    strand: "F", grades: { BC: 3, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "choice", whiteboard: true, standard: "3.2",
    fill(rng) {
      const { v: [d, n], answer, wrong: w } = drawChoices(
        rng,
        (r) => { const d = r.pick([3, 4, 5, 6, 8]); return [d, r.int(1, d - 1)] as const; },
        ([d, n]) => ({
          answer: frac(n, d),
          candidates: [wrong(frac(n, d + 1), "F5"), wrong(frac(n + 1, d + 1), "F5"), wrong(frac(d - n, d), "fraction-other-part")],
        }),
      );
      return {
        values: { d, n },
        prompt: `A number line goes from 0 to 1. It is split into ${d} equal parts. A dot is ${count(n, "part")} from 0. What fraction is at the dot?`,
        readAloud: `A number line goes from 0 to 1. It is split into ${d} equal parts. A dot is ${count(n, "part")} from 0. What fraction is at the dot?`,
        answer,
        wrong: w,
      };
    },
  },
  {
    // A unit fraction of a set, by sharing (3.2: "parts of a set", "equal partitioning"). Set model: WNCP grade 4.
    id: "g35-3-fraction-of-amount",
    strand: "F", grades: { BC: 3, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: true, standard: "3.2",
    fill(rng) {
      const d = rng.int(2, 5), share = rng.int(2, 6);
      const total = d * share;
      const [a, b] = rng.shuffle(NAMES).slice(0, 2);
      const thing = rng.pick(["stickers", "marbles", "cards", "shells"]);
      return {
        values: { d, share },
        prompt: `${a} has ${total} ${thing}. ${a} gives ${frac(1, d)} of them to ${b}. How many ${thing} does ${b} get?`,
        readAloud: `${a} has ${total} ${thing}. ${a} gives ${sayFrac(1, d)} of them to ${b}. How many ${thing} does ${b} get?`,
        answer: String(share),
        wrong: typedWrong(share, [[total - share, "fraction-other-part"], [d, "denominator-meaning"], [total * d, "operation"]]),
      };
    },
  },
  {
    // The whole as a fraction (3.2).
    id: "g35-3-whole-as-fraction",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.2",
    fill(rng) {
      const d = rng.pick(DENS);
      const { whole, part } = rng.pick(WHOLES.filter((w) => w.whole !== "garden"));
      return {
        values: { d },
        prompt: `A ${whole} is cut into ${d} equal ${part}s. A family eats all ${d} ${part}s. What fraction of the ${whole} did they eat?`,
        readAloud: `A ${whole} is cut into ${d} equal ${part}s. A family eats all ${d} ${part}s. What fraction of the ${whole} did they eat?`,
        answer: frac(d, d),
        wrong: [wrong(frac(1, d), "one-part"), wrong(frac(d - 1, d), "one-to-one"), wrong(frac(d, 1), "denominator-meaning")],
      };
    },
  },
  {
    // What is left, from a fraction (3.2: "pictorial models connected to symbols").
    id: "g35-3-fraction-rest",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: true, standard: "3.2",
    fill(rng) {
      const { whole } = rng.pick(WHOLES.filter((w) => w.whole !== "garden"));
      const name = rng.pick(NAMES);
      const { v: [d, n], answer, wrong: w } = drawChoices(
        rng,
        (r) => { const d = r.pick(DENS); return [d, r.int(2, d - 2)] as const; },
        ([d, n]) => ({
          answer: frac(d - n, d),
          candidates: [wrong(frac(n, d), "fraction-other-part"), wrong(frac(d - n, n), "F4"), wrong(frac(d, d - n), "fraction-flip")],
        }),
      );
      return {
        values: { d, n },
        prompt: `${name} ate ${frac(n, d)} of a ${whole}. What fraction of the ${whole} is left?`,
        readAloud: `${name} ate ${sayFrac(n, d)} of a ${whole}. What fraction of the ${whole} is left?`,
        answer,
        wrong: w,
      };
    },
  },
  {
    // A unit fraction of a region (3.2).
    id: "g35-3-unit-fraction",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.2",
    fill(rng) {
      const d = rng.pick([3, 4, 5, 6, 8, 10]);
      const [whole, part, what] = rng.pick([
        ["garden", "beds", "Carrots grow in 1 bed"],
        ["window", "panes", "1 pane is cracked"],
        ["flag", "stripes", "1 stripe is red"],
        ["field", "sections", "1 section is for soccer"],
      ] as const);
      return {
        values: { d },
        prompt: `A ${whole} has ${d} equal ${part}. ${what}. What fraction of the ${whole} is that?`,
        readAloud: `A ${whole} has ${d} equal ${part}. ${what}. What fraction of the ${whole} is that?`,
        answer: frac(1, d),
        wrong: [wrong(frac(1, d - 1), "F4"), wrong(frac(d - 1, d), "fraction-other-part"), wrong(frac(d, 1), "denominator-meaning")],
      };
    },
  },
  {
    // A fraction in words (3.2). The choices are words, so a voice reads them well.
    id: "g35-3-fraction-words",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.2",
    fill(rng) {
      const colour = rng.pick(["red", "blue", "green", "yellow"]);
      const { v: [d, n], answer, wrong: w } = drawChoices(
        rng,
        (r) => { const d = r.pick([5, 6, 8, 10, 12]); return [d, r.int(2, d - 2)] as const; },
        ([d, n]) => ({
          answer: sayFrac(n, d),
          candidates: [wrong(sayFrac(n, d - n), "F4"), wrong(sayFrac(d - n, d), "fraction-other-part"), wrong(sayFrac(d, n), "fraction-flip")],
        }),
      );
      return {
        values: { d, n },
        prompt: `A flag has ${d} equal stripes. ${n} of the stripes are ${colour}. Which words name the ${colour} part of the flag?`,
        readAloud: `A flag has ${d} equal stripes. ${n} of the stripes are ${colour}. Which words name the ${colour} part of the flag?`,
        answer,
        wrong: w,
      };
    },
  },
  {
    // A fraction of a bar in rows (3.2: "parts of a region").
    id: "g35-3-bar-rows",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: true, standard: "3.2",
    fill(rng) {
      const name = rng.pick(NAMES);
      const { v: [rows, each, n], answer, wrong: w } = drawChoices(
        rng,
        (r) => { const rows = r.int(2, 3), each = r.int(3, 5); return [rows, each, r.int(2, rows * each - 2)] as const; },
        ([rows, each, n]) => ({
          answer: frac(n, rows * each),
          candidates: [
            wrong(frac(n, rows * each - n), "F4"),
            ...(n < each ? [wrong(frac(n, each), "one-part")] : []),
            wrong(frac(rows * each - n, rows * each), "fraction-other-part"),
            wrong(frac(rows * each, n), "fraction-flip"),
          ],
        }),
      );
      return {
        values: { rows, each, n },
        prompt: `A chocolate bar has ${rows} rows of ${each} equal squares. ${name} eats ${n} squares. What fraction of the bar did ${name} eat?`,
        readAloud: `A chocolate bar has ${rows} rows of ${each} equal squares. ${name} eats ${n} squares. What fraction of the bar did ${name} eat?`,
        answer,
        wrong: w,
      };
    },
  },
  {
    // How many more parts make a whole (3.2: "fractions are numbers that represent an amount").
    id: "g35-3-make-a-whole",
    strand: "F", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.2",
    fill(rng) {
      const d = rng.pick([4, 5, 6, 8, 10]), n = rng.int(1, d - 2);
      const { whole } = rng.pick(WHOLES.filter((w) => w.whole !== "garden"));
      const name = rng.pick(NAMES);
      return {
        values: { d, n },
        prompt: `${name} has ${frac(n, d)} of a ${whole}. How many more ${parts(d)} does ${name} need to make a whole ${whole}?`,
        readAloud: `${name} has ${sayFrac(n, d)} of a ${whole}. How many more ${parts(d)} does ${name} need to make a whole ${whole}?`,
        answer: String(d - n),
        wrong: typedWrong(d - n, [[d, "difference-whole"], [n, "difference-whole"], [d + n, "operation"]]),
      };
    },
  },

  // ---------- Patterns and algebra ----------
  {
    // A missing term in an increasing or decreasing pattern (3.6).
    id: "g35-3-missing-middle",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.6",
    fill(rng) {
      const step = rng.pick([3, 4, 6, 7, 8, 9, 11, 12, 15, 25]), up = rng.int(0, 1) === 1;
      const start = up ? rng.int(2, 60) : rng.int(5 * step, 5 * step + 60);
      const seq = [0, 1, 2, 3, 4].map((i) => (up ? start + i * step : start - i * step));
      const gap = rng.int(1, 3);
      return {
        values: { start, step, up: up ? 1 : 0, gap },
        prompt: `What number is missing? ${seq.map((x, i) => (i === gap ? "?" : x)).join(", ")}`,
        readAloud: `What number is missing from the pattern? ${seq.map((x, i) => (i === gap ? "a missing number" : x)).join(", ")}.`,
        answer: String(seq[gap]),
        wrong: typedWrong(seq[gap], [[seq[gap - 1] + (up ? 1 : -1), "skip-by-one"]]),
      };
    },
  },
  {
    // A doubling pattern (3.6: "generalize what makes the pattern change (doubling, adding 2)"). WNCP and ON grade 3
    // patterns may stay with adding, so the others get 4.
    id: "g35-3-doubling",
    strand: "A", grades: { BC: 3, AB: 4, SK: 4, MB: 4, ON: 4 }, format: "number", whiteboard: false, standard: "3.6",
    fill(rng) {
      const s = rng.int(2, 12), terms = rng.int(4, 5);
      const seq = Array.from({ length: terms }, (_, i) => s * 2 ** i);
      const last = seq[terms - 1], answer = last * 2;
      return {
        values: { s, terms },
        prompt: `What comes next? ${seq.join(", ")}, ?`,
        readAloud: `What number comes next in the pattern? ${seq.join(", ")}.`,
        answer: String(answer),
        wrong: typedWrong(answer, [[last + (last - seq[terms - 2]), "A2"], [last + s, "pattern-first-step"]]),
      };
    },
  },
  {
    // A start-unknown story (3.8; misconception A4).
    id: "g35-3-start-unknown-story",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.8",
    fill(rng) {
      const more = rng.int(0, 1) === 1;
      const start = rng.int(12, 60), change = draw(rng, (r) => r.int(5, 19), (c) => c * 2 !== start);
      const [things, place, there] = rng.pick([
        ["birds", "on a fence", "on the fence"],
        ["apples", "in a bowl", "in the bowl"],
        ["children", "on a bus", "on the bus"],
        ["boats", "at a dock", "at the dock"],
      ] as const);
      if (more) {
        const now = start + change;
        return {
          values: { start, change, more: 1 },
          prompt: `Some ${things} were ${place}. Then ${change} more came. Now there are ${now}. How many ${things} were ${there} at first?`,
          readAloud: `Some ${things} were ${place}. Then ${change} more came. Now there are ${now}. How many ${things} were ${there} at first?`,
          answer: String(start),
          wrong: typedWrong(start, [[now + change, "operation"]]),
        };
      }
      const now = draw(rng, (r) => r.int(3, 40), (x) => x !== change);
      const first = now + change;
      return {
        values: { start: first, change, more: 0 },
        prompt: `Some ${things} were ${place}. Then ${change} went away. Now there are ${now}. How many ${things} were ${there} at first?`,
        readAloud: `Some ${things} were ${place}. Then ${change} went away. Now there are ${now}. How many ${things} were ${there} at first?`,
        answer: String(first),
        wrong: typedWrong(first, [[Math.abs(now - change), "A4"]]),
      };
    },
  },
  {
    // Two equal unknowns (3.8: "even and odd numbers with an unknown").
    id: "g35-3-double-unknown",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.8",
    fill(rng) {
      const k = rng.int(6, 45);
      return {
        values: { k },
        prompt: `? + ? = ${2 * k}. Both missing numbers are the same. What is the missing number?`,
        readAloud: `A missing number plus the same missing number is ${2 * k}. What is the missing number?`,
        answer: String(k),
        wrong: typedWrong(k, [[2 * k, "A1"]]),
      };
    },
  },
  {
    // A change unknown in subtraction (3.8: "12 + n = 20").
    id: "g35-3-subtract-unknown",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.8",
    fill(rng) {
      const a = rng.int(125, 495), b = draw(rng, (r) => r.int(15, a - 15), (b) => 2 * b !== a);
      return {
        values: { a, b },
        prompt: `${a} − ? = ${b}`,
        readAloud: `${a} minus what number is ${b}?`,
        answer: String(a - b),
        wrong: typedWrong(a - b, [[a + b, "operation"]]),
      };
    },
  },
  {
    // Use a pattern rule given in words (3.7: "describe the pattern rule ... using words and numbers").
    id: "g35-3-rule-in-words",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.7",
    fill(rng) {
      const up = rng.int(0, 1) === 1, step = rng.int(3, 9);
      const start = up ? rng.int(2, 20) : rng.int(6 * step, 6 * step + 30);
      const term = (i: number) => (up ? start + (i - 1) * step : start - (i - 1) * step);
      const answer = term(5);
      return {
        values: { start, step, up: up ? 1 : 0 },
        prompt: `A pattern starts at ${start} and ${up ? "adds" : "takes away"} ${step} each time. What is the 5th number in the pattern?`,
        readAloud: `A pattern starts at ${start} and ${up ? "adds" : "takes away"} ${step} each time. What is the 5th number in the pattern?`,
        answer: String(answer),
        wrong: typedWrong(answer, [
          [term(6), "next-not-asked"],
          [term(4), "one-to-one"],
          [up ? 5 * step : start + 4 * step, up ? "A5" : "pattern-direction"],
        ]),
      };
    },
  },
  {
    // Choose the number sentence for a story (3.8: start unknown). Writing a story as an equation is WNCP grade 4
    // (unsure), so the others get 4.
    id: "g35-3-number-sentence",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 2 }, format: "choice", whiteboard: false, standard: "3.8",
    fill(rng) {
      const name = rng.pick(NAMES), thing = rng.pick(["stickers", "cards", "marbles", "beads"]);
      const gave = rng.int(0, 1) === 1;
      const [x, y] = draw(rng, (r) => [r.int(3, 12), r.int(4, 15)], ([x, y]) => x !== y);
      if (gave) {
        return {
          values: { x, y, gave: 1 },
          prompt: `${name} had some ${thing}. ${name} gave away ${x} and has ${y} left. Which number sentence shows this story?`,
          readAloud: `${name} had some ${thing}. ${name} gave away ${x} and has ${y} left. Which number sentence shows this story?`,
          answer: `? − ${x} = ${y}`,
          wrong: [wrong(`${Math.max(x, y)} − ${Math.min(x, y)} = ?`, "A4"), wrong(`? + ${x} = ${y}`, "operation"), wrong(`? − ${x + y} = ${y}`, "story-roles")],
        };
      }
      return {
        values: { x, y, gave: 0 },
        prompt: `${name} had some ${thing}. ${name} got ${x} more and now has ${x + y}. Which number sentence shows this story?`,
        readAloud: `${name} had some ${thing}. ${name} got ${x} more and now has ${x + y}. Which number sentence shows this story?`,
        answer: `? + ${x} = ${x + y}`,
        wrong: [wrong(`${x + y} + ${x} = ?`, "operation"), wrong(`? − ${x} = ${x + y}`, "operation"), wrong(`? + ${x + y} = ${x}`, "operation")],
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    // Capacity units (3.9: mL, L). WNCP relates mL and L in grade 5, so SK, MB and AB get 5; ON is unsure, so 4.
    id: "g35-3-capacity-unit",
    strand: "MG", grades: { BC: 3, AB: 5, SK: 5, MB: 5, ON: 4 }, format: "choice", whiteboard: false, standard: "3.9",
    fill(rng) {
      const [thing, big] = rng.pick([
        ["how much water a bathtub holds", true],
        ["how much water a bucket holds", true],
        ["how much water a swimming pool holds", true],
        ["how much milk a big jug holds", true],
        ["how much medicine fits in a spoon", false],
        ["how much juice a small cup holds", false],
        ["how much water fits in a bottle cap", false],
      ] as const);
      return {
        values: { big: big ? 1 : 0 },
        prompt: `Which unit is best for measuring ${thing}?`,
        readAloud: `Which unit is best for measuring ${thing}?`,
        answer: big ? "Litres" : "Millilitres",
        wrong: [wrong(big ? "Millilitres" : "Litres", "unit-choice"), wrong("Kilograms", "unit-kind"), wrong("Metres", "unit-kind")],
      };
    },
  },
  {
    // Name a solid from its faces (3.11: "identify 3D objects by 2D faces, edges, vertices").
    id: "g35-3-solid-from-faces",
    strand: "MG", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.11",
    fill(rng) {
      const SOLIDS = [
        { name: "Cylinder", clue: "2 flat faces that are circles, and 1 curved surface" },
        { name: "Cone", clue: "1 flat face that is a circle, 1 curved surface and 1 point at the top" },
        { name: "Cube", clue: "6 flat faces, and every face is a square" },
        { name: "Sphere", clue: "1 curved surface and no flat faces" },
        { name: "Square-based pyramid", clue: "1 square face and 4 triangle faces that meet at a point" },
      ];
      const [answer, ...others] = rng.shuffle(SOLIDS);
      return {
        values: { solid: SOLIDS.indexOf(answer) },
        prompt: `I am a solid. I have ${answer.clue}. What am I?`,
        readAloud: `I am a solid. I have ${answer.clue}. What am I?`,
        answer: answer.name,
        wrong: others.slice(0, 3).map((s) => wrong(s.name, "shape-name")),
      };
    },
  },
  {
    // Mass referents (3.9: "estimate with referents"; g, kg).
    id: "g35-3-mass-referent",
    strand: "MG", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.9",
    fill(rng) {
      const kilo = rng.int(0, 1) === 1;
      const LIGHT = ["A paper clip", "A raisin", "A small button"];
      const HEAVY = ["A bag of flour", "A pineapple", "A big dictionary"];
      const answer = rng.pick(kilo ? HEAVY : LIGHT);
      const otherEnd = rng.pick(kilo ? LIGHT : HEAVY);
      const far = rng.shuffle(kilo ? ["A school bus", "A bicycle", "A sofa"] : ["A school bus", "A watermelon", "A desk"]).slice(0, 2);
      return {
        values: { kilo: kilo ? 1 : 0 },
        prompt: `Which one has a mass of about 1 ${kilo ? "kilogram" : "gram"}?`,
        readAloud: `Which one has a mass of about 1 ${kilo ? "kilogram" : "gram"}?`,
        answer,
        wrong: [wrong(otherEnd, "referent-size"), ...far.map((f) => wrong(f, "referent-size"))],
      };
    },
  },
  {
    // Read a tally (3.12: charts and tables). The tally is described in words: tally glyphs read badly.
    id: "g35-3-tally",
    strand: "DP", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.12",
    fill(rng) {
      const bundles = rng.int(2, 6), extra = rng.int(1, 4);
      const pet = rng.pick(["dogs", "cats", "fish", "birds", "rabbits"]);
      const answer = bundles * 5 + extra;
      return {
        values: { bundles, extra },
        prompt: `In a tally chart, each bundle of tally marks shows 5. The row for ${pet} has ${bundles} bundles and ${count(extra, "more mark", "more marks")}. How many children chose ${pet}?`,
        readAloud: `In a tally chart, each bundle of tally marks shows 5. The row for ${pet} has ${bundles} bundles and ${count(extra, "more mark", "more marks")}. How many children chose ${pet}?`,
        answer: String(answer),
        wrong: typedWrong(answer, [[bundles + extra, "count-objects"], [bundles * 4 + extra, "one-to-one"]]),
      };
    },
  },
  {
    // Most and least likely (3.13). WNCP compares likelihood in grade 5.
    id: "g35-3-most-least-likely",
    strand: "DP", grades: { BC: 3, AB: 5, SK: 5, MB: 5, ON: 3 }, format: "choice", whiteboard: false, standard: "3.13",
    fill(rng) {
      const colours = rng.shuffle(["red", "blue", "green", "yellow"]).slice(0, 3);
      const counts = draw(rng, (r) => [r.int(1, 8), r.int(1, 8), r.int(1, 8)], (c) => new Set(c).size === 3);
      const most = rng.int(0, 1) === 1;
      const order = [0, 1, 2].sort((a, b) => counts[b] - counts[a]);
      const [top, mid, low] = order.map((i) => cap(colours[i]));
      const thing = rng.pick(["spinner", "bag"]);
      const desc = thing === "spinner"
        ? `A spinner has ${counts[0] + counts[1] + counts[2]} equal parts: ${colours.map((c, i) => `${counts[i]} ${c}`).join(", ")}.`
        : `A bag has ${colours.map((c, i) => `${count(counts[i], `${c} cube`)}`).join(", ")}. You pick one cube without looking.`;
      const ask = thing === "spinner" ? `Which colour is the spinner ${most ? "most" : "least"} likely to land on?` : `Which colour are you ${most ? "most" : "least"} likely to pick?`;
      return {
        values: { a: counts[0], b: counts[1], c: counts[2], most: most ? 1 : 0 },
        prompt: `${desc} ${ask}`,
        readAloud: `${desc} ${ask}`,
        answer: most ? top : low,
        wrong: [wrong(most ? low : top, most ? "chance-reversed" : "likelihood-reversed"), wrong(mid, "likelihood-order"), wrong("All the colours are equally likely", "D3")],
      };
    },
  },
  {
    // Certain, likely, unlikely, impossible (3.13; misconception D6). WNCP describes likelihood in grade 5.
    id: "g35-3-likelihood-words",
    strand: "DP", grades: { BC: 3, AB: 5, SK: 5, MB: 5, ON: 3 }, format: "choice", whiteboard: false, standard: "3.13",
    fill(rng) {
      const [a, b] = rng.shuffle(["red", "blue", "green", "yellow"]);
      const other = rng.pick(["purple", "orange", "white"]);
      const many = rng.int(6, 12), few = rng.int(1, 2);
      const ask = rng.pick(["likely", "unlikely", "impossible", "certain"] as const);
      const event = { likely: `a ${a} cube`, unlikely: `a ${b} cube`, impossible: `${other === "orange" ? "an" : "a"} ${other} cube`, certain: `a ${a} cube or a ${b} cube` }[ask];
      const CODES = {
        likely: { Certain: "sure-of-possible", Unlikely: "likelihood-reversed", Impossible: "rules-out-possible" },
        unlikely: { Impossible: "D6", Likely: "chance-reversed", Certain: "certain" },
        impossible: { Unlikely: "impossible-possible", Likely: "impossible-possible", Certain: "opposite-extreme" },
        certain: { Likely: "certain-likely", Unlikely: "certain-likely", Impossible: "opposite-extreme" },
      } as const;
      return {
        values: { many, few, ask: ["likely", "unlikely", "impossible", "certain"].indexOf(ask) },
        prompt: `A bag has ${many} ${a} cubes and ${count(few, `${b} cube`)}. You pick one cube without looking. How likely is it that you pick ${event}?`,
        readAloud: `A bag has ${many} ${a} cubes and ${count(few, `${b} cube`)}. You pick one cube without looking. How likely is it that you pick ${event}?`,
        answer: cap(ask),
        wrong: Object.entries(CODES[ask]).map(([word, code]) => wrong(word, code)),
      };
    },
  },
];
