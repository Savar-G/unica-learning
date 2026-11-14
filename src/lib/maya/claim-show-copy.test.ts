// Re-review (2026-11-12): after Maya shows a claim's step at H3 (CLAIM_TF, 6 × 8: "Multiply the ones: 6 × 8 = 48."), the
// child's "48." only says back what she showed: it credits neither that step nor the claim's result, which has the same
// value. A show on an evaluate part (EV_TWO e1) is refused before it happens, so nothing there is a copy.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { CHILD_MS, GATE_T0, scenarioModel, type Plan, type Read } from "@/lib/maya-gate/gate";

async function play(text: string, read: Read | null) {
  let now = GATE_T0;
  const model = scenarioModel("claim-show");
  const call = createTextSession({ callId: "claim-show", package: FIXTURES.CLAIM_TF, model, clock: () => now, random: 1, grade: 4, freeTalk: false });
  model.next([], undefined);
  await call.start();
  now += CHILD_MS;
  model.next([{ act: "guide", step: "r1-ones", level: 3, lines: ["step.show"] }], { help: "show" });
  await call.child("Show me.");
  expect(call.session.shows?.["r1-ones"]).toBe(1);
  now += CHILD_MS;
  model.next(read === null ? ([{ throws: true }, { throws: true }] as Plan[]) : [], read ?? undefined);
  await call.child(text);
  return call.session.done;
}

describe("a copy of a claim's shown step credits nothing", () => {
  it.each(["48.", "It's 48.", "You said 48."])("%j after the show of 6 × 8 = 48", async (text) => {
    for (const read of [{ answers: [[48, "r1-ones", "right"]] } as Read, null]) {
      const done = await play(text, read);
      expect(done, `${text} ${read ? "model" : "fallback"}`).not.toContain("r1-ones");
      expect(done).not.toContain("claim");
    }
  });
});
