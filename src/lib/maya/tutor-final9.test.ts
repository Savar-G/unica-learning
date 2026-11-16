// Final check 9 (2026-11-15): binding tests for the seven findings on 320b41fe8, each with controls. Every binding case
// is the reviewers' own probe. The two Book 1 questions ("Omar puts 5 books in each jar. How many books in 4 jars?" and
// "6 × 440 = ?") are their stored packages with the workbook id replaced; no customer file is read. Each binding test
// fails on 320b41fe8 and passes on the fix.
// Part 2 (math): N1 to N4. Part 1 (credit and records): F1 to F3.
import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { aiMathReviewer, fakeMathReviewer, type MathReviewer } from "@/lib/maya-math-review";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { callNotes, noteStep } from "@/lib/maya-call-note";
import { memoryNoteStore } from "@/lib/maya-call-note-memory";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import type { OperationPackage } from "@/lib/question-package";
import { createSession } from "./session";
import { checkTutorSay, childFacts, isTutorQuestion, tutorStreamContext } from "./tutor";
import { sayNumbers } from "./say-check";

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const W = "44444444-4444-4444-8444-444444444444";

/** A stored question as the tutor reads it: teachingPackage, then the session's own package. */
function stored(raw: unknown): OperationPackage {
  const s = createSession({ callId: "stored", package: teachingPackage(raw) as never, tutor: true, conversational: true });
  if (!s.tutor || !s.package) throw new Error("not a tutor question");
  return s.package;
}

/** The Book 1 question "Omar puts 5 books in each jar. How many books in 4 jars?", as stored. */
const OMAR = () => stored({
  id: "final9:omar", ref: { page: 9, source: "workbook", question: 3, workbookId: W },
  item: { error: null, checks: [{ kind: "template", region: "answer", source: { check: null, slots: [{ name: "m", value: { int: "5" }, domain: { max: 7, min: 2 } }, { name: "p", value: { int: "4" }, domain: { max: 6, min: 1 } }], answer: "m * p", values: null, derived: [] } }, { kind: "template-choice", region: "operation", source: { check: null, slots: [{ name: "m", value: { int: "5" }, domain: { max: 7, min: 2 } }, { name: "p", value: { int: "4" }, domain: { max: 6, min: 1 } }], answer: "'×'", values: null, derived: [] } }], format: "tick-and-number", regions: [{ id: "operation", kind: "choice", mark: "tick", label: "Tick the operation", answer: "×", choices: ["+", "−", "×", "÷"] }, { id: "answer", kind: "box", label: "Write the answer", answer: { type: "number", value: 20 } }, { id: "work", kind: "work", label: "Show your work" }], scorable: true, parentChecked: false },
  text: "Omar puts 5 books in each jar. How many books in 4 jars?", level: 16, skill: { skills: ["4.9-table-pattern"], standard: "4.9" }, steps: [], answer: null, operation: null, difficulty: 1, templateId: "4.9-table-pattern#3.2:story", textSource: "code", wrongAnswers: [], easierExample: null,
});

