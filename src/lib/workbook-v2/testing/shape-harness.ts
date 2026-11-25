// One harness for every shape (docs/workbook-v2-engine.md, "Adding a shape"). It compares a shape with the independent
// facts of its registration, on questions that the production builder makes. Evidence that is missing is a failure.
import vm from "node:vm";
import fc from "fast-check";
import type { TemplateLibrary } from "../bank/snapshot";
import { planBook } from "../build/build-book";
import { itemSeed } from "../build/items";
import { printedRows } from "../checks/printed-answers";
import { isPrintable, type Answer, type BookItem, type Face, type Side, type Step } from "../contract";
import { canonicalJson, seedFrom } from "../hash";
import { itemRegions } from "../layout/build-pages";
import { digitPlaces, TEMPLATES, type PageTemplate } from "../layout/templates";
import { shapeLibrary, type Item, type Shape, type ShapeLibrary } from "../shapes";
import { sampleBook, unfilledSides } from "./shape-book";
import { brokenRows, hasAnswerForm, isPlain, maxOf, onFrozenLimits } from "./shape-checks";
import { fingerprintProblem } from "./shape-fingerprints";
import { isInside, printedProblem, registryProblems, type LargeSpace, type Limits, type Printed, type Rows, type ShapeRegistration } from "./shape-registration";
import { marksProblem } from "./step-marks";
import { readStep } from "./steps-evaluator";

/** How many production seeds each registered shape gets. */
export const SEEDS = 1000;
/** The seed of fast-check, so that every run uses the same limits and a failure can be repeated. */
export const SAMPLE_SEED = 236;
const ARBITRARY_LIMITS = 120;
const TIME_LIMIT_MS = 2000;
const MAX_REACH = 1000;
/** A shape that gives few different questions makes the build try again and again. */
const MAX_QUESTIONS = 20_000;

export const CHECKS = [
  "registration", "witness", "arbitrary", "read-limits", "refused-limits", "count", "difficulty-range", "worst-case", "widening", "small-space",
  "plain", "determinism", "inside", "answer", "answer-form", "independent-answer", "printed", "solve-again", "steps-end", "steps-true", "steps-marks",
  "steps-reader", "difficulty", "width", "harder", "examples", "refused-rows", "book", "layout", "evidence", "fingerprint",
] as const;
export type Check = (typeof CHECKS)[number];

export interface ShapeReport {
  shape: string;
  version: number;
  failures: { check: Check; message: string }[];
  /** What the checks used. `spaces` are the limits that some question meets. */
  evidence: { seeds: number; limits: number; spaces: number; questions: number };
  durationMs: number;
}

export interface HarnessOptions {
  fingerprints: unknown;
  templates?: TemplateLibrary;
  /** How many limits fast-check makes. Only a test of the harness itself asks for fewer. */
  madeLimits?: number;
  /** How long the limits of a registration may take to make. */
  timeLimitMs?: number;
  /** How many questions the harness may ask for. */
  maxQuestions?: number;
}

/** Where the limits of a registration are made: a run there can be stopped after some time. */
const CONTEXT = vm.createContext({});
/** The limits that some rules made. The seed is fixed, so the same rules make the same limits. */
const madeBefore = new WeakMap<ShapeRegistration["limits"], Map<number, readonly Limits[]>>();

function makeLimits(rules: ShapeRegistration["limits"], { madeLimits = ARBITRARY_LIMITS, timeLimitMs = TIME_LIMIT_MS }: HarnessOptions): readonly Limits[] {
  const known = madeBefore.get(rules) ?? new Map<number, readonly Limits[]>();
  madeBefore.set(rules, known);
  const before = known.get(madeLimits);
  if (before) return before;
  const run = () => fc.sample(fc.record(Object.fromEntries(Object.entries(rules).map(([name, rule]) => [name, rule.values]))), { numRuns: madeLimits, seed: SAMPLE_SEED });
  const made = vm.runInContext("run()", Object.assign(CONTEXT, { run }), { timeout: timeLimitMs }) as Limits[];
  known.set(madeLimits, made);
  return made;
}

const SIDES: readonly Side[] = ["front", "back"];
const keyOf = (rows: Rows): string => rows.join("\n");
const show = (rows: Rows): string => JSON.stringify(rows);

/** All that the checks know about one question. */
interface Inspected { question: unknown; rows: Rows; printed: Printed; answer: string; steps: string; score: number; places: number }
/** One question of a listed space: what the reader says of it, and the question of the shape if it has one. */
interface Listed { rows: Rows; printed: Printed; asked: Inspected | null }
/** All that the checks know about one set of limits. */
interface Space { limits: Limits; json: string; count: number; easiest: number; hardest: number; widths: Readonly<Record<string, number>>; places: number }

