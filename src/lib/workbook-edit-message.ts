import type { ReviewComment, WorkbookEdit } from "@/lib/workbook-edit";
import { NEEDS_A_LOOK, plainReason } from "@/lib/workbook-reason";

/** Report the latest question batch and layout comments saved for review. */
export function workbookEditMessage(batch: WorkbookEdit | null | undefined, comments: ReviewComment[], revision: number): string | null {
  const layouts = comments.filter(c => (c.status === "pending" || c.status === "failed") && c.route === "layout" && c.revision === revision).length;
  const parts: string[] = [];
  if (layouts) parts.push(`${layouts} page-layout ${layouts === 1 ? "comment is" : "comments are"} saved and open for the team. ${layouts === 1 ? "It stays" : "They stay"} open until the pages are re-rendered.`);
  if (batch && (batch.status === "done" || batch.status === "failed")) {
    const group = comments.filter(c => c.batchId === batch.id && c.route !== "layout");
    const failed = group.filter(c => c.status === "failed" || (c.status === "pending" && c.error));
    const done = group.filter(c => c.status === "done").length;
    if (failed.length && done) parts.push(`${failed.length} ${failed.length === 1 ? "comment couldn't" : "comments couldn't"} be applied. The rest are done.`);
    else if (failed.length) {
      const reasons = [...new Set(failed.map(c => {
        const reason = c.error ?? "";
        if (/^(?:fit check:|layout check:|the page does not fit:)/i.test(reason) || /runs \d+ px past the bottom|does not fit/i.test(reason)) {
          const page = /\bpage (\d+)\b/i.exec(reason)?.[1] ?? c.page;
          return `Page ${page} would no longer fit on the page`;
        }
        const plain = plainReason(reason);
        return plain === NEEDS_A_LOOK ? "Please review the comment and try again" : plain;
      }))];
      parts.push(`${failed.length} ${failed.length === 1 ? "comment couldn't" : "comments couldn't"} be applied: ${reasons.join("; ")}.`);
    } else if (done) parts.push(`${done} ${done === 1 ? "comment" : "comments"} applied.`);
    else if (batch.status === "failed" && !layouts) parts.push("No comments could be applied. The workbook is unchanged.");
  }
  return parts.join(" ") || null;
}
