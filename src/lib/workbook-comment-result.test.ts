import { describe, expect, it } from "vitest";
import { workbookEditMessage as workbookCommentResult } from "@/lib/workbook-edit-message";
import type { ReviewComment, WorkbookEdit } from "@/lib/workbook-edit";
import { LAYOUT_REVIEW_MESSAGE } from "@/lib/workbook-comment-route";

const batch = { id: "latest", status: "done" } as WorkbookEdit;
const layout = { status: "pending", route: "layout", error: LAYOUT_REVIEW_MESSAGE, batchId: null } as ReviewComment;
const question = (status: string, error: string | null = null) => ({ status, route: "question", error, batchId: "latest", page: 22 }) as ReviewComment;
const saved = "1 page-layout comment is saved and sent to the team. It stays open until the pages are re-rendered.";
describe("comment results", () => {
  it("reports saved layout comments", () => expect(workbookCommentResult(null, [layout])).toBe(saved));
  it("reports layout and a fit failure together", () => expect(workbookCommentResult({...batch, status: "failed"}, [layout, question("failed", "fit check: day 3 page 22 (day): content runs 4 px past the bottom")])).toBe(`${saved} 1 comment couldn't be applied: Page 22 would no longer fit on the page.`));
  it("reports layout and applied questions together", () => expect(workbookCommentResult(batch, [layout, question("done")])).toBe(`${saved} 1 comment applied.`));
  it("reports question-only results", () => expect(workbookCommentResult(batch, [question("done")])).toBe("1 comment applied."));
});
