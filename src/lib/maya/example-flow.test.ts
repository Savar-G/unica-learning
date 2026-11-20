import { describe, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { gateWordCount } from "@/lib/maya-gate/word-count";
import { withoutNulls, type Proposal } from "@/lib/maya";
import { describeExampleFlowGrades } from "@/lib/maya/example-flow-harness";

vi.mock("server-only", () => ({}));

describe("R443-2: limits permit the whole example and question", () => {
  it("keeps the first step owed after a checkpoint at the introduction", async () => {
    const script = scenarioModel();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let pause = false;
    const model = { ...script, propose: async (...args: Parameters<typeof script.propose>) => {
      const input = args[0];
      if (pause && input.state === "MODEL_EXAMPLE" && input.offers.some((o) => o.lines.some((l) => l.line === "example.step"))) {
        entered.resolve();
        await release.promise;
      }
      return script.propose(...args);
    } };
    const s = createTextSession({ callId: "split-example", package: FIXTURES.B, grade: 1, model, clock: () => 1000 });
    script.next([{ act: "open", lines: ["open.hello"] }], undefined);
    await s.start();
    pause = true;
    script.next([{ act: "example_step" }], { start: "no_start" });
    const pending = s.child("I don't know how to start.");
    await entered.promise;
    expect(s.session).toMatchObject({ exampleIntroduced: true, exampleShown: 0, expect: "maya" });
    const saved = JSON.parse(JSON.stringify(await s.saved()));
    await s.technical("checkpoint handed to another driver");
    release.resolve();
    await pending;
    const resumedModel = scenarioModel();
    const resumed = createTextSession({ callId: "split-example", package: FIXTURES.B, grade: 7, model: resumedModel, clock: () => 1000, resume: saved });
    expect(resumed.session).toMatchObject({ grade: 1, exampleIntroduced: true, exampleShown: 0, expect: "maya" });
    const out = await resumed.start();
    expect(resumed.session.exampleShown).toBe(FIXTURES.B.easierExample!.steps.length);
    expect(resumed.session.outcome).toBeNull();
    for (const text of out.say) expect(gateWordCount(text), text).toBeLessThanOrEqual(25);
    const intros = resumed.trace().turns.filter((t) => t.kind === "maya" && t.output && (withoutNulls(t.attempts.at(-1)!.proposal) as Proposal).parts.some((p) => "line" in p && p.line === "example.intro"));
    expect(intros).toHaveLength(1);
  });
});

// Grades 1–2 run here; grades 3–7 run in parallel in example-flow-{g34,g56,g7}.test.ts.
describeExampleFlowGrades([1, 2]);
