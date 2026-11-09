import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
// Today's curriculum digest, as the code on main computes it. A test sets `newer` to stand for a curriculum that changed
// after Book 1 was made (the Book 1 record keeps the digest it was made with).
const cv = vi.hoisted(() => ({ newer: null as string | null }));
vi.mock("./workbook-curriculum", async importOriginal => {
  const real = await importOriginal<typeof import("./workbook-curriculum")>();
  return { ...real, curriculumVersion: (key: string) => cv.newer ?? real.curriculumVersion(key) };
});
import { baselineOf, CUTOFF, frozenOf, jobBook, mark, PARENT, CHILD, printedItems, shippedBook } from "./workbook-book1.fixture";
import { approvedWorkbook } from "./workbook-ship";
import { book2Planning, type Book1Baseline } from "./workbook-book1-baseline";
import { nextBookIssuedSkills, planNextBookFromSnapshot, type NextBookSnapshot } from "./workbook-next-book-snapshot";
import { frozenView, itemKey, prepareNextBook, refreshNextBookSnapshot, type NextBookCapture, type NextBookDeps, type NextBookPlanner,
  type NextBookSnapshotRecord } from "./next-book-snapshot";
import { memoryNextBookSnapshots } from "./next-book-snapshot-memory";
import { memoryNextBookDue } from "./next-book-step-memory";
import { runNextBookStep } from "./next-book-step";
import { prepareFromSnapshot } from "./next-book-admin";
import { book1Capture } from "./next-book-snapshot-server";
import { captureNextBookEvidence } from "./next-book-capture";
import { BOOK1_RECORD_UNAVAILABLE, nextBookPlanner, nextBookWiring, plannerScope, snapshotPlanner } from "./next-book-planner";
import type { FrozenWorkbookSourcesV2 } from "./workbook-progress-source";

// #476 with the real planner (planNextBookFromSnapshot, #796) on the synthetic Book 1 of workbook-book1.fixture.ts: a
// real first book made by the job with the fake AI, its baseline on today's curriculum, and synthetic marks. No family,
// provider or credential. The memory store keeps save_next_book_plan's rules.

const MIN = 60_000;
const ADMIN = { id: "00000000-0000-4000-8000-0000000000ad", email: "admin@example.invalid" };
type Item = ReturnType<typeof printedItems>[number];
let sources: FrozenWorkbookSourcesV2, baseline: Book1Baseline, bookId: string, revision: string;
let later: Item, area: Item[], fresh: Item;
let sourceBook: ReturnType<typeof shippedBook>, record: ReturnType<typeof baselineOf>["record"];

beforeAll(async () => {
  const job = await jobBook(5), made = baselineOf(job);
  baseline = made.baseline;
  const book = shippedBook(approvedWorkbook(job.final), job.runId, job.frame);
  const all = printedItems(book).filter(e => e.day <= 7 && e.mastery.eligible);
  // A printed review (3.9, step 4) marked right, an expanded-form question marked wrong, and a Day 8 question marked early.
  area = all.filter(e => e.teaching?.itemStep?.skill === "3.9-area-square-units" && e.teaching.itemStep.step === 4);
  for (const e of area) mark(book, e, "right");
  const wrong = all.find(e => e.teaching?.itemStep?.skill === "4.1-expanded-form")!;
  mark(book, wrong, "wrong");
  // Not marked here: the after-cutoff test marks it first at CUTOFF + 1 s.
  fresh = all.find(e => e !== wrong && !area.includes(e))!;
  later = printedItems(book).find(e => e.day >= 8 && e.mastery.eligible)!;
  mark(book, later, "right");
  sources = frozenOf(book, made.record);
  sourceBook = structuredClone(book); record = made.record;
  bookId = book.book.id; revision = book.book.printed_revision!;
}, 300_000);

const keyOf = (e: Item) => itemKey(e.identity);

