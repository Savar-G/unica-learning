import { describe, expect, it, vi } from "vitest";
import { createTextSession, type TextOutput } from "@/lib/maya-text";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { gateWordCount } from "@/lib/maya-gate/word-count";
import { withoutNulls, type Proposal } from "@/lib/maya";
import { claimView } from "@/lib/maya/claim";
import { valueText, type OperationPackage } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

const cases = Object.keys(FIXTURES).flatMap((fixture) => [1, 2, 3, 4, 5, 6, 7].flatMap((grade) => [false, true].flatMap((shorter) => [false, true].map((fallback) => ({ fixture: fixture as keyof typeof FIXTURES, grade, shorter, fallback })))));

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
  it.each(cases)("$fixture grade $grade shorter=$shorter fallback=$fallback", async ({ fixture, grade, shorter, fallback }) => {
    for (const seed of [1, 9, 31]) {
      // A claim question (A4) is taught as its session package: its example ends with the compare step and the word.
      const pkg = FIXTURES[fixture].operation ? claimView(FIXTURES[fixture] as OperationPackage) : FIXTURES[fixture];
      const script = scenarioModel();
      const model = fallback ? { ...script, propose: async (...args: Parameters<typeof script.propose>) => {
        const raw = await script.propose(...args);
        return { ...(raw as object), parts: "invalid" }; // Keep priority readings and checked answers; force code's fallback.
      } } : script;
      const s = createTextSession({ callId: `sweep-${fixture}-${grade}-${shorter}-${fallback}-${seed}`, package: FIXTURES[fixture], grade, model, random: seed, clock: () => 1000 });
      const check = (out: TextOutput, limit = shorter ? 25 : grade <= 3 ? 25 : 45) => {
        for (const text of out.say) expect(gateWordCount(text), text).toBeLessThanOrEqual(limit);
      };
      script.next([{ act: "open", lines: ["open.hello"] }], undefined);
      check(await s.start(), grade <= 3 ? 25 : 45);
      if (fixture === "G" || fixture === "A_BAD_KEY") {
        expect(s.session.outcome?.reason).toBe("content_issue");
        continue; // These two fixtures are intentionally held by the package/kind checks, independently of length.
      }
      if (shorter) {
        script.next([], { shorter: true });
        check(await s.child("Please talk less."));
      }
      script.next([{ act: "example_step" }], { start: "no_start" });
      check(await s.child("I don't know how to start."));
      expect(s.session.outcome, `seed ${seed}`).toBeNull();
      expect(s.session.exampleShown, `seed ${seed}`).toBe(pkg.easierExample!.steps.length);
      const example = s.trace().turns.filter((t) => t.kind === "maya" && t.output?.act === "example_step");
      const steps = example.flatMap((t) => t.kind === "maya" ? ((withoutNulls(t.attempts.at(-1)!.proposal) as Proposal).parts).flatMap((p) => "line" in p && p.line === "example.step" ? [p.slots?.step] : []) : []);
      expect(steps, `seed ${seed}`).toEqual(pkg.easierExample!.steps.map((st) => st.id));
      if (shorter || grade <= 3) {
        const first = example[0];
        expect(first.kind === "maya" && (withoutNulls(first.attempts.at(-1)!.proposal) as Proposal).parts).toEqual([{ line: "example.intro", slots: { step: pkg.easierExample!.steps[0].id } }]);
      }
      if (fallback) expect(example.every((t) => t.kind === "maya" && t.attempts.at(-1)?.source === "fallback")).toBe(true);
      script.next([], undefined);
      check(await s.child("Let me try."));
      expect(s.session.retried).toBe(true);
      // A claim's word is read by code, in a committed form ("It's true."), never from the model's reading.
      const word = pkg.answer!.value.type === "choice" ? pkg.answer!.value.value : null;
      script.next([], word ? undefined : { answers: [[pkg.answer!.value, "result", "right"]] });
      check(await s.child(word ? `It's ${word}.` : valueText(pkg.answer!.value)));
      script.next([{ act: "ask_write", understanding: "uncertain" }], undefined);
      check(await s.child("Okay."));
      script.next([], { paper: "written" });
      check(await s.child("I wrote it."));
      expect(s.session.outcome).toMatchObject({ reason: "solved", assistance: "worked_example", paperStatus: "child_confirmed" });
    }
  });
});
