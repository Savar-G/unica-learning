import { beforeAll, expect, it, vi } from "vitest";
import { judge, memoryTraceStore, runBehaviour, type Behaviour } from "@/lib/maya-gate/gate";
import type { MayaTrace } from "@/lib/maya-trace";
vi.mock("server-only", () => ({}));
// Each fixture's right final answer: the gate must read the child's own final from the stated words, apart from operands.
const FIX = { A: [66, 2], EV_STORY: [450, 4], SHAPES: [11, 4], PVD: [3, 4], PVV: [80000, 4] } as const;
type Fx = keyof typeof FIX;
const saved = new Map<Fx, { b: Behaviour; trace: MayaTrace; at: number }>();
beforeAll(async () => {
  for (const fx of Object.keys(FIX) as Fx[]) {
    const [v, grade] = FIX[fx];
    const b = { id: `class-${fx}`, title: "own final", fixture: fx, grade, status: "passing", steps: [
      { child: `I got ${v}.`, read: { start: "has_work", answers: [[v, "result", "right"]] } },
      { child: "I wrote it.", read: { paper: "written" } },
    ], expect: { outcome: { reason: "solved" } } } as unknown as Behaviour;
    const store = memoryTraceStore();
    expect((await runBehaviour(b, store, { freeTalk: false })).error).toBeNull();
    const trace = JSON.parse(store.load(b.id)!) as MayaTrace;
    expect(judge(b, JSON.stringify(trace)).failures).toEqual([]);
    saved.set(fx, { b, trace, at: trace.turns.findIndex(t => t.kind === "child" && t.text === `I got ${v}.`) });
  }
});
function failures(fx: Fx, text: string) {
  const { b, trace, at } = saved.get(fx)!;
  const changed = structuredClone(trace), child = changed.turns[at];
  if (child.kind !== "child") throw new Error("missing child");
  const before = child.text;
  child.text = text;
  for (const o of changed.obligations ?? []) if (o.kind === "child_turn_pending" && o.text === before) o.text = text;
  return judge(b, JSON.stringify(changed)).failures;
}
const bad = (fx: Fx, text: string) => expect(failures(fx, text)).toContainEqual(expect.objectContaining({ code: "accepted_wrong_answer" }));
// Captured practice words (practice 980), each a child's own final stated beside an instruction or working.
it.each([
  ["A", "You said 2 plus 3 plus 1 is 6, so I got 66."],
  ["A", "Like you said, the ten goes to the tens. So the tens is 6, and it's 66."],
  ["A", "I got 66! I already wrote it on my paper. I did 7 plus 9 is 16, so I wrote 6."],
  ["EV_STORY", "You said to do 1040 minus 590, so I got 450."],
  ["A", "I got 66! I added 7 and 9 to get 16, then carried the ten."],
  ["A", "You said the tens make 6, so I got 66!"],
  ["SHAPES", "My answer is 11. The hexagon has 6 lines of symmetry, and the pentagon has 5."],
  ["SHAPES", "I got 11. The hexagon has 6 lines, the pentagon has 5, so 6 plus 5 is 11."],
  ["SHAPES", "I got 11. A hexagon has 6 lines of symmetry and a pentagon has 5, so 6 plus 5 is 11."],
  ["PVD", "Okay. You said fourth from the right. Ones, tens, hundreds, thousands. So it's the 3!"],
  ["PVD", "You said to count from the right, so I got 3. It's the 3!"],
  ["PVV", "Oh! You said there are 8 of them, so it's 80000."],
  ["PVV", "You said 8 times 10,000, so I got 80,000."],
  // Own final first or last, beside working or instruction.
  ["A", "66. You said to add the ones first."],
  ["A", "You said to add the ones first, then the tens. I got 66."],
] as [Fx, string][])("keeps the child's own final beside instruction or working (%s): %s", (fx, text) => {
  expect(failures(fx, text)).toEqual([]);
});
// Controls: the guards stay closed.
it.each([
  ["A", "I got 56."], ["A", "You said 66."], ["A", "You said 66, so I got 66."], ["A", "66, like you said."],
  ["A", 'You said, "so I got 66".'], ['A', 'You said "I got 66".'], ["A", "You said so I got 66, I think."],
  ["A", "I think I got 66."], ["A", "Is 66 right?"], ["A", "My teacher said 66."],
  ["A", "I got 66. My answer is 56."], ["A", "My answer is 56. I got 66."], ["A", "I got 66. I got 56."],
  ["A", "My answer is 66.I got 56"], ["A", "I got 66 because 7 plus 9 is 17."], ["A", "You said 2 plus 3 is 7, so I got 66."],
  ["A", "I got 66, or maybe 56."], ["A", "You said the tens make 6, so I got 56!"],
  ["EV_STORY", "You said to do 1040 minus 590, so I got 460."], ["SHAPES", "I got 11. The hexagon has 6 lines, the pentagon has 5, so 6 plus 5 is 12."],
  ["PVV", "You said 80000."], ["PVV", "You said there are 8 of them, so it's 8000."], ["PVD", "You said to count from the right, so I got 4."],
] as [Fx, string][])("still rejects improper acceptance (%s): %s", (fx, text) => bad(fx, text));
