import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { expectedItems, firstObservation, itemKey, markingEvent, observationProblem, PHOTO_ISSUES, type Observation } from "@/lib/scan-observation";
import { markingAiTimeout, MARKING_AI_TIMEOUT_MS, MARKING_MIN_AI_MS, TWO_WAYS_METHOD_MARKS, waitsForTeam, effectiveMarkingEvents, effectiveSkillMarks, markingOriginalKey, markingPageView, markingRequest, MARKING_CAP_MICROS, MARKING_MODEL, MARKING_PROMPT_VERSION, readMarkingOutput, runScanMarking, validMarkingOutput, type EffectiveMark, type MarkingClientFactory, type MarkingFrame, type MarkingJob, type MarkingRef, type MarkingStore } from "@/lib/scan-marking";
import type { AiJsonRequest } from "@/lib/ai-client";
import { checkQuestionPackage, workedSteps, type NumberValue, type Operation, type QuestionPackage } from "@/lib/question-package";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { memoryChildProfiles } from "@/lib/child-profile-memory";
import { rebuildChildProfile } from "@/lib/child-profile";
import type { LearningEvent, NewLearningEvent } from "@/lib/learning-events";
import { BC_SKILL_MAP } from "@/lib/assessment";
import { skillStates } from "@/lib/assessment/skill-state";
import { cropPlan } from "@/lib/scan-calibration";

const P = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222", W = "33333333-3333-4333-8333-333333333333";
const STEP = { unit: "U1", skill: "add-within-20", step: 2 };
const STANDARD = BC_SKILL_MAP.standards.find((s) => s.code === "2.4")!;
function frame(photo = "photo-a", answers = [0, 12, 9]): MarkingFrame {
  return { parentId: P, childId: C, photo, workbookId: W, printedRevision: "immutable-print", pageId: "page", pageNumber: 3, ready: true,
    questions: answers.map((answer, n) => ({ number: n + 1, package: { id: `private-item-${n}`, ref: { source: "workbook", workbookId: W, page: 3, question: n + 1 }, text: "SECRET EXAMPLE AND ANSWER KEY", item: { format: "write-number", scorable: true, parentChecked: false, checks: [], error: null, regions: [{ id: "private-region", kind: "box", label: null, answer: { type: "number", value: answer } }] }, answer: null, operation: null, steps: [], wrongAnswers: [], skill: { standard: STANDARD.code, skills: [STANDARD.skills[0].id] } } as unknown as QuestionPackage,
      regions: [{ id: "private-region", kind: "box", box: { x: 10, y: 30 + n * 40, width: 20, height: 30 } }],
      teaching: { version: 1, curriculum: { key: "bc", version: "frozen-v1" }, part: "practice", slot: `1.${n}`, practiceType: "now-you", extra: false, track: "A", plannedStep: STEP, itemStep: STEP, reviewSteps: [], eligibility: { format: "write-number", scorable: true, parentChecked: false, mastery: true, reason: null } },
    })) };
}
const output = (texts: (string | null)[]) => ({ readings: texts.map((text, n) => ({ item: `i${n + 1}`, region: `r${n + 1}`, text, state: text === "" ? "blank" : text === null ? "uncertain" : "written" })) });
function tickFrame(photo = "tick-photo"): MarkingFrame {
  const f = frame(photo, [66]), q = f.questions[0];
  const operation: Operation = { kind: "add", operands: [27, 39] };
  const easier: Operation = { kind: "add", operands: [18, 5] };
  q.package = {
    ...q.package!, text: "27 + 39 = ?", templateId: null, operation, answer: { value: { type: "number", value: 66 }, accepted: [], unit: null },
    steps: workedSteps(operation), level: 10, difficulty: 2,
    wrongAnswers: [{ value: { type: "number", value: 56 }, cause: "O3", description: "Forgets the carry", step: "tens" }],
    easierExample: { text: "18 + 5 = ?", operation: easier, steps: workedSteps(easier), answer: { type: "number", value: 23 } },
    item: { format: "tick-and-number", scorable: true, parentChecked: false, error: null,
      regions: [
        { id: "operation", kind: "choice", mark: "tick", label: "Tick the operation", choices: ["+", "−", "×", "÷"], answer: "+" },
        { id: "answer", kind: "box", label: "Write the answer", answer: { type: "number", value: 66 } },
        { id: "work", kind: "work", label: "Show your work" },
      ], checks: [{ kind: "operation-sign", region: "operation" }, { kind: "operation", region: "answer" }],
    },
  };
  expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
  q.regions = [{ id: "operation", kind: "choice", box: { x: 10, y: 30, width: 200, height: 30 } },
    { id: "answer", kind: "box", box: { x: 220, y: 30, width: 80, height: 30 } },
    { id: "work", kind: "work", box: { x: 10, y: 65, width: 290, height: 50 } }];
  q.teaching!.eligibility.format = "tick-and-number";
  return f;
}
const tickOutput = (choice: string | null, number: string | null) => ({ readings: [
  { item: "i1", region: "r1", text: choice, state: choice === "" ? "blank" : choice === null ? "uncertain" : "written" },
  { item: "i1", region: "r1-2", text: number, state: number === "" ? "blank" : number === null ? "uncertain" : "written" },
] });
function circleFrame(): MarkingFrame {
  const f = tickFrame("circle-photo"), q = f.questions[0];
  q.package = { ...q.package!, operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null,
    text: "Is 27 + 39 = 66 true or false?", item: { format: "circle", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "pick", kind: "choice", mark: "circle", label: null, choices: ["true", "false"], answer: "true" }],
      checks: [{ kind: "yes-no", region: "pick", yes: "true", no: "false", statement: { kind: "equation", equation: {
        left: { type: "number", value: 27 }, op: "+", right: { type: "number", value: 39 }, result: { type: "number", value: 66 },
      } } }],
    },
  };
  q.regions = [{ id: "pick", kind: "choice", box: { x: 10, y: 30, width: 200, height: 30 } }];
  q.teaching!.eligibility.format = "circle";
  expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
  return f;
}
function showWorkFrame(): MarkingFrame {
  const f = tickFrame("show-work-photo"), q = f.questions[0];
  q.package!.item = { format: "show-work", scorable: true, parentChecked: false, error: null,
    regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: 66 } }, { id: "work", kind: "work", label: "Show your work" }],
    checks: [{ kind: "operation", region: "answer" }],
  };
  q.regions = q.regions!.filter(r => r.id !== "operation");
  q.teaching!.eligibility.format = "show-work";
  expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
  return f;
}
function twoWaysFrame(): MarkingFrame {
  const f = showWorkFrame(), q = f.questions[0];
  q.package!.item!.format = "two-ways";
  q.package!.item!.regions = [
    { id: "method-1", kind: "work", label: "First method" },
    { id: "method-2", kind: "work", label: "Second method" },
    q.package!.item!.regions[0],
  ];
  q.regions = [
    { id: "method-1", kind: "work", box: { x: 10, y: 20, width: 140, height: 80 } },
    { id: "method-2", kind: "work", box: { x: 160, y: 20, width: 140, height: 80 } },
    { id: "answer", kind: "box", box: { x: 220, y: 110, width: 80, height: 30 } },
  ];
  q.teaching!.eligibility.format = "two-ways";
  expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
  return f;
}
function wordsFrame(): MarkingFrame {
  const f = circleFrame(), q = f.questions[0];
  q.package!.text = "Write addition when 27 is less than 39. Otherwise write subtraction.";
  q.package!.item = { format: "write-words", scorable: true, parentChecked: false, error: null,
    regions: [{ id: "words", kind: "box", label: null, answer: { type: "text", value: "addition" } }],
    checks: [{ kind: "template", region: "words", source: { answer: "'addition' if a < b else 'subtraction'", check: null, derived: [], values: null,
      slots: [{ name: "a", value: { int: "27" }, domain: { min: 1, max: 100 } }, { name: "b", value: { int: "39" }, domain: { min: 1, max: 100 } }] } }],
  };
  q.regions = [{ id: "words", kind: "box", box: { x: 10, y: 30, width: 200, height: 30 } }];
  q.teaching!.eligibility.format = "write-words";
  expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
  return f;
}
function numericFrame(value: NumberValue, expression: string): MarkingFrame {
  const f = wordsFrame(), q = f.questions[0];
  q.package!.text = "Write the answer.";
  q.package!.item!.format = "write-number";
  q.package!.item!.regions = [{ id: "answer", kind: "box", label: null, answer: value }];
  q.package!.item!.checks = [{ kind: "template", region: "answer", source: { answer: expression, check: null, derived: [], slots: [], values: null } }];
  q.regions = [{ id: "answer", kind: "box", box: { x: 10, y: 30, width: 200, height: 40 } }];
  q.teaching!.eligibility.format = "write-number";
  expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
  return f;
}
function spotFrame(): MarkingFrame {
  const f = tickFrame("spot-photo"), q = f.questions[0];
  q.package!.text = "Someone wrote 27 + 39 = 56. Is it right? Fix it.";
  q.package!.item = { format: "spot-the-error", scorable: true, parentChecked: false, error: { answer: { type: "number", value: 56 }, step: "tens" },
    regions: [
      { id: "right", kind: "choice", mark: "tick", label: "Is it right?", choices: ["Yes", "No"], answer: "No" },
      { id: "fix", kind: "box", label: "Fix it", answer: { type: "number", value: 66 } },
    ], checks: [{ kind: "yes-no", region: "right", yes: "Yes", no: "No", statement: { kind: "shown-answer" } }, { kind: "operation", region: "fix" }],
  };
  q.regions = q.regions!.filter(r => r.kind !== "work").map(r => ({ ...r, id: r.kind === "choice" ? "right" : "fix" }));
  q.teaching!.eligibility.format = "spot-the-error";
  expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
  return f;
}
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
it("shows page results in printed question order without changing the canonical input order", () => {
  const expected = expectedItems(frame());
  const marks: EffectiveMark[] = [2, 0, 1].map((n) => ({ expected: expected[n], observation: firstObservation(expected[n], null), originalEvent: null, eventId: null, at: "2026-11-05T12:00:00Z", model: null, prompt: null }));
  const view = markingPageView(marks);
  expect(view.items.map((i) => i.number)).toEqual([1, 2, 3]);
  expect(view.completion.items.map((i) => i.number)).toEqual([1, 2, 3]);
  expect(marks.map((m) => m.expected.number)).toEqual([3, 1, 2]);
});
/** Atomic fake. SQL tests separately exercise the real database admission and version predicates. */
class Store implements MarkingStore {
  frames = new Map<string, MarkingFrame>();
  items = new Map<string, EffectiveMark>();
  jobs = new Map<string, MarkingJob & { until: number; dispatches: number; done: boolean }>();
  terminal = new Set<string>(); frozen = false; deleted = false;
  clock = Date.parse("2026-11-05T12:00:00Z");
  prices = new Map([[MARKING_MODEL, 10_000], ["comparison-model", 10_000]]);
  spend = new Map<string, { period: string; reserved: number; charged: number | null }>();
  events: LearningEvent[] = [];
  imageReads = 0;
  constructor(...frames: MarkingFrame[]) { for (const f of frames) this.frames.set(f.photo, f); }
  async frame(ref: MarkingRef) { return this.deleted ? null : this.frames.get(ref.photo) ?? null; }
  live(ref: MarkingRef, token: string) { const j = this.jobs.get(ref.photo); return !this.frozen && !this.deleted && !this.terminal.has(ref.photo) && j?.token === token && j.until > this.clock; }
  async claim(ref: MarkingRef, token: string, f: MarkingFrame) {
    if (ref.parent !== f.parentId || this.terminal.has(ref.photo) || this.frozen || this.deleted) return "terminal" as const;
    if ([...this.jobs.values()].some((j) => !j.done && j.until > this.clock)) return "busy" as const;
    for (const e of expectedItems(f)) if (!this.items.has(itemKey(e.identity))) this.items.set(itemKey(e.identity), { expected: e, observation: firstObservation(e, ref.photo), originalEvent: null, eventId: null, at: new Date(this.clock).toISOString(), model: null, prompt: null });
    const old = this.jobs.get(ref.photo);
    const j = { token, items: structuredClone([...this.items.values()]), extraction: old?.extraction ?? null, until: this.clock + 180_000, dispatches: old?.dispatches ?? 0, done: false };
    this.jobs.set(ref.photo, j); return j;
  }
  async image() { this.imageReads++; return new Uint8Array([1, 2, 3]); }
  async admit(ref: MarkingRef, token: string, model: string) {
    if (!this.live(ref, token)) return "terminal" as const;
    const j = this.jobs.get(ref.photo)!;
    if (j.dispatches >= 2) return "attempts" as const;
    const maximum = this.prices.get(model); if (!maximum) return "price-unverified" as const;
    const period = new Date(this.clock).toISOString().slice(0, 7);
    const held = [...this.spend.values()].filter((s) => s.period === period).reduce((sum, s) => sum + (s.charged ?? s.reserved), 0);
    if (held + maximum > MARKING_CAP_MICROS) return "budget" as const;
    const dispatch = `d${this.spend.size}`; this.spend.set(dispatch, { period, reserved: maximum, charged: null }); j.dispatches++; return { dispatch };
  }
  async settle(id: string, cost: number | null) { const s = this.spend.get(id)!; if (cost !== null && cost <= s.reserved && s.charged === null) s.charged = cost; }
  async extract(ref: MarkingRef, token: string, o: Observation[], model: string) { if (!this.live(ref, token)) return false; this.jobs.get(ref.photo)!.extraction = structuredClone(o); for (const m of this.items.values()) m.model = model; return true; }
  async apply(ref: MarkingRef, token: string, observations: Observation[], events: NewLearningEvent[], at: string) {
    if (!this.live(ref, token)) return false;
    for (const o of observations) {
      const key = itemKey(o.identity), m = this.items.get(key)!, version = this.jobs.get(ref.photo)!.items.find((i) => itemKey(i.expected.identity) === key)?.observation.resultVersion;
      if (m.observation.state !== "pending" || m.observation.resultVersion !== version) continue;
      m.observation = { ...structuredClone(o), resultVersion: version + 1 }; m.at = at;
      m.originalEvent ??= events.find((e) => e.key === markingOriginalKey(m.expected)) ?? null;
    } return true;
  }
  async pause(ref: MarkingRef, token: string) { if (this.live(ref, token)) this.jobs.get(ref.photo)!.until = 0; }
  async finish(ref: MarkingRef, token: string) { if (!this.live(ref, token)) return false; this.jobs.get(ref.photo)!.done = true; return true; }
  async publish() { if (this.frozen || this.deleted) return; for (const m of this.items.values()) if (m.originalEvent && !m.eventId) { m.eventId = `event-${this.events.length}`; this.events.push({ ...m.originalEvent, id: m.eventId }); } }
  async effective(parent: string, child: string) { return this.deleted || parent !== P || child !== C ? [] : structuredClone([...this.items.values()]); }
}
function client(answer: unknown | (() => Promise<unknown>), requests: AiJsonRequest[] = [], cost: number | null = null, model = MARKING_MODEL): MarkingClientFactory {
  return (before) => ({ client: { model, async json(r) { await before(); requests.push(r); return typeof answer === "function" ? answer() : answer; } }, costMicros: () => cost });
}
const run = (s: Store, photo: string, ai: MarkingClientFactory, token = photo) => runScanMarking(s, { parent: P, photo }, token, ai, () => new Date(s.clock).toISOString());

