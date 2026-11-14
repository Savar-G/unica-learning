import { beforeAll, expect, it, vi } from "vitest";
import { judge, memoryTraceStore, runBehaviour, type Behaviour } from "./gate";
import type { MayaTrace } from "@/lib/maya-trace";

vi.mock("server-only", () => ({}));

const behaviour: Behaviour = { id: "instruction-echo", title: "own answer after an instruction", fixture: "PT_LONG", status: "passing", steps: [
  { child: "115 minus 35 is 80.", read: { start: "has_work", answers: [[80, "e1", "right"]] }, maya: [{ act: "guide", step: "result", level: 0, lines: ["check.right_step", "step.invite"] }] },
  { child: "I got 10.", read: { answers: [[10, "result", "right"]] } },
  { child: "Okay.", maya: [{ act: "ask_write", understanding: "uncertain" }] },
  { child: "I wrote it.", read: { paper: "written" } },
], expect: { outcome: { reason: "solved" } } };
let trace: MayaTrace;
beforeAll(async () => {
  const store = memoryTraceStore();
  expect((await runBehaviour(behaviour, store, { freeTalk: false })).error).toBeNull();
  trace = JSON.parse(store.load(behaviour.id)!) as MayaTrace;
  expect(judge(behaviour, JSON.stringify(trace)).failures).toEqual([]);
});

function failures(text: string) {
  // Model a bad or good controller acceptance while preserving the trace's matching child obligation.
  const changed = structuredClone(trace);
  const child = changed.turns.find(t => t.kind === "child" && t.text === "I got 10.")!;
  if (child.kind !== "child") throw new Error("missing final child turn");
  child.text = text;
  for (const o of changed.obligations ?? []) if (o.kind === "child_turn_pending" && o.at === child.at) o.text = text;
  return judge(behaviour, JSON.stringify(changed)).failures;
}

it.each([
  "You said there are 8 equal jumps, so I divide. I got 10.",
  "You said to divide 80 by 8. I got 10.",
  "You said count by 8 to 80. I got 10 jumps, so 80 divided by 8 is 10.",
  "You said to divide 80 by 8. I got 10 because 8 is 8.",
  "You said to divide 80 by 8. I got 10 because one plus one is two.",
  "You said to divide 80 by 8. I got 10 because 3/4 equals 6/8.",
  "You said to divide 80 by 8. I got 10 because two groups of four is eight.",
  "You said to divide 80 by 8. I got 10 because two equal groups of four is eight.",
])("accepts a new own answer after instruction-only attribution: %s", text => {
  expect(failures(text)).toEqual([]);
});

it.each([
  "You said 10.", "You said 10. I got 10.", "10, like you said.",
  "My teacher said 10. I got 10.", "I think I got 10.", "I got 11.", "Is 10 right?",
  "You said to divide 80 by 8. I got 10 because 80 divided by 8 is 11.",
  "You said to divide 80 by 8. I got 10. 80 divided by 8 is 11.",
  "You said to divide 80 by 8. I got 10 because 8 plus 8 is 17.",
  "You said to divide 80 by 8. I got 10. My answer is 11.",
  "You said to divide 80 by 8. I got 10 because 8 is 10.",
  "You said to divide 80 by 8. I got 10 because 80 divided by 0 is 10.",
  "You said to divide 80 by 8. I got 10 because eight is ten.",
  "You said to divide 80 by 8. I got 10 because one plus one is three.",
  "You said to divide 80 by 8. I got 10 because eight is not eight.",
  "You said to divide 80 by 8. I got 10 because 3/4 equals 1/2.",
  "You said to divide 80 by 8. I got 10 because two groups of four is nine.",
  "You said to divide 80 by 8. I got 10 because two equal groups of four is nine.",
])("still detects improper acceptance: %s", text => {
  expect(failures(text)).toContainEqual(expect.objectContaining({ code: "accepted_wrong_answer" }));
});
