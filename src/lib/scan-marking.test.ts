import { describe, expect, it } from "vitest";
import { expectedItems, firstObservation, itemKey, markingEvent, type Observation } from "@/lib/scan-observation";
import { effectiveMarkingEvents, effectiveSkillMarks, markingOriginalKey, markingPageView, MARKING_CAP_MICROS, MARKING_MODEL, readMarkingOutput, runScanMarking, type EffectiveMark, type MarkingClientFactory, type MarkingFrame, type MarkingJob, type MarkingRef, type MarkingStore } from "@/lib/scan-marking";
import type { AiJsonRequest } from "@/lib/ai-client";
import type { QuestionPackage } from "@/lib/question-package";
import { memoryChildProfiles } from "@/lib/child-profile-memory";
import { rebuildChildProfile } from "@/lib/child-profile";
import type { LearningEvent, NewLearningEvent } from "@/lib/learning-events";
import { BC_SKILL_MAP } from "@/lib/assessment";
import { skillStates } from "@/lib/assessment/skill-state";

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
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
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
    expect(JSON.parse(text).items[0]).toEqual({ item: "i1", region: "r1", box: { x: 10, y: 30, width: 20, height: 30 } });
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
