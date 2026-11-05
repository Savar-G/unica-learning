import { describe, expect, it } from "vitest";
import {
  createSession, drawOffers, fallbacks, lineOffers, nextActs, readAnswer, readOptionsFor, scopeReason, step,
  type Effect, type LineId, type Proposal, type Reading, type SessionEvent, type Slots,
} from "@/lib/maya";
import { workedSteps, type OperationPackage, type QuestionPackage } from "@/lib/question-package";

// The controller defects of the first full practice run (#605; the investigation's section 5), through the session's
// public interface. The fixtures are the research's 27 + 39 = 66 and 52 - 28 = 24.

const ADD: QuestionPackage = {
  id: "wbq-27-39",
  ref: { source: "workbook", workbookId: "wb-1", page: 23, question: 4 },
  templateId: null,
  text: "27 + 39 = ?",
  answer: { value: { type: "number", value: 66 }, accepted: [], unit: null },
  operation: { kind: "add", operands: [27, 39] },
  steps: workedSteps({ kind: "add", operands: [27, 39] }),
  skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
  level: 9,
  difficulty: 2,
  wrongAnswers: [{ value: { type: "number", value: 56 }, cause: "O3", description: "Forgets to carry when adding", step: "tens" }],
  easierExample: {
    text: "18 + 5 = ?",
    operation: { kind: "add", operands: [18, 5] },
    answer: { type: "number", value: 23 },
    steps: workedSteps({ kind: "add", operands: [18, 5] }),
  },
};
const SUBTRACT: QuestionPackage = {
  ...ADD,
  id: "wbq-52-28",
  text: "52 - 28 = ?",
  answer: { value: { type: "number", value: 24 }, accepted: [], unit: null },
  operation: { kind: "subtract", operands: [52, 28] },
  steps: workedSteps({ kind: "subtract", operands: [52, 28] }),
  wrongAnswers: [{ value: { type: "number", value: 36 }, cause: "O4", description: "Subtracts the smaller from the larger", step: "ones" }],
  easierExample: {
    text: "31 - 17 = ?",
    operation: { kind: "subtract", operands: [31, 17] },
    answer: { type: "number", value: 14 },
    steps: workedSteps({ kind: "subtract", operands: [31, 17] }),
  },
};

const T0 = Date.UTC(2026, 10, 5, 16, 0, 0);
const num = (value: number) => ({ type: "number" as const, value });
const ans = (value: number, at: string, verdict: "right" | "wrong") => ({ value: num(value), step: at, verdict });
type Draft = Omit<Proposal, "version">;
const ln = (line: LineId, slots: Slots = {}) => ({ line, slots });
const said = (effects: Effect[]) => effects.flatMap((e) => (e.kind === "say" ? [e.text] : [])).join(" ");

function call(pkg: QuestionPackage = ADD, input: { grade?: number } = {}) {
  let session = createSession({ callId: "fix-605", package: pkg, ...input });
  let clock = T0;
  const send = (event: SessionEvent) => {
    // As the text log does: a refused proposal still keeps what the event itself brings (a stop, an unclear number).
    const result = step(session, event);
    session = result.session;
    return result;
  };
  const c = {
    get session() { return session; },
    get acts() { return nextActs(session).acts; },
    child(text: string) { clock += 4000; return send({ type: "child_turn", at: clock, text }); },
    tick(seconds: number) { clock += seconds * 1000; return send({ type: "tick", at: clock }); },
    propose(p: Draft) { return send({ type: "proposal", at: clock, proposal: { version: 2, ...p } }); },
    fallback(p: Proposal) { return send({ type: "proposal", at: clock, proposal: p, fallback: true }); },
    /** A proposal that must be accepted: its words. */
    maya(p: Draft) {
      const r = c.propose(p);
      expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
      return said(r.effects);
    },
    /** The first fallback the session accepts for this turn, after these refused proposals: the proposal and its words. */
    firstFallback(refused: unknown[] = []) {
      for (const p of fallbacks(session, refused)) {
        const r = step(session, { type: "proposal", at: clock, proposal: p, fallback: true });
        if (r.refusal === null) {
          session = r.session;
          return { proposal: p, words: said(r.effects) };
        }
      }
      throw new Error("no fallback was accepted");
    },
  };
  send({ type: "start", at: clock });
  c.maya({ act: "open", parts: [ln("open.hello"), ln("question.problem")] });
  return c;
}
const refusedReading = (reading: Reading, act = "guide"): unknown => ({ version: 2, act, parts: [], reading });

