import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { BOUNDARY, CHILD, CUTOFF, MARKED, PARENT, approvedWorkbook, baselineOf, frozenOf, id, jobBook, mark, parentChange, printedItems, requestOf, secondTry, shippedBook } from "./workbook-book1.fixture";
import { book2Planning, createBook1Baseline, jsonHash, readBook1Baseline, type Book1Baseline, type Book1BaselineRecord } from "./workbook-book1-baseline";
import { evaluateBook1Preview, type Book1Complete, type Book1PreviewOutcome } from "./workbook-book1-preview";
import { readBook1Corrections, type SecondTryRow } from "./workbook-correction-journal";
import { createWorkbookPreviewRecord, createWorkbookPreviewRecordAny, replayWorkbookPreview, replayWorkbookPreviewAny } from "./workbook-preview-record";
import { evaluateWorkbookProgressSources, loadWorkbookProgressSources, type FrozenSourceBook } from "./workbook-progress-source";
import { expectedItems } from "./scan-observation";
import { previewSourceFixture, previewActor } from "./workbook-progress-source.fixture";

// #472 Book 1 baseline to book 2 preview, through the public interfaces, on a synthetic first book made by the real job.
// Each case names what would disprove it.

const SELECTION = { unit: "1.1", skill: "1.1-count-to-20", step: 1 };
const STEP2 = { unit: "1.1", skill: "1.1-count-to-20", step: 2 };
let made: Awaited<ReturnType<typeof jobBook>>;
let baseline: Book1Baseline, record: Book1BaselineRecord, pristine: FrozenSourceBook;
beforeAll(async () => {
  made = await jobBook();
  ({ baseline, record } = baselineOf(made));
  pristine = shippedBook(approvedWorkbook(made.final), made.runId, made.frame);
}, 120_000);

const fresh = () => structuredClone(pristine);
const selected = (b: FrozenSourceBook, s = SELECTION, days = [1, 2, 3, 4, 5, 6, 7]) => printedItems(b)
  .filter(e => e.mastery.eligible && e.teaching?.itemStep && e.teaching.itemStep.skill === s.skill && e.teaching.itemStep.step === s.step && days.includes(e.day));
/** Marks the selected Day 1-7 items: the first `right` right, the rest wrong; `skip` left unmarked. */
function marked(right: number, o: { skip?: number; s?: typeof SELECTION } = {}) {
  const b = fresh(), items = selected(b, o.s);
  items.slice(0, items.length - (o.skip ?? 0)).forEach((e, i) => mark(b, e, i < right ? "right" : "wrong"));
  return { b, items };
}
async function preview(b: FrozenSourceBook, tries: SecondTryRow[] = [], o: { s?: typeof SELECTION; scope?: "day7" | "later-book" | "backstop"; cutoff?: number; rec?: Book1BaselineRecord } = {}) {
  return evaluateBook1Preview(requestOf(b, o.s ?? SELECTION, o.scope, o.cutoff), frozenOf(b, o.rec ?? record, tries));
}
const complete = (r: Book1PreviewOutcome): Book1Complete => {
  if (r.availability !== "complete") throw Error(JSON.stringify(r.availability === "unavailable" || r.availability === "held" ? r.reasons : r));
  return r as Book1Complete;
};
const reason = (r: Book1PreviewOutcome) => (r.ok ? "complete" : r.reasons.join(","));

