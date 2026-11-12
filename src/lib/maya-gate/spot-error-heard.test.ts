// Review of #743, P1b: another person's or a copied conclusion on a spot-the-error question is never the child's
// answer. A model that proposes accept_answer on every turn (and reads the fix as heard) meets code: the word stays
// unanswered and nothing is accepted, before and after the fix step is done. The root is claim.ts's ", so it's no" form
// (#737), which uses an allow-list for the child's own work.
import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { scenarioModel } from "./gate";
import { FIXTURES } from "./fixtures";
import { judgeSaved, runGateBehaviour } from "./call";
import { memoryTraceStore, type Behaviour, type Read, type Step } from "./gate";
import { spotWordsAsClaim } from "@/lib/maya/spot-words";

vi.mock("server-only", () => ({}));

const TURNS = [
  "My mom said 4480, so it's wrong.",
  "I copied 4480, so it's not right.",
  "My teacher said it's 4480, so it's wrong.",
  "Mom told me, so it's wrong.",
  "I copied it, so it's wrong.",
] as const;

/** The model accepts on every turn, and reads the fix as heard when the turn names it. */
const accepting = (text: string, read: Read = {}): Step => ({
  child: text, read: { ...read, ...(text.includes("4480") ? { answers: [[4480, "claim", "right"]] } : {}) } as Read, maya: [{ act: "accept_answer" }],
});
const stop: Step = { child: "Can we stop now?", read: { stop: true } };

function behaviour(id: string, turn: string, afterFix: boolean): Behaviour {
  const steps = afterFix
    ? [{ child: "7 times 640 is 4480.", read: { start: "has_work", answers: [[4480, "claim", "right"]] }, maya: [{ act: "guide", step: "result", level: 0 }] } as Step, accepting(turn), stop]
    : [accepting(turn, { start: "has_work" }), stop];
  return {
    id, title: `${afterFix ? "after" : "before"} the fix: ${turn}`, fixture: "SPOT_MUL", status: "passing", steps,
    expect: { outcome: { reason: "child_stopped" }, never: ["accept_answer", "give_answer"] },
  } as Behaviour;
}

const CASES = TURNS.flatMap((turn, i) => [behaviour(`SEO${i + 1}a`, turn, false), behaviour(`SEO${i + 1}b`, turn, true)]);

describe("another person's or a copied conclusion is never the child's answer (review of #743)", () => {
  for (const b of CASES) {
    it(`${b.id}: ${b.title}`, async () => {
      const store = memoryTraceStore();
      const r = await runGateBehaviour(b, store);
      expect(r.error ?? null).toBeNull();
      expect(judgeSaved(b, store).failures).toEqual([]);
    }, 60_000);
  }

  it.each(TURNS)("does not credit or count another speaker with the model down: %s", async (turn) => {
    for (const afterFix of [false, true]) {
      const model = scenarioModel();
      const text = createTextSession({ callId: `seo-down-${afterFix}-${turn}`, package: FIXTURES.SPOT_MUL, model, clock: () => 1000, random: 1 });
      model.next([], undefined);
      await text.start();
      if (afterFix) {
        model.next([{ throws: true }], { start: "has_work", answers: [[4480, "claim", "right"]] });
        await text.child("7 times 640 is 4480.");
      }
      const before = text.session.done.slice();
      model.next([{ throws: true }], { start: "has_work", answers: [[4480, "claim", "right"]] });
      const result = await text.child(turn);
      expect(text.session.done).toEqual(before);
      expect(text.session.finalMisses ?? 0).toBe(0);
      expect(text.session.ladder.failures).toBe(0);
      expect(text.session.solved).toBeNull();
      expect(text.session.outcome?.reason).not.toBe("technical_issue");
      expect(result.say.length).toBeGreaterThan(0);
      expect(result.ended?.reason).not.toBe("technical_issue");
    }
  }, 60_000);

  it("spot-words.ts keeps the other speaker and the copy in the turn: its lead rule never strips them", () => {
    for (const t of TURNS) expect(spotWordsAsClaim(t), t).toMatch(/^(?:my mom said|i copied|my teacher said|mom told me)\b/);
  });
});