describe("#605 item 1: a confirmation Maya is told to make is never refused", () => {
  it("says the child's own right number back, and a plain yes then lets it be accepted", () => {
    const c = call();
    c.child("Is it 66?");
    const refused = c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    expect(refused.refusal?.code).toBe("answer_not_committed");
    expect(c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "66" })] })).toContain("66");
    c.child("Yes.");
    expect(c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } })).toContain("66");
    expect(c.session.solved).toBe("child");
  });

  it.each(["Yes", "Yeah!", "Yep, that's it.", "Yes, that's right.", "Uh huh."])("takes %j as yes", (yes) => {
    const c = call();
    c.child("Is it 66?");
    c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "66" })] });
    c.child(yes);
    expect(c.acts).toContain("accept_answer");
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).toBeNull();
  });

  it.each(["No.", "Yes, maybe.", "Yes?", "I don't know.", "Yes, 56."])("does not take %j as a yes to 66", (not) => {
    const c = call();
    c.child("Is it 66?");
    c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "66" })] });
    c.child(not);
    const r = c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    expect(r.refusal).not.toBeNull();
    expect(c.session.solved).toBeNull();
  });

  it("does not take a yes as an answer once another act came between", () => {
    const c = call();
    c.child("Is it 66?");
    c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "66" })] });
    c.child("Um.");
    c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })] });
    c.child("Yes.");
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).not.toBeNull();
  });

  it("never says the answer back when the child did not say it (a sounds-like or a heard alternative)", () => {
    const c = call();
    let clock = T0 + 4000;
    const first = step(c.session, { type: "child_turn", at: clock, text: "56", alternatives: ["66"] });
    clock += 1;
    const r = step(first.session, { type: "proposal", at: clock, proposal: { version: 2, act: "confirm", parts: [ln("confirm.which", { heard: "56", other: "66" })] } });
    expect(r.refusal).not.toBeNull();
    expect(said(r.effects)).toBe("");
  });

  it("a yes to a wrong number is that wrong answer: it may be judged wrong, never accepted", () => {
    const c = call();
    c.child("Is it 56?");
    c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "56" })] });
    c.child("Yes.");
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(56, "result", "right")] } }).refusal).not.toBeNull();
    expect(c.propose({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [ans(56, "result", "wrong")] } }).refusal).toBeNull();
  });

  it("a doubtful right answer refused twice gets the confirmation from code's fallback", () => {
    const c = call();
    c.child("Um, so it's 66?");
    const { proposal, words } = c.firstFallback([refusedReading({ answers: [ans(66, "result", "right")] }, "accept_answer")]);
    expect(proposal.act).toBe("confirm");
    expect(words).toContain("66");
  });

  it("an unclear turn with no number still gets a real next step from code's fallback", () => {
    const c = call();
    c.child("Mm.");
    c.propose({ act: "wait", parts: [], reading: { unclear: true } });
    const { words } = c.firstFallback();
    expect(words).toContain("27 + 39");
  });
});

describe("#605 item 2: a negative takes back only a number in its own sentence, or one it points to", () => {
  it.each([
    ["Yes, 16. But I don't know what to do with it.", [16]],
    ["I know 7 plus 9 is 16. But then I don't know what to do.", [7, 9, 16]],
    ["16 but I don't know what to do with it.", [16]],
    ["I don't know. 16.", [16]],
    ["Not 56. 66.", [66]],
    ["It is not 56. It is 66.", [66]],
  ])("%j keeps %j", (text, values) => {
    expect(readAnswer(text).kept).toEqual(values.map(num));
  });

  it.each([
    "It is not 66.",
    "66 isn't right.",
    "I don't think it's 66.",
    "66\nThat is wrong",
    "66. That is wrong.",
    "66. That's not it.",
    "66. I don't think so.",
    "66. Not really.",
    "66. It is not 66.",
    "I reject this answer:\n66",
    "66, I doubt it",
    "My teacher says 56. You are wrong.",
    "66. I take that back.",
    "66. I changed my mind.",
  ])("%j keeps nothing", (text) => {
    expect(readAnswer(text).kept).toEqual([]);
    expect(readAnswer(text).final).toBeNull();
  });

  it("is never sure of an answer with a negative beside it, so it is confirmed before it is accepted", () => {
    expect(readAnswer("It's 66. I don't know why.")).toMatchObject({ final: num(66), sure: false });
    expect(readAnswer("Not 56. 66.")).toMatchObject({ final: num(66), sure: false });
  });

  it("a later 'I don't know why' does not take back an answer that stands; 'That is wrong' does", () => {
    const stands = () => {
      const c = call();
      c.child("66");
      c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
      return c;
    };
    const keeps = stands();
    keeps.child("66. I don't know why it works.");
    expect(keeps.session.solved).toBe("child");
    const takes = stands();
    takes.child("66. That is wrong.");
    expect(takes.session.solved).toBeNull();
  });
});

describe("#605 item 3: repeated fallbacks raise help up to the level the ladder allows", () => {
  const stuck = (c: ReturnType<typeof call>) => { c.child("Um."); return c.firstFallback(); };

  it("rises one level per child turn on the same step, and stops at the top", () => {
    const c = call();
    expect([stuck(c), stuck(c), stuck(c), stuck(c), stuck(c)].map((f) => f.proposal.level)).toEqual([0, 1, 2, 3, 3]);
  });

  it("starts low again on the next step", () => {
    const c = call();
    stuck(c); stuck(c);
    c.child("Seven plus nine is sixteen.");
    const next = c.firstFallback([refusedReading({ answers: [ans(16, "ones", "right")] })]);
    expect(next.proposal).toMatchObject({ act: "guide", step: "tens", level: 0 });
  });

  it("does not let silence raise help", () => {
    const c = call();
    stuck(c);
    c.tick(15);
    expect(c.firstFallback().proposal.act).toBe("check_in");
    expect(c.session.ladder.hint).toBe(0);
  });

  it("does not raise the model's own proposal: more help from the model still needs a failed try or a request", () => {
    const c = call();
    stuck(c);
    c.child("Um.");
    const r = c.propose({ act: "guide", step: "ones", level: 2, parts: [ln("step.operation", { step: "ones" })] });
    expect(r.refusal?.code).toBe("hint_too_high");
  });

  it("a request to be shown goes straight to the step's H3", () => {
    const c = call();
    c.child("Show me.");
    expect(c.firstFallback([refusedReading({ help: "show" })]).proposal).toMatchObject({ act: "guide", level: 3 });
  });
});

