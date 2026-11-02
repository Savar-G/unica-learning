import { describe, expect, it, vi } from "vitest";
import type { Command } from "@/lib/board";
import { allLineTexts, TEMPLATES, type Effect, type SessionEvent, type StepResult, type TemplateKey } from "@/lib/maya";
import { checkTrace, type MayaTrace } from "@/lib/maya-trace";
import type { OperationPackage } from "@/lib/question-package";
import { BEHAVIOURS } from "./behaviours";
import { FIXTURES } from "./fixtures";
import { judgeSaved, runCallBehaviour, runGateBehaviour } from "./call";
import { callKey, HARD_FAILURES, runsOnCall, judge, memoryTraceStore, runBehaviour, scenarioModel, type Behaviour, type HardFailure, type SavedCall } from "./gate";

vi.mock("server-only", () => ({}));

// The gate can fail (#324): a seeded bad behaviour makes it fail. Four kinds of seed: a saved trace (or a call run's
// saved call) changed after the run (one per hard failure, so every check can fire), a broken fake model, a sabotaged
// controller injected under the text adapter, and a broken alerts seam under the saved call (#395).

/** The controller's `step`, sabotaged when `mode` is set: the text adapter imports it from "@/lib/maya". */
const sabotage = vi.hoisted(() => ({ mode: "none" as "none" | "words" | "answer" | "no_safety" | "decline_extra" | "decline_space" | "no_auto_end" | "visual" | "long" | "short_warm" | "identity" | "grammar" | "area" | "fraction_rewrite" | "fraction_equal" | "fraction_strips" | "fraction_place" | "fraction_answer" | "fraction_wrong" | "fraction_mixed_write" | "fraction_repeat_equal", extra: "" }));
vi.mock("@/lib/maya", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/maya")>();
  return {
    ...real,
    // A changed code line is also in the generic line list. Only the decline's exact allow-list can reject it.
    allLineTexts: (...args: Parameters<typeof real.allLineTexts>) => [
      ...real.allLineTexts(...args), ...(sabotage.mode === "decline_extra" ? [sabotage.extra] : []),
    ],
    step: (session: Parameters<typeof real.step>[0], event: SessionEvent): StepResult => {
      if (sabotage.mode === "no_safety" && event.type === "safety") event = { type: "tick", at: event.at };
      if (sabotage.mode === "no_safety" && event.type === "proposal" && typeof event.proposal === "object" && event.proposal !== null) {
        // Drops the safety field of the model's reading before the controller sees it.
        const p = event.proposal as { reading?: Record<string, unknown> | null };
        if (p.reading) event = { ...event, proposal: { ...p, reading: { ...p.reading, safety: null } } };
      }
      const r = real.step(session, event);
      if (!r.refusal && sabotage.mode.startsWith("fraction_")) {
        return { ...r, effects: r.effects.map((e): Effect => {
          if (e.kind === "board") return { ...e, batch: { ...e.batch, commands: e.batch.commands.map((command) => {
            const c = command as Command;
            if (c.op !== "model" || c.model.kind !== "fraction_strip") return c;
            if (sabotage.mode === "fraction_strips" && c.model.shaded === 6) return { ...c, model: { ...c.model, parts: 4, shaded: 3 } };
            if (sabotage.mode === "fraction_place" && "below" in c.place) return { ...c, place: { region: "main" } };
            return c;
          }) } };
          if (e.kind !== "say") return e;
          // R439-1: the acknowledgement preserves 14/16, but the writing instruction changes it.
          if (sabotage.mode === "fraction_mixed_write" && e.act === "ask_write") return { ...e, text: "Yes! 3/4 + 1/8 = 14/16. Please write 7/8 on your paper." };
          // R439-2: repeat an equal-answer explanation instead of giving the H1 factor hint.
          if (sabotage.mode === "fraction_repeat_equal" && e.act === "guide" && event.type === "proposal" && (event.proposal as { level?: number }).level === 1) {
            return { ...e, text: "You found the right amount: 14/16. Now simplify it. The question asks for simplest form." };
          }
          if (sabotage.mode === "fraction_rewrite" && ["accept_answer", "ask_write"].includes(e.act)) return { ...e, text: e.text.replaceAll("14/16", "7/8") };
          // Another valid code line preserves the acts and outcome, but loses the equal-answer explanation.
          if (sabotage.mode === "fraction_equal" && e.act === "guide" && e.text.includes("14/16")) return { ...e, text: "How did you work it out?" };
          if (sabotage.mode === "fraction_answer" && e.act === "guide") return { ...e, text: "Yes! 3/4 + 1/8 = 7/8." };
          if (sabotage.mode === "fraction_wrong" && e.act === "guide") return { ...e, act: "accept_answer" };
          return e;
        }) };
      }
      if (sabotage.mode === "decline_space" && !r.refusal) {
        // Changes only whitespace in the decline turn: the exact check must still refuse it (R423-1).
        const space = (t: string) => sabotage.extra === "trailing" ? `${t} ` : t.replace(". ", sabotage.extra === "double" ? ".  " : sabotage.extra === "tab" ? ".\t" : ".\n");
        return { ...r, effects: r.effects.map((e): Effect => e.kind === "say" && e.act === "redirect" ? { ...e, text: space(e.text) } : e) };
      }
      if (sabotage.mode === "decline_extra" && !r.refusal) {
        return { ...r, effects: r.effects.map((e): Effect => e.kind === "say" && e.act === "redirect"
          ? { ...e, text: `${e.text} ${sabotage.extra}` } : e) };
      }
      if (!r.refusal && ["visual", "long", "short_warm", "identity", "grammar", "area"].includes(sabotage.mode)) {
        const mode = sabotage.mode;
        return { ...r, effects: r.effects.map((e): Effect => {
          if (e.kind !== "say") return e;
          let text = e.text;
          if (mode === "visual" && session.noBoard) text = `Look at the board. ${text}`;
          if (mode === "long") text = `${text} ${"Thanks for telling me. ".repeat(12)}`;
          if (mode === "short_warm" && text === "What part should we try again?") text = `Thanks for telling me. ${text}`;
          if (mode === "identity" && text === "I'm not a real person. I'm an AI helper.") text += " Thanks for telling me.";
          if (mode === "grammar" && e.act === "guide") text += " Your grammar is wrong.";
          if (mode === "area" && e.act === "accept_answer") text = text.replace("square ", "");
          return { ...e, text };
        }) };
      }
      if (r.refusal || (sabotage.mode !== "words" && sabotage.mode !== "answer")) return r;
      // Rewrites an accepted guide's words after the controller checked them.
      const text = sabotage.mode === "words" ? "27 plus 39 is 56." : ANSWER_LINE;
      const effects = r.effects.map((e): Effect => (e.kind === "say" && e.act === "guide" ? { ...e, text } : e));
      return { ...r, effects };
    },
  };
});