const FROZEN_PROMPT_SHA256 = "d911e7f08fa22d79c80fe91adfbb0059f43ba40c59065630d7547463f374a894";
const FROZEN_CONTENT_SHA256 = "803ea308db4014ebdb55c9c685cb27ca84b4ce050edd81be7ccb0ef13553fb52";
const GOOD_ONE = "27 + 30 = 57\n57 + 9 = 66", GOOD_TWO = "39 + 30 = 69\n69 - 3 = 66";
type Verdict = "solves" | "does-not-solve" | "unsure" | null;
const reading = (region: string, text: string | null, issue: string | null = null, verdict: Verdict = null) => ({ item: "i1", region, text, state: text === "" ? "blank" : text === null ? "uncertain" : "written", issue, verdict, reason: verdict ? "made-up model reason" : null });
const twoWaysOutput = (one: string | null, two: string | null, answer: string | null, issue: string | null = null, verdicts: readonly [Verdict, Verdict] = ["solves", "solves"]) => ({ readings: [
  reading("r1", one, one === null ? issue ?? "blurry" : null, one ? verdicts[0] : null), reading("r1-2", two, two === null ? issue ?? "blurry" : null, two ? verdicts[1] : null), reading("r1-3", answer, answer === null ? issue ?? "blurry" : null)] });
const twoWaysMark = (f: MarkingFrame, o: Observation): EffectiveMark => ({ expected: expectedItems(f)[0], observation: o, originalEvent: null, eventId: null, at: "2026-11-07T12:00:00Z", model: null, prompt: null });
/** The reviewer's question: 36 + 47 = ?, answer 83. */
function sumFrame(text = "36 + 47 = ?", operation: Operation = { kind: "add", operands: [36, 47] }, answer = 83): MarkingFrame {
  const f = twoWaysFrame(), q = f.questions[0], pkg = q.package!;
  pkg.text = text; pkg.operation = operation; pkg.answer = { value: { type: "number", value: answer }, accepted: [], unit: null }; pkg.steps = workedSteps(operation);
  pkg.wrongAnswers = [{ value: { type: "number", value: answer + 10 }, cause: "O3", description: "Made-up slip", step: (pkg.steps[0] as unknown as { id: string }).id }];
  const easy: Record<string, [Operation, number]> = { add: [{ kind: "add", operands: [18, 5] }, 23], subtract: [{ kind: "subtract", operands: [9, 4] }, 5], multiply: [{ kind: "multiply", operands: [2, 3] }, 6], divide: [{ kind: "divide", operands: [6, 3] }, 2] };
  const [easier, easierAnswer] = easy[operation.kind];
  pkg.easierExample = { text: "Made-up easier question", operation: easier, steps: workedSteps(easier), answer: { type: "number", value: easierAnswer } };
  const box = pkg.item!.regions.find(r => r.kind === "box")!; if (box.kind === "box") box.answer = { type: "number", value: answer };
  const check = checkQuestionPackage(pkg);
  expect(check.ok ? "" : JSON.stringify(check)).toBe("");
  return f;
}
const markSum = (one: string, two: string, verdicts: readonly [Verdict, Verdict] = ["solves", "solves"], answer = "83", f = sumFrame()) => {
  const o = readMarkingOutput(f, twoWaysOutput(one, two, answer, null, verdicts))[0];
  expect(observationProblem(o)).toBeNull();
  return { o, label: markingPageView([twoWaysMark(f, o)]).items[0].label };
};

describe("#726: the model call fits the caller's deadline", () => {
  it("caps the timeout at 120 s and refuses one shorter than 20 s", () => {
    expect(markingAiTimeout(null)).toBe(MARKING_AI_TIMEOUT_MS);
    expect(markingAiTimeout(500_000)).toBe(120_000);
    expect(markingAiTimeout(45_500.7)).toBe(45_500);
    expect(markingAiTimeout(MARKING_MIN_AI_MS)).toBe(20_000);
    expect(markingAiTimeout(MARKING_MIN_AI_MS - 1)).toBeNull();
    expect(markingAiTimeout(-5_000)).toBeNull();
  });

  it("with too little time left makes no call and no charge, and a later run with time marks the photo", async () => {
    const f = frame(), s = new Store(f), requests: AiJsonRequest[] = [];
    let left = MARKING_MIN_AI_MS - 1;
    const timed = (token: string) => runScanMarking(s, { parent: P, photo: f.photo }, token, client(output(["0", "12", "9"]), requests), () => new Date(s.clock).toISOString(), { aiTimeLeftMs: () => left });
    expect(await timed("short")).toBe("pending");
    expect(requests).toHaveLength(0);
    expect(s.spend.size).toBe(0);
    left = 60_000;
    expect(await timed("later")).toBe("finished");
    expect(requests).toHaveLength(1);
    expect(s.spend.size).toBe(1);
  });
});