describe("Book 1 baseline capture", () => {
  it("binds the final revision before any workbook row and proves an empty starting mastery", () => {
    expect(baseline).toMatchObject({ number: 1, draftId: made.final.draftId, runId: made.runId, draftRevision: 2,
      priorMastery: { policy: "book1-empty-passed/1", passed: {} }, planning: { kind: "prospective-capture" } });
    expect(baseline.binding.printedRevision).toBe(approvedWorkbook(made.final).printedRevision);
    expect(baseline.planning.input).toEqual(JSON.parse(JSON.stringify(made.frame.planning!.input)));
    expect(baseline.planning.inputHash).toBe(jsonHash(made.frame.planning!.input));
    expect(baseline.initialIssues).toContainEqual({ kind: "initial-issue", selection: SELECTION });
    expect(readBook1Baseline(record)).toEqual(baseline);
  });
  it("makes no write: the final revision and frame are unchanged", () => {
    const before = structuredClone({ final: made.final, frame: made.frame });
    baselineOf(made);
    expect({ final: made.final, frame: made.frame }).toEqual(before);
  });
  it("refuses a tampered or re-encoded record", () => {
    expect(readBook1Baseline({ ...record, hash: "0".repeat(64) })).toBeNull();
    const changed = record.payload.replace('"draftRevision":2', '"draftRevision":3');
    expect(readBook1Baseline({ payload: changed, hash: record.hash })).toBeNull();
    const doc = JSON.parse(record.payload);
    doc.planning.input.passed = { [SELECTION.skill]: 1 };
    const payload = JSON.stringify(doc);
    expect(readBook1Baseline({ payload, hash: createHash("sha256").update(payload).digest("hex") })).toBeNull();
  });
  it("refuses a book that is not Book 1 and a capture that carries mastery", () => {
    const proof = baseline.planning;
    const second = structuredClone(made.final); second.draft.number = 2;
    expect(createBook1Baseline({ id: id(0xb2), parentId: PARENT, childId: CHILD, final: second, frame: made.frame, planning: proof })).toEqual({ ok: false, reason: "not-book1" });
    const frame = structuredClone(made.frame); frame.planning!.input.passed = { [SELECTION.skill]: 1 };
    expect(createBook1Baseline({ id: id(0xb2), parentId: PARENT, childId: CHILD, final: made.final, frame, planning: proof }).ok).toBe(false);
  });
  it("computes book 2 from the frozen Book 1 inputs without changing the original PlanInput", () => {
    const before = structuredClone(baseline.planning.input);
    const next = book2Planning(baseline);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.input.workbook).toEqual({ number: 2, inLevel: 1 });
    expect(next.input.passed).toEqual({});
    expect(next.input.reviews).toEqual([]);
    expect(baseline.planning.input).toEqual(before);
  });
});

