// Admin workbook selection (#335). Speech transcripts and typed references use the same exact grammar.
// No model interprets a reference. Family and print checks precede the question-package read.
import { checkQuestionPackage, type QuestionPackage, type WorkbookQuestionRef } from "@/lib/question-package";
import { isUuid, type WorkbookStore } from "@/lib/workbook-content";
import { createSession } from "@/lib/maya";

export const WORKBOOK_REFERENCE_AGAIN = 'Say or type "page 4, number 3". Which question do you want?';
export const WORKBOOK_REFERENCE_REFUSED = "I can't use that question. Choose a printed page from this child's workbook.";

const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const numberOf = (s: string) => /^[1-9][0-9]{0,3}$/.test(s) ? Number(s) : WORDS.indexOf(s);

/** Exact forms only: page N, number M or page N number M, with an optional final period.
 * N and M are decimal integers 1-1000 or the words one through twenty. Case and outer space do not matter.
 */
export function parseWorkbookReference(text: unknown): { page: number; question: number } | null {
  if (typeof text !== "string" || text.length > 100) return null;
  const match = /^page ([a-z]+|[1-9][0-9]{0,3}),? number ([a-z]+|[1-9][0-9]{0,3})\.?$/.exec(text.trim().toLowerCase());
  if (!match) return null;
  const page = numberOf(match[1]), question = numberOf(match[2]);
  return page >= 1 && page <= 1000 && question >= 1 && question <= 1000 ? { page, question } : null;
}

export interface WorkbookSelectionInput {
  childId: unknown;
  workbookId: unknown;
  reference?: unknown;
  /** A tap submits only the printed numbers. It never submits a package or pixel coordinates. */
  page?: unknown;
  question?: unknown;
}

export interface WorkbookSelectionReader {
  child(id: string): Promise<{ parentId: string; firstName: string | null; grade?: number } | null>;
  isTestFamily(parentId: string): Promise<boolean>;
  books: Pick<WorkbookStore, "childWorkbooks" | "page" | "question">;
}

export type WorkbookSelection = { ok: true; parentId: string; childId: string; childName: string | null; grade?: number; ref: WorkbookQuestionRef; package: QuestionPackage } |
  { ok: false; error: "reference_again" | "reference_refused" | "not_test_family"; say: string };

/** Also authorizes the short microphone connection. This reads summaries, never question packages. */
export async function workbookSelectionContext(input: Pick<WorkbookSelectionInput, "childId" | "workbookId">, reader: WorkbookSelectionReader) {
  if (!isUuid(input.childId) || !isUuid(input.workbookId)) return null;
  const childId = input.childId.toLowerCase(), workbookId = input.workbookId.toLowerCase();
  const child = await reader.child(childId);
  if (!child || !await reader.isTestFamily(child.parentId)) return null;
  const book = (await reader.books.childWorkbooks(childId)).find(b => b.id === workbookId);
  return book && book.childId === childId && book.parentId === child.parentId && ["printed", "shipped"].includes(book.status) && book.printedAt
    ? { book, childId, childName: child.firstName, parentId: child.parentId, grade: child.grade } : null;
}

export async function selectWorkbookQuestion(input: WorkbookSelectionInput, reader: WorkbookSelectionReader): Promise<WorkbookSelection> {
  const no = (): WorkbookSelection => ({ ok: false, error: "reference_refused", say: WORKBOOK_REFERENCE_REFUSED });
  if (!isUuid(input.childId) || !isUuid(input.workbookId)) return no();
  // Ambiguous requests cannot silently prefer one reference over another.
  const typed = input.reference !== undefined;
  const at = typed ? parseWorkbookReference(input.reference) : { page: input.page, question: input.question };
  if ((typed && (input.page !== undefined || input.question !== undefined)) || !at ||
    !Number.isInteger(at.page) || !Number.isInteger(at.question) || Number(at.page) < 1 || Number(at.page) > 1000 || Number(at.question) < 1 || Number(at.question) > 1000) {
    return { ok: false, error: "reference_again", say: WORKBOOK_REFERENCE_AGAIN };
  }
  const childId = input.childId.toLowerCase(), workbookId = input.workbookId.toLowerCase();
  const child = await reader.child(childId);
  if (!child) return no();
  if (!await reader.isTestFamily(child.parentId)) return { ok: false, error: "not_test_family", say: WORKBOOK_REFERENCE_REFUSED };
  const book = (await reader.books.childWorkbooks(childId)).find(b => b.id === workbookId);
  if (!book || book.childId !== childId || book.parentId !== child.parentId || !["printed", "shipped"].includes(book.status) || !book.printedAt) return no();
  const page = await reader.books.page(book.id, Number(at.page));
  if (!page?.image || !page.questions.some(q => q.number === at.question)) return no();
  const ref: WorkbookQuestionRef = { source: "workbook", workbookId, page: Number(at.page), question: Number(at.question) };
  const found = await reader.books.question(ref);
  if (found.status !== "found") return no();
  const checked = checkQuestionPackage(found.package);
  if (!checked.ok) return no();
  const saved = checked.package.ref;
  if (saved.source !== "workbook" || saved.workbookId !== ref.workbookId || saved.page !== ref.page || saved.question !== ref.question) return no();
  if (!createSession({ callId: "selection-check", package: checked.package }).package) return no();
  return { ok: true, ref, package: checked.package, parentId: child.parentId, childId, childName: child.firstName, grade: child.grade };
}
