// C2: spot the error in Maya's controller, through createSession, step, fallbacks and the line set. Synthetic numbers only.
import { describe, expect, it } from "vitest";
import { createSession, fallbacks, heldReason, learningEvent, step, turnWordLimit, type Session } from "./session";
import { packageLines } from "./lines";
import { scopeReason } from "./scope";
import { speechWords } from "./speech";
import { PROPOSAL_VERSION } from "./proposal";
import { spotAnswers, spotStepHeard, spotView } from "./spot-error";
import { spotWordsAsClaim } from "./spot-words";
import { teachingPackage } from "@/lib/maya-teaching";
import { asSpot, spotMissing, spotMultiplyTens, spotPlaceValue } from "@/lib/maya-teaching/spot-error-samples";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";

const made = (stored: QuestionPackage): QuestionPackage => {
  const pkg = teachingPackage(stored) as QuestionPackage;
  if (!pkg.operation) throw new Error(`held: ${stored.text}`);
  return pkg;
};
const MUL = made(spotMultiplyTens(7, 643, 448));
const MISS = made(spotMissing(4, 170, 17));
const VALUE = made(spotPlaceValue("1.2", 46213, "ten thousands", 4000));
const DIGIT = made(spotPlaceValue("2.1", 571324, "hundred thousands", 7));
const view = (p: QuestionPackage) => spotView(p as OperationPackage);
const FAMILY = { parentId: "parent-1", childId: "child-1" };

/** A session that has said hello and heard the child's first turn. */
function opened(p: QuestionPackage, text: string, grade?: number): Session {
  let s = createSession({ callId: "spot", package: p, ...(grade ? { grade } : {}) });
  s = step(s, { type: "start", at: 0 }).session;
  // At grade 3 the opening is the hello and the question (gate SE06); else the hello and the first ask.
  const parts = grade === 3 ? [{ line: "open.hello" }, { line: "question.problem" }] : [{ line: "open.hello" }, { line: "assess.ask" }];
  const open = step(s, { type: "proposal", at: 1, proposal: { version: PROPOSAL_VERSION, act: "open", parts } });
  expect(open.refusal).toBeNull();
  return step(open.session, { type: "child_turn", at: 2, text }).session;
}

/** Each child turn answered by code's first fallback, as when the model fails. */
function fallbackCall(p: QuestionPackage, turns: string[], grade?: number): { acts: string[]; texts: string[]; s: Session } {
  let s = opened(p, turns[0], grade);
  let at = 3;
  const acts: string[] = [];
  const texts: string[] = [];
  const answer = () => {
    while (s.expect === "maya" && !s.outcome) {
      const r = step(s, { type: "proposal", at: at++, proposal: fallbacks(s)[0], fallback: true });
      expect(r.refusal).toBeNull();
      s = r.session;
      const said = r.effects.find((e) => e.kind === "say");
      if (said && said.kind === "say") { acts.push(said.act); texts.push(said.text); }
    }
  };
  answer();
  for (const t of turns.slice(1)) {
    if (s.outcome) break;
    s = step(s, { type: "child_turn", at: at++, text: t }).session;
    answer();
  }
  return { acts, texts, s };
}

/** Code's fallbacks only (the model down), with the child's next words chosen from the session (null: stop). */
function drive(p: QuestionPackage, first: string, next: (s: Session) => string | null): { acts: string[]; s: Session } {
  let s = opened(p, first);
  let at = 3;
  const acts: string[] = [];
  for (let n = 0; n < 40 && !s.outcome; n++) {
    while (s.expect === "maya" && !s.outcome) {
      const r = step(s, { type: "proposal", at: at++, proposal: fallbacks(s)[0], fallback: true });
      expect(r.refusal, `${acts.length}: ${JSON.stringify(r.refusal)}`).toBeNull();
      s = r.session;
      const said = r.effects.find((e) => e.kind === "say");
      if (said && said.kind === "say") acts.push(said.act);
    }
    const text = s.outcome ? null : next(s);
    if (text === null) break;
    s = step(s, { type: "child_turn", at: at++, text }).session;
  }
  return { acts, s };
}

