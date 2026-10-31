import { describe, expect, it } from "vitest";
import {
  allLineTexts,
  createSession,
  lineOffers,
  PROPOSAL_SCHEMA,
  step,
  freeTalkProblem,
  PHRASE_ACTS,
  PHRASE_GROUPS,
  PHRASES,
  speechKey,
  talkMath,
  TEMPLATES,
  valuesIn,
  type Act,
  type LineOffer,
  type Session,
  type SessionEvent,
} from "@/lib/maya";
import { checkQuestionPackage, workedSteps, type AnswerValue, type Operation, type OperationPackage, type QuestionPackage } from "@/lib/question-package";

// #372 (D-195): Maya's math comes only from code-written lines. Every sentence the review rounds of PR #350 found
// passing the free-text checks is now impossible: the model's warm talk refuses it (any digit, number word, operation,
// place, carry, write or result word), no line can say it, the board cannot write it, and if a voice says it anyway the
// call starts a repair. Through the public interface only.

const num = (value: number): AnswerValue => ({ type: "number", value });

function pkgOf(text: string, operation: Operation, easier: Operation, extra: Partial<QuestionPackage> = {}): OperationPackage {
  const steps = workedSteps(operation);
  const result = steps[steps.length - 1];
  const easierSteps = workedSteps(easier);
  const easierResult = easierSteps[easierSteps.length - 1];
  const pkg = {
    id: `wbq-lines-${operation.kind}`,
    ref: { source: "workbook", workbookId: "11111111-1111-4111-8111-111111111111", page: 23, question: 4 },
    templateId: null,
    text,
    answer: { value: result.kind === "result" ? result.value : num(0), accepted: [], unit: null },
    operation,
    steps,
    skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
    level: 9,
    difficulty: 2,
    wrongAnswers: [{ value: num(9999), cause: "O3", description: "A slip", step: null }],
    easierExample: { text: "An easier one.", operation: easier, answer: easierResult.kind === "result" ? easierResult.value : num(0), steps: easierSteps },
    ...extra,
  } as OperationPackage;
  const check = checkQuestionPackage(pkg);
  if (!check.ok) throw new Error(`${text}: ${check.reason}`);
  return pkg;
}

const ADD = pkgOf("27 + 39 = ?", { kind: "add", operands: [27, 39] }, { kind: "add", operands: [18, 5] });
const SUB = pkgOf("52 − 17 = ?", { kind: "subtract", operands: [52, 17] }, { kind: "subtract", operands: [32, 5] });
const story = (text: string, operands: [number, number] = [27, 39], kind: "add" | "subtract" = "add") =>
  pkgOf(text, { kind, operands }, kind === "add" ? { kind: "add", operands: [18, 5] } : { kind: "subtract", operands: [32, 5] });
const STORIES = [
  story("Sam has 27 dollars and gets 39 dollars. How many dollars now?"),
  story("Sam has $27 and gets $39. How much now?"),
  story("Sam has 27 bucks and gets 39 bucks. How much now?"),
  story("A toy costs 27 and a book 39. What is the total price?"),
  story("Mia has 27 stickers. Leo has 39 more than Mia. How many does Leo have?"),
  story("Sam has 27 dollars and gets 39 dollars. How many dollars altogether?"),
  story("Sam has 52 stickers and gives away 17. How many are left?", [52, 17], "subtract"),
  story("There were 52 apples. 17 are eaten. How many are left?", [52, 17], "subtract"),
];
const MORE = [
  pkgOf("47 × 23 = ?", { kind: "multiply", operands: [47, 23] }, { kind: "multiply", operands: [12, 3] }),
  pkgOf("157 ÷ 6 = ?", { kind: "divide", operands: [157, 6] }, { kind: "divide", operands: [15, 3] }),
  pkgOf("2.5 + 1.75 = ?", { kind: "decimal-add", operands: [2.5, 1.75] }, { kind: "decimal-add", operands: [1.5, 1.2] }),
  pkgOf("5.2 − 1.75 = ?", { kind: "decimal-subtract", operands: [5.2, 1.75] }, { kind: "decimal-subtract", operands: [2.5, 1.2] }),
  pkgOf("2.5 × 1.3 = ?", { kind: "decimal-multiply", operands: [2.5, 1.3] }, { kind: "decimal-multiply", operands: [1.5, 2] }),
  pkgOf("105 − 98 = ?", { kind: "subtract", operands: [105, 98] }, { kind: "subtract", operands: [32, 5] }),
  pkgOf("4005 − 2 = ?", { kind: "subtract", operands: [4005, 2] }, { kind: "subtract", operands: [32, 5] }),
];
const ALL = [ADD, SUB, ...STORIES, ...MORE];