/** The Book 1 question "6 × 440 = ?", as stored. */
const TIMES440 = () => stored({
  id: "final9:440", ref: { page: 12, source: "workbook", question: 1, workbookId: W },
  item: { error: null, checks: [{ kind: "template", region: "answer", source: { check: "b0 >= 10", slots: [{ name: "a0", value: { int: "6" }, domain: { max: 9, min: 1 } }, { name: "b0", value: { int: "446" }, domain: { max: 900, min: 10 } }], answer: "a * b", values: null, derived: [["a", "a0"], ["b", "b0 // 10 * 10"]] } }], format: "write-number", regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: 2640 } }], scorable: true, parentChecked: false },
  text: "6 × 440 = ?", level: 16, skill: { skills: ["5.9-multiply-tens"], standard: "5.9" },
  steps: [
    { id: "r2-ones", row: "tens", top: 6, kind: "multiply-digit", place: "ones", total: 24, write: 4, carryIn: 0, carryOut: 2, multiplier: 4 },
    { id: "r2-tens", row: "tens", top: null, kind: "multiply-digit", place: "tens", total: 2, write: 2, carryIn: 2, carryOut: 0, multiplier: 4 },
    { id: "r2", row: "tens", kind: "partial-product", value: 240, zeros: 1, multiplier: 4 },
    { id: "r3-ones", row: "hundreds", top: 6, kind: "multiply-digit", place: "ones", total: 24, write: 4, carryIn: 0, carryOut: 2, multiplier: 4 },
    { id: "r3-tens", row: "hundreds", top: null, kind: "multiply-digit", place: "tens", total: 2, write: 2, carryIn: 2, carryOut: 0, multiplier: 4 },
    { id: "r3", row: "hundreds", kind: "partial-product", value: 2400, zeros: 2, multiplier: 4 },
    { id: "sum-ones", kind: "add-column", place: "ones", total: 0, write: 0, digits: [0, 0], carryIn: 0, carryOut: 0 },
    { id: "sum-tens", kind: "add-column", place: "tens", total: 4, write: 4, digits: [4, 0], carryIn: 0, carryOut: 0 },
    { id: "sum-hundreds", kind: "add-column", place: "hundreds", total: 6, write: 6, digits: [2, 4], carryIn: 0, carryOut: 0 },
    { id: "sum-thousands", kind: "add-column", place: "thousands", total: 2, write: 2, digits: [2], carryIn: 0, carryOut: 0 },
    { id: "result", kind: "result", value: { type: "number", value: 2640 } },
  ],
  answer: { unit: null, value: { type: "number", value: 2640 }, accepted: [] }, operation: { kind: "multiply", operands: [6, 440] }, difficulty: 1, templateId: "5.9-multiply-tens#1.1:bare", textSource: "code",
  wrongAnswers: [{ step: null, cause: "calculation", value: { type: "number", value: 2641 }, description: "Gives a different result." }],
  easierExample: { text: "0 × 1 = ?", steps: [{ id: "r1-ones", row: "ones", top: 0, kind: "multiply-digit", place: "ones", total: 0, write: 0, carryIn: 0, carryOut: 0, multiplier: 1 }, { id: "result", kind: "result", value: { type: "number", value: 0 } }], answer: { type: "number", value: 0 }, operation: { kind: "multiply", operands: [0, 1] } },
  operationSource: "maya",
});

/** One child turn in the text adapter, Maya's message fixed, with the stream on or off. */
async function turn(pkg: OperationPackage, line: string, child: string, stream: boolean, math: MathReviewer = fakeMathReviewer(), ms = 1000) {
  const parts: string[] = [];
  const model = conversationalFake({ answer: () => reply(line, "guide"), ...(stream ? { stream: { chunk: 7 } } : {}) });
  const s = createTextSession({ callId: "final9", package: pkg, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, reviewTimeLimitMs: ms, ...(stream ? {} : { channel: "chat" as const }), ...(stream ? { onSayPart: (x: string) => parts.push(x) } : {}) });
  await s.start();
  parts.length = 0;
  const out = await s.child(child);
  return { s, out, parts, model };
}

type ReviewInput = { sentence: string; childFacts: string[]; childAnswer: { value: number | null; verdict: string; right: unknown } | null };
/** The production review adapter with a local client that follows the prompt's rule on the child's verdict. */
function verdictReader(inputs: ReviewInput[] = []) {
  return {
    inputs,
    reviewer: aiMathReviewer({ model: "local-verdict-reader", json: async (r: { content: { text: string }[] }) => {
      const x = JSON.parse(r.content[0].text) as ReviewInput;
      inputs.push(x);
      return x.childAnswer?.verdict === "right" ? { verdict: "true", reason: "all true" } : { verdict: "false", reason: "a judgment needs a right verdict" };
    } } as never),
  };
}