/** What the layout printed. It depends on the template, the face and the answer, and many runs print the same questions. */
const printedBefore = new WeakMap<PageTemplate, Map<string, Rows>>();
function layoutRows(template: PageTemplate, face: Face, answer: Answer): Rows {
  const known = printedBefore.get(template) ?? new Map<string, Rows>();
  printedBefore.set(template, known);
  const key = JSON.stringify([face, answer.value]);
  const before = known.get(key);
  if (before) return before;
  const item: BookItem = { id: "i", sheetId: "s", side: "front", rowId: "r", number: 1, shape: "shape", shapeVersion: 1, question: null, face, answer, steps: [], difficulty: 0 };
  const region = itemRegions(template, template.sides.front.places[0], item, (name) => name).find((r) => r.role === "question");
  const rows = printedRows(region?.ink ?? []);
  known.set(key, rows);
  return rows;
}

class Harness {
  readonly failures = new Map<Check, string>();
  /** The seeds of the form that the build makes. */
  seeds = 0;
  /** Every question that the harness asked for. */
  private calls = 0;
  private widthNames: string[] | null = null;
  readonly inspected = new Map<string, Inspected | null>();
  private readonly byRows = new Map<string, Inspected | null>();
  readonly spaces = new Map<string, Space | null>();
  private readonly seen = new WeakMap<Limits, Space | null>();
  private every: Listed[] | null = null;
  readonly shape: Shape;
  /** The shape as the build gets it: its `generate` checks each question. */
  readonly watched: Shape;

