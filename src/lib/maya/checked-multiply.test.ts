import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyBatch, boardTargets, createScene, type Batch } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { boardHistoryOf, mayaCalls, type CallResult, type CallSeams, type StartInput } from "@/lib/maya-call";
import { codeSentences, noteFacts } from "@/lib/maya-call-note";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { checkTrace } from "@/lib/maya-trace";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import {
  GROUPS_OBJECT,
  MULTIPLY_LESSON_MAP,
  multiplyContext,
  supportsCheckedMultiply,
} from "./checked-multiply";

vi.mock("server-only", () => ({}));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const clock = () => Date.UTC(2026, 10, 20, 18);

function mulPkg(
  text: string,
  operands: [number, number],
  options: { unit?: string | null; id?: string; workbook?: boolean } = {},
): OperationPackage {
  const operation: Operation = { kind: "multiply", operands };
  const easier: Operation = { kind: "multiply", operands: operands[0] === 2 && operands[1] === 2 ? [1, 2] : [2, 2] };
  return {
    id: options.id ?? `mul-${operands[0]}-${operands[1]}`,
    ref: {
      source: "workbook",
      workbookId: options.workbook ? parentId : "sample",
      page: 1,
      question: 1,
    },
    templateId: null,
    text,
    answer: { value: { type: "number", value: operands[0] * operands[1] }, accepted: [], unit: options.unit ?? null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "4.8", skills: ["4.8-multiplication-facts"] },
    level: 12,
    difficulty: 2,
    wrongAnswers: [{ value: { type: "number", value: operands[0] + operands[1] === operands[0] * operands[1] ? operands[0] * operands[1] + 1 : operands[0] + operands[1] }, cause: "careless", description: "Added instead of multiplying.", step: null }],
    easierExample: {
      text: `${easier.operands[0]} × ${easier.operands[1]} = ?`,
      operation: easier,
      answer: { type: "number", value: easier.operands[0] * easier.operands[1] },
      steps: workedSteps(easier),
    },
  };
}

const APPLES_STORY = mulPkg(
  "There are 3 bags with 4 apples in each bag. How many apples are there in all?",
  [3, 4],
  { id: "mul-bags-apples", workbook: true },
);

const JARS_REVERSED_STORY = mulPkg(
  "Each jar has 4 toy cars. Amara has 3 of them. How many toy cars in all?",
  [4, 3],
  { id: "mul-jars-reversed", workbook: true },
);

const PLAIN_3X4 = mulPkg("3 × 4 = ?", [3, 4], { id: "mul-3-4", workbook: true });
const PLAIN_4X3 = mulPkg("4 × 3 = ?", [4, 3], { id: "mul-4-3", workbook: true });
const PLAIN_3X2 = mulPkg("3 × 2 = ?", [3, 2], { id: "mul-3-2", workbook: true });
const AREA_3X4 = mulPkg("3 × 4 = ?", [3, 4], { id: "mul-area-3-4", unit: "cm²", workbook: true });

function startInput(pkg: OperationPackage, overrides: Partial<StartInput> = {}): StartInput {
  return {
    kind: "chat",
    parentId,
    childId,
    childName: null,
    startedBy: parentId,
    package: pkg,
    ...overrides,
  };
}

function setup(overrides: Partial<CallSeams> = {}) {
  let id = 0;
  const store = memoryCallStore({ clock, testFamilies: [parentId] });
  const answer = vi.fn(() => reply("How many equal groups are there?", "guide"));
  const review = vi.fn(() => fakeTalkReviewer());
  const seams: CallSeams = {
    checkedExchange: true,
    tutorFamilies: true,
    store,
    connections: memoryConnectionLog(store, clock),
    history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] })),
    rebuild: async () => true,
    model: () => conversationalFake({ answer }),
    reviewer: review,
    isTestFamily: async () => true,
    canChat: async () => true,
    canCallVoice: async () => true,
    alerts: { send: async () => {}, list: async () => [] },
    clock,
    seed: () => 42,
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    ...overrides,
  };
  return { calls: mayaCalls(seams), answer, store, events: seams.events };
}

const byKey = <T extends { key: string }>(events: T[]) => [...events].sort((a, b) => a.key.localeCompare(b.key));

