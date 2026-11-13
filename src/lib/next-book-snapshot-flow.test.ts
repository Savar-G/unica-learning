import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Json } from "./database";
import type { Observation } from "./scan-observation";
import type { PlanInput, WorkbookPlan } from "./workbook-plan";
import type { FrozenWorkbookSourcesV2 } from "./workbook-progress-source";
import { readWorkbookProgressHistory } from "./workbook-progress-history";
import { historyFixture, historyId, historyTime } from "./workbook-progress-history.fixture";
import { sourceHash } from "./workbook-progress-hash";
import { itemKey, newEvidenceSince, nextBookRunPlan, prepareNextBook, readNextBookSnapshot, refreshNextBookSnapshot, type NextBookCapture, type NextBookDeps,
  type NextBookPlanner, type PrepareOutcome } from "./next-book-snapshot";
import { memoryNextBookSnapshots } from "./next-book-snapshot-memory";
import { snapshotRecord } from "./next-book-snapshot-store";

// #476 through the public interfaces: a memory store with the SQL's refusals, the real history reader on synthetic
// retained records (no customer data), and a fake planner. Each case names what would disprove it.

const PARENT = historyId(1), CHILD = historyId(2), BOOK = historyId(3), REV = "a".repeat(28);
const ADMIN = { id: historyId(90), email: "admin@example.invalid" };
const T0 = historyTime("2026-11-07T12:00:00.000Z");
const MIN = 60_000;
const json = (v: unknown): Json => JSON.parse(JSON.stringify(v));

function world(total = 10, right = 8) {
  const f = historyFixture(total, right);
  const clock = { now: T0 };
  const m = memoryNextBookSnapshots(() => clock.now);
  m.state.books.push({ id: BOOK, parentId: PARENT, childId: CHILD, number: 1, status: "shipped", printedRevision: REV });
  m.state.deliveries.add(BOOK);
  m.state.admins.add(ADMIN.id);
  for (let i = 1; i <= 3; i++) {
    m.state.receipts.push({ id: `receipt-${i}`, workbookId: BOOK, printedRevision: REV, photoRevision: `photo-${i}`, acceptedAt: T0 - (4 - i) * MIN });
    m.state.jobs.set(`photo-${i}`, "finished");
  }
  const day = (pageId: string) => f.input.books[0].pages.find(p => p.pageId === pageId)!.day;
  /** The store's current marked results of the source book, read again from the retained records. */
  const syncMarks = () => {
    m.state.marks = f.marks.filter(r => r.workbook_id === BOOK && !["pending", "parent-pending"].includes((r.observation as unknown as Observation).state))
      .map(r => ({ workbookId: BOOK, key: itemKey({ workbookId: BOOK, printedRevision: REV, pageId: r.page_id, itemId: r.item_id }),
        version: r.result_version, day: day(r.page_id), pageId: r.page_id }));
  };
  syncMarks();
  const claim = (reason: "day7_scanned" | "delivery_backstop" = "day7_scanned", at = T0) => {
    m.state.claims.push({ id: `claim-${BOOK}`, workbookId: BOOK, parentId: PARENT, childId: CHILD, number: 1, printedRevision: REV, reason,
      claimedAt: at, receiptIds: ["receipt-1", "receipt-2", "receipt-3"], deliveryAuditId: 7 });
    return { kind: "claim" as const, triggerId: `claim-${BOOK}` };
  };
  const extra = f.marks.slice(total).map(r => (r.expected as unknown as { identity: (typeof f.input.sample)[number] }).identity);
  const sources = { version: 2, parentId: PARENT, childId: CHILD, markingRevision: 50, profileReferences: [], assessmentReferences: [], book1: null,
    books: [{ book: { id: BOOK, print_manifest: f.input.books[0].manifest } }] } as unknown as FrozenWorkbookSourcesV2;
  let captures = 0;
  /** Day 7: current-book Days 1-7. Backstop and refresh: every day, the Day 8-10 items joining the sample. */
  const capture: NextBookCapture = async r => {
    captures++;
    const input = structuredClone(f.input);
    input.snapshot.id = r.snapshotId; input.snapshot.cutoff = r.cutoff;
    input.proof.corrections = { reference: "synthetic-complete-empty-corrections", completeThrough: r.cutoff, rows: [] };
    if (r.scope !== "day7") {
      input.snapshot.scope = input.snapshot.scope.map(s => s.workbookId === BOOK ? { ...s, days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } : s);
      input.selection = { kind: r.scope, reference: `snapshot:${r.snapshotId}` };
      input.sample = [...input.sample, ...extra];
    }
    const read = await readWorkbookProgressHistory(f.store, input);
    if (!read.ok) return { status: "unavailable", reason: read.reason };
    return { status: "captured", sources, fence: f.fence(), snapshot: read.snapshot, history: read.history, held: read.held };
  };
  const calls: Parameters<NextBookPlanner["plan"]>[0][] = [];
  /** Consumes the whole ledger, holds what the snapshot held. Override `pick` to misbehave. */
  const planner = (pick?: (frozen: Parameters<NextBookPlanner["plan"]>[0]["frozen"]) => { key: string; version: number }[]): NextBookPlanner => ({
    async plan(input) {
      calls.push(input);
      const consumed = pick ? pick(input.frozen) : input.frozen.evidence.map(({ key, version }) => ({ key, version }));
      return { ok: true, consumed, held: input.frozen.heldForLater.map(h => ({ key: h.key, reason: h.reason })), planHash: sourceHash(consumed),
        planningInput: { workbook: { number: 2 } } as unknown as PlanInput, plan: { days: [] } as unknown as WorkbookPlan };
    },
  });
  const deps = (p = planner()): NextBookDeps => ({ store: m.store, capture, planner: p, run: { maxAttempts: 2, staleSeconds: 360 } });
  return { f, m, clock, claim, deps, planner, calls, syncMarks, captures: () => captures,
    rows: () => m.state.snapshots.filter(s => s.workbookId === BOOK) };
}
function queued(o: PrepareOutcome) {
  if (o.status !== "queued") throw Error(JSON.stringify(o));
  return o;
}

