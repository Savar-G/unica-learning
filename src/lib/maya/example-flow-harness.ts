import { describe, expect, it } from "vitest";
import { createTextSession, MAX_MAYA_TURNS, type TextOutput } from "@/lib/maya-text";
import { scenarioModel } from "@/lib/maya-gate/gate";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { gateWordCount } from "@/lib/maya-gate/word-count";
import { withoutNulls, type Proposal } from "@/lib/maya";
import { claimView } from "@/lib/maya/claim";
import { spotFix, spotView } from "@/lib/maya/spot-error";
import { valueText, type OperationPackage } from "@/lib/question-package";

export function describeExampleFlowGrades(grades: readonly number[]) {
  const cases = Object.keys(FIXTURES).flatMap((fixture) =>
    grades.flatMap((grade) =>
      [false, true].flatMap((shorter) =>
        [false, true].map((fallback) => ({
          fixture: fixture as keyof typeof FIXTURES,
          grade,
          shorter,
          fallback,
        })),
      ),
    ),
  );

  describe(`R443-2: limits permit the whole example and question (grades ${grades.join(",")})`, () => {
    it.each(cases)("$fixture grade $grade shorter=$shorter fallback=$fallback", async ({ fixture, grade, shorter, fallback }) => {
      for (const seed of [1, 9, 31]) {
        // A claim question (A4) is taught as its session package: its example ends with the compare step and the word. A
        // spot-the-error question (C2) too.
        const pkg = FIXTURES[fixture].operation ? claimView(spotView(FIXTURES[fixture] as OperationPackage)) : FIXTURES[fixture];
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
        // An example longer than Maya's turns in a row (the introduction and its steps over MAX_MAYA_TURNS: the multiply
        // example 6 × 64 of a spot-the-error 7 × 640, C2) pauses once for the child, then goes on with the steps left.
        if (pkg.easierExample!.steps.length + 1 > MAX_MAYA_TURNS) {
          expect(s.session.exampleShown, `seed ${seed}`).toBeLessThan(pkg.easierExample!.steps.length);
          script.next([{ act: "example_step" }], undefined);
          check(await s.child("Okay."));
        }
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
        if (pkg.operation?.kind === "comparison") {
          // The example does not complete the child's two-sided comparison. The child must do its work in order.
          script.next([], undefined);
          check(await s.child(`The answer is ${valueText(pkg.answer!.value)}.`));
          expect(s.session.solved).toBeNull();
          expect(s.session.done).toEqual([]);
          for (const st of pkg.steps) {
            const input = st.kind === "operate" ? `${st.left} times ${st.right} is ${st.value}.`
              : st.kind === "comparison-count" ? String(st.value)
              : st.kind === "comparison" ? `${st.left} is ${st.left > st.right ? "greater" : "less"} than ${st.right}.` : null;
            if (input === null) continue;
            script.next([], undefined);
            check(await s.child(input));
          }
          expect(s.session.done).toEqual(pkg.steps.filter(st => st.kind !== "result").map(st => st.id));
          expect(s.session.solved).toBeNull();
        }
        // A claim's word is read by code, in a committed form ("It's true."), never from the model's reading.
        const word = pkg.answer!.value.type === "choice" ? pkg.answer!.value.value : null;
        // A spot-the-error word needs its fix in the same turn (spot-error.ts): "The answer is 4480, so it's no."
        const fix = spotFix(pkg as OperationPackage);
        script.next([], pkg.operation?.kind === "comparison" ? undefined : fix !== null ? { answers: [[fix, "claim", "right"]] } : word ? undefined : { answers: [[pkg.answer!.value, "result", "right"]] });
        check(await s.child(pkg.operation?.kind === "comparison" ? `The answer is ${valueText(pkg.answer!.value)}.` : fix !== null ? `The answer is ${fix}, so it's ${word}.` : word ? `It's ${word}.` : valueText(pkg.answer!.value)));
        script.next([{ act: "ask_write", understanding: "uncertain" }], undefined);
        check(await s.child("Okay."));
        script.next([], { paper: "written" });
        check(await s.child("I wrote it."));
        expect(s.session.outcome).toMatchObject({ reason: "solved", assistance: "worked_example", paperStatus: "child_confirmed" });
      }
    });
  });
}