describe("N1 (P1): credit and a right verdict need a complete answer read; an unread unit is unknown", () => {
  for (const stream of [false, true]) {
    it(`binding: "20 jars." on the books question gets no right verdict and no praise (stream=${stream})`, async () => {
      const p = OMAR();
      expect(p.answer.value).toMatchObject({ type: "number", value: 20 });
      const v = verdictReader();
      const r = await turn(p, "Perfect!", "20 jars.", stream, v.reviewer);
      expect(v.inputs[0].childAnswer?.verdict).not.toBe("right");
      expect(r.out.say).not.toContain("Perfect!");
      expect(r.parts).not.toContain("Perfect!");
      expect(r.s.session.solved).toBeNull();
    });
    it(`control: "20", "20 books." and "My answer is 20." are right; "19" and "My answer is 20 jars." are not (stream=${stream})`, async () => {
      const p = OMAR();
      for (const child of ["20", "20 books.", "My answer is 20."]) {
        const v = verdictReader();
        const r = await turn(p, "Perfect!", child, stream, v.reviewer);
        expect(v.inputs[0].childAnswer?.verdict, child).toBe("right");
        expect(r.out.say, child).toEqual(["Perfect!"]);
      }
      for (const child of ["19", "My answer is 20 jars."]) {
        const r = await turn(p, "Perfect!", child, stream, verdictReader().reviewer);
        expect(r.out.say, child).not.toContain("Perfect!");
      }
    });
  }
});

describe("N2 (P1): compound number words are read by their groups, and an odd word run is left unread", () => {
  const value = (text: string) => sayNumbers(text).map((t) => t.key);
  it("binding: the forms read as one standard value", () => {
    expect(value("two thousand six hundred and forty")).toEqual(["2640"]);
    expect(value("one thousand and five")).toEqual(["1005"]);
    expect(value("nine hundred ninety-nine")).toEqual(["999"]);
    expect(value("forty-two thousand")).toEqual(["42000"]);
    expect(value("three hundred forty-two thousand five hundred")).toEqual(["342500"]);
    expect(value("two thousand six hundred forty")).toEqual(["2640"]);
  });
  it("binding: \"three thousand two hundred\" is 3200, beside plain numbers (controls)", () => {
    expect(value("twenty four")).toEqual(["24"]);
    expect(value("one hundred and five")).toEqual(["105"]);
    expect(value("seven")).toEqual(["7"]);
    expect(value("three thousand two hundred")).toEqual(["3200"]);
  });
  it("control: the digit form and simple word forms read as before", () => {
    expect(value("twenty four")).toEqual(["24"]);
    expect(value("one hundred and five")).toEqual(["105"]);
    expect(childFacts(TIMES440(), "6 times 440 is 2640.")).toContain("The child said 6 × 440 = 2640: that is true.");
    expect(childFacts(TIMES440(), "6 times 440 is 2650.")).toContain("The child said 6 × 440 = 2650: that is false.");
  });
  it("binding: a run that makes no one standard value is no value", () => {
    for (const text of ["five hundred thousand thousand", "two hundred three hundred", "six thousand two thousand"]) {
      expect(sayNumbers(text).every((t) => t.q === null), text).toBe(true);
    }
    // The child's clause with such a run is unread: no fact, true or false.
    expect(childFacts(TIMES440(), "6 times 440 is two thousand two thousand.").join(" ")).not.toMatch(/6 × 440 =/);
  });
  for (const stream of [false, true]) {
    it(`binding: "6 times 440 is two thousand six hundred and forty." is a true child fact and Maya may say it (stream=${stream})`, async () => {
      const p = TIMES440();
      const line = "6 times 440 is two thousand six hundred and forty.";
      expect(6 * 440).toBe(2640);
      expect(childFacts(p, line)).toContain("The child said 6 × 440 = 2640: that is true.");
      const math = fakeMathReviewer();
      await turn(p, "Let us check that.", line, stream, math);
      expect(math.requests[0]?.childAnswer?.verdict).not.toBe("wrong");
      expect(math.requests[0]?.childFacts.join(" ")).not.toContain("200640");
      const r = await turn(p, line, "Help me with 6 times 440.", stream, fakeMathReviewer());
      expect(r.out.say).toEqual([line]);
    });
    it(`binding: a false word form is read as false (2650), beside the digit form (stream=${stream})`, async () => {
      const p = TIMES440();
      expect(childFacts(p, "6 times 440 is 2640.")).toContain("The child said 6 × 440 = 2640: that is true.");
      expect(childFacts(p, "6 times 440 is two thousand six hundred and fifty.")).toContain("The child said 6 × 440 = 2650: that is false.");
      const r = await turn(p, "6 times 440 is two thousand six hundred and fifty.", "Help me with 6 times 440.", stream, fakeMathReviewer());
      expect(r.out.say).not.toContain("6 times 440 is two thousand six hundred and fifty.");
    });
  }
});

