// In-memory NextBookDueReader for tests (#476), over the memory snapshot store's state. Same selection as the Supabase
// reader (src/lib/next-book-step-store.ts): book 1 claims with no chain, live revision-1 chains not yet admitted, and
// backstop holds with no held row, oldest first, a page at a time from the cursor. `failNext` makes the next read throw,
// as a failed or cut read does.
import type { MemoryNextBookState } from "./next-book-snapshot-memory";
import { dueOrder, type NextBookDueItem, type NextBookDuePage, type NextBookDueReader } from "./next-book-step";

export function memoryNextBookDue(state: MemoryNextBookState): NextBookDueReader & { failNext: boolean; failAfter: number | null; reads: number } {
  const reader = {
    failNext: false,
    /** Throw on every read after this many. */
    failAfter: null as number | null,
    reads: 0,
    async page({ size, from, parents }: { size: number; from: number | null; parents: readonly string[] | null }): Promise<NextBookDuePage> {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      reader.reads++;
      if (reader.failNext) { reader.failNext = false; throw new Error("next_book_due_read"); }
      if (reader.failAfter !== null && reader.reads > reader.failAfter) throw new Error("next_book_due_read");
      const wanted = (parentId: string) => !parents || parents.includes(parentId);
      const liveChain = (workbookId: string) => state.snapshots.some(s => s.workbookId === workbookId && s.revision === 1 && !s.held);
      const items: NextBookDueItem[] = [];
      for (const s of state.snapshots) {
        if (s.revision !== 1 || s.held || s.runId || !wanted(s.parentId)) continue;
        items.push({ kind: "chain", anchor: s.prepareFrom, id: s.id, workbookId: s.workbookId, parentId: s.parentId, childId: s.childId,
          trigger: { kind: "snapshot", snapshotId: s.id } });
      }
      for (const c of state.claims) {
        if (c.number !== 1 || !wanted(c.parentId) || liveChain(c.workbookId) || state.snapshots.some(s => s.triggerId === c.id)) continue;
        items.push({ kind: "claim", anchor: c.claimedAt, id: c.id, workbookId: c.workbookId, parentId: c.parentId, childId: c.childId,
          trigger: { kind: "claim", triggerId: c.id } });
      }
      for (const h of state.holds) {
        const book = state.books.find(b => b.id === h.workbookId);
        if (!book || book.number !== 1 || !wanted(book.parentId) || liveChain(h.workbookId)
          || state.claims.some(c => c.workbookId === h.workbookId)
          || state.snapshots.some(s => s.workbookId === h.workbookId && s.held && s.deliveryAuditId === h.deliveryAuditId)) continue;
        items.push({ kind: "hold", anchor: h.heldAt, id: `${h.workbookId}:${h.deliveryAuditId}`, workbookId: h.workbookId, parentId: book.parentId,
          childId: book.childId, trigger: { kind: "backstop-hold", workbookId: h.workbookId, deliveryAuditId: h.deliveryAuditId } });
      }
      const after = items.filter(i => from === null || i.anchor >= from).sort(dueOrder);
      const page = after.slice(0, size);
      return { items: page, next: after.length > size ? page.at(-1)!.anchor : null };
    },
  };
  return reader;
}
