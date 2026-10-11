// Level 2 (BC grade 2) for the grades 1-2 bank: stage 1 for grade 2, and the "up" form for grade 1.
// Standards: curriculum map, section 1 (2.1-2.12); example items: section 3, grade 2. Province tags: see ./index.ts.
import { cap, draw, NAMES, orList, predictShape, row, SHAPES, wrong, type TaggedTemplate } from "../kit";

/** The O1 bug: in each column, the smaller digit from the larger. */
const smallerFromLarger = (a: number, b: number) => Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) * 10 + Math.abs((a % 10) - (b % 10));

export const LEVEL_2: readonly TaggedTemplate[] = [
  // ---------- Number ----------
  {
    id: "2-digit-value",
    strand: "N", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: false, standard: "2.1",
    fill(rng) {
      const tens = rng.int(2, 9), ones = draw(rng, (r) => r.int(1, 9), (o) => o !== tens);
      const n = tens * 10 + ones;
      return {
        values: { n },
        prompt: `What is the value of the ${tens} in ${n}?`,
        readAloud: `What is the value of the digit ${tens} in the number ${n}?`,
        answer: String(tens * 10),
        wrong: [wrong(tens, "N2")],
      };
    },
  },
  {
    id: "2-even-or-odd",
    strand: "N", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "2.1",
    fill(rng) {
      const even = rng.int(0, 1) === 1;
      // The answer's tens digit has the other parity, and both wrong choices have a tens digit of the asked-for parity.
      const make = (tensEven: boolean, onesEven: boolean) =>
        rng.pick(tensEven ? [2, 4, 6, 8] : [1, 3, 5, 7, 9]) * 10 + rng.pick(onesEven ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9]);
      const answer = make(!even, even);
      const [w1, w2] = draw(rng, () => [make(even, !even), make(even, !even)], ([x, y]) => x !== y);
      return {
        values: { answer, w1, w2, even: even ? 1 : 0 },
        prompt: `Which number is ${even ? "even" : "odd"}: ${orList([String(answer), String(w1), String(w2)])}?`,
        readAloud: `Which number is ${even ? "even" : "odd"}: ${orList([String(answer), String(w1), String(w2)])}?`,
        answer: String(answer),
        wrong: [wrong(w1, "even-odd"), wrong(w2, "even-odd")],
      };
    },
  },
  {
    id: "2-ten-more-less",
    strand: "N", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: false, standard: "2.1",
    fill(rng) {
      const more = rng.int(0, 1) === 1;
      const n = more ? rng.int(11, 89) : rng.int(21, 99);
      return {
        values: { n, more: more ? 1 : 0 },
        prompt: `What number is 10 ${more ? "more" : "less"} than ${n}?`,
        readAloud: `What number is 10 ${more ? "more" : "less"} than ${n}?`,
        answer: String(more ? n + 10 : n - 10),
        wrong: [wrong(more ? n + 1 : n - 1, "tens-as-ones")],
      };
    },
  },
  {
    id: "2-greatest",
    strand: "N", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "2.1",
    fill(rng) {
      // Like 31, 29 and 13: 29 has the bigger ones digit, and 13 swaps the digits of 31.
      const [t, o, c] = draw(
        rng,
        (r) => [r.int(2, 9), r.int(1, 8), r.int(2, 9)],
        ([t, o, c]) => o < t && c > o && (t - 1) * 10 + c !== o * 10 + t,
      );
      const answer = t * 10 + o, trap = (t - 1) * 10 + c, swapped = o * 10 + t;
      return {
        values: { answer, trap, swapped },
        prompt: `Which number is the greatest: ${orList([String(answer), String(trap), String(swapped)])}?`,
        readAloud: `Which number is the greatest: ${orList([String(answer), String(trap), String(swapped)])}?`,
        answer: String(answer),
        wrong: [wrong(trap, "digit-compare"), wrong(swapped, "digit-reversal")],
      };
    },
  },
  {
    id: "2-tens-and-ones",
    strand: "N", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.1",
    fill(rng) {
      const tens = rng.int(1, 9), ones = draw(rng, (r) => r.int(1, 9), (o) => o !== tens);
      const parts = rng.int(0, 1) === 1 ? `${tens} tens and ${ones} ones` : `${ones} ones and ${tens} tens`;
      return {
        values: { tens, ones },
        prompt: `What number is ${parts}?`,
        readAloud: `What number is ${parts}?`,
        answer: String(tens * 10 + ones),
        wrong: [wrong(ones * 10 + tens, "digit-reversal"), wrong(tens + ones, "N2")],
      };
    },
  },
  {
    id: "2-skip-count-back",
    strand: "N", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: false, standard: "2.1",
    fill(rng) {
      const step = rng.pick([2, 5, 10]);
      // Backward, from a start that is not always a multiple of 10 (2.1: different starting points).
      const start = step === 10 ? rng.int(51, 99) : step * rng.int(step === 2 ? 10 : 6, step === 2 ? 40 : 19);
      const seq = [0, 1, 2].map((i) => start - i * step);
      const answer = start - 3 * step;
      return {
        values: { step, start },
        prompt: `Count back by ${step}s: ${seq.join(", ")}, ?`,
        readAloud: `Count back by ${step}s: ${seq.join(", ")}. What number comes next?`,
        answer: String(answer),
        wrong: [wrong(seq[2] - 1, "skip-by-one"), wrong(seq[1], "pattern-direction")],
      };
    },
  },
  {
    id: "2-add-2-digit",
    strand: "O", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.4",
    fill(rng) {
      // The ones carry and the sum stays under 100, as in 48 + 37.
      const [a, b] = draw(rng, (r) => [r.int(15, 69), r.int(15, 39)], ([a, b]) => (a % 10) + (b % 10) >= 10 && a + b < 100);
      return {
        values: { a, b },
        prompt: `${a} + ${b} = ?`,
        readAloud: `What is ${a} plus ${b}?`,
        answer: String(a + b),
        wrong: [wrong(a + b - 10, "O3"), wrong(Math.abs(a - b), "operation")],
      };
    },
  },
  {
    id: "2-subtract-2-digit",
    strand: "O", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.4",
    fill(rng) {
      // The ones need regrouping, as in 83 - 46. A gap of 5 in the ones would make two wrong answers the same.
      const [a, b] = draw(
        rng,
        (r) => [r.int(41, 98), r.int(12, 39)],
        ([a, b]) => a % 10 < b % 10 && (b % 10) - (a % 10) !== 5 && a - b >= 10,
      );
      return {
        values: { a, b },
        prompt: `${a} − ${b} = ?`,
        readAloud: `What is ${a} minus ${b}?`,
        answer: String(a - b),
        wrong: [wrong(smallerFromLarger(a, b), "O1"), wrong(a - b + 10, "regroup-forget")],
      };
    },
  },
  {
    id: "2-story-add-2-digit",
    strand: "O", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.4",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(15, 59), r.int(15, 39)], ([a, b]) => (a % 10) + (b % 10) >= 10 && a + b < 100 && a !== b);
      const [things, first, second] = rng.pick([
        ["cans", "on Monday", "on Tuesday"],
        ["books", "in the morning", "in the afternoon"],
        ["seeds", "in one pot", "in another pot"],
      ] as const);
      return {
        values: { a, b },
        prompt: `A class collects ${a} ${things} ${first} and ${b} ${things} ${second}. How many ${things} is that in all?`,
        readAloud: `A class collects ${a} ${things} ${first} and ${b} ${things} ${second}. How many ${things} is that in all?`,
        answer: String(a + b),
        wrong: [wrong(a + b - 10, "O3"), wrong(Math.abs(a - b), "operation")],
      };
    },
  },
  {
    id: "2-story-subtract-2-digit",
    strand: "O", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.4",
    fill(rng) {
      const [a, b] = draw(
        rng,
        (r) => [r.int(41, 95), r.int(12, 38)],
        ([a, b]) => a % 10 < b % 10 && a - b >= 10,
      );
      const name = rng.pick(NAMES);
      return {
        values: { a, b },
        prompt: `A book has ${a} pages. ${name} has read ${b} pages. How many pages are left to read?`,
        readAloud: `A book has ${a} pages. ${name} has read ${b} pages. How many pages are left to read?`,
        answer: String(a - b),
        wrong: [wrong(smallerFromLarger(a, b), "O1"), wrong(a + b, "operation")],
      };
    },
  },
  {
    // Money (2.12; map, grade 2, without pennies, which Canada no longer makes). WNCP has no coin outcomes before grade 4.
    id: "2-coins-mixed",
    strand: "O", grades: { BC: 2, AB: 4, SK: 4, MB: 4, ON: 2 }, format: "number", whiteboard: true, standard: "2.12",
    fill(rng) {
      const [q, d, n] = draw(
        rng,
        (r) => [r.int(0, 3), r.int(1, 4), r.int(0, 3)],
        ([q, d, n]) => q + n > 0 && 25 * q + 10 * d + 5 * n < 100,
      );
      const parts = [
        q ? `${q} ${q === 1 ? "quarter" : "quarters"}` : "",
        `${d} ${d === 1 ? "dime" : "dimes"}`,
        n ? `${n} ${n === 1 ? "nickel" : "nickels"}` : "",
      ].filter(Boolean);
      const list = parts.length === 2 ? parts.join(" and ") : `${parts[0]}, ${parts[1]} and ${parts[2]}`;
      const name = rng.pick(NAMES);
      return {
        values: { q, d, n },
        prompt: `${name} has ${list}. A quarter is 25 cents, a dime is 10 cents and a nickel is 5 cents. How many cents is that in all?`,
        readAloud: `${name} has ${list}. A quarter is 25 cents, a dime is 10 cents, and a nickel is 5 cents. How many cents is that in all?`,
        answer: String(25 * q + 10 * d + 5 * n),
        wrong: [wrong(q + d + n, "coin-count")],
      };
    },
  },
  {
    // Making ten (2.3: strategies for facts to 20).
    id: "2-make-ten-strategy",
    strand: "O", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: true, standard: "2.3",
    fill(rng) {
      const a = rng.pick([8, 9]), b = rng.int(4, 9);
      const moved = 10 - a;
      return {
        values: { a, b },
        prompt: `Which is the same as ${a} + ${b}?`,
        readAloud: `Which is the same as ${a} plus ${b}: ${orList([`10 plus ${b - moved}`, `10 plus ${b}`, `10 plus ${b + 1}`])}?`,
        answer: `10 + ${b - moved}`,
        wrong: [wrong(`10 + ${b}`, "compensation"), wrong(`10 + ${b + 1}`, "compensation")],
      };
    },
  },

  // ---------- Patterns and algebra ----------
  {
    // Equality with symbols (2.7; map, grade 2: 8 + 5 = __ + 6). WNCP solves equations with a symbol for the unknown in grade 3.
    id: "2-balance-equation",
    strand: "A", grades: { BC: 2, AB: 3, SK: 3, MB: 3, ON: 2 }, format: "number", whiteboard: true, standard: "2.7",
    fill(rng) {
      const [a, b, c] = draw(rng, (r) => [r.int(4, 9), r.int(3, 9), r.int(2, 8)], ([a, b, c]) => a + b - c >= 1 && c !== a && c !== b);
      return {
        values: { a, b, c },
        prompt: `${a} + ${b} = ? + ${c}`,
        readAloud: `${a} plus ${b} is the same as what number plus ${c}?`,
        answer: String(a + b - c),
        wrong: [wrong(a + b, "A1"), wrong(a + b + c, "A1")],
      };
    },
  },
  {
    // The unknown on the left of the equal sign (2.6; map, grade 2: 14 = __ + 9).
    id: "2-missing-left",
    strand: "A", grades: { BC: 2, AB: 3, SK: 3, MB: 3, ON: 2 }, format: "number", whiteboard: true, standard: "2.6",
    fill(rng) {
      const sum = rng.int(11, 18), b = rng.int(3, 9);
      return {
        values: { sum, b },
        prompt: `${sum} = ? + ${b}`,
        readAloud: `${sum} is the same as what number plus ${b}?`,
        answer: String(sum - b),
        wrong: [wrong(sum + b, "A1"), wrong(sum - b + 1, "count-start")],
      };
    },
  },
  {
    id: "2-missing-addend",
    strand: "A", grades: { BC: 2, AB: 3, SK: 3, MB: 3, ON: 2 }, format: "number", whiteboard: true, standard: "2.6",
    fill(rng) {
      // Bridging 10, as in 6 + ? = 14.
      const [a, sum] = draw(rng, (r) => [r.int(3, 9), r.int(11, 18)], ([a, sum]) => sum - a >= 3 && sum - a <= 9);
      return {
        values: { a, sum },
        prompt: `${a} + ? = ${sum}`,
        readAloud: `${a} plus what number makes ${sum}?`,
        answer: String(sum - a),
        wrong: [wrong(sum + a, "operation"), wrong(sum - a + 1, "count-start")],
      };
    },
  },
  {
    id: "2-increasing-pattern",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: false, standard: "2.5",
    fill(rng) {
      const step = rng.pick([2, 5, 10]);
      // Start off the multiples, as in 3, 5, 7, 9 or 4, 14, 24, 34.
      const start = draw(rng, (r) => r.int(1, step === 10 ? 9 : 20), (s) => s % step !== 0);
      const seq = [0, 1, 2, 3].map((i) => start + i * step);
      return {
        values: { step, start },
        prompt: `What comes next? ${seq.join(", ")}, ?`,
        readAloud: `What number comes next? ${seq.join(", ")}.`,
        answer: String(start + 4 * step),
        wrong: [wrong(seq[3] + 1, "skip-by-one"), wrong(seq[3], "A2")],
      };
    },
  },
  {
    // Finding the core of a repeating pattern (2.5 elaboration: identify the core).
    id: "2-pattern-core",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "2.5",
    fill(rng) {
      const [x, y, z] = rng.shuffle([...SHAPES]);
      const cores = [[x, y, y], [x, x, y], [x, y, z], [x, y, y, z], [x, x, y, z]];
      const c = rng.int(0, cores.length - 1);
      const core = cores[c];
      const shown = [...core, ...core, ...core];
      const glyphs = (items: readonly (typeof x)[]) => items.map((s) => s.glyph).join(" ");
      // A core one item short, and one with an extra item, both look plausible to a child who has not found the repeat.
      const short = core.slice(0, -1), long = [...core, core[0]];
      return {
        values: { core: c },
        prompt: `What part of this pattern repeats? ${glyphs(shown)}`,
        readAloud: `Look at the pattern: ${shown.map((s) => s.word).join(", ")}. What part of the pattern repeats?`,
        answer: glyphs(core),
        wrong: [wrong(glyphs(short), "pattern-core"), wrong(glyphs(long), "pattern-core")],
      };
    },
  },
  {
    id: "2-change-unknown",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.6",
    fill(rng) {
      const total = rng.int(11, 18), left = rng.int(3, total - 3);
      const [thing, place, verb] = rng.pick([
        ["frogs", "on a log", "hopped away"],
        ["birds", "in a tree", "flew away"],
        ["ducks", "in a pond", "swam away"],
      ] as const);
      return {
        values: { total, left },
        prompt: `There were ${total} ${thing} ${place}. Some ${verb}. Now there are ${left}. How many ${thing} ${verb}?`,
        readAloud: `There were ${total} ${thing} ${place}. Some ${verb}. Now there are ${left}. How many ${thing} ${verb}?`,
        answer: String(total - left),
        wrong: [wrong(total + left, "operation"), wrong(total - left + 1, "count-start")],
      };
    },
  },
  {
    // An increasing pattern asked a few steps ahead (2.5).
    id: "2-pattern-rows",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.5",
    fill(rng) {
      const first = rng.int(1, 3), step = rng.int(1, 3), ask = rng.int(5, 6);
      const rows = [1, 2, 3].map((r) => `Row ${r}: ${row(first + (r - 1) * step)}`);
      return {
        values: { first, step, ask },
        prompt: `Each row has ${step} more ${step === 1 ? "dot" : "dots"} than the row before. ${rows.join(". ")}. How many dots will row ${ask} have?`,
        readAloud: `Row 1 has ${first} ${first === 1 ? "dot" : "dots"}. Each row has ${step} more ${step === 1 ? "dot" : "dots"} than the row before. How many dots will row ${ask} have?`,
        answer: String(first + (ask - 1) * step),
        wrong: [wrong(first + 3 * step, "next-not-asked")],
      };
    },
  },
  {
    // Predicting a far item in a repeating pattern of numbers (2.5: complex repeating patterns).
    id: "2-number-pattern-predict",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: true, standard: "2.5",
    fill(rng) {
      const core = rng.shuffle([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
      const ask = rng.int(8, 15);
      const at = (position: number) => core[(position - 1) % 3];
      // The two other numbers of the core are the items just before and after: losing count by one lands there.
      return {
        values: { a: core[0], b: core[1], c: core[2], ask },
        prompt: `The pattern keeps going: ${[...core, ...core].join(", ")}, … What number is number ${ask} in the pattern?`,
        readAloud: `The pattern is ${[...core, ...core].join(", ")}, and it keeps going. What number is number ${ask} in the pattern?`,
        answer: String(at(ask)),
        wrong: [wrong(at(ask - 1), "one-to-one"), wrong(at(ask + 1), "one-to-one")],
      };
    },
  },
  {
    id: "2-shape-pattern-predict",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: true, standard: "2.5",
    fill(rng) {
      const [x, y, z] = rng.shuffle([0, 1, 2, 3]);
      const cores = [[x, y, y], [x, y, z], [x, x, y, y], [x, y, y, z]];
      const c = rng.int(0, cores.length - 1);
      const ask = rng.int(10, 16);
      return { values: { x, y, z, core: c, ask }, ...predictShape(rng, cores[c], ask) };
    },
  },
  {
    // The equal sign between two expressions (2.7; misconception A1).
    id: "2-true-equation",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "2.7",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(6, 9), r.int(4, 9)], ([a, b]) => a + b >= 11 && a !== b);
      const sum = a + b, extra = rng.int(1, 3);
      const right = `${a} + ${b} = 10 + ${sum - 10}`;
      const running = `${a} + ${b} = ${sum} + ${extra}`; // reads "=" as "the answer comes next"
      const offByOne = `${a} + ${b} = 10 + ${sum - 9}`; // makes a ten but does not take it from the other number
      const say = (e: string) => e.replace(/\+/g, "plus").replace("=", "is the same as");
      return {
        values: { a, b, extra },
        prompt: "Which is true?",
        readAloud: `Which is true? ${orList([right, running, offByOne].map(say))}?`,
        answer: right,
        wrong: [wrong(running, "A1"), wrong(offByOne, "compensation")],
      };
    },
  },
  {
    // A missing number inside an increasing pattern (2.5).
    id: "2-missing-in-pattern",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: false, standard: "2.5",
    fill(rng) {
      const step = rng.pick([2, 5, 10]);
      const start = step * rng.int(1, step === 10 ? 5 : 8) + (step === 10 ? rng.int(1, 9) : 0);
      const gap = rng.int(1, 3);
      const seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
      const show = (blank: string) => seq.map((v, i) => (i === gap ? blank : String(v))).join(", ");
      return {
        values: { step, start, gap },
        prompt: `What number is missing? ${show("?")}`,
        readAloud: `What number is missing? ${show("what number")}.`,
        answer: String(seq[gap]),
        wrong: [wrong(seq[gap - 1] + 1, "skip-by-one"), wrong(seq[4] + step, "next-not-asked")],
      };
    },
  },
  {
    // Change unknown, adding (2.6), crossing a ten.
    id: "2-change-unknown-add",
    strand: "A", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.6",
    fill(rng) {
      const [start, more] = draw(rng, (r) => [r.int(11, 25), r.int(4, 9)], ([s, m]) => (s % 10) + m >= 10);
      const [who, where, verb] = rng.pick([
        ["children", "in the pool", "jumped in"],
        ["people", "on a train", "got on"],
        ["cars", "in a parking lot", "drove in"],
      ] as const);
      return {
        values: { start, more },
        prompt: `There were ${start} ${who} ${where}. Some more ${verb}. Now there are ${start + more}. How many ${verb}?`,
        readAloud: `There were ${start} ${who} ${where}. Some more ${verb}. Now there are ${start + more}. How many ${verb}?`,
        answer: String(more),
        wrong: [wrong(start + start + more, "operation"), wrong(more + 1, "count-start")],
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    // Centimetres on a ruler (2.8; map, grade 2). WNCP measures in cm and m in grade 3.
    id: "2-ruler-length",
    strand: "MG", grades: { BC: 2, AB: 3, SK: 3, MB: 3, ON: 2 }, format: "number", whiteboard: true, standard: "2.8",
    fill(rng) {
      const start = rng.int(2, 6), end = start + rng.int(4, 9);
      const thing = rng.pick(["pencil", "crayon", "leaf", "key"]);
      return {
        values: { start, end },
        prompt: `A ${thing} starts at the ${start} cm mark of a ruler and ends at the ${end} cm mark. How long is the ${thing}, in cm?`,
        readAloud: `A ${thing} starts at the ${start} centimetre mark of a ruler and ends at the ${end} centimetre mark. How many centimetres long is the ${thing}?`,
        answer: String(end - start),
        wrong: [wrong(end, "M1"), wrong(end - start + 1, "N4")],
      };
    },
  },
  {
    // Lengths in metres or centimetres (2.8). WNCP uses standard units in grade 3.
    id: "2-length-unit",
    strand: "MG", grades: { BC: 2, AB: 3, SK: 3, MB: 3, ON: 2 }, format: "choice", whiteboard: false, standard: "2.8",
    fill(rng) {
      const big = rng.int(0, 1) === 1;
      const thing = big ? rng.pick(["a classroom", "a hallway", "a school bus"]) : rng.pick(["a pencil", "a spoon", "a crayon"]);
      const [answer, other, odd] = big ? ["Metres", "Centimetres", "Grams"] : ["Centimetres", "Metres", "Litres"];
      return {
        values: { big: big ? 1 : 0 },
        prompt: `Which unit is best for measuring the length of ${thing}?`,
        readAloud: `Which unit is best for measuring the length of ${thing}: ${orList([answer, other, odd].map((u) => u.toLowerCase()))}?`,
        answer,
        wrong: [wrong(other, "unit-choice"), wrong(odd, "unit-kind")],
      };
    },
  },
  {
    id: "2-square-or-rectangle",
    strand: "MG", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "2.9",
    fill(rng) {
      const square = "■ square", rectangle = "▬ rectangle", triangle = "▲ triangle";
      const askSquare = rng.int(0, 1) === 1;
      const question = askSquare
        ? "Which shape has 4 sides that are all the same length and 4 square corners?"
        : "Which shape has 4 square corners, 2 long sides and 2 short sides?";
      return {
        values: { askSquare: askSquare ? 1 : 0 },
        prompt: question,
        readAloud: `${question} A square, a rectangle, or a triangle?`,
        answer: askSquare ? square : rectangle,
        wrong: [wrong(askSquare ? rectangle : square, "square-rectangle"), wrong(triangle, "shape-name")],
      };
    },
  },
  {
    // A shape keeps its name when it is turned (2.9; misconception M4).
    id: "2-turned-shape",
    strand: "MG", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "2.9",
    fill(rng) {
      const square = rng.int(0, 1) === 1;
      return square
        ? {
            values: { square: 1 },
            prompt: "A square is turned so it stands on one corner, like this: ◆. What shape is it now?",
            readAloud: "A square is turned so it stands on one corner. What shape is it now: still a square, a diamond and not a square, or a triangle?",
            answer: "Still a square",
            wrong: [wrong("A diamond, not a square", "M4"), wrong("A triangle", "shape-name")],
          }
        : {
            values: { square: 0 },
            prompt: "A triangle is turned upside down, like this: ▼. What shape is it now?",
            readAloud: "A triangle is turned upside down. What shape is it now: still a triangle, not a triangle because it is upside down, or a square?",
            answer: "Still a triangle",
            wrong: [wrong("Not a triangle, because it is upside down", "M4"), wrong("A square", "shape-name")],
          };
    },
  },
  {
    // Flat shapes as faces of solids (2.9). WNCP compares 2D shapes with parts of 3D objects in grade 1.
    id: "2-face-of-solid",
    strand: "MG", grades: { BC: 2, AB: 1, SK: 1, MB: 1, ON: 2 }, format: "choice", whiteboard: false, standard: "2.9",
    fill(rng) {
      const options = [
        ["the flat bottom of a can", "● circle"],
        ["each face of a box shaped like a cube", "■ square"],
        ["the flat bottom of a cone, like a party hat", "● circle"],
        ["the bottom of a pyramid with a square base", "■ square"],
      ] as const;
      const i = rng.int(0, options.length - 1);
      const [part, answer] = options[i];
      const all = ["● circle", "■ square", "▲ triangle"];
      const others = all.filter((s) => s !== answer);
      return {
        values: { solid: i },
        prompt: `What shape is ${part}?`,
        readAloud: `What shape is ${part}: a circle, a square, or a triangle?`,
        answer,
        wrong: others.map((s) => wrong(s, "shape-name")),
      };
    },
  },
  {
    // Sorting solids by two attributes (2.9).
    id: "2-roll-and-stack",
    strand: "MG", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "2.9",
    fill(rng) {
      const can = "A can (a cylinder)", ball = "A ball (a sphere)", box = "A box (a cube)";
      const both = rng.int(0, 1) === 1;
      return both
        ? {
            values: { both: 1 },
            prompt: "Which one can roll and can also be stacked?",
            readAloud: "Which one can roll and can also be stacked: a can, a ball, or a box?",
            answer: can,
            wrong: [wrong(ball, "one-attribute"), wrong(box, "one-attribute")],
          }
        : {
            values: { both: 0 },
            prompt: "Which one can be stacked but cannot roll?",
            readAloud: "Which one can be stacked but cannot roll: a can, a ball, or a box?",
            answer: box,
            wrong: [wrong(can, "one-attribute"), wrong(ball, "roll-slide")],
          };
    },
  },
  {
    // Picture graphs (2.10; map, grade 2: how many pets in all).
    id: "2-graph-in-all",
    strand: "DP", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: false, standard: "2.10",
    fill(rng) {
      const [a, b, c] = draw(rng, (r) => r.shuffle([2, 3, 4, 5, 6, 7]).slice(0, 3), ([a, b, c]) => a + b + c <= 18);
      const total = a + b + c, largest = Math.max(a, b, c), smallest = Math.min(a, b, c);
      const [x, y, z] = rng.pick([["Dogs", "Cats", "Fish"], ["Red", "Blue", "Green"], ["Soccer", "Hockey", "Swimming"]] as const);
      return {
        values: { a, b, c },
        prompt: `Each ● is 1 child. ${x}: ${row(a)}. ${y}: ${row(b)}. ${z}: ${row(c)}. How many children are on the graph in all?`,
        readAloud: `Each dot is one child. How many children are on the graph in all?`,
        answer: String(total),
        wrong: [wrong(largest, "one-part"), wrong(total - smallest, "one-part")],
      };
    },
  },
  {
    id: "2-graph-fewer",
    strand: "DP", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.10",
    fill(rng) {
      // The difference never equals the smaller count, so the coded wrong answer stays wrong.
      const [more, fewer] = draw(rng, (r) => [r.int(6, 12), r.int(2, 10)], ([m, f]) => f <= m - 2 && m !== 2 * f);
      const [x, y] = rng.pick([["apples", "pears"], ["hockey", "soccer"], ["summer", "winter"]] as const);
      return {
        values: { more, fewer },
        prompt: `Each ★ is 1 child. ${cap(x)}: ${row(more, "★")}. ${cap(y)}: ${row(fewer, "★")}. How many fewer children chose ${y} than ${x}?`,
        readAloud: `Each star is one child. Look at the stars for ${x} and for ${y}. How many fewer children chose ${y} than ${x}?`,
        answer: String(more - fewer),
        wrong: [wrong(more + fewer, "operation"), wrong(fewer, "difference-whole")],
      };
    },
  },
  {
    // Spinner (2.11; map, grade 2). WNCP starts likelihood in grade 5.
    id: "2-spinner",
    strand: "DP", grades: { BC: 2, AB: 5, SK: 5, MB: 5, ON: 2 }, format: "choice", whiteboard: false, standard: "2.11",
    fill(rng) {
      const [x, y] = rng.shuffle(["red", "blue", "green", "yellow"]);
      const many = rng.int(2, 5);
      return {
        values: { many },
        prompt: `A spinner has ${many} equal ${x} parts and 1 equal ${y} part. Which colour is it more likely to land on?`,
        readAloud: `A spinner has ${many} equal ${x} parts and 1 equal ${y} part. Which colour is it more likely to land on: ${x}, ${y}, or are they equally likely?`,
        answer: cap(x),
        wrong: [wrong(cap(y), "chance-reversed"), wrong(`${cap(x)} and ${y} are equally likely`, "D3")],
      };
    },
  },
  {
    // Certain or uncertain (2.11). Ontario uses impossible, possible and certain in grade 1; WNCP starts in grade 5.
    id: "2-certain-possible",
    strand: "DP", grades: { BC: 2, AB: 5, SK: 5, MB: 5, ON: 1 }, format: "choice", whiteboard: false, standard: "2.11",
    fill(rng) {
      const [x, y] = rng.shuffle(["green", "red", "blue", "yellow"]);
      const kind = rng.int(0, 2);
      const bag = kind === 2 ? `${x} cubes and ${y} cubes` : `only ${x} cubes`;
      const pick = kind === 0 ? x : y;
      const answer = ["Certain", "Impossible", "Possible, but not certain"][kind];
      const coded = [
        [wrong("Possible, but not certain", "certain-likely"), wrong("Impossible", "chance-reversed")],
        [wrong("Possible, but not certain", "impossible-possible"), wrong("Certain", "chance-reversed")],
        [wrong("Impossible", "D6"), wrong("Certain", "certain")],
      ][kind];
      return {
        values: { kind },
        prompt: `A bag has ${bag}. You pick one cube without looking. Is it certain, possible or impossible that it is ${pick}?`,
        readAloud: `A bag has ${bag}. You pick one cube without looking. Is it certain, possible but not certain, or impossible that it is ${pick}?`,
        answer,
        wrong: coded,
      };
    },
  },
  {
    // Comparing two lengths in centimetres (2.8 with 2.4). WNCP measures in cm in grade 3.
    id: "2-compare-lengths",
    strand: "MG", grades: { BC: 2, AB: 3, SK: 3, MB: 3, ON: 2 }, format: "number", whiteboard: true, standard: "2.8",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(25, 60), r.int(12, 40)], ([a, b]) => a - b >= 10);
      const [x, y] = rng.shuffle(["red", "blue", "green", "yellow"]);
      return {
        values: { a, b },
        prompt: `A ${x} ribbon is ${a} cm long. A ${y} ribbon is ${b} cm long. How much longer is the ${x} ribbon, in cm?`,
        readAloud: `A ${x} ribbon is ${a} centimetres long. A ${y} ribbon is ${b} centimetres long. How many centimetres longer is the ${x} ribbon?`,
        answer: String(a - b),
        wrong: [wrong(a + b, "operation"), wrong(a, "difference-whole")],
      };
    },
  },
  {
    // Sides of several shapes (2.9: triangles, squares and rectangles).
    id: "2-sides-in-all",
    strand: "MG", grades: { BC: 2, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "number", whiteboard: true, standard: "2.9",
    fill(rng) {
      const triangles = rng.int(1, 3), squares = rng.int(1, 2), rectangles = rng.int(0, 1);
      const parts = [
        `${triangles} ${triangles === 1 ? "triangle" : "triangles"}`,
        `${squares} ${squares === 1 ? "square" : "squares"}`,
        rectangles ? "1 rectangle" : "",
      ].filter(Boolean);
      const list = parts.length === 2 ? parts.join(" and ") : `${parts[0]}, ${parts[1]} and ${parts[2]}`;
      const glyphs = [row(triangles, "▲"), row(squares, "■"), rectangles ? "▬" : ""].filter(Boolean).join(" ");
      return {
        values: { triangles, squares, rectangles },
        prompt: `How many sides do ${list} have in all? ${glyphs}`,
        readAloud: `How many sides do ${list} have in all?`,
        answer: String(3 * triangles + 4 * squares + 4 * rectangles),
        wrong: [wrong(triangles + squares + rectangles, "count-objects")],
      };
    },
  },
];

