import type { ReviewComment, WorkbookEdit } from "@/lib/workbook-edit";

/** Count only the latest batch. Pending comments with an error also failed in that batch. */
export function workbookEditMessage(batch: WorkbookEdit | null | undefined, comments: ReviewComment[]): string | null {
  if (!batch || (batch.status !== "done" && batch.status !== "failed")) return null;
  const group = comments.filter(c => c.batchId === batch.id);
  const failed = group.filter(c => c.status === "failed" || (c.status === "pending" && c.error)).length;
  const done = group.filter(c => c.status === "done").length;
  if (!done && (failed || batch.status === "failed")) return "No comments could be applied. The workbook is unchanged.";
  if (failed) return `${failed} ${failed === 1 ? "comment couldn't" : "comments couldn't"} be applied. The rest are done.`;
  return null;
}
