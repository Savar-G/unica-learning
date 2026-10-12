import { describe, expect, it } from "vitest";
import {
  BANKS,
  MISCONCEPTIONS,
  createSession,
  fillTemplate,
  toPublicQuestion,
  spokenChoices,
  REPORTED_STRAND,
  type Grade,
  type Province,
  type TaggedProvince,
} from "@/lib/assessment";

const BANK = BANKS["6-7"];
const PROVINCES: Province[] = ["BC", "AB", "SK", "MB", "ON", "other"];
const TAGGED: TaggedProvince[] = ["BC", "AB", "SK", "MB", "ON"];
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);
// Symbols a browser voice reads badly: math signs, a "?" that marks a blank, a minus before a digit, brackets, and a
// ratio such as 3:5 (a time such as 2:50 p.m. reads well).
const NOT_SPOKEN = /[=+−×÷<>%$²³√π/()●■▲★◆▼▬▮]|\s\?|-\d|\d:\d(?!\d)/;
// The number pad types digits and one decimal point, at most 12 keys (ANSWER_MAX in src/lib/test-api.ts).
const TYPEABLE = /^(?=.{1,12}$)\d+(\.\d+)?$/;
const valueOfChoice = (text: string): string => {
  const match = text.replace(/ /g, " ").match(/^(?:(\d+) )?(\d+)\/(\d+)$/);
  if (match) return String(Number(match[1] ?? 0) + Number(match[2]) / Number(match[3]));
  return text;
};

describe("grade 6-7 tests from the default bank", () => {
  it.each([6, 7] as Grade[])("grade %i: 42 questions, 21 in stage 1 at the school grade, in every province", (grade) => {
    for (const province of PROVINCES) {
      const session = createSession({ grade, province }, 1);
      expect(session.stage1, province).toHaveLength(21);
      expect(session.stage1.every((q) => q.level === grade), province).toBe(true);
      for (const [route, level] of [["up", grade + 1], ["stay", grade], ["down", grade - 1]] as const) {
        expect(session.stage2[route], `${province} ${route}`).toHaveLength(21);
        expect(session.stage2[route].every((q) => q.level === level), `${province} ${route}`).toBe(true);
      }
    }
  });

  it.each([6, 7] as Grade[])("grade %i: every route has 10 suitable required-work questions and four report areas", (grade) => {
    for (const province of PROVINCES) {
      for (const seed of SEEDS.slice(0, 60)) {
        const session = createSession({ grade, province }, seed);
        for (const [route, stage2] of Object.entries(session.stage2)) {
          const questions = [...session.stage1, ...stage2];
          const label = `${province} ${route} seed ${seed}`;
          expect(questions.filter((q) => q.whiteboard).length, label).toBeGreaterThanOrEqual(10);
          expect(questions.filter((q) => q.showWork), label).toHaveLength(10);
          expect(questions.filter((q) => q.showWork).every((q) => q.whiteboard), label).toBe(true);
          expect(new Set(questions.map((q) => REPORTED_STRAND[q.strand])), label)
            .toEqual(new Set(["number", "fractions", "algebra", "shapes"]));
          expect(new Set(questions.map((q) => `${q.prompt}|${[...(q.choices ?? [])].sort().join("|")}`)).size, label).toBe(42);
        }
      }
    }
  });
});

