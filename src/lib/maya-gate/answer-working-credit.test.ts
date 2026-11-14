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
  [10, "I got 10. I added 7 and 9 to get 16, like you said."],
  [10, "I got 10. I subtracted 3 from 15 to get 12."],
  [10, "I got 10. I multiplied 3 by 4 to get 12."],
  [10, "I got 10. I divided 36 by 3 to get 12."],
  [10, "I got 10. I added 7.5 and 9.5 to get 17."],
  [10, "I got 10. I added 1,000 and 2,000 to get 3,000."],
  [10, "I got 10. I subtracted 1,000 from 3,000 to get 2,000."],
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
  "I got 10. I did 2 plus 2 is 5, like you said.",
  "I got 10. I did 6 times 2 is 13, like you said.",
  "I got 10. I added 11 and 1 to get 11, like you said.",
  "I got 10. Oh, you said 2 plus 3 is 7.",
  "I got 10. I got 11 as my final answer. 11 minus 1 is 10.",
  "I got 11 as my final answer. I got 10. 11 minus 1 is 10.",
  "I got 10. I got 11 for the answer. 11 minus 1 is 10.",
  "I got 10. My final answer is 11. 11 minus 1 is 10.",
  "I got 10. I subtracted 3 from 15 to get 18.",
  "I got 10. I multiplied 3 by 4 to get 11.",
  "I got 10. I divided 36 by 0 to get 12.",
  "I got 10. I added 7.5 and 9.5 to get 17.5.",
  "I got 10. I added 1,000 and 2,000 to get 3,001.",
  "I got 10. I subtracted 1,000 from 3,000 to get 2,001.",
])("still rejects improper acceptance: %s", text => {
  expect(failures(10, text)).toContainEqual(expect.objectContaining({ code: "accepted_wrong_answer" }));
});
it("keeps an unverified multi-addend working form on the strict path", () => {
  // A known checker gap: this repair verifies two-term past-tense working only.
  expect(failures(10, "I got 10. I added 7 and 9 and 1 to get 17.")).toContainEqual(expect.objectContaining({ code: "accepted_wrong_answer" }));
});