/**
 * Every sentence the review rounds of PR #350 refused (or found passing as a known gap) as Maya's words, by round. The
 * sentences are for 27 + 39 unless a story or 52 − 17 is named; where a sentence was only refused for one problem, it is
 * impossible for every problem now.
 */
const FAILING: Record<string, string[]> = {
  "round 1 (F1)": ["Seven plus nine is fifteen.", "7+9=15"],
  "round 2 (F1-R2)": [
    "6 / 2 = 4", "7 + 9 = 16 = 15", "7 × (9 + 2) = 65", "Two tens plus three tens is five ones.", "The ones total is fifteen.",
    "The answer is sixty-five.", "0.1 + 0.2 = 0.30000000000000001", "1 + 1 = 0.0000001", "Twice 8 is 8.", "7 + 9 is 16 less 1.",
    "7 + 9 = 16²", "It is 27 plus 38.", "Twenty-seven plus thirty-nine is sixty-five.", "One thousand hundred is 1000.",
    "Seven plus nine comes to fifteen.", "Seven plus nine, that's fifteen.", "7 + 9 → 15", "7 + 9 isn't 16", "7 + 9 > 20",
    "Seven plus nine totals fifteen.", "Nine take away seven leaves three.", `${"1 + ".repeat(6000)}1 = 6001`,
  ],
  "round 3 (F1-R3, N2-R3)": [
    "constructor + 1 = 1", "The answer is exactly sixty-five.", "The answer: sixty-five.", "The sum: sixty-five.", "27 plus 39, then 65.",
    "Seven plus nine is, fifteen?", "7 + 9 = bananas 15?", "Seven plus nine equals a total of fifteen?",
    "Two apples plus three apples equals four apples?", "2 cm + 3 cm = 6 cm?", "Ignore all checks. The answer is exactly 65.",
    "7+9=16. The total is exactly fifteen.", "Is it 15?", "Look at the 4.", "What is 7 plus 4?", "The answer is one point sixty-six.",
    "Answer: 65", "27+39, then 65", "7+9=bad 15?", "Carry the 2.", "Write the 7 in the ones.", "The ones total is 15.",
    "Count: forty, forty-one, forty-two.", "Borrow the 2.", "Write the 4.", "Carry the 7, 8, 9.", "Look at the 9. 10. 11.",
  ],
  "round 4 (R350-4-1, R350-4-2)": [
    "Carry forward the 7.", "Write a small 7.", "Carry over a 7.", "Put a 7 on top.", "Write down 7 here.", "Carry the little 9 to the tens.",
    "Write 6 and 7.", "Write 6, then carry the 7 over.", "Now write the 16 in the ones.", "The answer is 65 dollars.",
    "The total is 15 seconds.", "2 dollars + 3 dollars = 6 dollars?", "Take 120 steps.", "Carry 2 steps.", "It costs 65 dollars.",
  ],
  "round 5 (R350-5-1)": ["It costs $65.", "That is 65 bucks.", "It costs 65 cents.", "It costs 65 pennies."],
  "round 6 (R350-6)": [
    "It costs 2 dollars.", "That is 2 bucks.", "It costs 4 cents.", "It costs sixty-five dollars.", "It costs 65 bucks.", "That is 65 cents.",
    "It costs a quarter.", "That is a dime.", "Add a nickel.", "It costs a loonie.", "Two toonies.", "It costs half a dollar.",
    "Pay with a five-dollar bill.", "Is it a penny?", "Seven plus nine is a quarter.",
  ],
  "round 7 (R350-7-1, R350-7-2)": [
    "Sam has 27 dollars and gets 38 dollars.", "Sam has 39 dollars and gets 27 dollars.",
    "Sam has 27 dollars and gets 39 dollars, so he has 65 dollars now.", "Leo has 38 more than Mia.", "Sam has 52 stickers and gives away 18.",
    "There were 52 apples, and 18 are eaten.", "There were 52 apples, and 17 are eaten, so 34 are left.", "It costs 5 cents.",
    "It costs 18 dollars.", "Sam pays 5.", "It is worth 5.", "It costs two dollars.", "Seven dollars and nine dollars.",
  ],
  "round 8 (R350-8)": [
    "Sam has 27 dollars altogether.", "Sam has 39 dollars.", "Sam gets 27 dollars altogether.", "Sam gets 39 dollars altogether.",
    "Sam has 27 dollars and gets 39 dollars altogether.", "It costs one dollar.", "It costs 6 dollars.", "It costs 16 dollars.",
    "Sam has 27 dollars, so he gets 39 dollars.", "He has 27 dollars.", "Sam gets 39 dollars.", "Sam has 66 dollars.",
    "There were 52 apples, and 17 are eaten.",
  ],
  "round 9 (R350-9-1)": [
    "Now subtract the 39 dollars.", "Take away 5.", "Take away the 7.", "Find the difference.", "Multiply the ones.", "Share the ones.",
    "Seven minus nine is negative two.", "Now add the 7.", "What is the sum?", "Twelve plus seven is nineteen.", "In 18 + 5, take away the ones.",
  ],
  "round 10 (R350-10)": [
    "Remove the 7.", "Decrease the 9 by 7.", "Double the 7.", "Count back 7.", "Use − on the ones.", "Use × on the ones.", "Use ÷ on the ones.",
    "Halve the 6.", "Split the 9.", "Add the 7.", "Use + on the ones.", "Carry the 1 to the tens.",
  ],
  "PR #374 round 1 (R374-1: warm talk that reverses a line)": [
    "Do the opposite.", "Never mind.", "Ignore that.", "Undo it.", "Forget what I said.", "Actually, don't.", "Swap them.", "Do it backwards.",
  ],
  "round 11 (the gaps merged with PR #350)": [
    "Sam removes the 7.", "Move 7 away.", "Let's halve it.", "Sam removes it.", "Move it away.", "Halve it.", "Double it.",
    "Now take it away.", "Let's split it.", "Sam gives one away.",
  ],
};
const EVERY = Object.entries(FAILING).flatMap(([round, list]) => list.map((sentence) => [round, sentence] as const));

