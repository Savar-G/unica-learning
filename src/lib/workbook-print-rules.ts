// What blocks a workbook page from printing, and what only warns (#1248). A page prints when it has questions and it
// renders. Still blocking: content past the content area or the page (overflow), a layout check, a page that does not
// render, a printed question with no measured box, and a day page with no question. Warnings: the whole-book content
// checks (they stay in the draft's quality and never touch a page's fit), room left on a page that prints a question
// (the fit check's "fullness"), a page below its practice floor, and a question that failed its own check, which is
// left off its printed page and listed in `leftOut`. Pure TypeScript: no network, database or clock.
import { PANEL_SLOTS, type DayLayout } from "@/lib/workbook-book";
import type { FitProblem, FitResult, GeneratedPage, GeneratedQuestion, PageFit } from "@/lib/workbook-generator";
import type { Block } from "@/lib/workbook-page";
import type { PlannedPart } from "@/lib/workbook-plan";
import type { BookQuality } from "@/lib/workbook-quality";
import type { RenderProblem } from "@/lib/workbook-render";

/** The prefix of a whole-book issue stored as a page's fit problem by a draft made before #1248. */
const WHOLE_BOOK = "whole-book check: ";

/** The stored fit of a page from its fit check: room left warns on a page that prints a question. */
export function pageFitOf(fit: FitResult, questions: readonly GeneratedQuestion[]): PageFit {
  if (fit.ok) return { status: "fits" };
  if (questions.some((q) => q.package) && fit.problems.every((p) => p.kind === "fullness")) return { status: "fits", warnings: fit.problems };
  return { status: "failed", problems: fit.problems };
}

/**
 * What fails a stored page's fit and blocks its print. A draft stored before #1248 can hold whole-book issues
 * ("whole-book check: ...") and room left as fit failures; they are warnings now, read from pageWarnings.
 */
export function blockingFit(page: GeneratedPage): FitProblem[] {
  if (page.fit.status !== "failed") return [];
  const printed = page.questions.some((q) => q.package && q.check.status !== "failed");
  return page.fit.problems.filter((p) => !p.reason.startsWith(WHOLE_BOOK) && !(printed && p.kind === "fullness"));
}

/**
 * The failures a reviewer must see on a page besides the render's, as the sample books mark them (#380, R379-4-1):
 * each failed question (one with no package names no question: its slot has a placeholder) and each fit check failure
 * that blocks print. Such a page is shown as a proof image, not in the PDF.
 */
export function draftReviewProblems(draft: { pages: readonly GeneratedPage[] }): RenderProblem[] {
  return [
    ...draft.pages.flatMap((p) => p.questions.flatMap((q) => (q.check.status === "failed"
      ? [{ page: p.number, question: q.package ? q.number : null, reason: `question ${q.number} failed: ${q.check.reason}` }] : []))),
    ...draft.pages.flatMap((p) => blockingFit(p).map((x) => ({ page: p.number, question: x.question, reason: `fit check: ${x.reason}` }))),
  ];
}

/** A page's warnings, for the admin to read before approving: room left, and the book's issues on the page. */
export function pageWarnings(page: GeneratedPage, quality: BookQuality | undefined): string[] {
  const fit = page.fit.status === "fits" ? page.fit.warnings ?? [] : page.fit.status === "failed" ? page.fit.problems.filter((p) => !blockingFit(page).includes(p)) : [];
  const book = (quality?.issues ?? []).filter((i) => i.page === page.number).map((i) => `${WHOLE_BOOK}${i.reason}`);
  return [...new Set([...fit.map((p) => (p.reason.startsWith(WHOLE_BOOK) ? p.reason : `room: ${p.reason}`)), ...book])];
}

/**
 * The page as it prints without its failed questions: a question whose own check failed (or that code could build
 * nothing for) is left off the printed page and listed in `leftOut`; the others are numbered again from 1, and the
 * page's content is changed in place (its teaching strips and panels stay), with no red placeholder. A question slot
 * left with no question is not printed. Null when nothing changes: no failed question, a page that is not a laid-out
 * day page, or a page whose questions all failed (it keeps them, so approval refuses it).
 */
