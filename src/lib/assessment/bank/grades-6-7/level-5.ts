// Level 5 (BC grade 5) for the grades 6-7 bank: the "down" form for a grade 6 child.
// Standards: curriculum map, section 1 (5.1-5.19); example items: section 3, grade 5. Province tags: see ./index.ts.
import { count, draw, NAMES, ordinal, wrong, type TaggedTemplate } from "../kit";
import { distinct, distinctNumbers, fmt, gcd, frac, money, sayFrac, sayMoney, typed, words } from "./helpers";

const pad = (m: number) => String(m).padStart(2, "0");
/** Adds column by column and drops every carry (O3). */
const noCarry = (a: number, b: number) => {
  let sum = 0;
  for (let p = 1; p <= Math.max(a, b); p *= 10) sum += (((Math.floor(a / p) % 10) + (Math.floor(b / p) % 10)) % 10) * p;
  return sum;
};

export const LEVEL_5: readonly TaggedTemplate[] = [
  // ---------- Number and operations ----------
  {
    // Map, grade 5: "Write in digits: four hundred two thousand, five".
    id: "g67-5-write-digits",
    strand: "N", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 6 }, format: "number", whiteboard: false, standard: "5.1",
    fill(rng) {
      const thousands = rng.int(1, 9) * 100 + rng.int(1, 99), ones = rng.int(1, 99);
      const text = `${words(thousands)} thousand, ${words(ones)}`;
      return {
        values: { thousands, ones },
        prompt: `Write this number in digits: ${text}.`,
        readAloud: `Write this number in digits: ${text}.`,
        answer: String(thousands * 1000 + ones),
        // Leaves out the zeros that hold the hundreds (and tens) place: 402 thousand 5 becomes 4025.
        wrong: [wrong(`${thousands}${ones}`, "zero-placeholder")],
      };
    },
  },
  {
    // Map, grade 5: 10,000 more than 385,200. Sometimes it crosses into the next hundred thousand.
    id: "g67-5-ten-thousand-more",
    strand: "N", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 6 }, format: "number", whiteboard: false, standard: "5.1",
    fill(rng) {
      const more = rng.int(0, 1) === 1;
      const tenThousands = rng.int(0, 2) === 0 ? rng.int(1, 8) * 10 + 9 : rng.int(11, 98);
      const n = tenThousands * 10_000 + rng.int(0, 9) * 1000 + rng.int(1, 9) * 100;
      const step = more ? 1 : -1;
      return {
        values: { n, more: more ? 1 : 0 },
        prompt: `What number is 10,000 ${more ? "more" : "less"} than ${fmt(n)}?`,
        readAloud: `What number is 10,000 ${more ? "more" : "less"} than ${fmt(n)}?`,
        answer: String(n + step * 10_000),
        wrong: [wrong(n + step * 1000, "N2"), wrong(n + step * 100_000, "N2")],
      };
    },
  },
  {
    id: "g67-5-digit-value",
    strand: "N", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 6 }, format: "number", whiteboard: false, standard: "5.1",
    fill(rng) {
      const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 6);
      const n = digits.reduce((s, d) => s * 10 + d, 0);
      const place = rng.pick([100_000, 10_000, 1000]);
      const digit = Math.floor(n / place) % 10;
      return {
        values: { n, place },
        prompt: `What is the value of the ${digit} in ${fmt(n)}?`,
        readAloud: `What is the value of the digit ${digit} in the number ${fmt(n)}?`,
        answer: String(digit * place),
        wrong: [wrong(digit, "N2"), wrong(digit * place / 10, "N2"), wrong(digit * place * 10, "N2")],
      };
    },
  },
  {
    // Map, grade 5: 36 x 24.
    id: "g67-5-multiply-2x2",
    strand: "O", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.6",
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(12, 49), r.int(12, 49)], ([a, b]) => a % 10 !== 0 && b % 10 !== 0 && a !== b);
      // The tens partial product written without its shift: 36 x 24 = 144 + 72.
      const noShift = a * (b % 10) + a * Math.floor(b / 10);
      return {
        values: { a, b },
        prompt: `${a} × ${b} = ?`,
        readAloud: `What is ${a} times ${b}?`,
        answer: String(a * b),
        wrong: [wrong(noShift, "partial-shift")],
      };
    },
  },
  {
    // Map, grade 5: division with a remainder; half the time the quotient has a zero, as in 612 / 6 (O6).
    id: "g67-5-share-remainder",
    strand: "O", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.6",
    fill(rng) {
      const zero = rng.int(0, 1) === 1;
      const [d, q, r] = draw(
        rng,
        (g) => {
          const d = g.int(3, 9);
          return [d, zero ? g.int(1, 2) * 100 + g.int(1, 9) : g.int(21, 99), g.int(1, d - 1)];
        },
        ([d, q, r]) => q * d + r >= 100 && q * d + r < 1000,
      );
      const things = rng.pick(["stickers", "cards", "marbles", "beads"]);
      const wrongs = [wrong(`${q}.${r}`, "remainder-decimal")];
      if (zero) wrongs.push(wrong(String(q).replace("0", ""), "O6"));
      return {
        values: { d, q, r },
        prompt: `${q * d + r} ${things} are shared equally among ${d} friends. Each friend gets as many as possible. How many ${things} does each friend get?`,
        readAloud: `${q * d + r} ${things} are shared equally among ${d} friends. Each friend gets as many as possible. How many ${things} does each friend get?`,
        answer: String(q),
        wrong: wrongs,
      };
    },
  },
  {
    // A remainder that needs one more group: 150 students, buses of 32.
    id: "g67-5-groups-needed",
    strand: "O", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.6",
    fill(rng) {
      const [size, total] = draw(rng, (g) => [g.int(12, 45), g.int(60, 400)], ([s, t]) => t % s !== 0 && t / s >= 3 && t / s <= 9);
      const [group, people, verb] = rng.pick([["bus", "students", "holds"], ["van", "players", "holds"], ["table", "guests", "seats"]] as const);
      return {
        values: { size, total },
        prompt: `${total} ${people} are going on a trip. Each ${group} ${verb} ${size} ${people}. How many ${group === "bus" ? "buses" : `${group}s`} are needed so that everyone has a place?`,
        readAloud: `${total} ${people} are going on a trip. Each ${group} ${verb} ${size} ${people}. How many ${group === "bus" ? "buses" : `${group}s`} are needed so that everyone has a place?`,
        answer: String(Math.ceil(total / size)),
        wrong: [wrong(Math.floor(total / size), "remainder-ignore"), wrong(`${Math.floor(total / size)}.${total % size}`, "remainder-decimal")],
      };
    },
  },
  {
    // Map, misconception O8: 2.5 + 1.25.
    id: "g67-5-add-decimals",
    strand: "O", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.7",
    fill(rng) {
      const [x, y, z, uv] = draw(
        rng,
        (g) => [g.int(1, 9), g.int(1, 9), g.int(1, 9), g.int(11, 99)],
        ([x, y, z, uv]) => uv % 10 !== 0 && y + uv < 100 && distinctNumbers([
          (x * 100 + y * 10 + z * 100 + uv) / 100, (x * 10 + y + z * 100 + uv) / 100, x + z + (y + uv) / 100,
        ]),
      );
      const a = x + y / 10, b = z + uv / 100;
      return {
        values: { a10: x * 10 + y, b100: z * 100 + uv },
        prompt: `${fmt(a)} + ${fmt(b)} = ?`,
        readAloud: `What is ${fmt(a)} plus ${fmt(b)}?`,
        answer: typed(a + b),
        wrong: [
          // Lines the numbers up by the right edge: 2.5 is read as 0.25.
          wrong(typed((x * 10 + y) / 100 + b), "O8"),
          // Adds the whole parts, then the decimal digits as whole numbers: 5 + 25 = 30 hundredths.
          wrong(typed(x + z + (y + uv) / 100), "O8"),
        ],
      };
    },
  },
  {
    // Map, grade 5: 12.304 - 4.75.
    id: "g67-5-subtract-decimals",
    strand: "O", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 6 }, format: "number", whiteboard: true, standard: "5.7",
    fill(rng) {
      const a1000 = rng.int(10, 19) * 1000 + draw(rng, (g) => g.int(101, 999), (v) => v % 10 !== 0);
      const b100 = rng.int(2, 9) * 100 + draw(rng, (g) => g.int(11, 99), (v) => v % 10 !== 0);
      return {
        values: { a1000, b100 },
        prompt: `${fmt(a1000 / 1000)} − ${fmt(b100 / 100)} = ?`,
        readAloud: `What is ${fmt(a1000 / 1000)} minus ${fmt(b100 / 100)}?`,
        answer: typed((a1000 - b100 * 10) / 1000),
        // Lines the numbers up by the right edge: 4.75 is taken away as 0.475.
        wrong: [wrong(typed((a1000 - b100) / 1000), "O8")],
      };
    },
  },
  {
    // Making change (5.19).
    id: "g67-5-make-change",
    strand: "O", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.19",
    fill(rng) {
      const bill = rng.pick([10, 20, 50]);
      const cents = draw(rng, (g) => g.int(150, bill * 100 - 150), (c) => c % 100 !== 0 && c % 5 === 0);
      const item = rng.pick(["a book", "a lunch", "a T-shirt", "a puzzle", "a ball"]);
      const change = bill * 100 - cents;
      return {
        values: { bill, cents },
        prompt: `${item[0].toUpperCase()}${item.slice(1)} costs ${money(cents / 100)}. You pay with a ${money(bill)} bill. How much change do you get, in dollars?`,
        readAloud: `${item[0].toUpperCase()}${item.slice(1)} costs ${sayMoney(cents / 100)}. You pay with a ${bill} dollar bill. How much change do you get, in dollars?`,
        answer: typed(change / 100),
        // Regroups a dollar into cents but does not take it away from the dollars.
        wrong: [wrong(typed(change / 100 + 1), "regroup-forget")],
      };
    },
  },
  {
    // Map, grade 5: facts applied to larger numbers (800 + 700 uses 8 + 7; annexing zeros).
    id: "g67-5-facts-tens",
    strand: "O", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: false, standard: "5.9",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(2, 9), g.int(2, 9)], ([a, b]) => a !== b);
      const [i, j] = rng.pick([[1, 1], [2, 0], [0, 2], [2, 1], [1, 2]] as const);
      const x = a * 10 ** i, y = b * 10 ** j, answer = x * y;
      return {
        values: { x, y },
        prompt: `${fmt(x)} × ${fmt(y)} = ?`,
        readAloud: `What is ${fmt(x)} times ${fmt(y)}?`,
        answer: String(answer),
        wrong: [wrong(answer / 10, "zero-placeholder"), wrong(answer * 10, "zero-placeholder")],
      };
    },
  },
  {
    id: "g67-5-add-large",
    strand: "O", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.5",
    fill(rng) {
      const [a, b] = draw(
        rng,
        (g) => [g.int(12_000, 59_999), g.int(11_000, 39_999)],
        ([a, b]) => a + b < 100_000 && [1, 10, 100, 1000].filter((p) => (Math.floor(a / p) % 10) + (Math.floor(b / p) % 10) >= 10).length >= 2,
      );
      return {
        values: { a, b },
        prompt: `${fmt(a)} + ${fmt(b)} = ?`,
        readAloud: `What is ${fmt(a)} plus ${fmt(b)}?`,
        answer: String(a + b),
        wrong: [wrong(noCarry(a, b), "O3")],
      };
    },
  },

  // ---------- Fractions and decimals ----------
  {
    // Map, grade 5: which fraction equals 2/3 (misconception F9 adds the same number to both parts).
    id: "g67-5-equivalent-fraction",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: false, standard: "5.3",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(1, 8), g.int(3, 9)], ([a, b]) => a < b && gcd(a, b) === 1);
      const k = rng.int(2, 4);
      return {
        values: { a, b, k },
        prompt: `Which fraction is equal to ${frac(a, b)}?`,
        readAloud: `Which fraction is equal to ${sayFrac(a, b)}?`,
        answer: frac(a * k, b * k),
        wrong: [wrong(frac(a + k, b + k), "F9"), wrong(frac(a * k, b), "fraction-one-side"), wrong(frac(a, b * k), "fraction-one-side")],
      };
    },
  },
  {
    id: "g67-5-missing-numerator",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.3",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(1, 8), g.int(3, 9)], ([a, b]) => a < b && gcd(a, b) === 1);
      const k = rng.int(2, 6);
      return {
        values: { a, b, k },
        prompt: `${frac(a, b)} = ?/${b * k}. What is the missing number?`,
        readAloud: `${sayFrac(a, b)} is equal to what number over ${b * k}?`,
        answer: String(a * k),
        // F9 adds what was added to the denominator; fraction-one-side changes only the denominator.
        wrong: [wrong(a + b * k - b, "F9"), wrong(a, "fraction-one-side")],
      };
    },
  },
  {
    // Map, misconception F6: 0.6 or 0.45 (longer is larger).
    id: "g67-5-greatest-decimal",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: false, standard: "5.4",
    fill(rng) {
      const t = rng.int(3, 8);
      const longer = rng.shuffle(Array.from({ length: t * 10 - 10 }, (_, i) => i + 10).filter((h) => h % 10 !== 0)).slice(0, 3);
      return {
        values: { t },
        prompt: "Which decimal is the greatest?",
        readAloud: "Which decimal is the greatest?",
        answer: fmt(t / 10),
        wrong: longer.map((h) => wrong(fmt(h / 100), "F6")),
      };
    },
  },
  {
    // The least of four decimals (F6 again: a child who thinks longer is larger picks a short one as the least).
    id: "g67-5-least-decimal",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 6 }, format: "choice", whiteboard: false, standard: "5.4",
    fill(rng) {
      const t = rng.int(2, 8), u = rng.int(1, 9);
      const [v] = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== u));
      return {
        values: { t, u, v },
        prompt: "Which decimal is the least?",
        readAloud: "Which decimal is the least?",
        answer: fmt((t * 100 + u) / 1000),
        wrong: [wrong(fmt((t + 1) / 10), "F6"), wrong(fmt((t * 10 + u) / 100), "F6"), wrong(fmt((t * 10 + v) / 100), "F6")],
      };
    },
  },
  {
    // Decimals to thousandths: the value of a digit (misconception N2, for decimal places).
    id: "g67-5-decimal-place",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 6 }, format: "choice", whiteboard: false, standard: "5.2",
    fill(rng) {
      const ds = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
      const n = ds[0] + ds[1] / 10 + ds[2] / 100 + ds[3] / 1000;
      const p = rng.int(1, 3), digit = ds[p];
      const places = [["one", "ones"], ["tenth", "tenths"], ["hundredth", "hundredths"], ["thousandth", "thousandths"]] as const;
      const say = (i: number) => count(digit, places[i][0], places[i][1]);
      return {
        values: { n1000: Math.round(n * 1000), p },
        prompt: `What is the value of the ${digit} in ${fmt(n)}?`,
        readAloud: `What is the value of the digit ${digit} in the number ${fmt(n)}?`,
        answer: say(p),
        wrong: [0, 1, 2, 3].filter((i) => i !== p).map((i) => wrong(say(i), "N2")),
      };
    },
  },
  {
    // Benchmark fractions as decimals (misconception F7: 1/4 becomes 0.14).
    id: "g67-5-fraction-to-decimal",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.4",
    fill(rng) {
      const [n, d] = draw(rng, (g) => {
        const d = g.pick([2, 4, 5, 10]);
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
  {
    // Compare fractions with related denominators: each wrong choice has a bigger numerator but a smaller value.
    id: "g67-5-greatest-fraction",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: true, standard: "5.4",
    fill(rng) {
      const { b, n, picks } = draw(rng, (g) => {
        const b = g.int(3, 5), n = g.int(1, b - 1);
        const candidates = [2 * b, 4 * b].flatMap((d) => Array.from({ length: d }, (_, m) => [m, d] as const))
          .filter(([m, d]) => m > n && m * b < n * d);
        const byValue = new Map(candidates.map(([m, d]) => [(m / d).toFixed(6), [m, d] as const]));
        return { b, n, picks: g.shuffle([...byValue.values()]).slice(0, 3) };
      }, (v) => v.picks.length === 3 && gcd(v.n, v.b) === 1);
      return {
        values: { b, n },
        prompt: "Which fraction is the greatest?",
        readAloud: "Which fraction is the greatest?",
        answer: frac(n, b),
        wrong: picks.map(([m, d]) => wrong(frac(m, d), "numerator-only")),
      };
    },
  },
  {
    // Decimals as fractions (F7 reads the digits as the two parts: 0.35 becomes 3/5).
    id: "g67-5-decimal-as-fraction",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: false, standard: "5.2",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(1, 9), g.int(1, 9)], ([a, b]) => a !== b && distinctNumbers([(10 * a + b) / 100, a / b]));
      const ab = 10 * a + b;
      return {
        values: { a, b },
        prompt: `Which fraction is equal to 0.${ab}?`,
        readAloud: `Which fraction is equal to 0.${ab}?`,
        answer: frac(ab, 100),
        wrong: [wrong(frac(ab, 10), "decimal-point"), wrong(frac(ab, 1000), "decimal-point"), wrong(frac(a, b), "F7")],
      };
    },
  },
  {
    // Build a decimal from its places (a zero that holds a place).
    id: "g67-5-build-decimal",
    strand: "F", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 6 }, format: "number", whiteboard: true, standard: "5.2",
    fill(rng) {
      const a = rng.int(1, 9), b = rng.int(1, 9), tenths = rng.int(0, 1) === 1;
      const [bigWord, value, missingZero] = tenths
        ? [count(a, "tenth"), (a * 100 + b) / 1000, (a * 10 + b) / 100]
        : [count(a, "hundredth"), (a * 10 + b) / 1000, (a * 10 + b) / 100];
      const text = `${bigWord} and ${count(b, "thousandth")}`;
      return {
        values: { a, b, tenths: tenths ? 1 : 0 },
        prompt: `Write ${text} as a decimal.`,
        readAloud: `Write ${text} as a decimal.`,
        answer: typed(value),
        wrong: [wrong(typed(missingZero), "zero-placeholder")],
      };
    },
  },

  // ---------- Patterns and algebra ----------
  {
    // Map, grade 5: output = 3 x input + 1.
    id: "g67-5-rule-output",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.10",
    fill(rng) {
      const [m, c, x] = draw(rng, (g) => [g.int(2, 9), g.int(1, 9), g.int(3, 12)], ([m, c, x]) => distinctNumbers([m * x + c, m * (x + c), m + x + c]));
      return {
        values: { m, c, x },
        prompt: `Rule: output = ${m} × input + ${c}. What is the output when the input is ${x}?`,
        readAloud: `The rule is: multiply the input by ${m}, then add ${c}. What is the output when the input is ${x}?`,
        answer: String(m * x + c),
        wrong: [wrong(m * (x + c), "O7"), wrong(m + x + c, "operation")],
      };
    },
  },
  {
    // Map, grade 5: 4 + x = 15.
    id: "g67-5-equation-add",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.11",
    fill(rng) {
      const a = rng.int(3, 30), x = rng.int(3, 40), v = rng.pick(["x", "n", "y", "k"]);
      return {
        values: { a, x },
        prompt: `${a} + ${v} = ${a + x}. What is ${v}?`,
        readAloud: `${a} plus ${v} equals ${a + x}. What is ${v}?`,
        answer: String(x),
        wrong: [wrong(2 * a + x, "inverse-op")],
      };
    },
  },
  {
    id: "g67-5-equation-subtract",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.11",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(3, 30), g.int(3, 40)], ([a, b]) => a !== b);
      const v = rng.pick(["x", "n", "y", "k"]);
      return {
        values: { a, b },
        prompt: `${v} − ${a} = ${b}. What is ${v}?`,
        readAloud: `${v} minus ${a} equals ${b}. What is ${v}?`,
        answer: String(a + b),
        wrong: [wrong(Math.abs(b - a), "A4")],
      };
    },
  },
  {
    id: "g67-5-equation-multiply",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.11",
    fill(rng) {
      const [a, x] = draw(rng, (g) => [g.int(3, 9), g.int(3, 12)], ([a, x]) => a !== x);
      const v = rng.pick(["x", "n", "y", "k"]);
      return {
        values: { a, x },
        prompt: `${a} × ${v} = ${a * x}. What is ${v}?`,
        readAloud: `${a} times ${v} equals ${a * x}. What is ${v}?`,
        answer: String(x),
        wrong: [wrong(a * a * x, "inverse-op"), wrong(a * x - a, "operation")],
      };
    },
  },
  {
    // A later term of an increasing pattern.
    id: "g67-5-pattern-term",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.10",
    fill(rng) {
      const [s, d, k] = draw(rng, (g) => [g.int(2, 20), g.int(3, 12), g.int(7, 10)], ([s, d, k]) => s !== d && distinctNumbers([s + (k - 1) * d, s + 4 * d, k * d]));
      const shown = [0, 1, 2, 3].map((i) => s + i * d).join(", ");
      return {
        values: { s, d, k },
        prompt: `The pattern ${shown}, … adds the same number each time. What is the ${ordinal(k)} number in the pattern?`,
        readAloud: `The pattern ${shown} keeps going, adding the same number each time. What is the ${ordinal(k)} number in the pattern?`,
        answer: String(s + (k - 1) * d),
        wrong: [wrong(s + 4 * d, "next-not-asked"), wrong(k * d, "A5")],
      };
    },
  },
  {
    // A decreasing pattern.
    id: "g67-5-pattern-down",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.10",
    fill(rng) {
      const s = rng.int(75, 120), d = rng.int(3, 9), k = rng.int(5, 8);
      return {
        values: { s, d, k },
        prompt: `A pattern starts at ${s} and goes down by ${d} each time. What is the ${ordinal(k)} number in the pattern?`,
        readAloud: `A pattern starts at ${s} and goes down by ${d} each time. What is the ${ordinal(k)} number in the pattern?`,
        answer: String(s - (k - 1) * d),
        wrong: [wrong(s - k * d, "count-start"), wrong(s + (k - 1) * d, "pattern-direction")],
      };
    },
  },
  {
    // A rule from a table of values (the rule has a start value and a step).
    id: "g67-5-table-rule",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: false, standard: "5.10",
    fill(rng) {
      const m = rng.int(2, 6), c = rng.int(1, 9);
      const pairs = [1, 2, 3].map((x) => `input ${x}, output ${m * x + c}`).join("; ");
      return {
        values: { m, c },
        prompt: `A table has these input and output pairs: ${pairs}. Which rule fits every pair?`,
        readAloud: `A table has these input and output pairs: ${pairs}. Which rule fits every pair?`,
        answer: `output = ${m} × input + ${c}`,
        wrong: [
          wrong(`output = ${m} × input`, "A5"),
          wrong(`output = input + ${m}`, "A5"),
          wrong(`output = ${m + c} × input`, "rule-start"),
        ],
      };
    },
  },
  {
    // A story as an equation with a variable (map, 5.11: express a problem as an equation).
    id: "g67-5-story-equation",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: false, standard: "5.11",
    fill(rng) {
      const name = rng.pick(NAMES), a = rng.int(5, 15), gain = rng.int(0, 1) === 1;
      const start = rng.int(a + 3, 40), total = gain ? start + a : start - a;
      const [things, v] = rng.pick([["stickers", "s"], ["cards", "c"], ["marbles", "m"]] as const);
      const story = gain
        ? `${name} has some ${things}. ${name} gets ${a} more and now has ${total}.`
        : `${name} has some ${things}. ${name} gives away ${a} and now has ${total}.`;
      return {
        values: { a, start, gain: gain ? 1 : 0 },
        prompt: `${story} Let ${v} be the number of ${things} ${name} had at first. Which equation fits?`,
        readAloud: `${story} Let ${v} be the number of ${things} ${name} had at first. Which equation fits?`,
        answer: gain ? `${v} + ${a} = ${total}` : `${v} − ${a} = ${total}`,
        wrong: gain
          ? [wrong(`${v} − ${a} = ${total}`, "operation"), wrong(`${v} = ${total} + ${a}`, "inverse-op"), wrong(`${a} × ${v} = ${total}`, "operation")]
          : [wrong(`${v} + ${a} = ${total}`, "operation"), wrong(`${v} = ${total} − ${a}`, "inverse-op"), wrong(`${a} × ${v} = ${total}`, "operation")],
      };
    },
  },
  {
    // The equal sign as "the same as" (misconception A1).
    id: "g67-5-balance",
    strand: "A", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.11",
    fill(rng) {
      const [a, b, c] = draw(rng, (g) => [g.int(3, 15), g.int(3, 15), g.int(2, 14)], ([a, b, c]) => c < a + b && c !== a && c !== b);
      return {
        values: { a, b, c },
        prompt: `${a} + ${b} = n + ${c}. What is n?`,
        readAloud: `${a} plus ${b} equals n plus ${c}. What is n?`,
        answer: String(a + b - c),
        wrong: [wrong(a + b, "A1"), wrong(a + b + c, "A1")],
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    // Map, grade 5: a rectangle 9 m by 4 m.
    id: "g67-5-rectangle-area",
    strand: "MG", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.12",
    fill(rng) {
      const [l, w] = draw(rng, (g) => [g.int(4, 15), g.int(3, 12)], ([l, w]) => l !== w && distinctNumbers([l * w, 2 * (l + w), l + w]));
      const [unit, units] = rng.pick([["m", "square metres"], ["cm", "square centimetres"]] as const);
      return {
        values: { l, w },
        prompt: `A rectangle is ${l} ${unit} long and ${w} ${unit} wide. What is its area, in ${units}?`,
        readAloud: `A rectangle is ${l} ${unit === "m" ? "metres" : "centimetres"} long and ${w} ${unit === "m" ? "metres" : "centimetres"} wide. What is its area, in ${units}?`,
        answer: String(l * w),
        wrong: [wrong(2 * (l + w), "M2"), wrong(l + w, "M2")],
      };
    },
  },
  {
    id: "g67-5-area-side",
    strand: "MG", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.12",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(3, 12), g.int(3, 15)], ([a, b]) => a !== b);
      return {
        values: { a, b },
        prompt: `A rectangle has an area of ${a * b} square centimetres. One side is ${a} cm long. How long is the other side, in centimetres?`,
        readAloud: `A rectangle has an area of ${a * b} square centimetres. One side is ${a} centimetres long. How long is the other side, in centimetres?`,
        answer: String(b),
        wrong: [wrong(a * b - a, "operation")],
      };
    },
  },
  {
    // 5.13: area and perimeter are related but not dependent on each other.
    id: "g67-5-same-area",
    strand: "MG", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: true, standard: "5.13",
    fill(rng) {
      const area = rng.pick([12, 18, 20, 24, 30, 36, 40]);
      const pairs = Array.from({ length: area }, (_, i) => i + 2).filter((a) => area % a === 0 && a < area / a).map((a) => [a, area / a] as const);
      const [p, q] = rng.shuffle(pairs);
      const [thin, wide] = p[1] - p[0] > q[1] - q[0] ? [p, q] : [q, p];
      const name = ([a, b]: readonly [number, number]) => `The ${a} cm by ${b} cm rectangle`;
      const say = ([a, b]: readonly [number, number]) => `${a} centimetres by ${b} centimetres`;
      return {
        values: { area, p0: p[0], q0: q[0] },
        prompt: `Two rectangles both have an area of ${area} square centimetres. One is ${p[0]} cm by ${p[1]} cm. The other is ${q[0]} cm by ${q[1]} cm. Which one has the longer perimeter?`,
        readAloud: `Two rectangles both have an area of ${area} square centimetres. One is ${say(p)}. The other is ${say(q)}. Which one has the longer perimeter?`,
        answer: name(thin),
        wrong: [wrong(name(wide), "more-less"), wrong("They have the same perimeter", "M2")],
      };
    },
  },
  {
    // Map, grade 5 and misconception M8: 2:50 p.m. plus 1 h 25 min.
    id: "g67-5-elapsed-time",
    strand: "MG", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: true, standard: "5.14",
    fill(rng) {
      const [h, m, dh, dm] = draw(
        rng,
        (g) => [g.int(1, 7), g.int(6, 11) * 5, g.int(2, 3), g.int(3, 11) * 5],
        ([, m, , dm]) => m + dm >= 65 && m + dm < 120,
      );
      const event = rng.pick(["A movie", "A soccer game", "A school concert", "A swim meet"]);
      const at = (hh: number, mm: number) => `${hh}:${pad(mm)} p.m.`;
      return {
        values: { h, m, dh, dm },
        prompt: `${event} starts at ${at(h, m)} and lasts ${count(dh, "hour")} ${count(dm, "minute")}. When does it end?`,
        readAloud: `${event} starts at ${at(h, m)} and lasts ${count(dh, "hour")} and ${count(dm, "minute")}. When does it end?`,
        answer: at(h + dh + 1, m + dm - 60),
        wrong: [
          wrong(at(h + dh, m + dm), "M8"),
          wrong(at(h + dh, m + dm - 60), "regroup-forget"),
          wrong(at(h + 1, m + dm - 60), "one-part"),
        ],
      };
    },
  },
  {
    // Map, grade 5: which solid has 2 triangular faces and 3 rectangular faces.
    id: "g67-5-solid-from-faces",
    strand: "MG", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: false, standard: "5.15",
    fill(rng) {
      const solids = [
        ["triangular prism", "2 triangle faces and 3 rectangle faces"],
        ["square pyramid", "1 square face and 4 triangle faces"],
        ["triangular pyramid", "4 triangle faces"],
        ["pentagonal prism", "2 pentagon faces and 5 rectangle faces"],
        ["hexagonal prism", "2 hexagon faces and 6 rectangle faces"],
        ["pentagonal pyramid", "1 pentagon face and 5 triangle faces"],
        ["hexagonal pyramid", "1 hexagon face and 6 triangle faces"],
        ["rectangular prism", "6 rectangle faces"],
      ] as const;
      const i = rng.int(0, solids.length - 1);
      const [name, faces] = solids[i];
      // The same base shape first (prism or pyramid mixed up), then any other solid.
      const base = name.split(" ")[0];
      const others = solids.filter((_, j) => j !== i).map(([n]) => n);
      const picks = [...others.filter((n) => n.startsWith(base)), ...rng.shuffle(others.filter((n) => !n.startsWith(base)))].slice(0, 3);
      return {
        values: { i },
        prompt: `Which solid has exactly ${faces}?`,
        readAloud: `Which solid has exactly ${faces}?`,
        answer: name,
        wrong: picks.map((n) => wrong(n, "shape-name")),
      };
    },
  },
  {
    id: "g67-5-solid-count",
    strand: "MG", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.15",
    fill(rng) {
      const solids = [
        ["a triangular prism", 5, 9, 6], ["a rectangular prism", 6, 12, 8], ["a pentagonal prism", 7, 15, 10],
        ["a hexagonal prism", 8, 18, 12], ["a square pyramid", 5, 8, 5], ["a pentagonal pyramid", 6, 10, 6],
        ["a hexagonal pyramid", 7, 12, 7], ["a triangular pyramid", 4, 6, 4],
      ] as const;
      const i = rng.int(0, solids.length - 1), part = rng.int(0, 2);
      const [name, ...counts] = solids[i];
      const names = ["faces", "edges", "vertices (corners)"];
      const others = [0, 1, 2].filter((j) => j !== part && counts[j] !== counts[part]).map((j) => counts[j]);
      return {
        values: { i, part },
        prompt: `How many ${names[part]} does ${name} have?`,
        readAloud: `How many ${part === 2 ? "vertices, or corners," : names[part]} does ${name} have?`,
        answer: String(counts[part]),
        wrong: [...new Set(others)].map((c) => wrong(c, "faces-corners")),
      };
    },
  },
  {
    // 5.16: single transformations, described in words.
    id: "g67-5-name-transformation",
    strand: "MG", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "choice", whiteboard: false, standard: "5.16",
    fill(rng) {
      const shape = rng.pick(["A triangle", "An arrow shape", "A flag shape", "A letter L shape", "A trapezoid"]);
      const kind = rng.int(0, 2);
      const move = [
        () => `slides ${rng.int(2, 9)} squares ${rng.pick(["to the left", "to the right", "up", "down"])} on a grid. It does not turn or flip`,
        () => `is flipped over a ${rng.pick(["straight", "dotted", "mirror"])} line, so it now faces the opposite way`,
        () => `is turned a ${rng.pick(["quarter", "half"])} turn around one of its corners`,
      ][kind]();
      const names = ["translation", "reflection", "rotation"];
      return {
        values: { kind },
        prompt: `${shape} ${move}. What is this move called?`,
        readAloud: `${shape} ${move}. What is this move called?`,
        answer: names[kind],
        wrong: names.filter((_, i) => i !== kind).map((n) => wrong(n, "transform-name")),
      };
    },
  },
  {
    // Map, grade 5: a double bar graph where each grid line stands for 5 (many-to-one correspondence).
    id: "g67-5-double-bar-graph",
    strand: "DP", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.17",
    fill(rng) {
      const scale = rng.pick([2, 5, 10, 20]);
      const [a, b] = draw(rng, (g) => [g.int(2, 8), g.int(3, 9)], ([a, b]) => b > a);
      const [what, low, high] = rng.pick([["books read", "Grade 4", "Grade 5"], ["cans collected", "Class A", "Class B"], ["laps swum", "Monday", "Tuesday"]] as const);
      return {
        values: { scale, a, b },
        prompt: `In a double bar graph of ${what}, each grid line stands for ${scale}. The bar for ${low} reaches the ${ordinal(a)} grid line. The bar for ${high} reaches the ${ordinal(b)} grid line. How many more ${what.split(" ")[0]} for ${high} than for ${low}?`,
        readAloud: `In a double bar graph of ${what}, each grid line stands for ${scale}. The bar for ${low} reaches the ${ordinal(a)} grid line. The bar for ${high} reaches the ${ordinal(b)} grid line. How many more ${what.split(" ")[0]} for ${high} than for ${low}?`,
        answer: String((b - a) * scale),
        wrong: [wrong(b - a, "D1"), wrong(b * scale, "graph-value")],
      };
    },
  },
  {
    // A pictograph key with a half picture (many-to-one correspondence).
    id: "g67-5-pictograph",
    strand: "DP", grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5 }, format: "number", whiteboard: true, standard: "5.17",
    fill(rng) {
      const k = rng.pick([2, 4, 6, 8, 10]), n = rng.int(3, 8);
      const sport = rng.pick(["soccer", "hockey", "swimming", "basketball"]);
      return {
        values: { k, n },
        prompt: `In a pictograph, each picture stands for ${k} students. The row for ${sport} has ${n} and a half pictures. How many students chose ${sport}?`,
        readAloud: `In a pictograph, each picture stands for ${k} students. The row for ${sport} has ${n} and a half pictures. How many students chose ${sport}?`,
        answer: String(k * n + k / 2),
        wrong: [wrong(k * n, "one-part"), wrong(n, "D1")],
      };
    },
  },
  {
    // Map, grade 5: probability of red on a spinner, as a fraction (D4 compares part to part).
    // WNCP gives probability as a fraction in grade 6 (it describes likelihood in words in grade 5).
    id: "g67-5-spinner-probability",
    strand: "DP", grades: { BC: 5, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "5.18",
    fill(rng) {
      const [n, r] = draw(rng, (g) => {
        const n = g.int(5, 10);
        return [n, g.int(1, n - 2)];
      }, ([n, r]) => 2 * r !== n && distinct([frac(r, n), frac(r, n - r), frac(n - r, n), "1/2"]) && distinctNumbers([r / n, r / (n - r), (n - r) / n, 0.5]));
      return {
        values: { n, r },
        prompt: `A spinner has ${n} equal parts. ${r === 1 ? "1 part is" : `${r} parts are`} red and the rest are blue. What is the probability of spinning red?`,
        readAloud: `A spinner has ${n} equal parts. ${r === 1 ? "1 part is" : `${r} parts are`} red and the rest are blue. What is the probability of spinning red?`,
        answer: frac(r, n),
        wrong: [wrong(frac(r, n - r), "D4"), wrong(frac(n - r, n), "probability-other"), wrong("1/2", "D3")],
      };
    },
  },
];