function ok(result: CallResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

function applyAll(batches: readonly Batch[]) {
  let scene = createScene();
  for (const batch of batches) {
    const applied = applyBatch(scene, batch);
    if (!applied.ok) throw new Error(applied.refusal.reason);
    scene = applied.scene;
  }
  return scene;
}

describe("multiplication lesson map and context extraction", () => {
  it("exposes a reviewed lesson map with prerequisites, common mistakes, examples, fading and transfer", () => {
    expect(MULTIPLY_LESSON_MAP.prerequisites).toEqual(["equal_groups", "repeated_addition"]);
    expect(MULTIPLY_LESSON_MAP.commonMistakes).toEqual([
      "additive_error",
      "swapped_factors",
      "off_by_one_group",
      "wrong_unit",
    ]);
    expect(MULTIPLY_LESSON_MAP.examples).toEqual({
      worked: "separate_small_array",
      partial: "partial_array_child_adds_equal_groups",
    });
    expect(MULTIPLY_LESSON_MAP.visualFading).toEqual(["full", "partial", "faded"]);
    expect(MULTIPLY_LESSON_MAP.transferTask).toBe("independent_related_product_cleared_board");
  });

  it("extracts group count and group size in context regardless of operand order, and fails closed on unsupported stories", () => {
    expect(multiplyContext(APPLES_STORY)).toEqual({
      groups: 3, size: 4, contextual: true, groupNoun: "bags", groupSingular: "bag", itemNoun: "apples", unit: null,
    });
    // Operands are [4, 3], but context clearly has 3 jars with 4 toy cars in each jar.
    expect(multiplyContext(JARS_REVERSED_STORY)).toEqual({
      groups: 3, size: 4, contextual: true, groupNoun: "jars", groupSingular: "jar", itemNoun: "toy cars", unit: null,
    });
    expect(multiplyContext(AREA_3X4)).toMatchObject({ groups: 3, size: 4, unit: "cm²" });
    expect(supportsCheckedMultiply(PLAIN_3X4)).toBe(true);
    // Out of array bounds or division/unrelated stories stay on the existing path.
    expect(supportsCheckedMultiply(mulPkg("12 × 4 = ?", [12, 4]))).toBe(false);
    expect(supportsCheckedMultiply(mulPkg("Sam shares 12 apples equally with 3 friends. How many does each get?", [3, 4]))).toBe(false);
  });
});

describe("child group actions and context protection", () => {
  it("updates checked state, array board, and explanation as the child adds equal groups in chat and keeps retries idempotent", async () => {
    const { calls, answer, store } = setup();
    const chat = ok(await calls.start(startInput(APPLES_STORY)));
    const prompt = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "How do I build the groups?" }, null));

    const t1 = prompt.view.exchange!;
    expect(t1).toMatchObject({ objectId: GROUPS_OBJECT, groupSize: 4, nextGroups: 2 });
    expect(prompt.output.say.join(" ")).toMatch(/3 equal bags of 4 apples.*1 bag of 4/i);
    expect(prompt.output.say.join(" ")).not.toMatch(/\b12\b|twelve/i);

    // Rejects swapped groupSize (3 instead of 4) or stale/unshown target.
    const shown1 = [{ batchId: t1.batchId, fate: "shown" as const }];
    expect((await calls.input(chat.view.id, prompt.view.revision, { type: "exchange", target: t1 }, null)).ok).toBe(false);
    expect((await calls.input(chat.view.id, prompt.view.revision, {
      type: "exchange", target: { ...t1, groupSize: 3 }, fates: shown1,
    }, null)).ok).toBe(false);

    // Group action 1: 1 bag -> 2 bags of 4.
    const step1 = ok(await calls.input(chat.view.id, prompt.view.revision, { type: "exchange", target: t1, fates: shown1 }, null));
    expect(step1.output.say.join(" ")).toMatch(/2 bags of 4: 4 \+ 4 = 8.*Add 1 more group of 4 to reach 3 bags/i);
    expect(step1.output.say.join(" ")).not.toMatch(/\b12\b|twelve/i);
    const t2 = step1.view.exchange!;
    expect(t2).toMatchObject({ objectId: GROUPS_OBJECT, groupSize: 4, nextGroups: 3 });
    expect(t2.turnId).not.toBe(t1.turnId);

    // Duplicate delivery of action 1 is idempotent.
    const retry1 = ok(await calls.input(chat.view.id, prompt.view.revision, { type: "exchange", target: t1, fates: shown1 }, null));
    expect(retry1.output.say).toEqual([]);
    expect(retry1.view.batches).toEqual(step1.view.batches);

    // Group action 2: 2 bags -> 3 bags of 4, connecting visual array to written notation.
    const shown2 = [{ batchId: t2.batchId, fate: "shown" as const }];
    const step2 = ok(await calls.input(chat.view.id, step1.view.revision, { type: "exchange", target: t2, fates: shown2 }, null));
    expect(step2.output.say.join(" ")).toMatch(/3 bags of 4 apples, shown as 3 rows of 4.*4 \+ 4 \+ 4 and 3 times 4.*How many apples/i);
    expect(step2.output.say.join(" ")).not.toMatch(/\b12\b|twelve/i);
    expect(step2.view.exchange).toBeUndefined();

    // Verify the final board scene holds the checked 3x4 array and notation "3 × 4 = ?".
    const scene = applyAll(step2.view.batches);
    const whole = boardTargets(scene).find((t) => t.target.objectId === GROUPS_OBJECT && t.target.part === "whole");
    expect(whole?.label).toContain("3 rows of 4");
    expect(step2.view.batches.at(-1)?.commands).toContainEqual(expect.objectContaining({ op: "write", text: "3 × 4 = ?" }));

    const solved = ok(await calls.input(chat.view.id, step2.view.revision, {
      type: "child", text: "12 apples.", fates: [{ batchId: step2.view.batches.at(-1)!.transactionId, fate: "shown" }],
    }, null));
    expect(solved.output.say.join(" ")).toMatch(/you found the product/i);
    await calls.input(chat.view.id, solved.view.revision, { type: "end" }, null);

    const trace = store.rows()[0].trace!;
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.checkedMultiply?.builtGroups).toBe(3);
    expect(trace.checkedMultiply?.turns.filter((t) => t.observation?.skill === "build_group")).toHaveLength(2);
    expect(answer).not.toHaveBeenCalled();
  });

  it("does not ask for the Add button when an off-by-one or additive mistake happens after all rows are built", async () => {
    const { calls } = setup();
    let turn = ok(await calls.start(startInput(PLAIN_3X4)));
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "How do I build the groups?" }, null));
    const t1 = turn.view.exchange!;
    turn = ok(await calls.input(turn.view.id, turn.view.revision, {
      type: "exchange", target: t1, fates: [{ batchId: t1.batchId, fate: "shown" }],
    }, null));
    const t2 = turn.view.exchange!;
    turn = ok(await calls.input(turn.view.id, turn.view.revision, {
      type: "exchange", target: t2, fates: [{ batchId: t2.batchId, fate: "shown" }],
    }, null));
    expect(turn.view.exchange).toBeUndefined();

    const offByOne = ok(await calls.input(turn.view.id, turn.view.revision, {
      type: "child", text: "8.", fates: [{ batchId: turn.view.batches.at(-1)!.transactionId, fate: "shown" }],
    }, null));
    expect(offByOne.view.exchange).toBeUndefined();
    expect(offByOne.output.say.join(" ")).not.toMatch(/add 1 group|button/i);
    expect(offByOne.output.say.join(" ")).toMatch(/count all 3 rows of 4/i);
    expect(offByOne.output.say.join(" ")).not.toMatch(/\b12\b|twelve/i);

    const additive = ok(await calls.input(turn.view.id, offByOne.view.revision, { type: "child", text: "7." }, null));
    expect(additive.view.exchange).toBeUndefined();
    expect(additive.output.say.join(" ")).not.toMatch(/add 1 group|button/i);
    expect(additive.output.say.join(" ")).toMatch(/count all 3 rows of 4/i);
  });

  it("treats help requests like 'I don't know how to multiply.' as needing help, not repeated-addition mastery", async () => {
    const { calls, store } = setup();
    let turn = ok(await calls.start(startInput(APPLES_STORY)));
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "I don't know how to start." }, null));
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "3 bags and 4 apples in each." }, null));
    const help = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "I don't know how to multiply." }, null));
    expect(help.view.exchange).toMatchObject({ objectId: GROUPS_OBJECT, groupSize: 4, nextGroups: 2 });
    expect(help.output.say.join(" ")).toMatch(/build 3 equal bags of 4 apples/i);
    await calls.input(turn.view.id, help.view.revision, { type: "end" }, null);
    const trace = store.rows()[0].trace!;
    expect(trace.checkedMultiply?.turns.some((t) => t.observation?.skill === "repeated_addition")).toBe(false);
    expect(trace.checkedMultiply?.turns.at(-1)?.instruction.step).toBe("guide_groups");
  });

  it("does not silently interchange group count and group size in context, even when the product matches", async () => {
    const { calls, store, answer } = setup();
    const chat = ok(await calls.start(startInput(APPLES_STORY)));
    const swapped = ok(await calls.input(chat.view.id, chat.view.revision, {
      type: "child", text: "My answer is 12 because there are 4 bags of 3 apples.",
    }, null));
    expect(swapped.output.say.join(" ")).toMatch(/swaps.*3 bags with 4 apples in each bag, not 4 bags of 3/i);
    expect(swapped.view.exchange).toMatchObject({ objectId: GROUPS_OBJECT, groupSize: 4, nextGroups: 2 });
    const ended = ok(await calls.input(chat.view.id, swapped.view.revision, { type: "end" }, null));
    expect(ended.view.outcome?.reason).toBe("child_stopped");
    expect(store.rows()[0].trace?.checkedMultiply?.turns.some((t) => t.observation?.skill === "swapped_factors")).toBe(true);
    expect(store.rows()[0].trace?.checkedMultiply?.turns.some((t) => t.observation?.skill === "product")).toBe(false);
    expect(answer).not.toHaveBeenCalled();
  });

  it("diagnoses additive and off-by-one-group mistakes and starts 4x3 with a partial array of 2 rows", async () => {
    const { calls, store } = setup();
    let turn = ok(await calls.start(startInput(PLAIN_4X3)));
    const say = async (text: string) => {
      turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
      return turn.output.say.join(" ");
    };
    expect(await say("7.")).toMatch(/adding puts 4 and 3 together once.*4 groups of 3/i);
    expect(turn.view.exchange).toMatchObject({ objectId: GROUPS_OBJECT, groupSize: 3, nextGroups: 3 });
    expect(turn.view.batches.at(-1)?.commands).toContainEqual(expect.objectContaining({
      op: "model", id: GROUPS_OBJECT, model: { kind: "array", rows: 2, columns: 3 },
    }));
    expect(turn.view.batches.at(-1)?.commands).toContainEqual(expect.objectContaining({ op: "write", text: "3 + 3 = 6" }));

    const shown = [{ batchId: turn.view.exchange!.batchId, fate: "shown" as const }];
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "9.", fates: shown }, null));
    expect(turn.output.say.join(" ")).toMatch(/check how many equal groups of 3/i);
    await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
    const skills = store.rows()[0].trace?.checkedMultiply?.turns.map((t) => t.observation?.skill).filter(Boolean);
    expect(skills).toEqual(["additive_error", "off_by_one_group"]);
  });

  it("uses a safe separate worked example that never leaks the target product (3 x 2 = 6 skips 2 x 3)", async () => {
    const { calls, store } = setup();
    const chat = ok(await calls.start(startInput(PLAIN_3X2)));
    const worked = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "Show me an example." }, null));
    expect(worked.output.say.join(" ")).toMatch(/separate example: 2 groups of 4.*4 \+ 4 = 8/i);
    expect(worked.output.say.join(" ")).not.toMatch(/\b6\b|six/i);
    const batches = worked.view.batches.slice(-worked.output.newBatches);
    expect(batches).toHaveLength(2);
    expect(batches[1].after).toEqual([batches[0].transactionId]);
    applyAll(worked.view.batches);
    await calls.input(chat.view.id, worked.view.revision, { type: "end" }, null);
    expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  });
});

