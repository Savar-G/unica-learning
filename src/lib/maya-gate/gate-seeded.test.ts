import { describe, expect, it, vi } from "vitest";
import { allLineTexts, type Effect, type SessionEvent, type StepResult } from "@/lib/maya";
import type { MayaTrace } from "@/lib/maya-trace";
import type { OperationPackage } from "@/lib/question-package";
import { BEHAVIOURS } from "./behaviours";
import { FIXTURES } from "./fixtures";
import { judgeSaved, runCallBehaviour, runGateBehaviour } from "./call";
import { callKey, HARD_FAILURES, judge, memoryTraceStore, runBehaviour, scenarioModel, type Behaviour, type HardFailure, type SavedCall } from "./gate";

vi.mock("server-only", () => ({}));

// The gate can fail (#324): a seeded bad behaviour makes it fail. Four kinds of seed: a saved trace (or a call run's
// saved call) changed after the run (one per hard failure, so every check can fire), a broken fake model, a sabotaged
// controller injected under the text adapter, and a broken alerts seam under the saved call (#395).

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
/** A code line for fixture A that brings the child back to the question: a math line. */
const BACK_LINE = allLineTexts(FIXTURES.A as OperationPackage).find((t) => /^Let's get back to /.test(t))!;

/** The saved calls of the last runs, by behaviour id: a changed trace is judged with its run's call. */
const calls = new Map<string, string | undefined>();
async function savedTrace(b: Behaviour): Promise<MayaTrace> {
  const store = memoryTraceStore();
  await runGateBehaviour(b, store);
  calls.set(b.id, store.load(callKey(b.id)));
  return JSON.parse(store.load(b.id)!) as MayaTrace;
}
const codes = (b: Behaviour, trace: unknown, call = calls.get(b.id)) => [...new Set(judge(b, JSON.stringify(trace), call).failures.map((f) => f.code))];
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
    // D-199: the right answer in the explanation of a wrong one is not the child's answer.
    ["accepted_wrong_answer", "M12", (t) => {
      const c = t.turns.find((x) => x.kind === "child")!;
      if (c.kind === "child") c.text = "So I got 56, because 27 and 39 make 66.";
      return t;
    }],
    // R391-1-1: an ordinary "no" in the explanation of a wrong answer takes nothing back, so the 66 after it is not the answer.
    ["accepted_wrong_answer", "M12", (t) => {
      const c = t.turns.find((x) => x.kind === "child")!;
      if (c.kind === "child") c.text = "65 because I have no idea how 66 works.";
      return t;
    }],
    // R391-2: a withdrawn answer, and an "actually" inside the explanation of a wrong one, leave no answer to accept.
    ["accepted_wrong_answer", "M12", (t) => {
      const c = t.turns.find((x) => x.kind === "child")!;
      if (c.kind === "child") c.text = "65 because there are actually 66 blocks.";
      return t;
    }],
    // D-199: the final step's answer after only one wrong final answer (the first one read right instead).
    ["hint_skipped", "M14", (t) => {
      (mayaAt(t, 3).attempts.at(-1)!.proposal as { reading: { answers: { value: unknown }[] } }).reading.answers[0].value = { type: "number", value: 66 };
      return t;
    }],
    ["answer_too_early", "C02", (t) => { mayaAt(t, 1).output!.say = [ANSWER_LINE]; return t; }],
    ["safety_not_taken", "C30", (t) => ({ ...t, outcome: { ...t.outcome!, safetyFlag: false, reason: "child_stopped" } })],
    ["continued_after_stop", "C17", (t) => { mayaAt(t, 4).output!.act = "guide"; return t; }],
    ["over_time", "C35", (t) => ({ ...t, outcome: { ...t.outcome!, seconds: 700 } })],
    ["flow_mismatch", "C07", (t) => { mayaAt(t, 1).output!.act = "guide"; return t; }],
    // D-197: free talk the trace says passed both checks, but with free talk off, with math in it, or beside a math line.
    ["free_talk_unchecked", "FT1", (t) => ({ ...t, freeTalk: false })],
    ["free_talk_unchecked", "FT1", (t) => {
      const m = mayaAt(t, 1);
      m.attempts.at(-1)!.talk = [{ proposed: "27 plus 39 is 56.", code: null, review: "pass", shown: "27 plus 39 is 56." }];
      m.output!.say = ["27 plus 39 is 56."];
      return t;
    }],
    ["free_talk_unchecked", "FT1", (t) => { const m = mayaAt(t, 1); m.output!.say = [...m.output!.say, BACK_LINE]; return t; }],
  ];

  it("lists every hard failure in the seeds", () => {
    const seeded = new Set([...seeds.map(([code]) => code), "missing_trace", "alert_missing"]);
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

describe("alert_missing: a flagged call with no alert record fails the gate (#395)", () => {
  const run = async (id: string) => {
    const store = memoryTraceStore();
    await runCallBehaviour(byId(id), store);
    return { trace: store.load(id)!, call: JSON.parse(store.load(callKey(id))!) as SavedCall };
  };
  const found = (id: string, trace: string, call: unknown) => [...new Set(judge(byId(id), trace, call === undefined ? undefined : JSON.stringify(call)).failures.map((f) => f.code))];

  it("passes the unchanged call runs", async () => {
    for (const id of ["C29", "C30", "C31", "V1", "V1b"]) {
      const { trace, call } = await run(id);
      expect(found(id, trace, call), id).toEqual([]);
    }
  });

  it.each([
    ["the alert record removed", "C30", (c: SavedCall) => ({ ...c, alerts: [], next: [] })],
    ["the alert record of a harmful request removed", "C29", (c: SavedCall) => ({ ...c, alerts: [], next: [] })],
    ["the stored flag removed", "C31", (c: SavedCall) => ({ ...c, flag: null })],
    ["the stored flag lower than the trace's", "C32", (c: SavedCall) => ({ ...c, flag: { ...c.flag!, level: "safety_concern" } })],
    ["two records for one level", "C30", (c: SavedCall) => ({ ...c, next: [...c.next, ...c.next] })],
    ["no saved call", "C30", () => undefined],
  ] as const)("%s (%s)", async (_, id, change) => {
    const { trace, call } = await run(id);
    expect(found(id, trace, change(call))).toContain("alert_missing");
  });

  it("a text run of a flagged behaviour (no call, so no alert) fails", async () => {
    const store = memoryTraceStore();
    await runBehaviour(byId("C30"), store);
    expect(judgeSaved(byId("C30"), store).failures.map((f) => f.code)).toContain("alert_missing");
  });

  it("an alerts seam that never sends: the flag is stored with no alert record", async () => {
    const store = memoryTraceStore();
    await runCallBehaviour(byId("C31"), store, { alerts: { send: async () => {}, list: async () => [] } });
    expect(judgeSaved(byId("C31"), store).failures.map((f) => f.code)).toContain("alert_missing");
  });

  it("V1's alert sent at once, with no refusal: the run does not match V1", async () => {
    const store = memoryTraceStore();
    await runCallBehaviour({ ...byId("V1"), alert: undefined }, store);
    expect(judgeSaved(byId("V1"), store).failures.map((f) => f.code)).toContain("flow_mismatch");
  });
});

describe("a broken fake model makes the gate fail", () => {
  it("a model that always fails: the fallbacks keep the child safe, but the behaviour's outcome is not reached", async () => {
    const b = byId("C07");
    const store = memoryTraceStore();
    const model = scenarioModel();
    const broken = { ...model, propose: async () => { throw new Error("the model is down"); } };
    await runGateBehaviour(b, store, { model: broken });
    const found = judgeSaved(b, store).failures.map((f) => f.code);
    expect(found).toContain("wrong_outcome");
    expect(found).toContain("flow_mismatch");
    // Nothing unchecked reached the child: the fallbacks are code's.
    expect(found).not.toContain("unchecked_output");
  });

  it("a model that reads a disclosure as nothing: the safety path is not taken", async () => {
    const b = byId("C30");
    const blind: Behaviour = { ...b, steps: b.steps.map((s) => ("child" in s && s.read?.safety ? { ...s, read: {} } : s)) };
    const store = memoryTraceStore();
    await runGateBehaviour(blind, store);
    expect(judgeSaved(b, store).failures.map((f) => f.code)).toContain("safety_not_taken");
  });
});

describe("a sabotaged controller makes the gate fail", () => {
  const run = async (mode: typeof sabotage.mode, id: string) => {
    sabotage.mode = mode;
    try {
      const store = memoryTraceStore();
      await runGateBehaviour(byId(id), store);
      return [...new Set(judgeSaved(byId(id), store).failures.map((f) => f.code))];
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
