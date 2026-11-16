import { describe, expect, it } from "vitest";
import { createSession, tutorStream } from "./session";
import { tutorBrief, TUTOR_PROMPT, TUTOR_PROMPT_VERSION } from "./tutor-prompt";
import { tutorStreamSentence } from "./tutor";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";

// Order of speech (2026-11-15): the tutor opens each message with one sentence code checks on its own, so the child
// hears it at once while the reviews of the next sentences run. The rule never comes before safety or the AI disclosure.
describe("the tutor prompt's first sentence", () => {
  it("asks for a first sentence code can check alone, and raises the version", () => {
    expect(TUTOR_PROMPT_VERSION).toBe("maya-tutor-13");
    expect(TUTOR_PROMPT).toContain('when your "kind" is "math" or "help", open the message with one short sentence that code can check on its own');
    expect(TUTOR_PROMPT).toContain("This sentence never comes before safety or the AI disclosure");
    expect(TUTOR_PROMPT).toContain('when your "kind" is "offtopic", "stop", "safety" or "other", or the child asks about you, do not use this rule');
    // The other rules stay.
    expect(TUTOR_PROMPT).toContain("Safety words, the AI disclosure and the decline are code's own.");
    expect(TUTOR_PROMPT).toContain("13. Use the child's own word.");
  });

  it("puts the prompt version in the brief", () => {
    const s = createSession({ callId: "prompt", package: SAMPLE_PACKAGES["subtract-52-28"], conversational: true, tutor: true });
    expect(tutorBrief(s).promptVersion).toBe(TUTOR_PROMPT_VERSION);
  });

  it("gives only examples that go out on code alone", () => {
    const s = createSession({ callId: "prompt", package: SAMPLE_PACKAGES["subtract-52-28"], conversational: true, tutor: true });
    const at = (child: string) => tutorStream({ ...s, state: "TRY_TARGET", expect: "maya", turn: { text: child, at: 0, uncertain: false }, turns: [{ at: 0, speaker: "child", text: child, state: "TRY_TARGET" }] })!;
    const examples: [string, string][] = [
      ["Please help me.", "52 is 5 tens and 2 ones."],
      ["Please help me.", "12 minus 8 is 4."],
      ["I got 36.", "52 minus 28 isn't 36."],
      ["I got 24.", "52 minus 28 is 24."],
      ["Please help me.", "What is 12 minus 8?"],
      ["Please help me.", "How many ones are there?"],
      ["Please help me.", "What do we write in the ones?"],
    ];
    for (const [child, sentence] of examples) {
      expect(TUTOR_PROMPT, sentence).toContain(`"${sentence}"`);
      expect(tutorStreamSentence(sentence, [], at(child)), sentence).toBe("send");
    }
  });
});

// #1107 (prompt 13): "noDraw" comes before "say", with the same meaning, in the schema, the prompt, the fake and the stream's read.
describe("prompt 13: the drawing decision before the words", () => {
  it("orders the schema, the prompt and the fake as gate, kind, noDraw, say, act, reading", async () => {
    const { TUTOR_OUTPUT_SCHEMA } = await import("./tutor-prompt");
    const { reply } = await import("@/lib/maya-model-fake");
    const { partialSay } = await import("@/lib/maya-text");
    expect(TUTOR_OUTPUT_SCHEMA.required).toEqual(["gate", "kind", "noDraw", "say", "act", "reading"]);
    expect(Object.keys(TUTOR_OUTPUT_SCHEMA.properties)).toEqual(["gate", "kind", "noDraw", "say", "act", "reading"]);
    const at = (key: string) => TUTOR_PROMPT.indexOf(`- "${key}"`);
    expect(at("gate")).toBeLessThan(at("kind"));
    expect(at("kind")).toBeLessThan(at("noDraw"));
    expect(at("noDraw")).toBeLessThan(at("say"));
    expect(at("say")).toBeLessThan(at("reading"));
    expect(Object.keys(reply("Hi.", "guide")).slice(0, 4)).toEqual(["gate", "kind", "noDraw", "say"]);
    const text = JSON.stringify(reply("We trade 1 ten for 10 ones. What", "guide", { noDraw: [2] }));
    expect(partialSay(text.slice(0, text.indexOf("What") + 4))).toMatchObject({ before: ["gate", "kind", "noDraw"], noDraw: [2] });
    const late = JSON.stringify(reply("We trade 1 ten for 10 ones.", "guide", { lateNoDraw: true }));
    expect(partialSay(late)).toMatchObject({ before: ["gate", "kind"], noDraw: null });
    expect(partialSay('{"gate":"none","kind":"math","noDraw":[0],"say":"Hi.')).toMatchObject({ noDraw: null });
  });
});
