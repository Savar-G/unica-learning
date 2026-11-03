import { describe, expect, it, vi } from "vitest";
import { parseWorkbookReference, selectWorkbookQuestion, WORKBOOK_REFERENCE_AGAIN } from "@/lib/maya-workbook-question";
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
  it.each(["missing", "foreign family", "sibling", "draft", "approved", "unknown page", "unknown number", "no image", "invalid package", "changed package ref", "not a test family"])("refuses %s before a session starts", async reason => {
    const f = await mayaWorkbookFixture();
    const question = vi.spyOn(f.books, "question");
    const input = { childId: f.ids.child, workbookId: f.ids.workbook, page: 4, question: 3 };
    if (reason === "missing") input.workbookId = "99999999-9999-4999-8999-999999999999";
    if (reason === "sibling") input.childId = f.ids.sibling;
    if (reason === "foreign family") f.reader.child = async () => ({ parentId: "other-family", firstName: null });
    if (reason === "foreign family") f.reader.isTestFamily = async () => true;
    if (reason === "draft" || reason === "approved") f.books.setStatus(f.ids.workbook, reason);
    if (reason === "unknown page") input.page = 5;
    if (reason === "unknown number") input.question = 2;
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
    if (reason === "not a test family") f.reader.isTestFamily = async () => false;
    const result = await selectWorkbookQuestion(input, f.reader);
    expect(result.ok).toBe(false);
    expect(f.store.rows()).toEqual([]);
    if (!["invalid package", "changed package ref"].includes(reason)) expect(question).not.toHaveBeenCalled();
  });
  it("asks again without reading a package when a request has competing references", async () => {
    const f = await mayaWorkbookFixture();
    const question = vi.spyOn(f.books, "question");
    expect(await selectWorkbookQuestion({ childId: f.ids.child, workbookId: f.ids.workbook, reference: "page 4 number 3", page: 4, question: 1 }, f.reader))
      .toEqual({ ok: false, error: "reference_again", say: WORKBOOK_REFERENCE_AGAIN });
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
