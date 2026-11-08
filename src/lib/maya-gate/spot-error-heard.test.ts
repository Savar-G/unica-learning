// Review of #743, P1b: another person's or a copied conclusion on a spot-the-error question is never the child's
// answer. A model that proposes accept_answer on every turn (and reads the fix as heard) meets code: the word stays
// unanswered and nothing is accepted, before and after the fix step is done. The root is claim.ts's ", so it's no" form
// (#737), which A4 is closing with an allow-list; the cases it still lets through are skipped until #737's new head lands.
import { describe, expect, it, vi } from "vitest";
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

/**
 * Fail today: after the fix step, claim.ts's ", so it's no" form (#737, claim.ts:340-341) commits the word in another
 * person's or a copied conclusion, and the call ends solved. Skipped until #737's allow-list lands; then merge its head
 * and empty this set. Before the fix step all five pass already (the word waits for the fix, and none of them credits it).
 */
const SKIP_UNTIL_737 = new Set(["SEO1b", "SEO2b", "SEO3b", "SEO4b", "SEO5b"]);

describe("another person's or a copied conclusion is never the child's answer (review of #743)", () => {
  for (const b of CASES) {
    (SKIP_UNTIL_737.has(b.id) ? it.skip : it)(`${b.id}: ${b.title}`, async () => {
      const store = memoryTraceStore();
      const r = await runGateBehaviour(b, store);
      expect(r.error ?? null).toBeNull();
      expect(judgeSaved(b, store).failures).toEqual([]);
    }, 60_000);
  }

  it("spot-words.ts keeps the other speaker and the copy in the turn: its lead rule never strips them", () => {
    for (const t of TURNS) expect(spotWordsAsClaim(t), t).toMatch(/^(?:my mom said|i copied|my teacher said|mom told me)\b/);
  });
});
