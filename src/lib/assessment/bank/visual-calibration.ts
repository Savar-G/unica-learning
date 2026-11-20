// Pass 2 uses new IDs in the adaptive pool. Both prior catalogues still describe stored questions.
import { BAR_CATEGORIES, LINE_DAYS, type DrawnFigure, type Point } from "../figure-data";
import type { MisconceptionId } from "../misconceptions";
import type { Difficulty, Filled, Level, Strand, Template, Wording } from "../types";
import { draw, wrong } from "./kit";

type QuestionTemplate = Template & { difficulty: Difficulty; wording: Wording; skill: string };
type Revision = {
  source: string; id: string; skill: string; difficulty: Difficulty; fill: (rng: Parameters<Template["fill"]>[0], previous: Template["fill"]) => Filled;
  wording?: Wording;
};

function answer(prompt: string, key: number | string, values: Filled["values"], wrongs: Filled["wrong"], figure?: Filled["figure"]): Filled {
  return { prompt, readAloud: prompt, values, answer: String(key), wrong: wrongs, figure };
}

function rounded(question: Filled, hundredths: number): Filled {
  const instruction = " Give the exact answer, or round to the nearest tenth.";
  const tenth = String(Math.round(hundredths / 10) / 10);
  return { ...question, prompt: question.prompt + instruction, readAloud: question.readAloud + instruction,
    roundedAnswers: [tenth], wrong: question.wrong.filter((w) => Number(w.value) !== Number(tenth) && Number(w.value) !== Number(question.answer)) };
}

function addition(id: string, grade: 3 | 4 | 5, skill: string, scale: number): QuestionTemplate {
  return {
    id, grades: { BC: grade }, skill, standard: skill.split("-")[0], difficulty: "easy",
    strand: "O", format: "number", whiteboard: false, wording: "bare-number",
    fill(rng) {
      const a = rng.int(6, 9), b = rng.int(6, 9);
      return { ...answer(`${a * scale} + ${b * scale} = ?`, (a + b) * scale, { a, b, scale },
        [wrong((a + b - 1) * scale, "one-to-one")]), readAloud: `What is ${a * scale} plus ${b * scale}?` };
    },
  };
}

