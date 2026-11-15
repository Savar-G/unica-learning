import { describe, expect, it } from "vitest";
import { SAFETY_GUIDANCE } from "@/lib/maya";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type TextOutput } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import type { OperationPackage } from "@/lib/question-package";

// A known safety concern cuts in at once (review of #1002, Chief of Staff 2026-11-14): code's guidance never waits for a
// model call, with the tutor core on or off. Every model call is held until the test lets it answer.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const tick = () => new Promise((r) => setTimeout(r, 20));

function held(tutor: boolean) {
  const answers: ((v: unknown) => void)[] = [];
  let guidance: TextOutput | null = null;
  let callsAtGuidance: number | null = null;
  const model = conversationalFake({ answer: () => new Promise((resolve) => { answers.push(resolve); }) });
  const session = createTextSession({ callId: `cut-in-${tutor}`, package: PKG, model, tutor, clock: () => 10_000, turnBudgetMs: 60_000,
    onGuidance: (out) => { guidance = out; callsAtGuidance = answers.length; } });
  const answerAll = (v: unknown) => { for (const a of answers.splice(0)) a(v); };
  return { session, answers, answerAll, guidance: () => guidance, callsAtGuidance: () => callsAtGuidance };
}

describe("a known safety concern cuts in at once", () => {
  it.each([true, false])("gives code's guidance before any model call (tutor %s)", async (tutor) => {
    const t = held(tutor);
    await t.session.start();
    const work = t.session.safety("concern");
    await tick();
    expect(t.guidance()?.say).toContain(SAFETY_GUIDANCE.concern);
    expect(t.callsAtGuidance()).toBe(0);
    // The close comes after the guidance.
    t.answerAll(reply("Thank you for telling me. Bye for now.", "close"));
    await work;
  });

  it.each([true, false])("cuts in while the model call for the child's turn still runs (tutor %s)", async (tutor) => {
    const t = held(tutor);
    await t.session.start();
    const turn = t.session.child("I need help with the ones");
    await tick();
    expect(t.answers).toHaveLength(1);
    const work = t.session.safety("concern");
    await tick();
    // The guidance came while the earlier call is still held.
    expect(t.guidance()?.say).toContain(SAFETY_GUIDANCE.concern);
    expect(t.callsAtGuidance()).toBe(1);
    // The late answer to the earlier turn changes nothing.
    t.answerAll(reply("What is 12 minus 8?", "guide"));
    await tick();
    t.answerAll(reply("Thank you for telling me. Bye for now.", "close"));
    await Promise.all([turn, work]);
    const said = t.session.trace().turns.flatMap((x) => (x.kind === "maya" ? x.output?.say ?? [] : []));
    expect(said).not.toContain("What is 12 minus 8?");
    const checked = checkTrace(await t.session.finish({ reason: "child_stopped" }));
    expect(checked.ok ? "ok" : checked.reason).toBe("ok");
  });
});

// Review of #1033: a code-only safety turn holds exactly one guidance message.
describe("the trace check of a code-only safety turn", () => {
  it("refuses repeated guidance and accepts one", async () => {
    const model = conversationalFake({ answer: () => reply("", "close") });
    const session = createTextSession({ callId: "trace-guidance", package: SAMPLE_PACKAGES["subtract-52-28"], model, channel: "chat", clock: () => 10000 });
    await session.start();
    await session.safety("concern");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace).ok).toBe(true);
    const guidance = trace.turns.find((t) => t.kind === "maya" && t.output?.act === "safety");
    if (!guidance || guidance.kind !== "maya" || !guidance.output) throw new Error("missing safety turn");
    guidance.output.say = [SAFETY_GUIDANCE.concern, SAFETY_GUIDANCE.concern];
    expect(checkTrace(trace).ok).toBe(false);
  });
});