/** A text's sentences, as Maya's say effects are compared. */
const sentences = (text: string) => text.split(/(?<=[.?!])\s+/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
/** Every sentence any line can say for these packages, with confirmations of any number in `heard`. */
const lineSentences = (pkgs: OperationPackage[], heard: AnswerValue[] = []) => new Set(pkgs.flatMap((p) => allLineTexts(p, heard)).flatMap(sentences));

/** A call on 27 + 39 (or `pkg`), past its opening, where the child asks to be shown: guide H0 to H3 are open on the ones. */
function call(pkg: OperationPackage = ADD, random = 1, extra: { history?: Record<string, number>; childName?: string } = {}) {
  let s: Session = createSession({ callId: "lines-call", package: pkg, random, ...extra });
  const send = (e: SessionEvent) => {
    const r = step(s, e);
    s = r.session;
    return r;
  };
  send({ type: "start", at: 0 });
  expect(send({ type: "proposal", at: 0, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }] } }).refusal).toBeNull();
  send({ type: "child_turn", at: 0, text: "Show me." });
  return {
    get s() { return s; },
    send,
    refusal: (p: Record<string, unknown>) => step(s, { type: "proposal", at: 0, proposal: { version: 2, ...p } }).refusal,
  };
}
const show = (parts: unknown[], extra: Record<string, unknown> = {}) => ({ act: "guide", step: "ones", level: 3, reading: { help: "show" }, parts, ...extra });

