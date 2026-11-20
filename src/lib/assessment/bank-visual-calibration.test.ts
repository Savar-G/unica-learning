import { describe, expect, it } from "vitest";
import {
  createAdaptiveSession, fillTemplate, lockAdaptiveBlock, restoreSession, storedTest, submitAnswer,
  templateSkills, toPublicQuestion, type Question, type Session,
} from "@/lib/assessment";
import { adaptiveBank, ASSESSMENT_TEMPLATES } from "./bank";

const bc = adaptiveBank("BC");
const catalogue = new Map(ASSESSMENT_TEMPLATES.map((t) => [t.id, t]));

function draw(id: string, seed = 1) {
  const template = catalogue.get(id);
  if (!template) throw new Error(`Missing assessment template ${id}`);
  return fillTemplate(template, seed);
}

function mark(question: Question, response: string) {
  const session: Session = {
    profile: { province: "BC", grade: 8 }, seed: 1, stage1: [question], stage2: { up: [], stay: [], down: [] },
    route: null, answers: [],
  };
  const saved = JSON.parse(JSON.stringify(storedTest(session)));
  return restoreSession(saved, [{ questionId: question.id, response, timeMs: 15000 }]).answers[0].correct;
}

describe("assessment bank visuals", () => {
  it.each([
    ["k-turned-shape-figure", 0, "polygon"],
    ["1-count-shape-corners", 1, "polygon"],
    ["2-read-ruler-figure", 2, "ruler"],
    ["3-fraction-number-line-figure", 3, "number-line"],
    ["4-read-clock-figure", 4, "clock"],
    ["4-symmetry-figure", 4, "polygon"],
    ["5-scaled-double-bars-figure", 5, "grouped-bars"],
    ["6-compare-line-graph-figure", 6, "line-plot"],
    ["7-circle-graph-figure", 7, "circle-graph"],
    ["7-read-coordinate-grid", 7, "coordinate-grid"],
    ["8-cube-net", 8, "net"],
    ["9-truncated-bar-graph-figure", 9, "truncated-bars"],
  ] as const)("serves %s at grade %i with a %s", (id, grade, kind) => {
    expect(bc.some((t) => t.id === id)).toBe(true);
    const question = draw(id);
    const shown = toPublicQuestion(question);
    expect(shown).toMatchObject({ level: grade, figure: { kind } });
    expect(shown).not.toHaveProperty("answer");
    expect(shown).not.toHaveProperty("numberGrading");
    expect(draw(id)).toEqual(question);
  });

  it("fills uncovered or thin standards with mapped skills at the intended grade", () => {
    const expected = [
      ["1.8", 1, 2], ["3.4", 3, 1], ["4.7", 4, 1], ["4.8", 4, 1], ["5.8", 5, 1],
      ["6.17", 6, 2], ["7.9", 7, 2], ["8.11", 8, 1],
    ] as const;
    for (const [standard, level, minimum] of expected) {
      const items = bc.filter((t) => t.standard === standard && t.grades.BC === level);
      expect(items.length, standard).toBeGreaterThanOrEqual(minimum);
      for (const t of items) expect(templateSkills(t.id)[0]?.standard).toBe(standard);
    }
    const ontario = adaptiveBank("ON");
    expect(ontario.find((t) => t.id === "7-cylinder-volume-by-hand")?.grades.ON).toBe(7);
    expect(ontario.find((t) => t.id === "4-read-clock-figure")?.grades.ON).toBe(3);
    expect(ontario.find((t) => t.id === "2-ruler-length")).toBeDefined();
    expect(ontario.find((t) => t.id === "8-cube-net")).toBeUndefined();
  });

  it("draws figure values that agree with the key over 100 seeds", () => {
    const dayPairs = ["Mon to Tue", "Tue to Wed", "Wed to Thu", "Thu to Fri"];
    for (let seed = 0; seed < 100; seed++) {
      const ruler = draw("2-read-ruler-figure", seed);
      if (ruler.figure?.kind !== "ruler") throw new Error("Expected a ruler");
      expect(ruler.answer).toBe(String(ruler.figure.end));
      const clock = draw("4-read-clock-figure", seed);
      if (clock.figure?.kind !== "clock") throw new Error("Expected a clock");
      expect(clock.answer).toBe(`${clock.figure.hour}:${String(clock.figure.minute).padStart(2, "0")}`);

      const graph = draw("5-scaled-double-bars-figure", seed);
      if (graph.figure?.kind !== "grouped-bars") throw new Error("Expected grouped bars");
      const { counts: [a, b], scale } = graph.figure;
      expect(Number(graph.answer)).toBe(Math.abs(a[graph.values.day] - b[graph.values.day]) * scale);

      const plant = draw("6-compare-line-graph-figure", seed);
      if (plant.figure?.kind !== "line-plot") throw new Error("Expected a line graph");
      const { heights } = plant.figure;
      const increases = heights.slice(1).map((n, i) => n - heights[i]);
      expect(plant.answer).toBe(dayPairs[increases.indexOf(Math.max(...increases))]);

      const relation = draw("8-relation-from-grid", seed);
      if (relation.figure?.kind !== "coordinate-grid") throw new Error("Expected a grid");
      for (const [x, y] of relation.figure.points) expect(y).toBe(relation.values.m * x + relation.values.b);
      const net = draw("8-cube-net", seed);
      if (net.figure?.kind !== "net") throw new Error("Expected a net");
      expect(new Set(net.figure.cells.map(String)).size).toBe(6);
      expect(net.answer).toBe(net.figure.cells.some(([, y]) => y === 2) ? "Yes" : "No");
    }
  });

  it("replays a stored visual pool and keeps the previous IDs, figures and next block", () => {
    const initial = createAdaptiveSession({ grade: 8, province: "BC" }, 7919);
    expect(initial.adaptive?.pool.some((q) => q.templateId === "8-cube-net" && q.figure?.kind === "net")).toBe(true);
    const legacyBars = draw("3-bar-graph-more"), previousCircle = draw("g67-7-circle-area-revised");
    if (!initial.adaptive) throw new Error("Expected an adaptive test");
    const pool = [...initial.adaptive.pool, legacyBars, previousCircle];
    const session = { ...initial, adaptive: { ...initial.adaptive, pool } };
    const block = session.adaptive.blocks[0];
    const answered = block.questions.reduce((next: Session, q) => submitAnswer(next, {
      questionId: q.id, response: q.answer, timeMs: 15000,
    }), session);
    const saved = JSON.parse(JSON.stringify(storedTest(session)));
    const restored = restoreSession(saved, answered.answers);
    expect(restored.adaptive?.pool).toEqual(pool);
    expect(lockAdaptiveBlock(restored)).toEqual(lockAdaptiveBlock(answered));
    expect(legacyBars.figure?.kind).toBe("bars");
    expect(previousCircle.figure).toBeUndefined();
    expect(mark(previousCircle, previousCircle.numberGrading!.rounded![1])).toBe(true);
  });
});

