import { beforeEach, expect, it, vi } from "vitest";
import { SAFETY_GUIDANCE, TIME_LIMITS } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";

beforeEach(() => { vi.clearAllMocks(); });

const PACKAGE = SAMPLE_PACKAGES["subtract-83-46"];
const TUTOR_REPLY = "What is 13 minus 6?";

it.each(["active", "closing minute", "at the limit"] as const)(
  "gives guidance before teaching or closing when a benign fragment sits beside danger: %s",
  async (phase) => {
    for (const text of [
      "I'm scared of getting the answer wrong because my babysitter is hitting me right now.",
      "My dad is hurting me right now because I lost in the game.",
    ]) {
      let now = 0;
      const model = conversationalFake({ answer: () => ({ ...reply("", "safety"), reading: { safety: "immediate" } }) });
      const call = createTextSession({ callId: "danger", package: PACKAGE, model, tutor: true, checkedRoutine: true, clock: () => now });
      await call.start();
      now = phase === "at the limit" ? TIME_LIMITS.endAtMs : phase === "closing minute" ? TIME_LIMITS.closingAtMs : 200;
      const out = await call.child(text);
      expect(out.say[0], text).toBe(SAFETY_GUIDANCE.immediate);
      expect(out.ended).toMatchObject({ reason: "safety", safetySeverity: "immediate" });
      expect(model.briefs).toEqual([]);
    }
  },
);

it.each(["active", "closing minute", "at the limit"] as const)(
  "does not flag a corrected or explicitly fictional claim: %s",
  async (phase) => {
    for (const text of [
      "My dad hit me? No, I meant the ball.",
      "My dad is hurting me right now in the game.",
      'The book says, "I am in danger. My dad is hurting me right now."',
    ]) {
      let now = 0;
      const model = conversationalFake({ answer: () => ({ ...reply("", "safety"), reading: { safety: "immediate" } }) });
      const call = createTextSession({ callId: "not-danger", package: PACKAGE, model, tutor: true, checkedRoutine: true, clock: () => now });
      await call.start();
      now = phase === "at the limit" ? TIME_LIMITS.endAtMs : phase === "closing minute" ? TIME_LIMITS.closingAtMs : 200;
      const out = await call.child(text);
      expect(call.session.safety.flagged, text).toBe(false);
      expect(out.say).not.toContain(SAFETY_GUIDANCE.immediate);
      expect(out.say).not.toContain(SAFETY_GUIDANCE.concern);
    }
  },
);

it.each([
  ["I died in the game, but there is an emergency outside.", "immediate"],
  ["I died in the game, but my babysitter makes me undress.", "concern"],
  ["In the game I died but Uncle Jo makes me undress.", "concern"],
] as const)("honors the model safety read of a separate disclosure in %s", async (text, severity) => {
  const model = conversationalFake({ answer: () => ({ ...reply("", "safety"), reading: { safety: severity } }) });
  const call = createTextSession({ callId: "model-danger", package: PACKAGE, model, tutor: true, checkedRoutine: true, clock: () => 0 });
  await call.start();
  const out = await call.child(text);
  expect(model.briefs).toHaveLength(1);
  expect(out.say[0]).toBe(SAFETY_GUIDANCE[severity]);
  expect(out.ended).toMatchObject({ reason: "safety", safetySeverity: severity });
});

it("keeps a held child's private replies out of later tutor requests after saving and resuming", async () => {
  let now = 0;
  const model = conversationalFake({ answer: () => reply(TUTOR_REPLY, "guide") });
  const options = { callId: "private", package: PACKAGE, model, tutor: true, checkedRoutine: true, clock: () => now };
  const original = createTextSession(options);
  await original.start();
  const address = "17 Synthetic Cedar Lane.";
  const alternative = "Synthetic Juniper Lane.";
  expect((await original.child("I feel scared.")).say.join(" ")).toContain("You don't have to share private details");
  now += 200;
  expect((await original.child(address, { alternatives: [alternative] })).say.join(" ")).toContain("You don't have to share private details");
  expect(model.briefs).toEqual([]);

  now += 200;
  const saved = await original.saved().then((record) => JSON.parse(JSON.stringify(record)));
  const resumed = createTextSession({ ...options, resume: saved });
  expect(resumed.session.turns).toContainEqual(expect.objectContaining({ speaker: "child", text: address }));
  await resumed.child("Can we go back to math?");
  now += 200;
  await resumed.child("Can you show me how to trade a ten?");
  expect(model.briefs).toHaveLength(2);
  for (const brief of model.briefs) {
    expect(JSON.stringify(brief)).not.toContain(address);
    expect(JSON.stringify(brief)).not.toContain(alternative);
  }
});
