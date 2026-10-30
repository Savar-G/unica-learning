import { QUESTION_PACKAGE_VERSION } from "@/lib/question-package";
import {
  isUuid,
  storedQuestion,
  workbookProblem,
  type PageInput,
  type StoredQuestion,
  type WorkbookFile,
  type WorkbookFiles,
  type WorkbookInput,
  type WorkbookPage,
  type WorkbookStore,
  type WorkbookSummary,
} from "@/lib/workbook-content";

// The workbook store (#299) in memory, for tests: it keeps the database's behaviour. A write is checked whole before
// anything is kept, so a refused write keeps nothing; the conflicts the database refuses (an unknown child, a file
// outside the family's folder, a workbook number, id or QR token already used) are refused with the same reasons;
// what is kept is a copy, as the database keeps JSON. `children`: the children the store knows, with their parent.

interface Kept {
  summary: WorkbookSummary;
  pages: (Omit<PageInput, "questions"> & { questions: StoredQuestion[] })[];
}

export function memoryWorkbookStore(o: { children: readonly { id: string; parentId: string }[]; now: () => Date }): WorkbookStore {
  const books = new Map<string, Kept>();

  function readPage(workbookId: string, page: Kept["pages"][number]): WorkbookPage {
    const { questions, ...rest } = structuredClone(page);
    return { ...rest, questions: questions.map((q) => storedQuestion(q, { source: "workbook", workbookId, page: page.number, question: q.number })) };
  }

  return {
    async write(input) {
      const problem = workbookProblem(input);
      if (problem) return { status: "refused", reason: problem };
      const w: WorkbookInput = structuredClone(input);
      const child = o.children.find((c) => c.id === w.childId);
      if (!child) return { status: "refused", reason: "the child is not known" };
      const paths = [w.pdfPath, ...w.pages.map((p) => p.image?.path ?? null)].filter((p): p is string => p !== null);
      if (paths.some((p) => !p.startsWith(`${child.parentId}/`))) return { status: "refused", reason: "a file is not in the family's folder" };
      const kept = [...books.values()];
      if (books.has(w.id)) return { status: "refused", reason: "the workbook id is already used" };
      if (kept.some((b) => b.summary.childId === w.childId && b.summary.number === w.number)) {
        return { status: "refused", reason: `the child already has workbook ${w.number}` };
      }
      const tokens = new Set(kept.flatMap((b) => b.pages.map((p) => p.qrToken)));
      if (w.pages.some((p) => tokens.has(p.qrToken))) return { status: "refused", reason: "a QR token is already used" };

      books.set(w.id, {
        summary: {
          id: w.id, parentId: child.parentId, childId: w.childId, number: w.number, levels: w.levels, status: "draft", pdfPath: w.pdfPath,
          profileBuild: w.profileBuild, createdAt: o.now().toISOString(), approvedAt: null, printedAt: null, shippedAt: null,
        },
        pages: [...w.pages].sort((a, b) => a.number - b.number).map((p) => ({
          ...p,
          questions: [...p.questions].sort((a, b) => a.number - b.number)
            .map((q) => ({ number: q.number, box: q.box, schemaVersion: QUESTION_PACKAGE_VERSION, package: q.package })),
        })),
      });
      return { status: "written", workbookId: w.id };
    },

    async workbook(id) {
      const book = books.get(id);
      return book ? { ...structuredClone(book.summary), pages: book.pages.map((p) => readPage(id, p)) } : null;
    },

    async childWorkbooks(childId) {
      if (!isUuid(childId)) return [];
      return [...books.values()].filter((b) => b.summary.childId === childId).map((b) => structuredClone(b.summary)).sort((a, b) => b.number - a.number);
    },

    async page(workbookId, pageNumber) {
      const page = books.get(workbookId)?.pages.find((p) => p.number === pageNumber);
      return page ? readPage(workbookId, page) : null;
    },

    async question(ref) {
      const page = books.get(ref.workbookId)?.pages.find((p) => p.number === ref.page);
      const question = page?.questions.find((q) => q.number === ref.question);
      return question ? storedQuestion(structuredClone(question), ref).content : { status: "not-found" };
    },
  };
}

/** The workbook bucket in memory, for tests: `files` holds what is stored. */
export function memoryWorkbookFiles(): WorkbookFiles & { files: Map<string, Omit<WorkbookFile, "path">> } {
  const files = new Map<string, Omit<WorkbookFile, "path">>();
  return {
    files,
    async put(file) {
      if (files.has(file.path)) throw new Error("workbook file upload: The resource already exists");
      files.set(file.path, { contentType: file.contentType, bytes: file.bytes.slice() });
    },
    async remove(paths) {
      paths.forEach((p) => files.delete(p));
    },
  };
}
