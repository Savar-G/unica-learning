import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Answer, Face, Step } from "../contract";
import { canonicalJson, pick, seedFrom } from "../hash";
import { columns2x4, TEMPLATES, type ColumnPlace, type PageTemplate } from "../layout/templates";
import { shapeLibrary, type Item, type Shape } from "../shapes";
import { readLimitFields } from "../shapes/shape";
import * as example from "./example-shapes";
import { addItem, addQuestions, addRegistration, addShape, lessRegistration, lessShape, BY_HAND, type AddLimits, type AddQuestion, type LessLimits, type LessQuestion } from "./example-shapes";
import { sampleBook } from "./shape-book";
import { shapeFingerprint } from "./shape-fingerprints";
import { CHECKS, checkShape, checkShapes, runChecks, SEEDS, type Check, type HarnessOptions, type ShapeReport } from "./shape-harness";
import { neverLimit, onlyLimit, rangeLimit, registryProblems, step, wholeAnswer, type LargeSpace, type Limits, type Rows, type ShapeRegistration } from "./shape-registration";
import { readStep } from "./steps-evaluator";
import { marksProblem } from "./step-marks";
import { addColumn } from "../shapes/add-column";
import { mulColumn } from "../shapes/mul-column";
import { subColumn } from "../shapes/sub-column";
import { divFact } from "../shapes/div-fact";
import { factMul, type FactLimits, type FactQuestion } from "../shapes/facts";
import { missingFactor, type MissingLimits, type MissingQuestion } from "../shapes/missing";
import { skipCount, type SkipCountLimits, type SkipCountQuestion } from "../shapes/skip-count";
import { skipCountRegistration } from "./registrations/count-skip";
import { divFactRegistration } from "./registrations/div-fact";
import { factMulRegistration } from "./registrations/fact-mul";
import { missingFactorRegistration } from "./registrations/missing-factor";
import { mulColumnRegistration } from "./registrations/mul-column";

// Broken shapes. Every table row has one fault, and the harness must refuse it for that fault and no other.

type Add = Shape<AddLimits, AddQuestion>;
type Less = Shape<LessLimits, LessQuestion>;
type Fact = Shape<FactLimits, FactQuestion>;
type Skip = Shape<SkipCountLimits, SkipCountQuestion>;
type Missing = Shape<MissingLimits, MissingQuestion>;
interface Broken { shape: Shape; registration?: Partial<ShapeRegistration>; options?: Partial<HarnessOptions>; seeds?: number }

const add = (change: Partial<Add> = {}): Shape => ({ ...addShape, ...change }) as Shape;
const less = (change: Partial<Less> = {}): Shape => ({ ...lessShape, ...change }) as Shape;
const fact = (change: Partial<Fact> = {}): Shape => ({ ...factMul, ...change }) as Shape;
const skip = (change: Partial<Skip> = {}): Shape => ({ ...skipCount, ...change }) as Shape;
const addSpace = addRegistration.space as readonly Rows[];
const lessSpace = lessRegistration.space as LargeSpace;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const whole = wholeAnswer;

/** Steps of a question of test.add: the lines, the first of which writes the last line. */
const said = (...texts: string[]): Step[] => texts.map((text, i) => step(text, i === 0 && texts.length > 1 && /^\d+$/.test(texts[texts.length - 1]) ? [...texts[texts.length - 1]].reverse().map((d, at) => `w${d}@${at}`).join(" ") : ""));

const REAL = new Map([factMulRegistration, skipCountRegistration, missingFactorRegistration, divFactRegistration].map((reg) => [reg.id, reg]));
const REGISTRATIONS = new Map([addRegistration, lessRegistration, ...REAL.values()].map((reg) => [reg.id, reg]));

/** A few seeds are enough for a fault that every run meets. */
function check({ shape, registration, options, seeds = 32 }: Broken): ShapeReport {
  const full = { ...(REGISTRATIONS.get(shape.id) ?? plusOne(1, 2).registration), ...registration };
  const templates = REAL.has(shape.id) ? TEMPLATES : new Map([[short.id, short]]);
  const all = { templates, fingerprints: {}, ...(seeds === SEEDS ? {} : { madeLimits: 40 }), ...options };
  const report = seeds === SEEDS ? checkShape(shape, full, all) : runChecks(shape, full, seeds, all);
  if (options?.fingerprints !== undefined) return report;
  // A fingerprint that a test makes would be equal by construction; the tests of the fingerprints give one.
  return { ...report, failures: report.failures.filter((f) => !f.message.includes(`version ${shape.version} has no fingerprint`)) };
}
const checksOf = (report: ShapeReport) => report.failures.map((f) => f.check);

/** A question of test.add that no check asks for by name or by seed: only the list of the space reaches it. */
const QUIET: AddQuestion = { a: 16, b: 6 };
const isQuiet = (question: AddQuestion) => same(question, QUIET);
const onQuiet = <T>(normal: (question: AddQuestion) => T, quiet: T) => (question: AddQuestion): T => (isQuiet(question) ? quiet : normal(question));
/** A change of what the shape prints and reads for one question, the same in each part of the shape. */
const coordinated = (value: string, steps: Step[]): Partial<Add> => ({
  answer: onQuiet(addShape.answer, whole(value)),
  solveAgain: (rows) => { const item = addShape.solveAgain(rows); return item && isQuiet(item.question) ? { ...item, answer: whole(value) } : item; },
  steps: onQuiet(addShape.steps, steps),
});
/** Other facts of the registration for one question. */
const readQuiet = (change: object): Partial<ShapeRegistration> => ({
  read: (rows) => { const printed = addRegistration.read(rows); return printed && rows.join() === "16,+6" ? { ...printed, ...change } : printed; },
});
/** Steps of one question that the shape gives and the reader says too. */
const bothSay = (...steps: Step[]): Broken => ({ shape: add({ steps: onQuiet(addShape.steps, steps) }), registration: readQuiet({ steps }) });
const limitsOf = (name: string, rule: Partial<ReturnType<typeof rangeLimit>>): Partial<ShapeRegistration> => ({ limits: { ...addRegistration.limits, [name]: { ...addRegistration.limits[name], ...rule } } });
const wide = (limits: unknown) => same(limits, example.ADD_WIDE);
const middle = (limits: unknown) => same(limits, example.LESS_SMALL);

/** The template with other places on one side. */
function withPlaces(side: "front" | "back", change: (place: ColumnPlace) => object): Partial<HarnessOptions> {
  const template = columns2x4;
  const places = template.sides[side].places.map((p) => ({ ...p, ...change(p) }));
  return { templates: new Map([[template.id, { ...template, sides: { ...template.sides, [side]: { ...template.sides[side], places } } }]]) };
}
const first = columns2x4;
/** One template with few places is enough for a fault that every question or every limit has. */
const short: PageTemplate = { ...first, sides: { front: { ...first.sides.front, places: first.sides.front.places.slice(0, 4) }, back: { ...first.sides.back, places: first.sides.back.places.slice(0, 4) } } };
const narrow: PageTemplate = { ...first, id: "narrow", holds: { "digit places": 2 } };
const withNarrow = { templates: new Map([first, narrow].map((t) => [t.id, t])) };
const DIVISION = new Map(["facts-2x10", "brackets-2x6"].flatMap((id) => [...TEMPLATES.entries()].filter(([name]) => name === id)));
const reversedBack = withPlaces("back", (p) => ({ topCells: [...p.topCells].reverse() }));
/** Rows in either order, for a shape and a reader that take both. */
const eitherOrder = (rows: Rows): Rows => (rows.length === 2 && rows[0].startsWith("+") ? [rows[1], rows[0]] : rows);

/** A shape whose scores are wrong for limits that were never read: only a widened pair has such limits. */
function wrongForUnreadLimits(): Broken {
  const read = new Set([...addRegistration.cases, ...addRegistration.smallSpaces].map((c) => canonicalJson(c.limits)));
  return { shape: add({
    readLimits: (raw) => { const result = addShape.readLimits(raw); if (result.ok) read.add(canonicalJson(result.limits)); return result; },
    difficultyRange: (limits) => (read.has(canonicalJson(limits)) ? addShape.difficultyRange(limits) : { easiest: 1, hardest: 1 }),
  }) };
}

/** A shape that widens the limits that the book read, in place, so that no check of the limits can see it. */
function widensInTheBook(part: "generate" | "count"): Broken {
  const read = new WeakSet<AddLimits>();
  const widened = (limits: AddLimits): AddLimits => { if (read.has(limits)) limits.a = { min: 1, max: 30 }; return limits; };
  return { shape: add({
    readLimits: (raw) => { const result = addShape.readLimits(raw); if (result.ok) read.add(result.limits); return result; },
    ...(part === "generate" ? { generate: (l, seed) => addShape.generate(widened(l), seed) } : { count: (l) => addShape.count(widened(l)) }),
  }) };
}

/** A shape that widens the limits of a small space: an object that the harness asks for nothing else. */
function widensASmallSpace(): Broken {
  const [one, six] = addRegistration.smallSpaces;
  const own = { ...six.limits } as unknown as AddLimits;
  return { shape: add({ generate: (l, seed) => { if (l === own && seed.startsWith("seed-")) l.a = { min: 1, max: 30 }; return addShape.generate(l, seed); } }), registration: { smallSpaces: [one, { ...six, limits: own as unknown as Limits }] } };
}

/** A shape that reads limits a second time as limits that no question meets, and goes on with the first ones. */
function readsOtherLimits(): Broken {
  let calls = 0;
  const none: AddLimits = { ...example.ADD_WIDE, sum: { min: 2, max: 3 }, carry: { min: 1, max: 1 } };
  const real = (limits: AddLimits): AddLimits => (same(limits, none) ? example.ADD_WIDE : limits);
  return { shape: add({
    readLimits: (raw) => (same(raw, example.ADD_WIDE) && ++calls > 1 ? { ok: true, limits: none } : addShape.readLimits(raw)),
    generate: (l, seed) => addShape.generate(real(l), seed), count: (l) => addShape.count(real(l)),
    difficultyRange: (l) => addShape.difficultyRange(real(l)), worstCase: (l) => addShape.worstCase(real(l)),
  }) };
}

/** A shape that never gives one question of its large space, and a list by hand that leaves the same one out. */
function shortList(): Broken {
  const [small] = lessRegistration.smallSpaces;
  return {
    shape: less({ generate: (l, seed) => { const item = lessShape.generate(l, seed); return same(l, small.limits) && same(item.question, { a: 201, b: 6 }) ? lessShape.generate({ ...l, a: { min: 200, max: 200 }, b: { min: 5, max: 5 } }, seed) : item; } }),
    registration: { smallSpaces: [{ ...small, questions: small.questions.filter((rows) => rows.join() !== "201,-6") }] },
  };
}

/** A registration with one set of limits that any question meets. */
function oneSpace(): Broken {
  const { shape, registration } = plusOne(1, 2);
  const [{ limits }] = registration.cases;
  const three = { limit: "a", limits, inside: ["1", "+1"], outside: ["3", "+1"] };
  const read = (rows: Rows) => { const printed = registration.read(["2", "+1"]); return printed && rows.join() === "3,+1" ? { ...printed, features: { a: 3 } } : registration.read(rows); };
  return { shape, registration: {
    ...registration, read, witnesses: [three], smallSpaces: [{ name: "both", limits, questions: registration.space as readonly Rows[] }],
    limits: { a: { ...registration.limits.a, values: fc.constantFrom(limits.a, { min: 3, max: 3 }) } }, refusedRows: [{ name: "four", rows: ["4", "+1"] }],
  } };
}

/** A shape that says the steps of one question in another true way, only the second time after its fingerprint. */
function changingSteps(): Broken {
  let calls = 0;
  const shape = add({ steps: (question) => (same(question, { a: 22, b: 2 }) && ++calls === 2 ? [step("22 + 2 = 24", "w4@0 w2@1"), step("24")] : addShape.steps(question)) });
  const fingerprints = { "test.add": { 1: shapeFingerprint(shape, addRegistration) } };
  calls = 0;
  return { shape, options: { fingerprints }, seeds: SEEDS };
}