describe("hand arithmetic and frozen rounding", () => {
  it.each(["7-circle-circumference-by-hand", "7-circle-area-by-hand", "7-cylinder-volume-by-hand", "8-cylinder-volume-by-hand"])(
    "uses small products and accepts the stated rounding for %s", (id) => {
      for (let seed = 0; seed < 32; seed++) {
        const q = draw(id, seed);
        const figure = q.figure;
        const multiple = figure?.kind === "cylinder" ? figure.radius ** 2 * figure.height
          : figure?.kind === "circle" ? id.includes("area") ? figure.length ** 2 : 2 * q.values.r : 0;
        expect(multiple).toBeGreaterThan(0);
        expect(multiple).toBeLessThanOrEqual(50);
        expect(q.prompt).toContain("round to the nearest tenth.");
        const exact = 314 * multiple / 100;
        const tenth = Math.round(314 * multiple / 10) / 10;
        expect(Number(q.answer)).toBe(exact);
        expect(mark(q, String(exact))).toBe(true);
        expect(mark(q, String(tenth))).toBe(true);
        expect(mark(q, String(tenth + 0.1))).toBe(false);
        if (![exact, tenth].includes(Math.round(exact))) expect(mark(q, String(Math.round(exact)))).toBe(false);
      }
    },
  );

  it("keeps the fraction conversion and the Pythagorean calculation short", () => {
    for (let seed = 0; seed < 64; seed++) {
      const fraction = draw("7-fraction-to-decimal-by-hand", seed);
      expect(100 % fraction.values.d).toBe(0);
      expect(Number(fraction.answer)).toBe(fraction.values.n / fraction.values.d);
      for (const id of ["8-hypotenuse-by-hand", "8-missing-leg-by-hand"]) {
        const triangle = draw(id, seed);
        const { base, otherLeg, c } = triangle.values;
        expect(c).toBeLessThan(20);
        expect(base ** 2 + otherLeg ** 2).toBe(c ** 2);
        expect(mark(triangle, String(id.includes("hypotenuse") ? c : otherLeg))).toBe(true);
      }
    }
  });
});
