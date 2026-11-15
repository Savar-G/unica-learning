import { describe, expect, it } from "vitest";
import { openingLine, type TutorBrief } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { checkTrace } from "@/lib/maya-trace";
import type { TurnBrief } from "@/lib/maya-model";
import type { OperationPackage } from "@/lib/question-package";
import type { TalkReviewInput, TalkReviewResult } from "@/lib/maya";

// The tutor core (D-345) through the text adapter's public interface: one model call and one Maya message per child
// turn, the whole message checked once, one repair, then code's honest line. A fake model and a passed-in clock.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const T0 = Date.UTC(2026, 10, 14, 16, 0, 0);

/** Savar's call c1c7b3d0 (2026-11-14): the child's first turn. */
const SAVAR = "Can you teach me how to do 2 minus 8? I don't get it.";
/** The design's target first message for it (section 7, A). */
const TARGET = "Good question, {name}. You're right that 2 is too small to take 8 away. So we borrow: trade 1 ten from the 5 tens for 10 ones. Now how many ones do you have, 2 plus 10?";

type Answer = (brief: TutorBrief, n: number) => unknown;

function call(answer: Answer, more: Partial<Parameters<typeof createTextSession>[0]> & { review?: (input: TalkReviewInput, n: number) => TalkReviewResult } = {}) {
  let now = T0;
  const model = conversationalFake({ answer: answer as unknown as (brief: TurnBrief, n: number) => unknown });
  const reviewer = fakeTalkReviewer(more.review);
  const session = createTextSession({ callId: "tutor-1", package: PKG, model, clock: () => (now += 500), random: 3, childName: "Ava", reviewer, tutor: true, ...more });
  return { session, model, reviewer, briefs: model.briefs as unknown as TutorBrief[] };
}

describe("the tutor core, test case 1: Savar's call", () => {
  it("answers \"teach me 2 minus 8\" in ONE message that says why 2 is too small and that 1 ten becomes 10 ones, then waits", async () => {
    const { session, briefs, reviewer } = call(() => reply(TARGET, "guide", { reading: { help: "more", start: "no_start" }, draw: [{ offer: "trade", place: "" }] }));
    expect((await session.start()).say).toEqual([openingLine(PKG)]);
    const out = await session.child(SAVAR);
    // One model call, one message, the model's own words with the name filled in.
    expect(briefs).toHaveLength(1);
    expect(out.say).toEqual([TARGET.replace("{name}", "Ava")]);
    expect(out.say[0]).toMatch(/2 is too small/);
    expect(out.say[0]).toMatch(/trade 1 ten .* for 10 ones/);
    expect(out.say[0].trim().endsWith("?")).toBe(true);
    // The board shows the trade on the question.
    expect(out.board.flatMap((b) => b.commands)).toContainEqual(expect.objectContaining({ op: "regroup", kind: "borrow", from: "tens", to: "ones" }));
    // Maya waits for the child: never a second message in a row.
    expect(session.session.expect).toBe("child");
    // The brief is the tutor's: steps with values and the reason, code's facts on the child's numbers, no act list.
    const b = briefs[0];
    expect(b.mode).toBe("tutor");
    expect(b.question?.steps[0].work).toContain("trade 1 ten for 10 ones, so 2 ones become 12");
    expect(b.facts.join(" ")).toContain("The child said 2");
    expect(b).not.toHaveProperty("acts");
    expect(JSON.stringify(b)).not.toContain("Ava");
    // Every sentence is plain teaching (math words, and a statement about the child only with its numbers): no review.
    expect(reviewer.requests).toHaveLength(0);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace).ok).toBe(true);
    expect(trace.counts).toMatchObject({ overrides: 0, fallbacks: 0, refusals: 0, longestMayaRun: 1 });
  });

  it("then goes on one message per child turn: 12, then 12 minus 8, then the tens", async () => {
    const script = [
      reply(TARGET, "guide", { draw: [{ offer: "trade", place: "" }] }),
      reply("Yes, 12 ones. Now what is 12 minus 8?", "guide"),
      reply("That's it. Write 4 in the ones. We traded one ten, so how many tens are left from 5?", "guide", { reading: { answers: [{ value: { type: "number", value: 4 }, step: "ones", problem: "target", verdict: "right" }] }, draw: [{ offer: "digit", place: "ones" }] }),
    ];
    const { session, briefs } = call((_, n) => script[n]);
    await session.start();
    for (const said of [SAVAR, "12", "12 minus 8 is 4"]) {
      const out = await session.child(said);
      expect(out.say).toHaveLength(1);
      expect(session.session.expect).toBe("child");
    }
    expect(briefs).toHaveLength(3);
    expect(session.session.done).toContain("ones");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts).toMatchObject({ longestMayaRun: 1, overrides: 0 });
  });
});

