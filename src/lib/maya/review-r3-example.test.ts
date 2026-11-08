import { expect, it } from "vitest";
import { createSession, step, fallbacks, type SessionEvent } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { createTextSession } from "@/lib/maya-text";
import { fakeMayaModel } from "@/lib/maya-model-fake";

it("always accepts a fallback across H3 and the example copy for grades 2 and 4", async () => {
  for (const grade of [2, 4]) {
    let at = 1000;
    const model = fakeMayaModel({ answer: (input) => {
      if (input.state === "OPEN") return { version: 2, act: "open", parts: [{ line: "open.hello" }, { line: "question.problem" }] };
      const id = input.childTurn === "Show me the ones." ? "ones" : input.childTurn === "Show me the tens." ? "tens" : null;
      if (id) return { version: 2, act: "guide", step: id, level: 3, parts: [{ line: "step.show", slots: { step: id } }], reading: { help: "show" } };
      throw new Error("review fake provider unavailable");
    } });
    const adapter = createTextSession({ callId: `adapter-${grade}`, package: FIXTURES.A, model, clock: () => at, grade });
    await adapter.start();
    for (const text of ["Show me the ones.", "16.", "Show me the tens.", "6.", "I'm stuck.", "33."]) {
      at += 4000;
      const output = await adapter.child(text);
      expect(output.ended?.reason, `grade ${grade}: ${text}`).not.toBe("technical_issue");
    }
  }
});

it("always finds a fallback for H3, passed columns and example readings", () => {
  const cases = ["", "Okay.", "Yes.", "I see.", "I'm stuck.", "Help.", "Maybe 15.", "16.", "6.", "33.", "65."];
  for (const stage of ["h3", "passed", "example"] as const) {
    for (const text of cases) {
      let session = createSession({ callId: `invariant-${stage}`, package: FIXTURES.A });
      let at = 1000;
      const send = (event: Record<string, unknown>) => {
        const result = step(session, { at, ...event } as SessionEvent);
        session = result.session;
        return result;
      };
      const child = (turn: string) => { at += 4000; send({ type: "child_turn", text: turn }); };
      const fallback = (refused: unknown[] = []) => {
        for (const proposal of fallbacks(session, refused)) {
          const result = send({ type: "proposal", proposal });
          if (!result.refusal) return true;
        }
        return false;
      };
      const show = (id: string) => {
        const result = send({ type: "proposal", proposal: { version: 2, act: "guide", step: id, level: 3,
          parts: [{ line: "step.show", slots: { step: id } }], reading: { help: "show" } } });
        expect(result.refusal).toBeNull();
      };
      send({ type: "start" });
      expect(fallback()).toBe(true);
      child("Show me the ones."); show("ones");
      if (stage !== "h3") {
        child("16."); expect(fallback()).toBe(true);
        child("Show me the tens."); show("tens");
        child("6."); expect(fallback()).toBe(true);
      }
      if (stage === "example") {
        child("I'm stuck.");
        for (let i = 0; i < 8 && session.expect === "maya" && !session.outcome; i++) expect(fallback()).toBe(true);
        expect(session.exampleShown).toBe(FIXTURES.A.easierExample.steps.length);
      }
      if (session.outcome) continue;
      child(text);
      const wrong = { version: 2, act: "give_answer", parts: [], reading: { answers: [{ value: { type: "number", value: Number.parseInt(text, 10) }, step: "result", verdict: "wrong" }] } };
      const refused = stage === "example" && (text === "33." || text === "65.") ? [wrong] : [];
      expect(fallback(refused), `${stage}: ${text}`).toBe(true);
      expect(session.assistance, `${stage}: ${text}`).not.toContain("answer_given");
      if (stage === "example" && (text === "33." || text === "65.")) {
        expect(session.finalMisses, text).toBe(text === "65." ? 1 : 0);
        expect(["TRY_TARGET", "GUIDE_TARGET", "CLOSE"], text).toContain(session.state);
      }
    }
  }
});