describe("book 2 preview from the baseline", () => {
  it("advances at 90% or more of a complete sample and returns a real plan", async () => {
    const { b, items } = marked(0);
    const right = Math.ceil(items.length * 0.9);
    b.items = []; b.events = [];
    items.forEach((e, i) => mark(b, e, i < right ? "right" : "wrong"));
    const r = complete(await preview(b));
    expect(r.decision).toMatchObject({ status: "complete", action: "advance", target: { ...SELECTION, step: 2 }, priorRepeats: 0, repeatIncrement: 0 });
    expect(r.decision.score.percent).toBeGreaterThanOrEqual(90);
    expect(r.planningInput.workbook.number).toBe(2);
    expect(r.planningInput.passed[SELECTION.skill]).toBe(1);
    expect(r.plan.days.length).toBeGreaterThan(0);
    expect(r.baseline).toMatchObject({ id: baseline.id, draftRevision: 2, planningKind: "prospective-capture" });
  });
  it("repeats from 75 to under 90 with no phantom earlier repeat", async () => {
    const { b, items } = marked(0);
    b.items = []; b.events = [];
    const right = Math.ceil(items.length * 0.8);
    items.forEach((e, i) => mark(b, e, i < right ? "right" : "wrong"));
    const r = complete(await preview(b));
    expect(r.decision).toMatchObject({ action: "repeat-new-numbers", priorRepeats: 0, repeatIncrement: 1 });
    expect(r.planningInput.passed[SELECTION.skill] ?? 0).toBe(0);
  });
  it("retains an incomplete sample, and an unknown cause below 75 is not guessed", async () => {
    const incomplete = complete(await preview(marked(1000, { skip: 3 }).b));
    expect(incomplete.decision).toMatchObject({ status: "insufficient-evidence", action: "retain-unfinished" });
    const low = complete(await preview(marked(5).b));
    expect(low.decision).toMatchObject({ status: "complete", action: "retain-review", reason: "unknown-cause" });
  });
  it("a corrected wrong answer clears its miss but never raises the first score", async () => {
    const { b, items } = marked(Math.ceil(selected(fresh()).length * 0.8));
    const before = complete(await preview(b));
    const wrong = b.items.find(m => (m.observation as { result: string }).result === "wrong")!;
    const tries: SecondTryRow[] = [];
    secondTry(tries, b, wrong, "right", "2026-11-13T00:00:00.000Z");
    const after = complete(await preview(b, tries));
    expect(after.decision.score).toEqual(before.decision.score);
    expect(after.decision.misses.length).toBe(before.decision.misses.length - 1);
    expect(items.length).toBeGreaterThan(0);
  });
  it("a parent's mark change is an original adjudication: it changes the first score", async () => {
    const { b } = marked(Math.ceil(selected(fresh()).length * 0.8));
    const before = complete(await preview(b));
    parentChange(b, b.items.find(m => (m.observation as { result: string }).result === "wrong")!, "right", "2026-11-13T00:00:00.000Z");
    const after = complete(await preview(b));
    expect(after.decision.score.independentFirstRight).toBe(before.decision.score.independentFirstRight + 1);
  });
  it("Maya's final-answer success is not a second try", async () => {
    const { b } = marked(Math.ceil(selected(fresh()).length * 0.8));
    const before = complete(await preview(b));
    const wrong = b.items.find(m => (m.observation as { result: string }).result === "wrong")!;
    const event = b.events.find(e => e.id === wrong.event_id)!;
    b.events.push({ ...event, id: id(70_001), idempotency_key: "call-1", source: "call", result: "right", hints: 0, evidence_kind: "call", evidence_id: id(70_002), occurred_at: "2026-11-13T00:00:00.000Z" });
    const after = complete(await preview(b));
    expect(after.decision.misses.length).toBe(before.decision.misses.length);
    const tries: SecondTryRow[] = [];
    secondTry(tries, b, wrong, "right", "2026-11-13T00:00:00.000Z").source = "maya" as never;
    expect(reason(await preview(b, tries))).toBe("second-try-not-a-correction");
  });
  it("a printed later step proves no earlier mastery", async () => {
    const b = fresh();
    selected(b, STEP2).forEach(e => mark(b, e, "right"));
    expect(reason(await preview(b, [], { s: STEP2 }))).toBe("history-mastery-gap");
  });
  it("holds Days 8-10 out of Day 7 and includes them only in a later scope", async () => {
    const { b } = marked(1000);
    selected(b, SELECTION, [8, 9, 10]).forEach(e => mark(b, e, "wrong"));
    const day7 = complete(await preview(b));
    expect(day7.decision.action).toBe("advance");
    expect(day7.held.originals.filter(h => h.reason === "outside-days").length).toBe(selected(b, SELECTION, [8, 9, 10]).length);
    const later = complete(await preview(b, [], { scope: "later-book" }));
    expect(later.decision.score.required).toBe(selected(b, SELECTION, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).length);
    expect(later.decision.score.independentFirstRight).toBe(day7.decision.score.independentFirstRight);
  });
  it("holds late marks, late second tries and second tries on a later result version", async () => {
    const { b } = marked(Math.ceil(selected(fresh()).length * 0.8));
    const late = "2026-11-18T00:00:00.000Z";
    const wrong = b.items.filter(m => (m.observation as { result: string }).result === "wrong");
    const tries: SecondTryRow[] = [];
    secondTry(tries, b, wrong[0], "right", late);
    parentChange(b, wrong[1], "wrong", late);
    secondTry(tries, b, wrong[1], "right", "2026-11-19T00:00:00.000Z");
    const r = complete(await preview(b, tries));
    expect(r.held.secondTries.map(h => h.reason).sort()).toEqual(["after-cutoff", "version-after-cutoff"]);
    expect(r.held.changes).toBe(1);
    // A mark first read after the cutoff cannot prove what the item was at the cutoff: refused, not guessed.
    const lateMark = marked(1000, { skip: 1 }).b;
    mark(lateMark, selected(lateMark).at(-1)!, "right", late);
    expect(reason(await preview(lateMark))).toBe("history-unproved-past-state");
  });
  it("holds book 2 when no scan is marked (#628), and is unavailable without a baseline", async () => {
    const held = await preview(fresh());
    expect(held).toMatchObject({ availability: "held", reasons: ["no-marked-scans"], decision: null, plan: null });
    const b = marked(1000).b;
    const none = await evaluateBook1Preview(requestOf(b, SELECTION), { ...frozenOf(b, record), book1: null });
    expect(none).toMatchObject({ availability: "unavailable", decision: null, plan: null });
    expect(none.ok ? [] : none.reasons).toContain("corrections-unavailable");
  });
});