let shared: Item<AddQuestion> = addItem(QUIET);
type Refused = [check: Check, fault: string, broken: () => Broken, message: RegExp];
const REFUSED: readonly Refused[] = [
  ["registration", "an empty list", () => ({ shape: add(), registration: { cases: [] } }), /cases must not be empty/],
  ["registration", "a space with a question that the reader refuses", () => ({ shape: add(), registration: { space: [...addSpace, ["31", "+1"]] } }), /the space lists \["31","\+1"\] and the reader finds no question/],
  ["registration", "a space that lists a question twice", () => ({ shape: add({ count: (l) => addQuestions(l).length + (addQuestions(l).some((q) => same(q, { a: 1, b: 1 })) ? 1 : 0) }), registration: { space: [["1", "+1"], ...addSpace] } }), /lists a question twice/],
  ["registration", "an end of a large space outside its limits", () => ({ shape: less(), registration: { space: { ...lessSpace, easiest: (l: Limits) => (middle(l) ? ["700", "-40"] : lessSpace.easiest(l)) } } }), /an end of the space is outside its limits/],
  ["registration", "a reader that says no width", () => ({ shape: add(), registration: { read: (rows) => { const p = addRegistration.read(rows); return p && { ...p, widths: {} }; } } }), /the reader of \["1","\+1"\] says no width/],
  ["registration", "a reader that says one more width of one question", () => ({ shape: add(), registration: readQuiet({ widths: { sum: 22, more: 1 } }) }), /the reader of \["16","\+6"\] says the widths sum, more and for other questions sum/],
  ["witness", "an outside witness that is inside", () => ({ shape: add(), registration: { witnesses: addRegistration.witnesses.map((w) => (w.limit === "carry" ? { ...w, outside: w.inside } : w)) } }), /must break only "carry" and breaks: nothing/],
  ["witness", "an inside witness that is outside", () => ({ shape: add(), registration: { witnesses: addRegistration.witnesses.map((w) => (w.limit === "carry" ? { ...w, inside: w.outside } : w)) } }), /must meet all limits and breaks: carry/],
  ["witness", "an outside witness of another limit", () => ({ shape: add(), registration: { witnesses: [...addRegistration.witnesses, { ...addRegistration.witnesses[0], limit: "b" }] } }), /must break only "b" and breaks: a/],
  ["arbitrary", "a constant", () => ({ shape: add(), registration: limitsOf("a", { values: fc.constant({ min: 1, max: 30 }) }) }), /the limit "a" never changes/],
  ["arbitrary", "a rule that breaks when it is asked for a value", () => ({ shape: add(), registration: limitsOf("a", { values: Object.assign(rangeLimit(1, 30).values.map((v) => v), { canShrinkWithoutContext: () => { throw new Error("broken rule"); } }) }) }), /threw broken rule/],
  ["arbitrary", "a filter that drops cases", () => ({ shape: add(), registration: limitsOf("a", { values: rangeLimit(1, 30).values.filter((v) => (v as { min: number; max: number }).min !== (v as { min: number; max: number }).max) }) }), /the limit "a" never has the registered value \{"max":7,"min":7\}/],
  ["arbitrary", "a filter that nothing passes", () => ({ shape: add(), options: { timeLimitMs: 60 }, registration: limitsOf("a", { values: rangeLimit(1, 30).values.filter(() => performance.now() < 0) }) }), /Script execution timed out after 60ms/],
  ["read-limits", "a field that is not a limit", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return read.ok ? { ...read, ignored: true } : read; } }) }), /is read as .*"ignored":true/],
  ["refused-limits", "limits outside the bounds", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return (raw as AddLimits | null)?.a?.min === -1 ? { ok: true, limits: raw as AddLimits } : read; } }) }), /must be refused with a problem that names "a"/],
  ["refused-limits", "a problem that does not name the limit", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return !read.ok && read.problem.startsWith("roundSum") ? { ok: false, problem: "bad word" } : read; } }) }), /names "roundSum"/],
  ["refused-limits", "another problem text than the named one", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return !read.ok && read.problem === "the limits must be an object" ? { ok: false, problem: "bad" } : read; } }) }), /"not an object" gave/],
  ["refused-limits", "a field beside the problem", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return read.ok ? read : { ...read, ignored: true }; } }) }), /gave \{"ignored":true/],
  ["refused-limits", "limits that no question meets", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return !read.ok && read.problem === "no question meets these limits" && !same(raw, addRegistration.refusedLimits[2].raw) ? { ok: true, limits: raw as AddLimits } : read; } }) }), /are accepted and no question meets them/],
  ["refused-limits", "an unknown limit", () => ({ shape: add({ readLimits: (raw) => { const more = raw as Record<string, unknown> | null; return addShape.readLimits(typeof more === "object" && more !== null && Object.hasOwn(more, "another-limit") ? Object.fromEntries(Object.entries(more).filter(([k]) => k !== "another-limit")) : raw); } }) }), /names "another-limit"/],
  ["refused-limits", "an unknown limit with a name that each object inherits", () => ({ shape: add({ readLimits: (raw) => { const more = raw as Record<string, unknown> | null; return addShape.readLimits(typeof more === "object" && more !== null && Object.hasOwn(more, "constructor") ? Object.fromEntries(Object.entries(more).filter(([k]) => k !== "constructor")) : raw); } }) }), /names "constructor"/],
  ["count", "one too many", () => ({ shape: add({ count: (l) => addShape.count(l) + (wide(l) ? 1 : 0) }) }), /allow 270 questions and the count is 271/],
  ["count", "one too many in a large space", () => ({ shape: less({ count: (l) => lessShape.count(l) + (middle(l) ? 1 : 0) }) }), /allow 78 questions and the count is 79/],
  ["count", "a question where there is none", () => ({ shape: add({ count: (l) => Math.max(1, addShape.count(l)) }) }), /no question meets .* and the count is 1/],
  ["difficulty-range", "an end that no question reaches", () => ({ shape: add({ difficultyRange: (l) => ({ ...addShape.difficultyRange(l), ...(wide(l) ? { hardest: 110 } : {}) }) }) }), /reach from 1 to 109 and the range is 1 to 110/],
  ["difficulty-range", "an end that no question reaches in a large space", () => ({ shape: less({ difficultyRange: (l) => ({ ...lessShape.difficultyRange(l), ...(same(l, example.LESS_WIDE) ? { hardest: 100 } : {}) }) }) }), /reach from 1 to 99 and the range is 1 to 100/],
  ["difficulty-range", "a field that is no end", () => ({ shape: add({ difficultyRange: (l) => ({ ...addShape.difficultyRange(l), ...(wide(l) ? { ignored: 1 } : {}) }) }) }), /"ignored":1/],
  ["worst-case", "a question that is not the widest", () => ({ shape: add({ worstCase: (l) => (wide(l) ? addItem({ a: 30, b: 8 }) : addShape.worstCase(l)) }) }), /with sum 38, and the widest has 39/],
  ["worst-case", "a question outside the limits", () => ({ shape: add({ worstCase: (l) => (same(l, example.ADD_ONE) ? addItem({ a: 30, b: 9 }) : addShape.worstCase(l)) }) }), /which is outside the limits/],
  ["worst-case", "a question of fewer digit places than the widest", () => { const { shape, registration } = digitsVary(); return { shape: { ...shape, worstCase: (l) => shape.worstCase(reaches(l, 98) ? { a: { min: 98, max: 98 } } : l) }, registration }; }, /needs 2 digit places and the widest question needs 3/],
  ["widening", "scores that fall when the limits grow", wrongForUnreadLimits, /have the count \d+ and the scores 1 to 1/],
  ["small-space", "a question that no seed gives", () => ({ shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return same(l, example.ADD_SIX) && item.question.a === 22 && item.question.b === 4 ? addItem({ a: 21, b: 4 }) : item; } }) }), /no seed like "seed-0" gives \["22","\+4"\]/],
  ["small-space", "a question that no seed of the old family gives", () => ({ shape: add({ generate: (l, seed) => (seed.startsWith("seed-") ? addItem(addQuestions(l)[0]) : addShape.generate(l, seed)) }) }), /no seed like "seed-0"/],
  ["small-space", "a list that leaves out a question", () => ({ shape: add(), registration: { smallSpaces: [addRegistration.smallSpaces[0], { ...addRegistration.smallSpaces[1], questions: addRegistration.smallSpaces[1].questions.slice(1) }] } }), /has the question \["21","\+2"\], which its list does not/],
  ["small-space", "a list with a question that is outside", () => ({ shape: add(), registration: { smallSpaces: [addRegistration.smallSpaces[0], { ...addRegistration.smallSpaces[1], questions: [...addRegistration.smallSpaces[1].questions, ["22", "+5"]] }] } }), /no seed like "seed-0" gives \["22","\+5"\]/],
  ["small-space", "a list with a question twice", () => ({ shape: add(), registration: { smallSpaces: [addRegistration.smallSpaces[0], { ...addRegistration.smallSpaces[1], questions: [...addRegistration.smallSpaces[1].questions, ["22", "+4"]] }] } }), /lists 7 questions and the rules allow 6/],
  ["small-space", "a list of a large space that leaves out a question that no seed gives", shortList, /lists 3 questions and the rules allow 4/],
  ["small-space", "a generate that widens the limits of a small space", widensASmallSpace, /threw Cannot assign to read only property 'a'/],
  ["plain", "a field with no value", () => ({ shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return { ...item, question: { ...item.question, note: undefined } }; } }) }), /holds a value that is not plain data/],
  ["plain", "a question that is not a finite number, in every part of the shape", () => ({ shape: add({ solveAgain: (rows) => { const item = addShape.solveAgain(rows); return item && isQuiet(item.question) ? { ...item, question: { ...item.question, note: Number.NaN } } : item; }, face: (question) => addShape.face(question) }) }), /holds a value that is not plain data/],
  ["determinism", "another question for the same seed", () => { let last = ""; return { shape: add({ generate: (l, seed) => { const key = canonicalJson([l, seed]); const again = key === last; last = again ? "" : key; return addShape.generate(l, again ? `${seed} again` : seed); } }) }; }, /gave .*, then /],
  ["determinism", "one object that changes", () => ({ shape: add({ generate: (l, seed) => { shared = Object.assign(shared, addShape.generate(l, seed)); return shared; } }) }), /gave the same object twice/],
  ["determinism", "a question object that two calls share", () => { const known = new Map<string, AddQuestion>(); return { shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); const key = canonicalJson(item.question); if (!known.has(key)) known.set(key, item.question); return { ...item, question: known.get(key) ?? item.question }; } }) }; }, /gave the same object twice/],
  ["determinism", "other steps the second time", changingSteps, /the steps or the score of .* changed/],
  ["inside", "a question outside the limits", () => ({ seeds: SEEDS, shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return same(l, addRegistration.cases[1].limits) && item.question.b === 9 ? addItem({ a: 11, b: 9 }) : item; } }) }), /gave \["11","\+9"\], which is outside the limits/],
  ["inside", "questions for limits that no question meets", readsOtherLimits, /which is outside the limits/],
  ["answer", "another answer for one seed of a small space", () => ({ shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return seed === "seed-0" ? { ...item, answer: whole("1") } : item; } }) }), /holds the answer .*"1".* and the shape answers/],
  ["answer-form", "a word, in every part of the shape and in the reader", () => ({ shape: add(coordinated("ok", [step("16 + 6 = 22", "w2@0 w2@1"), step("ok")])), registration: readQuiet({ answer: whole("ok"), steps: [step("16 + 6 = 22", "w2@0 w2@1"), step("ok")] }) }), /"ok"\}\]\} is no answer of the kind "whole-number"/],
  ["answer-form", "a zero in front", () => ({ shape: add(coordinated("02", [step("1 + 1 = 2", "w2@0"), step("02")])), registration: readQuiet({ answer: whole("02"), steps: [step("1 + 1 = 2", "w2@0"), step("02")] }) }), /"02"\}\]\} is no answer/],
  ["independent-answer", "a wrong answer in every part of the shape", () => ({ shape: add(coordinated("23", said("17 + 6 = 23", "23"))), registration: readQuiet({ steps: said("17 + 6 = 23", "23") }) }), /the answer is .*"23".* and \["16","\+6"\] reads as .*"22"/],
  ["printed", "a plus that the shape reads as a plus and the child as another sign", () => ({ shape: add({ face: onQuiet(addShape.face, { kind: "column", top: "16", sign: "×", bottom: "6" }), solveAgain: (rows) => addShape.solveAgain(rows.join() === "16,×6" ? ["16", "+6"] : rows) }) }), /the independent reader finds no question in \["16","×6"\]/],
  ["printed", "a sign that the fonts do not hold", () => ({ shape: add({ face: onQuiet(addShape.face, { kind: "column", top: "16", sign: "✚", bottom: "6" }), solveAgain: (rows) => addShape.solveAgain(rows.join() === "16,✚6" ? ["16", "+6"] : rows) }), registration: { read: (rows) => addRegistration.read(rows.join() === "16,✚6" ? ["16", "+6"] : rows) } }), /the fonts cannot print/],
  ["printed", "rows that are read as another question", () => ({ shape: add({ solveAgain: (rows) => (rows.join() === "16,+6" ? addItem({ a: 18, b: 6 }) : addShape.solveAgain(rows)) }) }), /\["16","\+6"\] is printed as \["18","\+6"\]/],
  ["solve-again", "no second answer for one question", () => ({ shape: add({ solveAgain: (rows) => (rows.join() === "16,+6" ? null : addShape.solveAgain(rows)) }) }), /solveAgain finds no question in \["16","\+6"\]/],
  ["solve-again", "another second answer for one question", () => ({ shape: add({ solveAgain: (rows) => (rows.join() === "16,+6" ? { question: QUIET, answer: whole("23") } : addShape.solveAgain(rows)) }) }), /solveAgain\(\["16","\+6"\]\) gave .*"23"/],
  ["steps-end", "an end that is not the answer", () => bothSay(...said("6 + 6 = 12", "12")), /the steps end in "12" and not in "22"/],
  ["steps-end", "no step", () => bothSay(), /the steps end in undefined/],
  ...[1.5, true, null, 7].map((text): Refused => ["steps-end", `a step that is ${text} and no text`, () => bothSay({ ...step("16 + 6 = 22", "w2@0 w2@1"), text: text as unknown as string }, step("22")), new RegExp(`the step ${text} cannot be printed`)]),
  ["steps-end", "a step that the fonts cannot print", () => bothSay(...said("22", "22").map((s, i) => (i === 0 ? step("16 + 6 = 22", "w2@0 w2@1") : { ...s, text: "✚" }))), /the step "✚" cannot be printed/],
  ["steps-true", "a false step that the reader says too", () => bothSay(...said("6 + 6 = 12", "10 + 12 = 23", "22")), /holds "10 \+ 12 = 23"/],
  ["steps-true", "a false step with a negative result that the reader says too", () => bothSay(...said("2 - 3 = -2", "22")), /holds "2 - 3 = -2"/],
  ["steps-true", "a step with an equals sign that nothing can read", () => bothSay(...said("6 and 6 = 12", "22")), /cannot read "6 and 6 = 12"/],
  ["steps-true", "a step with an unknown prose clause that the reader says too", () => bothSay(step("6 + 6 = 12, as you know", "w2@0 w2@1"), step("22")), /cannot read "as you know"/],
  ["steps-true", "a step with a repeated carry that the reader says too", () => bothSay(step("6 + 6 = 12, write 2, carry 1, carry 2", "w2@0 c1@1"), step("1, plus 1 is 2", "w2@1"), step("22")), /holds "carry 2"/],
  ["steps-true", "a step with a wrong plus result that the reader says too", () => bothSay(step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("1, plus 1 is 99", "w2@1"), step("22")), /holds "plus 1 is 99"/],
  ...([
    ["an explicit write on the last column", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("1, plus 1 is 2, write 2", "w2@1"), step("22")]],
    ["the same marks in another order", [step("6 + 6 = 12, write 2, carry 1", "c1@1 w2@0"), step("1, plus 1 is 2", "w2@1"), step("22")]],
  ] as [string, Step[]][]).map(([fault, steps]): Refused => ["steps-reader", fault, () => ({ shape: add({ steps: onQuiet(addShape.steps, steps) }) }), /the steps are .* and must be .*"6 \+ 6 = 12, write 2, carry 1"/]),
  ...([
    ["a place that no step writes", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("22")], /write "2" and not the answer "22"/],
    ["a place that two steps write", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("1, plus 1 is 2", "w2@1 w2@0"), step("22")], /write the place 0 more than once/],
    ["another digit than the answer has", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("1, plus 1 is 2", "w1@1"), step("22")], /write "12" and not the answer "22"/],
    ["a place above the answer", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("1, plus 1 is 2", "w2@2"), step("22")], /write the place 2 and the answer is "22"/],
    ["a place far above the answer", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("1, plus 1 is 2", "w2@1000000000"), step("22")], /write the place 1000000000 and the answer is "22"/],
    ["a last step that writes", [step("16 + 6 = 22", "w2@0"), step("22", "w2@1")], /the last step draws something/],
    ["a mark of no kind", [{ text: "16 + 6 = 22", marks: [{ mark: "circle", place: 0, digit: "2" }] }, step("22")], /"16 \+ 6 = 22" holds a mark that is not one/],
    ["a mark of two digits", [{ text: "16 + 6 = 22", marks: [{ mark: "write", place: 0, digit: "22" }] }, step("22")], /holds a mark that is not one/],
    ["a mark at no place", [{ text: "16 + 6 = 22", marks: [{ mark: "write", place: -1, digit: "2" }] }, step("22")], /holds a mark that is not one/],
    ["a mark with a field more", [{ text: "16 + 6 = 22", marks: [{ mark: "write", place: 0, digit: "2", color: "red" }] }, step("22")], /holds a mark that is not one/],
    ["a step with a field more", [{ ...step("16 + 6 = 22", "w2@0 w2@1"), note: "" }, step("22")], /is not a text with marks/],
    ["a step that writes another digit than its equation gives", [step("1 + 2 = 3, write 3", "w2@0"), step("2, write 2", "w2@1"), step("22")], /says "write 3" and must write "3"|writes "2" and must write "3"/],
    ["a carry that is not said", [step("1 + 1 = 2, write 2", "w2@0 c1@1"), step("1, plus 1 is 2", "w2@1"), step("22")], /says no carry and carries 1/],
    ["a carry that is said and not drawn", [step("6 + 6 = 12, write 2, carry 1", "w2@0"), step("1, plus 1 is 2", "w2@1"), step("22")], /says "carry 1" and carries nothing/],
    ["a carry of 0", [step("1 + 1 = 2, write 2", "w2@0 c0@1"), step("2, write 2", "w2@1"), step("22")], /carries 0/],
    ["two carries of one step", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1 c1@1"), step("1, plus 1 is 2", "w2@1"), step("22")], /has 2 carries/],
    ["a carry above its own column", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@0"), step("1, plus 1 is 2", "w2@1"), step("22")], /its carry stands at the place 0 and must stand at 1/],
    ["a carry two places above its column", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@2"), step("1, plus 1 is 2", "w2@1"), step("22")], /its carry stands at the place 2 and must stand at 1/],
    ["a carry that the next column does not add", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("1 + 1 = 2", "w2@1"), step("22")], /carries 1 and .* adds nothing/],
    ["a carry that the next column adds as another number", [step("15 + 7 = 22, write 2, carry 2", "w2@0 c2@1"), step("1, plus 1 is 2", "w2@1"), step("22")], /carries 2 and .* adds 1/],
    ["a column that adds a carry that no step made", [step("1 + 1 = 2, write 2", "w2@0"), step("1, plus 1 is 2", "w2@1"), step("22")], /carries nothing and .* adds 1/],
    ["a first column that adds a carry", [step("1, plus 1 is 2, write 2", "w2@0"), step("2, write 2", "w2@1"), step("22")], /the first step adds 1/],
    ["a carry that the step of another place adds", [step("6 + 6 = 12, write 2, carry 1", "w2@0 c1@1"), step("1, plus 1 is 2, write 2", "w2@1"), step("0, write 0", ""), step("22")], /writes nothing/],
    ["one whole equation", [step("16 + 6 = 22", "w2@0 w2@1"), step("22")], /1 columns and the paper has 2/],
    ["the columns of another question with the same answer", [step("5 + 7 = 12, write 2, carry 1", "w2@0 c1@1"), step("1, plus 1 is 2", "w2@1"), step("22")], /says 5 \+ 7 and the paper shows 6 \+ 6/],
  ] as [string, Step[], RegExp][]).map(([fault, steps, message]): Refused => ["steps-marks", fault, () => bothSay(...steps), message]),
  ["steps-reader", "other steps than the reader says", () => ({ shape: add(), registration: readQuiet({ steps: said("12 + 10 = 22", "22") }) }), /the steps are .* and must be .*"12 \+ 10 = 22"/],
  ["steps-reader", "a reader that says no steps", () => ({ shape: add(), registration: readQuiet({ steps: undefined }) }), /the steps are .* and must be undefined/],
  ["difficulty", "a score that is not a number", () => ({ shape: add({ difficulty: onQuiet(addShape.difficulty, Number.NaN), difficultyRange: addShape.difficultyRange }) }), /the score is NaN/],
  ["difficulty", "a score past the hardest, which the registration has wrong too", () => ({ seeds: SEEDS, shape: less({ difficultyRange: (l) => (middle(l) ? { easiest: 40, hardest: 41 } : lessShape.difficultyRange(l)) }), registration: { space: { ...lessSpace, hardest: (l: Limits) => (middle(l) ? ["500", "-41"] : lessSpace.hardest(l)) } } }), /has the score \d+, outside 40 to 41/],
  ["width", "a question wider than the worst case, which the registration has wrong too", () => ({ seeds: SEEDS, shape: less({ worstCase: (l) => lessShape.worstCase(middle(l) ? { ...l, left: { min: 440, max: 441 } } : l) }), registration: { space: { ...lessSpace, widest: (l: Limits) => lessSpace.widest(middle(l) ? { ...l, left: { min: 440, max: 441 } } : l) } } }), /has left 4\d\d, wider than 441/],
  ["width", "a question of more digit places than the worst case, which the registration has wrong too", () => {
    const { shape, registration } = digitsVary();
    const all = registration.space as readonly Rows[];
    const inside = (l: Limits) => all.filter((rows) => rangeLimit(1, 120).allows(Number(rows[0]), l.a));
    const large: LargeSpace = { count: (l) => inside(l).length, easiest: (l) => inside(l)[0], hardest: (l) => inside(l).at(-1) ?? [], widest: (l) => inside(l)[0] };
    return { seeds: SEEDS, shape: { ...shape, worstCase: (l) => shape.worstCase({ a: { min: (l as PlusOneLimits).a.min, max: (l as PlusOneLimits).a.min } }) }, registration: { ...registration, space: large } };
  }, /needs 3 digit places, more than 2/],
  ["harder", "one score for all", () => ({ shape: add({ difficulty: () => 5, difficultyRange: () => ({ easiest: 5, hardest: 5 }) }) }), /"a carry": the score of .* is 5 and of .* is 5/],
  ["examples", "other true steps than the example", () => ({ shape: add({ steps: ({ a, b }) => (a === 17 && b === 6 ? [step("7 + 6 = 13, write 3, carry 1", "w3@0 c1@1"), step("1, plus 1 is 2, write 2", "w2@1"), step("23")] : addShape.steps({ a, b })) }), registration: { read: (rows) => { const p = addRegistration.read(rows); return p && rows.join() === "17,+6" ? { ...p, steps: [step("7 + 6 = 13, write 3, carry 1", "w3@0 c1@1"), step("1, plus 1 is 2, write 2", "w2@1"), step("23")] } : p; } } }), /"a carry" gives .*plus 1 is 2, write 2/],
  ["examples", "another answer in the registration", () => ({ shape: add(), registration: { examples: [{ ...addRegistration.examples[0], answer: whole("33") }] } }), /"a carry" gives .*"23"/],
  ["refused-rows", "a zero in front of a number", () => ({ shape: add({ solveAgain: (rows) => addShape.solveAgain(rows[0] === "017" ? ["17", rows[1]] : rows) }) }), /\["017","\+6"\]: the shape reads .* and the reader refuses it/],
  ["refused-rows", "named rows", () => ({ shape: add({ solveAgain: (rows) => (rows[0] === "31" ? addItem({ a: 30, b: 3 }) : addShape.solveAgain(rows)) }) }), /\["31","\+3"\]: the shape reads/],
  ["refused-rows", "named rows that the shape reads as a question with no answer", () => ({ shape: add({ solveAgain: (rows) => (rows[0] === "31" ? ({ question: { a: 31, b: 3 } } as never) : addShape.solveAgain(rows)) }) }), /\["31","\+3"\]: the shape reads .* and must refuse it/],
  ["refused-rows", "named rows that the shape and the reader accept", () => ({ shape: add(), registration: { refusedRows: [{ name: "a good question", rows: ["2", "+2"] }] } }), /the reader accepts "a good question"/],
  ...([
    ["a question too few", (l) => ((l.tables.length > 5 ? factMul.list?.(l).slice(1) : factMul.list?.(l)) ?? []), /the list of .* has 120 questions, 120 of them different, and the limits allow 121/],
    ["a question twice in the place of another", (l) => { const all = factMul.list?.(l) ?? []; return all.length > 100 ? [...all.slice(1), all[1]] : all; }, /has 121 questions, 120 of them different/],
    ["a question outside the limits in the place of another", (l) => { const all = factMul.list?.(l) ?? []; return l.second.min > 1 ? [{ a: all[0].a, b: 0 }, ...all.slice(1)] : all; }, /has \["\d+×0=□"\], which is outside the limits/],
  ] as [string, (l: FactLimits) => FactQuestion[], RegExp][]).map(([fault, list, message]): Refused => ["list", `a list with ${fault}`, () => ({ shape: fact({ list }) }), message]),
  ...([
    ["rows that go down in the place of up", (row, l) => (l.order === "up" ? row.reverse() : row), /has \["\d+×\d+=□"\] after \["\d+×\d+=□"\]/],
    ["no rows for limits that ask for some", (row, l) => (l.order === "down" ? null : row), /gave no rows and the limits ask for some/],
    ["one row twice", (row) => row, /gave one row twice/],
    ["a row that leaves out a question of the table", (row) => (row.length > 3 ? [...row.slice(0, 2), ...row.slice(3), row[2]] : row), /has \[.*\] after \[/],
  ] as [string, (row: FactQuestion[], l: FactLimits) => FactQuestion[] | null, RegExp][]).map(([fault, change, message]): Refused =>
    ["ordered-row", fault, () => ({ shape: fact({ orderedRuns: (l, items) => {
      const runs = factMul.orderedRuns?.(l, items)?.map((run) => change(run, l)) ?? null;
      if (!runs || runs.includes(null)) return null;
      const rows = runs.filter((run) => run !== null);
      return fault === "one row twice" ? [...rows, [...rows[0]]] : rows;
    } }) }), message]),
  ...([
    ["a form too few", (l) => missingFactor.forms?.(l).slice(0, 1) ?? [], /the form "equation \S+" is not one of the forms/],
    ["a form twice", (l) => { const all = missingFactor.forms?.(l) ?? []; return [...all, all[0]]; }, /have "equation \S+" twice/],
  ] as [string, NonNullable<Missing["forms"]>, RegExp][]).map(([fault, forms, message]): Refused => ["forms", fault, () => ({ shape: { ...missingFactor, forms } as Shape }), message]),
  ...([
    ["the same question", (q, l) => ({ question: { ...q }, inLimits: factMul.swapped?.(q, l)?.inLimits ?? true }), /the swapped form of .* is \["\d+×\d+=□"\] and must be/],
    ["a swapped form of a square", (q, l) => (q.a === q.b ? { question: { a: q.b, b: q.a }, inLimits: true } : factMul.swapped?.(q, l) ?? null), /the swapped form of \["(\d+)×\1=□"\] .* must be none/],
    ["no swapped form of one question", (q, l) => (q.a === 5 && q.b === 7 ? null : factMul.swapped?.(q, l) ?? null), /the swapped form of \["5×7=□"\] .* is none and must be \["7×5=□"\]/],
    ["another question with the same answer", (q, l) => (q.a === 2 && q.b === 6 ? { question: { a: 3, b: 4 }, inLimits: true } : factMul.swapped?.(q, l) ?? null), /is \["3×4=□"\] and must be \["6×2=□"\]/],
    ["a wrong report of the limits", (q, l) => { const s = factMul.swapped?.(q, l) ?? null; return s && { ...s, inLimits: true }; }, /is outside the limits and the shape says the other/],
  ] as [string, NonNullable<Fact["swapped"]>, RegExp][]).map(([fault, swapped, message]): Refused => ["swapped", fault, () => ({ shape: fact({ swapped }) }), message]),
  ["list", "two questions of one list that are said to be the same", () => ({ shape: fact({ identity: ({ a, b }) => (a === 0 ? a : { a, b }) }) }), /the list of .* has two questions with one identity/],
  ["swapped", "a swapped form with the same answer, where it must have another", () => ({ shape: fact(), registration: { swapChangesAnswer: true } }), /has the answer .* and the question/],
  ["swapped", "a swapped form with another answer, where it must have the same", () => ({ shape: divFact as Shape, registration: { swapChangesAnswer: undefined }, options: { templates: DIVISION } }), /has the answer .* and the question/],
  ["swapped", "swapped forms that the registration does not know", () => ({ shape: fact(), registration: { swapped: undefined } }), /the shape has swapped forms and the registration says the other/],
  ["steps-marks", "a stack that is said to be worked in lines", () => ({ shape: add(), registration: { working: "lines" } }), /a column stack must be worked in columns/],
  ["steps-marks", "a stack that is said to be worked as a division", () => ({ shape: add(), registration: { working: "division" } }), /a column stack must be worked in columns/],
  ["steps-marks", "a fact that is said to be worked in columns", () => ({ shape: fact(), registration: { working: "columns" } }), /the steps write "" and not the answer/],
  ...([
    ["draw something", [step("5 × 7 = 35", "w5@0 w3@1"), step("35")], /is not a text that draws nothing/],
    ["say a written digit", [step("5 × 7 = 35, write 35"), step("35")], /"5 × 7 = 35, write 35" is not one equation with a whole number/],
    ["have no line", [step("35")], /no step comes to "35", the value of the part "answer"/],
    ["come to another number", [step("5 × 6 = 30"), step("35")], /no step comes to "35", the value of the part "answer"/],
    ["hold a plain number", [step("5 × 7 = 35"), step("35"), step("35")], /the step "35" is not one equation/],
    ["come to a number that is not whole", [step("5 × 7 = 35"), step("7 ÷ 2 = 3.5"), step("35")], /the step "7 ÷ 2 = 3\.5" is not one equation with a whole number/],
  ] as [string, Step[], RegExp][]).map(([fault, steps, message]): Refused => ["steps-marks", `lines that ${fault}`, () => ({
    shape: fact({ steps: (q) => (q.a === 5 && q.b === 7 ? steps : factMul.steps(q)) }),
    registration: { read: (rows) => { const p = factMulRegistration.read(rows); return p && rows.join() === "5×7=□" ? { ...p, steps } : p; }, examples: factMulRegistration.examples.slice(1) },
  }), message]),
  ["book", "a back side that reverses the digits", () => ({ shape: add(), options: reversedBack }), /back side, question \d \(/],
  ["book", "a generate that widens the limits of the book", () => widensInTheBook("generate"), /threw Cannot assign to read only property 'a'/],
  ["book", "a count that widens the limits of the book", () => widensInTheBook("count"), /threw Cannot assign to read only property 'a'/],
  ["layout", "a back side that turns the rows, which the shape and the reader accept", () => ({ shape: add({ solveAgain: (rows) => addShape.solveAgain(eitherOrder(rows)) }), options: withPlaces("back", (p) => ({ topCells: p.bottomCells, bottomCells: p.topCells })), registration: { read: (rows) => addRegistration.read(eitherOrder(rows)) } }), /prints \["\+\d","\d+"\] and the first place prints/],
  ["evidence", "a template that no page of the book fills", () => ({ ...plusOne(1, 120), seeds: 1, options: withNarrow }), /no page of the book fills narrow, front side and narrow, back side/],
  ["evidence", "limits that are all the same, so that nothing can be wider", oneSpace, /and 1 limits were used/],
  ["evidence", "no seeds", () => ({ shape: add(), seeds: 0 }), /seeds of 0/],
  ["fingerprint", "another output with the same version", () => ({ shape: add(), options: { fingerprints: { "test.add": { 1: "0".repeat(64) } } } }), /the output changed and the version is still 1/],
];

describe("the harness refuses", () => {
  it("accepts the two example shapes", () => {
    for (const shape of [add(), less()]) {
      const registration = shape.id === "test.add" ? addRegistration : lessRegistration;
      const report = check({ shape, seeds: SEEDS, options: { fingerprints: { [shape.id]: { 1: shapeFingerprint(shape, registration) } } } });
      expect(report.failures).toEqual([]);
      expect(report.evidence.seeds).toBeGreaterThanOrEqual(1000);
    }
  });

  it("has steps and marks written by hand for questions of test.less, and the production writer and its reader say the same", () => {
    expect(BY_HAND.length).toBeGreaterThan(1);
    for (const { a, b, steps } of BY_HAND) {
      expect(lessShape.steps({ a, b })).toBe(steps);
      expect(marksProblem(steps, String(a - b), [String(a), `-${b}`])).toBeNull();
      expect(subColumn.steps({ a, b })).toEqual(steps);
      expect(lessRegistration.examples.map((e) => e.steps)).toContain(steps);
    }
  });

  it.each(REFUSED)("%s: %s", (name, _fault, broken, message) => {
    const report = check(broken());
    expect(report.failures.map((f) => f.message).join("\n")).toMatch(message);
    expect(checksOf(report)).toEqual([name]);
    expect(report.failures[0].message).toMatch(/^\[(?:test\.(?:add|less|plus)|fact\.mul|div\.fact|count\.skip|missing\.factor)\] [a-z-]+: .*\(fast-check seed 236\)$/);
  });

  it("has a broken shape for each check", () => {
    expect([...new Set(REFUSED.map(([name]) => name))].sort()).toEqual([...CHECKS].sort());
  });
});

describe("wrong shapes that touch more than one check", () => {
  const bad = (change: Partial<Add>): Broken => ({ shape: add(change) });
  const registered: AddLimits = example.ADD_WIDE;
  it.each<[string, Check[], () => Broken]>([
    ["that gives one question for each seed of the form that the build makes", ["inside", "book"], () => ({ ...bad({ generate: (l, seed) => (/^[0-9a-f]{64}$/.test(seed) ? addShape.generate(registered, "a".repeat(64)) : addShape.generate(l, seed)) }), seeds: SEEDS, options: { maxQuestions: 12000 } })],
    ["that gives one question for each first try of a place", ["inside", "small-space"], () => bad({ generate: (l, seed) => (seed === seedFrom(seedFrom("child", "six questions", 3), "front", "row", 0, 0) ? addItem({ a: 30, b: 9 }) : addShape.generate(l, seed)) })],
    ["that answers with a word in every part", ["answer-form", "independent-answer"], () => {
      const word = <T extends { answer: Answer }>(item: T): T => ({ ...item, answer: whole("cat") });
      return bad({ answer: (q) => word(addItem(q)).answer, generate: (l, s) => word(addShape.generate(l, s)), worstCase: (l) => word(addShape.worstCase(l)), solveAgain: (rows) => { const item = addShape.solveAgain(rows); return item && word(item); }, steps: () => said("cat") });
    }],
    ["that prints another sign than it computes", ["printed"], () => bad({ face: (q) => ({ ...addShape.face(q), sign: "×" }) as Face, solveAgain: (rows) => addShape.solveAgain(rows.map((row) => row.replace("×", "+"))) })],
    ["that prints a face that no template takes", ["printed", "book"], () => bad({ face: (q) => ({ ...addShape.face(q), kind: "story" as "column" }) as Face })],
    ["that answers with a number in place of text", ["answer-form"], () => bad({ ...coordinated(22 as never, said("22")) })],
    ["with a count that is not a number", ["count", "widening"], () => bad({ count: () => Number.NaN })],
    ["with a count that has no end", ["count"], () => bad({ count: () => Number.POSITIVE_INFINITY })],
    ["with a count that is not a whole number", ["count"], () => bad({ count: (l) => addShape.count(l) + 0.5 })],
    ["with a range that is not a number", ["difficulty-range", "widening"], () => bad({ difficultyRange: () => ({ easiest: Number.NaN, hardest: Number.NaN }) })],
    ["with a range that has no end", ["difficulty-range"], () => bad({ difficultyRange: (l) => ({ ...addShape.difficultyRange(l), hardest: Number.POSITIVE_INFINITY }) })],
    ["with scores that are not numbers", ["difficulty"], () => bad({ difficulty: () => Number.NaN })],
    ["that throws", ["book"], () => bad({ generate: () => { throw new Error("no"); } })],
    ["that changes the limits that it gets", ["small-space"], () => bad({ generate: (l, seed) => { const item = addShape.generate(l, seed); l.a = { min: 1, max: 30 }; return item; } })],
    ["that gives the parts of an answer, one of them wrong", ["independent-answer", "answer-form"], () => {
      const parts = <T extends { answer: object }>(item: T, left: string): T => ({ ...item, answer: { ...item.answer, parts: [{ name: "left", value: left }] } });
      const read = (rows: Rows) => { const printed = addRegistration.read(rows); return printed && parts(printed, "0"); };
      return { ...bad({ answer: (q) => parts(addItem(q), "9").answer, generate: (l, s) => parts(addShape.generate(l, s), "9"), worstCase: (l) => parts(addShape.worstCase(l), "9"), solveAgain: (rows) => { const item = addShape.solveAgain(rows); return item && parts(item, "9"); } }), registration: { read } };
    }],
    ["that puts the values of two blanks in each other's place, in every part", ["independent-answer"], () => {
      const turned = <T extends { answer: Answer }>(item: T): T => ({ ...item, answer: { parts: item.answer.parts.map((part, i, all) => ({ ...part, value: all[all.length - 1 - i].value })) } });
      return { shape: skip({ answer: (q) => turned({ answer: skipCount.answer(q) }).answer, generate: (l, seed) => turned(skipCount.generate(l, seed)), worstCase: (l) => turned(skipCount.worstCase(l)), solveAgain: (rows) => { const item = skipCount.solveAgain(rows); return item && turned(item); } }) };
    }],
    ["that gives two blanks one name", ["answer-form"], () => {
      const named = <T extends { answer: Answer }>(item: T): T => ({ ...item, answer: { parts: item.answer.parts.map((part) => ({ ...part, name: "blank-1" })) } });
      return { shape: skip({ answer: (q) => named({ answer: skipCount.answer(q) }).answer, generate: (l, seed) => named(skipCount.generate(l, seed)), worstCase: (l) => named(skipCount.worstCase(l)), solveAgain: (rows) => { const item = skipCount.solveAgain(rows); return item && named(item); } }), registration: { read: (rows) => { const p = skipCountRegistration.read(rows); return p && named(p); } } };
    }],
    ["that gives no answer part", ["answer-form"], () => ({ shape: skip({ answer: () => ({ parts: [] }) }) })],
    ["with two parts that is said to be worked in columns", ["steps-marks"], () => ({ shape: skip(), registration: { working: "columns" } })],
    ["with rows in order and no list", ["list"], () => ({ shape: fact({ list: undefined }) })],
    ["with a form that is not the widest", ["forms"], () => ({ shape: { ...missingFactor, forms: (l: MissingLimits) => missingFactor.forms?.(l).map((item) => (item.question.result > 9 ? { question: { ...item.question, known: 1, result: 2 }, answer: whole("2") } : item)) ?? [] } as Shape })],
    ["that gives one list of rows and turns it each time", ["determinism"], () => {
      const known = new Map<string, FactQuestion[][] | null>();
      return { shape: fact({ orderedRuns: (l, items) => {
        const key = canonicalJson([l, items]);
        const before = known.get(key);
        if (before === undefined) known.set(key, factMul.orderedRuns?.(l, items) ?? null);
        else before?.reverse();
        return known.get(key) ?? null;
      } }) };
    }],
    ["that gives a row in order for limits that mix", ["ordered-row"], () => ({ shape: fact({ orderedRuns: (l, items) => factMul.orderedRuns?.(l, items) ?? [(factMul.list?.(l) ?? []).slice(0, items)] }) })],
    ["that gives a row that is too short", ["ordered-row", "book"], () => ({ shape: fact({ orderedRuns: (l, items) => factMul.orderedRuns?.(l, items)?.map((run) => run.slice(0, Math.max(1, items - 1))) ?? null }) })],
    ["with an answer kind that has no rule", ["answer-form"], () => bad({ answerKind: "quotient-remainder" as "whole-number" })],
    ["with an answer kind that has the name of a thing that each object inherits", ["answer-form"], () => {
      const kind = "constructor" as "whole-number";
      const odd = <T extends { answer: Answer }>(item: T): T => ({ ...item, answer: { parts: item.answer.parts.map((part) => ({ ...part, kind })) } });
      return { ...bad({ answerKind: kind, answer: (q) => odd(addItem(q)).answer, generate: (l, s) => odd(addShape.generate(l, s)), worstCase: (l) => odd(addShape.worstCase(l)), solveAgain: (rows) => { const item = addShape.solveAgain(rows); return item && odd(item); } }), registration: { read: (rows) => { const printed = addRegistration.read(rows); return printed && odd(printed); } } };
    }],
  ])("a shape %s", (_name, wanted, broken) => {
    const found = checksOf(check(broken()));
    for (const name of wanted) expect(found).toContain(name);
  });

  it.each<[string, Check[], () => Broken]>([
    ["with a rule that permits everything", ["witness"], () => ({ shape: add(), registration: limitsOf("carry", { allows: () => true }) })],
    ["with a rule that permits nothing", ["witness"], () => ({ shape: add(), registration: limitsOf("carry", { allows: () => false }) })],
    ["with a reader that knows no questions", ["registration"], () => ({ shape: add(), registration: { read: () => null } })],
    ["with a width that is not a number", ["worst-case"], () => ({ shape: add(), registration: { read: (rows) => { const p = addRegistration.read(rows); return p && { ...p, widths: { sum: Number.NaN } }; } } })],
    ["with a reader that says nothing of one limit", ["registration"], () => ({ shape: add(), registration: { ...limitsOf("roundSum", { allows: () => true }), read: (rows) => { const p = addRegistration.read(rows); return p && { ...p, features: Object.fromEntries(Object.entries(p.features).filter(([name]) => name !== "roundSum")) }; } } })],
    ["with a large count that is not a number", ["count"], () => ({ shape: less(), registration: { space: { ...lessSpace, count: () => Number.NaN } } })],
    ["with a case that no question meets", ["registration"], () => ({ shape: add(), options: { fingerprints: {} }, registration: { cases: [...addRegistration.cases, { name: "none", limits: { ...example.ADD_WIDE, sum: { min: 2, max: 3 }, carry: { min: 1, max: 1 } } }] } })],
    ["that leaves out a question of the space", ["count"], () => ({ shape: add(), registration: { space: addSpace.slice(1) } })],
  ])("a registration %s", (_name, wanted, broken) => {
    const found = checksOf(check(broken()));
    for (const name of wanted) expect(found).toContain(name);
  });

  it("stops a shape that changes the limits that it gets", () => {
    const { failures } = check({ shape: add({ difficultyRange: (l) => { Object.assign(l, { used: true }); return addShape.difficultyRange(l); } }) });
    expect(failures.map((f) => f.message).join("\n")).toMatch(/threw Cannot add property used, object is not extensible/);
  });

  it("gives the same failure in each run, and the failure holds what repeats it", () => {
    const broken = add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return item.question.b === 9 ? addItem({ a: 30, b: 8 }) : item; } });
    const [one, two] = [check({ shape: broken, seeds: 48 }), check({ shape: broken, seeds: 48 })];
    expect(two.failures).toEqual(one.failures);
    const message = one.failures.find((f) => f.check === "inside")?.message ?? "";
    const [, limits, seed] = /generate\((\{.*\}), "([^"]*)"\)/.exec(message) ?? [];
    expect(broken.generate(JSON.parse(limits), seed)).toEqual(addItem({ a: 30, b: 8 }));
  });

  it("does not cache made limits across harness runs: a second shape with the same rule object and a slow generator fails its own limit", () => {
    let slow = false;
    const wrapped = addRegistration.limits.a.values.map((range) => {
      if (slow) { const end = performance.now() + 20; while (performance.now() < end) { /* spin */ } }
      return range;
    }, (r) => r);
    const rules = { ...addRegistration.limits, a: { ...addRegistration.limits.a, values: wrapped } };
    const report = (id: string, timeLimitMs: number) =>
      runChecks({ ...addShape, id } as Shape, { ...addRegistration, id, limits: rules }, 32, { fingerprints: {}, madeLimits: 25, timeLimitMs })
        .failures.filter((f) => f.check === "arbitrary").map((f) => f.message);
    expect(report("test.add", 1000)).toEqual([]);
    slow = true;
    expect(report("test.other", 1).join("\n")).toMatch(/timed out/i);
  });
});