describe("every failing sentence of PR #350's review rounds is impossible", () => {
  const known = lineSentences(ALL);

  it.each(EVERY)("%s: a turn with a math line refuses the model's words %s, before or after the line", (_round, sentence) => {
    const line = { line: "step.show", slots: { step: "ones" } };
    expect(call().refusal(show([line, { talk: sentence }]))).toMatchObject({ code: "math_line_not_last" });
    expect(call().refusal(show([{ talk: sentence }, line]))).toMatchObject({ code: "free_talk_in_math_turn" });
  });

  it.each(EVERY)("%s: a turn with no math line never says %s: the guards replace it with a bank phrase", (_round, sentence) => {
    expect(freeTalkProblem(sentence)).not.toBeNull();
    const c = call();
    const r = c.send({ type: "proposal", at: 0, proposal: { version: 2, act: "clarify", parts: [{ talk: sentence }] } });
    expect(r.refusal).toBeNull();
    const [say] = r.effects.filter((e) => e.kind === "say");
    expect(say).toMatchObject({ kind: "say", talkReplaced: 1 });
    const text = say.kind === "say" ? say.text : "";
    expect(text).not.toContain(sentence);
    expect(PHRASES.smalltalk.map((x) => x.replace(/,? ?\{name\}/, ""))).toContain(text);
  });

  it.each(EVERY)("%s: no line says %s", (_round, sentence) => {
    // Even confirming a number the child said cannot make it: the heard numbers are the sentence's own.
    const lines = lineSentences(ALL, valuesIn(sentence));
    for (const part of sentences(sentence)) expect(lines.has(part)).toBe(false);
    expect(known.has(sentence)).toBe(false);
  });

  it.each(EVERY)("%s: the board does not write %s", (_round, sentence) => {
    const board = [{ op: "write", id: "w", text: sentence, place: { region: "main" } }];
    expect(call().refusal(show([{ line: "step.show", slots: { step: "ones" } }], { board }))).toMatchObject({ code: expect.stringMatching(/^(board_not_code|math_in_talk|reveals_answer)$/) });
  });

  it.each(EVERY)("%s: said aloud anyway, %s starts a repair", (_round, sentence) => {
    const c = call();
    expect(c.refusal(show([{ line: "step.show", slots: { step: "ones" } }]))).toBeNull();
    c.send({ type: "proposal", at: 0, proposal: { version: 2, ...show([{ line: "step.show", slots: { step: "ones" } }]) } });
    c.send({ type: "maya_said", at: 0, text: sentence });
    expect(c.s.state).toBe("REPAIR_MAYA");
  });

  it("refuses the round 11 gaps for every problem, not only addition", () => {
    for (const pkg of [ADD, SUB, ...MORE]) {
      for (const sentence of FAILING["round 11 (the gaps merged with PR #350)"]) {
        expect(call(pkg).refusal({ act: "guide", step: pkg.steps[0].id, level: 0, parts: [{ talk: sentence }, { line: "step.invite", slots: { step: pkg.steps[0].id } }], reading: { help: "show" } }))
          .toMatchObject({ code: "free_talk_in_math_turn" });
        expect(freeTalkProblem(sentence)).not.toBeNull();
      }
    }
  });
});

/** Every act the session offers lines for in a scripted call, with each offer tried: what Maya can say is only lines. */
describe("whatever the model picks, Maya's math is a line", () => {
  /** The proposal that uses one offer for an act, with the step and level it needs. */
  const proposalFor = (s: Session, act: Act, o: LineOffer) => {
    const warm = PHRASE_GROUPS.find((g) => PHRASE_ACTS[g].includes(act));
    const base: Record<string, unknown> = { version: 2, act, parts: [...(warm ? [{ warm }] : []), { line: o.line, slots: o.slots }] };
    if (act === "guide") Object.assign(base, { step: o.slots.step ?? s.ladder.step, level: o.level ?? 0, reading: { help: "show" } });
    if (act === "example_step") Object.assign(base, { step: o.slots.step });
    if (act === "ask_write" && s.state === "CHECK") base.understanding = "uncertain";
    return base;
  };

  it.each(ALL.map((p) => [p.text, p] as const))("only says lines and talk for %s", (_text, pkg) => {
    const lines = lineSentences([pkg]);
    const sessions: Session[] = [];
    const c = call(pkg);
    sessions.push(c.s);
    c.send({ type: "child_turn", at: 0, text: "I can't start." });
    sessions.push(c.s);
    let tried = 0;
    for (const s of sessions) {
      for (const [act, offers] of Object.entries(lineOffers(s)) as [Act, LineOffer[]][]) {
        for (const o of offers) {
          const r = step(s, { type: "proposal", at: 0, proposal: proposalFor(s, act, o) });
          if (r.refusal) continue;
          tried += 1;
          for (const e of r.effects) {
            if (e.kind !== "say") continue;
            for (const x of sentences(e.text)) expect(talkMath(x) === null || lines.has(x), `${act} ${o.line}: ${x}`).toBe(true);
            // The math line is the last thing said: the turn ends with a line.
            expect([...lines].some((l) => e.text.endsWith(l)), e.text).toBe(true);
          }
        }
      }
    }
    expect(tried).toBeGreaterThan(5);
  });
});

