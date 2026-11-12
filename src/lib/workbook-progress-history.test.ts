import { describe, expect, it, vi } from "vitest";
import { previewNextWorkbookPlanFromHistory, readFrozenWorkbookProgressHistory, readFrozenWorkbookReviewHistory, readWorkbookProgressHistory, type WorkbookProgressHistoryPreview, type WorkbookProgressHistoryStore } from "./workbook-progress-history";
import { historyFixture, historyTime, firstTime } from "./workbook-progress-history.fixture";
import type { Observation } from "./scan-observation";
import { expectedItems, firstObservation } from "./scan-observation";
import type { Json } from "./database";
vi.mock("server-only", () => ({}));
const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v));

function complete(r: WorkbookProgressHistoryPreview) {
  expect(r.ok, r.ok ? undefined : r.reason).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  return r;
}
function assertPlan(r: WorkbookProgressHistoryPreview, count = 123) {
  const { retained, preview } = complete(r);
  expect(preview.decision).toMatchObject({ action: "repeat-new-numbers", target: { step: 2 }, score: { required: count, independentFirstRight: 100 } });
  const skill = preview.decision.selection.skill;
  const parts = preview.plan.days.flatMap(d => d.pages.flatMap(p => p.parts));
  const teaching = parts.filter(p => p.step?.skill === skill);
  expect(teaching.length).toBeGreaterThan(0);
  expect(teaching.every(p => p.step?.step === 2)).toBe(true);
  const fix = parts.flatMap(p => p.fixIt ?? []).find(f => f.skill === skill);
  const wrong = preview.decision.items.filter(i => i.effective?.observation.result === "wrong");
  expect(fix?.avoid.events).toEqual(expect.arrayContaining(wrong.map(w => w.first!.provenance.eventId)));
  expect(fix?.avoid.questions).toEqual(expect.arrayContaining(wrong.map(w => w.question)));
  expect(wrong.some(w => w.first!.observation.readAnswerText === "56")).toBe(true);
  expect(retained.history.originals).toHaveLength(count);
  expect(retained.proof.usedVersions).toHaveLength(count);
}