describe("N3 (P1): a terminal non-true math review of a sentence is final for that child turn, across repairs", () => {
  const line = "12 minus 8 is 4 with a negative sign.";
  for (const stream of [false, true]) for (const kind of ["error", "timeout", "retry-error", "false", "bad_json"] as const) {
    it(`${kind === "bad_json" ? "control (held before the fix)" : "binding"}: ${kind}, then a repair that repeats the sentence is refused (stream=${stream})`, async () => {
      let calls = 0;
      let retries = 0;
      const first = { model: "local-failure", json: async () => {
        calls++;
        if (calls === 1) {
          if (kind === "error") throw new Error("connection failed");
          if (kind === "timeout") await new Promise((r) => setTimeout(r, 40));
          if (kind === "retry-error") return { verdict: "unsure", reason: "cannot tell" };
          if (kind === "false") return { verdict: "false", reason: "a negative sign is not 4" };
          if (kind === "bad_json") throw new Error("The model's answer was not valid JSON.");
        }
        return { verdict: "true", reason: "all true" };
      } };
      const retry = { model: "local-retry", json: async () => { retries++; throw new Error("connection failed"); } };
      const math = aiMathReviewer(first as never, undefined, kind === "retry-error" ? { client: retry as never } : undefined);
      const r = await turn(SUB, line, "Help me with 52 minus 28.", stream, math, kind === "timeout" ? 15 : 1000);
      expect(calls).toBe(1);
      expect(r.model.briefs).toHaveLength(2);
      expect(r.out.say).not.toContain(line);
      expect(r.parts).not.toContain(line);
      if (kind === "retry-error") expect(retries).toBe(1);
    });
  }
  it("binding: an error holds for its turn, and a new child turn reviews the sentence again", async () => {
    let calls = 0;
    const math = fakeMathReviewer(() => (++calls === 1 ? "throw" : { verdict: "true", reason: "all true" }));
    const model = conversationalFake({ answer: () => reply(line, "guide") });
    const s = createTextSession({ callId: "final9", package: SUB, tutor: true, clock: () => Date.now(), reviewer: fakeTalkReviewer(), mathReviewer: math, model, channel: "chat" });
    await s.start();
    const one = await s.child("Help me with 52 minus 28.");
    expect(one.say).not.toContain(line);
    const two = await s.child("Help me again please.");
    expect(two.say).toEqual([line]);
  });
  it("control: a reviewer that always fails keeps the sentence out", async () => {
    const r = await turn(SUB, line, "Help me with 52 minus 28.", false, fakeMathReviewer(() => "throw"));
    expect(r.out.say).not.toContain(line);
  });
});

describe("N4 (P2): an equality code cannot read goes to the review; only a clause proved false is refused", () => {
  for (const stream of [false, true]) for (const line of ["2 times (minus 3 plus 4) = 2.", "3 squared = 9."]) {
    it(`binding: "${line}" is reviewed and said (stream=${stream})`, async () => {
      expect(2 * (-3 + 4)).toBe(2);
      expect(3 ** 2).toBe(9);
      expect(checkTutorSay(line, tutorStreamContext(SUB, "Help me please.", "none", new Set()))).not.toMatchObject({ ok: false, reason: "false_equation" });
      const math = fakeMathReviewer();
      const r = await turn(SUB, line, "Help me please.", stream, math);
      expect(math.requests.length).toBeGreaterThan(0);
      expect(r.out.say).toEqual([line]);
    });
  }
  it("control: a false clause code reads whole is still refused, and the review refuses a false unread one", async () => {
    expect(checkTutorSay("12 minus 8 = 5.", tutorStreamContext(SUB, "Help me please.", "none", new Set()))).toMatchObject({ ok: false });
    const r = await turn(SUB, "3 squared = 10.", "Help me please.", false, fakeMathReviewer(() => ({ verdict: "false", reason: "3 squared is 9" })));
    expect(r.out.say).not.toContain("3 squared = 10.");
    const c = await turn(SUB, "2 times (minus 3 plus 4) is 2.", "Help me please.", false, fakeMathReviewer());
    expect(c.out.say).toEqual(["2 times (minus 3 plus 4) is 2."]);
  });
});

