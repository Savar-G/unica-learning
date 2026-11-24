// One property-test harness for every workbook v2 shape. Every shape in SHAPES registers a ShapeHarnessSpec here so no
// shape can ship without full property checks, small-space enumeration, layout round-trip solving, and fingerprints.
import fc from "fast-check";
import { printedRows } from "../checks/printed-answers";
import { ANSWER_KINDS, isPrintable, type Answer, type BookItem, type Face } from "../contract";
import { canonicalJson } from "../hash";
import { itemRegions } from "../layout/build-pages";
import { digitPlaces, TEMPLATES } from "../layout/templates";
import type { Shape, ShapeLibrary } from "../shapes";
import { checkShapeFingerprint, type ShapeFingerprints } from "./shape-fingerprints";

export interface SmallSpace<L> {
  name: string;
  limits: L;
  expectedCount: number;
}

export interface WidthMeasure<Q> {
  name: string;
  measure(question: Q): number;
}

export interface DifficultyPair<Q> {
  name: string;
  easier: Q;
  harder: Q;
}

export interface WorkedExample<Q> {
  name: string;
  question: Q;
  answer: Answer;
  steps: readonly string[];
}

export interface RefusedLimitsCase {
  name: string;
  raw: unknown;
  problem: string;
}

export interface RefusedRowsCase {
  name: string;
  rows: readonly string[];
}

export interface ShapeHarnessSpec<L = unknown, Q = unknown> {
  id: string;
  /** Arbitrary of valid limits (each allowing at least one question). */
  arbitraryLimits: fc.Arbitrary<L>;
  /** Combine two valid limits into wider valid limits that allow every question of both. */
  widenLimits(a: L, b: L): L;
  /** Independent check that a question obeys the limits (shares no code with the shape). */
  isInside(question: Q, limits: L): boolean;
  /** Optional independent enumerator for shapes whose full parameter space is small enough. */
  enumerate?(limits: L): readonly Q[];
  /** Optional arbitrary including possibly empty limits (checked with enumerate when present). */
  anyLimits?: fc.Arbitrary<L>;
  smallSpaces: readonly SmallSpace<L>[];
  widthMeasures: readonly WidthMeasure<Q>[];
  easierHarderPairs: readonly DifficultyPair<Q>[];
  workedExamples: readonly WorkedExample<Q>[];
  refusedLimits: readonly RefusedLimitsCase[];
  refusedRows: readonly RefusedRowsCase[];
  fingerprintLimits: readonly L[];
  fingerprintSeeds: readonly string[];
}

export const SHAPE_CHECK_NAMES = [
  "registration",
  "read-limits",
  "determinism",
  "within-limits",
  "answer-agreement",
  "steps",
  "refused-rows",
  "difficulty",
  "worst-case",
  "count",
  "small-spaces",
  "fingerprint",
] as const;

export type ShapeCheckName = (typeof SHAPE_CHECK_NAMES)[number];

export interface ShapeCheckResult {
  check: ShapeCheckName;
  ok: boolean;
  message?: string;
}

export interface ShapeCheckFailure {
  shape: string;
  check: ShapeCheckName;
  message: string;
}

export interface ShapeHarnessReport {
  shape: string;
  version: number;
  durationMs: number;
  checks: ShapeCheckResult[];
  failures: ShapeCheckFailure[];
}

export interface AllShapesReport {
  registryProblems: string[];
  reports: ShapeHarnessReport[];
  totalDurationMs: number;
}

export interface ShapeHarnessOptions {
  fingerprints: ShapeFingerprints;
  runs?: number;
}

const DEFAULT_RUNS = 1000;

/** Checks that SHAPES and the harness registrations match one-to-one with no duplicates. */
export function checkShapeRegistry(shapes: ShapeLibrary, specs: readonly Pick<ShapeHarnessSpec, "id">[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.id)) problems.push(`[${spec.id}] registry: shape "${spec.id}" is registered in the harness more than once`);
    else seen.add(spec.id);
  }
  for (const id of shapes.keys()) {
    if (!seen.has(id)) problems.push(`[${id}] registry: shape "${id}" is in SHAPES but has no harness registration`);
  }
  for (const id of seen) {
    if (!shapes.has(id)) problems.push(`[${id}] registry: harness registration "${id}" has no shape in SHAPES`);
  }
  return problems;
}

