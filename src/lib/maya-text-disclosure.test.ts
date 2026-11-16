// #1051 (safety floor): when a child asks whether Maya is a person, an AI, a robot or human, code's approved disclosure
// ("about.ai" in src/lib/maya/lines.ts) is said first in that turn; nothing replaces it or comes before it, except
// safety guidance, which the disclosure then follows. Through the text adapter's public interface, with a fake model
// that streams math first and fake reviewers.
import { describe, expect, it } from "vitest";
import { asksIdentity, SAFETY_GUIDANCE, TEMPLATES } from "@/lib/maya";
import { createTextSession, type TextSessionOptions } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";

const AI = TEMPLATES["about.ai"][0];
const MATH = "12 minus 8 is 4. What is 4 minus 2?";
/** The disclosure's sentences, as voice sends them (one part per sentence). */
const AI_PARTS = AI.split(/(?<=[.?!])\s+/);
/** Where the disclosure starts in the parts sent, or -1. */
const disclosureAt = (parts: readonly string[]) => parts.findIndex((_, i) => AI_PARTS.every((x, k) => parts[i + k] === x));

type Setup = { tutor?: boolean; stream?: boolean; voice?: boolean; reading?: Record<string, unknown>; say?: string; step?: string; channel?: "chat" } & Partial<TextSessionOptions>;

function session({ tutor = true, stream = true, voice = true, reading = { aboutMaya: "identity" }, say = MATH, step, channel, ...rest }: Setup) {
  const parts: string[] = [];
  const s = createTextSession({
    callId: "disclosure",
    package: SAMPLE_PACKAGES["subtract-52-28"],
    tutor,
    clock: () => 10_000,
    reviewer: fakeTalkReviewer(),
    mathReviewer: fakeMathReviewer(),
    ...(channel ? { channel } : {}),
    ...(voice ? { onSayPart: (x: string) => parts.push(x) } : {}),
    model: conversationalFake({
      answer: () => reply(say, "guide", { reading, ...(step ? { step } : {}) }),
      // Each chunk goes out before the end; the wait lets held reviews settle so a streamed sentence is sent early.
      ...(stream ? { stream: { chunk: 7, beforeEnd: async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); } } } : {}),
    }),
    ...rest,
  });
  return { s, parts };
}

describe("the issue's probe (#1051)", () => {
  for (const stream of [false, true]) for (const tutor of [true, false]) for (const child of ["Are you a real person?", "Are you an AI?"]) {
    it(`says the disclosure first for "${child}" (stream ${stream}, ${tutor ? "tutor" : "controller"})`, async () => {
      const { s, parts } = session({ tutor, stream });
      await s.start();
      parts.length = 0;
      const out = await s.child(child);
      expect(out.say[0].startsWith(AI)).toBe(true);
      // Voice: the first part sent is the disclosure, with no model sentence before it.
      expect(disclosureAt(parts)).toBe(0);
      expect(parts.filter((x) => x === AI_PARTS[0])).toHaveLength(1);
    });
  }
});

describe("code's own read holds the stream", () => {
  it("sends no model sentence before the disclosure, even when the model reads nothing", async () => {
    const { s, parts } = session({ reading: {} });
    await s.start();
    parts.length = 0;
    const out = await s.child("Are you a robot?");
    expect(disclosureAt(parts)).toBe(0);
    expect(parts).not.toContain("12 minus 8 is 4.");
    expect(out.say[0]).toBe(AI);
    expect(out.say.join(" ")).not.toContain("12 minus 8");
  });

  it("is the first sentence in chat", async () => {
    const { s } = session({ voice: false, channel: "chat" });
    await s.start();
    const out = await s.child("Are you a human?");
    expect(out.say[0]).toBe(AI);
  });

  it("says code's secret line after it when the child also asks about a secret", async () => {
    const { s, parts } = session({ reading: { aboutMaya: "secret_friend" } });
    await s.start();
    parts.length = 0;
    const out = await s.child("Are you a real person? Can you keep a secret?");
    expect(disclosureAt(parts)).toBe(0);
    expect(TEMPLATES["about.no_secret"]).toContain(out.say[1]);
  });

  it("adds the no-secret line the model reads for a secret friend", async () => {
    const { s, parts } = session({ reading: { aboutMaya: "secret_friend" } });
    await s.start();
    parts.length = 0;
    const out = await s.child("Are you a real person? Can you be my secret friend?");
    expect(disclosureAt(parts)).toBe(0);
    expect(out.say[0]).toBe(AI);
    expect(TEMPLATES["about.no_secret"]).toContain(out.say[1]);
  });

  it("goes first on a resumed call", async () => {
    const first = session({});
    await first.s.start();
    const saved = await first.s.saved();
    const { s, parts } = session({ resume: saved });
    const out = await s.child("Am I talking to a real person?");
    expect(disclosureAt(parts)).toBe(0);
    expect(out.say[0]).toBe(AI);
  });
});