const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
/** A public family call (chat or voice) with in-memory stores, as the reviewer's helper runs it. */
async function family(pkg: OperationPackage, script: ReturnType<typeof reply>[], childTurns: string[], voice: boolean) {
  let now = Date.UTC(2026, 10, 15);
  let id = 0;
  const clock = () => now;
  const store = memoryCallStore({ testFamilies: [], clock });
  const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
  const notes = memoryNoteStore({ calls: () => store.rows(), testFamilies: [] });
  const writer = callNotes({ store: notes, ai: null, isTestFamily: async () => false, childNames: async () => ({ firstName: "Ava", formerNames: [] }), clock });
  const model = conversationalFake({ id: "fake-v3", answer: (_: unknown, n: number) => script[Math.min(n, script.length - 1)] });
  const calls = mayaCalls({
    mathReviewer: () => fakeMathReviewer(), tutorFamilies: true, store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
    events: learningEvents(events), rebuild: async () => true, model: () => model, reviewer: () => fakeTalkReviewer(), isTestFamily: async () => false,
    canChat: async () => true, canCallVoice: async () => true, note: async (x: Parameters<typeof writer.write>[0]) => noteStep(await writer.write(x), x.call.id),
    alerts: { send: async () => {}, list: async () => [] }, clock, newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, seed: () => 3,
  } as never);
  const input = { kind: voice ? ("family" as const) : ("chat" as const), parentId: P, childId: C, childName: "Ava", grade: 5, startedBy: P, package: { ...pkg, ref: { source: "workbook" as const, workbookId: W, page: 1, question: 1 } } };
  const start = voice ? await calls.startVoice(input as never) : await calls.start(input as never);
  if (!start.ok) throw new Error(start.error);
  let current = start;
  if (voice) {
    const open = await calls.openVoice(start.view.id, { speechToText: "fake", voice: "fake" }, "Ava");
    if (!open.ok) throw new Error(open.error);
    await open.call.start();
    for (const text of childTurns) { now += 5000; await open.call.child(text); await open.call.settled(); }
    await open.call.end({ reason: "child_stopped" });
  } else {
    for (const text of childTurns) {
      now += 5000;
      const r = await calls.input(current.view.id, current.view.revision, { type: "child", text }, "Ava");
      if (!r.ok) throw new Error(r.error);
      current = r;
    }
    if ((await store.get(start.view.id))?.status !== "ended") {
      const r = await calls.input(current.view.id, current.view.revision, { type: "end" }, "Ava");
      if (!r.ok) throw new Error(r.error);
    }
  }
  return { record: await store.get(start.view.id), events: await events.range(C, { from: "2026-11-14", to: "2026-11-16" }), notes: notes.rows() };
}

describe("F1 (P1): any board command that holds the answer value gives the answer", () => {
  const pkg = teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage;
  for (const voice of [false, true]) for (const mode of ["answer", "value", "number", "hint"] as const) {
    it(`${mode === "answer" || mode === "value" ? "binding" : "control"}: ${mode} (voice=${voice})`, async () => {
      expect(isTutorQuestion(pkg)).toBe(true);
      expect(pkg.text).toBe("What is the value of the digit in the ten thousands place of 48942?");
      expect(pkg.answer.value).toEqual({ type: "number", value: 40000 });
      // B2: the board draws only what Maya says, so a board value is always in her words too. The model's own draw list
      // (the old way to put the answer on the board) is ignored: the answer is given by the words, and the board holds
      // no value she did not say.
      const say = mode === "number" ? "The answer is 40000." : mode === "answer" ? "Write 40000." : mode === "value" ? "Write 40000 in the ten thousands." : "Look at the place-value chart.";
      const draw = mode === "answer" ? [{ offer: "answer", place: "" }] : mode === "value" ? [{ offer: "value", place: "ten thousands" }] : [];
      const r = await family(pkg, [reply(say, "guide", { draw } as never), reply("Bye for now.", "close")], ["I need help.", "My answer is 40000."], voice);
      const n = r.notes[0];
      expect(n?.transcript.some((t) => t.speaker === "maya" && t.text === say)).toBe(true);
      if (mode === "answer" || mode === "value") {
        // The chart is not on the board, so the value and the answer row (which need it) are not drawn.
        const shown = (r.record?.trace as { board: { commands: { op: string; value?: string }[] }[] } | undefined)?.board.flatMap((b) => b.commands).filter((c) => c.op === "put" && c.value === "40000") ?? [];
        expect(shown).toEqual([]);
        expect(n?.facts.help).toBe("answer_given");
        expect(n?.sentences.join(" ")).not.toContain("finished it after a small hint");
      } else if (mode === "number") expect(n?.facts.finished).toBe("answer_given");
      else expect(n?.facts.help).toBe("hint");
    });
  }
});