export function withoutFailedQuestions(page: GeneratedPage): GeneratedPage | null {
  const own = (q: GeneratedQuestion) => q.check.status === "failed" || !q.package;
  // An explanation names the question it explains ("How did you work out question 2?"): it goes with that question.
  const dropped = new Set(page.questions.filter(own).map((q) => q.number));
  const failed = (q: GeneratedQuestion) => own(q) || dropped.has(explainedQuestion(q) ?? -1);
  if (page.content?.kind !== "day" || !page.questions.some(failed) || page.questions.every(failed)) return null;
  const kept = page.questions.filter((q) => !failed(q));
  const number = new Map(kept.map((q, k) => [q.number, k + 1]));
  const content = structuredClone(page.content);
  content.blocks = content.blocks.flatMap((b) => {
    const at = b.items.flatMap((n, k) => (number.has(n) ? [k] : []));
    if (!PANEL_SLOTS.includes(b.slot) && b.items.length > 0 && at.length === 0) return [];
    const next: Block = { ...b, items: at.map((k) => number.get(b.items[k])!) };
    delete next.missing;
    if (b.hints) next.hints = at.map((k) => b.hints![k] ?? null);
    if (b.figures) next.figures = at.map((k) => b.figures![k] ?? null);
    if (b.reviewFrom !== undefined) {
      const from = b.items.slice(b.items.indexOf(b.reviewFrom)).find((n) => number.has(n));
      if (from === undefined) delete next.reviewFrom; else next.reviewFrom = number.get(from)!;
    }
    return [next];
  });
  const reason = (q: GeneratedQuestion) => `failed its check: ${q.check.status === "failed" ? q.check.reason : "code could build no question"}`;
  return {
    ...page, content,
    questions: kept.map((q, k) => {
      const next = { ...q, number: k + 1, package: q.package ? { ...q.package, ref: { ...q.package.ref, question: k + 1 } } : null } as GeneratedQuestion;
      return renumberedExplanation(next, number);
    }),
    leftOut: [...(page.leftOut ?? []), ...page.questions.filter(failed).map((q) => ({ slot: q.slot, part: q.part, text: q.package?.text ?? null, reason: reason(q) }))],
  };
}

/** The generated explanation wordings (`explainFirstStory` in workbook-generator.ts) and the question each one names. */
const EXPLAIN_REF = /^(How did you work out question |How can you check your answer to question |Explain how you worked out question )(\d+)([.?])$/;
const explainedQuestion = (q: GeneratedQuestion): number | null => {
  const m = q.package?.text.match(EXPLAIN_REF);
  return m ? Number(m[2]) : null;
};
/** An explanation kept on the page names its question by the question's new number, in its text and its saved plan. */
function renumberedExplanation(q: GeneratedQuestion, number: ReadonlyMap<number, number>): GeneratedQuestion {
  const was = explainedQuestion(q), now = was === null ? undefined : number.get(was);
  if (!q.package || now === undefined || now === was) return q;
  const text = q.package.text.replace(EXPLAIN_REF, `$1${now}$3`);
  return { ...q, package: { ...q.package, text },
    ...(q.itemPlan ? { itemPlan: { ...q.itemPlan, item: { ...q.itemPlan.item, text }, numbers: (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) } } : {}) };
}

/**
 * Each page without its failed questions, checked again as it now prints (the gap a question leaves is a room warning);
 * `fits` answers for a page the generator laid out, else null (the page stays). Code only: a resume repeats it.
 */
export async function leaveOffFailed(pages: GeneratedPage[], fits: (page: GeneratedPage) => Promise<FitResult> | null): Promise<{ pages: GeneratedPage[]; changed: boolean }> {
  let changed = false;
  const next = await Promise.all(pages.map(async (p) => {
    const printed = withoutFailedQuestions(p), check = printed && fits(printed);
    if (!printed || !check) return p;
    changed = true;
    return { ...printed, fit: pageFitOf(await check, printed.questions) };
  }));
  return { pages: next, changed };
}

/**
 * A page below its practice floor keeps its last complete grid and reports the shortfall as an omission (as a forced
 * drop does), instead of failing the plan. Its physical fit and fullness are checked as before.
 */
export function floorOmission(layout: DayLayout, parts: readonly PlannedPart[], floor: number, count: number): void {
  const index = Math.max(0, parts.findIndex((p) => p.kind === "practice"));
  const reason = `capacity could not restore ${floor} planned practice questions; ${count} remain`;
  const had = layout.omissions.find((o) => o.part === index);
  if (had) { had.requested = Math.max(had.requested, had.placed + floor - count); had.reason = `${had.reason}; ${reason}`; }
  else layout.omissions.push({ part: index, kind: parts[index]?.kind ?? "practice", requested: floor, placed: count, reason });
}