describe("visual fading, assistance recording, and checked transfer in chat and voice", () => {
  it("fades visual support to zero array batches when a learner demonstrates understanding of equal groups", async () => {
    const { calls, store, answer } = setup();
    let turn = ok(await calls.start(startInput(APPLES_STORY)));
    const say = async (text: string) => {
      turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
      return turn.output.say.join(" ");
    };
    expect(await say("I don't know how to start.")).toMatch(/how many bags.*how many apples/i);
    expect(turn.output.newBatches).toBe(0);
    expect(await say("3 bags and 4 apples in each.")).toMatch(/how can you find the total/i);
    expect(turn.output.newBatches).toBe(0);
    expect(await say("Add 4 three times.")).toMatch(/try finding the total apples.*on your own/i);
    expect(turn.output.newBatches).toBe(0);
    expect(turn.view.exchange).toBeUndefined();
    expect(await say("12 apples.")).toMatch(/you found the product.*one more like this/i);
    await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "No thanks." }, null);
    const trace = store.rows()[0].trace!;
    expect(trace.checkedMultiply?.visualSupport).toBe("faded");
    expect(trace.board.filter((b) => b.commands.some((c) => (c as { op?: string }).op === "model"))).toHaveLength(0);
    expect(trace.outcome).toMatchObject({ reason: "solved", assistance: "independent" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(answer).not.toHaveBeenCalled();
  });

  it("fades visual support on transfer and records separate transfer learning events and parent notes", async () => {
    const { calls, events, store } = setup();
    let turn = ok(await calls.start(startInput(PLAIN_3X4)));
    const say = async (text: string) => {
      turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
      return turn.output.say.join(" ");
    };
    // Solve original with guided array, then accept faded transfer.
    await say("How do I build the groups?");
    const t1 = turn.view.exchange!;
    turn = ok(await calls.input(turn.view.id, turn.view.revision, {
      type: "exchange", target: t1, fates: [{ batchId: t1.batchId, fate: "shown" }],
    }, null));
    expect(await say("12.")).toMatch(/one more like this/i);
    const started = await say("Yes.");
    expect(started).toMatch(/4 times 6/i);
    expect(started).not.toMatch(/\b24\b|twenty.four/i);
    // Transfer clears Maya's visual array and writes only the equation.
    const tBatch = turn.view.batches.at(-1)!;
    expect(tBatch.commands).toEqual([
      { op: "clear", scope: "maya_objects" },
      expect.objectContaining({ op: "write", text: "4 × 6 = ?" }),
    ]);
    expect(await say("Show me how.")).toMatch(/4 rows of 6: 3 rows make 18/i);
    const closed = await say("24.");
    expect(closed).toMatch(/you found the product.*bye for now/i);
    expect(turn.view.outcome).toMatchObject({
      reason: "solved",
      assistance: "guided",
      transfer: { result: "right", assistance: "demonstrated" },
    });
    await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);

    const recorded = byKey(await events.read(childId, { from: "2026-11-20T00:00:00Z", to: "2026-11-21T00:00:00Z" }));
    expect(recorded).toMatchObject([
      { key: `call:${turn.view.id}`, result: "right_with_help", question: PLAIN_3X4.ref },
      {
        key: `call:${turn.view.id}:transfer`,
        result: "right_with_help",
        assistance: "demonstrated",
        question: { source: "transfer", relatedEventId: recorded[0].id, text: "4 × 6 = ?" },
      },
    ]);
    const note = codeSentences(noteFacts({
      outcome: turn.view.outcome!,
      event: recorded[0],
      package: PLAIN_3X4,
      question: PLAIN_3X4.ref,
    })).join(" ");
    expect(note).toContain("Then Maya showed the groups again, and {child} got a related question right.");
    expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  });

  it("supports voice group actions, interrupts playback, restores unconfirmed batches, and records uncertain voice help", async () => {
    const { calls, events, store } = setup();
    const voice = ok(await calls.startVoice(startInput(APPLES_STORY, { kind: "family" })));
    const open = async () => {
      const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
      if (!opened.ok) throw Error(opened.error);
      return opened.call;
    };
    const observe = (b: Batch) => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] });

    const call = await open();
    const opening = (await call.start()).boardCues![0].batch;
    const prompt = await call.child("How do I build the groups?");
    const show = prompt.boardCues![0].batch;
    const target = (await calls.view(voice.view.id))!.exchange!;
    expect(target).toMatchObject({ objectId: GROUPS_OBJECT, groupSize: 4, nextGroups: 2 });

    // Refused before board confirms show batch.
    expect(await call.exchange!(target)).toBeNull();
    await call.observeBoard({ events: [opening, show].map(observe) });
    const added = (await call.exchange!(target))!;
    const addBatch = added.boardCues![0].batch;
    expect(added.say.join(" ")).toMatch(/2 bags of 4/i);
    // Duplicate voice action returns null.
    expect(await call.exchange!(target)).toBeNull();

    // Worker replacement before board confirms addBatch restores it as pendingExchange.
    const resumed = await open();
    expect(resumed.pendingExchange).toEqual(addBatch);
    await resumed.observeBoard({ events: [opening, show, addBatch].map(observe) });
    expect(resumed.pendingExchange).toBeUndefined();

    // Finish original, accept transfer, get interrupted voice hint -> uncertain transfer assistance.
    expect((await resumed.child("12 apples.")).say.join(" ")).toMatch(/one more like this/i);
    const tStart = await resumed.child("Yes.");
    expect(tStart.say.join(" ")).toMatch(/4 times 6/i);
    const tHint = await resumed.child("I don't know.");
    await resumed.exchangePlayback!(tHint.exchangeTurnId!, "interrupted");
    const tDone = await resumed.child("24.");
    expect(tDone.ended).toBe(true);
    await resumed.end({ reason: "child_stopped" });

    const record = store.rows()[0];
    expect(record.outcome).toMatchObject({
      reason: "solved",
      assistance: "guided",
      transfer: { result: "right", assistance: "uncertain" },
    });
    const learned = byKey(await events.read(childId, { from: "2026-11-20T00:00:00Z", to: "2026-11-21T00:00:00Z" }));
    expect(learned).toMatchObject([
      { result: "right_with_help" },
      { result: "right_with_help", assistance: "uncertain", question: { source: "transfer" } },
    ]);
    expect(checkTrace(record.trace)).toMatchObject({ ok: true });
  });
});

