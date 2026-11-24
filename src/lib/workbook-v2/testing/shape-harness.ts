// One harness for every shape (docs/workbook-v2-engine.md, "Adding a shape"). It compares a shape with the independent
// facts of its registration, on questions that the production builder makes. Evidence that is missing is a failure.
import vm from "node:vm";
import fc from "fast-check";
import { plainCopy } from "../bank/plain";
import type { TemplateLibrary } from "../bank/snapshot";
import { planBook } from "../build/build-book";
import { itemSeed } from "../build/items";
import { printedRows } from "../checks/printed-answers";
import { isPrintable, type Answer, type AnswerKind, type BookItem, type Side } from "../contract";
import { canonicalJson, seedFrom } from "../hash";
import { itemRegions } from "../layout/build-pages";
import { digitPlaces, TEMPLATES, type PageTemplate } from "../layout/templates";
import { shapeLibrary, type Item, type Shape, type ShapeLibrary } from "../shapes";
import { sampleBook } from "./shape-book";
import { fingerprintProblem } from "./shape-fingerprints";
import { isInside, registryProblems, type LargeSpace, type Limits, type Printed, type Rows, type ShapeRegistration } from "./shape-registration";
import { readStep } from "./steps-evaluator";

/** How many production seeds each registered shape gets. */
export const SEEDS = 1000;
/** The seed of fast-check, so that every run uses the same limits and a failure can be repeated. */
export const SAMPLE_SEED = 236;
const ARBITRARY_LIMITS = 120;
const TIME_LIMIT_MS = 2000;
const MAX_REACH = 1000;
/** A shape that gives few different questions makes the build try again and again. */
const MAX_SEEDS = 20_000;

export const CHECKS = [
  "registration", "witness", "arbitrary", "read-limits", "refused-limits", "count", "difficulty-range", "worst-case", "widening", "small-space",
  "plain", "determinism", "inside", "answer", "answer-form", "independent-answer", "printed", "solve-again", "steps-end", "steps-true", "steps-form",
  "steps-reader", "difficulty", "width", "harder", "examples", "refused-rows", "book", "layout", "evidence", "fingerprint",
] as const;
export type Check = (typeof CHECKS)[number];

export interface ShapeReport {
  shape: string;
  version: number;
  failures: { check: Check; message: string }[];
  /** What the checks used. */
  evidence: { seeds: number; limits: number; questions: number };
  durationMs: number;
}

export interface HarnessOptions {
  fingerprints: unknown;
  templates?: TemplateLibrary;
  /** How long the limits of a registration may take to make. */
  timeLimitMs?: number;
}

/** What an answer of each kind must look like. A new kind needs its rule here. */
const ANSWER_FORMS: Readonly<Record<AnswerKind, (answer: Answer) => boolean>> = {
  "whole-number": ({ value, ...more }) => /^(0|[1-9]\d*)$/.test(value) && Object.keys(more).join() === "kind",
};

const SIDES: readonly Side[] = ["front", "back"];
const keyOf = (rows: Rows): string => rows.join("\n");
const show = (rows: Rows): string => JSON.stringify(rows);
const isPlain = (value: unknown): boolean => plainCopy("value", value).ok;

/** A shape that changes the limits that it gets throws. */
function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null) Object.values(value).forEach(frozen);
  return Object.freeze(value);
}

/** All that the checks know about one question. */
interface Inspected { question: unknown; rows: Rows; printed: Printed; answer: string; steps: string; score: number; places: number }
/** One question of a listed space: what the reader says of it, and the question of the shape if it has one. */
interface Listed { rows: Rows; printed: Printed; asked: Inspected | null }
/** All that the checks know about one set of limits. */
interface Space { limits: Limits; json: string; count: number; easiest: number; hardest: number; widths: Readonly<Record<string, number>>; places: number }

const maxOf = (widths: readonly Readonly<Record<string, number>>[]): Record<string, number> =>
  Object.fromEntries(Object.keys(widths[0] ?? {}).map((name) => [name, Math.max(...widths.map((w) => w[name]))]));

