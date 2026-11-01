import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { buildQuestion } from "@/lib/workbook-generator-items";
import { aiSolver, keySolver, sameAnswer, solveCheck, toSolve, type Solver } from "@/lib/workbook-solve-check";

// The solve check (round 7, R380-12-1) through its public interface: the printed question it sends, the fake that
// answers from the key, the live adapter over the AI client seam (a fake client here), and its verdicts.

const num = (value: number) => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
const op = (kind: string, a: number, b: number) => ({ kind, operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });
const empty = { difficulty: 1, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null };

/** A U10 story, whose words the AI wrote: the solve check reads them. */
function story(text: string, operation = op("add", 7, 5), easier = { text: "6 + 5 = ?", operation: op("add", 6, 5) }) {
  const b = buildQuestion({
    ...empty, slot: "1.1", skill: "K5-take-away-change", text, format: "write-number", operation,
    wrongAnswers: [{ value: num(99), cause: "count", description: "x", step: null }], easier,
  }, { id: "q1", workbookId: "w", page: 3, question: 1, level: 10, skills: ["K5-take-away-change"] });
  if (!b.package) throw new Error(JSON.stringify(b.check));
  return b.package;
}

/** A reader who solves a short story from its words alone: take-away words subtract, else the numbers are added. */
const reader: Solver = {
  model: "reader",
  async solve(request) {
    return {
      answers: request.questions.flatMap((q) => {
        const [a, b] = (q.text.match(/\d+/g) ?? []).map(Number);
        const takes = /gives away|eats|fewer|now has|left|take away|-/.test(q.text);
        return q.boxes.map((box) => ({ question: q.id, box: box.id, answer: String(takes ? a - b : a + b) }));
      }),
      problem: null,
    };
  },
};

describe("the solve check", () => {
  it("sends only the printed question: the text, the picture in words and the boxes, never the key", async () => {
    const p = story("Mia has 7 shells. She finds 5 more. How many now?");
    const ai = fakeAiClient({ answer: () => ({ answers: [{ question: "question", box: "answer", answer: "12" }, { question: "easier", box: "answer", answer: "11" }], problem: null }) });
    const log = await solveCheck(aiSolver(ai), p, 1000);
    expect(log!.verdict).toEqual({ status: "agreed" });
    const sent = JSON.parse((ai.requests[0].content[0] as { text: string }).text);
    expect(sent).toEqual({
      questions: [
        { id: "question", text: "Mia has 7 shells. She finds 5 more. How many now?", picture: null, shown: null, boxes: [{ id: "answer", asks: "a box for the answer" }] },
        { id: "easier", text: "6 + 5 = ?", picture: null, shown: null, boxes: [{ id: "answer", asks: "a box for the answer" }] },
      ],
    });
    expect(JSON.stringify(ai.requests[0])).not.toMatch(/"12"|operation|operands|wrongAnswers/);
  });

  it("fails the review's example: 'gives away' over add [7, 5] is read as 2, and the key says 12", async () => {
    const log = await solveCheck(reader, story("Mia has 7 shells. She gives away 5. How many does she have now?"), 1000);
    expect(log!.verdict).toMatchObject({ status: "disagreed", reason: expect.stringContaining('answers "2", the key says "12"') });
  });

  it("fails the 'eats', 'fewer' and 'now has' variants the same way, with no list of words in the generator", async () => {
    for (const text of ["Mia has 7 plums. She eats 5. How many are there?", "Mia has 7 cars. Ben has 5 fewer. How many has Ben?", "Mia had 7 hats and lost 5. Mia now has how many?"]) {
      expect((await solveCheck(reader, story(text), 1000))!.verdict.status, text).toBe("disagreed");
    }
    expect((await solveCheck(reader, story("Mia has 7 cups and gets 5. How many in all?"), 1000))!.verdict.status).toBe("agreed");
  });

  it("fails an easier example whose text contradicts its key", async () => {
    // The question is sound; its easier example prints 6 - 5 over add [6, 5] (key 11).
    const p = story("Mia has 7 cups and gets 5. How many in all?", op("add", 7, 5), { text: "6 - 5 = ?", operation: op("add", 6, 5) });
    expect((await solveCheck(reader, p, 1000))!.verdict).toMatchObject({ status: "disagreed", reason: expect.stringContaining("the easier example") });
  });

  it("counts a malformed, missing or late answer, or a thrown call, as a fail", async () => {
    const p = story("Mia has 7 cups and gets 5. How many in all?");
    const check = (answer: () => unknown, ms = 1000) => solveCheck(aiSolver(fakeAiClient({ answer })), p, ms);
    expect((await check(() => ({ nope: 1 })))!.verdict).toEqual({ status: "failed", reason: "the solve check's answer was malformed" });
    expect((await check(() => ({ answers: [{ question: "question", box: "answer", answer: "12" }], problem: null })))!.verdict)
      .toMatchObject({ status: "failed", reason: expect.stringContaining("no answer for the easier example") });
    expect((await check(() => ({ answers: [{ question: "question", box: "answer", answer: 12 }], problem: null })))!.verdict.status).toBe("failed");
    expect((await check(() => { throw new Error("HTTP 500"); }))!.verdict).toMatchObject({ status: "failed", reason: expect.stringContaining("HTTP 500") });
    const late: Solver = { model: "slow", solve: () => new Promise(() => {}) };
    expect((await solveCheck(late, p, 20))!.verdict).toEqual({ status: "failed", reason: "the solve check was late" });
    // A reader who says the question cannot be answered as printed fails it too.
    expect((await check(() => ({ answers: [], problem: "it does not say how many she gets" })))!.verdict).toMatchObject({ status: "disagreed" });
  });

  it("answers from the key in the fake, so a dry run agrees and costs nothing", async () => {
    const log = await solveCheck(keySolver(), story("Mia has 7 shells. She gives away 5. How many does she have now?"), 1000);
    expect(log).toMatchObject({ model: "fake", verdict: { status: "agreed" } });
  });

  it("checks nothing code wrote: a U3 sum, whose words and easier example are code's", () => {
    const b = buildQuestion({
      ...empty, slot: "1.1", skill: "K5-take-away-change", text: "Mia has 7 shells. She gives away 5. How many does she have now?", format: "write-number", operation: op("add", 7, 5),
      wrongAnswers: [{ value: num(99), cause: "count", description: "x", step: null }], easier: { text: "6 - 5 = ?", operation: op("add", 6, 5) },
    }, { id: "q1", workbookId: "w", page: 3, question: 1, level: 3, skills: ["K5-take-away-change"] });
    expect(toSolve(b.package!)).toEqual({ questions: [], key: [] });
  });

  it("takes an answer in any written form of the key's number, and a choice exactly", () => {
    expect(sameAnswer("12", ["12"], false)).toBe(true);
    expect(sameAnswer("12 shells", ["12"], false)).toBe(true);
    expect(sameAnswer("1,250", ["1250"], false)).toBe(true);
    expect(sameAnswer("3/2", ["1 1/2"], false)).toBe(true);
    expect(sameAnswer("0.50", ["0.5"], false)).toBe(true);
    expect(sameAnswer("9 R 2", ["9 R 2"], false)).toBe(true);
    expect(sameAnswer("9 R 3", ["9 R 2"], false)).toBe(false);
    expect(sameAnswer("2", ["12"], false)).toBe(false);
    expect(sameAnswer("Ben", ["Ben"], true)).toBe(true);
    expect(sameAnswer("<", [">"], true)).toBe(false);
  });
});