describe("units, answer restrictions, cancellation, and #1088 regressions", () => {
  it("preserves contextual and area units: refuses wrong units without leaking the answer and accepts right units", async () => {
    const { calls } = setup();
    // Contextual: "12 bags" is wrong unit when question asks for apples.
    let c1 = ok(await calls.start(startInput(APPLES_STORY)));
    c1 = ok(await calls.input(c1.view.id, c1.view.revision, { type: "child", text: "12 bags." }, null));
    expect(c1.output.say.join(" ")).toMatch(/check the unit.*apples/i);
    expect(c1.output.say.join(" ")).not.toMatch(/\b12\b|twelve/i);
    c1 = ok(await calls.input(c1.view.id, c1.view.revision, { type: "child", text: "12 apples." }, null));
    expect(c1.output.say.join(" ")).toMatch(/you found the product/i);

    // Area: "12 cm" and "12 m²." are wrong units for cm²; a question is not credited; "12 square centimetres." and "12 cm²." are accepted.
    let c2 = ok(await calls.start(startInput(AREA_3X4)));
    c2 = ok(await calls.input(c2.view.id, c2.view.revision, { type: "child", text: "12 cm." }, null));
    expect(c2.output.say.join(" ")).toMatch(/check the unit.*square centimetres/i);
    expect(c2.output.say.join(" ")).not.toMatch(/\b12\b|twelve/i);
    c2 = ok(await calls.input(c2.view.id, c2.view.revision, { type: "child", text: "12 m²." }, null));
    expect(c2.output.say.join(" ")).toMatch(/check the unit.*square centimetres/i);
    c2 = ok(await calls.input(c2.view.id, c2.view.revision, { type: "child", text: "Is it 12 square centimetres?" }, null));
    expect(c2.output.say.join(" ")).not.toMatch(/you found the product/i);
    c2 = ok(await calls.input(c2.view.id, c2.view.revision, { type: "child", text: "12 square centimetres." }, null));
    expect(c2.output.say.join(" ")).toMatch(/you found the product/i);

    let c3 = ok(await calls.start(startInput(AREA_3X4)));
    c3 = ok(await calls.input(c3.view.id, c3.view.revision, { type: "child", text: "12 cm²." }, null));
    expect(c3.output.say.join(" ")).toMatch(/you found the product/i);
  });

  it("does not hold a stop request behind checked board acknowledgement in voice", async () => {
    const { calls } = setup();
    const voice = ok(await calls.startVoice(startInput(PLAIN_3X4, { kind: "family" })));
    const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    const { call } = opened;
    await call.start();
    await call.child("Show me an example.");
    const waiting = Promise.withResolvers<void>();
    const observed = Promise.withResolvers<void>();
    const retry = call.child("Show me an example.", undefined, {
      checkedBoardSettled: () => { waiting.resolve(); return observed.promise; },
    });
    try {
      await waiting.promise;
      expect((await call.child("I want to stop now.")).ended).toBe(true);
      expect((await retry).boardCues ?? []).toEqual([]);
    } finally { observed.resolve(); }
  });

  it("passes #1088 true sentences through the public Maya call boundary without code false-refusal", async () => {
    const op: Operation = { kind: "divide", operands: [1340, 2] };
    const easier: Operation = { kind: "divide", operands: [8, 2] };
    const dividePkg: OperationPackage = {
      id: "div-1340-2",
      ref: { source: "workbook", workbookId: "sample", page: 1, question: 1 },
      templateId: null,
      text: "2 × ? = 1340",
      answer: { value: { type: "number", value: 670 }, accepted: [], unit: null },
      operation: op,
      steps: workedSteps(op),
      skill: { standard: "4.8", skills: ["4.8-division-facts"] },
      level: 14,
      difficulty: 2,
      wrongAnswers: [{ value: { type: "number", value: 671 }, cause: "careless", description: "One more than the answer.", step: null }],
      easierExample: { text: "8 ÷ 2 = ?", operation: easier, answer: { type: "number", value: 4 }, steps: workedSteps(easier) },
    };
    for (const sentence of [
      "It is not true that 2 goes into 13 6 times with 2 left over.",
      "Half of 1340 is 670.",
      "Double 670 is 1340.",
    ]) {
      const math = fakeMathReviewer();
      const { calls } = setup({
        checkedExchange: false,
        model: () => conversationalFake({ answer: () => reply(sentence, "guide") }),
        mathReviewer: () => math,
      });
      const chat = ok(await calls.start(startInput(dividePkg)));
      const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "Can you explain?" }, null));
      expect(turn.output.say.join(" "), sentence).toBe(sentence);
      expect(math.requests.map((r) => r.sentence), sentence).toContain(sentence);
    }
  });
});

