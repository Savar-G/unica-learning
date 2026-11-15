// Part C of the pre-launch review of the tutor core (2026-11-15): what a family call saves as the learning event and
// the parent note. Each case runs a whole family call (desk chat, or the family voice call) through the call module.
import { describe, expect, it } from "vitest";
import { learningEvents, type LearningEvent } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import type { QuestionPackage } from "@/lib/question-package";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore } from "@/lib/maya-call-note-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "44444444-4444-4444-8444-444444444444";
const RANGE = { from: "2026-11-14", to: "2026-11-16" };
const SUBTRACT = SAMPLE_PACKAGES["subtract-52-28"];

/** One family call: the model answers each turn with the next reply of `script` (the last one again after the end). */
async function family(pkg: QuestionPackage, script: unknown[], childTurns: string[], voice = false) {
  let now = Date.UTC(2026, 10, 15);
  let id = 0;
  const clock = () => now;
  const store = memoryCallStore({ testFamilies: [], clock });
  const events = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] });
  const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
  const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: "Ava", formerNames: [] }), clock });
  const model = conversationalFake({ id: "fake-v3", answer: (_brief, n) => script[Math.min(n, script.length - 1)] });
  const rebuilt: LearningEvent[][] = [];
  const calls = mayaCalls({
    tutorFamilies: true,
    store,
    connections: memoryConnectionLog(store, clock),
    history: memoryWordingHistoryStore(),
    events: learningEvents(events),
    rebuild: async () => {
      rebuilt.push(await events.range(CHILD, RANGE));
      return true;
    },
    model: () => model,
    reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer(),
    isTestFamily: async () => false,
    canChat: async () => true,
    canCallVoice: async () => true,
    note: async (x) => noteStep(await writer.write(x), x.call.id),
    alerts: { send: async () => {}, list: async () => [] },
    clock,
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    seed: () => 3,
  });
  const input = {
    kind: voice ? ("family" as const) : ("chat" as const),
    parentId: PARENT,
    childId: CHILD,
    childName: "Ava",
    grade: 5,
    startedBy: PARENT,
    package: { ...pkg, ref: { source: "workbook" as const, workbookId: WORKBOOK, page: 1, question: 1 } },
  };
  const start = voice ? await calls.startVoice(input) : await calls.start(input);
  if (!start.ok) throw Error(start.error);
  if (voice) {
    const open = await calls.openVoice(start.view.id, { speechToText: "fake", voice: "fake" }, "Ava");
    if (!open.ok) throw Error(open.error);
    await open.call.start();
    for (const text of childTurns) {
      now += 5000;
      await open.call.child(text);
      await open.call.settled();
    }
    await open.call.end({ reason: "child_stopped" });
  } else {
    let current = start;
    for (const text of childTurns) {
      now += 5000;
      const r = await calls.input(current.view.id, current.view.revision, { type: "child", text }, "Ava");
      if (!r.ok) throw Error(r.error);
      current = r;
    }
    // The child leaves a chat that is still open, as the voice call ends above.
    if ((await store.get(start.view.id))?.status !== "ended") {
      const r = await calls.input(current.view.id, current.view.revision, { type: "end" }, "Ava");
      if (!r.ok) throw Error(r.error);
    }
  }
  return { record: await store.get(start.view.id), events: await events.range(CHILD, RANGE), notes: notes.rows(), rebuilt };
}