type PlusOneLimits = { a: { min: number; max: number } };
/** The shape of the questions "a + 1" for the numbers of a range, with all that it registers. From 99 on it needs 3 digit places. */
function plusOne(min: number, max: number): { shape: Shape; registration: ShapeRegistration } {
  const item = ({ a }: { a: number }): Item<{ a: number }> => ({ question: { a }, answer: whole(String(a + 1)) });
  const isOne = (rows: Rows) => rows.length === 2 && /^[1-9]\d*$/.test(rows[0]) && rows[1] === "+1" && Number(rows[0]) >= min && Number(rows[0]) <= max;
  const stepsOf = (a: number) => addColumn.steps({ a, b: 1 });
  const shape: Shape<PlusOneLimits, { a: number }> = {
    id: "test.plus", version: 1, answerKind: "whole-number",
    readLimits: (raw) => { const read = readLimitFields(raw, { a: { min, max } }, {}); return typeof read === "string" ? { ok: false, problem: read } : { ok: true, limits: read as unknown as PlusOneLimits }; },
    generate: ({ a }, seed) => item({ a: a.min + pick(seed, a.max - a.min + 1) }),
    answer: (q) => item(q).answer,
    solveAgain: (rows) => (isOne(rows) ? item({ a: Number(rows[0]) }) : null),
    steps: ({ a }) => stepsOf(a),
    difficulty: ({ a }) => a, difficultyRange: ({ a }) => ({ easiest: a.min, hardest: a.max }),
    worstCase: ({ a }) => item({ a: a.max }), count: ({ a }) => Math.max(0, Math.min(a.max, max) - Math.max(a.min, min) + 1),
    face: ({ a }) => ({ kind: "column", top: String(a), sign: "+", bottom: "1" }),
  };
  const only = (low: number, high: number): Limits => ({ a: { min: low, max: high } });
  const rowsOf = (a: number): Rows => [String(a), "+1"];
  const registration: ShapeRegistration = {
    id: "test.plus", working: "columns", limits: { a: rangeLimit(min, max) }, space: Array.from({ length: max - min + 1 }, (_, i) => rowsOf(min + i)), cases: [{ name: "all", limits: only(min, max) }],
    read: (rows) => (isOne(rows) ? { answer: whole(String(Number(rows[0]) - -1)), features: { a: Number(rows[0]) }, widths: { a: Number(rows[0]) }, steps: stepsOf(Number(rows[0])) } : null),
    smallSpaces: [{ name: "one question", limits: only(max, max), questions: [rowsOf(max)] }],
    witnesses: [{ limit: "a", limits: only(min, min), inside: rowsOf(min), outside: rowsOf(max) }],
    harder: [{ name: "more", easier: rowsOf(min), harder: rowsOf(max) }],
    examples: [{ name: "the last", rows: rowsOf(max), answer: whole(String(max + 1)), steps: stepsOf(max) }],
    refusedLimits: [{ name: "too many", raw: only(min, max + 1), problem: `a must be from ${min} to ${max}` }], refusedRows: [{ name: "too many", rows: rowsOf(max + 1) }],
  };
  return { shape: shape as Shape, registration };
}
/** All questions are equally wide for the reader, so that only the digit places tell them apart. */
function digitsVary(): ReturnType<typeof plusOne> {
  const { shape, registration } = plusOne(1, 120);
  return { shape, registration: { ...registration, read: (rows) => { const p = registration.read(rows); return p && { ...p, widths: { same: 1 } }; } } };
}
const reaches = (limits: unknown, a: number): boolean => { const { min, max } = (limits as PlusOneLimits).a; return min <= a && a < max; };