async function buildAll(calls: ReturnType<typeof setup>["calls"], pkg: OperationPackage) {
  const started = await calls.start(startInput(pkg));
  if (!started.ok) throw new Error(`${pkg.text}: ${started.error}`);
  let turn = started;
  turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "How do I build the groups?" }, null));
  const offered = turn.view.exchange;
  for (let i = 0; i < 10 && turn.view.exchange; i++) {
    const target = turn.view.exchange;
    turn = ok(await calls.input(turn.view.id, turn.view.revision, {
      type: "exchange", target, fates: [{ batchId: target.batchId, fate: "shown" }],
    }, null));
  }
  return { turn, offered };
}

describe("every eligible array fits the board", () => {
  it("offers the group action and completes the array for every factor pair from 2 to 10 in chat", async () => {
    const failed: string[] = [];
    for (let g = 2; g <= 10; g++) {
      for (let s = 2; s <= 10; s++) {
        const { calls } = setup();
        const built = await buildAll(calls, mulPkg(`${g} × ${s} = ?`, [g, s], { workbook: true })).catch((e: Error) => e);
        if (built instanceof Error) { failed.push(built.message); continue; }
        const { turn, offered } = built;
        const scene = (() => { try { return applyAll(turn.view.batches); } catch { return null; } })();
        const whole = scene && boardTargets(scene).find((t) => t.target.objectId === GROUPS_OBJECT && t.target.part === "whole");
        if (!offered || turn.view.exchange || !whole?.label.includes(`${g} rows of ${s}`)) failed.push(`${g}x${s}`);
      }
    }
    expect(failed).toEqual([]);
  });
});

