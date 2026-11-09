import { describe, expect, it } from "vitest";
import { workbookEditMessage } from "@/lib/workbook-edit-message";
import type { ReviewComment, WorkbookEdit } from "@/lib/workbook-edit";

const batch = { id: "latest", status: "done" } as WorkbookEdit;
const layout = { status: "pending", route: "layout", revision: 2, error: null, batchId: null } as ReviewComment;
const question = (status: string, error: string | null = null) => ({ status, route: "question", error, batchId: "latest", page: 22 }) as ReviewComment;
const saved = "1 page-layout comment is saved and open for the team. It stays open until the pages are re-rendered.";
const result = (edit: WorkbookEdit | null, comments: ReviewComment[]) => workbookEditMessage(edit, comments, 2);
describe("comment results", () => {
  it("reports saved layout comments", () => expect(result(null, [layout])).toBe(saved));
  it("reports layout and a fit failure together", () => expect(result({...batch, status: "failed"}, [layout, question("failed", "fit check: day 3 page 22 (day): content runs 4 px past the bottom")])).toBe(`${saved} 1 comment couldn't be applied: Page 22 would no longer fit on the page.`));
  it("reports layout and applied questions together", () => expect(result(batch, [layout, question("done")])).toBe(`${saved} 1 comment applied.`));
  it("reports question-only results", () => expect(result(batch, [question("done")])).toBe("1 comment applied."));
  it("counts only open layout comments on the current revision, including prior sends", () => {
    const comments = [layout, {...layout, status: "failed" as const}, {...layout, revision: 1}, {...layout, status: "done" as const}, {...layout, route: "question" as const}, question("done"), {...question("done"), batchId: "old"}];
    expect(result(batch, comments)).toBe("2 page-layout comments are saved and open for the team. They stay open until the pages are re-rendered. 1 comment applied.");
    expect(result(batch, [{...layout, revision: 1}, question("done")])).toBe("1 comment applied.");
  });
  it.each([
    "fit check: day 3 page 22 (day): content runs 4 px past the bottom",
    "fit check: day 3 page 22 (day): the card slot holds 9 items; it takes at most 8",
    "fit check: day 3 page 22 (day): an unfamiliar layout failure",
    "layout check: day 3 page 22 (day): an unfamiliar layout failure",
    "The page does not fit: the card slot holds 9 items",
  ])("uses a plain page reason for %s", reason => {
    expect(result({...batch, status: "failed"}, [question("failed", reason)])).toBe("1 comment couldn't be applied: Page 22 would no longer fit on the page.");
  });
  it("uses the page number in a fit failure when it differs from the comment", () => {
    expect(result({...batch, status: "failed"}, [question("failed", "fit check: day 3 page 24 (day): unknown")])).toBe("1 comment couldn't be applied: Page 24 would no longer fit on the page.");
  });
});
