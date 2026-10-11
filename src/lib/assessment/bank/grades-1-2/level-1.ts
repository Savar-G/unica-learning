// Level 1 (BC grade 1) for the grades 1-2 bank: stage 1 for grade 1, and the "down" form for grade 2.
// Standards: curriculum map, section 1 (1.1-1.11); example items: section 3, grade 1. Province tags: see ./index.ts.
import { cap, draw, GAP, NAMES, orderClues, orList, predictShape, row, sayLetters, skipWord, SHAPES, shapeQuestion, twoNames, wrong, type TaggedTemplate } from "../kit";
import type { Filled } from "../../types";

const THINGS = ["stickers", "marbles", "shells", "crayons", "beads"] as const;

export const LEVEL_1: readonly TaggedTemplate[] = [
  // ---------- Number ----------
  {
    id: "1-ten-and-more",
    strand: "N", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "1.1",
    fill(rng) {
      const ones = rng.int(2, 9);
      return {
        values: { ones },
        prompt: `Which number is 10 and ${ones} more?`,
        readAloud: `Which number is 10 and ${ones} more: ${orList(rng, [`1${ones}`, `${ones}1`, `10${ones}`])}?`,
        answer: `1${ones}`,
        wrong: [wrong(`${ones}1`, "digit-reversal"), wrong(`10${ones}`, "N1")],
      };
    },
  },
  {
    id: "1-skip-count",
    strand: "N", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: false, standard: "1.1",
    fill(rng) {
      // BC 1.1 skip-counts by 2s and 5s (10s come in 2.1). Start at a multiple of the step; by 2s stay within 20,
      // by 5s go up to 30 (map, grade 1: 5, 10, __, 20).
      const step = rng.pick([2, 5]);
      const start = step * rng.int(1, step === 2 ? 7 : 3);
      const gap = rng.int(2, 3);
      const seq = [0, 1, 2, 3].map((i) => start + i * step);
      const show = (blank: string) => seq.map((v, i) => (i === gap ? blank : String(v))).join(", ");
      return {
        values: { step, start, gap },
        prompt: `Count by ${step}s: ${show("?")}`,
        readAloud: `Count by ${skipWord(step)}. ${show("what number")}. What is the missing number?`,
        answer: String(seq[gap]),
        wrong: [wrong(seq[gap - 1] + 1, "skip-by-one")],
      };
    },
  },
  {
    id: "1-smallest-biggest",
    strand: "N", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "1.1",
    fill(rng): Filled {
      if (rng.int(0, 1) === 0) {
        // Smallest: a one-digit number beside two teens. A child who reads only the first digit thinks the teen is smaller.
        const single = rng.int(5, 9), teen = rng.int(10, 14), big = rng.int(15, 20);
        const list = orList(rng, [single, teen, big].map(String));
        return {
          values: { single, teen, big, smallest: 1 },
          prompt: `Which number is the smallest: ${list}?`,
          readAloud: `Which number is the smallest: ${list}?`,
          answer: String(single),
          wrong: [wrong(teen, "digit-compare"), wrong(big, "more-less")],
        };
      }
      // Biggest: a big one-digit number tempts a child who compares first digits.
      const single = rng.int(7, 9), small = rng.int(2, 5), teen = rng.int(11, 16);
      const list = orList(rng, [single, small, teen].map(String));
      return {
        values: { single, teen, small, smallest: 0 },
        prompt: `Which number is the biggest: ${list}?`,
        readAloud: `Which number is the biggest: ${list}?`,
        answer: String(teen),
        wrong: [wrong(single, "digit-compare"), wrong(small, "more-less")],
      };
    },
  },
  {
    id: "1-more-or-less",
    strand: "N", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: false, standard: "1.1",
    fill(rng) {
      const by = rng.pick([1, 2]), more = rng.int(0, 1) === 1;
      const n = more ? rng.int(5, 18) : rng.int(5, 20);
      const answer = more ? n + by : n - by;
      const coded = [wrong(more ? n - by : n + by, "more-less")];
      // Counting 2 back from 14 as "14, 13" lands on 13.
      if (by === 2) coded.push(wrong(more ? n + 1 : n - 1, "count-start"));
      return {
        values: { n, by, more: more ? 1 : 0 },
        prompt: `What number is ${by} ${more ? "more" : "less"} than ${n}?`,
        readAloud: `What number is ${by} ${more ? "more" : "less"} than ${n}?`,
        answer: String(answer),
        wrong: coded,
      };
    },
  },
  {
    id: "1-make-ten",
    strand: "N", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.2",
    fill(rng) {
      const a = rng.int(1, 9);
      return {
        values: { a },
        prompt: `${a} and how many more make 10?`,
        readAloud: `${a} and how many more make 10?`,
        answer: String(10 - a),
        wrong: [wrong(10 + a, "operation"), wrong(11 - a, "count-start")],
      };
    },
  },
  {
    // Money (1.11): counting coins of one kind. WNCP has no coin outcomes before grade 4; Ontario counts coins from grade 2.
    id: "1-count-coins",
    strand: "N", grades: { BC: 1, AB: 4, SK: 4, MB: 4, ON: 2 }, format: "number", whiteboard: true, standard: "1.11",
    fill(rng) {
      const [coin, cents, most] = rng.pick([["nickels", 5, 6], ["dimes", 10, 9]] as const);
      const n = rng.int(2, most);
      const name = rng.pick(NAMES);
      return {
        values: { n, cents },
        prompt: `${name} has ${n} ${coin}. Each one is worth ${cents} cents. How many cents is that in all?`,
        readAloud: `${name} has ${n} ${coin}. Each one is worth ${cents} cents. How many cents is that in all?`,
        answer: String(n * cents),
        wrong: [wrong(n, "coin-count"), wrong(n + cents, "operation")],
      };
    },
  },
  {
    id: "1-add-to-20",
    strand: "O", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.3",
    fill(rng) {
      // The sum bridges 10, so the child has to make a ten or count on past it.
      const [a, b] = draw(rng, (r) => [r.int(3, 9), r.int(3, 9)], ([a, b]) => a + b >= 11 && a !== b);
      return {
        values: { a, b },
        prompt: `${a} + ${b} = ?`,
        readAloud: `What is ${a} plus ${b}?`,
        answer: String(a + b),
        wrong: [wrong(a + b - 1, "count-start"), wrong(Math.abs(a - b), "operation")],
      };
    },
  },
  {
    id: "1-subtract-from-20",
    strand: "O", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.3",
    fill(rng) {
      // Subtracting crosses 10, as in 14 - 6.
      const [a, b] = draw(rng, (r) => [r.int(11, 18), r.int(3, 9)], ([a, b]) => a - b < 10 && a - b >= 2);
      return {
        values: { a, b },
        prompt: `${a} − ${b} = ?`,
        readAloud: `What is ${a} minus ${b}?`,
        answer: String(a - b),
        wrong: [wrong(a - b + 1, "count-start"), wrong(a + b, "operation")],
      };
    },
  },
  {
    id: "1-story-add",
    strand: "O", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.3",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(4, 9), r.int(3, 9)], ([a, b]) => a + b >= 11 && a !== b);
      const name = rng.pick(NAMES), thing = rng.pick(THINGS);
      return {
        values: { a, b },
        prompt: `${name} has ${a} ${thing} and gets ${b} more. How many ${thing} does ${name} have now?`,
        readAloud: `${name} has ${a} ${thing} and gets ${b} more. How many ${thing} does ${name} have now?`,
        answer: String(a + b),
        wrong: [wrong(Math.abs(a - b), "operation"), wrong(a + b - 1, "count-start")],
      };
    },
  },
  {
    id: "1-story-take",
    strand: "O", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.3",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(11, 18), r.int(3, 9)], ([a, b]) => a - b >= 2 && a - b <= 12);
      const name = rng.pick(NAMES), thing = rng.pick(THINGS);
      return {
        values: { a, b },
        prompt: `${name} has ${a} ${thing} and gives away ${b}. How many ${thing} does ${name} have left?`,
        readAloud: `${name} has ${a} ${thing} and gives away ${b}. How many ${thing} does ${name} have left?`,
        answer: String(a - b),
        wrong: [wrong(a + b, "operation"), wrong(a - b + 1, "count-start")],
      };
    },
  },
  {
    id: "1-story-compare",
    strand: "O", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.3",
    fill(rng) {
      const a = rng.int(8, 15), b = rng.int(3, a - 2);
      const [nameA, nameB] = twoNames(rng);
      return {
        values: { a, b },
        prompt: `${nameA} has ${a} toy cars. ${nameB} has ${b} toy cars. How many more toy cars does ${nameA} have than ${nameB}?`,
        readAloud: `${nameA} has ${a} toy cars. ${nameB} has ${b} toy cars. How many more toy cars does ${nameA} have than ${nameB}?`,
        answer: String(a - b),
        wrong: [wrong(a + b, "operation"), wrong(a, "difference-whole")],
      };
    },
  },

  // ---------- Patterns and algebra ----------
  {
    id: "1-pattern-four",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "1.4",
    fill(rng) {
      // Cores of 4 with repeats, such as A A B B or A B C C.
      const [x, y, z] = rng.shuffle([0, 1, 2, 3]);
      const cores = [[x, x, y, y], [x, y, y, y], [x, x, y, z], [x, y, z, z]];
      const c = rng.int(0, cores.length - 1);
      const length = rng.int(6, 9);
      return { values: { x, y, z, core: c, length }, ...shapeQuestion(rng, cores[c], length) };
    },
  },
  {
    id: "1-pattern-missing",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "1.4",
    fill(rng) {
      const [x, y, z] = rng.shuffle([0, 1, 2, 3]);
      const core = rng.pick([[x, y], [x, y, z], [x, x, y]]);
      const length = rng.int(6, 8), gap = rng.int(2, length - 2);
      return { values: { x, y, z, length, gap, size: core.length }, ...shapeQuestion(rng, core, length, gap) };
    },
  },
  {
    // Translating a pattern into letters (1.4 elaboration: letter coding).
    id: "1-pattern-letters",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "1.4",
    fill(rng) {
      const codes = { "A B": [0, 1], "A A B": [0, 0, 1], "A B B": [0, 1, 1], "A B C": [0, 1, 2] } as const;
      const keys = Object.keys(codes) as (keyof typeof codes)[];
      const [answer, ...others] = rng.shuffle(keys);
      const shapes = rng.shuffle([...SHAPES]);
      const items = Array.from({ length: codes[answer].length * 2 }, (_, i) => shapes[codes[answer][i % codes[answer].length]]);
      const picks = others.slice(0, 2);
      return {
        values: { shown: keys.indexOf(answer) },
        prompt: `Which letters show the part that repeats? ${items.map((s) => s.glyph).join(GAP)}`,
        // Letters spoken by name, one choice per sentence, so a listener hears where each choice ends.
        readAloud: `Look at the pattern: ${items.map((s) => s.word).join(", ")}. Which letters show the part that repeats? Choose one. ${rng.shuffle([answer, ...picks]).map(sayLetters).join(". ")}.`,
        answer,
        wrong: picks.map((k) => wrong(k, "pattern-core")),
      };
    },
  },
  {
    id: "1-number-pattern",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "1.4",
    fill(rng) {
      // A repeating core of 3 numbers, such as 2, 4, 6, 2, 4, 6.
      const core = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
      const length = rng.int(7, 8);
      const seq = Array.from({ length }, (_, i) => core[i % 3]);
      const next = core[length % 3];
      return {
        values: { a: core[0], b: core[1], c: core[2], length },
        prompt: `What comes next? ${seq.join(", ")}, ?`,
        readAloud: `What number comes next? ${seq.join(", ")}.`,
        answer: String(next),
        wrong: [wrong(seq[length - 1], "A2"), wrong(Math.max(...core) + 1, "pattern-growing")],
      };
    },
  },
  {
    // Change in quantity to 20 (1.5): "I can build 7 and make it 10 by adding 3".
    id: "1-build-to",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.5",
    fill(rng) {
      const have = rng.int(4, 12), add = rng.int(3, Math.min(9, 20 - have));
      const name = rng.pick(NAMES);
      return {
        values: { have, add },
        prompt: `${name} has ${have} blocks and wants to have ${have + add}. How many more blocks does ${name} need?`,
        readAloud: `${name} has ${have} blocks and wants to have ${have + add}. How many more blocks does ${name} need?`,
        answer: String(add),
        wrong: [wrong(have + have + add, "operation"), wrong(add + 1, "count-start")],
      };
    },
  },
  {
    // A missing number in an equation (map, grade 1: 5 + __ = 8). WNCP solves equations with a symbol for the unknown in grade 3.
    id: "1-missing-addend",
    strand: "A", grades: { BC: 1, AB: 3, SK: 3, MB: 3, ON: 1 }, format: "number", whiteboard: true, standard: "1.5",
    fill(rng) {
      // a is 2 or more, so the counting-start answer (sum - a + 1) never equals the total.
      const sum = rng.int(5, 10), a = rng.int(2, sum - 2);
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
    // Inequality (1.6): the sum with the bigger first number is the smaller sum.
    id: "1-which-sum-more",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: true, standard: "1.6",
    fill(rng) {
      const [a, b, c, d] = draw(
        rng,
        (r) => [r.int(4, 9), r.int(1, 5), r.int(2, 8), r.int(3, 9)],
        ([a, b, c, d]) => a > c && a + b < c + d && c + d <= 20,
      );
      // trap = a + b, the sum with the bigger first number; bigger = c + d. Either may be named first.
      const trap = `${a} + ${b}`, bigger = `${c} + ${d}`;
      const [x, y] = rng.shuffle([trap, bigger]);
      const say = (e: string) => e.replace("+", "plus");
      return {
        values: { a, b, c, d, trapFirst: x === trap ? 1 : 0 },
        prompt: `Which is more: ${x} or ${y}?`,
        readAloud: `Which is more: ${say(x)}, or ${say(y)}? Or are they the same?`,
        answer: bigger,
        wrong: [wrong(trap, "first-number"), wrong("They are the same", "same-size")],
      };
    },
  },
  {
    // Predicting an item further on (1.4 elaboration: predict an element). Drawing the pattern out is the shown work.
    id: "1-pattern-predict",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: true, standard: "1.4",
    fill(rng) {
      const [x, y, z] = rng.shuffle([0, 1, 2, 3]);
      const cores = [[x, y], [x, y, z], [x, x, y]];
      const c = rng.int(0, cores.length - 1);
      const ask = rng.int(cores[c].length * 2 + 2, 12);
      return { values: { x, y, z, core: c, ask }, ...predictShape(rng, cores[c], ask) };
    },
  },
  {
    // Letters to shapes: the reverse of 1-pattern-letters (1.4: translate a pattern between representations).
    id: "1-letters-to-shapes",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "1.4",
    fill(rng) {
      const codes = { "A B": [0, 1], "A A B": [0, 0, 1], "A B B": [0, 1, 1], "A B C": [0, 1, 2] } as const;
      const keys = Object.keys(codes) as (keyof typeof codes)[];
      const [asked, ...others] = rng.shuffle(keys);
      const shapes = rng.shuffle([...SHAPES]);
      // Every pattern shows 6 shapes, so no choice stands out by length.
      const show = (k: keyof typeof codes) =>
        Array.from({ length: 6 }, (_, i) => shapes[codes[k][i % codes[k].length]].glyph).join(GAP);
      return {
        values: { asked: keys.indexOf(asked) },
        prompt: `Which pattern is an ${asked} pattern?`,
        readAloud: `Which pattern is a ${sayLetters(asked)} pattern? Look at the three patterns.`,
        answer: show(asked),
        wrong: others.slice(0, 2).map((k) => wrong(show(k), "pattern-core")),
      };
    },
  },
  {
    // Change in quantity with the change unknown (1.5).
    id: "1-change-story",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.5",
    fill(rng) {
      const start = rng.int(5, 12), more = rng.int(3, Math.min(9, 20 - start));
      const [who, where, verb] = rng.pick([
        ["children", "on a bus", "get on"],
        ["ducks", "in a pond", "swim over"],
        ["birds", "on a wire", "fly over"],
      ] as const);
      return {
        values: { start, more },
        prompt: `There are ${start} ${who} ${where}. Some more ${verb}. Now there are ${start + more}. How many more ${who} came?`,
        readAloud: `There are ${start} ${who} ${where}. Some more ${verb}. Now there are ${start + more}. How many more ${who} came?`,
        answer: String(more),
        wrong: [wrong(start + start + more, "operation"), wrong(more + 1, "count-start")],
      };
    },
  },
  {
    // Equality as a balance (1.6; WNCP grade 1 describes equality as a balance).
    id: "1-balance-cubes",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.6",
    fill(rng) {
      const [big, small] = draw(rng, (r) => [r.int(6, 15), r.int(2, 12)], ([b, s]) => b - s >= 2 && b - s <= 9);
      return {
        values: { big, small },
        prompt: `One side of a balance has ${big} cubes. The other side has ${small} cubes. All the cubes are the same. How many cubes must you add to the side with ${small} cubes to make it balance?`,
        readAloud: `One side of a balance has ${big} cubes. The other side has ${small} cubes. All the cubes are the same. How many cubes must you add to the side with ${small} cubes to make it balance?`,
        answer: String(big - small),
        wrong: [wrong(big + small, "operation"), wrong(big, "difference-whole")],
      };
    },
  },
  {
    // Equal or not (1.6: meaning of equality and inequality).
    id: "1-equal-or-not",
    strand: "A", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: true, standard: "1.6",
    fill(rng): Filled {
      const equal = rng.int(0, 1) === 1;
      // The first sum always starts with the bigger number, so "bigger first number, bigger sum" is the trap.
      const [a, b, c, d] = draw(
        rng,
        (r) => [r.int(4, 9), r.int(1, 6), r.int(2, 8), r.int(2, 9)],
        ([a, b, c, d]) => a > c && c + d <= 20 && (equal ? a + b === c + d && b !== c : a + b < c + d),
      );
      const yes = "Yes, they are the same amount", firstMore = `No, ${a} + ${b} is more`, secondMore = `No, ${c} + ${d} is more`;
      return {
        values: { a, b, c, d, equal: equal ? 1 : 0 },
        prompt: `Is ${a} + ${b} the same amount as ${c} + ${d}?`,
        readAloud: `Is ${a} plus ${b} the same amount as ${c} plus ${d}? Yes, they are the same amount. No, ${a} plus ${b} is more. Or no, ${c} plus ${d} is more.`,
        answer: equal ? yes : secondMore,
        wrong: equal
          ? [wrong(firstMore, "first-number"), wrong(secondMore, "looks-different")]
          : [wrong(firstMore, "first-number"), wrong(yes, "same-size")],
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    // Non-standard units (1.7; map, grade 1). WNCP measures with units in grade 2.
    id: "1-cubes-longer",
    strand: "MG", grades: { BC: 1, AB: 2, SK: 2, MB: 2, ON: 1 }, format: "number", whiteboard: true, standard: "1.7",
    fill(rng) {
      const a = rng.int(5, 12), b = rng.int(2, a - 2);
      const [long, short] = rng.pick([["pencil", "crayon"], ["shoe", "sock"], ["book", "spoon"]] as const);
      return {
        values: { a, b },
        prompt: `A ${long} is ${a} cubes long. A ${short} is ${b} cubes long. They start at the same line. How many cubes longer is the ${long}?`,
        readAloud: `A ${long} is ${a} cubes long. A ${short} is ${b} cubes long. They start at the same line. How many cubes longer is the ${long}?`,
        answer: String(a - b),
        wrong: [wrong(a + b, "operation"), wrong(a, "difference-whole")],
      };
    },
  },
  {
    // Unit size (1.7: non-uniform units vary in size). WNCP and Ontario relate unit size to the count in grade 2.
    id: "1-unit-size",
    strand: "MG", grades: { BC: 1, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "1.7",
    fill(rng) {
      const n = rng.int(6, 12), bigger = rng.int(0, 1) === 1;
      const [nameA, nameB] = twoNames(rng);
      const [thing, unit] = rng.pick([["a table", "hand spans"], ["a rug", "steps"], ["a desk", "paper clips"]] as const);
      const answer = bigger ? `Fewer than ${n}` : `More than ${n}`;
      return {
        values: { n, bigger: bigger ? 1 : 0 },
        prompt: `${nameA} measures ${thing} and gets ${n} ${unit}. ${nameB} measures it with ${bigger ? "bigger" : "smaller"} ${unit}. Will ${nameB} get more than ${n}, fewer than ${n}, or exactly ${n}?`,
        readAloud: `${nameA} measures ${thing} and gets ${n} ${unit}. ${nameB} measures it with ${bigger ? "bigger" : "smaller"} ${unit}. Will ${nameB} get more than ${n}, fewer than ${n}, or exactly ${n}?`,
        answer,
        wrong: [wrong(bigger ? `More than ${n}` : `Fewer than ${n}`, "unit-size"), wrong(`Exactly ${n}`, "count-unchanged")],
      };
    },
  },
  {
    // Ordering three lengths by comparing (1.7; WNCP grade 1 orders objects by comparing).
    id: "1-order-three",
    strand: "MG", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: true, standard: "1.7",
    fill(rng) {
      const [x, y, z] = rng.shuffle(["red", "blue", "green", "yellow"]);
      const thing = rng.pick(["ribbon", "rope", "stick", "snake"]);
      const longest = rng.int(0, 1) === 1;
      const word = longest ? "longest" : "shortest";
      // x is longer than y, and y is longer than z.
      const clues = orderClues(rng, [`the ${x} ${thing}`, `the ${y} ${thing}`, `the ${z} ${thing}`], "longer", "shorter");
      return {
        values: { longest: longest ? 1 : 0 },
        prompt: `${clues} Which ${thing} is the ${word}?`,
        readAloud: `${clues} Which ${thing} is the ${word}: ${orList(rng, [x, y, z].map((c) => `the ${c} one`))}?`,
        answer: cap(`the ${longest ? x : z} ${thing}`),
        wrong: [wrong(cap(`the ${longest ? z : x} ${thing}`), "more-less"), wrong(cap(`the ${y} ${thing}`), "order-pair")],
      };
    },
  },
  {
    id: "1-shape-sides",
    strand: "MG", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: false, standard: "1.8",
    fill(rng) {
      const triangle = "▲ triangle", square = "■ square", circle = "● circle", rectangle = "▬ rectangle";
      const ask = rng.int(0, 2);
      const [question, answer, others] =
        ask === 0 ? ["exactly 3 sides", triangle, [square, circle, rectangle]]
        : ask === 1 ? ["exactly 4 sides", square, [triangle, circle]]
        : ["no sides and no corners", circle, [triangle, square, rectangle]];
      const picks = rng.shuffle(others).slice(0, 2);
      return {
        values: { ask },
        prompt: `Which shape has ${question}?`,
        readAloud: `Which shape has ${question}: ${orList(rng, [answer, ...picks].map((s) => `a ${s.split(" ")[1]}`))}?`,
        answer,
        wrong: picks.map((s) => wrong(s, "shape-name")),
      };
    },
  },
  {
    id: "1-sides-in-all",
    strand: "MG", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "number", whiteboard: true, standard: "1.8",
    fill(rng) {
      const [shape, sides, glyph] = rng.pick([["triangles", 3, "▲"], ["squares", 4, "■"]] as const);
      const k = rng.int(2, 3);
      return {
        values: { sides, k },
        prompt: `How many sides do ${k} ${shape} have in all? ${row(k, glyph)}`,
        readAloud: `How many sides do ${k} ${shape} have in all?`,
        answer: String(k * sides),
        wrong: [wrong(sides, "one-part"), wrong(k + sides, "operation")],
      };
    },
  },
  {
    // Concrete graphs (1.9; map, grade 1). WNCP starts graphs in grade 2.
    id: "1-graph-how-many-more",
    strand: "DP", grades: { BC: 1, AB: 2, SK: 2, MB: 2, ON: 1 }, format: "number", whiteboard: true, standard: "1.9",
    fill(rng) {
      const a = rng.int(4, 9), b = rng.int(1, a - 2);
      const [x, y] = rng.pick([["apples", "bananas"], ["soccer", "swimming"], ["cats", "dogs"]] as const);
      return {
        values: { a, b },
        prompt: `Each ● is 1 child. ${cap(x)}: ${row(a)}. ${cap(y)}: ${row(b)}. How many more children chose ${x} than ${y}?`,
        readAloud: `Each dot is one child. Look at the dots for ${x} and for ${y}. How many more children chose ${x} than ${y}?`,
        answer: String(a - b),
        wrong: [wrong(a + b, "operation"), wrong(a, "difference-whole")],
      };
    },
  },
  {
    id: "1-graph-in-all",
    strand: "DP", grades: { BC: 1, AB: 2, SK: 2, MB: 2, ON: 1 }, format: "number", whiteboard: false, standard: "1.9",
    fill(rng) {
      const [a, b] = rng.shuffle([2, 3, 4, 5, 6, 7, 8]).slice(0, 2);
      const [about, x, y] = rng.pick([
        ["Children told how they get to school.", "walk", "bus"],
        ["Children chose a favourite colour.", "red", "blue"],
        ["Children chose a favourite kind of weather.", "rain", "sun"],
      ] as const);
      return {
        values: { a, b },
        prompt: `${about} Each ● is 1 child. ${cap(x)}: ${row(a)}. ${cap(y)}: ${row(b)}. How many children are there in all?`,
        // The counts are not read out: counting the dots is the task.
        readAloud: `${about} Each dot is one child. Look at the dots for ${x} and the dots for ${y}. How many children are there in all?`,
        answer: String(a + b),
        wrong: [wrong(Math.max(a, b), "one-part"), wrong(Math.abs(a - b), "operation")],
      };
    },
  },
  {
    // Likelihood words (1.10: never, sometimes, always; map, grade 1). WNCP starts likelihood in grade 5.
    id: "1-never-sometimes-always",
    strand: "DP", grades: { BC: 1, AB: 5, SK: 5, MB: 5, ON: 1 }, format: "choice", whiteboard: false, standard: "1.10",
    fill(rng) {
      const [x, y] = rng.shuffle(["red", "blue", "green", "yellow"]);
      const kind = rng.int(0, 2);
      const bag = kind === 2 ? `${x} blocks and ${y} blocks` : `only ${x} blocks`;
      const pick = kind === 1 ? x : y;
      // kind 0: picking y from only-x is never; kind 1: picking x from only-x is always; kind 2: picking y from x and y is sometimes.
      const answer = ["Never", "Always", "Sometimes"][kind];
      const coded = [
        [wrong("Sometimes", "impossible-possible"), wrong("Always", "opposite-extreme")],
        [wrong("Sometimes", "certain-likely"), wrong("Never", "opposite-extreme")],
        [wrong("Never", "rules-out-possible"), wrong("Always", "sure-of-possible")],
      ][kind];
      return {
        values: { kind },
        // "Sometimes" fits many picks, not one, so the child picks again and again.
        prompt: `A bag has ${bag}. You pick a block without looking, put it back, and do this again and again. How often will you pick ${pick}?`,
        readAloud: `A bag has ${bag}. You pick a block without looking, put it back, and do this again and again. How often will you pick ${pick}: never, sometimes, or always?`,
        answer,
        wrong: coded,
      };
    },
  },
  {
    // More likely, less likely (1.10). WNCP starts likelihood in grade 5.
    id: "1-more-likely",
    strand: "DP", grades: { BC: 1, AB: 5, SK: 5, MB: 5, ON: 1 }, format: "choice", whiteboard: false, standard: "1.10",
    fill(rng) {
      const pairs = [
        ["You will read a book at school this week", "A horse will come to your class this week"],
        ["It will rain some time this year", "It will rain lemonade this year"],
        ["You will see a bird outside today", "You will see a penguin in your yard today"],
        ["You will brush your teeth today", "You will brush a lion's teeth today"],
        ["Your teacher will say your name this week", "Your teacher will fly to school this week"],
        ["You will see a car on your street today", "You will see a camel on your street today"],
      ] as const;
      const i = rng.int(0, pairs.length - 1);
      const [likely, unlikely] = pairs[i];
      return {
        values: { pair: i },
        prompt: "Which is more likely to happen?",
        // Each choice is its own sentence, so the three do not run together when spoken.
        readAloud: `Which is more likely to happen? Choose one. ${rng.shuffle([likely, unlikely, "They are equally likely"]).join(". ")}.`,
        answer: likely,
        wrong: [wrong(unlikely, "chance-reversed"), wrong("They are equally likely", "D3")],
      };
    },
  },
  {
    // Covering an area with units (1.7 elaboration: tile an area). WNCP and Ontario count units in grade 2.
    id: "1-cover-card",
    strand: "MG", grades: { BC: 1, AB: 2, SK: 2, MB: 2, ON: 2 }, format: "choice", whiteboard: false, standard: "1.7",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(6, 14), r.int(6, 14)], ([a, b]) => Math.abs(a - b) >= 2);
      const bigger = a > b ? "The red card" : "The blue card", smaller = a > b ? "The blue card" : "The red card";
      return {
        values: { a, b },
        prompt: `It takes ${a} sticky notes to cover a red card and ${b} sticky notes to cover a blue card. All the notes are the same size. Which card is bigger?`,
        readAloud: `It takes ${a} sticky notes to cover a red card and ${b} sticky notes to cover a blue card. All the notes are the same size. Which card is bigger: the red card, the blue card, or are they the same size?`,
        answer: bigger,
        wrong: [wrong(smaller, "more-less"), wrong("They are the same size", "same-size")],
      };
    },
  },
  {
    // Adding lengths in units (1.7: multiple copies of a unit). WNCP measures with units in grade 2.
    id: "1-length-together",
    strand: "MG", grades: { BC: 1, AB: 2, SK: 2, MB: 2, ON: 1 }, format: "number", whiteboard: true, standard: "1.7",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(3, 9), r.int(3, 9)], ([a, b]) => a !== b);
      const unit = rng.pick(["paper clips", "cubes"]);
      return {
        values: { a, b },
        prompt: `A book is ${a} ${unit} long. A pencil is ${b} ${unit} long. If you put them end to end, how many ${unit} long are they together?`,
        readAloud: `A book is ${a} ${unit} long. A pencil is ${b} ${unit} long. If you put them end to end, how many ${unit} long are they together?`,
        answer: String(a + b),
        wrong: [wrong(Math.abs(a - b), "operation"), wrong(Math.max(a, b), "one-part")],
      };
    },
  },
  {
    // Ordering three heights by comparing (1.7; WNCP grade 1 orders objects by comparing).
    id: "1-tallest-child",
    strand: "MG", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: true, standard: "1.7",
    fill(rng) {
      const [x, y, z] = rng.shuffle([...NAMES]).slice(0, 3);
      const tallest = rng.int(0, 1) === 1;
      const word = tallest ? "tallest" : "shortest";
      const clues = orderClues(rng, [x, y, z], "taller", "shorter");
      return {
        values: { tallest: tallest ? 1 : 0 },
        prompt: `${clues} Who is the ${word}?`,
        readAloud: `${clues} Who is the ${word}: ${orList(rng, [x, y, z])}?`,
        answer: tallest ? x : z,
        wrong: [wrong(tallest ? z : x, "more-less"), wrong(y, "order-pair")],
      };
    },
  },
  {
    // Ordering three masses on a balance (1.7; WNCP grade 1 compares mass).
    id: "1-heaviest-box",
    strand: "MG", grades: { BC: 1, AB: 1, SK: 1, MB: 1, ON: 1 }, format: "choice", whiteboard: true, standard: "1.7",
    fill(rng) {
      const [x, y, z] = rng.shuffle(["red", "blue", "green", "yellow"]);
      const heaviest = rng.int(0, 1) === 1;
      const word = heaviest ? "heaviest" : "lightest";
      const clues = orderClues(rng, [`the ${x} box`, `the ${y} box`, `the ${z} box`], "heavier", "lighter");
      return {
        values: { heaviest: heaviest ? 1 : 0 },
        prompt: `Three boxes were weighed on a balance. ${clues} Which box is the ${word}?`,
        readAloud: `Three boxes were weighed on a balance. ${clues} Which box is the ${word}: ${orList(rng, [x, y, z].map((c) => `the ${c} box`))}?`,
        answer: cap(`the ${heaviest ? x : z} box`),
        wrong: [wrong(cap(`the ${heaviest ? z : x} box`), "more-less"), wrong(cap(`the ${y} box`), "order-pair")],
      };
    },
  },
];