describe("stories with an unclear container count", () => {
  it("reads the group count only from the same container or an unambiguous reference", () => {
    expect(supportsCheckedMultiply(mulPkg("Each box has 4 books. There are 3 bags. How many books are there?", [4, 3]))).toBe(false);
    expect(supportsCheckedMultiply(mulPkg("Sam puts 4 muffins on each tray. There are 3 plates. How many muffins are there?", [4, 3]))).toBe(false);
    expect(multiplyContext(mulPkg("Each box has 4 books. There are 3 boxes. How many books are there?", [4, 3])))
      .toMatchObject({ groups: 3, size: 4, groupNoun: "boxes", itemNoun: "books" });
    expect(multiplyContext(mulPkg("Sam puts 4 muffins on each tray. He fills 3 trays. How many muffins are there?", [4, 3])))
      .toMatchObject({ groups: 3, size: 4, groupNoun: "trays" });
    expect(multiplyContext(JARS_REVERSED_STORY)).toMatchObject({ groups: 3, size: 4 });
  });
});

describe("explanations, prerequisite checks and answers with units", () => {
  it("does not credit a right product whose explanation states the wrong group size", async () => {
    const { calls, store } = setup();
    let turn = ok(await calls.start(startInput(APPLES_STORY)));
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "12 apples because each bag has 3 apples." }, null));
    expect(turn.output.say.join(" ")).not.toMatch(/you found the product/i);
    expect(turn.view.outcome).toBeNull();
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "12 apples because there are 3 bags with 4 apples in each." }, null));
    expect(turn.output.say.join(" ")).toMatch(/you found the product/i);
    await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
    const observations = store.rows()[0].trace!.checkedMultiply!.turns.flatMap((t) => t.observation ? [t.observation] : []);
    expect(observations.map((o) => [o.skill, o.result])).toEqual([["swapped_factors", "incorrect"], ["product", "correct"]]);
  });

  it("refuses negated group statements and skip counting by the wrong number in the prerequisite checks", async () => {
    const { calls, store } = setup();
    let turn = ok(await calls.start(startInput(APPLES_STORY)));
    const say = async (text: string) => {
      turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
      return turn.output.say.join(" ");
    };
    await say("I don't know how to start.");
    expect(await say("There are not 3 bags of 4.")).not.toMatch(/how can you find the total/i);
    expect(await say("3 bags of 4 apples.")).toMatch(/how can you find the total/i);
    expect(await say("Skip count by 9.")).not.toMatch(/on your own/i);
    expect(await say("Skip count 9, 18, 27.")).not.toMatch(/on your own/i);
    expect(await say("Skip count by 4.")).toMatch(/on your own/i);
    await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
    const skills = store.rows()[0].trace!.checkedMultiply!.turns.flatMap((t) => t.observation ? [t.observation.skill] : []);
    expect(skills).toEqual(["equal_groups", "repeated_addition"]);
  });

  it("accepts every written form of the area unit and asks for the unit when the number is said in words", async () => {
    for (const text of ["12 cm2.", "12 sq cm.", "12cm².", "12 square centimeters.", "Twelve square centimetres.", "I got 12cm2 because I counted 3 groups of 4."]) {
      const { calls } = setup();
      const chat = ok(await calls.start(startInput(AREA_3X4)));
      const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text }, null));
      expect(turn.output.say.join(" "), text).toMatch(/you found the product/i);
    }
    const { calls } = setup();
    const chat = ok(await calls.start(startInput(AREA_3X4)));
    const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "Twelve centimetres." }, null));
    expect(turn.output.say.join(" ")).toMatch(/check the unit.*square centimetres/i);
  });

  it.each(["I got 11 because I first counted 12 cm2.", "12 cm2, no, 11 cm2."])(
    "does not credit an area number outside the committed answer: %s", async (text) => {
      const { calls } = setup();
      const chat = ok(await calls.start(startInput(AREA_3X4)));
      const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text }, null));
      expect(turn.output.say.join(" ")).not.toMatch(/you found the product/i);
    },
  );
});