  constructor(shape: Shape, readonly reg: ShapeRegistration, readonly wantedSeeds: number, readonly options: HarnessOptions) {
    this.shape = onFrozenLimits(shape);
    this.watched = Object.assign(Object.create(this.shape) as Shape, { generate: (limits: unknown, seed: string) => this.generate(limits as Limits, seed) });
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

  /** What the independent reader says of rows. */
  private read(rows: Rows): Printed | null {
    const printed = this.reg.read(rows);
    const problem = printed && printedProblem(this.reg, printed, this.widthNames ??= Object.keys(printed.widths));
    if (problem) this.tell("registration", `the reader of ${show(rows)} ${problem}`);
    return printed;
  }

  /** The rows that the real layout prints for a question. */
  private print(question: unknown, answer: Answer): { rows: Rows; places: number } {
    const face = this.shape.face(question);
    const places = digitPlaces(face, answer.value);
    const template = this.templates.find((t) => t.faces.includes(face.kind) && t.digits >= places);
    if (!template) throw new Error(`no template takes a ${face.kind} question with ${places} digit places`);
    return { rows: layoutRows(template, face, answer), places };
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
    const { shape } = this;
    const answer = shape.answer(question);
    const answerJson = canonicalJson(answer);
    const at = `question ${key}`;
    if (!isPlain({ question, answer })) this.tell("plain", `${at} holds a value that is not plain data`);
    if (answer.kind !== shape.answerKind || !hasAnswerForm(answer)) this.tell("answer-form", `${at}: ${answerJson} is no answer of the kind "${shape.answerKind}"`);
    const { rows, places } = this.print(question, answer);
    if (!rows.every(isPrintable)) this.tell("printed", `${at}: the fonts cannot print ${show(rows)}`);
    const printed = this.read(rows);
    if (!printed) return this.tell("printed", `${at}: the independent reader finds no question in ${show(rows)}`);
    const read = canonicalJson(printed.answer);
    if (read !== answerJson) this.tell("independent-answer", `${at}: the answer is ${answerJson} and ${show(rows)} reads as ${read}`);
    const solved = this.guard("solve-again", () => canonicalJson(shape.solveAgain(rows)));
    if (solved !== `{"answer":${answerJson},"question":${key}}`) this.tell("solve-again", `${at}: solveAgain(${show(rows)}) gave ${solved}`);
    const steps = shape.steps(question);
    this.checkSteps(steps, answer, printed, at);
    const score = shape.difficulty(question);
    if (!Number.isFinite(score)) this.tell("difficulty", `${at}: the score is ${score}`);
    return { question, rows, printed, answer: answerJson, steps: canonicalJson(steps), score, places };
  }

  private checkSteps(steps: readonly Step[], answer: Answer, printed: Printed, at: string): void {
    const bad = steps.find(({ text }) => typeof text !== "string" || text === "" || !isPrintable(text));
    if (bad !== undefined) this.tell("steps-end", `${at}: the step ${JSON.stringify(bad.text)} cannot be printed`);
    const end = steps.at(-1)?.text;
    if (end !== answer.value) this.tell("steps-end", `${at}: the steps end in ${JSON.stringify(end)} and not in "${answer.value}"`);
    for (const { text } of steps) {
      const { wrong, unread } = readStep(text);
      if (unread.length > 0) this.tell("steps-true", `cannot read "${unread[0]}" in a step of ${at}`);
      if (wrong.length > 0) this.tell("steps-true", `${at}: the step "${text}" holds "${wrong[0]}"`);
    }
    // Wrong answers and ends have their own checks; the marks are compared with a good answer.
    const marks = answer.kind === "whole-number" && hasAnswerForm(answer) && end === answer.value ? marksProblem(steps, answer.value) : null;
    if (marks) this.tell("steps-marks", `${at}: ${marks}`);
    const said = canonicalJson(steps);
    const wanted = canonicalJson(printed.steps);
    if (said !== wanted) this.tell("steps-reader", `${at}: the steps are ${said} and must be ${wanted}`);
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

  /** Every question that the harness asks of `generate` comes through here. Only seeds of the form of the build count. */
  generate(limits: Limits, seed: string, counts = true): Item<unknown> {
    const at = () => `generate(${canonicalJson(limits)}, "${seed}")`;
    const first = this.shape.generate(limits, seed);
    const copy = canonicalJson(first);
    const again = this.shape.generate(limits, seed);
    if (canonicalJson(again) !== copy || canonicalJson(first) !== copy) this.tell("determinism", `${at()} gave ${copy}, then ${canonicalJson(again)}`);
    if (again === first || again.answer === first.answer || (again.question === first.question && typeof first.question === "object")) this.tell("determinism", `${at()} gave the same object twice`);
    if (counts) this.seeds++;
    const most = this.options.maxQuestions ?? MAX_QUESTIONS;
    if (++this.calls > most) throw new Error(`more than ${most} questions were asked for to find ${this.wantedSeeds} different ones`);
    const item = this.itemOf(first, at);
    const space = this.spaceOf(limits);
    if (item && !isInside(this.reg, item.printed, limits)) this.tell("inside", `${at()} gave ${show(item.rows)}, which is outside the limits`);
    if (!item || !space) return first;
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
  sampleLimits(): { named: readonly Limits[]; made: readonly Limits[] } {
    const { reg } = this;
    const named = [...new Map([...reg.cases, ...reg.smallSpaces, ...reg.witnesses].map((c) => [canonicalJson(c.limits), c.limits])).values()];
    const made = this.guard("arbitrary", () => makeLimits(reg.limits, this.options)) ?? [];
    for (const [name, { values }] of Object.entries(reg.limits)) {
      if (made.length > 0 && new Set(made.map((l) => canonicalJson(l[name]))).size < 2) this.tell("arbitrary", `the limit "${name}" never changes`);
      const lost = this.guard("arbitrary", () => named.find((l) => !values.canShrinkWithoutContext(l[name])));
      if (lost) this.tell("arbitrary", `the limit "${name}" never has the registered value ${canonicalJson(lost[name])}`);
    }
    return { named, made };
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
    const listed = Array.isArray(space) ? (space as readonly Rows[]) : (space as LargeSpace).listed;
    if (listed) {
      if (new Set(listed.map(keyOf)).size < listed.length) this.tell("registration", "the space lists a question twice");
      const found = listed.flatMap((rows) => {
        const printed = this.read(rows);
        if (!printed) this.tell("registration", `the space lists ${show(rows)} and the reader finds no question in it`);
        return printed ? [{ rows, printed, asked: this.ask(rows) }] : [];
      });
      if (Array.isArray(space)) this.every = found;
    }
    for (const { limit, limits, inside, outside } of witnesses) {
      const broken = (rows: Rows) => {
        const printed = this.read(rows);
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
      if (found && (found.answer !== canonicalJson(answer) || found.steps !== canonicalJson(steps))) this.tell("examples", `"${name}" gives ${found.answer} with ${found.steps}`);
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
    for (const name of ["another-limit", "constructor"]) refuse({ ...good, [name]: 1 }, name);
    for (const { name, raw, problem } of reg.refusedLimits) {
      const read = canonicalJson(shape.readLimits(raw));
      if (read !== canonicalJson({ ok: false, problem })) this.tell("refused-limits", `"${name}" gave ${read}`);
    }
  }

  /** Named rows that print no question, and broken copies of good rows: the reader and the shape must agree on each. */
  checkRefusedRows(): void {
    const good = [...this.reg.examples.map((e) => e.rows), ...this.reg.smallSpaces.flatMap((s) => s.questions)].slice(0, 12);
    const accepted = this.reg.refusedRows.find(({ rows }) => this.reg.read(rows) !== null);
    if (accepted) this.tell("refused-rows", `the reader accepts "${accepted.name}", which must be refused`);
    for (const { rows } of this.reg.refusedRows) {
      const solved = this.shape.solveAgain(rows);
      if (solved !== null) this.tell("refused-rows", `${show(rows)}: the shape reads ${JSON.stringify(solved)} and must refuse it`);
    }
    for (const rows of brokenRows(good)) {
      const [reader, solver] = [this.reg.read(rows)?.answer, this.shape.solveAgain(rows)?.answer].map((answer) => (answer ? `reads ${canonicalJson(answer)}` : "refuses it"));
      if (reader !== solver) this.tell("refused-rows", `${show(rows)}: the shape ${solver} and the reader ${reader}`);
    }
  }

  /** Each small space: the list of the shape, of the registration and of the rules must be the same questions. */
  checkSmallSpaces(): void {
    for (const { name, limits, questions } of this.reg.smallSpaces) {
      const wanted = new Set(questions.map(keyOf));
      const reached = new Set<string>();
      const families = [(i: number) => `seed-${i}`, (i: number) => itemSeed(seedFrom("child", name, i), "front", "row", 0, 0)];
      for (const [at, family] of families.entries()) {
        const left = new Set(wanted);
        for (let i = 0; i < Math.max(MAX_REACH, 40 * wanted.size) && left.size > 0; i++) {
          const key = keyOf(this.inspect(this.generate(limits, family(i), at === 1).question)?.rows ?? ["?"]);
          left.delete(key);
          reached.add(key);
        }
        for (const missing of left) this.tell("small-space", `"${name}": no seed like "${family(0)}" gives ${show(missing.split("\n"))}`);
      }
      const other = [...reached].find((key) => !wanted.has(key));
      if (other !== undefined) this.tell("small-space", `"${name}" has the question ${show(other.split("\n"))}, which its list does not`);
      const allowed = this.spaceOf(limits)?.count ?? 0;
      if (wanted.size !== questions.length || wanted.size !== allowed) this.tell("small-space", `"${name}" lists ${questions.length} questions and the rules allow ${allowed}`);
    }
  }

  /** One book from the production builder: each template that fits, both sides, every place. */
  checkBook(spaces: readonly Space[]): void {
    const largest = [...new Set(spaces)].sort((a, b) => b.count - a.count);
    // A test of the harness itself uses few seeds, and then its book holds only the largest spaces.
    const used = this.wantedSeeds < SEEDS ? largest.slice(0, 2 * Math.max(1, Math.ceil(this.wantedSeeds / 16))) : largest;
    const withTemplates = ({ limits, count, places }: Space) => {
      const { kind } = this.shape.face(this.shape.worstCase(limits).question);
      return { limits, count, fitting: this.templates.filter((t) => t.faces.includes(kind) && t.digits >= places) };
    };
    const plan = planBook(sampleBook(this.shape.id, used.map(withTemplates), this.wantedSeeds), shapeLibrary([this.watched]), this.options.templates);
    if (!plan.ok) return void this.tell("book", plan.problems.slice(0, 3).join(" "));
    const unfilled = unfilledSides(plan.pages, [...new Set(largest.flatMap((space) => withTemplates(space).fitting))]);
    if (unfilled.length > 0) this.tell("evidence", `no page of the book fills ${unfilled.join(" and ")}`);
    const printed = new Map(plan.pages.flatMap((p) => p.regions.filter((r) => r.role === "question").map((r) => [r.item, printedRows(r.ink)] as const)));
    for (const { id, question, steps, difficulty } of plan.items) {
      const known = this.inspect(question);
      const rows = printed.get(id) ?? [];
      if (known && keyOf(known.rows) !== keyOf(rows)) this.tell("layout", `${id} prints ${show(rows)} and the first place prints ${show(known.rows)}`);
      if (known && (known.steps !== canonicalJson(steps) || !Object.is(known.score, difficulty))) this.tell("determinism", `${id}: the steps or the score of ${canonicalJson(question)} changed`);
    }
  }

  /** A book of a small space asks for few questions, so seeds of the same form fill the number. */
  fillSeeds(spaces: readonly Space[]): void {
    for (let i = 0; this.seeds < this.wantedSeeds && spaces.length > 0; i++) this.generate(spaces[i % spaces.length].limits, itemSeed(seedFrom("child", "more", i), SIDES[i % 2], "row", i % 8, 0));
    const different = new Set(spaces).size;
    if (this.wantedSeeds < 1 || this.seeds < this.wantedSeeds || different < 2) this.tell("evidence", `${this.seeds} seeds of ${this.wantedSeeds} and ${different} limits were used`);
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
    evidence: { seeds: h.seeds, limits: h.spaces.size, spaces: [...h.spaces.values()].filter((space) => space !== null).length, questions: h.inspected.size },
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