describe("#605 item 4: Maya is offered only the board she may draw", () => {
  it("offers no board note on an act that cannot draw, and each offer on a board act is accepted", () => {
    const c = createSession({ callId: "draw-1", package: ADD });
    const started = step(c, { type: "start", at: T0 }).session;
    expect(drawOffers(started).open).toEqual([]);
    expect(lineOffers(started).open?.some((o) => o.line === "question.problem")).toBe(true);
    const r = step(started, { type: "proposal", at: T0, proposal: { version: 2, act: "open", parts: [ln("open.hello"), ln("question.problem")] } });
    expect(r.refusal).toBeNull();
  });

  it("offers no board note on a redirect", () => {
    const c = call();
    c.child("I have a dog.");
    expect(drawOffers(c.session).redirect ?? []).toEqual([]);
  });

  it("still offers the question's board on a guide", () => {
    const c = call();
    c.child("Um.");
    expect((drawOffers(c.session).guide ?? []).map((d) => d.id)).toContain("question.columns");
  });
});

describe("#605 item 5: an explanation after the answer does not replace it, and 'sure' is not doubt", () => {
  // PR #624 review round 3: two sentences that hold numbers never commit on their own. The final answer is still 66
  // (the working after it does not replace it), and Maya confirms it before she accepts it.
  it.each([
    "Oh, I got 66! 6 in the ones and 6 in the tens.",
    "I got 66. Six in the ones, six in the tens.",
    "I got 66. I added the ones and carried a ten.",
    "I got 66. I carried the ten, and I already wrote it on my paper.",
    "Okay. I got 66. Seven plus nine is sixteen, so I carry the ten.",
    "I think it's 66. I wrote 6 and then 6.",
    "It's 66! 27 plus 39 is 66.",
  ])("%j keeps 66 as the final answer, not sure: Maya confirms it", (text) => {
    expect(readAnswer(text, readOptionsFor(ADD as OperationPackage))).toMatchObject({ final: num(66), sure: false });
  });

  it.each([
    "I'm sure it's 66.",
    "I'm sure it's 66. I checked the tens and ones.",
    "I got 66, with carrying.",
    "I wrote 66 on my paper already.",
    "It's 66. I already wrote it on my paper.",
  ])("%j gives a sure 66", (text) => {
    // Read as the controller reads it, with the question's own numbers (PR #624 review: 16 is 7 + 9 of this question).
    expect(readAnswer(text, readOptionsFor(ADD as OperationPackage))).toMatchObject({ final: num(66), sure: true });
  });
  it("is not sure of that 66 without the question's numbers: 16 could be another answer", () => {
    expect(readAnswer("Okay. I got 66. Seven plus nine is sixteen, so I carry the ten.").sure).toBe(false);
  });

  it.each([
    ["I got 66. 2 plus 3 is 5, so 56.", 56],
    ["I got 66. No wait, 56.", 56],
    ["It's 2 plus 3 is 6, so 66.", 66],
    ["7 plus 9 is 16.", 16],
    ["2 plus 3 plus 1 is 6.", 6],
    ["7 plus 9 is 16. 2 plus 3 plus 1 is 6.", 6],
    ["Okay. The ones are 8 and 2. 8 minus 2 is 6.", 6],
    ["Oh, so the carry ten goes with the tens. Two plus three plus one is six.", 6],
  ])("%j gives the final answer %d", (text, value) => {
    expect(readAnswer(text).final).toEqual(num(value));
  });

  it.each(["I'm not sure, 66.", "I'm not sure it's 66.", "66, I am unsure", "Are you sure it's 66?", "Maybe 66. 7 plus 9 is 16.", "I would say 66. 7 plus 9 is 16."])("%j is not sure", (text) => {
    expect(readAnswer(text).sure).toBe(false);
  });

  it("keeps every number for a step answer", () => {
    expect(readAnswer("I got 66. 6 in the ones.").kept).toEqual([num(66), num(6)]);
    expect(readAnswer("Sixteen for the ones.")).toMatchObject({ kept: [num(16)], final: null });
  });
});

