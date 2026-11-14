import { expect, it } from "vitest";
import { exactNumber } from "@/lib/scan-marking-numbers";
import { readMarkingOutput, type MarkingFrame } from "@/lib/scan-marking";

it("reads strict thousands groups: one comma or one space between groups of three digits", () => {
  for (const wholeOnly of [true, false]) {
    expect(exactNumber("2,520", wholeOnly)).toBe(2520);
    expect(exactNumber("2 520", wholeOnly)).toBe(2520);
    expect(exactNumber("12,345,678", wholeOnly)).toBe(12345678);
    expect(exactNumber("12 345 678", wholeOnly)).toBe(12345678);
    expect(exactNumber("100,000", wholeOnly)).toBe(100000);
    expect(exactNumber("2520", wholeOnly)).toBe(2520);
  }
  expect(exactNumber("-1,200", false)).toBe(-1200);
  expect(exactNumber("-1,200", true)).toBeNull();
});

it("still refuses anything that is not one number in strict groups", () => {
  for (const text of ["12 13", "1,23", "1,2345", "12 or 13", "1,5", "1,234.5", "1 234.5", "0,123", "012,345", "1,234 567", "1 234,567",
    "1, 234", "1  234", ",123", "123,", "1,,234", "1.234,5", "1 2 3"]) {
    expect(exactNumber(text, false)).toBeNull();
    expect(exactNumber(text, true)).toBeNull();
  }
  expect(exactNumber("3.5", false)).toBe(3.5);
  expect(exactNumber("3.5", true)).toBeNull();
});

it("marks a grouped answer against the key and keeps the raw text the child wrote", () => {
  const answer = 2520;
  const frame = { parentId: "p", childId: "c", photo: "photo", workbookId: "w", printedRevision: "r", pageId: "page", pageNumber: 1, ready: true,
    questions: [{ number: 1, package: { id: "item", ref: { source: "workbook", workbookId: "w", page: 1, question: 1 }, text: "",
      item: { format: "write-number", scorable: true, parentChecked: false, checks: [], error: null, regions: [{ id: "a", kind: "box", label: null, answer: { type: "number", value: answer } }] },
      answer: null, operation: null, steps: [], wrongAnswers: [], skill: { standard: "2.4", skills: [] } },
      regions: [{ id: "a", kind: "box", box: { x: 10, y: 10, width: 20, height: 20 } }], teaching: null }] } as unknown as MarkingFrame;
  const read = (text: string) => readMarkingOutput(frame, { readings: [{ item: "i1", region: "r1", state: "written", text, issue: null, verdict: null, reason: null }] })[0];
  expect(read("2,520")).toMatchObject({ result: "right", readAnswerText: "2,520" });
  expect(read("2 520")).toMatchObject({ result: "right", readAnswerText: "2 520" });
  expect(read("2,530")).toMatchObject({ result: "wrong", readAnswerText: "2,530" });
  expect(read("25 20")).toMatchObject({ result: null, state: "pending", readAnswerText: "25 20" });
});