describe("spot the error in the controller", () => {
  it("teaches each spot-the-error question, and holds the stored one it gets with no adapter", () => {
    for (const p of [MUL, MISS, VALUE, DIGIT]) expect(heldReason(p), p.text).toBeNull();
    expect(heldReason(spotMultiplyTens(7, 643, 448))).toMatch(/no operation/);
    const s = createSession({ callId: "spot", package: MUL });
    // The session's answer is the word to tick, after the compare step.
    expect(s.package?.answer.value).toEqual({ type: "choice", value: "no" });
    expect(s.package?.steps.slice(-2).map((x) => x.kind)).toEqual(["claim-compare", "result"]);
  });

  it("closes honestly after the easier example, never with the fix or the word, and writes the stuck step (lessons 7, 10)", () => {
    for (const [p, fix, stuck] of [[DIGIT, "5", "claim"], [MUL, "4480", "r2-ones"]] as const) {
      const { acts, texts, s } = fallbackCall(p, Array.from({ length: 14 }, () => "I'm stuck."));
      expect(acts, p.text).toContain("example_step");
      expect(acts.at(-1), p.text).toBe("close");
      expect(acts).not.toContain("give_answer");
      expect(acts).not.toContain("accept_answer");
      const close = texts.at(-1)!;
      expect(packageLines(view(p) as OperationPackage).closeUnsolved().flatMap((o) => o.texts)).toContain(close);
      for (const t of texts.filter((_, i) => acts[i] !== "example_step")) {
        expect(t).not.toMatch(new RegExp(`\\b${fix}\\b`));
        expect(t).not.toMatch(/\btick (?:no|yes)\b(?! or)/i);
      }
      expect(s.outcome).toMatchObject({ reason: "child_stopped" });
      expect(learningEvent(s, FAMILY)).toMatchObject({ source: "call", result: "blank", stuckStep: stuck, mistake: null });
    }
  });

  it("a wrong word at the top help, with the model down: the easier example, then the honest close and the stuck step (review of #743)", () => {
    // On the first work step at H3 (the example already shown), and on the word step at H2 after the fix.
    for (const [p, work, first] of [[MUL, "r2-ones", "I'm stuck."], [MISS, "hundreds", "I'm stuck."]] as const) {
      let said = false;
      const { acts, s } = drive(p, first, (x) => (!said && x.ladder.step === work && x.ladder.hint === 3 ? ((said = true), "It's right.") : "I'm stuck."));
      expect(said, p.text).toBe(true);
      expect(acts.at(-1), p.text).toBe("close");
      expect(acts).toContain("example_step");
      expect(acts).not.toContain("give_answer");
      expect(s.outcome).toMatchObject({ reason: "child_stopped" });
      expect(learningEvent(s, FAMILY)).toMatchObject({ source: "call", stuckStep: work });
    }
    for (const [p, fix] of [[MUL, "7 times 640 is 4480."], [MISS, "680 divided by 4 is 170."]] as const) {
      let said = false;
      const { acts, s } = drive(p, fix, (x) => (!said && x.ladder.step === "result" && x.ladder.hint === 2 ? ((said = true), "It's right.") : "I'm stuck."));
      expect(said, p.text).toBe(true);
      const word = acts.lastIndexOf("guide");
      expect(acts.slice(word + 1).every((a) => a === "example_step" || a === "close"), acts.join(" ")).toBe(true);
      expect(acts.slice(word + 1)).toContain("example_step");
      expect(acts.at(-1)).toBe("close");
      expect(s.outcome).toMatchObject({ reason: "child_stopped" });
      expect(learningEvent(s, FAMILY)).toMatchObject({ source: "call", stuckStep: "result" });
    }
  });

  it("never prints a number of the question as the easier example's answer given (lesson 11, review of #743)", () => {
    // The R2 shape "20 × ? = 7000": its example "30 × ? = 60" (answer 2) once got the answer given 20, the question's factor.
    const pkg = view(made(spotMissing(20, 350, 35))) as OperationPackage;
    const ex = pkg.easierExample.steps.find((x) => x.kind === "claim-compare");
    expect(ex?.kind).toBe("claim-compare");
    const shown = ex?.kind === "claim-compare" ? ex.shown : null;
    for (const n of [20, 7000, 350, 35]) expect(shown).not.toBe(n);
    expect(packageLines(pkg).exampleIntro().flatMap((o) => o.texts).join(" ")).not.toMatch(/answer given is (?:20|7000|350|35)\b/);
  });

  it("does not use a printed ordinal for the example's answer given", () => {
    const original = made(spotMissing(20, 350, 35)) as OperationPackage;
    const before = view(original)!.easierExample.steps.find((x) => x.kind === "claim-compare");
    expect(before?.kind).toBe("claim-compare");
    if (before?.kind !== "claim-compare") throw new Error("missing example");
    const printed = { ...original, text: `${original.text} ${before.shown}rd` };
    const after = view(printed);
    expect(after).not.toBeNull();
    if (after) {
      const comparison = after.easierExample.steps.find((x) => x.kind === "claim-compare");
      expect(comparison?.kind).toBe("claim-compare");
      if (comparison?.kind === "claim-compare") expect(comparison.shown).not.toBe(before.shown);
    }
  });

  it("carries the check of the answer given in every compare-step help line (lesson 2)", () => {
    const pv = packageLines(view(DIGIT) as OperationPackage).help("claim").filter((o) => o.line !== "chart.open");
    expect(pv.length).toBeGreaterThan(0);
    for (const t of pv.flatMap((o) => o.texts)) expect(t).toMatch(/Then check 7\.$/);
    for (const t of packageLines(view(MUL) as OperationPackage).help("claim").flatMap((o) => o.texts)) {
      expect(t).toMatch(/\b448\b/);
      expect(t).not.toMatch(/\b4480\b/);
    }
    // No H3 on the compare step: it would show the fix.
    expect(packageLines(view(MUL) as OperationPackage).help("claim").map((o) => o.level)).toEqual([0, 1, 2]);
  });

  it("fits the opening, and every help, example and close line, in a grade 3 turn, with the longest real wordings (lesson 3)", () => {
    const long = made(asSpot(storedPlaceValue({ variant: "2.2", n0: 785243, place: "hundred thousands", page: 26, question: 12 }), 70000));
    const limit = turnWordLimit({ grade: 3 });
    for (const p of [long, MUL, MISS, VALUE, DIGIT]) {
      // The opening as the session says it: the hello and the question, or the fixed workbook opening.
      for (const workbook of [false, true]) {
        let s = createSession({ callId: "spot-g3", package: p, grade: 3, ...(workbook ? { confirmWorkbook: true } : {}) });
        s = step(s, { type: "start", at: 0 }).session;
        const parts = workbook ? [{ line: "open.hello" }] : [{ line: "open.hello" }, { line: "question.problem" }];
        const open = step(s, { type: "proposal", at: 1, proposal: { version: PROPOSAL_VERSION, act: "open", parts } });
        expect(open.refusal, p.text).toBeNull();
        const said = open.effects.find((e) => e.kind === "say");
        expect(speechWords((said as { text: string }).text), p.text).toBeLessThanOrEqual(limit);
      }
      const l = packageLines(view(p) as OperationPackage);
      const offers = [...l.exampleIntro(), ...l.tryTarget(), ...l.help("claim"), ...l.help("result"), ...l.answerRight(), ...l.writeAnswer(), ...l.closeUnsolved()];
      for (const t of offers.flatMap((o) => o.texts)) expect(speechWords(t), t).toBeLessThanOrEqual(limit);
    }
  });

  it("'I'm stuck.' first at grade 3: the first line fits the turn, carries its framing and never gives the fix (lessons 2, 3)", () => {
    const limit = turnWordLimit({ grade: 3 });
    for (const [p, fix] of [[VALUE, "40000"], [DIGIT, "5"], [MUL, "4480"], [MISS, "170"]] as const) {
      const { acts, texts } = fallbackCall(p, ["I'm stuck."], 3);
      expect(["guide", "example_step"], p.text).toContain(acts[0]);
      expect(speechWords(texts[0]), texts[0]).toBeLessThanOrEqual(limit);
      expect(texts[0]).not.toMatch(new RegExp(`\\b${fix}\\b`));
      expect(texts[0]).not.toMatch(/\btick (?:no|yes)\b(?! or)/i);
    }
    // The compare step is the first step of a "which digit" item. A child stuck from the start sees the easier example
    // first (#737); the first help line on the compare step, when it comes, says to check the answer given.
    const stuck = fallbackCall(DIGIT, Array.from({ length: 6 }, () => "I'm stuck."), 3);
    const firstGuide = stuck.texts[stuck.acts.indexOf("guide")];
    expect(firstGuide).toMatch(/Then check 7\./);
    expect(speechWords(firstGuide)).toBeLessThanOrEqual(limit);
  });

  it("keeps the child's full sentences on this question in scope (lesson 1)", () => {
    const cases: [QuestionPackage, string][] = [
      // ("7 times 40 is 280." is refused on the one-step multiply path itself (A1), with no spot item: reported, not changed here.)
      [MUL, "7 times 640 is 4480."], [MUL, "448 times 10 is 4480."], [MUL, "7 times 4 is 28."], [MUL, "280 plus 4200 is 4480."],
      [MISS, "680 divided by 4 is 170."], [MISS, "4 times 170 is 680."], [MISS, "17 times 10 is 170."],
      [VALUE, "4 times 10000 is 40000."], [VALUE, "4000 times 10 is 40000."],
    ];
    for (const [p, t] of cases) expect(scopeReason(view(p) as OperationPackage, t, false), t).toBeNull();
    expect(scopeReason(view(MUL) as OperationPackage, "5 times 9 is 45.", false)).toBe("changed_problem");
  });
});

