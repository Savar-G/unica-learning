import { describe, expect, it } from "vitest";
import {
  createSession,
  freeTalkProblem,
  heardWordings,
  allLineTexts,
  lineOffers,
  MAX_WORDINGS,
  memoryWordingHistoryStore,
  mergeHistory,
  NAME_GAP,
  PHRASE_ACTS,
  PHRASE_GROUPS,
  PHRASES,
  step,
  talkMath,
  TEMPLATES,
  warmGroups,
  type Session,
  type SessionEvent,
  type WordingHistory,
} from "@/lib/maya";
import { workedSteps, type QuestionPackage } from "@/lib/question-package";

// D-196: warm talk is code-written in a turn with a math line, and said before it; in a turn without one the model's
// own words pass guards or are replaced. Wordings vary: least lately heard first, the child's name now and then.

const num = (value: number) => ({ type: "number" as const, value });
const PKG: QuestionPackage = {
  id: "wbq-warm",
  ref: { source: "workbook", workbookId: "11111111-1111-4111-8111-111111111111", page: 23, question: 4 },
  templateId: null,
  text: "27 + 39 = ?",
  answer: { value: num(66), accepted: [], unit: null },
  operation: { kind: "add", operands: [27, 39] },
  steps: workedSteps({ kind: "add", operands: [27, 39] }),
  skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
  level: 9,
  difficulty: 2,
  wrongAnswers: [{ value: num(56), cause: "O3", description: "Forgets carry", step: "tens" }],
  easierExample: { text: "18 + 5 = ?", operation: { kind: "add", operands: [18, 5] }, answer: num(23), steps: workedSteps({ kind: "add", operands: [18, 5] }) },
};
const bare = (text: string) => text.replace(/,? ?\{name\}/g, "");

/** A call past its opening, with the child's first words. Every proposal must be accepted unless `refusal` is used. */
function call(input: { random?: number; history?: WordingHistory; childName?: string; freeTalk?: boolean } = {}) {
  let s: Session = createSession({ callId: "warm", package: PKG, random: input.random ?? 1, history: input.history, childName: input.childName, freeTalk: input.freeTalk });
  let at = 0;
  const send = (e: SessionEvent) => {
    const r = step(s, e);
    s = r.session;
    return r;
  };
  const say = (p: Record<string, unknown>) => {
    at += 1000;
    const r = send({ type: "proposal", at, proposal: { version: 2, ...p } });
    expect(r.refusal).toBeNull();
    return r.effects.flatMap((e) => (e.kind === "say" ? [e] : []))[0];
  };
  send({ type: "start", at: 0 });
  say({ act: "open", parts: [{ line: "open.hello" }] });
  send({ type: "child_turn", at, text: "Hi!" });
  return {
    get s() { return s; },
    send,
    say,
    child: (text: string) => { at += 1000; return send({ type: "child_turn", at, text }); },
    refusal: (p: Record<string, unknown>) => step(s, { type: "proposal", at: at + 1, proposal: { version: 2, ...p } }).refusal,
  };
}

describe("the phrase bank", () => {
  // Bank phrases are code-written and reviewed, so they may encourage ("Keep going!"); they still hold no math and
  // never point back to an earlier sentence.
  const POINTS_BACK = /\b(that|those|opposite|instead|ignore|undo|forget|never mind|actually|rather|earlier|previous|said|meant)\b/i;

  it.each(PHRASE_GROUPS)("has 12 to 20 phrases for %s, with no math and no pointing back", (group) => {
    expect(PHRASES[group].length).toBeGreaterThanOrEqual(12);
    expect(PHRASES[group].length).toBeLessThanOrEqual(20);
    expect(new Set(PHRASES[group]).size).toBe(PHRASES[group].length);
    for (const phrase of PHRASES[group]) {
      expect(talkMath(phrase.replace("{name}", "Leah")), phrase).toBeNull();
      expect(phrase, phrase).not.toMatch(POINTS_BACK);
    }
  });

  it("gives every math line 5 to 8 wordings", () => {
    for (const [key, wordings] of Object.entries(TEMPLATES)) {
      if (key === "open.hello" || key.startsWith("question.") || key === "assess.ask" || key === "redirect.back") continue;
      expect(wordings.length, key).toBeGreaterThanOrEqual(5);
      expect(wordings.length, key).toBeLessThanOrEqual(8);
    }
  });

  it("offers the model the purposes that fit each act", () => {
    const c = call();
    const groups = warmGroups(c.s);
    expect(groups.guide).toEqual(PHRASE_GROUPS.filter((g) => PHRASE_ACTS[g].includes("guide")));
    expect(groups.clarify).toContain("smalltalk");
  });
});

