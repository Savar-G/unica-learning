import type { ReviewComment, WorkbookEdit } from "@/lib/workbook-edit";
import { LAYOUT_REVIEW_MESSAGE } from "@/lib/workbook-comment-route";
import { NEEDS_A_LOOK, plainReason } from "@/lib/workbook-reason";

/** Report the latest question batch and layout comments saved for review. */
export function workbookEditMessage(batch: WorkbookEdit | null | undefined, comments: ReviewComment[]): string | null {
  const layouts = comments.filter(c => c.status === "pending" && c.route === "layout" && c.error === LAYOUT_REVIEW_MESSAGE).length;
  const parts: string[] = [];
  if (layouts) parts.push(`${layouts} page-layout ${layouts === 1 ? "comment is" : "comments are"} saved and sent to the team. ${layouts === 1 ? "It stays" : "They stay"} open until the pages are re-rendered.`);
  if (batch && (batch.status === "done" || batch.status === "failed")) {
    const group = comments.filter(c => c.batchId === batch.id);
    const failed = group.filter(c => c.status === "failed" || (c.status === "pending" && c.error));
    const done = group.filter(c => c.status === "done").length;
    if (failed.length && done) parts.push(`${failed.length} ${failed.length === 1 ? "comment couldn't" : "comments couldn't"} be applied. The rest are done.`);
    else if (failed.length) {
      const reasons = [...new Set(failed.map(c => {
        const reason = c.error ?? "";
        if (/runs \d+ px past the bottom|does not fit/i.test(reason)) return `Page ${c.page} would no longer fit on the page`;
        const plain = plainReason(reason);
        return plain === NEEDS_A_LOOK ? "Please review the comment and try again" : plain;
      }))];
      parts.push(`${failed.length} ${failed.length === 1 ? "comment couldn't" : "comments couldn't"} be applied: ${reasons.join("; ")}.`);
    } else if (done) parts.push(`${done} ${done === 1 ? "comment" : "comments"} applied.`);
    else if (batch.status === "failed" && !layouts) parts.push("No comments could be applied. The workbook is unchanged.");
  }
  return parts.join(" ") || null;
}
