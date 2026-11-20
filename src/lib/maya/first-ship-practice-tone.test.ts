import { describe, expect, it } from "vitest";
import { createSession, fallbacks, PHRASE_ACTS, PHRASE_GROUPS, phraseOffers, PHRASES, type Session, step, type StepResult, TEMPLATES } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { CALM_PHRASES, FEELING_SMALLTALK, hardFeeling, NEUTRAL_SMALLTALK } from "@/lib/maya/phrases";
import { ACTS } from "@/lib/maya/proposal";
import { celebratoryTemplate, firstShipWordings } from "@/lib/maya/session";

describe("calm tone", () => {
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

  // One case per child turn (CI took 95 s for the whole walk in one test): the same full walk, split so each case is short.
  it.each(["I feel sad.", "I feel miserable.", "I love my puppy but we had to give him away.", "I am happy for my friend but I feel left out.", "I won a prize but my friends call me names.", "Hello there.", "I'm happy and heartbroken.", "I'm proud despite my grief.", "I love my dad in heaven.", "I love my dog 😭", "I'm so happy!", "I won!", "Yay!"])("never emits a non-calm bank phrase across warm acts, choices, and echoes after %s", (text) => {
    {
      const s = after(text);
      for (const act of ACTS) for (const group of PHRASE_GROUPS.filter((g) => PHRASE_ACTS[g].includes(act))) {
        for (let pick = 0; pick <= PHRASES[group].length; pick++) for (const echo of PHRASES[group].some((p) => p.includes("{echo}")) ? [undefined, "my puppy"] : [undefined]) {
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
});

describe("feelings phrases", () => {
  describe("hard feelings", () => {
    it.each(["I'm not happy.", "I'm not good.", "I don't feel good.", "I'm not okay.", "I feel down.", "Nobody likes me.", "I have no friends.", "I'm lonely."])("reads %s as hard", (text) => {
      expect(hardFeeling(text)).toBe(true);
    });
    it("reads a resolved worry as resolved", () => {
      expect(hardFeeling("I am not worried anymore!")).toBe(false);
    });
    it("keeps a separate hard feeling after a resolved worry", () => {
      expect(hardFeeling("I am not worried anymore, but I am sad.")).toBe(true);
    });
  });

  it.each(["I am not very happy.", "I am not feeling good.", "I do not feel so good.", "I feel really down.", "No one likes me.", "I don’t feel good."])("recognizes a hard feeling: %s", (text) => {
    expect(hardFeeling(text)).toBe(true);
  });

  it.each(["I feel really bad.", "I am not at all happy.", "I feel bad.", "I feel so bad.", "I am feeling bad.", "I am not even happy.", "I am not really good."])("reads negative feeling %s", (text) => {
    expect(hardFeeling(text)).toBe(true);
  });

  it.each(["I'm not sad anymore!", "I won!"])("keeps positive or resolved feeling %s", (text) => {
    expect(hardFeeling(text)).toBe(false);
  });
});

describe("first-ship cheer off", () => {
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
});

describe("first-ship close", () => {
  // Final #698 review (D-310): with first-ship cheer off, the solved close is calm (close.checked), never close.solved.
  const say = (r: StepResult) => r.effects.flatMap((e) => (e.kind === "say" ? [e.text] : [])).join(" ");

  const CHEERFUL_CLOSES = TEMPLATES["close.solved"].map((t) => t.replace("{expr}", "27 + 39"));

  describe("first-ship solved close is calm", () => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i: a child-solved close never says a close.solved wording", (random) => {
      let s: Session = step(createSession({ callId: "fixed-close", package: FIXTURES.A, grade: 2, random }), { type: "start", at: 1000 }).session;
      const fb = () => {
        for (const p of fallbacks(s)) {
          const r = step(s, { type: "proposal", at: s.now!, proposal: p, fallback: true });
          if (!r.refusal) { s = r.session; return r; }
        }
        throw Error("no fallback");
      };
      const child = (text: string) => { s = step(s, { type: "child_turn", at: s.now! + 4000, text }).session; };
      fb(); child("Seven plus nine is sixteen."); fb(); child("Two plus three plus one is six."); fb(); child("66."); fb(); child("I'm done.");
      const close = say(fb());
      for (const cheer of CHEERFUL_CLOSES) expect(close).not.toContain(cheer);
      expect(close).not.toMatch(/Great job|Well done|Nice work|You did it/i);
    });
  });
});

describe("first-ship calm templates", () => {
  // Final #698 re-check (D-310): with first-ship cheer off, no fixed template wording that celebrates is said.
  const say = (r: StepResult) => r.effects.flatMap((e) => (e.kind === "say" ? [e.text] : [])).join(" ");

  const num = (value: number) => ({ type: "number" as const, value });

  describe("first-ship template wordings are calm", () => {
    it("every template keeps at least one calm wording, so no line loses all its wordings", () => {
      const empty = Object.entries(TEMPLATES).filter(([, ws]) => firstShipWordings(ws as readonly string[]).length === 0).map(([k]) => k);
      expect(empty).toEqual([]);
    });

    it("no celebratory wording is ever chosen while cheer is off", () => {
      for (const [key, ws] of Object.entries(TEMPLATES)) {
        for (const i of firstShipWordings(ws as readonly string[])) expect(celebratoryTemplate((ws as readonly string[])[i]), `${key}#${i}`).toBe(false);
      }
    });

    it("correctness feedback is not treated as celebration", () => {
      expect(celebratoryTemplate("That's right: 27 + 39 = 66.")).toBe(false);
      expect(celebratoryTemplate("Tell me how you did it.")).toBe(false);
      expect(celebratoryTemplate("Well done! 27 + 39 = 66.")).toBe(true);
      expect(celebratoryTemplate("You did it: 27 + 39 is done!")).toBe(true);
    });

    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("seed %i: an accepted right answer never says a celebratory answer.right wording", (random) => {
      let s: Session = step(createSession({ callId: "template-recheck", package: FIXTURES.A, grade: 4, random }), { type: "start", at: 1000 }).session;
      for (const p of fallbacks(s)) { const r = step(s, { type: "proposal", at: 1000, proposal: p, fallback: true }); if (!r.refusal) { s = r.session; break; } }
      s = step(s, { type: "child_turn", at: 5000, text: "66." }).session;
      const r = step(s, { type: "proposal", at: 5000, proposal: { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: num(66), step: "result", verdict: "right" }] } } });
      expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
      expect(say(r)).not.toMatch(/Well done|Nice!|Smart!|Great job/);
    });
  });
});
