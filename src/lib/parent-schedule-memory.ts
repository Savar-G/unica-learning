import type { ScheduleApproval, ScheduleBook, ScheduleChild, SchedulePage, ScheduleRevision, ScheduleReceipt, ScheduleStore } from "@/lib/parent-schedule";

export interface ScheduleMemory {
  children: ScheduleChild[];
  books: ScheduleBook[];
  approvals: ScheduleApproval[];
  revisions: { book: string; revision: number; source: ScheduleRevision }[];
  pages: { book: string; parent: string; child: string; page: SchedulePage }[];
  receipts: ScheduleReceipt[];
  fail?: "children" | "books" | "approvals" | "revision" | "pages" | "receipts";
}
export function memoryScheduleStore(data: ScheduleMemory): ScheduleStore {
  const check = (name: ScheduleMemory["fail"]) => { if (data.fail === name) throw new Error("Read failed"); };
  return {
    async children(parent) { check("children"); return data.children.filter(c => c.parentId === parent); },
    async books(parent, child) { check("books"); return data.books.filter(b => b.parentId === parent && b.childId === child); },
    async approvals(parent, child, book) { check("approvals"); return data.approvals.filter(a => a.parentId === parent && a.childId === child && a.workbookId === book); },
    async revision(parent, child, book, revision) { check("revision"); return data.revisions.find(r => r.book === book && r.revision === revision && r.source.parentId === parent && r.source.childId === child)?.source ?? null; },
    async pages(parent, child, book) { check("pages"); return data.pages.filter(p => p.parent === parent && p.child === child && p.book === book).map(p => p.page); },
    async receipts(parent, child, book, revision) { check("receipts"); return data.receipts.filter(s => s.parentId === parent && s.childId === child && s.workbookId === book && s.revision === revision); },
  };
}