describe("the number of seeds", () => {
  it("counts the seeds of the form of the build and no other", () => {
    const seeds: string[] = [];
    const watched = add({ generate: (l, seed) => { seeds.push(seed); return addShape.generate(l, seed); } });
    const { evidence } = runChecks(watched, addRegistration, 48, { fingerprints: {} });
    // The harness asks for each question two times. With no stored fingerprint, nothing else asks.
    expect(evidence.seeds).toBe(seeds.filter((seed) => /^[0-9a-f]{64}$/.test(seed)).length / 2);
    expect(evidence.seeds).toBeLessThan(seeds.length / 2);
  });

  it("counts the questions of every form for the end of the search", () => {
    const [, six] = addRegistration.smallSpaces;
    const slow = add({ generate: (l, seed) => (same(l, six.limits) && seed.startsWith("seed-") ? addItem(addQuestions(l)[seed < "seed-995" ? 0 : Number(seed.slice(-1)) - 4]) : addShape.generate(l, seed)) });
    const { failures, evidence } = check({ shape: slow });
    expect(failures).toEqual([]);
    expect(evidence.seeds).toBeLessThan(900);
    expect(check({ shape: slow, options: { maxQuestions: 900 } }).failures.map((f) => f.message).join()).toMatch(/small-space: threw more than 900 questions were asked for/);
  });
});