describe("#605 item 6: the regroup line", () => {
  const onesRight = () => {
    const c = call();
    c.child("Seven plus nine is sixteen.");
    return c;
  };

  it("does not say its equation twice in one turn, at any seed", () => {
    for (let random = 1; random <= 40; random++) {
      let session = createSession({ callId: `seed-${random}`, package: ADD, random });
      session = step(session, { type: "start", at: T0 }).session;
      session = step(session, { type: "proposal", at: T0, proposal: { version: 2, act: "open", parts: [ln("open.hello"), ln("question.problem")] } }).session;
      session = step(session, { type: "child_turn", at: T0 + 4000, text: "Seven plus nine is sixteen." }).session;
      const r = step(session, { type: "proposal", at: T0 + 4000, proposal: { version: 2, act: "guide", step: "tens", level: 1, parts: [ln("check.right_step", { step: "ones" }), ln("step.regroup", { step: "tens" })], reading: { answers: [ans(16, "ones", "right")] } } });
      expect(r.refusal).toBeNull();
      expect(said(r.effects).match(/7 \+ 9 = 16/g)).toHaveLength(1);
    }
  });

  it("is not offered again once said, unless the child denies the carry, and then only once more", () => {
    const c = onesRight();
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("check.right_step", { step: "ones" }), ln("step.regroup", { step: "tens" })], reading: { answers: [ans(16, "ones", "right")] } });
    const regroup = (x: typeof c) => (lineOffers(x.session).guide ?? []).some((o) => o.line === "step.regroup" && o.slots.step === "tens");
    c.child("Um.");
    expect(regroup(c)).toBe(false);
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })] });
    c.child("I didn't carry anything.");
    expect(regroup(c)).toBe(true);
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })] });
    c.child("I still didn't carry.");
    expect(regroup(c)).toBe(false);
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })] }).refusal?.code).toBe("line_not_offered");
    // Past the limit, a denial no longer holds back the other help on that column.
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })] }).refusal).toBeNull();
  });
});

describe("#605 item 6: a subtraction's regroup line", () => {
  it("is offered at most twice for one column", () => {
    const c = call(SUBTRACT);
    const regroup = () => (lineOffers(c.session).guide ?? []).some((o) => o.line === "step.regroup" && o.slots.step === "ones");
    for (const text of ["Um.", "Hmm."]) {
      c.child(text);
      expect(regroup()).toBe(true);
      c.maya({ act: "guide", step: "ones", level: 2, parts: [ln("step.regroup", { step: "ones" })] });
    }
    c.child("Well.");
    expect(regroup()).toBe(false);
  });
});

describe("#605 item 7: a child who wrote the answer gets the close; a child who is writing keeps their time", () => {
  const asked = () => {
    const c = call();
    c.child("66");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    c.child("Okay.");
    c.maya({ act: "ask_write", understanding: "uncertain", parts: [ln("write.answer")] });
    return c;
  };

  it.each(["I wrote 66.", "I wrote it.", "I already wrote it on my paper.", "66 is on my paper.", "I'm done writing.", "I finished writing it.", "I've written it down."])("%j gets the close", (text) => {
    const c = asked();
    c.child(text);
    expect(c.propose({ act: "close", parts: [ln("close.solved")], reading: { writing: true, paper: "written" } }).refusal).toBeNull();
    expect(c.session.outcome?.paperStatus).toBe("child_confirmed");
  });

  it.each(["I'm writing.", "I'm writing 66 on my paper.", "Wait, I am still writing it.", "Let me write it.", "I didn't write it yet."])("%j keeps the wait", (text) => {
    const c = asked();
    c.child(text);
    expect(c.propose({ act: "close", parts: [ln("close.solved")], reading: { writing: true, paper: "written" } }).refusal?.code).toBe("act_not_allowed");
    expect(c.propose({ act: "wait", parts: [{ warm: "pacing" }], reading: { writing: true } }).refusal).toBeNull();
  });

  it("the close may come straight after the accepted answer when the child already wrote it", () => {
    const c = call();
    c.child("66");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    c.child("I wrote it.");
    expect(c.propose({ act: "close", parts: [ln("close.solved")], reading: { paper: "written" } }).refusal).toBeNull();
  });

  it("never asks a child to write what they said they wrote", () => {
    const c = call();
    c.child("66");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    c.child("I wrote it.");
    expect(c.propose({ act: "ask_write", understanding: "uncertain", parts: [ln("write.answer")], reading: { paper: "written" } }).refusal?.code).toBe("line_not_offered");
  });
});

