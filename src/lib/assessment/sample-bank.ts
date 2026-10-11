// Sample bank: levels 2-6, enough for a full grade 3, 4 or 5 test.
// Items follow the curriculum map, section 3; wrong answers follow section 4.
// The full banks replace this: grades 1-2 (#74), 3-5 (#75), 6-7 (#76).
// Other provinces' grades are set only where the curriculum map, section 5, gives them.
import type { Rng } from "./rng";
import type { Filled, Template } from "./types";

/** Draws until `ok` accepts, so a template never yields a question where a wrong answer equals the right one. */
function draw<T>(rng: Rng, make: (rng: Rng) => T, ok: (v: T) => boolean): T {
  for (let i = 0; i < 1000; i++) {
    const v = make(rng);
    if (ok(v)) return v;
  }
  throw new Error("Template could not draw valid numbers");
}

/** 3742 -> "3,742". Answers stay without commas; the marker ignores commas. */
const fmt = (n: number) => n.toLocaleString("en-CA");
/** Fixed decimals without float noise: (725, 2) -> "7.25". */
const dec = (units: number, places: number) => (units / 10 ** places).toFixed(places);

/**
 * Filled.say for choices the voice would read wrong (#79): every value mapped to its words. The read-aloud text never
 * lists the choices; the screen reads them after it, in the order of its buttons.
 */
