import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalJson, pick, seedFrom } from "../hash";
import { TEMPLATES, type PageTemplate } from "../layout/templates";
import { shapeLibrary, type Item, type Shape } from "../shapes";
import { mulColumn, type MulColumnLimits, type MulColumnQuestion } from "../shapes/mul-column";
import * as example from "./example-shapes";
import { addItem, addQuestions, addRegistration, addShape, lessRegistration, lessShape, type AddLimits, type AddQuestion, type LessLimits, type LessQuestion } from "./example-shapes";
import { sampleBook } from "./shape-book";
import { shapeFingerprint } from "./shape-fingerprints";
import { CHECKS, checkShape, checkShapes, runChecks, SEEDS, type Check, type HarnessOptions, type ShapeReport } from "./shape-harness";
import { isInside, neverLimit, rangeLimit, registryProblems, type LargeSpace, type Limits, type Rows, type ShapeRegistration } from "./shape-registration";
import { SHAPE_REGISTRATIONS } from "./shape-registrations";
import { readStep } from "./steps-evaluator";

// Broken shapes. Every table row has one fault, and the harness must refuse it for that fault and no other.

type Add = Shape<AddLimits, AddQuestion>;
type Less = Shape<LessLimits, LessQuestion>;
interface Broken { shape: Shape; registration?: Partial<ShapeRegistration>; options?: Partial<HarnessOptions>; seeds?: number }

const add = (change: Partial<Add> = {}): Shape => ({ ...addShape, ...change }) as Shape;
const less = (change: Partial<Less> = {}): Shape => ({ ...lessShape, ...change }) as Shape;
const addSpace = addRegistration.space as readonly Rows[];
const lessSpace = lessRegistration.space as LargeSpace;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const whole = (value: string) => ({ kind: "whole-number" as const, value });

/** A few seeds are enough for a fault that every run meets. */
function check({ shape, registration, options, seeds = 48 }: Broken): ShapeReport {
  const full = { ...(shape.id === "test.add" ? addRegistration : shape.id === "test.less" ? lessRegistration : mulRegistration), ...registration };
  const own = () => { try { const hash = shapeFingerprint(shape, full); return { [shape.id]: Object.fromEntries(Array.from({ length: shape.version }, (_, i) => [i + 1, hash])) }; } catch { return {}; } };
  const all = { fingerprints: options?.fingerprints ?? own(), ...options };
  return seeds === SEEDS ? checkShape(shape, full, all) : runChecks(shape, full, seeds, all);
}
const checksOf = (report: ShapeReport) => report.failures.map((f) => f.check);

/** A question of test.add that no check asks for by name or by seed: only the list of the space reaches it. */
const QUIET: AddQuestion = { a: 16, b: 6 };
const isQuiet = (question: AddQuestion) => same(question, QUIET);
const onQuiet = <T>(normal: (question: AddQuestion) => T, quiet: T) => (question: AddQuestion): T => (isQuiet(question) ? quiet : normal(question));
/** A change of what the shape prints and reads for one question, the same in each part of the shape. */
const coordinated = (value: string, steps: string[]): Partial<Add> => ({
  answer: onQuiet(addShape.answer, whole(value)),
  solveAgain: (rows) => { const item = addShape.solveAgain(rows); return item && isQuiet(item.question) ? { ...item, answer: whole(value) } : item; },
  steps: onQuiet(addShape.steps, steps),
});
/** Other facts of the registration for one question. */
const readQuiet = (change: object): Partial<ShapeRegistration> => ({
  read: (rows) => { const printed = addRegistration.read(rows); return printed && rows.join() === "16,+6" ? { ...printed, ...change } : printed; },
});
const limitsOf = (name: string, rule: Partial<ReturnType<typeof rangeLimit>>): Partial<ShapeRegistration> => ({ limits: { ...addRegistration.limits, [name]: { ...addRegistration.limits[name], ...rule } } });
const wide = (limits: unknown) => same(limits, example.ADD_WIDE);
const middle = (limits: unknown) => same(limits, example.LESS_SMALL);

const [mulRegistration] = SHAPE_REGISTRATIONS;
const MUL_WIDE = mulRegistration.cases[0].limits;
const mulItem = (question: MulColumnQuestion): Item<MulColumnQuestion> => ({ question, answer: mulColumn.answer(question) });
/** The space of mul.column as facts in place of a list. */
function mulAsLarge(widest: (limits: Limits) => Rows | null): LargeSpace {
  const all = (mulRegistration.space as readonly Rows[]).map((rows) => ({ rows, printed: mulRegistration.read(rows), score: mulColumn.difficulty({ a: Number(rows[0]), b: Number(rows[1].slice(1)) }) }));
  const within = (l: Limits) => all.filter((q) => q.printed && isInside(mulRegistration, q.printed, l));
  const most = (l: Limits, of: (q: (typeof all)[number]) => number) => within(l).reduce((x, y) => (of(y) > of(x) ? y : x)).rows;
  return { count: (l) => within(l).length, easiest: (l) => most(l, (q) => -q.score), hardest: (l) => most(l, (q) => q.score), widest: (l) => widest(l) ?? most(l, (q) => q.printed?.widths.product ?? 0) };
}

