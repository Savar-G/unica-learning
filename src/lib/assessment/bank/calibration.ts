// Templates for new adaptive tests (#1179). The original catalogue still describes stored questions.
import type { Difficulty, Filled, Level, Strand, Template, Wording } from "../types";
import { draw, wrong } from "./kit";

type CalibrationTemplate = Template & { difficulty: Difficulty; wording: Wording; skill: string };

const number = (prompt: string, readAloud: string, answer: number, values: Filled["values"], wrongs: Filled["wrong"] = []): Filled => ({
  prompt, readAloud, answer: String(answer), values, wrong: wrongs.filter((w) => w.value !== String(answer)),
});

function plain(
  id: string, grade: Level, strand: Strand, skill: string, fill: Template["fill"], difficulty: Difficulty = "easy",
): CalibrationTemplate {
  return { id, grades: { BC: grade }, strand, standard: skill.split("-")[0], format: "number",
    whiteboard: grade >= 3, wording: "bare-number", skill, difficulty, fill };
}

const plainTemplates: CalibrationTemplate[] = [
  plain("1-add-within-10", 1, "O", "1.3-add-within-10", (rng) => {
    const a = rng.int(2, 8), b = rng.int(2, 10 - a);
    return number(`${a} + ${b} = ?`, `What is ${a} plus ${b}?`, a + b, { a, b }, [wrong(a + b - 1, "one-to-one")]);
  }),
  plain("1-subtract-within-10", 1, "O", "1.3-subtract-within-10", (rng) => {
    const a = rng.int(4, 10), b = rng.int(2, a - 1);
    return number(`${a} − ${b} = ?`, `What is ${a} minus ${b}?`, a - b, { a, b }, [wrong(a + b, "operation")]);
  }),
  plain("1-teen-sum", 1, "O", "1.3-teen-add-subtract", (rng) => {
    const a = rng.int(11, 16), b = rng.int(2, 19 - a);
    return number(`${a} + ${b} = ?`, `What is ${a} plus ${b}?`, a + b, { a, b }, [wrong(a - b, "operation")]);
  }),
  plain("2-add-no-regroup", 2, "O", "2.4-add-within-100", (rng) => {
    const at = rng.int(1, 6), bt = rng.int(1, 9 - at);
    const ao = rng.int(1, 7), bo = rng.int(1, 9 - ao);
    const a = 10 * at + ao, b = 10 * bt + bo;
    return number(`${a} + ${b} = ?`, `What is ${a} plus ${b}?`, a + b, { a, b }, [wrong(a + bo, "one-part")]);
  }),
  plain("2-add-tens", 2, "O", "2.4-add-subtract-tens", (rng) => {
    const a = 10 * rng.int(2, 6), b = 10 * rng.int(1, 9 - a / 10);
    return number(`${a} + ${b} = ?`, `What is ${a} plus ${b}?`, a + b, { a, b }, [wrong(a + b / 10, "N2")]);
  }),
  plain("3-add-no-regroup", 3, "O", "3.3-add-within-1000", (rng) => {
    const digit = () => rng.int(1, 4);
    const a = 100 * digit() + 10 * digit() + digit(), b = 100 * digit() + 10 * digit() + digit();
    return number(`${a} + ${b} = ?`, `What is ${a} plus ${b}?`, a + b, { a, b }, [wrong(a + b % 100, "one-part")]);
  }),
  plain("4-add-decimals-aligned", 4, "O", "4.6-add-decimals", (rng) => {
    const cents = () => 100 * rng.int(1, 3) + 10 * rng.int(1, 4) + rng.int(1, 4);
    const a = cents(), b = cents();
    const prompt = `${(a / 100).toFixed(2)} + ${(b / 100).toFixed(2)} = ?`;
    return number(prompt, `What is ${a / 100} plus ${b / 100}?`, (a + b) / 100, { a, b }, [wrong((a + b) / 10, "decimal-point")]);
  }),
  {
    id: "4-compare-equal-place-decimals", grades: { BC: 4 }, strand: "F", standard: "4.2", format: "choice",
    whiteboard: false, wording: "bare-number", skill: "4.2-compare-decimals", difficulty: "easy",
    fill(rng) {
      const whole = rng.int(0, 6), tenths = rng.int(1, 8), hundredths = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3);
      const values = hundredths.map((digit) => whole * 100 + tenths * 10 + digit);
      const greatest = rng.int(0, 1) === 1;
      const sorted = [...values].sort((a, b) => greatest ? b - a : a - b);
      const decimal = (cents: number) => (cents / 100).toFixed(2);
      const prompt = `Which number is ${greatest ? "greatest" : "least"}?`;
      return { values: { a: values[0], b: values[1], c: values[2] }, prompt, readAloud: prompt, answer: decimal(sorted[0]),
        wrong: sorted.slice(1).map((cents) => wrong(decimal(cents), "decimal-order")) };
    },
  },
  {
    id: "5-compare-rectangle-areas", grades: { BC: 5 }, strand: "MG", standard: "5.12", format: "choice",
    whiteboard: true, wording: "bare-number", skill: "5.12-area-rectangle", difficulty: "medium",
    fill(rng) {
      const [w, h] = draw(rng, (r) => r.shuffle([3, 4, 5, 6, 7, 8, 9]).slice(0, 2), ([w, h]) => w > h + 1);
      const first = `${w} cm by ${h} cm`, second = `${w - 1} cm by ${h + 1} cm`;
      const prompt = `Two rectangles measure ${first} and ${second}. Which has the larger area?`;
      return { values: { w, h }, prompt, readAloud: prompt.replaceAll("cm", "centimetres"), answer: second,
        wrong: [wrong(first, "area-add"), wrong("They have the same area", "M2")] };
    },
  },
  plain("6-ratio-scale-up", 6, "F", "6.6-equivalent-ratios", (rng) => {
    const [a, b] = rng.shuffle([2, 3, 4, 5, 7]).slice(0, 2), factor = rng.int(2, 4);
    const prompt = `${a}:${b} = ${a * factor}:? What number is missing?`;
    return number(prompt, `${a} to ${b} equals ${a * factor} to a missing number. What number is missing?`, b * factor, { a, b, factor },
      [wrong(b + a * (factor - 1), "scale-additive")]);
  }),
  plain("7-quarters-to-decimal", 7, "F", "7.4-fraction-to-decimal", (rng) => {
    const n = rng.pick([1, 3, 5, 7, 9, 11]);
    return number(`Write ${n}/4 as a decimal.`, `Write ${n} over 4 as a decimal.`, n / 4, { n }, [wrong(n / 10, "decimal-denominator")]);
  }),
  {
    id: "8-like-denominator-subtract", grades: { BC: 8 }, strand: "F", standard: "8.5", format: "choice",
    whiteboard: false, wording: "bare-number", skill: "8.5-add-subtract-fractions", difficulty: "easy",
    fill(rng) {
      const d = rng.pick([5, 7, 11]), a = rng.int(3, d - 1), b = rng.int(1, a - 2);
      return { values: { a, b, d }, prompt: `${a}/${d} − ${b}/${d} = ?`,
        readAloud: `What is ${a} over ${d} minus ${b} over ${d}?`, answer: `${a - b}/${d}`,
        wrong: [wrong(`${a - b}/${2 * d}`, "F5"), wrong(`${a - b + 1}/${d}`, "one-to-one")] };
    },
  },
  plain("9-negative-base-square", 9, "N", "9.2-evaluate-power", (rng) => {
    const base = rng.int(2, 9);
    return number(`What is (−${base})²?`, `What is negative ${base}, in brackets, squared?`, base ** 2, { base },
      [wrong(-(base ** 2), "opposite-sign")]);
  }),
];

