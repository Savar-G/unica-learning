import { describe, expect, it } from "vitest";
import { PHRASES, SAFETY_GUIDANCE } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";

describe("#698 round 5 review regressions", () => {
  it("keeps a safe next step when a refused reading credits a copied H3 step", async () => {
    const model = scenarioModel();
    const raw = { version: 2, act: "guide", step: "tens", level: 0,
        parts: [{ line: "check.right_step", slots: { step: "ones" } }, { line: "step.invite", slots: { step: "tens" } }],
        reading: { answers: [{ value: { type: "number", value: 16 }, step: "ones", verdict: "right" }] } };
    let now = 1000;
    const session = createTextSession({ callId: "retained-copy", package: FIXTURES.A, model, clock: () => now, random: 1 });
    await session.start();
    model.next([{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }], { help: "show" });
    now += 4000; await session.child("Show me the ones.");
    expect(session.session.ladder.hint).toBe(3);
    model.next([{ throws: true }], undefined);
    now += 4000; await session.child("Um.");
    model.next([{ raw, repair: { throws: true } }], undefined);
    now += 4000;
    const output = await session.child("I get 16 for the ones.");
    expect(output.ended?.reason).not.toBe("technical_issue");
    expect(session.session.passed).toContain("ones");
    expect(session.session.done).not.toContain("ones");
    expect(output.say.join(" ")).not.toContain("66");
  });

  it.each([false, true])("closes after safety guidance without model or bank words, free talk %s", async (freeTalk) => {
    const model = fakeMayaModel({ answer(_input, n) {
      if (n === 0) return { version: 2, act: "open", parts: [{ line: "open.hello" }] };
      if (n === 1) return { version: 2, act: "safety", parts: [], reading: { safety: "concern" } };
      return { version: 2, act: "close", parts: [{ warm: "smalltalk", pick: PHRASES.smalltalk.indexOf("Let's save the stories for later.") + 1 }] };
    } });
    const session = createTextSession({ callId: "safety-close", package: FIXTURES.A, model, clock: () => 1000, random: 1, freeTalk });
    await session.start();
    const output = await session.child("Someone at home hits me. Don't tell.");
    expect(output.ended).toMatchObject({ reason: "safety", safetyFlag: true });
    expect(output.say).toEqual([SAFETY_GUIDANCE.concern]);
  });
});