describe("extra practice pages (no day)", () => {
  it("validates them, keeps their marks out of every sample, and no longer breaks the version 1 catalog", async () => {
    const { b } = marked(1000);
    const before = complete(await preview(b));
    const extra = printedItems(b).length;
    const undated = b.pages.find(p => (p.print_contract as unknown as { day: number | null }).day === null && b.questions.some(q => q.page_id === p.id))!;
    const item = expectedItems({ workbookId: b.book.id, printedRevision: b.book.printed_revision!, pageId: undated.id,
      questions: b.questions.filter(q => q.page_id === undated.id).map(q => ({ number: q.question_number, package: q.package as never, teaching: q.teaching })) })[0];
    mark(b, { ...item, page: undated.page_number }, "wrong");
    const after = complete(await preview(b));
    expect(after.held.undatedMarks).toBe(1);
    expect(after.decision.score).toEqual(before.decision.score);
    expect(extra).toBeGreaterThan(0);
    const v1 = { ...frozenOf(b, record), version: 1 as const } as Record<string, unknown>;
    delete v1.book1;
    expect(evaluateWorkbookProgressSources(requestOf(b, SELECTION), v1 as never)).toMatchObject({ availability: "unavailable", plan: null });
  });
});

describe("refusals: any proof incomplete or in conflict", () => {
  it.each([
    ["owner", (b: FrozenSourceBook) => { b.book.child_id = id(0xc2); }, null],
    ["revision R3", (b: FrozenSourceBook) => { (b.approvals[0].detail as { revision: number }).revision = 3; }, "baseline-binding-approval"],
    ["frame", (b: FrozenSourceBook) => { (b.frames[0].frame as { profileRevision: number }).profileRevision = 9; }, "baseline-binding-frame"],
    ["other run", (b: FrozenSourceBook) => { b.approvals[0].run_id = id(0x777); b.frames[0].run_id = id(0x777); }, "baseline-binding-approval"],
    ["activity before boundary", (b: FrozenSourceBook) => { b.items[0].evidence_at = "2026-11-07T23:59:59.999Z"; }, "activity-before-boundary"],
    ["event before boundary", (b: FrozenSourceBook) => { b.events.push({ ...b.events[0], id: id(80_001), idempotency_key: "call-early", source: "call", evidence_kind: "call", occurred_at: "2026-11-07T00:00:00.000Z" }); }, "activity-before-boundary"],
  ])("%s", async (_name, change, expected) => {
    const { b } = marked(1000);
    change(b);
    if (expected === null) await expect(preview(b)).rejects.toThrow("invalid-source");
    else expect(reason(await preview(b))).toBe(expected);
  });
  it("refuses another family's baseline, a non-Book-1 scope and an unissued step", async () => {
    const other = createBook1Baseline({ id: baseline.id, parentId: id(0xf2), childId: CHILD, final: made.final, frame: made.frame, planning: baseline.planning });
    expect(other.ok).toBe(true);
    const { b } = marked(1000);
    expect(reason(await preview(b, [], { rec: other.ok ? other.record : record }))).toBe("baseline-owner");
    // A step the book never printed is refused by the catalog before any baseline proof.
    await expect(preview(b, [], { s: { unit: "1.1", skill: "1.1-count-to-20", step: 4 } })).rejects.toThrow("invalid-source");
    const two = { ...frozenOf(b, record), books: [b, { ...structuredClone(b), book: { ...b.book, id: id(0xbb), number: 2 } }] };
    await expect(evaluateBook1Preview(requestOf(b, SELECTION), two)).rejects.toThrow();
  });
  it("refuses a cutoff before the boundary, an incomplete ledger and unlinked or stale second tries", async () => {
    const { b } = marked(Math.ceil(selected(fresh()).length * 0.8));
    // A cutoff before the boundary is before delivery too: the catalog refuses it. The ledger refuses it on its own.
    await expect(preview(b, [], { cutoff: Date.parse(BOUNDARY) - 1 })).rejects.toThrow("invalid-source");
    const f = frozenOf(b, record);
    expect(readBook1Corrections({ sources: f.book1!.corrections, baselineId: baseline.id, parentId: PARENT, childId: CHILD, workbookId: b.book.id,
      printedRevision: b.book.printed_revision!, cutoff: Date.parse(BOUNDARY) - 1, selection: SELECTION, items: b.items, changes: b.changes, events: b.events }))
      .toEqual({ ok: false, reason: "cutoff-before-boundary" });
    const wrong = b.items.find(m => (m.observation as { result: string }).result === "wrong")!;
    const right = b.items.find(m => (m.observation as { result: string }).result === "right")!;
    const cases: [string, (t: SecondTryRow[]) => void, string][] = [
      ["count", t => { secondTry(t, b, wrong, "right", "2026-11-13T00:00:00.000Z"); t.pop(); }, ""],
      ["on a right answer", t => { secondTry(t, b, right, "right", "2026-11-13T00:00:00.000Z"); }, "second-try-version-conflict"],
      ["before its version", t => { secondTry(t, b, wrong, "right", "2026-11-11T00:00:00.000Z"); }, "second-try-version-conflict"],
      ["unknown version", t => { secondTry(t, b, wrong, "right", "2026-11-13T00:00:00.000Z", 9); }, "second-try-version-conflict"],
      ["other baseline", t => { secondTry(t, b, wrong, "right", "2026-11-13T00:00:00.000Z").baseline_id = id(0xb9); }, "second-try-unlinked"],
      ["other item", t => { secondTry(t, b, wrong, "right", "2026-11-13T00:00:00.000Z").item_id = "elsewhere"; }, "second-try-unlinked"],
    ];
    for (const [name, add, expected] of cases) {
      const tries: SecondTryRow[] = [];
      add(tries);
      const frozen = frozenOf(b, record, tries);
      if (name === "count") frozen.book1!.corrections.count = 1;
      const r = await evaluateBook1Preview(requestOf(b, SELECTION), frozen);
      expect(reason(r), name).toBe(expected || "ledger-incomplete");
    }
    const frozen = frozenOf(b, record);
    frozen.book1!.corrections.initialActivity.items = 1;
    expect(reason(await evaluateBook1Preview(requestOf(b, SELECTION), frozen))).toBe("boundary-invalid");
  });
  it("refuses a tampered baseline and a printed revision the baseline did not bind", async () => {
    const { b } = marked(1000);
    expect(reason(await preview(b, [], { rec: { ...record, hash: "f".repeat(64) } }))).toBe("baseline-invalid");
    const doc = JSON.parse(record.payload); doc.binding.printedRevision = "c".repeat(28);
    const { canonical } = await import("./workbook-progress-hash");
    const payload = canonical(doc);
    const forged = { payload, hash: createHash("sha256").update(payload).digest("hex") };
    expect(reason(await preview(b, [], { rec: forged }))).toBe("baseline-binding-revision");
  });
});

