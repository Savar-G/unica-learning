// BC grade 5 content: curriculum map section 1 and the live BC grade 5 content page (2026-10-11).
// SK N5.1/N5.5 and Manitoba grade 5 confirm equivalent fractions and thousandths. Ontario thousandths: grade 6.
// All uncertain province assignments use the later grade. See curriculum-notes.md for the review record.
import { count, draw, NAMES, wrong, type TaggedTemplate } from "../kit";
import { dec, fmt, frac, money, moneyAnswer, sayFrac, sayMoney, sayTime, time, typedWrong } from "./say";
import type { Filled, TaggedProvince, Level } from "../../types";
import type { Rng } from "../../rng";

// Each entry below represents a different question task, not a different number range for the same task.
const template = (id: string, strand: TaggedTemplate["strand"], standard: string, fill: (rng: Rng) => Filled,
  format: TaggedTemplate["format"] = "number", tags: Partial<Record<TaggedProvince, Level>> = {}): TaggedTemplate => ({
  id: `g35-5-${id}`, strand, standard, format, whiteboard: true,
  grades: { BC: 5, AB: 5, SK: 5, MB: 5, ON: 5, ...tags }, fill,
});

const thousandths = { ON: 6 as const };
// Constant-step number patterns below 100. BC 3.6. Next or missing term: AB MAT4-OI6-GQ1-LO1-KO2-SP (first five terms
// from the initial term and constant change), SK P2.2 and MB 2.PR.2 (extend increasing patterns to 100). The step: AB
// MAT3-OI6-GQ1-LO1-KO2-SP (the change from term to term), ON3 C1.1.
const PATTERN_TAGS: Record<string, Partial<Record<TaggedProvince, Level>>> = {
  // ON2 C1.3 extends patterns and finds missing elements in patterns of shapes and numbers.
  next: { BC: 3, AB: 4, SK: 2, MB: 2, ON: 2 },
  missing: { BC: 3, AB: 4, SK: 2, MB: 2, ON: 2 },
  step: { BC: 3, AB: 3, SK: 2, MB: 2, ON: 3 },
};
// Evaluating an expression for a given value: SK P6.3 and MB 7.PR.5 are the first outcomes; AB MAT5-OI2-GQ1-LO1-KO2-SP.
const EVALUATE_TAGS = { SK: 6 as const, MB: 7 as const };
const wordNumber = (h: number, t: number, o: number) => `${h} hundred thousand plus ${t} thousand plus ${o}`;