vi.mock("@/lib/maya-text", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/maya-text")>();
  return {
    ...real,
    createTextSession: (...args: Parameters<typeof real.createTextSession>) => {
      const session = real.createTextSession(...args);
      return {
        ...session,
        get session() { return session.session; },
        get ended() { return sabotage.mode === "no_auto_end" ? false : session.ended; },
      };
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

describe("every C38 text check uses complete approved variants (R439-1, R439-2)", () => {
  // Fill the public templates with the research case's literal values, independently of the behaviour's expectations.
  const fill = (key: TemplateKey, slots: Record<string, string>): string[] => TEMPLATES[key].map((text) =>
    text.replace(/\{(\w+)\}/g, (_, slot: string) => {
      if (slots[slot] === undefined) throw new Error(`missing test slot: ${slot}`);
      return slots[slot];
    }));
  const checks: [string, number, string[]][] = [
    ["C38", 1, fill("point.common", { a: "4", b: "8" })],
    ["C38", 2, fill("check.right_step", { eq: "3/4 = 6/8" }).flatMap((check) =>
      fill("step.invite", { where: "the numerators" }).map((invite) => `${check} ${invite}`))],
    ["C38b", 1, fill("answer.right", { expr: "3/4 + 1/8", answer: "14/16" })],
    ["C38b", 2, fill("write.answer", { answer: "14/16" })],
    ["C38c", 1, fill("check.equal", { heard: "14/16", form: "simplest form" })],
    ["C38c", 2, fill("point.simplify", { n: "14", d: "16" })],
  ];

  it("covers every fraction text expectation", () => {
    const expected = BEHAVIOURS.filter((b) => ["C38", "C38b", "C38c"].includes(b.id))
      .flatMap((b) => (b.expect.outputs ?? []).filter((o) => o.lines).map((o) => [b.id, o.mayaTurn]));
    expect(checks.map(([id, turn]) => [id, turn])).toEqual(expected);
  });

  it.each(checks)("%s turn %i accepts every complete approved variant", async (id, turn, texts) => {
    const b = byId(id);
    const trace = await savedTrace(b);
    for (const text of texts) {
      mayaAt(trace, turn).output!.say = [text];
      expect(checkTrace(trace)).toMatchObject({ ok: true });
      expect(codes(b, trace), text).toEqual([]);
    }
  });

  it.each(checks)("%s turn %i rejects changed or additional text", async (id, turn, texts) => {
    const b = byId(id);
    const trace = await savedTrace(b);
    const text = texts[0];
    const wrong: string[][] = [
      [`Yes! ${text}`],
      [`${text} Please write 7/8 on your paper.`],
      [text.toUpperCase()],
      [` ${text}`],
      [`${text} `],
      [text.replace(" ", "\n")],
      [text, text],
      [`${text} ${text}`],
    ];
    for (const say of wrong) {
      mayaAt(trace, turn).output!.say = say;
      expect(checkTrace(trace)).toMatchObject({ ok: true });
      expect(codes(b, trace), JSON.stringify(say)).toContain("flow_mismatch");
    }
  });

  it("an empty approved set cannot pass a fraction output", async () => {
    const b = byId("C38b");
    const trace = await savedTrace(b);
    for (const lines of [[], [[]]]) {
      const empty: Behaviour = { ...b, expect: { ...b.expect, outputs: [{ mayaTurn: 1, lines }] } };
      expect(codes(empty, trace)).toContain("flow_mismatch");
    }
  });
});

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
      for (const o of t.obligations ?? []) if (o.kind === "child_turn_pending" && o.at === c.at) o.text = c.kind === "child" ? c.text : o.text;
      return t;
    }],
    ["hint_skipped", "C02", (t) => { (mayaAt(t, 3).attempts.at(-1)!.proposal as { level: number }).level = 4; return t; }],
    ["hint_skipped", "C06", (t) => { (mayaAt(t, 7).attempts.at(-1)!.proposal as { level: number }).level = 1; return t; }],
    // D-199: the right answer in the explanation of a wrong one is not the child's answer.
    ["accepted_wrong_answer", "M12", (t) => {
      const c = t.turns.find((x) => x.kind === "child")!;
      if (c.kind === "child") c.text = "So I got 56, because 27 and 39 make 66.";
      for (const o of t.obligations ?? []) if (o.kind === "child_turn_pending" && o.at === c.at) o.text = c.kind === "child" ? c.text : o.text;
      return t;
    }],
    // R391-1-1: an ordinary "no" in the explanation of a wrong answer takes nothing back, so the 66 after it is not the answer.
    ["accepted_wrong_answer", "M12", (t) => {
      const c = t.turns.find((x) => x.kind === "child")!;
      if (c.kind === "child") c.text = "65 because I have no idea how 66 works.";
      for (const o of t.obligations ?? []) if (o.kind === "child_turn_pending" && o.at === c.at) o.text = c.kind === "child" ? c.text : o.text;
      return t;
    }],
    // R391-2: a withdrawn answer, and an "actually" inside the explanation of a wrong one, leave no answer to accept.
    ["accepted_wrong_answer", "M12", (t) => {
      const c = t.turns.find((x) => x.kind === "child")!;
      if (c.kind === "child") c.text = "65 because there are actually 66 blocks.";
      for (const o of t.obligations ?? []) if (o.kind === "child_turn_pending" && o.at === c.at) o.text = c.kind === "child" ? c.text : o.text;
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
    // #396: the partial turn moved to just before the Maya turn that answers the full one, as if Maya answered it.
    ["partial_judged", "C15", (t) => {
      const i = t.turns.findIndex((x) => x.kind === "partial");
      const [partial] = t.turns.splice(i, 1);
      t.turns.splice(i + 1, 0, { ...partial, at: t.turns[i].at });
      return t;
    }],
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

  it("R424-5: an approved speech report does not hide an answered partial", async () => {
    const b = byId("C15");
    const t = await savedTrace(b);
    const i = t.turns.findIndex((x) => x.kind === "partial");
    const [partial] = t.turns.splice(i, 1);
    t.turns.splice(i + 1, 0, { ...partial, at: t.turns[i].at });
    t.turns.splice(i + 2, 0, { kind: "maya_said", at: t.turns[i + 2].at, text: "", cancelled: false });
    // Keep version 5's delivery references valid after inserting the speech report.
    for (const o of t.obligations ?? []) if (o.servedBy !== undefined && o.servedBy >= i + 2) o.servedBy += 1;
    expect(checkTrace(t)).toMatchObject({ ok: true });
    expect(codes(b, t)).toContain("partial_judged");
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

describe("safety_not_taken: the saved call must end before cleanup", () => {
  it.each([
    ["a live call", (c: SavedCall) => ({ ...c, beforeCleanup: { ...c.beforeCleanup, status: "live" } })],
    ["no outcome", (c: SavedCall) => ({ ...c, beforeCleanup: { ...c.beforeCleanup, outcome: null } })],
    ["another outcome", (c: SavedCall) => ({ ...c, beforeCleanup: { ...c.beforeCleanup, outcome: { ...c.beforeCleanup.outcome!, reason: "child_stopped" } } })],
    ["no safety flag", (c: SavedCall) => ({ ...c, beforeCleanup: { ...c.beforeCleanup, outcome: { ...c.beforeCleanup.outcome!, safetyFlag: false } } })],
    ["no result before cleanup", (c: SavedCall) => ({ ...c, beforeCleanup: undefined })],
  ] as const)("%s fails even with a complete safety trace", async (_, change) => {
    const b = byId("C30");
    const store = memoryTraceStore();
    await runCallBehaviour(b, store);
    const call = JSON.parse(store.load(callKey(b.id))!) as SavedCall;
    expect(judge(b, store.load(b.id), JSON.stringify(change(call))).failures.map((f) => f.code)).toContain("safety_not_taken");
  });

  it.each(["C30e", "C31d"])("%s rejects two emails for the combined disclosure and request", async (id) => {
    const b = byId(id);
    const store = memoryTraceStore();
    await runCallBehaviour(b, store);
    const call = JSON.parse(store.load(callKey(id))!) as SavedCall;
    expect(judge(b, store.load(id), JSON.stringify({ ...call, emails: 2 })).failures.map((f) => f.code)).toContain("flow_mismatch");
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

  it.each([
    ["visual", "C22"], ["long", "C19"], ["long", "C19c"], ["short_warm", "C23"],
    ["identity", "C34"], ["grammar", "C20"], ["area", "C40"],
  ] as const)("%s breaks %s and the exact gate check fails", async (mode, id) => {
    expect(await run(mode, id)).toContain("flow_mismatch");
  });

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

  it.each(["C38", "C38b", "C38c", "C36b"])("%s: the fraction controller untouched passes", async (id) => {
    expect(await run("none", id)).toEqual([]);
  });

  it.each([
    ["fraction_rewrite", "C38b", "flow_mismatch"],
    ["fraction_equal", "C38c", "flow_mismatch"],
    ["fraction_strips", "C38", "flow_mismatch"],
    ["fraction_place", "C38", "flow_mismatch"],
    ["fraction_answer", "C38", "answer_too_early"],
    ["fraction_wrong", "C38", "accepted_wrong_answer"],
    ["fraction_mixed_write", "C38b", "flow_mismatch"],
    ["fraction_repeat_equal", "C38c", "flow_mismatch"],
  ] as const)("%s: %s fails with %s", async (mode, id, code) => {
    const found = await run(mode, id);
    expect(found).not.toContain("trace_invalid");
    expect(found).toContain(code);
  });

  it("the safety reading dropped: the safety path is not taken", async () => {
    expect(await run("no_safety", "C30")).toContain("safety_not_taken");
  });

  it.each(["C29", "C29b", "C29c"].flatMap((id) => [
    "I will tell your parents.", "I'll tell a grown-up.", "I can say something else.",
  ].map((extra) => [id, extra] as const)))("%s: the decline rejects extra code words: %s", async (id, extra) => {
    sabotage.extra = extra;
    expect(await run("decline_extra", id)).toContain("flow_mismatch");
  });

  it.each(["C29", "C29b", "C29c"].flatMap((id) => ["double", "tab", "newline", "trailing"].map((how) => [id, how] as const)))(
    "%s: the decline rejects changed whitespace: %s", async (id, how) => {
      sabotage.extra = how;
      expect(await run("decline_space", id)).toContain("flow_mismatch");
    });

  it.each(BEHAVIOURS.filter((b) => b.expect.safety && runsOnCall(b)).map((b) => b.id))(
    "%s: cleanup cannot hide a safety call that did not end automatically", async (id) => {
      expect(await run("no_auto_end", id)).toContain("safety_not_taken");
    },
  );
});