describe("tutor core credit on family calls (part C)", () => {
  for (const voice of [false, true]) {
    it(`a spot-the-error tick alone does not solve the question (${voice ? "voice" : "chat"})`, async () => {
      const r = await family(FIXTURES.SPOT_MUL, [reply("Bye for now.", "close")], ["I tick no."], voice);
      expect(r.events[0]?.result).toBe("blank");
      expect(r.record?.outcome?.reason).not.toBe("solved");
      expect(r.notes[0]?.facts.finished).not.toBe("on_own");
      expect(r.rebuilt.flat().every((e) => e.result !== "right")).toBe(true);
    });
  }

  it("control: a spot-the-error question is solved after the fix and the tick", async () => {
    const r = await family(FIXTURES.SPOT_MUL, [reply("Which word do you tick?", "guide"), reply("Bye for now.", "close")], ["It should be 4480.", "I tick no."]);
    expect(r.record?.outcome?.reason).toBe("solved");
    expect(r.events[0]?.result).not.toBe("blank");
  });

  it("a new wrong final answer replaces a right one", async () => {
    const r = await family(SUBTRACT, [reply("Yes, 24. What did you write?", "guide"), reply("Bye for now.", "close")], ["It's 24.", "My answer is 36."]);
    expect(r.events[0]?.result).toBe("blank");
    expect(r.notes[0]?.facts.finished).toBe("not_finished");
  });

  it("control: a right answer alone finishes the question with no help", async () => {
    const r = await family(SUBTRACT, [reply("Bye for now.", "close")], ["It's 24."]);
    expect(r.events[0]?.result).toBe("right");
    expect(r.notes[0]?.facts.finished).toBe("on_own");
  });

  it("control: the same right answer named again keeps the credit", async () => {
    const r = await family(SUBTRACT, [reply("Yes, 24. What did you write?", "guide"), reply("Bye for now.", "close")], ["It's 24.", "My answer is 24."]);
    expect(r.events[0]?.result).toBe("right");
  });

  it("control: a work value after the right answer keeps the credit", async () => {
    const r = await family(SUBTRACT, [reply("Yes, 24. How did you get the ones?", "guide"), reply("Bye for now.", "close")], ["It's 24.", "12 minus 8 is 4."]);
    expect(r.events[0]?.result).toBe("right");
    expect(r.notes[0]?.facts.finished).toBe("on_own");
  });

  it("control: a right answer after a replaced one gets the credit again", async () => {
    const r = await family(SUBTRACT, [reply("Yes, 24. What did you write?", "guide"), reply("Not quite. What is 52 minus 28?", "guide"), reply("Bye for now.", "close")], ["It's 24.", "My answer is 36.", "It's 24."]);
    expect(r.events[0]?.result).not.toBe("blank");
  });

  it("the note names the tens when the child did the ones and then needed help on the tens", async () => {
    const r = await family(SUBTRACT, [reply("Now the tens. What is 4 minus 2?", "guide"), reply("4 minus 2 is 2. What is the whole answer?", "guide"), reply("Bye for now.", "close")], ["12 minus 8 is 4.", "I need help with the tens.", "It's 24."]);
    expect(r.events[0]?.stuckStep).toBe("tens");
    expect(r.notes[0]?.facts.stuckOn).toBe("taking away in the tens");
    expect(r.rebuilt.flat()[0]?.stuckStep).toBe("tens");
  });

  it("control: help on the ones from the start names the ones, with help and not the answer", async () => {
    const r = await family(SUBTRACT, [reply("Start with the ones. 12 minus 8 is 4. What is 4 minus 2?", "guide"), reply("Now the whole answer?", "guide"), reply("Bye for now.", "close")], ["I need help.", "4 minus 2 is 2.", "It's 24."]);
    expect(r.events[0]?.result).toBe("right_with_help");
    expect(r.notes[0]?.facts.stuckOn).toMatch(/^taking away in the ones/);
    expect(r.notes[0]?.facts.finished).toBe("with_help");
  });

  it("the note says Maya gave the answer when she said the whole answer", async () => {
    const r = await family(SUBTRACT, [reply("52 minus 28 is 24. Write 24 on your paper.", "guide"), reply("Bye for now.", "close")], ["I need help.", "It's 24."]);
    expect(r.record?.outcome?.assistance).toBe("answer_given");
    expect(r.notes[0]?.facts.finished).toBe("answer_given");
    expect(r.notes[0]?.sentences.join(" ")).not.toContain("small hint");
  });
});