export const LEVEL_5: readonly TaggedTemplate[] = [
  template("large-digit", "N", "5.1", (rng) => {
    const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 6);
    const n = Number(digits.join("")), at = rng.int(0, 2), d = digits[at], place = 10 ** (5 - at);
    return { values: { n, d, place }, prompt: `In ${fmt(n)}, what is the value of the digit ${d}?`,
      readAloud: `In ${fmt(n)}, what is the value of the digit ${d}?`, answer: fmt(d * place),
      wrong: [wrong(fmt(d), "N2"), wrong(fmt(d * place / 10), "N2"), wrong(fmt(d * place * 10), "N2")] };
  }, "choice", { ON: 6 }),
  template("expanded-large", "N", "5.1", (rng) => {
    const h = rng.int(1, 8), t = rng.int(11, 89), o = rng.int(101, 899), n = h * 100000 + t * 1000 + o;
    return { values: { h, t, o }, prompt: `Which number is ${fmt(h * 100000)} + ${fmt(t * 1000)} + ${o}?`,
      readAloud: `Which number is ${wordNumber(h, t, o)}?`, answer: fmt(n),
      wrong: [wrong(fmt(h * 10000 + t * 1000 + o), "N2"), wrong(fmt(h * 100000 + t * 100 + o), "N2")] };
  }, "choice", { ON: 6 }),
  template("ten-thousand-more", "N", "5.1", (rng) => {
    const n = rng.int(100000, 879999);
    return { values: { n }, prompt: `What is 10,000 more than ${fmt(n)}?`, readAloud: `What is ten thousand more than ${fmt(n)}?`,
      answer: fmt(n + 10000), wrong: [wrong(fmt(n + 1000), "N2"), wrong(fmt(n + 100000), "N2"), wrong(fmt(n - 10000), "operation")] };
  }, "choice", { ON: 6 }),
  template("order-large", "N", "5.1", (rng) => {
    const base = rng.int(10, 89) * 10000, a = base + rng.int(100, 999), b = base + rng.int(1000, 1999), c = base + rng.int(2000, 2999);
    // Greatest to least, or least to greatest (#187: the ask varies). Each wrong list swaps two neighbours or reverses.
    const down = rng.int(0, 1) === 1, list = (ns: number[]) => (down ? [...ns].reverse() : ns).map(fmt).join(", ");
    const ask = `Which list goes from ${down ? "greatest to least" : "least to greatest"}?`;
    return { values: { a, b, c, down: down ? 1 : 0 }, prompt: ask, readAloud: ask,
      answer: list([a, b, c]), wrong: [wrong(list([c, b, a]), "more-less"), wrong(list([b, a, c]), "order-adjacent"), wrong(list([a, c, b]), "order-adjacent")] };
  }, "choice", { ON: 6 }),
  template("add-large", "O", "5.5", (rng) => {
    const [a, b] = draw(rng, (r) => [r.int(120000, 399999), r.int(110000, 299999)], ([a, b]) => a > b && a % 10 + b % 10 >= 10);
    const right = a + b, noCarry = [1, 10, 100, 1000, 10000, 100000].reduce((sum, p) => sum + ((Math.floor(a / p) % 10 + Math.floor(b / p) % 10) % 10) * p, 0);
    return { values: { a, b }, prompt: `${fmt(a)} + ${fmt(b)} = ?`, readAloud: `What is ${fmt(a)} plus ${fmt(b)}?`, answer: fmt(right),
      wrong: [wrong(fmt(a - b), "operation"), wrong(fmt(noCarry), "O3")] };
  }, "choice", { ON: 6 }),
  template("subtract-large", "O", "5.5", (rng) => {
    const [a, b] = draw(rng, (r) => [r.int(500000, 899999), r.int(100000, 399999)], ([a, b]) => a % 10 < b % 10);
    const right = a - b;
    return { values: { a, b }, prompt: `${fmt(a)} − ${fmt(b)} = ?`, readAloud: `What is ${fmt(a)} minus ${fmt(b)}?`, answer: fmt(right),
      wrong: [wrong(fmt(a + b), "operation"), wrong(fmt(right + 10), "regroup-forget")] };
  }, "choice", { ON: 6 }),
  template("multiply-two-digit", "O", "5.6", (rng) => {
    const a = rng.int(12, 49), b = rng.int(12, 19), right = a * b;
    return { values: { a, b }, prompt: `${a} × ${b} = ?`, readAloud: `What is ${a} times ${b}?`, answer: String(right),
      wrong: typedWrong(right, [[a + b, "operation"], [Math.floor(a / 10) * Math.floor(b / 10) * 100 + (a % 10) * (b % 10), "place-pairs"]]) };
  }),
  template("remainder", "O", "5.6", (rng) => {
    const size = rng.int(3, 9), groups = rng.int(12, 35), rem = rng.int(1, size - 1), total = size * groups + rem;
    return { values: { size, groups, rem }, prompt: `${total} pencils go into packs of ${size}. How many pencils are left after all full packs are made?`,
      readAloud: `${total} pencils go into packs of ${size}. How many pencils are left after all full packs are made?`, answer: String(rem),
      wrong: typedWrong(rem, [[groups, "remainder-quotient"], [0, "remainder-zero"]]) };
  // AB MAT4-OI1-GQ4-LO1-KO1-SP: three-digit by one-digit division, a quotient with a remainder; ON4 B2.6 remainders.
  }, "number", { AB: 4, ON: 4 }),
  template("full-groups", "O", "5.6", (rng) => {
    const size = rng.int(3, 9), groups = rng.int(12, 35), rem = rng.int(1, size - 1), total = size * groups + rem;
    return { values: { size, groups, rem }, prompt: `There are ${total} beads. A bracelet needs ${size} beads. How many complete bracelets can be made?`,
      readAloud: `There are ${total} beads. A bracelet needs ${size} beads. How many complete bracelets can be made?`, answer: String(groups),
      wrong: typedWrong(groups, [[rem, "remainder-quotient"], [groups + 1, "remainder-context"]]) };
  // The same AB grade 4 outcome, and ON4 B2.6 (two- or three-digit numbers divided by one-digit numbers).
  }, "number", { AB: 4, ON: 4 }),
  template("enough-buses", "O", "5.6", (rng) => {
    const seats = rng.pick([12, 15, 20, 25]), full = rng.int(3, 8), extra = rng.int(1, seats - 1), total = seats * full + extra;
    return { values: { seats, full, extra }, prompt: `${total} people need a ride. Each bus holds ${seats} people. What is the least number of buses needed?`,
      readAloud: `${total} people need a ride. Each bus holds ${seats} people. What is the least number of buses needed?`, answer: String(full + 1),
      wrong: typedWrong(full + 1, [[full, "remainder-ignore"], [extra, "remainder-quotient"]]) };
  }),
  // A three-digit number divided exactly by a two-digit number (BC 5: division to three digits). AB MAT6-OI1-GQ4-LO1-KO1-SP,
  // MB 5.N.6 (1- and 2-digit divisors), ON5 B2.7. SK N5.3 divides by one digit and no later SK outcome names a two-digit divisor (grade 6 used).
  template("divide-two-digit", "O", "5.6", (rng) => {
    const [d, q] = draw(rng, (r) => [r.int(12, 39), r.int(11, 40)], ([d, q]) => d * q < 1000 && d * q >= 200 && q % 10 !== 0), n = d * q;
    const [things, box] = rng.pick([["pencils", "boxes"], ["eggs", "trays"], ["stickers", "sheets"], ["chairs", "rows"]] as const);
    return { values: { n, d }, prompt: `${n} ${things} are put into ${box} of ${d}. How many ${box} are filled?`,
      readAloud: `${n} ${things} are put into ${box} of ${d}. How many ${box} are filled?`, answer: String(q),
      wrong: typedWrong(q, [[n - d, "operation"], [n * d, "operation"]]) };
  }, "number", { AB: 6, SK: 6, ON: 5 }),
  template("annexing-zeros", "O", "5.9", (rng) => {
    const a = rng.int(2, 8), b = rng.int(3, 9), right = a * b * 100;
    return { values: { a, b }, prompt: `${a * 10} × ${b * 10} = ?`, readAloud: `What is ${a * 10} times ${b * 10}?`, answer: String(right),
      wrong: typedWrong(right, [[a * b * 10, "annexing-zeros"], [a * b, "annexing-zeros"], [(a + b) * 10, "operation"]]) };
  }),
  template("distributive", "O", "5.9", (rng) => {
    const tens = rng.int(2, 7), ones = rng.int(2, 9), factor = rng.int(3, 8), n = tens * 10 + ones;
    return { values: { tens, ones, factor }, prompt: `Use ${tens * 10} and ${ones} to find ${n} × ${factor}. What is the answer?`,
      readAloud: `Use ${tens * 10} and ${ones} to find ${n} times ${factor}. What is the answer?`, answer: String(n * factor),
      wrong: typedWrong(n * factor, [[tens * 10 * factor + ones, "distribute-one"], [tens * 10 + ones * factor, "distribute-one"]]) };
  // Two-digit by one-digit, split into tens and ones: AB4 (MAT4-OI1-GQ4-LO1-KO1-SP), SK N4.4, ON4 B2.5 with B2.1.
  }, "number", { AB: 4, SK: 4, ON: 4 }),
  template("budget-left", "O", "5.19", (rng) => {
    const budget = rng.int(20, 70) * 1000, a = rng.int(20, 80) * 100, b = rng.int(21, 90) * 100, right = budget - a - b;
    return { values: { budget, a, b }, prompt: `A club has ${money(budget)}. It spends ${money(a)} on supplies and ${money(b)} on snacks. How many dollars are left?`,
      readAloud: `A club has ${sayMoney(budget)}. It spends ${sayMoney(a)} on supplies and ${sayMoney(b)} on snacks. How many dollars are left?`, answer: moneyAnswer(right),
      wrong: typedWrong(right / 100, [[(budget - a) / 100, "ignores-given"], [(budget - b) / 100, "ignores-given"]]) };
  }),
  template("change-large", "O", "5.19", (rng) => {
    const paid = rng.pick([10000, 20000, 50000]), cost = rng.int(2000, paid - 1000), right = paid - cost;
    return { values: { paid, cost }, prompt: `A purchase costs ${money(cost)}. You pay ${money(paid)}. How many dollars in change should you get?`,
      readAloud: `A purchase costs ${sayMoney(cost)}. You pay ${sayMoney(paid)}. How many dollars in change should you get?`, answer: moneyAnswer(right),
      wrong: typedWrong(right / 100, [[(paid + cost) / 100, "operation"], [cost / 100, "ignores-given"]]) };
  // AB MAT4-OI1-GQ2-LO1: add and subtract within 10 000 with hundredths, including money problems.
  }, "number", { AB: 4, MB: 4 }),

  // Equivalent fractions do not require fraction arithmetic. BC does not introduce that until grade 8.
  ...["numerator", "denominator", "scale-up", "scale-down", "region", "number-line"].map((task) => template(`equivalent-${task}`, "F", "5.3", (rng) => {
    const [n, d, k] = draw(rng, (r) => { const d = r.pick([3, 4, 5, 6, 8, 10]); return [r.int(1, d - 1), d, r.int(2, 5)]; }, ([n, d, k]) => 2 * n !== d && n * (k + 1) !== d && n * (k + 1) !== d * k);
    if (task === "numerator" || task === "denominator") {
      const num = task === "numerator", right = num ? n * k : d * k;
      return { values: { n, d, k }, prompt: `The fractions ${frac(n, d)} and ${num ? `?/${d * k}` : `${n * k}/?`} are equal. What is the missing number?`,
        readAloud: num ? `${sayFrac(n, d)} is the same as a fraction with ${d * k} on the bottom. What is its top number?`
          : `${sayFrac(n, d)} is the same as a fraction with ${n * k} on the top. What is its bottom number?`, answer: String(right),
        wrong: typedWrong(right, [[num ? n : d, "fraction-one-side"], [num ? n + d * (k - 1) : d + n * (k - 1), "F9"]]) };
    }
    const down = task === "scale-down", shown = down ? frac(n * k, d * k) : frac(n, d), target = down ? d : d * k;
    const right = down ? frac(n, d) : frac(n * k, d * k);
    const context = task === "region" ? `A whole is cut into ${d} equal parts. ${count(n, "part")} ${n === 1 ? "is" : "are"} shaded. Each part is then cut into ${k} equal pieces. What fraction is shaded now?`
      : task === "number-line" ? `A point is ${sayFrac(n, d)} of the way from 0 to 1. Which fraction with ${target} on the bottom names the same point?`
      : `Which fraction with ${target} on the bottom is equal to ${shown}?`;
    return { values: { n, d, k }, prompt: context,
      readAloud: task === "region" || task === "number-line" ? context : `Which fraction with ${target} on the bottom is equal to ${down ? sayFrac(n * k, d * k) : sayFrac(n, d)}?`,
      answer: right, wrong: [wrong(frac(down ? n * k : n, target), "fraction-one-side"), down ? wrong(frac(n * k - k, d * k - k), "fraction-subtract") : wrong(frac(n + k, d + k), "F9"), wrong(frac(target - (down ? n : n * k), target), task === "region" ? "fraction-other-part" : "complement")] };
  // AB MAT4-OI1-GQ5-LO1-KO1-SP (equivalent fractions, simplify, number line). Denominators reach 50, past the halves to
  // twelfths of ON5 B1.3, so Ontario meets these at grade 6 (B1.6).
  }, ["numerator", "denominator"].includes(task) ? "number" : "choice", { AB: 4, ON: 6 })),
  template("fraction-to-hundredths", "F", "5.4", (rng) => {
    const [n, d] = rng.pick([[1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 10], [3, 10]] as const), cents = n * (100 / d);
    return { values: { n, d }, prompt: `Which decimal is equal to ${frac(n, d)}?`, readAloud: `Which decimal is equal to ${sayFrac(n, d)}?`,
      answer: dec(cents, 2), wrong: [wrong(dec(cents, 3), "decimal-point"), wrong(`${n}.${d}`, "F7"), wrong(dec(100 - cents, 2), "complement")] };
  // SK N5.6 with N5.5 and MB 5.N.9 with 5.N.7 relate decimals to fractions through equivalent fractions.
  }, "choice", { AB: 6 }),
  template("decimal-half", "F", "5.4", (rng) => {
    // Greater or less than one half (#187: the ask varies).
    if (rng.int(0, 1) === 1) {
      const high = rng.int(51, 89), lows = rng.shuffle([12, 21, 32, 43, 49]).slice(0, 3);
      const values: Record<string, number> = { high, greater: 1 };
      return { values, prompt: "Which decimal is greater than one half?", readAloud: "Which decimal is greater than one half?",
        answer: dec(high, 2), wrong: lows.map((n) => wrong(dec(n, 2), "F6")) };
    }
    // Less than one half: the two shorter decimals look smaller to a child who thinks a longer decimal is larger (F6).
    const low = rng.pick([12, 21, 32, 43, 49]), tenths = rng.shuffle([6, 7, 8, 9]).slice(0, 2), high = rng.int(51, 89);
    return { values: { low, high, greater: 0 }, prompt: "Which decimal is less than one half?", readAloud: "Which decimal is less than one half?",
      answer: dec(low, 2), wrong: [...tenths.map((t) => wrong(dec(t, 1), "F6")), wrong(dec(high, 2), "more-less")] };
  }, "choice"),
  template("fraction-near-whole", "F", "5.4", (rng) => {
    // Halves to twelfths, the ON5 B1.4 comparison range.
    // Closest to one whole or to zero (#187: the ask varies). The fraction at the other end mixes up the two.
    const d = rng.int(6, 12), whole = rng.int(0, 1) === 1;
    const near = whole ? d - 1 : 1, far = [1, 2, 3].map((k) => (whole ? k : d - k));
    const ask = `Which fraction is closest to ${whole ? "one whole" : "zero"}?`;
    return { values: { d, whole: whole ? 1 : 0 }, prompt: ask, readAloud: ask,
      answer: frac(near, d), wrong: far.map((n, k) => wrong(frac(n, d), k === 0 ? "more-less" : "fraction-order")) };
  // AB grade 3 compares fractions to the benchmarks 0, 1/2 and 1 (denominators to 12).
  }, "choice", { AB: 3 }),
  template("equivalent-decimal", "F", "5.4", (rng) => {
    const t = rng.int(1, 9);
    return { values: { t }, prompt: `Which decimal is equal to 0.${t}0?`, readAloud: `Which decimal is equal to ${t * 10} hundredths?`,
      answer: `0.${t}`, wrong: [wrong(`0.0${t}`, "decimal-point"), wrong(`${t}.0`, "decimal-point"), wrong(`${t}0.0`, "decimal-point")] };
  // AB grade 4: a decimal is named by the place value of its last non-zero digit.
  }, "choice", { AB: 4 }),
  template("thousandths-fraction", "F", "5.2", (rng) => {
    const n = draw(rng, (r) => r.int(111, 899), (x) => x % 10 !== 0);
    return { values: { n }, prompt: `Which decimal is equal to ${frac(n, 1000)}?`, readAloud: `Which decimal is equal to ${sayFrac(n, 1000)}?`,
      answer: dec(n, 3), wrong: [wrong(dec(n, 2), "decimal-point"), wrong(dec(n, 1), "decimal-point"), wrong(`${n}.1000`, "F7")] };
  }, "choice", thousandths),
  template("thousandths-digit", "F", "5.2", (rng) => {
    const [a, b, c] = rng.shuffle([2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
    return { values: { a, b, c }, prompt: `What is the value of the ${c} in 0.${a}${b}${c}?`, readAloud: `What is the value of the ${c} in ${a * 100 + b * 10 + c} thousandths?`,
      answer: `${c} thousandths`, wrong: [wrong(`${c} hundredths`, "N2"), wrong(`${c} tenths`, "N2"), wrong(`${c} ones`, "N2")] };
  }, "choice", thousandths),
  template("compare-thousandths", "F", "5.4", (rng) => {
    const t = rng.int(4, 8), a = rng.int(111, t * 100 - 1), b = rng.int(t * 100 + 1, 899);
    // Greatest or least (#187: the ask varies). Least: the shortest decimal is not the smallest one (F6).
    if (rng.int(0, 1) === 1) {
      return { values: { t, a, b, greatest: 1 }, prompt: "Which decimal is greatest?", readAloud: "Which decimal is greatest?", answer: dec(b, 3),
        wrong: [wrong(dec(t, 1), "decimal-order"), wrong(dec(a, 3), "decimal-order"), wrong(dec(t, 2), "more-less")] };
    }
    return { values: { t, a, b, greatest: 0 }, prompt: "Which decimal is least?", readAloud: "Which decimal is least?", answer: dec(t, 2),
      wrong: [wrong(dec(t, 1), "F6"), wrong(dec(a, 3), "decimal-order"), wrong(dec(b, 3), "more-less")] };
  }, "choice", thousandths),
  // A thousandths decimal between two hundredths: AB MAT5-OI1-GQ1-LO1-KO1-SP (a decimal between two decimals), SK N5.6,
  // MB 5.N.10. Each wrong choice is just past one end of the interval.
  template("decimal-between", "F", "5.2", (rng) => {
    const whole = rng.int(1, 9), low = rng.int(11, 88), d = rng.int(1, 9), at = (n: number) => dec(whole * 1000 + n, 3);
    const right = at(low * 10 + d), lowText = dec(whole * 100 + low, 2), highText = dec(whole * 100 + low + 1, 2);
    return { values: { whole, low, d }, prompt: `Which decimal is between ${lowText} and ${highText}?`,
      readAloud: `Which decimal is between ${lowText} and ${highText}?`, answer: right,
      wrong: [wrong(at((low + 1) * 10 + d), "bounds-error"), wrong(at((low - 1) * 10 + d), "bounds-error")] };
  }, "choice", thousandths),
  ...["add", "subtract"].map((op) => template(`${op}-thousandths`, "O", "5.7", (rng) => {
    const a = rng.int(3501, 8999), b = rng.int(101, 3499), right = op === "add" ? a + b : a - b;
    return { values: { a, b }, prompt: `${dec(a, 3)} ${op === "add" ? "+" : "−"} ${dec(b, 3)} = ?`,
      readAloud: `What is ${dec(a, 3)} ${op === "add" ? "plus" : "minus"} ${dec(b, 3)}?`, answer: dec(right, 3),
      wrong: typedWrong(right / 1000, [[right / 100, "decimal-point"], [(op === "add" ? a - b : a + b) / 1000, "operation"]]) };
  }, "number", thousandths)),

  // One-step equations and variable pattern rules.
  ...["add", "subtract", "take-away", "multiply", "divide", "dividend"].map((op) => template(`variable-${op}`, "A", "5.11", (rng) => {
    const x = rng.int(12, 49), k = rng.int(3, 9), name = rng.pick(["n", "x", "a"]);
    const equations = {
      add: [`${name} + ${k} = ${x + k}`, `A number plus ${k} equals ${x + k}. What is the number?`, x + 2 * k],
      subtract: [`${name} − ${k} = ${x - k}`, `A number minus ${k} equals ${x - k}. What is the number?`, x - 2 * k],
      "take-away": [`${x + k} − ${name} = ${k}`, `${x + k} minus a number equals ${k}. What is the number?`, x + 2 * k],
      multiply: [`${k} × ${name} = ${k * x}`, `${k} times a number equals ${k * x}. What is the number?`, k * x - k],
      divide: [`${x * k} ÷ ${name} = ${k}`, `${x * k} divided by a number equals ${k}. What is the number?`, x * k * k],
      dividend: [`${name} ÷ ${k} = ${x}`, `A number divided by ${k} equals ${x}. What is the number?`, x / k],
    } as const;
    const [shown, spoken, mistake] = equations[op as keyof typeof equations], right = op === "dividend" ? x * k : x;
    return { values: { x, k }, prompt: `Find ${name}. ${shown}`, readAloud: spoken, answer: String(right),
      wrong: typedWrong(right, [[mistake, op === "divide" ? "unknown-divisor" : op === "multiply" || op === "take-away" ? "operation" : "inverse-operation"], [k, "known-as-unknown"]]) };
  // One-step addition and subtraction with an unknown: AB MAT3-OI2-GQ1-LO1-KO2-SP, SK3 and MB 3.PR.3 (a symbol for the
  // unknown), ON2 C2.2-C2.3. Multiplication and division past 100: AB MAT4-OI2-GQ1-LO1-KO2-SP; SK P5.2 and MB 5.PR.2.
  }, "number", ["add", "subtract", "take-away"].includes(op) ? { AB: 3, SK: 3, MB: 3, ON: 2 } : { AB: 4, ON: 6 })),
  ...["next", "missing", "back", "step", "start", "far"].map((task) => template(`pattern-${task}`, "A", ["next", "missing", "step"].includes(task) ? "3.6" : "5.10", (rng) => {
    const first = rng.int(11, 39), step = rng.int(3, 9), terms = Array.from({ length: 5 }, (_, i) => first + i * step);
    const prompts = {
      next: [`The pattern adds the same amount each time: ${terms.slice(0, 4).join(", ")}. What comes next?`, terms[4], terms[3] + 1],
      missing: [`The pattern adds the same amount each time: ${terms[0]}, ${terms[1]}, ?, ${terms[3]}. What is missing?`, terms[2], terms[1]],
      back: [`The pattern adds the same amount each time: ?, ${terms[1]}, ${terms[2]}, ${terms[3]}. What is missing?`, first, terms[1] + step],
      step: [`The pattern adds the same amount each time: ${terms.slice(0, 4).join(", ")}. How much is added each time?`, step, first],
      start: [`A pattern adds ${step} each time. Its fourth term is ${terms[3]}. What is its first term?`, first, terms[3] - step],
      far: [`A pattern starts at ${first} and adds ${step} each time. What is its tenth term?`, first + 9 * step, first + 10 * step],
    } as const;
    const [prompt, right, mistake] = prompts[task as keyof typeof prompts];
    return { values: { first, step }, prompt, readAloud: prompt.replace(/\?,/g, "a missing number,"), answer: String(right),
      wrong: typedWrong(right, [[mistake, task === "next" ? "skip-by-one" : task === "missing" ? "A2" : task === "back" ? "pattern-earlier" : task === "step" ? "pattern-start-step" : "pattern-step-count"], [right + step, "pattern-step-count"]]) };
  }, "number", PATTERN_TAGS[task] ?? { ON: 4 })),
  // Ontario 2020 C2.2 explicitly evaluates whole-number expressions in grade 5.
  ...["add", "subtract", "take-away", "multiply", "divide", "divisor"].map((op) => template(`evaluate-${op}`, "A", "5.11", (rng) => {
    const n = rng.int(12, 49), k = rng.int(3, 9);
    const input = op === "divide" ? n * k : op === "divisor" ? k : n;
    const constant = op === "take-away" ? n + k : op === "divisor" ? n * k : k;
    const versions = {
      add: [`n + ${constant}`, `n plus ${constant}`, input + constant, input - constant],
      subtract: [`n − ${constant}`, `n minus ${constant}`, input - constant, input + constant],
      "take-away": [`${constant} − n`, `${constant} minus n`, constant - input, constant + input],
      multiply: [`${constant}n`, `${constant} times n`, constant * input, constant + input],
      divide: [`n ÷ ${constant}`, `n divided by ${constant}`, input / constant, input * constant],
      divisor: [`${constant} ÷ n`, `${constant} divided by n`, constant / input, constant * input],
    } as const;
    const [shown, spoken, right, mistake] = versions[op as keyof typeof versions];
    return { values: { input, constant }, prompt: `Evaluate ${shown} when n is ${input}.`,
      readAloud: `Evaluate ${spoken} when n is ${input}.`, answer: String(right),
      wrong: typedWrong(right, [[mistake, "operation"], [input, "expression-copy"], ...(op === "multiply" ? [[Number(`${constant}${input}`), "A3"] as [number, "A3"]] : [])]) };
  }, "number", EVALUATE_TAGS)),
  ...["rows", "cards-total", "cards-left", "sharing"].map((task) => template(`expression-${task}`, "A", "5.11", (rng) => {
    const n = rng.int(12, 39), k = rng.int(3, 9), input = task === "sharing" ? n * k : n;
    const versions = {
      rows: [`Each row has ${k} seats. The expression ${k}n gives the number of seats in n rows. Evaluate it when n is ${input}.`,
        `Each row has ${k} seats. The expression ${k} times n gives the number of seats in n rows. Evaluate it when n is ${input}.`, k * input, k + input],
      "cards-total": [`The expression n + ${k} gives the number of cards after ${k} more are added. Evaluate it when n is ${input}.`,
        `The expression n plus ${k} gives the number of cards after ${k} more are added. Evaluate it when n is ${input}.`, input + k, input - k],
      "cards-left": [`The expression n − ${k} gives the number of cards after ${k} are given away. Evaluate it when n is ${input}.`,
        `The expression n minus ${k} gives the number of cards after ${k} are given away. Evaluate it when n is ${input}.`, input - k, input + k],
      sharing: [`The expression n ÷ ${k} gives the number of beads in each of ${k} equal groups. Evaluate it when n is ${input}.`,
        `The expression n divided by ${k} gives the number of beads in each of ${k} equal groups. Evaluate it when n is ${input}.`, input / k, input * k],
    } as const;
    const [prompt, readAloud, right, mistake] = versions[task as keyof typeof versions];
    return { values: { input, k }, prompt, readAloud, answer: String(right),
      wrong: typedWrong(right, [[mistake, "operation"], [input, "expression-copy"]]) };
  }, "number", EVALUATE_TAGS)),
  template("variable-rule", "A", "5.10", (rng) => {
    const k = rng.int(3, 8), n = rng.int(4, 12), right = k * n;
    return { values: { k, n }, prompt: `The rule is ${k} × n. What is the result when n is ${n}?`,
      readAloud: `The rule is ${k} times a number. What is the result when the number is ${n}?`, answer: String(right),
      wrong: typedWrong(right, [[Number(`${k}${n}`), "A3"], [k + n, "operation"]]) };
  }),
  template("equation-story", "A", "5.11", (rng) => {
    const start = rng.int(20, 69), left = draw(rng, (r) => r.int(5, start - 5), (left) => start !== 2 * left), name = rng.pick(NAMES);
    return { values: { start, left }, prompt: `${name} has ${start} cards and gives away n cards. ${left} cards remain. Which equation fits?`,
      readAloud: `${name} has ${start} cards and gives away a number of cards. ${left} cards remain. Which equation fits?`,
      answer: `${start} − n = ${left}`, wrong: [wrong(`${start} + n = ${left}`, "operation"), wrong(`${start} − ${left} = ${left}`, "ignores-given"), wrong(`n − ${start} = ${left}`, "equation-roles")] };
  // AB MAT3-OI2-GQ1-LO1-KO2-SP solves problems with one-operation equations; SK4 and MB 4.PR.5 write a problem as an equation.
  }, "choice", { AB: 3, SK: 4, MB: 4, ON: 2 }),

  // A child can draw each measurement situation from the words. No glyph stands in for a figure.
  template("rectangle-area", "MG", "5.12", (rng) => {
    const a = rng.int(4, 15), b = rng.int(3, 12), right = a * b;
    return { values: { a, b }, prompt: `A rectangle is ${a} cm long and ${b} cm wide. What is its area in square centimetres?`,
      readAloud: `A rectangle is ${a} centimetres long and ${b} centimetres wide. What is its area in square centimetres?`, answer: String(right),
      wrong: typedWrong(right, [[2 * (a + b), "M2"], [a + b, "M2"]]) };
  }, "number", { AB: 4, ON: 4 }),
  // Two-digit sides need a two-digit by two-digit product: AB MAT5-OI1-GQ4, SK and MB grade 5 multiplication, ON5 B2.6.
  template("area-two-digit", "MG", "5.12", (rng) => {
    const a = rng.int(11, 29), b = rng.int(11, 29), right = a * b;
    const [place, unit, sayUnit] = rng.pick([["garden", "m", "metres"], ["poster", "cm", "centimetres"], ["rug", "dm", "decimetres"]] as const);
    return { values: { a, b }, prompt: `A rectangular ${place} is ${a} ${unit} long and ${b} ${unit} wide. What is its area in square ${sayUnit}?`,
      readAloud: `A rectangular ${place} is ${a} ${sayUnit} long and ${b} ${sayUnit} wide. What is its area in square ${sayUnit}?`, answer: String(right),
      wrong: typedWrong(right, [[2 * (a + b), "M2"], [Math.floor(a / 10) * Math.floor(b / 10) * 100 + (a % 10) * (b % 10), "place-pairs"], [a + b, "area-add"]]) };
  }),
  template("square-area", "MG", "5.12", (rng) => {
    const side = rng.int(5, 19), right = side * side;
    return { values: { side }, prompt: `A square has a side of ${side} cm. What is its area in square centimetres?`,
      readAloud: `A square has a side of ${side} centimetres. What is its area in square centimetres?`, answer: String(right),
      wrong: typedWrong(right, [[4 * side, "M2"], [2 * side, "M2"]]) };
  // Sides to 19 need two-digit by two-digit products: AB MAT5-OI1-GQ4 and ON5 B2.6.
  }, "number"),
  template("area-width", "MG", "5.12", (rng) => {
    const a = rng.int(4, 12), b = rng.int(3, 9), area = a * b;
    return { values: { a, b }, prompt: `A rectangle has an area of ${area} square centimetres. Its length is ${a} cm. What is its width in centimetres?`,
      readAloud: `A rectangle has an area of ${area} square centimetres. Its length is ${a} centimetres. What is its width in centimetres?`, answer: String(b),
      wrong: typedWrong(b, [[area - a, "operation"], [area * a, "inverse-operation"]]) };
  }, "number", { ON: 4 }),
  template("same-area", "MG", "5.13", (rng) => {
    const k = rng.int(3, 9), a = 2 * k, b = 6;
    return { values: { k }, prompt: `One rectangle is ${a} cm by ${b} cm. Another has the same area and is ${3 * k} cm long. What is its perimeter, in centimetres?`,
      readAloud: `One rectangle is ${a} centimetres by ${b} centimetres. Another has the same area and is ${3 * k} centimetres long. What is its perimeter, in centimetres?`, answer: String(2 * (3 * k + 4)),
      wrong: typedWrong(2 * (3 * k + 4), [[2 * (a + b), "area-perimeter-link"], [a * b, "M2"]]) };
  }, "number", { ON: 4 }),
  template("same-perimeter", "MG", "5.13", (rng) => {
    const a = rng.int(6, 14), b = rng.int(3, 5), right = (a - 1) * (b + 1);
    return { values: { a, b }, prompt: `A rectangle is ${a} cm by ${b} cm. A second rectangle has the same perimeter and is ${a - 1} cm long. What is the second rectangle's area in square centimetres?`,
      readAloud: `A rectangle is ${a} centimetres by ${b} centimetres. A second rectangle has the same perimeter and is ${a - 1} centimetres long. What is the second rectangle's area in square centimetres?`, answer: String(right),
      wrong: typedWrong(right, [[a * b, "area-perimeter-link"], [2 * (a + b), "M2"]]) };
  }, "number", { ON: 4 }),
  // Rectangles with one area and different perimeters (BC 5.13; AB MAT5-OI5-GQ1-LO1-KO1-SP compares the perimeters of
  // rectangles with the same area; SK SS5.1, MB 5.SS.1; ON4 E2.7).
  template("same-area-perimeter", "MG", "5.13", (rng) => {
    const area = rng.pick([24, 36, 40, 48, 60, 72]), most = rng.int(0, 1) === 1;
    const sides = Array.from({ length: area }, (_, i) => i + 1).filter((a) => area % a === 0 && a * a <= area);
    const picked = rng.shuffle(sides).slice(0, 4).sort((a, b) => a - b);
    const name = (a: number) => `${a} cm by ${area / a} cm`;
    // The perimeter is greatest for the longest, thinnest rectangle and least for the one closest to a square.
    const right = most ? picked[0] : picked[picked.length - 1], opposite = most ? picked[picked.length - 1] : picked[0];
    return { values: { area, most: most ? 1 : 0 }, prompt: `Each rectangle has an area of ${area} square centimetres. Which one has the ${most ? "greatest" : "least"} perimeter?`,
      readAloud: `Each rectangle has an area of ${area} square centimetres. Which one has the ${most ? "greatest" : "least"} perimeter?`, answer: name(right),
      wrong: picked.filter((a) => a !== right).map((a) => wrong(name(a), a === opposite ? "more-less" : "area-perimeter-link")),
      // Units in words, singular for 1, so the voice does not read "cm" letter by letter.
      say: Object.fromEntries(picked.map((a) => [name(a), `${a} ${a === 1 ? "centimetre" : "centimetres"} by ${area / a} centimetres`])) };
  }, "choice", { ON: 4 }),
  template("duration", "MG", "5.14", (rng) => {
    // start − end = 30 equals the answer, and start − end = 50 equals the base-10 error: each coded value has one cause.
    const hour = rng.int(1, 8), [start, end] = draw(rng, (r) => [r.int(35, 55), r.int(5, 25)], ([s, e]) => s - e !== 30 && s - e !== 50), right = 60 - start + end;
    return { values: { hour, start, end }, prompt: `A lesson starts at ${time(hour, start, "p.m.")} and ends at ${time(hour + 1, end, "p.m.")} How many minutes does it last?`,
      readAloud: `A lesson starts at ${sayTime(hour, start, "p.m.")} and ends at ${sayTime(hour + 1, end, "p.m.")}. How many minutes does it last?`, answer: String(right),
      wrong: typedWrong(right, [[100 - start + end, "M8"], [start - end, "minutes-reversed"]]) };
  // Duration across the hour: AB MAT4-OI7-GQ1-LO1-KO1-SP, SK SS4.1 and MB 4.SS.1 (digital time), ON4 E2.3.
  }, "number", { AB: 4, SK: 4, MB: 4, ON: 4 }),
  template("end-time", "MG", "5.14", (rng) => {
    const h = rng.int(1, 7), m = rng.int(35, 55), duration = rng.int(30, 45), end = m + duration - 60;
    return { values: { h, m, duration }, prompt: `A trip starts at ${time(h, m, "p.m.")} and lasts ${duration} minutes. When does it end?`,
      readAloud: `A trip starts at ${sayTime(h, m, "p.m.")} and lasts ${duration} minutes. When does it end?`, answer: time(h + 1, end),
      wrong: [wrong(time(h, m + duration), "M8"), wrong(time(h, end), "clock-carry"), wrong(time(h + 1, duration), "ignores-given")] };
  // AB MAT4-OI7-GQ1-LO1-KO1-SP (duration), SK SS4.1 and MB 4.SS.1 (digital time), ON4 E2.3.
  }, "choice", { AB: 4, SK: 4, MB: 4, ON: 4 }),
  template("prism-faces", "MG", "5.15", (rng) => {
    const sides = rng.pick([3, 4, 5, 6, 8]);
    return { values: { sides }, prompt: `A prism has two bases. Each base is a polygon with ${sides} sides. How many faces does the prism have?`,
      readAloud: `A prism has two bases. Each base is a polygon with ${sides} sides. How many faces does the prism have?`, answer: String(sides + 2),
      wrong: typedWrong(sides + 2, [[sides, "missing-base"], [3 * sides, "faces-corners"], [2 * sides, "faces-corners"]]) };
  // Faces of prisms: AB MAT4-OI3-GQ1-LO1-KO1-SP, SK SS4.3, MB 3.SS.6, ON3 E1.1 (a prism has two polygon bases).
  }, "number", { AB: 4, SK: 4, MB: 3, ON: 3 }),
  template("pyramid-faces", "MG", "5.15", (rng) => {
    const sides = rng.pick([3, 4, 5, 6, 8]);
    return { values: { sides }, prompt: `A pyramid has a base with ${sides} sides. How many faces does it have, including the base?`,
      readAloud: `A pyramid has a base with ${sides} sides. How many faces does it have, including the base?`, answer: String(sides + 1),
      wrong: typedWrong(sides + 1, [[sides, "missing-base"], [2 * sides, "faces-corners"], [sides + 2, "shape-name"]]) };
  // Faces of pyramids: SK SS3.4, MB 3.SS.6, ON3 E1.1. AB names no pyramid face count; its grade 4 face analysis is used.
  }, "number", { AB: 4, SK: 3, MB: 3, ON: 3 }),
  template("transformation", "MG", "5.16", (rng) => {
    const [motion, answer] = rng.pick([["slides without turning", "Translation"], ["flips across a mirror line", "Reflection"], ["turns around a fixed point", "Rotation"]] as const);
    const name = rng.pick(NAMES), shape = rng.pick(["triangle", "square", "pentagon", "arrow", "rectangle"]);
    return { values: {}, prompt: `${name} moves a ${shape}. It ${motion}. What is this movement called?`,
      readAloud: `${name} moves a ${shape}. It ${motion}. What is this movement called?`, answer,
      wrong: ["Translation", "Reflection", "Rotation"].filter((x) => x !== answer).map((x) => wrong(x, "transformation-name")) };
  // AB MAT2-OI3-GQ1-LO1-KO2: slides (translations), turns (rotations) and flips (reflections).
  }, "choice", { AB: 2 }),
  template("mirror-distance", "MG", "5.16", (rng) => {
    const gap = rng.int(2, 9);
    return { values: { gap }, prompt: `A point is ${gap} cm to the left of a mirror line. Its reflection is on the right. How far is the reflection from the mirror line, in centimetres?`,
      readAloud: `A point is ${gap} centimetres to the left of a mirror line. Its reflection is on the right. How far is the reflection from the mirror line, in centimetres?`, answer: String(gap),
      wrong: typedWrong(gap, [[2 * gap, "reflection-distance"], [0, "reflection-distance"]]) };
  }, "number", { ON: 4 }),
  template("double-bar-difference", "DP", "5.17", (rng) => {
    const scale = 2, a = rng.int(7, 14), b = rng.int(1, 5), c = rng.int(2, 6), d = rng.int(3, 8);
    // The two children and what they count change with the seed (#187: no fixed prompt). The child asked about is
    // named first.
    const [x, y] = rng.shuffle(NAMES), [things, verb] = rng.pick([["books", "read"], ["drawings", "make"], ["puzzles", "finish"]] as const);
    const past = { read: "read", make: "made", finish: "finished" }[verb];
    const about = `The graph compares ${things} ${x} and ${y} ${past} on Monday and Tuesday.`;
    const ask = `How many more ${things} did ${x} ${verb} on Monday than Tuesday?`;
    return { values: { scale, a, b, c, d }, figure: { kind: "bars", bars: [{ label: `Mon ${x}`, value: a * scale }, { label: `Mon ${y}`, value: c * scale }, { label: `Tue ${x}`, value: b * scale }, { label: `Tue ${y}`, value: d * scale }] }, prompt: `${about} ${ask}`,
      // The voice does not read the bars: reading the graph and its scale is the skill (#79).
      readAloud: `${about} Look at the graph. ${ask}`, answer: String((a - b) * scale),
      wrong: typedWrong((a - b) * scale, [[a - b, "D1"], [(a + b) * scale, "operation"]]) };
  // ON4 D1.3 and D1.6: multiple-bar graphs.
  }, "number", { ON: 4 }),
  template("pictograph-total", "DP", "5.17", (rng) => {
    const scale = rng.pick([4, 5, 10]), a = rng.int(3, 12), b = rng.int(2, 9);
    return { values: { scale, a, b }, prompt: `A graph uses one symbol for ${scale} tickets. There are ${a} symbols for adults and ${b} symbols for children. How many tickets is that in all?`,
      readAloud: `A graph uses one symbol for ${scale} tickets. There are ${a} symbols for adults and ${b} symbols for children. How many tickets is that in all?`, answer: String((a + b) * scale),
      wrong: typedWrong((a + b) * scale, [[a + b, "D1"], [a * scale + b, "D1"]]) };
  // Many-to-one pictographs: AB MAT4-OI8-GQ1-LO1-KO2-SP, SK SP4.1, MB 4.SP.2, ON3 D1.3.
  }, "number", { AB: 4, SK: 4, MB: 4, ON: 3 }),
  template("bag-probability", "DP", "5.18", (rng) => {
    const [red, blue] = draw(rng, (r) => [r.int(2, 8), r.int(3, 9)], ([r, b]) => r !== b);
    return { values: { red, blue }, prompt: `A bag has ${red} red marbles and ${blue} blue marbles of the same size. One is drawn without looking. What is the probability it is red?`,
      readAloud: `A bag has ${red} red marbles and ${blue} blue marbles of the same size. One is drawn without looking. What is the probability it is red?`, answer: frac(red, red + blue),
      wrong: [wrong(frac(red, blue), "D4"), wrong(frac(1, 2), "D3"), wrong(frac(blue, red + blue), "probability-other")].filter((x) => x.value !== frac(red, red + blue)) };
  }, "choice", { AB: 6, SK: 6, MB: 6 }),
];