/** Turns a face into printed rows through the real page layout and printedRows (the same path a book uses). */
export function printedRowsFor(face: Face, answer: Answer): string[] {
  const needed = digitPlaces(face, answer.value);
  const matching = [...TEMPLATES.values()].filter((t) => t.faces.includes(face.kind));
  if (matching.length === 0) throw new Error(`no template supports face kind "${face.kind}"`);
  const template = matching.find((t) => t.digits >= needed) ?? matching[0];
  const item: BookItem = {
    id: "harness/1/front/1",
    sheetId: "harness",
    side: "front",
    rowId: "harness",
    number: 1,
    shape: "harness",
    shapeVersion: 1,
    question: null,
    face,
    answer,
    steps: [answer.value],
    difficulty: 0,
  };
  const regions = itemRegions(template, template.sides.front.places[0], item, (name) => `harness/${name}`);
  const question = regions.find((r) => r.role === "question");
  if (!question) throw new Error("layout produced no question region");
  return printedRows(question.ink);
}

function faceTexts(face: Face): string[] {
  return [face.top, face.sign, face.bottom];
}

function checkRegistration<L, Q>(shape: Shape<L, Q>, spec: ShapeHarnessSpec<L, Q>): string | null {
  if (shape.id !== spec.id) return `shape id "${shape.id}" does not match registration id "${spec.id}"`;
  if (!ANSWER_KINDS.includes(shape.answerKind)) return `unknown answerKind "${String(shape.answerKind)}"`;
  const requiredLists: readonly [string, readonly unknown[]][] = [
    ["smallSpaces", spec.smallSpaces],
    ["widthMeasures", spec.widthMeasures],
    ["easierHarderPairs", spec.easierHarderPairs],
    ["workedExamples", spec.workedExamples],
    ["refusedLimits", spec.refusedLimits],
    ["refusedRows", spec.refusedRows],
    ["fingerprintLimits", spec.fingerprintLimits],
    ["fingerprintSeeds", spec.fingerprintSeeds],
  ];
  for (const [name, list] of requiredLists) {
    if (list.length === 0) return `${name} must not be empty`;
  }
  for (const space of spec.smallSpaces) {
    if (!Number.isSafeInteger(space.expectedCount) || space.expectedCount < 1) {
      return `smallSpace "${space.name}" must have a positive whole-number expectedCount`;
    }
  }
  return null;
}

function checkReadLimits<L, Q>(
  shape: Shape<L, Q>,
  spec: ShapeHarnessSpec<L, Q>,
  limitSamples: readonly L[],
  anySamples: readonly L[],
): string | null {
  const validLimits: readonly L[] = [
    ...spec.smallSpaces.map((s) => s.limits),
    ...spec.fingerprintLimits,
    ...limitSamples.slice(0, 50),
  ];
  for (const limits of validLimits) {
    const raw = JSON.parse(JSON.stringify(limits)) as unknown;
    const read = shape.readLimits(raw);
    if (!read.ok) return `valid limits ${canonicalJson(limits)} were refused: ${read.problem}`;
    if (canonicalJson(read.limits) !== canonicalJson(limits)) {
      return `valid limits changed on readLimits round-trip: expected ${canonicalJson(limits)}, got ${canonicalJson(read.limits)}`;
    }
  }
  for (const c of spec.refusedLimits) {
    const read = shape.readLimits(c.raw);
    if (read.ok) return `refused case "${c.name}" was accepted`;
    if (read.problem !== c.problem) return `refused case "${c.name}" gave "${read.problem}", expected "${c.problem}"`;
  }
  if (spec.enumerate) {
    for (const limits of anySamples) {
      if (spec.enumerate(limits).length === 0) {
        const read = shape.readLimits(JSON.parse(JSON.stringify(limits)) as unknown);
        if (read.ok) return `empty limits ${canonicalJson(limits)} were accepted by readLimits`;
      }
    }
  }
  return null;
}

