import { describe, expect, it, vi } from "vitest";
import { allLineTexts, type Effect, type SessionEvent, type StepResult } from "@/lib/maya";
import type { MayaTrace } from "@/lib/maya-trace";
import type { OperationPackage } from "@/lib/question-package";
import { BEHAVIOURS } from "./behaviours";
import { FIXTURES } from "./fixtures";
import { HARD_FAILURES, judge, memoryTraceStore, runBehaviour, scenarioModel, type Behaviour, type HardFailure } from "./gate";

// The gate can fail (#324): a seeded bad behaviour makes it fail. Three kinds of seed: a saved trace changed after the
// run (one per hard failure, so every check can fire), a broken fake model, and a sabotaged controller injected under
// the text adapter.

/** The controller's `step`, sabotaged when `mode` is set: the text adapter imports it from "@/lib/maya". */
const sabotage = vi.hoisted(() => ({ mode: "none" as "none" | "words" | "answer" | "no_safety" }));
vi.mock("@/lib/maya", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/maya")>();
  return {
    ...real,
    step: (session: Parameters<typeof real.step>[0], event: SessionEvent): StepResult => {
      if (sabotage.mode === "no_safety" && event.type === "proposal" && typeof event.proposal === "object" && event.proposal !== null) {
        // Drops the safety field of the model's reading before the controller sees it.
        const p = event.proposal as { reading?: Record<string, unknown> | null };
        if (p.reading) event = { ...event, proposal: { ...p, reading: { ...p.reading, safety: null } } };
      }
      const r = real.step(session, event);
      if (r.refusal || (sabotage.mode !== "words" && sabotage.mode !== "answer")) return r;
      // Rewrites an accepted guide's words after the controller checked them.
      const text = sabotage.mode === "words" ? "27 plus 39 is 56." : ANSWER_LINE;
      const effects = r.effects.map((e): Effect => (e.kind === "say" && e.act === "guide" ? { ...e, text } : e));
      return { ...r, effects };
    },
  };
});

const byId = (id: string) => BEHAVIOURS.find((b) => b.id === id)!;
/** A code line for fixture A that says the answer 66 (a real line, said too early). */
const ANSWER_LINE = allLineTexts(FIXTURES.A as OperationPackage).find((t) => /\b66\b/.test(t) && !/\b(56|16)\b/.test(t))!;

async function savedTrace(b: Behaviour): Promise<MayaTrace> {
  const store = memoryTraceStore();
  await runBehaviour(b, store);
  return JSON.parse(store.load(b.id)!) as MayaTrace;
}
const codes = (b: Behaviour, trace: unknown) => [...new Set(judge(b, JSON.stringify(trace)).failures.map((f) => f.code))];
const mayaAt = (t: MayaTrace, n: number) => t.turns.filter((x) => x.kind === "maya")[n] as Extract<MayaTrace["turns"][number], { kind: "maya" }>;

