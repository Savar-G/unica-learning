import type { QuestionPackage } from "@/lib/question-package";
import { canonical } from "@/lib/workbook-digest";

export type CommentRoute = "question" | "layout";
export interface CommentPage {
  content?: { kind: string };
  questions: readonly { number: number; package: QuestionPackage | null }[];
}

/** The SQL admission function uses this same bounded expression. Unknown page kinds stay out of the writer. */
export const LAYOUT_COMMENT_PATTERN = "(^|[^a-z])(cover|capitals?|uppercase|lowercase|capitalization|personalization|personalisation|layout|templates?|spacing|white space|whitespace|space|room|crammed|gaps?|margins?|fonts?|type size|headings?|headers?|footers?|instructions?|scan instructions|scan text|website|web address|show your work|show work|work shown|box(es)?|page ids?|qr codes?|what['’]?s going on|twice)([^a-z]|$)";
const layoutWords = new RegExp(LAYOUT_COMMENT_PATTERN);

/** Routing is a capability check, not a promise that a free-text request has been resolved. */
export function workbookCommentRoute(page: CommentPage | null | undefined, note: string, requested?: CommentRoute): CommentRoute {
  if (page?.content?.kind !== "day" || requested === "layout") return "layout";
  return layoutWords.test(note.toLowerCase().replace(/\s+/g, " ")) ? "layout" : "question";
}

const task = (p: QuestionPackage | null) => p ? {
  text: p.text, item: p.item ? { format: p.item.format, scorable: p.item.scorable, parentChecked: p.item.parentChecked, regions: p.item.regions } : null,
  answer: p.answer, operation: p.operation, steps: p.steps,
  wrongAnswers: p.wrongAnswers, easierExample: p.easierExample,
} : null;

/** Ignore attempt bookkeeping and authorship labels when deciding whether an edit changed its target. */
export function workbookCommentChanged(before: CommentPage, after: CommentPage, question: number | null): boolean {
  const target = (page: CommentPage) => page.questions.filter(q => question === null || q.number === question)
    .map(q => ({ number: q.number, task: task(q.package) })).sort((a, b) => a.number - b.number);
  return JSON.stringify(canonical(target(before))) !== JSON.stringify(canonical(target(after)));
}

export const LAYOUT_REVIEW_MESSAGE = "This comment needs reviewed page-layout changes. It stays open until those changes are rendered and saved.";
export const UNCHANGED_COMMENT_MESSAGE = "This request did not change its page or question. The comment stays open. Edit it or send it for page-layout review.";

export function workbookCommentStatus(comment: { status: string; error?: string | null }, route: CommentRoute): string {
  if (comment.status === "done") return route === "layout" ? "Layout changed" : "Text changed - review result";
  if (comment.status === "sent") return "Working";
  if (comment.status === "stale") return "Location changed";
  if (comment.status === "failed") return comment.error?.startsWith("Partly applied.") ? "Partly applied - open" : route === "layout" ? "Needs layout work" : "Needs another try";
  return route === "layout" ? "Awaiting layout review" : "Pending";
}
