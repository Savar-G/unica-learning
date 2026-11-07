import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ACTOR, BASELINE, CHILD, PARENT, baselineOf, id, jobBook } from "./workbook-book1.fixture";
import { book1BaselineRepository, book1SourceReader, captureBook1Baseline, secondTryLedger, type Book1BaselineSql, type Book1CaptureDeps } from "./workbook-book1-store";
import type { Book1BaselineRecord } from "./workbook-book1-baseline";

// The capture order and the SQL transport contract, with an in-memory stand-in for the three service functions.
let made: Awaited<ReturnType<typeof jobBook>>;
beforeAll(async () => { made = await jobBook(); }, 120_000);

function memorySql() {
  const rows = new Map<string, { scope: string; payload: string; hash: string }>();
  const calls: { fn: string; args: unknown }[] = [];
  const sql: Book1BaselineSql = {
    async command(a) {
      calls.push({ fn: "command", args: a });
      const scope = JSON.stringify([a.p_parent, a.p_child, a.p_run, a.p_draft]);
      const found = [...rows.entries()].find(([, r]) => r.scope === scope);
      if (a.p_action === "read") return found ? { status: "found", id: found[0], payload: found[1].payload, hash: found[1].hash, boundary_at: "2026-11-08T00:00:00.000Z",
        initial_activity: { items: 0, changes: 0, events: 0, receipts: 0, secondTries: 0 } } : { status: "missing" };
      const same = rows.get(a.p_request);
      if (same) return { status: same.payload === a.p_payload ? "duplicate" : "conflict" };
      if (found) return { status: "conflict" };
      rows.set(a.p_request, { scope, payload: a.p_payload!, hash: a.p_hash! });
      return { status: "saved" };
    },
    async sources(a) { calls.push({ fn: "sources", args: a }); return { status: "missing" }; },
    async secondTry(a) { calls.push({ fn: "secondTry", args: a }); return { status: "saved" }; },
  };
  return { sql, rows, calls };
}
function deps(sql: Book1BaselineSql, o: { revision?: number; frame?: typeof made.frame } = {}): Book1CaptureDeps {
  return {
    draft: async run => (run === made.runId ? { ...structuredClone(made.final), revision: o.revision ?? made.final.revision } : null),
    frame: async run => (run === made.runId ? { reference: `workbook_run_frames:${made.runId}`, createdAt: "2026-11-04T18:00:00.000Z", frame: structuredClone(o.frame ?? made.frame) } : null),
    repository: book1BaselineRepository(sql),
  };
}
const capture = { id: BASELINE, actorId: ACTOR, parentId: PARENT, childId: CHILD, runId: "", revision: 2 };

describe("captureBook1Baseline", () => {
  it("saves once, reads back the exact record, and a retry is a duplicate", async () => {
    const m = memorySql(), o = { ...capture, runId: made.runId };
    const first = await captureBook1Baseline(deps(m.sql), o);
    expect(first).toMatchObject({ status: "saved", baseline: { id: BASELINE } });
    expect(first.status !== "refused" && first.baseline.record).toEqual(baselineOf(made).record);
    expect((await captureBook1Baseline(deps(m.sql), o)).status).toBe("duplicate");
    expect(m.rows.size).toBe(1);
    expect(m.calls.every(c => c.fn === "command")).toBe(true);
  });
  it("refuses a revision the admin did not review, a missing frame and a legacy frame without recovery", async () => {
    const m = memorySql(), o = { ...capture, runId: made.runId };
    expect(await captureBook1Baseline(deps(m.sql, { revision: 3 }), o)).toEqual({ status: "refused", reason: "revision-changed" });
    expect(await captureBook1Baseline(deps(m.sql), { ...o, runId: id(0x555) })).toEqual({ status: "refused", reason: "draft-not-found" });
    const legacy = structuredClone(made.frame); delete legacy.planning;
    expect(await captureBook1Baseline(deps(m.sql, { frame: legacy }), o)).toEqual({ status: "refused", reason: "planning-recovery-unavailable" });
    const recovery = { sources: async () => null, engine: async () => null };
    expect(await captureBook1Baseline({ ...deps(m.sql, { frame: legacy }), recovery }, o)).toEqual({ status: "refused", reason: "planning-recovery-sources-missing" });
    expect(m.rows.size).toBe(0);
  });
  it("a frame other than the one approval reads is refused", async () => {
    const m = memorySql(), frame = structuredClone(made.frame);
    frame.units = { ...frame.units, extra: "9.9" };
    expect(await captureBook1Baseline(deps(m.sql, { frame }), { ...capture, runId: made.runId })).toEqual({ status: "refused", reason: "frame-mismatch" });
  });
});

