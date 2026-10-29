// Level 9 (BC Mathematics 9) for the grades 6-7 bank (D-158): only a Grade 9 child's test reaches it. A Grade 7 or 8
// child never does (D-153 rule 2): their routes stop at level 8, and grade 9 work comes only through the workbook level
// tests. Standards: the BC skill map, skill-map/grade-9.ts (9.1-9.8, from the BC Mathematics 9 elaborations).
// Province tags: grade 9 everywhere. The other provinces' grade 9 courses were not checked outcome by outcome, and the
// later grade wins when a source is unsure (./index.ts), so no other province sees these below its grade 9 test.
import { draw, wrong, type TaggedTemplate } from "../kit";
import { distinct, distinctNumbers, frac, fracText, gcd, money, num, sayFrac, sayMoney, sayNum, sup, typed } from "./helpers";

const GRADES = { BC: 9, AB: 9, SK: 9, MB: 9, ON: 9 } as const;

/** A signed fraction in lowest terms on screen: −3/4, 5/2, or a whole number such as −2. */
const sfrac = (n: number, d: number) => (n * d < 0 ? `−${fracText(Math.abs(n), Math.abs(d))}` : fracText(Math.abs(n), Math.abs(d)));
/** The value of a fraction, for distinctness checks. */
const value = (n: number, d: number) => n / d;

/** A power on screen: pow("n", 5) is "n⁵"; pow(-3, 4) is "(−3)⁴". */
const pow = (base: number | string, e: number) => `${typeof base === "number" && base < 0 ? `(${num(base)})` : base}${sup(e)}`;
/** A power in words: "3 to the power of 4". */
const sayPow = (base: number | string, e: number) => `${typeof base === "number" ? sayNum(base) : base} to the power of ${e}`;

/**
 * A polynomial on screen from [coefficient, power] terms, in the order given: [[3, 2], [-2, 1], [5, 0]] in n is
 * "3n² − 2n + 5". A zero term is left out; a coefficient of 1 is not written ("n²", "−n").
 */
function poly(terms: readonly (readonly [number, number])[], v = "n"): string {
  const shown = terms.filter(([c]) => c !== 0);
  if (!shown.length) return "0";
  return shown.map(([c, p], i) => {
    const size = Math.abs(c);
    const body = p === 0 ? String(size) : `${size === 1 ? "" : size}${v}${p === 1 ? "" : sup(p)}`;
    return i === 0 ? `${c < 0 ? "−" : ""}${body}` : ` ${c < 0 ? "−" : "+"} ${body}`;
  }).join("");
}
/** poly in words: "3 n squared minus 2 n plus 5". */
function sayPoly(terms: readonly (readonly [number, number])[], v = "n"): string {
  const shown = terms.filter(([c]) => c !== 0);
  return shown.map(([c, p], i) => {
    const size = Math.abs(c);
    const power = p === 0 ? "" : p === 1 ? v : p === 2 ? `${v} squared` : `${v} to the power of ${p}`;
    const body = p === 0 ? String(size) : size === 1 ? power : `${size} ${power}`;
    return i === 0 ? `${c < 0 ? "negative " : ""}${body}` : ` ${c < 0 ? "minus" : "plus"} ${body}`;
  }).join("");
}

/** A whole-number-of-cents money amount for the pad: no dollar sign, no noise. */
const cents = (n: number) => typed(Math.round(n * 100) / 100);

const LETTERS = ["n", "x", "y", "m", "k"] as const;

