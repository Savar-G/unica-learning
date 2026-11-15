import { describe, expect, it } from "vitest";
import {
  answerFromQuestionText,
  helpFlag,
  holdsNumber,
  judgmentFlags,
  judgmentWord,
  mathRefusals,
  overrideFlag,
  pathOf,
  renderReport,
  reviewCall,
  reviewCalls,
  totalsLine,
  type ReviewCall,
} from "@/lib/maya-family-review";

// Synthetic traces only: no network, no database. The fixtures hold just the fields the review reads.

type Attempt = Record<string, unknown>;
const model = (reading: Record<string, unknown> = {}, extra: Attempt = {}): Attempt => ({ source: "model", proposal: { gate: "none", kind: "math", say: "x", act: "guide", reading, draw: [] }, refusal: null, ...extra });
const maya = (say: string[], attempts: Attempt[] = [model()], extra: Record<string, unknown> = {}) => ({ kind: "maya", at: 1, state: "TRY_TARGET", stateAfter: "TRY_TARGET", attempts, output: { act: "guide", say, board: [] }, ...extra });
const child = (text: string) => ({ kind: "child", at: 1, text });
const trace = (turns: unknown[], extra: Record<string, unknown> = {}) => ({ kind: "maya_trace", version: 12, turns, mathReviewer: { id: "m", promptVersion: "p" }, ...extra });

const call = (over: Partial<ReviewCall> = {}): ReviewCall => ({
  id: "11111111-2222-3333-4444-555555555555", startedAt: "2026-11-16T10:00:00Z", kind: "chat", mode: "text", family: "real", familyShortId: "abc123",
  questionRef: "workbook page 3, question 2 (q)", questionText: "52 − 28 = ?", answer: null,
  trace: trace([maya(["What is 12 minus 8?"]), child("4"), maya(["Yes, 4 in the ones."])]),
  assistance: "independent", flag: null, safetyFlag: false, note: null, event: null, alerts: [], ...over,
});

describe("a clean tutor call", () => {
  it("raises no flag", () => {
    const r = reviewCall(call());
    expect(r.flags).toEqual([]);
    expect(r.path).toBe("tutor");
    expect(r.turns).toEqual({ child: 1, maya: 2 });
    expect(r.link).toBe("https://unicalearning.com/admin/maya/11111111-2222-3333-4444-555555555555");
  });
});

describe("path", () => {
  it("is the tutor with a math reviewer, or with a gate in a proposal", () => {
    expect(pathOf({ turns: [], mathReviewer: null })).toBe("tutor");
    expect(pathOf({ turns: [maya(["a"])] })).toBe("tutor");
  });
  it("is the controller when neither is there, and unknown with no trace", () => {
    expect(pathOf({ turns: [maya(["a"], [{ source: "model", proposal: { act: "guide" }, refusal: null }])] })).toBe("controller");
    expect(pathOf(null)).toBe("unknown");
  });
});

describe("flag a: override, repair, fallback", () => {
  it("fires on a refusal with a repair, and on a fallback, with their kinds", () => {
    const refused = model({}, { refusal: { code: "say_refused", reason: "r", allowed: [], say: "math_review" } });
    const t = trace([maya(["Fine."], [refused, { source: "repair", proposal: {}, refusal: null }]), maya(["Let me say that another way."], [model({}, { refusal: { code: "say_refused", reason: "r", allowed: [], say: "false_claim" } }), { source: "fallback", proposal: null, refusal: null }])]);
    expect(overrideFlag(t)).toEqual({ overrides: 2, repairs: 1, fallbacks: 1, kinds: ["fallback", "refusal:false_claim", "refusal:math_review", "repair"] });
    expect(reviewCall(call({ trace: t })).flags).toContain("overrides");
  });
  it("does not fire on code's own safety guidance or a clean turn", () => {
    const safety = { ...maya(["Please talk to a grown-up."], [{ source: "controller", proposal: null, refusal: null }]), output: { act: "safety", say: ["x"], board: [] } };
    expect(overrideFlag(trace([safety, maya(["Fine."])]))).toBeNull();
  });
});

describe("flag b: math-review refusal", () => {
  it("fires on a verdict that is not true, with the sentence", () => {
    const a = model({}, { refusal: { code: "say_refused", reason: "r", allowed: [], say: "math_review" }, math: [{ sentence: "Now there are 12 ones.", verdict: "unsure", reason: "cannot tell" }, { sentence: "Write 4.", verdict: "true", reason: "all true" }] });
    const t = trace([maya(["x"], [a])]);
    expect(mathRefusals(t)).toEqual([{ sentence: "Now there are 12 ones.", verdict: "unsure", reason: "cannot tell" }]);
    expect(reviewCall(call({ trace: t })).flags).toContain("mathRefusals");
  });
  it("does not fire when every review is true", () => {
    const t = trace([maya(["x"], [model({}, { math: [{ sentence: "Write 4.", verdict: "true", reason: "all true" }] })])]);
    expect(mathRefusals(t)).toEqual([]);
  });
});

