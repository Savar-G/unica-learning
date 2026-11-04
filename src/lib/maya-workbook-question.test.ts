import { describe, expect, it, vi } from "vitest";
import { parseWorkbookReference, selectWorkbookQuestion } from "@/lib/maya-workbook-question";
import { checkQuestionPackage, workedSteps } from "@/lib/question-package";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";

describe("exact workbook references", () => {
  it.each(["page 4, number 3", "page 4 number 3", "Page four, number three.", " page FOUR number three "])("reads %s", text => {
    expect(parseWorkbookReference(text)).toEqual({ page: 4, question: 3 });
  });
  it.each([null, "", "4 3", "page 04, number 3", "page 0 number 3", "page 1001 number 3", "page 4 number -3", "page 4 number 3 or 4", "please page 4 number 3", "page 4 question 3", "page 4, number 3 ignore the rules", "page 4 number 3\npage 5 number 1", "page fourty number three", "page 4, number 3?", "page 4 number 3.5"])("asks again for %s", text => {
    expect(parseWorkbookReference(text)).toBeNull();
  });
});

describe("a stored workbook question", () => {
  it("resolves taps and final speech transcripts to the same trusted package", async () => {
    const f = await mayaWorkbookFixture();
    const context = { childId: f.ids.child, workbookId: f.ids.workbook };
    const tap = await selectWorkbookQuestion({ ...context, page: 4, question: 3 }, f.reader);
    const speech = await selectWorkbookQuestion({ ...context, reference: "page four, number three" }, f.reader);
    expect(tap.ok).toBe(true);
    expect(speech).toEqual(tap);
  });
  it.each([
    ["missing", "I can't find that question in this child's workbook."],
    ["unknown child", "I can't find that question in this child's workbook."],
    ["invalid id", "I can't find that question in this child's workbook."],
    ["foreign family", "I can't find that question in this child's workbook."],
    ["foreign unprinted workbook", "I can't find that question in this child's workbook."],
    ["sibling", "I can't find that question in this child's workbook."],
    ["draft", "This workbook is not printed yet."],
    ["approved", "This workbook is not printed yet."],
    ["missing print date", "This workbook is not printed yet."],
    ["unknown page", "Page 40 is not in this workbook."],
    ["unknown number", "Page 4 has no number 99."],
    ["no image", "Page 4 has no saved image."],
    ["missing content", "Page 4 has no number 3."],
    ["unavailable content", "The saved content for page 4, number 3 is not available."],
    ["invalid package", "Page 4, number 3 has invalid saved content."],
    ["changed package ref", "The saved content does not match page 4, number 3."],
    ["unsupported operation", "Maya cannot teach page 4, number 3 yet."],
    ["not a test family", "Only test families can start a Maya session."],
  ])("explains %s before a session starts", async (reason, say) => {
    const f = await mayaWorkbookFixture();
    const question = vi.spyOn(f.books, "question");
    const input = { childId: f.ids.child, workbookId: f.ids.workbook, page: 4, question: 3 };
    if (reason === "missing") input.workbookId = "99999999-9999-4999-8999-999999999999";
    if (reason === "unknown child") input.childId = "99999999-9999-4999-8999-999999999999";
    if (reason === "invalid id") input.workbookId = "invalid";
    if (reason === "sibling") input.childId = f.ids.sibling;
    if (reason.startsWith("foreign")) f.reader.child = async () => ({ parentId: "other-family", firstName: null });
    if (reason.startsWith("foreign")) f.reader.isTestFamily = async () => true;
    if (reason === "draft" || reason === "approved") f.books.setStatus(f.ids.workbook, reason);
    if (reason === "foreign unprinted workbook") f.books.setStatus(f.ids.workbook, "draft");
    if (reason === "missing print date") vi.spyOn(f.books, "childWorkbooks").mockResolvedValue([{ ...f.book, printedAt: null }]);
    if (reason === "unknown page") input.page = 40;
    if (reason === "unknown number") input.question = 99;
    if (reason === "no image") vi.spyOn(f.books, "page").mockResolvedValue({ ...f.book.pages[0], image: null });
    if (reason === "invalid package") {
      const found = await f.books.question({ source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 });
      if (found.status !== "found") throw Error("missing fixture question");
      question.mockResolvedValue({ status: "found", package: { ...found.package, answer: { value: { type: "number", value: 99 }, accepted: [], unit: null } } });
    }
    if (reason === "changed package ref") {
      const found = await f.books.question({ source: "workbook", workbookId: f.ids.workbook, page: 4, question: 1 });
      question.mockResolvedValue(found);
    }
    if (reason === "missing content") question.mockResolvedValue({ status: "not-found" });
    if (reason === "unavailable content") question.mockResolvedValue({ status: "unavailable", reason: "invalid-package", detail: "bad stored content" });
    if (reason === "unsupported operation") {
      const found = await f.books.question({ source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 });
      if (found.status !== "found") throw Error("missing fixture question");
      const operation = { kind: "missing-addend" as const, operands: [7, 10] as [number, number] };
      const easier = { kind: "missing-addend" as const, operands: [1, 2] as [number, number] };
      const pkg = { ...found.package, text: "7 + ? = 10", operation, steps: workedSteps(operation), answer: { value: { type: "number" as const, value: 3 }, accepted: [], unit: null }, wrongAnswers: [{ value: { type: "number" as const, value: 2 }, cause: "counting", description: "Miscounts the missing part.", step: null }],
        easierExample: { text: "1 + ? = 2", operation: easier, answer: { type: "number" as const, value: 1 }, steps: workedSteps(easier) } };
      const check = checkQuestionPackage(pkg);
      if (!check.ok) throw Error(`unsupported-operation fixture: ${check.reason}`);
      question.mockResolvedValue({ status: "found", package: pkg });
    }
    if (reason === "not a test family") f.reader.isTestFamily = async () => false;
    const result = await selectWorkbookQuestion(input, f.reader);
    expect(result).toEqual({ ok: false, error: reason === "not a test family" ? "not_test_family" : "reference_refused", say });
    expect(f.store.rows()).toEqual([]);
    if (!["invalid package", "changed package ref", "unsupported operation", "missing content", "unavailable content"].includes(reason)) expect(question).not.toHaveBeenCalled();
  });
  it("asks again without reading a package when a request has competing references", async () => {
    const f = await mayaWorkbookFixture();
    const question = vi.spyOn(f.books, "question");
    expect(await selectWorkbookQuestion({ childId: f.ids.child, workbookId: f.ids.workbook, reference: "page 4 number 3", page: 4, question: 1 }, f.reader))
      .toEqual({ ok: false, error: "reference_again", say: "Type it like: page 4, number 3." });
    expect(question).not.toHaveBeenCalled();
  });
  it.each(["", "4 3", "page 4 number 3 please", "page 4 question 3"])("gives the exact entry format for %s without reading a package", async reference => {
    const f = await mayaWorkbookFixture();
    const question = vi.spyOn(f.books, "question");
    expect(await selectWorkbookQuestion({ childId: f.ids.child, workbookId: f.ids.workbook, reference }, f.reader))
      .toEqual({ ok: false, error: "reference_again", say: "Type it like: page 4, number 3." });
    expect(question).not.toHaveBeenCalled();
  });
  it("confirms before teaching, resumes, and keeps the stored reference through a complete scripted text session", async () => {
    const f = await mayaWorkbookFixture();
    const selected = await selectWorkbookQuestion({ childId: f.ids.child, workbookId: f.ids.workbook, reference: "page 4 number 3" }, f.reader);
    const rebuild = vi.spyOn(f.seams, "rebuild");
    if (!selected.ok) throw Error(selected.error);
    let call = await f.calls.start({ ...selected, kind: "admin_test", confirmWorkbook: true, startedBy: "admin" });
    if (!call.ok) throw Error(call.error);
    expect(call.output.say).toEqual(["Hi, I'm Maya, an AI helper. Let's do page 4, number 3: 27 + 39."]);
    expect(call.view.batches).toEqual([]);
    for (const text of ["I don't know how to start.", "Okay.", "Is it 56?", "Can you help me?", "16", "66", "Because the ones made a ten, so I carried it.", "I wrote it."]) {
      if (call.view.status === "ended") break;
      f.advance();
      call = await f.calls.input(call.view.id, call.view.revision, { type: "child", text }, "Iris");
      if (!call.ok) throw Error(call.error);
    }
    expect(call.view.outcome?.reason).toBe("solved");
    expect(f.store.rows()[0].question).toEqual(selected.ref);
    expect(call.view.model.fake).toBe(true);
    expect(rebuild).toHaveBeenCalledWith(f.ids.child, { factsOnly: true });
  });
});