describe("each hard failure can fail the gate (a saved trace changed after the run)", () => {
  const seeds: [HardFailure, string, (t: MayaTrace) => unknown][] = [
    ["trace_invalid", "C02", (t) => ({ ...t, version: 99 })],
    ["unchecked_output", "C02", (t) => { mayaAt(t, 1).output!.say = ["You are so smart."]; return t; }],
    ["math_not_from_code", "C02", (t) => { mayaAt(t, 1).output!.say = ["27 plus 39 is 56."]; return t; }],
    ["math_not_from_code", "C07", (t) => { (t.board[0].commands as { operands: { value: string }[] }[])[0].operands[0].value = "28"; return t; }],
    ["wrong_outcome", "C02", (t) => ({ ...t, outcome: { ...t.outcome!, assistance: "independent" } })],
    ["accepted_wrong_answer", "C07", (t) => {
      const c = t.turns.find((x) => x.kind === "child")!;
      if (c.kind === "child") c.text = "7 plus 9 is 16, so I carried a ten. I got 56.";
      return t;
    }],
    ["hint_skipped", "C02", (t) => { (mayaAt(t, 3).attempts.at(-1)!.proposal as { level: number }).level = 4; return t; }],
    ["hint_skipped", "C06", (t) => { (mayaAt(t, 7).attempts.at(-1)!.proposal as { level: number }).level = 1; return t; }],
    ["answer_too_early", "C02", (t) => { mayaAt(t, 1).output!.say = [ANSWER_LINE]; return t; }],
    ["safety_not_taken", "C30", (t) => ({ ...t, outcome: { ...t.outcome!, safetyFlag: false, reason: "child_stopped" } })],
    ["continued_after_stop", "C17", (t) => { mayaAt(t, 4).output!.act = "guide"; return t; }],
    ["over_time", "C35", (t) => ({ ...t, outcome: { ...t.outcome!, seconds: 700 } })],
    ["flow_mismatch", "C07", (t) => { mayaAt(t, 1).output!.act = "guide"; return t; }],
  ];

  it("lists every hard failure in the seeds", () => {
    const seeded = new Set([...seeds.map(([code]) => code), "missing_trace"]);
    expect([...seeded].sort()).toEqual(Object.keys(HARD_FAILURES).sort());
  });

  it("passes the unchanged traces", async () => {
    for (const id of new Set(seeds.map(([, id]) => id))) expect(codes(byId(id), await savedTrace(byId(id))), id).toEqual([]);
  });

  it.each(seeds.map(([code, id, change], i) => [`${code} (${id}, seed ${i})`, code, id, change] as const))("%s", async (_, code, id, change) => {
    const b = byId(id);
    expect(codes(b, change(await savedTrace(b)))).toContain(code);
  });

  it("missing_trace: a run with no saved trace fails", () => {
    expect(judge(byId("C01"), undefined).failures.map((f) => f.code)).toEqual(["missing_trace"]);
  });
});

describe("a broken fake model makes the gate fail", () => {
  it("a model that always fails: the fallbacks keep the child safe, but the behaviour's outcome is not reached", async () => {
    const b = byId("C07");
    const store = memoryTraceStore();
    const model = scenarioModel();
    const broken = { ...model, propose: async () => { throw new Error("the model is down"); } };
    await runBehaviour(b, store, { model: broken });
    const found = judge(b, store.load(b.id)).failures.map((f) => f.code);
    expect(found).toContain("wrong_outcome");
    expect(found).toContain("flow_mismatch");
    // Nothing unchecked reached the child: the fallbacks are code's.
    expect(found).not.toContain("unchecked_output");
  });

  it("a model that reads a disclosure as nothing: the safety path is not taken", async () => {
    const b = byId("C30");
    const blind: Behaviour = { ...b, steps: b.steps.map((s) => ("child" in s && s.read?.safety ? { ...s, read: {} } : s)) };
    const store = memoryTraceStore();
    await runBehaviour(blind, store);
    expect(judge(b, store.load(b.id)).failures.map((f) => f.code)).toContain("safety_not_taken");
  });
});

describe("a sabotaged controller makes the gate fail", () => {
  const run = async (mode: typeof sabotage.mode, id: string) => {
    sabotage.mode = mode;
    try {
      const store = memoryTraceStore();
      await runBehaviour(byId(id), store);
      return [...new Set(judge(byId(id), store.load(id)).failures.map((f) => f.code))];
    } finally {
      sabotage.mode = "none";
    }
  };

  it("the controller untouched: the gate passes", async () => {
    expect(await run("none", "C02")).toEqual([]);
  });

  it("words changed after the check: unchecked output and math not from code", async () => {
    const found = await run("words", "C02");
    expect(found).toContain("unchecked_output");
    expect(found).toContain("math_not_from_code");
  });

  it("a real code line said too early: the answer before it was released", async () => {
    expect(await run("answer", "C02")).toContain("answer_too_early");
  });

  it("the safety reading dropped: the safety path is not taken", async () => {
    expect(await run("no_safety", "C30")).toContain("safety_not_taken");
  });
});
