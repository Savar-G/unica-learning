// The way out of a missing number (review of #732, lessons 7 and 10): after the top hint, a copy or a request for help
// brings the easier example, then the honest close. No answer, no given answer, and the stuck step is the call's
// learning event. Driven through the text adapter with the gate's scripted model.
import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { learningEvent } from "@/lib/maya/session";

vi.mock("server-only", () => ({}));

async function stuckAfterTopHint(copy: string) {
  const script = scenarioModel();
  const s = createTextSession({ callId: `mn-close-${copy}`, package: FIXTURES.M_TRY, grade: 5, model: script, clock: () => 1000 });
  script.next([{ act: "open", lines: ["open.hello"] }], undefined);
  await s.start();
  script.next([{ act: "guide", level: 1 }], { start: "has_work", help: "more" });
  await s.child("I'm stuck.");
  script.next([{ act: "guide", level: 2 }], { help: "more" });
  await s.child("I still don't get it.");
  script.next([{ act: "guide", level: 3 }], { help: "more" });
  await s.child("Can you show me?");
  script.next([{ act: "give_answer", repair: { act: "example_step" } }], { answers: [[1180, "try", "wrong"]] });
  const example = await s.child(copy);
  script.next([{ act: "give_answer", repair: { act: "close" } }], { help: "more" });
  const close = await s.child("I'm stuck.");
  return { s, example, close };
}

describe("the honest close of a missing number", () => {
  it("after H3, a copy read as its product brings the easier example, then the honest close; the stuck step is the learning event", async () => {
    const { s, example, close } = await stuckAfterTopHint("236 times 5 is 1180.");
    expect(example.say.join(" ")).toContain("101 × ? = 202");
    expect(close.say.join(" ")).toContain("We worked on 236 × ? = 1416 together today.");
    expect(close.say.join(" ")).not.toMatch(/\b6\b/);
    expect(s.session.outcome).toMatchObject({ reason: "child_stopped" });
    expect(s.session.assistance).not.toContain("answer_given");
    expect(learningEvent(s.session, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank", stuckStep: "try" });
  });
});