describe("rule A: a turn with a math line", () => {
  const point = { line: "step.point", slots: { step: "ones" } };

  it("says bank warm talk first and the math line last", () => {
    const c = call();
    const said = c.say({ act: "guide", step: "ones", level: 1, parts: [{ warm: "empathy" }, point], reading: { help: "more" } });
    const empathy = PHRASES.empathy.map(bare);
    expect(empathy.some((e) => said.text.startsWith(`${e} `))).toBe(true);
    expect(said.text).toMatch(/7 and 9\.$/);
  });

  it("refuses warm talk after the math line, the model's own words, and a purpose that does not fit the act", () => {
    const c = call();
    expect(c.refusal({ act: "guide", step: "ones", level: 1, parts: [point, { warm: "encourage" }], reading: { help: "more" } })).toMatchObject({ code: "math_line_not_last" });
    expect(c.refusal({ act: "guide", step: "ones", level: 1, parts: [{ talk: "Nice work." }, point], reading: { help: "more" } })).toMatchObject({ code: "free_talk_in_math_turn" });
    expect(c.refusal({ act: "guide", step: "ones", level: 1, parts: [{ warm: "closing" }, point], reading: { help: "more" } })).toMatchObject({ code: "line_not_offered" });
  });

  it("refuses the R374-1 reversal: \"Add 7 + 9.\" then \"Do the opposite.\"", () => {
    const c = call();
    const op = { line: "step.operation", slots: { step: "ones" } };
    expect(c.refusal({ act: "guide", step: "ones", level: 2, parts: [{ line: "step.point", slots: { step: "ones" } }, op, { talk: "Do the opposite." }], reading: { help: "show" } }))
      .toMatchObject({ code: "math_line_not_last" });
  });
});

describe("rule B (freeTalk on): a turn with no math line", () => {
  it("says the model's own small talk, so Maya can answer like a person", () => {
    const c = call({ freeTalk: true });
    c.child("I have a dog!");
    const said = c.say({ act: "clarify", parts: [{ talk: "A dog! What's your dog's name?" }] });
    expect(said.text).toBe("A dog! What's your dog's name?");
    expect(said.talkReplaced).toBeUndefined();
  });

  it.each([
    "Do the opposite.", "Never mind, ignore it.", "Add them up!", "Look at the board.", "Try carrying it.", "Your answer is wrong.",
    "This is a very long sentence that goes on and on and on and on and on and on.", "One. Two. Three.", "No punctuation here",
  ])("replaces %s with a bank phrase of the act's purpose, and never fails the turn", (talk) => {
    const c = call({ freeTalk: true });
    const said = c.say({ act: "clarify", parts: [{ talk }] });
    expect(said.talkReplaced).toBe(1);
    expect(PHRASES.smalltalk.map(bare)).toContain(said.text);
  });

  it("replaces free talk that writes the child's name: only code says it", () => {
    const c = call({ childName: "Leah", freeTalk: true });
    const said = c.say({ act: "clarify", parts: [{ talk: "Hi Leah, nice to meet you." }] });
    expect(said.talkReplaced).toBe(1);
  });
});