describe("the book of a shape", () => {
  const fitting = [first, { ...first, id: "second" }];
  type Side = { template: string; rows: { limits: unknown; items: number }[] };
  const sidesOf = (spaces: Parameters<typeof sampleBook>[1], seeds: number): Side[] =>
    (sampleBook("test.add", spaces, seeds).input.snapshot as { sheets: Record<"front" | "back", Side>[] }).sheets.flatMap(({ front, back }) => [front, back]);
  const rowsOf = (spaces: Parameters<typeof sampleBook>[1], seeds: number) => sidesOf(spaces, seeds).flatMap((side) => side.rows);
  const inShort = (sides: Side[]) => sides.map(({ template, rows }) => [template, rows.map((r) => r.items)]);

  it("fills each side of each template, and then goes round the limits", () => {
    const sides = sidesOf([{ limits: example.ADD_WIDE, count: 270, fitting }, { limits: example.ADD_SIX, count: 6, fitting }], 64);
    expect(inShort(sides)).toEqual([["columns-2x4", [8]], ["columns-2x4", [8]], ["second", [8]], ["second", [8]], ["columns-2x4", [8]], ["columns-2x4", [6]], ["second", [8]], ["second", [8]]]);
  });

  it("fills one side of a sheet when the shape has few questions", () => {
    const [one, two] = ["columns-2x4", "second"].map((id) => [[id, [3, 3, 2]], [id, [1]], [id, [1]], [id, [3, 3, 2]]]);
    expect(inShort(sidesOf([{ limits: example.ADD_SIX, count: 3, fitting }], 1000))).toEqual([...one, ...two, ["columns-2x4", [3]], ["columns-2x4", [1]], ["columns-2x4", [1]], ["columns-2x4", [3]]]);
  });

  it.each([[20, [[8], [1], [1], [8]]], [5, [[5, 3], [1], [1], [5, 3]]], [100, [[8], [8]]]])("fills both sides of a template that only smaller limits fit, with %i questions", (count, filled) => {
    const sides = sidesOf([{ limits: { n: 0 }, count: 270, fitting: [first] }, { limits: { n: 1 }, count, fitting: [first, narrow] }, { limits: { n: 2 }, count: 2, fitting: [first, narrow] }], 16);
    expect(inShort(sides.slice(0, 2))).toEqual([["columns-2x4", [8]], ["columns-2x4", [8]]]);
    expect(inShort(sides.slice(2, 2 + filled.length))).toEqual(filled.map((items) => ["narrow", items]));
    for (const { rows } of sides.slice(2, 2 + filled.length)) for (const { limits } of rows) expect(limits).toEqual({ n: 1 });
  });

  it("fills a template that only smaller limits of a shape fit", () => {
    expect(check({ ...plusOne(1, 120), seeds: SEEDS, options: withNarrow }).failures).toEqual([]);
  });

  it.each([[1, 1], [1, 1000], [3, 64], [270, 1]])("uses each of nine limits with %i questions and %i seeds", (count, seeds) => {
    const spaces = Array.from({ length: 9 }, (_, i) => ({ limits: { n: i }, count, fitting: [first] }));
    expect(new Set(rowsOf(spaces, seeds).map((r) => canonicalJson(r.limits)))).toEqual(new Set(spaces.map((s) => canonicalJson(s.limits))));
  });

  it("uses all the limits, the largest first", () => {
    const spaces = Array.from({ length: 5 }, (_, i) => ({ limits: { n: i }, count: 100 * (i + 1), fitting: [first] }));
    expect([...new Set(rowsOf(spaces, 160).map((r) => canonicalJson(r.limits)))]).toEqual([4, 3, 2, 1, 0].map((n) => canonicalJson({ n })));
  });

  it("of a shape with two questions passes, and other seeds fill the number", () => {
    const report = check({ ...plusOne(1, 2), seeds: SEEDS });
    expect(report.failures).toEqual([]);
    expect(report.evidence.seeds).toBeGreaterThanOrEqual(SEEDS);
  });
});

describe("the registry", () => {
  const library = shapeLibrary([add()]);
  it.each<[string, () => string[], string]>([
    ["a shape with no registration", () => registryProblems(library, []), "[test.add] registration: the shape is in SHAPES and has no registration"],
    ["a registration with no shape", () => registryProblems(new Map(), [addRegistration]), "[test.add] registration: there is no such shape in SHAPES"],
    ["two registrations of one shape", () => registryProblems(library, [addRegistration, addRegistration]), "[test.add] registration: the shape is registered more than once"],
    ...(["cases", "smallSpaces", "witnesses", "harder", "examples", "refusedLimits", "refusedRows", "space"] as const).map((list): [string, () => string[], string] =>
      [`an empty list of ${list}`, () => registryProblems(library, [{ ...addRegistration, [list]: [] }]), `[test.add] registration: ${list} must not be empty`]),
    ["a small space with no question", () => registryProblems(library, [{ ...addRegistration, smallSpaces: [{ ...addRegistration.smallSpaces[0], questions: [] }] }]), '[test.add] registration: the list of "one question" must not be empty'],
    ["a limit with no bad value", () => registryProblems(library, [{ ...addRegistration, ...limitsOf("sum", { bad: [] }) }]), '[test.add] registration: the limit "sum" has no bad value'],
    ["limits with one name that is two names", () => { const { a, b, ...more } = example.ADD_WIDE; return registryProblems(library, [{ ...addRegistration, cases: [{ name: "odd", limits: { "a,b": [a, b], ...more } }] }]); }, '[test.add] registration: the limits of "odd" must be a, b, sum, carry, roundSum'],
    ["limits with a name that they inherit", () => { const { a, ...more } = example.ADD_WIDE; return registryProblems(library, [{ ...addRegistration, cases: [{ name: "odd", limits: Object.assign(Object.create({ a }) as Limits, more, { more: 1 }) }] }]); }, '[test.add] registration: the limits of "odd" must be a, b, sum, carry, roundSum'],
    ["no limits", () => registryProblems(library, [{ ...addRegistration, limits: {} }]), "[test.add] registration: limits must not be empty"],
    ["a limit with no witness", () => registryProblems(library, [{ ...addRegistration, witnesses: addRegistration.witnesses.filter((w) => w.limit !== "sum") }]), '[test.add] registration: the limit "sum" has no witness'],
    ["limits with another name", () => registryProblems(library, [{ ...addRegistration, cases: [{ name: "odd", limits: { ...example.ADD_WIDE, more: 1 } }] }]), '[test.add] registration: the limits of "odd" must be a, b, sum, carry, roundSum'],
  ])("refuses %s, and the suite reports it", (_name, problems, text) => expect(problems()).toContain(text));

  it("accepts limits with their names in any order", () => {
    const turned = Object.fromEntries(Object.entries(example.ADD_WIDE).reverse());
    expect(registryProblems(library, [{ ...addRegistration, cases: [{ name: "turned", limits: turned }] }])).toEqual([]);
  });

  it("is part of the result for the whole library", () => {
    expect(checkShapes(library, [], { fingerprints: {} })).toEqual({ problems: registryProblems(library, []), reports: [] });
    expect(checkShapes(new Map(), [addRegistration], { fingerprints: {} }).problems).toEqual(registryProblems(new Map(), [addRegistration]));
  });

  it.each([0, -1, 1.5, Number.NaN])("a library has no shape of version %s", (version) => {
    expect(() => shapeLibrary([add({ version })])).toThrow(/whole-number version/);
    expect(() => shapeLibrary([add(), add()])).toThrow(/duplicate shape "test\.add"/);
  });
});

