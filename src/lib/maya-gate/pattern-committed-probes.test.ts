import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { FIXTURES } from "./fixtures";
import { scenarioModel } from "./gate";

vi.mock("server-only", () => ({}));

describe("pattern committed miss probes", () => {
  for (const throws of [false, true]) {
    for (const [said, counts] of [["5.", true], ["It's 5.", true], ["I think it's 5.", false], ["Is it 5?", false], ["Help, 5.", false], ["My mom said 5.", false]] as const) {
      it(`${throws ? "offline" : "give answer"}: ${said}`, async () => {
        const model = scenarioModel();
        const text = createTextSession({ callId: `pattern-probe-${throws}-${said}`, package: FIXTURES.PT_LONG, model, clock: () => 1000, random: 1 });
        model.next([], undefined);
        await text.start();
        for (let i = 0; i < 4; i++) {
          model.next([{ throws: true }], { start: "has_work", help: "more" });
          await text.child("Help me.");
        }
        const step = text.session.ladder.step;
        model.next(throws ? [{ throws: true }] : [{ act: "give_answer" }], { start: "has_work", answers: [[5, step, "wrong"]] });
        await text.child(said);
        expect(text.session.ladder.failures, said).toBe(counts ? 1 : 0);
        expect(text.session.assistance).not.toContain("answer_given");
      });
    }
  }
});