export const VISUAL_ADDITIONS: readonly QuestionTemplate[] = [
  {
    id: "k-turned-shape-figure", grades: { BC: 0 }, strand: "MG", standard: "K8", skill: "K8-same-shape",
    difficulty: "easy", format: "choice", whiteboard: false, wording: "bare-number",
    fill(rng) {
      const shape = rng.pick(["triangle", "rotated square", "rectangle"] as const);
      const key = shape === "rotated square" ? "Square" : shape === "triangle" ? "Triangle" : "Rectangle";
      // A square also fits the definition of a rectangle, so those two names cannot both be choices for a square.
      const names = ["Square", "Triangle", shape === "rectangle" ? "Rectangle" : "Circle"];
      return answer("What shape is this?", key, {}, names.filter((name) => name !== key).map((name) => wrong(name, "shape-name")),
        { kind: "polygon", shape });
    },
  },
  {
    id: "1-count-shape-corners", grades: { BC: 1 }, strand: "MG", standard: "1.8", skill: "1.8-count-sides",
    difficulty: "easy", format: "number", whiteboard: false, wording: "bare-number",
    fill(rng) {
      const shape = rng.pick(["triangle", "rotated square", "rectangle"] as const);
      const corners = shape === "triangle" ? 3 : 4;
      return answer("How many corners does this shape have?", corners, {}, [wrong(corners - 1, "one-to-one")], { kind: "polygon", shape });
    },
  },
  addition("3-addition-fact-to-20", 3, "3.4-recall-addition-20", 1),
  addition("4-addition-fact-to-20", 4, "4.7-addition-facts-fluency", 1),
  addition("5-scale-addition-fact", 5, "5.8-extend-facts", 100),
  {
    id: "4-related-division-fact", grades: { BC: 4 }, strand: "O", standard: "4.8", skill: "4.8-division-facts",
    difficulty: "easy", format: "number", whiteboard: false, wording: "bare-number",
    fill(rng) {
      const factor = rng.pick([2, 5, 10]), quotient = rng.int(2, 9);
      return { ...answer(`${factor * quotient} ÷ ${factor} = ?`, quotient, { factor, quotient },
        [wrong(factor * quotient + factor, "operation")]), readAloud: `What is ${factor * quotient} divided by ${factor}?` };
    },
  },
  {
    id: "6-read-plant-height", grades: { BC: 6 }, strand: "DP", standard: "6.17", skill: "6.17-read-line-graph",
    difficulty: "easy", format: "number", whiteboard: false, wording: "bare-number",
    fill(rng) {
      const heights = plantHeights(rng.pick([2, 4]), rng.shuffle([2, 4, 2, 2]));
      const day = rng.int(1, 3);
      return answer(`How tall was the plant on ${DAYS[day]}, in centimetres?`, heights[day], { day },
        [wrong(heights[day - 1], "graph-value")], { kind: "line-plot", heights });
    },
  },
  {
    id: "7-read-coordinate-grid", grades: { BC: 7 }, strand: "MG", standard: "7.9", skill: "7.9-plot-integer-points",
    difficulty: "medium", format: "choice", whiteboard: false, wording: "bare-number",
    fill(rng) {
      const [x, y] = draw(rng, (r) => [r.int(-4, 4), r.int(-4, 4)], ([x, y]) => x !== 0 && y !== 0 && x !== y);
      const pair = (a: number, b: number) => `(${a}, ${b})`;
      return answer("What are the coordinates of the dot?", pair(x, y), { x, y },
        [wrong(pair(y, x), "coordinate-swap"), wrong(pair(-x, y), "opposite-sign"), wrong(pair(x, -y), "opposite-sign")],
        { kind: "coordinate-grid", points: [[x, y]] });
    },
  },
  {
    id: "8-relation-from-grid", grades: { BC: 8 }, strand: "A", standard: "8.6", skill: "8.6-relation-from-graph",
    difficulty: "medium", format: "choice", whiteboard: true, wording: "bare-number",
    fill(rng) {
      const m = rng.pick([1, 2, 3]), b = rng.pick([-2, -1, 1, 2]);
      const rule = (slope: number, intercept: number) => `y = ${slope === 1 ? "" : slope}x${intercept < 0 ? ` − ${-intercept}` : intercept > 0 ? ` + ${intercept}` : ""}`;
      return answer("Which rule fits all the points on the graph?", rule(m, b), { m, b },
        [wrong(rule(m, -b), "constant-sign"), wrong(rule(m, 0), "A5"), wrong(rule(m + 1, b), "rule-swap")],
        { kind: "coordinate-grid", points: [-1, 0, 1].map((x) => [x, m * x + b]) });
    },
  },
  {
    id: "8-cube-net", grades: { BC: 8 }, strand: "MG", standard: "8.11", skill: "8.11-nets",
    difficulty: "medium", format: "choice", whiteboard: false, wording: "bare-number",
    fill(rng) {
      const folds = rng.int(0, 1) === 1;
      const [upper, lower] = rng.shuffle([0, 1, 2, 3]).slice(0, 2);
      const cells: Point[] = [[0, 1], [1, 1], [2, 1], [3, 1], [upper, 0], [lower, folds ? 2 : 0]];
      return answer("Can these six squares fold into a cube without overlapping?", folds ? "Yes" : "No", {},
        [wrong(folds ? "No" : "Yes", "shape-name")], { kind: "net", cells });
    },
  },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
const plantHeights = (start: number, changes: number[]) => changes.reduce((all, increase) => [...all, all[all.length - 1] + increase], [start]);

function circleCalculation(area: boolean): Template["fill"] {
  return (rng) => {
    const r = rng.pick([2, 3, 4, 5]);
    const useDiameter = !area && rng.int(0, 1) === 1;
    const multiple = area ? r * r : 2 * r;
    const length = useDiameter ? 2 * r : r;
    const measurement = useDiameter ? "diameter" : "radius";
    const quantity = area ? "area, in square centimetres" : "circumference, in centimetres";
    const prompt = `Use 3.14 for π. What is the circle's ${quantity}?`;
    const hundredths = 314 * multiple;
    const question = { ...answer(prompt, hundredths / 100, { r, length },
      [wrong(314 * (area ? 2 * r : r) / 100, "M10")], { kind: "circle", length, measurement }),
      readAloud: `The ${measurement} is ${length} centimetres. ${prompt.replace("π", "pi")}` };
    return rounded(question, hundredths);
  };
}

const cylinderCalculation: Template["fill"] = (rng) => {
  const [radius, height] = rng.pick([[2, 3], [2, 4], [2, 5], [3, 2], [3, 3], [3, 4], [5, 2]]);
  const hundredths = 314 * radius * radius * height;
  const prompt = "Use 3.14 for π. What is the volume of the cylinder, in cubic centimetres?";
  return rounded({ ...answer(prompt, hundredths / 100, { radius, height },
    [wrong(314 * radius ** 2 / 100, "one-part"), wrong(314 * (2 * radius) ** 2 * height / 100, "M10")],
    { kind: "cylinder", radius, height }),
    readAloud: `The cylinder has a radius of ${radius} centimetres and a height of ${height} centimetres. ${prompt.replace("π", "pi")}` }, hundredths);
};

function rightTriangle(findLeg: boolean): Template["fill"] {
  return (rng) => {
    const [a, b, c] = rng.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17]]);
    const [base, height] = rng.int(0, 1) === 1 ? [a, b] : [b, a];
    const key = findLeg ? height : c;
    const prompt = "How long is the missing side, in centimetres?";
    const given = findLeg ? `The hypotenuse is ${c} centimetres and one leg is ${base} centimetres.`
      : `The legs are ${base} and ${height} centimetres long.`;
    return { ...answer(prompt, key, { base, otherLeg: height, c },
      [wrong(findLeg ? c - base : base + height, "pythagoras-add"), wrong(key * key, "pythagoras-no-root")],
      { kind: "right-triangle", base, height: findLeg ? null : height, hypotenuse: findLeg ? c : null }),
      readAloud: `This is a right triangle. ${given} ${prompt}` };
  };
}