describe("the rules of limits", () => {
  it("a range allows its ends and nothing outside them, and the wider range allows what both allow", () => {
    const rule = rangeLimit(1, 30);
    fc.assert(fc.property(rule.values, rule.values, fc.integer({ min: -5, max: 35 }), (one, other, n) => {
      const [x, y] = [one, other] as { min: number; max: number }[];
      expect(rule.allows(n, one)).toBe(n >= x.min && n <= x.max && x.min >= 1 && x.max <= 30);
      if (rule.allows(n, one) || rule.allows(n, other)) expect(rule.allows(n, rule.widen(one, other))).toBe(true);
      expect(rule.widen(one, other)).toEqual({ min: Math.min(x.min, y.min), max: Math.max(x.max, y.max) });
    }));
    expect([rule.allows(undefined, { min: 1, max: 30 }), rule.allows("5", { min: 1, max: 30 })]).toEqual([false, false]);
  });

  it("only asks for the feature, never refuses it, and allowed permits both", () => {
    const rule = onlyLimit();
    expect([[true, "never"], [true, "allowed"], [true, "only"], [false, "never"], [false, "allowed"], [false, "only"], [undefined, "allowed"], [undefined, "never"]].map(([feature, limit]) => rule.allows(feature, limit))).toEqual([false, true, true, true, true, false, false, false]);
    expect([rule.widen("never", "only"), rule.widen("only", "allowed"), rule.widen("only", "only"), rule.widen("never", "never")]).toEqual(["allowed", "allowed", "only", "never"]);
  });

  it("never refuses a question with the feature, and allowed permits it", () => {
    const rule = neverLimit();
    expect([[true, "never"], [true, "allowed"], [false, "never"], [false, "allowed"], [undefined, "allowed"]].map(([feature, limit]) => rule.allows(feature, limit))).toEqual([false, true, true, true, false]);
    expect([rule.widen("never", "allowed"), rule.widen("allowed", "never"), rule.widen("never", "never")]).toEqual(["allowed", "allowed", "never"]);
  });
});

describe("reading a worked step", () => {
  it.each<[string, string[]]>([
    ["3 × 4 = 12", []], ["3 × 4 = 13", ["3 × 4 = 13"]],
    ["2 + 3 × 4 = 14", []], ["9 - 2 - 3 = 4", []], ["9 − 2 = 6", ["9 − 2 = 6"]], ["12 ÷ 4 = 3", []], ["7 ÷ 2 = 3", ["7 ÷ 2 = 3"]], ["5 ÷ 0 = 0", ["5 ÷ 0 = 0"]],
    ["1.5 + 2 = 3.5", []], ["0.1 + 0.2 = 0.3", []], ["0.1 + 0.2 = 0.30", []], ["1 ÷ 3 × 3 = 1", []],
    ["9007199254740992 + 1 = 9007199254740992", ["9007199254740992 + 1 = 9007199254740992"]], ["9007199254740992 + 1 = 9007199254740993", []],
    ["2 - 3 = -1", []], ["2 - 3 = -2", ["2 - 3 = -2"]], ["2 − 3 = −1", []], ["2 − 3 = −2", ["2 − 3 = −2"]], ["2 – 3 = –1", []], ["2 - 3 = 1", ["2 - 3 = 1"]],
    ["-3 + 4 = 1", []], ["-3 + 4 = 7", ["-3 + 4 = 7"]], ["2 - -3 = 5", []], ["-0.5 + 1 = 0.5", []], ["6 ÷ -4 = -1.5", []],
    ["2 + 3 = 5.1", ["2 + 3 = 5.1"]],
    ["3 × 4 = 12, write 2, carry 1", []], ["3 × 4 = 13, write 3, carry 1", ["3 × 4 = 13"]], ["3 × 2 = 6, plus 1 is 7", []],
    ["3 × 4 = 12, plus 2 is 14, write 4, carry 1", []], ["12", []],
  ])("%s", (step, wrong) => expect(readStep(step)).toEqual({ wrong, unread: [] }));

  it.each<[string, string[]]>([
    "3 × 4 = 10 + 2", "3 × 4 = 12 = 13", "3 x 4 = 12", "So 2 + 3 = 5", "2 + 3 = 5 more", "2 + 3 =5", "2+3=5", "= 5", "5 = 5", "2 + 3 = ", "2 - 3 = - 1", "1,000 + 1 = 1", "1 + 999 = 1,000",
    "4 + 1 = 5½", "½ + ½ = 1", "2 · 3 = 6", "2 × (1 + 2) = 6", "7 ÷ 2 = 3 R 1", "x = 4", "-x + 2 = 5", "", "Think hard.",
  ].map((step): [string, string[]] => [step, [step]]))("cannot read %s", (step, unread) => expect(readStep(step)).toEqual({ wrong: [], unread }));

  it("cannot read one clause, and says of the others whether they are true", () => {
    expect(readStep("2 + 2 = 5, so 3 + 3 = 6")).toEqual({ wrong: ["2 + 2 = 5"], unread: ["so 3 + 3 = 6"] });
  });

  it("says of any sum, difference and product whether it is true", () => {
    fc.assert(fc.property(fc.integer({ min: -99, max: 999 }), fc.constantFrom("+", "-", "−", "×"), fc.integer({ min: -99, max: 99 }), fc.integer({ min: -5, max: 5 }), (a, sign, b, off) => {
      const step = `${a} ${sign} ${b} = ${(sign === "+" ? a + b : sign === "×" ? a * b : a - b) + off}`;
      expect(readStep(step)).toEqual({ wrong: off === 0 ? [] : [step], unread: [] });
    }));
  });

  // No clause is left alone: every piece of a step that passes must be a known valid clause or plain answer.
  it("leaves no clause unread", () => {
    const piece = fc.constantFrom("1", "2", "12", " ", " + ", " = ", "=", "-", "−", ",", ", ", ".", ". ", "½", "x", "write", "carry", "plus", "nothing", "borrow ", "borrow 1 ", "ten", "tens", "hundred", "hundreds", "thousand", "thousands", " become ", " becomes ");
    fc.assert(fc.property(fc.array(piece, { maxLength: 9 }), (pieces) => {
      const step = pieces.join("");
      const { wrong, unread } = readStep(step);
      if (wrong.length + unread.length > 0) return;
      if (/^(?:0|[1-9]\d*)$/.test(step)) return;
      const clause = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?: [+-] -?(?:0|[1-9]\d*)(?:\.\d+)?)+ = -?(?:0|[1-9]\d*)(?:\.\d+)?|\d|plus [1-9]\d* is (?:0|[1-9]\d*)|write (?:nothing|0|[1-9]\d*)|carry [1-9]\d*|borrow 1 (?:ten|hundred|thousand)|(?:[1-9]|10) (?:(?:ten|hundred|thousand)s become|(?:ten|hundred|thousand) becomes) \d (?:ten|hundred|thousand)s?)$/;
      for (const part of step.replaceAll("−", "-").split(", ")) expect(part).toMatch(clause);
    }));
  });
});

describe("the clauses of columns that borrow or have one digit", () => {
  it.each([
    "3, write 3", "0, write 0", "3, plus 1 is 4, write 4", "9, plus 1 is 10, write 0, carry 1", "9, plus 1 is 10", "2, plus 1 is 3",
    "borrow 1 ten, 4 tens become 3 tens", "borrow 1 ten, 2 tens become 1 ten", "borrow 1 ten, 1 ten becomes 0 tens", "borrow 1 ten, 10 tens become 9 tens",
    "borrow 1 hundred, 3 hundreds become 2 hundreds", "borrow 1 thousand, 1 thousand becomes 0 thousands", "3 - 3 = 0, write nothing",
  ])("reads %s", (text) => expect(readStep(text)).toEqual({ wrong: [], unread: [] }));

  it.each([
    "3, write 4", "3, plus 1 is 5, write 5", "12, write 12", "3, 4 + 1 = 5", "3 + 4 = 7, 5, write 7", "3, 3, write 3", "3, carry 1", "write 3",
    "borrow 1 ten, 4 tens become 2 tens", "borrow 1 ten, 4 tens become 4 tens", "borrow 1 ten, 0 tens become 9 tens", "borrow 1 ten, 11 tens become 10 tens",
    "borrow 1 ten, 1 tens become 0 tens", "borrow 1 ten, 1 tens becomes 0 tens", "borrow 1 ten, 4 ten become 3 tens", "borrow 1 ten, 1 ten become 0 tens", "borrow 1 ten, 2 tens become 1 tens", "borrow 1 ten, 1 ten becomes 0 ten", "borrow 1 ten, 4 tens becomes 3 tens",
    "borrow 1 ten, 4 hundreds become 3 hundreds", "borrow 1 hundred, 4 hundreds become 3 tens", "borrow 2 tens, 4 tens become 2 tens", "borrow 1 one, 4 ones become 3 ones",
    "borrow 1 tens, 4 tens become 3 tens", "borrow 1 ten, 010 tens become 9 tens", "borrow 1 ten, 4 tens become 03 tens", "borrow 01 ten, 4 tens become 3 tens", "borrow 1 hundreds, 4 hundreds become 3 hundreds", "borrow 1 thousands, 4 thousands become 3 thousands",
    "borrow 1 ten", "4 tens become 3 tens", "4 tens become 3 tens, borrow 1 ten", "borrow 1 ten, 4 tens become 3 tens, write 3", "borrow 1 ten, 4 tens become 3 tens, 12 - 7 = 5", "borrow 1 ten, 12 - 7 = 5, write 5",
    "borrow 1 ten, borrow 1 ten, 4 tens become 3 tens", "4 - 3 = 1, write nothing", "3, plus 1 is 4, write nothing", "3, write nothing", "10 - 10 = 0, write nothing, carry 1", "write nothing",
  ])("refuses %s", (text) => {
    const { wrong, unread } = readStep(text);
    expect(wrong.length + unread.length).toBeGreaterThan(0);
  });
});

describe("a step that borrows", () => {
  it("is read only with one unit, one less, and the words of one or of more", () => {
    type Word = [unit: string, plural: string];
    type Sentence = [gives: Word, from: number, has: Word, verb: string, to: number, left: Word];
    const units = ["ten", "hundred", "thousand"];
    const word: fc.Arbitrary<Word> = fc.tuple(fc.constantFrom(...units), fc.constantFrom("", "s"));
    const sentence: fc.Arbitrary<Sentence> = fc.tuple(word, fc.nat(12), word, fc.constantFrom("become", "becomes"), fc.nat(12), word);
    const right = fc.tuple(fc.constantFrom(...units), fc.integer({ min: 1, max: 10 })).map(([unit, n]): Sentence =>
      [[unit, ""], n, [unit, n === 1 ? "" : "s"], n === 1 ? "becomes" : "become", n - 1, [unit, n === 2 ? "" : "s"]]);
    // A right sentence, and one with a single part of another sentence.
    const nearly = fc.tuple(right, sentence, fc.nat(5)).map(([good, other, at]) => good.map((part, i) => (i === at ? other[i] : part)) as Sentence);
    let read = 0;
    fc.assert(fc.property(fc.oneof(right, nearly, sentence), ([[gives, plural], from, [has, hasMore], verb, to, [left, leftMore]]) => {
      const said = `borrow 1 ${gives}${plural}, ${from} ${has}${hasMore} ${verb} ${to} ${left}${leftMore}`;
      const isRight = plural === "" && gives === has && has === left && from >= 1 && from <= 10 && to === from - 1
        && hasMore === (from === 1 ? "" : "s") && verb === (from === 1 ? "becomes" : "become") && leftMore === (to === 1 ? "" : "s");
      const { wrong, unread } = readStep(said);
      expect(wrong.length + unread.length === 0, said).toBe(isRight);
      if (isRight) read++;
    }), { numRuns: 300 });
    expect(read).toBeGreaterThan(50);
  });
});