/** The template with other places on one side. */
function withPlaces(side: "front" | "back", change: (place: PageTemplate["sides"]["front"]["places"][number]) => object): Partial<HarnessOptions> {
  const [template] = TEMPLATES.values();
  const places = template.sides[side].places.map((p) => ({ ...p, ...change(p) }));
  return { templates: new Map([[template.id, { ...template, sides: { ...template.sides, [side]: { ...template.sides[side], places } } }]]) };
}
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

/** A shape that says the steps of one question in another true way, only the second time after its fingerprint. */
function changingSteps(): Broken {
  let calls = 0;
  const shape = add({ steps: (question) => (same(question, { a: 22, b: 2 }) && ++calls === 2 ? ["2 + 2 = 4", "20 + 4 = 24", "24"] : addShape.steps(question)) });
  const fingerprints = { "test.add": { 1: shapeFingerprint(shape, addRegistration) } };
  calls = 0;
  return { shape, options: { fingerprints }, seeds: SEEDS };
}

let shared: Item<AddQuestion> = addItem(QUIET);
const REFUSED: readonly [check: Check, fault: string, broken: () => Broken, message: RegExp][] = [
  ["registration", "an empty list", () => ({ shape: add(), registration: { cases: [] } }), /cases must not be empty/],
  ["registration", "a space with a question that the reader refuses", () => ({ shape: add(), registration: { space: [...addSpace, ["31", "+1"]] } }), /the space lists \["31","\+1"\] and the reader finds no question/],
  ["registration", "a space that lists a question twice", () => ({ shape: add({ count: (l) => addQuestions(l).length + (addQuestions(l).some((q) => same(q, { a: 1, b: 1 })) ? 1 : 0) }), registration: { space: [["1", "+1"], ...addSpace] } }), /lists a question twice/],
  ["registration", "an end of a large space outside its limits", () => ({ shape: less(), registration: { space: { ...lessSpace, easiest: (l: Limits) => (middle(l) ? ["700", "-40"] : lessSpace.easiest(l)) } } }), /an end of the space is outside its limits/],
  ["witness", "an outside witness that is inside", () => ({ shape: add(), registration: { witnesses: addRegistration.witnesses.map((w) => (w.limit === "carry" ? { ...w, outside: w.inside } : w)) } }), /must break only "carry" and breaks: nothing/],
  ["witness", "an inside witness that is outside", () => ({ shape: add(), registration: { witnesses: addRegistration.witnesses.map((w) => (w.limit === "carry" ? { ...w, inside: w.outside } : w)) } }), /must meet all limits and breaks: carry/],
  ["witness", "an outside witness of another limit", () => ({ shape: add(), registration: { witnesses: [...addRegistration.witnesses, { ...addRegistration.witnesses[0], limit: "b" }] } }), /must break only "b" and breaks: a/],
  ["arbitrary", "a constant", () => ({ shape: add(), registration: limitsOf("a", { values: fc.constant({ min: 1, max: 30 }) }) }), /the limit "a" never changes/],
  ["arbitrary", "a filter that drops cases", () => ({ shape: add(), registration: limitsOf("a", { values: rangeLimit(1, 30).values.filter((v) => (v as { min: number; max: number }).min !== (v as { min: number; max: number }).max) }) }), /the limit "a" never has the registered value \{"max":7,"min":7\}/],
  ["arbitrary", "a filter that nothing passes", () => ({ shape: add(), options: { timeLimitMs: 60 }, registration: limitsOf("a", { values: rangeLimit(1, 30).values.filter(() => performance.now() < 0) }) }), /Script execution timed out after 60ms/],
  ["read-limits", "a field that is not a limit", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return read.ok ? { ...read, ignored: true } : read; } }) }), /is read as .*"ignored":true/],
  ["refused-limits", "limits outside the bounds", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return (raw as AddLimits | null)?.a?.min === -1 ? { ok: true, limits: raw as AddLimits } : read; } }) }), /must be refused with a problem that names "a"/],
  ["refused-limits", "a problem that does not name the limit", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return !read.ok && read.problem.startsWith("roundSum") ? { ok: false, problem: "bad word" } : read; } }) }), /names "roundSum"/],
  ["refused-limits", "another problem text than the named one", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return !read.ok && read.problem === "the limits must be an object" ? { ok: false, problem: "bad" } : read; } }) }), /"not an object" gave/],
  ["refused-limits", "a field beside the problem", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return read.ok ? read : { ...read, ignored: true }; } }) }), /gave \{"ignored":true/],
  ["refused-limits", "limits that no question meets", () => ({ shape: add({ readLimits: (raw) => { const read = addShape.readLimits(raw); return !read.ok && read.problem === "no question meets these limits" && !same(raw, addRegistration.refusedLimits[2].raw) ? { ok: true, limits: raw as AddLimits } : read; } }) }), /are accepted and no question meets them/],
  ["refused-limits", "an unknown limit", () => ({ shape: add({ readLimits: (raw) => { const more = raw as Record<string, unknown> | null; return addShape.readLimits(typeof more === "object" && more !== null && "another-limit" in more ? Object.fromEntries(Object.entries(more).filter(([k]) => k !== "another-limit")) : raw); } }) }), /names "another-limit"/],
  ["count", "one too many", () => ({ shape: add({ count: (l) => addShape.count(l) + (wide(l) ? 1 : 0) }) }), /allow 270 questions and the count is 271/],
  ["count", "one too many in a large space", () => ({ shape: less({ count: (l) => lessShape.count(l) + (middle(l) ? 1 : 0) }) }), /allow 78 questions and the count is 79/],
  ["count", "a question where there is none", () => ({ shape: add({ count: (l) => Math.max(1, addShape.count(l)) }) }), /no question meets .* and the count is 1/],
  ["difficulty-range", "an end that no question reaches", () => ({ shape: add({ difficultyRange: (l) => ({ ...addShape.difficultyRange(l), ...(wide(l) ? { hardest: 110 } : {}) }) }) }), /reach from 1 to 109 and the range is 1 to 110/],
  ["difficulty-range", "an end that no question reaches in a large space", () => ({ shape: less({ difficultyRange: (l) => ({ ...lessShape.difficultyRange(l), ...(same(l, example.LESS_WIDE) ? { hardest: 100 } : {}) }) }) }), /reach from 1 to 99 and the range is 1 to 100/],
  ["difficulty-range", "a field that is no end", () => ({ shape: add({ difficultyRange: (l) => ({ ...addShape.difficultyRange(l), ...(wide(l) ? { ignored: 1 } : {}) }) }) }), /"ignored":1/],
  ["worst-case", "a question that is not the widest", () => ({ shape: add({ worstCase: (l) => (wide(l) ? addItem({ a: 30, b: 8 }) : addShape.worstCase(l)) }) }), /with sum 38, and the widest has 39/],
  ["worst-case", "a question outside the limits", () => ({ shape: add({ worstCase: (l) => (same(l, example.ADD_ONE) ? addItem({ a: 30, b: 9 }) : addShape.worstCase(l)) }) }), /which is outside the limits/],
  ["worst-case", "a question of fewer digit places than the widest", () => ({ shape: { ...mulColumn, worstCase: (l: MulColumnLimits) => mulColumn.worstCase(l.product.max === 999 && l.a.max === 99 && l.b.max === 9 ? { ...l, product: { min: 10, max: 99 }, a: { min: 10, max: 49 } } : l) } as Shape, registration: { read: (rows) => { const p = mulRegistration.read(rows); return p && { ...p, widths: {} }; } } }), /needs 2 digit places and the widest question needs 3/],
  ["widening", "scores that fall when the limits grow", wrongForUnreadLimits, /have the count \d+ and the scores 1 to 1/],
  ["small-space", "a question that no seed gives", () => ({ shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return same(l, example.ADD_SIX) && item.question.a === 22 && item.question.b === 4 ? addItem({ a: 21, b: 4 }) : item; } }) }), /no seed like "seed-0" gives \["22","\+4"\]/],
  ["small-space", "a question that no seed of the old family gives", () => ({ shape: add({ generate: (l, seed) => (seed.startsWith("seed-") ? addItem(addQuestions(l)[0]) : addShape.generate(l, seed)) }) }), /no seed like "seed-0"/],
  ["small-space", "a list that leaves out a question", () => ({ shape: add(), registration: { smallSpaces: [addRegistration.smallSpaces[0], { ...addRegistration.smallSpaces[1], questions: addRegistration.smallSpaces[1].questions.slice(1) }] } }), /has the question \["21","\+2"\], which its list does not/],
  ["small-space", "a list with a question that is outside", () => ({ shape: add(), registration: { smallSpaces: [addRegistration.smallSpaces[0], { ...addRegistration.smallSpaces[1], questions: [...addRegistration.smallSpaces[1].questions, ["22", "+5"]] }] } }), /no seed like "seed-0" gives \["22","\+5"\]/],
  ["small-space", "a list with a question twice", () => ({ shape: add(), registration: { smallSpaces: [addRegistration.smallSpaces[0], { ...addRegistration.smallSpaces[1], questions: [...addRegistration.smallSpaces[1].questions, ["22", "+4"]] }] } }), /lists 7 questions and the rules allow 6/],
  ["plain", "a field with no value", () => ({ shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return { ...item, question: { ...item.question, note: undefined } }; } }) }), /holds a value that is not plain data/],
  ["plain", "a question that is not a finite number, in every part of the shape", () => ({ shape: add({ solveAgain: (rows) => { const item = addShape.solveAgain(rows); return item && isQuiet(item.question) ? { ...item, question: { ...item.question, note: Number.NaN } } : item; }, face: (question) => addShape.face(question) }) }), /holds a value that is not plain data/],
  ["determinism", "another question for the same seed", () => { let last = ""; return { shape: add({ generate: (l, seed) => { const key = canonicalJson([l, seed]); const again = key === last; last = again ? "" : key; return addShape.generate(l, again ? `${seed} again` : seed); } }) }; }, /gave .*, then /],
  ["determinism", "one object that changes", () => ({ shape: add({ generate: (l, seed) => { shared = Object.assign(shared, addShape.generate(l, seed)); return shared; } }) }), /gave the same object twice/],
  ["determinism", "a question object that two calls share", () => { const known = new Map<string, AddQuestion>(); return { shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); const key = canonicalJson(item.question); if (!known.has(key)) known.set(key, item.question); return { ...item, question: known.get(key) ?? item.question }; } }) }; }, /gave the same object twice/],
  ["determinism", "other steps the second time", changingSteps, /the steps or the score of .* changed/],
  ["inside", "a question outside the limits", () => ({ seeds: SEEDS, shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return same(l, addRegistration.cases[1].limits) && item.question.b === 9 ? addItem({ a: 11, b: 9 }) : item; } }) }), /gave \["11","\+9"\], which is outside the limits/],
  ["answer", "another answer for one seed of a small space", () => ({ shape: add({ generate: (l, seed) => { const item = addShape.generate(l, seed); return seed === "seed-0" ? { ...item, answer: whole("1") } : item; } }) }), /holds the answer .*"1".* and the shape answers/],
  ["answer-form", "a word, in every part of the shape and in the reader", () => ({ shape: add(coordinated("ok", ["ok"])), registration: readQuiet({ answer: whole("ok") }) }), /"ok"\} is no answer of the kind "whole-number"/],
  ["answer-form", "a zero in front", () => ({ shape: add(coordinated("02", ["02"])), registration: readQuiet({ answer: whole("02") }) }), /"02"\} is no answer/],
  ["independent-answer", "a wrong answer in every part of the shape", () => ({ shape: add(coordinated("23", ["23"])) }), /the answer is .*"23".* and \["16","\+6"\] reads as .*"22"/],
  ["printed", "a plus that the shape reads as a plus and the child as another sign", () => ({ shape: add({ face: onQuiet(addShape.face, { kind: "column", top: "16", sign: "×", bottom: "6" }), solveAgain: (rows) => addShape.solveAgain(rows.join() === "16,×6" ? ["16", "+6"] : rows) }) }), /the independent reader finds no question in \["16","×6"\]/],
  ["printed", "a sign that the fonts do not hold", () => ({ shape: add({ face: onQuiet(addShape.face, { kind: "column", top: "16", sign: "✚", bottom: "6" }), solveAgain: (rows) => addShape.solveAgain(rows.join() === "16,✚6" ? ["16", "+6"] : rows) }), registration: { read: (rows) => addRegistration.read(rows.join() === "16,✚6" ? ["16", "+6"] : rows) } }), /the fonts cannot print/],
  ["printed", "rows that are read as another question", () => ({ shape: add({ solveAgain: (rows) => (rows.join() === "16,+6" ? addItem({ a: 18, b: 6 }) : addShape.solveAgain(rows)) }) }), /\["16","\+6"\] is printed as \["18","\+6"\]/],
  ["solve-again", "no second answer for one question", () => ({ shape: add({ solveAgain: (rows) => (rows.join() === "16,+6" ? null : addShape.solveAgain(rows)) }) }), /solveAgain finds no question in \["16","\+6"\]/],
  ["solve-again", "another second answer for one question", () => ({ shape: add({ solveAgain: (rows) => (rows.join() === "16,+6" ? { question: QUIET, answer: whole("23") } : addShape.solveAgain(rows)) }) }), /solveAgain\(\["16","\+6"\]\) gave .*"23"/],
  ["steps-end", "an end that is not the answer", () => ({ shape: add({ steps: onQuiet(addShape.steps, ["6 + 6 = 12", "12"]) }) }), /the steps end in "12" and not in "22"/],
  ["steps-end", "no step", () => ({ shape: add({ steps: onQuiet(addShape.steps, []) }) }), /the steps end in undefined/],
  ["steps-end", "a step that the fonts cannot print", () => ({ shape: add({ steps: onQuiet(addShape.steps, ["✚", "22"]) }), registration: { stepForms: [...(addRegistration.stepForms ?? []), { name: "any", isTrue: (s, { answer: { value } }) => s === "✚" && value === "22", example: "✚", trueFor: ["16", "+6"], falseFor: ["12", "+3"] }] } }), /the step "✚" cannot be printed/],
  ["steps-true", "a false step in the middle", () => ({ shape: add({ steps: onQuiet(addShape.steps, ["6 + 6 = 13", "10 + 12 = 22", "22"]) }) }), /holds "6 \+ 6 = 13"/],
  ["steps-true", "a false step that the reader says too", () => ({ shape: add({ steps: onQuiet(addShape.steps, ["6 + 6 = 13", "22"]) }), registration: readQuiet({ steps: ["6 + 6 = 13", "22"] }) }), /holds "6 \+ 6 = 13"/],
  ["steps-form", "a step of a form that is not registered", () => ({ shape: add({ steps: onQuiet(addShape.steps, ["Think hard.", "22"]) }) }), /nothing proves the step "Think hard\."/],
  ["steps-form", "a sentence that is false for this question and true for another", () => ({ shape: add({ steps: onQuiet(addShape.steps, ["The tens stay 1.", "22"]) }) }), /nothing proves the step "The tens stay 1\."/],
  ["steps-form", "words beside an equation", () => ({ shape: add({ steps: onQuiet(addShape.steps, ["6 + 6 = 12, write 4", "22"]) }) }), /nothing proves the step "6 \+ 6 = 12, write 4"/],
  ["steps-reader", "other steps than the reader says", () => ({ shape: add(), registration: readQuiet({ steps: ["12 + 10 = 22", "22"] }) }), /the steps are .* and must be \["12 \+ 10 = 22","22"\]/],
  ["difficulty", "a score that is not a number", () => ({ shape: add({ difficulty: onQuiet(addShape.difficulty, Number.NaN), difficultyRange: addShape.difficultyRange }) }), /the score is NaN/],
  ["difficulty", "a score past the hardest, which the registration has wrong too", () => ({ seeds: SEEDS, shape: less({ difficultyRange: (l) => (middle(l) ? { easiest: 40, hardest: 41 } : lessShape.difficultyRange(l)) }), registration: { space: { ...lessSpace, hardest: (l: Limits) => (middle(l) ? ["500", "-41"] : lessSpace.hardest(l)) } } }), /has the score \d+, outside 40 to 41/],
  ["width", "a question wider than the worst case, which the registration has wrong too", () => ({ seeds: SEEDS, shape: less({ worstCase: (l) => lessShape.worstCase(middle(l) ? { ...l, left: { min: 440, max: 441 } } : l) }), registration: { space: { ...lessSpace, widest: (l: Limits) => lessSpace.widest(middle(l) ? { ...l, left: { min: 440, max: 441 } } : l) } } }), /has left 4\d\d, wider than 441/],
  ["width", "a question of more digit places than the worst case, which the registration has wrong too", () => ({
    shape: { ...mulColumn, worstCase: (l: MulColumnLimits) => (same(l, MUL_WIDE) ? mulItem({ a: 10, b: 2 }) : mulColumn.worstCase(l)) } as Shape,
    registration: { space: mulAsLarge((l) => (same(l, MUL_WIDE) ? ["10", "×2"] : null)), read: (rows) => { const p = mulRegistration.read(rows); return p && { ...p, widths: {} }; } },
  }), /needs 3 digit places, more than 2/],
  ["harder", "one score for all", () => ({ shape: add({ difficulty: () => 5, difficultyRange: () => ({ easiest: 5, hardest: 5 }) }) }), /"a carry": the score of .* is 5 and of .* is 5/],
  ["examples", "other true steps than the example", () => ({ shape: add({ steps: ({ a, b }) => (a === 17 && b === 6 ? ["6 + 7 = 13", "10 + 13 = 23", "23"] : addShape.steps({ a, b })) }) }), /"a carry" gives .*6 \+ 7 = 13/],
  ["examples", "another answer in the registration", () => ({ shape: add(), registration: { examples: [{ ...addRegistration.examples[0], answer: whole("33") }] } }), /"a carry" gives .*"23"/],
  ["refused-rows", "a zero in front of a number", () => ({ shape: add({ solveAgain: (rows) => addShape.solveAgain(rows[0] === "017" ? ["17", rows[1]] : rows) }) }), /\["017","\+6"\]: the shape reads .* and the reader refuses it/],
  ["refused-rows", "named rows", () => ({ shape: add({ solveAgain: (rows) => (rows[0] === "31" ? addItem({ a: 30, b: 3 }) : addShape.solveAgain(rows)) }) }), /\["31","\+3"\]: the shape reads/],
  ["refused-rows", "named rows that the shape and the reader accept", () => ({ shape: add(), registration: { refusedRows: [{ name: "a good question", rows: ["2", "+2"] }] } }), /the reader accepts "a good question"/],
  ["book", "a back side that reverses the digits", () => ({ shape: add(), options: reversedBack }), /back side, question 1 \(/],
  ["layout", "a back side that turns the rows, which the shape and the reader accept", () => ({ shape: add({ solveAgain: (rows) => addShape.solveAgain(eitherOrder(rows)) }), options: withPlaces("back", (p) => ({ topCells: p.bottomCells, bottomCells: p.topCells })), registration: { read: (rows) => addRegistration.read(eitherOrder(rows)) } }), /prints \["\+\d","\d+"\] and the first place prints/],
  ["evidence", "a template that no page of the book uses", () => { const [template] = TEMPLATES.values(); return { shape: add(), seeds: 1, options: { templates: new Map([template, { ...template, id: "second" }].map((t) => [t.id, t])) } }; }, /no page of the book fills second, front side and second, back side/],
  ["evidence", "no seeds", () => ({ shape: add(), seeds: 0 }), /seeds of 0/],
  ["fingerprint", "another output with the same version", () => ({ shape: add(), options: { fingerprints: { "test.add": { 1: "0".repeat(64) } } } }), /the output changed and the version is still 1/],
];