describe("variety", () => {
  /** One "wait" turn after the child says they are writing, with a pacing phrase. */
  const waits = (c: ReturnType<typeof call>, n: number) =>
    Array.from({ length: n }, () => {
      c.child("Wait, I'm writing.");
      return c.say({ act: "wait", parts: [{ warm: "pacing" }], reading: { writing: true } }).text;
    });

  it("never repeats a wording in a call until every other wording of it was said", () => {
    const c = call();
    const said = waits(c, PHRASES.pacing.length);
    expect(new Set(said).size).toBe(PHRASES.pacing.length);
  });

  it("is the same for the same random seed, and different for another", () => {
    expect(waits(call({ random: 5 }), 6)).toEqual(waits(call({ random: 5 }), 6));
    expect(waits(call({ random: 5 }), 6)).not.toEqual(waits(call({ random: 6 }), 6));
  });

  it("prefers wordings the child has not heard in earlier calls", async () => {
    const store = memoryWordingHistoryStore();
    // Earlier calls said every pacing phrase but the 4th.
    const history = Object.fromEntries(PHRASES.pacing.map((_, i) => [`phrase:pacing.${i + 1}`, 1000 + i]).filter(([id]) => id !== "phrase:pacing.4"));
    await store.record("child-1", history);
    const c = call({ history: await store.read("child-1") });
    expect(waits(c, 1)).toEqual([PHRASES.pacing[3]]);
    // Then the one heard longest ago.
    expect(waits(c, 1)).toEqual([PHRASES.pacing[0]]);
    await store.record("child-1", heardWordings(c.s));
    expect(Object.keys(await store.read("child-1"))).toContain("phrase:pacing.4");
  });

  it("says the child's name now and then, never twice in any 3 of Maya's turns", () => {
    const c = call({ childName: "Leah", random: 3 });
    const said = waits(c, 30).map((t) => t.includes("Leah"));
    expect(said.filter(Boolean).length).toBeGreaterThan(0);
    for (let i = 0; i < said.length; i++) {
      if (said[i]) expect(said.slice(i + 1, i + NAME_GAP).some(Boolean)).toBe(false);
    }
  });

  it("keeps a wording history of the newest wordings only", () => {
    const big = Object.fromEntries(Array.from({ length: MAX_WORDINGS + 50 }, (_, i) => [`w${i}`, i]));
    const merged = mergeHistory({ w0: 99_999 }, big);
    expect(Object.keys(merged)).toHaveLength(MAX_WORDINGS);
    expect(merged.w0).toBe(99_999);
    expect(merged.w1).toBeUndefined();
  });
});

describe("speech cut off part-way (review note)", () => {
  function afterShow() {
    const c = call();
    c.child("Show me.");
    const said = c.say({ act: "guide", step: "ones", level: 3, parts: [{ warm: "encourage" }, { line: "step.show", slots: { step: "ones" } }], reading: { help: "show" } });
    return { c, text: said.text };
  }

  it("does not repair a cut at a sentence break", () => {
    const { c, text } = afterShow();
    const sentences = text.split(/(?<=[.?!])\s+/);
    for (let n = 0; n <= sentences.length; n++) {
      c.send({ type: "maya_said", at: 99_000, text: sentences.slice(0, n).join(" ") });
      expect(c.s.state, sentences.slice(0, n).join(" ")).toBe("GUIDE_TARGET");
    }
  });

  it("repairs a cut inside a sentence or a word: \"sixteen\" cut short is \"six\"", () => {
    const { c, text } = afterShow();
    const cut = text.slice(0, text.indexOf("= 16") + 3).replace("= 1", "equals six");
    c.send({ type: "maya_said", at: 99_000, text: cut });
    expect(c.s.state).toBe("REPAIR_MAYA");
    const d = afterShow();
    d.c.send({ type: "maya_said", at: 99_000, text: d.text.slice(0, d.text.indexOf("Write")) + "Wri" });
    expect(d.c.s.state).toBe("REPAIR_MAYA");
  });
});

