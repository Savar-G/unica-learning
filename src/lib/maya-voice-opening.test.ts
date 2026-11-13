import { describe, expect, it } from "vitest";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { codeOpening } from "@/lib/maya-voice-opening";

// The voice call's opening with no model call, through the text adapter's public interface.
describe("the code-made opening of a voice call", () => {
  const session = (asked: { n: number }) => {
    const model = fakeMayaModel({ answer: (input) => {
      asked.n++;
      // The real model's turn: one bank line for any later request.
      return { version: 2, act: input.offers[0].act, parts: [{ line: input.offers[0].lines[0].line, slots: input.offers[0].lines[0].slots }] };
    } });
    return createTextSession({ callId: "voice-opening", package: SAMPLE_PACKAGES["add-27-39"], model: codeOpening(model), clock: () => Date.UTC(2026, 10, 13), random: 7 });
  };

  it("opens with Maya's name, that she is an AI, and the question, and asks the model nothing", async () => {
    const asked = { n: 0 };
    const out = await session(asked).start();
    expect(asked.n).toBe(0);
    const said = out.say.join(" ");
    expect(said).toMatch(/Maya/);
    expect(said).toMatch(/\bAI\b/);
    expect(said).toContain("27 + 39");
  });

  it("sends the child's turn to the real model", async () => {
    const asked = { n: 0 };
    const s = session(asked);
    await s.start();
    await s.child("I think it is 66.");
    expect(asked.n).toBeGreaterThan(0);
  });
});