function checkDeterminism<L, Q>(shape: Shape<L, Q>, samples: readonly [L, string][]): string | null {
  for (const [limits, seed] of samples) {
    const first = shape.generate(limits, seed);
    const second = shape.generate(limits, seed);
    if (canonicalJson(first) !== canonicalJson(second)) {
      return `seed ${JSON.stringify(seed)} gave ${canonicalJson(first)} then ${canonicalJson(second)}`;
    }
  }
  return null;
}

function checkWithinLimits<L, Q>(shape: Shape<L, Q>, spec: ShapeHarnessSpec<L, Q>, samples: readonly [L, string][]): string | null {
  for (const [limits, seed] of samples) {
    const item = shape.generate(limits, seed);
    if (!spec.isInside(item.question, limits)) {
      return `question ${canonicalJson(item.question)} is outside limits ${canonicalJson(limits)} (seed ${JSON.stringify(seed)})`;
    }
  }
  return null;
}

function checkItemAgreement<L, Q>(shape: Shape<L, Q>, question: Q, answer: Answer, context: string): string | null {
  if (answer.kind !== shape.answerKind) {
    return `${context}: answer kind "${answer.kind}" does not match shape.answerKind "${shape.answerKind}"`;
  }
  if (!isPrintable(answer.value)) return `${context}: answer "${answer.value}" is not printable`;
  const direct = shape.answer(question);
  if (canonicalJson(direct) !== canonicalJson(answer)) {
    return `${context}: shape.answer gave ${canonicalJson(direct)} while item held ${canonicalJson(answer)}`;
  }
  const face = shape.face(question);
  for (const text of faceTexts(face)) {
    if (!isPrintable(text)) return `${context}: face text "${text}" is not printable`;
  }
  const rows = printedRowsFor(face, answer);
  const solved = shape.solveAgain(rows);
  if (!solved) return `${context}: solveAgain returned null for printed rows ${JSON.stringify(rows)}`;
  if (canonicalJson(solved) !== canonicalJson({ question, answer })) {
    return `${context}: solveAgain(${JSON.stringify(rows)}) gave ${canonicalJson(solved)}, expected ${canonicalJson({ question, answer })}`;
  }
  return null;
}

function checkAnswerAgreement<L, Q>(shape: Shape<L, Q>, spec: ShapeHarnessSpec<L, Q>, samples: readonly [L, string][]): string | null {
  for (const ex of spec.workedExamples) {
    const problem = checkItemAgreement(shape, ex.question, ex.answer, `worked example "${ex.name}"`);
    if (problem) return problem;
  }
  for (const [limits, seed] of samples) {
    const item = shape.generate(limits, seed);
    const problem = checkItemAgreement(shape, item.question, item.answer, `seed ${JSON.stringify(seed)}`);
    if (problem) return problem;
  }
  return null;
}

function checkSteps<L, Q>(shape: Shape<L, Q>, spec: ShapeHarnessSpec<L, Q>, samples: readonly [L, string][]): string | null {
  for (const ex of spec.workedExamples) {
    if (ex.steps.length === 0 || ex.steps.at(-1) !== ex.answer.value) {
      return `worked example "${ex.name}" steps in registration do not end in answer "${ex.answer.value}"`;
    }
    const actualAnswer = shape.answer(ex.question);
    if (canonicalJson(actualAnswer) !== canonicalJson(ex.answer)) {
      return `worked example "${ex.name}" answer was ${canonicalJson(actualAnswer)}, expected ${canonicalJson(ex.answer)}`;
    }
    const actualSteps = shape.steps(ex.question);
    if (canonicalJson(actualSteps) !== canonicalJson(ex.steps)) {
      return `worked example "${ex.name}" steps were ${JSON.stringify(actualSteps)}, expected ${JSON.stringify(ex.steps)}`;
    }
  }
  for (const [limits, seed] of samples) {
    const item = shape.generate(limits, seed);
    const steps = shape.steps(item.question);
    if (steps.length === 0) return `steps returned an empty list for ${canonicalJson(item.question)}`;
    for (const line of steps) {
      if (typeof line !== "string" || line.length === 0 || !isPrintable(line)) {
        return `step ${JSON.stringify(line)} is empty or not printable for ${canonicalJson(item.question)}`;
      }
    }
    if (steps.at(-1) !== item.answer.value) {
      return `last step ${JSON.stringify(steps.at(-1))} does not equal answer ${JSON.stringify(item.answer.value)}`;
    }
  }
  return null;
}

