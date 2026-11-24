import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Answer } from "../contract";
import { pick } from "../hash";
import {
  addShapeFingerprints,
  computeShapeFingerprint,
  type ShapeFingerprints,
} from "../testing/shape-fingerprints";
import committedFingerprints from "../testing/shape-fingerprints.json";
import {
  SHAPE_CHECK_NAMES,
  checkShapeRegistry,
  formatShapeTimings,
  printedRowsFor,
  runAllShapeHarnesses,
  runShapeHarness,
  type AllShapesReport,
  type ShapeHarnessSpec,
} from "../testing/shape-harness";
import { SHAPE_SPECS } from "../testing/shape-registrations";
import { SHAPES, shapeLibrary, type Item, type Shape } from "./index";
import { isRecord, readRange, type Range } from "./shape";

// ---------------------------------------------------------------------------
// 1. Production registry: every shape in SHAPES runs through the one harness.
// ---------------------------------------------------------------------------

describe("registered workbook shapes", () => {
  let suite: AllShapesReport | null = null;
  const getSuite = (): AllShapesReport => {
    if (!suite) {
      suite = runAllShapeHarnesses(SHAPES, SHAPE_SPECS, {
        fingerprints: committedFingerprints as ShapeFingerprints,
      });
    }
    return suite;
  };

  afterAll(() => {
    if (suite) console.info(`[shape-harness] ${formatShapeTimings(suite.reports)} (total ${suite.totalDurationMs}ms)`);
  });

  it("matches SHAPES and SHAPE_SPECS one-to-one with no duplicates", () => {
    expect(getSuite().registryProblems).toEqual([]);
  });

  it("reports timing per shape apart from correctness", () => {
    const reports = getSuite().reports;
    expect(reports).toHaveLength(SHAPES.size);
    for (const report of reports) {
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(report.durationMs)).toBe(true);
    }
  });

  for (const shape of SHAPES.values()) {
    describe(`${shape.id} (v${shape.version})`, () => {
      for (const check of SHAPE_CHECK_NAMES) {
        it(`passes ${check}`, () => {
          const report = getSuite().reports.find((r) => r.shape === shape.id);
          expect(report, `missing report for ${shape.id}`).toBeDefined();
          const result = report?.checks.find((c) => c.check === check);
          expect(result?.ok, result?.message).toBe(true);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Invented test-only shape used to prove the harness catches every fault.
// ---------------------------------------------------------------------------

interface AddLimits { a: Range; b: Range; carry: Range }
interface AddQuestion { a: number; b: number }

const ADD_BOUNDS = { a: { min: 1, max: 9 }, b: { min: 1, max: 9 }, carry: { min: 0, max: 1 } };

function addQuestions(l: AddLimits): AddQuestion[] {
  const out: AddQuestion[] = [];
  for (let a = l.a.min; a <= l.a.max; a++) {
    for (let b = l.b.min; b <= l.b.max; b++) {
      const carry = a + b >= 10 ? 1 : 0;
      if (carry >= l.carry.min && carry <= l.carry.max) out.push({ a, b });
    }
  }
  return out;
}

const addAnswer = ({ a, b }: AddQuestion): Answer => ({ kind: "whole-number", value: String(a + b) });
const addItem = (q: AddQuestion): Item<AddQuestion> => ({ question: q, answer: addAnswer(q) });

function makeTestAddShape(overrides: Partial<Shape<AddLimits, AddQuestion>> = {}): Shape<AddLimits, AddQuestion> {
  return {
    id: "test.add",
    version: 1,
    answerKind: "whole-number",
    readLimits(raw) {
      const bad = (problem: string) => ({ ok: false as const, problem });
      if (!isRecord(raw)) return bad("the limits must be an object");
      const unknown = Object.keys(raw).find((k) => k !== "a" && k !== "b" && k !== "carry");
      if (unknown !== undefined) return bad(`unknown limit "${unknown}"`);
      const a = readRange(raw, "a", ADD_BOUNDS.a);
      if (typeof a === "string") return bad(a);
      const b = readRange(raw, "b", ADD_BOUNDS.b);
      if (typeof b === "string") return bad(b);
      const carry = readRange(raw, "carry", ADD_BOUNDS.carry);
      if (typeof carry === "string") return bad(carry);
      const limits: AddLimits = { a, b, carry };
      return addQuestions(limits).length > 0 ? { ok: true, limits } : bad("no question meets these limits");
    },
    generate(limits, seed) {
      const all = addQuestions(limits);
      return addItem(all[pick(seed, all.length)]);
    },
    answer: addAnswer,
    solveAgain(rows) {
      const [top, low, ...more] = rows;
      if (more.length > 0 || !/^[1-9]$/.test(top ?? "") || !/^\+[1-9]$/.test(low ?? "")) return null;
      const a = Number(top);
      const b = Number(low.slice(1));
      let total = a;
      for (let i = 0; i < b; i++) total += 1;
      return { question: { a, b }, answer: { kind: "whole-number", value: String(total) } };
    },
    steps({ a, b }) {
      return [`Start at ${a}, count up ${b}`, String(a + b)];
    },
    difficulty({ a, b }) {
      return (a + b >= 10 ? 100 : 0) + a + b;
    },
    difficultyRange(limits) {
      const scores = addQuestions(limits).map((q) => (q.a + q.b >= 10 ? 100 : 0) + q.a + q.b);
      return { easiest: Math.min(...scores), hardest: Math.max(...scores) };
    },
    worstCase(limits) {
      return addItem(addQuestions(limits).reduce((w, q) => (q.a + q.b > w.a + w.b ? q : w)));
    },
    count: (limits) => addQuestions(limits).length,
    face: ({ a, b }) => ({ kind: "column", top: String(a), sign: "+", bottom: String(b) }),
    ...overrides,
  };
}

const rangeArb = (min: number, max: number) =>
  fc.tuple(fc.integer({ min, max }), fc.integer({ min, max })).map(([x, y]) => ({ min: Math.min(x, y), max: Math.max(x, y) }));

function independentAddInside(q: AddQuestion, l: AddLimits): boolean {
  const sum = q.a + q.b;
  const carry = sum >= 10 ? 1 : 0;
  return q.a >= l.a.min && q.a <= l.a.max && q.b >= l.b.min && q.b <= l.b.max && carry >= l.carry.min && carry <= l.carry.max;
}

function independentAddEnumerate(l: AddLimits): AddQuestion[] {
  const out: AddQuestion[] = [];
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) if (independentAddInside({ a, b }, l)) out.push({ a, b });
  return out;
}

const anyAddLimits: fc.Arbitrary<AddLimits> = fc.record({
  a: rangeArb(1, 9),
  b: rangeArb(1, 9),
  carry: rangeArb(0, 1),
});

const SMALL_ADD: AddLimits = { a: { min: 1, max: 2 }, b: { min: 1, max: 3 }, carry: { min: 0, max: 0 } };
const CARRY_ADD: AddLimits = { a: { min: 5, max: 9 }, b: { min: 5, max: 9 }, carry: { min: 1, max: 1 } };

function makeTestAddSpec(overrides: Partial<ShapeHarnessSpec<AddLimits, AddQuestion>> = {}): ShapeHarnessSpec<AddLimits, AddQuestion> {
  return {
    id: "test.add",
    arbitraryLimits: anyAddLimits.filter((l) => independentAddEnumerate(l).length > 0),
    anyLimits: anyAddLimits,
    widenLimits: (one, other) => ({
      a: { min: Math.min(one.a.min, other.a.min), max: Math.max(one.a.max, other.a.max) },
      b: { min: Math.min(one.b.min, other.b.min), max: Math.max(one.b.max, other.b.max) },
      carry: { min: Math.min(one.carry.min, other.carry.min), max: Math.max(one.carry.max, other.carry.max) },
    }),
    isInside: independentAddInside,
    enumerate: independentAddEnumerate,
    smallSpaces: [{ name: "six small sums", limits: SMALL_ADD, expectedCount: 6 }],
    widthMeasures: [
      { name: "top digits", measure: (q) => String(q.a).length },
      { name: "bottom digits", measure: (q) => String(q.b).length },
      { name: "sum digits", measure: (q) => String(q.a + q.b).length },
      { name: "sum value", measure: (q) => q.a + q.b },
    ],
    easierHarderPairs: [
      { name: "larger sum", easier: { a: 1, b: 2 }, harder: { a: 4, b: 3 } },
      { name: "carry over no carry", easier: { a: 4, b: 5 }, harder: { a: 5, b: 5 } },
    ],
    workedExamples: [
      { name: "no carry", question: { a: 2, b: 3 }, answer: { kind: "whole-number", value: "5" }, steps: ["Start at 2, count up 3", "5"] },
      { name: "carry", question: { a: 7, b: 6 }, answer: { kind: "whole-number", value: "13" }, steps: ["Start at 7, count up 6", "13"] },
    ],
    refusedLimits: [
      { name: "not an object", raw: "bad", problem: "the limits must be an object" },
      { name: "out of range", raw: { ...SMALL_ADD, a: { min: 0, max: 5 } }, problem: "a must be from 1 to 9" },
      { name: "empty space", raw: { a: { min: 1, max: 2 }, b: { min: 1, max: 2 }, carry: { min: 1, max: 1 } }, problem: "no question meets these limits" },
    ],
    refusedRows: [
      { name: "empty", rows: [] },
      { name: "wrong sign", rows: ["2", "×3"] },
      { name: "two digits on top", rows: ["12", "+3"] },
    ],
    fingerprintLimits: [SMALL_ADD, CARRY_ADD],
    fingerprintSeeds: ["fp-1", "fp-2", "fp-3"],
    ...overrides,
  };
}

function validAddFingerprints(
  shape: Shape<AddLimits, AddQuestion> = makeTestAddShape(),
  spec: ShapeHarnessSpec<AddLimits, AddQuestion> = makeTestAddSpec(),
): ShapeFingerprints {
  return { [shape.id]: { [String(shape.version)]: computeShapeFingerprint(shape, spec) } };
}

// ---------------------------------------------------------------------------
// 3. Registry & registration checks (H3, H4)
// ---------------------------------------------------------------------------

describe("registry checks (H4)", () => {
  it("fails when a shape is in SHAPES with no harness registration", () => {
    const shapes = shapeLibrary([makeTestAddShape()]);
    const problems = checkShapeRegistry(shapes, []);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("test.add");
  });

  it("fails when a harness registration has no shape in SHAPES", () => {
    const problems = checkShapeRegistry(new Map(), [makeTestAddSpec()]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("test.add");
  });

  it("fails when one shape has two harness registrations", () => {
    const shapes = shapeLibrary([makeTestAddShape()]);
    const problems = checkShapeRegistry(shapes, [makeTestAddSpec(), makeTestAddSpec()]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("test.add");
  });

  it("refuses duplicate shape ids and invalid versions in shapeLibrary", () => {
    expect(() => shapeLibrary([makeTestAddShape(), makeTestAddShape()])).toThrow(/duplicate shape "test\.add"/);
    expect(() => shapeLibrary([makeTestAddShape({ version: 0 })])).toThrow(/whole-number version/);
    expect(() => shapeLibrary([makeTestAddShape({ version: -1 })])).toThrow(/whole-number version/);
    expect(() => shapeLibrary([makeTestAddShape({ version: 1.5 })])).toThrow(/whole-number version/);
    expect(() => shapeLibrary([makeTestAddShape({ version: Number.NaN })])).toThrow(/whole-number version/);
  });
});

describe("empty registration lists are refused (H3)", () => {
  const listFields = [
    "smallSpaces",
    "widthMeasures",
    "easierHarderPairs",
    "workedExamples",
    "refusedLimits",
    "refusedRows",
    "fingerprintLimits",
    "fingerprintSeeds",
  ] as const;

  it.each(listFields)("refuses empty %s", (field) => {
    const shape = makeTestAddShape();
    const spec = makeTestAddSpec({ [field]: [] });
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, makeTestAddSpec()) });
    const regFailure = report.failures.find((f) => f.check === "registration");
    expect(regFailure).toBeDefined();
    expect(regFailure?.message).toContain("test.add");
    expect(regFailure?.message).toContain("registration");
    expect(regFailure?.message).toContain(field);
  });
});

// ---------------------------------------------------------------------------
// 4. Harness catches every broken shape through runShapeHarness (H1, H2, H5, H8)
// ---------------------------------------------------------------------------

describe("harness checks fail on broken test-only shapes (H8)", () => {
  it("passes a clean invented test-only shape and uses real layout printedRows", () => {
    const shape = makeTestAddShape();
    const spec = makeTestAddSpec();
    expect(printedRowsFor(shape.face({ a: 4, b: 5 }), shape.answer({ a: 4, b: 5 }))).toEqual(["4", "+5"]);
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    expect(report.failures).toEqual([]);
  });

  it("catches non-deterministic generate (H1 determinism)", () => {
    let calls = 0;
    const base = makeTestAddShape();
    const shape = makeTestAddShape({
      generate: (l, seed) => {
        const all = addQuestions(l);
        if (all.length > 1) return addItem(all[(pick(seed, all.length) + calls++) % all.length]);
        return base.generate(l, seed);
      },
    });
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(base, spec) });
    const failure = report.failures.find((f) => f.check === "determinism");
    expect(failure?.message).toMatch(/test\.add.*determinism/);
  });

  it("catches a question outside limits (H1 within-limits)", () => {
    const shape = makeTestAddShape({
      generate: () => addItem({ a: 9, b: 9 }),
    });
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    const failure = report.failures.find((f) => f.check === "within-limits");
    expect(failure?.message).toMatch(/test\.add.*within-limits/);
  });

  it.each<[string, (base: Shape<AddLimits, AddQuestion>) => Partial<Shape<AddLimits, AddQuestion>>]>([
    ["wrong generated answer", (b) => ({ generate: (l, s) => ({ ...b.generate(l, s), answer: { kind: "whole-number", value: "99" } }) })],
    ["wrong shape.answer", () => ({ answer: () => ({ kind: "whole-number", value: "99" }) })],
    ["disagreeing solveAgain", (b) => ({ solveAgain: (rows) => { const r = b.solveAgain(rows); return r && { ...r, answer: { kind: "whole-number", value: "0" } }; } })],
    ["face printing another operand (caught via real layout)", (b) => ({ face: (q) => ({ ...b.face(q), bottom: q.b === 9 ? "8" : String(q.b + 1) }) })],
    ["unprintable character in face", (b) => ({ face: (q) => ({ ...b.face(q), sign: "€" }) })],
  ])("catches %s (H1 answer-agreement)", (_name, breakShape) => {
    const base = makeTestAddShape();
    const shape = makeTestAddShape(breakShape(base));
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    const failure = report.failures.find((f) => f.check === "answer-agreement");
    expect(failure?.message).toMatch(/test\.add.*answer-agreement/);
  });

  it.each<[string, Partial<Shape<AddLimits, AddQuestion>>]>([
    ["steps ending in wrong value", { steps: ({ a, b }) => [`Start at ${a}, count up ${b}`, "999"] }],
    ["steps disagreeing with worked example", { steps: ({ a, b }) => [`Add ${a} and ${b}`, String(a + b)] }],
    ["steps with unprintable character", { steps: ({ a, b }) => [`Add ${a} € ${b}`, String(a + b)] }],
  ])("catches %s (H1/H3 steps)", (_name, overrides) => {
    const shape = makeTestAddShape(overrides);
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    const failure = report.failures.find((f) => f.check === "steps");
    expect(failure?.message).toMatch(/test\.add.*steps/);
  });

  it.each<[string, (base: Shape<AddLimits, AddQuestion>) => Partial<Shape<AddLimits, AddQuestion>>]>([
    ["difficultyRange falling as limits widen", (b) => ({ difficultyRange: (l) => ({ easiest: 0, hardest: 1000 - b.count(l) }) })],
    ["difficulty failing easier-harder pair", () => ({ difficulty: () => 5, difficultyRange: () => ({ easiest: 5, hardest: 5 }) })],
    ["difficulty outside difficultyRange", () => ({ difficultyRange: () => ({ easiest: 0, hardest: 0 }) })],
  ])("catches %s (H1/H3 difficulty)", (_name, breakShape) => {
    const base = makeTestAddShape();
    const shape = makeTestAddShape(breakShape(base));
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    const failure = report.failures.find((f) => f.check === "difficulty");
    expect(failure?.message).toMatch(/test\.add.*difficulty/);
  });

  it("catches narrow worstCase (H1 worst-case)", () => {
    const shape = makeTestAddShape({
      worstCase: (l) => addItem(addQuestions(l).reduce((smallest, q) => (q.a + q.b < smallest.a + smallest.b ? q : smallest))),
    });
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    const failure = report.failures.find((f) => f.check === "worst-case");
    expect(failure?.message).toMatch(/test\.add.*worst-case/);
  });

  it("catches wrong count (H1/H2 count and small-spaces) with and without an enumerator", () => {
    const base = makeTestAddShape();
    const shape = makeTestAddShape({ count: (l) => base.count(l) + 1 });
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    expect(report.failures.find((f) => f.check === "count")?.message).toMatch(/test\.add.*count/);
    expect(report.failures.find((f) => f.check === "small-spaces")?.message).toMatch(/test\.add.*small-spaces/);

    const noEnumSpec = makeTestAddSpec({ enumerate: undefined, anyLimits: undefined });
    const noEnumReport = runShapeHarness(shape, noEnumSpec, { fingerprints: validAddFingerprints(shape, noEnumSpec) });
    expect(noEnumReport.failures.find((f) => f.check === "small-spaces")?.message).toMatch(/test\.add.*small-spaces/);
  });

  it("catches generate that skips a question of a small space (H2 small-spaces)", () => {
    const shape = makeTestAddShape({
      generate: (l, seed) => {
        const all = addQuestions(l);
        const usable = all.length > 1 ? all.slice(0, -1) : all;
        return addItem(usable[pick(seed, usable.length)]);
      },
    });
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    const failure = report.failures.find((f) => f.check === "small-spaces");
    expect(failure?.message).toMatch(/test\.add.*small-spaces/);
  });

  it("catches readLimits that fails a refused case (H3 read-limits)", () => {
    const base = makeTestAddShape();
    const shape = makeTestAddShape({
      readLimits: (raw) => (raw === "bad" ? { ok: false, problem: "wrong message" } : base.readLimits(raw)),
    });
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    const failure = report.failures.find((f) => f.check === "read-limits");
    expect(failure?.message).toMatch(/test\.add.*read-limits/);
  });

  it("catches solveAgain that accepts refused printed rows (H3 refused-rows)", () => {
    const base = makeTestAddShape();
    const shape = makeTestAddShape({
      solveAgain: (rows) => (rows.length === 0 ? addItem({ a: 1, b: 1 }) : base.solveAgain(rows)),
    });
    const spec = makeTestAddSpec();
    const report = runShapeHarness(shape, spec, { fingerprints: validAddFingerprints(shape, spec) });
    const failure = report.failures.find((f) => f.check === "refused-rows");
    expect(failure?.message).toMatch(/test\.add.*refused-rows/);
  });
});

// ---------------------------------------------------------------------------
// 5. Fingerprint rules and update command (H5)
// ---------------------------------------------------------------------------

describe("version fingerprints (H5)", () => {
  it("fails when output changes without bumping version", () => {
    const original = makeTestAddShape();
    const spec = makeTestAddSpec();
    const fps = validAddFingerprints(original, spec);
    const changed = makeTestAddShape({
      steps: ({ a, b }) => [`Count ${b} past ${a}`, String(a + b)],
    });
    const report = runShapeHarness(changed, spec, { fingerprints: fps });
    const failure = report.failures.find((f) => f.check === "fingerprint");
    expect(failure?.message).toMatch(/test\.add.*fingerprint.*changed/);
  });

  it("fails when the current version has no fingerprint", () => {
    const shape = makeTestAddShape({ version: 2 });
    const spec = makeTestAddSpec();
    const fps = validAddFingerprints(makeTestAddShape({ version: 1 }), spec);
    const report = runShapeHarness(shape, spec, { fingerprints: fps });
    const failure = report.failures.find((f) => f.check === "fingerprint");
    expect(failure?.message).toMatch(/test\.add.*fingerprint.*no fingerprint/);
  });

  it("fails when an older fingerprint is removed", () => {
    const shape = makeTestAddShape({ version: 2 });
    const spec = makeTestAddSpec();
    const fps: ShapeFingerprints = { "test.add": { "2": computeShapeFingerprint(shape, spec) } };
    const report = runShapeHarness(shape, spec, { fingerprints: fps });
    const failure = report.failures.find((f) => f.check === "fingerprint");
    expect(failure?.message).toMatch(/test\.add.*fingerprint.*older version 1/);
  });

  it("fails when a stored fingerprint version is not lower than current version", () => {
    const shape = makeTestAddShape({ version: 1 });
    const spec = makeTestAddSpec();
    const hash = computeShapeFingerprint(shape, spec);
    const fps: ShapeFingerprints = { "test.add": { "1": hash, "2": hash } };
    const report = runShapeHarness(shape, spec, { fingerprints: fps });
    const failure = report.failures.find((f) => f.check === "fingerprint");
    expect(failure?.message).toMatch(/test\.add.*fingerprint.*not lower/);
  });

  it("fails when fixed limits or seeds change without bumping version", () => {
    const shape = makeTestAddShape();
    const spec = makeTestAddSpec();
    const fps = validAddFingerprints(shape, spec);

    const otherLimits = makeTestAddSpec({ fingerprintLimits: [SMALL_ADD] });
    const reportLimits = runShapeHarness(shape, otherLimits, { fingerprints: fps });
    expect(reportLimits.failures.find((f) => f.check === "fingerprint")?.message).toMatch(/test\.add.*fingerprint/);

    const otherSeeds = makeTestAddSpec({ fingerprintSeeds: ["fp-1", "fp-2", "fp-other"] });
    const reportSeeds = runShapeHarness(shape, otherSeeds, { fingerprints: fps });
    expect(reportSeeds.failures.find((f) => f.check === "fingerprint")?.message).toMatch(/test\.add.*fingerprint/);
  });

  it("fails when version is not a positive whole number", () => {
    const spec = makeTestAddSpec();
    for (const badVersion of [0, -2, 1.5]) {
      const shape = makeTestAddShape({ version: badVersion });
      const report = runShapeHarness(shape, spec, { fingerprints: {} });
      const failure = report.failures.find((f) => f.check === "fingerprint");
      expect(failure?.message).toMatch(/test\.add.*fingerprint.*whole number/);
    }
  });

  it("addShapeFingerprints adds a new version, keeps older versions, and refuses to alter an existing one", () => {
    const v1 = makeTestAddShape({ version: 1 });
    const spec = makeTestAddSpec();
    const initial = addShapeFingerprints(shapeLibrary([v1]), [spec], {});
    expect(initial.ok).toBe(true);
    if (!initial.ok) throw new Error("expected ok");
    expect(initial.added).toEqual(["test.add@1"]);

    // Running again with unchanged output is a safe no-op.
    const repeat = addShapeFingerprints(shapeLibrary([v1]), [spec], initial.fingerprints);
    expect(repeat).toEqual({ ok: true, fingerprints: initial.fingerprints, added: [] });

    // Changing output without bumping version is refused.
    const changedV1 = makeTestAddShape({ version: 1, steps: ({ a, b }) => [`Sum ${a} + ${b}`, String(a + b)] });
    const refused = addShapeFingerprints(shapeLibrary([changedV1]), [spec], initial.fingerprints);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.problems[0]).toMatch(/test\.add.*already has a fingerprint/);

    // Bumping to v2 appends v2 and keeps v1 intact.
    const v2 = makeTestAddShape({ version: 2, steps: ({ a, b }) => [`Sum ${a} + ${b}`, String(a + b)] });
    const bumped = addShapeFingerprints(shapeLibrary([v2]), [spec], initial.fingerprints);
    expect(bumped.ok).toBe(true);
    if (!bumped.ok) throw new Error("expected ok");
    expect(bumped.added).toEqual(["test.add@2"]);
    expect(bumped.fingerprints["test.add"]["1"]).toBe(initial.fingerprints["test.add"]["1"]);
    expect(bumped.fingerprints["test.add"]["2"]).toBe(computeShapeFingerprint(v2, spec));

    // Refuses to write v2 when older v1 is missing from the store.
    const missingOlder = addShapeFingerprints(shapeLibrary([v2]), [spec], {});
    expect(missingOlder.ok).toBe(false);
    if (!missingOlder.ok) expect(missingOlder.problems[0]).toMatch(/older version 1/);
  });
});

// ---------------------------------------------------------------------------
// 6. Fingerprint CLI command end-to-end (H5)
// ---------------------------------------------------------------------------

describe("fingerprint CLI command (H5)", () => {
  let dir = "";
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "shape-fp-cli-")); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function runCli(args: string[]): Promise<{ code: number; output: string }> {
    return new Promise((resolve) => {
      execFile(process.execPath, ["scripts/shape-fingerprints.mjs", ...args], (error, stdout, stderr) =>
        resolve({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, output: stdout + stderr }));
    });
  }

  it("writes a missing version, leaves a matching version alone, and refuses to overwrite a differing version", async () => {
    const file = join(dir, "fingerprints.json");
    writeFileSync(file, "{}\n");

    const added = await runCli(["--file", file]);
    expect(added.code, added.output).toBe(0);
    expect(added.output).toContain("mul.column@1");
    const written = JSON.parse(readFileSync(file, "utf8")) as ShapeFingerprints;
    expect(written).toEqual(committedFingerprints);

    const noop = await runCli(["--file", file]);
    expect(noop.code, noop.output).toBe(0);
    expect(noop.output).toMatch(/up to date/i);

    writeFileSync(file, JSON.stringify({ "mul.column": { "1": "0".repeat(64) } }, null, 2));
    const refused = await runCli(["--file", file]);
    expect(refused.code).toBe(1);
    expect(refused.output).toMatch(/already has a fingerprint/);
  });
});

// ---------------------------------------------------------------------------
// 7. Timing is reported apart from correctness (H7)
// ---------------------------------------------------------------------------

describe("timing report (H7)", () => {
  it("reports durationMs for a slow shape without failing correctness", () => {
    const base = makeTestAddShape();
    let slept = false;
    const slow = makeTestAddShape({
      worstCase: (l) => {
        if (!slept) {
          slept = true;
          const end = performance.now() + 15;
          while (performance.now() < end) { /* intentional brief busy wait */ }
        }
        return base.worstCase(l);
      },
    });
    const spec = makeTestAddSpec();
    const report = runShapeHarness(slow, spec, { fingerprints: validAddFingerprints(slow, spec) });
    expect(report.failures).toEqual([]);
    expect(report.durationMs).toBeGreaterThanOrEqual(10);
  });
});
