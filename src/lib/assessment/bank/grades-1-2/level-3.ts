// Level 3 (BC grade 3) for the grades 1-2 bank: the "up" form for a grade 2 child. No fractions: grades 1-2 do
// not test or report them. Standards: curriculum map, section 1 (3.1-3.14); example items: section 3, grade 3.
// Province tags: see ./index.ts.
import { cap, count, draw, NAMES, orList, wrong, type TaggedTemplate } from "../kit";
import type { Filled } from "../../types";

const digits = (n: number) => [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10];
/** The O1/O2 bug: in each column, the smaller digit from the larger. */
const smallerFromLarger = (a: number, b: number) => {
  const [x, y] = [digits(a), digits(b)];
  return Math.abs(x[0] - y[0]) * 100 + Math.abs(x[1] - y[1]) * 10 + Math.abs(x[2] - y[2]);
};
/** Adds column by column and drops every carry (O3). */
const noCarry = (a: number, b: number) => [100, 10, 1].reduce((s, p) => s + (((Math.floor(a / p) % 10) + (Math.floor(b / p) % 10)) % 10) * p, 0);

export const LEVEL_3: readonly TaggedTemplate[] = [
  // ---------- Number ----------
  {
    // A zero that holds a place (map, grade 3: 4 hundreds, 0 tens, 7 ones).
    id: "3-build-number",
    strand: "N", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.1",
    fill(rng) {
      const h = rng.int(1, 9), d = rng.int(1, 9), zeroTens = rng.int(0, 1) === 1;
      const [text, answer, short, spoken] = zeroTens
        ? [`${count(h, "hundred")}, 0 tens and ${count(d, "one")}`, h * 100 + d, h * 10 + d, `${h}00${d}`]
        : [`${count(h, "hundred")}, ${count(d, "ten")} and 0 ones`, h * 100 + d * 10, h * 10 + d, `${h}00${d}0`];
      return {
        values: { h, d, zeroTens: zeroTens ? 1 : 0 },
        prompt: `What number is ${text}?`,
        readAloud: `What number is ${text}?`,
        answer: String(answer),
        wrong: [wrong(short, "zero-placeholder"), wrong(spoken, "N1")],
      };
    },
  },
  {
    // Crossing a hundred (map, grade 3: 10 more than 695).
    id: "3-ten-more-less",
    strand: "N", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.1",
    fill(rng) {
      const h = rng.int(1, 8), o = rng.int(0, 9), more = rng.int(0, 1) === 1;
      // 10 more than h9o crosses into the next hundred; 10 less than h0o crosses back.
      const n = more ? h * 100 + 90 + o : (h + 1) * 100 + o;
      const answer = more ? n + 10 : n - 10;
      return {
        values: { n, more: more ? 1 : 0 },
        prompt: `What number is 10 ${more ? "more" : "less"} than ${n}?`,
        readAloud: `What number is 10 ${more ? "more" : "less"} than ${n}?`,
        answer: String(answer),
        wrong: [
          wrong(more ? n + 1 : n - 1, "tens-as-ones"),
          more ? wrong(h * 100 + o, "O3") : wrong(answer + 100, "regroup-forget"),
        ],
      };
    },
  },
  {
    id: "3-greatest",
    strand: "N", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.1",
    fill(rng) {
      // Three numbers from the same three digits (map, grade 3: 689, 698, 869, 896).
      const [x, y, z] = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3).sort((a, b) => a - b);
      const answer = 100 * z + 10 * y + x;
      const sameHundreds = 100 * z + 10 * x + y; // a bigger ones digit than the answer
      const biggestOnes = 100 * y + 10 * x + z; // the biggest ones digit of all
      const list = orList(rng, [answer, sameHundreds, biggestOnes].map(String));
      return {
        values: { x, y, z },
        prompt: `Which number is the greatest: ${list}?`,
        readAloud: "Which number is the greatest?",
        answer: String(answer),
        wrong: [wrong(sameHundreds, "digit-compare"), wrong(biggestOnes, "digit-compare")],
      };
    },
  },
  {
    // What comes after 699 (misconception N3).
    id: "3-after-99",
    strand: "N", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.1",
    fill(rng) {
      const h = rng.int(1, 8);
      return {
        values: { h },
        prompt: `What number comes just after ${h}99?`,
        readAloud: `What number comes just after ${h} hundred ninety-nine?`,
        answer: String((h + 1) * 100),
        wrong: [wrong(`${h}100`, "N3")],
      };
    },
  },
  {
    // Place value to 1000 (map, misconception N2: the 4 in 342).
    id: "3-digit-value",
    strand: "N", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.1",
    fill(rng) {
      const [h, t, o] = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
      const n = h * 100 + t * 10 + o, tens = rng.int(0, 1) === 1;
      const digit = tens ? t : h;
      return {
        values: { n, tens: tens ? 1 : 0 },
        prompt: `What is the value of the ${digit} in ${n}?`,
        readAloud: `What is the value of the digit ${digit} in the number ${n}?`,
        answer: String(tens ? t * 10 : h * 100),
        wrong: tens ? [wrong(t, "N2"), wrong(t * 100, "N2")] : [wrong(h, "N2"), wrong(h * 10, "N2")],
      };
    },
  },
  {
    id: "3-add-3-digit",
    strand: "O", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.3",
    fill(rng) {
      // Both the ones and the tens carry, as in 346 + 278.
      const [a, b] = draw(
        rng,
        (r) => [r.int(115, 589), r.int(115, 389)],
        ([a, b]) => (a % 10) + (b % 10) >= 10 && (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) >= 9 && a + b < 1000,
      );
      return {
        values: { a, b },
        prompt: `${a} + ${b} = ?`,
        readAloud: `What is ${a} plus ${b}?`,
        answer: String(a + b),
        wrong: [wrong(noCarry(a, b), "O3"), wrong(a + b - 100, "O3")],
      };
    },
  },
  {
    // Subtracting across a zero (map, grade 3 and misconception O2: 502 - 168).
    id: "3-subtract-across-zero",
    strand: "O", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.3",
    fill(rng) {
      const a = rng.int(3, 9) * 100 + rng.int(1, 5);
      const b = draw(rng, (r) => r.int(1, Math.floor(a / 100) - 1) * 100 + r.int(1, 9) * 10 + r.int(6, 9), (b) => b % 10 > a % 10);
      return {
        values: { a, b },
        prompt: `${a} − ${b} = ?`,
        readAloud: `What is ${a} minus ${b}?`,
        answer: String(a - b),
        wrong: [wrong(smallerFromLarger(a, b), "O2"), wrong(a - b + 100, "regroup-forget")],
      };
    },
  },
  {
    id: "3-story-subtract",
    strand: "O", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.3",
    fill(rng) {
      // The tens need regrouping, as in 425 - 160.
      const [a, b] = draw(
        rng,
        (r) => [r.int(310, 890), r.int(120, 290)],
        ([a, b]) => Math.floor(a / 10) % 10 < Math.floor(b / 10) % 10 && a % 10 >= b % 10 && a - b >= 100,
      );
      const [things, verb] = rng.pick([["books", "are lent out"], ["tickets", "are sold"], ["seeds", "are planted"]] as const);
      return {
        values: { a, b },
        prompt: `A school has ${a} ${things}. ${b} ${things} ${verb}. How many ${things} are left?`,
        readAloud: `A school has ${a} ${things}. ${b} ${things} ${verb}. How many ${things} are left?`,
        answer: String(a - b),
        wrong: [wrong(smallerFromLarger(a, b), "O1"), wrong(a + b, "operation")],
      };
    },
  },
  {
    // Equal groups (3.5; map, grade 3: 4 groups of 6). Factors to 5, as WNCP grade 3 multiplies to 5 x 5.
    id: "3-equal-groups",
    strand: "O", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 2 }, format: "number", whiteboard: true, standard: "3.5",
    fill(rng) {
      const [groups, each] = draw(rng, (r) => [r.int(2, 5), r.int(2, 5)], ([g, e]) => g !== e);
      const [container, thing] = rng.pick([["bags", "apples"], ["boxes", "crayons"], ["plates", "cookies"]] as const);
      return {
        values: { groups, each },
        prompt: `There are ${groups} ${container} with ${each} ${thing} in each. How many ${thing} are there in all?`,
        readAloud: `There are ${groups} ${container} with ${each} ${thing} in each. How many ${thing} are there in all?`,
        answer: String(groups * each),
        wrong: [wrong(groups + each, "operation")],
      };
    },
  },
  {
    // Sharing equally (3.5; map, grade 3: 20 shared equally among 5).
    id: "3-share-equally",
    strand: "O", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.5",
    fill(rng) {
      const [friends, each] = draw(rng, (r) => [r.int(2, 5), r.int(2, 5)], ([f, e]) => f * e - f !== e && f !== e);
      const total = friends * each;
      return {
        values: { friends, each },
        prompt: `${total} stickers are shared equally among ${friends} friends. How many stickers does each friend get?`,
        readAloud: `${total} stickers are shared equally among ${friends} friends. How many stickers does each friend get?`,
        answer: String(each),
        wrong: [wrong(total - friends, "operation"), wrong(total + friends, "operation")],
      };
    },
  },
  {
    // Coins and bills to 100 dollars (3.14). WNCP has no money outcomes before grade 4.
    id: "3-money-total",
    strand: "O", grades: { BC: 3, AB: 4, SK: 4, MB: 4, ON: 3 }, format: "number", whiteboard: true, standard: "3.14",
    fill(rng) {
      const [twenties, tens, fives, toonies] = draw(
        rng,
        (r) => [r.int(0, 2), r.int(0, 2), r.int(0, 2), r.int(1, 4)],
        ([a, b, c]) => a + b + c >= 2,
      );
      const parts = [
        [twenties, "$20 bill"],
        [tens, "$10 bill"],
        [fives, "$5 bill"],
        [toonies, "toonie ($2 coin)"],
      ] as const;
      // Counts as words ("two $5 bills"), so "2 5 dollar bills" is never heard as "twenty-five dollar bills".
      const WORDS = ["zero", "one", "two", "three", "four"];
      const written = parts.filter(([n]) => n > 0).map(([n, what]) => `${WORDS[n]} ${what}${n > 1 ? "s" : ""}`.replace("toonie ($2 coin)s", "toonies ($2 coins)"));
      const spoken = parts.filter(([n]) => n > 0).map(([n, what]) => {
        const word = what.replace(/^\$(\d+) bill$/, "$1-dollar bill").replace("toonie ($2 coin)", "toonie");
        return `${WORDS[n]} ${word}${n > 1 ? "s" : ""}`;
      });
      const name = rng.pick(NAMES);
      const total = 20 * twenties + 10 * tens + 5 * fives + 2 * toonies;
      const list = (items: string[]) => `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
      return {
        values: { twenties, tens, fives, toonies },
        prompt: `${name} has ${list(written)}. How many dollars is that in all?`,
        readAloud: `${name} has ${list(spoken)}. A toonie is 2 dollars. How many dollars is that in all?`,
        answer: String(total),
        wrong: [wrong(twenties + tens + fives + toonies, "coin-count")],
      };
    },
  },

  // ---------- Patterns and algebra ----------
  {
    // Decreasing patterns (3.6; map, grade 3: 50, 45, 40, 35).
    id: "3-decreasing-pattern",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.6",
    fill(rng) {
      const step = rng.pick([2, 5, 10]);
      const start = step * rng.int(step === 2 ? 8 : 6, step === 2 ? 20 : step === 5 ? 20 : 9);
      const seq = [0, 1, 2, 3].map((i) => start - i * step);
      return {
        values: { step, start },
        prompt: `What comes next? ${seq.join(", ")}, ?`,
        readAloud: `What number comes next? ${seq.join(", ")}.`,
        answer: String(start - 4 * step),
        wrong: [wrong(seq[2], "pattern-direction"), wrong(seq[3] - 1, "skip-by-one")],
      };
    },
  },
  {
    // Increasing by 3 or 4 (map, grade 3: 4, 7, 10, 13).
    id: "3-increasing-pattern",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.6",
    fill(rng) {
      const step = rng.pick([3, 4]), start = rng.int(1, 12);
      const seq = [0, 1, 2, 3].map((i) => start + i * step);
      return {
        values: { step, start },
        prompt: `What comes next? ${seq.join(", ")}, ?`,
        readAloud: `What number comes next? ${seq.join(", ")}.`,
        answer: String(start + 4 * step),
        wrong: [wrong(seq[3] + 1, "skip-by-one")],
      };
    },
  },
  {
    // Pattern rules in words (3.7).
    id: "3-pattern-rule",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.7",
    fill(rng) {
      const [start, step] = draw(rng, (r) => [r.int(2, 9), r.int(2, 5)], ([s, d]) => s !== d);
      const seq = [0, 1, 2, 3].map((i) => start + i * step);
      const rule = (s: number, d: number) => `Start at ${s} and add ${d} each time`;
      return {
        values: { start, step },
        prompt: `What is the rule for this pattern? ${seq.join(", ")}`,
        // One choice per sentence: the three rules sound alike, so each needs its own pause.
        readAloud: `What is the rule for this pattern? ${seq.join(", ")}.`,
        answer: rule(start, step),
        wrong: [wrong(rule(start, start), "rule-start"), wrong(rule(step, start), "rule-swap")],
      };
    },
  },
  {
    // Start unknown (3.8; misconception A4: __ - 7 = 5).
    id: "3-start-unknown",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.8",
    fill(rng): Filled {
      const subtract = rng.int(0, 1) === 1;
      if (subtract) {
        const [b, c] = draw(rng, (r) => [r.int(3, 9), r.int(2, 9)], ([b, c]) => b !== c);
        return {
          values: { b, c, subtract: 1 },
          prompt: `? − ${b} = ${c}`,
          readAloud: `What number minus ${b} makes ${c}?`,
          answer: String(b + c),
          wrong: [wrong(Math.abs(b - c), "A4")],
        };
      }
      const b = rng.int(5, 15), sum = rng.int(b + 3, 30);
      return {
        values: { b, sum, subtract: 0 },
        prompt: `? + ${b} = ${sum}`,
        readAloud: `What number plus ${b} makes ${sum}?`,
        answer: String(sum - b),
        wrong: [wrong(sum + b, "operation")],
      };
    },
  },
  {
    // Change unknown (3.8; map: 12 + n = 20).
    id: "3-change-unknown",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.8",
    fill(rng) {
      // A change of 4 to 9 that crosses a ten: small enough that counting on by ones (and counting the start) is a real
      // strategy, as in 26 + ? = 33.
      const [a, change] = draw(rng, (r) => [r.int(12, 38), r.int(4, 9)], ([a, ch]) => (a % 10) + ch >= 10);
      const sum = a + change;
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
    // Equality with larger numbers (3.8 and 2.7; misconception A1).
    id: "3-balance-equation",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.8",
    fill(rng) {
      const [a, b, c] = draw(rng, (r) => [r.int(10, 30), r.int(3, 9), r.int(10, 30)], ([a, b, c]) => a + b - c >= 2 && a + b - c <= 15);
      return {
        values: { a, b, c },
        prompt: `${a} + ${b} = ${c} + ?`,
        readAloud: `${a} plus ${b} is the same as ${c} plus what number?`,
        answer: String(a + b - c),
        wrong: [wrong(a + b, "A1"), wrong(a + b + c, "A1")],
      };
    },
  },
  {
    // A growing pattern in a story (3.6, 3.7): tables pushed together in a row.
    id: "3-growing-tables",
    strand: "A", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.7",
    fill(rng) {
      const ask = rng.int(5, 7), side = rng.int(1, 2);
      // Each table seats `side` children on each long side and 1 at each end of the row: 4, 6, 8 or 6, 10, 14.
      const seats = (n: number) => 2 * side * n + 2;
      const text = `1 table seats ${seats(1)} children. 2 tables pushed together in a row seat ${seats(2)}. 3 tables in a row seat ${seats(3)}. How many children can sit at ${ask} tables in a row?`;
      return {
        values: { ask, side },
        prompt: text,
        readAloud: text,
        answer: String(seats(ask)),
        wrong: [wrong(seats(1) * ask, "pattern-multiply"), wrong(seats(4), "next-not-asked")],
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    // Area in square units (3.9; map, grade 3). WNCP measures area in grade 4.
    id: "3-area-tiles",
    strand: "MG", grades: { BC: 3, AB: 4, SK: 4, MB: 4, ON: 3 }, format: "number", whiteboard: true, standard: "3.9",
    fill(rng) {
      const [rows, cols] = draw(rng, (r) => [r.int(2, 5), r.int(3, 6)], ([r, c]) => r !== c && r * c !== 2 * (r + c));
      return {
        values: { rows, cols },
        prompt: `A rectangle is covered by ${rows} rows of square tiles, with ${cols} tiles in each row. What is its area, in square units?`,
        readAloud: `A rectangle is covered by ${rows} rows of square tiles, with ${cols} tiles in each row. What is its area, in square units?`,
        answer: String(rows * cols),
        wrong: [wrong(rows + cols, "M2"), wrong(2 * (rows + cols), "M2")],
      };
    },
  },
  {
    // Units of mass (3.9; map, grade 3: grams for an apple).
    id: "3-mass-unit",
    strand: "MG", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "3.9",
    fill(rng) {
      const light = rng.int(0, 1) === 1;
      const thing = light ? rng.pick(["an apple", "a pencil", "a sock"]) : rng.pick(["a dog", "a bag of potatoes", "a bicycle"]);
      const [answer, other, odd] = light ? ["Grams", "Kilograms", "Millilitres"] : ["Kilograms", "Grams", "Metres"];
      return {
        values: { light: light ? 1 : 0 },
        prompt: `Which unit is best for measuring the mass of ${thing}?`,
        readAloud: `Which unit is best for measuring the mass of ${thing}?`,
        answer,
        wrong: [wrong(other, "unit-choice"), wrong(odd, "unit-kind")],
      };
    },
  },
  {
    // Units of length (3.9: cm, m, km).
    id: "3-length-convert",
    strand: "MG", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.9",
    fill(rng) {
      const n = rng.int(1, 5);
      return {
        values: { n },
        prompt: `How many centimetres are in ${n} ${n === 1 ? "metre" : "metres"}?`,
        readAloud: `How many centimetres are in ${n} ${n === 1 ? "metre" : "metres"}?`,
        answer: String(100 * n),
        wrong: [wrong(10 * n, "unit-convert"), wrong(1000 * n, "unit-convert")],
      };
    },
  },
  {
    // Faces, edges and corners of solids (3.11; map, grade 3: faces of a cube).
    id: "3-solid-parts",
    strand: "MG", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.11",
    fill(rng) {
      const solid = rng.pick(["a cube", "a box shaped like a rectangular prism"]);
      const part = rng.int(0, 2);
      // Cube and rectangular prism: 6 faces, 12 edges, 8 corners. A picture shows 3 faces, 9 edges and 7 corners.
      const [word, answer, seen, other] = (
        [
          ["faces", 6, 3, 8],
          ["edges", 12, 9, 8],
          ["corners", 8, 7, 6],
        ] as const
      )[part];
      return {
        values: { part },
        prompt: `How many ${word} does ${solid} have?`,
        readAloud: `How many ${word} does ${solid} have?`,
        answer: String(answer),
        wrong: [wrong(seen, "visible-parts"), wrong(other, "faces-corners")],
      };
    },
  },
  {
    // Time units (3.10; map, grade 3: minutes in an hour).
    id: "3-time-units",
    strand: "MG", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: false, standard: "3.10",
    fill(rng) {
      const n = rng.int(1, 2), seconds = rng.int(0, 1) === 1;
      const [small, big] = seconds ? ["seconds", "minute"] : ["minutes", "hour"];
      return {
        values: { n, seconds: seconds ? 1 : 0 },
        prompt: `How many ${small} are in ${n} ${big}${n > 1 ? "s" : ""}?`,
        readAloud: `How many ${small} are in ${n} ${big}${n > 1 ? "s" : ""}?`,
        answer: String(60 * n),
        wrong: [wrong(100 * n, "M8")],
      };
    },
  },
  {
    // Days in weeks and months in years (3.10). WNCP relates days to a week and months to a year in grade 2.
    id: "3-days-weeks",
    strand: "MG", grades: { BC: 3, AB: 2, SK: 2, MB: 2, ON: 3 }, format: "number", whiteboard: true, standard: "3.10",
    fill(rng) {
      const n = rng.int(2, 3), weeks = rng.int(0, 1) === 1;
      const [small, big, per] = weeks ? ["days", "weeks", 7] : ["months", "years", 12];
      return {
        values: { n, weeks: weeks ? 1 : 0 },
        prompt: `How many ${small} are in ${n} ${big}?`,
        readAloud: `How many ${small} are in ${n} ${big}?`,
        answer: String(per * n),
        wrong: [wrong(per + n, "operation")],
      };
    },
  },
  {
    // Bar graphs (3.12; map, grade 3).
    id: "3-bar-graph-more",
    strand: "DP", grades: { BC: 3, AB: 3, SK: 3, MB: 3, ON: 3 }, format: "number", whiteboard: true, standard: "3.12",
    fill(rng) {
      const a = rng.int(9, 20), b = rng.int(3, a - 3);
      const [kind, x, y] = rng.pick([["sport", "soccer", "swimming"], ["thing to do", "reading", "drawing"], ["food", "pizza", "tacos"]] as const);
      // Read off a class bar graph that the screen draws (#79): the text does not say how far the bars go.
      const ask = `How many more children chose ${x} than ${y}?`;
      return {
        values: { a, b },
        prompt: `A class made a bar graph of their favourite ${kind}. ${ask}`,
        readAloud: `A class made a bar graph of their favourite ${kind}. Look at the graph. ${ask}`,
        figure: { kind: "bars", bars: [{ label: cap(x), value: a }, { label: cap(y), value: b }] },
        answer: String(a - b),
        wrong: [wrong(a + b, "operation"), wrong(a, "difference-whole")],
      };
    },
  },
  {
    // Likelihood with a bag (3.13; map, grade 3). WNCP starts likelihood in grade 5.
    id: "3-bag-likely",
    strand: "DP", grades: { BC: 3, AB: 5, SK: 5, MB: 5, ON: 3 }, format: "choice", whiteboard: false, standard: "3.13",
    fill(rng) {
      const [x, y] = rng.shuffle(["blue", "red", "green", "yellow"]);
      const many = rng.int(3, 8), few = rng.int(1, many - 2);
      // Either colour may be named first, so the likely one is not always first.
      const marbles = rng.shuffle([`${many} ${x} marbles`, count(few, `${y} marble`)]).join(" and ");
      return {
        values: { many, few },
        prompt: `A bag has ${marbles}. You pick one without looking. Which colour are you more likely to pick?`,
        readAloud: `A bag has ${marbles}. You pick one without looking. Which colour are you more likely to pick?`,
        answer: cap(x),
        wrong: [wrong(cap(y), "chance-reversed"), wrong("Both are equally likely", "D3")],
      };
    },
  },
  {
    // A coin toss is 50-50 (3.13 elaboration; misconception D2). WNCP starts likelihood in grade 5.
    id: "3-coin-streak",
    strand: "DP", grades: { BC: 3, AB: 5, SK: 5, MB: 5, ON: 3 }, format: "choice", whiteboard: false, standard: "3.13",
    fill(rng) {
      const n = rng.int(3, 5), heads = rng.int(0, 1) === 1;
      const [side, other] = heads ? ["heads", "tails"] : ["tails", "heads"];
      return {
        values: { n, heads: heads ? 1 : 0 },
        prompt: `A coin landed on ${side} ${n} times in a row. On the next toss, which is more likely?`,
        readAloud: `A coin landed on ${side} ${n} times in a row. On the next toss, which is more likely?`,
        answer: "Heads and tails are equally likely",
        wrong: [wrong(cap(other), "D2"), wrong(cap(side), "streak")],
      };
    },
  },
];