describe("the harness refuses", () => {
  it("accepts the two example shapes", () => {
    for (const shape of [add(), less()]) {
      const report = check({ shape, seeds: SEEDS });
      expect(report.failures).toEqual([]);
      expect(report.evidence.seeds).toBeGreaterThanOrEqual(1000);
    }
  });

  it.each(REFUSED)("%s: %s", (name, _fault, broken, message) => {
    const report = check(broken());
    expect(report.failures.map((f) => f.message).join("\n")).toMatch(message);
    expect(checksOf(report)).toEqual([name]);
    expect(report.failures[0].message).toMatch(/^\[(test\.(?:add|less)|mul\.column)\] [a-z-]+: .*\(fast-check seed 236\)$/);
  });

  it("has a broken shape for each check", () => {
    expect([...new Set(REFUSED.map(([name]) => name))].sort()).toEqual([...CHECKS].sort());
  });
});

describe("wrong shapes that touch more than one check", () => {
  const bad = (change: Partial<Add>): Broken => ({ shape: add(change) });
  const registered: AddLimits = example.ADD_WIDE;
  it.each<[string, Check[], () => Broken]>([
    ["that gives one question for each seed of the form that the build makes", ["inside", "book"], () => ({ ...bad({ generate: (l, seed) => (/^[0-9a-f]{64}$/.test(seed) ? addShape.generate(registered, "a".repeat(64)) : addShape.generate(l, seed)) }), seeds: SEEDS })],
    ["that gives one question for each first try of a place", ["inside", "small-space"], () => bad({ generate: (l, seed) => (seed === seedFrom(seedFrom("child", "six questions", 3), "front", "row", 0, 0) ? addItem({ a: 30, b: 9 }) : addShape.generate(l, seed)) })],
    ["that answers with a word in every part", ["answer-form", "independent-answer"], () => {
      const word = <T extends { answer: { value: string } }>(item: T): T => ({ ...item, answer: { ...item.answer, value: "cat" } });
      return bad({ answer: (q) => word(addItem(q)).answer, generate: (l, s) => word(addShape.generate(l, s)), worstCase: (l) => word(addShape.worstCase(l)), solveAgain: (rows) => { const item = addShape.solveAgain(rows); return item && word(item); }, steps: () => ["cat"] });
    }],
    ["that prints another sign than it computes", ["printed"], () => bad({ face: (q) => ({ ...addShape.face(q), sign: "×" }), solveAgain: (rows) => addShape.solveAgain(rows.map((row) => row.replace("×", "+"))) })],
    ["that prints a face that no template takes", ["printed", "book"], () => bad({ face: (q) => ({ ...addShape.face(q), kind: "story" as "column" }) })],
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
    ["with an answer kind that has no rule", ["answer-form"], () => bad({ answerKind: "quotient-remainder" as "whole-number" })],
  ])("a shape %s", (_name, wanted, broken) => {
    const found = checksOf(check(broken()));
    for (const name of wanted) expect(found).toContain(name);
  });

  it.each<[string, Check[], () => Broken]>([
    ["with a rule that permits everything", ["witness"], () => ({ shape: add(), registration: limitsOf("carry", { allows: () => true }) })],
    ["with a rule that permits nothing", ["witness"], () => ({ shape: add(), registration: limitsOf("carry", { allows: () => false }) })],
    ["with a reader that knows no questions", ["registration"], () => ({ shape: add(), registration: { read: () => null } })],
    ["with a width that is not a number", ["worst-case"], () => ({ shape: add(), registration: { read: (rows) => { const p = addRegistration.read(rows); return p && { ...p, widths: { sum: Number.NaN } }; } } })],
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
    const [one, two] = [check({ shape: broken }), check({ shape: broken })];
    expect(two.failures).toEqual(one.failures);
    const message = one.failures.find((f) => f.check === "inside")?.message ?? "";
    const [, limits, seed] = /generate\((\{.*\}), "([^"]*)"\)/.exec(message) ?? [];
    expect(broken.generate(JSON.parse(limits), seed)).toEqual(addItem({ a: 30, b: 8 }));
  });
});