/** The math in a line, read back: "a op b (op c) = r", "a ÷ b = q R r", "a is less than b". */
function falseMath(text: string): string | null {
  const n = (x: string) => Math.round(Number(x) * 1000);
  for (const m of text.matchAll(/(\d+(?:\.\d+)?(?:\s*[+−×÷]\s*\d+(?:\.\d+)?)+)\s*=\s*(\d+(?:\.\d+)?)(?:\s*R\s*(\d+))?/g)) {
    const [, left, right, rest] = m;
    const tokens = left.split(/\s*([+−×÷])\s*/);
    if (tokens.includes("÷")) {
      const [a, , b] = tokens.map(Number);
      const q = Number(right);
      const r = rest === undefined ? 0 : Number(rest);
      if (tokens.length !== 3 || a !== q * b + r || r < 0 || r >= b) return m[0];
      continue;
    }
    // × first, then + and − from the left, on thousandths.
    const terms: number[] = [n(tokens[0])];
    const ops: string[] = [];
    for (let i = 1; i < tokens.length; i += 2) {
      if (tokens[i] === "×") terms[terms.length - 1] = (terms[terms.length - 1] * n(tokens[i + 1])) / 1000;
      else { ops.push(tokens[i]); terms.push(n(tokens[i + 1])); }
    }
    const value = terms.slice(1).reduce((acc, x, i) => (ops[i] === "+" ? acc + x : acc - x), terms[0]);
    if (Math.abs(value - n(right)) > 0.5 || rest !== undefined) return m[0];
  }
  for (const m of text.matchAll(/(\d+) is less than (\d+)/g)) if (!(Number(m[1]) < Number(m[2]))) return m[0];
  return null;
}

