import { expect, it } from "vitest";
import { createSession, fallbacks, phraseOffers, step } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

function after(text: string) {
  let s = createSession({ callId: "calm-698", package: FIXTURES.A, grade: 2, random: 1 });
  s = step(s, { type: "start", at: 1000 }).session;
  for (const proposal of fallbacks(s)) {
    const result = step(s, { type: "proposal", at: 1000, proposal, fallback: true });
    s = result.session;
    if (!result.refusal) break;
  }
  return step(s, { type: "child_turn", at: 5000, text }).session;
}

it.each(["I love my puppy but we had to give him away.", "I am happy for my friend but I feel left out.", "I won a prize but my friends call me names."])("withholds happy phrases after %s", (text) => {
  expect(phraseOffers(after(text), "happy")).toEqual([]);
});

it("withholds the fun question reply on a miserable turn", () => {
  expect(phraseOffers(after("I feel miserable."), "aboutmaya").map((offer) => offer.pick)).not.toContain(12);
});

import { PHRASE_ACTS, PHRASE_GROUPS, PHRASES } from "@/lib/maya";
import { CALM_PHRASES, FEELING_SMALLTALK, NEUTRAL_SMALLTALK } from "./phrases";
import { ACTS } from "./proposal";

it("classifies every position and keeps all allow-list positions valid and unique", () => {
  expect(Object.keys(CALM_PHRASES).sort()).toEqual([...PHRASE_GROUPS].sort());
  for (const group of PHRASE_GROUPS) {
    const calm = CALM_PHRASES[group];
    expect(new Set(calm).size).toBe(calm.length);
    expect(calm.every((pick) => Number.isInteger(pick) && pick >= 1 && pick <= PHRASES[group].length)).toBe(true);
    expect(PHRASES[group].map((_, i) => calm.includes(i + 1) ? "calm" : "not calm")).toHaveLength(PHRASES[group].length);
  }
});

it.each(["I'm so happy!", "I won!", "I feel great!", "Yay!", "I'm excited!"])("withholds happy replies after %s", (text) => {
  expect(phraseOffers(after(text), "happy")).toEqual([]);
});

it.each(["I am happy but I am alone.", "I am happy, but alone.", "I am happy. I am alone.", "I am happy because I have a puppy today.", "I am not happy.", "I don't feel happy.", "I am happy although alone."])("withholds cheer after %s", (text) => {
  expect(phraseOffers(after(text), "happy")).toEqual([]);
});

it("offers only calm choices on sad, mixed, and neutral turns across the bank", () => {
  for (const text of ["I feel sad.", "I feel miserable.", "I love my puppy but we had to give him away.", "I am happy for my friend but I feel left out.", "I won a prize but my friends call me names.", "Hello there."]) {
    const s = after(text);
    for (const group of PHRASE_GROUPS) {
      expect(phraseOffers(s, group).every(({ pick }) => CALM_PHRASES[group].includes(pick)), `${text}: ${group}`).toBe(true);
    }
  }
});

it("never emits a non-calm bank phrase across warm acts, choices, and echoes", () => {
  for (const text of ["I feel sad.", "I feel miserable.", "I love my puppy but we had to give him away.", "I am happy for my friend but I feel left out.", "I won a prize but my friends call me names.", "Hello there.", "I'm happy and heartbroken.", "I'm proud despite my grief.", "I love my dad in heaven.", "I love my dog 😭", "I'm so happy!", "I won!", "Yay!"]) {
    const s = after(text);
    for (const act of ACTS) for (const group of PHRASE_GROUPS.filter((g) => PHRASE_ACTS[g].includes(act))) {
      for (let pick = 0; pick <= PHRASES[group].length; pick++) for (const echo of [undefined, "my puppy"]) {
        const parts: Record<string, unknown>[] = [{ warm: group, ...(pick ? { pick } : {}), ...(echo ? { echo } : {}) }];
        if (act === "redirect") parts.push({ line: "redirect.back" });
        if (act === "guide") parts.push({ line: "step.invite", slots: { step: "ones" } });
        if (act === "open") parts.push({ line: "open.hello" });
        const proposal = { version: 2, act, parts, ...(act === "redirect" ? { reading: { offTopic: true } } : act === "close" ? { reading: { stop: true } } : act === "wait" ? { reading: { writing: true } } : {}), ...(act === "guide" ? { step: "ones", level: 0 } : {}) };
        const result = step(s, { type: "proposal", at: 6000, proposal } as Parameters<typeof step>[1]);
        if (result.refusal) continue;
        const said = result.effects.filter((e) => e.kind === "say").map((e) => e.text).join(" ");
        const eligible = [...CALM_PHRASES[group].map((i) => PHRASES[group][i - 1]), ...FEELING_SMALLTALK, ...NEUTRAL_SMALLTALK];
        const matches = eligible.some((phrase) => {
          const pattern = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{echo\\\}/g, ".+?").replace(/,? \\\{name\\\}/g, "(?:,? .+?)?");
          return new RegExp(pattern, "i").test(said);
        });
        expect(matches, `${text}: ${act} ${group}.${pick} echo=${echo}: ${said}`).toBe(true);
      }
    }
  }
});