describe("the child's words on a spot-the-error question", () => {
  it("reads right and wrong as the claim words, from an allow-list", () => {
    expect(spotWordsAsClaim("It's not right.")).toBe("it's no.");
    expect(spotWordsAsClaim("So it's right.")).toBe("so it's yes.");
    expect(spotWordsAsClaim("The answer given is wrong.")).toBe("it is no.");
    expect(spotWordsAsClaim("Incorrect!")).toBe("no!");
    // Naming the fix with "right" is no judgement.
    expect(spotWordsAsClaim("The right answer is 4480.")).toBe("the fix is 4480.");
    expect(spotWordsAsClaim("No, it's wrong, it should be 4480.")).toBe("it's no, it should be 4480.");
    // A number with its conclusion, as the claim reader's ", so it's no" form.
    expect(spotWordsAsClaim("It's 4480, so it's wrong.")).toBe("4480, so it's no.");
    expect(spotWordsAsClaim("The answer is 4480, so it's not right.")).toBe("4480, so it's no.");
    expect(spotWordsAsClaim("Um, I got 8000, so it's right.")).toBe("8000, so it's yes.");
  });

  it("credits the compare step only from a committed whole turn of the child's own", () => {
    const pkg = view(MUL) as OperationPackage;
    const heard = (text: string, extra: Partial<Parameters<typeof spotStepHeard>[0]> = {}) =>
      spotStepHeard({ pkg, text, uncertain: false, value: 4480, resultAsked: null, shown: false, ...extra });
    for (const t of ["It should be 4480.", "It should be 4480, not 448.", "No, 7 times 640 is 4480.", "7 times 640 is 4480, so it's wrong.", "The right answer is 4480."]) {
      expect(heard(t), t).toBe(true);
    }
    for (const t of ["Maybe it should be 4480.", "Is it 4480?", "My mom said 4480.", "I copied 4480.", "It should be 4480, not 449.", "It should be 4481."]) {
      expect(heard(t), t).toBe(false);
    }
    expect(heard("It should be 4480.", { uncertain: true })).toBe(false);
    expect(heard("It should be 4480.", { shown: true })).toBe(false);
    // A value's digit times its place, on a place-value question.
    const pv = view(VALUE) as OperationPackage;
    expect(spotStepHeard({ pkg: pv, text: "4 times 10000 is 40000.", uncertain: false, value: 40000, resultAsked: null, shown: false })).toBe(true);
  });

  it("holds back a right word until the fix is known", () => {
    const pkg = view(MUL) as OperationPackage;
    const word = { value: { type: "choice" as const, value: "no" }, step: "result", verdict: "right" as const };
    const fix = { value: { type: "number" as const, value: 4480 }, step: "claim", verdict: "right" as const };
    expect(spotAnswers(pkg, [word], [])).toBeUndefined();
    expect(spotAnswers(pkg, [fix, word], [])).toEqual([fix, word]);
    expect(spotAnswers(pkg, [word], ["claim"])).toEqual([word]);
    // A wrong word stays a wrong word.
    const yes = { ...word, value: { type: "choice" as const, value: "yes" }, verdict: "wrong" as const };
    expect(spotAnswers(pkg, [yes], [])).toEqual([yes]);
  });
});