/** The memory store with the fixture's delivered Book 1, its accepted scans and the real capture over its sources. */
function world(over: { capture?: NextBookCapture } = {}) {
  const clock = { now: CUTOFF };
  const m = memoryNextBookSnapshots(() => clock.now);
  m.state.books.push({ id: bookId, parentId: PARENT, childId: CHILD, number: 1, status: "shipped", printedRevision: revision });
  m.state.deliveries.add(bookId);
  m.state.admins.add(ADMIN.id);
  m.state.receipts.push({ id: "receipt-1", workbookId: bookId, printedRevision: revision, photoRevision: "photo-1", acceptedAt: CUTOFF - 2 * MIN });
  m.state.jobs.set("photo-1", "finished");
  // The server's own capture (read, capture, read again), on a source store that returns the fixture's frozen rows.
  const capture = over.capture ?? book1Capture({ capture: async () => structuredClone(sources) });
  const claim = (reason: "day7_scanned" | "delivery_backstop" = "day7_scanned") => {
    m.state.claims.push({ id: "claim-1", workbookId: bookId, parentId: PARENT, childId: CHILD, number: 1, printedRevision: revision, reason,
      claimedAt: CUTOFF - MIN, receiptIds: ["receipt-1"], deliveryAuditId: 7 });
    return { kind: "claim" as const, triggerId: "claim-1" };
  };
  const deps = (planner: NextBookPlanner = nextBookPlanner()!): NextBookDeps => ({ store: m.store, capture, planner, run: { maxAttempts: 2, staleSeconds: 360 } });
  const row = () => m.state.snapshots.find(s => s.workbookId === bookId && s.revision === 1)!;
  return { m, clock, claim, deps, row };
}

/** The real planner, recording each snapshot our adapter hands it. */
function recording() {
  const seen: NextBookSnapshot[] = [];
  const planner = snapshotPlanner(input => { seen.push(structuredClone(input.snapshot)); return planNextBookFromSnapshot(input); });
  return { seen, planner };
}

function planOf(row: NextBookSnapshotRecord) {
  if (!row.plan || !row.frozen) throw Error(`no plan: ${JSON.stringify({ frozen: !!row.frozen })}`);
  return { plan: row.plan, frozen: row.frozen };
}