describe("the book of a shape", () => {
  const [first] = TEMPLATES.values();
  const fitting = [first, { ...first, id: "second" }];
  const sidesOf = (spaces: Parameters<typeof sampleBook>[1], seeds: number) => {
    const { input, unfilled } = sampleBook("test.add", spaces, seeds);
    const { sheets } = input.snapshot as { sheets: Record<"front" | "back", { template: string; rows: { limits: unknown; items: number }[] }>[] };
    return { unfilled, sides: sheets.flatMap(({ front, back }) => [front, back]).map(({ template, rows }) => [template, rows.map((r) => r.items)]) };
  };

  it("fills each side of each template one time", () => {
    const { unfilled, sides } = sidesOf([{ limits: example.ADD_WIDE, count: 270, fitting }, { limits: example.ADD_SIX, count: 6, fitting }], 64);
    expect(unfilled).toEqual([]);
    expect(sides).toEqual([["columns-2x4", [8]], ["columns-2x4", [6, 2]], ["second", [8]], ["second", [8]], ["columns-2x4", [8]], ["columns-2x4", [6]], ["second", [8]], ["second", [8]]]);
  });

  it("fills one side of a sheet when the shape has few questions", () => {
    const { unfilled, sides } = sidesOf([{ limits: example.ADD_SIX, count: 3, fitting }], 1000);
    expect(unfilled).toEqual([]);
    const [one, two] = ["columns-2x4", "second"].map((id) => [[id, [3, 3, 2]], [id, [1]], [id, [1]], [id, [3, 3, 2]]]);
    expect(sides).toEqual([...one, ...two, ["columns-2x4", [3]], ["columns-2x4", [1]], ["columns-2x4", [1]], ["columns-2x4", [3]]]);
  });

  it.each([[1, 1], [1, 1000], [3, 64], [270, 1]])("uses each of nine limits with %i questions and %i seeds", (count, seeds) => {
    const spaces = Array.from({ length: 9 }, (_, i) => ({ limits: { n: i }, count, fitting: [first] }));
    const text = JSON.stringify(sampleBook("test.add", spaces, seeds).input.snapshot);
    for (const { limits } of spaces) expect(text).toContain(JSON.stringify(limits));
  });

  it("uses all the limits, the largest first", () => {
    const spaces = Array.from({ length: 5 }, (_, i) => ({ limits: { n: i }, count: 100 * (i + 1), fitting: [first] }));
    const { input } = sampleBook("test.add", spaces, 160);
    const text = JSON.stringify(input.snapshot);
    expect([...text.matchAll(/"n":(\d)/g)].slice(0, 2).map((m) => m[1])).toEqual(["4", "3"]);
    for (const { limits } of spaces) expect(text).toContain(JSON.stringify(limits));
  });

  it("of a shape with two questions passes, and other seeds fill the number", () => {
    type Pair = { a: number };
    const item = ({ a }: Pair): Item<Pair> => ({ question: { a }, answer: whole(String(a + 1)) });
    const all = ({ a }: { a: { min: number; max: number } }) => [{ a: 1 }, { a: 2 }].filter((q) => q.a >= a.min && q.a <= a.max);
    const shape: Shape<{ a: { min: number; max: number } }, Pair> = {
      id: "test.two", version: 1, answerKind: "whole-number",
      readLimits: (raw) => {
        const read = addShape.readLimits({ ...example.ADD_WIDE, ...(raw as object) });
        const { a, ...more } = (raw ?? {}) as { a?: { min: number; max: number } };
        if (Object.keys(more).length > 0) return { ok: false, problem: `unknown limit "${Object.keys(more)[0]}"` };
        return read.ok && a && a.max <= 2 ? { ok: true, limits: { a } } : { ok: false, problem: "a must be from 1 to 2" };
      },
      generate: (limits, seed) => item(all(limits)[pick(seed, all(limits).length)]),
      answer: (q) => item(q).answer,
      solveAgain: (rows) => (rows.length === 2 && /^[12]$/.test(rows[0]) && rows[1] === "+1" ? item({ a: Number(rows[0]) }) : null),
      steps: ({ a }) => [`${a} + 1 = ${a + 1}`, String(a + 1)],
      difficulty: ({ a }) => a, difficultyRange: ({ a }) => ({ easiest: a.min, hardest: a.max }),
      worstCase: ({ a }) => item({ a: a.max }), count: (limits) => all(limits).length,
      face: ({ a }) => ({ kind: "column", top: String(a), sign: "+", bottom: "1" }),
    };
    const only = (min: number, max: number): Limits => ({ a: { min, max } });
    const registration: ShapeRegistration = {
      id: "test.two", limits: { a: rangeLimit(1, 2) }, space: [["1", "+1"], ["2", "+1"]], cases: [{ name: "both", limits: only(1, 2) }],
      read: (rows) => { const p = /^[12]$/.test(rows[0] ?? "") && rows[1] === "+1" ? addRegistration.read(rows) : null; return p && { ...p, features: { a: p.features.a } }; },
      smallSpaces: [{ name: "one question", limits: only(2, 2), questions: [["2", "+1"]] }],
      witnesses: [{ limit: "a", limits: only(1, 1), inside: ["1", "+1"], outside: ["2", "+1"] }],
      harder: [{ name: "more", easier: ["1", "+1"], harder: ["2", "+1"] }],
      examples: [{ name: "two", rows: ["2", "+1"], answer: whole("3"), steps: ["2 + 1 = 3", "3"] }],
      refusedLimits: [{ name: "three", raw: only(1, 3), problem: "a must be from 1 to 2" }], refusedRows: [{ name: "three", rows: ["3", "+1"] }],
    };
    const report = check({ shape: shape as Shape, registration, seeds: SEEDS });
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
    ["no limits", () => registryProblems(library, [{ ...addRegistration, limits: {} }]), "[test.add] registration: limits must not be empty"],
    ["a limit with no witness", () => registryProblems(library, [{ ...addRegistration, witnesses: addRegistration.witnesses.filter((w) => w.limit !== "sum") }]), '[test.add] registration: the limit "sum" has no witness'],
    ["limits with another name", () => registryProblems(library, [{ ...addRegistration, cases: [{ name: "odd", limits: { ...example.ADD_WIDE, more: 1 } }] }]), '[test.add] registration: the limits of "odd" must be a, b, sum, carry, roundSum'],
    ["a step form that accepts everything", () => registryProblems(library, [{ ...addRegistration, stepForms: [{ name: "any", isTrue: () => true, example: "a", trueFor: ["12", "+3"], falseFor: ["16", "+6"] }] }]), '[test.add] registration: the step form "any" accepts "a" for the question that it is false for'],
    ["a step form that accepts nothing", () => registryProblems(library, [{ ...addRegistration, stepForms: [{ name: "none", isTrue: () => false, example: "a", trueFor: ["12", "+3"], falseFor: ["16", "+6"] }] }]), '[test.add] registration: the step form "none" refuses "a" for the question that it is true for'],
    ["a step form with rows that print no question", () => registryProblems(library, [{ ...addRegistration, stepForms: [{ name: "odd", isTrue: () => true, example: "a", trueFor: ["12", "+3"], falseFor: ["31", "+6"] }] }]), '[test.add] registration: the step form "odd" names rows that print no question'],
  ])("refuses %s, and the suite reports it", (_name, problems, text) => expect(problems()).toContain(text));

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

  it("never refuses a question with the feature, and allowed permits it", () => {
    const rule = neverLimit();
    expect([[true, "never"], [true, "allowed"], [false, "never"], [false, "allowed"], [undefined, "allowed"]].map(([feature, limit]) => rule.allows(feature, limit))).toEqual([false, true, true, true, false]);
    expect([rule.widen("never", "allowed"), rule.widen("allowed", "never"), rule.widen("never", "never")]).toEqual(["allowed", "allowed", "never"]);
  });
});