describe("two-ways AI marking", () => {
  it("routes a two-ways item through the AI path, with no parent method or parent state", () => {
    const f = twoWaysFrame(), e = expectedItems(f)[0];
    expect(e.method).toBe("code");
    expect(e).not.toHaveProperty("review");
    expect(e.scoredRegions).toEqual(["method-1", "method-2", "answer"]);
    expect(e.mastery).toEqual({ eligible: true, reason: null });
    expect(firstObservation(e, f.photo)).toMatchObject({ state: "pending", method: "code", result: null });
  });
  it("asks the AI to read both methods and judge each one, with the question and no answer key in the request", () => {
    const f = twoWaysFrame(), request = markingRequest(f, new Uint8Array([1]));
    const part = request.content[0];
    expect(part.type).toBe("text");
    const items = JSON.parse((part as { text: string }).text).items;
    expect(items.map((i: { region: string; kind: string }) => [i.region, i.kind])).toEqual([["r1", "method"], ["r1-2", "method"], ["r1-3", "number"]]);
    expect(items[0].question).toBe("27 + 39 = ?"); expect(items[2]).not.toHaveProperty("question");
    expect(JSON.stringify(items)).not.toContain("66");
    expect(request.system).toContain("method region");
    expect(request.system).toMatch(/does-not-solve/);
    expect(MARKING_PROMPT_VERSION).toBe("whole-page-scalar-readings-v8");
    const props = (request.schema as { properties: { readings: { items: { required: string[]; properties: { verdict: unknown; reason: unknown } } } } }).properties.readings.items;
    expect(props.required).toEqual(expect.arrayContaining(["verdict", "reason"]));
  });
  it("keeps the prompt and the output schema frozen for the paid run", () => {
    const request = markingRequest(twoWaysFrame(), new Uint8Array([1]));
    // Changing either needs the controller's approval: the paid run is valid only for what ships.
    expect(createHash("sha256").update(JSON.stringify({ system: request.system, schema: request.schema, effort: request.effort, maxTokens: request.maxTokens })).digest("hex")).toBe(FROZEN_PROMPT_SHA256);
    expect(MARKING_PROMPT_VERSION).toBe("whole-page-scalar-readings-v8");
  });
  it("tells the AI to report a step it cannot read and never to leave out or tidy a step", () => {
    const system = markingRequest(twoWaysFrame(), new Uint8Array([1])).system!;
    expect(system).toMatch(/any step cannot be read exactly, report uncertain with issue unreadable/);
    expect(system).toMatch(/never leave out or tidy a step/);
    expect(system).toMatch(/An inverse operation on the question's numbers is a way to solve it/);
    expect(system).toMatch(/final line/);
  });
  it("accepts a verdict only on a method region in strict output", () => {
    const f = twoWaysFrame(), good = twoWaysOutput(GOOD_ONE, GOOD_TWO, "66");
    expect(validMarkingOutput(f, good)).toBe(true);
    const onAnswer = structuredClone(good); onAnswer.readings[2].verdict = "solves";
    expect(validMarkingOutput(f, onAnswer)).toBe(false);
    const missing = structuredClone(good); missing.readings[0].verdict = null;
    expect(validMarkingOutput(f, missing)).toBe(false);
    const made = structuredClone(good); (made.readings[0] as { verdict: unknown }).verdict = "maybe";
    expect(validMarkingOutput(f, made)).toBe(false);
    const long = structuredClone(good); long.readings[0].reason = "x".repeat(121);
    expect(validMarkingOutput(f, long)).toBe(false);
  });

  // Since the narrow allow-list (D-302), only the book's two shapes have templates. 36 + 47 has none, so every pair on it,
  // however good, goes to our team. The earlier reviews' cases on it stay not Right.
  it.each([
    ["split one addend and compensation", "36 + 40 = 76\n76 + 7 = 83", "36 + 50 = 86\n86 - 3 = 83"],
    ["partial sums and split one addend", "30 + 40 = 70\n6 + 7 = 13\n70 + 13 = 83", "36 + 40 = 76\n76 + 7 = 83"],
    ["the question with the answer filled in, and its check", "36 + 47 = 83", "83 - 47 = 36"],
    ["the answer added and taken away again", "36 + 83 - 36 = 83", "47 + 36 = 83"],
  ])("sends %s on 36 + 47 to our team, never Right", (_name, one, two) => {
    const { o, label } = markSum(one, two);
    expect(o).toMatchObject({ state: "pending", result: null, issue: "method-form" });
    expect(label).toBe("Our team is checking this answer.");
  });
  it.each([
    ["the question with the answer filled in", "36 + 47 = 83", "83 - 47 = 36"],
    ["identity lines", "83 = 83\n36 = 36\n1 + 1 = 2", "30 + 40 = 70\n6 + 7 = 13\n70 + 13 = 83"],
  ])("is Wrong when the AI says does-not-solve: %s", (_name, one, two) => {
    const { o, label } = markSum(one, two, ["does-not-solve", "solves"]);
    expect(o).toMatchObject({ state: "scored", result: "wrong", issue: "method-wrong" });
    expect(label).toBe("Wrong. One way does not solve the question.");
  });
  it("is Wrong for 100 + 700 = 800 on 8 x ? = 800 when the AI says does-not-solve", () => {
    const f = sumFrame("8 × ? = 800", { kind: "divide", operands: [800, 8] }, 100);
    const { o } = markSum("100 + 700 = 800", "8 × 50 = 400\n8 × 50 = 400\n400 + 400 = 800\n50 + 50 = 100", ["does-not-solve", "solves"], "100", f);
    expect(o).toMatchObject({ state: "scored", result: "wrong", issue: "method-wrong" });
  });
  it.each(["36 + 40 = 76 + 7 = 83", "6 + 7 = 13 + 70 = 83"])("keeps the run-on chain %j unsure, not Wrong", one => {
    expect(markSum(one, "36 + 50 = 86\n86 - 3 = 83")).toMatchObject({ o: { state: "pending", result: null, issue: "method-form" }, label: "Our team is checking this answer." });
  });
  it("still marks a chain Wrong when a step is false however it is read", () => {
    expect(markSum("36 + 40 = 77 + 6 = 83", "36 + 50 = 86\n86 - 3 = 83").o).toMatchObject({ state: "scored", result: "wrong" });
  });
  it("makes a false jump Wrong even when the AI says solves", () => {
    expect(markSum("36 +40 → 77 +6 → 83", "47 +30 → 77 +6 → 83").o).toMatchObject({ state: "scored", result: "wrong" });
  });
  it("cannot check jumps with no operation, and keeps them unsure", () => {
    expect(markSum("36 → 76 → 83", "47 +30 → 77 +6 → 83").o).toMatchObject({ state: "pending", result: null, issue: "method-form" });
  });

  // The book's page 22 question, 7 × 360 = ?: split by place value and strip zeros are two templates.
  const SPLIT = "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520", STRIP = "36 × 7 = 252\n252 × 10 = 2520";
  const book22 = () => sumFrame("7 × 360 = ?", { kind: "multiply", operands: [7, 360] }, 2520);
  const read22 = (one: string | null, two: string | null, answer: string | null, issue: string | null = null, verdicts: readonly [Verdict, Verdict] = ["solves", "solves"], methodMarks?: boolean) => {
    const f = book22(), o = readMarkingOutput(f, twoWaysOutput(one, two, answer, issue, verdicts), { methodMarks })[0];
    expect(observationProblem(o)).toBeNull();
    return { f, o, view: markingPageView([twoWaysMark(f, o)]) };
  };
  it("keeps a valid pair unsure when the AI is unsure, and when it gives no verdict", () => {
    for (const verdicts of [["unsure", "solves"], [null, "solves"]] as const) {
      const { o, view } = read22(SPLIT, STRIP, "2520", null, verdicts);
      expect(o).toMatchObject({ state: "pending", result: null });
      expect(view.items[0].label).toBe("Our team is checking this answer.");
    }
  });
  it("makes a false step Wrong even when the AI says solves", () => {
    const { o, view } = read22("7 × 300 = 2100\n7 × 60 = 410\n2100 + 410 = 2510", STRIP, "2520");
    expect(o).toMatchObject({ state: "scored", result: "wrong", issue: "method-wrong" });
    expect(view.items[0].label).toBe("Wrong. One way does not solve the question.");
  });
  it.each([
    ["a wrong final answer", SPLIT, STRIP, "2420", "wrong", "Wrong"],
    ["a false step", "7 × 300 = 2000\n2000 + 420 = 2420", STRIP, "2520", "wrong", "Wrong. One way does not solve the question."],
    ["a missing first method", "", STRIP, "2520", "wrong", "Wrong. One way is missing."],
    ["a missing second method", SPLIT, "", "2520", "wrong", "Wrong. One way is missing."],
    ["a missing answer", SPLIT, STRIP, "", "wrong", "Wrong"],
    ["a false method beside an unreadable answer", "7 × 300 = 2000", STRIP, null, "wrong", "Wrong"],
    ["nothing written", "", "", "", "blank", "Blank"],
    ["both valid methods and the right answer", SPLIT, STRIP, "2520", "right", "Right"],
  ] as const)("marks %s", (_name, one, two, answer, result, label) => {
    const { o, view } = read22(one, two, answer);
    expect(o).toMatchObject({ state: "scored", method: "code", result, actor: "system" });
    expect(view.items[0].label).toBe(label);
    expect(view.completion).toMatchObject({ status: "complete", finished: 1 });
    expect(view.counts.teamChecks).toBe(0);
  });
  it.each([
    ["a blurry method", null, STRIP, "2520", "blurry", "Our team is checking this answer. The photo is blurry here. You can also send a new photo of this page."],
    ["a cut-off second method", SPLIT, null, "2520", "cut-off", "Our team is checking this answer. Part of this answer is cut off. You can also send a new photo of this page."],
    ["an unreadable answer", SPLIT, STRIP, null, "unreadable", "Our team is checking this answer."],
    ["a method the AI cannot write out", null, STRIP, "2520", "method-form", "Our team is checking this answer."],
    ["a method the model calls an answer form", null, STRIP, "2520", "answer-form", "Our team is checking this answer."],
    ["an answer the model calls an answer form", SPLIT, STRIP, null, "answer-form", "Our team is checking this answer."],
    ["a method in words", "I took the zero off and put it back", STRIP, "2520", undefined, "Our team is checking this answer."],
    ["the same method twice", STRIP, STRIP, "2520", undefined, "Our team is checking this answer."],
    ["the same steps in another order", "252 × 10 = 2520\n36 × 7 = 252", STRIP, "2520", undefined, "Our team is checking this answer."],
    ["only a number", "2520", STRIP, "2520", undefined, "Our team is checking this answer."],
    ["true steps that stop at another number", "7 × 300 = 2100", STRIP, "2520", undefined, "Our team is checking this answer."],
  ] as const)("keeps %s unsure with a plain reason and no parent prompt", (_name, one, two, answer, issue, label) => {
    const { f, o, view } = read22(one, two, answer, issue ?? null);
    expect(o).toMatchObject({ state: "pending", method: "code", result: null });
    expect(view.items[0].label).toBe(label);
    expect(view.items[0].label).not.toMatch(/please check|both methods/i);
    expect(view.completion.status).toBe("incomplete");
    expect(markingEvent(expectedItems(f)[0], o).publish).toBe(false);
  });
  it("with the switch off, sends even a valid pair to our team, never Right", () => {
    const off = read22(SPLIT, STRIP, "2520", null, ["solves", "solves"], false);
    expect(off.o).toMatchObject({ state: "pending", result: null, issue: "method-form" });
    expect(off.view.items[0].label).toBe("Our team is checking this answer.");
    expect(read22(SPLIT, STRIP, "2520").o).toMatchObject({ state: "scored", result: "right" });
  });
  it("keeps the AI's verdict and reason as evidence, and never in a label", () => {
    const f = twoWaysFrame(), o = readMarkingOutput(f, twoWaysOutput(GOOD_ONE, GOOD_TWO, "66", null, ["does-not-solve", "solves"]))[0];
    expect(o.regions[0]).toMatchObject({ verdict: "does-not-solve", verdictReason: "made-up model reason" });
    expect(markingPageView([twoWaysMark(f, o)]).items[0].label).not.toContain("made-up");
  });
  it("gives an unread two-ways item a plain label, never a request to check it", () => {
    const f = twoWaysFrame(), view = markingPageView([twoWaysMark(f, firstObservation(expectedItems(f)[0], f.photo))]);
    expect(view.items[0].label).toBe("Not marked yet");
    expect(view.items[0].state).toBe("pending");
  });
  it("shows the answer first in the reading the parent sees, within the limit", () => {
    const f = twoWaysFrame(), long = `27 + 39 = 66\n${"1 + 1 = 2\n".repeat(17)}`.trim();
    const o = readMarkingOutput(f, twoWaysOutput(long, GOOD_TWO, "66"))[0];
    expect(o.readAnswerText!.startsWith("Answer: 66; Method 1: 27 + 39 = 66")).toBe(true);
    expect(o.readAnswerText!.length).toBeLessThanOrEqual(200);
  });
  it("runs one paid reading, then publishes the right item as a marking event", async () => {
    const f = book22(), s = new Store(f), requests: AiJsonRequest[] = [];
    expect(await run(s, f.photo, client(twoWaysOutput(SPLIT, STRIP, "2520"), requests, 1000))).toBe("finished");
    expect(requests).toHaveLength(1); expect(s.spend.size).toBe(1);
    const marks = await s.effective(P, C);
    expect(marks[0].observation).toMatchObject({ state: "scored", result: "right" });
    expect(s.events).toHaveLength(1); expect(s.events[0]).toMatchObject({ source: "marking", result: "right" });
    expect(markingPageView(marks).items[0]).toMatchObject({ label: "Right", canChange: true });
  });
  it("keeps the parent's correction of an AI mark", () => {
    const f = twoWaysFrame(), o = readMarkingOutput(f, twoWaysOutput(GOOD_ONE, GOOD_TWO, "66", null, ["does-not-solve", "solves"]))[0];
    const changed: Observation = { ...o, state: "parent-checked", method: "parent", actor: "parent", result: "wrong", resultVersion: 3 };
    expect(observationProblem(changed)).toBeNull();
    const view = markingPageView([twoWaysMark(f, changed)]);
    expect(view.items[0]).toMatchObject({ label: "Wrong", state: "parent-checked", canChange: true, actor: "parent" });
    expect(view.completion).toMatchObject({ status: "complete", finished: 1 });
    expect(markingEvent(expectedItems(f)[0], changed)).toMatchObject({ publish: true, result: "wrong" });
  });
  it("crops both measured work areas and the answer, and refuses missing or duplicate method geometry", () => {
    const f = twoWaysFrame();
    expect(cropPlan(f.questions)).toEqual({ notSupported: [], crops: [{ number: 1, itemId: f.questions[0].package!.id,
      regionId: "method-1", regionIds: ["method-1", "method-2", "answer"], box: { x: 10, y: 20, width: 290, height: 120 } }] });
    const q = f.questions[0]; q.regions![1].box = null;
    expect(cropPlan(f.questions).notSupported).toEqual([1]);
    expect(expectedItems(f)[0].method).toBe("code");
    expect(readMarkingOutput(f, twoWaysOutput(GOOD_ONE, GOOD_TWO, "66"))[0]).toMatchObject({ state: "pending", result: null });
    q.regions = twoWaysFrame().questions[0].regions;
    q.regions = [...q.regions!, structuredClone(q.regions![0])];
    expect(cropPlan(f.questions).notSupported).toEqual([1]);
  });
  it("also pins the request name and the item content the model sees", () => {
    const request = markingRequest(twoWaysFrame(), new Uint8Array([1]));
    expect(createHash("sha256").update(JSON.stringify({ name: request.name, content: request.content[0] })).digest("hex")).toBe(FROZEN_CONTENT_SHA256);
  });
  it("lets our team's mark finish the item, and a parent can change it afterwards", () => {
    const f = twoWaysFrame(), o = readMarkingOutput(f, twoWaysOutput(GOOD_ONE, GOOD_TWO, "66"))[0];
    const team: Observation = { ...o, state: "parent-checked", method: "parent", actor: "admin", result: "right", resultVersion: 3 };
    expect(observationProblem(team)).toBeNull();
    const view = markingPageView([twoWaysMark(f, team)]);
    expect(view.items[0]).toMatchObject({ label: "Right", state: "parent-checked", canChange: true, actor: "admin" });
    expect(view.completion).toMatchObject({ status: "complete", finished: 1 });
    expect(markingEvent(expectedItems(f)[0], team)).toMatchObject({ publish: true, result: "right" });
  });
  it("turns the switch on, so code can mark a valid pair", () => {
    expect(TWO_WAYS_METHOD_MARKS).toBe(true);
  });
  // The fourth and fifth reviews on the book's own questions. None of these is Right.
  const book78 = () => sumFrame("50 × 80 = ?", { kind: "multiply", operands: [50, 80] }, 4000);
  const book38 = () => sumFrame("60 × ? = 4800", { kind: "divide", operands: [4800, 60] }, 80);
  it.each([
    ["the review's round-and-adjust that holds the question", "5 × 8 = 40\n40 × 100 = 4000", "80 × 100 = 8000\n80 × 50 = 4000\n8000 - 4000 = 4000", book78, "4000"],
    ["strip zeros from both next to strip zeros from one", "5 × 8 = 40\n40 × 100 = 4000", "50 × 8 = 400\n400 × 10 = 4000", book78, "4000"],
    ["the inverse division next to the division with tens", "4800 ÷ 60 = 80", "480 ÷ 6 = 80", book38, "80"],
    ["the reverse check with the answer's zeros off", "4800 ÷ 60 = 80", "60 × 8 = 480\n480 × 10 = 4800\n8 × 10 = 80", book38, "80"],
  ] as const)("sends %s to our team, never Right", (_name, one, two, frame, answer) => {
    const { o, label } = markSum(one, two, ["solves", "solves"], answer, frame());
    expect(o).toMatchObject({ state: "pending", result: null });
    expect(label).toBe("Our team is checking this answer.");
  });
  it.each([
    ["strip zeros and round up", "5 × 8 = 40\n40 × 100 = 4000", "100 × 50 = 5000\n20 × 50 = 1000\n5000 - 1000 = 4000", book78, "4000"],
    ["the inverse division and a build-up", "4800 ÷ 60 = 80", "60 × 40 = 2400\n60 × 40 = 2400\n2400 + 2400 = 4800\n40 + 40 = 80", book38, "80"],
  ] as const)("marks two different templates Right: %s", (_name, one, two, frame, answer) => {
    expect(markSum(one, two, ["solves", "solves"], answer, frame())).toMatchObject({ o: { state: "scored", result: "right" }, label: "Right" });
  });
});

describe("write-words whole-page reading", () => {
  it.each([["7:56", "07:56"], ["8 by 4", "8 x 4"], ["a different colour", "not red"]])("keeps a clear alternate form of %s for our team instead of marking it wrong", (key, text) => {
    const f = wordsFrame(), item = f.questions[0].package!.item!;
    const box = item.regions[0]; if (box.kind === "box") box.answer = { type: "text", value: key };
    const check = item.checks[0]; if (check.kind === "template") check.source.answer = `'${key}'`;
    expect(checkQuestionPackage(f.questions[0].package)).toMatchObject({ ok: true });
    const o = readMarkingOutput(f, output([text]))[0];
    expect(o).toMatchObject({ state: "pending", result: null, certainty: "certain", readAnswerText: text, issue: "answer-form" });
    expect(observationProblem(o)).toBeNull();
    expect(markingEvent(expectedItems(f)[0], o).publish).toBe(false);
    const judged: Observation = { ...o, state: "parent-checked", method: "parent", actor: "parent", result: "wrong", resultVersion: 2 };
    expect(markingPageView([{ expected: expectedItems(f)[0], observation: judged, originalEvent: null, eventId: null, at: "2026-11-06T12:00:00Z", model: null, prompt: null }]).completion.status).toBe("complete");
    expect(judged.readAnswerText).toBe(text);
  });
  it.each([
    ["addition", "right"], ["  ADDITION  ", "right"], ["subtraction", null], ["66", null], ["", "blank"], [null, null],
  ] as const)("code checks %j against the stored template rule", (text, result) => {
    const f = wordsFrame(), o = readMarkingOutput(f, output([text]))[0];
    expect(o.result).toBe(result);
    expect(o.readAnswerText).toBe(text);
    expect(o.regions).toHaveLength(1);
    expect(o.regions[0].regionId).toBe("words");
    expect(observationProblem(o)).toBeNull();
    const view = markingPageView([{ expected: expectedItems(f)[0], observation: o, originalEvent: null, eventId: null, at: "2026-11-06T12:00:00Z", model: null, prompt: null }]);
    expect(view.completion.status).toBe(result === null ? "incomplete" : "complete");
  });
  it.each([
    { readings: [] },
    { readings: [...output(["addition"]).readings, ...output(["subtraction"]).readings] },
    { readings: [{ item: "i1", region: "r1", state: "blank", text: null }] },
    { readings: [{ item: "i1", region: "r1", state: "written", text: "addition", issue: "crossed-out" }] },
    { readings: [{ item: "i1", region: "r1", state: "uncertain", text: "addition" }] },
  ])("missing, duplicate or ambiguous words stay pending", bad => {
    const o = readMarkingOutput(wordsFrame(), bad)[0];
    expect(o).toMatchObject({ state: "pending", result: null });
    expect(observationProblem(o)).toBeNull();
  });
  it("does not trust an unchecked stored word, a changed template key or model verdict", () => {
    const unchecked = wordsFrame(); unchecked.questions[0].package!.item!.checks = [];
    expect(readMarkingOutput(unchecked, output(["addition"]))[0].result).toBeNull();
    const changed = wordsFrame();
    const r = changed.questions[0].package!.item!.regions[0];
    if (r.kind === "box") r.answer = { type: "text", value: "subtraction" };
    expect(readMarkingOutput(changed, output(["subtraction"]))[0].result).toBeNull();
    const bad = output(["subtraction"]); Object.assign(bad.readings[0], { result: "right", answer: "subtraction" });
    expect(readMarkingOutput(wordsFrame(), bad)[0]).toMatchObject({ result: null, state: "pending", issue: "answer-form", readAnswerText: "subtraction" });
  });
  it("dispatches one text region without its answer key, and retains one result on a retake", async () => {
    const f = wordsFrame(), retake = structuredClone(f); retake.photo = "words-retake";
    const s = new Store(f, retake), requests: AiJsonRequest[] = [];
    expect(await run(s, f.photo, client(output(["addition"]), requests))).toBe("finished");
    expect(s.events).toHaveLength(1);
    expect(markingPageView(await s.effective(P, C)).completion.status).toBe("complete");
    expect(requests).toHaveLength(1);
    expect(requests[0].system).toContain("For a text region");
    const data = (requests[0].content[0] as { text: string }).text;
    expect(JSON.parse(data).items).toEqual([{ item: "i1", region: "r1", kind: "text", box: { x: 10, y: 30, width: 200, height: 30 } }]);
    for (const secret of ["addition", "subtraction", P, C, W, "words", "template"]) expect(data).not.toContain(secret);
    expect(cropPlan(f.questions)).toMatchObject({ notSupported: [], crops: [{ regionId: "words" }] });
    expect(await run(s, retake.photo, client(output(["subtraction"]), requests))).toBe("finished");
    expect(requests).toHaveLength(1); expect(s.events).toHaveLength(1);
    expect((await s.effective(P, C))[0].observation.readAnswerText).toBe("addition");
  });
});

describe("#715: no screen asks a parent to judge an answer", () => {
  const ASKS_PARENT = /please check|check this answer|check both|is (it|this) right\?/i;
  const numberWordsFrame = (key: string) => {
    const f = wordsFrame(), item = f.questions[0].package!.item!;
    f.questions[0].package!.text = "Write 42 in words.";
    const box = item.regions[0]; if (box.kind === "box") box.answer = { type: "text", value: key };
    item.checks = [{ kind: "template", region: "words", source: { answer: `'${key}'`, check: null, derived: [], values: null, slots: [] } }];
    expect(checkQuestionPackage(f.questions[0].package)).toMatchObject({ ok: true });
    return f;
  };
  const view = (f: MarkingFrame, o: Observation, model: string | null = MARKING_MODEL) =>
    markingPageView([{ expected: expectedItems(f)[0], observation: o, originalEvent: null, eventId: null, at: "2026-11-07T12:00:00Z", model, prompt: null }]);
  it.each([["Forty Two", "right"], ["forty-two", "right"], ["FORTY TWO", "right"], ["fourty two", "right"], ["forty-three", "wrong"], ["twenty-four", "wrong"]] as const)(
    "a clear write-words reading %j of the key forty-two is marked %s by code", (text, result) => {
      const f = numberWordsFrame("forty-two"), o = readMarkingOutput(f, output([text]))[0];
      expect(o).toMatchObject({ state: "scored", result, readAnswerText: text });
      expect(observationProblem(o)).toBeNull();
      expect(view(f, o).items[0].label).toBe(result === "right" ? "Right" : "Wrong");
    });
  it("an unclear write-words reading is unsure: our team checks it and the parent is asked nothing", () => {
    const f = numberWordsFrame("forty-two"), o = readMarkingOutput(f, output(["42"]))[0];
    expect(o).toMatchObject({ state: "pending", result: null });
    const item = view(f, o).items[0];
    expect(item.label).toBe("Our team is checking this answer.");
    expect(item.canChange).toBe(false);
    expect(item.label).not.toMatch(ASKS_PARENT);
  });
  it("an item that is not read yet says Not marked yet, with no change control", () => {
    const f = frame(), e = expectedItems(f)[0];
    const item = view(f, firstObservation(e, f.photo), null).items[0];
    expect(item).toMatchObject({ label: "Not marked yet", canChange: false, result: null });
    // A reading in hand is the team's even before the row records its model.
    const read = readMarkingOutput(f, { readings: [{ item: "i1", region: "r1", state: "uncertain", text: null, issue: "unreadable" }] })[0];
    expect(view(f, read, null).items[0].label).toBe("Our team is checking this answer.");
    // One rule with admin_scan_team_queue: a row the AI processed (model set) with no reading also waits for our team.
    expect(waitsForTeam({ observation: firstObservation(e, f.photo), model: MARKING_MODEL })).toBe(true);
    expect(waitsForTeam({ observation: firstObservation(e, f.photo), model: null })).toBe(false);
    expect(waitsForTeam({ observation: read, model: null })).toBe(true);
  });
  it.each(["unreadable", "crossed-out", "multiple-marks", "missing", "incomplete", "answer-form"] as const)(
    "an unsure reading (%s) says our team is checking it", (issue) => {
      const f = frame(), o = readMarkingOutput(f, { readings: [{ item: "i1", region: "r1", state: "uncertain", text: null, issue }] })[0];
      const v = view(f, { ...o, issue });
      // Exactly this: a clear photo the AI was unsure of is not "unreadable", so no reason is guessed for the parent.
      expect(v.items[0]).toMatchObject({ label: "Our team is checking this answer.", canChange: false });
      expect(v.counts).toMatchObject({ teamChecks: 1, pending: 0 });
    });
  it.each([["blurry", "The photo is blurry here."], ["cut-off", "Part of this answer is cut off."]] as const)(
    "a bad photo (%s) can still ask for a new photo, and asks for no judgment", (issue, reason) => {
      const f = frame(), o = readMarkingOutput(f, { readings: [{ item: "i1", region: "r1", state: "uncertain", text: null, issue }] })[0];
      const label = view(f, o).items[0].label;
      expect(label).toBe(`Our team is checking this answer. ${reason} You can also send a new photo of this page.`);
      expect(label).not.toMatch(ASKS_PARENT);
    });
  it("an item waiting for a person (an old parent-checked format) is our team's, not the parent's", () => {
    // A format a person checks: an item the package marks parentChecked, with no automatic score.
    const f = twoWaysFrame(), item = f.questions[0].package!.item!;
    item.scorable = false; item.parentChecked = true;
    const e = expectedItems(f)[0];
    expect(e.method).toBe("parent");
    const v = view(f, firstObservation(e, f.photo), null);
    expect(v.items[0]).toMatchObject({ label: "Our team is checking this answer.", canChange: false });
    expect(v.counts).toMatchObject({ teamChecks: 1 });
  });
  it("a team mark is the effective mark: it finishes the item, publishes its result and the parent can still change it", () => {
    const f = frame(), e = expectedItems(f)[0];
    const unsure = readMarkingOutput(f, { readings: [{ item: "i1", region: "r1", state: "uncertain", text: null, issue: "unreadable" }] })[0];
    const team: Observation = { ...unsure, resultVersion: 2, state: "parent-checked", method: "parent", actor: "admin", result: "wrong" };
    expect(observationProblem(team)).toBeNull();
    expect(markingEvent(e, team)).toMatchObject({ publish: true, result: "wrong" });
    const intent = { key: markingOriginalKey(e), parentId: P, childId: C, source: "marking", question: { source: "workbook", workbookId: W, page: 3, question: 1 }, skill: { standard: STANDARD.code, skills: [STANDARD.skills[0].id] }, result: "wrong", stuckStep: "x", mistake: "y", hints: 0, timeMs: null, occurredAt: "2026-11-07T12:00:00Z", evidence: { kind: "scan", id: f.photo } } as NewLearningEvent;
    const mark = (o: Observation): EffectiveMark => ({ expected: e, observation: o, originalEvent: intent, eventId: "event-1", at: "2026-11-07T12:00:00Z", model: MARKING_MODEL, prompt: null });
    const v = markingPageView([mark(team)]);
    expect(v.completion).toMatchObject({ status: "complete", finished: 1 });
    expect(v.items[0]).toMatchObject({ label: "Wrong", actor: "admin", canChange: true });
    expect(effectiveMarkingEvents([], [mark(team)])[0]).toMatchObject({ id: "event-1", result: "wrong", mistake: null, stuckStep: null });
    const parent: Observation = { ...team, resultVersion: 3, actor: "parent", result: "right" };
    expect(markingPageView([mark(parent)]).items[0]).toMatchObject({ label: "Right", actor: "parent", canChange: true });
    expect(effectiveMarkingEvents([], [mark(parent)])[0]).toMatchObject({ result: "right" });
    expect(effectiveSkillMarks([mark(parent)])[0]).toMatchObject({ right: true });
  });
});

describe("fraction and mixed-number scan responses", () => {
  it.each(["-1 1/-4", "1 1/-4", "1 1/+4", "-1 1/+4"])("R3-01 keeps mixed-number signed denominator %s pending with no right event", async text => {
    const f = numericFrame({ type: "mixed", whole: 1, numerator: 1, denominator: 4 }, "'1 1/4'");
    const read = readMarkingOutput(f, output([text]))[0];
    expect(read).toMatchObject({ state: "pending", result: null, readAnswerText: text });
    const s = new Store(f);
    expect(await run(s, f.photo, client(output([text])))).toBe("finished");
    const view = markingPageView(await s.effective(P, C));
    expect(view.completion.status).toBe("incomplete");
    expect(view.items[0].result).toBeNull(); expect(s.events).toHaveLength(0);
    expect((await s.effective(P, C))[0].observation.readAnswerText).toBe(text);
  });
  it("keeps ordinary mixed signs, single-fraction signs and a clear zero denominator distinct", () => {
    const mixed = numericFrame({ type: "mixed", whole: 1, numerator: 1, denominator: 4 }, "'1 1/4'");
    expect(readMarkingOutput(mixed, output(["1 1/4"]))[0].result).toBe("right");
    expect(readMarkingOutput(mixed, output(["-1 1/4"]))[0].result).toBe("wrong");
    expect(readMarkingOutput(mixed, output(["1 1/0"]))[0].result).toBe("wrong");
    const fraction = numericFrame({ type: "fraction", numerator: 1, denominator: 9 }, "'1/9'");
    expect(readMarkingOutput(fraction, output(["-1/-9"]))[0].result).toBe("right");
    expect(readMarkingOutput(fraction, output(["1/-9"]))[0].result).toBe("wrong");
  });
  it.each([
    ["1/9", "right"], ["2/18", "right"], [" 1 / 9 ", "right"], ["-1/9", "wrong"], ["1/0", "wrong"],
    ["0/0", "wrong"], ["2/9", "wrong"], ["19", "wrong"], ["1/?", null], ["1//9", null], ["1/9 or 2/9", null], ["", "blank"], [null, null],
  ] as const)("checks the exact rational form %j", (text, result) => {
    const f = numericFrame({ type: "fraction", numerator: 1, denominator: 9 }, "'1/9'");
    const o = readMarkingOutput(f, output([text]))[0];
    expect(o.result).toBe(result); expect(o.readAnswerText).toBe(text); expect(observationProblem(o)).toBeNull();
  });
  it.each(["5/4", "1 1/4", "10/8"])("accepts %s for a template's exact mixed amount", text => {
    const f = numericFrame({ type: "mixed", whole: 1, numerator: 1, denominator: 4 }, "'1 1/4'");
    expect(readMarkingOutput(f, output([text]))[0].result).toBe("right");
  });
  it("uses the operation's accepted forms and required simplification", () => {
    const f = numericFrame({ type: "fraction", numerator: 7, denominator: 8 }, "'7/8'"), q = f.questions[0];
    q.package = structuredClone(FIXTURES.D_SIMPLEST);
    q.package.item = { format: "write-number", scorable: true, parentChecked: false, error: null,
      regions: [{ id: "answer", kind: "box", label: null, answer: q.package.answer!.value }], checks: [{ kind: "operation", region: "answer" }] };
    expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
    expect(readMarkingOutput(f, output(["7/8"]))[0].result).toBe("right");
    expect(readMarkingOutput(f, output(["14/16"]))[0].result).toBe("wrong");
    q.package.text = "Add the fractions.";
    q.package.answer!.accepted = [{ type: "fraction", numerator: 14, denominator: 16 }, { type: "number", value: 0.875 }];
    expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
    expect(readMarkingOutput(f, output(["14/16"]))[0].result).toBe("right");
    expect(readMarkingOutput(f, output([".875"]))[0].result).toBe("right");
    expect(readMarkingOutput(f, output([".87500000000000001"]))[0].result).toBeNull();
  });
  it("keeps an ambiguous fraction bar or sign pending and refuses a rounded integer part", () => {
    const f = numericFrame({ type: "fraction", numerator: 1, denominator: 9 }, "'1/9'");
    for (const text of ["19", "1/9", "-1/9"]) expect(readMarkingOutput(f, { readings: [{ item: "i1", region: "r1", state: "uncertain", text, issue: "unreadable" }] })[0].result).toBeNull();
    expect(readMarkingOutput(f, output(["9007199254740993/81064793292668937"]))[0].result).toBeNull();
  });
  it("does not compare a linked equation's example fraction as its only accepted answer", () => {
    const f = numericFrame({ type: "fraction", numerator: 1, denominator: 9 }, "'1/9'");
    f.questions[0].package!.item!.checks = [{ kind: "equations", different: false, numbers: "any", equations: [{
      left: { region: "answer" }, op: "×", right: { type: "number", value: 0 }, result: { type: "number", value: 0 },
    }] }];
    expect(checkQuestionPackage(f.questions[0].package)).toMatchObject({ ok: true });
    expect(readMarkingOutput(f, output(["2/9"]))[0]).toMatchObject({ state: "pending", result: null });
  });
  it("finishes a fraction page with one event, one crop and no extra attempt on retake", async () => {
    const f = numericFrame({ type: "fraction", numerator: 1, denominator: 9 }, "'1/9'"), retake = structuredClone(f); retake.photo = "fraction-retake";
    const s = new Store(f, retake), requests: AiJsonRequest[] = [];
    expect(await run(s, f.photo, client(output(["2/18"]), requests))).toBe("finished");
    expect(markingPageView(await s.effective(P, C)).completion.status).toBe("complete"); expect(s.events).toHaveLength(1);
    const data = (requests[0].content[0] as { text: string }).text;
    expect(JSON.parse(data).items[0].kind).toBe("fraction"); expect(data).not.toContain("1/9");
    expect(cropPlan(f.questions)).toMatchObject({ notSupported: [], crops: [{ regionId: "answer" }] });
    expect(await run(s, retake.photo, client(output(["1/9"]), requests))).toBe("finished"); expect(requests).toHaveLength(1); expect(s.events).toHaveLength(1);
    expect((await s.effective(P, C))[0].observation.readAnswerText).toBe("2/18");
  });
  it("serializes fraction photos across devices and lets a retake resolve unreadable writing once", async () => {
    const f = numericFrame({ type: "fraction", numerator: 1, denominator: 9 }, "'1/9'"), b = structuredClone(f); b.photo = "fraction-device-b";
    const s = new Store(f, b), held = deferred<unknown>(), started = deferred<void>(), requests: AiJsonRequest[] = [];
    const first = run(s, f.photo, client(async () => { started.resolve(); return held.promise; }, requests)); await started.promise;
    expect(await run(s, b.photo, client(output(["1/9"]), requests))).toBe("busy");
    held.resolve(output([null])); expect(await first).toBe("finished"); expect(s.events).toHaveLength(0);
    expect(await run(s, b.photo, client(output(["2/18"]), requests))).toBe("finished");
    expect(s.events).toHaveLength(1); expect(requests).toHaveLength(2);
    expect(markingPageView(await s.effective(P, C)).completion.status).toBe("complete");
  });
});

describe("decimal scan responses", () => {
  it.each([
    ["6.1", "right"], ["06.100", "right"], ["+6.1", "right"], ["-6.1", "wrong"], ["61", "wrong"], ["6.01", "wrong"],
    ["6.1000000000000001", null], ["6,1", null], ["6.?", null], ["", "blank"], [null, null],
  ] as const)("keeps every decimal digit in %j", (text, result) => {
    const f = numericFrame({ type: "number", value: 6.1 }, "6.1"), o = readMarkingOutput(f, output([text]))[0];
    expect(o.result).toBe(result); expect(o.readAnswerText).toBe(text); expect(observationProblem(o)).toBeNull();
  });
  it("supports negative keys, zero and an omitted leading zero without losing precision", () => {
    for (const [key, text] of [[-0.5, "-.50"], [0, "00.00"], [0.5, ".500"]] as const) {
      const f = numericFrame({ type: "number", value: key }, String(key));
      expect(readMarkingOutput(f, output([text]))[0].result).toBe("right");
    }
  });
  it("does not turn an ambiguous decimal point into a digit or a blank", () => {
    const f = numericFrame({ type: "number", value: 6.1 }, "6.1");
    expect(readMarkingOutput(f, { readings: [{ item: "i1", region: "r1", state: "uncertain", text: "61", issue: "unreadable" }] })[0]).toMatchObject({ state: "pending", result: null, readAnswerText: "61" });
  });
});

it.each(["friday-5", "mixed-set", "show-what-you-know", "practice", "review"])("uses frozen %s teaching for page mastery", async (part) => {
  const f = frame("review-photo", [1, 1, 1, 1, 1, 1]);
  f.questions[5].teaching!.part = part;
  const store = new Store(f);
  expect(await run(store, f.photo, client(output(["1", "1", "1", "1", "1", "1"])))).toBe("finished");
  const originals = (await store.effective(P, C)).map((mark, n) => ({ ...mark, at: `2026-11-0${n + 1}T12:00:00Z` }));
  const marks = effectiveSkillMarks(originals);
  const approved = ["friday-5", "mixed-set", "show-what-you-know"].includes(part);
  expect(marks.map((m) => m.review)).toEqual([false, false, false, false, false, approved]);
  const state = skillStates({ schoolGrade: 2, tests: [], workbookStandards: [STANDARD.code], marks }).find((s) => s.standard === STANDARD.code);
  expect(state?.state).toBe(approved ? "mastered" : "working_on");
});

describe("S4 whole-page readings", () => {
  it.each([
    { name: "whole number", make: () => frame("photo-a", [7]) },
    { name: "fraction", make: () => numericFrame({ type: "fraction", numerator: 1, denominator: 9 }, "'1/9'") },
    { name: "decimal", make: () => numericFrame({ type: "number", value: 6.1 }, "6.1") },
    { name: "words", make: wordsFrame },
    { name: "circle", make: circleFrame },
    { name: "tick and number", make: tickFrame },
    { name: "shown work", make: showWorkFrame },
    { name: "spot the error", make: spotFrame },
  ])("accepts schema-valid null and empty blank text for $name", ({ make }) => {
    const f = make();
    const part = markingRequest(f, new Uint8Array()).content.find(p => p.type === "text")!;
    if (part.type !== "text") throw new Error("text request required");
    const items = JSON.parse(part.text).items as { item: string; region: string }[];
    const normalized: Observation[] = [];
    for (const text of [null, ""]) {
      const response = { readings: items.map(a => ({ item: a.item, region: a.region, state: "blank", text, issue: null, verdict: null, reason: null })) };
      expect(validMarkingOutput(f, response)).toBe(true);
      const [o] = readMarkingOutput(f, response);
      expect(o).toMatchObject({ state: "scored", result: "blank", certainty: "certain", issue: null, readAnswerText: "" });
      expect(o.regions.every(r => r.result === "blank" && r.text === "" && r.issue === null)).toBe(true);
      expect(observationProblem(o)).toBeNull();
      normalized.push(o);
    }
    expect(normalized[0]).toEqual(normalized[1]);
  });
  it.each([
    { text: "7", issue: null }, { text: " ", issue: null },
    { text: null, issue: "blurry" }, { text: "", issue: "unreadable" },
    { text: null, issue: "cut-off" }, { text: null, issue: "missing" },
    { text: undefined, issue: null }, { text: false, issue: null },
    { text: null, issue: undefined }, { text: "x".repeat(201), issue: null },
  ])("keeps contradictory or malformed blank text pending: %j", fields => {
    const [o] = readMarkingOutput(frame("photo-a", [7]), { readings: [{ item: "i1", region: "r1", state: "blank", ...fields }] });
    expect(o).toMatchObject({ state: "pending", result: null, certainty: "uncertain" });
    expect(observationProblem(o)).toBeNull();
  });
  it("zero, wrong, blank and uncertainty remain distinct and code owns the score", () => {
    const f = frame();
    expect(readMarkingOutput(f, output(["0", "56", ""])).map((o) => o.result)).toEqual(["right", "wrong", "blank"]);
    const malicious = output(["11", "12", null]);
    Object.assign(malicious.readings[0], { result: "right", answer: 11, identity: "another-family", mastery: true });
    expect(readMarkingOutput(f, malicious).map((o) => [o.state, o.result])).toEqual([["scored", "wrong"], ["scored", "right"], ["pending", null]]);
  });
  it.each([null, {}, { readings: [{ item: "i1", region: "r1", state: "blank", text: null }] }, output(["crossed out", null]), { readings: [...output(["0"]).readings, ...output(["0"]).readings] }])("malformed, missing, duplicate or crossed-out reading cannot invent a score: %j", (bad) => {
    expect(readMarkingOutput(frame(), bad).every((o) => o.result === null)).toBe(true);
  });
  it("request contains one whole image and measured aliases without identity, keys, examples or text", async () => {
    const requests: AiJsonRequest[] = [], s = new Store(frame());
    expect(await run(s, "photo-a", client(output(["0", "56", ""]), requests))).toBe("finished");
    expect(requests).toHaveLength(1);
    expect(requests[0].content.filter((p) => p.type === "image")).toEqual([{ type: "image", mediaType: "image/jpeg", data: new Uint8Array([1, 2, 3]) }]);
    const text = requests[0].content.filter((p) => p.type === "text").map((p) => p.text).join("");
    for (const privateText of [P, C, W, "private-item", "private-region", "EXAMPLE", "12", "photo-a"]) expect(text).not.toContain(privateText);
    expect(JSON.parse(text).items[0]).toEqual({ item: "i1", region: "r1", box: { x: 10, y: 30, width: 20, height: 30 }, kind: "number" });
    expect(s.events.every((e) => e.timeMs === null)).toBe(true);
  });
  // These fixtures exercise the request and returned readings, not image recognition.
  it.each([
    { evidence: "visible readable empty box", state: "blank", text: "", issue: null, result: "blank", reason: "Blank", rule: /entire answer box, method area or choice area is plainly visible, readable and empty/ },
    { evidence: "unreadable symbol", state: "uncertain", text: null, issue: "unreadable", result: null, reason: "We cannot read this answer.", rule: /Not being able to read a symbol does not make an area blank/ },
    { evidence: "blurred marks", state: "uncertain", text: null, issue: "blurry", result: null, reason: "The photo is blurry here.", rule: /If blur could hide writing or marks, report uncertain with issue blurry/ },
    { evidence: "dark answer", state: "uncertain", text: null, issue: "unreadable", result: null, reason: "We cannot read this answer.", rule: /If darkness, shadow or covering prevents reading the evidence, report uncertain with issue unreadable/ },
    { evidence: "shadowed answer", state: "uncertain", text: null, issue: "unreadable", result: null, reason: "We cannot read this answer.", rule: /If darkness, shadow or covering prevents reading the evidence, report uncertain with issue unreadable/ },
    { evidence: "cut-off answer", state: "uncertain", text: null, issue: "cut-off", result: null, reason: "Part of this answer is cut off.", rule: /Cut-off evidence is uncertain with issue cut-off/ },
    { evidence: "covered answer", state: "uncertain", text: null, issue: "unreadable", result: null, reason: "We cannot read this answer.", rule: /If darkness, shadow or covering prevents reading the evidence, report uncertain with issue unreadable/ },
    { evidence: "missing answer evidence", state: "uncertain", text: null, issue: "missing", result: null, reason: "Part of this answer was not read.", rule: /missing evidence is uncertain with issue missing/ },
    { evidence: "readable written right answer", state: "written", text: "7", issue: null, result: "right", reason: "Right", rule: /transcribe the handwritten number with every digit, sign and decimal point/ },
    { evidence: "readable written wrong answer", state: "written", text: "8", issue: null, result: "wrong", reason: "Wrong", rule: /Never solve a question/ },
  ] as const)("delivers the shared rule and preserves the returned reading for $evidence", async fixture => {
    const f = frame("photo-a", [7]), s = new Store(f), requests: AiJsonRequest[] = [];
    const response = { readings: [{ item: "i1", region: "r1", state: fixture.state, text: fixture.text, issue: fixture.issue, verdict: null, reason: null }] };
    expect(validMarkingOutput(f, response)).toBe(true);
    expect(await run(s, f.photo, client(response, requests))).toBe("finished");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual(markingRequest(f, new Uint8Array([1, 2, 3])));
    expect(requests[0].system).toMatch(fixture.rule);
    const [mark] = await s.effective(P, C);
    expect(mark.observation).toMatchObject({ state: fixture.result === null ? "pending" : "scored", result: fixture.result, issue: fixture.issue, readAnswerText: fixture.text });
    expect(observationProblem(mark.observation)).toBeNull();
    // The reason stays; our team checks every unsure item, and a bad photo may also be sent again (#715).
    expect(markingPageView([mark]).items[0].label).toBe(fixture.result !== null ? fixture.reason
      : PHOTO_ISSUES.includes(fixture.issue) ? `Our team is checking this answer. ${fixture.reason} You can also send a new photo of this page.` : "Our team is checking this answer.");
    if (fixture.result === null) expect(s.events).toHaveLength(0);
  });
  it.each([frame, tickFrame, circleFrame])("uses one versioned empty-area rule for number, tick and circle requests", makeFrame => {
    const request = markingRequest(makeFrame(), new Uint8Array([1, 2, 3]));
    expect(MARKING_PROMPT_VERSION).toBe("whole-page-scalar-readings-v8");
    expect(request.system).toMatch(/Blank requires positive visual evidence/);
    expect(request.system).toMatch(/Check for faint writing or marks before reporting blank with empty text/);
    expect(request.system).toMatch(/Never report blank for these conditions/);
  });
  it.each(["blurry", "unreadable", "cut-off", "missing"] as const)("keeps a contradictory blank with issue %s pending", issue => {
    const [o] = readMarkingOutput(frame("photo-a", [7]), { readings: [{ item: "i1", region: "r1", state: "blank", text: "", issue }] });
    expect(o).toMatchObject({ state: "pending", result: null, issue, certainty: "uncertain" });
  });
  it("missing key and unverified prices dispatch nothing and preserve pending photos", async () => {
    const s = new Store(frame()); expect(await run(s, "photo-a", () => null)).toBe("off"); expect(s.spend.size).toBe(0); expect(s.imageReads).toBe(0);
    s.clock += 181_000; s.prices.clear(); const requests: AiJsonRequest[] = [];
    expect(await run(s, "photo-a", client(output(["0"]), requests))).toBe("price-unverified"); expect(requests).toHaveLength(0); expect(s.events).toHaveLength(0);
  });
  it("oversized, duplicate and cross-family expected sets fail before admission", async () => {
    for (const kind of ["oversized", "duplicate", "ownership"]) {
      const f = frame();
      if (kind === "oversized") f.questions = Array.from({ length: 201 }, () => f.questions[0]);
      if (kind === "duplicate") f.questions[1].package!.id = f.questions[0].package!.id;
      if (kind === "ownership") f.parentId = "another-family";
      const s = new Store(f), requests: AiJsonRequest[] = [];
      expect(await run(s, f.photo, client(output(["0"]), requests))).toBe("unavailable");
      expect(s.jobs.size).toBe(0); expect(requests).toHaveLength(0);
    }
  });
  it("an unready or legacy photo never reaches client admission", async () => { const f = frame(); f.ready = false; const s = new Store(f); expect(await run(s, f.photo, client(output(["0"])))).toBe("unavailable"); expect(s.jobs.size).toBe(0); });
});

describe("S6 choice and number on one canonical item", () => {
  it.each([
    ["+", "66", "right"], ["+", "65", "wrong"], ["−", "66", "wrong"], ["", "", "blank"],
    ["+", "", null], ["", "66", null], [null, "66", null], ["+ and −", "66", null],
    ["unknown choice", "66", null], ["+", "maybe 66", null], ["+", "65 + 1", null],
    ["+", "66.0000000000000001", null], ["+", "65.9999999999999999", null],
    [null, "65", "wrong"], ["−", null, "wrong"],
  ])("choice %j and number %j yield only the item result %j", (choice, number, result) => {
    const f = tickFrame();
    const observations = readMarkingOutput(f, tickOutput(choice, number));
    expect(observations).toHaveLength(1);
    const o = observations[0];
    expect(o.result).toBe(result);
    expect(o.state).toBe(result === null ? "pending" : "scored");
    expect(o.regions.map(r => r.regionId)).toEqual(["operation", "answer"]);
    expect(observationProblem(o)).toBeNull();
    const view = markingPageView([{ expected: expectedItems(f)[0], observation: o, originalEvent: null, eventId: null, at: "2026-11-06T00:00:00Z", model: null, prompt: null }]);
    expect(view.completion).toMatchObject({ total: 1, finished: result === null ? 0 : 1 });
    if (result === null) expect(view.items[0].label).not.toBe("Please check this answer");
  });

  it("keeps malformed or repeated region readings pending instead of inventing a right item", () => {
    for (const bad of [
      { readings: [tickOutput("+", "66").readings[0]] },
      { readings: [...tickOutput("+", "66").readings, tickOutput("+", "66").readings[0]] },
      { readings: [{ ...tickOutput("+", "66").readings[0], region: "another-region" }, tickOutput("+", "66").readings[1]] },
    ]) {
      const o = readMarkingOutput(tickFrame(), bad)[0];
      expect(o.result).toBeNull();
      expect(o.state).toBe("pending");
      expect(observationProblem(o)).toBeNull();
    }
  });

  it("reads the whole page once, publishes one event and preserves a finalized original on retake", async () => {
    const f = tickFrame(), retake = tickFrame("tick-retake"), s = new Store(f, retake), requests: AiJsonRequest[] = [];
    expect(await run(s, f.photo, client(tickOutput("+", "66"), requests))).toBe("finished");
    expect(requests).toHaveLength(1);
    expect(requests[0].content.filter(p => p.type === "image")).toHaveLength(1);
    const items = JSON.parse((requests[0].content[0] as { text: string }).text).items;
    expect(items.map((r: { item: string; region: string }) => [r.item, r.region])).toEqual([["i1", "r1"], ["i1", "r1-2"]]);
    expect(JSON.stringify(items)).not.toContain('"answer"');
    expect(s.events).toHaveLength(1);
    expect(markingPageView(await s.effective(P, C)).completion).toMatchObject({ status: "complete", finished: 1 });
    expect(await run(s, retake.photo, client(tickOutput("−", "65"), requests))).toBe("finished");
    expect(requests).toHaveLength(1);
    expect(s.events).toHaveLength(1);
    expect((await s.effective(P, C))[0].observation.result).toBe("right");
  });

  it("serializes two devices and fills a pending choice-and-number item only once", async () => {
    const a = tickFrame(), b = tickFrame("tick-device-b"), s = new Store(a, b);
    const held = deferred<unknown>(), started = deferred<void>(), requests: AiJsonRequest[] = [];
    const first = run(s, a.photo, client(async () => { started.resolve(); return held.promise; }, requests));
    await started.promise;
    expect(await run(s, b.photo, client(tickOutput("+", "66"), requests))).toBe("busy");
    held.resolve(tickOutput("+", null));
    expect(await first).toBe("finished");
    expect(s.events).toHaveLength(0);
    expect(await run(s, b.photo, client(tickOutput("+", "66"), requests))).toBe("finished");
    expect(s.events).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect((await s.effective(P, C))[0].observation.regions).toHaveLength(2);
  });

  it("keeps a parent change when the first two-region response arrives late", async () => {
    const f = tickFrame(), s = new Store(f), held = deferred<unknown>(), started = deferred<void>();
    const first = run(s, f.photo, client(async () => { started.resolve(); return held.promise; }));
    await started.promise;
    const m = [...s.items.values()][0];
    m.observation = { ...m.observation, state: "parent-checked", method: "parent", result: "wrong", actor: "parent", resultVersion: 2 };
    held.resolve(tickOutput("+", "66"));
    expect(await first).toBe("finished");
    expect(m.observation).toMatchObject({ result: "wrong", actor: "parent", resultVersion: 2 });
    expect(s.events).toHaveLength(0);
  });
});

describe("S7k circle answers", () => {
  it.each([["true", "right"], ["false", "wrong"], ["", "blank"], [null, null], ["true and false", null], ["unknown", null]])("reads %j as %j from the frozen circle rule", (text, result) => {
    const o = readMarkingOutput(circleFrame(), output([text]))[0];
    expect(o.result).toBe(result);
    expect(o.state).toBe(result === null ? "pending" : "scored");
    expect(o.regions.map(r => r.regionId)).toEqual(["pick"]);
    expect(observationProblem(o)).toBeNull();
  });

  it("finishes a circle page and provides its own review crop without a numeric answer key", async () => {
    const f = circleFrame(), s = new Store(f), requests: AiJsonRequest[] = [];
    expect(await run(s, f.photo, client(output(["true"]), requests))).toBe("finished");
    expect(markingPageView(await s.effective(P, C)).completion).toMatchObject({ status: "complete", finished: 1 });
    expect(s.events).toHaveLength(1);
    expect(cropPlan(f.questions)).toMatchObject({ crops: [{ number: 1, regionId: "pick" }], notSupported: [] });
    const items = JSON.parse((requests[0].content[0] as { text: string }).text).items;
    expect(items[0]).toMatchObject({ kind: "choice", mark: "circle", choices: ["true", "false"] });
    expect(items[0]).not.toHaveProperty("answer");
  });
});

describe("S7l show-work final answers", () => {
  it("does not compare a valid alternative equation with one stored example as if each box had a unique answer", () => {
    const f = showWorkFrame(), q = f.questions[0];
    q.package = { ...q.package!, operation: null, answer: null, steps: [], wrongAnswers: [], easierExample: null,
      item: { format: "show-work", scorable: true, parentChecked: false, error: null,
        regions: [{ id: "a", kind: "box", label: null, answer: { type: "number", value: 5 } },
          { id: "b", kind: "box", label: null, answer: { type: "number", value: 7 } }, { id: "work", kind: "work", label: "Work" }],
        checks: [{ kind: "equations", numbers: "whole", different: false, equations: [{ left: { region: "a" }, op: "+", right: { region: "b" }, result: { type: "number", value: 12 } }] }],
      },
    };
    q.regions = [{ id: "a", kind: "box", box: { x: 10, y: 30, width: 40, height: 30 } }, { id: "b", kind: "box", box: { x: 60, y: 30, width: 40, height: 30 } }];
    expect(checkQuestionPackage(q.package)).toMatchObject({ ok: true });
    expect(readMarkingOutput(f, tickOutput("4", "8"))[0]).toMatchObject({ state: "pending", result: null });
  });

  it.each([["66", "right"], ["65", "wrong"], ["", "blank"], [null, null], ["maybe 66", null]])("reads only the final answer %j as %j", (text, result) => {
    const o = readMarkingOutput(showWorkFrame(), output([text]))[0];
    expect(o.result).toBe(result);
    expect(o.regions.map(r => r.regionId)).toEqual(["answer"]);
    expect(o.evidence).toEqual({ photoRevision: "show-work-photo" });
    expect(observationProblem(o)).toBeNull();
  });

  it("keeps working as photo evidence without scoring it or using it to fill an empty final answer", async () => {
    const f = showWorkFrame(), s = new Store(f), requests: AiJsonRequest[] = [];
    const response = { readings: [...output([""]).readings, { item: "i1", region: "work", text: "66", state: "written" }] };
    expect(await run(s, f.photo, client(response, requests))).toBe("finished");
    const marks = await s.effective(P, C);
    expect(marks[0].observation.result).toBe("blank");
    expect(marks[0].observation.evidence?.photoRevision).toBe(f.photo);
    expect(markingPageView(marks).completion.status).toBe("complete");
    expect(s.events).toHaveLength(1);
    const items = JSON.parse((requests[0].content[0] as { text: string }).text).items;
    expect(items).toEqual([{ item: "i1", region: "r1", kind: "number", box: f.questions[0].regions![0].box }]);
    expect(cropPlan(f.questions).notSupported).toEqual([]);
  });
});

describe("S7m spot-the-error answers", () => {
  it.each([["No", "66", "right"], ["Yes", "66", "wrong"], ["No", "65", "wrong"], ["", "", "blank"],
    ["No", "", null], ["", "66", null], [null, "66", null], ["Yes and No", "66", null], ["Yes", null, "wrong"]])("checks the decision %j and correction %j as one %j item", (decision, fix, result) => {
    const o = readMarkingOutput(spotFrame(), tickOutput(decision, fix))[0];
    expect(o.result).toBe(result);
    expect(o.regions.map(r => r.regionId)).toEqual(["right", "fix"]);
    expect(observationProblem(o)).toBeNull();
  });

  it("finishes one item without sending the printed wrong solution as a requested answer", async () => {
    const f = spotFrame(), s = new Store(f), requests: AiJsonRequest[] = [];
    const response = tickOutput("No", "66");
    response.readings.push({ item: "i1", region: "printed-example", text: "56", state: "written" });
    expect(await run(s, f.photo, client(response, requests))).toBe("finished");
    const view = markingPageView(await s.effective(P, C));
    expect(view.completion).toMatchObject({ status: "complete", finished: 1 });
    expect(view.items[0].result).toBe("right");
    expect(s.events).toHaveLength(1);
    const items = JSON.parse((requests[0].content[0] as { text: string }).text).items;
    expect(items.map((r: { region: string }) => r.region)).toEqual(["r1", "r1-2"]);
    expect(JSON.stringify(items)).not.toContain("56");
    expect(cropPlan(f.questions).crops).toHaveLength(1);
  });
});

describe("S4 canonical originals and lifecycle", () => {
  it("two devices run concurrently, then a retake resolves only pending items", async () => {
    const s = new Store(frame(), frame("photo-b")), held = deferred<unknown>(), started = deferred<void>(), requests: AiJsonRequest[] = [];
    const first = run(s, "photo-a", client(async () => { started.resolve(); return held.promise; }, requests)); await started.promise;
    const second = run(s, "photo-b", client(output(["9", "8", "9"]), requests));
    expect(await second).toBe("busy"); held.resolve(output(["0", "56", null])); expect(await first).toBe("finished");
    expect(await run(s, "photo-b", client({ readings: [{ item: "i3", region: "r3", state: "written", text: "9" }] }, requests))).toBe("finished");
    expect([...s.items.values()].map((m) => m.observation.result)).toEqual(["right", "wrong", "right"]);
    expect(s.events).toHaveLength(3); expect(new Set(s.events.map((e) => e.key)).size).toBe(3);
    expect(JSON.parse((requests[1].content[0] as { text: string }).text).items.map((a: { item: string }) => a.item)).toEqual(["i3"]);
  });
  it("a parent version change and later finalized result survive a released first-photo response", async () => {
    const s = new Store(frame(), frame("photo-b")), held = deferred<unknown>(), started = deferred<void>();
    const first = run(s, "photo-a", client(async () => { started.resolve(); return held.promise; })); await started.promise;
    const [m] = [...s.items.values()]; m.observation = { ...m.observation, state: "scored", result: "wrong", certainty: "certain", readAnswerText: "8", regions: [{ regionId: "private-region", text: "8", value: "8", certainty: "certain" }], actor: "parent", resultVersion: 2 };
    s.clock += 181_000; expect(await run(s, "photo-b", client(output(["0", "12", "9"])))).toBe("finished");
    held.resolve(output(["0", "56", ""])); expect(await first).toBe("terminal");
    expect([...s.items.values()].map((m) => m.observation.result)).toEqual(["wrong", "right", "right"]); expect(m.observation.actor).toBe("parent");
  });
  it.each(["deleted", "expired", "family-freeze"])("%s during recognition rejects extraction, publication and retries without discarding cost", async (kind) => {
    const s = new Store(frame()), held = deferred<unknown>(), started = deferred<void>(), requests: AiJsonRequest[] = [];
    const running = run(s, "photo-a", client(async () => { started.resolve(); return held.promise; }, requests)); await started.promise;
    if (kind === "family-freeze") s.frozen = true; else s.terminal.add("photo-a");
    held.resolve(output(["0", "12", "9"])); expect(await running).toBe("terminal"); s.clock += 181_000;
    expect(await run(s, "photo-a", client(output(["0"]), requests))).toBe("terminal"); expect(requests).toHaveLength(1); expect(s.events).toHaveLength(0); expect(s.spend.size).toBe(1);
  });
  it("stored extraction is reused after a worker failure with zero further dispatch", async () => {
    const s = new Store(frame()), apply = s.apply.bind(s); let fail = true;
    s.apply = async (...args) => { if (fail) { fail = false; throw new Error("synthetic crash"); } return apply(...args); };
    const requests: AiJsonRequest[] = []; await expect(run(s, "photo-a", client(output(["0", "12", "9"]), requests))).rejects.toThrow("synthetic crash");
    s.clock += 181_000; expect(await run(s, "photo-a", () => null)).toBe("finished"); expect(requests).toHaveLength(1); expect(s.events).toHaveLength(3);
  });
  it("all-unscored is complete without a model; a parent check stays incomplete", async () => {
    const f = frame(); for (const q of f.questions) { q.package!.item = { format: "hands-on", scorable: false, parentChecked: false, checks: [], error: null, regions: [] }; q.teaching!.eligibility = { format: "hands-on", scorable: false, parentChecked: false, mastery: false, reason: "not-scorable" }; }
    const s = new Store(f); expect(await run(s, f.photo, () => { throw Error("must not create client"); })).toBe("finished");
    expect(markingPageView(await s.effective(P, C)).completion.status).toBe("complete"); expect(s.events).toHaveLength(0);
    const memory = memoryChildProfiles({ children: [{ id: C, parentId: P, grade: 2 }] });
    const rebuilt = await rebuildChildProfile(C, { profiles: { ...memory.profiles, marks: async () => ({ revision: 1, items: await s.effective(P, C) }) }, events: memory.events });
    expect(rebuilt).toMatchObject({ built: true, profile: { standards: [], events: { counted: 0 } } });
    f.questions[0].package!.item!.parentChecked = true; f.questions[0].teaching!.eligibility.parentChecked = true;
    const t = new Store(f); await run(t, f.photo, () => null); expect(markingPageView(await t.effective(P, C)).completion).toMatchObject({ status: "incomplete", finished: 2 });
  });
  it("image expiry preserves original readings and effective history; child deletion removes them", async () => {
    const s = new Store(frame()); await run(s, "photo-a", client(output(["0", "56", "9"]))); const before = await s.effective(P, C); s.terminal.add("photo-a");
    expect(await s.effective(P, C)).toEqual(before); expect(before[1].observation.readAnswerText).toBe("56"); expect(await s.effective("other-parent", C)).toEqual([]);
    s.deleted = true; s.items.clear(); s.events = []; expect(await s.effective(P, C)).toEqual([]); expect(s.spend.size).toBe(1);
  });
});

describe("S4 shared budget", () => {
  it("simultaneous family/model reservations at 49.99 admit one, exactly 50 admits none, unknown holds persist and month rolls over", async () => {
    const s = new Store(frame(), frame("photo-b")); s.spend.set("prior", { period: "2026-11", reserved: 49_990_000, charged: 49_990_000 });
    await s.claim({ parent: P, photo: "photo-a" }, "a", frame());
    // A second independent family has a distinct active-job allowance. The real SQL test uses different parents.
    s.jobs.set("photo-b", { token: "b", items: [], extraction: null, until: s.clock + 180_000, dispatches: 0, done: false });
    const results = await Promise.all([s.admit({ parent: P, photo: "photo-a" }, "a", MARKING_MODEL), s.admit({ parent: "other", photo: "photo-b" }, "b", "comparison-model")]);
    expect(results.filter((r) => typeof r === "object")).toHaveLength(1); expect(results.filter((r) => r === "budget")).toHaveLength(1);
    const id = (results.find((r) => typeof r === "object") as { dispatch: string }).dispatch; await s.settle(id, null);
    expect(await s.admit({ parent: P, photo: "photo-a" }, "a", MARKING_MODEL)).toBe("budget");
    s.clock = Date.parse("2026-12-01T00:00:00Z"); s.jobs.get("photo-a")!.until = s.clock + 180_000;
    expect(await s.admit({ parent: P, photo: "photo-a" }, "a", MARKING_MODEL)).toHaveProperty("dispatch");
    await s.settle(id, 2000); expect(s.spend.get(id)!.period).toBe("2026-11"); expect(s.spend.get(id)!.charged).toBe(2000);
  });
  it("transport retries and job restarts share two dispatches, with both unknown holds retained", async () => {
    const s = new Store(frame()), requests: AiJsonRequest[] = [];
    const twice: MarkingClientFactory = (before) => ({ client: { model: MARKING_MODEL, async json(r) { await before(); requests.push(r); await before(); requests.push(r); throw new Error("lost response"); } }, costMicros: () => null });
    expect(await run(s, "photo-a", twice)).toBe("pending"); s.clock += 181_000;
    expect(await run(s, "photo-a", client(output(["0"]), requests))).toBe("attempts"); expect(requests).toHaveLength(2); expect(s.spend.size).toBe(2);
  });
});

it("effective projection replaces append-only originals; Try first and parent explanations enter neither facts nor skill denominator", async () => {
  const f = frame(); f.questions[0].teaching!.practiceType = "try-first";
  f.questions[2].package!.item = { format: "written-reason", scorable: false, parentChecked: true, checks: [], error: null, regions: [] };
  f.questions[2].teaching!.eligibility = { format: "written-reason", scorable: false, parentChecked: true, mastery: false, reason: "parent-checked" };
  const s = new Store(f); await run(s, "photo-a", client(output(["0", "56", "9"])));
  const marks = await s.effective(P, C); expect(s.events).toHaveLength(1); expect(effectiveSkillMarks(marks)).toHaveLength(1);
  const original = s.events[0]; marks[1].observation = { ...marks[1].observation, result: "right", actor: "parent", resultVersion: 3 };
  expect(effectiveMarkingEvents(s.events, marks).map((e) => e.result)).toEqual(["right"]); expect(original.result).toBe("wrong");
  const memory = memoryChildProfiles({ children: [{ id: C, parentId: P, grade: 2 }] });
  const events = { ...memory.events, range: async () => s.events };
  const profiles = { ...memory.profiles, marks: async () => ({ revision: 3, items: marks }) };
  const rebuilt = await rebuildChildProfile(C, { profiles, events });
  expect(rebuilt.built && rebuilt.profile.standards[0]).toMatchObject({ correct: 1, total: 1 });
  expect(markingEvent(marks[0].expected, marks[0].observation).publish).toBe(false);
});