describe("one turn does not start two parts alike", () => {
  const opening = (text: string) => (text.toLowerCase().match(/[\p{L}']+/gu) ?? []).slice(0, 2).join(" ");

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("never starts the \"not yet\" line and the hint with the same words (seed %i)", (random) => {
    const c = call({ random });
    c.child("Seven and nine is fifteen.");
    const parts = [{ line: "check.not_yet", slots: { step: "ones" } }, { line: "step.point", slots: { step: "ones" } }];
    const r = c.send({ type: "proposal", at: 50_000, proposal: { version: 2, act: "guide", step: "ones", level: 1, parts, reading: { answers: [{ value: num(15), step: "ones", verdict: "wrong" }] } } });
    expect(r.refusal).toBeNull();
    const said = r.effects.flatMap((e) => (e.kind === "say" ? [e.text] : []))[0];
    // No two sentences of the turn start with the same two words.
    const starts = said.split(/(?<=[.?!])\s+/).map(opening).filter((o) => o.includes(" "));
    expect(new Set(starts).size, said).toBe(starts.length);
  });
});

describe("R374-2-1: every line with math in it is a math line, and free words never follow it", () => {
  it("refuses the reviewer's case: the question line, then \"Keep exchanging.\"", () => {
    const c = call();
    expect(c.refusal({ act: "clarify", parts: [{ line: "question.problem" }, { talk: "Keep exchanging." }] })).toMatchObject({ code: "math_line_not_last" });
    expect(talkMath("Keep exchanging.")).toBe("exchanging");
  });

  const lines: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["question.problem", { line: "question.problem" }, { act: "clarify" }],
    ["question.read", { line: "question.read", slots: { sentence: 0 } }, { act: "clarify" }],
    ["assess.ask", { line: "assess.ask" }, { act: "clarify" }],
    ["redirect.back", { line: "redirect.back" }, { act: "redirect", reading: { offTopic: true } }],
  ];

  it.each(lines)("%s: free words after it or before it are refused; bank words before it are said, and the line is last", (_id, line, base) => {
    const c = call();
    expect(c.refusal({ ...base, parts: [line, { talk: "Good job." }] })).toMatchObject({ code: "math_line_not_last" });
    expect(c.refusal({ ...base, parts: [{ talk: "Good job." }, line] })).toMatchObject({ code: "free_talk_in_math_turn" });
    expect(c.refusal({ ...base, parts: [line, { warm: "smalltalk" }] })).toMatchObject({ code: "math_line_not_last" });
    const said = c.say({ ...base, parts: [{ warm: "smalltalk" }, line] });
    const last = said.text.split(/(?<=[.?!])\s+/).at(-1)!;
    expect(last, said.text).toMatch(/27 \+ 39/);
  });

  it("treats every offered line with math in any wording as a math line, and only those", () => {
    const c = call();
    c.child("I can't start.");
    const offers = lineOffers(c.s);
    let math = 0;
    for (const [act, list] of Object.entries(offers)) {
      for (const o of list!) {
        const hasMath = o.texts.some((t) => talkMath(t) !== null);
        const base = { version: 2, act, step: o.slots.step, level: o.level ?? 0, reading: { help: "show" } };
        // Only lines the act takes on their own: other refusals come before the words.
        if (step(c.s, { type: "proposal", at: 60_000, proposal: { ...base, parts: [{ line: o.line, slots: o.slots }] } }).refusal) continue;
        const r = step(c.s, { type: "proposal", at: 60_000, proposal: { ...base, parts: [{ line: o.line, slots: o.slots }, { talk: "Good job." }] } });
        if (hasMath) {
          math += 1;
          expect(r.refusal?.code, `${act} ${o.line}`).toBe("math_line_not_last");
        } else {
          expect(r.refusal?.code, `${act} ${o.line}`).not.toBe("math_line_not_last");
        }
      }
    }
    expect(math).toBeGreaterThan(5);
  });

  it.each([
    "exchange", "exchanges", "exchanged", "exchanging", "regroup", "regrouping", "trade", "trading", "carry", "carrying", "carried",
    "borrow", "borrowing", "plus", "minus", "times", "divide", "dividing", "add", "adding", "added", "subtract", "subtracting",
    "multiplying", "splitting", "sharing", "counting", "removing", "writing", "rounding", "doubling", "halving",
  ])("refuses %s in every free word", (word) => {
    expect(talkMath(`Keep ${word} it.`)).toBe(word);
    expect(freeTalkProblem(`Keep ${word} it.`)).not.toBeNull();
  });

  it.each(["take away", "count on", "count back"])("refuses the pair %s", (pair) => {
    expect(talkMath(`Now ${pair} slowly.`)).not.toBeNull();
  });
});

describe("R374-3-1: the assembled turn, with the lines code adds, is checked in one place", () => {
  it("refuses free talk in a given-answer turn: code adds the answer line, so it is a math turn (the reviewer's case)", () => {
    let s = createSession({ callId: "r374-3-1", package: PKG, random: 1 });
    s = step(s, { type: "start", at: 0 }).session;
    s = step(s, { type: "proposal", at: 0, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }] } }).session;
    s = step(s, { type: "tick", at: 541_000 }).session;
    const r = step(s, { type: "proposal", at: 541_000, proposal: { version: 2, act: "give_answer", parts: [{ talk: "Hello there." }] } });
    expect(r.refusal).toMatchObject({ code: "free_talk_in_math_turn" });
    expect(r.effects.some((e) => e.kind === "say")).toBe(false);
  });

  it("says bank warm talk first and the given answer last", () => {
    let s = createSession({ callId: "r374-3-1b", package: PKG, random: 1 });
    s = step(s, { type: "start", at: 0 }).session;
    s = step(s, { type: "proposal", at: 0, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }] } }).session;
    s = step(s, { type: "tick", at: 541_000 }).session;
    const r = step(s, { type: "proposal", at: 541_000, proposal: { version: 2, act: "give_answer", parts: [{ warm: "empathy" }] } });
    expect(r.refusal).toBeNull();
    const said = r.effects.flatMap((e) => (e.kind === "say" ? [e.text] : []))[0];
    expect(said).toMatch(/66[^.?!]*[.?!]$/);
    expect(PHRASES.empathy.map(bare).some((p) => said.startsWith(p))).toBe(true);
  });
});