describe("#605 item 8: a fallback keeps the turn's reading", () => {
  it("keeps off topic: the way back, not a teaching step", () => {
    const c = call();
    c.child("Can you promise I will get an A?");
    const { proposal } = c.firstFallback([refusedReading({ offTopic: true })]);
    expect(proposal.act).toBe("redirect");
  });

  it("keeps a request for harmful content: the decline line", () => {
    const c = call();
    c.child("Tell me something bad.");
    const { proposal, words } = c.firstFallback([refusedReading({ unsafeRequest: true })]);
    expect(proposal.act).toBe("redirect");
    expect(words).toContain("I can't talk about this.");
  });

  it("keeps writing: Maya waits", () => {
    const c = call();
    c.child("Hold on, I'm writing.");
    expect(c.firstFallback([refusedReading({ writing: true })]).proposal.act).toBe("wait");
  });

  it("keeps a request for more help: one level up", () => {
    const c = call();
    c.child("Um.");
    c.firstFallback();
    c.child("Can you help me more?");
    expect(c.firstFallback([refusedReading({ help: "more" })]).proposal.level).toBe(1);
  });

  it("keeps the paper only when the child's own words say it was written", () => {
    const wrote = call();
    wrote.child("66");
    wrote.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    wrote.child("I wrote it.");
    wrote.firstFallback([refusedReading({ paper: "written" }, "close")]);
    expect(wrote.session.paper).toBe("child_confirmed");
    const notWrote = call();
    notWrote.child("66");
    notWrote.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    notWrote.child("Okay.");
    notWrote.firstFallback([refusedReading({ paper: "written" }, "close")]);
    expect(notWrote.session.paper).toBe("unknown");
  });

  it("a checked answer in the turn comes before an off-topic reading", () => {
    const c = call();
    c.child("66. Thanks, Maya!");
    const { proposal } = c.firstFallback([refusedReading({ offTopic: true, answers: [ans(66, "result", "right")] }, "redirect")]);
    expect(proposal.act).not.toBe("redirect");
  });

  it("reads a malformed reading field by field, and an unknown value gives nothing", () => {
    const c = call();
    c.child("Um.");
    const { proposal } = c.firstFallback([{ version: 2, act: "guide", parts: "broken", reading: { offTopic: "yes", help: "lots", writing: 1 } }]);
    expect(proposal.act).toBe("guide");
    expect(proposal.level).toBe(0);
  });

  it("does not let a refused unsafe reading clear a pending scope duty", () => {
    const c = call();
    c.child("What is 28 + 41?");
    expect(c.session.scopeDue).toBe("changed_problem");
    const { words } = c.firstFallback([refusedReading({ unsafeRequest: true })]);
    expect(words).toContain("Unica workbook");
  });
});

describe("#605 item 9: a flipped column of this question is not another problem", () => {
  it.each(["Eight minus two is six.", "Eight minus two is still six, right?", "8 - 2"])("%j stays with the question", (text) => {
    expect(scopeReason(SUBTRACT as OperationPackage, text, false)).toBeNull();
  });

  it.each(["Nine minus two.", "28 minus 52.", "What is 9 - 3?"])("%j is still another problem", (text) => {
    expect(scopeReason(SUBTRACT as OperationPackage, text, false)).toBe("changed_problem");
  });

  it("does not open a flip of an addition's sum, or a flip of the easier example before it is chosen", () => {
    expect(scopeReason(ADD as OperationPackage, "39 minus 27", false)).toBe("changed_problem");
    expect(scopeReason(SUBTRACT as OperationPackage, "7 minus 1", false)).toBe("changed_problem");
  });
});

describe("#605 practice run 1: a child who says the step's own setup hears it said back", () => {
  // C01-r2 and F04-r3: "Oh, so 2 plus 3 plus 1?" got "What could you try for the tens?" because the operation line
  // was refused as help above the cap. Said back, it is the child's own setup, so it is no new help.
  const onTens = () => {
    const c = call();
    c.child("Seven plus nine is sixteen.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    return c;
  };
  const operation = { act: "guide" as const, step: "tens", level: 2 as const, parts: [ln("step.operation", { step: "tens" })], reading: { start: "has_work" as const } };

  it.each(["Oh, so 2 plus 3 plus 1?", "Um, I add the 2 and the 3 and the 1?", "two plus three plus one"])("says the operation back after %j, and counts no hint", (setup) => {
    const c = onTens();
    c.child(setup);
    expect(c.maya(operation)).toContain("2 + 3 + 1");
    expect(c.session.hints).toBe(0);
    expect(c.session.ladder.hint).toBe(0);
    c.child("Six, so 66.");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(6, "tens", "right"), ans(66, "result", "right")] } });
    expect(c.session.assistance).not.toContain("hint");
  });

  it.each(["Um.", "So 2 plus 3?", "2 plus 3 plus 1 is 5.", "I write the 6 and carry the 1.", "So 2 plus 3 minus 1?", "So 2 plus 3 plus 1 is 6?", "Not 2 plus 3 plus 1.",
    "So 3 plus 2 plus 1?", "Is it 2 plus 3 plus 1 or 2 plus 3?", "Yes, the 1 ten. So 1 plus 2 plus 3?", "I don't add 2 plus 3 plus 1.", "So 2 times 3 times 1?"])("still refuses the operation line after %j", (turn) => {
    const c = onTens();
    c.child(turn);
    expect(c.propose(operation).refusal?.code).toBe("hint_too_high");
  });
});

describe("#605 practice run 1: a said-back setup is no hint at any cap", () => {
  it("counts no hint when help up to H3 was already allowed (the child asked to be shown)", () => {
    const c = call();
    c.child("Seven plus nine is sixteen.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    c.child("Is it 2 plus 3 plus 1? Show me.");
    expect(c.maya({ act: "guide", step: "tens", level: 2, parts: [ln("step.operation", { step: "tens" })], reading: { help: "show" } })).toContain("2 + 3 + 1");
    expect(c.session.hints).toBe(0);
    expect(c.session.ladder.hint).toBe(0);
  });
});

describe("#605 practice run 1: a bare yes with the confirmed number gives it (C10-r1; PR #624 review: bare forms only)", () => {
  it.each(["Yes, 66.", "Yeah, it's 66!", "Yes, I said 66.", "Yep, sixty-six.", "Um, yes, it is 66."])("takes the bare form %j after 'Did you say 66?'", (yes) => {
    const c = call();
    c.child("Oh, so it's 66? I got 66.");
    c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "66" })] });
    c.child(yes);
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).toBeNull();
  });

  it.each(["Yes, maybe 66.", "Yes, 66?", "Yes, 56.", "Yes, 66 or 56.", "Yes, but not 66.", "Yes, I think 66 is right.", "Yes, I said 66. I think 66 is right.",
    "Yes, I have no clue if 66 is right.", "Yes, 66 and 56.", "Yes, 66, I guess.", "Yes, 66 is not right."])("keeps the old reading for %j: no yes to 66", (not) => {
    const c = call();
    c.child("Is it 66?");
    c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "66" })] });
    c.child(not);
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).not.toBeNull();
  });
});