describe("help records and the related question's board", () => {
  it.each([
    { reply: "7.", assistance: "hinted", unconfirmed: undefined },
    { reply: "Show me an example.", assistance: "uncertain", unconfirmed: true },
  ])("records interrupted help after a confirmed hint: $reply", async ({ reply, assistance, unconfirmed }) => {
    const { calls, store } = setup();
    const voice = ok(await calls.startVoice(startInput(PLAIN_3X4, { kind: "family" })));
    const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    const { call } = opened;
    const observe = (b: Batch) => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] });
    const opening = (await call.start()).boardCues![0].batch;
    const prompt = await call.child("How do I build the groups?");
    await call.exchangePlayback!(prompt.exchangeTurnId!, "finished");
    await call.observeBoard({ events: [opening, prompt.boardCues![0].batch].map(observe) });
    const moreHelp = await call.child(reply);
    await call.exchangePlayback!(moreHelp.exchangeTurnId!, "interrupted");
    await call.child("12.");
    await call.end({ reason: "child_stopped" });
    const record = store.rows()[0];
    const product = record.trace!.checkedMultiply!.turns.find((t) => t.observation?.skill === "product")!.observation!;
    expect(record.outcome).toMatchObject({ assistance: "hint" });
    expect(record.outcome?.helpUnconfirmed).toBe(unconfirmed);
    expect(product.assistance).toBe(assistance);
  });

  it("never picks a related question whose product is still written on the board", async () => {
    const { calls } = setup();
    const six = mulPkg("6 × 6 = ?", [6, 6], { workbook: true });
    let turn = ok(await calls.start(startInput(six)));
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "How do I build the groups?" }, null));
    const written = turn.view.batches.flatMap((b) => b.commands.flatMap((c) => (c as { op?: string; text?: string }).op === "write" ? [(c as { text: string }).text] : []));
    expect(written).toContain("6 + 6 + 6 + 6 = 24");
    turn = ok(await calls.input(turn.view.id, turn.view.revision, {
      type: "child", text: "36.", fates: [{ batchId: turn.view.exchange!.batchId, fate: "shown" }],
    }, null));
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "Yes." }, null));
    const question = turn.view.batches.at(-1)!.commands.find((c) => (c as { id?: string }).id === "transfer-question") as { text: string };
    const [a, b] = question.text.match(/\d+/g)!.map(Number);
    expect(written.join(" ")).not.toMatch(new RegExp(`\\b${a * b}\\b`));
  });

  it("gives independent credit for the related question only after the screen confirms the old board was cleared", async () => {
    for (const fate of ["cancelled", "shown"] as const) {
      const { calls } = setup();
      let turn = ok(await calls.start(startInput(PLAIN_3X4)));
      turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "12." }, null));
      turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "Yes." }, null));
      const question = turn.view.batches.at(-1)!;
      turn = ok(await calls.input(turn.view.id, turn.view.revision, {
        type: "child", text: "24.", fates: [{ batchId: question.transactionId, fate }],
      }, null));
      expect(turn.view.outcome?.transfer, fate).toEqual({ result: "right", assistance: fate === "shown" ? "independent" : "uncertain" });
    }
  });
});