const VISUAL_REVISIONS: readonly Revision[] = [
  {
    source: "2-ruler-length-revised", id: "2-read-ruler-figure", skill: "2.8-ruler-from-zero", difficulty: "easy", wording: "bare-number",
    fill(rng) {
      const end = rng.int(3, 11);
      const prompt = "How long is the pencil, in centimetres?";
      return answer(prompt, end, { end }, [wrong(end + 1, "one-to-one")], { kind: "ruler", end });
    },
  },
  ...([
    ["g35-3-fraction-number-line", "3-fraction-number-line-figure", "3.2-fraction-number-line"],
    ["g35-4-decimal-number-line", "4-decimal-number-line-figure", "4.2-tenths"],
  ] as const).map(([source, id, skill]): Revision => ({
    source, id, skill, difficulty: "medium",
    fill(rng, previous) {
      const old = previous(rng);
      const intervals = old.values.d ?? 10, mark = old.values.n;
      const prompt = source === "g35-3-fraction-number-line" ? "What fraction is at the dot?" : "Which decimal is at the dot?";
      return { ...old, prompt, readAloud: prompt, figure: { kind: "number-line", intervals, mark } };
    },
  })),
  {
    source: "g35-4-read-clock", id: "4-read-clock-figure", skill: "4.12-read-analog", difficulty: "medium",
    fill(rng, previous) {
      const old = previous(rng);
      const { h, k } = old.values;
      const prompt = "What time does this clock show?";
      return { ...old, prompt, readAloud: prompt, figure: { kind: "clock", hour: h, minute: 5 * k } };
    },
  },
  {
    source: "g35-4-symmetry", id: "4-symmetry-figure", skill: "4.15-line-symmetry", difficulty: "hard",
    fill(rng, previous) {
      const old = previous(rng);
      const shapes: Record<number, Extract<DrawnFigure, { kind: "polygon" }>["shape"]> = {
        1: "isosceles triangle", 2: "rectangle", 3: "triangle", 4: "square", 5: "pentagon", 6: "hexagon",
      };
      const prompt = "How many lines of symmetry does this shape have?";
      return { ...old, prompt, readAloud: prompt,
        figure: { kind: "polygon", shape: shapes[old.values.lines] } };
    },
  },
  {
    source: "g67-5-double-bar-graph", id: "5-scaled-double-bars-figure", skill: "5.17-double-bar-graph", difficulty: "medium",
    fill(rng) {
      const scale = rng.pick([2, 5, 10, 20]), [a, b, c, d] = rng.shuffle([1, 2, 3, 4, 5, 6]).slice(0, 4);
      const day = rng.int(0, 1), first = day === 0 ? a : b, second = day === 0 ? c : d;
      const larger = BAR_CATEGORIES[first > second ? 0 : 1], smaller = BAR_CATEGORIES[first > second ? 1 : 0];
      const dayName = day === 0 ? "Monday" : "Tuesday";
      const prompt = `How many more books did ${larger} read than ${smaller} on ${dayName}?`;
      const difference = Math.abs(first - second);
      return answer(prompt, difference * scale, { scale, a, b, c, d, day }, [wrong(difference, "D1")],
        { kind: "grouped-bars", scale, counts: [[a, b], [c, d]] });
    },
  },
  {
    source: "g67-6-line-graph", id: "6-compare-line-graph-figure", skill: "6.17-read-line-graph", difficulty: "medium",
    fill(rng) {
      const changes = rng.shuffle([2, 4, 6, 8]), start = rng.pick([2, 4, 6]);
      const heights = plantHeights(start, changes);
      const periods = LINE_DAYS.slice(0, -1).map((day, i) => `${day} to ${LINE_DAYS[i + 1]}`);
      const best = changes.indexOf(8);
      const prompt = "When did the plant grow the most?";
      return { ...answer(prompt, periods[best], { best }, periods.flatMap((period, i) => i === best ? [] :
        [wrong(period, i === changes.indexOf(2) ? "more-less" : "change-order")]), { kind: "line-plot", heights }),
        say: Object.fromEntries(periods.map((period, i) => [period, `${DAYS[i]} to ${DAYS[i + 1]}`])) };
    },
  },
  {
    source: "g67-7-circle-graph-amount", id: "7-circle-graph-figure", skill: "7.11-read-circle-graph", difficulty: "medium",
    fill(rng) {
      const percent = rng.pick([10, 20, 25, 40, 50, 75]), total = rng.pick([40, 80, 120, 200]);
      const prompt = `The graph shows how ${total} students get to school. How many walk?`;
      const count = total * percent / 100;
      return answer(prompt, count, { total, percent },
        [wrong(total - count, "one-part"), wrong(percent, "percent-as-count")].filter((w) => Number(w.value) !== count),
        { kind: "circle-graph", percent });
    },
  },
  {
    source: "g67-9-misleading-graph", id: "9-truncated-bar-graph-figure", skill: "9.7-misleading-stats", difficulty: "medium",
    fill(rng) {
      const start = rng.int(8, 18) * 5, first = start + 1, second = first + rng.int(2, 4);
      const prompt = "What makes the difference in votes look so large?";
      return answer(prompt, "The axis starts above zero", { start, first, second },
        [wrong("The bars are too wide", "graph-misread"), wrong("The labels are too small", "graph-misread")],
        { kind: "truncated-bars", start, first, second });
    },
  },
  { source: "g67-7-circumference-revised", id: "7-circle-circumference-by-hand", skill: "7.7-circumference", difficulty: "medium", fill: circleCalculation(false) },
  { source: "g67-7-circle-area-revised", id: "7-circle-area-by-hand", skill: "7.7-area", difficulty: "hard", fill: circleCalculation(true) },
  { source: "g67-7-cylinder-volume-revised", id: "7-cylinder-volume-by-hand", skill: "7.8-cylinder-volume", difficulty: "hard", fill: cylinderCalculation },
  { source: "g67-8-cylinder-volume-revised", id: "8-cylinder-volume-by-hand", skill: "8.9-volume-prisms", difficulty: "hard", fill: cylinderCalculation },
  { source: "g67-8-hypotenuse", id: "8-hypotenuse-by-hand", skill: "8.10-hypotenuse", difficulty: "hard", fill: rightTriangle(false) },
  { source: "g67-8-missing-leg", id: "8-missing-leg-by-hand", skill: "8.10-leg", difficulty: "hard", fill: rightTriangle(true) },
  {
    source: "g67-8-right-triangle-check", id: "8-check-right-triangle-by-hand", skill: "8.10-is-right-triangle", difficulty: "medium",
    fill(rng) {
      const [a, b, c] = rng.pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15]]);
      const sides = (x: number, y: number, z: number) => `${x} cm, ${y} cm, ${z} cm`;
      return answer("Which side lengths make a right triangle?", sides(a, b, c), { a, b, c },
        [wrong(sides(a, b, c + 1), "pythagoras-near"), wrong(sides(a + 1, b, c), "pythagoras-near"),
          wrong(sides(a, b, a + b), "pythagoras-add")]);
    },
  },
  {
    source: "g67-7-write-decimal", id: "7-fraction-to-decimal-by-hand", skill: "7.4-fraction-to-decimal", difficulty: "hard",
    fill(rng) {
      const d = rng.pick([5, 20, 25]), n = rng.int(1, d - 1);
      const prompt = `Write ${n}/${d} as a decimal.`;
      return { ...answer(prompt, (n * (100 / d)) / 100, { n, d },
        [wrong(`0.${n}${d}`, "F7"), wrong(`${n}.${d}`, "F7")].filter((w) => Number(w.value) !== n / d)),
        readAloud: `Write ${n} over ${d} as a decimal.` };
    },
  },
  {
    source: "g67-7-diameter-from-circumference", id: "7-diameter-by-hand", skill: "7.7-diameter-from-circumference", difficulty: "hard",
    fill(rng) {
      const d = rng.pick([2, 3, 4, 5, 10]), circumference = 314 * d / 100;
      const prompt = `A circle has a circumference of ${circumference} cm. Use 3.14 for π. What is its diameter, in centimetres?`;
      return { ...answer(prompt, d, { d }, [wrong(d / 2, "M10"), wrong(2 * d, "M10")]),
        readAloud: prompt.replace(" cm.", " centimetres.").replace("π", "pi") };
    },
  },
  {
    source: "g67-8-percent-change", id: "8-percent-change-by-hand", skill: "8.3-percent-change", difficulty: "hard",
    fill(rng) {
      const [price, percent] = rng.pick([[200, 0.5], [400, 2.5], [800, 2.5], [200, 7.5], [400, 7.5], [80, 12.5], [240, 12.5]]);
      const rise = rng.int(0, 1) === 1, direction = rise ? 1 : -1;
      const change = price * percent / 100;
      const prompt = `A bike costs $${price}. Its price goes ${rise ? "up" : "down"} by ${percent}%. What is the new price, in dollars?`;
      return { ...answer(prompt, price + direction * change, { price, percent, direction },
        [wrong(change, rise ? "amount-not-total" : "discount-amount"), wrong(price - direction * change, "operation")]),
        readAloud: prompt.replace(`$${price}`, `${price} dollars`).replace("%", " percent") };
    },
  },
];

export function visualRevisions(previous: readonly (Template & { wording: Wording })[]) {
  const byId = new Map(previous.map((t) => [t.id, t]));
  return new Map(VISUAL_REVISIONS.map(({ source, id, skill, difficulty, fill, wording }) => {
    const original = byId.get(source);
    if (!original) throw new Error(`Missing assessment template ${source}`);
    const template: QuestionTemplate = {
      ...original, id, skill, difficulty, wording: wording ?? original.wording,
      standard: skill.split("-")[0], fill: (rng) => fill(rng, original.fill),
    };
    return [source, template];
  }));
}
