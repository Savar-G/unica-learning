import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ACTOR, BASELINE, CHILD, PARENT, baselineOf, id, jobBook } from "./workbook-book1.fixture";
import { book1BaselineId, pendingReason, reconcileBook1Baselines, settleBook1Baseline, type Book1CaptureTarget, type Book1PendingStore, type Book1SiteDeps } from "./workbook-book1-capture";
import { book1BaselineRepository, type Book1BaselineSql, type Book1CaptureDeps } from "./workbook-book1-store";
import { curriculumFor, type Curriculum } from "./workbook-curriculum";

// #870 The Book 1 baseline after approval and its repair, through the public interface, on a synthetic first book made
// by the real job. The in-memory database keeps what the SQL keeps: one baseline per (draft, revision), never replaced,
// and one pending row per (draft, revision), never replaced. Each case names what would disprove it.
let made: Awaited<ReturnType<typeof jobBook>>;
beforeAll(async () => { made = await jobBook(); }, 120_000);

type Row = { id: string; scope: string; runId: string; draftId: string; revision: number; payload: string; hash: string };
function memoryDb(o: { failSave?: "before" | "after-store" } = {}) {
  const baselines: Row[] = [], pending: { draftId: string; revision: number; reason: string }[] = [];
  const saves: string[] = [];
  let fail = o.failSave;
  const sql: Book1BaselineSql = {
    async command(a) {
      const scope = JSON.stringify([a.p_parent, a.p_child, a.p_run, a.p_draft]);
      const byId = baselines.find(r => r.id === a.p_request);
      if (byId && byId.scope !== scope) return { status: "conflict" };
      if (a.p_action === "read") return byId ? { status: "found", id: byId.id, payload: byId.payload, hash: byId.hash, boundary_at: "2026-11-08T00:00:00.000Z",
        initial_activity: { items: 0, changes: 0, events: 0, receipts: 0, secondTries: 0 } } : { status: "missing" };
      saves.push(a.p_request);
      if (fail === "before") { fail = undefined; throw Error("book1-sql-unavailable"); }
      if (byId) return { status: byId.payload === a.p_payload ? "duplicate" : "conflict" };
      const revision = (JSON.parse(a.p_payload!) as { draftRevision: number }).draftRevision;
      // unique (draft_id, draft_revision): another id for the same key is a conflict, as the SQL answers.
      if (baselines.some(r => r.draftId === a.p_draft && r.revision === revision)) return { status: "conflict" };
      baselines.push({ id: a.p_request, scope, runId: a.p_run, draftId: a.p_draft, revision, payload: a.p_payload!, hash: a.p_hash! });
      // The row is stored, then the answer is lost.
      if (fail === "after-store") { fail = undefined; throw Error("book1-sql-unavailable"); }
      return { status: "saved" };
    },
    async sources() { return { status: "missing" }; },
    async secondTry() { return { status: "refused" }; },
  };
  const approved: Book1CaptureTarget[] = [];
  // When each revision was last tried (a counter, not a clock): the due list puts the least recently tried first.
  const lastTried = new Map<string, number>();
  let tick = 0;
  const key = (t: { draftId: string; revision: number }) => `${t.draftId}:${t.revision}`;
  const store: Book1PendingStore = {
    async existing(draftId, revision) {
      const r = baselines.find(b => b.draftId === draftId && b.revision === revision);
      return r ? { id: r.id, runId: r.runId } : null;
    },
    async due(limit) {
      return approved.filter(t => !baselines.some(b => b.draftId === t.draftId && b.revision === t.revision)
        && !pending.some(p => p.draftId === t.draftId && p.revision === t.revision))
        .map((t, i) => ({ t, i, at: lastTried.get(key(t)) ?? -1 })).sort((a, b) => a.at - b.at || a.i - b.i).map(x => x.t).slice(0, limit);
    },
    async tried(t) { lastTried.set(key(t), ++tick); },
    async pending(t, reason) {
      if (baselines.some(b => b.draftId === t.draftId && b.revision === t.revision)) return "baseline";
      if (pending.some(p => p.draftId === t.draftId && p.revision === t.revision)) return "duplicate";
      pending.push({ draftId: t.draftId, revision: t.revision, reason });
      return "saved";
    },
  };
  return { sql, store, baselines, pending, saves, approved, lastTried };
}
/** The commit that planned the synthetic book, and the deploy's commit when the test does not say otherwise. */
const BUILD = "b".repeat(40);
function deps(sql: Book1BaselineSql, o: { legacy?: boolean; draftThrows?: boolean; curricula?: Book1CaptureDeps["curricula"]; build?: string | null } = {}): Book1SiteDeps {
  return {
    build: o.build === undefined ? BUILD : o.build,
    curricula: o.curricula,
    draft: async run => {
      if (o.draftThrows) throw Error("draft read failed");
      return run === made.runId ? structuredClone(made.final) : null;
    },
    frame: async run => {
      if (run !== made.runId) return null;
      const frame = structuredClone(made.frame);
      frame.versions.build = BUILD;
      if (o.legacy) delete frame.planning;
      return { reference: `workbook_run_frames:${made.runId}`, createdAt: "2026-11-04T18:00:00.000Z", frame };
    },
    repository: book1BaselineRepository(sql),
  };
}
const target = (): Book1CaptureTarget => ({ runId: made.runId, draftId: made.final.draftId, revision: made.final.revision, parentId: PARENT, childId: CHILD, actorId: ACTOR });