describe("F2 (P1): a number in a turn that names a place, column, step, digit or row is never final-answer credit", () => {
  for (const child of ["The tens answer is 24.", "The tens are 24.", "I got 24 for the tens.", "My answer is 24."]) for (const voice of [false, true]) {
    it(`${child.startsWith("The tens") ? "binding" : "control"}: family record for "${child}" (voice=${voice})`, async () => {
      const r = await family(SUB, [reply("What is 4 minus 2?", "guide"), reply("Yes, that's right. What did you write?", "guide")], ["12 minus 8 is 4.", child], voice);
      const n = r.notes[0];
      if (child === "My answer is 24.") expect(r.record?.outcome?.reason).toBe("solved");
      else {
        // Maya's praise is judged by the math review against code's verdict (the test below); here the review is a fake
        // that passes all, so only the record is checked.
        expect(r.record?.outcome?.reason).not.toBe("solved");
        expect(n?.sentences.join(" ")).not.toContain("finished it");
      }
    });
  }
  for (const child of ["The tens answer is 24.", "The tens are 24.", "The answer is 24 in the tens row.", "24, that is the digit."]) for (const stream of [false, true]) {
    it(`${child.includes("row") ? "control" : "binding"}: code's verdict and praise for "${child}" (stream=${stream})`, async () => {
      const v = verdictReader();
      // Savar's call 2: a message after a wrong answer ends with one question, so the fixture asks one.
      const r = await turn(SUB, "Your answer checks out. What is 4 minus 2?", child, stream, v.reviewer);
      expect(v.inputs.length).toBeGreaterThan(0);
      expect(v.inputs[0].childAnswer?.verdict).not.toBe("right");
      expect(r.out.say).not.toContain("Your answer checks out.");
      expect(r.parts.join(" ")).not.toContain("Your answer checks out.");
      expect(r.s.session.solved).toBeNull();
    });
  }
  it("control: \"24\" alone and \"52 minus 28 is 24.\" are still final answers", async () => {
    for (const child of ["24", "52 minus 28 is 24."]) {
      const v = verdictReader();
      const r = await turn(SUB, "Your answer checks out.", child, false, v.reviewer);
      expect(v.inputs[0].childAnswer?.verdict, child).toBe("right");
      expect(r.s.session.solved, child).toBe("child");
    }
  });
});

describe("F3 (P1): a turn that names the easier example scopes its numbers to the example", () => {
  for (const child of ["For the easier example, I got 4 in the ones.", "For the easier example, I got 5 in the ones.", "In the practice one I got 4 in the ones.", "For the other one, I got 4 in the ones.", "For this question, I got 4 in the ones."]) for (const stream of [false, true]) {
    const control = child.includes("this question") || child.includes("got 5") || child.includes("practice one");
    it(`${control ? "control" : "binding"}: "${child}" (stream=${stream})`, async () => {
      const v = verdictReader();
      const r = await turn(SUB, "Your answer checks out.", child, stream, v.reviewer);
      expect(r.s.session.package?.easierExample?.text).toBe("42 - 7 = ?");
      expect(r.s.session.package?.easierExample?.steps.find((x) => x.id === "ones")).toMatchObject({ write: 5 });
      if (child.includes("this question")) {
        expect(r.s.session.done).toContain("ones");
        expect(r.out.say.join(" ")).toContain("Your answer checks out.");
      } else {
        expect(r.s.session.done).not.toContain("ones");
        expect(v.inputs[0]?.childAnswer?.verdict).not.toBe("right");
        if (child.includes("got 4")) {
          expect(r.out.say.join(" ")).not.toContain("Your answer checks out.");
          expect(r.parts.join(" ")).not.toContain("Your answer checks out.");
        }
      }
    });
  }
});
