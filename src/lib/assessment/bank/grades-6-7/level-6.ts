// Level 6 (BC grade 6) for the grades 6-7 bank: stage 1 for a grade 6 child, and the "down" form for a grade 7 child.
// Standards: curriculum map, section 1 (6.1-6.19); example items: section 3, grade 6. Province tags: see ./index.ts.
import { draw, NAMES, ordinal, wrong, type TaggedTemplate } from "../kit";
import { distinct, distinctNumbers, fmt, frac, gcd, lcm, mixed, money, sayFrac, sayMixed, sayMoney, typed } from "./helpers";

const PRIMES = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
/** Odd composite numbers: a child who thinks "odd means prime" picks them (N5). */
const ODD_COMPOSITES = [9, 15, 21, 25, 27, 33, 35, 39, 45, 49, 51, 55, 57, 63, 65, 69, 75, 77, 81, 85, 87, 91, 93, 95];
const PARTS: Record<number, string> = { 2: "halves", 3: "thirds", 4: "fourths", 5: "fifths", 6: "sixths", 8: "eighths", 10: "tenths" };

export const LEVEL_6: readonly TaggedTemplate[] = [
  // ---------- Number and operations ----------
  {
    // Map, grade 6: write 3.2 billion in digits.
    id: "g67-6-large-digits",
    strand: "N", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 7 }, format: "number", whiteboard: false, standard: "6.1",
    fill(rng) {
      const [unit, size] = rng.pick([["million", 1_000_000], ["billion", 1_000_000_000]] as const);
      const tenths = rng.int(11, 99), hundredths = rng.int(0, 2) === 0;
      const shown = hundredths ? (tenths * 10 + rng.int(1, 9)) / 100 : tenths / 10;
      const value = Math.round(shown * size);
      return {
        values: { shown100: Math.round(shown * 100), size },
        prompt: `Write ${fmt(shown)} ${unit} in digits.`,
        readAloud: `Write ${fmt(shown)} ${unit} in digits.`,
        answer: String(value),
        wrong: [wrong(value * 10, "decimal-point"), wrong(value / 10, "decimal-point")],
      };
    },
  },
  {
    // Compare large numbers: line them up by place value, not by their first digits.
    id: "g67-6-greatest-large",
    strand: "N", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 7 }, format: "choice", whiteboard: false, standard: "6.1",
    fill(rng) {
      const a = rng.int(1, 9);
      const [p, q] = draw(rng, (g) => [g.int(2, 9), g.int(1, 8)], ([p, q]) => p > q && p !== a);
      const M = 1_000_000;
      return {
        values: { a, p, q },
        prompt: "Which number is the greatest?",
        readAloud: "Which number is the greatest?",
        answer: fmt(a * M + p * 100_000 + q * 10_000),
        wrong: [
          wrong(fmt(a * M + q * 100_000 + p * 10_000), "digit-compare"),
          wrong(fmt(a * M + p * 10_000 + q * 1000), "zero-placeholder"),
          wrong(fmt(p * 100_000 + q * 10_000 + a * 1000), "digit-compare"),
        ],
      };
    },
  },
  {
    // Place value to thousandths (6.1).
    id: "g67-6-decimal-digit-value",
    strand: "N", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: false, standard: "6.1",
    fill(rng) {
      const ds = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
      const n = (ds[0] * 1000 + ds[1] * 100 + ds[2] * 10 + ds[3]) / 1000;
      const p = rng.int(1, 3), digit = ds[p];
      const value = digit / 10 ** p;
      return {
        values: { n1000: Math.round(n * 1000), p },
        prompt: `What is the value of the ${digit} in ${fmt(n)}? Write it as a decimal.`,
        readAloud: `What is the value of the digit ${digit} in the number ${fmt(n)}? Write it as a decimal.`,
        answer: typed(value),
        wrong: [digit, ...[1, 2, 3].filter((i) => i !== p).map((i) => digit / 10 ** i)].map((v) => wrong(typed(v), "N2")),
      };
    },
  },
  {
    // Map, grade 6: the least common multiple of 4 and 6.
    id: "g67-6-lcm",
    strand: "N", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 7 }, format: "number", whiteboard: true, standard: "6.4",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(3, 15), g.int(3, 15)], ([a, b]) => a < b && gcd(a, b) > 1 && b % a !== 0);
      const story = rng.int(0, 1) === 1;
      const prompt = story
        ? `Hot dogs come in packs of ${a} and buns come in packs of ${b}. What is the least number of hot dogs you can buy to have the same number of hot dogs and buns?`
        : `What is the least common multiple of ${a} and ${b}?`;
      return {
        values: { a, b, story: story ? 1 : 0 },
        prompt,
        readAloud: prompt,
        answer: String(lcm(a, b)),
        wrong: [wrong(a * b, "lcm-product"), wrong(gcd(a, b), "gcf-lcm")],
      };
    },
  },
  {
    // Map, grade 7 (carried from 6.4): the greatest common factor of 24 and 36.
    id: "g67-6-gcf",
    strand: "N", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 7 }, format: "number", whiteboard: true, standard: "6.4",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(12, 60), g.int(12, 60)], ([a, b]) => a < b && gcd(a, b) >= 4 && gcd(a, b) < a && b % a !== 0);
      const g = gcd(a, b);
      // The biggest common factor below the greatest one: a common factor, but not the greatest.
      const smaller = Array.from({ length: g - 1 }, (_, i) => g - 1 - i).find((f) => g % f === 0)!;
      const wrongs = [wrong(lcm(a, b), "gcf-lcm")];
      if (smaller > 1) wrongs.push(wrong(smaller, "factor-not-greatest"));
      return {
        values: { a, b },
        prompt: `What is the greatest common factor of ${a} and ${b}?`,
        readAloud: `What is the greatest common factor of ${a} and ${b}?`,
        answer: String(g),
        wrong: wrongs,
      };
    },
  },
  {
    // Map, grade 6 and misconception N5: which number is prime.
    id: "g67-6-which-prime",
    strand: "N", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.4",
    fill(rng) {
      const p = rng.pick(PRIMES.filter((x) => x < 50));
      const others = rng.shuffle(ODD_COMPOSITES.filter((x) => x < 60)).slice(0, 3);
      return {
        values: { p },
        prompt: "Which number is prime?",
        readAloud: "Which number is a prime number?",
        answer: String(p),
        wrong: others.map((c) => wrong(c, "N5")),
      };
    },
  },
  {
    id: "g67-6-which-composite",
    strand: "N", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.4",
    fill(rng) {
      const c = rng.pick(ODD_COMPOSITES.filter((x) => x > 20 && x % 5 !== 0));
      const others = rng.shuffle(PRIMES).slice(0, 3);
      return {
        values: { c },
        prompt: "Which number is composite?",
        readAloud: "Which number is a composite number?",
        answer: String(c),
        wrong: others.map((p) => wrong(p, "prime-composite")),
      };
    },
  },
  {
    // Map, grade 6 and misconception O7: 6 + 4 x 3.
    id: "g67-6-order-of-operations",
    strand: "O", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.3",
    fill(rng) {
      const form = rng.int(0, 2);
      const [a, b, c, d] = draw(rng, (g) => [g.int(2, 30), g.int(2, 9), g.int(2, 9), g.int(2, 9)], ([a, b, c]) => form !== 1 || a > b * c + 1);
      const [shown, said, answer, leftToRight] = [
        [`${a} + ${b} × ${c}`, `${a} plus ${b} times ${c}`, a + b * c, (a + b) * c],
        [`${a} − ${b} × ${c}`, `${a} minus ${b} times ${c}`, a - b * c, (a - b) * c],
        [`${b} × ${c} + ${a} × ${d}`, `${b} times ${c} plus ${a} times ${d}`, b * c + a * d, (b * c + a) * d],
      ][form] as [string, string, number, number];
      return {
        values: { a, b, c, d, form },
        prompt: `${shown} = ?`,
        readAloud: `What is ${said}?`,
        answer: String(answer),
        wrong: [wrong(leftToRight, "O7")],
      };
    },
  },
  {
    // Order of operations with brackets (6.3: includes brackets, excludes exponents).
    id: "g67-6-brackets",
    strand: "O", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.3",
    fill(rng) {
      const form = rng.int(0, 2);
      const [a, b, c] = draw(
        rng,
        (g) => [g.int(2, 12), g.int(2, 15), g.int(2, 12)],
        ([a, b, c]) => (form !== 1 || ((a + b) % c === 0 && b % c === 0)) && (form !== 2 || a * 3 > b + c) && a !== b,
      );
      const big = 3 * a;
      const [shown, said, answer, noBrackets] = [
        [`${a} × (${b} + ${c})`, `${a} times, open bracket, ${b} plus ${c}, close bracket`, a * (b + c), a * b + c],
        [`(${a} + ${b}) ÷ ${c}`, `open bracket, ${a} plus ${b}, close bracket, divided by ${c}`, (a + b) / c, a + b / c],
        [`${big} − (${b} − ${c})`, `${big} minus, open bracket, ${b} minus ${c}, close bracket`, big - (b - c), big - b - c],
      ][form] as [string, string, number, number];
      return {
        values: { a, b, c, form },
        prompt: `${shown} = ?`,
        readAloud: `What is ${said}?`,
        answer: String(answer),
        wrong: [wrong(noBrackets, "O7")],
      };
    },
  },
  {
    // Map, grade 6: 0.125 x 3.
    id: "g67-6-decimal-times",
    strand: "O", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.8",
    fill(rng) {
      const places = rng.int(1, 3);
      const k = draw(rng, (g) => g.int(11, places === 3 ? 999 : 99 * 10 ** (places - 1)), (k) => k % 10 !== 0);
      const d = k / 10 ** places, m = rng.int(2, 9);
      const answer = (k * m) / 10 ** places;
      return {
        values: { k, places, m },
        prompt: `${fmt(d)} × ${m} = ?`,
        readAloud: `What is ${fmt(d)} times ${m}?`,
        answer: typed(answer),
        wrong: [wrong(typed(answer * 10), "decimal-point"), wrong(typed(answer / 10), "decimal-point")],
      };
    },
  },
  {
    // Map, grade 6: 7.2 / 9.
    id: "g67-6-decimal-divide",
    strand: "O", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.8",
    fill(rng) {
      const places = rng.int(1, 2);
      const k = draw(rng, (g) => g.int(2, places === 1 ? 49 : 299), (k) => k % 10 !== 0);
      const q = k / 10 ** places, m = rng.int(2, 9);
      return {
        values: { k, places, m },
        prompt: `${fmt((k * m) / 10 ** places)} ÷ ${m} = ?`,
        readAloud: `What is ${fmt((k * m) / 10 ** places)} divided by ${m}?`,
        answer: typed(q),
        wrong: [wrong(typed(q * 10), "decimal-point"), wrong(typed(q / 10), "decimal-point")],
      };
    },
  },
  {
    // Map, grade 6: double-double to multiply 23 x 4 (misconception O5 writes 8 and 12 side by side).
    id: "g67-6-times-four",
    strand: "O", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.2",
    fill(rng) {
      const a = draw(rng, (g) => g.int(13, 49), (a) => a % 10 >= 3);
      return {
        values: { a },
        prompt: `${a} × 4 = ?`,
        readAloud: `What is ${a} times 4?`,
        answer: String(a * 4),
        wrong: [wrong(`${Math.floor(a / 10) * 4}${(a % 10) * 4}`, "O5"), wrong(a * 2, "one-part")],
      };
    },
  },
  {
    // Map, 6.19: weeks of allowance to buy a bicycle.
    id: "g67-6-save-weeks",
    strand: "O", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.19",
    fill(rng) {
      const [weekly, cost] = draw(rng, (g) => [g.int(5, 25), g.int(12, 60) * 5], ([w, c]) => c % w !== 0 && c / w > 4 && c / w < 30);
      const name = rng.pick(NAMES), item = rng.pick(["a bike", "a tablet", "a skateboard", "a guitar"]);
      return {
        values: { weekly, cost },
        prompt: `${name} saves ${money(weekly)} each week to buy ${item} that costs ${money(cost)}. How many weeks does ${name} need to save to have enough?`,
        readAloud: `${name} saves ${sayMoney(weekly)} each week to buy ${item} that costs ${sayMoney(cost)}. How many weeks does ${name} need to save to have enough?`,
        answer: String(Math.ceil(cost / weekly)),
        wrong: [wrong(Math.floor(cost / weekly), "remainder-ignore"), wrong(cost - weekly, "operation")],
      };
    },
  },
  {
    // Dividing money equally (6.8, a decimal divided by a whole number).
    id: "g67-6-share-money",
    strand: "O", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.8",
    fill(rng) {
      const n = rng.int(2, 6), each = draw(rng, (g) => g.int(105, 995), (c) => c % 5 === 0 && c % 100 !== 0);
      const total = each * n;
      return {
        values: { n, each },
        prompt: `${n} friends share ${money(total / 100)} equally. How much does each friend get, in dollars?`,
        readAloud: `${n} friends share ${sayMoney(total / 100)} equally. How much does each friend get, in dollars?`,
        answer: typed(each / 100),
        wrong: [wrong(typed(each / 10), "decimal-point"), wrong(typed((total * n) / 100), "operation")],
      };
    },
  },

  // ---------- Fractions, ratio and percent ----------
  {
    // Map, grade 6: write 17/5 as a mixed number.
    id: "g67-6-improper-to-mixed",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: true, standard: "6.5",
    fill(rng) {
      const [d, w, r] = draw(rng, (g) => {
        const d = g.int(3, 9);
        return [d, g.int(2, 5), g.int(1, d - 1)];
      }, ([d, w, r]) => w < d && r !== w && gcd(r, d) === 1);
      const n = w * d + r;
      return {
        values: { d, w, r },
        prompt: `Write ${frac(n, d)} as a mixed number.`,
        readAloud: `Write ${sayFrac(n, d)} as a mixed number.`,
        answer: mixed(w, r, d),
        wrong: [wrong(mixed(r, w, d), "remainder-swap"), wrong(mixed(w, r, n), "mixed-denominator")],
      };
    },
  },
  {
    // Misconception F8: 2 1/3 becomes 21/3 or 3/3.
    id: "g67-6-mixed-to-improper",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: true, standard: "6.5",
    fill(rng) {
      const [d, w, r] = draw(rng, (g) => {
        const d = g.int(3, 9);
        return [d, g.int(1, 5), g.int(1, d - 1)];
      }, ([d, w, r]) => gcd(r, d) === 1 && distinctNumbers([w * d + r, Number(`${w}${r}`), w + r, w * d]));
      return {
        values: { d, w, r },
        prompt: `Write ${mixed(w, r, d)} as an improper fraction.`,
        readAloud: `Write ${sayMixed(w, r, d)} as an improper fraction.`,
        answer: frac(w * d + r, d),
        wrong: [wrong(frac(Number(`${w}${r}`), d), "F8"), wrong(frac(w + r, d), "F8"), wrong(frac(w * d, d), "one-part")],
      };
    },
  },
  {
    id: "g67-6-count-parts",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.5",
    fill(rng) {
      const [d, w, r] = draw(rng, (g) => {
        const d = g.pick([3, 4, 5, 6, 8, 10]);
        return [d, g.int(1, 6), g.int(1, d - 1)];
      }, ([d, w, r]) => gcd(r, d) === 1 && distinctNumbers([w * d + r, Number(`${w}${r}`), w + r]));
      return {
        values: { d, w, r },
        prompt: `How many ${PARTS[d]} are in ${mixed(w, r, d)}?`,
        readAloud: `How many ${PARTS[d]} are in ${sayMixed(w, r, d)}?`,
        answer: String(w * d + r),
        wrong: [wrong(`${w}${r}`, "F8"), wrong(w + r, "F8")],
      };
    },
  },
  {
    // 6.5: compare fractions with unlike denominators (common denominators). Each wrong choice has a bigger numerator.
    id: "g67-6-greatest-fraction",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: true, standard: "6.5",
    fill(rng) {
      const { n, b, picks } = draw(rng, (g) => {
        const b = g.pick([3, 4, 5, 6]), n = g.int(1, b - 1);
        const candidates = [5, 6, 7, 8, 9, 10, 12].filter((d) => d !== b && d % b !== 0)
          .flatMap((d) => Array.from({ length: d }, (_, m) => [m, d] as const))
          .filter(([m, d]) => m > n && m * b < n * d && gcd(m, d) === 1);
        const byValue = new Map(candidates.map(([m, d]) => [(m / d).toFixed(6), [m, d] as const]));
        return { n, b, picks: g.shuffle([...byValue.values()]).slice(0, 3) };
      }, (v) => v.picks.length === 3 && gcd(v.n, v.b) === 1);
      return {
        values: { n, b },
        prompt: "Which fraction is the greatest?",
        readAloud: "Which fraction is the greatest?",
        answer: frac(n, b),
        wrong: picks.map(([m, d]) => wrong(frac(m, d), "numerator-only")),
      };
    },
  },
  {
    // Map, grade 6: 3 red and 5 blue marbles, the ratio of red to blue.
    id: "g67-6-ratio-part-part",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.6",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(2, 9), g.int(2, 9)], ([a, b]) => a !== b && gcd(a, b) === 1);
      const [where, x, y] = rng.pick([["A bag", "red marbles", "blue marbles"], ["A shelter", "cats", "dogs"], ["A bowl", "apples", "pears"], ["A box", "pencils", "pens"]] as const);
      return {
        values: { a, b },
        prompt: `${where} has ${a} ${x} and ${b} ${y}. What is the ratio of ${x} to ${y}?`,
        readAloud: `${where} has ${a} ${x} and ${b} ${y}. What is the ratio of ${x} to ${y}?`,
        answer: `${a}:${b}`,
        wrong: [wrong(`${b}:${a}`, "ratio-order"), wrong(`${a}:${a + b}`, "ratio-whole"), wrong(`${b}:${a + b}`, "fraction-other-part")],
      };
    },
  },
  {
    id: "g67-6-ratio-part-whole",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.6",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(2, 9), g.int(2, 9)], ([a, b]) => a !== b && gcd(a, b) === 1);
      const [where, x, y, all] = rng.pick([
        ["A bag", "red marbles", "blue marbles", "all the marbles"], ["A shelter", "cats", "dogs", "all the animals"],
        ["A team", "girls", "boys", "all the players"], ["A box", "pencils", "pens", "everything in the box"],
      ] as const);
      return {
        values: { a, b },
        prompt: `${where} has ${a} ${x} and ${b} ${y}. What is the ratio of ${y} to ${all}?`,
        readAloud: `${where} has ${a} ${x} and ${b} ${y}. What is the ratio of ${y} to ${all}?`,
        answer: `${b}:${a + b}`,
        wrong: [wrong(`${b}:${a}`, "ratio-whole"), wrong(`${a + b}:${b}`, "ratio-order"), wrong(`${a}:${a + b}`, "fraction-other-part")],
      };
    },
  },
  {
    // Map, misconception F9: 2 cups of juice to 3 cups of water; for 6 cups of juice, water = 9, not 7.
    id: "g67-6-equivalent-ratio",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.6",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(2, 5), g.int(2, 7)], ([a, b]) => a !== b && gcd(a, b) === 1);
      const k = rng.int(2, 5);
      const [x, y] = rng.pick([["juice", "water"], ["blue paint", "white paint"], ["flour", "sugar"]] as const);
      return {
        values: { a, b, k },
        prompt: `A recipe uses ${a} cups of ${x} for every ${b} cups of ${y}. How many cups of ${y} go with ${a * k} cups of ${x}?`,
        readAloud: `A recipe uses ${a} cups of ${x} for every ${b} cups of ${y}. How many cups of ${y} go with ${a * k} cups of ${x}?`,
        answer: String(b * k),
        wrong: [wrong(b + a * k - a, "F9")],
      };
    },
  },
  {
    id: "g67-6-equivalent-ratio-choice",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.6",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(1, 9), g.int(2, 9)], ([a, b]) => a !== b && gcd(a, b) === 1);
      const k = rng.int(2, 4);
      return {
        values: { a, b, k },
        prompt: `Which ratio is equivalent to ${a * k}:${b * k}?`,
        readAloud: `Which ratio is equivalent to ${a * k} to ${b * k}?`,
        answer: `${a}:${b}`,
        wrong: [wrong(`${a * k + 2}:${b * k + 2}`, "F9"), wrong(`${b}:${a}`, "ratio-order"), wrong(`${a}:${b * k}`, "fraction-one-side")],
      };
    },
  },
  {
    // A ratio as a fraction of the whole (6.6, part-to-part and part-to-whole).
    id: "g67-6-ratio-to-fraction",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.6",
    fill(rng) {
      const [g, b] = draw(rng, (r) => [r.int(1, 9), r.int(1, 9)], ([g, b]) => g !== b && gcd(g, b) === 1);
      return {
        values: { g, b },
        prompt: `In a class, the ratio of girls to boys is ${g}:${b}. What fraction of the class are girls?`,
        readAloud: `In a class, the ratio of girls to boys is ${g} to ${b}. What fraction of the class are girls?`,
        answer: frac(g, g + b),
        wrong: [wrong(frac(g, b), "ratio-whole"), wrong(frac(b, g + b), "fraction-other-part"), wrong(frac(g + b, g), "fraction-flip")],
      };
    },
  },
  {
    // Map, grade 6 and misconception F10: 25% of 80.
    id: "g67-6-percent-of",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 5 }, format: "number", whiteboard: true, standard: "6.7",
    fill(rng) {
      const [p, whole] = draw(rng, (g) => [g.pick([10, 20, 25, 30, 40, 50, 60, 75]), g.int(4, 40) * 10], ([p, w]) => (p * w) % 100 === 0 && w > p && w - p !== p * w / 100);
      const answer = (p * whole) / 100;
      const wrongs = [wrong(whole - p, "F10")];
      // 80 / 25 = 3.2: only when the division ends.
      if (((whole * 1000) / p) % 1 === 0 && whole / p !== answer) wrongs.push(wrong(typed(whole / p), "F10"));
      return {
        values: { p, whole },
        prompt: `What is ${p}% of ${whole}?`,
        readAloud: `What is ${p} percent of ${whole}?`,
        answer: String(answer),
        wrong: wrongs,
      };
    },
  },
  {
    // 6.7: a 10 x 10 grid, described in words.
    id: "g67-6-percent-grid",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 5 }, format: "number", whiteboard: false, standard: "6.7",
    fill(rng) {
      const k = draw(rng, (g) => g.int(2, 98), (k) => k !== 50 && k % 10 !== 0);
      return {
        values: { k },
        prompt: `A grid has 100 equal squares. ${k} of them are shaded. What percent of the grid is shaded?`,
        readAloud: `A grid has 100 equal squares. ${k} of them are shaded. What percent of the grid is shaded?`,
        answer: String(k),
        wrong: [wrong(100 - k, "fraction-other-part"), wrong(typed(k / 100), "decimal-point")],
      };
    },
  },
  {
    // 6.7: find the missing whole.
    id: "g67-6-percent-whole",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.7",
    fill(rng) {
      const p = rng.pick([10, 20, 25, 50]), part = rng.int(2, 30);
      const whole = (part * 100) / p;
      const name = rng.pick(NAMES);
      return {
        values: { p, part },
        prompt: `${name} has read ${part} pages. That is ${p}% of the book. How many pages does the book have?`,
        readAloud: `${name} has read ${part} pages. That is ${p} percent of the book. How many pages does the book have?`,
        answer: String(whole),
        wrong: [wrong(typed((part * p) / 100), "F10"), wrong(part + p, "operation")].filter((w) => Number(w.value) !== whole),
      };
    },
  },
  {
    // 6.7: percentage discounts.
    id: "g67-6-discount",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.7",
    fill(rng) {
      const [p, price] = draw(rng, (g) => [g.pick([10, 20, 25, 50]), g.int(4, 40) * 5], ([p, c]) => p !== 50 && c > p && (p * c) % 100 === 0 && distinctNumbers([c * (100 - p) / 100, c * p / 100, c - p]));
      const item = rng.pick(["jacket", "pair of shoes", "backpack", "game"]);
      return {
        values: { p, price },
        prompt: `A ${item} costs ${money(price)}. It is on sale for ${p}% off. What is the sale price, in dollars?`,
        readAloud: `A ${item} costs ${sayMoney(price)}. It is on sale for ${p} percent off. What is the sale price, in dollars?`,
        answer: String((price * (100 - p)) / 100),
        wrong: [wrong((price * p) / 100, "discount-price"), wrong(price - p, "F10")],
      };
    },
  },
  {
    // 6.7: 50% = 1/2 = 0.5.
    id: "g67-6-percent-to-decimal",
    strand: "F", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: false, standard: "6.7",
    fill(rng) {
      const p = draw(rng, (g) => g.int(1, 99), (p) => p % 10 !== 0);
      return {
        values: { p },
        prompt: `Write ${p}% as a decimal.`,
        readAloud: `Write ${p} percent as a decimal.`,
        answer: typed(p / 100),
        wrong: [wrong(typed(p / 10), "decimal-point"), wrong(typed(p / 1000), "decimal-point")],
      };
    },
  },

  // ---------- Patterns and algebra ----------
  {
    // Map, grade 6: 3, 5, 7, 9 follows 2n + 1; the 10th term.
    id: "g67-6-nth-term",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.9",
    fill(rng) {
      const [a, b, k] = draw(rng, (g) => [g.int(2, 6), g.int(1, 9), g.int(10, 25)], ([a, b, k]) => distinctNumbers([a * k + b, a * k, Number(`${a}${k}`) + b]));
      const shown = [1, 2, 3, 4].map((n) => a * n + b).join(", ");
      return {
        values: { a, b, k },
        prompt: `The pattern ${shown}, … follows the rule ${a}n + ${b}, where n is the position. What is the ${ordinal(k)} number?`,
        readAloud: `The pattern ${shown} keeps going. It follows the rule ${a} times n, plus ${b}, where n is the position in the pattern. What is the ${ordinal(k)} number?`,
        answer: String(a * k + b),
        wrong: [wrong(a * k, "A5"), wrong(Number(`${a}${k}`) + b, "A3")],
      };
    },
  },
  {
    // 6.9: a table of values continued.
    id: "g67-6-table-value",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.9",
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.int(2, 9), g.int(1, 9), g.int(8, 20)], ([a, b, x]) => distinctNumbers([a * x + b, a * x, 4 * a + b]));
      const pairs = [1, 2, 3].map((n) => `when x is ${n}, y is ${a * n + b}`).join("; ");
      return {
        values: { a, b, x },
        prompt: `In a table, ${pairs}. The pattern continues. What is y when x is ${x}?`,
        readAloud: `In a table, ${pairs}. The pattern continues. What is y when x is ${x}?`,
        answer: String(a * x + b),
        wrong: [wrong(a * x, "A5"), wrong(4 * a + b, "next-not-asked")],
      };
    },
  },
  {
    // Map, 6.9: "1 more than twice a number" is 2n + 1.
    id: "g67-6-expression-words",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.9",
    fill(rng) {
      const [m, k] = draw(rng, (g) => [g.int(2, 9), g.int(1, 9)], ([m, k]) => m !== k);
      const times = m === 2 ? "twice" : `${m} times`;
      return {
        values: { m, k },
        prompt: `Which expression means "${k} more than ${times} a number n"?`,
        readAloud: `Which expression means ${k} more than ${times} a number n?`,
        answer: `${m}n + ${k}`,
        wrong: [wrong(`${m}(n + ${k})`, "O7"), wrong(`${k}n + ${m}`, "rule-swap"), wrong(`n + ${m} + ${k}`, "A3")],
      };
    },
  },
  {
    // 6.9: a decreasing pattern as an expression.
    id: "g67-6-shrinking-rule",
    strand: "A", grades: { BC: 6, AB: 7, SK: 7, MB: 7, ON: 6 }, format: "choice", whiteboard: false, standard: "6.9",
    fill(rng) {
      const d = rng.int(2, 9), start = rng.int(4, 8) * d + rng.int(1, d - 1 || 1);
      const terms = [0, 1, 2, 3].map((i) => start - i * d);
      return {
        values: { d, start },
        prompt: `The pattern ${terms.join(", ")}, … goes down by the same amount each time. Which expression gives the number in position n?`,
        readAloud: `The pattern ${terms.join(", ")} keeps going down by the same amount each time. Which expression gives the number in position n?`,
        answer: `${start + d} − ${d}n`,
        wrong: [wrong(`${start} − ${d}n`, "A5"), wrong(`${d}n + ${start}`, "pattern-direction"), wrong(`${start + d} − n`, "A5")],
      };
    },
  },
  {
    // Map, grade 6: 3x = 12.
    id: "g67-6-equation-times",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.10",
    fill(rng) {
      const [a, x] = draw(rng, (g) => [g.int(3, 12), g.int(4, 15)], ([a, x]) => a !== x);
      const v = rng.pick(["x", "n", "y", "m"]);
      return {
        values: { a, x },
        prompt: `${a}${v} = ${a * x}. What is ${v}?`,
        readAloud: `${a} times ${v} equals ${a * x}. What is ${v}?`,
        answer: String(x),
        wrong: [wrong(a * a * x, "inverse-op"), wrong(a * x - a, "operation")],
      };
    },
  },
  {
    // Map, grade 6: x + 5 = 11, with larger numbers.
    id: "g67-6-equation-plus",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.10",
    fill(rng) {
      const a = rng.int(12, 85), x = rng.int(12, 90), v = rng.pick(["x", "n", "y", "m"]);
      return {
        values: { a, x },
        prompt: `${v} + ${a} = ${a + x}. What is ${v}?`,
        readAloud: `${v} plus ${a} equals ${a + x}. What is ${v}?`,
        answer: String(x),
        wrong: [wrong(2 * a + x, "inverse-op")],
      };
    },
  },
  {
    id: "g67-6-equation-words",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.10",
    fill(rng) {
      const [a, x] = draw(rng, (g) => [g.int(3, 12), g.int(4, 15)], ([a, x]) => a !== x);
      return {
        values: { a, x },
        prompt: `${a} times a number is ${a * x}. What is the number?`,
        readAloud: `${a} times a number is ${a * x}. What is the number?`,
        answer: String(x),
        wrong: [wrong(a * a * x, "inverse-op"), wrong(a * x - a, "operation")],
      };
    },
  },
  {
    // A story as a one-step equation.
    id: "g67-6-story-equation",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.10",
    fill(rng) {
      const [a, x] = draw(rng, (g) => [g.int(3, 9), g.int(4, 15)], ([a, x]) => a !== x);
      const [box, things, v] = rng.pick([["pack", "pencils", "p"], ["box", "crayons", "c"], ["bag", "apples", "a"], ["tray", "muffins", "m"]] as const);
      return {
        values: { a, x },
        prompt: `Each ${box} has the same number of ${things}. ${a} ${box}s hold ${a * x} ${things}. Let ${v} be the number of ${things} in one ${box}. Which equation fits?`,
        readAloud: `Each ${box} has the same number of ${things}. ${a} ${box}s hold ${a * x} ${things}. Let ${v} be the number of ${things} in one ${box}. Which equation fits?`,
        answer: `${a}${v} = ${a * x}`,
        wrong: [wrong(`${v} + ${a} = ${a * x}`, "operation"), wrong(`${v} − ${a} = ${a * x}`, "operation"), wrong(`${v} ÷ ${a} = ${a * x}`, "inverse-op")],
      };
    },
  },
  {
    // 6.10: preservation of equality on a balance, described in words.
    id: "g67-6-balance-box",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.10",
    fill(rng) {
      const a = rng.int(3, 15), x = rng.int(4, 25);
      return {
        values: { a, x },
        prompt: `A balance is level. One side has a box and ${a} marbles. The other side has ${a + x} marbles. All marbles have the same mass. The empty box has no mass in this model. How many marbles are in the box?`,
        readAloud: `A balance is level. One side has a box and ${a} marbles. The other side has ${a + x} marbles. All marbles have the same mass. The empty box has no mass in this model. How many marbles are in the box?`,
        answer: String(x),
        wrong: [wrong(2 * a + x, "inverse-op")],
      };
    },
  },
  {
    // 6.10: keep both sides equal.
    id: "g67-6-keep-balance",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.10",
    fill(rng) {
      const a = rng.int(2, 12), x = rng.int(3, 15), kind = rng.int(0, 3);
      const [shown, said, step, same, opposite] = [
        [`x + ${a} = ${x + a}`, `x plus ${a} equals ${x + a}`, `take ${a} away from the left side`, `Take ${a} away from it`, `Add ${a} to it`],
        [`x − ${a} = ${x}`, `x minus ${a} equals ${x}`, `add ${a} to the left side`, `Add ${a} to it`, `Take ${a} away from it`],
        [`${a}x = ${a * x}`, `${a} times x equals ${a * x}`, `divide the left side by ${a}`, `Divide it by ${a}`, `Multiply it by ${a}`],
        [`x + ${a} = ${x + a}`, `x plus ${a} equals ${x + a}`, `multiply the left side by ${a}`, `Multiply it by ${a}`, `Divide it by ${a}`],
      ][kind];
      return {
        values: { a, x, kind },
        prompt: `${shown}. You ${step}. What must you do to the right side to keep both sides equal?`,
        readAloud: `${said}. You ${step}. What must you do to the right side to keep both sides equal?`,
        answer: same,
        wrong: [wrong(opposite, "inverse-op"), wrong("Leave it the same", "A1")],
      };
    },
  },
  {
    // 6.9: expressions; the value for a given n.
    id: "g67-6-evaluate",
    strand: "A", grades: { BC: 6, AB: 7, SK: 7, MB: 7, ON: 6 }, format: "number", whiteboard: true, standard: "6.9",
    fill(rng) {
      const [a, b, n] = draw(rng, (g) => [g.int(2, 9), g.int(1, 12), g.int(2, 9)], ([a, b, n]) => distinctNumbers([a * n + b, Number(`${a}${n}`) + b, a + n + b]));
      return {
        values: { a, b, n },
        prompt: `What is ${a}n + ${b} when n = ${n}?`,
        readAloud: `What is ${a} times n, plus ${b}, when n is ${n}?`,
        answer: String(a * n + b),
        wrong: [wrong(Number(`${a}${n}`) + b, "A3"), wrong(a + n + b, "A3")],
      };
    },
  },
  {
    // 6.9: a relation as discrete points in the first quadrant.
    id: "g67-6-point-on-rule",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.9",
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.int(2, 5), g.int(1, 9), g.int(2, 9)], ([a, b, x]) =>
        distinct([[x, a * x + b], [a * x + b, x], [x, a * x], [x, x + a + b]].map(String)));
      const point = (p: number, q: number) => `(${p}, ${q})`;
      return {
        values: { a, b, x },
        prompt: `The rule is y = ${a}x + ${b}. Which point is on its graph?`,
        readAloud: `The rule is y equals ${a} times x, plus ${b}. Which point is on its graph?`,
        answer: point(x, a * x + b),
        wrong: [wrong(point(a * x + b, x), "coordinate-swap"), wrong(point(x, a * x), "A5"), wrong(point(x, x + a + b), "A3")],
      };
    },
  },
  {
    // 6.9: visual patterning, described in words.
    id: "g67-6-figure-pattern",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.9",
    fill(rng) {
      const [s, d, k] = draw(rng, (g) => [g.int(3, 9), g.int(2, 6), g.int(6, 12)], ([s, d, k]) => s !== d && distinctNumbers([s + (k - 1) * d, k * d, s + k * d]));
      const things = rng.pick(["squares", "toothpicks", "dots", "tiles"]);
      return {
        values: { s, d, k },
        prompt: `Figure 1 has ${s} ${things}, figure 2 has ${s + d} ${things} and figure 3 has ${s + 2 * d} ${things}. The pattern grows the same way. How many ${things} are in figure ${k}?`,
        readAloud: `Figure 1 has ${s} ${things}, figure 2 has ${s + d} ${things} and figure 3 has ${s + 2 * d} ${things}. The pattern grows the same way. How many ${things} are in figure ${k}?`,
        answer: String(s + (k - 1) * d),
        wrong: [wrong(k * d, "A5"), wrong(s + k * d, "count-start")],
      };
    },
  },
  {
    id: "g67-6-equation-check",
    strand: "A", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.10",
    fill(rng) {
      const [a, x] = draw(rng, (g) => [g.int(3, 9), g.int(3, 12)], ([a, x]) => a !== x && distinctNumbers([x, a * x - a, a * x + a, a * a * x]));
      return {
        values: { a, x },
        prompt: `Which value of x makes ${a}x = ${a * x} true?`,
        readAloud: `Which value of x makes ${a} times x equal ${a * x}?`,
        answer: String(x),
        wrong: [wrong(a * x - a, "operation"), wrong(a * x + a, "operation"), wrong(a * a * x, "inverse-op")],
      };
    },
  },

  // ---------- Shapes, measurement and data ----------
  {
    // Map, grade 6 and misconception M3: a triangle with base 10 cm and height 6 cm.
    id: "g67-6-triangle-area",
    strand: "MG", grades: { BC: 6, AB: 7, SK: 7, MB: 7, ON: 6 }, format: "number", whiteboard: true, standard: "6.12",
    fill(rng) {
      const [b, h] = draw(rng, (g) => [g.int(4, 20), g.int(3, 15)], ([b, h]) => (b * h) % 2 === 0 && b !== h && distinctNumbers([(b * h) / 2, b * h, b + h]));
      return {
        values: { b, h },
        prompt: `A triangle has a base of ${b} cm and a height of ${h} cm. What is its area, in square centimetres?`,
        readAloud: `A triangle has a base of ${b} centimetres and a height of ${h} centimetres. What is its area, in square centimetres?`,
        answer: String((b * h) / 2),
        wrong: [wrong(b * h, "M3"), wrong(b + h, "area-add")],
      };
    },
  },
  {
    // Misconception M3: a parallelogram's area uses the height, not the slanted side.
    id: "g67-6-parallelogram-area",
    strand: "MG", grades: { BC: 6, AB: 7, SK: 7, MB: 7, ON: 6 }, format: "number", whiteboard: true, standard: "6.12",
    fill(rng) {
      const [b, h, s] = draw(rng, (g) => {
        const h = g.int(3, 10);
        return [g.int(5, 15), h, h + g.int(1, 4)];
      }, ([b, h, s]) => distinctNumbers([b * h, b * s, 2 * (b + s)]));
      return {
        values: { b, h, s },
        prompt: `A parallelogram has a base of ${b} cm and a height of ${h} cm. Its slanted sides are ${s} cm long. What is its area, in square centimetres?`,
        readAloud: `A parallelogram has a base of ${b} centimetres and a height of ${h} centimetres. Its slanted sides are ${s} centimetres long. What is its area, in square centimetres?`,
        answer: String(b * h),
        wrong: [wrong(b * s, "M3"), wrong(2 * (b + s), "M2")],
      };
    },
  },
  {
    id: "g67-6-trapezoid-area",
    strand: "MG", grades: { BC: 6, AB: 7, SK: 7, MB: 7, ON: 7 }, format: "number", whiteboard: true, standard: "6.12",
    fill(rng) {
      const [a, b, h] = draw(rng, (g) => {
        const a = g.int(3, 10);
        return [a, a + g.int(2, 10), g.int(2, 10)];
      }, ([a, b, h]) => ((a + b) * h) % 2 === 0 && distinctNumbers([((a + b) * h) / 2, (a + b) * h, a + b + h]));
      return {
        values: { a, b, h },
        prompt: `A trapezoid has parallel sides of ${a} cm and ${b} cm. Its height is ${h} cm. What is its area, in square centimetres?`,
        readAloud: `A trapezoid has parallel sides of ${a} centimetres and ${b} centimetres. Its height is ${h} centimetres. What is its area, in square centimetres?`,
        answer: String(((a + b) * h) / 2),
        wrong: [wrong((a + b) * h, "M3"), wrong(a + b + h, "area-add")],
      };
    },
  },
  {
    // Map, grade 6: an angle of 120 degrees is obtuse.
    id: "g67-6-angle-type",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.13",
    fill(rng) {
      const kind = rng.pick(["acute", "obtuse", "reflex", "acute", "obtuse", "right", "straight"] as const);
      const degrees = { acute: rng.int(2, 17) * 5, right: 90, obtuse: rng.int(19, 35) * 5, straight: 180, reflex: rng.int(37, 70) * 5 }[kind];
      const others = rng.shuffle(["acute", "right", "obtuse", "straight", "reflex"].filter((k) => k !== kind)).slice(0, 3);
      return {
        values: { degrees },
        prompt: `An angle measures ${degrees}°. What kind of angle is it?`,
        readAloud: `An angle measures ${degrees} degrees. What kind of angle is it?`,
        answer: kind,
        wrong: others.map((k) => wrong(k, "angle-type")),
      };
    },
  },
  {
    // 6.13: angles of polygons; the angles of a triangle add to 180 degrees.
    id: "g67-6-triangle-angle",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 7 }, format: "number", whiteboard: true, standard: "6.13",
    fill(rng) {
      const [a, b] = draw(rng, (g) => [g.int(4, 20) * 5, g.int(4, 20) * 5], ([a, b]) => a + b <= 160 && a !== b);
      return {
        values: { a, b },
        prompt: `Two angles of a triangle measure ${a}° and ${b}°. What is the third angle, in degrees?`,
        readAloud: `Two angles of a triangle measure ${a} degrees and ${b} degrees. What is the third angle, in degrees?`,
        answer: String(180 - a - b),
        wrong: [wrong(360 - a - b, "angle-sum")],
      };
    },
  },
  {
    // 6.13: angles on a straight line add to 180 degrees.
    id: "g67-6-straight-line-angle",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 7 }, format: "number", whiteboard: true, standard: "6.13",
    fill(rng) {
      const a = draw(rng, (g) => g.int(20, 160), (a) => a !== 90);
      const wrongs = [wrong(360 - a, "angle-sum")];
      if (a < 90) wrongs.push(wrong(90 - a, "angle-sum"));
      return {
        values: { a },
        prompt: `Two angles sit side by side on a straight line. One measures ${a}°. What does the other one measure, in degrees?`,
        readAloud: `Two angles sit side by side on a straight line. One measures ${a} degrees. What does the other one measure, in degrees?`,
        answer: String(180 - a),
        wrong: wrongs,
      };
    },
  },
  {
    // Map, grade 6 and misconception M9: a box 4 cm by 3 cm by 2 cm.
    id: "g67-6-box-volume",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.14",
    fill(rng) {
      const [l, w, h] = draw(rng, (g) => [g.int(2, 12), g.int(2, 9), g.int(2, 8)], ([l, w, h]) => distinctNumbers([l * w * h, l + w + h, 2 * (l * w + l * h + w * h)]));
      return {
        values: { l, w, h },
        prompt: `A box is ${l} cm long, ${w} cm wide and ${h} cm high. What is its volume, in cubic centimetres?`,
        readAloud: `A box is ${l} centimetres long, ${w} centimetres wide and ${h} centimetres high. What is its volume, in cubic centimetres?`,
        answer: String(l * w * h),
        wrong: [wrong(l + w + h, "M9"), wrong(2 * (l * w + l * h + w * h), "M9")],
      };
    },
  },
  {
    // 6.14: capacity units (mL and L).
    id: "g67-6-litres",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.14",
    fill(rng) {
      const toMl = rng.int(0, 1) === 1;
      const quarters = draw(rng, (g) => g.int(2, 38), (q) => q % 4 !== 0);
      const litres = quarters / 4, ml = quarters * 250;
      return {
        values: { quarters, toMl: toMl ? 1 : 0 },
        prompt: toMl ? `How many millilitres are in ${fmt(litres)} litres?` : `A jug holds ${fmt(ml)} mL. How many litres is that?`,
        readAloud: toMl ? `How many millilitres are in ${fmt(litres)} litres?` : `A jug holds ${fmt(ml)} millilitres. How many litres is that?`,
        answer: toMl ? String(ml) : typed(litres),
        wrong: toMl
          ? [wrong(ml / 10, "unit-convert"), wrong(ml * 10, "unit-convert")]
          : [wrong(typed(litres * 10), "unit-convert"), wrong(typed(litres / 10), "unit-convert")],
      };
    },
  },
  {
    // 6.14: relationships between units: 1 cm3 holds 1 mL; 1 m3 is 1,000,000 cm3 (misconception M11).
    id: "g67-6-cubic-units",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 7 }, format: "number", whiteboard: false, standard: "6.14",
    fill(rng) {
      const metres = rng.int(0, 1) === 1;
      if (metres) {
        const m = rng.int(1, 9);
        return {
          values: { m, ml: 0, metres: 1 },
          prompt: `How many cubic centimetres are in ${m} cubic ${m === 1 ? "metre" : "metres"}?`,
          readAloud: `How many cubic centimetres are in ${m} cubic ${m === 1 ? "metre" : "metres"}?`,
          answer: String(m * 1_000_000),
          wrong: [wrong(m * 100, "M11"), wrong(m * 10_000, "M11")],
        };
      }
      const ml = rng.int(3, 95) * 10;
      return {
        values: { ml, m: 0, metres: 0 },
        prompt: `A box holds exactly ${ml} cubic centimetres of water. How many millilitres of water is that?`,
        readAloud: `A box holds exactly ${ml} cubic centimetres of water. How many millilitres of water is that?`,
        answer: String(ml),
        wrong: [wrong(ml * 10, "unit-convert"), wrong(ml * 1000, "unit-convert")],
      };
    },
  },
  {
    // 6.15: triangles by their sides.
    id: "g67-6-triangle-sides",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.15",
    fill(rng) {
      const kind = rng.pick(["isosceles", "scalene", "equilateral", "isosceles", "scalene"] as const);
      const sides = draw(rng, (g) => {
        const a = g.int(3, 12), b = g.int(3, 12), c = g.int(3, 12);
        return kind === "equilateral" ? [a, a, a] : kind === "isosceles" ? g.shuffle([a, a, b]) : [a, b, c];
      }, (s) => {
        const [x, y, z] = [...s].sort((p, q) => p - q);
        const equalPairs = Number(s[0] === s[1]) + Number(s[1] === s[2]) + Number(s[0] === s[2]);
        const ok = { equilateral: equalPairs === 3, isosceles: equalPairs === 1, scalene: equalPairs === 0 }[kind];
        return ok && x + y > z && x * x + y * y !== z * z;
      });
      const others = ["isosceles", "scalene", "equilateral", "right"].filter((k) => k !== kind);
      return {
        values: { a: sides[0], b: sides[1], c: sides[2] },
        prompt: `A triangle has sides of ${sides[0]} cm, ${sides[1]} cm and ${sides[2]} cm. What is its most specific side classification?`,
        readAloud: `A triangle has sides of ${sides[0]} centimetres, ${sides[1]} centimetres and ${sides[2]} centimetres. What is its most specific side classification?`,
        answer: kind,
        wrong: others.map((k) => wrong(k, "triangle-type")),
      };
    },
  },
  {
    // 6.15: triangles by their angles.
    id: "g67-6-triangle-angles",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.15",
    fill(rng) {
      const kind = rng.pick(["acute", "right", "obtuse"] as const);
      const angles = draw(rng, (g) => {
        const big = kind === "right" ? 90 : kind === "obtuse" ? g.int(19, 30) * 5 : g.int(13, 17) * 5;
        const a = g.int(2, Math.floor((180 - big) / 5) - 2) * 5;
        return g.shuffle([big, a, 180 - big - a]);
      }, (s) => new Set(s).size === 3 && s.every((x) => x > 0) && Math.max(...s) === (kind === "right" ? 90 : Math.max(...s)) && (kind !== "acute" || Math.max(...s) < 90));
      const others = ["acute", "right", "obtuse", "equilateral"].filter((k) => k !== kind);
      return {
        values: { a: angles[0], b: angles[1], c: angles[2] },
        prompt: `A triangle has angles of ${angles[0]}°, ${angles[1]}° and ${angles[2]}°. What is its angle classification?`,
        readAloud: `A triangle has angles of ${angles[0]} degrees, ${angles[1]} degrees and ${angles[2]} degrees. What is its angle classification?`,
        answer: kind,
        wrong: others.map((k) => wrong(k, "triangle-type")),
      };
    },
  },
  {
    // Map, grade 6: plot the point (3, 2) on a first-quadrant grid.
    id: "g67-6-plot-point",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.16",
    fill(rng) {
      const [x, y] = draw(rng, (g) => [g.int(1, 9), g.int(1, 9)], ([x, y]) => x !== y);
      const point = (p: number, q: number) => `(${p}, ${q})`;
      return {
        values: { x, y },
        prompt: `Start at the origin, (0, 0). Move ${x} ${x === 1 ? "unit" : "units"} right and ${y} ${y === 1 ? "unit" : "units"} up. Which point are you on?`,
        readAloud: `Start at the origin, where both numbers are 0. Move ${x} ${x === 1 ? "unit" : "units"} right and ${y} ${y === 1 ? "unit" : "units"} up. Which point are you on?`,
        answer: point(x, y),
        wrong: [wrong(point(y, x), "coordinate-swap"), wrong(point(x, 0), "one-part"), wrong(point(0, y), "one-part")],
      };
    },
  },
  {
    // 6.16: a translation of a point in the first quadrant.
    id: "g67-6-translate-point",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: true, standard: "6.16",
    fill(rng) {
      const [x, y, r, d] = draw(rng, (g) => [g.int(1, 8), g.int(5, 12), g.int(2, 7), g.int(2, 4)], ([x, y, r, d]) =>
        r !== d && y - r >= 1 && distinct([[x + r, y - d], [x + r, y + d], [x + d, y - r], [x + r, y]].map(String)));
      const point = (p: number, q: number) => `(${p}, ${q})`;
      return {
        values: { x, y, r, d },
        prompt: `The point (${x}, ${y}) moves ${r} units right and ${d} units down. Where does it end up?`,
        readAloud: `The point ${x}, ${y} moves ${r} units right and ${d} units down. Where does it end up?`,
        answer: point(x + r, y - d),
        wrong: [wrong(point(x + r, y + d), "transform-sign"), wrong(point(x + d, y - r), "coordinate-swap"), wrong(point(x + r, y), "one-part")],
      };
    },
  },
  {
    // Map, grade 6: a line graph read in words (14 degrees at noon, 20 at 3 p.m.).
    id: "g67-6-line-graph",
    strand: "DP", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.17",
    fill(rng) {
      const [what, unit, sayUnit] = rng.pick([["the temperature outside", "°C", "degrees"], ["the height of a plant", "cm", "centimetres"], ["the water in a tank", "L", "litres"]] as const);
      const [a, b] = draw(rng, (g) => [g.int(3, 40), g.int(3, 40)], ([a, b]) => b - a >= 3);
      const [t1, t2] = rng.pick([["9 a.m.", "noon"], ["noon", "3 p.m."], ["day 2", "day 6"], ["week 1", "week 4"]] as const);
      return {
        values: { a, b },
        prompt: `A line graph shows ${what}. At ${t1} the line is at ${a} ${unit}. At ${t2} it is at ${b} ${unit}. By how much did it go up?`,
        readAloud: `A line graph shows ${what}. At ${t1} the line is at ${a} ${sayUnit}. At ${t2} it is at ${b} ${sayUnit}. By how much did it go up?`,
        answer: String(b - a),
        wrong: [wrong(b, "graph-value"), wrong(a + b, "operation")],
      };
    },
  },
  {
    // Map, grade 6: a spinner numbered 1 to 5; the probability of an odd number.
    id: "g67-6-spinner-event",
    strand: "DP", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.18",
    fill(rng) {
      const { n, event, f } = draw(rng, (g) => {
        const n = g.int(5, 12);
        const [event, test] = g.pick([
          ["an odd number", (k: number) => k % 2 === 1], ["an even number", (k: number) => k % 2 === 0],
          ["a number greater than 3", (k: number) => k > 3], ["a multiple of 3", (k: number) => k % 3 === 0],
        ] as const);
        return { n, event, f: Array.from({ length: n }, (_, i) => i + 1).filter(test).length };
      }, (v) => 2 * v.f !== v.n && v.f >= 1 && distinctNumbers([v.f / v.n, (v.n - v.f) / v.n, v.f / (v.n - v.f), 0.5]));
      return {
        values: { n, f },
        prompt: `A spinner has ${n} equal parts, numbered 1 to ${n}. What is the probability of spinning ${event}?`,
        readAloud: `A spinner has ${n} equal parts, numbered 1 to ${n}. What is the probability of spinning ${event}?`,
        answer: frac(f, n),
        wrong: [wrong(frac(n - f, n), "probability-other"), wrong(frac(f, n - f), "D4"), wrong("1/2", "D3")],
      };
    },
  },
  {
    // Map, grade 6 and misconception D5: 7 heads in 10 tosses; the theoretical probability is still 1/2.
    id: "g67-6-theoretical",
    strand: "DP", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "choice", whiteboard: false, standard: "6.18",
    fill(rng) {
      const die = rng.int(0, 1) === 1;
      if (die) {
        const t = rng.pick([12, 18, 20, 24, 30, 36]), face = rng.int(1, 6);
        const h = draw(rng, (g) => g.int(1, Math.floor(t / 2)), (h) => h * 6 !== t && h * 5 !== t && 2 * h !== t);
        return {
          values: { t, h, face, die: 1 },
          prompt: `A fair die was rolled ${t} times. It landed on ${face} ${h === 1 ? "once" : `${h} times`}. What is the theoretical probability of rolling a ${face}?`,
          readAloud: `A fair die was rolled ${t} times. It landed on ${face} ${h === 1 ? "once" : `${h} times`}. What is the theoretical probability of rolling a ${face}?`,
          answer: "1/6",
          wrong: [wrong(frac(h, t), "D5"), wrong(frac(t - h, t), "D5"), wrong("1/5", "D4")],
        };
      }
      const t = rng.pick([10, 12, 20]), h = draw(rng, (g) => g.int(2, t - 2), (h) => distinctNumbers([0.5, h / t, (t - h) / t, h / (t - h)]));
      return {
        values: { t, h, face: 0, die: 0 },
        prompt: `A fair coin was tossed ${t} times. It landed heads ${h} times. What is the theoretical probability of heads?`,
        readAloud: `A fair coin was tossed ${t} times. It landed heads ${h} times. What is the theoretical probability of heads?`,
        answer: "1/2",
        wrong: [wrong(frac(h, t), "D5"), wrong(frac(t - h, t), "D5"), wrong(frac(h, t - h), "D4")],
      };
    },
  },
  {
    // 6.11: perimeter of a complex shape (an L shape), with every side given so no picture is needed.
    id: "g67-6-l-shape-perimeter",
    strand: "MG", grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6 }, format: "number", whiteboard: true, standard: "6.11",
    fill(rng) {
      const [W, H, a, h] = draw(rng, (g) => [g.int(8, 20), g.int(6, 15), g.int(2, 7), g.int(2, 6)], ([W, H, a, h]) => a < W - 1 && h < H - 1 && W !== H);
      const sides = [W, H, a, h, W - a, H - h];
      const skipped = rng.int(2, 5);
      return {
        values: { W, H, a, h },
        prompt: `An L-shaped garden has 6 straight sides. Going around it, the sides measure ${sides.map((s) => `${s} m`).join(", ")}. What is its perimeter, in metres?`,
        readAloud: `An L-shaped garden has 6 straight sides. Going around it, the sides measure ${sides.join(", ")} metres. What is its perimeter, in metres?`,
        answer: String(2 * (W + H)),
        wrong: [wrong(2 * (W + H) - sides[skipped], "leaves-out-addend"), wrong(W * H - a * h, "M2")].filter((w) => Number(w.value) !== 2 * (W + H)),
      };
    },
  },
];