export const LEVEL_9: readonly TaggedTemplate[] = [
  // ---------- Number and operations: rational numbers (9.1) and exponents (9.2) ----------
  {
    id: "g67-9-order-rationals", strand: "O", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const POOL = [[-3, 4], [-7, 10], [-2, 3], [-3, 5], [-1, 2], [-9, 20], [-4, 5], [-5, 4], [-13, 10], [1, 3], [2, 5], [3, 5], [-1, 4], [-1, 5], [-11, 10], [-3, 2]] as const;
      // Four numbers, at least three of them negative, no two closer than 0.04, each shown as a fraction or a decimal.
      const picked = draw(rng, (r) => r.shuffle(POOL).slice(0, 4), (p) => p.filter(([n]) => n < 0).length >= 3
        && p.every(([a, b], i) => p.every(([c, d], j) => i === j || Math.abs(a / b - c / d) >= 0.04)));
      // Thirds are always fractions: as decimals they do not end.
      const shown = picked.map(([n, d]) => (d === 3 || ((d === 4 || d === 2) && rng.int(0, 1) === 1) ? sfrac(n, d) : num(n / d)));
      const values = picked.map(([n, d]) => n / d);
      const least = rng.int(0, 1) === 1;
      const order = values.map((_, i) => i).sort((i, j) => values[i] - values[j]);
      const answer = least ? order[0] : order[3];
      // Ordered by size without the signs: the least is the one nearest 0, the greatest the one farthest from 0.
      const byAbs = values.map((_, i) => i).sort((i, j) => Math.abs(values[i]) - Math.abs(values[j]));
      const absPick = least ? byAbs[0] : byAbs[3];
      const ask = `Which number is the ${least ? "least" : "greatest"}?`;
      return {
        values: { least: least ? 1 : 0, ...Object.fromEntries(picked.map(([n, d], i) => [`n${i}`, n * 100 + d])) },
        prompt: `${ask} ${shown.join(", ")}`, readAloud: ask,
        answer: shown[answer],
        wrong: shown.flatMap((s, i) => (i === answer ? [] : [wrong(s, i === absPick ? "absolute-order" : "decimal-order")])),
      };
    },
  },
  {
    id: "g67-9-subtract-signed-decimals", strand: "O", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b] = draw(rng, (r) => [-r.int(6, 39) / 4, -r.int(2, 39) / 4], ([a, b]) => a !== b && distinctNumbers([a - b, a + b, b - a]) && a - b !== 0);
      return {
        values: { a4: a * 4, b4: b * 4 },
        prompt: `${num(a)} − (${num(b)}) = ?`, readAloud: `What is ${sayNum(a)} minus ${sayNum(b)}?`,
        answer: num(a - b), wrong: [wrong(num(a + b), "O9"), wrong(num(b - a), "opposite-sign")],
      };
    },
  },
  {
    id: "g67-9-multiply-signed-decimals", strand: "O", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const a = -(rng.int(1, 9) + 0.5), b = rng.pick([-1, 1]) * rng.int(2, 8);
      const p = a * b;
      return {
        values: { a2: a * 2, b },
        prompt: `${num(a)} × ${b < 0 ? `(${num(b)})` : b} = ?`, readAloud: `What is ${sayNum(a)} times ${sayNum(b)}?`,
        answer: num(p), wrong: [wrong(num(-p), "sign-rule"), wrong(num(p * 10), "decimal-point"), wrong(num(-p * 10), "sign-rule")],
      };
    },
  },
  {
    id: "g67-9-order-of-operations", strand: "O", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, m] = draw(rng, (r) => [r.int(5, 20), r.int(2, 4), r.int(3, 5)], ([a, b, m]) =>
        distinctNumbers([a - b * m * m, (a - b) * m * m, a + b * m * m, a + b * 2 * m]));
      const answer = a - b * m * m;
      return {
        values: { a, b, m },
        prompt: `${a} − ${b} × (−${m})² = ?`, readAloud: `What is ${a} minus ${b} times the square of negative ${m}?`,
        answer: num(answer),
        wrong: [wrong(num((a - b) * m * m), "add-before-multiply"), wrong(num(a + b * m * m), "power-sign"), wrong(num(a + b * 2 * m), "power-multiply")],
      };
    },
  },
  {
    id: "g67-9-temperature-drop", strand: "O", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [start, drop, hours] = draw(rng, (r) => [r.int(1, 12) / 2, r.int(3, 9) / 2, r.int(3, 6)], ([s, d, h]) => s - d * h < 0 && distinctNumbers([s - d * h, s + d * h, d * h - s, s - d]));
      const end = start - drop * hours;
      return {
        values: { s2: start * 2, d2: drop * 2, hours },
        prompt: `The temperature is ${num(start)}°C. It drops ${num(drop)}°C every hour for ${hours} hours. What is the temperature then, in °C?`,
        readAloud: `The temperature is ${num(start)} ${start === 1 ? "degree" : "degrees"} Celsius. It drops ${num(drop)} degrees every hour for ${hours} hours. What is the temperature then, in degrees Celsius?`,
        answer: num(end),
        wrong: [wrong(num(start + drop * hours), "operation"), wrong(num(-end), "opposite-sign"), wrong(num(start - drop), "one-part")],
      };
    },
  },
  {
    id: "g67-9-power-meaning", strand: "N", grades: GRADES, standard: "9.2", format: "choice", whiteboard: false,
    fill(rng) {
      const [b, e] = draw(rng, (r) => [r.int(2, 9), r.int(3, 5)], ([b, e]) => b !== e && b ** e !== e ** b);
      const repeat = (x: number, times: number, op: string) => Array.from({ length: times }, () => x).join(` ${op} `);
      return {
        values: { b, e },
        prompt: `Which is the same as ${pow(b, e)}?`, readAloud: `Which is the same as ${sayPow(b, e)}?`,
        answer: repeat(b, e, "×"),
        wrong: [wrong(`${b} × ${e}`, "power-multiply"), wrong(repeat(e, b, "×"), "power-swap"), wrong(repeat(b, e, "+"), "power-as-sum")],
      };
    },
  },
  {
    id: "g67-9-evaluate-power", strand: "N", grades: GRADES, standard: "9.2", format: "number", whiteboard: true,
    fill(rng) {
      const [b, e] = draw(rng, (r) => [r.int(2, 6), r.int(3, 6)], ([b, e]) => b ** e <= 10_000 && b !== e && distinctNumbers([b ** e, b * e, e ** b]));
      return {
        values: { b, e },
        prompt: `What is ${pow(b, e)}?`, readAloud: `What is ${sayPow(b, e)}?`,
        answer: String(b ** e), wrong: [wrong(b * e, "power-multiply"), wrong(e ** b, "power-swap")],
      };
    },
  },
  {
    id: "g67-9-negative-base", strand: "N", grades: GRADES, standard: "9.2", format: "choice", whiteboard: true,
    fill(rng) {
      const e = rng.pick([2, 4]), b = e === 2 ? rng.int(3, 12) : rng.int(2, 4);
      const brackets = rng.int(0, 1) === 1;
      const v = b ** e, answer = brackets ? v : -v;
      return {
        values: { b, e, brackets: brackets ? 1 : 0 },
        prompt: `What is ${brackets ? pow(-b, e) : `−${b}${sup(e)}`}?`,
        readAloud: brackets
          ? `What is negative ${b}, in brackets, to the power of ${e}?`
          : `What is negative ${b} to the power of ${e}, with no brackets? The power is only on the ${b}.`,
        answer: num(answer), wrong: [wrong(num(-answer), "power-sign"), wrong(num(brackets ? -b * e : b * e), "power-multiply")],
      };
    },
  },
  {
    id: "g67-9-zero-exponent", strand: "N", grades: GRADES, standard: "9.2", format: "number", whiteboard: false,
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(2, 12), r.int(2, 12)], ([a, b]) => a !== b);
      return {
        values: { a, b },
        prompt: `What is ${a}⁰ + ${b}¹?`, readAloud: `What is ${a} to the power of 0 plus ${b} to the power of 1?`,
        answer: String(1 + b), wrong: [wrong(b, "zero-exponent"), wrong(a + b, "zero-exponent")],
      };
    },
  },
  {
    id: "g67-9-product-law", strand: "N", grades: GRADES, standard: "9.2", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(2, 7), r.int(2, 7)], ([a, b]) => a !== b && a * b !== a + b);
      const numeric = rng.int(0, 1) === 1;
      const base = numeric ? String(rng.int(2, 5)) : rng.pick(LETTERS);
      const said = `${base} to the power of ${a} times ${base} to the power of ${b}`;
      return {
        values: { a, b, base: numeric ? Number(base) : LETTERS.indexOf(base as (typeof LETTERS)[number]) + 100 },
        prompt: `${pow(base, a)} × ${pow(base, b)} = ?`, readAloud: `What is ${said}, as one power?`,
        answer: pow(base, a + b),
        wrong: [
          wrong(pow(base, a * b), "exponent-multiply"),
          numeric ? wrong(pow(Number(base) ** 2, a + b), "base-multiply") : wrong(pow(base, Math.abs(a - b)), "operation"),
        ],
      };
    },
  },
  {
    id: "g67-9-quotient-law", strand: "N", grades: GRADES, standard: "9.2", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b] = rng.pick([[8, 2], [9, 3], [10, 2], [10, 5], [12, 3], [12, 4], [6, 2], [8, 4], [12, 2], [15, 3]] as const);
      const v = rng.pick(LETTERS);
      return {
        values: { a, b, v: LETTERS.indexOf(v) },
        prompt: `${pow(v, a)} ÷ ${pow(v, b)} = ?`, readAloud: `What is ${sayPow(v, a)} divided by ${sayPow(v, b)}, as one power?`,
        answer: pow(v, a - b), wrong: [wrong(pow(v, a / b), "exponent-multiply"), wrong(pow(v, a + b), "operation")],
      };
    },
  },
  {
    id: "g67-9-power-of-power", strand: "N", grades: GRADES, standard: "9.2", format: "choice", whiteboard: true,
    fill(rng) {
      const [base, a, b] = draw(rng, (r) => [r.int(2, 7), r.int(2, 5), r.int(2, 5)], ([base, a, b]) => a * b !== a + b && base * a < 40);
      return {
        values: { base, a, b },
        prompt: `(${pow(base, a)})${sup(b)} = ?`, readAloud: `What is ${sayPow(base, a)}, all to the power of ${b}, as one power?`,
        answer: pow(base, a * b), wrong: [wrong(pow(base, a + b), "exponent-multiply"), wrong(pow(base * a, b), "power-multiply")],
      };
    },
  },
  {
    id: "g67-9-power-of-product", strand: "N", grades: GRADES, standard: "9.2", format: "choice", whiteboard: true,
    fill(rng) {
      const [c, e] = draw(rng, (r) => [r.int(2, 6), r.int(2, 3)], ([c, e]) => c ** e !== c * e);
      const v = rng.pick(LETTERS);
      return {
        values: { c, e, v: LETTERS.indexOf(v) },
        prompt: `(${c}${v})${sup(e)} = ?`, readAloud: `What is ${c} ${v}, in brackets, to the power of ${e}?`,
        answer: `${c ** e}${v}${sup(e)}`,
        wrong: [wrong(`${c}${v}${sup(e)}`, "power-product"), wrong(`${c * e}${v}${sup(e)}`, "power-multiply")],
      };
    },
  },
  {
    id: "g67-9-simplify-evaluate", strand: "N", grades: GRADES, standard: "9.2", format: "number", whiteboard: true,
    fill(rng) {
      const [base, a, b, c] = draw(rng, (r) => [r.int(2, 5), r.int(3, 8), r.int(2, 6), r.int(3, 9)], ([base, a, b, c]) => {
        const k = a + b - c;
        return k >= 2 && k <= 4 && base ** k !== base * k;
      });
      const k = a + b - c;
      return {
        values: { base, a, b, c },
        prompt: `Simplify, then find the value: ${pow(base, a)} × ${pow(base, b)} ÷ ${pow(base, c)}`,
        readAloud: `Simplify, then find the value: ${sayPow(base, a)} times ${sayPow(base, b)} divided by ${sayPow(base, c)}.`,
        answer: String(base ** k), wrong: [wrong(base * k, "power-multiply")],
      };
    },
  },

  // ---------- Fractions and decimals: rational numbers (9.1) and financial literacy (9.8) ----------
  {
    id: "g67-9-add-negative-fractions", strand: "F", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (r) => [r.int(1, 5), r.pick([2, 3, 4, 5, 6, 8]), r.int(1, 5), r.pick([2, 3, 4, 5, 6, 8])], ([a, b, c, d]) =>
        a < b && c < d && b !== d && gcd(a, b) === 1 && gcd(c, d) === 1 && -a * d + c * b !== 0
        && distinctNumbers([value(-a * d + c * b, b * d), value(c - a, b + d), value(a * d - c * b, b * d), value(a * d + c * b, b * d)]));
      return {
        values: { a, b, c, d },
        prompt: `−${frac(a, b)} + ${frac(c, d)} = ?`, readAloud: `What is negative ${sayFrac(a, b)} plus ${sayFrac(c, d)}?`,
        answer: sfrac(-a * d + c * b, b * d),
        wrong: [wrong(sfrac(c - a, b + d), "F2"), wrong(sfrac(a * d - c * b, b * d), "opposite-sign"), wrong(sfrac(a * d + c * b, b * d), "O9")]
          .filter((w, i, all) => all.findIndex((x) => x.value === w.value) === i),
      };
    },
  },
  {
    id: "g67-9-subtract-negative-fraction", strand: "F", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (r) => [r.int(1, 5), r.pick([2, 3, 4, 5, 6, 8]), r.int(1, 5), r.pick([2, 3, 4, 5, 6, 8])], ([a, b, c, d]) =>
        a < b && c < d && b !== d && gcd(a, b) === 1 && gcd(c, d) === 1 && a * d - c * b !== 0
        && distinctNumbers([value(a * d + c * b, b * d), value(a * d - c * b, b * d), value(a + c, b + d), value(-(a * d + c * b), b * d)]));
      return {
        values: { a, b, c, d },
        prompt: `${frac(a, b)} − (−${frac(c, d)}) = ?`, readAloud: `What is ${sayFrac(a, b)} minus negative ${sayFrac(c, d)}?`,
        answer: sfrac(a * d + c * b, b * d),
        wrong: [wrong(sfrac(a * d - c * b, b * d), "O9"), wrong(sfrac(a + c, b + d), "F2"), wrong(sfrac(-(a * d + c * b), b * d), "opposite-sign")],
      };
    },
  },
  {
    id: "g67-9-multiply-negative-fractions", strand: "F", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (r) => [r.int(1, 5), r.int(2, 9), r.int(1, 5), r.int(2, 9)], ([a, b, c, d]) =>
        a < b && c < d && gcd(a, b) === 1 && gcd(c, d) === 1 && distinctNumbers([value(a * c, b * d), value(a * c, b), value(a * d, b * c)]));
      const bothNegative = rng.int(0, 1) === 1;
      const sign = bothNegative ? 1 : -1;
      return {
        values: { a, b, c, d, bothNegative: bothNegative ? 1 : 0 },
        prompt: `(−${frac(a, b)}) × (${bothNegative ? "−" : ""}${frac(c, d)}) = ?`,
        readAloud: `What is negative ${sayFrac(a, b)} times ${bothNegative ? "negative " : ""}${sayFrac(c, d)}?`,
        answer: sfrac(sign * a * c, b * d),
        wrong: [wrong(sfrac(-sign * a * c, b * d), "sign-rule"), wrong(sfrac(sign * a * c, b), "fraction-one-side"), wrong(sfrac(sign * a * d, b * c), "operation")],
      };
    },
  },
  {
    id: "g67-9-divide-negative-fractions", strand: "F", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (r) => [r.int(1, 5), r.int(2, 9), r.int(1, 5), r.int(2, 9)], ([a, b, c, d]) =>
        a < b && c < d && gcd(a, b) === 1 && gcd(c, d) === 1 && distinctNumbers([value(a * d, b * c), value(a * c, b * d), value(b * c, a * d), -value(a * d, b * c)]));
      return {
        values: { a, b, c, d },
        prompt: `(−${frac(a, b)}) ÷ ${frac(c, d)} = ?`, readAloud: `What is negative ${sayFrac(a, b)} divided by ${sayFrac(c, d)}?`,
        answer: sfrac(-a * d, b * c),
        wrong: [wrong(sfrac(-a * c, b * d), "operation"), wrong(sfrac(a * d, b * c), "sign-rule"), wrong(sfrac(-b * c, a * d), "division-reversed")],
      };
    },
  },
  {
    id: "g67-9-fraction-order-of-operations", strand: "F", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, [p, q]] = draw(rng, (r) => [r.int(1, 3), r.int(2, 3), r.pick([[1, 2], [2, 3], [3, 4], [2, 5], [3, 5], [4, 5]] as const)] as const, ([a, b, [p, q]]) =>
        distinctNumbers([a - (b * p * p) / (q * q), ((a - b) * p * p) / (q * q), a - (2 * b * p) / q, a - (b * p * p) / q]) && a * q * q - b * p * p !== 0);
      return {
        values: { a, b, p, q },
        prompt: `${a} − ${b} × (${frac(p, q)})² = ?`, readAloud: `What is ${a} minus ${b} times the square of ${sayFrac(p, q)}?`,
        answer: sfrac(a * q * q - b * p * p, q * q),
        wrong: [
          wrong(sfrac((a - b) * p * p, q * q), "add-before-multiply"),
          wrong(sfrac(a * q - 2 * b * p, q), "power-multiply"),
          wrong(sfrac(a * q - b * p * p, q), "fraction-one-side"),
        ],
      };
    },
  },
  {
    id: "g67-9-water-level", strand: "F", grades: GRADES, standard: "9.1", format: "choice", whiteboard: true,
    fill(rng) {
      const [n, d, days] = draw(rng, (r) => [r.int(1, 7), r.pick([4, 8, 3, 5]), r.int(3, 9)], ([n, d, days]) => n < d && gcd(n, d) === 1 && distinctNumbers([n * days / d, n / (d * days)]) && (n * days) % d !== 0);
      return {
        values: { n, d, days },
        prompt: `The water in a pond falls ${frac(n, d)} cm each day. What is the change in the water level after ${days} days, in centimetres? Write a fall as a negative number.`,
        readAloud: `The water in a pond falls ${sayFrac(n, d)} centimetres each day. What is the change in the water level after ${days} days, in centimetres? Write a fall as a negative number.`,
        answer: sfrac(-n * days, d),
        wrong: [wrong(sfrac(n * days, d), "opposite-sign"), wrong(sfrac(-n, d * days), "operation"), wrong(sfrac(-n, d), "one-part")],
      };
    },
  },
  {
    id: "g67-9-budget-left", strand: "F", grades: GRADES, standard: "9.8", format: "number", whiteboard: true,
    fill(rng) {
      const income = rng.int(30, 80) * 10, phone = rng.int(60, 180) / 4, bus = rng.int(20, 120) / 4, food = rng.int(40, 200) / 4;
      const spent = phone + bus + food;
      const prompt = `Kai earns ${money(income)} a month from a part-time job. Kai's budget spends ${money(phone)} on a phone plan, ${money(bus)} on bus fare and ${money(food)} on food. How much is left to save each month, in dollars?`;
      return {
        values: { income, p4: phone * 4, b4: bus * 4, f4: food * 4 },
        prompt,
        readAloud: `Kai earns ${sayMoney(income)} a month from a part-time job. Kai's budget spends ${sayMoney(phone)} on a phone plan, ${sayMoney(bus)} on bus fare and ${sayMoney(food)} on food. How much is left to save each month, in dollars?`,
        answer: cents(income - spent), wrong: [wrong(cents(spent), "one-part"), wrong(cents(income - phone - bus), "leaves-out-addend")],
      };
    },
  },
  {
    id: "g67-9-bank-balance", strand: "F", grades: GRADES, standard: "9.8", format: "number", whiteboard: true,
    fill(rng) {
      const [start, deposit, withdrawal, fee] = draw(rng, (r) => [r.int(40, 300) + r.pick([0, 0.25, 0.5, 0.75]), r.int(20, 150), r.int(10, 120) + r.pick([0, 0.5]), r.pick([1.5, 2, 2.5, 3.95, 4.5])],
        ([start, deposit, withdrawal, fee]) => start + deposit - withdrawal - fee > 5);
      const [first, second] = rng.shuffle([`a deposit of ${money(deposit)}`, `a withdrawal of ${money(withdrawal)}`]);
      const [sayFirst, saySecond] = first.startsWith("a deposit") ? [`a deposit of ${sayMoney(deposit)}`, `a withdrawal of ${sayMoney(withdrawal)}`] : [`a withdrawal of ${sayMoney(withdrawal)}`, `a deposit of ${sayMoney(deposit)}`];
      const balance = start + deposit - withdrawal - fee;
      return {
        values: { s4: start * 4, deposit, w2: withdrawal * 2, f100: fee * 100 },
        prompt: `A bank account has ${money(start)}. Then there is ${first}, ${second}, and a monthly fee of ${money(fee)}. What is the balance now, in dollars?`,
        readAloud: `A bank account has ${sayMoney(start)}. Then there is ${sayFirst}, ${saySecond}, and a monthly fee of ${sayMoney(fee)}. What is the balance now, in dollars?`,
        answer: cents(balance), wrong: [wrong(cents(balance + 2 * fee), "fee-sign"), wrong(cents(balance + fee), "leaves-out-addend")],
      };
    },
  },
  {
    id: "g67-9-simple-interest", strand: "F", grades: GRADES, standard: "9.8", format: "number", whiteboard: true,
    fill(rng) {
      const p = rng.int(2, 50) * 100, r = rng.pick([1.5, 2, 2.5, 3, 4, 5]), t = rng.int(2, 6);
      const interest = (p * r * t) / 100;
      return {
        values: { p, r10: r * 10, t },
        prompt: `You put ${money(p)} in a savings account that pays ${r}% simple interest each year. How much interest do you earn in ${t} years, in dollars?`,
        readAloud: `You put ${sayMoney(p)} in a savings account that pays ${r} percent simple interest each year. How much interest do you earn in ${t} years, in dollars?`,
        answer: cents(interest), wrong: [wrong(cents(interest / t), "interest-time"), wrong(cents(p + interest), "total-for-interest")],
      };
    },
  },
  {
    id: "g67-9-interest-total", strand: "F", grades: GRADES, standard: "9.8", format: "number", whiteboard: true,
    fill(rng) {
      const p = rng.int(2, 50) * 100, r = rng.pick([1.5, 2, 2.5, 3, 4, 5]), t = rng.int(2, 6);
      const interest = (p * r * t) / 100;
      return {
        values: { p, r10: r * 10, t },
        prompt: `A loan of ${money(p)} charges ${r}% simple interest each year. What is the total to pay back after ${t} years, in dollars?`,
        readAloud: `A loan of ${sayMoney(p)} charges ${r} percent simple interest each year. What is the total to pay back after ${t} years, in dollars?`,
        answer: cents(p + interest), wrong: [wrong(cents(interest), "amount-not-total"), wrong(cents(p + interest / t), "interest-time")],
      };
    },
  },
  {
    id: "g67-9-savings-weeks", strand: "F", grades: GRADES, standard: "9.8", format: "number", whiteboard: true,
    fill(rng) {
      const [cost, have, weekly] = draw(rng, (r) => [r.int(15, 60) * 10, r.int(2, 12) * 5, r.int(3, 12) * 5], ([cost, have, weekly]) =>
        cost > have + weekly && (cost - have) % weekly !== 0 && distinctNumbers([Math.ceil((cost - have) / weekly), Math.floor((cost - have) / weekly), Math.ceil(cost / weekly)]));
      const weeks = Math.ceil((cost - have) / weekly);
      const prompt = `Nia wants to buy a bike that costs ${money(cost)}. She has ${money(have)} saved and saves ${money(weekly)} each week. How many weeks until she has enough?`;
      return {
        values: { cost, have, weekly },
        prompt,
        readAloud: `Nia wants to buy a bike that costs ${sayMoney(cost)}. She has ${sayMoney(have)} saved and saves ${sayMoney(weekly)} each week. How many weeks until she has enough?`,
        answer: String(weeks), wrong: [wrong(weeks - 1, "remainder-ignore"), wrong(Math.ceil(cost / weekly), "ignores-given")],
      };
    },
  },
  {
    id: "g67-9-pay-over-time", strand: "F", grades: GRADES, standard: "9.8", format: "number", whiteboard: true,
    fill(rng) {
      const [price, monthly, months] = draw(rng, (r) => [r.int(20, 120) * 10, r.int(15, 80) + r.pick([0, 0.99, 0.5]), r.pick([12, 18, 24])], ([price, monthly, months]) => monthly * months > price + 20);
      const total = monthly * months;
      const [thing] = rng.pick([["A phone"], ["A laptop"], ["A gaming console"]] as const);
      return {
        values: { price, m100: Math.round(monthly * 100), months },
        prompt: `${thing} costs ${money(price)} if you pay now. A payment plan charges ${money(monthly)} a month for ${months} months instead. How much more does the plan cost in all, in dollars?`,
        readAloud: `${thing} costs ${sayMoney(price)} if you pay now. A payment plan charges ${sayMoney(monthly)} a month for ${months} months instead. How much more does the plan cost in all, in dollars?`,
        answer: cents(total - price), wrong: [wrong(cents(total), "difference-whole")],
      };
    },
  },

  // ---------- Patterns and algebra: polynomials (9.3), linear relations (9.4), equations (9.5) ----------
  {
    id: "g67-9-polynomial-degree", strand: "A", grades: GRADES, standard: "9.3", format: "number", whiteboard: false,
    fill(rng) {
      const v = rng.pick(LETTERS);
      const kind = rng.int(0, 2);
      const [lead, b, c] = [rng.int(4, 9), rng.int(2, 9) * rng.pick([-1, 1]), rng.int(2, 9) * rng.pick([-1, 1])];
      const terms: [number, number][] = kind === 0 ? [[lead, 2], [b, 1], [c, 0]] : kind === 1 ? [[lead, 1], [c, 0]] : [[lead, 2], [c, 0]];
      const degree = Math.max(...terms.map(([, p]) => p));
      return {
        values: { kind, lead, b, c, v: LETTERS.indexOf(v) },
        prompt: `What is the degree of the polynomial ${poly(terms, v)}?`, readAloud: `What is the degree of the polynomial ${sayPoly(terms, v)}?`,
        answer: String(degree),
        wrong: [wrong(terms.length, "degree-terms"), wrong(lead, "degree-terms")].filter((w) => Number(w.value) !== degree),
      };
    },
  },
  {
    id: "g67-9-like-terms", strand: "A", grades: GRADES, standard: "9.3", format: "choice", whiteboard: false,
    fill(rng) {
      const v = rng.pick(LETTERS), c = rng.int(2, 9), p = rng.int(2, 3), other = rng.int(2, 9) * rng.pick([-1, 1]);
      const term = (k: number, power: number) => poly([[k, power]], v);
      return {
        values: { v: LETTERS.indexOf(v), c, p, other },
        prompt: `Which term is a like term of ${term(c, p)}?`, readAloud: `Which term is a like term of ${sayPoly([[c, p]], v)}?`,
        answer: term(other === c ? -c : other, p),
        wrong: [wrong(term(c, p === 2 ? 1 : 2), "like-terms"), wrong(term(c, p + 1), "like-terms"), wrong(String(c), "like-terms")],
      };
    },
  },
  {
    id: "g67-9-add-polynomials", strand: "A", grades: GRADES, standard: "9.3", format: "choice", whiteboard: true,
    fill(rng) {
      const v = rng.pick(LETTERS);
      const [a, b, c, d, e, f] = draw(rng, (r) => Array.from({ length: 6 }, () => r.int(1, 9) * r.pick([-1, 1])), ([a, b, c, d, e, f]) =>
        a + d !== 0 && b + e !== 0 && c + f !== 0 && b - e !== 0 && b + e !== b - e);
      const p1: [number, number][] = [[a, 2], [b, 1], [c, 0]], p2: [number, number][] = [[d, 2], [e, 1], [f, 0]];
      const sum = (bx: number): [number, number][] => [[a + d, 2], [bx, 1], [c + f, 0]];
      return {
        values: { a, b, c, d, e, f, v: LETTERS.indexOf(v) },
        prompt: `(${poly(p1, v)}) + (${poly(p2, v)}) = ?`, readAloud: `Add the polynomials ${sayPoly(p1, v)} and ${sayPoly(p2, v)}.`,
        answer: poly(sum(b + e), v),
        wrong: [
          wrong(poly([[a + d, 4], [b + e, 2], [c + f, 0]], v), "add-exponents"),
          wrong(poly(sum(b - e), v), "O9"),
        ],
      };
    },
  },
  {
    id: "g67-9-subtract-polynomials", strand: "A", grades: GRADES, standard: "9.3", format: "choice", whiteboard: true,
    fill(rng) {
      const v = rng.pick(LETTERS);
      const square = rng.int(0, 1) === 1;
      const [a, b, c, d] = draw(rng, (r) => [r.int(3, 9), r.int(1, 9) * r.pick([-1, 1]), r.int(1, 9), r.int(1, 9) * r.pick([-1, 1])], ([a, b, c, d]) =>
        a !== c && b - d !== 0 && d !== 0 && distinct([`${a - c},${b - d}`, `${a - c},${b + d}`, `${a + c},${b + d}`]));
      const p = square ? 2 : 1;
      const left: [number, number][] = [[a, p], [b, 0]], right: [number, number][] = [[c, p], [d, 0]];
      return {
        values: { a, b, c, d, square: square ? 1 : 0, v: LETTERS.indexOf(v) },
        prompt: `(${poly(left, v)}) − (${poly(right, v)}) = ?`, readAloud: `Subtract the polynomial ${sayPoly(right, v)} from ${sayPoly(left, v)}.`,
        answer: poly([[a - c, p], [b - d, 0]], v),
        wrong: [wrong(poly([[a - c, p], [b + d, 0]], v), "brackets-ignored"), wrong(poly([[a + c, p], [b + d, 0]], v), "operation")],
      };
    },
  },
  {
    id: "g67-9-multiply-monomial", strand: "A", grades: GRADES, standard: "9.3", format: "choice", whiteboard: true,
    fill(rng) {
      const v = rng.pick(LETTERS), a = rng.int(2, 9), b = rng.int(2, 12) * rng.pick([-1, 1]);
      return {
        values: { a, b, v: LETTERS.indexOf(v) },
        prompt: `${a}${v}(${poly([[1, 1], [b, 0]], v)}) = ?`, readAloud: `Multiply ${a} ${v} by the polynomial ${sayPoly([[1, 1], [b, 0]], v)}.`,
        answer: poly([[a, 2], [a * b, 1]], v),
        wrong: [wrong(poly([[a, 2], [b, 0]], v), "distribute-one"), wrong(poly([[a, 2], [a * b, 0]], v), "monomial-variable"), wrong(poly([[a, 1], [a * b, 1]], v), "monomial-variable")],
      };
    },
  },
  {
    id: "g67-9-divide-monomial", strand: "A", grades: GRADES, standard: "9.3", format: "choice", whiteboard: true,
    fill(rng) {
      const v = rng.pick(LETTERS), a = rng.int(2, 9), b = rng.int(1, 9) * rng.pick([-1, 1]), c = rng.int(2, 6);
      const top: [number, number][] = [[a * c, 2], [b * c, 1]];
      return {
        values: { a, b, c, v: LETTERS.indexOf(v) },
        prompt: `(${poly(top, v)}) ÷ ${c}${v} = ?`, readAloud: `Divide the polynomial ${sayPoly(top, v)} by ${c} ${v}.`,
        answer: poly([[a, 1], [b, 0]], v),
        wrong: [wrong(poly([[a, 2], [b, 1]], v), "monomial-variable"), wrong(poly([[a, 1], [b * c, 1]], v), "distribute-one")],
      };
    },
  },
  {
    id: "g67-9-decimal-relation-table", strand: "A", grades: GRADES, standard: "9.4", format: "choice", whiteboard: true,
    fill(rng) {
      const [b, x] = draw(rng, (r) => [r.int(1, 6), -(r.int(1, 4) * 2 - 1)], ([b, x]) => distinct([`${x},${0.5 * x - b}`, `${x},${-0.5 * x - b}`, `${x},${0.5 * x + b}`, `${0.5 * x - b},${x}`]));
      const pair = (p: number, q: number) => `(${num(p)}, ${num(q)})`;
      const y = 0.5 * x - b;
      return {
        values: { b, x },
        prompt: `y = 0.5x − ${b}. Which pair (x, y) is in its table of values?`,
        readAloud: `y equals 0.5 times x minus ${b}. Which pair of x and y values is in its table of values?`,
        answer: pair(x, y), wrong: [wrong(pair(x, -0.5 * x - b), "sign-rule"), wrong(pair(x, 0.5 * x + b), "constant-sign"), wrong(pair(y, x), "coordinate-swap")],
      };
    },
  },
  {
    id: "g67-9-horizontal-vertical", strand: "A", grades: GRADES, standard: "9.4", format: "choice", whiteboard: false,
    fill(rng) {
      const [px, py] = draw(rng, (r) => [r.int(1, 9) * r.pick([-1, 1]), r.int(1, 9) * r.pick([-1, 1])], ([px, py]) => px !== py && px !== -py);
      const horizontal = rng.int(0, 1) === 1;
      const ask = `Which equation is the ${horizontal ? "horizontal" : "vertical"} line through the point`;
      return {
        values: { px, py, horizontal: horizontal ? 1 : 0 },
        prompt: `${ask} (${num(px)}, ${num(py)})?`, readAloud: `${ask} with x equal to ${sayNum(px)} and y equal to ${sayNum(py)}?`,
        answer: horizontal ? `y = ${num(py)}` : `x = ${num(px)}`,
        wrong: horizontal
          ? [wrong(`x = ${num(px)}`, "line-orientation"), wrong(`y = ${num(px)}`, "line-orientation"), wrong(`x = ${num(py)}`, "coordinate-swap")]
          : [wrong(`y = ${num(py)}`, "line-orientation"), wrong(`x = ${num(py)}`, "line-orientation"), wrong(`y = ${num(px)}`, "coordinate-swap")],
      };
    },
  },
  {
    id: "g67-9-interpolate", strand: "A", grades: GRADES, standard: "9.4", format: "number", whiteboard: true,
    fill(rng) {
      const [x1, m, c, gap, at] = draw(rng, (r) => { const x1 = r.int(0, 4), gap = r.int(3, 6); return [x1, r.int(2, 6), r.int(1, 10), gap, x1 + r.int(1, gap - 1)]; },
        ([x1, m, c, , at]) => distinctNumbers([m * at + c, m * at, m * x1 + c + (at - x1)]));
      const x2 = x1 + gap, y = (x: number) => m * x + c;
      return {
        values: { x1, m, c, gap, at },
        prompt: `A straight line on a graph passes through the points (${x1}, ${y(x1)}) and (${x2}, ${y(x2)}). Use the line to find y when x = ${at}.`,
        readAloud: `A straight line on a graph passes through the point where x is ${x1} and y is ${y(x1)}, and the point where x is ${x2} and y is ${y(x2)}. Use the line to find y when x is ${at}.`,
        answer: String(y(at)), wrong: [wrong(m * at, "A5"), wrong(y(x1) + (at - x1), "coefficient-ignore")],
      };
    },
  },
  {
    id: "g67-9-extrapolate", strand: "A", grades: GRADES, standard: "9.4", format: "number", whiteboard: true,
    fill(rng) {
      const [start, step, week] = draw(rng, (r) => [r.int(2, 9), r.int(2, 6), r.int(8, 15)], ([start, step, week]) => distinctNumbers([start + step * (week - 1), step * week, start + step * week]));
      const h = (w: number) => start + step * (w - 1);
      const prompt = `A plant grows the same amount each week. It is ${h(1)} cm tall in week 1, ${h(2)} cm in week 2 and ${h(3)} cm in week 3. If it keeps growing this way, how tall is it in week ${week}, in centimetres?`;
      return {
        values: { start, step, week },
        prompt, readAloud: prompt.replace(/cm/g, "centimetres"),
        answer: String(h(week)), wrong: [wrong(step * week, "A5"), wrong(start + step * week, "pattern-step-count")],
      };
    },
  },
  {
    id: "g67-9-distribute-equation", strand: "A", grades: GRADES, standard: "9.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, x] = draw(rng, (r) => [r.int(2, 6), r.int(1, 9) * r.pick([-1, 1]), r.int(1, 9) * r.pick([-1, 1])], ([, b, x]) =>
        x + b !== 0 && distinctNumbers([x, x + b, x + 2 * b, -x]));
      const c = a * (x + b);
      return {
        values: { a, b, x },
        prompt: `${a}(x ${b < 0 ? "−" : "+"} ${Math.abs(b)}) = ${num(c)}. What is x?`,
        readAloud: `${a} times the quantity x ${b < 0 ? "minus" : "plus"} ${Math.abs(b)} equals ${sayNum(c)}. What is x?`,
        answer: num(x), wrong: [wrong(num(x + b), "A6"), wrong(num(x + 2 * b), "inverse-op"), wrong(num(-x), "opposite-sign")],
      };
    },
  },
  {
    id: "g67-9-collect-terms-equation", strand: "A", grades: GRADES, standard: "9.5", format: "number", whiteboard: true,
    fill(rng) {
      // Each slip is kept only when the pad can type it: a positive whole number or a short decimal.
      const pad = (v: number) => v > 0 && Number.isFinite(v) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
      const [a, b, c, n] = draw(rng, (r) => [r.int(2, 7), r.int(2, 15), r.int(2, 6), r.int(2, 12)], ([a, b, c, n]) => {
        const d = (a + c) * n - b;
        return d > 0 && [(d + b) / a, (d - b) / (a + c)].some((v) => pad(v) && v !== n) && distinctNumbers([n, (d + b) / a, (d - b) / (a + c)]);
      });
      const d = (a + c) * n - b;
      return {
        values: { a, b, c, n },
        prompt: `${a}n − ${b} + ${c}n = ${d}. What is n?`, readAloud: `${a} n minus ${b} plus ${c} n equals ${d}. What is n?`,
        answer: String(n),
        wrong: [wrong(typed((d + b) / a), "coefficient-ignore"), wrong(typed((d - b) / (a + c)), "inverse-op")].filter((w) => pad(Number(w.value))),
      };
    },
  },
  {
    id: "g67-9-variables-both-sides", strand: "A", grades: GRADES, standard: "9.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, c, b, n] = draw(rng, (r) => [r.int(4, 9), r.int(2, 5), r.int(1, 9), -r.int(1, 8)], ([a, c, b, n]) => {
        const d = (c - a) * n - b;
        return a > c && d > 0 && distinctNumbers([n, -n, (d - b) / (a - c), -(b + d) / (a + c)]);
      });
      const d = (c - a) * n - b;
      return {
        values: { a, c, b, n },
        prompt: `${a}n + ${b} = ${c}n − ${d}. What is n?`, readAloud: `${a} n plus ${b} equals ${c} n minus ${d}. What is n?`,
        answer: num(n),
        wrong: [wrong(num(-n), "opposite-sign"), wrong(sfrac(d - b, a - c), "O9"), wrong(sfrac(-(b + d), a + c), "operation")],
      };
    },
  },
  {
    id: "g67-9-decimal-equation", strand: "A", grades: GRADES, standard: "9.5", format: "number", whiteboard: true,
    fill(rng) {
      const pad = (v: number) => v > 0 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-9;
      const [p, q, n] = draw(rng, (r) => [r.pick([0.2, 0.25, 0.4, 0.5, 1.5, 2.5]), r.int(1, 12) / 2, r.int(2, 20)], ([p, q, n]) => {
        const rhs = p * n + q;
        return pad((rhs + q) / p) && distinctNumbers([n, (rhs + q) / p, rhs / p - q]);
      });
      const rhs = Number((p * n + q).toFixed(6));
      return {
        values: { p100: p * 100, q2: q * 2, n },
        prompt: `${p}n + ${q} = ${rhs}. What is n?`, readAloud: `${p} n plus ${q} equals ${rhs}. What is n?`,
        answer: String(n),
        wrong: [wrong(typed((rhs + q) / p), "inverse-op"), wrong(typed(rhs / p - q), "A6")].filter((w) => pad(Number(w.value))),
      };
    },
  },
  {
    id: "g67-9-plans-equal", strand: "A", grades: GRADES, standard: "9.5", format: "number", whiteboard: true,
    fill(rng) {
      // Plan A: a dollars a month plus p dollars per gigabyte. Plan B costs more a month and less per gigabyte.
      const [a, p, q, g] = draw(rng, (r) => { const q = r.int(2, 6); return [r.int(10, 30), q + r.int(2, 5), q, r.int(2, 12)]; },
        ([, p, q, g]) => distinctNumbers([g, (p - q) * g]));
      const bFee = a + (p - q) * g;
      const prompt = `Phone plan A costs ${money(a)} a month plus ${money(p)} for each gigabyte of data. Plan B costs ${money(bFee)} a month plus ${money(q)} for each gigabyte. For how many gigabytes do the two plans cost the same?`;
      return {
        values: { a, p, q, g },
        prompt,
        readAloud: `Phone plan A costs ${sayMoney(a)} a month plus ${sayMoney(p)} for each gigabyte of data. Plan B costs ${sayMoney(bFee)} a month plus ${sayMoney(q)} for each gigabyte. For how many gigabytes do the two plans cost the same?`,
        answer: String(g), wrong: [wrong(bFee - a, "method-step")],
      };
    },
  },

  // ---------- Shapes, measurement and data: proportional reasoning (9.6) and statistics (9.7) ----------
  {
    id: "g67-9-metric-convert", strand: "MG", grades: GRADES, standard: "9.6", format: "number", whiteboard: false,
    fill(rng) {
      const [from, to, factor] = rng.pick([["m", "cm", 100], ["km", "m", 1000], ["cm", "mm", 10], ["cm", "m", 0.01], ["m", "km", 0.001], ["mm", "cm", 0.1]] as const);
      const amount = factor >= 1 ? rng.int(5, 95) / 4 : rng.int(15, 900) * (factor === 0.1 ? 1 : 5);
      const name = { mm: "millimetres", cm: "centimetres", m: "metres", km: "kilometres" } as const;
      const ask = `How many ${name[to]} are in ${num(amount)} ${name[from]}?`;
      return {
        values: { kind: ["m", "km", "cm", "mm"].indexOf(from) * 4 + ["m", "km", "cm", "mm"].indexOf(to), a100: Math.round(amount * 100) },
        prompt: ask, readAloud: ask,
        answer: typed(amount * factor), wrong: [wrong(typed(amount / factor), "operation"), wrong(typed(amount * (factor >= 1 ? factor * 10 : factor / 10)), "unit-convert")],
      };
    },
  },
  {
    id: "g67-9-scale-factor", strand: "MG", grades: GRADES, standard: "9.6", format: "number", whiteboard: true,
    fill(rng) {
      const [w, k] = draw(rng, (r) => [r.int(2, 12) * 2, r.pick([0.25, 0.5, 1.5, 2, 2.5, 3, 4, 0.75])], ([w, k]) => Number.isInteger(w * k) && w * k >= 2 && distinctNumbers([k, Math.abs(w * k - w), 1 / k]) && (100 / k) % 1 === 0);
      const bigger = k > 1;
      const prompt = `A photo ${w} cm wide is ${bigger ? "enlarged" : "reduced"} to ${w * k} cm wide. What is the scale factor?`;
      return {
        values: { w, k100: k * 100 },
        prompt, readAloud: prompt.replace(/cm/g, "centimetres"),
        answer: typed(k), wrong: [wrong(typed(Math.abs(w * k - w)), "scale-additive"), wrong(typed(1 / k), "rate-inverse")],
      };
    },
  },
  {
    id: "g67-9-map-scale", strand: "MG", grades: GRADES, standard: "9.6", format: "number", whiteboard: true,
    fill(rng) {
      const scale = rng.pick([50, 100, 250, 500]), d = rng.int(3, 24) / 2, km = rng.int(0, 1) === 1;
      const metres = scale * d;
      const prompt = `On a map, every centimetre stands for ${scale} m. Two parks are ${num(d)} cm apart on the map. How far apart are they, in ${km ? "kilometres" : "metres"}?`;
      return {
        values: { scale, d2: d * 2, km: km ? 1 : 0 },
        prompt, readAloud: prompt.replace(/ cm/g, " centimetres").replace(/ m\b/g, " metres"),
        answer: typed(km ? metres / 1000 : metres),
        wrong: km ? [wrong(typed(metres), "unit-convert"), wrong(typed(metres / 100), "unit-convert")] : [wrong(typed(scale + d), "scale-additive"), wrong(typed(metres / 10), "decimal-point")],
      };
    },
  },
  {
    id: "g67-9-similar-side", strand: "MG", grades: GRADES, standard: "9.6", format: "number", whiteboard: true,
    fill(rng) {
      const [a, b, k] = draw(rng, (r) => [r.int(3, 12), r.int(3, 15), r.pick([1.5, 2, 2.5, 3, 4])], ([a, b, k]) => a !== b && Number.isInteger(a * k * 2) && Number.isInteger(b * k * 2) && distinctNumbers([b * k, b + a * k - a]));
      const prompt = `Two triangles are similar. In the small triangle, two sides are ${a} cm and ${b} cm. In the large triangle, the side that matches ${a} cm is ${typed(a * k)} cm. How long is the side that matches ${b} cm, in centimetres?`;
      return {
        values: { a, b, k10: k * 10 },
        prompt, readAloud: prompt.replace(/cm/g, "centimetres"),
        answer: typed(b * k), wrong: [wrong(typed(b + a * k - a), "scale-additive")],
      };
    },
  },
  {
    id: "g67-9-shadow-height", strand: "MG", grades: GRADES, standard: "9.6", format: "number", whiteboard: true,
    fill(rng) {
      const [pole, shadow, k] = draw(rng, (r) => [r.int(1, 4), r.int(2, 6), r.int(3, 8)], ([pole, shadow, k]) => pole !== shadow && distinctNumbers([pole * k, shadow * k + pole - shadow, (shadow * k * shadow) / pole]) && Number.isInteger((shadow * shadow * k * 100) / pole));
      const tree = shadow * k;
      const metres = (n: number) => (n === 1 ? "1 metre" : `${n} metres`);
      const prompt = `A pole ${metres(pole)} tall casts a shadow ${metres(shadow)} long. At the same time, a tree casts a shadow ${metres(tree)} long. How tall is the tree, in metres?`;
      return {
        values: { pole, shadow, k },
        prompt, readAloud: prompt,
        answer: String(pole * k), wrong: [wrong(tree + pole - shadow, "scale-additive"), wrong(typed((tree * shadow) / pole), "ratio-order")],
      };
    },
  },
  {
    id: "g67-9-similar-rectangles", strand: "MG", grades: GRADES, standard: "9.6", format: "choice", whiteboard: true,
    fill(rng) {
      const [w, l, k, add] = draw(rng, (r) => [r.int(2, 8), r.int(3, 12), r.pick([2, 3, 1.5, 2.5]), r.int(2, 6)], ([w, l, k, add]) =>
        w < l && gcd(w, l) === 1 && Number.isInteger(w * k) && Number.isInteger(l * k) && add !== w * k - w && add !== l * k - l);
      const size = (x: number, y: number) => `${x} cm by ${y} cm`;
      const ask = `A rectangle is ${size(w, l)}. Which rectangle is similar to it?`;
      return {
        values: { w, l, k10: k * 10, add },
        prompt: ask, readAloud: ask.replace(/cm/g, "centimetres"),
        answer: size(w * k, l * k),
        wrong: [wrong(size(w + add, l + add), "scale-additive"), wrong(size(w * k, l + add), "scale-one-side"), wrong(size(w * k, l), "scale-one-side")],
      };
    },
  },
  {
    id: "g67-9-population-sample", strand: "DP", grades: GRADES, standard: "9.7", format: "choice", whiteboard: false,
    fill(rng) {
      const contexts = [
        ["A school wants to know how its 640 students get to school. It asks 60 students chosen at random.", "60 students chosen at random", "All 640 students at the school", "How the students get to school"],
        ["A town wants to know if its 5000 people want a new skate park. It asks 200 people chosen at random.", "200 people chosen at random", "All 5000 people in the town", "Whether people want a skate park"],
        ["A factory wants to know how long its batteries last. Of the 2400 batteries made in a day, it tests 50 chosen at random.", "50 batteries chosen at random", "All 2400 batteries made that day", "How long the batteries last"],
        ["A library wants to know which books its 900 members borrow. It asks 80 members chosen at random.", "80 members chosen at random", "All 900 members of the library", "Which books the members borrow"],
      ] as const;
      const k = rng.int(0, contexts.length - 1);
      const [story, part, whole, topic] = contexts[k];
      const sample = rng.int(0, 1) === 1;
      const ask = `${story} What is the ${sample ? "sample" : "population"}?`;
      return {
        values: { k, sample: sample ? 1 : 0 },
        prompt: ask, readAloud: ask,
        answer: sample ? part : whole,
        wrong: [wrong(sample ? whole : part, "sample-population"), wrong(topic, "sample-population")],
      };
    },
  },
  {
    id: "g67-9-fair-sample", strand: "DP", grades: GRADES, standard: "9.7", format: "choice", whiteboard: false,
    fill(rng) {
      const [question, fair, biased] = rng.pick([
        ["if people in a town want a new skate park", "100 people picked at random from the town's list of residents", ["100 people at the town's skate shop", "The first 100 people at a skateboard contest", "100 members of the town's skateboard club"]],
        ["how many hours students at a school sleep", "Every 10th student on the school's full class list", ["Students in the morning running club", "The students who stay up for a late movie night", "Only the students on the school's basketball team"]],
        ["what food the people in a city like best", "200 people picked at random from the city's phone list", ["200 people at a pizza restaurant", "The members of a vegetarian cooking club", "People who reply to a bakery's online ad"]],
      ] as const);
      const others = rng.shuffle(biased).slice(0, 2);
      const ask = `A survey wants to find out ${question}. Which sample is most likely to be fair?`;
      return {
        values: { kind: ["if", "how", "what"].indexOf(question.split(" ")[0]), first: (biased as readonly string[]).indexOf(others[0]), second: (biased as readonly string[]).indexOf(others[1]) },
        prompt: ask, readAloud: ask,
        answer: fair, wrong: others.map((o) => wrong(o, "sample-bias")),
      };
    },
  },
  {
    id: "g67-9-biased-question", strand: "DP", grades: GRADES, standard: "9.7", format: "choice", whiteboard: false,
    fill(rng) {
      const sets = [
        ["Don't you agree that our school needs a longer lunch break?", "How long should the school lunch break be?", "Do you want the lunch break to stay the same, be longer or be shorter?"],
        ["Isn't the new park a waste of money?", "What do you think of the new park?", "How often do you visit the new park?"],
        ["Most people love the new bus route. Do you like it too?", "Do you use the new bus route?", "How would you rate the new bus route from 1 to 5?"],
        ["Wouldn't a healthy snack bar be better than candy machines?", "Which snacks would you like sold at school?", "How often do you buy a snack at school?"],
      ] as const;
      const k = rng.int(0, sets.length - 1);
      const [leading, ...fair] = sets[k];
      const biasedAsk = rng.int(0, 1) === 1;
      const ask = biasedAsk ? "Which survey question is biased: it leads people to one answer?" : "Which survey question is fair: it does not lead people to one answer?";
      if (biasedAsk) return { values: { k, biased: 1, pick: 0 }, prompt: ask, readAloud: ask, answer: leading, wrong: fair.map((f) => wrong(f, "question-bias")) };
      const other = sets[(k + 1) % sets.length][0], pick = rng.int(0, 1);
      return { values: { k, biased: 0, pick }, prompt: ask, readAloud: ask, answer: fair[pick], wrong: [wrong(leading, "question-bias"), wrong(other, "question-bias")] };
    },
  },
  {
    id: "g67-9-sample-estimate", strand: "DP", grades: GRADES, standard: "9.7", format: "number", whiteboard: true,
    fill(rng) {
      const [sample, yes, total] = draw(rng, (r) => [r.pick([20, 25, 40, 50]), r.int(3, 18), r.int(3, 20) * 100], ([sample, yes, total]) =>
        yes < sample && Number.isInteger((yes * total) / sample) && distinctNumbers([(yes * total) / sample, yes, (yes * 100) / sample]));
      const prompt = `In a random sample of ${sample} students, ${yes} walk to school. The school has ${total} students. About how many students at the school walk to school?`;
      return {
        values: { sample, yes, total },
        prompt, readAloud: prompt,
        answer: String((yes * total) / sample), wrong: [wrong(yes, "frequency-copy"), wrong(typed((yes * 100) / sample), "percent-as-count")],
      };
    },
  },
  {
    id: "g67-9-misleading-graph", strand: "DP", grades: GRADES, standard: "9.7", format: "choice", whiteboard: false,
    fill(rng) {
      const start = rng.int(8, 19) * 5, a = start + rng.int(1, 3), b = a + rng.int(1, 4);
      const [x, y, unit, claim] = rng.pick([
        ["Store A", "Store B", "bikes sold", "Store B sold many times as many bikes as Store A"],
        ["Team A", "Team B", "points scored", "Team B scored many times as many points as Team A"],
        ["Class A", "Class B", "books read", "Class B read many times as many books as Class A"],
      ] as const);
      const story = `A bar graph shows ${x} with ${a} ${unit} and ${y} with ${b} ${unit}. Its vertical axis starts at ${start}, not at 0, so the bar for ${y} looks much taller.`;
      return {
        values: { start, a, b, kind: ["Store A", "Team A", "Class A"].indexOf(x) },
        prompt: `${story} Why does the graph mislead?`, readAloud: `${story} Why does the graph mislead?`,
        answer: "A small difference looks big because the axis does not start at 0",
        wrong: [wrong(claim, "graph-misread"), wrong("The bars should be in a different order", "graph-misread")],
      };
    },
  },
];
