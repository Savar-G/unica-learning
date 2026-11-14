import { beforeAll, describe, expect, it, vi } from "vitest";
import { COMPARISON_PRACTICE } from "../maya-practice/comparison-cases";
import { createTextSession } from "../maya-text";
import { checkTrace, packageHash, type MayaTrace } from "../maya-trace";
import { openingLine } from "../maya/lines";
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
  it("accepts exact code patient replies and rejects a contaminated wait", async () => {
    const c = COMPARISON_PRACTICE.find(c => c.id === "CMP3")!;
    let now = 1000;
    const text = createTextSession({ callId: "comparison-thinking", package: FIXTURES[c.fixture], childName: "Rowan", clock: () => now,
      model: { id: "offline", promptVersion: "offline", output: 3, propose: async () => { throw new Error("offline"); } } });
    await text.start();
    for (const input of ["I'm thinking.", "I'm still thinking.", ...c.fakeScript]) if (!text.ended) { now += 1000; await text.child(input); }
    const trace = await text.finish();
    const wait = trace.turns.findIndex(t => t.kind === "maya" && t.output?.say.join(" ") === "No rush. I'm here when you're ready.");
    expect(wait).toBeGreaterThan(0);
    expect(judge(behaviour(c.fixture), JSON.stringify(trace)).failures).toEqual([]);
    for (const contamination of ["Evens win.", "No rush. I'm here when you're ready. Evens win."]) {
      const forged = structuredClone(traces.get(c.id)!), turn = forged.turns[3];
      if (turn.kind !== "maya" || !turn.output) throw new Error("missing code wait");
      turn.output.act = "wait";
      turn.output.say = [contamination];
      expect(checkTrace(forged).ok).toBe(true);
      expect(judge(behaviour(c.fixture), JSON.stringify(forged)).failures).toContainEqual(expect.objectContaining({ code: "math_not_from_code" }));
    }
  });
  it.each(COMPARISON_PRACTICE)("accepts the actual checked word for $id", c => {
    expect(judge(behaviour(c.fixture), JSON.stringify(traces.get(c.id))).failures).toEqual([]);
  });
  it.each(COMPARISON_PRACTICE.filter(c => c.id !== "CMP1"))("accepts the exact workbook opening for $id", c => {
    const original = FIXTURES[c.fixture], pkg = structuredClone(original);
    // Keep the page reference separate from the question's math in this checker regression.
    if (pkg.ref.source !== "workbook" || !pkg.answer || !pkg.operation || !pkg.easierExample) throw new Error("missing teaching package");
    pkg.ref.page = 1;
    pkg.ref.question = 1;
    const trace = structuredClone(traces.get(c.id)!);
    trace.question = { id: pkg.id, ref: pkg.ref, text: pkg.text, hash: packageHash(pkg) };
    const open = trace.turns[1];
    if (open.kind !== "maya" || !open.output) throw new Error("missing opening");
    open.output.say = [openingLine({ ...pkg, answer: pkg.answer, operation: pkg.operation, easierExample: pkg.easierExample }, { page: 1, number: 1 })];
    expect(checkTrace(trace).ok).toBe(true);
    try {
      FIXTURES[c.fixture] = pkg;
      expect(judge(behaviour(c.fixture), JSON.stringify(trace)).failures).toEqual([]);
    } finally {
      FIXTURES[c.fixture] = original;
    }
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
  it.each(COMPARISON_PRACTICE)("rejects every early spoken or drawn winner for $id", c => {
    const key = FIXTURES[c.fixture].answer!.value;
    if (key.type !== "choice" && key.type !== "text") throw new Error("missing word key");
    for (const say of [`The answer is ${key.value}.`, `Write ${key.value}.`, `${key.value} is the answer.`]) {
      const forged = structuredClone(traces.get(c.id)!);
      const turn = forged.turns[3];
      if (turn.kind !== "maya" || !turn.output) throw new Error("missing early turn");
      turn.output.say = [say];
      expect(checkTrace(forged).ok).toBe(true);
      expect(judge(behaviour(c.fixture), JSON.stringify(forged)).failures, say).toContainEqual(expect.objectContaining({ code: "answer_too_early" }));
    }
    const board = structuredClone(traces.get(c.id)!);
    const turn = board.turns[3];
    if (turn.kind !== "maya" || !turn.output) throw new Error("missing early turn");
    turn.output.board = ["early-winner"];
    board.board.push({ at: turn.at, turn: 3, transactionId: "early-winner", commands: [{ op: "write", id: "winner", text: key.value, place: { region: "main" } }] });
    expect(checkTrace(board).ok).toBe(true);
    expect(judge(behaviour(c.fixture), JSON.stringify(board)).failures).toContainEqual(expect.objectContaining({ code: "answer_too_early" }));
  });
  it.each(COMPARISON_PRACTICE)("rejects an unlisted way to name the winner for $id", c => {
    const synonym = c.id === "CMP1" ? "The statement holds." : c.id === "CMP2" ? "The first rectangle is bigger." : "Evens win.";
    for (const medium of ["speech", "board"]) {
      const forged = structuredClone(traces.get(c.id)!);
      const turn = forged.turns[3];
      if (turn.kind !== "maya" || !turn.output) throw new Error("missing early turn");
      if (medium === "speech") turn.output.say = [synonym];
      else {
        turn.output.board = ["early-synonym"];
        forged.board.push({ at: turn.at, turn: 3, transactionId: "early-synonym", commands: [{ op: "write", id: "winner", text: synonym, place: { region: "main" } }] });
      }
      expect(checkTrace(forged).ok).toBe(true);
      expect(judge(behaviour(c.fixture), JSON.stringify(forged)).failures, medium).toContainEqual(expect.objectContaining({ code: "math_not_from_code" }));
    }
  });
});