describe("R374-3-2 (freeTalk on): free talk may only react, feel, greet or ask about the child's life", () => {
  const child = ["I have a dog named Biscuit!"];

  it.each([
    "Keep calculating.", "Go on.", "Do it again.", "Write it down.", "Try the other way.", "You should check it.", "Can you swap them?",
    "Now the next one.", "Just keep going.", "Make it bigger.", "Let's keep calculating.", "Please continue.", "Don't stop now.",
    "First, think about it.", "Then press enter.", "Continue.", "Think harder.", "Guess again.", "Start over.", "Hurry up.", "Figure it out.",
    "Calculate it.", "Work it out.", "Compute it quickly.", "Solve it now.", "Look again.", "Erase it.", "Change it.", "Fix it.",
    "Swap them around.", "Oh, keep going.", "Okay, carry on.", "Wow, do it again!", "Use your fingers.", "Stop and think.",
    "It's time to keep calculating.", "I think you should guess.", "Could you double it?", "Will you finish it?", "Would you redo it?",
    "You need to hurry.", "You have to finish.", "You must be quick.", "Make sure you are careful.", "Remember to breathe and focus.",
    "How about you give it a go?", "Why don't you guess?", "Biscuit says keep going.", "Great, now press the button.", "Hmm, flip them.",
    "Nice! Next one.", "So, figure out the rest.",
  ])("rejects %s, and the turn says a bank phrase instead", (talk) => {
    expect(freeTalkProblem(talk, null, child)).not.toBeNull();
    const c = call({ freeTalk: true });
    c.child("I have a dog named Biscuit!");
    const said = c.say({ act: "clarify", parts: [{ talk }] });
    expect(said.talkReplaced).toBe(1);
    expect(PHRASES.smalltalk.map(bare)).toContain(said.text);
  });

  it.each([
    "Biscuit is a great name!", "Wow, a trip to the lake!", "I love dogs too.", "What's your favourite colour?", "Hi there!", "Hello!",
    "Thanks for telling me.", "Nice!", "Cool!", "Yay!", "Ha, I love it!", "Aw, poor kitty.", "Oh no, I hope you feel better soon.",
    "How exciting!", "Who is your best friend?", "Where do you like to play?", "When is your birthday?", "I'm so glad you're here.",
    "You're so funny!", "It sounds like a great day.", "We're having a good chat.", "Sounds fun!", "What a lovely name!",
    "A dog! What's your dog's name?", "Have a great day!", "Happy birthday!", "Good morning!",
  ])("says %s as it is", (talk) => {
    expect(freeTalkProblem(talk, null, child)).toBeNull();
    const c = call({ freeTalk: true });
    c.child("I have a dog named Biscuit!");
    const said = c.say({ act: "clarify", parts: [{ talk }] });
    expect(said.talkReplaced).toBeUndefined();
    expect(said.text).toBe(talk);
  });

  it("lets a sentence start with a name only when the child said it", () => {
    expect(freeTalkProblem("Biscuit is a great name!", null, [])).not.toBeNull();
    expect(freeTalkProblem("Biscuit is a great name!", null, ["My dog is called Biscuit."])).toBeNull();
  });
});