function checkRefusedRows<L, Q>(shape: Shape<L, Q>, spec: ShapeHarnessSpec<L, Q>): string | null {
  for (const c of spec.refusedRows) {
    const solved = shape.solveAgain(c.rows);
    if (solved !== null) return `refused rows "${c.name}" (${JSON.stringify(c.rows)}) were accepted as ${canonicalJson(solved)}`;
  }
  return null;
}

function checkDifficulty<L, Q>(
  shape: Shape<L, Q>,
  spec: ShapeHarnessSpec<L, Q>,
  samples: readonly [L, string][],
  pairs: readonly [L, L][],
): string | null {
  for (const pair of spec.easierHarderPairs) {
    const low = shape.difficulty(pair.easier);
    const high = shape.difficulty(pair.harder);
    if (!(high > low)) {
      return `pair "${pair.name}": harder (${high}) must exceed easier (${low})`;
    }
  }
  for (const [limits, seed] of samples) {
    const item = shape.generate(limits, seed);
    const score = shape.difficulty(item.question);
    const range = shape.difficultyRange(limits);
    if (!Number.isFinite(score) || !Number.isFinite(range.easiest) || !Number.isFinite(range.hardest)) {
      return `non-finite difficulty for ${canonicalJson(limits)}`;
    }
    if (range.easiest > range.hardest) return `difficultyRange easiest (${range.easiest}) > hardest (${range.hardest})`;
    if (score < range.easiest || score > range.hardest) {
      return `difficulty ${score} of ${canonicalJson(item.question)} falls outside range [${range.easiest}, ${range.hardest}]`;
    }
    if (spec.enumerate) {
      const scores = spec.enumerate(limits).map((q) => shape.difficulty(q));
      const easiest = Math.min(...scores);
      const hardest = Math.max(...scores);
      if (range.easiest !== easiest || range.hardest !== hardest) {
        return `difficultyRange ${canonicalJson(range)} does not match exact range { easiest: ${easiest}, hardest: ${hardest} }`;
      }
    }
  }
  for (const [one, other] of pairs) {
    const wider = spec.widenLimits(one, other);
    const qOne = shape.generate(one, "harness-widen-a").question;
    if (spec.isInside(qOne, one) && !spec.isInside(qOne, wider)) {
      return `widenLimits lost question ${canonicalJson(qOne)} from first limits`;
    }
    const qOther = shape.generate(other, "harness-widen-b").question;
    if (spec.isInside(qOther, other) && !spec.isInside(qOther, wider)) {
      return `widenLimits lost question ${canonicalJson(qOther)} from second limits`;
    }
    const rOne = shape.difficultyRange(one);
    const rOther = shape.difficultyRange(other);
    const rWider = shape.difficultyRange(wider);
    if (rWider.hardest < rOne.hardest || rWider.hardest < rOther.hardest) {
      return `widening limits lowered hardest difficulty (${rWider.hardest} < max(${rOne.hardest}, ${rOther.hardest}))`;
    }
    if (rWider.easiest > rOne.easiest || rWider.easiest > rOther.easiest) {
      return `widening limits raised easiest difficulty (${rWider.easiest} > min(${rOne.easiest}, ${rOther.easiest}))`;
    }
  }
  return null;
}

