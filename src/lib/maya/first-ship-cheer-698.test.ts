import { expect, it } from "vitest";
import { createSession, fallbacks, phraseOffers, step, PHRASE_GROUPS } from "@/lib/maya";
import { CALM_PHRASES } from "./phrases";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

function after(text: string, freeTalk = false) {
  let s = createSession({ callId: "first-ship-cheer", package: FIXTURES.A, grade: 2, random: 1, freeTalk });
  s = step(s, { type: "start", at: 1000 }).session;
  for (const proposal of fallbacks(s)) {
    const result = step(s, { type: "proposal", at: 1000, proposal, fallback: true });
    s = result.session;
    if (!result.refusal) break;
  }
  return step(s, { type: "child_turn", at: 5000, text }).session;
}

it.each(["I'm happy and heartbroken.", "I'm proud despite my grief.", "I love my dad in heaven.", "I love my dog 😭"])("withholds cheer after %s", (text) => {
  const s = after(text);
  expect(phraseOffers(s, "happy")).toEqual([]);
  const result = step(s, { type: "proposal", at: 6000, proposal: { version: 2, act: "clarify", parts: [{ warm: "happy" }] } });
  expect(result.effects.filter((e) => e.kind === "say").map((e) => e.text).join(" ")).not.toMatch(/yay|happy mood/i);
});

it("offers only calm positions for positive turns in every group", () => {
  for (const text of ["I'm so happy!", "I won!", "Yay!"]) for (const group of PHRASE_GROUPS) {
    expect(phraseOffers(after(text), group).every(({ pick }) => CALM_PHRASES[group].includes(pick)), `${text}: ${group}`).toBe(true);
  }
});

it.each(["Yay!", "What a happy day!", "How nice!", "How wonderful!", "Lovely to hear!", "Have a great day!"])("replaces reviewed cheerful free talk %s", (talk) => {
  const s = after("I love my dog 😭", true);
  const result = step(s, { type: "proposal", at: 6000, proposal: { version: 2, act: "clarify", parts: [{ talk }] }, talkReviews: [{ text: talk, result: { verdict: "pass" } }] });
  expect(result.refusal).toBeNull();
  const said = result.effects.find((e) => e.kind === "say");
  expect(said?.text).not.toContain(talk);
});

it("keeps a calm pool and an accepted fallback for each turn type", () => {
  for (const text of ["I'm so happy!", "I won!", "Yay!", "Hello there.", "I am sad.", "I am happy but alone.", "Do you have a dog?", "", "Help.", "I'm happy and heartbroken.", "I'm proud despite my grief.", "I love my dad in heaven.", "I love my dog 😭"]) {
    const s = after(text);
    for (const group of PHRASE_GROUPS) {
      const offers = phraseOffers(s, group);
      expect(offers.every(({ pick }) => CALM_PHRASES[group].includes(pick)), `${text}: ${group}`).toBe(true);
      // Empty or echo-only groups use one of the smalltalk replacements.
      const direct = offers.filter(({ text: phrase }) => !phrase.includes("{echo}"));
      expect(direct.length || CALM_PHRASES.smalltalk.length, `${text}: ${group}`).toBeGreaterThan(0);
    }
    const accepted = fallbacks(s).map((proposal) => step(s, { type: "proposal", at: 6000, proposal, fallback: true })).find((result) => !result.refusal);
    expect(accepted, text).toBeDefined();
    expect(accepted?.session.outcome?.reason, text).not.toBe("technical_issue");
  }
});
