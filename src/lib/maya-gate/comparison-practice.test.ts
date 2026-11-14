import { beforeAll, describe, expect, it, vi } from "vitest";
import { COMPARISON_PRACTICE } from "../maya-practice/comparison-cases";
import { createTextSession } from "../maya-text";
import type { MayaTrace } from "../maya-trace";
import { FIXTURES } from "./fixtures";
import { comparisonWords, type ComparisonOperation } from "../question-package-comparison";
import { judge, type Behaviour } from "./gate";

vi.mock("server-only", () => ({}));
const traces = new Map<string, MayaTrace>();
const confirmed = new Map<string, MayaTrace>();
beforeAll(async () => {
  for (const c of COMPARISON_PRACTICE) {
    let now = 1000;
    const text = createTextSession({ callId: c.id, package: FIXTURES[c.fixture], clock: () => now,
      model: { id: "offline", promptVersion: "offline", output: 3, propose: async () => { throw new Error("offline"); } } });
    await text.start();
    for (const input of c.fakeScript) if (!text.ended) { now += 1000; await text.child(input); }
    traces.set(c.id, await text.finish());
    now = 1000;
    const sayBack = createTextSession({ callId: `${c.id}-say-back`, package: FIXTURES[c.fixture], clock: () => now,
      model: { id: "offline", promptVersion: "offline", output: 3, propose: async () => { throw new Error("offline"); } } });
    await sayBack.start();
    const script = c.fakeScript.flatMap(input => input.startsWith("The answer is ") ? [input.slice(14).replace(/\.$/, ""), "Yes."] : [input]);
    for (const input of script) if (!sayBack.ended) { now += 1000; await sayBack.child(input); }
    confirmed.set(c.id, await sayBack.finish());
  }
});
const behaviour = (fixture: Behaviour["fixture"]): Behaviour => ({ id: "comparison", title: "comparison gate", fixture,
  status: "passing", steps: [], expect: { outcome: { reason: "solved" } } });

/** Preserve a structurally valid trace while falsifying what the child said before acceptance. */
function changeChild(trace: MayaTrace, text: string, predicate?: (s: string) => boolean): MayaTrace {
  const out = structuredClone(trace);
  const acceptance = out.turns.findIndex(t => t.kind === "maya" && t.output?.act === "accept_answer");
  const prior = out.turns.slice(0, acceptance).findLast(t => t.kind === "child" && (!predicate || predicate(t.text)));
  if (!prior || prior.kind !== "child") throw new Error("missing child evidence");
  prior.text = text;
  for (const o of out.obligations ?? []) if (o.kind === "child_turn_pending" && o.at === prior.at) o.text = text;
  return out;
}

describe("the practice gate checks comparison words and their prior work", () => {
  it("gives each simultaneous fake case its own persona script", () => {
    expect(new Set(COMPARISON_PRACTICE.map(c => c.persona.name)).size).toBe(3);
  });
  it.each(COMPARISON_PRACTICE)("accepts the actual checked word for $id", c => {
    expect(judge(behaviour(c.fixture), JSON.stringify(traces.get(c.id))).failures).toEqual([]);
  });
  it.each(COMPARISON_PRACTICE)("rejects a wrong or uncommitted label for $id", c => {
    const trace = traces.get(c.id)!;
    const other = comparisonWords(FIXTURES[c.fixture].operation as ComparisonOperation)[1];
    for (const input of [`The answer is ${other}.`, "The answer is wrong.", "Yes.", "Maybe true?", "Maya said the answer is true.", "I copied true."]) {
      const forged = changeChild(trace, input);
      expect(judge(behaviour(c.fixture), JSON.stringify(forged)).failures, input).toContainEqual(expect.objectContaining({ code: "accepted_wrong_answer" }));
    }
  });
  it.each(COMPARISON_PRACTICE)("rejects missing relation work for $id", c => {
    const forged = changeChild(traces.get(c.id)!, "I'm not sure.", input => /is greater than/.test(input));
    expect(judge(behaviour(c.fixture), JSON.stringify(forged)).failures).toContainEqual(expect.objectContaining({ code: "accepted_wrong_answer" }));
  });
  it.each(COMPARISON_PRACTICE)("accepts yes only after the exact label confirmation for $id", c => {
    const trace = confirmed.get(c.id)!;
    expect(judge(behaviour(c.fixture), JSON.stringify(trace)).failures).toEqual([]);
    const forged = structuredClone(trace);
    const acceptance = forged.turns.findIndex(t => t.kind === "maya" && t.output?.act === "accept_answer");
    const confirmation = forged.turns.slice(0, acceptance).findLast(t => t.kind === "maya" && t.output?.act === "confirm");
    if (!confirmation || confirmation.kind !== "maya") throw new Error("missing label confirmation");
    for (const a of confirmation.attempts) {
      const p = a.proposal as { parts?: { line?: string }[] } | null;
      for (const part of p?.parts ?? []) if (part.line === "confirm.word") part.line = "question.problem";
    }
    expect(judge(behaviour(c.fixture), JSON.stringify(forged)).failures).toContainEqual(expect.objectContaining({ code: "accepted_wrong_answer" }));
  });
});