describe("#605 practice run 1: a negative before ', so' does not take back the number after it (C10-r1)", () => {
  it("keeps 56 in 'The one is not a big deal, so it's still 56.'", () => {
    expect(readAnswer("Two plus three is five. The one is not a big deal, so it's still 56.").final).toEqual(num(56));
  });
  it("still takes back the negated number: 'It's not 56, so 66.'", () => {
    const r = readAnswer("It's not 56, so 66.");
    expect(r.kept).toEqual([num(66)]);
  });
  it("lets Maya judge the kept 56 wrong", () => {
    const c = call();
    c.child("Seven plus nine is sixteen. Two plus three is five. The one is not a big deal, so it's still 56.");
    const r = c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("check.not_yet", { step: "tens" }), ln("step.regroup", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right"), ans(5, "tens", "wrong"), ans(56, "result", "wrong")] } });
    expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
  });
});

describe("#605 practice run 1: the setup is read from the last sentence with numbers (C05-r3)", () => {
  it("says the operation back after 'Yes, the carry. So 1 plus 2 plus 3?' (the carry first)", () => {
    const c = call();
    c.child("Seven plus nine is sixteen.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    c.child("Yes, the carry. So 1 plus 2 plus 3?");
    expect(c.maya({ act: "guide", step: "tens", level: 2, parts: [ln("step.operation", { step: "tens" })] })).toContain("2 + 3 + 1");
    expect(c.session.hints).toBe(0);
  });
});

describe("#605 practice run 2: a child who says they are stuck asks for more help (C24-r2, C04-r1)", () => {
  const onTens = () => {
    const c = call();
    c.child("Seven plus nine is sixteen.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    return c;
  };
  it.each(["I don't know about the ten.", "I don't get it.", "I'm stuck.", "I have no idea.", "Um, I don't understand.", "Okay. I don't know."])("allows one level more after %j", (stuck) => {
    const c = onTens();
    c.child(stuck);
    const r = c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })] });
    expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
  });
  it("allows only one level more per stuck turn", () => {
    const c = onTens();
    c.child("I don't know.");
    expect(c.propose({ act: "guide", step: "tens", level: 2, parts: [ln("step.operation", { step: "tens" })] }).refusal?.code).toBe("hint_too_high");
  });
  it.each(["I'm not stuck.", "It's too hard.", "Do I just write the 16? I don't know about the ten.", "I don't know. Is it 56?", "I don't know, 56.",
    "I don't know why not.", "I'm stuck?", "He doesn't know.", "I don't know. It's not 5."])("keeps the old reading for %j: no new help", (turn) => {
    const c = onTens();
    c.child(turn);
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })] }).refusal?.code).toBe("hint_too_high");
  });
  it("does not unlock help on a turn with no stuck words", () => {
    const c = onTens();
    c.child("Okay.");
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })] }).refusal?.code).toBe("hint_too_high");
  });
});

describe("#605 practice run 2: an ask to write with no understanding field is read as uncertain (C09-r2, F02-r2)", () => {
  it("accepts the request to write after 'I'm done!' and keeps understanding uncertain", () => {
    const c = call();
    c.child("It's 66.");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { start: "has_work", answers: [ans(66, "result", "right")] } });
    c.child("Okay.");
    const r = c.propose({ act: "ask_write", parts: [ln("write.answer")] });
    expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
    expect(said(r.effects)).toContain("66");
    expect(c.session.understanding).toBe("uncertain");
  });
});

describe("PR #624 review: working after an answer is removed only when it states no answer", () => {
  it.each([
    ["I got 66. 7 plus 9 is 16.", 66],
    ["I got 66. Seven plus nine is sixteen, so I carry the ten.", 66],
    ["I got 66. I added 2 and 3 so my answer is 56.", 56],
    ["I got 66. 2 plus 3 is 5, so 56.", 56],
    ["I got 66. 2 plus 3 is 6.", 6],
    ["I got 66. I got 2 plus 3 is 5.", 5],
    ["I got 66. 12 minus 8 is 4.", 66],
    ["I got 66. 2 minus 3 is 6.", 6],
  ])("reads %j with the final answer %d", (text, final) => {
    expect(readAnswer(text).final).toEqual(num(final));
  });
});