function checkWorstCase<L, Q>(shape: Shape<L, Q>, spec: ShapeHarnessSpec<L, Q>, samples: readonly [L, string][]): string | null {
  for (const [limits, seed] of samples) {
    const worst = shape.worstCase(limits);
    if (!spec.isInside(worst.question, limits)) {
      return `worstCase ${canonicalJson(worst.question)} is outside limits ${canonicalJson(limits)}`;
    }
    const agreement = checkItemAgreement(shape, worst.question, worst.answer, `worstCase(${canonicalJson(limits)})`);
    if (agreement) return agreement;
    const item = shape.generate(limits, seed);
    const worstPlaces = digitPlaces(shape.face(worst.question), worst.answer.value);
    const itemPlaces = digitPlaces(shape.face(item.question), item.answer.value);
    if (worstPlaces < itemPlaces) {
      return `worstCase uses ${worstPlaces} digit places, narrower than ${itemPlaces} for ${canonicalJson(item.question)}`;
    }
    const all = spec.enumerate ? spec.enumerate(limits) : null;
    for (const { name, measure } of spec.widthMeasures) {
      const wWorst = measure(worst.question);
      const wItem = measure(item.question);
      if (wWorst < wItem) {
        return `worstCase ${name} (${wWorst}) is less than ${wItem} for ${canonicalJson(item.question)}`;
      }
      if (all) {
        const maxWidth = Math.max(...all.map(measure));
        if (wWorst < maxWidth) return `worstCase ${name} (${wWorst}) is less than space maximum (${maxWidth})`;
      }
    }
  }
  return null;
}

function checkCount<L, Q>(
  shape: Shape<L, Q>,
  spec: ShapeHarnessSpec<L, Q>,
  samples: readonly [L, string][],
  pairs: readonly [L, L][],
  anySamples: readonly L[],
): string | null {
  for (const [limits] of samples) {
    const c = shape.count(limits);
    if (!Number.isSafeInteger(c) || c < 1) {
      return `count must be a positive whole number for valid limits, got ${String(c)}`;
    }
  }
  for (const [one, other] of pairs) {
    const wider = spec.widenLimits(one, other);
    const cWider = shape.count(wider);
    if (cWider < shape.count(one) || cWider < shape.count(other)) {
      return `count shrank when widening limits (${cWider} < max(${shape.count(one)}, ${shape.count(other)}))`;
    }
  }
  if (spec.enumerate) {
    for (const limits of anySamples) {
      const expected = spec.enumerate(limits).length;
      const actual = shape.count(limits);
      if (actual !== expected) return `count returned ${actual}, expected ${expected} for ${canonicalJson(limits)}`;
    }
  }
  return null;
}

function checkSmallSpaces<L, Q>(shape: Shape<L, Q>, spec: ShapeHarnessSpec<L, Q>): string | null {
  for (const space of spec.smallSpaces) {
    const reported = shape.count(space.limits);
    if (reported !== space.expectedCount) {
      return `small space "${space.name}": count returned ${reported}, expected ${space.expectedCount}`;
    }
    const seedCount = Math.max(1000, space.expectedCount * 40);
    const reached = new Map<string, Q>();
    for (let i = 0; i < seedCount; i++) {
      const item = shape.generate(space.limits, `harness-small-${space.name}-${i}`);
      if (!spec.isInside(item.question, space.limits)) {
        return `small space "${space.name}": generated out-of-limits question ${canonicalJson(item.question)}`;
      }
      reached.set(canonicalJson(item.question), item.question);
    }
    if (reached.size !== space.expectedCount || reached.size !== reported) {
      return `small space "${space.name}": generate reached ${reached.size} questions, expected ${space.expectedCount} (count=${reported})`;
    }
    if (spec.enumerate) {
      const expectedKeys = spec.enumerate(space.limits).map((q) => canonicalJson(q)).sort();
      const reachedKeys = [...reached.keys()].sort();
      if (canonicalJson(reachedKeys) !== canonicalJson(expectedKeys)) {
        return `small space "${space.name}": reached questions do not match independent enumeration`;
      }
    }
    const scores = [...reached.values()].map((q) => shape.difficulty(q));
    const range = shape.difficultyRange(space.limits);
    const easiest = Math.min(...scores);
    const hardest = Math.max(...scores);
    if (range.easiest !== easiest || range.hardest !== hardest) {
      return `small space "${space.name}": difficultyRange ${canonicalJson(range)} does not match { easiest: ${easiest}, hardest: ${hardest} }`;
    }
    const worst = shape.worstCase(space.limits);
    for (const { name, measure } of spec.widthMeasures) {
      const wWorst = measure(worst.question);
      for (const q of reached.values()) {
        const w = measure(q);
        if (wWorst < w) {
          return `small space "${space.name}": worstCase ${name} (${wWorst}) is less than ${w} for ${canonicalJson(q)}`;
        }
      }
    }
  }
  return null;
}