describe("the answer rule is lifted (D-345)", () => {
  it("lets Maya tell a step and the whole answer, and the child still does the next part", async () => {
    const tell = "Let's do it together. 12 minus 8 is 4, and 4 tens minus 2 tens is 2 tens, so 52 minus 28 is 24. Now you: how did we get 12 ones?";
    const { session } = call(() => reply(tell, "guide"));
    await session.start();
    const out = await session.child("I still don't get it");
    expect(out.say).toEqual([tell]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts.refusals).toBe(0);
  });
});

describe("the whole-message check: one repair, then code's honest line", () => {
  it("refuses a false equation with the reason, and says the repaired message", async () => {
    const { session, briefs } = call((_, n) => n === 0 ? reply("12 minus 8 is 5. What do you write?", "guide") : reply("12 minus 8 is 4. What do you write in the ones?", "guide"));
    await session.start();
    const out = await session.child(SAVAR);
    expect(out.say).toEqual(["12 minus 8 is 4. What do you write in the ones?"]);
    expect(briefs).toHaveLength(2);
    expect(JSON.stringify(briefs[1].repair)).toContain("false_equation");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts).toMatchObject({ repairs: 1, repairedOk: 1, overrides: 1 });
  });

  it("repairs in voice too (modelRepair false is for the controller)", async () => {
    const { session, briefs } = call((_, n) => n === 0 ? reply("12 minus 8 is 5.", "guide") : reply("What is 12 minus 8?", "guide"), { modelRepair: false });
    await session.start();
    expect((await session.child(SAVAR)).say).toEqual(["What is 12 minus 8?"]);
    expect(briefs).toHaveLength(2);
  });

  it("after two refused messages says one honest line and the step's question, and counts it", async () => {
    const { session } = call(() => reply("12 minus 8 is 5.", "guide"));
    await session.start();
    const out = await session.child(SAVAR);
    expect(out.say).toEqual(["Let me say that another way. What do you get for 12 minus 8?"]);
    expect(session.session.expect).toBe("child");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts).toMatchObject({ fallbacks: 1, overrides: 1, longestMayaRun: 1 });
  });

  it("refuses a message over the hard ceiling instead of trimming it", async () => {
    const long = `${Array.from({ length: 20 }, () => "We trade one ten.").join(" ")} What is 12 minus 8?`;
    const { session, briefs } = call((_, n) => n === 0 ? reply(long, "guide") : reply("What is 12 minus 8?", "guide"));
    await session.start();
    expect((await session.child(SAVAR)).say).toEqual(["What is 12 minus 8?"]);
    expect(JSON.stringify(briefs[1].repair)).toContain("too_long");
  });

  it("never says yes to a wrong answer", async () => {
    const { session, briefs } = call((_, n) => n === 0
      ? reply("Yes, great! Now the tens.", "guide", { reading: { answers: [{ value: { type: "number", value: 36 }, step: "result", problem: "target", verdict: "wrong" }] } })
      : reply("Not quite. 36 takes the small digit from the big one. What is 12 minus 8?", "guide", { reading: { answers: [{ value: { type: "number", value: 36 }, step: "result", problem: "target", verdict: "wrong" }] } }));
    await session.start();
    const out = await session.child("It's 36.");
    expect(JSON.stringify(briefs[1].repair)).toContain("affirms_wrong");
    expect(out.say[0]).toMatch(/^Not quite/);
  });
});

describe("the safety review reads the whole message, for child safety only", () => {
  it("passes a message the review fails only for plain language", async () => {
    const { session } = call(() => reply(TARGET, "guide"), { review: () => ({ verdict: "fail", rules: ["plain_language"], reason: "uses regroup" }) });
    await session.start();
    expect((await session.child(SAVAR)).say).toEqual([TARGET.replace("{name}", "Ava")]);
  });
  it("refuses a message the review fails for a safety rule", async () => {
    const { session, briefs } = call((_, n) => n === 0 ? reply("Good job, our secret trick: trade a ten. What is 12 minus 8?", "guide") : reply("What is 12 minus 8?", "guide"), {
      review: (input) => input.line.includes("secret") ? { verdict: "fail", rules: ["secrecy"], reason: "a secret" } : { verdict: "pass" },
    });
    await session.start();
    expect((await session.child(SAVAR)).say).toEqual(["What is 12 minus 8?"]);
    expect(JSON.stringify(briefs[1].repair)).toContain("secrecy");
  });
});