describe("worked examples, repeats and paper work", () => {
  it("clears the solved example before independent work and repeats the example when asked", async () => {
    const { calls } = setup();
    let turn = ok(await calls.start(startInput(PLAIN_3X2)));
    const say = async (text: string, fates?: { batchId: string; fate: "shown" }[]) => {
      turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text, ...(fates ? { fates } : {}) }, null));
      return turn.output.say.join(" ");
    };
    const example = await say("Show me an example.");
    const shown = turn.view.batches.slice(-2).map((b) => ({ batchId: b.transactionId, fate: "shown" as const }));
    const repeated = await say("Can you repeat that?", shown);
    expect(repeated).toMatch(/2 equal rows of 4: 4 \+ 4 = 8/i);
    expect(example).toContain(repeated);
    expect(turn.output.newBatches).toBe(0);
    expect(await say("3 groups of 2.")).toMatch(/how can you find the total/i);
    expect(await say("Add 2 three times.")).toMatch(/on your own/i);
    const scene = applyAll(turn.view.batches);
    expect(boardTargets(scene).some((t) => t.target.objectId === GROUPS_OBJECT)).toBe(false);
  });

  it("offers paper as well as the button and accepts a report of correctly drawn groups", async () => {
    const { calls, store } = setup();
    let turn = ok(await calls.start(startInput(APPLES_STORY)));
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "How do I build the groups?" }, null));
    expect(turn.output.say.join(" ")).toMatch(/button on the board, or draw all 3 bags of 4 on your paper/i);
    turn = ok(await calls.input(turn.view.id, turn.view.revision, {
      type: "child", text: "I drew 3 bags of 4 apples.", fates: [{ batchId: turn.view.exchange!.batchId, fate: "shown" }],
    }, null));
    expect(turn.output.say.join(" ")).toMatch(/you drew 3 bags of 4 apples.*4 \+ 4 \+ 4 and 3 times 4.*how many apples/i);
    expect(turn.output.say.join(" ")).not.toMatch(/\b12\b|twelve/i);
    await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
    expect(store.rows()[0].trace!.checkedMultiply!.turns.at(-1)?.observation?.skill).toBe("build_group");
  });
});

describe("saved lesson records", () => {
  it("refuses a trace whose multiplication lesson record is malformed and replays such a board without throwing", async () => {
    const { calls, store } = setup();
    const { turn } = await buildAll(calls, PLAIN_3X4);
    await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
    const trace = store.rows()[0].trace!;
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    const lesson = trace.checkedMultiply!;
    const broken: unknown[] = [
      { anything: true },
      { ...lesson, turns: "none" },
      { ...lesson, turns: [{ ...lesson.turns[0], actions: [{ kind: "explode", batchId: "x" }] }] },
      { ...lesson, turns: lesson.turns.map((t, i) => i === 1 ? { ...t, actions: t.actions.map((a) => ({ ...a, after: "missing-batch" })) } : t) },
    ];
    for (const checkedMultiply of broken) {
      expect(checkTrace({ ...trace, checkedMultiply }), JSON.stringify(checkedMultiply).slice(0, 80)).toMatchObject({ ok: false });
      expect(() => boardHistoryOf({ ...trace, checkedMultiply } as never)).not.toThrow();
    }
  });
});