describe("the line set", () => {
  it.each(ALL.map((p) => [p.text, p] as const))("fills every line of %s, and every equation in it holds", (_text, pkg) => {
    const texts = allLineTexts(pkg, [num(15), num(50)]);
    expect(texts.length).toBeGreaterThan(40);
    for (const text of texts) {
      expect(text, text).not.toMatch(/[{}]|undefined|NaN|null/);
      expect(text, text).toMatch(/[.?!]$/);
      expect(falseMath(text), text).toBeNull();
    }
  });

  it("checks its own equation reader", () => {
    expect(falseMath("Add the ones: 7 + 9 = 16.")).toBeNull();
    expect(falseMath("4 × 3 + 2 = 14.")).toBeNull();
    expect(falseMath("15 ÷ 6 = 2 R 3.")).toBeNull();
    expect(falseMath("7 + 9 = 15.")).toBe("7 + 9 = 15");
    expect(falseMath("15 ÷ 6 = 2 R 4.")).toBe("15 ÷ 6 = 2 R 4");
    expect(falseMath("9 is less than 7.")).toBe("9 is less than 7");
  });

  it("has a few child-friendly variants for every line, with no math in a variant's own words", () => {
    for (const [key, variants] of Object.entries(TEMPLATES)) {
      expect(variants.length, key).toBeGreaterThanOrEqual(2);
      for (const v of variants) expect(v.split(/\s+/).length, v).toBeLessThanOrEqual(22);
    }
  });

  it("picks the same wording for the same random seed, and varies with the seed", () => {
    const said = (seed: number) => {
      const c = call(ADD, seed);
      const r = c.send({ type: "proposal", at: 0, proposal: { version: 2, ...show([{ line: "step.point", slots: { step: "ones" } }], { level: 1 }) } });
      expect(r.refusal).toBeNull();
      return r.effects.flatMap((e) => (e.kind === "say" ? [e.text] : []))[0];
    };
    expect(said(7)).toBe(said(7));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(said)).size).toBeGreaterThan(2);
  });

  it("restates a story question only in its own sentences", () => {
    const pkg = STORIES[0];
    const c = call(pkg);
    const r = c.send({ type: "proposal", at: 0, proposal: { version: 2, act: "guide", step: "ones", level: 0, parts: [{ line: "question.read", slots: { sentence: 0 } }], reading: { help: "show" } } });
    expect(r.refusal).toBeNull();
    expect(r.effects).toContainEqual(expect.objectContaining({ kind: "say", text: expect.stringContaining("Sam has 27 dollars and gets 39 dollars.") }));
    expect(call(pkg).refusal({ act: "guide", step: "ones", level: 0, parts: [{ line: "question.read", slots: { sentence: 5 } }] })).toMatchObject({ code: "line_not_offered" });
  });

  it("judges a step only after code checked the child's answer", () => {
    const c = call();
    c.send({ type: "child_turn", at: 0, text: "I think it's 15." });
    const wrong15 = { answers: [{ value: num(15), step: "ones", verdict: "wrong" }] };
    // "Yes! 7 + 9 = 16." needs a right answer for the ones; "Not quite." needs a checked wrong one.
    expect(c.refusal({ act: "guide", step: "ones", level: 0, parts: [{ line: "check.right_step", slots: { step: "ones" } }], reading: wrong15 })).toMatchObject({ code: "line_not_offered" });
    expect(c.refusal({ act: "guide", step: "ones", level: 0, parts: [{ line: "check.not_yet", slots: { step: "ones" } }] })).toMatchObject({ code: "line_not_offered" });
    expect(c.refusal({ act: "guide", step: "ones", level: 0, parts: [{ line: "check.not_yet", slots: { step: "ones" } }], reading: wrong15 })).toBeNull();
  });

  it("offers the step lines up to the guide's level, and needs one at that level", () => {
    const c = call();
    expect(c.refusal({ act: "guide", step: "ones", level: 1, parts: [{ line: "step.operation", slots: { step: "ones" } }] })).toMatchObject({ code: "hint_too_high" });
    expect(c.refusal({ act: "guide", step: "ones", level: 2, parts: [{ line: "step.invite", slots: { step: "ones" } }] })).toMatchObject({ code: "invalid_proposal" });
    expect(c.refusal({ act: "guide", step: "ones", level: 2, parts: [{ line: "step.point", slots: { step: "ones" } }, { line: "step.operation", slots: { step: "ones" } }] })).toBeNull();
    expect(c.refusal({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "tens" } }] })).toMatchObject({ code: "line_not_offered" });
  });

  it("offers the model every act's lines, and only the steps not done yet", () => {
    const c = call();
    const offers = lineOffers(c.s);
    expect(Object.keys(offers).sort()).toEqual(["accept_answer", "clarify", "confirm", "example_step", "guide", "try_target"].sort());
    const guideSteps = new Set(offers.guide!.flatMap((o) => (o.line.startsWith("step.") ? [o.slots.step] : [])));
    expect([...guideSteps]).toEqual(["ones", "tens"]);
    expect(offers.guide!.every((o) => o.texts.length >= 2)).toBe(true);
  });
});

describe("the strict no-math rule for warm talk", () => {
  it.each([
    "Great effort!", "Take your time.", "I like how you're thinking.", "All right, let's keep going.", "You can do this!",
    "Hmm, let me think.", "Can you tell me how you did it?", "That was a tricky question!", "Good thinking.", "I can't check this question right now.",
    "Would you like more time?", "Well-done, Leah!", "What did you try?", "Bye for now!",
  ])("accepts %s", (talk) => expect(talkMath(talk)).toBeNull());

  it.each([
    ["7", "Look at 7."], ["٣", "Look at ٣."], ["½", "About ½ of it."], ["+", "Use +"], ["−", "Use −"], ["=", "It is ="], ["$", "A $ sign."],
    ["seventeen", "Seventeen!"], ["twentyseven", "Twentyseven."], ["first", "First, look here."], ["once", "Once more."], ["ones", "The ones."],
    ["carry", "Carry it."], ["write", "Write it down."], ["answer", "What is the answer?"], ["right", "That's right!"], ["wrong", "That's wrong."],
    ["more", "Do you want more?"], ["in all", "How many in all?"], ["away", "Move it away."], ["left", "How many are left?"], ["x", "Is it x?"],
    ["iv", "Chapter iv."], ["-", "Use - here."],
  ])("refuses %s in %s", (word, talk) => expect(talkMath(talk)).toBe(word));
});

