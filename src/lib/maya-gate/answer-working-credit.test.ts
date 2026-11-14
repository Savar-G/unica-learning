import { beforeAll, expect, it, vi } from "vitest";
import { judge, memoryTraceStore, runBehaviour, type Behaviour } from "@/lib/maya-gate/gate";
import { PATTERN_BEHAVIOURS } from "@/lib/maya-gate/pattern-cases";
import type { MayaTrace } from "@/lib/maya-trace";
vi.mock("server-only", () => ({}));
const saved = new Map<number, { b: Behaviour; trace: MayaTrace; childAt: number }>();
beforeAll(async () => {
  for (const [value, id] of [[10, "PT3"], [44, "PT4"], [104, "PT6"]] as const) {
    const b = PATTERN_BEHAVIOURS.find(b => b.id === id)!;
    const store = memoryTraceStore();
    expect((await runBehaviour(b, store, { freeTalk: false })).error).toBeNull();
    const trace = JSON.parse(store.load(id)!) as MayaTrace;
    expect(judge(b, JSON.stringify(trace)).failures).toEqual([]);
    const accept = trace.turns.findIndex(t => t.kind === "maya" && t.output?.act === "accept_answer");
    let childAt = accept - 1;
    while (childAt >= 0 && trace.turns[childAt].kind !== "child") childAt--;
    expect(childAt).toBeGreaterThan(0);
    saved.set(value, { b, trace, childAt });
  }
});
function failures(value: number, text: string) {
  const { b, trace, childAt } = saved.get(value)!;
  const changed = structuredClone(trace), child = changed.turns[childAt];
  if (child.kind !== "child") throw new Error("missing child");
  child.text = text;
  for (const o of changed.obligations ?? []) if (o.kind === "child_turn_pending" && o.at === child.at) o.text = text;
  return judge(b, JSON.stringify(changed)).failures;
}
it.each([
  [10, "Oh, you said 8 jumps apart. So I divide 80 by 8, and I get 10."],
  [44, "Yes, 44. You said add eight three times, so I got 24. Then 20 plus 24 is 44."],
  [44, "Yes, it's 44. I added 24 to 20."],
  [104, "Okay, 104 beads. I added the 32 at the end, like you said."],
] as const)("keeps the child's computed final %i beside instruction or working: %s", (value, text) => {
  expect(failures(value, text)).toEqual([]);
});
it.each([
  "I got 11.", "You said 10. I got 10.", "Oh, you said 10. I got 10.",
  "10, like you said.", "I think I got 10.", "Is 10 right?", "My teacher said 10.",
  "I got 10 because 80 divided by 8 is 11.", "I got 10. My answer is 11.",
  "My answer is 11. I got 10.", "I got 10. I got 11.",
  "My answer is 11. 11 minus 1 is 10. My answer is 10.",
  "My answer is 10. My answer is 11. 11 minus 1 is 10.",
  "You said to add, so 'I got 10'.",
])("still rejects improper acceptance: %s", text => {
  expect(failures(10, text)).toContainEqual(expect.objectContaining({ code: "accepted_wrong_answer" }));
});