describe("the next-book planner wiring", () => {
  // Falsifier: the real planner's answer does not fit the seam, consumes a mark outside the frozen ledger, or no run starts.
  it("plans a Day 7 snapshot with the real planner and admits one run, every consumed mark inside the ledger", async () => {
    const w = world(), r = recording();
    const outcome = await prepareNextBook(w.claim(), w.deps(r.planner), CUTOFF);
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: "queued", snapshotId: w.row().id });
    const { plan, frozen } = planOf(w.row());
    // The ledger covers every skill in Days 1-7, not one selected step: the printed review of 3.9 is in it.
    const ledger = new Map(frozen.ledger.map(l => [l.key, l.version]));
    for (const e of area) expect(ledger.get(keyOf(e))).toBe(2);
    expect(ledger.has(keyOf(later))).toBe(false);
    expect(frozen.held).toEqual(expect.arrayContaining([expect.objectContaining({ key: keyOf(later), reason: "outside-days" })]));
    // The subset check passed: every consumed key is in the ledger at its version, with the planner's first version.
    expect(plan.consumed.length).toBeGreaterThan(0);
    for (const c of plan.consumed) {
      expect(ledger.get(c.key)).toBe(c.version);
      expect(c.firstVersion).toBeLessThanOrEqual(c.version);
    }
    expect(plan.consumed.map(c => c.key)).toEqual(expect.arrayContaining(area.map(keyOf)));
    // Held as given, a printed review with no question under a null key included.
    expect(plan.held.some(h => h.key === null && typeof h.skill === "string" && typeof h.step === "number")).toBe(true);
    // The stored plan is the planner's own answer for the same frozen snapshot.
    const direct = planNextBookFromSnapshot({ sources: frozen.sources, snapshot: r.seen[0] });
    if (!direct.ok) throw Error(direct.reason);
    expect(plan.planHash).toBe(direct.planHash);
    expect(plan.planInput).toEqual(JSON.parse(JSON.stringify(direct.planningInput)));
    expect(plan.held).toEqual(JSON.parse(JSON.stringify(direct.held)));
    expect(plan.planInput.workbook.number).toBe(2);
    expect(w.m.state.runs).toEqual([expect.objectContaining({ number: 2, snapshotId: w.row().id, status: "queued" })]);
    // Again: the same chain and the same run, no second plan call.
    expect(await prepareNextBook(w.claim(), w.deps(r.planner), CUTOFF + MIN)).toEqual(outcome);
    expect(r.seen).toHaveLength(1);
  }, 120_000);

  // Falsifier: a scope reaches the planner other than the one the capture froze, or its fields are not the row's.
  it("maps the scope: Day 7 claim -> day7, backstop and admin with no claim -> backstop, refresh -> later-book", async () => {
    expect(plannerScope({ revision: 1, reason: "day7_scanned" })).toBe("day7");
    expect(plannerScope({ revision: 1, reason: "delivery_backstop" })).toBe("backstop");
    expect(plannerScope({ revision: 1, reason: "admin_prepare" })).toBe("backstop");
    for (const reason of ["day7_scanned", "delivery_backstop", "admin_prepare"] as const) expect(plannerScope({ revision: 2, reason })).toBe("later-book");

    const day7 = world(), d = recording();
    expect((await prepareNextBook(day7.claim(), day7.deps(d.planner), CUTOFF)).status).toBe("queued");
    const row = day7.row();
    expect(d.seen).toEqual([{ id: row.id, workbookId: bookId, cutoff: row.frozen!.frozenAt, scope: "day7", issuedSkills: nextBookIssuedSkills(sources) }]);
    expect(row.frozen!.frozenAt).toBe(CUTOFF);

    const backstop = world(), b = recording();
    expect((await prepareNextBook(backstop.claim("delivery_backstop"), backstop.deps(b.planner), CUTOFF)).status).toBe("queued");
    expect(b.seen.map(s => s.scope)).toEqual(["backstop"]);
    // Every accepted day: the early Day 8 mark is in the ledger.
    expect(backstop.row().frozen!.ledger.some(l => l.key === keyOf(later))).toBe(true);

    const admin = world(), a = recording();
    expect((await prepareNextBook({ kind: "admin", workbookId: bookId, actor: ADMIN }, admin.deps(a.planner), CUTOFF)).status).toBe("queued");
    expect(admin.row()).toMatchObject({ reason: "admin_prepare", triggerId: null });
    expect(admin.row().frozen!.scope).toMatchObject({ kind: "backstop", request: "backstop" });
    expect(a.seen.map(s => s.scope)).toEqual(["backstop"]);

    // D-308 refresh: revision 2 of the Day 7 chain, after a new mark (the early Day 8 one the Day 7 draft held).
    const draftId = "draft-1";
    day7.m.state.runs[0].draftId = draftId;
    day7.m.state.drafts.set(draftId, { parentId: PARENT, childId: CHILD });
    day7.m.state.marks = [{ workbookId: bookId, key: keyOf(later), version: 2, day: later.day, pageId: later.identity.pageId }];
    day7.clock.now = CUTOFF + 10 * MIN;
    const refreshed = await refreshNextBookSnapshot(draftId, ADMIN, day7.deps(d.planner), day7.clock.now);
    if (!refreshed.ok) throw Error(refreshed.reason);
    expect(refreshed.frozen.scope).toMatchObject({ kind: "refresh", request: "later-book" });
    expect(await prepareNextBook({ kind: "snapshot", snapshotId: refreshed.snapshotId }, day7.deps(d.planner), day7.clock.now))
      .toEqual({ status: "planned", snapshotId: refreshed.snapshotId, revision: 2, admission: "refresh" });
    expect(d.seen.map(s => s.scope)).toEqual(["day7", "later-book"]);
    expect(d.seen[1]).toMatchObject({ id: refreshed.snapshotId, cutoff: CUTOFF + 10 * MIN });
    expect(day7.m.state.runs).toHaveLength(1);
  }, 240_000);

  // Falsifier: a plan naming a mark outside the ledger, or at another version, is saved or starts a run.
  it("refuses a planner answer that consumes outside the ledger, and saves no plan", async () => {
    for (const misuse of ["outside", "version"] as const) {
      const w = world();
      const planner = snapshotPlanner(input => {
        const real = planNextBookFromSnapshot(input);
        if (!real.ok) return real;
        const consumed = misuse === "outside"
          ? [...real.consumed, { key: keyOf(later), firstVersion: 2, effectiveVersion: 2 }]
          : real.consumed.map((c, i) => i === 0 ? { ...c, effectiveVersion: c.effectiveVersion + 1 } : c);
        return { ...real, consumed };
      });
      expect(await prepareNextBook(w.claim(), w.deps(planner), CUTOFF)).toEqual({ status: "refused", reason: "consumed-outside-ledger", snapshotId: w.row().id });
      expect(w.row().frozen).not.toBeNull();
      expect(w.row().plan).toBeNull();
      expect(w.m.state.runs).toEqual([]);
    }
  }, 120_000);

  // Falsifier: a capture whose Book 1 record is gone reaches the planner, or writes a plan.
  it("refuses with 'The Book 1 starting record is unavailable.' when nextBookIssuedSkills is null, and saves no plan", async () => {
    const base = book1Capture({ capture: async () => structuredClone(sources) });
    const w = world({ capture: async r => {
      const c = await base(r);
      return c.status === "captured" ? { ...c, sources: { ...c.sources, book1: undefined } as unknown as FrozenWorkbookSourcesV2 } : c;
    } });
    const plan = vi.fn(planNextBookFromSnapshot);
    expect(await prepareNextBook(w.claim(), w.deps(snapshotPlanner(plan)), CUTOFF))
      .toEqual({ status: "refused", reason: `planner-${BOOK1_RECORD_UNAVAILABLE}`, snapshotId: w.row().id });
    expect(plan).not.toHaveBeenCalled();
    expect(w.row().frozen).not.toBeNull();
    expect(w.row().plan).toBeNull();
    expect(w.m.state.runs).toEqual([]);
    expect(await snapshotPlanner(plan).plan({ ...structuredClone({ snapshot: w.row().frozen!.snapshot, history: w.row().frozen!.history }), frozen: frozenView(w.row())! }))
      .toEqual({ ok: false, reason: BOOK1_RECORD_UNAVAILABLE });
  }, 120_000);

  // Falsifier: a Book 1 record made on an older curriculum plans on today's, or its refusal loses the frozen chain.
  it("a Book 1 record made on an older curriculum: the planner refuses, the chain stays frozen with no plan and no run, and plans once it is accepted", async () => {
    const recorded = baseline.planning.placement.curriculum.version;
    expect(baseline.curriculum.version).toBe(recorded);
    try {
      cv.newer = "f".repeat(64);
      // What the refusal compares: today's digest of the curriculum data against the digest the Book 1 record keeps.
      expect(book2Planning(baseline, { prepareOnly: true })).toEqual({ ok: false, reason: "curriculum-version-changed" });
      const w = world();
      const outcome = await prepareNextBook(w.claim(), w.deps(), CUTOFF);
      // planNextBookFromSnapshot reports book2Planning's refusal in its own words.
      expect(outcome).toEqual({ status: "refused", reason: "planner-The Book 1 starting plan is unavailable.", snapshotId: w.row().id });
      expect(w.row().frozen).not.toBeNull();
      expect(w.row().plan).toBeNull();
      expect(w.m.state.runs).toEqual([]);
      // The chain is still due (revision 1, no run): the next step run retries it. With a planner that accepts it, it plans.
      expect(await memoryNextBookDue(w.m.state).page({ size: 20, after: null, parents: null })).toMatchObject({ items: [{ kind: "chain", id: w.row().id }] });
      cv.newer = null;
      expect((await prepareNextBook({ kind: "snapshot", snapshotId: w.row().id }, w.deps(), CUTOFF + MIN)).status).toBe("queued");
      expect(w.row().frozen!.frozenAt).toBe(CUTOFF);
    } finally { cv.newer = null; }
  }, 120_000);

  // Falsifier (review P2-2): a first scored mark after the cutoff makes the capture unavailable
  // (history-unproved-past-state), or enters the ledger, or leaves the frozen sources.
  it("a first scored mark after the cutoff is left out of the history and the ledger, kept in the sources, and held by the planner", async () => {
    const b = structuredClone(sourceBook);
    const row = mark(b, fresh, "right", new Date(CUTOFF + 1000).toISOString());
    const late = frozenOf(b, record);
    const key = keyOf(fresh);
    const request = { snapshotId: "00000000-0000-4000-8500-000000000099", parentId: PARENT, childId: CHILD, workbookId: bookId,
      printedRevision: revision, scope: "day7" as const, cutoff: CUTOFF };
    const captured = captureNextBookEvidence(request, late);
    if (captured.status !== "captured") throw Error(JSON.stringify(captured));
    expect(captured.sources.books[0].items.some(m => m.id === row.id)).toBe(true);
    expect(captured.fence.books[0].counts.items).toBe(b.items.length - 1);
    // The real planner on the same sources plans, and holds the mark "after cutoff".
    const planned = planNextBookFromSnapshot({ sources: late, snapshot: { id: request.snapshotId, workbookId: bookId, cutoff: CUTOFF, scope: "day7",
      issuedSkills: nextBookIssuedSkills(late)! } });
    if (!planned.ok) throw Error(planned.reason);
    expect(planned.held).toEqual(expect.arrayContaining([expect.objectContaining({ key, reason: "after cutoff" })]));
    // Through the whole flow: queued, the late mark outside the ledger and outside consumed.
    const w = world({ capture: book1Capture({ capture: async () => structuredClone(late) }) });
    expect(await prepareNextBook(w.claim(), w.deps(), CUTOFF)).toMatchObject({ status: "queued" });
    const { plan, frozen } = planOf(w.row());
    expect(frozen.ledger.some(l => l.key === key)).toBe(false);
    expect(plan.consumed.some(c => c.key === key)).toBe(false);
    expect(plan.held).toEqual(expect.arrayContaining([expect.objectContaining({ key, reason: "after cutoff" })]));
  }, 120_000);

  // Falsifier: the callers still see no planner, or their paths stop before the planner.
  it("nextBookWiring is ready, and the cron step and the admin button both reach the planner", async () => {
    const planner = nextBookPlanner();
    expect(planner).not.toBeNull();
    expect(nextBookWiring()).toEqual({ planner: expect.objectContaining({ plan: expect.any(Function) }) });
    expect(nextBookWiring(null)).toBeNull();

    const step = world(), s = recording();
    step.claim();
    const result = await runNextBookStep({ release: { mode: "test-only", testParents: [PARENT] }, planner: s.planner,
      prepare: p => (trigger, now) => prepareNextBook(trigger, step.deps(p), now), reader: memoryNextBookDue(step.m.state),
      testAccount: async () => true, realFamilies: false, openPlan: async () => false, time: { now: () => CUTOFF, endAt: CUTOFF + 55_000 } });
    expect(result).toMatchObject({ status: "ran", due: 1, prepared: 1, outcomes: { queued: 1 } });
    expect(s.seen.map(x => x.scope)).toEqual(["day7"]);

    const admin = world(), a = recording();
    const answer = await prepareFromSnapshot(ADMIN, CHILD, { planner: a.planner, prepare: p => (trigger, now) => prepareNextBook(trigger, admin.deps(p), now),
      realFamilies: false, family: async () => ({ parentId: PARENT, deleting: false, testFamily: true, deliveredBook1: bookId, zone: "America/Vancouver" }),
      now: () => CUTOFF });
    expect(answer).toEqual({ ok: true, line: "Next book queued." });
    expect(a.seen.map(x => x.scope)).toEqual(["backstop"]);
  }, 240_000);
});
