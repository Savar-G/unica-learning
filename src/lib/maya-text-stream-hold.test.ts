import { afterEach, expect, it, vi } from "vitest";
import { createTextSession, type SavedTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";

const TRADE = "We trade 1 ten for 10 ones.";
const SECOND = "12 minus 8 is 4.";
const CHILD = "I don't get 2 minus 8.";
const deferred = () => Promise.withResolvers<void>();
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(["safety", "identity", "stop", "repeated"] as const)("late %s cancels unsent words, drawings and help before final output and recovery", async (kind) => {
  // Falsifier: either queued sentence reaches the listener, or an unsent part survives in the reconciled record.
  const entered = deferred(), releaseSave = deferred(), finishModel = deferred(), rawHeld = deferred();
  const reading = kind === "safety" ? { safety: "concern" as const } : kind === "identity" ? { aboutMaya: "identity" as const } : kind === "stop" ? { stop: true } : {};
  const proposal = reply(`${TRADE} ${SECOND}`, "guide", { gate: "none", reading });
  const whole = JSON.stringify(proposal);
  const prefix = whole.slice(0, whole.indexOf(',"act"'));
  const model = conversationalFake({ answer: () => reply("What is 4 minus 2?", "guide") });
  const ordinary = model.propose.bind(model);
  let requests = 0;
  model.propose = async (...args) => {
    if (++requests > 1) return ordinary(...args);
    const onText = args[2];
    onText?.(prefix);
    await entered.promise;
    onText?.(kind === "repeated" ? whole.slice(0, -1) + ',"noDraw":[1]}' : whole);
    rawHeld.resolve();
    await finishModel.promise;
    return proposal;
  };
  const heard: string[] = [], snapshots: SavedTextSession[] = [];
  const session = createTextSession({
    callId: "late-hold", package: SAMPLE_PACKAGES["subtract-52-28"], model, clock: () => 0,
    tutor: true, channel: "chat", grade: 3, random: 42,
    reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(),
    onSayPart: (text) => { heard.push(text); },
    persist: async () => {
      snapshots.push(await session.saved());
      if (snapshots.length === 1) { entered.resolve(); await releaseSave.promise; }
      return true;
    },
  });
  await session.start();
  const pending = session.child(CHILD);
  try {
    await rawHeld.promise;
    expect(heard).toEqual([]);
    releaseSave.resolve();
    await vi.waitFor(() => expect(snapshots.length).toBe(2));
    expect(heard).toEqual([]);
    expect(snapshots[1].log?.some((e) => e.kind === "part")).toBe(false);
    expect(snapshots[1].session.assistance).toEqual([]);
    expect(session.helpLedger()).toEqual([]);
    const idle = conversationalFake({ answer: () => { throw Error("recovery must not ask the model"); } });
    const restored = createTextSession({ callId: "late-hold", package: SAMPLE_PACKAGES["subtract-52-28"], model: idle, clock: () => 0, channel: "chat", resume: snapshots[1] });
    expect(restored.interrupted).toEqual({ text: CHILD });
    const output = await restored.settleInterrupted();
    expect(idle.briefs).toEqual([]);
    expect(output.say.join(" ")).not.toContain(TRADE);
    expect(output.say.join(" ")).not.toContain(SECOND);
    expect(output.board.some((b) => b.commands.some((c) => (c as { op?: string }).op === "regroup"))).toBe(false);
    if (kind === "safety") expect(output.say[0]).toMatch(/^Thank you for telling me\./);
    const trace = await restored.finish({ reason: "child_stopped" });
    expect(trace.turns.filter((t) => t.kind === "child")).toHaveLength(1);
    expect(trace.outcome?.assistance).not.toBe("guided");
    expect(trace.turns.flatMap((t) => t.kind === "maya" ? t.output?.say ?? [] : []).join(" ")).not.toContain(TRADE);
  } finally { releaseSave.resolve(); finishModel.resolve(); }
  const output = await pending;
  expect(output.say.join(" ")).not.toContain(TRADE);
  expect(output.say.join(" ")).not.toContain(SECOND);
  expect(session.session.assistance).not.toContain("guided");
  expect(session.session.assistance).not.toContain("answer_given");
  if (kind === "safety") expect(output.say[0]).toMatch(/^Thank you for telling me\./);
});

it("ordinary completion drains the saved queue", async () => {
  // Falsifier: using model completion as a hold loses either checked sentence or its one drawing.
  const heard: string[] = [];
  const entered = deferred(), release = deferred();
  const proposal = reply(`${TRADE} ${SECOND}`, "guide");
  const model = conversationalFake({ answer: () => proposal });
  model.propose = async (_input, _signal, onText) => {
    const whole = JSON.stringify(proposal);
    onText?.(whole.slice(0, whole.indexOf(',"act"')));
    await entered.promise;
    release.resolve();
    return proposal;
  };
  const session = createTextSession({
    callId: "ordinary-save", package: SAMPLE_PACKAGES["subtract-52-28"],
    model,
    clock: () => 0, tutor: true, channel: "chat", grade: 3, random: 42,
    reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(),
    onSayPart: (text) => { heard.push(text); }, persist: async () => { await session.saved(); entered.resolve(); await release.promise; return true; },
  });
  await session.start();
  const output = await session.child(CHILD);
  expect(heard).toEqual([TRADE, SECOND]);
  expect(output.say.join(" ")).toBe(`${TRADE} ${SECOND}`);
  expect(output.board.filter((b) => b.commands.some((c) => (c as { op?: string }).op === "regroup"))).toHaveLength(1);
});

it("a late hold preserves a delivered prefix and removes only the part still saving", async () => {
  // Falsifier: removing the unsent part erases the first sentence or its drawing/help, or keeps the second sentence.
  const entered = deferred(), release = deferred();
  const proposal = reply(`${TRADE} ${SECOND}`, "guide", { gate: "none", reading: { safety: "concern" } });
  const model = conversationalFake({ answer: () => proposal });
  model.propose = async (_input, _signal, onText) => {
    const whole = JSON.stringify(proposal);
    onText?.(whole.slice(0, whole.indexOf(',"act"')));
    await entered.promise;
    onText?.(whole);
    release.resolve();
    return proposal;
  };
  const heard: string[] = [], snapshots: SavedTextSession[] = [];
  const session = createTextSession({
    callId: "delivered-prefix", package: SAMPLE_PACKAGES["subtract-52-28"], model,
    clock: () => 0, tutor: true, channel: "chat", grade: 3, random: 42,
    reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(),
    onSayPart: (text) => { heard.push(text); },
    persist: async () => {
      snapshots.push(await session.saved());
      if (snapshots.length === 3) { entered.resolve(); await release.promise; }
      return true;
    },
  });
  await session.start();
  const output = await session.child(CHILD);
  expect(heard).toEqual([TRADE]);
  expect(output.say.join(" ")).toMatch(/^We trade 1 ten for 10 ones\. Thank you for telling me\./);
  expect(output.say.join(" ")).not.toContain(SECOND);
  expect(output.board.filter((b) => b.commands.some((c) => (c as { op?: string }).op === "regroup"))).toHaveLength(1);
  expect(snapshots[0].session.assistance).toEqual([]);
  const deliveredHelp = snapshots[1].session.assistance;
  expect(deliveredHelp.length).toBeGreaterThan(0);
  expect(session.helpLedger()).toEqual(deliveredHelp);
  const idle = conversationalFake({ answer: () => { throw Error("no replacement request"); } });
  const restored = createTextSession({ callId: "delivered-prefix", package: SAMPLE_PACKAGES["subtract-52-28"], model: idle, clock: () => 0, channel: "chat", resume: snapshots.at(-1) });
  const recovered = await restored.settleInterrupted();
  expect(idle.briefs).toEqual([]);
  expect(recovered.say.join(" ")).toMatch(/^We trade 1 ten for 10 ones\. Thank you for telling me\./);
  expect(recovered.say.join(" ")).not.toContain(SECOND);
  expect(restored.session.assistance).toEqual(deliveredHelp);
});
