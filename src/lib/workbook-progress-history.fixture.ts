// Synthetic retained records only. No customer, credential, network or image fixture.
import type { Database, Json } from "./database";
import { expectedItems, firstObservation, type Observation } from "./scan-observation";
import type { QuestionPackage } from "./question-package";
import type { TeachingContext } from "./workbook-print-contract";
import { progressFixture } from "./workbook-progress-plan.fixture";
import type { HistoryChangeRow, HistoryEventRow, HistoryFence, HistoryMarkRow, HistoryPage, WorkbookProgressHistoryInput, WorkbookProgressHistoryStore } from "./workbook-progress-history";

export const historyId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const historyTime = (v: string) => Date.parse(v);
const json = (v: unknown): Json => JSON.parse(JSON.stringify(v));
export const firstTime = "2026-01-01T12:00:00.000Z";
export const freezeTime = "2026-11-07T12:00:00.000Z";
export function historyFixture(total = 123, right = 100) {
  const base = progressFixture();
  const parent = historyId(1), child = historyId(2), currentBook = historyId(3), olderBook = historyId(4), revision = "a".repeat(28);
  const input: WorkbookProgressHistoryInput = { version: 1,
    snapshot: { ...base.snapshot, parentId: parent, childId: child, cutoff: historyTime(freezeTime), scope: [
      { workbookId: currentBook, printedRevision: revision, days: [1, 2, 3, 4, 5, 6, 7] },
      { workbookId: olderBook, printedRevision: revision, days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    ] }, curriculum: base.curriculum,
    books: [currentBook, olderBook].map(workbookId => ({ workbookId, printedRevision: revision,
      manifest: { version: 1, curriculum: base.snapshot.curriculum, testWorkbook: false, snapshotDay: 7, days: [], levelTest: null }, pages: [] })),
    sample: [], proof: { frozenPackages: "synthetic-frozen-packages", priorMastery: base.snapshot.priorMastery.evidenceReference,
      issuedHistory: "synthetic-complete-issued-list", issuedDecisions: [],
      corrections: { reference: "synthetic-complete-empty-corrections", completeThrough: historyTime(freezeTime), rows: [] }, causes: "unavailable" },
    selection: { kind: "day7", currentWorkbookId: currentBook } };
  const marks: HistoryMarkRow[] = [], changes: HistoryChangeRow[] = [], events: HistoryEventRow[] = [];
  const planning = base.planning;
  const { unit, skill, step } = base.snapshot.selection;
  for (let n = 0; n < total + 3; n++) {
    const b = input.books[n === total - 1 ? 1 : 0], day = n >= total ? n - total + 8 : 1;
    const pageId = historyId(1000 + n), itemId = `item-${n}`, page = n + 1;
    const teaching: TeachingContext = { version: 1, curriculum: input.snapshot.curriculum, practiceType: "now-you", part: "now-you", slot: `slot-${n}`,
      extra: false, track: null, plannedStep: { unit, skill, step }, itemStep: { unit, skill, step }, reviewSteps: [],
      eligibility: { format: "write-number", scorable: true, parentChecked: false, mastery: true, reason: null } };
    const pkg: QuestionPackage = { id: itemId, ref: { source: "workbook", workbookId: b.workbookId, page, question: 1 }, templateId: null,
      text: "Write thirteen.", answer: null, operation: null, steps: [], wrongAnswers: [], easierExample: null,
      skill: { standard: base.curriculum.skill.unit, skills: [base.curriculum.skill.id] }, level: 4, difficulty: 1,
      item: { format: "write-number", scorable: true, parentChecked: false, checks: [], error: null,
        regions: [{ id: "answer", kind: "box", label: null, answer: { type: "number", value: 13 } }] } };
    const p = { workbookId: b.workbookId, printedRevision: revision, pageId, number: page, day, type: "practice",
      questions: [{ number: 1, package: pkg, teaching }] };
    b.pages = [...b.pages, p];
    const manifestDay = b.manifest.days.find(x => x.day === day);
    if (manifestDay) manifestDay.pages.push(page); else b.manifest.days.push({ day, pages: [page] });
    const [expected] = expectedItems(p), result = n < right ? "right" : "wrong", reading = n < right ? "13" : "56";
    if (n < total) input.sample = [...input.sample, expected.identity];
    const observation: Observation = { ...firstObservation(expected, historyId(3000 + n)), state: "scored", result, certainty: "certain", help: "none",
      readAnswerText: reading, regions: [{ regionId: "answer", text: reading, value: reading, certainty: "certain" }], resultVersion: 2 };
    const event: HistoryEventRow = { id: historyId(5000 + n), idempotency_key: `marking:synthetic-${n}`, parent_id: parent, child_id: child,
      source: "marking", question_source: "workbook", workbook_id: b.workbookId, workbook_page: page, workbook_question: 1,
      occurred_at: firstTime, result, hints: 0, evidence_kind: "scan", evidence_id: historyId(3000 + n),
      skill_standard: pkg.skill.standard, skills: pkg.skill.skills };
    events.push(event);
    marks.push({ id: historyId(2000 + n), parent_id: parent, child_id: child, workbook_id: b.workbookId, printed_revision: revision,
      page_id: pageId, item_id: itemId, expected: json(expected), observation: json(observation), result_version: 2,
      evidence_at: firstTime, event_id: event.id, original_event: json({ key: event.idempotency_key, parentId: parent, childId: child, source: "marking",
        question: pkg.ref, skill: pkg.skill, result, occurredAt: firstTime }), model: "synthetic-reader", prompt: "synthetic-prompt" });
  }
  function parentChange(n: number, result: "right" | "wrong" | "blank", changedAt = "2026-02-01T12:00:00.000Z") {
    const row = marks[n], previous = structuredClone(row), o = row.observation as unknown as Observation;
    const next: Observation = { ...o, state: "parent-checked", method: "parent", actor: "parent", result, resultVersion: row.result_version + 1 };
    changes.push({ id: changes.length + 1, parent_id: parent, child_id: child, item_id: row.id, from_version: row.result_version,
      to_version: row.result_version + 1, actor: "parent", changed_at: changedAt, previous: json(previous), current: json(next) });
    row.observation = json(next); row.result_version++; row.evidence_at = changedAt;
    if (row.original_event === null && next.mastery.eligible) {
      const page = input.books.flatMap(b => b.pages).find(p => p.pageId === row.page_id)!;
      const event: HistoryEventRow = { id: historyId(20_000 + events.length), idempotency_key: `parent-marking:${row.id}`,
        parent_id: parent, child_id: child, source: "marking", question_source: "workbook", workbook_id: row.workbook_id,
        workbook_page: page.number, workbook_question: 1, occurred_at: changedAt, result, hints: 0, evidence_kind: "scan", evidence_id: historyId(3000 + n),
        skill_standard: page.questions[0].package!.skill.standard, skills: page.questions[0].package!.skill.skills };
      row.original_event = json({ key: event.idempotency_key, parentId: parent, childId: child, source: "marking", result, occurredAt: changedAt,
        skill: { standard: event.skill_standard, skills: event.skills },
        question: { source: "workbook", workbookId: row.workbook_id, page: page.number, question: 1 } });
      row.event_id = event.id; events.push(event);
    }
  }
  function help(n: number, occurredAt = "2025-12-31T12:00:00.000Z", result: HistoryEventRow["result"] = "right_with_help") {
    const source = events[n];
    events.push({ ...source, id: historyId(9000 + events.length), idempotency_key: `call-${events.length}`, source: "call", occurred_at: occurredAt,
      result, hints: result === "right_with_help" ? 1 : 0, evidence_kind: "call", evidence_id: historyId(8000 + events.length) });
  }
  function fence(): HistoryFence {
    return { parentId: parent, childId: child, markingRevision: 50 + changes.length,
      books: input.books.map(b => ({ workbookId: b.workbookId, printedRevision: b.printedRevision, manifest: b.manifest,
        counts: { items: marks.filter(m => m.workbook_id === b.workbookId).length,
          changes: changes.filter(j => marks.some(m => m.id === j.item_id && m.workbook_id === b.workbookId)).length,
          events: events.filter(e => e.workbook_id === b.workbookId).length } })) };
  }
  function page<T extends { id: string | number }>(rows: T[], after: string | number | null, limit: number): HistoryPage<T> {
    const rest = rows.filter(r => after === null || r.id > after).sort((a, b) => a.id < b.id ? -1 : 1);
    return structuredClone({ rows: rest.slice(0, limit), remaining: rest.length });
  }
  const store: WorkbookProgressHistoryStore = {
    async fence() { return structuredClone(fence()); },
    async items(_i, b, after, limit) { return page(marks.filter(m => m.workbook_id === b.workbookId), after, limit); },
    async changes(_i, b, after, limit) { return page(changes.filter(j => marks.some(m => m.id === j.item_id && m.workbook_id === b.workbookId)), after, limit); },
    async events(_i, b, after, limit) { return page(events.filter(e => e.workbook_id === b.workbookId), after, limit); },
  };
  const tables: Record<string, Record<string, unknown>[]> = {
    parents: [{ id: parent, deletion_requested_at: null }], children: [{ id: child, parent_id: parent }], child_deletions: [], family_deletions: [],
    workbooks: input.books.map(b => ({ id: b.workbookId, parent_id: parent, child_id: child, status: "shipped", printed_revision: revision, print_manifest: b.manifest })),
    workbook_pages: input.books.flatMap(b => b.pages.map(p => ({ id: p.pageId, parent_id: parent, workbook_id: b.workbookId, page_number: p.number,
      print_contract: { version: 1, workbookId: b.workbookId, page: p.number, day: p.day } }))),
    scan_marking_items: marks, scan_mark_changes: changes, learning_events: events,
    scan_marking_revisions: [{ parent_id: parent, child_id: child, revision: 50 } satisfies Pick<Database["public"]["Tables"]["scan_marking_revisions"]["Row"], "parent_id" | "child_id" | "revision">],
  };
  return { input, planning, marks, changes, events, parentChange, help, store, tables, fence };
}
