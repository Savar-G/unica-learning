// Level 7 (BC grade 7) for the grades 6-7 bank: stage 1 for a grade 7 child, and the "up" form for a grade 6 child.
// Standards: curriculum map, section 1 (7.1-7.13); example items: section 3, grade 7. Province tags: see ./index.ts.
// BC has no grade 7 number-sense standard: comparing and ordering negative numbers is implied by 7.2 (map, 2.5).
import { draw, NAMES, wrong, type TaggedTemplate } from "../kit";
import { distinct, distinctNumbers, fmt, frac, fracText, gcd, money, num, sayFrac, sayMoney, sayNum, typed } from "./helpers";

const point = (x: number, y: number) => `(${num(x)}, ${num(y)})`;
const sayPoint = (x: number, y: number) => `${sayNum(x)}, ${sayNum(y)}`;
/** An integer in brackets when it is negative, as in 4 − (−3). */
const bracket = (n: number) => (n < 0 ? `(${num(n)})` : num(n));

export const LEVEL_7: readonly TaggedTemplate[] = [
  // ---------- Number and operations ----------
  {
    // Map, grade 7 and misconception N6: which is greater, -3 or -8.
    id: "g67-7-greatest-integer",
    strand: "N", grades: { BC: 7, AB: 7, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "7.2",
    fill(rng) {
      const values = rng.shuffle(Array.from({ length: 15 }, (_, i) => -(i + 1))).slice(0, 2);
      const answer = Math.max(...values);
      return {
        values: { a: values[0], b: values[1] },
        prompt: `Compare ${num(values[0])} and ${num(values[1])}. Which number is the greatest?`,
        readAloud: `Compare ${sayNum(values[0])} and ${sayNum(values[1])}. Which number is the greatest?`,
        answer: num(answer),
        wrong: [wrong(num(Math.min(...values)), "N6"), wrong("These numbers are equal", "negative-equal")],
      };
    },
  },
  {
    // Order integers from least to greatest.
    id: "g67-7-order-integers",
    strand: "N", grades: { BC: 7, AB: 7, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "7.2",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [-g.int(2, 12), -g.int(2, 12)], ([a, b]) => a < b);
      const c = rng.int(0, 1) === 1 ? 0 : -1 * 0 + rng.int(1, 4), d = rng.int(5, 15);
      const list = (xs: number[]) => xs.map(num).join(", ");
      return {
        values: { a, b, c, d },
        prompt: "Which list is in order from least to greatest?",
        readAloud: "Which list of numbers is in order from least to greatest?",
        answer: list([a, b, c, d]),
        wrong: [
          wrong(list([b, a, c, d]), "N6"),
          wrong(list([c, b, d, a].sort((x, y) => Math.abs(x) - Math.abs(y))), "absolute-order"),
          wrong(list([d, c, b, a]), "more-less"),
        ],
      };
    },
  },
  {
    // Map, grade 7: -7 + 12 (misconception O9).
    id: "g67-7-add-integers",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.2",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(-15, 15), g.int(-15, 15)], ([a, b]) =>
        a !== 0 && b !== 0 && (a < 0 || b < 0) && Math.abs(a) !== Math.abs(b) &&
        distinctNumbers([a + b, -(Math.abs(a) + Math.abs(b)), Math.sign(a) * Math.abs(Math.abs(a) - Math.abs(b)) || 99, Math.abs(a) + Math.abs(b)]));
      const answer = a + b;
      // The wrong sign: the size is right but the sign comes from the first number.
      const firstSign = Math.sign(a) * Math.abs(answer);
      const wrongs = [wrong(num(Math.abs(a) + Math.abs(b)), "O9"), wrong(num(-(Math.abs(a) + Math.abs(b))), "O9"), wrong(num(-answer), "O9")];
      if (firstSign !== answer) wrongs[2] = wrong(num(firstSign), "O9");
      return {
        values: { a, b },
        prompt: `${num(a)} + ${bracket(b)} = ?`,
        readAloud: `What is ${sayNum(a)} plus ${sayNum(b)}?`,
        answer: num(answer),
        wrong: wrongs.filter((w, i, all) => w.value !== num(answer) && all.findIndex((x) => x.value === w.value) === i),
      };
    },
  },
  {
    // Map, grade 7: 4 - (-3) = 7 (misconception O9 reads it as 4 - 3).
    id: "g67-7-subtract-integers",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.2",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(-12, 12), -g.int(2, 12)], ([a, b]) => a !== 0 && distinctNumbers([a - b, a + b, -(a - b), b - a - 2 * a]));
      return {
        values: { a, b },
        prompt: `${num(a)} − ${bracket(b)} = ?`,
        readAloud: `What is ${sayNum(a)} minus ${sayNum(b)}?`,
        answer: num(a - b),
        wrong: [wrong(num(a + b), "O9"), wrong(num(-(a - b)), "O9"), wrong(num(-a + b), "O9")].filter((w, i, all) => w.value !== num(a - b) && all.findIndex((x) => x.value === w.value) === i),
      };
    },
  },
  {
    // Map, grade 7: (-6) x (-4) = 24. WNCP multiplies integers in grade 8.
    id: "g67-7-multiply-integers",
    strand: "O", grades: { BC: 7, AB: 8, SK: 8, MB: 8, ON: 8 }, format: "choice", whiteboard: true, standard: "7.2",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(-9, 9), g.int(-9, 9)], ([a, b]) => Math.abs(a) >= 2 && Math.abs(b) >= 2 && (a < 0 || b < 0) &&
        distinctNumbers([a * b, -a * b, a + b, Math.abs(a) + Math.abs(b)]));
      return {
        values: { a, b },
        prompt: `${bracket(a)} × ${bracket(b)} = ?`,
        readAloud: `What is ${sayNum(a)} times ${sayNum(b)}?`,
        answer: num(a * b),
        wrong: [wrong(num(-a * b), "sign-rule"), wrong(num(a + b), "operation")],
      };
    },
  },
  {
    id: "g67-7-divide-integers",
    strand: "O", grades: { BC: 7, AB: 8, SK: 8, MB: 8, ON: 8 }, format: "choice", whiteboard: true, standard: "7.2",
    fill(rng) {
      const [q, b] = draw(rng, (g) => [g.int(-12, 12), g.int(-9, 9)], ([q, b]) => Math.abs(q) >= 2 && Math.abs(b) >= 2 && (q < 0 || b < 0) &&
        distinctNumbers([q, -q, q * b - b, q * b * b]));
      const a = q * b;
      return {
        values: { a, b },
        prompt: `${num(a)} ÷ ${bracket(b)} = ?`,
        readAloud: `What is ${sayNum(a)} divided by ${sayNum(b)}?`,
        answer: num(q),
        wrong: [wrong(num(-q), "sign-rule"), wrong(num(a - b), "operation"), wrong(num(a * b), "operation")],
      };
    },
  },
  {
    // 7.2 in a context: temperature.
    id: "g67-7-temperature",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.2",
    fill(rng) {
      const [t, change] = draw(rng, (g) => [-g.int(2, 15), g.int(3, 20)], ([t, c]) => t + c !== 0 && Math.abs(t) !== c);
      const rises = rng.int(0, 1) === 1;
      const answer = rises ? t + change : t - change;
      return {
        values: { t, change, rises: rises ? 1 : 0 },
        prompt: `The temperature is ${num(t)}°C. It ${rises ? "rises" : "falls"} by ${change} degrees. What is the new temperature, in degrees Celsius?`,
        readAloud: `The temperature is ${sayNum(t)} degrees Celsius. It ${rises ? "rises" : "falls"} by ${change} degrees. What is the new temperature, in degrees Celsius?`,
        answer: num(answer),
        wrong: [wrong(num(rises ? t - change : t + change), "O9"), wrong(num(Math.abs(t) + change), "O9"), wrong(num(t), "one-part")],
      };
    },
  },
  {
    // 7.2: order of operations with integers.
    id: "g67-7-integer-order-of-operations",
    strand: "O", grades: { BC: 7, AB: 8, SK: 8, MB: 8, ON: 8 }, format: "choice", whiteboard: true, standard: "7.2",
    fill(rng) {
      const [a, b, c] = draw(rng, (g) => [g.int(-9, 9), g.int(2, 6), -g.int(2, 5)], ([a, b, c]) => a !== 0 &&
        distinctNumbers([a + b * c, (a + b) * c, a - b * c, a + b - c]));
      return {
        values: { a, b, c },
        prompt: `${num(a)} + ${b} × ${bracket(c)} = ?`,
        readAloud: `What is ${sayNum(a)} plus ${b} times ${sayNum(c)}?`,
        answer: num(a + b * c),
        wrong: [wrong(num((a + b) * c), "O7"), wrong(num(a - b * c), "sign-rule"), wrong(num(a + b - c), "operation")],
      };
    },
  },
  {
    // Map, grade 7: 5.6 x 0.3.
    id: "g67-7-decimal-multiply",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.3",
    fill(rng) {
      const a10 = draw(rng, (g) => g.int(11, 99), (v) => v % 10 !== 0), b10 = rng.int(2, 9);
      const answer = (a10 * b10) / 100;
      return {
        values: { a10, b10 },
        prompt: `${fmt(a10 / 10)} × ${fmt(b10 / 10)} = ?`,
        readAloud: `What is ${fmt(a10 / 10)} times ${fmt(b10 / 10)}?`,
        answer: typed(answer),
        wrong: [wrong(typed(answer * 10), "decimal-point"), wrong(typed(answer / 10), "decimal-point")],
      };
    },
  },
  {
    // 7.3: division by a decimal, as in 4.2 / 0.6.
    id: "g67-7-decimal-divide",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.3",
    fill(rng) {
      const d10 = rng.int(2, 9), q = rng.int(2, 12);
      return {
        values: { d10, q },
        prompt: `${fmt((d10 * q) / 10)} ÷ ${fmt(d10 / 10)} = ?`,
        readAloud: `What is ${fmt((d10 * q) / 10)} divided by ${fmt(d10 / 10)}?`,
        answer: String(q),
        wrong: [wrong(typed(q / 10), "decimal-point"), wrong(q * 10, "decimal-point")],
      };
    },
  },
  {
    // Map, misconception O4: 12 / 0.5 is more than 12.
    id: "g67-7-bigger-or-smaller",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.3",
    fill(rng) {
      const n = rng.int(6, 60), d = rng.pick([0.2, 0.25, 0.4, 0.5, 0.75, 0.8]), divide = rng.int(0, 1) === 1;
      const more = divide;
      return {
        values: { n, d100: Math.round(d * 100), divide: divide ? 1 : 0 },
        prompt: `Without working it out: is ${n} ${divide ? "÷" : "×"} ${fmt(d)} more than ${n}, less than ${n} or equal to ${n}?`,
        readAloud: `Without working it out, how does ${n} ${divide ? "divided by" : "times"} ${fmt(d)} compare with ${n}?`,
        answer: more ? `More than ${n}` : `Less than ${n}`,
        wrong: [wrong(more ? `Less than ${n}` : `More than ${n}`, "O4"), wrong(`Equal to ${n}`, "same-size")],
      };
    },
  },
  {
    // 7.3: order of operations with decimals.
    id: "g67-7-decimal-order-of-operations",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.3",
    fill(rng) {
      const a10 = draw(rng, (g) => g.int(11, 99), (v) => v % 10 !== 0), b10 = draw(rng, (g) => g.int(11, 49), (v) => v % 10 !== 0), c = rng.int(2, 6);
      const answer = (a10 + b10 * c) / 10;
      return {
        values: { a10, b10, c },
        prompt: `${fmt(a10 / 10)} + ${fmt(b10 / 10)} × ${c} = ?`,
        readAloud: `What is ${fmt(a10 / 10)} plus ${fmt(b10 / 10)} times ${c}?`,
        answer: typed(answer),
        wrong: [wrong(typed(((a10 + b10) * c) / 10), "O7")],
      };
    },
  },
  {
    // Map, 7.1: 214 x 5 is 2140 / 2 = 1070.
    id: "g67-7-times-five",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.1",
    fill(rng) {
      const [a, m] = draw(rng, (g) => [g.int(102, 998), g.pick([5, 50])], ([a]) => a % 2 === 0 && a % 10 !== 0);
      const answer = a * m;
      return {
        values: { a, m },
        prompt: `${a} × ${m} = ?`,
        readAloud: `What is ${a} times ${m}?`,
        answer: String(answer),
        // Multiplies by 10 (or 100) but forgets to halve; or halves but forgets to multiply.
        wrong: [wrong(answer * 2, "method-step"), wrong(a / 2, "method-step")],
      };
    },
  },
  {
    // 7.3 in a money context: several items and change.
    id: "g67-7-change-several",
    strand: "O", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.3",
    fill(rng) {
      const [n, cents] = draw(rng, (g) => [g.int(2, 5), g.int(105, 495)], ([n, c]) => c % 5 === 0 && c % 100 !== 0 && n * c < 2000 && distinctNumbers([n * c, (n * c < 1000 ? 1000 : 2000) - n * c, (n * c < 1000 ? 1000 : 2000) - c]));
      const bill = n * cents < 1000 ? 10 : 20;
      const name = rng.pick(NAMES), item = rng.pick(["notebooks", "pens", "juice boxes", "markers"]);
      return {
        values: { n, cents, bill },
        prompt: `${name} buys ${n} ${item} for ${money(cents / 100)} each and pays with a ${money(bill)} bill. How much change does ${name} get, in dollars?`,
        readAloud: `${name} buys ${n} ${item} for ${sayMoney(cents / 100)} each and pays with a ${bill} dollar bill. How much change does ${name} get, in dollars?`,
        answer: typed((bill * 100 - n * cents) / 100),
        wrong: [wrong(typed((n * cents) / 100), "cost-not-change"), wrong(typed((bill * 100 - cents) / 100), "one-part")],
      };
    },
  },

  // ---------- Fractions, decimals and percents ----------
  {
    // Map, grade 7: which decimal equals 3/8 (misconception F7).
    id: "g67-7-fraction-to-decimal",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.4",
    fill(rng) {
      const [n, d] = draw(rng, (g) => {
        const d = g.pick([8, 16, 20, 25, 40]);
        return [g.int(1, d - 1), d];
      }, ([n, d]) => gcd(n, d) === 1 && distinctNumbers([n / d, Number(`0.${n}${d}`), Number(`0.${d}${n}`), d / n]));
      return {
        values: { n, d },
        prompt: `Which decimal is equal to ${frac(n, d)}?`,
        readAloud: `Which decimal is equal to ${sayFrac(n, d)}?`,
        answer: typed(n / d),
        wrong: [wrong(`0.${n}${d}`, "F7"), wrong(`0.${d}${n}`, "F7"), wrong(fmt(Math.round((d / n) * 1000) / 1000), "fraction-flip")],
      };
    },
  },
  {
    // Map, grade 7: write 7/20 as a percent.
    id: "g67-7-fraction-to-percent",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.4",
    fill(rng) {
      const [n, d] = draw(rng, (g) => {
        const d = g.pick([4, 5, 20, 25, 50]);
        return [g.int(1, d - 1), d];
      }, ([n, d]) => gcd(n, d) === 1 && distinctNumbers([(n * 100) / d, n / d, d - n]));
      return {
        values: { n, d },
        prompt: `Write ${frac(n, d)} as a percent.`,
        readAloud: `Write ${sayFrac(n, d)} as a percent.`,
        answer: typed((n * 100) / d),
        wrong: [wrong(typed(n / d), "decimal-point"), wrong(d - n, "operation")],
      };
    },
  },
  {
    // Map, grade 7: which is greatest, 0.6, 5/8 or 62%.
    id: "g67-7-greatest-mixed-forms",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.4",
    fill(rng) {
      const [n, d] = rng.pick([[5, 8], [3, 8], [7, 8], [3, 4], [2, 5], [3, 5], [4, 5], [7, 20], [9, 20], [13, 20]] as const);
      const v = Math.round((n * 1000) / d); // thousandths
      // Three values just below the fraction, in other forms: a percent with more digits, a short decimal, a long decimal.
      const pct = Math.floor(v / 10) - (v % 10 === 0 ? 1 : 0);
      const long = v - rng.int(1, 4);
      return {
        values: { n, d },
        prompt: "Which number is the greatest?",
        readAloud: "Which number is the greatest?",
        answer: frac(n, d),
        wrong: [
          wrong(`${pct}%`, "form-compare"),
          wrong(fmt(long / 1000), "form-compare"),
        ].filter((w, i, all) => all.findIndex((x) => x.value === w.value) === i),
      };
    },
  },
  {
    // Map, grade 7: 1/3 as a decimal repeats.
    id: "g67-7-repeating-decimal",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.4",
    fill(rng) {
      const repeating: readonly (readonly [number, number])[] = [[1, 3], [2, 3], [1, 6], [5, 6], [1, 9], [2, 9], [4, 9], [1, 7], [2, 7], [1, 11], [5, 12], [7, 12]] as const;
      const ending: readonly (readonly [number, number])[] = [[1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [1, 8], [3, 8], [5, 8], [7, 8], [1, 2], [3, 10], [7, 20], [9, 20], [3, 16]] as const;
      const askRepeating = rng.int(0, 1) === 1;
      const [answerPool, otherPool] = askRepeating ? [repeating, ending] : [ending, repeating];
      const [n, d] = rng.pick(answerPool);
      const others = rng.shuffle(otherPool).slice(0, 3);
      return {
        values: { n, d, askRepeating: askRepeating ? 1 : 0 },
        prompt: `Which fraction is equal to a decimal that ${askRepeating ? "repeats forever" : "ends (stops)"}?`,
        readAloud: `Which fraction is equal to a decimal that ${askRepeating ? "repeats forever" : "ends"}?`,
        answer: frac(n, d),
        wrong: others.map(([a, b]) => wrong(frac(a, b), "decimal-repeat")),
      };
    },
  },
  {
    // Decimals as fractions in lowest terms.
    id: "g67-7-decimal-to-fraction",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.4",
    fill(rng) {
      const h = rng.pick([5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 12, 24, 36, 48, 64, 72, 84, 96]);
      const [a, b] = [Math.floor(h / 10), h % 10];
      return {
        values: { h },
        prompt: `Which fraction in lowest terms is equal to ${fmt(h / 100)}?`,
        readAloud: `Which fraction in lowest terms is equal to ${fmt(h / 100)}?`,
        answer: fracText(h, 100),
        wrong: [
          wrong(frac(a, b), "F7"),
          wrong(frac(h, 10), "decimal-point"),
          wrong(frac(h, 1000), "decimal-point"),
        ].filter((w, i, all) => all.findIndex((x) => x.value === w.value) === i),
      };
    },
  },
  {
    // Percents as fractions in lowest terms.
    id: "g67-7-percent-to-fraction",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.4",
    fill(rng) {
      const p = rng.pick([15, 35, 45, 55, 65, 85, 95, 12, 24, 36, 44, 48, 64, 76, 84, 88]);
      const [n, d] = [p / gcd(p, 100), 100 / gcd(p, 100)];
      return {
        values: { p },
        prompt: `Write ${p}% as a fraction in lowest terms.`,
        readAloud: `Write ${p} percent as a fraction in lowest terms.`,
        answer: frac(n, d),
        wrong: [wrong(frac(p, 10), "decimal-point"), wrong(frac(Math.floor(p / 10), p % 10), "F7"), wrong(frac(d, n), "fraction-flip")],
      };
    },
  },
  {
    // Place a fraction between two others, in decimal form.
    id: "g67-7-decimal-between",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.4",
    fill(rng) {
      const [[a, b], [c, d]] = rng.pick([
        [[1, 4], [1, 3]], [[1, 5], [1, 4]], [[2, 5], [1, 2]], [[1, 2], [3, 5]], [[3, 5], [2, 3]], [[2, 3], [3, 4]], [[3, 4], [4, 5]], [[1, 8], [1, 5]],
      ] as const);
      const lo = a / b, hi = c / d;
      // A decimal between them, one below, one above, and the F7 reading of the lower fraction.
      const between = Math.round(((lo + hi) / 2) * 100) / 100;
      const below = Math.round((lo - 0.05) * 100) / 100;
      const above = Math.round((hi + 0.05) * 100) / 100;
      const f7 = Number(`0.${a}${b}`);
      const wrongs = [wrong(fmt(below), "bounds-error"), wrong(fmt(above), "bounds-error")];
      if (f7 < lo || f7 > hi) wrongs.push(wrong(fmt(f7), "F7"));
      return {
        values: { a, b, c, d },
        prompt: `Which decimal is between ${frac(a, b)} and ${frac(c, d)}?`,
        readAloud: `Which decimal is between ${sayFrac(a, b)} and ${sayFrac(c, d)}?`,
        answer: fmt(between),
        wrong: wrongs.filter((w, i, all) => w.value !== fmt(between) && all.findIndex((x) => x.value === w.value) === i),
      };
    },
  },
  {
    // Map, 7.4: order across forms.
    id: "g67-7-order-forms",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.4",
    fill(rng) {
      // Three values in three forms, close together: a fraction, a decimal and a percent.
      const [n, d] = rng.pick([[1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [1, 8], [3, 8], [5, 8], [7, 8]] as const);
      const f = n / d;
      const dec = Math.round((f - 0.03) * 100) / 100, pct = Math.round(f * 100) + rng.int(2, 4);
      const items = [[frac(n, d), f], [fmt(dec), dec], [`${pct}%`, pct / 100]] as const;
      const order = (xs: readonly (readonly [string, number])[]) => xs.map(([s]) => s).join(", ");
      const sorted = [...items].sort((x, y) => x[1] - y[1]);
      const byDigits = [...items].sort((x, y) => parseFloat(x[0].replace(/[^\d.]/g, "")) - parseFloat(y[0].replace(/[^\d.]/g, "")));
      const candidates = [order(byDigits), order([...sorted].reverse()), order([sorted[1], sorted[0], sorted[2]]), order([sorted[0], sorted[2], sorted[1]])];
      const wrongs = [...new Set(candidates)].filter((c) => c !== order(sorted)).slice(0, 3);
      return {
        values: { n, d, dec100: Math.round(dec * 100), pct },
        prompt: "Which list is in order from least to greatest?",
        readAloud: "Which list of numbers is in order from least to greatest?",
        answer: order(sorted),
        wrong: wrongs.map((w, i) => wrong(w, i === 0 && w === order(byDigits) ? "form-compare" : w === order([...sorted].reverse()) ? "more-less" : "form-compare")),
      };
    },
  },
  {
    // Map, 7.4: ratios and percents. A class of girls and boys.
    id: "g67-7-ratio-percent",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.4",
    fill(rng) {
      const [g, b] = draw(rng, (r) => [r.int(4, 18), r.int(4, 18)], ([g, b]) => g !== b && (g * 100) % (g + b) === 0 && (b * 100) % (g + b) === 0);
      const wrongs = [wrong((b * 100) / (g + b), "fraction-other-part")];
      if (((g * 1000) / b) % 1 === 0) wrongs.push(wrong(typed((g * 100) / b), "F4"));
      return {
        values: { g, b },
        prompt: `A class has ${g} girls and ${b} boys. What percent of the class are girls?`,
        readAloud: `A class has ${g} girls and ${b} boys. What percent of the class are girls?`,
        answer: String((g * 100) / (g + b)),
        wrong: wrongs.filter((w) => Number(w.value) !== (g * 100) / (g + b)),
      };
    },
  },
  {
    // Map, 7.13: sales tax.
    id: "g67-7-sales-tax",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.13",
    fill(rng) {
      const [rate, price] = draw(rng, (g) => [g.pick([5, 7, 12, 13, 15]), g.int(2, 30) * 10], ([, p]) => p !== 100);
      const tax = (rate * price) / 100;
      const item = rng.pick(["A game", "A pair of skates", "A lamp", "A backpack"]);
      return {
        values: { rate, price },
        prompt: `${item} costs ${money(price)}. The sales tax is ${rate}%. What is the total cost with tax, in dollars?`,
        readAloud: `${item} costs ${sayMoney(price)}. The sales tax is ${rate} percent. What is the total cost with tax, in dollars?`,
        answer: typed(price + tax),
        wrong: [wrong(typed(tax), "amount-not-total"), wrong(price + rate, "percent-as-amount")],
      };
    },
  },
  {
    // 7.13: a tip.
    id: "g67-7-tip",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.13",
    fill(rng) {
      const rate = rng.pick([10, 15, 18, 20]), bill = rng.int(4, 18) * 5;
      const tip = (rate * bill) / 100;
      return {
        values: { rate, bill },
        prompt: `A meal costs ${money(bill)}. The family leaves ${rate === 18 ? "an" : "a"} ${rate}% tip. How much do they pay in all, in dollars?`,
        readAloud: `A meal costs ${sayMoney(bill)}. The family leaves ${rate === 18 ? "an" : "a"} ${rate} percent tip. How much do they pay in all, in dollars?`,
        answer: typed(bill + tip),
        wrong: [wrong(typed(tip), "amount-not-total"), wrong(bill + rate, "percent-as-amount")],
      };
    },
  },
  {
    // 7.13: discount and sale price, with a percent that is not a benchmark.
    id: "g67-7-sale-price",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.13",
    fill(rng) {
      const [rate, price] = draw(rng, (g) => [g.pick([15, 30, 35, 40, 45, 60, 65]), g.int(4, 30) * 10], ([r, p]) => (r * p) % 100 === 0 && p > r && distinctNumbers([p - r, p * (100 - r) / 100, p * r / 100]));
      const item = rng.pick(["jacket", "bike helmet", "pair of boots", "tent"]);
      return {
        values: { rate, price },
        prompt: `A ${item} costs ${money(price)}. It is ${rate}% off. What is the sale price, in dollars?`,
        readAloud: `A ${item} costs ${sayMoney(price)}. It is ${rate} percent off. What is the sale price, in dollars?`,
        answer: String((price * (100 - rate)) / 100),
        wrong: [wrong((price * rate) / 100, "discount-price"), wrong(price - rate, "F10")],
      };
    },
  },
  {
    // Write a fraction as a decimal, typed (7.4: terminating decimals).
    id: "g67-7-write-decimal",
    strand: "F", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.4",
    fill(rng) {
      const [n, d] = draw(rng, (g) => {
        const d = g.pick([8, 16, 20, 25, 40]);
        return [g.int(1, d - 1), d];
      }, ([n, d]) => gcd(n, d) === 1 && distinctNumbers([n / d, Number(`0.${n}${d}`), Number(`${n}.${d}`)]));
      return {
        values: { n, d },
        prompt: `Write ${frac(n, d)} as a decimal.`,
        readAloud: `Write ${sayFrac(n, d)} as a decimal.`,
        answer: typed(n / d),
        wrong: [wrong(`0.${n}${d}`, "F7"), wrong(`${n}.${d}`, "F7")],
      };
    },
  },

  // ---------- Patterns and algebra ----------
  {
    // Map, grade 7: y = 3n + 2 when n = 5 (here with a minus: 4n - 3).
    id: "g67-7-evaluate-relation",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 5 }, format: "number", whiteboard: true, standard: "7.5",
    fill(rng) {
      const [a, b, n] = draw(rng, (g) => [g.int(2, 9), g.int(1, 9), g.int(3, 15)], ([a, b, n]) => a * n > b && a * (n - b) > 0 && distinctNumbers([a * n - b, a * (n - b), a * n + b]));
      return {
        values: { a, b, n },
        prompt: `y = ${a}n − ${b}. What is y when n = ${n}?`,
        readAloud: `y equals ${a} times n, minus ${b}. What is y when n is ${n}?`,
        answer: String(a * n - b),
        wrong: [wrong(a * (n - b), "sub-before-multiply"), wrong(a * n + b, "operation")],
      };
    },
  },
  {
    // Map, grade 7 and misconception A5: which rule fits (1, 5), (2, 8), (3, 11). Here the table starts after 1.
    id: "g67-7-rule-from-table",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.5",
    fill(rng) {
      const [a, b, start] = draw(rng, (g) => [g.int(2, 6), g.int(1, 9), g.int(2, 4)], ([a, b, s]) => distinct([`${a}n + ${b}`, `${a}n`, `n + ${a}`, `${a * s + b}n`]));
      const pairs = [start, start + 1, start + 2].map((n) => `(${n}, ${a * n + b})`).join(", ");
      const said = [start, start + 1, start + 2].map((n) => `when n is ${n}, y is ${a * n + b}`).join("; ");
      return {
        values: { a, b, start },
        prompt: `A table of values has the pairs (n, y): ${pairs}. Which rule fits?`,
        readAloud: `A table of values has these pairs: ${said}. Which rule fits?`,
        answer: `y = ${a}n + ${b}`,
        wrong: [wrong(`y = ${a}n`, "A5"), wrong(`y = n + ${a}`, "step-as-addend"), wrong(`y = ${a * start + b}n`, "rule-start")],
      };
    },
  },
  {
    // Map, grade 7 and misconception A6: solve 3x + 4 = 16.
    id: "g67-7-two-step-plus",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.6",
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.int(2, 9), g.int(2, 20), g.int(2, 12)], ([a, b, x]) => distinctNumbers([x, a * x, a * x + 2 * b]));
      const c = a * x + b;
      return {
        values: { a, b, x },
        prompt: `Solve ${a}x + ${b} = ${c}. What is x?`,
        readAloud: `Solve ${a} times x, plus ${b}, equals ${c}. What is x?`,
        answer: String(x),
        wrong: [wrong(c - b, "A6"), wrong(c + b, "A6")],
      };
    },
  },
  {
    id: "g67-7-two-step-minus",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.6",
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.pick([2, 4, 5]), g.int(2, 15), g.int(2, 12)], ([a, b, x]) => a * x > b && distinctNumbers([x, a * x + b, (a * x - 2 * b) / a]) && a * x - 2 * b > 0);
      const c = a * x - b;
      return {
        values: { a, b, x },
        prompt: `Solve ${a}x − ${b} = ${c}. What is x?`,
        readAloud: `Solve ${a} times x, minus ${b}, equals ${c}. What is x?`,
        answer: String(x),
        wrong: [wrong(c + b, "A6"), wrong(typed((c - b) / a), "A6")],
      };
    },
  },
  {
    // 7.6: x / a + b = c.
    id: "g67-7-two-step-divide",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.6",
    fill(rng) {
      const [a, b, q] = draw(rng, (g) => [g.int(2, 6), g.int(2, 12), g.int(2, 9)], ([a, b, q]) => ((q + b - b) % 1 === 0) && distinctNumbers([a * q, q * 1 + 0 === q ? (q + b + b) * a : 0, ((q + b) - b) / a]) && ((q * 1) % a === 0 || true));
      const c = q + b;
      const wrongs = [wrong((c + b) * a, "A6")];
      if ((c - b) % a === 0) wrongs.push(wrong((c - b) / a, "A6"));
      else wrongs.push(wrong(c * a, "A6"));
      return {
        values: { a, b, q },
        prompt: `Solve x ÷ ${a} + ${b} = ${c}. What is x?`,
        readAloud: `Solve x divided by ${a}, plus ${b}, equals ${c}. What is x?`,
        answer: String(a * q),
        wrong: wrongs.filter((w) => Number(w.value) !== a * q),
      };
    },
  },
  {
    // A two-step story: a fixed fee plus a rate.
    id: "g67-7-two-step-story",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.6",
    fill(rng) {
      const [fee, rate, n] = draw(rng, (g) => [g.int(2, 9), g.int(2, 6), g.int(3, 15)], ([f, r, n]) => f !== r && distinctNumbers([n, (f + r * n) / r, (f + r * n + f) / r]));
      const total = fee + rate * n;
      const [what, unit, units] = rng.pick([["A taxi ride", "kilometre", "kilometres"], ["Renting a bike", "hour", "hours"], ["A climbing gym visit", "climb", "climbs"]] as const);
      const wrongs = [wrong(typed(total / rate), "A6")];
      if ((total + fee) % rate === 0) wrongs.push(wrong((total + fee) / rate, "A6"));
      return {
        values: { fee, rate, n },
        prompt: `${what} costs ${money(fee)} plus ${money(rate)} for each ${unit}. It cost ${money(total)}. How many ${units} was it?`,
        readAloud: `${what} costs ${sayMoney(fee)} plus ${sayMoney(rate)} for each ${unit}. It cost ${sayMoney(total)}. How many ${units} was it?`,
        answer: String(n),
        wrong: wrongs.filter((w) => w.value.length <= 12),
      };
    },
  },
  {
    // A two-step story as an equation.
    id: "g67-7-story-equation",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.6",
    fill(rng) {
      const [fee, rate, n] = draw(rng, (g) => [g.int(2, 9), g.int(2, 6), g.int(3, 12)], ([f, r]) => f !== r);
      const total = fee + rate * n;
      const name = rng.pick(NAMES);
      return {
        values: { fee, rate, n },
        prompt: `${name} pays ${money(fee)} to join a club and ${money(rate)} for each class. In all ${name} pays ${money(total)}. Let k be the number of classes. Which equation fits?`,
        readAloud: `${name} pays ${sayMoney(fee)} to join a club and ${sayMoney(rate)} for each class. In all ${name} pays ${sayMoney(total)}. Let k be the number of classes. Which equation fits?`,
        answer: `${rate}k + ${fee} = ${total}`,
        wrong: [wrong(`${fee}k + ${rate} = ${total}`, "rule-swap"), wrong(`${rate}(k + ${fee}) = ${total}`, "group-translation"), wrong(`${rate}k = ${total} + ${fee}`, "inverse-op")],
      };
    },
  },
  {
    // Verify a solution (7.6: solve and verify).
    id: "g67-7-check-solution",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.6",
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.pick([2, 4, 5]), g.int(2, 15), g.int(2, 12)], ([a, b, x]) =>
        distinctNumbers([x, (a * x + b + b) / a, a * x, (a * x + b) / a]) && (a * x + 2 * b) % a === 0);
      const c = a * x + b;
      return {
        values: { a, b, x },
        prompt: `Which value of x makes ${a}x + ${b} = ${c} true?`,
        readAloud: `Which value of x makes ${a} times x, plus ${b}, equal ${c}?`,
        answer: String(x),
        wrong: [wrong(typed((c + b) / a), "A6"), wrong(c - b, "A6"), wrong(typed(c / a), "A6")],
      };
    },
  },
  {
    // A later value from a table (7.5: derive the relation from a table).
    id: "g67-7-table-far",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.5",
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.int(2, 7), g.int(1, 9), g.int(15, 40)], ([a, b, x]) => distinctNumbers([a * x + b, a * x, x + a, x + b]));
      const pairs = [1, 2, 3].map((n) => `(${n}, ${a * n + b})`).join(", ");
      const said = [1, 2, 3].map((n) => `when x is ${n}, y is ${a * n + b}`).join("; ");
      return {
        values: { a, b, x },
        prompt: `A table of values has the pairs (x, y): ${pairs}. The pattern continues. What is y when x = ${x}?`,
        readAloud: `A table of values has these pairs: ${said}. The pattern continues. What is y when x is ${x}?`,
        answer: String(a * x + b),
        wrong: [wrong(a * x, "A5"), wrong(x + a, "step-as-addend")],
      };
    },
  },
  {
    // 7.5: a relation with a negative input. WNCP multiplies integers in grade 8.
    id: "g67-7-negative-input",
    strand: "A", grades: { BC: 7, AB: 8, SK: 8, MB: 8, ON: 8 }, format: "choice", whiteboard: true, standard: "7.5",
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.int(2, 6), g.int(1, 9), -g.int(1, 6)], ([a, b, x]) => distinctNumbers([a * x + b, -a * x + b, a * x - b, a + x + b]));
      return {
        values: { a, b, x },
        prompt: `y = ${a}x + ${b}. What is y when x = ${num(x)}?`,
        readAloud: `y equals ${a} times x, plus ${b}. What is y when x is ${sayNum(x)}?`,
        answer: num(a * x + b),
        wrong: [wrong(num(-a * x + b), "sign-rule"), wrong(num(a * x - b), "O9"), wrong(num(a + x + b), "product-as-sum")],
      };
    },
  },
  {
    // 7.5 and 7.9: a point on a line in four quadrants.
    id: "g67-7-point-on-line",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.5",
    fill(rng) {
      const [b, x] = draw(rng, (g) => [g.int(2, 9), g.int(1, 8)], ([b, x]) => x < b && x !== b - x && distinct([[x, x - b], [x - b, x], [x, b - x], [x, x + b]].map(String)));
      return {
        values: { b, x },
        prompt: `Which point is on the graph of y = x − ${b}?`,
        readAloud: `Which point is on the graph of y equals x minus ${b}?`,
        answer: point(x, x - b),
        wrong: [wrong(point(x - b, x), "coordinate-swap"), wrong(point(x, b - x), "O9"), wrong(point(x, x + b), "operation")],
      };
    },
  },
  {
    // A decreasing linear relation in a story (7.5).
    id: "g67-7-draining-pool",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.5",
    fill(rng) {
      const [start, rate, t] = draw(rng, (g) => [g.int(10, 40) * 10, g.int(3, 25), g.int(4, 12)], ([s, r, t]) => s - r * (t + 1) > 0);
      const [what, unit] = rng.pick([["A tank holds", "litres of water. It drains"], ["A phone battery has", "units of charge. It uses"]] as const);
      return {
        values: { start, rate, t },
        prompt: `${what} ${start} ${unit} ${rate} each minute. How much is left after ${t} minutes?`,
        readAloud: `${what} ${start} ${unit} ${rate} each minute. How much is left after ${t} minutes?`,
        answer: String(start - rate * t),
        wrong: [wrong(start + rate * t, "pattern-direction"), wrong(start - rate * (t - 1), "count-start")],
      };
    },
  },
  {
    // A pattern of figures as an expression (7.5).
    id: "g67-7-figure-expression",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.5",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(2, 6), g.int(1, 9)], ([a, b]) => a !== b && a + b !== a * 2);
      const things = rng.pick(["tiles", "toothpicks", "dots", "squares"]);
      return {
        values: { a, b },
        prompt: `Figure 1 has ${a + b} ${things}, figure 2 has ${2 * a + b} and figure 3 has ${3 * a + b}. Which expression gives the number of ${things} in figure n?`,
        readAloud: `Figure 1 has ${a + b} ${things}, figure 2 has ${2 * a + b} and figure 3 has ${3 * a + b}. Which expression gives the number of ${things} in figure n?`,
        answer: `${a}n + ${b}`,
        wrong: [wrong(`n + ${a}`, "step-as-addend"), wrong(`${a}n`, "A5"), wrong(`${a + b}n`, "rule-start")],
      };
    },
  },
  {
    // A balance with equal boxes (7.6: preserve equality).
    id: "g67-7-balance-boxes",
    strand: "A", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.6",
    fill(rng) {
      const [k, a, x] = draw(rng, (g) => [g.int(2, 5), g.int(2, 12), g.int(2, 9)], ([k, a, x]) => distinctNumbers([x, k * x, k * x + 2 * a]));
      const total = k * x + a;
      return {
        values: { k, a, x },
        prompt: `A balance is level. One side has ${k} boxes and ${a} marbles. The other side has ${total} marbles. Every box holds the same number of marbles. All marbles have the same mass. The empty boxes have no mass in this model. How many marbles are in one box?`,
        readAloud: `A balance is level. One side has ${k} boxes and ${a} marbles. The other side has ${total} marbles. Every box holds the same number of marbles. All marbles have the same mass. The empty boxes have no mass in this model. How many marbles are in one box?`,
        answer: String(x),
        wrong: [wrong(total - a, "A6"), wrong(total + a, "A6")],
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    // Map, grade 7: a circle with radius 5 cm; circumference with 3.14 (misconception M10).
    id: "g67-7-circumference",
    strand: "MG", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.7",
    fill(rng) {
      const r = rng.pick([3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), useRadius = rng.int(0, 1) === 1;
      const c = 2 * 3.14 * r;
      return {
        values: { r, useRadius: useRadius ? 1 : 0 },
        prompt: `A circle has a ${useRadius ? `radius of ${r} cm` : `diameter of ${2 * r} cm`}. Use 3.14 for π. What is its circumference, in centimetres?`,
        readAloud: `A circle has a ${useRadius ? `radius of ${r} centimetres` : `diameter of ${2 * r} centimetres`}. Use 3.14 for pi. What is its circumference, in centimetres?`,
        answer: typed(c),
        wrong: useRadius
          ? [wrong(typed(3.14 * r), "M10"), wrong(typed(3.14 * r * r), "M10")]
          : [wrong(typed(4 * 3.14 * r), "M10"), wrong(typed(3.14 * r * r), "M10")],
      };
    },
  },
  {
    // Map, grade 7: a circle with radius 3 cm; area with 3.14 (misconception M10).
    id: "g67-7-circle-area",
    strand: "MG", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.7",
    fill(rng) {
      const r = rng.int(3, 12);
      return {
        values: { r },
        prompt: `A circle has a radius of ${r} cm. Use 3.14 for π. What is its area, in square centimetres?`,
        readAloud: `A circle has a radius of ${r} centimetres. Use 3.14 for pi. What is its area, in square centimetres?`,
        answer: typed(3.14 * r * r),
        wrong: [wrong(typed(2 * 3.14 * r), "M10"), wrong(typed(3.14 * 4 * r * r), "M10")],
      };
    },
  },
  {
    // From a circumference back to the diameter.
    id: "g67-7-diameter-from-circumference",
    strand: "MG", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.7",
    fill(rng) {
      const d = rng.int(2, 30);
      return {
        values: { d },
        prompt: `A circle has a circumference of ${fmt(3.14 * d)} cm. Use 3.14 for π. What is its diameter, in centimetres?`,
        readAloud: `A circle has a circumference of ${fmt(3.14 * d)} centimetres. Use 3.14 for pi. What is its diameter, in centimetres?`,
        answer: String(d),
        wrong: d % 2 === 0 ? [wrong(d / 2, "M10"), wrong(d * 2, "M10")] : [wrong(typed(d / 2), "M10"), wrong(d * 2, "M10")],
      };
    },
  },
  {
    // Map, grade 7: a cylinder with base area 12 square cm and height 5 cm. WNCP finds cylinder volume in grade 8.
    id: "g67-7-cylinder-base-area",
    strand: "MG", grades: { BC: 7, AB: 8, SK: 8, MB: 8, ON: 8 }, format: "number", whiteboard: true, standard: "7.8",
    fill(rng) {
      const [base, h] = draw(rng, (g) => [g.int(6, 60), g.int(3, 15)], ([b, h]) => b !== h);
      return {
        values: { base, h },
        prompt: `A cylinder has a base with an area of ${base} square cm. It is ${h} cm tall. What is its volume, in cubic centimetres?`,
        readAloud: `A cylinder has a base with an area of ${base} square centimetres. It is ${h} centimetres tall. What is its volume, in cubic centimetres?`,
        answer: String(base * h),
        wrong: [wrong(base + h, "operation")],
      };
    },
  },
  {
    // 7.8: a cylinder from its radius and height, with 3.14.
    id: "g67-7-cylinder-volume",
    strand: "MG", grades: { BC: 7, AB: 8, SK: 8, MB: 8, ON: 8 }, format: "number", whiteboard: true, standard: "7.8",
    fill(rng) {
      const [r, h] = draw(rng, (g) => [g.pick([1, 3, 4, 5, 10]), g.int(2, 12)], ([r, h]) => r !== h);
      return {
        values: { r, h },
        prompt: `A cylinder has a radius of ${r} cm and a height of ${h} cm. Use 3.14 for π. What is its volume, in cubic centimetres?`,
        readAloud: `A cylinder has a radius of ${r} ${r === 1 ? "centimetre" : "centimetres"} and a height of ${h} centimetres. Use 3.14 for pi. What is its volume, in cubic centimetres?`,
        answer: typed(3.14 * r * r * h),
        wrong: [wrong(typed(2 * 3.14 * r * h), "M10"), wrong(typed(3.14 * 4 * r * r * h), "M10")],
      };
    },
  },
  {
    // Map, grade 7: which quadrant holds (-3, 2).
    id: "g67-7-quadrant",
    strand: "MG", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.9",
    fill(rng) {
      const [x, y] = draw(rng, (g) => [g.int(-9, 9), g.int(-9, 9)], ([x, y]) => x !== 0 && y !== 0 && Math.abs(x) !== Math.abs(y) && (x < 0 || y < 0));
      const name = (a: number, b: number) => `${b > 0 ? "Top" : "Bottom"} ${a > 0 ? "right" : "left"}`;
      const all = ["Top right", "Top left", "Bottom left", "Bottom right"];
      const answer = name(x, y), swapped = name(y, x);
      return {
        values: { x, y },
        prompt: `On a coordinate grid, which part holds the point ${point(x, y)}?`,
        readAloud: `On a coordinate grid, which part holds the point ${sayPoint(x, y)}?`,
        answer,
        wrong: all.filter((q) => q !== answer).map((q) => wrong(q, q === swapped ? "coordinate-swap" : "quadrant-sign")),
      };
    },
  },
  {
    // 7.10: a reflection in an axis.
    id: "g67-7-reflect-point",
    strand: "MG", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.10",
    fill(rng) {
      const [x, y] = draw(rng, (g) => [g.int(-9, 9), g.int(-9, 9)], ([x, y]) => x !== 0 && y !== 0 && Math.abs(x) !== Math.abs(y));
      const xAxis = rng.int(0, 1) === 1;
      const [ax, ay] = xAxis ? [x, -y] : [-x, y];
      return {
        values: { x, y, xAxis: xAxis ? 1 : 0 },
        prompt: `Reflect the point ${point(x, y)} in the ${xAxis ? "x" : "y"}-axis. Where does it land?`,
        readAloud: `Reflect the point ${sayPoint(x, y)} in the ${xAxis ? "x" : "y"} axis. Where does it land?`,
        answer: point(ax, ay),
        wrong: [wrong(xAxis ? point(-x, y) : point(x, -y), "transform-sign"), wrong(point(-x, -y), "transform-sign"), wrong(point(ay, ax), "coordinate-swap")],
      };
    },
  },
  {
    // 7.10: a translation in four quadrants.
    id: "g67-7-translate-point",
    strand: "MG", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.10",
    fill(rng) {
      const [x, y, r, d] = draw(rng, (g) => [g.int(-6, 6), g.int(-6, 6), g.int(2, 8), g.int(2, 8)], ([x, y, r, d]) =>
        r !== d && distinct([[x + r, y - d], [x - r, y - d], [x + r, y + d], [x + d, y - r]].map(String)));
      return {
        values: { x, y, r, d },
        prompt: `The point ${point(x, y)} moves ${r} units right and ${d} units down. Where does it end up?`,
        readAloud: `The point ${sayPoint(x, y)} moves ${r} units right and ${d} units down. Where does it end up?`,
        answer: point(x + r, y - d),
        wrong: [wrong(point(x - r, y - d), "transform-sign"), wrong(point(x + r, y + d), "transform-sign"), wrong(point(x + d, y - r), "move-distance-swap")],
      };
    },
  },
  {
    // 7.10: a half turn about the origin.
    id: "g67-7-half-turn",
    strand: "MG", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "7.10",
    fill(rng) {
      const [x, y] = draw(rng, (g) => [g.int(-9, 9), g.int(-9, 9)], ([x, y]) => x !== 0 && y !== 0 && Math.abs(x) !== Math.abs(y));
      return {
        values: { x, y },
        prompt: `The point ${point(x, y)} turns a half turn around the origin, (0, 0). Where does it land?`,
        readAloud: `The point ${sayPoint(x, y)} turns a half turn around the origin, where both numbers are 0. Where does it land?`,
        answer: point(-x, -y),
        wrong: [wrong(point(-x, y), "transform-sign"), wrong(point(x, -y), "transform-sign"), wrong(point(y, x), "coordinate-swap")],
      };
    },
  },
  {
    // Map, grade 7: 25% of 200 students walk to school.
    id: "g67-7-circle-graph-amount",
    strand: "DP", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.11",
    fill(rng) {
      const [p, total] = draw(rng, (g) => [g.pick([10, 15, 20, 25, 30, 35, 40, 45]), g.int(4, 30) * 20], ([p, t]) => (p * t) % 100 === 0 && t !== 100 && t / p !== (p * t) / 100 && t / p !== p);
      const [who, what] = rng.pick([["students", "walk to school"], ["people", "chose pizza"], ["visitors", "came by bus"]] as const);
      const wrongs = [wrong(p, "percent-as-count")];
      if (((total * 1000) / p) % 1 === 0) wrongs.push(wrong(typed(total / p), "F10"));
      return {
        values: { p, total },
        prompt: `A circle graph shows how ${total} ${who} answered a survey. The section for "${what}" is ${p}% of the circle. How many ${who} ${what}?`,
        readAloud: `A circle graph shows how ${total} ${who} answered a survey. The section for ${what} is ${p} percent of the circle. How many ${who} ${what}?`,
        answer: String((p * total) / 100),
        wrong: wrongs.filter((w) => Number(w.value) !== (p * total) / 100),
      };
    },
  },
  {
    // 7.11: the angle of a section of a circle graph.
    id: "g67-7-circle-graph-degrees",
    strand: "DP", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.11",
    fill(rng) {
      const p = rng.pick([5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75]);
      return {
        values: { p },
        prompt: `A section of a circle graph is ${p}% of the circle. How many degrees is the angle at the centre of that section?`,
        readAloud: `A section of a circle graph is ${p} percent of the circle. How many degrees is the angle at the centre of that section?`,
        answer: typed((p * 360) / 100),
        wrong: [wrong(p, "percent-as-degrees"), wrong(typed(360 / p), "F10")].filter((w) => Number(w.value) !== (p * 360) / 100),
      };
    },
  },
  {
    // 7.11: from a quantity back to a percent of the circle.
    id: "g67-7-circle-graph-percent",
    strand: "DP", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "7.11",
    fill(rng) {
      const [p, total] = draw(rng, (g) => [g.pick([10, 15, 20, 25, 30, 40, 45, 60]), g.int(2, 20) * 20], ([p, t]) => (p * t) % 100 === 0 && (p * t) / 100 !== p);
      const part = (p * total) / 100;
      const fruit = rng.pick(["apples", "bananas", "grapes", "oranges"]);
      const wrongs = [wrong(part, "count-as-percent")];
      if (((total * 1000) / part) % 1 === 0 && total / part !== p) wrongs.push(wrong(typed(total / part), "percent-inverse"));
      return {
        values: { p, total },
        prompt: `${total} people named their favourite fruit, and ${part} of them chose ${fruit}. In a circle graph, what percent of the circle is ${fruit}?`,
        readAloud: `${total} people named their favourite fruit, and ${part} of them chose ${fruit}. In a circle graph, what percent of the circle is ${fruit}?`,
        answer: String(p),
        wrong: wrongs,
      };
    },
  },
  {
    // 7.12: the outcomes of two independent events.
    id: "g67-7-count-outcomes",
    strand: "DP", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "8.13",
    fill(rng) {
      const [first, a] = rng.pick([["a coin", 2], ["a die", 6], ["a spinner with 3 equal parts", 3], ["a spinner with 4 equal parts", 4], ["a spinner with 5 equal parts", 5]] as const);
      const [second, b] = rng.pick([["a coin", 2], ["a die", 6], ["a spinner with 3 equal parts", 3], ["a spinner with 4 equal parts", 4]] as const);
      return {
        values: { a, b },
        prompt: `You toss or spin ${first} and then ${second}. How many different outcomes are possible?`,
        readAloud: `You toss or spin ${first} and then ${second}. How many different outcomes are possible?`,
        answer: String(a * b),
        wrong: a * b === a + b ? [wrong(a, "one-part")] : [wrong(a + b, "outcomes-add")],
      };
    },
  },
  {
    // Map, grade 7: two dice rolled 50 times; a sum of 7 came up 9 times.
    id: "g67-7-experimental",
    strand: "DP", grades: { BC: 7, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: false, standard: "7.12",
    fill(rng) {
      const [total, hits] = draw(rng, (g) => [g.pick([30, 40, 50, 60]), g.int(3, 14)], ([t, h]) => gcd(t, h) === 1 && distinct([frac(h, t), "1/6", frac(h, t - h), frac(t - h, t)]));
      return {
        values: { total, hits },
        prompt: `Two dice were rolled together ${total} times. A sum of 7 came up ${hits} times. What is the experimental probability of rolling a sum of 7?`,
        readAloud: `Two dice were rolled together ${total} times. A sum of 7 came up ${hits} times. What is the experimental probability of rolling a sum of 7?`,
        answer: frac(hits, total),
        wrong: [wrong("1/6", "theory-as-data"), wrong(frac(hits, total - hits), "D4"), wrong(frac(total - hits, total), "probability-other")],
      };
    },
  },
  {
    // Misconception D3: two dice; a sum of 7 is more likely than a sum of 12.
    id: "g67-7-dice-sum",
    strand: "DP", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "choice", whiteboard: true, standard: "8.13",
    fill(rng) {
      const ways = (s: number) => 6 - Math.abs(s - 7);
      const [a, b] = draw(rng, (g) => [g.int(2, 12), g.int(2, 12)], ([a, b]) => a < b && ways(a) !== ways(b));
      const more = ways(a) > ways(b) ? a : b, less = more === a ? b : a;
      return {
        values: { a, b },
        prompt: "Two fair dice are rolled and the numbers are added. Which sum is more likely?",
        readAloud: "Two fair dice are rolled and the numbers are added. Which sum is more likely?",
        answer: `A sum of ${more}`,
        wrong: [wrong(`A sum of ${less}`, "chance-reversed"), wrong("They are equally likely", "D3")],
      };
    },
  },
];
