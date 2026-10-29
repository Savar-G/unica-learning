// Level 8 for the grade 7 up route. Standards: the BC curriculum map, section 1.
// Conservative tags: use grade 8 for the other provinces where earlier coverage is uncertain.
import { draw, wrong, type TaggedTemplate } from "../kit";
import { distinct, distinctNumbers, frac, fracText, gcd, mixed, money, num, sayFrac, sayMixed, sayMoney, sayNum, simplest, typed } from "./helpers";

const GRADES = { BC: 8, AB: 8, SK: 8, MB: 8, ON: 8 } as const;

// D-158: more level 8 templates, so a Grade 8 test's 42 level 8 places (stage 1 and a level 8 form) need no level 7
// template. Cubes, cube roots and prime factors: AB, SK and MB teach them after grade 8 (WNCP grade 8 has squares
// only), and no Ontario grade 8 outcome was checked for them, so those provinces see them only from level 9.
const AFTER_8 = { BC: 8, AB: 9, SK: 9, MB: 9, ON: 9 } as const;

/** "2 × 2 × 3": a product of factors on screen. */
const product = (factors: readonly number[]) => factors.join(" × ");

export const LEVEL_8: readonly TaggedTemplate[] = [
  // Number and operations. Fraction computation belongs to F, as in the report's fraction area.
  {
    // Triage: ON 7: ON 2020 (Jan 2021), Grade 7 B2.7, PDF page 403.
    id: "g67-8-square", strand: "N", grades: { BC: 8, AB: 8, SK: 8, MB: 8, ON: 7 }, standard: "8.1", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(4, 20);
      return { values: { n }, prompt: `What is ${n}²?`, readAloud: `What is ${n} squared?`, answer: String(n * n), wrong: [wrong(2 * n, "power-multiply")] };
    },
  },
  {
    id: "g67-8-perfect-square", strand: "N", grades: GRADES, standard: "8.1", format: "choice", whiteboard: true,
    fill(rng) {
      // By its name or by its definition (#187: the ask varies). Squares only: AB, SK and MB teach cubes after grade 8.
      const n = rng.int(4, 20), byName = rng.int(0, 1) === 1;
      const ask = byName ? "Which number is a perfect square?" : "Which number is a whole number times itself?";
      return { values: { n, byName: byName ? 1 : 0 }, prompt: ask, readAloud: ask, answer: String(n * n), wrong: [wrong(n * n - 1, "square-neighbour"), wrong(n * n + 1, "square-neighbour")] };
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
    // Triage: ON 7: ON 2020 (Jan 2021), Grade 7 B1.2, PDF page 389.
    id: "g67-8-square-side", strand: "N", grades: { BC: 8, AB: 8, SK: 8, MB: 8, ON: 7 }, standard: "8.2", format: "number", whiteboard: true,
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
    // Triage: ON 7: ON 2020 (Jan 2021), Grade 7 B1.2, PDF page 389.
    id: "g67-8-square-tile", strand: "N", grades: { BC: 8, AB: 8, SK: 8, MB: 8, ON: 7 }, standard: "8.2", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(5, 15);
      const prompt = `${n * n} square tiles of the same size form a square array in rows with no gaps. How many tiles are in each row?`;
      return { values: { n }, prompt, readAloud: prompt, answer: String(n), wrong: [wrong(n * n / 2, "root-half")] };
    },
  },
  // Fractions, rates and percent.
  {
    // Triage: AB 7: AB 2016 K-9 Program of Studies, Grade 7 Number SO 5; SK 7: SK grade 7, N7.5; MB 7: MB grade 7, 7.N.5; ON 6: ON 2020 (Jan 2021), Grade 6 B2.5, PDF page 340.
    id: "g67-8-add-fractions", strand: "F", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 6 }, standard: "8.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (g) => [g.int(1, 4), g.int(5, 9), g.int(1, 3), g.int(4, 8)], ([a, b, c, d]) => b !== d && distinctNumbers([(a * d + c * b) / (b * d), (a + c) / (b + d), (a + c) / b]));
      return { values: { a, b, c, d }, prompt: `${frac(a, b)} + ${frac(c, d)} = ?`, readAloud: `What is ${sayFrac(a, b)} plus ${sayFrac(c, d)}?`, answer: fracText(a * d + c * b, b * d), wrong: [wrong(fracText(a + c, b + d), "F2"), wrong(fracText(a + c, b), "fraction-one-side")] };
    },
  },
  {
    // Mixed numbers with unlike denominators (BC 8.5). AB 2016 grade 7 Number SO 5, SK N7.5 and MB 7.N.5 add positive
    // fractions and mixed numbers; ON7 adds fractions by creating equivalent fractions.
    id: "g67-8-add-mixed-numbers", strand: "F", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 7 }, standard: "8.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [w1, n1, d1, w2, n2, d2] = draw(rng, (g) => {
        const [d1, d2] = g.shuffle([2, 3, 4, 5, 6, 8]).slice(0, 2);
        return [g.int(1, 4), g.int(1, d1 - 1), d1, g.int(1, 3), g.int(1, d2 - 1), d2];
      }, ([, n1, d1, , n2, d2]) => gcd(n1, d1) === 1 && gcd(n2, d2) === 1 && (n1 * d2 + n2 * d1) % (d1 * d2) !== 0);
      const big = d1 * d2, top = n1 * d2 + n2 * d1, whole = w1 + w2 + Math.floor(top / big), [rn, rd] = simplest(top % big, big);
      const answer = mixed(whole, rn, rd);
      const [fn, fd] = simplest(n1 + n2, d1 + d2);
      const wrongs = [wrong(fn < fd ? mixed(w1 + w2, fn, fd) : fracText(n1 + n2 + (w1 + w2) * (d1 + d2), d1 + d2), "F2")];
      if (n1 + n2 < d1) wrongs.push(wrong(mixed(w1 + w2, ...simplest(n1 + n2, d1)), "fraction-one-side"));
      // Adds the whole numbers and keeps only the first fraction: one part of the sum is left out.
      wrongs.push(wrong(mixed(w1 + w2, n1, d1), "leaves-out-addend"));
      return { values: { w1, n1, d1, w2, n2, d2 }, prompt: `${mixed(w1, n1, d1)} + ${mixed(w2, n2, d2)} = ?`,
        readAloud: `What is ${sayMixed(w1, n1, d1)} plus ${sayMixed(w2, n2, d2)}?`, answer,
        wrong: wrongs.filter((x, i, all) => x.value !== answer && all.findIndex((y) => y.value === x.value) === i) };
    },
  },
  {
    // Triage: AB 7: AB 2016 K-9 Program of Studies, Grade 7 Number SO 5; SK 7: SK grade 7, N7.5; MB 7: MB grade 7, 7.N.5; ON 6: ON 2020 (Jan 2021), Grade 6 B2.5, PDF page 340.
    id: "g67-8-subtract-fractions", strand: "F", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 6 }, standard: "8.5", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, c, d] = draw(rng, (g) => [g.int(2, 6), g.int(7, 10), g.int(1, 3), g.int(4, 6)], ([a, b, c, d]) => a / b > c / d && b !== d && a > c && distinctNumbers([(a * d - c * b) / (b * d), (a - c) / (b - d), (a - c) / b]));
      return { values: { a, b, c, d }, prompt: `${frac(a, b)} − ${frac(c, d)} = ?`, readAloud: `What is ${sayFrac(a, b)} minus ${sayFrac(c, d)}?`, answer: fracText(a * d - c * b, b * d), wrong: [wrong(fracText(a - c, b - d), "F2"), wrong(fracText(a - c, b), "fraction-one-side")] };
    },
  },
  {
    // Triage: ON 7: ON 2020 (Jan 2021), Grade 7 B2.8, PDF page 404.
    id: "g67-8-multiply-fractions", strand: "F", grades: { BC: 8, AB: 8, SK: 8, MB: 8, ON: 7 }, standard: "8.5", format: "choice", whiteboard: true,
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
    // Triage: ON 6: ON 2020 (Jan 2021), Grade 6 B2.12, PDF page 349.
    id: "g67-8-unit-rate", strand: "F", grades: { BC: 8, AB: 8, SK: 8, MB: 8, ON: 6 }, standard: "8.4", format: "number", whiteboard: true,
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
      // b is a multiple of a, so each one-step slip is a whole number: dividing before undoing the subtraction gives
      // x + b/a, and the wrong inverse (subtracting b again) gives x + 2b/a.
      const a = rng.int(2, 8), b = a * rng.int(1, 3), x = rng.int(3, 12);
      return { values: { a, b, x }, prompt: `−${a}x − ${b} = ${num(-a * x - b)}. What is x?`, readAloud: `Negative ${a} times x minus ${b} equals ${sayNum(-a * x - b)}. What is x?`, answer: String(x),
        wrong: [wrong(x + b / a, "A6"), wrong(x + (2 * b) / a, "A6")] };
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
    // AB MAT5-OI2-GQ1-LO1-KO2-SP and ON5 C2.2 evaluate a whole-number expression by substitution.
    // Substitution only: SK P7.2 and MB 7.PR.5 evaluate an expression given the variable.
    id: "g67-8-combine-expression", strand: "A", grades: { BC: 8, AB: 5, SK: 7, MB: 7, ON: 5 }, standard: "8.7", format: "number", whiteboard: true,
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
    // Triage: AB 4: AB current K-6, MAT4-OI2-GQ1-LO1-KO1-SP; SK 6: SK grade 6, N6.3; MB 6: MB grade 6, 6.N.9; ON 5: ON 2020 (Jan 2021), Grade 5 B2.1, PDF page 281.
    id: "g67-8-expression-story", strand: "O", grades: { BC: 6, AB: 4, SK: 6, MB: 6, ON: 5 }, standard: "6.3", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(4, 20) * 2, c = rng.int(2, 5);
      return { values: { n, c }, prompt: `A game gives ${c} points for each token, then takes away one point for every two tokens. With ${n} tokens, how many points remain?`, readAloud: `A game gives ${c} points for each token, then takes away one point for every two tokens. With ${n} tokens, how many points remain?`, answer: typed(c * n - n / 2), wrong: [wrong(c * n, "one-part"), wrong(c * n / 2, "operation")] };
    },
  },
  // Shapes, measurement and data.
  {
    // Triage: ON 6: ON 2020 (Jan 2021), Grade 6 E2.6, PDF page 381.
    id: "g67-8-prism-surface", strand: "MG", grades: { BC: 8, AB: 8, SK: 8, MB: 8, ON: 6 }, standard: "8.9", format: "number", whiteboard: true,
    fill(rng) {
      const [l, w, h] = draw(rng, (g) => [g.int(3, 12), g.int(3, 9), g.int(2, 8)], ([l, w, h]) => distinctNumbers([l * w * h, l * w + l * h + w * h, 2 * (l * w + l * h + w * h)]));
      const prompt = `A closed rectangular box is ${l} cm long, ${w} cm wide and ${h} cm high. What is its total surface area, in square centimetres?`;
      return { values: { l, w, h }, prompt, readAloud: prompt.replace(/cm/g, "centimetres"), answer: String(2 * (l * w + l * h + w * h)), wrong: [wrong(l * w + l * h + w * h, "one-part"), wrong(l * w * h, "volume-not-area")] };
    },
  },
  {
    // Triage: ON 6: ON 2020 (Jan 2021), Grade 6 E2.6, PDF page 381.
    id: "g67-8-cube-surface", strand: "MG", grades: { BC: 8, AB: 8, SK: 8, MB: 8, ON: 6 }, standard: "8.9", format: "number", whiteboard: true,
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
    // Triage: AB 7: AB 2016 K-9 Program of Studies, Grade 7 Statistics and Probability SO 1; SK 7: SK grade 7, SP7.1; MB 7: MB grade 7, 7.SP.1; ON 5: ON 2020 (Jan 2021), Grade 5 D1.5, PDF page 307.
    id: "g67-8-mean", strand: "DP", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 5 }, standard: "8.12", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(4, 20), d = rng.int(2, 8), values = rng.shuffle([n - 2, n, n, n + d, n + d + 2]);
      const prompt = `Find the mean of these five values: ${values.join(", ")}.`;
      return { values: { n, d }, prompt, readAloud: prompt, answer: typed(n + 2 * d / 5), wrong: [wrong(n, "average-kind"), wrong(5 * n + 2 * d, "sum-for-mean")] };
    },
  },
  {
    // Triage: AB 7: AB 2016 K-9 Program of Studies, Grade 7 Statistics and Probability SO 1; SK 7: SK grade 7, SP7.1; MB 7: MB grade 7, 7.SP.1; ON 4: ON 2020 (Jan 2021), Grade 4 D1.5, PDF page 255.
    id: "g67-8-median", strand: "DP", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 4 }, standard: "8.12", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(5, 30), d = rng.int(2, 9), values = [n + d, n - 3, n, n + d + 2, n - 1, n + 2];
      const prompt = `Find the median of these six values: ${values.join(", ")}.`;
      return { values: { n, d }, prompt, readAloud: prompt, answer: String(n + 1), wrong: [wrong(n, "one-part"), wrong(typed((values[2] + values[3]) / 2), "median-unsorted")] };
    },
  },
  {
    // Triage: AB 7: AB 2016 K-9 Program of Studies, Grade 7 Statistics and Probability SO 1; SK 7: SK grade 7, SP7.1; MB 7: MB grade 7, 7.SP.1; ON 3: ON 2020 (Jan 2021), Grade 3 D1.4, PDF page 206.
    id: "g67-8-mode", strand: "DP", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 3 }, standard: "8.12", format: "number", whiteboard: false,
    fill(rng) {
      const n = rng.int(5, 30), values = rng.shuffle([n - 3, n - 2, n - 2, n, n, n, n + 8]);
      const prompt = `Find the mode of these seven values: ${values.join(", ")}.`;
      return { values: { n }, prompt, readAloud: prompt, answer: String(n), wrong: [wrong(n - 2, "one-part"), wrong(n + 8, "mode-largest")] };
    },
  },
  {
    // Triage: AB 7: AB 2016 K-9 Program of Studies, Grade 7 Statistics and Probability SO 6; SK 7: SK grade 7, SP7.3; MB 7: MB grade 7, 7.SP.6; ON 6: ON 2020 (Jan 2021), Grade 6 D2.2, PDF page 367.
    id: "g67-8-independent-probability", strand: "DP", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 6 }, standard: "8.13", format: "choice", whiteboard: true,
    fill(rng) {
      const n = rng.int(3, 10), face = rng.int(1, n);
      const prompt = `A fair spinner has ${n} equal sections numbered 1 to ${n}. You spin it once and toss a fair coin once. What is the probability of spinning ${face} and getting heads?`;
      return { values: { n, face }, prompt, readAloud: prompt, answer: frac(1, 2 * n), wrong: [wrong(fracText(n + 2, 2 * n), "probability-add"), wrong(frac(1, n), "one-part")] };
    },
  },
  // D-158 additions, by strand.
  // Number and operations.
  {
    id: "g67-8-cube", strand: "N", grades: AFTER_8, standard: "8.1", format: "number", whiteboard: true,
    fill(rng) {
      // Not 3: 3 cubed would make the two slips (3 x 3 and 3 squared) the same number.
      const n = rng.pick([2, 4, 5, 6, 7, 8, 9, 10]);
      return { values: { n }, prompt: `What is ${n}³?`, readAloud: `What is ${n} cubed?`, answer: String(n ** 3), wrong: [wrong(3 * n, "power-multiply"), wrong(n * n, "cube-as-square")] };
    },
  },
  {
    id: "g67-8-perfect-cube", strand: "N", grades: AFTER_8, standard: "8.1", format: "choice", whiteboard: true,
    fill(rng) {
      // Not 8: 8 squared is 64, also a cube.
      const n = rng.pick([2, 3, 4, 5, 6, 7, 9, 10]);
      // By its name or by its meaning (#187: the ask varies).
      const byName = rng.int(0, 1) === 1;
      const ask = byName ? "Which number is a perfect cube?" : "Which number is a whole number multiplied by itself three times?";
      return { values: { n, byName: byName ? 1 : 0 }, prompt: ask, readAloud: ask, answer: String(n ** 3),
        wrong: [wrong(n ** 3 - 1, "cube-neighbour"), wrong(n ** 3 + 1, "cube-neighbour"), wrong(n * n, "cube-as-square")] };
    },
  },
  {
    id: "g67-8-prime-factors", strand: "N", grades: AFTER_8, standard: "8.1", format: "choice", whiteboard: true,
    fill(rng) {
      // Three or four primes, one of them repeated, with a product up to 400.
      const factors = draw(rng, (r) => Array.from({ length: r.int(3, 4) }, () => r.pick([2, 3, 5, 7])).sort((a, b) => a - b),
        (f) => f.reduce((a, b) => a * b, 1) <= 400 && new Set(f).size < f.length);
      const n = factors.reduce((a, b) => a * b, 1);
      const ask = `What is the prime factorization of ${n}?`;
      return { values: { n, size: factors.length }, prompt: ask, readAloud: ask, answer: product(factors),
        wrong: [
          // The first two factors joined into a composite number: a product of the right value, not of primes.
          wrong(product([factors[0] * factors[1], ...factors.slice(2)]), "prime-composite"),
          wrong(product(factors.slice(0, -1)), "factor-incomplete"),
        ] };
    },
  },
  {
    id: "g67-8-root-by-factors", strand: "N", grades: AFTER_8, standard: "8.1", format: "number", whiteboard: true,
    fill(rng) {
      // A perfect square written as pairs of primes: its root takes one prime of each pair.
      const root = draw(rng, (r) => Array.from({ length: r.int(2, 3) }, () => r.pick([2, 3, 5, 7])).sort((a, b) => a - b),
        (f) => f.reduce((a, b) => a * b, 1) <= 60);
      const r = root.reduce((a, b) => a * b, 1), n = r * r;
      const pairs = root.flatMap((p) => [p, p]);
      return { values: { r }, prompt: `The prime factorization of ${n} is ${product(pairs)}. What is the positive square root of ${n}?`,
        readAloud: `The prime factors of ${n} are ${pairs.slice(0, -1).join(", ")} and ${pairs[pairs.length - 1]}. What is the positive square root of ${n}?`,
        answer: String(r), wrong: [wrong(typed(n / 2), "root-half")] };
    },
  },
  {
    id: "g67-8-cube-root", strand: "N", grades: AFTER_8, standard: "8.2", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(2, 10);
      const ask = `What is the cube root of ${n ** 3}?`;
      return { values: { n }, prompt: ask, readAloud: ask, answer: String(n), wrong: [wrong(typed(n ** 3 / 2), "root-half")] };
    },
  },
  {
    id: "g67-8-cube-edge", strand: "N", grades: AFTER_8, standard: "8.2", format: "number", whiteboard: true,
    fill(rng) {
      const n = rng.int(2, 12);
      const prompt = `A cube has a volume of ${n ** 3} cubic centimetres. How long is each edge, in centimetres?`;
      return { values: { n }, prompt, readAloud: prompt, answer: String(n), wrong: [wrong(typed(n ** 3 / 2), "root-half")] };
    },
  },
  {
    // WNCP 8.N.2 estimates the square root of a number that is not a perfect square.
    id: "g67-8-root-tenth", strand: "N", grades: GRADES, standard: "8.2", format: "choice", whiteboard: true,
    fill(rng) {
      // The root rounds clearly to a tenth that is not a whole number.
      const [n, k] = draw(rng, (r) => { const n = r.int(3, 12); return [n, r.int(1, 2 * n)]; }, ([n, k]) => {
        const root = Math.sqrt(n * n + k), tenth = Math.round(root * 10) / 10;
        return !Number.isInteger(tenth) && Math.abs(root - tenth) < 0.035 && distinctNumbers([tenth, tenth + 1, (n * n + k) / 2]);
      });
      const value = n * n + k, answer = Math.round(Math.sqrt(value) * 10) / 10;
      const ask = `Which number is closest to the positive square root of ${value}?`;
      return { values: { n, k }, prompt: ask, readAloud: ask, answer: typed(answer),
        wrong: [wrong(typed(answer + 1), "root-estimate"), wrong(typed(value / 2), "root-half")] };
    },
  },
  // Fractions, rates and percent.
  {
    id: "g67-8-percent-change", strand: "F", grades: GRADES, standard: "8.3", format: "number", whiteboard: true,
    fill(rng) {
      const price = rng.int(2, 25) * 40, p = rng.pick([0.5, 2.5, 3.25, 7.5, 12.5]), up = rng.int(0, 1) === 1;
      const change = (price * p) / 100;
      const [thing, verb] = rng.pick([["A bike", "costs"], ["A tablet", "costs"], ["A guitar", "costs"]] as const);
      const prompt = `${thing} ${verb} $${price}. Its price goes ${up ? "up" : "down"} by ${p}%. What is the new price, in dollars?`;
      return { values: { price, p100: p * 100, up: up ? 1 : 0 }, prompt,
        readAloud: `${thing} ${verb} ${price} dollars. Its price goes ${up ? "up" : "down"} by ${p} percent. What is the new price, in dollars?`,
        answer: typed(up ? price + change : price - change),
        wrong: [wrong(typed(change), up ? "amount-not-total" : "discount-amount"), wrong(typed(up ? price - change : price + change), "operation")] };
    },
  },
  {
    id: "g67-8-percent-of-another", strand: "F", grades: GRADES, standard: "8.3", format: "number", whiteboard: true,
    fill(rng) {
      const p = rng.pick([125, 200, 250, 400]), whole = rng.int(2, 12) * 4, part = (whole * p) / 100;
      const ask = `${part} is what percent of ${whole}?`;
      return { values: { p, whole }, prompt: ask, readAloud: ask, answer: String(p),
        wrong: [wrong(typed((whole / part) * 100), "percent-inverse"), wrong(p - 100, "amount-not-total")] };
    },
  },
  {
    id: "g67-8-solve-proportion", strand: "F", grades: GRADES, standard: "8.4", format: "number", whiteboard: true,
    fill(rng) {
      const [a, b] = draw(rng, (r) => [r.int(1, 8), r.int(3, 12)], ([a, b]) => a < b && gcd(a, b) === 1);
      const k = rng.int(2, 9), c = b * k;
      return { values: { a, b, k }, prompt: `${frac(a, b)} = x/${c}. What is x?`, readAloud: `${sayFrac(a, b)} equals x over ${c}. What is x?`,
        answer: String(a * k), wrong: [wrong(a + c - b, "F9")] };
    },
  },
  {
    id: "g67-8-best-buy", strand: "F", grades: GRADES, standard: "8.14", format: "choice", whiteboard: true,
    fill(rng) {
      // The bigger pack costs more in all but less for each can, so comparing the totals picks the wrong pack.
      const [big, small, cheap, dear] = draw(rng, (r) => [r.pick([10, 12, 15, 20]), r.pick([4, 5, 6]), r.int(10, 20) * 5, r.int(10, 20) * 5],
        ([big, small, cheap, dear]) => cheap < dear && big * cheap > small * dear);
      const bigFirst = rng.int(0, 1) === 1;
      const [a, b] = bigFirst ? [[big, cheap], [small, dear]] : [[small, dear], [big, cheap]];
      const cost = (cans: number, cents: number) => (cans * cents) / 100;
      const prompt = `Pack A has ${a[0]} cans of juice for ${money(cost(a[0], a[1]))}. Pack B has ${b[0]} cans for ${money(cost(b[0], b[1]))}. Which pack costs less for each can?`;
      const best = bigFirst ? "Pack A" : "Pack B", other = bigFirst ? "Pack B" : "Pack A";
      return { values: { big, small, cheap, dear, bigFirst: bigFirst ? 1 : 0 }, prompt,
        readAloud: `Pack A has ${a[0]} cans of juice for ${sayMoney(cost(a[0], a[1]))}. Pack B has ${b[0]} cans for ${sayMoney(cost(b[0], b[1]))}. Which pack costs less for each can?`,
        answer: best, wrong: [wrong(other, "total-not-unit"), wrong("They cost the same for each can", "same-size")] };
    },
  },
  // Patterns and algebra.
  {
    id: "g67-8-divide-equation", strand: "A", grades: GRADES, standard: "8.8", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, m] = draw(rng, (r) => [r.int(2, 6), r.int(2, 9), -r.int(1, 8)], ([a, b, m]) => distinctNumbers([a * m, m, -a * m, (m + 2 * b) * a]));
      const c = m + b, x = a * m;
      return { values: { a, b, m }, prompt: `x/${a} + ${b} = ${num(c)}. What is x?`, readAloud: `x over ${a} plus ${b} equals ${sayNum(c)}. What is x?`,
        answer: num(x), wrong: [wrong(num(m), "A6"), wrong(num((c + b) * a), "inverse-op"), wrong(num(-x), "opposite-sign")] };
    },
  },
  {
    id: "g67-8-equation-story", strand: "A", grades: GRADES, standard: "8.8", format: "number", whiteboard: true,
    fill(rng) {
      const [s, r, h] = draw(rng, (g) => [g.int(2, 12), g.pick([2, 4, 5]), g.int(3, 9)], ([s, r, h]) => r * h > s + 1 && distinctNumbers([h, (r * h - s) / r]));
      const f = r * h - s;
      return { values: { s, r, h }, prompt: `At midnight the temperature was −${s}°C. It rose ${r}°C every hour. Now it is ${f}°C. How many hours have passed?`,
        readAloud: `At midnight the temperature was negative ${s} degrees Celsius. It rose ${r} degrees every hour. Now it is ${f} degrees Celsius. How many hours have passed?`,
        answer: String(h), wrong: [wrong(typed(f / r), "O9")] };
    },
  },
  {
    id: "g67-8-relation-story", strand: "A", grades: GRADES, standard: "8.6", format: "choice", whiteboard: true,
    fill(rng) {
      const [c, r] = draw(rng, (g) => [g.int(3, 12) * 5, g.int(2, 15)], ([c, r]) => c !== r);
      const [story, spoken, v, unit] = rng.pick([
        [`A gym charges a $${c} sign-up fee plus $${r} for each month.`, `A gym charges a ${c} dollar sign-up fee plus ${r} dollars for each month.`, "m", "months"],
        [`A taxi ride costs $${c} to start plus $${r} for each kilometre.`, `A taxi ride costs ${c} dollars to start plus ${r} dollars for each kilometre.`, "k", "kilometres"],
        [`A bike rental costs $${c} for a helmet plus $${r} for each hour.`, `A bike rental costs ${c} dollars for a helmet plus ${r} dollars for each hour.`, "h", "hours"],
      ] as const);
      const ask = `Which rule gives the total cost C, in dollars, for ${v} ${unit}?`;
      return { values: { c, r, kind: ["m", "k", "h"].indexOf(v) }, prompt: `${story} ${ask}`, readAloud: `${spoken} ${ask}`,
        answer: `C = ${r}${v} + ${c}`,
        wrong: [wrong(`C = ${c}${v} + ${r}`, "rule-swap"), wrong(`C = ${r}${v}`, "A5"), wrong(`C = ${r}${v} − ${c}`, "constant-sign")] };
    },
  },
  {
    id: "g67-8-table-pair", strand: "A", grades: GRADES, standard: "8.6", format: "choice", whiteboard: true,
    fill(rng) {
      const [a, b, x] = draw(rng, (g) => [g.int(2, 6), g.int(1, 9), -g.int(1, 5)], ([a, b, x]) => {
        const y = a * x - b;
        return distinct([`${x},${y}`, `${x},${-a * x - b}`, `${x},${a * x + b}`, `${y},${x}`]);
      });
      const pair = (p: number, q: number) => `(${num(p)}, ${num(q)})`;
      const y = a * x - b;
      return { values: { a, b, x }, prompt: `y = ${a}x − ${b}. Which pair (x, y) is in its table of values?`,
        readAloud: `y equals ${a} times x minus ${b}. Which pair of x and y values is in its table of values?`,
        answer: pair(x, y), wrong: [wrong(pair(x, -a * x - b), "sign-rule"), wrong(pair(x, a * x + b), "constant-sign"), wrong(pair(y, x), "coordinate-swap")] };
    },
  },
  {
    id: "g67-8-write-expression", strand: "A", grades: GRADES, standard: "8.7", format: "choice", whiteboard: false,
    fill(rng) {
      const [a, c] = draw(rng, (g) => [g.int(2, 9), g.int(2, 30)], ([a, c]) => a !== c);
      const more = rng.int(0, 1) === 1;
      const ask = `Which expression means ${c} ${more ? "more" : "less"} than ${a} times a number n?`;
      return { values: { a, c, more: more ? 1 : 0 }, prompt: ask, readAloud: ask,
        answer: more ? `${a}n + ${c}` : `${a}n − ${c}`,
        wrong: more
          ? [wrong(`${c}n + ${a}`, "equation-roles"), wrong(`${a}(n + ${c})`, "group-translation"), wrong(`${a}n − ${c}`, "operation")]
          : [wrong(`${c} − ${a}n`, "equation-roles"), wrong(`${a}(n − ${c})`, "group-translation"), wrong(`${a}n + ${c}`, "operation")] };
    },
  },
  // Shapes, measurement and data.
  {
    id: "g67-8-triangular-prism", strand: "MG", grades: GRADES, standard: "8.9", format: "number", whiteboard: true,
    fill(rng) {
      const [b, h, l] = draw(rng, (g) => [g.int(3, 12), g.int(2, 10), g.int(4, 15)], ([b, h, l]) => (b * h) % 2 === 0 && distinctNumbers([b * h * l / 2, b * h * l, b * h / 2]));
      const prompt = `A triangular prism is ${l} cm long. Each triangle end has a base of ${b} cm and a height of ${h} cm. What is the volume of the prism, in cubic centimetres?`;
      return { values: { b, h, l }, prompt, readAloud: prompt.replace(/cm/g, "centimetres"), answer: String((b * h * l) / 2),
        wrong: [wrong(b * h * l, "half-area"), wrong((b * h) / 2, "one-part")] };
    },
  },
  {
    id: "g67-8-cylinder-volume", strand: "MG", grades: GRADES, standard: "8.9", format: "number", whiteboard: true,
    fill(rng) {
      const [r, h] = draw(rng, (g) => [g.int(3, 7), g.int(3, 12)], ([r, h]) => r !== 2 * h);
      const prompt = `A can is a cylinder with a radius of ${r} cm and a height of ${h} cm. Use 3.14 for pi. What is its volume, in cubic centimetres?`;
      return { values: { r, h }, prompt, readAloud: prompt.replace(/cm/g, "centimetres"), answer: typed(3.14 * r * r * h),
        wrong: [wrong(typed(3.14 * 2 * r * h), "power-multiply"), wrong(typed(3.14 * r * r), "one-part")] };
    },
  },
  {
    id: "g67-8-right-triangle-check", strand: "MG", grades: GRADES, standard: "8.10", format: "choice", whiteboard: true,
    fill(rng) {
      const k = rng.int(1, 4), [a, b, c] = rng.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17]] as const);
      const sides = (x: number, y: number, z: number) => `${x} cm, ${y} cm, ${z} cm`;
      // Asked by the name or by the Pythagorean check (#187: the ask varies).
      const byName = rng.int(0, 1) === 1;
      const ask = byName ? "Which side lengths make a right triangle?" : "Which triangle has a right angle, from its side lengths?";
      return { values: { a, k, byName: byName ? 1 : 0 }, prompt: ask, readAloud: ask, answer: sides(a * k, b * k, c * k),
        wrong: [wrong(sides(a * k, b * k, c * k + 1), "pythagoras-near"), wrong(sides(a * k + 1, b * k, c * k), "pythagoras-near"), wrong(sides(a * k, b * k, (a + b) * k), "pythagoras-add")] };
    },
  },
  {
    // WNCP 7.SP.1 finds the range of a set of data.
    id: "g67-8-range", strand: "DP", grades: { BC: 8, AB: 7, SK: 7, MB: 7, ON: 8 }, standard: "8.12", format: "number", whiteboard: false,
    fill(rng) {
      const low = rng.int(5, 30), spread = rng.int(8, 40);
      const values = rng.shuffle([low, low + spread, low + rng.int(1, spread - 1), low + rng.int(1, spread - 1), low + rng.int(1, spread - 1), low + rng.int(1, spread - 1)]);
      const prompt = `Find the range of these six values: ${values.join(", ")}.`;
      return { values: { low, spread }, prompt, readAloud: prompt, answer: String(spread), wrong: [wrong(low + spread, "range-kind")] };
    },
  },
  {
    id: "g67-8-missing-from-mean", strand: "DP", grades: GRADES, standard: "8.12", format: "number", whiteboard: true,
    fill(rng) {
      const [scores, last] = draw(rng, (g) => [Array.from({ length: 4 }, () => g.int(60, 95)), g.int(55, 100)] as const,
        ([scores, last]) => (scores.reduce((a, b) => a + b, 0) + last) % 5 === 0 && distinctNumbers([last, (scores.reduce((a, b) => a + b, 0) + last) / 5]));
      const mean = (scores.reduce((a, b) => a + b, 0) + last) / 5;
      const prompt = `The mean of Ravi's five test scores is ${mean}. Four of the scores are ${scores.join(", ")}. What is the fifth score?`;
      return { values: { last, mean }, prompt, readAloud: prompt, answer: String(last), wrong: [wrong(mean, "average-kind")] };
    },
  },
];