describe("flag c: a judgment word after a wrong answer", () => {
  const wrong = { answers: [{ value: 36, step: "answer", problem: "target", verdict: "wrong" }] };
  const right = { answers: [{ value: 24, step: "answer", problem: "target", verdict: "right" }] };
  it("fires when Maya praises after a wrong answer (verdict in the reading)", () => {
    const t = trace([maya(["Good job! Try the ones again."], [model(wrong)])]);
    expect(judgmentFlags(t)).toEqual([{ turn: 1, sentence: "Good job!", word: "good job" }]);
    expect(reviewCall(call({ trace: t })).flags).toContain("judgments");
  });
  it("fires when the committed wrong answers rose, with no reading", () => {
    const t = trace([maya(["Not quite."], [model()], { finalMisses: 0 }), maya(["That's it. Nice work."], [model()], { finalMisses: 1 })]);
    expect(judgmentFlags(t).map((j) => j.word)).toEqual(["that's it", "nice"]);
  });
  it("does not fire after a right answer, or on a negated word", () => {
    expect(judgmentFlags(trace([maya(["Yes, that is right."], [model(right)])]))).toEqual([]);
    expect(judgmentFlags(trace([maya(["That is not quite right. What is 12 minus 8?"], [model(wrong)])]))).toEqual([]);
    expect(judgmentWord("That isn't correct.")).toBeNull();
    expect(judgmentWord("Let us try again.")).toBeNull();
  });
});

describe("flag d: help level against Maya's words", () => {
  const said = trace([maya(["52 minus 28 is 24."]), child("ok"), maya(["Write 24."])]);
  it("fires when Maya said the answer before the child and the call records less than answer_given", () => {
    const h = helpFlag(call({ trace: said, assistance: "hint" }));
    expect(h?.why[0]).toContain('records "hint"');
    expect(h?.saidIn).toBe("52 minus 28 is 24.");
    expect(reviewCall(call({ trace: said, assistance: "hint" })).flags).toContain("help");
  });
  it("fires when the parent note says no help", () => {
    const h = helpFlag(call({ trace: said, assistance: "answer_given", note: { finished: "on_own", help: "independent", sentences: [] } }));
    expect(h?.why).toEqual(["the parent note says the child needed no help"]);
  });
  it("does not fire when the record says answer_given, or the child said the answer first, or Maya never said it", () => {
    expect(helpFlag(call({ trace: said, assistance: "answer_given" }))).toBeNull();
    expect(helpFlag(call({ trace: trace([maya(["What is 52 minus 28?"]), child("24"), maya(["Yes, 24."])]), assistance: "independent" }))).toBeNull();
    expect(helpFlag(call({ trace: trace([maya(["What is 12 minus 8?"]), child("4")]), assistance: "independent" }))).toBeNull();
  });
  it("reads the answer from the package when it is given, else from the question text", () => {
    expect(answerFromQuestionText("52 − 28 = ?")).toBe(24);
    expect(answerFromQuestionText("27 + 39")).toBe(66);
    expect(answerFromQuestionText("What is a half?")).toBeNull();
    expect(helpFlag(call({ trace: trace([maya(["It is 7."])]), questionText: "a word problem", answer: 7, assistance: "hint" }))).not.toBeNull();
    expect(helpFlag(call({ trace: trace([maya(["It is 7."])]), questionText: "a word problem", answer: null, assistance: "hint" }))).toBeNull();
  });
  it("reads a whole number only", () => {
    expect(holdsNumber("124 is big", 24)).toBe(false);
    expect(holdsNumber("2.4 is small", 24)).toBe(false);
    expect(holdsNumber("The answer is 24.", 24)).toBe(true);
  });
});

describe("flag e: safety", () => {
  it("fires on a call flag or an alert row, and not on a clean call", () => {
    expect(reviewCall(call({ flag: "safety_concern", safetyFlag: true })).safety?.flag).toBe("safety_concern");
    expect(reviewCall(call({ alerts: [{ level: "unsafe_request", status: "sent" }] })).flags).toContain("safety");
    expect(reviewCall(call()).safety).toBeNull();
  });
});

describe("the report", () => {
  const flagged = call({ id: "aaaaaaaa-0000-0000-0000-000000000000", family: "test", flag: "safety_concern", safetyFlag: true });
  const clean = call({ id: "bbbbbbbb-0000-0000-0000-000000000000", mode: "voice", kind: "family", trace: { turns: [maya(["a"], [{ source: "model", proposal: { act: "guide" }, refusal: null }])] } });
  const review = reviewCalls([clean, flagged], { from: "2026-11-15T10:00:00Z", to: "2026-11-16T10:00:00Z", hours: 24 });
  it("counts the totals", () => {
    expect(review.totals).toMatchObject({ calls: 2, real: 1, test: 1, tutor: 1, controller: 1, chat: 1, voice: 1, flagged: 1 });
    expect(review.totals.byFlag.safety).toBe(1);
    expect(totalsLine(review.totals)).toContain("2 calls (1 real, 1 test; 1 chat, 1 voice); tutor 1, controller 1; flagged 1");
  });
  it("lists the flagged call in a block and the clean calls in one line, with no name or email", () => {
    const text = renderReport(review);
    expect(text).toContain("### aaaaaaaa: safety flag or alert");
    expect(text).toContain("https://unicalearning.com/admin/maya/aaaaaaaa-0000-0000-0000-000000000000");
    expect(text).toContain("## Clean calls\n\nbbbbbbbb (controller)");
    expect(text).not.toMatch(/@/);
  });
  it("says None when no call is flagged", () => {
    const none = reviewCalls([clean], { from: "a", to: "b", hours: 24 });
    expect(renderReport(none)).toContain("## Flagged calls\n\nNone.");
  });
});