describe("reading a worked step", () => {
  it.each<[string, string[], boolean]>([
    ["3 × 4 = 12", [], true],
    ["3 × 4 = 13", ["3 × 4 = 13"], true],
    ["7 + 8 = 15, 20 + 15 = 35", [], true],
    ["7 + 8 = 15, 20 + 15 = 36", ["20 + 15 = 36"], true],
    ["2 + 3 × 4 = 14", [], true],
    ["9 - 2 - 3 = 4", [], true],
    ["9 − 2 = 6", ["9 − 2 = 6"], true],
    ["12 ÷ 4 = 3", [], true],
    ["7 ÷ 2 = 3", ["7 ÷ 2 = 3"], true],
    ["1.5 + 2 = 3.5", [], true],
    ["0.1 + 0.2 = 0.3", [], true],
    ["0.1 + 0.2 = 0.30", [], true],
    ["1 ÷ 3 × 3 = 1", [], true],
    ["9007199254740992 + 1 = 9007199254740992", ["9007199254740992 + 1 = 9007199254740992"], true],
    ["9007199254740992 + 1 = 9007199254740993", [], true],
    ["5 ÷ 0 = 0", ["5 ÷ 0 = 0"], true],
    ["2 + 3 = 5.", [], true],
    ["2 + 3 = 5. 1 + 1 = 3.", ["1 + 1 = 3"], true],
    ["2 + 3 = 5.1", ["2 + 3 = 5.1"], true],
    ["2 + 3 = 5.1.", ["2 + 3 = 5.1"], true],
    ["3 × 4 = 12, write 2", [], false],
    ["plus 1 is 7", [], false],
    ["12", [], false],
    ["", [], false],
    ["3 × 4 = 10 + 2", [], false],
    ["3 × 4 = 12 = 13", [], false],
    ["-3 + 4 = 7", [], false],
  ])("%s", (step, wrong, isWhole) => expect(readStep(step)).toEqual({ wrong, whole: isWhole }));

  it("says of any sum, difference and product whether it is true", () => {
    fc.assert(fc.property(fc.nat(999), fc.constantFrom("+", "-", "×"), fc.nat(99), fc.nat(5), (a, sign, b, off) => {
      const value = sign === "+" ? a + b : sign === "-" ? a + b - b : a * b;
      const step = sign === "-" ? `${a + b} - ${b} = ${value + off}` : `${a} ${sign} ${b} = ${value + off}`;
      expect(readStep(step)).toEqual({ wrong: off === 0 ? [] : [step], whole: true });
    }));
  });
});