describe("canonical retained history through public reading and preview", () => {
  // Falsifiers: dropped pages, lost old 56, changed teaching target, missing original event/question avoidance,
  // post-cutoff judgments, or a partial/failed source presented as complete.
  it("validates frozen rows with the same results as the paged reader", async () => {
    const f = historyFixture(10, 8);
    f.parentChange(0, "wrong");
    const rows = { fence: f.fence(), books: f.input.books.map(book => ({ workbookId: book.workbookId,
      items: f.marks.filter(m => m.workbook_id === book.workbookId),
      changes: f.changes.filter(c => f.marks.some(m => m.id === c.item_id && m.workbook_id === book.workbookId)),
      events: f.events.filter(e => e.workbook_id === book.workbookId) })) };
    const paged = await readWorkbookProgressHistory(f.store, f.input), frozen = readFrozenWorkbookProgressHistory(f.input, rows);
    expect(frozen.ok && paged.ok).toBe(true);
    if (!frozen.ok || !paged.ok) return;
    expect(frozen.snapshot).toEqual(paged.snapshot);
    expect(frozen.history).toEqual(paged.history);
    expect(frozen.held).toEqual(paged.held);
    expect(frozen.proof.usedVersions).toEqual(paged.proof.usedVersions);
    const missing = structuredClone(rows); missing.books[0].items.pop();
    expect(readFrozenWorkbookProgressHistory(f.input, missing)).toMatchObject({ ok: false, reason: "invalid-record" });
  });
  it("normalizes a review without requiring or claiming earlier mastery", () => {
    const f = historyFixture(10, 10);
    f.input.snapshot.priorMastery.passedSteps = 0;
    const rows = { fence: f.fence(), books: f.input.books.map(book => ({ workbookId: book.workbookId,
      items: f.marks.filter(m => m.workbook_id === book.workbookId),
      changes: f.changes.filter(c => f.marks.some(m => m.id === c.item_id && m.workbook_id === book.workbookId)),
      events: f.events.filter(e => e.workbook_id === book.workbookId) })) };
    expect(readFrozenWorkbookProgressHistory(f.input, rows)).toMatchObject({ ok: false, reason: "mastery-gap" });
    const review = readFrozenWorkbookReviewHistory(f.input, rows);
    expect(review).toMatchObject({ ok: true, availability: "complete" });
    if (review.ok) expect(review.proof.usedVersions).toHaveLength(10);
  });
  it("retains facts but refuses a definitive plan when correction proof is unavailable", async () => {
    const f = historyFixture(10, 8);
    f.input.proof.corrections = "unavailable";
    const retained = await readWorkbookProgressHistory(f.store, f.input);
    expect(retained.ok).toBe(true);
    if (retained.ok) expect(retained.proof.corrections).toBe("unavailable");
    const result = await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning);
    expect(result).toEqual({ ok: false, availability: "unavailable", reason: "corrections-unavailable" });
    expect(result).not.toHaveProperty("preview");
    expect(JSON.stringify(result)).not.toContain("56");
    f.input.proof.corrections = { reference: "synthetic-validated-empty", completeThrough: f.input.snapshot.cutoff, rows: [] };
    expect(complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning)).preview.decision.misses).toHaveLength(2);
    f.input.proof.corrections = { reference: "synthetic-validated-fix", completeThrough: f.input.snapshot.cutoff,
      rows: [{ identity: f.input.sample[8], tries: [{ id: "known-fix", at: historyTime("2026-02-01T12:00:00Z"),
        basedOnResultVersion: 2, result: "right", help: "math-help" }] }] };
    const fixed = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(fixed.preview.decision.misses).toHaveLength(1);
    expect(fixed.preview.decision.score.independentFirstRight).toBe(8);
  });
  it("takes over 100 originals and over 100 journal rows to the real preview after image lifetime", async () => {
    const f = historyFixture();
    for (let n = 0; n < 105; n++) f.parentChange(n, n < 100 ? "right" : "wrong");
    const result = await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning);
    assertPlan(result);
    const r = complete(result);
    expect(r.retained.proof.counts).toMatchObject({ items: 126, changes: 105, events: 126 });
    expect(r.retained.proof.counts.requests).toBeGreaterThan(9);
    const old = r.preview.decision.items.find(i => i.question.workbookId === f.input.books[1].workbookId)!;
    expect(old.first).toMatchObject({ at: historyTime(firstTime), observation: { readAnswerText: "56", result: "wrong" } });
    expect(f.input.snapshot.cutoff - old.first!.at).toBeGreaterThan(90 * 86_400_000);
    expect(r.retained.proof).toMatchObject({ corrections: "caller-validated", causes: "unavailable" });
  });

  it("holds Days 8-10 on Day 7 and includes them in an explicit later-book preview", async () => {
    const f = historyFixture();
    const early = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(early.retained.held.map(h => [h.reason, h.original.day])).toEqual([["outside-days", 8], ["outside-days", 9], ["outside-days", 10]]);
    expect(early.preview.decision.score.required).toBe(123);
    f.input.selection = { kind: "later-book", reference: "validated-later-preview" };
    f.input.snapshot.scope = f.input.snapshot.scope.map(b => ({ ...b, days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }));
    f.input.sample = f.input.books.flatMap(b => b.pages.flatMap(p => p.questions.map(q => ({ workbookId: b.workbookId,
      printedRevision: b.printedRevision, pageId: p.pageId, itemId: q.package!.id }))));
    const later = await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning);
    assertPlan(later, 126);
    expect(complete(later).retained.held).toEqual([]);
  });

  it("refuses current Day 8 scope under a normal Day 7 declaration", async () => {
    const f = historyFixture(); f.input.snapshot.scope[0].days = [1, 8];
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, reason: "invalid-contract" });
  });

  it.each([
    ["outside-days", 0, "right"], ["outside-days", 0, "wrong"], ["outside-days", 1, "right"], ["outside-days", 1, "wrong"],
    ["outside-sample", 0, "right"], ["outside-sample", 0, "wrong"], ["outside-sample", 1, "right"], ["outside-sample", 1, "wrong"],
  ] as const)("validates %s evidence with prior %i and %s without applying its isolated mastery", async (reason, prior, result) => {
    const f = historyFixture(10, 8), index = reason === "outside-days" ? 10 : 0, m = f.marks[index];
    f.input.snapshot.priorMastery.passedSteps = prior;
    f.planning.passed = { ...f.planning.passed, [f.input.curriculum.skill.id]: prior };
    if (reason === "outside-sample") f.input.sample = f.input.sample.filter(i => i.itemId !== m.item_id);
    const o = m.observation as unknown as Observation, reading = result === "right" ? "13" : "56";
    m.observation = toJson({ ...o, result, readAnswerText: reading,
      regions: [{ regionId: "answer", text: reading, value: reading, certainty: "certain" }] });
    f.events.find(e => e.id === m.event_id)!.result = result;
    m.original_event = toJson({ ...m.original_event as object, result });
    const r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(r.preview.decision.action).toBe("repeat-new-numbers");
    expect(r.preview.decision.passed[f.input.curriculum.skill.id]).toBe(prior);
    expect(r.retained.held).toContainEqual(expect.objectContaining({ reason,
      original: expect.objectContaining({ first: expect.objectContaining({ observation: expect.objectContaining({ identity: expect.objectContaining({ itemId: m.item_id }) }) }) }) }));
    expect(r.preview.decision.items.some(i => i.identity.itemId === m.item_id)).toBe(false);
  });
  it("still refuses an actual selected mastery gap", async () => {
    const f = historyFixture(10, 10);
    f.input.snapshot.priorMastery.passedSteps = 0;
    f.planning.passed = { ...f.planning.passed, [f.input.curriculum.skill.id]: 0 };
    // #472 names this refusal: a printed later step proves no earlier mastery. It was reported as invalid-record before.
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, availability: "unavailable", reason: "mastery-gap" });
  });
  it.each((["outside-days", "outside-sample"] as const).flatMap(reason =>
    (["right", "wrong"] as const).flatMap(result => [0, 1, 2].map(version => ({ reason, result, version }))),
  ))("checks $reason $result context version $version without inferring prior mastery", async ({ reason, result, version }) => {
    const f = historyFixture(10, 8), index = reason === "outside-days" ? 10 : 0, m = f.marks[index];
    f.input.snapshot.priorMastery.passedSteps = 0;
    f.planning.passed = { ...f.planning.passed, [f.input.curriculum.skill.id]: 0 };
    if (reason === "outside-sample") f.input.sample = f.input.sample.filter(i => i.itemId !== m.item_id);
    const p = f.input.books.flatMap(b => b.pages).find(p => p.pageId === m.page_id)!;
    Object.assign(p.questions[0].teaching!, { version });
    const o = m.observation as unknown as Observation, reading = result === "right" ? "13" : "56";
    m.observation = toJson({ ...o, result, readAnswerText: reading,
      regions: [{ regionId: "answer", text: reading, value: reading, certainty: "certain" }] });
    f.events.find(e => e.id === m.event_id)!.result = result;
    m.original_event = toJson({ ...m.original_event as object, result });
    const raw = await readWorkbookProgressHistory(f.store, f.input);
    const preview = await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning);
    if (version !== 1) {
      expect(raw).toEqual({ ok: false, availability: "unavailable", reason: "invalid-record" });
      expect(preview).toEqual(raw);
      expect(preview).not.toHaveProperty("preview");
    } else {
      expect(raw.ok).toBe(true);
      expect(complete(preview).preview.decision).toMatchObject({ action: "repeat-new-numbers", passed: { [f.input.curriculum.skill.id]: 0 } });
    }
  });
  it.each([0, 1, 2])("keeps selected context version %s under the same version rule", async version => {
    const f = historyFixture(10, 8), p = f.input.books[0].pages[0];
    Object.assign(p.questions[0].teaching!, { version });
    const result = await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning);
    if (version === 1) expect(complete(result).preview.decision.action).toBe("repeat-new-numbers");
    else expect(result).toEqual({ ok: false, availability: "unavailable", reason: "invalid-record" });
  });

  it.each(["items", "changes", "events"] as const)("drop-page control for %s fails the same public preview assertion", async source => {
    const f = historyFixture();
    for (let n = 0; n < 105; n++) f.parentChange(n, n < 100 ? "right" : "wrong");
    assertPlan(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    const dropped: WorkbookProgressHistoryStore = { ...f.store };
    if (source === "changes") dropped.changes = async (i, b, after, limit) => after === null ? f.store.changes(i, b, after, limit) : { rows: [], remaining: 0 };
    else if (source === "items") dropped.items = async (i, b, after, limit) => after === null ? f.store.items(i, b, after, limit) : { rows: [], remaining: 0 };
    else dropped.events = async (i, b, after, limit) => after === null ? f.store.events(i, b, after, limit) : { rows: [], remaining: 0 };
    const result = await previewNextWorkbookPlanFromHistory(dropped, f.input, f.planning);
    expect(() => assertPlan(result)).toThrow();
    expect(result).toMatchObject({ ok: false, availability: "unavailable" });
  });

  it.each(["before", "after"])("uses a parent judgment only %s the cutoff and keeps the reading", async when => {
    const f = historyFixture(10, 8);
    f.parentChange(8, "right", when === "before" ? "2026-11-06T12:00:00.000Z" : "2026-11-08T12:00:00.000Z");
    const r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(r.preview.decision.action).toBe(when === "before" ? "advance" : "repeat-new-numbers");
    expect(r.preview.decision.items.find(i => i.identity.itemId === "item-8")!.first!.observation.readAnswerText).toBe("56");
    expect(r.retained.heldChanges).toHaveLength(when === "after" ? 1 : 0);
    expect(r.preview.decision.items.find(i => i.identity.itemId === "item-8")!.effective!.observation.resultVersion).toBe(when === "before" ? 3 : 2);
  });

  it("keeps a pending parent original and its later resolution as separate readings", async () => {
    const f = historyFixture(10, 8), m = f.marks[8];
    const o = m.observation as unknown as Observation;
    m.observation = toJson({ ...o, state: "pending", result: null, certainty: "uncertain", readAnswerText: null, regions: [], help: "unknown" });
    m.original_event = null; m.event_id = null;
    f.parentChange(8, "right");
    const r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    const i = r.preview.decision.items.find(i => i.identity.itemId === "item-8")!;
    expect(i.first!.observation).toMatchObject({ state: "pending", readAnswerText: null });
    expect(i.effective!.observation).toMatchObject({ state: "parent-checked", result: "right" });
    expect(r.retained.proof.references.some(p => p.source === "scan_mark_changes" && p.reference.endsWith(":previous"))).toBe(true);
    f.input.snapshot.cutoff = historyTime(firstTime);
    f.input.proof.corrections = { reference: "synthetic-complete-empty-corrections", completeThrough: f.input.snapshot.cutoff, rows: [] };
    const past = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(past.preview.decision.status).toBe("insufficient-evidence");
  });

  it("reads our team's mark of an unsure item, then a parent's later change, as the journal's readings (#715)", async () => {
    const f = historyFixture(10, 8), m = f.marks[8];
    const o = m.observation as unknown as Observation;
    m.observation = toJson({ ...o, state: "pending", result: null, certainty: "uncertain", readAnswerText: null, regions: [], help: "unknown" });
    m.original_event = null; m.event_id = null;
    f.parentChange(8, "wrong", "2026-02-01T12:00:00.000Z", "admin");
    let r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    let i = r.preview.decision.items.find(i => i.identity.itemId === "item-8")!;
    expect(i.effective!.observation).toMatchObject({ state: "parent-checked", actor: "admin", result: "wrong" });
    f.parentChange(8, "right", "2026-02-02T12:00:00.000Z");
    r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    i = r.preview.decision.items.find(i => i.identity.itemId === "item-8")!;
    expect(i.effective!.observation).toMatchObject({ state: "parent-checked", actor: "parent", result: "right" });
    expect(r.retained.proof.references.filter(p => p.source === "scan_mark_changes" && !p.reference.endsWith(":previous"))).toHaveLength(2);
  });

  it("refuses a journal row whose actor is not a parent or our team", async () => {
    const f = historyFixture(10, 8); f.parentChange(8, "right");
    (f.changes[0] as { actor: string }).actor = "system";
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("does not turn an automatic post-cutoff transition into a proved past pending state", async () => {
    const f = historyFixture(); f.input.snapshot.cutoff = historyTime("2025-12-31T12:00:00Z");
    f.input.proof.corrections = { reference: "synthetic-complete-empty-corrections", completeThrough: f.input.snapshot.cutoff, rows: [] };
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, reason: "unproved-past-state" });
  });

  it("retains recorded help through parent changes and never treats a later Maya success as a fix", async () => {
    const f = historyFixture(10, 9); f.help(0); f.parentChange(0, "right");
    f.help(9, "2026-03-01T12:00:00Z", "right");
    const r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(r.preview.decision.score.independentFirstRight).toBe(8);
    expect(r.preview.decision.misses.find(m => m.question.source === "workbook" && m.question.page === 10)).toBeDefined();
    const helped = r.preview.decision.items.find(i => i.identity.itemId === "item-0")!;
    expect(helped.first!.observation.help).toBe("unknown");
    expect(helped.effective!.observation.help).toBe("unknown");
    expect(r.retained.proof.helpEvents).toHaveLength(1);
    expect(r.retained.proof.corrections).toBe("caller-validated");
  });

  it("accepts explicit validated second-try proof without changing first score", async () => {
    const f = historyFixture(10, 8), identity = f.input.sample[8];
    f.input.proof.corrections = { reference: "synthetic-proof", completeThrough: f.input.snapshot.cutoff,
      rows: [{ identity, tries: [{ id: "recorded-second-try-1", at: historyTime("2026-02-01T12:00:00Z"), basedOnResultVersion: 2, result: "right", help: "math-help" }] }] };
    const r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(r.preview.decision.score.independentFirstRight).toBe(8);
    expect(r.preview.decision.misses).toHaveLength(1);
    expect(r.retained.proof.corrections).toBe("caller-validated");
  });

  it.each(["missing-journal", "conflicting-prior", "stale-version", "bad-held", "missing-event"])("refuses the complete read for %s", async mode => {
    const f = historyFixture(); f.parentChange(0, "right");
    if (mode === "missing-journal") f.changes.length = 0;
    if (mode === "conflicting-prior") f.changes[0].previous = toJson({ ...f.marks[0], result_version: 99 });
    if (mode === "stale-version") f.changes[0].from_version = 1;
    if (mode === "bad-held") f.marks.at(-1)!.observation = toJson({ ...f.marks.at(-1)!.observation as object, readAnswerText: "x".repeat(201) });
    if (mode === "missing-event") f.events.splice(0, 1);
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, availability: "unavailable" });
  });

  it.each(["parent_id", "child_id", "workbook_id", "printed_revision", "page_id"] as const)("refuses a foreign %s", async field => {
    const f = historyFixture(), load = f.store.items;
    f.store.items = async (i, b, after, limit) => {
      const page = await load(i, b, after, limit);
      return { ...page, rows: page.rows.map(r => r.id === f.marks[0].id ? { ...r, [field]: "foreign" } : r) };
    };
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false });
  });

  it.each(["repeat", "backward", "empty-positive", "missing-count", "oversize"])("refuses %s pages", async mode => {
    const f = historyFixture();
    const original = f.store.items;
    f.store.items = async (i, b, after, limit) => {
      const p = await original(i, b, after, limit);
      if (mode === "repeat" && after) return { ...p, rows: [f.marks[0]] };
      if (mode === "backward") return { ...p, rows: [...p.rows].reverse() };
      if (mode === "empty-positive") return { ...p, rows: [] };
      if (mode === "missing-count") return { ...p, remaining: NaN };
      if (mode === "oversize") return { ...p, rows: Array(101).fill(f.marks[0]) };
      return p;
    };
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, reason: "invalid-page" });
  });

  it.each([{ maxRows: 100 }, { maxRequests: 2 }])("returns unavailable at the explicit bound %j", async limit => {
    const f = historyFixture();
    const r = await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning, limit);
    expect(r).toMatchObject({ ok: false, reason: "safety-bound" });
    expect(() => assertPlan(r)).toThrow();
  });

  it.each(["revision", "deletion", "freeze", "manifest", "event-append"])("refuses a changed final fence: %s", async mode => {
    const f = historyFixture(); let calls = 0;
    f.store.fence = async () => {
      const fence = f.fence();
      if (++calls === 2) {
        if (mode === "deletion" || mode === "freeze") return null;
        if (mode === "revision") fence.markingRevision!++;
        if (mode === "manifest") fence.books[0].printedRevision = "changed";
        if (mode === "event-append") fence.books[0].counts.events++;
      }
      return structuredClone(fence);
    };
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, reason: "changed-during-read" });
  });

  it("keeps source failure distinct from empty complete history with all unscanned sample items", async () => {
    const f = historyFixture(10, 8);
    f.marks.length = 0; f.events.length = 0;
    const empty = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(empty.preview.decision).toMatchObject({ action: "retain-unfinished", status: "insufficient-evidence", score: { required: 10, resolved: 0 } });
    f.store.events = async () => { throw Error("synthetic-source-failure"); };
    expect(await readWorkbookProgressHistory(f.store, f.input)).toEqual({ ok: false, availability: "unavailable", reason: "source-error" });
  });

  it("requires explicit issued, package and prior-mastery proofs", async () => {
    for (const field of ["issuedHistory", "frozenPackages", "priorMastery"] as const) {
      const f = historyFixture(); f.input.proof[field] = "";
      expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, reason: "invalid-contract" });
    }
  });

  it("reconstructs one original through more than one page of its own parent changes", async () => {
    const f = historyFixture(10, 8);
    for (let n = 0; n < 105; n++) f.parentChange(8, n % 2 === 0 ? "right" : "wrong");
    const r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    const item = r.preview.decision.items.find(i => i.identity.itemId === "item-8")!;
    expect(item.first!.observation).toMatchObject({ resultVersion: 2, readAnswerText: "56", result: "wrong" });
    expect(item.effective!.observation).toMatchObject({ resultVersion: 107, readAnswerText: "56", result: "right" });
    expect(r.preview.decision.action).toBe("advance");
    expect(r.retained.history.originals.find(o => o.first.observation.identity.itemId === "item-8")!.changes).toHaveLength(105);
  });

  it("keeps a true parent-pending method until its journal proves parent resolution", async () => {
    const f = historyFixture(10, 8), page = f.input.books[0].pages.find(p => p.questions[0].package!.id === "item-8")!;
    const q = page.questions[0];
    q.package!.item = { format: "draw", scorable: false, parentChecked: true, checks: [], error: null,
      regions: [{ id: "picture", kind: "picture", label: null }] };
    q.teaching!.eligibility = { format: "draw", scorable: false, parentChecked: true, mastery: true, reason: null };
    const [expected] = expectedItems(page), m = f.marks[8];
    m.expected = toJson(expected); m.observation = toJson(firstObservation(expected, null));
    m.result_version = 1; m.original_event = null; m.event_id = null;
    const pending = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(pending.preview.decision.status).toBe("insufficient-evidence");
    f.parentChange(8, "right");
    const resolved = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    const item = resolved.preview.decision.items.find(i => i.identity.itemId === "item-8")!;
    expect(item.first!.observation.state).toBe("parent-pending");
    expect(item.effective!.observation.state).toBe("parent-checked");
    expect(item.first!.observation.readAnswerText).toBeNull();
  });

  it("does not leak a judgment one microsecond after a millisecond cutoff", async () => {
    const f = historyFixture(10, 8);
    f.parentChange(8, "right", "2026-11-07T12:00:00.000001Z");
    const r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(r.preview.decision.score.independentFirstRight).toBe(8);
    expect(r.retained.heldChanges[0].reading.at).toBe(f.input.snapshot.cutoff + 1);
    expect(r.retained.proof.timeNormalization).toBe("ceil-millisecond");
  });

  it("validates a post-cutoff journal entry instead of hiding its malformed reading", async () => {
    const f = historyFixture(); f.parentChange(8, "right", "2026-11-08T12:00:00Z");
    const change = f.changes[0];
    change.current = toJson({ ...change.current as object, readAnswerText: "x".repeat(201) });
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false });
  });

  it("keeps two independent reads isolated when one source changes during their concurrent pagination", async () => {
    const stable = historyFixture(), changed = historyFixture();
    let n = 0;
    changed.store.fence = async () => { const f = changed.fence(); if (++n === 2) f.markingRevision!++; return f; };
    const [a, b] = await Promise.all([
      previewNextWorkbookPlanFromHistory(stable.store, stable.input, stable.planning),
      previewNextWorkbookPlanFromHistory(changed.store, changed.input, changed.planning),
    ]);
    assertPlan(a);
    expect(b).toMatchObject({ ok: false, reason: "changed-during-read" });
  });

  it.each(["identical", "conflicting"])("refuses a second canonical item row with %s content", async kind => {
    const f = historyFixture(), duplicate = structuredClone(f.marks[0]);
    duplicate.id = "00000000-0000-4000-8000-000000009999";
    if (kind === "conflicting") duplicate.observation = toJson({ ...duplicate.observation as object, readAnswerText: "different" });
    f.marks.push(duplicate);
    expect(await readWorkbookProgressHistory(f.store, f.input)).toMatchObject({ ok: false, reason: "invalid-record" });
  });

  it("passes the explicit issued decisions into the preview instead of assuming an empty list", async () => {
    const f = historyFixture(), { unit, skill, step } = f.input.snapshot.selection;
    f.input.proof.issuedDecisions = [1, 2].map(n => ({ version: 1, id: `issued-${n}`, workbookId: `issued-book-${n}`,
      parentId: f.input.snapshot.parentId, childId: f.input.snapshot.childId, issuedAt: historyTime(`2026-01-0${n}T13:00:00Z`),
      curriculum: f.input.snapshot.curriculum, selection: { unit, skill, step }, action: "repeat" }));
    const r = complete(await previewNextWorkbookPlanFromHistory(f.store, f.input, f.planning));
    expect(r.preview.decision).toMatchObject({ action: "change-approach", priorRepeats: 2, parentFollowUp: true, target: { step: 2 } });
    expect(r.preview.planningInput.progress!.decision.action).toBe("change-approach");
  });
});
