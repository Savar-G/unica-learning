// The v2 publish store and file store in memory, for tests. They keep the rules of allocate_v2_workbook and
// publish_v2_workbook (migration 20261127023500_workbook_v2_publish): test families only, one allocation for a request
// key or an input hash, the next workbook number of the child, a whole book or nothing, and the same input hash again
// writes nothing. publish-store.test.ts runs the same tests on this store and on the Supabase store.
import { payloadProblem } from "./contract-writer";
import type { Allocation, AllocateResult, AllocationCandidate, FamilyCheck, PublishPayload, PublishResult, PublishedRef, StoredV2Book, V2File, V2PublishStore, V2Storage } from "./types";

export interface MemoryTables {
  allocations: Allocation[];
  /** Each published book with every row of its payload. */
  books: { parentId: string; payload: PublishPayload }[];
}

export interface MemoryStoreOptions {
  children: { id: string; parentId: string }[];
  testParents: string[];
  /** Workbook numbers the child has already (v1 books). */
  numbers?: Record<string, number[]>;
}

export function memoryPublishStore(o: MemoryStoreOptions): V2PublishStore & { tables: MemoryTables } {
  const tables: MemoryTables = { allocations: [], books: [] };
  const parentOf = (childId: string) => o.children.find((c) => c.id === childId)?.parentId ?? null;
  const ref = (book: MemoryTables["books"][number]): PublishedRef => ({ workbookId: book.payload.workbook.id, printedRevision: book.payload.workbook.printedRevision });
  const byHash = (hash: string) => tables.books.find((b) => b.payload.workbook.inputHash === hash);
  return {
    tables,
    async family(childId): Promise<FamilyCheck> {
      const parentId = parentOf(childId);
      if (!parentId) return { status: "unknown-child" };
      return o.testParents.includes(parentId) ? { status: "test", parentId } : { status: "not-test" };
    },
    async allocate(c: AllocationCandidate): Promise<AllocateResult> {
      const parentId = parentOf(c.childId);
      if (!parentId) return { status: "refused", reason: "the child is not known" };
      if (!o.testParents.includes(parentId)) return { status: "refused", reason: "v2 books are only for test families" };
      const found = tables.allocations.find((a) => a.requestKey === c.requestKey || a.inputHash === c.inputHash);
      if (found) {
        if (found.childId !== c.childId) return { status: "refused", reason: "the request key belongs to another child" };
        return { status: "existing", ...structuredClone(found) };
      }
      const [folderParent, folderBook] = c.inputPath.split("/");
      if (folderParent !== parentId || folderBook !== c.workbookId) return { status: "refused", reason: "the input file is not in the workbook's folder" };
      if (tables.allocations.some((a) => a.workbookId === c.workbookId)) return { status: "refused", reason: "the allocation does not pass the database check (workbook id)" };
      const used = [...(o.numbers?.[c.childId] ?? []), ...tables.allocations.filter((a) => a.childId === c.childId).map((a) => a.workbookNumber)];
      const allocation: Allocation = { ...structuredClone(c), parentId, workbookNumber: Math.max(0, ...used) + 1 };
      tables.allocations.push(allocation);
      return { status: "allocated", ...structuredClone(allocation) };
    },
    async findAllocation(requestKey, childId, parentId) {
      const found = tables.allocations.find((a) => a.requestKey === requestKey && a.childId === childId && a.parentId === parentId);
      return found ? structuredClone(found) : null;
    },
    async findByInputHash(hash) {
      const book = byHash(hash);
      return book ? ref(book) : null;
    },
    async publish(payload): Promise<PublishResult> {
      const w = payload.workbook;
      const parentId = parentOf(w.childId);
      if (!parentId) return { status: "refused", reason: "the child is not known" };
      if (!o.testParents.includes(parentId)) return { status: "refused", reason: "v2 books are only for test families" };
      const a = tables.allocations.find((x) => x.workbookId === w.id);
      if (!a || a.childId !== w.childId || a.parentId !== parentId || a.inputHash !== w.inputHash || a.inputPath !== w.inputPath || a.workbookNumber !== w.number) {
        return { status: "refused", reason: "the book does not match its allocation" };
      }
      const existing = byHash(w.inputHash);
      if (existing) {
        const ew = existing.payload.workbook;
        if (ew.id !== w.id || ew.childId !== w.childId || ew.number !== w.number || ew.inputPath !== w.inputPath) {
          return { status: "refused", reason: "the book does not match its allocation" };
        }
        return { status: "existing", ...ref(existing) };
      }
      const problem = payloadProblem(payload, parentId);
      if (problem) return { status: "refused", reason: `the book does not pass the database check (${problem})` };
      if (a.allocation.qrTokens.length !== payload.pages.length || payload.pages.some((p) => a.allocation.qrTokens[p.number - 1] !== p.qrToken)) {
        return { status: "refused", reason: "the book does not pass the database check (a page QR token does not match the allocation)" };
      }
      const tokens = new Set(tables.books.flatMap((b) => b.payload.pages.map((p) => p.qrToken)));
      if (payload.pages.some((p) => tokens.has(p.qrToken))) return { status: "refused", reason: "a value is already used (workbook_pages_qr_token_key)" };
      const issuedAttempts = new Set(tables.books.filter((b) => b.payload.workbook.childId === w.childId).flatMap((b) => b.payload.sheets.map((s) => `${s.sheetId} ${s.attempt}`)));
      if (payload.sheets.some((s) => issuedAttempts.has(`${s.sheetId} ${s.attempt}`))) {
        return { status: "refused", reason: "a value is already used (workbook_sheets_child_attempt_key)" };
      }
      tables.books.push({ parentId, payload: structuredClone(payload) });
      return { status: "published", workbookId: w.id, printedRevision: w.printedRevision };
    },
    async storedBook(workbookId): Promise<StoredV2Book | null> {
      const book = tables.books.find((b) => b.payload.workbook.id === workbookId);
      if (!book) return null;
      const w = book.payload.workbook;
      return {
        workbookId, inputHash: w.inputHash, inputPath: w.inputPath, engineVersion: w.engineVersion, rendererVersion: w.rendererVersion,
        fontHashes: { ...w.fontHashes }, pdfSha256: w.pdfSha256, pages: book.payload.pages.map((p) => ({ number: p.number, imageSha256: p.printContract.fingerprints.image })),
      };
    },
  };
}

/** The workbook bucket in memory: a path is written once. */
export function memoryFiles(): V2Storage & { files: Map<string, V2File> } {
  const files = new Map<string, V2File>();
  return {
    files,
    async put(file) {
      if (files.has(file.path)) return "existing";
      files.set(file.path, { ...file, bytes: file.bytes.slice() });
      return "stored";
    },
    async get(path) {
      return files.get(path)?.bytes.slice() ?? null;
    },
  };
}
