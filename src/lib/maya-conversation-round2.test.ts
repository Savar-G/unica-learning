import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import type { TurnBrief } from "@/lib/maya-model";
import type { TraceTurn } from "@/lib/maya-trace";

// Round 2 of conversational Maya (D-341): the coordinator's real-model runs of 2026-11-12, as tests on a fake model.

const PKG = SAMPLE_PACKAGES["subtract-52-28"];
const T0 = Date.UTC(2026, 10, 12, 18, 0, 0);
const num = (value: number) => ({ type: "number", value });
const ans = (value: number, step: string) => ({ value: num(value), step, problem: "target", verdict: "right" });

function call(answer: (brief: TurnBrief, n: number) => unknown) {
  let now = T0;
  const model = conversationalFake({ answer });
  const session = createTextSession({ callId: "r2", package: PKG, model, clock: () => (now += 500), random: 3, childName: "Leo", reviewer: fakeTalkReviewer() });
  return { session, model };
}
const sources = (t: TraceTurn | undefined) => (t?.kind === "maya" ? t.attempts.map((a) => a.source) : []);
const lastMaya = (s: ReturnType<typeof call>["session"]) => s.trace().turns.filter((t) => t.kind === "maya").at(-1);

describe("C: a clear final answer is accepted in its turn", () => {
  it("'The tens are 4 minus 2, that's 2. 24!' is accepted, never confirmed", async () => {
    const { session } = call((b) => {
      if (/12 minus 8/.test(b.childTurn ?? "")) return reply("Yes, 12 minus 8 is 4. Now the tens: what is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } });
      return reply("Yes, 4 minus 2 is 2, so 52 minus 28 is 24. Please write it down.", "accept_answer", { reading: { answers: [ans(2, "tens"), ans(24, "result")] } });
    });
    await session.start();
    await session.child("Oh. 12 minus 8 is 4.");
    const out = await session.child("The tens are 4 minus 2, that's 2. 24!");
    const t = lastMaya(session);
    expect(t?.kind === "maya" && t.attempts.map((a) => a.refusal?.reason ?? null)).toEqual([null]);
    expect(out.say).toEqual(["Yes, 4 minus 2 is 2, so 52 minus 28 is 24. Please write it down."]);
    expect(sources(lastMaya(session))).toEqual(["model"]);
    expect(session.session.solved).toBe("child");
  });
  it("'Okay. The ones are 12 minus 8, 4.' credits the ones", async () => {
    const { session } = call(() => reply("Yes, 12 minus 8 is 4. Now the tens: what is 4 minus 2?", "guide", { step: "tens", reading: { answers: [ans(4, "ones")] } }));
    await session.start();
    await session.child("Okay. The ones are 12 minus 8, 4.");
    expect(session.session.done).toEqual(["ones"]);
    expect(sources(lastMaya(session))).toEqual(["model"]);
  });
});

describe("B: a long reply is cut, not repaired", () => {
  it("keeps the leading sentences that fit, with no second model call", async () => {
    const { session, model } = call(() => reply("Hi Leo. Let's look at the ones. There is a 2 on top and an 8 below it in the column. What can you do there?", "guide", { step: "ones" }));
    await session.start();
    const out = await session.child("Hi");
    expect(out.say).toEqual(["Hi Leo. Let's look at the ones. There is a 2 on top and an 8 below it in the column."]);
    expect(model.briefs).toHaveLength(1);
    expect(sources(lastMaya(session))).toEqual(["model"]);
  });
  it("refuses a first sentence that alone breaks a limit", async () => {
    const long = "Let's look very carefully together at the ones column where there is a 2 on top and an 8 below it right now today.";
    const { session } = call((b, n) => reply(n === 0 ? long : "Let's look at the ones.", "guide", { step: "ones" }));
    await session.start();
    await session.child("Hi");
    expect(sources(lastMaya(session))).toEqual(["model", "repair"]);
  });
});
