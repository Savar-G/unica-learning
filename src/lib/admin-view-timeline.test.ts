import { describe, expect, it } from "vitest";
import type { Question, StoredTest } from "@/lib/assessment";
import { answerLines, shownWithoutAnswer, whenExact, type AnswerRecord } from "@/lib/admin-view";

// The admin view of one test (#184): each answer with its question as the child saw it (the choices in their order,
// the figure, the template and the BC standard) and its timeline (the server's serve and arrival times, the answer
// changes, the read-aloud uses and the time away). Tests from before #184 have none of the timeline and still show.
describe("each answer's question and timeline in the admin (#184)", () => {
  const question = (id: string, templateId: string, over: Partial<Question> = {}): Question => ({
    id,
    templateId,
    level: 4,
    strand: "N",
    format: "number",
    whiteboard: false,
    prompt: `Prompt ${id}`,
    readAloud: `Prompt ${id}`,
    values: {},
    answer: "1",
    wrong: [],
    ...over,
  });
  const bars = { kind: "bars" as const, bars: [{ label: "Cats", value: 6 }, { label: "Dogs", value: 9 }] };
  const test: StoredTest = {
    profile: { grade: 4, province: "BC" },
    seed: 7,
    stage1: [
      question("q1", "g35-4-order-numbers", { format: "choice", choices: ["4,310", "4,031", "4,301"], answer: "4,031" }),
      question("q2", "g35-4-bar-scale", { figure: bars, answer: "3" }),
      question("q3", "g35-4-gone-template"),
    ],
    stage2: { up: [], stay: [], down: [] },
  };
  /** An answer stored before #184: none of the timeline columns. */
  const before = (position: number, question_id: string): AnswerRecord => ({
    position,
    question_id,
    response: "1",
    correct: true,
    misconception: null,
    time_ms: 20_000,
    work_required: false,
    work_path: null,
    work_text: null,
  });
  const after: AnswerRecord = {
    ...before(0, "q1"),
    response: "4,031",
    time_ms: 18_400,
    shown_at: "2026-10-16T18:00:02.000Z",
    answered_at: "2026-10-16T18:00:21.500Z",
    answer_changes: [{ value: "4,310", atMs: 6_000 }, { value: "4,031", atMs: 15_200 }],
    read_aloud_count: 2,
    read_aloud_at_ms: [800, 9_000],
    away_count: 1,
    away_ms: 2_500,
  };

  it("shows the question as the child saw it: the choices in their order, the figure, the template and its BC standard", () => {
    const [choice, figure, gone] = answerLines(test, [after, before(1, "q2"), before(2, "q3")], []);
    expect(choice).toMatchObject({ templateId: "g35-4-order-numbers", standard: "4.1", choices: ["4,310", "4,031", "4,301"], figure: null });
    expect(figure).toMatchObject({ templateId: "g35-4-bar-scale", standard: "4.16", choices: null, figure: bars });
    // A template no longer in the bank still shows its id, without a standard.
    expect(gone).toMatchObject({ templateId: "g35-4-gone-template", standard: null });
  });

  it("shows the server's serve and arrival times, the time between them, and what the child did before Next", () => {
    const [line] = answerLines(test, [after], []);
    expect(line.timeMs).toBe(18_400);
    expect(line.timeline).toEqual({
      shownAt: "2026-10-16T18:00:02.000Z",
      answeredAt: "2026-10-16T18:00:21.500Z",
      serverMs: 19_500,
      changes: [{ value: "4,310", atMs: 6_000 }, { value: "4,031", atMs: 15_200 }],
      readAloud: { count: 2, atMs: [800, 9_000] },
      away: { count: 1, ms: 2_500 },
    });
  });

  it("still shows an answer from before #184, with no timeline", () => {
    const [line] = answerLines(test, [before(0, "q1")], []);
    expect(line).toMatchObject({ number: 1, response: "1", timeMs: 20_000, templateId: "g35-4-order-numbers" });
    expect(line.timeline).toEqual({ shownAt: null, answeredAt: null, serverMs: null, changes: null, readAloud: null, away: null });
  });

  it("uses the template id stored with the answer when its question is missing from the stored test", () => {
    const [line] = answerLines(test, [{ ...before(0, "gone"), template_id: "g35-4-bar-scale" }], []);
    expect(line).toMatchObject({ templateId: "g35-4-bar-scale", standard: "4.16", prompt: null, choices: null });
  });

  it("lists a question the server served that has no answer yet: where the child stopped", () => {
    const shows = [
      { position: 0, question_id: "q1", shown_at: "2026-10-16T18:00:02.000Z" },
      { position: 1, question_id: "q2", shown_at: "2026-10-16T18:00:21.600Z" },
    ];
    expect(shownWithoutAnswer(test, shows, [after])).toEqual([{ number: 2, questionId: "q2", prompt: "Prompt q2", shownAt: "2026-10-16T18:00:21.600Z" }]);
    expect(shownWithoutAnswer(test, shows, [after, before(1, "q2")])).toEqual([]);
  });

  it("writes a server time to the second, Pacific time", () => {
    expect(whenExact("2026-10-16T18:00:21.500Z")).toBe("2026-10-16 11:00:21");
    expect(whenExact("2026-12-01T08:05:09.000Z")).toBe("2026-12-01 00:05:09");
    expect(whenExact(null)).toBe("-");
  });
});