describe("the paper of a subtraction in columns", () => {
  /** Steps as lines: "text | marks". The last line is the answer. */
  const paper = (...lines: string[]): Step[] => lines.map((line) => step(...(line.split(" | ") as [string, string?])));
  const problem = (rows: string, steps: Step[]) => marksProblem(steps, steps[steps.length - 1].text, rows === "" ? null : rows.split(" "));
  const TEN = "borrow 1 ten, 4 tens become 3 tens | x4@1 b3@1 b12@0";
  const GOOD = [TEN, "12 - 7 = 5, write 5 | w5@0", "3 - 1 = 2 | w2@1", "25"];
  const ACROSS = [
    "borrow 1 hundred, 3 hundreds become 2 hundreds | x3@2 b2@2 b10@1", "borrow 1 ten, 10 tens become 9 tens | x10@1 b9@1 b12@0",
    "12 - 7 = 5, write 5 | w5@0", "9 - 4 = 5, write 5 | w5@1", "2 - 1 = 1 | w1@2", "155",
  ];
  const SHORT = ["borrow 1 ten, 2 tens become 1 ten | x2@1 b1@1 b15@0", "15 - 8 = 7, write 7 | w7@0", "1 - 1 = 0, write nothing", "3 - 3 = 0, write nothing", "7"];
  /** Good steps with one line changed, or left out. */
  const but = (good: string[], at: number, ...lines: string[]): string[] => [...good.slice(0, at), ...lines, ...good.slice(at + 1)];

  it.each<[string, string, string[]]>([
    ["no borrow", "54 -21", ["4 - 1 = 3, write 3 | w3@0", "5 - 2 = 3 | w3@1", "33"]],
    ["one borrow", "42 -17", GOOD],
    ["a last column that says what it writes", "42 -17", but(GOOD, 2, "3 - 1 = 2, write 2 | w2@1")],
    ["a borrow that makes the next one", "325 -158", ["borrow 1 ten, 2 tens become 1 ten | x2@1 b1@1 b15@0", "15 - 8 = 7, write 7 | w7@0", "borrow 1 hundred, 3 hundreds become 2 hundreds | x3@2 b2@2 b11@1", "11 - 5 = 6, write 6 | w6@1", "2 - 1 = 1 | w1@2", "167"]],
    ["a borrow across a zero", "302 -147", ACROSS],
    ["a first digit that becomes 0", "12 -7", ["borrow 1 ten, 1 ten becomes 0 tens | x1@1 b0@1 b12@0", "12 - 7 = 5, write 5 | w5@0", "5"]],
    ["zeros in front that nobody writes", "325 -318", SHORT],
    ["the answer 0", "45 -45", ["5 - 5 = 0, write 0 | w0@0", "4 - 4 = 0, write nothing", "0"]],
    ["columns with no digit below", "345 -7", ["borrow 1 ten, 4 tens become 3 tens | x4@1 b3@1 b15@0", "15 - 7 = 8, write 8 | w8@0", "3, write 3 | w3@1", "3, write 3 | w3@2", "338"]],
  ])("accepts %s", (_name, rows, lines) => expect(problem(rows, paper(...lines))).toBeNull());

  it.each<[string, string, string[], RegExp]>([
    ["a digit crossed out that is not there", "42 -17", but(GOOD, 0, "borrow 1 ten, 5 tens become 4 tens | x5@1 b4@1 b12@0"), /shows 4 and not 5/],
    ["a mark that crosses out another digit than the words", "42 -17", but(GOOD, 0, TEN.replace("x4", "x5")), /marks/],
    ["a wrong new digit", "42 -17", but(GOOD, 0, TEN.replace("b3@1", "b2@1")), /marks/],
    ["a wrong ten more", "42 -17", but(GOOD, 0, TEN.replace("b12", "b13")), /marks/],
    ["a ten more without the digit that was there", "42 -17", but(GOOD, 0, TEN.replace("b12", "b10")), /marks/],
    ["no mark that crosses out", "42 -17", but(GOOD, 0, TEN.replace("x4@1 ", "")), /marks/],
    ["no mark of the ten more", "42 -17", but(GOOD, 0, TEN.replace(" b12@0", "")), /marks/],
    ["marks in another order", "42 -17", but(GOOD, 0, TEN.replace("x4@1 b3@1", "b3@1 x4@1")), /marks/],
    ["a borrow that writes a digit of the answer", "42 -17", [`${TEN} w5@0`, "12 - 7 = 5, write 5", "3 - 1 = 2 | w2@1", "25"], /marks/],
    ["the marks of a borrow one place too far", "42 -17", but(GOOD, 0, "borrow 1 ten, 4 tens become 3 tens | x4@2 b3@2 b12@1"), /marks/],
    ["a borrow of another unit than its place", "42 -17", but(GOOD, 0, "borrow 1 hundred, 4 hundreds become 3 hundreds | x4@1 b3@1 b12@0"), /hundred/],
    ["a borrow from a place that is not on the paper", "42 -17", ["borrow 1 thousand, 4 thousands become 3 thousands | x4@3 b3@3 b10@2", ...GOOD], /thousand/],
    ["a borrow that is not needed", "58 -23", ["borrow 1 ten, 5 tens become 4 tens | x5@1 b4@1 b18@0", "8 - 3 = 5, write 5 | w5@0", "5 - 2 = 3 | w3@1", "35"], /needs no borrow/],
    ["a borrow two times", "42 -17", [TEN, "borrow 1 ten, 3 tens become 2 tens | x3@1 b2@1 b12@0", ...GOOD.slice(1)], /needs no borrow/],
    ["a borrow after the last column", "42 -17", but(GOOD, 3, "borrow 1 ten, 3 tens become 2 tens | x3@1 b2@1 b10@0", "25"), /after its last column/],
    ["a borrow that is forgotten", "42 -17", GOOD.slice(1), /needs a borrow/],
    ["the digit from before the borrow", "42 -17", but(GOOD, 1, "7 - 2 = 5, write 5 | w5@0"), /the paper shows 12 - 7/],
    ["a place that gave and still has its old digit", "53 -19", ["borrow 1 ten, 5 tens become 4 tens | x5@1 b4@1 b13@0", "13 - 9 = 4, write 4 | w4@0", "5 - 2 = 3 | w3@1", "34"], /the paper shows 4 - 1/],
    ["a zero crossed in the other order", "302 -147", [ACROSS[1], ACROSS[0], ...ACROSS.slice(2)], /shows 0 and not 10|from the hundreds/],
    ["a zero crossed with one move left out", "302 -147", ACROSS.slice(1), /from the hundreds|shows 0 and not 10/],
    ["a zero crossed and the ten not given on", "302 -147", but(ACROSS, 1), /needs a borrow/],
    ["a borrow that skips a place that can give", "342 -157", ["borrow 1 hundred, 3 hundreds become 2 hundreds | x3@2 b2@2 b14@1", "borrow 1 ten, 4 tens become 3 tens | x4@1 b3@1 b12@0", "12 - 7 = 5, write 5 | w5@0", "borrow 1 hundred, 3 hundreds become 2 hundreds | x3@2 b2@2 b13@1", "13 - 5 = 8, write 8 | w8@1", "2 - 1 = 1 | w1@2", "185"], /must borrow from the tens/],
    ["a lower number with more digits", "15 -103", ["5 - 3 = 2, write 2 | w2@0", "1 - 0 = 1 | w1@1", "12"], /more digits below/],
    ["a write that the words leave out", "42 -17", but(GOOD, 1, "12 - 7 = 5 | w5@0"), /misses "write 5"/],
    ["a digit written in another place", "42 -17", but(GOOD, 1, "12 - 7 = 5, write 5 | w5@1"), /more than once|marks/],
    ["a zero written in front", "325 -318", but(SHORT, 2, "1 - 1 = 0, write 0 | w0@1"), /the place 1/],
    ["a zero in front that the words write", "325 -318", but(SHORT, 2, "1 - 1 = 0, write 0"), /must say "write nothing"/],
    ["a zero in front with no word of it", "325 -318", but(SHORT, 3, "3 - 3 = 0"), /must say "write nothing"/],
    ["a column left out", "325 -318", but(SHORT, 3), /has no step/],
    ["nothing written for the only digit", "45 -45", ["5 - 5 = 0, write nothing", "4 - 4 = 0, write nothing | w0@0", "0"], /must say "write 0"|marks/],
    ["a column too many", "42 -17", but(GOOD, 3, "0 - 0 = 0, write nothing", "25"), /after its last column/],
    ["an equation for a column with no digit below", "45 -3", ["5 - 3 = 2, write 2 | w2@0", "4 - 0 = 4 | w4@1", "42"], /the paper shows 4/],
    ["only the top digit for a column with a digit below", "45 -40", ["5, write 5 | w5@0", "4 - 4 = 0, write nothing", "5"], /the paper shows 5 - 0/],
    ["a difference of -0", "5 -5", ["5 - 5 = -0 | w0@0", "0"], /no whole-number equation/],
    ["a difference of -0 that is last and written", "15 -5", ["5 - 5 = -0, write 0 | w0@0", "1, write 1 | w1@1", "10"], /not a whole number/],
    ["a difference of 2.0", "42 -17", but(GOOD, 2, "3 - 1 = 2.0 | w2@1"), /no whole-number equation/],
    ["a difference of 2.0 and a word", "42 -17", but(GOOD, 2, "3 - 1 = 2.0, write 2 | w2@1"), /not a whole number/],
    ["a top digit of 3.0", "42 -17", but(GOOD, 2, "3.0 - 1 = 2 | w2@1"), /the paper shows 3 - 1/],
    ["the columns in another order", "42 -17", [GOOD[0], GOOD[2], GOOD[1], GOOD[3]], /needs a borrow|the paper shows|marks/],
    ["the operands in another order", "98 -44", ["8 - 4 = 4, write 4 | w4@0", "4 - 9 = -5 | w5@1", "54"], /the paper shows 9 - 4/],
    ["another sign", "42 -17", but(GOOD, 2, "1 + 1 = 2 | w2@1"), /the paper shows 3 - 1/],
    ["a carry", "42 -17", but(GOOD, 1, "12 - 7 = 5, write 5 | w5@0 c1@1"), /marks/],
    ["an added number", "42 -17", but(GOOD, 2, "1 - 0 = 1, plus 1 is 2 | w2@1"), /the paper shows 3 - 1|adds/],
    ["one equation for the whole question", "200 -5", ["200 - 5 = 195 | w5@0 w9@1 w1@2", "195"], /needs a borrow|the paper shows/],
    ["a borrow on an addition", "42 +17", ["borrow 1 ten, 4 tens become 3 tens | x4@1 b3@1 b12@0", "2 + 7 = 9, write 9 | w9@0", "4 + 1 = 5 | w5@1", "59"], /borrows and the printed rows are no subtraction/],
    ["marks of a borrow on an addition", "42 +17", ["2 + 7 = 9, write 9 | w9@0 x4@1", "4 + 1 = 5 | w5@1", "59"], /borrows and the printed rows are no subtraction/],
    ["a column face whose rows are no column", "42", GOOD, /the printed rows \["42"\] are no column/],
    ["a column face with a sign that has no columns", "42 ÷17", GOOD, /are no column/],
    ["a borrow of a question with no column", "", GOOD, /borrows and the printed rows are no subtraction/],
  ])("refuses %s", (_name, rows, lines, message) => expect(problem(rows, paper(...lines))).toMatch(message));

  it.each<[string, Record<string, unknown>]>([
    ["another row", { mark: "cross-out", row: "bottom", place: 1, digit: "4" }], ["no row", { mark: "borrow", place: 1, digit: "3" }], ["a row on a written digit", { mark: "write", row: "top", place: 0, digit: "5" }],
    ["19 above a place", { mark: "borrow", row: "top", place: 0, digit: "19" }], ["a zero in front", { mark: "borrow", row: "top", place: 0, digit: "02" }], ["no digit", { mark: "cross-out", row: "top", place: 0, digit: "" }],
    ["two digits in the answer", { mark: "write", place: 0, digit: "12" }], ["a place below the ones", { mark: "borrow", row: "top", place: -1, digit: "3" }], ["one name more", { mark: "borrow", row: "top", place: 1, digit: "3", at: 2 }],
  ])("refuses a mark with %s", (_name, mark) => {
    const steps = paper(...GOOD);
    expect(marksProblem([{ ...steps[0], marks: [...steps[0].marks, mark as never] }, ...steps.slice(1)], "25", ["42", "-17"])).toMatch(/holds a mark that is not one/);
  });

  it("refuses any other number in the words or the marks of any subtraction", () => {
    const digits = fc.integer({ min: 1, max: 9999 });
    fc.assert(fc.property(digits, digits, fc.nat(), fc.nat(), fc.integer({ min: 1, max: 9 }), (one, other, at, which, more) => {
      const [a, b] = [Math.max(one, other), Math.min(one, other)];
      const rows = [String(a), `-${b}`];
      const good = subColumn.steps({ a, b });
      expect(marksProblem(good, String(a - b), rows)).toBeNull();
      const index = at % good.length;
      const numbers = [...good[index].text.matchAll(/\d+/g)];
      const found = numbers[which % numbers.length];
      const text = `${good[index].text.slice(0, found.index)}${Number(found[0]) + more}${good[index].text.slice(found.index + found[0].length)}`;
      expect(marksProblem(good.map((s, i) => (i === index ? { ...s, text } : s)), String(a - b), rows), text).not.toBeNull();
      const withMarks = good.flatMap((s, i) => (s.marks.length > 0 ? [i] : []));
      const marked = withMarks[at % withMarks.length];
      const changed = good[marked].marks.map((m, i) => (i === which % good[marked].marks.length ? { ...m, digit: String((Number(m.digit) + more) % 10) } : m));
      expect(marksProblem(good.map((s, i) => (i === marked ? { ...s, marks: changed } : s)), String(a - b), rows)).not.toBeNull();
      expect(marksProblem(good.filter((_, i) => i !== marked), String(a - b), rows)).not.toBeNull();
    }), { numRuns: 80 });
  });
});

