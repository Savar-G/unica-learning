import { describe, expect, it } from "vitest";
import { expectedItems, firstObservation, itemKey, markingEvent, observationProblem, type Observation } from "@/lib/scan-observation";
import { effectiveMarkingEvents, effectiveSkillMarks, markingOriginalKey, markingPageView, MARKING_CAP_MICROS, MARKING_MODEL, readMarkingOutput, runScanMarking, type EffectiveMark, type MarkingClientFactory, type MarkingFrame, type MarkingJob, type MarkingRef, type MarkingStore } from "@/lib/scan-marking";
import type { AiJsonRequest } from "@/lib/ai-client";
import { checkQuestionPackage, workedSteps, type Operation, type QuestionPackage } from "@/lib/question-package";
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
