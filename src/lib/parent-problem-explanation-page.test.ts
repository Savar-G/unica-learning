import { expect, it } from "vitest";
import { sampleWorkbook } from "@/lib/workbook-sample";
import { pageExplanationItem } from "@/lib/parent-problem-explanation-page";
import type { ExplanationContext } from "@/lib/parent-problem-explanation";
const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222", workbook = "33333333-3333-4333-8333-333333333333";
const pkg = sampleWorkbook({ parentId: parent, childId: child, workbookId: workbook, qrTokens: ["sample-token-00000001", "sample-token-00000002", "sample-token-00000003"] }).pages[1].questions[0].package;
const context: ExplanationContext = { parent, child, workbook, page: "page", revision: "print", pageNumber: 2, number: 1, itemId: pkg.id, version: 2,
  context: "", package: pkg, schemaVersion: 2, teaching: null, regions: null, readAnswer: "415" };
const item = { number: 1, itemId: pkg.id, version: 2, state: "scored" as const, result: "wrong" as const, readAnswerText: "415", canChange: true,
  actor: "system" as const, at: "saved", evidencePhoto: "photo", photoAvailable: true, label: "Wrong" };
it("offers only a complete wrong answer with valid pure explanation input and a ready price", () => {
  expect(pageExplanationItem(item, context, true, true)).toMatchObject({ explainable: true, questionText: pkg.text, correctAnswer: "425" });
  expect(pageExplanationItem(item, context, true, false)).toMatchObject({ explainable: false, questionText: pkg.text, correctAnswer: "425" });
  expect(pageExplanationItem(item, context, false, true)).toEqual({ explainable: false, questionText: null, correctAnswer: null });
  expect(pageExplanationItem({ ...item, result: "right" }, context, true, true).explainable).toBe(false);
});
it("invalid, unsupported and not-checked packages or missing keys never offer a control", () => {
  for (const change of [{ package: null }, { schemaVersion: 999 }, { package: { ...pkg, answer: null } }, { itemId: "different-item" }]) {
    expect(pageExplanationItem(item, { ...context, ...change }, true, true).explainable).toBe(false);
  }
});
it("a read answer outside the prompt bound still shows the stored question and key, without an explanation", () => {
  expect(pageExplanationItem(item, { ...context, readAnswer: "x".repeat(201) }, true, true))
    .toEqual({ explainable: false, questionText: pkg.text, correctAnswer: "425" });
});