type Revision = { source: string; template: CalibrationTemplate; allProvinces?: true };

export function calibratedTemplates(originals: readonly (Template & { wording: Wording })[]) {
  const byId = new Map(originals.map((t) => [t.id, t]));
  function revise(
    source: string, changes: Partial<Omit<CalibrationTemplate, "id" | "skill" | "difficulty" | "standard">>,
    skill: string, difficulty: Difficulty, allProvinces?: true,
  ): Revision {
    const original = byId.get(source);
    if (!original) throw new Error(`Missing assessment template ${source}`);
    return { source, allProvinces, template: { ...original, grades: { BC: original.grades.BC }, ...changes,
      id: `${source}-revised`, standard: skill.split("-")[0], skill, difficulty } };
  }

  const revisions = [
    revise("g35-4-balance-multiply", {
      fill(rng) {
        const [left, a, right, missing] = rng.pick([[2, 6, 4, 3], [2, 10, 5, 4], [3, 4, 2, 6], [5, 4, 2, 10], [4, 5, 10, 2]]);
        const prompt = `${left} × ${a} = ${right} × ?`;
        return number(prompt, `${left} times ${a} equals ${right} times what number?`, missing, { left, a, right }, [wrong(left * a, "one-part")]);
      },
    }, "4.10-equal-products", "medium"),

    revise("k-where-is", {
      fill(rng) {
        const [first, second, third] = rng.shuffle(["ball", "toy car", "book"]);
        const position = rng.pick(["under", "on", "beside"]);
        const other = position === "under" ? "on" : "under";
        const prompt = `The ${first} is ${position} the chair. The ${second} is ${other} the chair. What is ${position} the chair?`;
        return { values: {}, prompt, readAloud: prompt, answer: `The ${first}`,
          wrong: [wrong(`The ${second}`, "position-words"), wrong(`The ${third}`, "position-words")] };
      },
    }, "K8-positional-words", "easy"),
    revise("1-count-coins", {
      fill(rng) {
        const coin = rng.pick([5, 10, 1]);
        const n = rng.int(2, coin === 10 ? 2 : coin === 5 ? 4 : 9);
        const name = coin === 10 ? "dimes" : coin === 5 ? "nickels" : "loonies";
        // Use cents only for nickels and dimes; loonies count in dollars.
        const unit = coin === 1 ? "dollars" : "cents";
        const value = coin === 1 ? "a dollar" : `${coin} cents`;
        const prompt = `You have ${n} ${name}, worth ${value} each. How many ${unit} is that?`;
        return number(prompt, prompt, n * coin, { n, coin }, [wrong(n + coin, "operation")]);
      },
    }, "1.11-count-one-coin-type", "medium"),
    revise("2-three-addends", {
      wording: "bare-number",
      fill(rng) {
        const a = rng.int(2, 8), b = 10 - a, c = rng.int(1, 9);
        return number(`${a} + ${c} + ${b} = ?`, `What is ${a} plus ${c} plus ${b}?`, 10 + c, { a, b, c }, [wrong(a + c, "one-part")]);
      },
    }, "2.3-three-addends", "medium"),
    revise("2-ruler-length", {
      fill(rng) {
        const end = rng.int(4, 14);
        const prompt = `A pencil starts at 0 cm on a ruler and ends at ${end} cm. How many centimetres long is it?`;
        return number(prompt, prompt.replaceAll("cm", "centimetres"), end, { end }, [wrong(end + 1, "one-to-one")]);
      },
    }, "2.8-ruler-from-zero", "easy"),
    revise("3-coin-streak", {
      fill(rng) {
        const coin = rng.pick(["nickel", "dime", "quarter", "loonie", "toonie"]);
        const prompt = `Toss a fair ${coin}. Which is more likely?`;
        return { values: {}, prompt, readAloud: prompt, answer: "Both are equally likely", wrong: [wrong("Heads", "unequal-chance"), wrong("Tails", "unequal-chance")] };
      },
    }, "3.13-simulated-likelihood", "medium"),
    revise("g35-3-fraction-of-amount", {
      fill(rng) {
        const d = rng.pick([2, 4]), share = rng.int(2, 3);
        const fraction = d === 2 ? "half" : "one quarter";
        const prompt = `Share ${d * share} beads equally into ${d} groups. How many beads are in ${fraction} of the set?`;
        return number(prompt, prompt, share, { d, share }, [wrong(d * share, "fraction-other-part")]);
      },
    }, "3.2-fraction-of-set", "medium"),
    revise("g35-4-figure-pattern", {
      fill(rng) {
        const first = rng.int(2, 10), step = rng.int(2, 5);
        const prompt = `Figure 1 uses ${first} tiles, Figure 2 uses ${first + step}, and Figure 3 uses ${first + 2 * step}. How many tiles does Figure 4 use?`;
        return number(prompt, prompt, first + 3 * step, { first, step }, [wrong(first + 4 * step, "pattern-step-count")]);
      },
    }, "4.9-extend-table", "medium"),
    revise("g35-4-money-notation", { strand: "O" }, "4.18-money-notation", "easy"),
    ...(["add", "subtract", "multiply"] as const).map((operation) => revise(`g35-5-evaluate-${operation}`, {
      fill(rng) {
        const a = rng.int(11, 30), b = rng.int(2, 5);
        const [shown, spoken, result] = operation === "add" ? [`n + ${b}`, `n plus ${b}`, a + b]
          : operation === "subtract" ? [`n − ${b}`, `n minus ${b}`, a - b] : [`${b} × n`, `${b} times n`, a * b];
        return number(`What is ${shown} when n is ${a}?`, `What is ${spoken} when n is ${a}?`, result, { a, b }, [wrong(a, "expression-copy")]);
      },
    }, "5.11-evaluate-expression", "easy")),
    revise("g67-5-table-rule", { grades: { BC: 6 } }, "6.9-find-rule", "medium"),
    ...(["add", "subtract"] as const).map((operation) => revise(`g67-7-integer-${operation}-equation`,
      { grades: { BC: 8 } }, "8.8-one-step-integers", "medium")),
  ];

  const rounded = [
    ["g67-7-circumference", "7.7-circumference", "medium"],
    ["g67-7-circle-area", "7.7-area", "hard"],
    ["g67-7-cylinder-volume", "7.8-cylinder-volume", "hard"],
    ["g67-8-cylinder-volume", "8.9-volume-prisms", "hard"],
    ["g67-8-mean", "8.12-mean", "medium"],
  ] as const;
  for (const [source, skill, difficulty] of rounded) {
    const original = byId.get(source);
    if (!original) throw new Error(`Missing assessment template ${source}`);
    revisions.push(revise(source, {
      grades: original.grades,
      fill(rng) {
        const question = original.fill(rng);
        // All five keys are nonnegative and exact to hundredths. Use integer cents at ties like 8.55.
        const hundredths = Math.round(Number(question.answer) * 100);
        const instruction = " Give the exact answer, or round to the nearest tenth or whole number.";
        return { ...question, prompt: question.prompt + instruction, readAloud: question.readAloud + instruction,
          roundedAnswers: [String(Math.round(hundredths / 10) / 10), String(Math.round(hundredths / 100))] };
      },
    }, skill, difficulty, true));
  }

  return { plainTemplates, revisions };
}

