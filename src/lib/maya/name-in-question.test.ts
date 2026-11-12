// F1 (practice pass 2026-11-12, PTP4): a question that holds the child's own name ("Leo has 32 beads ...") is read back
// intact. The trace hides the child's name as {name} for privacy; it must not hide the name inside the question's own
// words, or the read-back no longer matches its approved line and the output checks fail (unchecked_output,
// math_not_from_code). A real personalised workbook can use the child's name in a story.
import { describe, expect, it } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { PATTERN_FIXTURES } from "@/lib/maya-gate/pattern-cases";
import { GATE_T0, judge, scenarioModel, type Behaviour } from "@/lib/maya-gate/gate";

describe("a question that holds the child's name (F1)", () => {
  it("reads the question back with the name, and the saved trace passes the output checks", async () => {
    const pkg = PATTERN_FIXTURES.PT_STORY;
    expect(pkg.text).toMatch(/\bLeo\b/);
    let now = GATE_T0;
    const model = scenarioModel("name-in-question");
    const call = createTextSession({ callId: "name-in-question", package: pkg, model, clock: () => now, random: 1, grade: 3, childName: "Leo", freeTalk: false });
    model.next([{ act: "open", lines: ["open.hello", "question.read"] }], undefined);
    const out = await call.start();
    expect(out.say.join(" ")).toMatch(/Leo has 32 beads/);
    now += 4000;
    model.next([], undefined);
    await call.child("Can you read it again?");
    const trace = await call.finish("the test ended");
    const said = trace.turns.flatMap((t) => (t.kind === "maya" && t.output ? t.output.say : [])).join(" ");
    expect(said).toMatch(/Leo has 32 beads/);
    expect(said).not.toMatch(/\{name\} has 32 beads/);
    const b: Behaviour = { id: "name-in-question", title: "F1", fixture: "PT_STORY", status: "passing", steps: [], expect: { outcome: {} } };
    const failures = judge(b, JSON.stringify(trace)).failures.filter((f) => ["unchecked_output", "math_not_from_code"].includes(f.code));
    expect(failures).toEqual([]);
  });

  it("still hides the child's name everywhere else in the trace", async () => {
    let now = GATE_T0;
    const model = scenarioModel("name-elsewhere");
    const call = createTextSession({ callId: "name-elsewhere", package: PATTERN_FIXTURES.PT_STORY, model, clock: () => now, random: 1, grade: 3, childName: "Leo", freeTalk: false });
    model.next([], undefined);
    await call.start();
    now += 4000;
    model.next([], undefined);
    await call.child("Hi, I'm Leo. 8 times 9 is 72.");
    const trace = await call.finish("the test ended");
    const child = trace.turns.find((t) => t.kind === "child") as { text: string };
    expect(child.text).toBe("Hi, I'm {name}. 8 times 9 is 72.");
  });
});