describe("Maya never ends the call on a stuck child", () => {
  it("refuses a close before the child solved the question", async () => {
    const { session, briefs } = call((_, n) => n === 0 ? reply("This one is hard. Bye for now.", "close") : reply("Let's try a small step. What is 2 plus 10?", "guide"));
    await session.start();
    const out = await session.child("I don't know");
    expect(out.ended).toBeNull();
    expect(out.say).toEqual(["Let's try a small step. What is 2 plus 10?"]);
    expect(JSON.stringify(briefs[1].repair)).toContain("never end the call");
  });
  it("closes after the child's right answer, and the outcome is solved", async () => {
    const right = { answers: [{ value: { type: "number", value: 24 }, step: "result", problem: "target", verdict: "right" }] };
    const { session } = call((_, n) => n === 0 ? reply("Yes, 24! How did you get it?", "guide", { reading: right }) : reply("You traded a ten and did each column. Great work today. Bye for now!", "close"));
    await session.start();
    expect((await session.child("It's 24.")).say).toEqual(["Yes, 24! How did you get it?"]);
    expect(session.session.solved).toBe("child");
    const out = await session.child("I traded a ten. I'm done.");
    expect(out.ended?.reason).toBe("solved");
  });
});

describe("only tutor calls use the tutor core", () => {
  it("a call without the option keeps the controller's brief", async () => {
    let now = T0;
    const model = conversationalFake({ answer: () => reply("What is 12 minus 8?", "guide", { step: "ones", level: 2 }) });
    const session = createTextSession({ callId: "ctl-1", package: PKG, model, clock: () => (now += 500), random: 3, reviewer: fakeTalkReviewer() });
    await session.start();
    await session.child(SAVAR);
    expect((model.briefs[0] as unknown as { mode?: string }).mode).toBeUndefined();
    expect(session.session.tutor).toBeUndefined();
  });
});

describe("the board never costs the child Maya's words", () => {
  it("draws what fits, in order, and keeps the message when a drawing does not fit", async () => {
    // Six requests: more than a proposal holds (4). The first four are drawn; the words stay.
    const notes = Array.from({ length: 5 }, () => ({ offer: "note", place: "12 − 8 = 4" }));
    const { session } = call(() => reply("12 minus 8 is 4. What do you write in the ones?", "guide", { draw: [{ offer: "digit", place: "tens" }, ...notes] }));
    await session.start();
    const out = await session.child(SAVAR);
    expect(out.say).toEqual(["12 minus 8 is 4. What do you write in the ones?"]);
    expect(out.board.flatMap((b) => b.commands).filter((c) => (c as { op?: string }).op === "write")).toHaveLength(3);
    expect(session.session.expect).toBe("child");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts.refusals).toBe(0);
  });
});

