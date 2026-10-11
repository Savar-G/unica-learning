// The grade 5 up-route: BC grade 6 content (curriculum map section 1). No fraction arithmetic or negative keypad answers.
import { draw, wrong, type TaggedTemplate } from "../kit";
import { dec, frac, mixed, money, moneyAnswer, sayFrac, sayMixed, sayMoney, typedWrong } from "./say";
import type { Filled, Level, TaggedProvince } from "../../types";
import type { Rng } from "../../rng";

const template = (id: string, strand: TaggedTemplate["strand"], standard: string, fill: (rng: Rng) => Filled,
  format: TaggedTemplate["format"] = "number", tags: Partial<Record<TaggedProvince, Level>> = {}): TaggedTemplate => ({
  id: `g35-6-${id}`, strand, standard, format, whiteboard: true,
  grades: { BC: 6, AB: 6, SK: 6, MB: 6, ON: 6, ...tags }, fill,
});
const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);

export const LEVEL_6: readonly TaggedTemplate[] = [
  template("common-factor", "N", "6.4", (rng) => {
    const k = rng.int(3, 12), [a, b] = rng.pick([[2, 3], [3, 4], [4, 5], [3, 5]] as const);
    return { values: { k, a, b }, prompt: `What is the greatest common factor of ${a * k} and ${b * k}?`,
      readAloud: `What is the greatest common factor of ${a * k} and ${b * k}?`, answer: String(k),
      wrong: typedWrong(k, [[1, "common-not-greatest"], [a * b * k, "factor-multiple"]]) };
  }),
  template("least-multiple", "N", "6.4", (rng) => {
    const [a, b] = rng.pick([[4, 6], [6, 9], [8, 12], [10, 15], [12, 18], [14, 21], [15, 20]] as const), right = a * b / gcd(a, b);
    return { values: { a, b }, prompt: `What is the least common multiple of ${a} and ${b}?`, readAloud: `What is the least common multiple of ${a} and ${b}?`, answer: String(right),
      wrong: typedWrong(right, [[a * b, "lcm-product"], [gcd(a, b), "factor-multiple"]]) };
  }),
  template("prime", "N", "6.4", (rng) => {
    const prime = rng.pick([11, 13, 17, 19, 23, 29, 31, 37]), others = rng.shuffle([9, 15, 21, 25, 27, 33, 35, 39]).slice(0, 3);
    return { values: { prime }, prompt: "Which number is prime?", readAloud: "Which number is prime?", answer: String(prime),
      wrong: others.map((n) => wrong(n, "N5")) };
  }, "choice"),
  template("divisibility", "N", "6.4", (rng) => {
    const k = rng.int(20, 90), right = k * 3;
    return { values: { k }, prompt: "Which number is divisible by 3 with no remainder?", readAloud: "Which number is divisible by 3 with no remainder?", answer: String(right),
      wrong: [wrong(right + 1, "divisibility"), wrong(right + 2, "divisibility"), wrong(right - 1, "divisibility")] };
  }, "choice"),
  template("all-factors", "N", "6.4", (rng) => {
    const p = rng.pick([3, 5, 7, 11, 13]), n = p * 2;
    return { values: { p }, prompt: `Which list contains all the factors of ${n}?`, readAloud: `Which list contains all the factors of ${n}?`, answer: `1, 2, ${p}, ${n}`,
      wrong: [wrong(`${n}, ${n * 2}, ${n * 3}`, "factor-multiple"), wrong(`1, ${n}`, "factor-incomplete"), wrong(`2, ${p}`, "factor-incomplete")] };
  }, "choice"),
  template("meeting-cycles", "N", "6.4", (rng) => {
    const [a, b] = rng.pick([[4, 6], [6, 9], [8, 12], [10, 15], [12, 18], [14, 21], [15, 20]] as const), right = a * b / gcd(a, b);
    return { values: { a, b }, prompt: `Two lights flash together now. One flashes every ${a} seconds and the other every ${b} seconds. In how many seconds will they next flash together?`,
      readAloud: `Two lights flash together now. One flashes every ${a} seconds and the other every ${b} seconds. In how many seconds will they next flash together?`, answer: String(right),
      wrong: typedWrong(right, [[a * b, "lcm-product"], [gcd(a, b), "factor-multiple"]]) };
  }),
  ...["product", "brackets", "quotient", "two-products"].map((task) => template(`order-${task}`, "O", "6.3", (rng) => {
    const a = rng.int(3, 9), b = rng.int(4, 12), c = rng.int(2, 7), d = rng.int(2, 5);
    const versions = {
      product: [`${a} + ${b} × ${c}`, `${a} plus ${b} times ${c}`, a + b * c, (a + b) * c],
      brackets: [`(${a} + ${b}) × ${c}`, `Open bracket, ${a} plus ${b}, close bracket, times ${c}`, (a + b) * c, a + b * c],
      quotient: [`${a} + ${b * c} ÷ ${c}`, `${a} plus ${b * c} divided by ${c}`, a + b, (a + b * c) / c],
      "two-products": [`${a} × ${b} + ${c} × ${d}`, `${a} times ${b} plus ${c} times ${d}`, a * b + c * d, (a * b + c) * d],
    } as const;
    const [shown, spoken, right, mistake] = versions[task as keyof typeof versions];
    return { values: { a, b, c, d }, prompt: `${shown} = ?`, readAloud: `What is ${spoken}?`, answer: String(right),
      wrong: typedWrong(right, [[mistake, task === "brackets" ? "brackets-ignored" : "O7"], [task === "quotient" ? a + b * c + c : task === "two-products" ? a + b + c + d : a + b + c, "operation"]]) };
  })),
  ...["multiply", "divide"].map((op) => template(`decimal-${op}`, "O", "6.8", (rng) => {
    const q = rng.int(12, 89), k = rng.int(3, 9), right = op === "multiply" ? q * k : q;
    return { values: { q, k }, prompt: op === "multiply" ? `${dec(q, 1)} × ${k} = ?` : `${dec(q * k, 1)} ÷ ${k} = ?`,
      readAloud: op === "multiply" ? `What is ${dec(q, 1)} times ${k}?` : `What is ${dec(q * k, 1)} divided by ${k}?`, answer: dec(right, 1),
      wrong: typedWrong(right / 10, [[right, "decimal-point"], [right / 100, "decimal-point"]]) };
  })),
  template("decimal-product-story", "O", "6.8", (rng) => {
    const grams = rng.int(125, 375), bags = rng.int(3, 9);
    return { values: { grams, bags }, prompt: `Each bag holds ${dec(grams, 3)} kg of rice. How many kilograms do ${bags} bags hold?`,
      readAloud: `Each bag holds ${dec(grams, 3)} kilograms of rice. How many kilograms do ${bags} bags hold?`, answer: dec(grams * bags, 3),
      wrong: typedWrong(grams * bags / 1000, [[grams * bags / 100, "decimal-point"], [grams / 1000 + bags, "operation"]]) };
  }),
  template("decimal-unit-cost", "O", "6.8", (rng) => {
    const cents = rng.int(125, 799), count = rng.int(3, 8), total = cents * count;
    return { values: { cents, count }, prompt: `${count} identical notebooks cost ${money(total)}. How many dollars does one notebook cost?`,
      readAloud: `${count} identical notebooks cost ${sayMoney(total)}. How many dollars does one notebook cost?`, answer: moneyAnswer(cents),
      wrong: typedWrong(cents / 100, [[total / 100 - count, "operation"], [cents / 10, "decimal-point"]]) };
  }),

  ...["to-mixed", "to-improper", "whole-count", "remainder"].map((task) => template(`mixed-${task}`, "F", "6.5", (rng) => {
    const d = rng.pick([3, 4, 5, 6, 8]), whole = rng.int(2, 5), rem = rng.int(1, d - 1), n = whole * d + rem;
    if (task === "whole-count" || task === "remainder") {
      const right = task === "whole-count" ? whole : rem;
      return { values: { d, whole, rem }, prompt: task === "whole-count" ? `How many whole units are in ${frac(n, d)}?`
        : `${frac(n, d)} is ${whole} wholes and how many ${d === 3 ? "thirds" : d === 4 ? "fourths" : d === 5 ? "fifths" : d === 6 ? "sixths" : "eighths"}?`,
        readAloud: task === "whole-count" ? `How many whole units are in ${sayFrac(n, d)}?`
          : `${sayFrac(n, d)} is ${whole} wholes and how many pieces of size ${sayFrac(1, d)}?`, answer: String(right),
        wrong: typedWrong(right, [[task === "whole-count" ? rem : whole, "remainder-quotient"], [n, "ignores-given"]]) };
    }
    const toMixed = task === "to-mixed", answer = toMixed ? mixed(whole, rem, d) : frac(n, d);
    const candidates = toMixed ? [wrong(mixed(whole, rem, n), "mixed-denominator"), wrong(mixed(whole, rem, whole), "mixed-denominator"), wrong(mixed(rem, whole, d), "mixed-denominator")]
      : [wrong(frac(whole + rem, d), "mixed-convert"), wrong(frac(n, whole), "mixed-denominator"), wrong(frac(Number(`${whole}${rem}`), d), "F8")];
    const w = candidates.filter((x, i, all) => x.value !== answer && all.findIndex((y) => x.value === y.value) === i);
    return { values: { d, whole, rem }, prompt: toMixed ? `Which mixed number equals ${frac(n, d)}?` : `Which improper fraction equals ${mixed(whole, rem, d)}?`,
      readAloud: toMixed ? `Which mixed number equals ${sayFrac(n, d)}?` : `Which improper fraction equals ${sayMixed(whole, rem, d)}?`, answer, wrong: w };
  }, ["whole-count", "remainder"].includes(task) ? "number" : "choice")),
  ...["part-to-part", "part-to-whole", "equivalent", "recipe"].map((task) => template(`ratio-${task}`, "F", "6.6", (rng) => {
    const [a, b] = draw(rng, (r) => [r.int(2, 7), r.int(3, 9)], ([a, b]) => a !== b), k = rng.int(2, 5);
    if (task === "recipe") {
      return { values: { a, b, k }, prompt: `A drink uses ${a} cups of juice for every ${b} cups of water. How many cups of juice go with ${b * k} cups of water?`,
        readAloud: `A drink uses ${a} cups of juice for every ${b} cups of water. How many cups of juice go with ${b * k} cups of water?`, answer: String(a * k),
        wrong: typedWrong(a * k, [[a, "fraction-one-side"], [a + b * (k - 1), "F9"]]) };
    }
    const ratio = (x: number, y: number) => `${x} to ${y}`;
    const right = task === "part-to-whole" ? ratio(a, a + b) : task === "equivalent" ? ratio(a * k, b * k) : ratio(a, b);
    const prompt = task === "equivalent" ? `Which ratio is equal to ${ratio(a, b)}?`
      : `A tray has ${a} red cubes and ${b} blue cubes. What is the ratio of red cubes to ${task === "part-to-whole" ? "all the cubes" : "blue cubes"}?`;
    const candidates = task === "equivalent" ? [wrong(ratio(a + k, b + k), "F9"), wrong(ratio(a, b * k), "fraction-one-side"), wrong(ratio(b * k, a * k), "ratio-order")]
      : [wrong(ratio(task === "part-to-whole" ? a + b : b, a), "ratio-order"), wrong(ratio(a, task === "part-to-whole" ? b : a + b), task === "part-to-whole" ? "F4" : "ratio-whole")];
    return { values: { a, b, k }, prompt, readAloud: prompt, answer: right, wrong: candidates };
  }, task === "recipe" ? "number" : "choice")),
  ...["of-hundred", "of-amount", "discount", "sale-price"].map((task) => template(`percent-${task}`, "F", "6.7", (rng) => {
    const p = rng.pick([10, 20, 25, 50, 75]), total = task === "of-hundred" ? 100 : rng.int(2, 12) * 20, off = total * p / 100;
    const right = task === "of-hundred" ? p : task === "sale-price" ? total - off : off;
    const prompt = task === "of-hundred" ? `A grid has 100 equal squares. ${p} are shaded. What percent is shaded? Enter the number only.`
      : task === "of-amount" ? `What is ${p}% of ${total}?`
      : `An item costs ${money(total * 100)}. It has a ${p}% discount. How many dollars ${task === "discount" ? "is the discount" : "is the sale price"}?`;
    const spoken = task === "of-hundred" ? prompt : task === "of-amount" ? `What is ${p} percent of ${total}?`
      : `An item costs ${sayMoney(total * 100)}. It has a ${p} percent discount. How many dollars ${task === "discount" ? "is the discount" : "is the sale price"}?`;
    return { values: { p, total }, prompt, readAloud: spoken, answer: String(right),
      wrong: typedWrong(right, [[task === "sale-price" ? off : total - off, task === "sale-price" ? "discount-amount" : "fraction-other-part"], [total - p, "F10"], [total / p, "F10"]]) };
  }, "number", { ON: 5 })),

  // Functional relationships. These are evaluations and one-step equations, not grade 7 two-step equations.
  ...["output", "table", "step", "initial", "tenth", "difference"].map((task) => template(`linear-${task}`, "A", "6.9", (rng) => {
    const k = rng.int(3, 8), b = rng.int(2, 9), n = rng.int(4, 9), value = k * n + b;
    const versions = {
      output: [`The rule is ${k} × n + ${b}. What is the result when n is ${n}?`, value, k * n],
      table: [`An input-output table has the rule: multiply by ${k}, then add ${b}. What is the output for input ${n}?`, value, k * n],
      step: [`A rule is ${k} × n + ${b}. How much does the result increase when n increases by 1?`, k, b],
      initial: [`A rule is ${k} × n + ${b}. What is its result when n is 0?`, b, 0],
      tenth: [`A pattern has ${k + b}, ${2 * k + b}, ${3 * k + b} as its first three terms. It adds the same amount each time. What is its tenth term?`, k * 10 + b, k * 10],
      difference: [`A rule is ${k} × n + ${b}. How much greater is the result for n of ${n + 2} than for n of ${n}?`, 2 * k, 2],
    } as const;
    const [prompt, right, mistake] = versions[task as keyof typeof versions];
    return { values: { k, b, n }, prompt, readAloud: prompt.replaceAll("×", "times").replaceAll("+", "plus").replaceAll(" n ", " the number "), answer: String(right),
      wrong: typedWrong(right, [[mistake, task === "step" ? "rule-swap" : task === "difference" ? "coefficient-ignore" : "A5"], [right + k, task === "step" ? "input-step-two" : task === "difference" ? "pattern-step-count" : "next-not-asked"]]) };
  }, "number", { ON: task === "tenth" ? 4 : 5 })),
  ...["add", "subtract", "multiply", "divide", "subtrahend", "divisor"].map((op) => template(`equation-${op}`, "A", "6.10", (rng) => {
    const x = rng.int(30, 89), k = rng.int(4, 9);
    const versions = {
      add: [`x + ${k} = ${x + k}`, `A number plus ${k} equals ${x + k}.`, x + 2 * k],
      subtract: [`x − ${k} = ${x - k}`, `A number minus ${k} equals ${x - k}.`, x - 2 * k],
      multiply: [`${k}x = ${k * x}`, `${k} times a number equals ${k * x}.`, k * x - k],
      divide: [`x ÷ ${k} = ${x}`, `A number divided by ${k} equals ${x}.`, x / k],
      subtrahend: [`${x + k} − x = ${k}`, `${x + k} minus a number equals ${k}.`, x + 2 * k],
      divisor: [`${x * k} ÷ x = ${k}`, `${x * k} divided by a number equals ${k}.`, x * k * k],
    } as const;
    const [shown, spoken, mistake] = versions[op as keyof typeof versions], right = op === "divide" ? x * k : x;
    return { values: { x, k }, prompt: `Find x. ${shown}`, readAloud: `${spoken} What is the number?`, answer: String(right),
      wrong: typedWrong(right, [[mistake, op === "divisor" ? "unknown-divisor" : op === "multiply" || op === "subtrahend" ? "operation" : "inverse-operation"], [k, "known-as-unknown"]]) };
  }, "number", ["add", "subtract", "subtrahend"].includes(op) ? { ON: 2 } : {})),
  template("table-rule", "A", "6.9", (rng) => {
    const [k, b] = draw(rng, (r) => [r.int(3, 8), r.int(2, 9)], ([k, b]) => k !== b);
    return { values: { k, b }, prompt: `A table shows input 1 gives ${k + b}, input 2 gives ${2 * k + b}, and input 3 gives ${3 * k + b}. Which rule fits all three rows?`,
      readAloud: `A table shows input 1 gives ${k + b}, input 2 gives ${2 * k + b}, and input 3 gives ${3 * k + b}. Which rule fits all three rows?`,
      answer: `Multiply by ${k}, then add ${b}`, wrong: [wrong(`Multiply by ${k}`, "A5"), wrong(`Add ${k + b - 1}`, "rule-one-row"), wrong(`Multiply by ${b}, then add ${k}`, "rule-swap")] };
  }, "choice", { ON: 5 }),

  template("triangle-area", "MG", "6.12", (rng) => {
    const base = rng.int(3, 12) * 2, height = rng.int(3, 12), right = base * height / 2;
    return { values: { base, height }, prompt: `A triangle has a base of ${base} cm and a perpendicular height of ${height} cm. What is its area in square centimetres?`,
      readAloud: `A triangle has a base of ${base} centimetres and a perpendicular height of ${height} centimetres. What is its area in square centimetres?`, answer: String(right),
      wrong: typedWrong(right, [[base * height, "M3"], [base + height, "area-add"]]) };
  }, "number", { ON: 5 }),
  template("triangle-height", "MG", "6.12", (rng) => {
    const base = rng.int(3, 10) * 2, height = rng.int(3, 9), area = base * height / 2;
    return { values: { base, height }, prompt: `A triangle has an area of ${area} square centimetres and a base of ${base} cm. What is its perpendicular height in centimetres?`,
      readAloud: `A triangle has an area of ${area} square centimetres and a base of ${base} centimetres. What is its perpendicular height in centimetres?`, answer: String(height),
      wrong: typedWrong(height, [[height / 2, "M3"], [2 * area * base, "inverse-operation"]]) };
  }, "number", { ON: 5 }),
  template("parallelogram-area", "MG", "6.12", (rng) => {
    const base = rng.int(5, 15), height = rng.int(3, 8), slant = height + rng.int(1, 4);
    return { values: { base, height, slant }, prompt: `A parallelogram has a base of ${base} cm, a perpendicular height of ${height} cm, and a slanted side of ${slant} cm. What is its area in square centimetres?`,
      readAloud: `A parallelogram has a base of ${base} centimetres, a perpendicular height of ${height} centimetres, and a slanted side of ${slant} centimetres. What is its area in square centimetres?`, answer: String(base * height),
      wrong: typedWrong(base * height, [[base * slant, "slant-height"], [2 * (base + slant), "M2"]]) };
  }, "number", { ON: 5 }),
  template("trapezoid-area", "MG", "6.12", (rng) => {
    const a = rng.int(3, 9), b = a + 2 * rng.int(1, 4), h = rng.int(3, 9), right = (a + b) * h / 2;
    return { values: { a, b, h }, prompt: `A trapezoid has parallel sides of ${a} cm and ${b} cm. Its perpendicular height is ${h} cm. What is its area in square centimetres?`,
      readAloud: `A trapezoid has parallel sides of ${a} centimetres and ${b} centimetres. Its perpendicular height is ${h} centimetres. What is its area in square centimetres?`, answer: String(right),
      wrong: typedWrong(right, [[(a + b) * h, "half-area"], [b * h, "ignores-given"]]) };
  }, "number", { AB: 7, SK: 7, MB: 7, ON: 7 }),
  template("volume-cubes", "MG", "6.14", (rng) => {
    const rows = rng.int(2, 7), each = rng.int(3, 9), layers = rng.int(2, 5), right = rows * each * layers;
    return { values: { rows, each, layers }, prompt: `A solid has ${layers} layers of unit cubes. Each layer has ${rows} rows of ${each} cubes. What is its volume in cubic units?`,
      readAloud: `A solid has ${layers} layers of unit cubes. Each layer has ${rows} rows of ${each} cubes. What is its volume in cubic units?`, answer: String(right),
      wrong: typedWrong(right, [[rows + each + layers, "M9"], [rows * each, "one-part"]]) };
  }, "number", { SK: 5, MB: 5 }),
  template("capacity", "MG", "6.14", (rng) => {
    const litres = rng.int(2, 9), extra = rng.int(1, 8) * 100, right = litres * 1000 + extra;
    return { values: { litres, extra }, prompt: `A jug holds ${litres} L and ${extra} mL. How many millilitres is that?`,
      readAloud: `A jug holds ${litres} litres and ${extra} millilitres. How many millilitres is that?`, answer: String(right),
      wrong: typedWrong(right, [[litres * 100 + extra, "unit-convert"], [litres + extra, "unit-convert"]]) };
  }, "number", { SK: 5, MB: 5, ON: 4 }),
  template("angle-name", "MG", "6.13", (rng) => {
    const [angle, answer] = rng.int(0, 1) === 0 ? [rng.int(20, 85), "Acute"] : [rng.int(95, 170), "Obtuse"];
    return { values: { angle: Number(angle) }, prompt: `An angle measures ${angle} degrees. What kind of angle is it?`,
      readAloud: `An angle measures ${angle} degrees. What kind of angle is it?`, answer: String(answer),
      wrong: ["Acute", "Obtuse", "Right", "Straight"].filter((x) => x !== answer).map((x) => wrong(x, "angle-names")) };
  }, "choice", { ON: 5 }),
  template("straight-angle", "MG", "6.13", (rng) => {
    const part = rng.int(25, 155), right = 180 - part;
    return { values: { part }, prompt: `A straight angle is split into two angles. One is ${part} degrees. How many degrees is the other?`,
      readAloud: `A straight angle is split into two angles. One is ${part} degrees. How many degrees is the other?`, answer: String(right),
      wrong: typedWrong(right, [[360 - part, "full-turn"], [180 + part, "operation"]]) };
  }, "number", { ON: 5 }),
  template("triangle-sides", "MG", "6.15", (rng) => {
    const [a, b, c] = rng.pick([[4, 4, 4], [5, 5, 5], [6, 6, 6], [5, 5, 8], [6, 6, 10], [7, 7, 9], [4, 5, 6], [5, 6, 7], [6, 7, 8]] as const);
    const answer = a === c ? "Equilateral" : a === b ? "Isosceles, but not equilateral" : "Scalene";
    return { values: { a, b, c }, prompt: `A triangle has sides of ${a} cm, ${b} cm and ${c} cm. Which description fits?`,
      readAloud: `A triangle has sides of ${a} centimetres, ${b} centimetres and ${c} centimetres. Which description fits?`, answer,
      wrong: ["Equilateral", "Isosceles, but not equilateral", "Scalene"].filter((x) => x !== answer).map((x) => wrong(x, "shape-name")) };
  }, "choice", { ON: 5 }),
  template("coordinate", "MG", "6.16", (rng) => {
    const [x, y] = draw(rng, (r) => [r.int(2, 9), r.int(2, 9)], ([x, y]) => x !== y);
    return { values: { x, y }, prompt: `A point is ${x} units right and ${y} units up from the origin. Which ordered pair names it?`,
      readAloud: `A point is ${x} units right and ${y} units up from the origin. Which ordered pair names it?`, answer: `(${x}, ${y})`,
      wrong: [wrong(`(${y}, ${x})`, "coordinates-swap"), wrong(`(${x - 1}, ${y - 1})`, "N4"), wrong(`(${x + 1}, ${y + 1})`, "N4")] };
  }, "choice", { ON: 4 }),
  template("coordinate-slide", "MG", "6.16", (rng) => {
    const x = rng.int(2, 7), y = rng.int(2, 7), dx = rng.int(2, 5), dy = rng.int(2, 5);
    return { values: { x, y, dx, dy }, prompt: `A point starts at (${x}, ${y}). It moves ${dx} units right and ${dy} units up. Where is it now?`,
      readAloud: `A point starts ${x} units right and ${y} units up from the origin. It moves ${dx} units right and ${dy} units up. Where is it now?`, answer: `(${x + dx}, ${y + dy})`,
      wrong: [wrong(`(${x + dx}, ${y})`, "ignores-given"), wrong(`(${x}, ${y + dy})`, "ignores-given"), wrong(`(${x}, ${y})`, "ignores-given")] };
  }, "choice", { ON: 4 }),
  template("experimental-estimate", "DP", "6.18", (rng) => {
    const total = rng.pick([20, 30, 40, 50]), red = draw(rng, (r) => r.int(3, total - 3), (n) => 2 * n !== total), k = rng.int(2, 5);
    const prompt = `A spinner landed on red ${red} times in ${total} spins. Use this result to estimate how many times it will land on red in ${total * k} spins.`;
    return { values: { total, red, k }, prompt, readAloud: prompt, answer: String(red * k),
      wrong: typedWrong(red * k, [[red, "frequency-copy"], [(total - red) * k, "probability-other"]]) };
  }),
  template("experimental-probability", "DP", "6.18", (rng) => {
    const total = rng.pick([20, 30, 40, 50]), red = draw(rng, (r) => r.int(3, total - 3), (n) => n * 2 !== total);
    return { values: { total, red }, prompt: `A spinner landed on red ${red} times in ${total} spins. What fraction of the spins landed on red?`,
      readAloud: `A spinner landed on red ${red} times in ${total} spins. What fraction of the spins landed on red?`, answer: frac(red, total),
      wrong: [wrong(frac(red, total - red), "D4"), wrong(frac(total - red, total), "probability-other"), wrong(frac(total, red), "fraction-flip")] };
  }, "choice"),
  template("theoretical-probability", "DP", "6.18", (rng) => {
    const heads = rng.int(3, 9), total = rng.pick([20, 30, 40, 50]);
    const prompt = `A fair coin landed heads ${heads} times in ${total} tosses. Its last toss was tails. What is the theoretical probability of heads on the next toss?`;
    return { values: { heads, total }, prompt, readAloud: prompt, answer: "1/2",
      wrong: [wrong(frac(heads, total), "D5"), wrong("0", "coin-repeat-certain"), wrong("1", "coin-due-certain")] };
  }, "choice"),
];