describe("prepareNextBook", () => {
  // Falsifier: a captured job holds the freeze past 30 minutes, the freeze happens while a job still runs, or more than one run starts.
  it("waits for the captured marking jobs, freezes when they settle, plans and queues one run", async () => {
    const w = world(), trigger = w.claim();
    w.m.state.jobs.set("photo-3", "waiting");
    w.clock.now = T0 + MIN;
    expect(await prepareNextBook(trigger, w.deps(), w.clock.now)).toEqual({ status: "waiting", snapshotId: w.rows()[0].id, until: T0 + 30 * MIN });
    expect(w.rows()[0]).toMatchObject({ reason: "day7_scanned", triggerAt: T0, revision: 1, frozen: null, runId: null, receiptIds: ["receipt-1", "receipt-2", "receipt-3"] });
    expect(w.captures()).toBe(0);
    w.m.state.jobs.set("photo-3", "finished");
    w.clock.now = T0 + 2 * MIN;
    const done = queued(await prepareNextBook(trigger, w.deps(), w.clock.now));
    const row = w.rows()[0];
    expect(row.frozen!.frozenAt).toBe(T0 + 2 * MIN);
    expect(row.frozen!.snapshot.cutoff).toBe(T0 + 2 * MIN);
    expect(row.frozen!.scope).toMatchObject({ kind: "day7", days: [1, 2, 3, 4, 5, 6, 7], heldDays: [8, 9, 10], jobs: { captured: 3, waiting: 0, deadlineReached: false } });
    expect(row.frozen!.ledger).toHaveLength(10);
    expect(row.plan!.consumed).toHaveLength(10);
    expect(w.m.state.runs).toEqual([expect.objectContaining({ id: done.runId, childId: CHILD, number: 2, snapshotId: row.id, status: "queued" })]);
    expect(row.runId).toBe(done.runId);
    expect(w.calls).toHaveLength(1);
    const read = await readNextBookSnapshot(w.m.store, row.id);
    expect(read).toMatchObject({ ok: true, planInput: { workbook: { number: 2 } }, runId: done.runId, snapshot: { reason: "day7_scanned", sourceWorkbookId: BOOK, sourcePrintedRevision: REV } });
  });

  // Falsifier (#812): the run uses a plan made on another curriculum version, or a plan that never recorded one.
  it("gives the run its saved plan only on the curriculum version the plan was made on", async () => {
    const TODAY = "1".repeat(28), LATER = "2".repeat(28);
    const w = world(), base = w.planner();
    const recorded = (curriculum?: PlanInput["curriculum"]): NextBookPlanner => ({
      async plan(input) {
        const a = await base.plan(input);
        return a.ok ? { ...a, planningInput: { ...a.planningInput, ...(curriculum ? { curriculum } : {}) } } : a;
      },
    });
    expect(await nextBookRunPlan(w.m.store, historyId(77), () => TODAY)).toEqual({ ok: false, reason: "not-found" });
    queued(await prepareNextBook(w.claim(), w.deps(recorded({ key: "bc", version: TODAY })), T0 + MIN));
    const row = w.rows()[0];
    expect(await nextBookRunPlan(w.m.store, row.id, key => key === "bc" ? TODAY : null))
      .toEqual({ ok: true, snapshotId: row.id, planHash: row.plan!.planHash, planInput: { workbook: { number: 2 }, curriculum: { key: "bc", version: TODAY } } });
    expect(await nextBookRunPlan(w.m.store, row.id, () => LATER)).toEqual({ ok: false, reason: "curriculum-changed" });
    expect(await nextBookRunPlan(w.m.store, row.id, () => null)).toEqual({ ok: false, reason: "curriculum-changed" });

    const old = world();
    queued(await prepareNextBook(old.claim(), old.deps(recorded()), T0 + MIN));
    expect(await nextBookRunPlan(old.m.store, old.rows()[0].id, () => TODAY)).toEqual({ ok: false, reason: "curriculum-unrecorded" });

    const unplanned = world();
    unplanned.m.state.jobs.set("photo-3", "waiting");
    expect((await prepareNextBook(unplanned.claim(), unplanned.deps(), T0 + MIN)).status).toBe("waiting");
    expect(await nextBookRunPlan(unplanned.m.store, unplanned.rows()[0].id, () => TODAY)).toEqual({ ok: false, reason: "not-frozen" });
  });

  it("freezes at the 30-minute deadline with a job still blocked, and labels the wait", async () => {
    const w = world(), trigger = w.claim();
    w.m.state.jobs.set("photo-2", "waiting");
    w.clock.now = T0 + 30 * MIN - 1;
    expect((await prepareNextBook(trigger, w.deps(), w.clock.now)).status).toBe("waiting");
    w.clock.now = T0 + 30 * MIN;
    queued(await prepareNextBook(trigger, w.deps(), w.clock.now));
    expect(w.rows()[0].frozen!.scope.jobs).toEqual({ captured: 3, waiting: 1, deadlineReached: true });
  });

  // Falsifier: gaps in Days 1-6 block the snapshot, or an unscanned item becomes wrong or blank.
  it("freezes a Day 7 trigger with gaps in Days 1-6 and keeps the gaps as missing", async () => {
    const w = world();
    for (const n of [3, 2]) {
      const row = w.f.marks[n];
      w.f.marks.splice(n, 1);
      w.f.events.splice(w.f.events.findIndex(e => e.id === row.event_id), 1);
    }
    w.syncMarks();
    queued(await prepareNextBook(w.claim(), w.deps(), T0 + MIN));
    const frozen = w.rows()[0].frozen!;
    expect(frozen.pending.map(p => [p.reason, p.day, JSON.parse(p.key)[3]])).toEqual([["missing", 1, "item-2"], ["missing", 1, "item-3"]]);
    expect(frozen.ledger).toHaveLength(8);
    expect(frozen.ledger.some(l => l.key.includes("item-2"))).toBe(false);
  });

  // Falsifier: an early Day 8-10 result enters a Day 7 draft, or the planner may consume it.
  it("holds early Days 8-10 for later and refuses a planner that consumes them", async () => {
    const w = world();
    const greedy = w.planner(frozen => [...frozen.evidence, ...frozen.heldForLater].map(({ key, version }) => ({ key, version })));
    const refused = await prepareNextBook(w.claim(), w.deps(greedy), T0 + MIN);
    expect(refused).toEqual({ status: "refused", reason: "consumed-outside-ledger", snapshotId: w.rows()[0].id });
    const frozen = w.rows()[0].frozen!;
    expect(frozen.held.map(h => [h.reason, h.day])).toEqual(expect.arrayContaining([["outside-days", 8], ["outside-days", 9], ["outside-days", 10]]));
    expect(frozen.ledger.every(l => l.day <= 7)).toBe(true);
    expect(w.rows()[0].plan).toBeNull();
    expect(w.m.state.runs).toHaveLength(0);
    // The store refuses it too, independent of the consumer's check.
    const held = frozen.held[0];
    expect(await w.m.store.savePlan(w.rows()[0].id, { planHash: "0".repeat(64), planInput: {} as PlanInput, consumed: [{ key: held.key, version: held.version }], held: [] }))
      .toEqual({ status: "refused", reason: "consumed-outside-ledger" });
  });

  // Falsifier: a mark that arrives after the freeze changes the frozen draft, or is lost to later planning.
  it("keeps a late result out of the frozen snapshot and reports it in newEvidenceSince", async () => {
    const w = world(), trigger = w.claim("delivery_backstop");
    const done = queued(await prepareNextBook(trigger, w.deps(), T0 + MIN));
    const id = w.rows()[0].id, before = structuredClone(w.rows()[0]);
    expect(before.frozen!.scope).toMatchObject({ kind: "backstop", heldDays: [] });
    expect(await newEvidenceSince(w.m.store, id)).toEqual({ ok: true, days: [], pages: 0, items: 0 });
    w.f.parentChange(0, "wrong", "2026-11-07T13:00:00.000Z");
    w.syncMarks();
    expect(await newEvidenceSince(w.m.store, id)).toEqual({ ok: true, days: [1], pages: 1, items: 1 });
    expect(w.rows()[0]).toEqual(before);
    expect(queued(await prepareNextBook(trigger, w.deps(), T0 + 90 * MIN)).runId).toBe(done.runId);
  });

  // Falsifier: a refresh counts an item twice, starts a second run, or writes over revision 1.
  it("refreshes to revision 2 with the new marks and no double count", async () => {
    const w = world();
    const done = queued(await prepareNextBook(w.claim(), w.deps(), T0 + MIN));
    w.m.finishRun(done.runId, "draft-2");
    const first = w.rows()[0];
    expect(await newEvidenceSince(w.m.store, first.id)).toEqual({ ok: true, days: [8, 9, 10], pages: 3, items: 3 });
    w.clock.now = T0 + 3 * 24 * 60 * MIN;
    const refreshed = await refreshNextBookSnapshot("draft-2", ADMIN, w.deps(), w.clock.now);
    if (!refreshed.ok) throw Error(refreshed.reason);
    expect(refreshed).toMatchObject({ revision: 2, newSnapshot: { cutoff: w.clock.now } });
    const second = w.rows().find(r => r.revision === 2)!;
    expect(second).toMatchObject({ draftId: "draft-2", triggerId: first.triggerId, reason: "day7_scanned", actor: ADMIN });
    expect(second.frozen!.scope.kind).toBe("refresh");
    const keys = second.frozen!.ledger.map(l => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(13);
    for (const l of first.frozen!.ledger) expect(second.frozen!.ledger).toContainEqual(l);
    expect(second.frozen!.held.filter(h => h.reason === "outside-days")).toEqual([]);
    expect(await newEvidenceSince(w.m.store, second.id)).toEqual({ ok: true, days: [], pages: 0, items: 0 });
    expect(await prepareNextBook({ kind: "snapshot", snapshotId: second.id }, w.deps(), w.clock.now))
      .toEqual({ status: "planned", snapshotId: second.id, revision: 2, admission: "refresh" });
    expect(w.m.state.runs).toHaveLength(1);
    expect(w.rows()[0]).toEqual(first);
    expect(w.m.state.audit.filter(a => a.action === "snapshot-retaken")).toHaveLength(1);
    expect(await refreshNextBookSnapshot("draft-2", ADMIN, w.deps(), w.clock.now)).toEqual({ ok: false, reason: "no-new-evidence" });
  });

  // Falsifier: a draft approved for print is re-planned, before or during a refresh.
  it("refuses a refresh after approval for print", async () => {
    const w = world();
    const done = queued(await prepareNextBook(w.claim(), w.deps(), T0 + MIN));
    w.m.finishRun(done.runId, "draft-2");
    w.m.approve("draft-2");
    expect(await refreshNextBookSnapshot("draft-2", ADMIN, w.deps(), T0 + 2 * MIN)).toEqual({ ok: false, reason: "already-approved" });
    expect(w.rows()).toHaveLength(1);
    // A retake that won just before the approval cannot freeze after it.
    const v = world();
    const run = queued(await prepareNextBook(v.claim(), v.deps(), T0 + MIN));
    v.m.finishRun(run.runId, "draft-2");
    expect((await v.m.store.retake(v.rows()[0].id, "draft-2", ADMIN)).status).toBe("ok");
    v.m.approve("draft-2");
    expect(await refreshNextBookSnapshot("draft-2", ADMIN, v.deps(), T0 + 2 * MIN)).toEqual({ ok: false, reason: "already-approved" });
    expect(v.rows().find(r => r.revision === 2)!.frozen).toBeNull();
  });

  // Falsifier: a book with no accepted scans is advanced or repeated by plan (#628), or the hold is recorded twice.
  it("holds the chain and queues nothing when the backstop found no accepted scans", async () => {
    const w = world();
    w.m.state.receipts = [];
    w.m.state.holds.push({ workbookId: BOOK, deliveryAuditId: 7, printedRevision: REV, heldAt: T0, backstopAt: T0 - MIN });
    const trigger = { kind: "backstop-hold" as const, workbookId: BOOK, deliveryAuditId: 7 };
    const held = await prepareNextBook(trigger, w.deps(), T0 + MIN);
    expect(held).toEqual({ status: "held", snapshotId: w.rows()[0].id, reason: "no-accepted-scans-at-backstop" });
    expect(await prepareNextBook(trigger, w.deps(), T0 + 2 * MIN)).toEqual(held);
    expect(w.rows()).toEqual([expect.objectContaining({ revision: 1, triggerId: null, held: { reason: "no-accepted-scans-at-backstop", at: T0 }, frozen: null })]);
    expect(w.m.state.runs).toHaveLength(0);
    expect(w.calls).toHaveLength(0);
    expect(w.captures()).toBe(0);
    expect(await prepareNextBook({ kind: "admin", workbookId: BOOK, actor: ADMIN }, w.deps(), T0 + 3 * MIN)).toEqual({ status: "refused", reason: "no-accepted-scans" });
  });

  it("drafts from a backstop with some scans, over every accepted day", async () => {
    const w = world();
    queued(await prepareNextBook(w.claim("delivery_backstop"), w.deps(), T0 + MIN));
    const frozen = w.rows()[0].frozen!;
    expect(w.rows()[0].reason).toBe("delivery_backstop");
    expect(frozen.scope).toMatchObject({ kind: "backstop", request: "backstop", days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], heldDays: [] });
    expect(frozen.ledger.map(l => l.day)).toEqual(expect.arrayContaining([8, 9, 10]));
  });

  // Falsifier: a book 2 source makes a snapshot or a run before the later-book planner exists.
  it("answers unsupported-source-book for a book 2 source and queues nothing", async () => {
    const w = world();
    w.m.state.books[0].number = 2;
    const trigger = w.claim();
    expect(await prepareNextBook(trigger, w.deps(), T0 + MIN)).toEqual({ status: "unsupported-source-book" });
    expect(await prepareNextBook({ kind: "admin", workbookId: BOOK, actor: ADMIN }, w.deps(), T0 + MIN)).toEqual({ status: "unsupported-source-book" });
    expect(w.m.state.snapshots).toHaveLength(0);
    expect(w.m.state.runs).toHaveLength(0);
  });

  // Falsifier: the Day 7 consumer, the backstop scheduler and the admin action make two chains or two runs.
  it("gives one chain and one run to a concurrent Day 7 consumer, backstop scheduler and admin action", async () => {
    const w = world(), trigger = w.claim();
    const outcomes = await Promise.all([
      prepareNextBook(trigger, w.deps(), T0 + MIN),
      prepareNextBook({ kind: "admin", workbookId: BOOK, actor: ADMIN }, w.deps(), T0 + MIN),
      prepareNextBook(trigger, w.deps(), T0 + MIN),
    ]);
    expect(w.rows()).toHaveLength(1);
    expect(w.m.state.runs).toHaveLength(1);
    expect(outcomes.map(o => queued(o).runId)).toEqual(Array(3).fill(w.m.state.runs[0].id));
    expect(w.rows()[0].reason).toBe("day7_scanned");
    // Without a claim, the admin chain is the one chain: a later claim reaches it.
    const v = world();
    const [a, b] = await Promise.all([prepareNextBook({ kind: "admin", workbookId: BOOK, actor: ADMIN }, v.deps(), T0 + MIN),
      prepareNextBook({ kind: "admin", workbookId: BOOK, actor: ADMIN }, v.deps(), T0 + MIN)]);
    expect(queued(a).runId).toBe(queued(b).runId);
    expect(queued(await prepareNextBook(v.claim("delivery_backstop"), v.deps(), T0 + 2 * MIN)).runId).toBe(queued(a).runId);
    expect(v.rows()).toEqual([expect.objectContaining({ reason: "admin_prepare", triggerId: null, actor: ADMIN })]);
  });

  // Falsifier: a restart re-freezes with a later cutoff, re-plans, or starts another run.
  it("reuses the frozen snapshot, the plan and the run after a restart", async () => {
    const w = world(), trigger = w.claim();
    const failing: NextBookPlanner = { async plan() { return { ok: false, reason: "busy" }; } };
    expect(await prepareNextBook(trigger, w.deps(failing), T0 + MIN)).toMatchObject({ status: "refused", reason: "planner-busy" });
    const frozenAt = w.rows()[0].frozen!.frozenAt;
    const done = queued(await prepareNextBook(trigger, w.deps(), T0 + 20 * MIN));
    expect(w.rows()[0].frozen!.frozenAt).toBe(frozenAt);
    expect(w.captures()).toBe(1);
    const again = queued(await prepareNextBook(trigger, w.deps(w.planner()), T0 + 40 * MIN));
    expect(again.runId).toBe(done.runId);
    expect(w.calls).toHaveLength(1);
    expect(w.m.state.runs).toHaveLength(1);
    expect(await w.m.store.admit(w.rows()[0].id, null, { maxAttempts: 2, staleSeconds: 360 })).toEqual({ status: "started", runId: done.runId, existing: true });
  });

  // Falsifier: a pending item is consumed as blank or wrong, or disappears from later evidence.
  it("keeps pending items pending, out of the ledger, until a later mark resolves them", async () => {
    const w = world(), row = w.f.marks[8], o = row.observation as unknown as Observation;
    row.observation = json({ ...o, state: "pending", result: null, certainty: "uncertain", readAnswerText: null, regions: [], help: "unknown" });
    w.f.events.splice(w.f.events.findIndex(e => e.id === row.event_id), 1);
    row.original_event = null; row.event_id = null;
    w.syncMarks();
    const greedy = w.planner(frozen => frozen.pending.map(p => ({ key: p.key, version: 2 })));
    expect(await prepareNextBook(w.claim(), w.deps(greedy), T0 + MIN)).toMatchObject({ status: "refused", reason: "consumed-outside-ledger" });
    const frozen = w.rows()[0].frozen!;
    expect(frozen.pending).toEqual([expect.objectContaining({ reason: "pending", day: 1 })]);
    expect(JSON.parse(frozen.pending[0].key)[3]).toBe("item-8");
    expect(frozen.ledger.some(l => l.key === frozen.pending[0].key)).toBe(false);
    queued(await prepareNextBook({ kind: "snapshot", snapshotId: w.rows()[0].id }, w.deps(), T0 + 2 * MIN));
    expect(w.rows()[0].frozen!.pending).toEqual(frozen.pending);
    w.f.parentChange(8, "right", "2026-11-07T14:00:00.000Z");
    w.syncMarks();
    expect(await newEvidenceSince(w.m.store, w.rows()[0].id)).toMatchObject({ ok: true, items: 4 });
  });

  // Falsifier (review P2-2): scans whose items are all still pending give an empty ledger, and a draft is queued anyway.
  it("holds a book whose scans have no final mark, and writes nothing", async () => {
    const w = world();
    for (const row of w.f.marks) {
      const o = row.observation as unknown as Observation;
      row.observation = json({ ...o, state: "pending", result: null, certainty: "uncertain", readAnswerText: null, regions: [], help: "unknown" });
      row.original_event = null; row.event_id = null;
    }
    w.f.events.length = 0;
    w.syncMarks();
    expect(w.m.state.marks).toEqual([]);
    const trigger = w.claim();
    expect(await prepareNextBook(trigger, w.deps(), T0 + MIN)).toEqual({ status: "held", snapshotId: w.rows()[0].id, reason: "no-marked-scans" });
    expect(w.rows()).toEqual([expect.objectContaining({ revision: 1, frozen: null, snapshotHash: null, plan: null, runId: null, held: null })]);
    expect(w.m.state.runs).toHaveLength(0);
    expect(w.calls).toHaveLength(0);
    // A later call, once a mark is final, drafts from the same chain.
    w.f.parentChange(0, "right", "2026-11-07T11:30:00.000Z");
    w.syncMarks();
    w.clock.now = T0 + 2 * MIN;
    queued(await prepareNextBook(trigger, w.deps(), w.clock.now));
    expect(w.rows()[0].frozen!.ledger).toHaveLength(1);
  });

  // Falsifier (review P2-3): a prepare_from finer than a millisecond, read back truncated, refuses the first refresh.
  it("accepts the first refresh when the database clock is finer than a millisecond", async () => {
    const row = snapshotRecord({ id: "s", trigger_id: null, trigger_reason: "admin_prepare", parent_id: PARENT, child_id: CHILD, workbook_id: BOOK,
      number: 1, printed_revision: REV, trigger_at: "2026-11-08T10:00:12.500717+00:00", prepare_from: "2026-11-08T10:00:12.500717+00:00",
      revision: 1, draft_id: null, receipt_ids: [], delivery_audit_id: null, held_reason: null, held_at: null, actor_id: ADMIN.id, actor_email: null,
      frozen_at: null, snapshot_hash: null, plan_hash: null, run_id: null, created_at: "2026-11-08T10:00:12.500717+00:00" });
    expect(row.prepareFrom).toBe(Date.parse("2026-11-08T10:00:12.500Z"));
    const w = world();
    const done = queued(await prepareNextBook(w.claim(), w.deps(), T0 + MIN));
    w.m.finishRun(done.runId, "draft-2");
    w.clock.now = T0 + 2 * 24 * 60 * MIN + 0.717;
    const refreshed = await refreshNextBookSnapshot("draft-2", ADMIN, w.deps(), Math.floor(w.clock.now));
    expect(refreshed).toMatchObject({ ok: true, revision: 2, newSnapshot: { cutoff: Math.floor(w.clock.now) } });
    expect(w.rows().find(r => r.revision === 2)!.prepareFrom).toBe(Math.floor(w.clock.now));
  });

  it("refuses the SQL's other cases in the store: a second run, a conflicting plan, a source change", async () => {
    const w = world();
    const done = queued(await prepareNextBook(w.claim(), w.deps(), T0 + MIN));
    const id = w.rows()[0].id, plan = w.rows()[0].plan!;
    expect(await w.m.store.savePlan(id, plan)).toMatchObject({ status: "ok" });
    expect(await w.m.store.savePlan(id, { ...plan, planHash: "f".repeat(64) })).toEqual({ status: "refused", reason: "plan-conflict" });
    expect(await w.m.store.admit(id, null, { maxAttempts: 2, staleSeconds: 360 })).toEqual({ status: "started", runId: done.runId, existing: true });
    w.m.finishRun(done.runId, "draft-2");
    w.m.state.books[0].printedRevision = "b".repeat(28);
    expect(await w.m.store.retake(id, "draft-2", ADMIN)).toEqual({ status: "refused", reason: "source-changed" });
    expect(await refreshNextBookSnapshot("draft-2", ADMIN, w.deps(), T0 + 2 * MIN)).toEqual({ ok: false, reason: "source-changed" });
  });
});