const sayEach = (values: string[], words: (v: string) => string) => Object.fromEntries(values.map((v) => [v, words(v)]));
/** "7:55" -> "7 55", "8:05 p.m." -> "8 oh 5 p.m.", "8:00 p.m." -> "8 o'clock p.m.", like the templates' read-aloud times. */
const sayTime = (t: string) => t.replace(/:00\b/, " o'clock").replace(/:0(\d)/, " oh $1").replace(":", " ");

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export const SAMPLE_BANK: readonly Template[] = [
  // ---------- Level 2 ----------
  {
    id: "place-value-tens",
    strand: "N", grades: { BC: 2 }, format: "number", whiteboard: false, standard: "2.1",
    fill(rng): Filled {
      const tens = rng.int(2, 9), ones = draw(rng, (r) => r.int(1, 9), (o) => o !== tens);
      const n = tens * 10 + ones;
      return {
        values: { n },
        prompt: `What is the value of the ${tens} in ${n}?`,
        readAloud: `What is the value of the digit ${tens} in the number ${n}?`,
        answer: String(tens * 10),
        wrong: [{ value: String(tens), misconception: "N2" }],
      };
    },
  },
  {
    id: "add-2digit",
    strand: "O", grades: { BC: 2 }, format: "number", whiteboard: true, standard: "2.4",
    fill(rng) {
      // Ones must carry, and the sum stays under 100.
      const [a, b] = draw(rng, (r) => [r.int(15, 69), r.int(15, 39)], ([a, b]) => (a % 10) + (b % 10) >= 10 && a + b < 100);
      return {
        values: { a, b },
        prompt: `${a} + ${b} = ?`,
        readAloud: `What is ${a} plus ${b}?`,
        answer: String(a + b),
        wrong: [{ value: String(a + b - 10), misconception: "O3" }],
      };
    },
  },
  {
    id: "subtract-2digit",
    strand: "O", grades: { BC: 2 }, format: "number", whiteboard: true, standard: "2.4",
    fill(rng) {
      // The ones must need regrouping, so "smaller from larger" gives a different answer.
      const [a, b] = draw(rng, (r) => [r.int(41, 98), r.int(12, 39)], ([a, b]) => a % 10 < b % 10 && a > b);
      const bug = Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) * 10 + Math.abs((a % 10) - (b % 10));
      return {
        values: { a, b },
        prompt: `${a} − ${b} = ?`,
        readAloud: `What is ${a} minus ${b}?`,
        answer: String(a - b),
        wrong: [{ value: String(bug), misconception: "O1" }],
      };
    },
  },
  {
    id: "balance-equation",
    strand: "A", grades: { BC: 2 }, format: "choice", whiteboard: false, standard: "2.7",
    fill(rng) {
      const [a, b, c] = draw(rng, (r) => [r.int(4, 9), r.int(3, 9), r.int(2, 8)], ([a, b, c]) => a + b - c > 0);
      return {
        values: { a, b, c },
        prompt: `${a} + ${b} = ? + ${c}`,
        readAloud: `${a} plus ${b} is the same as what number plus ${c}?`,
        answer: String(a + b - c),
        wrong: [
          { value: String(a + b), misconception: "A1" },
          { value: String(a + b + c), misconception: "A1" },
        ],
      };
    },
  },
  {
    id: "skip-count",
    strand: "A", grades: { BC: 2 }, format: "number", whiteboard: false, standard: "2.5",
    fill(rng) {
      const step = rng.pick([2, 5, 10]), start = rng.int(1, 6) * step;
      const seq = [0, 1, 2, 3].map((i) => start + i * step);
      return {
        values: { start, step },
        prompt: `${seq.join(", ")}, ?`,
        readAloud: `What number comes next? ${seq.join(", ")}.`,
        answer: String(start + 4 * step),
        wrong: [{ value: String(seq[3]), misconception: "A2" }],
      };
    },
  },
  {
    id: "ruler-length",
    strand: "MG", grades: { BC: 2 }, format: "number", whiteboard: false, standard: "2.8",
    fill(rng) {
      const start = rng.int(2, 5), end = start + rng.int(4, 9);
      return {
        values: { start, end },
        prompt: `A pencil starts at the ${start} cm mark of a ruler and ends at the ${end} cm mark. How long is it, in cm?`,
        readAloud: `A pencil starts at the ${start} centimetre mark of a ruler and ends at the ${end} centimetre mark. How many centimetres long is it?`,
        answer: String(end - start),
        wrong: [
          { value: String(end), misconception: "M1" },
          { value: String(end - start + 1), misconception: "M1" },
        ],
      };
    },
  },
  {
    id: "picture-graph-more",
    strand: "DP", grades: { BC: 2 }, format: "number", whiteboard: false, standard: "2.10",
    fill(rng) {
      const dogs = rng.int(5, 9), cats = rng.int(1, dogs - 1);
      return {
        values: { dogs, cats },
        prompt: `A picture graph shows ${dogs} dogs and ${cats} cats. Each picture is 1 pet. How many more dogs than cats?`,
        readAloud: `A picture graph shows ${dogs} dogs and ${cats} cats. Each picture is one pet. How many more dogs are there than cats?`,
        answer: String(dogs - cats),
        wrong: [{ value: String(dogs + cats), misconception: "operation" }],
      };
    },
  },

  // ---------- Level 3 ----------
  {
    id: "number-from-words",
    strand: "N", grades: { BC: 3 }, format: "number", whiteboard: false, standard: "3.1",
    fill(rng) {
      const h = rng.int(2, 9), o = rng.int(1, 9);
      return {
        values: { h, o },
        prompt: `Write the number in digits: ${ONES[h]} hundred ${ONES[o]}`,
        readAloud: `Write the number ${ONES[h]} hundred ${ONES[o]} in digits.`,
        answer: String(h * 100 + o),
        wrong: [
          { value: `${h}00${o}`, misconception: "N1" },
          { value: `${h}${o}`, misconception: "N1" },
        ],
      };
    },
  },
  {
    id: "after-hundred",
    strand: "N", grades: { BC: 3 }, format: "number", whiteboard: false, standard: "3.1",
    fill(rng) {
      const h = rng.int(1, 8);
      return {
        values: { h },
        prompt: `What number comes just after ${h}99?`,
        readAloud: `What number comes just after ${h} hundred ninety-nine?`,
        answer: String((h + 1) * 100),
        wrong: [{ value: `${h}100`, misconception: "N3" }],
      };
    },
  },
  {
    id: "add-3digit",
    strand: "O", grades: { BC: 3 }, format: "number", whiteboard: true, standard: "3.3",
    fill(rng) {
      // Both the ones and the tens carry.
      const [a, b] = draw(
        rng,
        (r) => [r.int(115, 589), r.int(115, 389)],
        ([a, b]) => (a % 10) + (b % 10) >= 10 && (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) >= 9 && a + b < 1000,
      );
      const noCarry = [100, 10, 1].reduce((s, p) => s + ((Math.floor(a / p) % 10) + (Math.floor(b / p) % 10)) % 10 * p, 0);
      return {
        values: { a, b },
        prompt: `${a} + ${b} = ?`,
        readAloud: `What is ${a} plus ${b}?`,
        answer: String(a + b),
        wrong: [{ value: String(noCarry), misconception: "O3" }],
      };
    },
  },
  {
    id: "subtract-across-zero",
    strand: "O", grades: { BC: 3 }, format: "number", whiteboard: true, standard: "3.3",
    fill(rng) {
      const a = rng.int(3, 9) * 100 + rng.int(1, 5); // like 502
      const b = draw(rng, (r) => r.int(1, Math.floor(a / 100) - 1) * 100 + r.int(1, 9) * 10 + r.int(6, 9), (b) => b % 10 > a % 10);
      const digits = (n: number) => [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10];
      const [x, y] = [digits(a), digits(b)];
      const bug = Math.abs(x[0] - y[0]) * 100 + Math.abs(x[1] - y[1]) * 10 + Math.abs(x[2] - y[2]);
      return {
        values: { a, b },
        prompt: `${a} − ${b} = ?`,
        readAloud: `What is ${a} minus ${b}?`,
        answer: String(a - b),
        wrong: [{ value: String(bug), misconception: "O2" }],
      };
    },
  },
  {
    id: "equal-groups",
    strand: "O", grades: { BC: 3 }, format: "number", whiteboard: false, standard: "3.5",
    fill(rng) {
      const groups = rng.int(2, 5), size = rng.int(3, 9);
      return {
        values: { groups, size },
        prompt: `There are ${groups} bags with ${size} apples in each bag. How many apples in all?`,
        readAloud: `There are ${groups} bags with ${size} apples in each bag. How many apples are there in all?`,
        answer: String(groups * size),
        wrong: [{ value: String(groups + size), misconception: "operation" }],
      };
    },
  },
  {
    id: "fraction-eaten",
    strand: "F", grades: { BC: 3 }, format: "choice", whiteboard: false, standard: "3.2",
    fill(rng) {
      const slices = rng.int(5, 10), eaten = rng.int(1, Math.ceil(slices / 2) - 1);
      return {
        values: { slices, eaten },
        prompt: `A pizza is cut into ${slices} equal slices. Maria eats ${eaten}. What fraction of the pizza did she eat?`,
        readAloud: `A pizza is cut into ${slices} equal slices. Maria eats ${eaten}. What fraction of the pizza did she eat?`,
        answer: `${eaten}/${slices}`,
        wrong: [
          { value: `${eaten}/${slices - eaten}`, misconception: "F4" },
          { value: `${slices - eaten}/${slices}`, misconception: "fraction-other-part" },
          { value: `${slices}/${eaten}`, misconception: "fraction-flip" },
        ],
      };
    },
  },
  {
    id: "fraction-of-set",
    strand: "F", grades: { BC: 3 }, format: "choice", whiteboard: false, standard: "3.2",
    fill(rng) {
      const total = rng.int(5, 9), red = rng.int(2, Math.ceil(total / 2) - 1);
      return {
        values: { total, red },
        prompt: `A box has ${total} marbles. ${red} of them are red. What fraction of the marbles are red?`,
        readAloud: `A box has ${total} marbles. ${red} of them are red. What fraction of the marbles are red?`,
        answer: `${red}/${total}`,
        wrong: [
          { value: `${red}/${total - red}`, misconception: "F4" },
          { value: `${total - red}/${total}`, misconception: "fraction-other-part" },
        ],
      };
    },
  },
  {
    id: "missing-addend",
    strand: "A", grades: { BC: 3 }, format: "number", whiteboard: false, standard: "3.8",
    fill(rng) {
      const a = rng.int(11, 39), sum = a + rng.int(4, 19);
      return {
        values: { a, sum },
        prompt: `${a} + ? = ${sum}`,
        readAloud: `${a} plus what number equals ${sum}?`,
        answer: String(sum - a),
        wrong: [{ value: String(a + sum), misconception: "A1" }],
      };
    },
  },
  {
    id: "decreasing-pattern",
    strand: "A", grades: { BC: 3 }, format: "number", whiteboard: false, standard: "3.6",
    fill(rng) {
      const step = rng.int(2, 9), start = step * rng.int(6, 12);
      const seq = [0, 1, 2, 3].map((i) => start - i * step);
      return {
        values: { start, step },
        prompt: `${seq.join(", ")}, ?`,
        readAloud: `What number comes next? ${seq.join(", ")}.`,
        answer: String(start - 4 * step),
        wrong: [{ value: String(seq[3] + step), misconception: "pattern-direction" }],
      };
    },
  },
  {
    id: "area-tiles",
    strand: "MG", grades: { BC: 3 }, format: "number", whiteboard: false, standard: "3.9",
    fill(rng) {
      const [rows, cols] = draw(rng, (r) => [r.int(2, 6), r.int(3, 8)], ([r, c]) => r * c !== 2 * (r + c));
      return {
        values: { rows, cols },
        prompt: `A rectangle is covered by ${rows} rows of ${cols} square tiles. What is its area in square units?`,
        readAloud: `A rectangle is covered by ${rows} rows of ${cols} square tiles. What is its area, in square units?`,
        answer: String(rows * cols),
        wrong: [
          { value: String(rows + cols), misconception: "area-add" },
          { value: String(2 * (rows + cols)), misconception: "M2" },
        ],
      };
    },
  },
  {
    id: "minutes-in-hours",
    strand: "MG", grades: { BC: 3 }, format: "number", whiteboard: false, standard: "3.10",
    fill(rng) {
      const hours = rng.int(2, 5);
      return {
        values: { hours },
        prompt: `How many minutes are in ${hours} hours?`,
        readAloud: `How many minutes are in ${hours} hours?`,
        answer: String(60 * hours),
        wrong: [{ value: String(100 * hours), misconception: "M8" }],
      };
    },
  },
  {
    id: "bar-graph-more",
    strand: "DP", grades: { BC: 3 }, format: "number", whiteboard: false, standard: "3.12",
    fill(rng) {
      const soccer = rng.int(7, 15), swim = rng.int(2, soccer - 1);
      return {
        values: { soccer, swim },
        prompt: `In a bar graph, ${soccer} children chose soccer and ${swim} chose swimming. How many more chose soccer?`,
        readAloud: `In a bar graph, ${soccer} children chose soccer and ${swim} chose swimming. How many more children chose soccer?`,
        answer: String(soccer - swim),
        wrong: [{ value: String(soccer + swim), misconception: "operation" }],
      };
    },
  },
  {
    id: "likely-marble",
    strand: "DP", grades: { BC: 3 }, format: "choice", whiteboard: false, standard: "3.13",
    fill(rng) {
      const blue = rng.int(4, 9);
      return {
        values: { blue },
        prompt: `A bag has ${blue} blue marbles and 1 red marble. You pick one without looking. Picking the red marble is:`,
        readAloud: `A bag has ${blue} blue marbles and 1 red marble. You pick one without looking. How likely is it that you pick the red marble?`,
        answer: "Unlikely",
        wrong: [
          { value: "Impossible", misconception: "D6" },
          { value: "Certain", misconception: "certain" },
        ],
      };
    },
  },

  // ---------- Level 4 ----------
  {
    id: "place-value-hundreds",
    strand: "N", grades: { BC: 4 }, format: "number", whiteboard: false, standard: "4.1",
    fill(rng) {
      const [th, h, t, o] = draw(rng, (r) => [r.int(1, 9), r.int(2, 9), r.int(0, 9), r.int(0, 9)], ([th, h, t, o]) => h !== th && h !== t && h !== o);
      const n = th * 1000 + h * 100 + t * 10 + o;
      return {
        values: { n },
        prompt: `What is the value of the ${h} in ${fmt(n)}?`,
        readAloud: `What is the value of the digit ${h} in the number ${n}?`,
        answer: String(h * 100),
        wrong: [
          { value: String(h), misconception: "N2" },
          { value: String(h * 10), misconception: "N2" },
        ],
      };
    },
  },
  {
    id: "multiply-2by1",
    strand: "O", grades: { BC: 4 }, format: "number", whiteboard: true, standard: "4.5",
    fill(rng) {
      const [a, m] = draw(rng, (r) => [r.int(13, 49), r.int(3, 8)], ([a, m]) => (a % 10) * m >= 10);
      const tens = Math.floor(a / 10), ones = a % 10;
      return {
        values: { a, m },
        prompt: `${a} × ${m} = ?`,
        readAloud: `What is ${a} times ${m}?`,
        answer: String(a * m),
        wrong: [{ value: `${tens * m}${ones * m}`, misconception: "O5" }],
      };
    },
  },
  {
    id: "divide-zero-quotient",
    strand: "O", grades: { BC: 4 }, format: "number", whiteboard: true, standard: "4.5",
    fill(rng) {
      const q = 100 + rng.int(1, 9), d = rng.int(3, 9);
      return {
        values: { dividend: q * d, divisor: d },
        prompt: `${q * d} ÷ ${d} = ?`,
        readAloud: `What is ${q * d} divided by ${d}?`,
        answer: String(q),
        wrong: [{ value: String(10 + (q % 10)), misconception: "O6" }],
      };
    },
  },
  {
    id: "add-decimals",
    strand: "O", grades: { BC: 4 }, format: "number", whiteboard: true, standard: "4.6",
    fill(rng) {
      // a has hundredths, b has tenths: 3.45 + 2.8
      const a = draw(rng, (r) => r.int(105, 799), (a) => a % 10 !== 0), b = rng.int(11, 59);
      return {
        values: { aHundredths: a, bTenths: b },
        prompt: `${dec(a, 2)} + ${dec(b, 1)} = ?`,
        readAloud: `What is ${dec(a, 2)} plus ${dec(b, 1)}?`,
        answer: dec(a + 10 * b, 2),
        wrong: [{ value: dec(a + b, 2), misconception: "O8" }],
      };
    },
  },
  {
    id: "compare-unit-fractions",
    strand: "F", grades: { BC: 4 }, format: "choice", whiteboard: false, standard: "4.3",
    fill(rng) {
      const small = rng.int(2, 5), big = rng.int(small + 2, 10);
      return {
        values: { small, big },
        prompt: `Which fraction is larger: 1/${small} or 1/${big}?`,
        readAloud: "Which fraction is larger?",
        answer: `1/${small}`,
        wrong: [{ value: `1/${big}`, misconception: "F1" }],
      };
    },
  },
  {
    id: "tenths-as-decimal",
    strand: "F", grades: { BC: 4 }, format: "choice", whiteboard: false, standard: "4.2",
    fill(rng) {
      const k = rng.int(1, 9);
      return {
        values: { k },
        prompt: `Which decimal equals ${k}/10?`,
        readAloud: `Which decimal equals ${k} tenths?`,
        answer: `0.${k}`,
        wrong: [
          { value: `${k}.10`, misconception: "F7" },
          { value: `0.0${k}`, misconception: "decimal-point" },
          { value: `${k}.0`, misconception: "decimal-point" },
        ],
      };
    },
  },
  {
    id: "table-rule",
    strand: "A", grades: { BC: 4 }, format: "number", whiteboard: false, standard: "4.9",
    fill(rng) {
      const [step, start] = draw(rng, (r) => [r.int(2, 5), r.int(1, 6)], ([s, st]) => s !== st + 1);
      const out = [1, 2, 3, 4].map((n) => step * n + start);
      return {
        values: { step, start },
        prompt: `Input 1, 2, 3, 4 gives output ${out.join(", ")}. What is the output for input 5?`,
        readAloud: `In a table, the inputs 1, 2, 3 and 4 give the outputs ${out.join(", ")}. What is the output for input 5?`,
        answer: String(5 * step + start),
        wrong: [
          { value: String(5 * step), misconception: "A5" },
          { value: String(out[3] + 1), misconception: "A2" },
        ],
      };
    },
  },
  {
    id: "missing-factor",
    strand: "A", grades: { BC: 4, ON: 3 }, format: "number", whiteboard: false, standard: "4.11",
    fill(rng) {
      const a = rng.int(2, 9), x = rng.int(3, 9);
      return {
        values: { a, x },
        prompt: `? × ${a} = ${a * x}`,
        readAloud: `What number times ${a} equals ${a * x}?`,
        answer: String(x),
        wrong: [{ value: String(a * x - a), misconception: "operation" }],
      };
    },
  },
  {
    id: "rectangle-perimeter",
    strand: "MG", grades: { BC: 4 }, format: "number", whiteboard: false, standard: "4.14",
    fill(rng) {
      const [l, w] = draw(rng, (r) => [r.int(5, 12), r.int(2, 7)], ([l, w]) => l !== w && l * w !== 2 * (l + w));
      return {
        values: { l, w },
        prompt: `A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter, in cm?`,
        readAloud: `A rectangle is ${l} centimetres long and ${w} centimetres wide. What is its perimeter, in centimetres?`,
        answer: String(2 * (l + w)),
        wrong: [
          { value: String(l * w), misconception: "M2" },
          { value: String(l + w), misconception: "M2" },
        ],
      };
    },
  },
  {
    id: "read-clock",
    strand: "MG", grades: { BC: 4, AB: 3, ON: 3 }, format: "choice", whiteboard: false, standard: "4.12",
    fill(rng) {
      const h = rng.int(1, 11), k = rng.int(2, 11);
      const mm = String(5 * k).padStart(2, "0");
      return {
        values: { h, k },
        prompt: `On a clock, the hour hand is just past the ${h} and the minute hand points to the ${k}. What time is it?`,
        readAloud: `On a clock, the hour hand is just past the ${h} and the minute hand points to the ${k}. What time is it?`,
        answer: `${h}:${mm}`,
        wrong: [
          { value: `${h}:${String(k).padStart(2, "0")}`, misconception: "M7" },
          { value: `${h + 1}:${mm}`, misconception: "M7" },
        ],
        say: sayEach([`${h}:${mm}`, `${h}:${String(k).padStart(2, "0")}`, `${h + 1}:${mm}`], sayTime),
      };
    },
  },
  {
    id: "pictograph-key",
    strand: "DP", grades: { BC: 4 }, format: "number", whiteboard: false, standard: "4.16",
    fill(rng) {
      const [each, symbols] = draw(rng, (r) => [r.pick([2, 5, 10]), r.int(3, 8)], ([e, s]) => e * s !== e + s);
      return {
        values: { each, symbols },
        prompt: `In a pictograph, each symbol means ${each} students. Soccer has ${symbols} symbols. How many students chose soccer?`,
        readAloud: `In a pictograph, each symbol means ${each} students. Soccer has ${symbols} symbols. How many students chose soccer?`,
        answer: String(each * symbols),
        wrong: [
          { value: String(symbols), misconception: "D1" },
          { value: String(each + symbols), misconception: "D1" },
        ],
      };
    },
  },

  // ---------- Level 5 ----------
  {
    id: "ten-thousand-more",
    strand: "N", grades: { BC: 5 }, format: "number", whiteboard: false, standard: "5.1",
    fill(rng) {
      const n = rng.int(10, 89) * 10000 + rng.int(0, 9) * 1000 + rng.int(1, 9) * 100;
      return {
        values: { n },
        prompt: `What is 10,000 more than ${fmt(n)}?`,
        readAloud: `What number is ten thousand more than ${n}?`,
        answer: String(n + 10000),
        wrong: [
          { value: String(n + 1000), misconception: "N2" },
          { value: String(n + 100000), misconception: "N2" },
        ],
      };
    },
  },
  {
    id: "multiply-2by2",
    strand: "O", grades: { BC: 5 }, format: "number", whiteboard: true, standard: "5.6",
    fill(rng) {
      const a = rng.int(23, 79), b = rng.int(21, 49);
      const tens = Math.floor(b / 10), ones = b % 10;
      return {
        values: { a, b },
        prompt: `${a} × ${b} = ?`,
        readAloud: `What is ${a} times ${b}?`,
        answer: String(a * b),
        wrong: [{ value: String(a * ones + a * tens), misconception: "partial-shift" }],
      };
    },
  },
  {
    id: "subtract-decimals",
    strand: "O", grades: { BC: 5 }, format: "number", whiteboard: true, standard: "5.7",
    fill(rng) {
      // a has thousandths, b has hundredths: 12.304 - 4.75
      const a = draw(rng, (r) => r.int(8001, 15999), (a) => a % 10 !== 0), b = draw(rng, (r) => r.int(201, 699), (b) => b % 10 !== 0);
      return {
        values: { aThousandths: a, bHundredths: b },
        prompt: `${dec(a, 3)} − ${dec(b, 2)} = ?`,
        readAloud: `What is ${dec(a, 3)} minus ${dec(b, 2)}?`,
        answer: dec(a - 10 * b, 3),
        wrong: [{ value: dec(a - b, 3), misconception: "O8" }],
      };
    },
  },
  {
    id: "equivalent-fraction",
    strand: "F", grades: { BC: 5 }, format: "choice", whiteboard: false, standard: "5.3",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(1, 4), r.int(3, 7)], ([a, b]) => a < b);
      const k = rng.int(2, 4);
      return {
        values: { a, b, k },
        prompt: `Which fraction equals ${a}/${b}?`,
        readAloud: `Which fraction is equal to ${a} out of ${b}?`,
        answer: `${a * k}/${b * k}`,
        wrong: [
          { value: `${a + k}/${b + k}`, misconception: "F9" },
          { value: `${a}/${b * k}`, misconception: "fraction-one-side" },
          { value: `${a * k}/${b}`, misconception: "fraction-one-side" },
        ],
      };
    },
  },
  {
    id: "compare-decimals",
    strand: "F", grades: { BC: 5 }, format: "choice", whiteboard: false, standard: "5.4",
    fill(rng) {
      const d = rng.int(3, 9), longer = rng.int(10, d * 10 - 1);
      return {
        values: { d, longer },
        prompt: `Which number is greater: 0.${d} or ${dec(longer, 2)}?`,
        readAloud: "Which number is greater?",
        answer: `0.${d}`,
        wrong: [{ value: dec(longer, 2), misconception: "F6" }],
      };
    },
  },
  {
    id: "function-rule",
    strand: "A", grades: { BC: 5 }, format: "number", whiteboard: false, standard: "5.10",
    fill(rng) {
      const [a, b, n] = draw(rng, (r) => [r.int(2, 6), r.int(1, 9), r.int(4, 9)], ([a, b, n]) => a * (n + b) !== a * n + b);
      return {
        values: { a, b, n },
        prompt: `Rule: output = ${a} × input + ${b}. What is the output for input ${n}?`,
        readAloud: `The rule is: output equals ${a} times the input, plus ${b}. What is the output when the input is ${n}?`,
        answer: String(a * n + b),
        wrong: [
          { value: String(a * n), misconception: "A5" },
          { value: String(a * (n + b)), misconception: "O7" },
        ],
      };
    },
  },
  {
    id: "start-unknown",
    strand: "A", grades: { BC: 5 }, format: "number", whiteboard: false, standard: "5.11",
    fill(rng) {
      const [a, c] = draw(rng, (r) => [r.int(6, 25), r.int(3, 30)], ([a, c]) => a !== c);
      return {
        values: { a, c },
        prompt: `x − ${a} = ${c}. What is x?`,
        readAloud: `x minus ${a} equals ${c}. What is x?`,
        answer: String(a + c),
        wrong: [{ value: String(Math.abs(c - a)), misconception: "A4" }],
      };
    },
  },
  {
    id: "rectangle-area",
    strand: "MG", grades: { BC: 5 }, format: "number", whiteboard: false, standard: "5.12",
    fill(rng) {
      const [l, w] = draw(rng, (r) => [r.int(6, 12), r.int(3, 9)], ([l, w]) => l * w !== 2 * (l + w));
      return {
        values: { l, w },
        prompt: `A rectangle is ${l} m long and ${w} m wide. What is its area, in square metres?`,
        readAloud: `A rectangle is ${l} metres long and ${w} metres wide. What is its area, in square metres?`,
        answer: String(l * w),
        wrong: [
          { value: String(2 * (l + w)), misconception: "M2" },
          { value: String(l + w), misconception: "area-add" },
        ],
      };
    },
  },
  {
    id: "elapsed-time",
    strand: "MG", grades: { BC: 5 }, format: "choice", whiteboard: true, standard: "5.14",
    fill(rng) {
      const h = rng.int(1, 9);
      const [m, add] = draw(rng, (r) => [r.int(7, 11) * 5, r.int(3, 8) * 5], ([m, add]) => m + add >= 60); // crosses the hour
      const total = m + add;
      return {
        values: { h, m, add },
        prompt: `A movie starts at ${h}:${m} p.m. and lasts 1 hour ${add} minutes. When does it end?`,
        readAloud: `A movie starts at ${h} ${m} p.m. and lasts 1 hour and ${add} minutes. When does it end?`,
        answer: `${h + 2}:${String(total - 60).padStart(2, "0")} p.m.`,
        wrong: [
          { value: `${h + 1}:${total} p.m.`, misconception: "M8" },
          { value: `${h + 1}:${String(total - 60).padStart(2, "0")} p.m.`, misconception: "O3" },
        ],
        say: sayEach([`${h + 2}:${String(total - 60).padStart(2, "0")} p.m.`, `${h + 1}:${total} p.m.`, `${h + 1}:${String(total - 60).padStart(2, "0")} p.m.`], sayTime),
      };
    },
  },
  {
    id: "spinner-probability",
    strand: "DP", grades: { BC: 5 }, format: "choice", whiteboard: false, standard: "5.18",
    fill(rng) {
      const parts = rng.int(5, 10), red = rng.int(1, Math.ceil(parts / 2) - 1);
      return {
        values: { parts, red },
        prompt: `A spinner has ${parts} equal parts. ${red} are red, the rest are blue. What is the probability of landing on red?`,
        readAloud: `A spinner has ${parts} equal parts. ${red} are red, and the rest are blue. What is the probability of landing on red?`,
        answer: `${red}/${parts}`,
        wrong: [
          { value: `${red}/${parts - red}`, misconception: "D4" },
          { value: `${parts - red}/${parts}`, misconception: "probability-other" },
        ],
      };
    },
  },
  {
    id: "double-bar-scale",
    strand: "DP", grades: { BC: 5 }, format: "number", whiteboard: false, standard: "5.17",
    fill(rng) {
      const scale = rng.pick([2, 5, 10]), a = rng.int(5, 9), b = rng.int(2, a - 1);
      return {
        values: { scale, a, b },
        prompt: `In a double bar graph, each grid line is ${scale} students. The grade 5 bar reaches ${a} lines and the grade 4 bar reaches ${b} lines. How many more students are in grade 5?`,
        readAloud: `In a double bar graph, each grid line means ${scale} students. The grade 5 bar reaches ${a} lines, and the grade 4 bar reaches ${b} lines. How many more students are in grade 5?`,
        answer: String((a - b) * scale),
        wrong: [{ value: String(a - b), misconception: "D1" }],
      };
    },
  },

  // ---------- Level 6 ----------
  {
    id: "least-common-multiple",
    strand: "N", grades: { BC: 6 }, format: "number", whiteboard: false, standard: "6.4",
    fill(rng) {
      const [a, b, lcm] = rng.pick([[4, 6, 12], [6, 8, 24], [6, 9, 18], [4, 10, 20], [8, 12, 24], [10, 15, 30], [6, 10, 30], [9, 12, 36]]);
      return {
        values: { a, b },
        prompt: `What is the least common multiple of ${a} and ${b}?`,
        readAloud: `What is the least common multiple of ${a} and ${b}?`,
        answer: String(lcm),
        wrong: [{ value: String(a * b), misconception: "lcm-product" }],
      };
    },
  },
  {
    id: "pick-the-prime",
    strand: "N", grades: { BC: 6 }, format: "choice", whiteboard: false, standard: "6.4",
    fill(rng) {
      const prime = rng.pick([17, 19, 23, 29, 31, 37]);
      const odd = rng.shuffle([9, 15, 21, 25, 27, 33, 35, 39]).slice(0, 3);
      return {
        values: { prime },
        prompt: `Which number is prime?`,
        readAloud: `Which of these numbers is prime?`,
        answer: String(prime),
        wrong: odd.map((n) => ({ value: String(n), misconception: "N5" as const })),
      };
    },
  },
  {
    id: "order-of-operations",
    strand: "O", grades: { BC: 6 }, format: "number", whiteboard: true, standard: "6.3",
    fill(rng) {
      const a = rng.int(2, 9), b = rng.int(2, 9), c = rng.int(2, 9);
      return {
        values: { a, b, c },
        prompt: `${a} + ${b} × ${c} = ?`,
        readAloud: `What is ${a} plus ${b} times ${c}?`,
        answer: String(a + b * c),
        wrong: [{ value: String((a + b) * c), misconception: "O7" }],
      };
    },
  },
  {
    id: "decimal-times-whole",
    strand: "O", grades: { BC: 6 }, format: "number", whiteboard: true, standard: "6.8",
    fill(rng) {
      const tenths = draw(rng, (r) => r.int(11, 49), (t) => t % 10 !== 0), n = rng.int(3, 9);
      return {
        values: { tenths, n },
        prompt: `${dec(tenths, 1)} × ${n} = ?`,
        readAloud: `What is ${dec(tenths, 1)} times ${n}?`,
        answer: dec(tenths * n, 1),
        wrong: [
          { value: String(tenths * n), misconception: "decimal-point" },
          { value: dec(tenths * n, 2), misconception: "decimal-point" },
        ],
      };
    },
  },
  {
    id: "percent-of",
    strand: "F", grades: { BC: 6, ON: 5 }, format: "number", whiteboard: true, standard: "6.7",
    fill(rng) {
      const [p, n] = draw(rng, (r) => [r.pick([10, 20, 25, 50]), r.int(2, 9) * 20], ([p, n]) => (p * n) / 100 !== n - p);
      return {
        values: { p, n },
        prompt: `${p}% of ${n} = ?`,
        readAloud: `What is ${p} percent of ${n}?`,
        answer: String((p * n) / 100),
        wrong: [{ value: String(n - p), misconception: "F10" }],
      };
    },
  },
  {
    id: "mixed-to-improper",
    strand: "F", grades: { BC: 6 }, format: "choice", whiteboard: false, standard: "6.5",
    fill(rng) {
      const d = rng.int(3, 9), n = rng.int(1, d - 1), w = rng.int(2, 5);
      return {
        values: { w, n, d },
        prompt: `Write ${w} ${n}/${d} as an improper fraction.`,
        readAloud: `Write ${w} and ${n} out of ${d} as an improper fraction.`,
        answer: `${w * d + n}/${d}`,
        wrong: [
          { value: `${w}${n}/${d}`, misconception: "F8" },
          { value: `${w + n}/${d}`, misconception: "F8" },
        ],
      };
    },
  },
  {
    id: "ratio-of-parts",
    strand: "F", grades: { BC: 6 }, format: "choice", whiteboard: false, standard: "6.6",
    fill(rng) {
      const [red, blue] = draw(rng, (r) => [r.int(2, 9), r.int(2, 9)], ([r, b]) => r !== b);
      return {
        values: { red, blue },
        prompt: `A bag has ${red} red and ${blue} blue marbles. What is the ratio of red to blue?`,
        readAloud: `A bag has ${red} red marbles and ${blue} blue marbles. What is the ratio of red marbles to blue marbles?`,
        answer: `${red}:${blue}`,
        wrong: [
          { value: `${blue}:${red}`, misconception: "ratio-order" },
          { value: `${red}:${red + blue}`, misconception: "ratio-whole" },
        ],
        say: sayEach([`${red}:${blue}`, `${blue}:${red}`, `${red}:${red + blue}`], (v) => v.replace(":", " to ")),
      };
    },
  },
  {
    id: "nth-term",
    strand: "A", grades: { BC: 6 }, format: "number", whiteboard: true, standard: "6.9",
    fill(rng) {
      const a = rng.int(2, 5), b = rng.int(1, 7), n = rng.int(10, 20);
      const seq = [1, 2, 3, 4].map((i) => a * i + b);
      return {
        values: { a, b, n },
        prompt: `The pattern ${seq.join(", ")}, ... follows the rule ${a}n + ${b}. What is term number ${n}?`,
        readAloud: `The pattern ${seq.join(", ")} follows the rule ${a} n plus ${b}. What is term number ${n}?`,
        answer: String(a * n + b),
        wrong: [{ value: String(a * n), misconception: "A5" }],
      };
    },
  },
  {
    id: "one-step-equation",
    strand: "A", grades: { BC: 6 }, format: "number", whiteboard: false, standard: "6.10",
    fill(rng) {
      const a = rng.int(3, 9), x = rng.int(3, 12);
      return {
        values: { a, x },
        prompt: `${a}x = ${a * x}. What is x?`,
        readAloud: `${a} times x equals ${a * x}. What is x?`,
        answer: String(x),
        wrong: [{ value: String(a * x - a), misconception: "operation" }],
      };
    },
  },
  {
    id: "triangle-area",
    strand: "MG", grades: { BC: 6 }, format: "number", whiteboard: true, standard: "6.12",
    fill(rng) {
      const [base, height] = draw(rng, (r) => [r.int(4, 14), r.int(3, 10)], ([b, h]) => (b * h) % 2 === 0);
      return {
        values: { base, height },
        prompt: `A triangle has a base of ${base} cm and a height of ${height} cm. What is its area, in square cm?`,
        readAloud: `A triangle has a base of ${base} centimetres and a height of ${height} centimetres. What is its area, in square centimetres?`,
        answer: String((base * height) / 2),
        wrong: [{ value: String(base * height), misconception: "M3" }],
      };
    },
  },
  {
    id: "box-volume",
    strand: "MG", grades: { BC: 6 }, format: "number", whiteboard: false, standard: "6.14",
    fill(rng) {
      const [l, w, h] = draw(rng, (r) => [r.int(3, 8), r.int(2, 6), r.int(2, 5)], ([l, w, h]) => l * w * h !== 2 * (l * w + l * h + w * h));
      return {
        values: { l, w, h },
        prompt: `A box is ${l} cm by ${w} cm by ${h} cm. What is its volume, in cubic cm?`,
        readAloud: `A box is ${l} centimetres by ${w} centimetres by ${h} centimetres. What is its volume, in cubic centimetres?`,
        answer: String(l * w * h),
        wrong: [
          { value: String(l + w + h), misconception: "M9" },
          { value: String(2 * (l * w + l * h + w * h)), misconception: "M9" },
        ],
      };
    },
  },
  {
    id: "theoretical-probability",
    strand: "DP", grades: { BC: 6 }, format: "choice", whiteboard: false, standard: "6.18",
    fill(rng) {
      const heads = rng.pick([2, 3, 4, 6, 7, 8]);
      return {
        values: { heads },
        prompt: `A coin landed heads ${heads} times in 10 tosses. What is the theoretical probability of heads?`,
        readAloud: `A coin landed heads ${heads} times in 10 tosses. What is the theoretical probability of heads?`,
        answer: "1/2",
        wrong: [
          { value: `${heads}/10`, misconception: "D5" },
          { value: `${10 - heads}/10`, misconception: "D5" },
        ],
      };
    },
  },
  {
    id: "line-graph-rise",
    strand: "DP", grades: { BC: 6 }, format: "number", whiteboard: false, standard: "6.17",
    fill(rng) {
      const noon = rng.int(8, 16), later = noon + rng.int(3, 9);
      return {
        values: { noon, later },
        prompt: `A line graph shows ${noon}°C at noon and ${later}°C at 3 p.m. How many degrees did the temperature rise?`,
        readAloud: `A line graph shows ${noon} degrees at noon and ${later} degrees at 3 p.m. How many degrees did the temperature rise?`,
        answer: String(later - noon),
        wrong: [{ value: String(later), misconception: "graph-value" }],
      };
    },
  },
];