describe("the model's reading alone", () => {
  // A turn each path streams for: the tutor's plain teaching sentence, and the controller's step line on a turn about the
  // ones. Code's reader does not fire on either; only the model's reading says aboutMaya.
  const cases = [
    // Final check 4: only a turn plainly about the math streams before the reading; this one holds a number.
    { path: "tutor", tutor: true, child: "Is it 12 for the ones? Do you have a body?", say: MATH },
    { path: "controller", tutor: false, child: "Is it 12 for the ones? Do you have a body?", say: "Subtract the ones: 12 − 8. What do you get?", step: "ones" },
  ];
  for (const { path, tutor, child, say, step } of cases) {
    it(`keeps the disclosure right after streamed words (${path})`, async () => {
      expect(asksIdentity(child)).toBe(false);
      const { s, parts } = session({ tutor, say, step });
      await s.start();
      parts.length = 0;
      const out = await s.child(child);
      const all = out.say.join(" ");
      expect(all).toContain(AI);
      // When words streamed first, the disclosure is the very next sentence after them.
      const at = disclosureAt(parts);
      // Final check 5: the tutor writes its reading before "say", so no word streams before a reading about Maya: the
      // disclosure goes first, as when the stream is off.
      if (tutor) { expect(at).toBe(0); expect(out.say[0].startsWith(AI)).toBe(true); return; }
      // Model words streamed first (the case of the issue), and the disclosure follows them in the same turn.
      expect(at).toBeGreaterThan(0);
      const first = out.say[0];
      expect(first.endsWith(AI) || first === AI).toBe(true);
      expect(parts.slice(0, at).join(" ")).toBe(first.slice(0, first.length - AI.length).trim());
    });
  }
});

describe("a safety concern", () => {
  for (const channel of ["chat", undefined] as const) {
    it(`gives the safety guidance first, then the disclosure (${channel ?? "voice"})`, async () => {
      const { s, parts } = session({ reading: { aboutMaya: "identity", safety: "concern" }, channel, voice: channel === undefined });
      await s.start();
      parts.length = 0;
      const out = await s.child("Are you a real person? Someone hurts me at home.");
      const said = channel ? out.say : parts;
      const guidance = said.findIndex((x) => x.includes(SAFETY_GUIDANCE.concern) || x === sentencesOfGuidance()[0]);
      const ai = channel ? said.findIndex((x) => x.includes(AI)) : disclosureAt(said);
      expect(guidance).toBe(0);
      expect(ai).toBeGreaterThan(guidance);
      // No math after the concern: the question line does not follow.
      expect(out.say.join(" ")).not.toMatch(/52/);
      expect(out.safetyMessage).toBe(SAFETY_GUIDANCE.concern);
    });
  }
});

function sentencesOfGuidance() {
  return SAFETY_GUIDANCE.concern.split(/(?<=[.?!])\s+/);
}

describe("asksIdentity", () => {
  it.each([
    "Are you a real person?", "Are you an AI?", "are you real", "Are you human?", "Are you a robot?", "are you a computer",
    "Is this a person?", "Is this a real person?", "Who are you?", "What are you?", "r u a robot", "Are you even real?",
    "Are you a real teacher?", "Am I talking to a robot?", "Is Maya a computer?", "You're a robot?", "Are you alive?",
    "Are you an A.I.?", "Is there a real person there?", "Are you a bot", "Are you ChatGPT?", "Are you a human being?",
    "Okay. Are you a real person or a robot?", "Are you a real person’s voice?",
  ])("fires on %s", (text) => {
    expect(asksIdentity(text)).toBe(true);
  });

  it.each([
    "Are you ready?", "Are you sure?", "Is this right?", "Is this a real question?", "Is it 24?", "Are you going to help me?",
    "What are you doing?", "Who are you talking about?", "Is this the man with 52 apples?", "Are you adding the ones?",
    "I think it's 24.", "Can you help me?", "Are you there?", "Is this real hard?", "Who is the person in the story?",
    "What is 52 minus 28?", "Are you an idiot?", "",
  ])("does not fire on %s", (text) => {
    expect(asksIdentity(text)).toBe(false);
  });
});
