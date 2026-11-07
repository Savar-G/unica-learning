import { expect, it } from "vitest";
import { LAYOUT_REVIEW_MESSAGE, workbookCommentChanged, workbookCommentRoute, workbookCommentStatus } from "./workbook-comment-route";
import { sampleBook } from "./workbook-sample-book";

const book = sampleBook({ level: "U16", workbookId: "55555555-5555-4555-8555-000000000002", childId: "22222222-2222-4222-8222-222222222222", child: "Mila", number: 1 }).draft;
const day = book.pages.find(p => p.content?.kind === "day" && p.questions.length)!;

it.each([
  "Use normal capitals on the cover", "Fill the white space", "Apply this to later pages with the same template",
  "The scan instructions need the account address", "These rows are crammed", "Share the gap after question 8",
  "Remove the show your work boxes", "Which questions need work shown? There is not enough space for all",
  "The Method boxes need more room", "This question takes too much space", "The footer page ID needs normal case",
  "The instruction should say write in boxes", "Remove the empty heading", "The QR code is too small",
  "The answer appears twice and What's going on has nothing below it", "Do methods 1 and 2 have enough room?",
])("keeps a layout request out of the question writer: %s", note => {
  expect(workbookCommentRoute(day, note)).toBe("layout");
});

it("allows a layout route for an unrecognised request and refuses an unsafe text override", () => {
  expect(workbookCommentRoute(day, "Make this smaller", "layout")).toBe("layout");
  expect(workbookCommentRoute(day, "Remove the work box", "question")).toBe("layout");
});

it.each(["Change the child's name", "Use clearer words", "This answer is wrong"])("routes cover and instruction-page comments for review: %s", note => {
  for (const kind of ["cover", "how-plan", "blank", "back-cover"]) {
    expect(workbookCommentRoute({ content: { kind }, questions: [] }, note)).toBe("layout");
  }
  expect(workbookCommentRoute(undefined, note)).toBe("layout");
});

it.each(["Change the story to use apples", "The answer is incorrect", "Use 12 instead of 15", "Make the question easier"])("retains the supported question-text path: %s", note => {
  expect(workbookCommentRoute(day, note)).toBe("question");
});

it("does not count an unchanged target or an authorship label as an applied comment", () => {
  const same = structuredClone(day), n = day.questions[0].number;
  expect(workbookCommentChanged(day, same, n)).toBe(false);
  same.questions[0].package.textSource = "ai";
  expect(workbookCommentChanged(day, same, n)).toBe(false);
  same.questions[0].package.text += " Read it again.";
  expect(workbookCommentChanged(day, same, n)).toBe(true);
  expect(workbookCommentChanged(day, same, null)).toBe(true);
  expect(workbookCommentChanged(day, same, 999)).toBe(false);
  expect(LAYOUT_REVIEW_MESSAGE).toContain("stays open");
});

it("shows partial and unsupported layout results as open, and reserves changed for saved results", () => {
  expect(workbookCommentStatus({ status: "pending" }, "layout")).toBe("Awaiting layout review");
  expect(workbookCommentStatus({ status: "failed", error: "Partly applied. More space is still needed." }, "layout")).toBe("Partly applied - open");
  expect(workbookCommentStatus({ status: "failed", error: "This cannot be applied." }, "layout")).toBe("Needs layout work");
  expect(workbookCommentStatus({ status: "done" }, "layout")).toBe("Layout changed");
  expect(workbookCommentStatus({ status: "done" }, "question")).toBe("Text changed - review result");
});
