// Level 8 for the grade 7 up route. Standards: the BC curriculum map, section 1.
// Conservative tags: use grade 8 for the other provinces where earlier coverage is uncertain.
import { draw, wrong, type TaggedTemplate } from "../kit";
import { distinctNumbers, frac, fracText, num, sayFrac, sayNum, typed } from "./helpers";

const GRADES = { BC: 8, AB: 8, SK: 8, MB: 8, ON: 8 } as const;

export const LEVEL_8: readonly TaggedTemplate[] = [
  // Number and operations. Fraction computation belongs to F, as in the report's fraction area.
  {
    id: "g67-8-square", strand: "N", grades: GRADES, standard: "8.1", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(4, 20);
      return { values: { n }, prompt: `What is ${n}²?`, readAloud: `What is ${n} squared?`, answer: String(n * n), wrong: [wrong(2 * n, "power-multiply")] };
    },
  },
  {
    id: "g67-8-perfect-square", strand: "N", grades: GRADES, standard: "8.1", format: "choice", whiteboard: true,
    fill(rng) {
      const n = rng.int(4, 20);
      return { values: { n }, prompt: "Which number is a perfect square?", readAloud: "Which number is a perfect square?", answer: String(n * n), wrong: [wrong(n * n - 1, "square-neighbour"), wrong(n * n + 1, "square-neighbour")] };
    },
  },
  {
    id: "g67-8-square-root", strand: "N", grades: GRADES, standard: "8.2", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(3, 20);
      return { values: { n }, prompt: `What is the positive square root of ${n * n}?`, readAloud: `What is the positive square root of ${n * n}?`, answer: String(n), wrong: [wrong(typed(n * n / 2), "root-half")] };
    },
  },
  {
    id: "g67-8-square-side", strand: "N", grades: GRADES, standard: "8.2", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(5, 20);
      const prompt = `A square has an area of ${n * n} square centimetres. How long is each side, in centimetres?`;
      return { values: { n }, prompt, readAloud: prompt, answer: String(n), wrong: [wrong(typed(n * n / 4), "M2"), wrong(typed(n * n / 2), "root-half")] };
    },
  },
  {
    id: "g67-8-root-between", strand: "N", grades: GRADES, standard: "8.2", format: "choice", whiteboard: true,
    fill(rng) {
      const n = rng.int(3, 12), value = rng.int(n * n + 1, (n + 1) ** 2 - 1);
      return { values: { n, value }, prompt: `Between which two consecutive whole numbers is the positive square root of ${value}?`, readAloud: `Between which two consecutive whole numbers is the positive square root of ${value}?`, answer: `${n} and ${n + 1}`, wrong: [wrong(`${n - 1} and ${n}`, "root-estimate"), wrong(`${n + 1} and ${n + 2}`, "root-estimate")] };
    },
  },
  {
    id: "g67-8-square-tile", strand: "N", grades: GRADES, standard: "8.2", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(5, 15);
      const prompt = `${n * n} square tiles of the same size form a square array in rows with no gaps. How many tiles are in each row?`;
      return { values: { n }, prompt, readAloud: prompt, answer: String(n), wrong: [wrong(n * n / 2, "root-half")] };
    },
  },
  // Fractions, rates and percent.
  {
    id: "g67-8-add-fractions", strand: "F", grades: GRADES, standard: "8.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (g) => [g.int(1, 4), g.int(5, 9), g.int(1, 3), g.int(4, 8)], ([a, b, c, d]) => b !== d && distinctNumbers([(a * d + c * b) / (b * d), (a + c) / (b + d), (a + c) / b]));
      return { values: { a, b, c, d }, prompt: `${frac(a, b)} + ${frac(c, d)} = ?`, readAloud: `What is ${sayFrac(a, b)} plus ${sayFrac(c, d)}?`, answer: fracText(a * d + c * b, b * d), wrong: [wrong(fracText(a + c, b + d), "F2"), wrong(fracText(a + c, b), "fraction-one-side")] };
    },
  },
  {
    id: "g67-8-subtract-fractions", strand: "F", grades: GRADES, standard: "8.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (g) => [g.int(2, 6), g.int(7, 10), g.int(1, 3), g.int(4, 6)], ([a, b, c, d]) => a / b > c / d && b !== d && a > c && distinctNumbers([(a * d - c * b) / (b * d), (a - c) / (b - d), (a - c) / b]));
      return { values: { a, b, c, d }, prompt: `${frac(a, b)} − ${frac(c, d)} = ?`, readAloud: `What is ${sayFrac(a, b)} minus ${sayFrac(c, d)}?`, answer: fracText(a * d - c * b, b * d), wrong: [wrong(fracText(a - c, b - d), "F2"), wrong(fracText(a - c, b), "fraction-one-side")] };
    },
  },
  {
    id: "g67-8-multiply-fractions", strand: "F", grades: GRADES, standard: "8.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (g) => [g.int(1, 4), g.int(5, 9), g.int(1, 4), g.int(5, 9)], ([a, b, c, d]) => distinctNumbers([a * c / (b * d), (a + c) / (b + d), a * c / b]));
      return { values: { a, b, c, d }, prompt: `${frac(a, b)} × ${frac(c, d)} = ?`, readAloud: `What is ${sayFrac(a, b)} times ${sayFrac(c, d)}?`, answer: fracText(a * c, b * d), wrong: [wrong(fracText(a + c, b + d), "F2"), wrong(fracText(a * c, b), "fraction-one-side")] };
    },
  },
  {
    id: "g67-8-divide-fractions", strand: "F", grades: GRADES, standard: "8.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (g) => [g.int(1, 4), g.int(5, 9), g.int(1, 4), g.int(5, 9)], ([a, b, c, d]) => distinctNumbers([a * d / (b * c), a * c / (b * d), b * c / (a * d)]));
      return { values: { a, b, c, d }, prompt: `${frac(a, b)} ÷ ${frac(c, d)} = ?`, readAloud: `What is ${sayFrac(a, b)} divided by ${sayFrac(c, d)}?`, answer: fracText(a * d, b * c), wrong: [wrong(fracText(a * c, b * d), "operation"), wrong(fracText(b * c, a * d), "division-reversed")] };
    },
  },
  {
    id: "g67-8-small-percent", strand: "F", grades: GRADES, standard: "8.3", format: "number", whiteboard: true,
    fill(rng) {
      const p = rng.pick([0.1, 0.2, 0.25, 0.4, 0.5, 0.75]), whole = rng.int(2, 20) * 1000, answer = p * whole / 100;
      return { values: { p100: p * 100, whole }, prompt: `What is ${p}% of ${whole}?`, readAloud: `What is ${p} percent of ${whole}?`, answer: typed(answer), wrong: [wrong(typed(p * whole), "decimal-point"), wrong(typed(answer / 100), "decimal-point")] };
    },
  },
  {
    id: "g67-8-large-percent", strand: "F", grades: GRADES, standard: "8.3", format: "number", whiteboard: true,
    fill(rng) {
      const p = rng.pick([120, 125, 150, 175, 200, 250]), whole = rng.int(3, 30) * 20;
      return { values: { p, whole }, prompt: `What is ${p}% of ${whole}?`, readAloud: `What is ${p} percent of ${whole}?`, answer: typed(p * whole / 100), wrong: [wrong(typed((p - 100) * whole / 100), "amount-not-total"), wrong(p * whole, "decimal-point")] };
    },
  },
  {
    id: "g67-8-unit-rate", strand: "F", grades: GRADES, standard: "8.4", format: "number", whiteboard: true,
    fill(rng) {
      const hours = rng.int(2, 8), speed = rng.int(3, 12) * 10, distance = speed * hours;
      const prompt = `A train travels ${distance} kilometres in ${hours} hours at a constant speed. How many kilometres does it travel in one hour?`;
      return { values: { hours, speed }, prompt, readAloud: prompt, answer: String(speed), wrong: [wrong(distance * hours, "operation"), wrong(distance, "total-for-unit")] };
    },
  },
  {
    id: "g67-8-three-part-ratio", strand: "F", grades: GRADES, standard: "8.4", format: "number", whiteboard: true,
    fill(rng) {
      const a = rng.int(2, 4), b = rng.int(5, 7), c = rng.int(8, 10), k = rng.int(2, 8), total = (a + b + c) * k;
      return { values: { a, b, c, k }, prompt: `A rope ${total} metres long is cut into three pieces in the ratio ${a}:${b}:${c}. How long is the shortest piece, in metres?`, readAloud: `A rope ${total} metres long is cut into three pieces in the ratio ${a} to ${b} to ${c}. How long is the shortest piece, in metres?`, answer: String(a * k), wrong: [wrong(c * k, "more-less"), wrong(total - a, "operation")] };
    },
  },
  // Patterns and algebra, with integer inputs and solutions.
  {
    id: "g67-8-negative-equation", strand: "A", grades: GRADES, standard: "8.8", format: "choice", whiteboard: true,
    fill(rng) {
      const a = rng.int(2, 6), b = rng.int(2, 12), x = -rng.int(2, 10);
      return { values: { a, b, x }, prompt: `${a}x + ${b} = ${num(a * x + b)}. What is x?`, readAloud: `${a} times x plus ${b} equals ${sayNum(a * x + b)}. What is x?`, answer: num(x), wrong: [wrong(num(-x), "O9"), wrong(num(a * x), "A6")] };
    },
  },
  {
    id: "g67-8-negative-coefficient", strand: "A", grades: GRADES, standard: "8.8", format: "number", whiteboard: true,
    fill(rng) {
      const a = rng.int(2, 8), b = rng.int(2, 9), x = rng.int(3, 12);
      return { values: { a, b, x }, prompt: `−${a}x − ${b} = ${num(-a * x - b)}. What is x?`, readAloud: `Negative ${a} times x minus ${b} equals ${sayNum(-a * x - b)}. What is x?`, answer: String(x), wrong: [wrong(a * x, "A6")] };
    },
  },
  {
    id: "g67-8-substitute-signed", strand: "A", grades: GRADES, standard: "8.7", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, n] = draw(rng, (g) => [g.int(2, 7), g.int(2, 15), -g.int(2, 10)], ([a, b, n]) => distinctNumbers([a * n - b, -a * n - b, a * n + b]));
      return { values: { a, b, n }, prompt: `What is ${a}n − ${b} when n = ${num(n)}?`, readAloud: `What is ${a} times n minus ${b} when n is ${sayNum(n)}?`, answer: num(a * n - b), wrong: [wrong(num(-a * n - b), "sign-rule"), wrong(num(a * n + b), "operation")] };
    },
  },
  {
    id: "g67-8-combine-expression", strand: "A", grades: { ...GRADES, ON: 5 }, standard: "8.7", format: "number", whiteboard: true,
    fill(rng) {
      const a = rng.int(5, 9), b = rng.int(2, 4), n = rng.int(3, 10), c = rng.int(2, 12);
      return { values: { a, b, n, c }, prompt: `What is ${a}n − ${b}n + ${c} when n = ${n}?`, readAloud: `What is ${a} times n minus ${b} times n plus ${c} when n is ${n}?`, answer: String((a - b) * n + c), wrong: [wrong((a + b) * n + c, "operation"), wrong(a - b + c, "variable-one")] };
    },
  },
  {
    id: "g67-8-large-relation", strand: "A", grades: GRADES, standard: "8.6", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.int(3, 9), g.int(20, 80), -g.int(10, 30)], ([a, b, x]) => -a * x !== b);
      return { values: { a, b, x }, prompt: `y = ${a}x − ${b}. What is y when x = ${num(x)}?`, readAloud: `y equals ${a} times x minus ${b}. What is y when x is ${sayNum(x)}?`, answer: num(a * x - b), wrong: [wrong(num(-a * x - b), "sign-rule"), wrong(num(a * x + b), "operation")] };
    },
  },
  {
    id: "g67-8-integer-table", strand: "A", grades: GRADES, standard: "8.6", format: "choice", whiteboard: true,
    fill(rng) {
      const a = rng.int(2, 7), b = rng.int(2, 9);
      return { values: { a, b }, prompt: `A table has (x, y) pairs (−2, ${num(-2 * a + b)}), (−1, ${num(-a + b)}) and (0, ${b}). Which rule fits all three pairs?`, readAloud: `In a table, when x is negative 2, y is ${sayNum(-2 * a + b)}. When x is negative 1, y is ${sayNum(-a + b)}. When x is 0, y is ${b}. Which rule fits all three pairs?`, answer: `y = ${a}x + ${b}`, wrong: [wrong(`y = ${a}x`, "A5"), wrong(`y = ${a}x − ${b}`, "constant-sign")] };
    },
  },
  {
    id: "g67-8-inverse-input", strand: "A", grades: GRADES, standard: "8.6", format: "choice", whiteboard: true,
    fill(rng) {
      const a = rng.int(2, 8), b = rng.int(2, 12), x = -rng.int(2, 12);
      return { values: { a, b, x }, prompt: `y = ${a}x + ${b}. What is x when y = ${num(a * x + b)}?`, readAloud: `y equals ${a} times x plus ${b}. What is x when y is ${sayNum(a * x + b)}?`, answer: num(x), wrong: [wrong(num(-x), "sign-rule"), wrong(num(a * x), "A6")] };
    },
  },
  {
    id: "g67-8-expression-story", strand: "O", grades: { ...GRADES, BC: 6 }, standard: "6.3", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(4, 20) * 2, c = rng.int(2, 5);
      return { values: { n, c }, prompt: `A game gives ${c} points for each token, then takes away one point for every two tokens. With ${n} tokens, how many points remain?`, readAloud: `A game gives ${c} points for each token, then takes away one point for every two tokens. With ${n} tokens, how many points remain?`, answer: typed(c * n - n / 2), wrong: [wrong(c * n, "one-part"), wrong(c * n / 2, "operation")] };
    },
  },
  // Shapes, measurement and data.
  {
    id: "g67-8-prism-surface", strand: "MG", grades: GRADES, standard: "8.9", format: "number", whiteboard: true,
    fill(rng) {
      const [l, w, h] = draw(rng, (g) => [g.int(3, 12), g.int(3, 9), g.int(2, 8)], ([l, w, h]) => distinctNumbers([l * w * h, l * w + l * h + w * h, 2 * (l * w + l * h + w * h)]));
      const prompt = `A closed rectangular box is ${l} cm long, ${w} cm wide and ${h} cm high. What is its total surface area, in square centimetres?`;
      return { values: { l, w, h }, prompt, readAloud: prompt.replace(/cm/g, "centimetres"), answer: String(2 * (l * w + l * h + w * h)), wrong: [wrong(l * w + l * h + w * h, "one-part"), wrong(l * w * h, "volume-not-area")] };
    },
  },
  {
    id: "g67-8-cube-surface", strand: "MG", grades: GRADES, standard: "8.9", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.pick([3, 4, 5, 7, 8, 9, 10, 11, 12]);
      const prompt = `A cube has edges of ${n} cm. What is its total surface area, in square centimetres?`;
      return { values: { n }, prompt, readAloud: prompt.replace(/cm/g, "centimetres"), answer: String(6 * n * n), wrong: [wrong(n ** 3, "volume-not-area"), wrong(n * n, "one-part")] };
    },
  },
  {
    id: "g67-8-hypotenuse", strand: "MG", grades: GRADES, standard: "8.10", format: "number", whiteboard: true,
    fill(rng) {
      const k = rng.int(1, 10), [a, b, c] = rng.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17]] as const);
      const prompt = `The two sides that meet at the right angle of a right triangle are ${a * k} cm and ${b * k} cm. How long is the longest side, in centimetres?`;
      return { values: { a, b, c, k }, prompt, readAloud: prompt.replace(/cm/g, "centimetres"), answer: String(c * k), wrong: [wrong((a + b) * k, "pythagoras-add"), wrong(c * c * k * k, "pythagoras-no-root")] };
    },
  },
  {
    id: "g67-8-missing-leg", strand: "MG", grades: GRADES, standard: "8.10", format: "number", whiteboard: true,
    fill(rng) {
      const k = rng.int(1, 10), [a, b, c] = rng.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17]] as const);
      const prompt = `A right triangle has a longest side of ${c * k} cm. One of its other sides is ${a * k} cm. How long is the remaining side, in centimetres?`;
      return { values: { a, b, c, k }, prompt, readAloud: prompt.replace(/cm/g, "centimetres"), answer: String(b * k), wrong: [wrong((c - a) * k, "pythagoras-add"), wrong(b * b * k * k, "pythagoras-no-root")] };
    },
  },
  {
    id: "g67-8-mean", strand: "DP", grades: GRADES, standard: "8.12", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(4, 20), d = rng.int(2, 8), values = rng.shuffle([n - 2, n, n, n + d, n + d + 2]);
      const prompt = `Find the mean of these five values: ${values.join(", ")}.`;
      return { values: { n, d }, prompt, readAloud: prompt, answer: typed(n + 2 * d / 5), wrong: [wrong(n, "average-kind"), wrong(5 * n + 2 * d, "sum-for-mean")] };
    },
  },
  {
    id: "g67-8-median", strand: "DP", grades: GRADES, standard: "8.12", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(5, 30), d = rng.int(2, 9), values = [n + d, n - 3, n, n + d + 2, n - 1, n + 2];
      const prompt = `Find the median of these six values: ${values.join(", ")}.`;
      return { values: { n, d }, prompt, readAloud: prompt, answer: String(n + 1), wrong: [wrong(n, "one-part"), wrong(typed((values[2] + values[3]) / 2), "median-unsorted")] };
    },
  },
  {
    id: "g67-8-mode", strand: "DP", grades: GRADES, standard: "8.12", format: "number", whiteboard: false,
    fill(rng) {
      const n = rng.int(5, 30), values = rng.shuffle([n - 3, n - 2, n - 2, n, n, n, n + 8]);
      const prompt = `Find the mode of these seven values: ${values.join(", ")}.`;
      return { values: { n }, prompt, readAloud: prompt, answer: String(n), wrong: [wrong(n - 2, "one-part"), wrong(n + 8, "mode-largest")] };
    },
  },
  {
    id: "g67-8-independent-probability", strand: "DP", grades: GRADES, standard: "8.13", format: "choice", whiteboard: true,
    fill(rng) {
      const n = rng.int(3, 10), face = rng.int(1, n);
      const prompt = `A fair spinner has ${n} equal sections numbered 1 to ${n}. You spin it once and toss a fair coin once. What is the probability of spinning ${face} and getting heads?`;
      return { values: { n, face }, prompt, readAloud: prompt, answer: frac(1, 2 * n), wrong: [wrong(fracText(n + 2, 2 * n), "probability-add"), wrong(frac(1, n), "one-part")] };
    },
  },
];
