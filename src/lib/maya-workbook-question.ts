// Admin workbook selection (#335). Speech transcripts and typed references use the same exact grammar.
// No model interprets a reference. Family and print checks precede the question-package read.
import { checkQuestionPackage, type QuestionPackage, type WorkbookQuestionRef } from "@/lib/question-package";
import { isUuid, type WorkbookStore } from "@/lib/workbook-content";
import { createSession } from "@/lib/maya";

export const WORKBOOK_REFERENCE_AGAIN = "Type it like: page 4, number 3.";
export const WORKBOOK_REFERENCE_REFUSED = "I can't find that question in this child's workbook.";
export const WORKBOOK_NOT_PRINTED = "This workbook is not printed yet.";

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

type WorkbookRefusal = { ok: false; error: "reference_again" | "reference_refused" | "not_test_family"; say: string };
export type WorkbookSelection = { ok: true; parentId: string; childId: string; childName: string | null; grade?: number; ref: WorkbookQuestionRef; package: QuestionPackage } | WorkbookRefusal;
const refuse = (say = WORKBOOK_REFERENCE_REFUSED, error: WorkbookRefusal["error"] = "reference_refused"): WorkbookRefusal => ({ ok: false, error, say });

/** Also authorizes the short microphone connection. This reads summaries, never question packages. */
export async function workbookSelectionContext(input: Pick<WorkbookSelectionInput, "childId" | "workbookId">, reader: WorkbookSelectionReader) {
  if (!isUuid(input.childId) || !isUuid(input.workbookId)) return refuse();
  const childId = input.childId.toLowerCase(), workbookId = input.workbookId.toLowerCase();
  const child = await reader.child(childId);
  if (!child) return refuse();
  const book = (await reader.books.childWorkbooks(childId)).find(b => b.id === workbookId);
  // Check ownership before reporting any workbook state, including its print status.
  if (!book || book.childId !== childId || book.parentId !== child.parentId) return refuse();
  if (!await reader.isTestFamily(child.parentId)) return refuse("Only test families can start a Maya session.", "not_test_family");
  if (!["printed", "shipped"].includes(book.status) || !book.printedAt) return refuse(WORKBOOK_NOT_PRINTED);
  return { ok: true as const, book, childId, childName: child.firstName, parentId: child.parentId, grade: child.grade };
}

export async function selectWorkbookQuestion(input: WorkbookSelectionInput, reader: WorkbookSelectionReader): Promise<WorkbookSelection> {
  if (!isUuid(input.childId) || !isUuid(input.workbookId)) return refuse();
  // Ambiguous requests cannot silently prefer one reference over another.
  const typed = input.reference !== undefined;
  const at = typed ? parseWorkbookReference(input.reference) : { page: input.page, question: input.question };
  if ((typed && (input.page !== undefined || input.question !== undefined)) || !at ||
    !Number.isInteger(at.page) || !Number.isInteger(at.question) || Number(at.page) < 1 || Number(at.page) > 1000 || Number(at.question) < 1 || Number(at.question) > 1000) {
    return { ok: false, error: "reference_again", say: WORKBOOK_REFERENCE_AGAIN };
  }
  const context = await workbookSelectionContext(input, reader);
  if (!context.ok) return context;
  const { book, childId, childName, parentId, grade } = context;
  const workbookId = book.id;
  const page = await reader.books.page(book.id, Number(at.page));
  if (!page) return refuse(`Page ${at.page} is not in this workbook.`);
  if (!page.questions.some(q => q.number === at.question)) return refuse(`Page ${at.page} has no number ${at.question}.`);
  if (!page.image) return refuse(`Page ${at.page} has no saved image.`);
  const ref: WorkbookQuestionRef = { source: "workbook", workbookId, page: Number(at.page), question: Number(at.question) };
  const found = await reader.books.question(ref);
  if (found.status === "not-found") return refuse(`Page ${at.page} has no number ${at.question}.`);
  if (found.status !== "found") return refuse(`The saved content for page ${at.page}, number ${at.question} is not available.`);
  const checked = checkQuestionPackage(found.package);
  if (!checked.ok) return refuse(`Page ${at.page}, number ${at.question} has invalid saved content.`);
  const saved = checked.package.ref;
  if (saved.source !== "workbook" || saved.workbookId !== ref.workbookId || saved.page !== ref.page || saved.question !== ref.question) return refuse(`The saved content does not match page ${at.page}, number ${at.question}.`);
  if (!createSession({ callId: "selection-check", package: checked.package }).package) return refuse(`Maya cannot teach page ${at.page}, number ${at.question} yet.`);
  return { ok: true, ref, package: checked.package, parentId, childId, childName, grade };
}
