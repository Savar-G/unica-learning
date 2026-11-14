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

// Re-review: only a whole question sentence said word for word keeps the name; a name-only clause ("Ana, Ben and Cy",
// "Mia:") never lets the name through in Maya's other words.
import { redactTrace } from "@/lib/maya-trace";
describe("the trace keeps the name only inside a whole question sentence (F1 re-review)", () => {
  const trace = (question: string, say: string[]) => ({ kind: "maya-trace", question: { text: question }, turns: [{ kind: "maya", attempts: [], output: { act: "open", say, board: [] } }] }) as never;
  const said = (t: unknown) => (t as { turns: { output: { say: string[] } }[] }).turns[0].output.say;
  it.each([
    ["Ana", "Ana, Ben and Cy share 12 apples. How many does each get?", ["Hi Ana! Let's read it.", "It says: Ana, Ben and Cy share 12 apples.", "Good work, Ana."]],
    ["Mia", "Mia: 4 boxes of 6 pens. How many pens?", ["Hi Mia! Let's read it.", "It says: Mia: 4 boxes of 6 pens.", "Good work, Mia."]],
  ])("%s", (name, question, say) => {
    const out = said(redactTrace(trace(question, say), name));
    expect(out[0]).toBe("Hi {name}! Let's read it.");
    expect(out[1]).toContain(question.split(/(?<=[.?!])\s+/)[0]);
    expect(out[2]).toBe("Good work, {name}.");
  });
});