describe("PR #624 review 2: dropped working never hides another answer (fails closed on the outcome)", () => {
  const accept66 = (text: string) => {
    const c = call();
    c.child(text);
    return { c, r: c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { start: "has_work", answers: [ans(66, "result", "right")] } }) };
  };
  it.each([
    "I got 66. I added 20 and 30 and 6 so my final is 56.",
    "I got 66. I added 20 and 30 and 6 so I wrote 56.",
    "I got 66. I added 2 and 3 so my answer is 56.",
    "I got 66. 20 plus 30 plus 6 is 56.",
  ])("does not accept 66 from %j", (text) => {
    const { c, r } = accept66(text);
    expect(r.refusal).not.toBeNull();
    expect(c.session.solved).toBeNull();
  });
  it.each([
    "I got 66. I added 20 and 40 and 6.",
    "I got 66. 7 plus 9 is 16.",
    "I got 66. Seven plus nine is sixteen, so I carry the ten.",
    "I got 66. 2 plus 3 plus 1 is 6.",
  ])("keeps 66 as the final of %j, and confirms it before accepting it (two sentences with numbers, review round 3)", (text) => {
    const { c, r } = accept66(text);
    expect(r.refusal?.code).toBe("answer_not_committed");
    expect(readAnswer(text, readOptionsFor(ADD as OperationPackage)).final).toEqual(num(66));
    expect(c.acts).toContain("confirm");
  });
  it("is not sure of a final when dropped working holds another candidate", () => {
    expect(readAnswer("I got 66. I added 20 and 30 and 6 so my final is 56.").sure).toBe(false);
    expect(readAnswer("I got 66, I added 20 and 40 and 6.", readOptionsFor(ADD as OperationPackage)).sure).toBe(true);
  });
});

describe("PR #624 review 2: a wrong equation in the child's words is not a right step (C10-r1)", () => {
  const ones = (text: string, verdict: "right" | "wrong") => {
    const c = call();
    c.child(text);
    const parts = verdict === "wrong" ? [ln("check.not_yet", { step: "ones" }), ln("step.invite", { step: "ones" })] : [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })];
    return c.propose({ act: "guide", step: verdict === "wrong" ? "ones" : "tens", level: 0, parts, reading: { start: "has_work", answers: [ans(verdict === "wrong" ? 6 : Number(text.match(/16|6/)![0]), "ones", verdict)] } });
  };
  it.each(["I add the ones. 7 plus 9 is 6.", "7 and 9 make 6.", "7 + 9 = 6.", "Um, I think 7 plus 9 equals 6."])("lets the model's 'wrong' stand for %j", (text) => {
    const r = ones(text, "wrong");
    expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
    expect(said(r.effects)).not.toContain("7 + 9 = 16");
  });
  it.each(["7 plus 9 is 6.", "7 and 9 make 6.", "7 + 9 = 6."])("refuses 'right' for %j", (text) => {
    expect(ones(text, "right").refusal?.code).toBe("accepts_wrong_answer");
  });
  it.each(["7 plus 9 is 16.", "6, carry the 1.", "I wrote 6 and carried 1.", "I put 6 in the ones.", "6"])("still takes %j as the right ones step", (text) => {
    const r = ones(text, "right");
    expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
  });
});

describe("PR #624 review round 3: only one sentence with numbers commits a final answer", () => {
  const accept66 = (text: string) => {
    const c = call();
    c.child(text);
    return { c, r: c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { start: "has_work", answers: [ans(66, "result", "right")] } }) };
  };
  it.each(["66", "I got 66.", "It's 66, I'm sure.", "So 66!", "I got 66, with carrying."])("commits %j: one sentence with numbers", (text) => {
    expect(accept66(text).r.refusal).toBeNull();
  });
  it.each(["I got 66. My answer is 66.", "66. 66.", "I got 66.\n66", "It's 66. I'm sure it's 66."])("confirms %j: two sentences that agree still do not commit", (text) => {
    const { c, r } = accept66(text);
    expect(r.refusal?.code).toBe("answer_not_committed");
    expect(c.session.solved).toBeNull();
    expect(c.acts).toContain("confirm");
  });
  it("asks which one when two sentences differ", () => {
    const { c, r } = accept66("I got 56. I got 66.");
    expect(r.refusal).not.toBeNull();
    expect(c.session.solved).toBeNull();
  });
  it("commits after a plain yes to Maya's confirmation", () => {
    const { c } = accept66("I got 66. My answer is 66.");
    c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "66" })] });
    c.child("Yes.");
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).toBeNull();
    expect(c.session.solved).toBe("child");
  });
  it("never lets two sentences of steps mark a step right with another number beside it", () => {
    const c = call();
    c.child("7 plus 9 is 16, I wrote 5.");
    expect(c.propose({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { answers: [ans(16, "ones", "right")] } }).refusal).not.toBeNull();
  });
});