describe("the grades 6-7 bank", () => {
  it("keeps every generated misconception code within the answer storage limit", () => {
    for (const template of BANK) {
      for (const seed of SEEDS) {
        for (const w of fillTemplate(template, seed).wrong) {
          expect(w.misconception.length, `${template.id}, seed ${seed}: ${w.misconception}`).toBeLessThanOrEqual(20);
          expect(MISCONCEPTIONS[w.misconception]).toBeDefined();
        }
      }
    }
  });

  it("distinguishes adding an implicit product from joining its digits", () => {
    const q = fillTemplate(BANK.find((t) => t.id === "g67-6-evaluate")!, 3);
    const { a, b, n } = q.values;
    expect(q.wrong.find((w) => Number(w.value) === a + n + b)?.misconception).toBe("product-as-sum");
    expect(q.wrong.find((w) => Number(w.value) === Number(`${a}${n}`) + b)?.misconception).toBe("A3");
  });

  it("tags hundredths addition at the confirmed Alberta and Manitoba grade", () => {
    const template = BANK.find((t) => t.id === "g67-5-add-decimals")!;
    expect(template.grades.AB).toBe(4);
    expect(template.grades.MB).toBe(4);
    expect(template.grades.BC).toBe(5);
  });

  it("codes too few and too many product zeros as annexing zeros", () => {
    for (const seed of SEEDS) {
      const q = fillTemplate(BANK.find((t) => t.id === "g67-5-facts-tens")!, seed);
      const product = q.values.x * q.values.y;
      expect(Number(q.answer)).toBe(product);
      expect(q.wrong.find((w) => Number(w.value) === product / 10)?.misconception).toBe("annexing-zeros");
      expect(q.wrong.find((w) => Number(w.value) === product * 10)?.misconception).toBe("annexing-zeros");
    }
  });

  it("makes comparison distractors follow their named error", () => {
    for (const seed of SEEDS) {
      const least = fillTemplate(BANK.find((t) => t.id === "g67-5-least-decimal")!, seed);
      expect(least.wrong.filter((w) => w.misconception === "F6")).toHaveLength(1);
      expect(least.wrong.find((w) => w.misconception === "zero-placeholder")?.value)
        .toBe(String((least.values.t * 10 + least.values.u) / 100));
      const greatest = fillTemplate(BANK.find((t) => t.id === "g67-5-greatest-fraction")!, seed);
      const parts = (value: string) => value.split("/").map(Number);
      const numerators = greatest.choices!.map((c) => parts(c)[0]);
      const denominators = greatest.choices!.map((c) => parts(c)[1]);
      const numeratorError = greatest.wrong.filter((w) => w.misconception === "numerator-only");
      const denominatorError = greatest.wrong.filter((w) => w.misconception === "F1");
      expect(numeratorError).toHaveLength(1);
      expect(denominatorError).toHaveLength(1);
      expect(parts(numeratorError[0].value)[0]).toBe(Math.max(...numerators));
      expect(parts(denominatorError[0].value)[1]).toBe(Math.max(...denominators));
    }
  });

  it("uses supported earlier province tags for the reviewed level 5 skills", () => {
    const expected = [
      ["fraction-to-decimal", { SK: 4, MB: 4 }],
      ["decimal-as-fraction", { SK: 4, MB: 4 }],
      ["equation-add", { ON: 2 }], ["equation-subtract", { ON: 2 }],
      ["balance", { ON: 2 }], ["pattern-term", { ON: 4 }], ["pattern-down", { ON: 4 }],
      ["rectangle-area", { AB: 4, MB: 4, ON: 4 }],
      ["area-side", { ON: 4 }], ["same-area", { ON: 4 }], ["elapsed-time", { ON: 4 }],
    ] as const;
    for (const [id, tags] of expected) {
      expect(BANK.find((t) => t.id === `g67-5-${id}`)!.grades).toMatchObject(tags);
    }
  });

  it("codes addition-first, the extra pattern step and the final total accurately", () => {
    for (const seed of SEEDS) {
      const rule = fillTemplate(BANK.find((t) => t.id === "g67-5-rule-output")!, seed);
      expect(rule.wrong.find((w) => Number(w.value) === rule.values.m * (rule.values.x + rule.values.c))?.misconception)
        .toBe("add-before-multiply");
      const pattern = fillTemplate(BANK.find((t) => t.id === "g67-5-pattern-down")!, seed);
      expect(pattern.wrong.find((w) => Number(w.value) === pattern.values.s - pattern.values.k * pattern.values.d)?.misconception)
        .toBe("pattern-step-count");
      const story = fillTemplate(BANK.find((t) => t.id === "g67-5-story-equation")!, seed);
      expect(story.wrong.find((w) => /^[a-z] = \d+$/.test(w.value))?.misconception).toBe("start-as-total");
    }
  });

  it("states the complete face set and codes elapsed-time and half-picture errors", () => {
    for (const seed of SEEDS) {
      const solid = fillTemplate(BANK.find((t) => t.id === "g67-5-solid-from-faces")!, seed);
      expect(solid.prompt).toContain("with no other faces");
      expect(solid.readAloud).toContain("with no other faces");
      const elapsed = fillTemplate(BANK.find((t) => t.id === "g67-5-elapsed-time")!, seed);
      expect(elapsed.wrong[0].misconception).toBe("clock-no-regroup");
      expect(elapsed.wrong[1].misconception).toBe("clock-carry");
      const graph = fillTemplate(BANK.find((t) => t.id === "g67-5-pictograph")!, seed);
      expect(graph.wrong.find((w) => w.misconception === "D1")?.value).toBe(String(graph.values.n + 0.5));
    }
  });

  it("keeps bracket intermediates nonnegative and names the bracket error", () => {
    for (const seed of SEEDS) {
      const q = fillTemplate(BANK.find((t) => t.id === "g67-6-brackets")!, seed);
      if (q.values.form === 2) expect(q.values.b).toBeGreaterThanOrEqual(q.values.c);
      expect(q.wrong[0].misconception).toBe("brackets-ignored");
      const large = fillTemplate(BANK.find((t) => t.id === "g67-6-greatest-large")!, seed);
      expect(large.choices).toHaveLength(3);
      expect(large.wrong.some((w) => w.misconception === "zero-placeholder")).toBe(false);
    }
  });

  it("codes mixed-number addition and part-to-part errors in the correct direction", () => {
    for (const seed of SEEDS) {
      for (const id of ["mixed-to-improper", "count-parts"]) {
        const q = fillTemplate(BANK.find((t) => t.id === `g67-6-${id}`)!, seed);
        const sum = q.values.w + q.values.r;
        const value = id === "count-parts" ? String(sum) : `${sum}/${q.values.d}`;
        expect(q.wrong.find((w) => w.value === value)?.misconception).toBe("mixed-convert");
      }
      const ratio = fillTemplate(BANK.find((t) => t.id === "g67-6-ratio-part-whole")!, seed);
      expect(ratio.wrong.find((w) => w.value === `${ratio.values.b}:${ratio.values.a}`)?.misconception).toBe("F4");
      const fraction = fillTemplate(BANK.find((t) => t.id === "g67-6-ratio-to-fraction")!, seed);
      expect(fraction.wrong.find((w) => w.value === `${fraction.values.g}/${fraction.values.b}`)?.misconception).toBe("F4");
      const greatest = fillTemplate(BANK.find((t) => t.id === "g67-6-greatest-fraction")!, seed);
      const parts = (value: string) => value.split("/").map(Number);
      const numerator = greatest.wrong.filter((w) => w.misconception === "numerator-only");
      const denominator = greatest.wrong.filter((w) => w.misconception === "F1");
      expect(numerator).toHaveLength(1);
      expect(denominator).toHaveLength(1);
      expect(parts(numerator[0].value)[0]).toBe(Math.max(...greatest.choices!.map((c) => parts(c)[0])));
      expect(parts(denominator[0].value)[1]).toBe(Math.max(...greatest.choices!.map((c) => parts(c)[1])));
    }
  });

  it("codes finding a percent of the known part and grouping translated words", () => {
    for (const seed of SEEDS) {
      const whole = fillTemplate(BANK.find((t) => t.id === "g67-6-percent-whole")!, seed);
      expect(whole.wrong.find((w) => Number(w.value) === whole.values.part * whole.values.p / 100)?.misconception)
        .toBe("percent-of-part");
      const words = fillTemplate(BANK.find((t) => t.id === "g67-6-expression-words")!, seed);
      expect(words.wrong.find((w) => w.value.includes("("))?.misconception).toBe("group-translation");
    }
  });

  it("preserves the direction of model-equation and pattern errors", () => {
    const template = (id: string) => BANK.find((t) => t.id === `g67-6-${id}`)!;
    expect(template("balance-box").grades.ON).toBe(2);
    expect(template("evaluate").grades.ON).toBe(5);
    expect(template("figure-pattern").grades.ON).toBe(4);
    for (const seed of SEEDS) {
      const rule = fillTemplate(template("shrinking-rule"), seed);
      expect(rule.wrong.find((w) => w.value.endsWith("− n"))?.misconception).toBe("pattern-unit-step");
      const story = fillTemplate(template("story-equation"), seed);
      expect(story.wrong.find((w) => w.value.includes("÷"))?.misconception).toBe("operation");
      const balance = fillTemplate(template("keep-balance"), seed);
      expect(balance.wrong[0].misconception).toBe("balance-opposite");
      const pattern = fillTemplate(template("figure-pattern"), seed);
      expect(pattern.wrong.find((w) => Number(w.value) === pattern.values.s + pattern.values.k * pattern.values.d)?.misconception)
        .toBe("pattern-step-count");
    }
  });

  it("keeps Ontario one-step checks within 100 and distinguishes area and cubic errors", () => {
    const equation = BANK.find((t) => t.id === "g67-6-equation-check")!;
    expect(equation.grades.ON).toBe(5);
    for (const seed of SEEDS) {
      const q = fillTemplate(equation, seed);
      expect(q.values.a * q.values.x).toBeLessThanOrEqual(100);
      const area = fillTemplate(BANK.find((t) => t.id === "g67-6-parallelogram-area")!, seed);
      expect(area.wrong.find((w) => Number(w.value) === area.values.b * area.values.s)?.misconception).toBe("slant-height");
      const cubic = fillTemplate(BANK.find((t) => t.id === "g67-6-cubic-units")!, seed);
      if (cubic.values.metres) {
        expect(cubic.wrong.find((w) => Number(w.value) === cubic.values.m * 100)?.misconception).toBe("M11");
        expect(cubic.wrong.find((w) => Number(w.value) === cubic.values.m * 10_000)?.misconception).toBe("unit-convert");
      }
    }
  });

  it("checks coordinate movement, theoretical choices and the L-shape area error", () => {
    for (const id of ["plot-point", "translate-point"]) {
      expect(BANK.find((t) => t.id === `g67-6-${id}`)!.grades.ON).toBe(4);
    }
    expect(BANK.find((t) => t.id === "g67-6-l-shape-perimeter")!.grades.SK).toBe(3);
    expect(BANK.find((t) => t.id === "g67-6-l-shape-perimeter")!.grades.MB).toBe(3);
    for (const seed of SEEDS) {
      const move = fillTemplate(BANK.find((t) => t.id === "g67-6-translate-point")!, seed);
      const { x, y, r, d } = move.values;
      expect(move.wrong.find((w) => w.value === `(${x + d}, ${y - r})`)?.misconception).toBe("move-distance-swap");
      const probability = fillTemplate(BANK.find((t) => t.id === "g67-6-theoretical")!, seed);
      expect(probability.choices).toHaveLength(3);
      expect(probability.wrong.filter((w) => w.misconception === "D5")).toHaveLength(1);
      if (probability.values.die) expect(probability.prompt).toContain("a total of");
      const shape = fillTemplate(BANK.find((t) => t.id === "g67-6-l-shape-perimeter")!, seed);
      const { W, H, a, h } = shape.values;
      const area = W * H - (W - a) * h;
      if (area !== Number(shape.answer)) expect(shape.wrong.find((w) => w.misconception === "M2")?.value).toBe(String(area));
    }
  });

  it("uses one reversed-magnitude choice and an equal-negative choice, and names absolute ordering", () => {
    for (const seed of SEEDS) {
      const greatest = fillTemplate(BANK.find((t) => t.id === "g67-7-greatest-integer")!, seed);
      expect(greatest.wrong.filter((w) => w.misconception === "N6")).toHaveLength(1);
      expect(greatest.wrong.find((w) => w.misconception === "negative-equal")?.value).toBe("These numbers are equal");
      const ordered = fillTemplate(BANK.find((t) => t.id === "g67-7-order-integers")!, seed);
      expect(ordered.wrong[1].misconception).toBe("absolute-order");
    }
  });

  it("codes integer operations, money methods, bounds and linear rules by the actual error", () => {
    const template = (id: string) => BANK.find((t) => t.id === `g67-7-${id}`)!;
    expect(template("evaluate-relation").grades.ON).toBe(5);
    for (const seed of SEEDS) {
      expect(fillTemplate(template("multiply-integers"), seed).choices).toHaveLength(3);
      expect(fillTemplate(template("divide-integers"), seed).wrong[2].misconception).toBe("operation");
      expect(fillTemplate(template("times-five"), seed).wrong.every((w) => w.misconception === "method-step")).toBe(true);
      expect(fillTemplate(template("change-several"), seed).wrong[0].misconception).toBe("cost-not-change");
      expect(fillTemplate(template("greatest-mixed-forms"), seed).choices).toHaveLength(3);
      const decimal = fillTemplate(template("decimal-to-fraction"), seed);
      if (decimal.values.h === 5) expect(decimal.wrong[0].value).toBe("0/5");
      expect(fillTemplate(template("decimal-between"), seed).wrong.slice(0, 2).every((w) => w.misconception === "bounds-error")).toBe(true);
      const ratio = fillTemplate(template("ratio-percent"), seed);
      expect(ratio.wrong.every((w) => w.misconception !== "ratio-whole")).toBe(true);
      for (const id of ["sales-tax", "tip"]) expect(fillTemplate(template(id), seed).wrong[1].misconception).toBe("percent-as-amount");
      const tip = fillTemplate(template("tip"), seed);
      if (tip.values.rate === 18) { expect(tip.prompt).toContain("an 18%"); expect(tip.readAloud).toContain("an 18 percent"); }
      expect(fillTemplate(template("evaluate-relation"), seed).wrong[0].misconception).toBe("sub-before-multiply");
      expect(fillTemplate(template("rule-from-table"), seed).wrong[1].misconception).toBe("step-as-addend");
      expect(fillTemplate(template("table-far"), seed).wrong[1].misconception).toBe("step-as-addend");
      expect(fillTemplate(template("figure-expression"), seed).wrong[0].misconception).toBe("step-as-addend");
      expect(fillTemplate(template("story-equation"), seed).wrong[1].misconception).toBe("group-translation");
    }
  });

  it("distinguishes volume operations, quadrant signs, movement distances and percent counts", () => {
    for (const seed of SEEDS) {
      const question = (id: string) => fillTemplate(BANK.find((t) => t.id === `g67-7-${id}`)!, seed);
      expect(question("cylinder-base-area").wrong[0].misconception).toBe("operation");
      expect(question("quadrant").wrong.every((w) => w.misconception !== "transform-sign")).toBe(true);
      expect(question("translate-point").wrong[2].misconception).toBe("move-distance-swap");
      expect(question("circle-graph-amount").wrong[0].misconception).toBe("percent-as-count");
      expect(question("circle-graph-percent").wrong[0].misconception).toBe("count-as-percent");
    }
  });

  it("checks the direction of probability and percent errors and square-array assumptions", () => {
    for (const seed of SEEDS) {
      const question = (id: string) => fillTemplate(BANK.find((t) => t.id === id)!, seed);
      expect(question("g67-7-circle-graph-percent").wrong.every((w) => w.misconception !== "F10")).toBe(true);
      expect(question("g67-7-experimental").wrong.find((w) => w.value === "1/6")?.misconception).toBe("theory-as-data");
      expect(question("g67-8-perfect-square").wrong.every((w) => w.misconception === "square-neighbour")).toBe(true);
      expect(question("g67-8-square-side").wrong[0].misconception).toBe("M2");
      const tiles = question("g67-8-square-tile");
      expect(tiles.prompt).toContain("same size"); expect(tiles.readAloud).toContain("same size");
      expect(tiles.wrong).toHaveLength(1);
    }
  });

  it("codes fraction operations and a distance unit rate without price or whole-part errors", () => {
    for (const seed of SEEDS) {
      const question = (id: string) => fillTemplate(BANK.find((t) => t.id === `g67-8-${id}`)!, seed);
      expect(question("multiply-fractions").wrong[0].misconception).toBe("F2");
      const division = question("divide-fractions");
      expect(division.wrong[1].misconception).toBe("division-reversed");
      const rate = question("unit-rate");
      expect(rate.wrong.map((w) => w.misconception)).toEqual(["operation", "total-for-unit"]);
      expect(Number(rate.wrong[0].value)).toBe(rate.values.speed * rate.values.hours ** 2);
      expect(Number(rate.wrong[1].value)).toBe(rate.values.speed * rate.values.hours);
    }
  });

  it("places the arithmetic story at BC level 6 and checks signed algebra error directions", () => {
    const template = (id: string) => BANK.find((t) => t.id === `g67-8-${id}`)!;
    expect(template("expression-story").grades.BC).toBe(6);
    expect(template("expression-story").strand).toBe("O");
    expect(template("combine-expression").grades.ON).toBe(5);
    for (const seed of SEEDS) {
      for (const id of ["substitute-signed", "large-relation"]) expect(fillTemplate(template(id), seed).wrong[1].misconception).toBe("operation");
      expect(fillTemplate(template("combine-expression"), seed).wrong[1].misconception).toBe("variable-one");
      expect(fillTemplate(template("integer-table"), seed).wrong[1].misconception).toBe("constant-sign");
      expect(fillTemplate(template("inverse-input"), seed).wrong[0].misconception).toBe("sign-rule");
      const story = fillTemplate(template("expression-story"), seed);
      expect(Number(story.answer)).toBe(story.values.c * story.values.n - story.values.n / 2);
    }
  });

  it("distinguishes a sum from a mean and the largest value from a mode", () => {
    for (const seed of SEEDS) {
      const mean = fillTemplate(BANK.find((t) => t.id === "g67-8-mean")!, seed);
      expect(mean.wrong[1].misconception).toBe("sum-for-mean");
      expect(Number(mean.wrong[1].value)).toBeCloseTo(Number(mean.answer) * 5);
      const mode = fillTemplate(BANK.find((t) => t.id === "g67-8-mode")!, seed);
      expect(mode.wrong[1].misconception).toBe("mode-largest");
      expect(Number(mode.wrong[1].value)).toBe(mode.values.n + 8);
    }
  });

  it("states graph scale intervals, Celsius, rate units and labelled event actions", () => {
    for (const seed of SEEDS) {
      const question = (id: string) => fillTemplate(BANK.find((t) => t.id === id)!, seed);
      const graph = question("g67-5-double-bar-graph");
      expect(graph.prompt).toContain("adjacent grid lines"); expect(graph.readAloud).toContain("adjacent grid lines");
      const line = question("g67-6-line-graph");
      if (line.prompt.includes("temperature")) expect(line.readAloud).toContain("degrees Celsius");
      const rate = question("g67-7-draining-pool");
      expect(rate.prompt).toMatch(/(?:litres|units of charge) each minute/); expect(rate.readAloud).toMatch(/(?:litres|units of charge) each minute/);
      const count = question("g67-7-count-outcomes");
      expect(count.prompt).not.toContain("toss or spin");
      if (count.prompt.includes("spinner")) expect(count.prompt).toContain("numbered 1 to");
      const rope = question("g67-8-three-part-ratio");
      expect(rope.prompt.startsWith("A rope ")).toBe(true); expect(rope.readAloud.startsWith("A rope ")).toBe(true);
    }
  });

  it("preserves multiplication and grouping when it speaks a bracketed choice", () => {
    const q = fillTemplate(BANK.find((t) => t.id === "g67-6-expression-words")!, 3);
    const bracketed = q.choices!.find((c) => c.startsWith("4("))!;
    expect(bracketed).toBe("4(n + 8)");
    expect(spokenChoices(q, [bracketed])).toEqual(["4 times open bracket n plus 8 close bracket"]);
  });

  it.each([
    ["g67-8-square-root", "What is the positive square root of 49?", "7"],
    ["g67-8-add-fractions", "2/8 + 2/7 = ?", "15/28"],
    ["g67-8-negative-equation", "6x + 12 = −18. What is x?", "−5"],
    ["g67-8-hypotenuse", "The two sides that meet at the right angle of a right triangle are 18 cm and 24 cm. How long is the longest side, in centimetres?", "30"],
    ["g67-8-mean", "Find the mean of these five values: 3, 13, 11, 5, 5.", "7.4"],
  ])("marks the worked example %s", (id, prompt, answer) => {
    const q = fillTemplate(BANK.find((t) => t.id === id)!, 3);
    expect(q.prompt).toBe(prompt);
    expect(q.answer).toBe(answer);
  });

  it("covers BC levels 5-8 with all five province tags", () => {
    for (const t of BANK) {
      expect(Object.keys(t.grades).sort(), t.id).toEqual([...TAGGED].sort());
      expect(t.grades.BC, t.id).toBeGreaterThanOrEqual(5);
      expect(t.grades.BC, t.id).toBeLessThanOrEqual(8);
      for (const p of TAGGED) {
        const level = t.grades[p as keyof typeof t.grades] as number;
        expect(level, `${t.id} ${p}`).toBeGreaterThanOrEqual(0);
        expect(level, `${t.id} ${p}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("has unique ids, and an id shared with another bank is the same template", () => {
    expect(new Set(BANK.map((t) => t.id)).size).toBe(BANK.length);
    for (const [band, other] of Object.entries(BANKS)) {
      if (band === "6-7") continue;
      for (const t of other) expect(BANK.some((m) => m.id === t.id), `${t.id} is also in bank ${band}`).toBe(false);
    }
  });

  describe.each(BANK.map((t) => [t.id, t] as const))("%s", (_, template) => {
    it("gives a valid question for every seed: coded wrong answers, none equal to the answer", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        const text = `${q.prompt} ${q.readAloud} ${q.answer} ${q.wrong.map((w) => w.value).join(" ")}`;
        expect(text, `seed ${seed}`).not.toMatch(/undefined|NaN|Infinity|null|\[object|e[+-]\d/);
        expect(q.readAloud.length, `seed ${seed}`).toBeGreaterThan(0);
        expect(q.wrong.length, `seed ${seed}`).toBeGreaterThan(0);
        for (const w of q.wrong) expect(MISCONCEPTIONS[w.misconception], `seed ${seed}: ${w.misconception}`).toBeDefined();
        // An expression never breaks across lines on screen.
        for (const shown of [q.prompt, ...(q.choices ?? [])]) expect(shown, `seed ${seed}`).not.toMatch(/\d [+−×÷=] | [+−×÷=] \d/);

        if (q.format === "number") {
          const values = [q.answer, ...q.wrong.map((w) => w.value)];
          for (const v of values) expect(v, `seed ${seed}: the pad cannot type ${v}`).toMatch(TYPEABLE);
          expect(new Set(values.map((v) => Number(v).toFixed(6))).size, `seed ${seed}: ${values}`).toBe(values.length);
        } else {
          expect(q.choices!.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
          expect(q.choices!.length, `seed ${seed}`).toBeLessThanOrEqual(4);
          expect(new Set(q.choices).size, `seed ${seed}: ${q.choices}`).toBe(q.choices!.length);
          expect(new Set(q.choices!.map(valueOfChoice)).size, `seed ${seed}: equivalent choices ${q.choices}`).toBe(q.choices!.length);
          expect(q.choices).toContain(q.answer);
        }
      }
    });

    it("read-aloud text has words, not symbols, and does not list the answer choices", () => {
      for (const seed of SEEDS.slice(0, 100)) {
        const q = fillTemplate(template, seed);
        expect(q.readAloud, `seed ${seed}`).not.toMatch(NOT_SPOKEN);
        if (q.format !== "choice") continue;
        // The screen speaks the choices after the question (#79): read-aloud text that names every choice says them twice.
        const said = (c: string) => [c, c.replace(/−/g, "negative ").replace(/\//g, " over ").replace(/%/g, " percent")]
          .some((form) => q.readAloud.toLowerCase().includes(form.replace(/\u00a0/g, " ").toLowerCase()));
        expect(q.choices!.every(said), `seed ${seed}: ${q.readAloud}`).toBe(false);
      }
    });

    it("speaks each displayed choice without raw mathematics symbols", () => {
      for (const seed of SEEDS.slice(0, 100)) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        for (const said of spokenChoices(q, q.choices ?? [])) {
          expect(said, `seed ${seed}`).not.toMatch(/[=+−×÷<>%$²³√π/()]|\d:\d(?!\d|.*[ap]\.m\.)/);
        }
      }
    });

    it("never pairs 1 with a plural, as in '1 parts'", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        for (const text of [q.prompt, q.readAloud, ...(q.choices ?? [])]) {
          expect(text, `seed ${seed}`).not.toMatch(/(^|[^\d.,/])1 (?:parts|units|centimetres|metres|litres|hours|minutes|dollars|cents|pages|cups|students)\b/);
        }
      }
    });

    it("the same seed gives the same question, and different seeds give at least 6 different questions", () => {
      expect(fillTemplate(template, 5)).toEqual(fillTemplate(template, 5));
      // Same key as the session uses: the prompt and the set of choices.
      const variants = new Set(SEEDS.map((seed) => {
        const q = fillTemplate(template, seed);
        return `${q.prompt} ${[...(q.choices ?? [])].sort()}`;
      }));
      expect(variants.size).toBeGreaterThanOrEqual(6);
    });
  });

  it("the public view of a question never carries the answer", () => {
    for (const template of BANK) {
      const view = JSON.stringify(toPublicQuestion(fillTemplate(template, 3)));
      expect(view).not.toMatch(/"answer"|"wrong"|misconception/);
    }
  });
});