describe("book1BaselineId", () => {
  it("gives the same id for the same (draft, revision) and another for another revision", () => {
    // Wrong if: a retry gets a new id (a lost answer would then need a second row), or two revisions share one id.
    const a = book1BaselineId(id(7), 2);
    expect(book1BaselineId(id(7), 2)).toBe(a);
    expect(book1BaselineId(id(7).toUpperCase(), 2)).toBe(a);
    expect(book1BaselineId(id(7), 3)).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("names a frame with no planning capture plainly, and keeps every reason in the table's shape", () => {
    expect(pendingReason("planning-recovery-unavailable")).toBe("planning-capture-missing");
    expect(pendingReason("activity-before-boundary")).toBe("activity-before-boundary");
    expect(pendingReason("Bad reason!")).toMatch(/^[a-z0-9-]{1,80}$/);
    expect(pendingReason("!!!")).toBe("refused");
  });
});

describe("capture after approval, and the reconcile", () => {
  it("approval succeeds and the capture fails: the reconcile captures it", async () => {
    // Wrong if: the failed capture leaves a row or a pending mark, or the reconcile does not save the baseline.
    const db = memoryDb({ failSave: "before" });
    await expect(settleBook1Baseline(deps(db.sql), db.store, target(), { recordPending: false })).rejects.toThrow();
    expect(db.baselines).toHaveLength(0);
    expect(db.pending).toHaveLength(0);
    db.approved.push(target());
    expect(await reconcileBook1Baselines(deps(db.sql), db.store, { limit: 3 })).toEqual({ due: 1, saved: 1, existing: 0, pending: 0, retry: 0, failed: 0 });
    expect(db.baselines.map(b => [b.id, b.revision])).toEqual([[book1BaselineId(made.final.draftId, made.final.revision), made.final.revision]]);
    expect(await reconcileBook1Baselines(deps(db.sql), db.store, { limit: 3 })).toMatchObject({ due: 0 });
  });
  it("a lost answer stores nothing new: the stored baseline is returned", async () => {
    // Wrong if: the repair stores a second baseline for the same (draft, revision).
    const db = memoryDb({ failSave: "after-store" });
    await expect(settleBook1Baseline(deps(db.sql), db.store, target(), { recordPending: false })).rejects.toThrow();
    expect(db.baselines).toHaveLength(1);
    const again = await settleBook1Baseline(deps(db.sql), db.store, target(), { recordPending: true });
    expect(again).toMatchObject({ status: "existing", baseline: { id: db.baselines[0].id } });
    expect(db.baselines).toHaveLength(1);
    expect(db.pending).toHaveLength(0);
  });
  it("a repeated capture stores nothing new, also when it races the lookup", async () => {
    // Wrong if: a second call makes a second save that stores a row, or answers anything but the same baseline.
    const db = memoryDb();
    const first = await settleBook1Baseline(deps(db.sql), db.store, target(), { recordPending: false });
    expect(first.status).toBe("saved");
    const saves = db.saves.length;
    const second = await settleBook1Baseline(deps(db.sql), db.store, target(), { recordPending: false });
    expect(second.status).toBe("existing");
    expect(db.saves.length).toBe(saves);
    // A race: the lookup misses the row; the same id and the same payload are a duplicate of the same record.
    const blind = { ...db.store, existing: async () => null };
    const raced = await settleBook1Baseline(deps(db.sql), blind, target(), { recordPending: true });
    expect(raced).toMatchObject({ status: "duplicate" });
    expect(db.baselines).toHaveLength(1);
    expect(first.status !== "retry" && first.status !== "pending" && first.status !== "refused"
      && raced.status === "duplicate" && raced.baseline.record).toEqual(first.status === "saved" && first.baseline.record);
  });
  it("leaves an existing baseline unchanged and returns it, whatever its id", async () => {
    // Wrong if: the capture saves, replaces or marks pending a revision that a baseline (an exact recovery) already binds.
    const db = memoryDb();
    const t = target(), kept = baselineOf(made).record;
    expect(BASELINE).not.toBe(book1BaselineId(t.draftId, t.revision));
    db.baselines.push({ id: BASELINE, scope: JSON.stringify([PARENT, CHILD, made.runId, t.draftId]), runId: made.runId, draftId: t.draftId, revision: t.revision, ...kept });
    const before = structuredClone(db.baselines);
    const r = await settleBook1Baseline(deps(db.sql), db.store, t, { recordPending: true });
    expect(r).toMatchObject({ status: "existing", baseline: { id: BASELINE, record: kept } });
    expect(db.baselines).toEqual(before);
    expect(db.saves).toHaveLength(0);
    expect(db.pending).toHaveLength(0);
    // The reconcile does not list it at all.
    db.approved.push(t);
    expect(await reconcileBook1Baselines(deps(db.sql), db.store, { limit: 3 })).toEqual({ due: 0, saved: 0, existing: 0, pending: 0, retry: 0, failed: 0 });
    expect(db.baselines).toEqual(before);
    // A stored row that does not read back is never replaced: nothing is stored or marked.
    db.baselines[0] = { ...db.baselines[0], payload: "{\"kept\":true}" };
    await expect(settleBook1Baseline(deps(db.sql), db.store, t, { recordPending: true })).rejects.toThrow("baseline-invalid-record");
    expect(db.saves).toHaveLength(0);
    expect(db.pending).toHaveLength(0);
  });
  it("returns an existing readable baseline with no save", async () => {
    const db = memoryDb();
    await settleBook1Baseline(deps(db.sql), db.store, target(), { recordPending: false });
    const kept = structuredClone(db.baselines), saves = db.saves.length;
    const r = await settleBook1Baseline(deps(db.sql), db.store, target(), { recordPending: true });
    expect(r).toMatchObject({ status: "existing", baseline: { id: kept[0].id, record: { payload: kept[0].payload, hash: kept[0].hash } } });
    expect(db.baselines).toEqual(kept);
    expect(db.saves.length).toBe(saves);
  });
  it("a frame with no planning capture gets pending recovery once, and no baseline", async () => {
    // Wrong if: the step stores a baseline without a proof, records the revision twice, or tries it again every run.
    const db = memoryDb();
    db.approved.push(target());
    expect(await reconcileBook1Baselines(deps(db.sql, { legacy: true }), db.store, { limit: 3 })).toEqual({ due: 1, saved: 0, existing: 0, pending: 1, retry: 0, failed: 0 });
    expect(db.pending).toEqual([{ draftId: made.final.draftId, revision: made.final.revision, reason: "planning-capture-missing" }]);
    expect(db.baselines).toHaveLength(0);
    expect(await reconcileBook1Baselines(deps(db.sql, { legacy: true }), db.store, { limit: 3 })).toMatchObject({ due: 0, pending: 0 });
    expect(db.pending).toHaveLength(1);
    // At approval (recordPending off), the same frame records nothing.
    const fresh = memoryDb();
    expect(await settleBook1Baseline(deps(fresh.sql, { legacy: true }), fresh.store, target(), { recordPending: false }))
      .toEqual({ status: "refused", reason: "planning-recovery-unavailable" });
    expect(fresh.pending).toHaveLength(0);
  });
  it("one revision's failure never stops the others", async () => {
    // Wrong if: a throw on the first revision ends the step before the second is captured.
    const db = memoryDb();
    const other: Book1CaptureTarget = { ...target(), runId: id(0x777), draftId: id(0x778) };
    db.approved.push(other, target());
    const failing: Book1SiteDeps = { ...deps(db.sql), draft: async run => {
      if (run === other.runId) throw Error("draft read failed");
      return structuredClone(made.final);
    } };
    expect(await reconcileBook1Baselines(failing, db.store, { limit: 3 })).toEqual({ due: 2, saved: 1, existing: 0, pending: 0, retry: 0, failed: 1 });
    expect(db.baselines).toHaveLength(1);
  });
  it("starts no capture after its time", async () => {
    const db = memoryDb();
    db.approved.push(target());
    expect(await reconcileBook1Baselines(deps(db.sql), db.store, { limit: 3, inTime: () => false })).toMatchObject({ due: 1, saved: 0 });
    expect(db.saves).toHaveLength(0);
  });
});

describe("the curriculum the record copies (review on #885)", () => {
  /** Today's curriculum code with every step's "change" text marked, as an older build's data would differ. */
  const marked = (c: Curriculum): Curriculum => ({ ...c, skillSteps: id => c.skillSteps(id)?.map(st => ({ ...st, change: `PINNED ${st.change}` })) ?? null });
  it("a curriculum deploy between planning and approval refuses the hosted capture, and records a plain reason", async () => {
    // Wrong if: the site stores a record that labels today's skills with the frame's older version, or tries forever.
    const db = memoryDb();
    db.approved.push(target());
    const today = { version: () => "0".repeat(28), curriculum: curriculumFor };
    expect(await reconcileBook1Baselines(deps(db.sql, { curricula: today }), db.store, { limit: 3 })).toMatchObject({ due: 1, saved: 0, pending: 1 });
    expect(db.pending).toEqual([{ draftId: made.final.draftId, revision: made.final.revision, reason: "curriculum-version-changed" }]);
    expect(db.baselines).toHaveLength(0);
  });
  it("the pinned build's curriculum at the frame's version is copied exactly", async () => {
    // Wrong if: the record copies today's steps instead of the pinned build's, or refuses a version equal to the frame's.
    const db = memoryDb();
    const frozen = made.frame.versions.curriculum;
    const pinned = { version: () => frozen, curriculum: (k: string) => { const c = curriculumFor(k); return c && marked(c); } };
    const r = await settleBook1Baseline(deps(db.sql, { curricula: pinned }), db.store, target(), { recordPending: true });
    expect(r.status).toBe("saved");
    const payload = JSON.parse(db.baselines[0].payload) as { curriculum: { version: string; skills: { steps: { change: string }[] }[] } };
    expect(payload.curriculum.version).toBe(frozen);
    expect(payload.curriculum.skills.flatMap(x => x.steps).every(st => st.change.startsWith("PINNED "))).toBe(true);
  });
  it("a pinned build whose curriculum version is not the frame's is refused, and nothing is stored", async () => {
    const db = memoryDb();
    const other = { version: () => "f".repeat(28), curriculum: curriculumFor };
    expect(await settleBook1Baseline(deps(db.sql, { curricula: other }), db.store, target(), { recordPending: false }))
      .toEqual({ status: "refused", reason: "curriculum-version-changed" });
    expect(db.baselines).toHaveLength(0);
    expect(db.saves).toHaveLength(0);
  });
});

describe("the due list never stalls (review on #885)", () => {
  it("revisions that are tried again every run do not keep a later Book 1 from its turn", async () => {
    // Wrong if: three revisions that never settle hold the top of the list, so the later Book 1 is never captured.
    const db = memoryDb();
    const stuck = [1, 2, 3].map(n => ({ ...target(), runId: id(0x900 + n), draftId: id(0x910 + n) }));
    db.approved.push(...stuck, target());
    const failing: Book1SiteDeps = { ...deps(db.sql), draft: async run => {
      if (stuck.some(t => t.runId === run)) throw Error("draft read failed");
      return structuredClone(made.final);
    } };
    expect(await reconcileBook1Baselines(failing, db.store, { limit: 3 })).toMatchObject({ due: 3, saved: 0, failed: 3 });
    expect(await reconcileBook1Baselines(failing, db.store, { limit: 3 })).toMatchObject({ due: 3, saved: 1, failed: 2 });
    expect(db.baselines.map(b => b.draftId)).toEqual([made.final.draftId]);
    // Every stuck revision keeps its turn too.
    expect(stuck.every(t => db.lastTried.has(`${t.draftId}:${t.revision}`))).toBe(true);
  });
  it("a try that cannot be counted is one failure and stops nothing else", async () => {
    const db = memoryDb();
    const other: Book1CaptureTarget = { ...target(), runId: id(0x991), draftId: id(0x992) };
    db.approved.push(other, target());
    const store = { ...db.store, tried: async (t: Book1CaptureTarget) => { if (t.draftId === other.draftId) throw Error("note failed"); } };
    expect(await reconcileBook1Baselines(deps(db.sql), store, { limit: 3 })).toMatchObject({ due: 2, saved: 1, failed: 1 });
  });
});

describe("the site captures only on the build that planned the book (review round 2 on #885)", () => {
  it("the same build saves", async () => {
    // Wrong if: the site refuses a frame its own deploy planned.
    const db = memoryDb();
    expect((await settleBook1Baseline(deps(db.sql, { build: BUILD }), db.store, target(), { recordPending: true })).status).toBe("saved");
    expect(db.baselines).toHaveLength(1);
  });
  it("another build with the same curriculum version records pending and stores no baseline", async () => {
    // Wrong if: the site copies today's steps (shaped by code outside the version, such as watch-out.ts) into a record
    // labelled with the frame's version, or tries the revision again every run.
    const db = memoryDb();
    db.approved.push(target());
    const sameVersion = { version: () => made.frame.versions.curriculum, curriculum: curriculumFor };
    const other = deps(db.sql, { build: "c".repeat(40), curricula: sameVersion });
    expect(await reconcileBook1Baselines(other, db.store, { limit: 3 })).toMatchObject({ due: 1, saved: 0, pending: 1 });
    expect(db.pending).toEqual([{ draftId: made.final.draftId, revision: made.final.revision, reason: "planned-on-another-build" }]);
    expect(db.baselines).toHaveLength(0);
    expect(db.saves).toHaveLength(0);
  });
  it("a missing deploy commit refuses: nothing is stored or recorded, and a later run tries again", async () => {
    // Wrong if: a deploy with no commit saves a record, or marks the revision pending for good.
    const db = memoryDb();
    db.approved.push(target());
    expect(await settleBook1Baseline(deps(db.sql, { build: null }), db.store, target(), { recordPending: true }))
      .toEqual({ status: "retry", reason: "deploy-build-unknown" });
    expect(await reconcileBook1Baselines(deps(db.sql, { build: null }), db.store, { limit: 3 })).toMatchObject({ due: 1, saved: 0, pending: 0, retry: 1 });
    expect(db.baselines).toHaveLength(0);
    expect(db.pending).toHaveLength(0);
    expect(db.saves).toHaveLength(0);
  });
  it("a frame with no planning capture keeps its own reason on any build", async () => {
    const db = memoryDb();
    db.approved.push(target());
    await reconcileBook1Baselines(deps(db.sql, { legacy: true, build: "c".repeat(40) }), db.store, { limit: 3 });
    expect(db.pending.map(p => p.reason)).toEqual(["planning-capture-missing"]);
  });
});