// Where the BC audit found two forms of the same task, keep one in the new pool.
// Keep the originals in the catalogue for reports, admin samples, and stored tests.
export const BC_RETIRED_TEMPLATES: ReadonlySet<string> = new Set([
  // Text-only concrete tasks, coin identification by artwork, and a visually ambiguous shape glyph.
  "k-how-many-more", "k-make-balance", "k-rest-are", "k-take-away", "k-two-more-less",
  "k-holds-more", "k-which-word", "k-coin-picture", "k-same-shape-turned",
  // Keep 1-order-three, 1-shape-sides, 2-graph-fewer, 2-certain-possible, and K's pattern core.
  "1-tallest-child", "1-heaviest-box", "1-sides-in-all", "1-graph-how-many-more", "1-never-sometimes-always",
  "2-pattern-core", "2-sides-in-all", "2-spinner", "2-true-equation", "2-half-full-referent",
  // Far-term pattern and rectangular area are sampled at higher grades.
  "3-growing-tables", "3-area-tiles",
  // The old comparison can be solved by finding the only choice with one decimal place.
  "g35-4-compare-decimals",
  // The three revised expressions cover the plain cases, with functional rules available at Grade 6.
  "g35-5-evaluate-take-away", "g35-5-evaluate-divide", "g35-5-evaluate-divisor",
  "g35-5-expression-rows", "g35-5-expression-cards-total", "g35-5-expression-cards-left", "g35-5-expression-sharing",
  // The matching prompt in the other band remains eligible at the same BC grade.
  "g67-5-ten-thousand-more", "g67-5-add-large", "g67-5-rectangle-area", "g67-5-groups-needed",
  "g35-6-decimal-divide", "g35-6-mixed-to-improper", "g35-6-triangle-area",
  "g35-6-parallelogram-area", "g35-6-trapezoid-area", "g35-6-triangle-sides",
  // The Grade 6 bank already has later-term extension. Grade 9 keeps its linear-relation work.
  "g67-5-pattern-term", "g67-9-extrapolate",
]);

// First estimates for the new selector. Existing attempts still order by the original labels.
export const BC_DIFFICULTY: Readonly<Partial<Record<string, Difficulty>>> = {
  "k-season-likely": "medium",
  "1-story-add": "medium",
  "1-story-compare": "hard",
  "1-cubes-longer": "hard",
  "1-cover-card": "medium",
  "2-digit-value": "medium",
  "2-skip-count-back": "medium",
  "3-add-3-digit": "hard",
  "3-solid-parts": "medium",
  "g35-4-multiply": "hard",
  "g35-4-divide": "hard",
  "g35-4-make-change": "hard",
  "g35-4-share": "medium",
  "g35-4-symmetry": "hard",
  "g35-5-square-area": "medium",
  "g67-6-triangle-angles": "medium",
  "g67-6-l-shape-perimeter": "medium",
  "g67-7-write-decimal": "hard",
  "g67-8-hypotenuse": "hard",
  "g67-9-negative-base": "hard",
};