describe("the paper of an addition or a multiplication in columns", () => {
  const problem = (rows: string, lines: readonly string[]) => {
    const steps = lines.map((line) => step(...(line.split(" | ") as [string, string?])));
    return marksProblem(steps, steps[steps.length - 1].text, rows === "" ? null : rows.split(" "));
  };
  const SUM = ["2 + 3 = 5, write 5 | w5@0", "5 + 1 = 6 | w6@1", "65"];

  it.each<[string, string, string[]]>([
    ["an addition", "52 +13", SUM],
    ["columns with no digit below", "195 +8", ["5 + 8 = 13, write 3, carry 1 | w3@0 c1@1", "9, plus 1 is 10, write 0, carry 1 | w0@1 c1@2", "1, plus 1 is 2 | w2@2", "203"]],
    ["columns with no digit on top", "8 +195", ["8 + 5 = 13, write 3, carry 1 | w3@0 c1@1", "9, plus 1 is 10, write 0, carry 1 | w0@1 c1@2", "1, plus 1 is 2 | w2@2", "203"]],
    ["a multiplication", "247 ×3", ["3 × 7 = 21, write 1, carry 2 | w1@0 c2@1", "3 × 4 = 12, plus 2 is 14, write 4, carry 1 | w4@1 c1@2", "3 × 2 = 6, plus 1 is 7 | w7@2", "741"]],
  ])("accepts %s", (_name, rows, lines) => expect(problem(rows, lines)).toBeNull());

  it.each<[string, string, string[], RegExp]>([
    ["other operands with the same sums", "52 +13", ["1 + 4 = 5, write 5 | w5@0", "3 + 3 = 6 | w6@1", "65"], /says 1 \+ 4 and the paper shows 2 \+ 3/],
    ["another sign", "52 +13", ["8 - 3 = 5, write 5 | w5@0", "2 × 3 = 6 | w6@1", "65"], /the paper shows 2 \+ 3/],
    ["the operands in another order", "52 +13", ["3 + 2 = 5, write 5 | w5@0", SUM[1], "65"], /the paper shows 2 \+ 3/],
    ["the columns in another order", "52 +13", ["5 + 1 = 6, write 6 | w6@1", "2 + 3 = 5 | w5@0", "65"], /the paper shows 2 \+ 3|place/],
    ["the columns in order that write in another order", "55 +11", ["5 + 1 = 6, write 6 | w6@1", "5 + 1 = 6 | w6@0", "66"], /must write the place 0/],
    ["one whole equation", "52 +13", ["52 + 13 = 65 | w5@0 w6@1", "65"], /1 columns and the paper has 2/],
    ["a whole equation in the first column", "52 +13", ["52 + 13 = 65, write 5, carry 6 | w5@0 c6@1", "0, plus 6 is 6 | w6@1", "65"], /the paper shows 2 \+ 3/],
    ["a column that is left out", "152 +13", ["2 + 3 = 5, write 5 | w5@0", "15 + 1 = 16 | w6@1 w1@2", "165"], /2 columns and the paper has 3/],
    ["a column too many", "52 +13", ["2 + 3 = 5, write 5 | w5@0", "5 + 1 = 6, write 6 | w6@1", "0 + 0 = 0 | w0@2", "65"], /the place 2/],
    ["a zero for an empty place", "45 +3", ["5 + 3 = 8, write 8 | w8@0", "4 + 0 = 4 | w4@1", "48"], /says 4 \+ 0 and the paper shows 4/],
    ["only the top digit of a column with a digit below", "15 +20", ["5, write 5 | w5@0", "1 + 2 = 3 | w3@1", "35"], /the paper shows 5 \+ 0/],
    ["another top digit", "45 +3", ["5 + 3 = 8, write 8 | w8@0", "3, plus 1 is 4 | w4@1", "48"], /adds 1/],
    ["a zero that is written as a decimal", "52 +13", ["2 + 3 = 5.0, write 5 | w5@0", SUM[1], "65"], /not a whole number/],
    ["a digit of a question with no column", "", ["5 + 3 = 8, write 8 | w8@0", "4, write 4 | w4@1", "48"], /has no equation/],
    ["a multiplication in the other order", "21 ×3", ["1 × 3 = 3, write 3 | w3@0", "3 × 2 = 6 | w6@1", "63"], /the paper shows 3 × 1/],
    ["a multiplication with another multiplier", "20 ×3", ["4 × 0 = 0, write 0 | w0@0", "3 × 2 = 6 | w6@1", "60"], /the paper shows 3 × 0/],
    ["a multiplication as one equation", "21 ×3", ["3 × 21 = 63 | w3@0 w6@1", "63"], /1 columns and the paper has 2/],
    ["an addition in the place of a multiplication", "21 ×2", ["1 + 1 = 2, write 2 | w2@0", "2 + 2 = 4 | w4@1", "42"], /the paper shows 2 × 1/],
  ])("refuses %s", (_name, rows, lines, message) => expect(problem(rows, lines)).toMatch(message));

  it("takes the steps of one question for no other with the same answer and the same number of digits", () => {
    fc.assert(fc.property(fc.integer({ min: 10, max: 99 }), fc.integer({ min: 10, max: 99 }), fc.integer({ min: 1, max: 40 }), (a, b, move) => {
      const [x, y] = [a + move, b - move];
      if (x > 99 || y < 10) return;
      const answer = String(a + b);
      expect(marksProblem(addColumn.steps({ a, b }), answer, [String(a), `+${b}`])).toBeNull();
      expect(marksProblem(addColumn.steps({ a, b }), answer, [String(x), `+${y}`])).not.toBeNull();
    }));
  });
});

describe("closed grammar of worked steps and marks", () => {
  // Base good steps for 247 × 3 = 741:
  //   0: "3 × 7 = 21, write 1, carry 2"           w1@0 c2@1
  //   1: "3 × 4 = 12, plus 2 is 14, write 4, carry 1"  w4@1 c1@2
  //   2: "3 × 2 = 6, plus 1 is 7"                 w7@2
  //   3: "741"                                    (no marks)
  const good = mulColumn.steps({ a: 247, b: 3 });
  const replaceText = (index: number, text: string): Step[] => good.map((s, i) => (i === index ? { ...s, text } : s));
  const replaceMarks = (index: number, marks: string): Step[] => good.map((s, i) => (i === index ? step(s.text, marks) : s));

  it.each<[string, Step[], string]>([
    // Review reproductions
    ["repeated carry in 15 × 2", [step("2 × 5 = 10, write 0, carry 1, carry 2", "w0@0 c1@1"), step("2 × 1 = 2, plus 1 is 3", "w3@1"), step("30")], "30"],
    ["wrong plus sum in 15 × 2", [step("2 × 5 = 10, write 0, carry 1", "w0@0 c1@1"), step("2 × 1 = 2, plus 1 is 99", "w3@1"), step("30")], "30"],
    // Wrong clause values (with marks right)
    ["wrong equation product", replaceText(0, "3 × 7 = 22, write 1, carry 2"), "741"],
    ["wrong plus carry value", replaceText(1, "3 × 4 = 12, plus 3 is 15, write 4, carry 1"), "741"],
    ["wrong plus result", replaceText(1, "3 × 4 = 12, plus 2 is 15, write 4, carry 1"), "741"],
    ["wrong plus result on last column", replaceText(2, "3 × 2 = 6, plus 1 is 99"), "741"],
    ["wrong write digit", replaceText(0, "3 × 7 = 21, write 9, carry 2"), "741"],
    ["wrong write on last column", replaceText(2, "3 × 2 = 6, plus 1 is 7, write 8"), "741"],
    ["wrong carry digit", replaceText(0, "3 × 7 = 21, write 1, carry 3"), "741"],
    ["carry of 0 in text", [step("3 × 2 = 6, write 6, carry 0", "w6@0"), step("3 × 3 = 9", "w9@1"), step("96")], "96"],
    // Missing clauses (with marks right)
    ["missing equation", replaceText(0, "write 1, carry 2"), "741"],
    ["missing plus when carry came in", replaceText(1, "3 × 4 = 12, write 4, carry 1"), "741"],
    ["missing write in non-last column", replaceText(0, "3 × 7 = 21, carry 2"), "741"],
    ["missing write in non-last column without carry", [step("3 × 2 = 6", "w6@0"), step("3 × 3 = 9", "w9@1"), step("96")], "96"],
    ["missing carry when total >= 10", replaceText(0, "3 × 7 = 21, write 1"), "741"],
    ["plain number in working step", replaceText(0, "21"), "741"],
    // Repeated clauses (with marks right)
    ["repeated equation", replaceText(0, "3 × 7 = 21, 3 × 7 = 21, write 1, carry 2"), "741"],
    ["repeated plus", replaceText(1, "3 × 4 = 12, plus 2 is 14, plus 2 is 14, write 4, carry 1"), "741"],
    ["repeated write", replaceText(0, "3 × 7 = 21, write 1, write 1, carry 2"), "741"],
    ["repeated carry", replaceText(0, "3 × 7 = 21, write 1, carry 2, carry 2"), "741"],
    // Out of order clauses (with marks right)
    ["carry before write", replaceText(0, "3 × 7 = 21, carry 2, write 1"), "741"],
    ["write before plus", replaceText(1, "3 × 4 = 12, write 4, plus 2 is 14, carry 1"), "741"],
    ["plus before equation", replaceText(1, "plus 2 is 14, 3 × 4 = 12, write 4, carry 1"), "741"],
    ["write before equation", replaceText(0, "write 1, 3 × 7 = 21, carry 2"), "741"],
    // Extra words / unknown clauses / two numbers (with marks right)
    ["extra trailing words", replaceText(0, "3 × 7 = 21, write 1, carry 2, and remember it"), "741"],
    ["extra words inside write", replaceText(0, "3 × 7 = 21, write 1 down, carry 2"), "741"],
    ["extra words inside carry", replaceText(0, "3 × 7 = 21, write 1, carry 2 over"), "741"],
    ["extra words inside plus", replaceText(2, "3 × 2 = 6, plus 1 is 7 total"), "741"],
    ["two numbers in write", replaceText(0, "3 × 7 = 21, write 1 2, carry 2"), "741"],
    ["two numbers in carry", replaceText(0, "3 × 7 = 21, write 1, carry 2 3"), "741"],
    ["two numbers in plus", replaceText(2, "3 × 2 = 6, plus 1 is 7 8"), "741"],
    ["semicolon separator", replaceText(0, "3 × 7 = 21; write 1, carry 2"), "741"],
    ["trailing comma", replaceText(2, "3 × 2 = 6, plus 1 is 7,"), "741"],
    ["leading zero in write", [step("2 × 0 = 0, write 00", "w0@0"), step("2 × 1 = 2", "w2@1"), step("20")], "20"],
    // Unexpected clauses (with marks right)
    ["carry on last column", [step("7 × 0 = 0, write 0", "w0@0"), step("7 × 4 = 28, write 8, carry 2", "w8@1 w2@2"), step("280")], "280"],
    ["write ones only on last column with 2-digit total", [step("7 × 0 = 0, write 0", "w0@0"), step("7 × 4 = 28, write 8", "w8@1 w2@2"), step("280")], "280"],
    ["write two digits on non-last column", [step("3 × 7 = 21, write 21", "w1@0 c2@1"), ...good.slice(1)], "741"],
    // Reverse: right text, wrong marks
    ["marks write wrong digit", replaceMarks(0, "w9@0 c2@1"), "741"],
    ["marks omit write", replaceMarks(0, "c2@1"), "741"],
    ["marks omit carry", replaceMarks(0, "w1@0"), "741"],
    ["marks carry wrong digit", replaceMarks(0, "w1@0 c3@1"), "741"],
    ["marks carry at wrong place", replaceMarks(0, "w1@0 c2@2"), "741"],
    ["marks extra carry on no-carry step", [step("3 × 2 = 6, write 6", "w6@0 c1@1"), step("3 × 3 = 9", "w9@1"), step("96")], "96"],
    ["marks write duplicate place", replaceMarks(1, "w4@0 c1@2"), "741"],
    ["marks on final answer step", [...good.slice(0, -1), step("741", "w1@0")], "741"],
  ])("refuses %s", (_name, steps, answer) => {
    const stepTextBad = steps.some((s, i) => {
      const r = readStep(s.text);
      return i < steps.length - 1 && (r.wrong.length > 0 || r.unread.length > 0);
    });
    const marksBad = marksProblem(steps, answer, null) !== null;
    expect(stepTextBad || marksBad).toBe(true);
    expect(marksBad).toBe(true);
  });

  it("accepts a last column with an explicit full write clause", () => {
    const withWrite = [step("7 × 0 = 0, write 0", "w0@0"), step("7 × 4 = 28, write 28", "w8@1 w2@2"), step("280")];
    for (const s of withWrite) expect(readStep(s.text)).toEqual({ wrong: [], unread: [] });
    expect(marksProblem(withWrite, "280", ["40", "×7"])).toBeNull();
  });

  it("rejects any single number edit in the text of all 720 two-digit questions plus random 3- and 4-digit questions", () => {
    const checkEdit = (a: number, b: number, stepIndex: number, matchIndex: number, delta: number) => {
      const steps = mulColumn.steps({ a, b });
      const answer = String(a * b);
      const target = steps[stepIndex % steps.length];
      const matches = [...target.text.matchAll(/\d+/g)];
      const chosen = matches[matchIndex % matches.length];
      const original = Number(chosen[0]);
      const next = String(original + delta);
      const editedText = `${target.text.slice(0, chosen.index)}${next}${target.text.slice((chosen.index ?? 0) + chosen[0].length)}`;
      const editedSteps = steps.map((s, i) => (i === stepIndex % steps.length ? { ...s, text: editedText } : s));
      // Every single number edit fails the full reader comparison, and the shape-free check of the grammar and the paper alone.
      const readerSteps = mulColumnRegistration.read([String(a), `×${b}`])?.steps;
      expect(canonicalJson(editedSteps)).not.toBe(canonicalJson(readerSteps));
      const endWrong = editedSteps.at(-1)?.text !== answer;
      const evalWrong = readStep(editedText).wrong.length > 0 || readStep(editedText).unread.length > 0;
      const marksWrong = marksProblem(editedSteps, answer, [String(a), `×${b}`]) !== null;
      expect(endWrong || evalWrong || marksWrong, `${a}×${b} step "${editedText}"`).toBe(true);
    };
    // All 720 two-digit questions, deterministic random edit of a number per question.
    let state = 239;
    const nextInt = (max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; };
    for (let a = 10; a <= 99; a++) {
      for (let b = 2; b <= 9; b++) {
        checkEdit(a, b, nextInt(10), nextInt(10), 1 + nextInt(8));
      }
    }
    // Random 3- and 4-digit questions via fast-check.
    fc.assert(fc.property(
      fc.integer({ min: 100, max: 9999 }),
      fc.integer({ min: 2, max: 9 }),
      fc.nat(10),
      fc.nat(10),
      fc.integer({ min: 1, max: 9 }),
      checkEdit,
    ), { numRuns: 300 });
  });
});
