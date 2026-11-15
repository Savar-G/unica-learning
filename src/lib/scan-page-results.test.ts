import { expect, it } from "vitest";
import { answerBoxes, boxInCrop, initialTogetherState, normalizedBox, questionCrop, resultsExplanationResponse, reviewLine, togetherState, type ResultsQuestion } from "./scan-page-results";

const question: ResultsQuestion = { itemId: "seven", number: 7, version: 2, kind: "review", readAnswer: "8", correctAnswer: "9", questionText: "17 − 8", explainable: true, evidencePhoto: "photo", regions: [{ x: .7, y: .4, width: .1, height: .05 }], questionBox: { x: .1, y: .35, width: .75, height: .15 } };

it("maps frozen image pixels to the same percentages at every displayed size", () => {
  const regions = [{ id: "answer", kind: "box", box: { x: 700, y: 800, width: 100, height: 100 } }];
  const boxes = answerBoxes(regions, { width: 1000, height: 2000 });
  expect(boxes).toEqual(question.regions);
  for (const width of [350, 560, 1280]) expect((boxes[0].x + boxes[0].width / 2) * width).toBeCloseTo(width * .75);
  expect(answerBoxes(null, { width: 1000, height: 2000 })).toEqual([]);
  expect(answerBoxes([{ ...regions[0], box: null }], { width: 1000, height: 2000 })).toEqual([]);
  expect(answerBoxes([{ ...regions[0], kind: "work" }], { width: 1000, height: 2000 })).toEqual([]);
});
it("refuses invented, missing, nonfinite and off-page geometry", () => {
  for (const box of [{ x: -1, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 10 }, { x: NaN, y: 0, width: 10, height: 10 }, { x: 95, y: 0, width: 10, height: 10 }]) {
    expect(normalizedBox(box, { width: 100, height: 100 })).toBeNull();
  }
  expect(normalizedBox({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toBeNull();
  expect(questionCrop({ regions: [], questionBox: null })).toBeNull();
});
it("crops the question and its answers together, outlines in crop coordinates, and clamps to the page", () => {
  const crop = questionCrop(question)!;
  expect(crop.x).toBeCloseTo(.065); expect(crop.y).toBeCloseTo(.315);
  expect(crop.width).toBeCloseTo(.82); expect(crop.height).toBeCloseTo(.22);
  const answer = boxInCrop(question.regions[0], crop);
  expect(answer.x * crop.width + crop.x).toBeCloseTo(.7);
  expect(answer.y * crop.height + crop.y).toBeCloseTo(.4);
  expect(questionCrop({ regions: [{ x: 0, y: 0, width: 1, height: 1 }], questionBox: null })).toEqual({ x: 0, y: 0, width: 1, height: 1 });
});
it("allows navigation and finishing without revealing steps and keeps progress for each question", () => {
  let state = togetherState(initialTogetherState, { type: "open", index: 0 });
  state = togetherState(state, { type: "reveal", itemId: "seven", total: 3 });
  state = togetherState(state, { type: "whole" });
  state = togetherState(state, { type: "next", total: 2 });
  expect(state).toMatchObject({ index: 1, whole: false, revealed: { seven: 1 } });
  state = togetherState(state, { type: "mode", mode: "all" });
  state = togetherState(state, { type: "previous" });
  expect(state).toMatchObject({ index: 0, mode: "all", revealed: { seven: 1 } });
  state = togetherState(state, { type: "mode", mode: "step" });
  state = togetherState(state, { type: "open", index: 1 });
  state = togetherState(state, { type: "next", total: 2 });
  expect(state.screen).toBe("done");
  expect(togetherState(state, { type: "results" })).toMatchObject({ screen: "results", revealed: { seven: 1 } });
});
it("uses quiet review wording and never counts team waits as incorrect", () => {
  expect(reviewLine([question, { ...question, itemId: "fourteen", number: 14 }, { ...question, kind: "team", number: 16 }])).toBe("2 to go over: questions 7 and 14");
  expect(reviewLine([question])).toBe("1 to go over: question 7");
  expect(reviewLine([{ ...question, kind: "team" }])).toBe("No answers to go over right now.");
});
it.each(["busy", "retry", "cap", "unavailable"] as const)("keeps %s as a non-ready state", status => {
  expect(resultsExplanationResponse({ status }, 200, "9")).toEqual({ status });
});
it("accepts only validated steps for the same code-owned stored answer", () => {
  const data = { status: "ready", correctAnswer: "9", explanation: { steps: ["Take away 8 from 17."], say: "What is left?" } };
  expect(resultsExplanationResponse(data, 200, "9").status).toBe("ready");
  expect(resultsExplanationResponse(data, 200, "10").status).toBe("retry");
  expect(resultsExplanationResponse({ ...data, explanation: { steps: ["<script>bad</script>"], say: "bad" } }, 200, "9").status).toBe("retry");
  expect(resultsExplanationResponse({ status: "plan_closed" }, 403, "9").status).toBe("closed");
  expect(resultsExplanationResponse({ status: "refused" }, 409, "9").status).toBe("stale");
  expect(resultsExplanationResponse({}, 502, "9").status).toBe("retry");
});