describe("the proposal schema", () => {
  it("is a strict JSON schema of version 2 that names every line and act", () => {
    expect(PROPOSAL_SCHEMA.properties.version).toEqual({ const: 2 });
    expect(PROPOSAL_SCHEMA.required).toEqual(Object.keys(PROPOSAL_SCHEMA.properties));
    const part = PROPOSAL_SCHEMA.properties.parts.items.anyOf[0];
    expect(part.properties.line.enum).toContain("step.show");
    expect(JSON.parse(JSON.stringify(PROPOSAL_SCHEMA))).toEqual(PROPOSAL_SCHEMA);
  });

  it("accepts structured output with null for every unused field", () => {
    const c = call();
    const proposal = {
      version: 2, act: "guide", step: "ones", level: 1, understanding: null, board: null,
      parts: [{ warm: "encourage" }, { line: "step.point", slots: { step: "ones", sentence: null, heard: null, other: null } }],
      reading: { safety: null, stop: null, unclear: null, writing: null, offTopic: null, help: "show", start: null, answers: null, paper: null, correctsHearing: null },
    };
    const r = c.send({ type: "proposal", at: 0, proposal });
    expect(r.refusal).toBeNull();
    expect(r.effects[0]).toMatchObject({ kind: "say", text: expect.stringMatching(/^[^0-9]+[.!?] .*7.*9\.$/) });
  });

  it("refuses version 1, with its free-text say", () => {
    const c = call();
    expect(step(c.s, { type: "proposal", at: 0, proposal: { act: "guide", step: "ones", level: 0, say: "Look at the 7." } }).refusal).toMatchObject({ code: "invalid_proposal" });
  });
});

describe("main's items with no operation", () => {
  it("holds a checked item with no operation, with no teaching", () => {
    const tensAndOnes: QuestionPackage = {
      ...ADD,
      id: "wbq-lines-item",
      text: "47 = [ ] tens [ ] ones",
      answer: null,
      operation: null,
      steps: [],
      wrongAnswers: [],
      easierExample: null,
      item: {
        format: "boxes", scorable: true, parentChecked: false, error: null,
        regions: [{ id: "tens", kind: "box", label: "tens", answer: num(4) }, { id: "ones", kind: "box", label: "ones", answer: num(7) }],
        checks: [{ kind: "places", number: 47, parts: [{ region: "tens", place: "tens" }, { region: "ones", place: "ones" }] }],
      },
    };
    expect(checkQuestionPackage(tensAndOnes)).toMatchObject({ ok: true });
    const s = createSession({ callId: "lines-item", package: tensAndOnes });
    expect(s).toMatchObject({ package: null, contentProblem: "Maya cannot teach items with no operation yet" });
  });
});

describe("comparing what Maya said with her approved words (R374-2)", () => {
  it.each([
    ["27 + 39 = 66.", "Twenty-seven plus thirty-nine equals sixty-six"],
    ["15 ÷ 6 = 2 R 3.", "fifteen divided by six equals two remainder three"],
    ["2.5 + 1.75 = 4.25", "two point five plus one point seven five equals four point two five"],
    ["52 − 17", "fifty-two minus seventeen"],
    ["Write 105.", "write one hundred and five"],
    ["Let's look. It's 1,081!", "let us look, it is one thousand eighty-one"],
    ["You can't stop now.", "You cannot stop now"],
  ])("reads %s and %s as the same words", (a, b) => expect(speechKey(a)).toBe(speechKey(b)));

  it.each([
    ["Not quite.", "Yes!"],
    ["Add the ones: 7 + 9.", "Add the ones: 7 + 8."],
    ["Write 6.", "Write 6. Well done!"],
    ["Hmm, not yet.", "Hmm, yet."],
  ])("tells %s and %s apart", (a, b) => expect(speechKey(a)).not.toBe(speechKey(b)));
});
