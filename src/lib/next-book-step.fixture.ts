// Synthetic next-book worlds for the step and admin tests (#476): the memory snapshot store, a capture that returns one
// final mark per book, and a planner that consumes the whole ledger. No customer data.
import type { NextBookCapture, NextBookDeps, NextBookPlanner, NextBookSnapshotStore } from "./next-book-snapshot";
import { prepareNextBook } from "./next-book-snapshot";
import { memoryNextBookSnapshots } from "./next-book-snapshot-memory";
import type { PrepareCall } from "./next-book-step";
import type { PlanInput, WorkbookPlan } from "./workbook-plan";
import type { FrozenWorkbookSourcesV2 } from "./workbook-progress-source";
import type { HistoryFence } from "./workbook-progress-history";
import type { ProgressHistory, ProgressSnapshot } from "./workbook-progress";

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const REV = "a".repeat(28);
export const MIN = 60_000;
export const ADMIN = { id: uuid(9_000), email: "admin@example.invalid" };

export interface Family { n: number; parentId: string; childId: string; bookId: string }

export function nextBookWorld(start: number) {
  const clock = { now: start };
  const m = memoryNextBookSnapshots(() => clock.now);
  m.state.admins.add(ADMIN.id);
  const writes: string[] = [];
  const counted = <K extends keyof NextBookSnapshotStore>(k: K) => ((...args: unknown[]) => {
    writes.push(k);
    return (m.store[k] as (...a: unknown[]) => unknown)(...args);
  }) as NextBookSnapshotStore[K];
  /** The store, with every write call counted (a refused write counts too: it reached the store). */
  const store: NextBookSnapshotStore = { ...m.store, claim: counted("claim"), hold: counted("hold"), save: counted("save"),
    savePlan: counted("savePlan"), retake: counted("retake"), admit: counted("admit") };

  /** A family with a shipped, delivered book 1 and one accepted scan whose marking job finished. */
  function family(n: number, job: "finished" | "waiting" = "finished"): Family {
    const f = { n, parentId: uuid(n * 10 + 1), childId: uuid(n * 10 + 2), bookId: uuid(n * 10 + 3) };
    m.state.books.push({ id: f.bookId, parentId: f.parentId, childId: f.childId, number: 1, status: "shipped", printedRevision: REV });
    m.state.deliveries.add(f.bookId);
    m.state.receipts.push({ id: `receipt-${n}`, workbookId: f.bookId, printedRevision: REV, photoRevision: `photo-${n}`, acceptedAt: start - MIN });
    m.state.jobs.set(`photo-${n}`, job);
    return f;
  }
  function claim(f: Family, at: number, reason: "day7_scanned" | "delivery_backstop" = "day7_scanned") {
    m.state.claims.push({ id: uuid(f.n * 10 + 4), workbookId: f.bookId, parentId: f.parentId, childId: f.childId, number: 1, printedRevision: REV,
      reason, claimedAt: at, receiptIds: [`receipt-${f.n}`], deliveryAuditId: f.n });
  }
  function hold(f: Family, at: number) {
    m.state.receipts = m.state.receipts.filter(r => r.workbookId !== f.bookId);
    m.state.holds.push({ workbookId: f.bookId, deliveryAuditId: f.n, printedRevision: REV, heldAt: at, backstopAt: at });
  }

  let captureAnswer: "captured" | "held" = "captured";
  const capture: NextBookCapture = async r => {
    if (captureAnswer === "held") return { status: "held", reason: "no-marked-scans" };
    const identity = { workbookId: r.workbookId, printedRevision: r.printedRevision, pageId: "page-1", itemId: "item-1" };
    return {
      status: "captured",
      sources: { version: 2, parentId: r.parentId, childId: r.childId,
        books: [{ book: { id: r.workbookId, print_manifest: { days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(day => ({ day })) } } }] } as unknown as FrozenWorkbookSourcesV2,
      fence: { parentId: r.parentId, childId: r.childId } as unknown as HistoryFence,
      snapshot: { parentId: r.parentId, childId: r.childId, cutoff: r.cutoff, requiredSample: [],
        scope: [{ workbookId: r.workbookId, printedRevision: r.printedRevision, days: [1, 2, 3, 4, 5, 6, 7] }] } as unknown as ProgressSnapshot,
      history: { originals: [{ day: 1, first: { observation: { identity, resultVersion: 1, state: "right" } }, changes: [] }] } as unknown as ProgressHistory,
      held: [],
    };
  };
  const planner: NextBookPlanner = {
    async plan({ frozen }) {
      return { ok: true, consumed: frozen.evidence.map(({ key, version }) => ({ key, version })), held: [], planHash: "b".repeat(64),
        planningInput: { workbook: { number: 2 } } as unknown as PlanInput, plan: { days: [] } as unknown as WorkbookPlan };
    },
  };
  const deps = (p: NextBookPlanner): NextBookDeps => ({ store, capture, planner: p, run: { maxAttempts: 2, staleSeconds: 360 } });
  const prepare = (p: NextBookPlanner): PrepareCall => (trigger, now) => prepareNextBook(trigger, deps(p), now);
  const chainOf = (f: Family) => m.state.snapshots.find(s => s.workbookId === f.bookId && s.revision === 1);
  return { clock, m, store, writes, family, claim, hold, capture, planner, prepare, chainOf,
    holdCaptures: () => { captureAnswer = "held"; } };
}
