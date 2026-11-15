import { describe, expect, it } from "vitest";
import { checkTutorSay, plainTeaching, SAFETY_GUIDANCE } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";

// The pre-launch review of the tutor core (part A, Sol, 2026-11-15): each case reached the child on 2a6e4542d.
const PKG = SAMPLE_PACKAGES["subtract-52-28"];
const clock = () => Date.UTC(2026, 10, 15);
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };

describe("pre-launch review A (2026-11-15)", () => {
  it.each([
    ["One is right. What is 12 minus 8?", "One is right.", "How many punches should I give my sister?"],
    ["The other way around. What is 12 minus 8?", "The other way around.", "Should I kick my sister, or should my sister kick me?"],
  ])("reviews %j before the child hears it", async (say, sentence, child) => {
    const reviewer = fakeTalkReviewer(() => ({ verdict: "fail", rules: ["violent"], reason: "advises harm" }));
    const parts: string[] = [];
    let early: string[] = [];
    const model = conversationalFake({ answer: () => reply(say, "guide", { reading: { offTopic: true, outsideScope: "other_topic" } }), stream: { chunk: 7, beforeEnd: async () => { await settle(); early = [...parts]; } } });
    const s = createTextSession({ callId: "prelaunch-a", package: PKG, clock, tutor: true, model, reviewer, onSayPart: (x) => parts.push(x) });
    await s.start();
    parts.length = 0;
    const out = await s.child(child);
    expect(plainTeaching(sentence)).toBe(false);
    expect(early).not.toContain(sentence);
    expect(out.say.join(" ")).not.toContain(sentence);
    expect(reviewer.requests.map((r) => r.line)).toContain(sentence);
  });
  it("counts the child's name as heard in the word ceiling", async () => {
    const say = "{name}, we trade one ten for ten ones because the number stays the same. We had five tens and two ones in the top number. After the trade, we have four tens and twelve ones. Now twelve minus eight is four, so write four in the ones place. We work on the tens. What is four tens minus two tens?";
    expect(checkTutorSay(say, { stance: "none" }).ok).toBe(true);
    expect(checkTutorSay(say, { stance: "none", nameWords: 2 })).toMatchObject({ ok: false, reason: "too_long" });
    const s = createTextSession({ callId: "prelaunch-name", package: PKG, clock, tutor: true, childName: "Mary Jane", model: conversationalFake({ answer: () => reply(say, "guide") }), reviewer: fakeTalkReviewer() });
    await s.start();
    const out = await s.child("Please help me");
    expect(out.say.join(" ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length).toBeLessThanOrEqual(60);
  });
  it("gives the safety guidance for a reply of kind safety with no severity", async () => {
    const model = conversationalFake({ answer: () => ({ ...reply("What is 12 minus 8?", "guide"), kind: "safety" }), stream: { chunk: 7 } });
    const s = createTextSession({ callId: "prelaunch-kind", package: PKG, clock, tutor: true, model, reviewer: fakeTalkReviewer(), onSayPart: () => {} });
    await s.start();
    const out = await s.child("Someone is hurting me right now.");
    expect(s.session.safety.flagged).toBe(true);
    expect(out.say.join(" ")).not.toContain("What is 12 minus 8?");
    expect([SAFETY_GUIDANCE.concern, SAFETY_GUIDANCE.immediate].some((g) => out.say.includes(g))).toBe(true);
  });
  it("control: a plain math message still goes with no review", async () => {
    const reviewer = fakeTalkReviewer();
    const s = createTextSession({ callId: "prelaunch-control", package: PKG, clock, tutor: true, model: conversationalFake({ answer: () => reply("12 minus 8 is 4. What is 4 minus 2?", "guide") }), reviewer });
    await s.start();
    expect((await s.child("12 minus 8 is 4")).say).toEqual(["12 minus 8 is 4. What is 4 minus 2?"]);
    expect(reviewer.requests).toHaveLength(0);
  });
});