describe("R374-4-1: with freeTalk off (the default), every word Maya says comes from code or the child", () => {
  it("replaces the reviewer's sentence: \"I recommend proceeding with the calculation.\"", () => {
    const c = call();
    const said = c.say({ act: "clarify", parts: [{ talk: "I recommend proceeding with the calculation." }] });
    expect(said.talkReplaced).toBe(1);
    expect(said.text).not.toMatch(/recommend|calculation/);
    expect(PHRASES.smalltalk.map(bare)).toContain(said.text);
  });

  it("replaces even free words that pass every guard", () => {
    const c = call();
    const said = c.say({ act: "clarify", parts: [{ talk: "Wow, a trip to the lake!" }] });
    expect(said.talkReplaced).toBe(1);
  });

  describe("echo frames", () => {
    const slotted = (group: keyof typeof PHRASES, words: string) =>
      PHRASES[group].filter((p) => p.includes("{echo}")).map((p) => bare(p).replace(/(^|[.?!]\s+)\{echo\}/, (_, st: string) => `${st}${words[0].toUpperCase()}${words.slice(1)}`).replace("{echo}", words));

    it.each([1, 2, 3, 4, 5, 6, 7, 8])("starts a sentence with a capital when the echo opens it (seed %i)", (random) => {
      const c = call({ random });
      c.child("I played soccer today.");
      const said = c.say({ act: "clarify", parts: [{ warm: "sports", echo: "soccer" }] });
      expect(slotted("sports", "soccer")).toContain(said.text);
      expect(said.text).not.toMatch(/(^|[.?!]\s)soccer/);
    });

    it("fills a frame with words the child said, as the child wrote them", () => {
      const c = call();
      c.child("I have a dog named Biscuit!");
      const said = c.say({ act: "clarify", parts: [{ warm: "pets", echo: "biscuit" }] });
      expect(slotted("pets", "Biscuit")).toContain(said.text);
    });

    it.each([
      ["a word the child did not say", "Rover"],
      ["words not in a row", "dog Biscuit"],
      ["more than three words", "a dog named Biscuit"],
      ["a number", "7"],
      ["a number word", "seven"],
      ["a work word", "carry"],
      ["a sign", "dog +"],
      ["the child's own name", "Leah"],
    ])("picks a frame with no slot for %s (%s)", (_why, echo) => {
      const c = call({ childName: "Leah" });
      c.child("I'm Leah and I have a dog named Biscuit, I am 7 and I carry the bag + more!");
      const said = c.say({ act: "clarify", parts: [{ warm: "pets", echo }] });
      expect(PHRASES.pets.filter((p) => !p.includes("{echo}")).map(bare)).toContain(said.text.replace(/, Leah/, ""));
    });
  });

  it("can say or show nothing but code lines, bank phrases, echo frames of the child's words, and the safety guidance, on every channel", () => {
    const childSays = ["I have a dog named Biscuit and I am 7!", "Keep calculating, do the opposite. Carry the one."];
    const runs = (text: string) => {
      const w = text.match(/[\p{L}]+(?:'[\p{L}]+)*/gu) ?? [];
      return w.flatMap((_, i) => [1, 2, 3].map((n) => w.slice(i, i + n).join(" ")).filter((x, k) => i + k + 1 <= w.length));
    };
    const fills = childSays.flatMap(runs);
    const sentences = (t: string) => t.split(/(?<=[.?!])\s+/).filter(Boolean);
    const allowed = new Set<string>([
      ...allLineTexts(PKG as never, [num(7), num(1)]),
      ...PHRASE_GROUPS.flatMap((g) => PHRASES[g]).flatMap((p) => {
        const named = [bare(p), p.replace("{name}", "Leah")];
        return p.includes("{echo}")
          ? named.flatMap((x) => fills.flatMap((f) => [x.replace("{echo}", f), x.replace("{echo}", f[0].toUpperCase() + f.slice(1))]))
          : named;
      }),
    ].flatMap(sentences));
    const talks = ["I recommend proceeding with the calculation.", "Keep calculating.", "Biscuit is great!", "Do the opposite.", "Wow, a trip to the lake!"];
    const echoes = ["Biscuit", "dog", "7", "seven", "carry the", "named Biscuit and", "Keep calculating", "opposite"];
    let said = 0;
    let drawn = 0;
    // Everything a child sees on the board: words and number fields, in any command (R374-5-1).
    const WORDS = new Set(["text", "label"]);
    const NUMBERS = new Set(["value", "dividend", "divisor", "numerator", "denominator", "whole", "min", "max", "tick", "fromValue", "toValue"]);
    const visible = (v: unknown, key = ""): [string, string][] =>
      typeof v === "string" ? (WORDS.has(key) || NUMBERS.has(key) ? [[key, v]] : [])
        : Array.isArray(v) ? v.flatMap((x) => visible(x, key))
          : typeof v === "object" && v !== null ? Object.entries(v).flatMap(([k, x]) => visible(x, k)) : [];
    const write = (text: string) => ({ op: "write", id: "w", text, place: { region: "main" } });
    const boards: (unknown[] | undefined)[] = [
      undefined,
      [write("I recommend proceeding with the calculation.")], [write("Keep calculating.")], [write("7 + 9 = 15")], [write("Great effort!")], [write("7 + 9")],
      [{ op: "number_line", id: "nl", min: "0", max: "500", tick: "50", place: { region: "main" } }],
      [{ op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }],
    ];
    for (const [n, text] of childSays.entries()) {
      const c = call({ childName: "Leah", random: n + 1 });
      c.child(text);
      const offers = lineOffers(c.s);
      const boardForms = new Set(Object.values(offers).flatMap((l) => l!.flatMap((o) => (o.board ? [o.board] : []))));
      for (const [act, list] of Object.entries(offers)) {
        const lines = list!.slice(0, 6).map((o) => ({ line: o.line, slots: o.slots, step: o.slots.step, level: o.level ?? 0 }));
        const groups = PHRASE_GROUPS.filter((g) => PHRASE_ACTS[g].includes(act as never));
        const tries: unknown[][] = [
          ...talks.map((t) => [{ talk: t }]),
          ...groups.flatMap((g) => echoes.map((e) => [{ warm: g, echo: e }])),
          ...lines.flatMap((l) => [[{ line: l.line, slots: l.slots }], ...talks.slice(0, 2).map((t) => [{ talk: t }, { line: l.line, slots: l.slots }])]),
          ...lines.flatMap((l) => groups.slice(0, 2).map((g) => [{ warm: g, echo: "Biscuit" }, { line: l.line, slots: l.slots }])),
        ];
        for (const parts of tries) {
          const line = parts.find((p) => typeof p === "object" && p !== null && "line" in p) as { slots?: { step?: string } } | undefined;
          const lvl = lines.find((l) => l.slots === line?.slots)?.level ?? 0;
          for (const board of boards) {
            const proposal = { version: 2, act, parts, step: line?.slots?.step ?? c.s.ladder.step, level: lvl, reading: { help: "show" }, ...(board ? { board } : {}) };
            const r = step(c.s, { type: "proposal", at: 90_000, proposal });
            for (const e of r.effects) {
              if (e.kind === "say") {
                said += 1;
                for (const x of sentences(e.text)) expect(allowed.has(x), `${act}: ${x}`).toBe(true);
              }
              if (e.kind === "board") {
                for (const [key, v] of visible(e.batch.commands)) {
                  drawn += 1;
                  if (WORDS.has(key)) expect(boardForms.has(v) || sentences(v).every((x) => allowed.has(x)), `${act} board: ${v}`).toBe(true);
                  else expect(v, `${act} board ${key}`).toMatch(/^[\d.\s]+$/);
                }
              }
            }
          }
        }
      }
    }
    expect(said).toBeGreaterThan(100);
    expect(drawn).toBeGreaterThan(10);
  });
});

describe("R374-5: the board, echo breaks, phrase picks and the bank's own rules", () => {
  const note = (text: string) => [{ op: "write", id: "note", text, place: { region: "main" } }];

  it("refuses free words on the board with freeTalk off (the reviewer's case)", () => {
    const c = call();
    const r = c.refusal({ act: "clarify", parts: [{ warm: "smalltalk" }], board: note("I recommend proceeding with the calculation.") });
    expect(r).toMatchObject({ code: "board_not_code" });
  });

  it("lets the board show a line's own expression said in the same turn, and checks every number field", () => {
    const c = call();
    c.child("I don't know.");
    expect(c.refusal({ act: "guide", step: "ones", level: 2, reading: { help: "more" }, parts: [{ line: "step.point", slots: { step: "ones" } }, { line: "step.operation", slots: { step: "ones" } }], board: note("7 + 9") })).toBeNull();
    expect(c.refusal({ act: "guide", step: "ones", level: 2, reading: { help: "more" }, parts: [{ line: "step.point", slots: { step: "ones" } }, { line: "step.operation", slots: { step: "ones" } }], board: note("7 + 8") })).toMatchObject({ code: "board_not_code" });
    const line = [{ op: "number_line", id: "nl", min: "0", max: "500", tick: "50", place: { region: "main" } }];
    expect(c.refusal({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], board: line })).toMatchObject({ code: "wrong_math" });
  });

  it("does not cross a sentence break or a comma with an echo", () => {
    for (const [said, echo] of [["Biscuit. Soccer is fun.", "Biscuit Soccer"], ["My grandma, Rose, is here.", "grandma Rose"], ["Biscuit! Soccer!", "Biscuit Soccer"]]) {
      const c = call();
      c.child(said);
      const text = c.say({ act: "clarify", parts: [{ warm: "pets", echo }] }).text;
      expect(PHRASES.pets.filter((p) => !p.includes("{echo}")).map(bare), said).toContain(text);
    }
    const c = call();
    c.child("My grandma Rose is here.");
    expect(c.say({ act: "clarify", parts: [{ warm: "family", echo: "grandma Rose" }] }).text).toContain("grandma Rose");
  });

  it("says the phrase the model picks, so a reply fits the child's question", () => {
    const c = call();
    c.child("Are you a robot?");
    const robot = PHRASES.aboutmaya.findIndex((p) => p.includes("robot")) + 1;
    expect(c.say({ act: "clarify", parts: [{ warm: "aboutmaya", pick: robot }] }).text).toBe(PHRASES.aboutmaya[robot - 1]);
  });

  it("keeps a picked frame only when its slot can be filled, and refuses a pick outside the group", () => {
    const frame = PHRASES.pets.findIndex((p) => p.includes("{echo} is a great name")) + 1;
    const c = call();
    c.child("I have a dog named Biscuit!");
    expect(c.say({ act: "clarify", parts: [{ warm: "pets", pick: frame, echo: "Biscuit" }] }).text).toBe("Biscuit is a great name!");
    const d = call();
    d.child("I have a dog named Biscuit!");
    const plain = d.say({ act: "clarify", parts: [{ warm: "pets", pick: frame, echo: "7" }] }).text;
    expect(PHRASES.pets.filter((p) => !p.includes("{echo}")).map(bare)).toContain(plain);
    expect(call().refusal({ act: "clarify", parts: [{ warm: "pets", pick: PHRASES.pets.length + 1 }] })).toMatchObject({ code: "invalid_proposal" });
  });

  it("has no phrase that judges correctness or asks for the work", () => {
    const judges = /\b(right|wrong|correct|on a roll|got it|good at|great work|good work|good thinking|thinker|detective|hang of|nailed|perfect|exactly|smart|genius|clever)\b/i;
    const asks = /\b(tell me (what|how)|what do you notice|back to work|how did you|walk me through|talk me through|show me|explain|your plan|how do you know|figure|work it out|let's work)\b/i;
    for (const phrase of PHRASE_GROUPS.flatMap((g) => PHRASES[g])) {
      expect(phrase, phrase).not.toMatch(judges);
      expect(phrase, phrase).not.toMatch(asks);
    }
  });

  it("asks for the child's thinking with a code line", () => {
    const c = call();
    c.child("It's 66.");
    const said = c.say({ act: "accept_answer", reading: { answers: [{ value: num(66), step: "result", verdict: "right" }] }, parts: [{ line: "check.thinking" }, { line: "answer.right" }] });
    expect(TEMPLATES["check.thinking"].some((t) => said.text.startsWith(t))).toBe(true);
  });
});