/** Runs every harness check on one shape and reports durationMs apart from correctness. */
export function runShapeHarness<L, Q>(
  shape: Shape<L, Q>,
  spec: ShapeHarnessSpec<L, Q>,
  options: ShapeHarnessOptions,
): ShapeHarnessReport {
  const started = performance.now();
  const runs = options.runs ?? DEFAULT_RUNS;
  const checks: ShapeCheckResult[] = [];
  const failures: ShapeCheckFailure[] = [];

  const record = (check: ShapeCheckName, fn: () => string | null): boolean => {
    try {
      const detail = fn();
      if (detail === null) {
        checks.push({ check, ok: true });
        return true;
      }
      const message = `[${shape.id}] ${check}: ${detail}`;
      checks.push({ check, ok: false, message });
      failures.push({ shape: shape.id, check, message });
      return false;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = `[${shape.id}] ${check}: threw ${detail}`;
      checks.push({ check, ok: false, message });
      failures.push({ shape: shape.id, check, message });
      return false;
    }
  };

  const registrationOk = record("registration", () => checkRegistration(shape, spec));

  let samples: [L, string][] = [];
  let pairs: [L, L][] = [];
  let anySamples: L[] = [];
  if (registrationOk) {
    try {
      samples = fc.sample(fc.tuple(spec.arbitraryLimits, fc.string()), runs);
      pairs = fc.sample(fc.tuple(spec.arbitraryLimits, spec.arbitraryLimits), runs);
      anySamples = spec.enumerate ? fc.sample(spec.anyLimits ?? spec.arbitraryLimits, runs) : [];
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = `[${shape.id}] registration: arbitraryLimits failed to sample (${detail})`;
      checks[0] = { check: "registration", ok: false, message };
      failures.push({ shape: shape.id, check: "registration", message });
    }
  }

  if (samples.length > 0) {
    const limitSamples = samples.map(([l]) => l);
    record("read-limits", () => checkReadLimits(shape, spec, limitSamples, anySamples));
    record("determinism", () => checkDeterminism(shape, samples));
    record("within-limits", () => checkWithinLimits(shape, spec, samples));
    record("answer-agreement", () => checkAnswerAgreement(shape, spec, samples));
    record("steps", () => checkSteps(shape, spec, samples));
    record("refused-rows", () => checkRefusedRows(shape, spec));
    record("difficulty", () => checkDifficulty(shape, spec, samples, pairs));
    record("worst-case", () => checkWorstCase(shape, spec, samples));
    record("count", () => checkCount(shape, spec, samples, pairs, anySamples));
    record("small-spaces", () => checkSmallSpaces(shape, spec));
    record("fingerprint", () => checkShapeFingerprint(shape, spec, options.fingerprints));
  }

  const durationMs = Math.round((performance.now() - started) * 100) / 100;
  return { shape: shape.id, version: shape.version, durationMs, checks, failures };
}

/** Runs registry verification plus the harness for every shape in SHAPES. */
export function runAllShapeHarnesses(
  shapes: ShapeLibrary,
  specs: readonly ShapeHarnessSpec[],
  options: ShapeHarnessOptions,
): AllShapesReport {
  const started = performance.now();
  const registryProblems = checkShapeRegistry(shapes, specs);
  const specById = new Map(specs.map((s) => [s.id, s]));
  const reports: ShapeHarnessReport[] = [];
  for (const [id, shape] of shapes) {
    const spec = specById.get(id);
    if (spec) reports.push(runShapeHarness(shape, spec, options));
  }
  const totalDurationMs = Math.round((performance.now() - started) * 100) / 100;
  return { registryProblems, reports, totalDurationMs };
}

export function formatShapeTimings(reports: readonly ShapeHarnessReport[]): string {
  return reports.map((r) => `${r.shape} (v${r.version}): ${r.durationMs}ms`).join(", ");
}