class Harness {
  readonly failures = new Map<Check, string>();
  seeds = 0;
  readonly inspected = new Map<string, Inspected | null>();
  private readonly byRows = new Map<string, Inspected | null>();
  readonly spaces = new Map<string, Space | null>();
  private readonly seen = new WeakMap<Limits, Space | null>();
  private every: Listed[] | null = null;
  /** The shape with a `generate` that checks each question that it gives. */
  readonly watched: Shape;

  constructor(readonly shape: Shape, readonly reg: ShapeRegistration, readonly wantedSeeds: number, readonly options: HarnessOptions) {
    this.watched = Object.assign(Object.create(shape) as Shape, { generate: (limits: unknown, seed: string) => this.generate(limits as Limits, seed) });
  }

  get templates(): PageTemplate[] { return [...(this.options.templates ?? TEMPLATES).values()]; }

  /** The first failure of each check is kept. */
  tell(check: Check, detail: string): null {
    if (!this.failures.has(check)) this.failures.set(check, `[${this.shape.id}] ${check}: ${detail} (fast-check seed ${SAMPLE_SEED})`);
    return null;
  }

  guard<T>(check: Check, run: () => T): T | null {
    try {
      return run();
    } catch (error) {
      return this.tell(check, `threw ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** The rows that the real layout prints for a question. */
  private print(question: unknown, answer: Answer): { rows: Rows; places: number } {
    const face = this.shape.face(question);
    const places = digitPlaces(face, answer.value);
    const template = this.templates.find((t) => t.faces.includes(face.kind) && t.digits >= places);
    if (!template) throw new Error(`no template takes a ${face.kind} question with ${places} digit places`);
    const item: BookItem = { id: "i", sheetId: "s", side: "front", rowId: "r", number: 1, shape: this.shape.id, shapeVersion: 1, question, face, answer, steps: [], difficulty: 0 };
    const region = itemRegions(template, template.sides.front.places[0], item, (name) => name).find((r) => r.role === "question");
    return { rows: printedRows(region?.ink ?? []), places };
  }

  /** Everything about a question that no limits decide. Each question is inspected once. */
  private inspect(question: unknown): Inspected | null {
    const key = canonicalJson(question);
    const known = this.inspected.get(key);
    if (known !== undefined) return known;
    const result = this.guard("printed", () => this.inspectNew(question, key));
    this.inspected.set(key, result);
    return result;
  }

  private inspectNew(question: unknown, key: string): Inspected | null {
    const { shape, reg } = this;
    const answer = shape.answer(question);
    const answerJson = canonicalJson(answer);
    const at = `question ${key}`;
    if (!isPlain({ question, answer })) this.tell("plain", `${at} holds a value that is not plain data`);
    if (answer.kind !== shape.answerKind || !ANSWER_FORMS[answer.kind]?.(answer)) this.tell("answer-form", `${at}: ${answerJson} is no answer of the kind "${shape.answerKind}"`);
    const { rows, places } = this.print(question, answer);
    if (!rows.every(isPrintable)) this.tell("printed", `${at}: the fonts cannot print ${show(rows)}`);
    const printed = reg.read(rows);
    if (!printed) return this.tell("printed", `${at}: the independent reader finds no question in ${show(rows)}`);
    const read = canonicalJson(printed.answer);
    if (read !== answerJson) this.tell("independent-answer", `${at}: the answer is ${answerJson} and ${show(rows)} reads as ${read}`);
    const solved = this.guard("solve-again", () => canonicalJson(shape.solveAgain(rows)));
    if (solved !== `{"answer":${answerJson},"question":${key}}`) this.tell("solve-again", `${at}: solveAgain(${show(rows)}) gave ${solved}`);
    const steps = shape.steps(question);
    this.checkSteps(steps, answer, printed, at);
    const score = shape.difficulty(question);
    if (!Number.isFinite(score)) this.tell("difficulty", `${at}: the score is ${score}`);
    return { question, rows, printed, answer: answerJson, steps: JSON.stringify(steps), score, places };
  }

  private checkSteps(steps: readonly string[], answer: Answer, printed: Printed, at: string): void {
    const bad = steps.find((s) => typeof s !== "string" || s === "" || !isPrintable(s));
    if (bad !== undefined) this.tell("steps-end", `${at}: the step ${JSON.stringify(bad)} cannot be printed`);
    if (steps.at(-1) !== answer.value) this.tell("steps-end", `${at}: the steps end in ${JSON.stringify(steps.at(-1))} and not in "${answer.value}"`);
    for (const step of steps.slice(0, -1)) {
      const { wrong, whole } = readStep(step);
      const form = whole ? undefined : this.reg.stepForms?.find((f) => f.isTrue(step));
      if (wrong.length > 0) this.tell("steps-true", `${at}: the step "${step}" holds "${wrong[0]}"`);
      if (!whole && !form && !printed.steps) this.tell("steps-form", `${at}: nothing proves the step "${step}"`);
    }
    if (printed.steps && JSON.stringify(printed.steps) !== JSON.stringify(steps)) this.tell("steps-reader", `${at}: the steps are ${show(steps)} and must be ${show(printed.steps)}`);
  }

  /** The question that rows print, by the shape. */
  ask(rows: Rows): Inspected | null {
    const key = keyOf(rows);
    const known = this.byRows.get(key);
    if (known !== undefined) return known;
    const solved = this.guard("solve-again", () => this.shape.solveAgain(rows));
    const asked = solved ? this.inspect(solved.question) : this.tell("solve-again", `solveAgain finds no question in ${show(rows)}`);
    if (asked && keyOf(asked.rows) !== key) this.tell("printed", `${show(rows)} is printed as ${show(asked.rows)}`);
    this.byRows.set(key, asked);
    return asked;
  }

  /** The question of an item, with its answer compared. */
  private itemOf({ question, answer }: Item<unknown>, at: () => string): Inspected | null {
    const found = this.inspect(question);
    if (!isPlain({ question, answer })) this.tell("plain", `${at()} gave ${canonicalJson(question)}, which holds a value that is not plain data`);
    if (found && canonicalJson(answer) !== found.answer) this.tell("answer", `${at()} holds the answer ${canonicalJson(answer)} and the shape answers ${found.answer}`);
    return found;
  }

  /** Every question that the harness asks of `generate` comes through here. */
  generate(limits: Limits, seed: string): Item<unknown> {
    const at = () => `generate(${canonicalJson(limits)}, "${seed}")`;
    const first = this.shape.generate(limits, seed);
    const copy = canonicalJson(first);
    const again = this.shape.generate(limits, seed);
    if (canonicalJson(again) !== copy || canonicalJson(first) !== copy) this.tell("determinism", `${at()} gave ${copy}, then ${canonicalJson(again)}`);
    if (again === first || again.answer === first.answer || (again.question === first.question && typeof first.question === "object")) this.tell("determinism", `${at()} gave the same object twice`);
    if (++this.seeds > MAX_SEEDS) throw new Error(`the build asked for more than ${MAX_SEEDS} questions to find ${this.wantedSeeds} different ones`);
    const item = this.itemOf(first, at);
    const space = this.spaceOf(limits);
    if (!item || !space) return first;
    if (!isInside(this.reg, item.printed, limits)) this.tell("inside", `${at()} gave ${show(item.rows)}, which is outside the limits`);
    if (item.score < space.easiest || item.score > space.hardest) this.tell("difficulty", `${at()} has the score ${item.score}, outside ${space.easiest} to ${space.hardest}`);
    for (const [name, width] of Object.entries(item.printed.widths)) if (!(width <= space.widths[name])) this.tell("width", `${at()} has ${name} ${width}, wider than ${space.widths[name]}`);
    if (item.places > space.places) this.tell("width", `${at()} needs ${item.places} digit places, more than ${space.places}`);
    return first;
  }

  /** The independent facts of some limits; null when no question meets them. */
  spaceOf(limits: Limits): Space | null {
    const seen = this.seen.get(limits);
    if (seen !== undefined) return seen;
    const json = canonicalJson(limits);
    let space = this.spaces.get(json);
    if (space === undefined) {
      const facts = this.every ? this.listedFacts(this.every, limits) : this.largeFacts(this.reg.space as LargeSpace, limits);
      space = facts && { limits, json, ...facts };
      this.spaces.set(json, space);
    }
    this.seen.set(limits, space);
    return space;
  }

  private listedFacts(every: readonly Listed[], limits: Limits): Omit<Space, "limits" | "json"> | null {
    const inside = every.filter((q) => isInside(this.reg, q.printed, limits));
    if (inside.length === 0) return null;
    const asked = inside.map((q) => q.asked).filter((q) => q !== null);
    const scores = asked.map((q) => q.score).filter(Number.isFinite);
    return { count: inside.length, easiest: Math.min(...scores), hardest: Math.max(...scores), widths: maxOf(inside.map((q) => q.printed.widths)), places: Math.max(...asked.map((q) => q.places)) };
  }

  private largeFacts(large: LargeSpace, limits: Limits): Omit<Space, "limits" | "json"> | null {
    const count = large.count(limits);
    if (count === 0) return null;
    const [easiest, hardest, widest] = [large.easiest(limits), large.hardest(limits), large.widest(limits)].map((rows) => this.ask(rows));
    if (!easiest || !hardest || !widest) return null;
    if (![easiest, hardest, widest].every((q) => isInside(this.reg, q.printed, limits))) this.tell("registration", `an end of the space is outside its limits ${canonicalJson(limits)}`);
    return { count, easiest: easiest.score, hardest: hardest.score, widths: widest.printed.widths, places: widest.places };
  }

  private checkSpace({ limits, json, count, easiest, hardest, widths, places }: Space): void {
    const { shape } = this;
    const read = this.guard("read-limits", () => canonicalJson(shape.readLimits(JSON.parse(json))));
    if (read !== null && read !== canonicalJson({ ok: true, limits })) this.tell("read-limits", `${json} is read as ${read}`);
    const counted = shape.count(limits);
    if (!Number.isSafeInteger(counted) || counted !== count) this.tell("count", `${json} allow ${count} questions and the count is ${counted}`);
    const range = shape.difficultyRange(limits);
    if (!isPlain(range) || canonicalJson(range) !== canonicalJson({ easiest, hardest })) this.tell("difficulty-range", `${json} reach from ${easiest} to ${hardest} and the range is ${range.easiest} to ${range.hardest} (${canonicalJson(range)})`);
    const worst = this.itemOf(shape.worstCase(limits), () => `worstCase(${json})`);
    if (!worst) return;
    if (!isInside(this.reg, worst.printed, limits)) this.tell("worst-case", `worstCase(${json}) is ${show(worst.rows)}, which is outside the limits`);
    const narrow = Object.entries(widths).find(([name, width]) => !(worst.printed.widths[name] >= width));
    if (narrow) this.tell("worst-case", `worstCase(${json}) is ${show(worst.rows)}, with ${narrow[0]} ${worst.printed.widths[narrow[0]]}, and the widest has ${narrow[1]}`);
    if (worst.places < places) this.tell("worst-case", `worstCase(${json}) needs ${worst.places} digit places and the widest question needs ${places}`);
  }

  /** Limits that the registration names, then limits that fast-check makes inside a time limit. */
  sampleLimits(): { named: Limits[]; made: Limits[] } {
    const { reg } = this;
    const named = [...new Map([...reg.cases, ...reg.smallSpaces, ...reg.witnesses].map((c) => [canonicalJson(c.limits), c.limits])).values()];
    const made = this.guard("arbitrary", () => {
      const run = () => fc.sample(fc.record(Object.fromEntries(Object.entries(reg.limits).map(([name, rule]) => [name, rule.values]))), { numRuns: ARBITRARY_LIMITS, seed: SAMPLE_SEED });
      return vm.runInNewContext("run()", { run }, { timeout: this.options.timeLimitMs ?? TIME_LIMIT_MS }) as Limits[];
    }) ?? [];
    for (const [name, { values }] of Object.entries(reg.limits)) {
      if (made.length > 0 && new Set(made.map((l) => canonicalJson(l[name]))).size < 2) this.tell("arbitrary", `the limit "${name}" never changes`);
      const lost = named.find((l) => !values.canShrinkWithoutContext(l[name]));
      if (lost) this.tell("arbitrary", `the limit "${name}" never has the registered value ${canonicalJson(lost[name])}`);
    }
    return { named: named.map(frozen), made: made.map(frozen) };
  }

  checkSpaces(named: readonly Limits[], made: readonly Limits[]): Space[] {
    const spaces: Space[] = [];
    for (const limits of [...named, ...made]) {
      const space = this.spaceOf(limits);
      if (space) spaces.push(space);
      else this.checkEmpty(limits, named.includes(limits));
    }
    this.guard("count", () => spaces.forEach((space) => this.checkSpace(space)));
    this.guard("widening", () => this.checkWidening(spaces));
    return spaces;
  }

  private checkEmpty(limits: Limits, isNamed: boolean): void {
    if (isNamed) this.tell("registration", `no question meets the registered limits ${canonicalJson(limits)}`);
    if (this.shape.readLimits(limits).ok) this.tell("refused-limits", `${canonicalJson(limits)} are accepted and no question meets them`);
    if (this.shape.count(limits) !== 0) this.tell("count", `no question meets ${canonicalJson(limits)} and the count is ${this.shape.count(limits)}`);
  }

  /** The count and the hardest score never go down when limits grow, and the easiest score never goes up. */
  private checkWidening(spaces: readonly Space[]): void {
    const sizes = spaces.map(({ limits }) => ({ limits, count: this.shape.count(limits), ...this.shape.difficultyRange(limits) }));
    sizes.slice(1).forEach((one, i) => {
      const pair = [sizes[i], one];
      const wide = Object.fromEntries(Object.entries(this.reg.limits).map(([name, rule]) => [name, rule.widen(pair[0].limits[name], pair[1].limits[name])]));
      const count = this.shape.count(wide);
      const { easiest, hardest } = this.shape.difficultyRange(wide);
      const narrow = pair.find((p) => !(count >= p.count && easiest <= p.easiest && hardest >= p.hardest));
      if (narrow) this.tell("widening", `${canonicalJson(wide)} have the count ${count} and the scores ${easiest} to ${hardest}, and ${canonicalJson(narrow)} are inside them`);
    });
  }

  /** Lists the space and proves that the rules tell inside from outside. */
  prepare(): void {
    const { space, witnesses, limits: rules } = this.reg;
    if (Array.isArray(space)) {
      if (new Set((space as Rows[]).map(keyOf)).size < space.length) this.tell("registration", "the space lists a question twice");
      this.every = (space as Rows[]).flatMap((rows) => {
        const printed = this.reg.read(rows);
        if (!printed) this.tell("registration", `the space lists ${show(rows)} and the reader finds no question in it`);
        return printed ? [{ rows, printed, asked: this.ask(rows) }] : [];
      });
    }
    for (const { limit, limits, inside, outside } of witnesses) {
      const broken = (rows: Rows) => {
        const printed = this.reg.read(rows);
        return printed ? Object.keys(rules).filter((name) => !rules[name].allows(printed.features[name], limits[name])).join(", ") : "no question";
      };
      if (broken(inside) !== "") this.tell("witness", `${show(inside)} must meet all limits and breaks: ${broken(inside)}`);
      if (broken(outside) !== limit) this.tell("witness", `${show(outside)} must break only "${limit}" and breaks: ${broken(outside) || "nothing"}`);
    }
  }

  checkNamedQuestions(): void {
    for (const { name, easier, harder } of this.reg.harder) {
      const [low, high] = [this.ask(easier)?.score, this.ask(harder)?.score];
      if (low !== undefined && high !== undefined && !(high > low)) this.tell("harder", `"${name}": the score of ${show(harder)} is ${high} and of ${show(easier)} is ${low}`);
    }
    for (const { name, rows, answer, steps } of this.reg.examples) {
      const found = this.ask(rows);
      if (found && (found.answer !== canonicalJson(answer) || found.steps !== JSON.stringify(steps))) this.tell("examples", `"${name}" gives ${found.answer} with ${found.steps}`);
    }
  }

  checkRefusedLimits(): void {
    const { shape, reg } = this;
    const good = reg.cases[0].limits;
    const refuse = (raw: unknown, name: string) => {
      const read = shape.readLimits(raw);
      if (read.ok || typeof read.problem !== "string" || !read.problem.includes(name)) this.tell("refused-limits", `${JSON.stringify(raw)} must be refused with a problem that names "${name}", and gave ${canonicalJson(read)}`);
    };
    for (const [name, { bad }] of Object.entries(reg.limits)) for (const value of bad) refuse({ ...good, [name]: value }, name);
    for (const raw of [null, undefined, "limits", 5, [], [good]]) refuse(raw, "");
    refuse({ ...good, "another-limit": 1 }, "another-limit");
    for (const { name, raw, problem } of reg.refusedLimits) {
      const read = canonicalJson(shape.readLimits(raw));
      if (read !== canonicalJson({ ok: false, problem })) this.tell("refused-limits", `"${name}" gave ${read}`);
    }
  }

  /** Named rows that print no question, and broken copies of good rows: the reader and the shape must agree on each. */
  checkRefusedRows(): void {
    const good = [...this.reg.examples.map((e) => e.rows), ...this.reg.smallSpaces.flatMap((s) => s.questions)].slice(0, 12);
    const broken = good.flatMap((rows) => [
      [], [...rows, ""], [...rows, rows[0]], [...rows].reverse(),
      ...rows.flatMap((row, i) => ["", `0${row}`, ` ${row}`, `${row} `, `${row}0`, row.slice(1), row.slice(0, -1), `-${row}`, `${row}.0`, ...["+", "-", "×", "÷", "x"].map((sign) => row.replace(/[-+×÷]/, sign))]
        .map((other) => rows.map((r, j) => (j === i ? other : r)))),
    ]);
    for (const rows of [...broken, ...this.reg.refusedRows.map((r) => r.rows)]) {
      const [reader, solver] = [this.reg.read(rows)?.answer, this.shape.solveAgain(rows)?.answer].map((answer) => (answer ? `reads ${canonicalJson(answer)}` : "refuses it"));
      if (reader !== solver) this.tell("refused-rows", `${show(rows)}: the shape ${solver} and the reader ${reader}`);
    }
    const accepted = this.reg.refusedRows.find(({ rows }) => this.reg.read(rows) !== null);
    if (accepted) this.tell("refused-rows", `the reader accepts "${accepted.name}", which must be refused`);
  }

  /** Each small space: the list of the shape, of the registration and of the rules must be the same questions. */
  checkSmallSpaces(): void {
    for (const { name, limits, questions } of this.reg.smallSpaces) {
      const wanted = new Set(questions.map(keyOf));
      const listed = this.every?.filter((q) => isInside(this.reg, q.printed, limits)).map(({ rows }) => keyOf(rows));
      const reached = new Set<string>();
      const families = [(i: number) => `seed-${i}`, (i: number) => itemSeed(seedFrom("child", name, i), "front", "row", 0, 0)];
      for (const family of families) {
        const left = new Set(wanted);
        for (let i = 0; i < Math.max(MAX_REACH, 40 * wanted.size) && left.size > 0; i++) {
          const key = keyOf(this.inspect(this.generate(limits, family(i)).question)?.rows ?? ["?"]);
          left.delete(key);
          reached.add(key);
        }
        for (const missing of left) this.tell("small-space", `"${name}": no seed like "${family(0)}" gives ${show(missing.split("\n"))}`);
      }
      const other = [...reached, ...(listed ?? [])].find((key) => !wanted.has(key));
      if (other !== undefined) this.tell("small-space", `"${name}" has the question ${show(other.split("\n"))}, which its list does not`);
      if (wanted.size !== questions.length || (listed && listed.length !== wanted.size)) this.tell("small-space", `"${name}" lists ${questions.length} questions and the rules allow ${listed?.length ?? wanted.size}`);
    }
  }

  /** One book from the production builder: each template that fits, both sides, every place. */
  checkBook(spaces: readonly Space[]): void {
    const { input, unfilled } = sampleBook(this.shape.id, [...new Set(spaces)].map(({ limits, count, places }) => {
      const { kind } = this.shape.face(this.shape.worstCase(limits).question);
      return { limits, count, fitting: this.templates.filter((t) => t.faces.includes(kind) && t.digits >= places) };
    }), this.wantedSeeds);
    if (unfilled.length > 0) this.tell("evidence", `no page of the book fills ${unfilled.join(" and ")}`);
    const plan = planBook(input, shapeLibrary([this.watched]), this.options.templates);
    if (!plan.ok) return void this.tell("book", plan.problems.slice(0, 3).join(" "));
    const printed = new Map(plan.pages.flatMap((p) => p.regions.filter((r) => r.role === "question").map((r) => [r.item, printedRows(r.ink)] as const)));
    for (const { id, question, steps, difficulty } of plan.items) {
      const known = this.inspect(question);
      const rows = printed.get(id) ?? [];
      if (known && keyOf(known.rows) !== keyOf(rows)) this.tell("layout", `${id} prints ${show(rows)} and the first place prints ${show(known.rows)}`);
      if (known && (known.steps !== JSON.stringify(steps) || !Object.is(known.score, difficulty))) this.tell("determinism", `${id}: the steps or the score of ${canonicalJson(question)} changed`);
    }
  }

  /** A book of a small space asks for few questions, so seeds of the same form fill the number. */
  fillSeeds(spaces: readonly Space[]): void {
    for (let i = 0; this.seeds < this.wantedSeeds && spaces.length > 0; i++) this.generate(spaces[i % spaces.length].limits, itemSeed(seedFrom("child", "more", i), SIDES[i % 2], "row", i % 8, 0));
    if (this.wantedSeeds < 1 || this.seeds < this.wantedSeeds || spaces.length === 0) this.tell("evidence", `${this.seeds} seeds of ${this.wantedSeeds} and ${spaces.length} limits were used`);
  }
}

/** All checks with a given number of seeds. Only a test of the harness itself calls this. */
export function runChecks(shape: Shape, registration: ShapeRegistration, seeds: number, options: HarnessOptions): ShapeReport {
  const started = performance.now();
  const h = new Harness(shape, registration, seeds, options);
  for (const problem of registryProblems(new Map([[shape.id, shape]]), [registration])) h.tell("registration", problem);
  if (h.failures.size === 0) {
    h.guard("registration", () => h.prepare());
    const { named, made } = h.sampleLimits();
    const spaces = h.guard("count", () => h.checkSpaces(named, made)) ?? [];
    h.guard("examples", () => h.checkNamedQuestions());
    h.guard("refused-limits", () => h.checkRefusedLimits());
    h.guard("refused-rows", () => h.checkRefusedRows());
    h.guard("book", () => h.checkBook(spaces));
    h.guard("small-space", () => h.checkSmallSpaces());
    h.guard("evidence", () => h.fillSeeds(spaces));
    const stored = h.guard("fingerprint", () => fingerprintProblem(shape, registration, options.fingerprints));
    if (stored) h.tell("fingerprint", stored);
  }
  return {
    shape: shape.id, version: shape.version, durationMs: performance.now() - started,
    evidence: { seeds: h.seeds, limits: h.spaces.size, questions: h.inspected.size },
    failures: CHECKS.flatMap((check) => { const message = h.failures.get(check); return message === undefined ? [] : [{ check, message }]; }),
  };
}

/** Every check of one shape. */
export const checkShape = (shape: Shape, registration: ShapeRegistration, options: HarnessOptions): ShapeReport => runChecks(shape, registration, SEEDS, options);

/** The whole library: the registry, then each shape with its registration. */
export function checkShapes(shapes: ShapeLibrary, registrations: readonly ShapeRegistration[], options: HarnessOptions): { problems: string[]; reports: ShapeReport[] } {
  const reports = registrations.flatMap((r) => { const shape = shapes.get(r.id); return shape ? [checkShape(shape, r, options)] : []; });
  return { problems: registryProblems(shapes, registrations), reports };
}