describe("saved preview records", () => {
  it("saves and replays a version 2 plan, and keeps version 1 records readable", async () => {
    const { b } = marked(1000);
    const request = requestOf(b, SELECTION), frozen = frozenOf(b, record);
    const saved = await createWorkbookPreviewRecordAny(previewActor, request, frozen);
    const doc = await replayWorkbookPreviewAny(saved, previewActor, request);
    expect(doc).toMatchObject({ version: 2, outcome: { availability: "complete", decision: { action: "advance" } } });
    expect(await replayWorkbookPreviewAny({ ...saved, payload: saved.payload.replace('"advance"', '"repeat"') }, previewActor, request)).toBeNull();
    expect(await replayWorkbookPreviewAny(saved, id(0x999), request)).toBeNull();
    const v1 = previewSourceFixture(), old = createWorkbookPreviewRecord(previewActor, v1.request, v1.frozen);
    expect(await replayWorkbookPreviewAny(old, previewActor, v1.request)).toEqual(replayWorkbookPreview(old, previewActor, v1.request));
    expect((await replayWorkbookPreviewAny(old, previewActor, v1.request))?.outcome.plan).toBeNull();
  });
  it("loads version 2 sources through the public loader and detects a change during the read", async () => {
    const { b } = marked(1000);
    const frozen = frozenOf(b, record);
    const loaded = await loadWorkbookProgressSources({ capture: async () => structuredClone(frozen) }, requestOf(b, SELECTION));
    expect(loaded.ok && loaded.outcome.availability).toBe("complete");
    let n = 0;
    const drift = await loadWorkbookProgressSources({ capture: async () => { const f = structuredClone(frozen); if (n++) f.book1!.corrections.count = 1; return f; } }, requestOf(b, SELECTION));
    expect(drift).toEqual({ ok: false, reason: "changed-during-read" });
    expect(MARKED < new Date(CUTOFF).toISOString()).toBe(true);
  });
});
