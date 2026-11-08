import { describe, expect, it } from "vitest";
import { createSession, speechWords, step } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { gateWordCount } from "@/lib/maya-gate/word-count";

const names = [
  ["李", 1], ["Zoë", 1], ["José-Luis", 2], ["O'Brien", 1], ["ليلى", 1],
  ["Zoe\u0308", 1], ["لَيْلَى", 1], ["٣", 1],
] as const;

describe("R443-3: every script contributes to the spoken word limit", () => {
  it.each(names.flatMap(([name, words]) => [25, 26, 45, 46].map((boundary) => ({ name, words, boundary }))))("$name at $boundary words", ({ name, words, boundary }) => {
    // These are independently counted spoken tokens. Hyphenated names use two; an apostrophe stays within one.
    const text = [...Array.from({ length: boundary - words }, () => "hello"), name].join(" ");
    expect(speechWords(text)).toBe(boundary);
    expect(gateWordCount(text)).toBe(boundary);
  });

  it.each(names.slice(0, 5).flatMap(([name]) => [25, 26, 45, 46].map((boundary) => ({ name, boundary }))))("the controller checks $name at $boundary words", ({ name, boundary }) => {
    const grade = boundary <= 26 ? 1 : 4;
    const initial = (seed: number) => step(createSession({ callId: "named-boundary", package: FIXTURES.A, grade, random: seed, childName: name, freeTalk: true }), { type: "start", at: 1000 }).session;
    const parts = [{ line: "open.hello" as const }, { warm: "opening" as const, pick: 5 }];
    let seed = 1;
    let prefix = "";
    for (; seed <= 32; seed++) {
      const r = step(initial(seed), { type: "proposal", at: 1000, proposal: { version: 2, act: "open", parts } });
      expect(r.refusal).toBeNull();
      prefix = r.effects.flatMap((e) => e.kind === "say" ? [e.text] : []).join(" ");
      if (prefix.includes(name)) break;
    }
    expect(prefix).toContain(name);
    // Fill the remaining words with short, non-math sentences. The profile name stays in a checked bank phrase.
    let remaining = boundary - gateWordCount(prefix);
    const sentences: string[] = [];
    while (remaining > 0) {
      const size = remaining <= 20 ? remaining : remaining - 20 < 3 ? remaining - 3 : 20;
      expect(size).toBeGreaterThanOrEqual(3);
      sentences.push(["I", "am", ...Array.from({ length: size - 2 }, () => "so")].join(" ") + ".");
      remaining -= size;
    }
    const talk = sentences.join(" ");
    const result = step(initial(seed), { type: "proposal", at: 1000, proposal: { version: 2, act: "open", parts: [...parts, { talk }] }, talkReviews: [{ text: talk, result: { verdict: "pass" } }] });
    if (boundary === 25 || boundary === 45) {
      expect(result.refusal).toBeNull();
      const said = result.effects.flatMap((e) => e.kind === "say" ? [e.text] : []).join(" ");
      expect(said).toContain(name);
      expect(speechWords(said)).toBe(boundary);
      expect(gateWordCount(said)).toBe(boundary);
    } else {
      expect(result.refusal).toMatchObject({ code: "turn_too_long", reason: `This turn has ${boundary} spoken words. The limit is ${grade === 1 ? 25 : 45}.` });
      expect(result.effects).toEqual([]);
    }
  });

  it.each(names.slice(0, 7))("refuses the reported named turn for %s", (name, nameWords) => {
    const run = (grade: number) => {
      let s = createSession({ callId: "R443-3", package: FIXTURES.A, grade, random: 1, childName: name });
      s = step(s, { type: "start", at: 1000 }).session;
      s = step(s, { type: "proposal", at: 1000, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }] } }).session;
      s = step(s, { type: "child_turn", at: 1001, text: "I tried it." }).session;
      return step(s, { type: "proposal", at: 1001, proposal: { version: 2, act: "guide", step: "ones", level: 1,
        parts: [{ warm: "encourage", pick: 8 }, { line: "step.point", slots: { step: "ones" } }, { line: "step.invite", slots: { step: "ones" } }], reading: { start: "has_work" } } });
    };
    const older = run(4);
    expect(older.refusal).toBeNull();
    const said = older.effects.flatMap((e) => e.kind === "say" ? [e.text] : []).join(" ");
    expect(said).toContain(name);
    expect(speechWords(said)).toBe(25 + nameWords);
    expect(gateWordCount(said)).toBe(25 + nameWords);
    expect(run(1).refusal).toMatchObject({ code: "turn_too_long", reason: `This turn has ${25 + nameWords} spoken words. The limit is 25.` });
  });
});