describe("#605 Maya's new lines (Savar 2026-11-06: conversational and human-like)", () => {
  const accept = { act: "accept_answer" as const, parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } };
  const confirmed = (yes: string) => {
    const c = call();
    c.child("Is it 66?");
    c.maya({ act: "confirm", parts: [ln("confirm.heard", { heard: "66" })] });
    c.child(yes);
    return c;
  };

  it("a guessed right answer gets one light check, never a third confirmation, and no hint is counted", () => {
    const c = confirmed("Yes, I guessed 66.");
    expect(c.propose(accept).refusal?.code).toBe("answer_not_committed");
    expect(c.acts).not.toContain("confirm");
    const words = c.maya({ act: "guide", step: "ones", level: 2, parts: [ln("check.guess"), ln("step.operation", { step: "ones" })] });
    expect(words).toMatch(/guess/i);
    expect(words).toContain("7 + 9");
    expect(c.session.hints).toBe(0);
  });

  it("a yes said with doubt gets 'Let's check it together', not a second 'Did you say'", () => {
    const c = confirmed("Yes, I said 66. I'm not sure it's right.");
    expect(c.propose(accept).refusal).not.toBeNull();
    expect(c.acts).not.toContain("confirm");
    const words = c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("check.together"), ln("step.invite", { step: "ones" })] });
    expect(words).toMatch(/check it/i);
    // Code's own fallback does the same.
    const d = confirmed("Yes, I said 66. I'm not sure it's right.");
    expect(d.firstFallback([accept, accept]).proposal.parts.map((p) => ("line" in p ? p.line : null))).toContain("check.together");
  });

  it("never offers a check lead-in for a sure answer, or for a wrong one", () => {
    const c = call();
    c.child("I got 66.");
    expect(c.propose({ act: "guide", step: "ones", level: 0, parts: [ln("check.together"), ln("step.invite", { step: "ones" })] }).refusal?.code).toBe("line_not_offered");
    const d = call();
    d.child("Maybe 56?");
    expect(d.propose({ act: "guide", step: "ones", level: 0, parts: [ln("check.together"), ln("step.invite", { step: "ones" })] }).refusal?.code).toBe("line_not_offered");
  });

  it("after the answer stands, 'I just guessed' gets the light check, and the guess is never evidence of understanding", () => {
    const c = call();
    c.child("I got 66.");
    c.maya(accept);
    c.child("I just guessed!");
    expect(c.propose({ act: "ask_write", parts: [ln("check.guess"), ln("check.thinking")], understanding: "evidence_observed" }).refusal?.code).toBe("invalid_proposal");
    expect(c.maya({ act: "ask_write", parts: [ln("check.guess"), ln("check.thinking")], understanding: "uncertain" })).toMatch(/guess/i);
    expect(c.session.understanding).toBe("uncertain");
  });

  it("a right answer with a wrong reason keeps the answer and fixes the step with code's equation", () => {
    const c = call();
    c.child("I got 66.");
    c.maya(accept);
    c.child("7 plus 9 is 15.");
    const words = c.maya({ act: "ask_write", parts: [ln("check.fix", { step: "ones" }), ln("write.answer")], understanding: "uncertain", reading: { answers: [ans(15, "ones", "wrong")] } });
    expect(words).toContain("7 + 9 = 16");
    expect(words).toMatch(/right|stays/);
    expect(c.session.solved).toBe("child");
    // Only after code checked that step wrong.
    const d = call();
    d.child("I got 66.");
    d.maya(accept);
    d.child("Okay.");
    expect(d.propose({ act: "ask_write", parts: [ln("check.fix", { step: "ones" }), ln("write.answer")], understanding: "uncertain" }).refusal).not.toBeNull();
  });

  it("explains a carry a second way (ten ones make one ten) only after the regroup line was said", () => {
    const c = call();
    c.child("16 for the ones. 2 plus 3 is 5.");
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.why", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right"), ans(5, "tens", "wrong")] } }).refusal?.code).toBe("line_not_offered");
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right"), ans(5, "tens", "wrong")] } });
    c.child("Why does the 1 go to the tens?");
    const words = c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.why", { step: "tens" })] });
    expect(words).toMatch(/10 ones|Ten ones|16 ones/);
    expect(words).toMatch(/ten/);
  });

  it("answers 'I take the smaller from the bigger' with the order of a subtraction, from code's numbers", () => {
    const c = call(SUBTRACT);
    c.child("I take the smaller from the bigger. 8 minus 2 is 6.");
    const words = c.maya({ act: "guide", step: "ones", level: 1, parts: [ln("step.order", { step: "ones" })], reading: { start: "has_work", answers: [ans(6, "ones", "wrong")] } });
    expect(words).toMatch(/2|8/);
    expect(words).not.toContain("24");
  });

  it.each(["I'm done!", "Yay! I'm done. Thanks, Maya!", "All done.", "Okay, I'm finished with it.", "I'm done, I got 66."])("closes warmly after %j once the answer stands", (done) => {
    const c = call();
    c.child("I got 66.");
    c.maya(accept);
    c.child(done);
    expect(c.acts).toEqual(["close"]);
    expect(c.maya({ act: "close", parts: [ln("close.solved")] })).toContain("27 + 39");
  });

  it.each(["I'm done writing.", "I'm not done.", "Am I done?", "I'm done with 27 + 39.", "Okay."])("keeps the check after %j", (turn) => {
    const c = call();
    c.child("I got 66.");
    c.maya(accept);
    c.child(turn);
    expect(c.acts).not.toEqual(["close"]);
  });

  it("never praises wrong work in 'not yet'", () => {
    const c = call();
    c.child("I got 56.");
    const offers = lineOffers(c.session).guide ?? [];
    for (const o of offers.filter((x) => x.line === "check.not_yet")) for (const t of o.texts) expect(t).not.toMatch(/Almost|Close!|Good try/);
  });
});