describe("SQL transport contract", () => {
  it("sends exact named arguments and refuses a record for another scope before any call", async () => {
    const m = memorySql(), repo = book1BaselineRepository(m.sql), { record } = baselineOf(made);
    const scope = { parentId: PARENT, childId: CHILD, runId: made.runId, draftId: made.final.draftId };
    expect(await repo.save(ACTOR, { ...scope, childId: id(0xc9) }, BASELINE, record)).toBe("conflict");
    expect(await repo.save(ACTOR, scope, BASELINE, { ...record, hash: "0".repeat(64) } as Book1BaselineRecord)).toBe("conflict");
    expect(m.calls).toHaveLength(0);
    expect(await repo.save(ACTOR, scope, BASELINE, record)).toBe("saved");
    expect(m.calls[0].args).toEqual({ p_action: "save", p_actor: ACTOR, p_parent: PARENT, p_child: CHILD, p_run: made.runId, p_draft: made.final.draftId,
      p_request: BASELINE, p_payload: record.payload, p_hash: record.hash });
  });
  it("passes a refusal reason through and throws on an unknown answer", async () => {
    const { record } = baselineOf(made), scope = { parentId: PARENT, childId: CHILD, runId: made.runId, draftId: made.final.draftId };
    const refused = book1BaselineRepository({ ...memorySql().sql, command: async () => ({ status: "refused", reason: "activity-before-boundary" }) });
    expect(await refused.save(ACTOR, scope, BASELINE, record)).toEqual({ refused: "activity-before-boundary" });
    const odd = book1BaselineRepository({ ...memorySql().sql, command: async () => ({ status: "maybe" }) });
    await expect(odd.save(ACTOR, scope, BASELINE, record)).rejects.toThrow("baseline-sql-answer");
    const forged = book1BaselineRepository({ ...memorySql().sql, command: async () => ({ status: "found", id: BASELINE, payload: record.payload, hash: "1".repeat(64),
      boundary_at: "2026-11-08T00:00:00.000Z", initial_activity: { items: 0, changes: 0, events: 0, receipts: 0, secondTries: 0 } }) });
    await expect(forged.read(ACTOR, scope)).rejects.toThrow("baseline-invalid-record");
  });
  it("reads the source answer strictly and the ledger seam refuses bad input without a call", async () => {
    const reader = book1SourceReader({ ...memorySql().sql, sources: async () => ({ status: "found", id: BASELINE, payload: "{}", hash: "x", boundary_at: "2026-11-08T00:00:00Z",
      initial_activity: { items: 0, changes: 0, events: 0, receipts: 0 }, count: 0, rows: [] }) });
    const request = { version: 1 as const, requestId: id(1), parentId: PARENT, childId: CHILD, workbookId: made.final.draftId, printedRevision: "a".repeat(28),
      selection: { unit: "1.1", skill: "1.1-count-to-20", step: 1 }, cutoff: 1, scope: "day7" as const };
    await expect(reader.read(request)).rejects.toThrow("book1-sources-answer");
    expect(await book1SourceReader(memorySql().sql).read(request)).toBeNull();
    const m = memorySql();
    expect(await secondTryLedger(m.sql).record({ id: "x", baselineId: BASELINE, itemRowId: id(2), basedOnVersion: 2, result: "right", help: "none", evidenceReference: "photo" })).toBe("refused");
    expect(await secondTryLedger(m.sql).record({ id: id(3), baselineId: BASELINE, itemRowId: id(2), basedOnVersion: 0, result: "right", help: "none", evidenceReference: "photo" })).toBe("refused");
    expect(m.calls).toHaveLength(0);
    expect(await secondTryLedger(m.sql).record({ id: id(3), baselineId: BASELINE, itemRowId: id(2), basedOnVersion: 2, result: "right", help: "none", evidenceReference: "photo" })).toBe("saved");
    expect(m.calls[0]).toEqual({ fn: "secondTry", args: { p_id: id(3), p_baseline: BASELINE, p_item_row: id(2), p_based_on_version: 2, p_result: "right", p_help: "none", p_evidence_reference: "photo" } });
  });
});
