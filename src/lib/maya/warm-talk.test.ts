import { describe, expect, it } from "vitest";
import {
  createSession,
  freeTalkProblem,
  heardWordings,
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
function call(input: { random?: number; history?: WordingHistory; childName?: string } = {}) {
  let s: Session = createSession({ callId: "warm", package: PKG, random: input.random ?? 1, history: input.history, childName: input.childName });
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

describe("rule B: a turn with no math line", () => {
  it("says the model's own small talk, so Maya can answer like a person", () => {
    const c = call();
    c.child("I have a dog!");
    const said = c.say({ act: "clarify", parts: [{ talk: "A dog! What's your dog's name?" }] });
    expect(said.text).toBe("A dog! What's your dog's name?");
    expect(said.talkReplaced).toBeUndefined();
  });

  it.each([
    "Do the opposite.", "Never mind, ignore it.", "Add them up!", "Look at the board.", "Try carrying it.", "Your answer is wrong.",
    "This is a very long sentence that goes on and on and on and on and on and on.", "One. Two. Three.", "No punctuation here",
  ])("replaces %s with a bank phrase of the act's purpose, and never fails the turn", (talk) => {
    const c = call();
    const said = c.say({ act: "clarify", parts: [{ talk }] });
    expect(said.talkReplaced).toBe(1);
    expect(PHRASES.smalltalk.map(bare)).toContain(said.text);
  });

  it("replaces free talk that writes the child's name: only code says it", () => {
    const c = call({ childName: "Leah" });
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

describe("R374-3-2: free talk may only react, feel, greet or ask about the child's life", () => {
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
    const c = call();
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
    const c = call();
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