describe("the tutor message streams to the voice sentence by sentence (D-345, the CoS rule of 2026-11-14)", () => {
  function streamed(say: string, review?: (input: TalkReviewInput) => TalkReviewResult | Promise<TalkReviewResult>, extra: Parameters<typeof reply>[2] = {}) {
    let now = T0;
    const parts: string[] = [];
    let beforeEnd: string[] = [];
    const model = conversationalFake({
      answer: () => ({ ...reply(say, "guide", extra), ...(extra.reading?.outsideScope ? { kind: "offtopic" } : {}) }),
      stream: { chunk: 7, beforeEnd: async () => { await new Promise((r) => setTimeout(r, 30)); beforeEnd = [...parts]; } },
    });
    const requests: TalkReviewInput[] = [];
    const reviewer = { id: "fake-review", promptVersion: "t", review: async (input: TalkReviewInput) => { requests.push(input); return review ? review(input) : { verdict: "pass" as const }; } };
    const session = createTextSession({ callId: "tutor-s", package: PKG, model, clock: () => (now += 500), random: 3, childName: "Ava", reviewer, tutor: true, onSayPart: (sentence) => parts.push(sentence) });
    return { session, parts, before: () => beforeEnd, requests };
  }

  it("sends each plain math sentence while the model still writes, with no review", async () => {
    const t = streamed("12 minus 8 is 4. Now the tens: what is 4 minus 2?");
    await t.session.start();
    t.parts.length = 0;
    const out = await t.session.child("12 minus 8 is 4");
    expect(t.before()).toEqual(["12 minus 8 is 4.", "Now the tens: what is 4 minus 2?"]);
    expect(t.parts).toEqual(["12 minus 8 is 4.", "Now the tens: what is 4 minus 2?"]);
    expect(t.requests).toHaveLength(0);
    expect(out.say).toEqual(["12 minus 8 is 4. Now the tens: what is 4 minus 2?"]);
    const trace = await t.session.finish({ reason: "child_stopped" });
    expect(trace.turns.filter((x) => x.kind === "maya").at(-1)).toMatchObject({ attempts: [expect.objectContaining({ firstSayMs: expect.any(Number) })] });
  });

  it("holds only a personal sentence for its review, in order, and says the rest after it passes", async () => {
    let pass!: () => void;
    const gate = new Promise<void>((r) => { pass = r; });
    const t = streamed("You did that part well, {name}. What is 12 minus 8?", async () => { await gate; return { verdict: "pass" }; });
    await t.session.start();
    t.parts.length = 0;
    const done = t.session.child(SAVAR);
    await new Promise((r) => setTimeout(r, 80));
    // The first sentence is under review: nothing goes out, and the plain sentence waits behind it.
    expect(t.parts).toEqual([]);
    expect(t.requests.map((r) => r.line)).toEqual(["You did that part well, {name}."]);
    expect(t.requests[0]).toMatchObject({ tutor: true });
    pass();
    const out = await done;
    expect(out.say).toEqual(["You did that part well, Ava. What is 12 minus 8?"]);
    expect(t.parts).toEqual(["You did that part well, Ava.", "What is 12 minus 8?"]);
    expect(t.requests).toHaveLength(1);
  });

  it("stops at a sentence its review refuses, says nothing after it, and repairs when nothing was said", async () => {
    const t = streamed("You are not good at this. What is 12 minus 8?", (input) => input.line.startsWith("You are") ? { verdict: "fail", rules: ["unkind"], reason: "unkind" } : { verdict: "pass" });
    await t.session.start();
    t.parts.length = 0;
    const out = await t.session.child(SAVAR);
    expect(t.parts.join(" ")).not.toContain("not good");
    expect(out.say.join(" ")).not.toContain("not good");
  });

  it("never streams a first \"yes\" before code knows whether the child is right", async () => {
    const t = streamed("Yes, that's it. What is 4 minus 2?");
    await t.session.start();
    t.parts.length = 0;
    await t.session.child("is it 4?");
    expect(t.before()).toEqual([]);
  });

  it("streams a first \"not quite\" when no number the child said is right", async () => {
    const t = streamed("Not quite, 6 is 8 minus 2. What is 12 minus 8?");
    await t.session.start();
    t.parts.length = 0;
    await t.session.child("Is 2 minus 8, 6?");
    expect(t.before()).toEqual(["Not quite, 6 is 8 minus 2.", "What is 12 minus 8?"]);
  });

  it("streams other-topic talk too, holding its personal sentence for the review", async () => {
    const t = streamed("That's a fun question, and I'm an AI. What is 12 minus 8?", undefined, { reading: { offTopic: true, outsideScope: "other_topic" } });
    await t.session.start();
    t.parts.length = 0;
    const out = await t.session.child("What is your favorite animal?");
    expect(out.say).toEqual(["That's a fun question, and I'm an AI. What is 12 minus 8?"]);
    expect(t.requests.map((r) => r.line)).toEqual(["That's a fun question, and I'm an AI."]);
    expect(t.parts).toEqual(["That's a fun question, and I'm an AI.", "What is 12 minus 8?"]);
  });

  it("never streams a false equation", async () => {
    const t = streamed("12 minus 8 is 5. What is 4 minus 2?");
    await t.session.start();
    t.parts.length = 0;
    const out = await t.session.child(SAVAR);
    expect(t.parts.join(" ")).not.toContain("is 5");
    expect(out.say.join(" ")).not.toContain("is 5");
  });
});

describe("code's stance and other-topic talk (D-345, real runs of 2026-11-14)", () => {
  it("never says yes to a false equation the child says, even on a step that is done", async () => {
    const { session, briefs } = call((_, n) => n === 0 ? reply("Yes! Now the tens.", "guide") : reply("Not quite: 12 minus 8 is 4. What is 4 minus 2?", "guide"));
    await session.start();
    await session.child("12 minus 8 is 5");
    expect(JSON.stringify(briefs[1].repair)).toContain("affirms_wrong");
  });
  it("answers other-topic talk itself, with the safety review, and goes back to the math", async () => {
    const say = "That's a fun question, and I'm an AI, so I have no pets. Let's go back to 52 minus 28: what is 12 minus 8?";
    const { session, reviewer } = call(() => reply(say, "guide", { reading: { offTopic: true, outsideScope: "other_topic" } }));
    await session.start();
    const out = await session.child("What is your favorite animal?");
    expect(out.say).toEqual([say]);
    expect(reviewer.requests.map((r) => r.line)).toEqual(["That's a fun question, and I'm an AI, so I have no pets."]);
  });
  it("keeps code's redirect for outside math work", async () => {
    const { session } = call(() => reply("Sure, 7 times 8 is 56. What is 12 minus 8?", "guide", { reading: { outsideScope: "outside_work", mathRequests: [{ text: "7 times 8", operation: "multiply", operands: [{ type: "number", value: 7 }, { type: "number", value: 8 }] }] } }));
    await session.start();
    const out = await session.child("What is 7 times 8?");
    expect(out.say.join(" ")).not.toContain("56");
  });
});
