import { expect, it } from "vitest";
import { createSession, fallbacks, PHRASE_ACTS, PHRASE_GROUPS, PHRASES, phraseOffers, step } from "@/lib/maya";
import { CHEERFUL_PHRASES, isCheerfulPhrase } from "./phrases";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

function after(text: string) {
  let s = createSession({ callId: "cheer-698", package: FIXTURES.A, grade: 2, random: 1 });
  s = step(s, { type: "start", at: 1000 }).session;
  for (const proposal of fallbacks(s)) {
    const result = step(s, { type: "proposal", at: 1000, proposal, fallback: true });
    s = result.session;
    if (!result.refusal) break;
  }
  return step(s, { type: "child_turn", at: 5000, text }).session;
}

it("withholds cheerful phrases across every group on distress turns", () => {
  for (const text of ["My friends make fun of me.", "I feel miserable.", "I feel sad.", "My dog is sick.", "I wish I could be happy."]) {
    const s = after(text);
    for (const group of PHRASE_GROUPS) {
      for (const offer of phraseOffers(s, group)) {
        expect(offer.text, `${text}: ${group}.${offer.pick}`).not.toMatch(/\b(?:yay|hooray|woohoo|how nice|how wonderful|nice to hear|fun to hear|awesome|amazing|happy mood|lovely to hear)\b/i);
      }
    }
  }
});

it.each(["My friends make fun of me.", "I feel miserable."])("refuses cheerful picks and replaces unpicked happy on %s", (text) => {
  const s = after(text);
  for (const act of ["redirect", "clarify", "close"] as const) {
    const reading = act === "redirect" ? { offTopic: true } : act === "close" ? { stop: true } : undefined;
    for (const warm of ["happy", "smalltalk"] as const) {
      const pick = warm === "happy" ? 5 : 6;
      for (const selected of [true, false]) {
        const result = step(s, { type: "proposal", at: 6000, proposal: { version: 2, act, ...(reading ? { reading } : {}), parts: [{ warm, ...(selected ? { pick } : {}) }, ...(act === "redirect" ? [{ line: "redirect.back" }] : [])] } });
        const said = result.effects.filter((e) => e.kind === "say").map((e) => e.text).join(" ");
        expect(said, `${act} ${warm} ${selected}`).not.toMatch(/\b(?:yay|hooray|woohoo|what a happy mood|oh, how nice)\b/i);
        if (selected) expect(result.refusal).not.toBeNull();
      }
    }
  }
});

it("allows the required positive turns and rejects ambiguous uses", () => {
  for (const text of ["I'm so happy!", "I won!", "I feel great!", "I'm excited!"]) expect(phraseOffers(after(text), "happy").length, text).toBeGreaterThan(0);
  for (const text of ["My friends make fun of me.", "I feel good for nothing."]) expect(phraseOffers(after(text), "happy"), text).toEqual([]);
});

it("lists the tagged bank phrases", () => {
  expect([...CHEERFUL_PHRASES].sort()).toMatchSnapshot();
});

it("withholds each tagged pick for every group on each distress turn", () => {
  for (const text of ["My friends make fun of me.", "I feel miserable.", "I feel sad.", "My dog is sick.", "I wish I could be happy."]) {
    const s = after(text);
    for (const group of PHRASE_GROUPS) {
      expect(phraseOffers(s, group).filter((offer) => isCheerfulPhrase(offer.text)), `${text}: ${group}`).toEqual([]);
    }
  }
});

it("does not emit a tagged pick or unpicked phrase on distress turns", () => {
  for (const text of ["My friends make fun of me.", "I feel miserable.", "I feel sad.", "My dog is sick.", "I wish I could be happy."]) {
    const s = after(text);
    for (const group of PHRASE_GROUPS) {
      for (const act of ["redirect", "clarify", "close"] as const) {
        if (!PHRASE_ACTS[group].includes(act)) continue;
        const reading = act === "redirect" ? { offTopic: true } : act === "close" ? { stop: true } : undefined;
        for (let pick = 0; pick <= PHRASES[group].length; pick++) {
          const result = step(s, { type: "proposal", at: 6000, proposal: { version: 2, act, ...(reading ? { reading } : {}), parts: [{ warm: group, ...(pick ? { pick } : {}) }, ...(act === "redirect" ? [{ line: "redirect.back" }] : [])] } });
          const said = result.effects.filter((e) => e.kind === "say").map((e) => e.text).join(" ");
          for (const phrase of CHEERFUL_PHRASES) {
            if (phrase.includes("{")) continue;
            expect(said, `${text}: ${act} ${group}.${pick}`).not.toContain(phrase);
          }
        }
      }
    }
  }
});
