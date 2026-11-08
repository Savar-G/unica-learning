// #472 The prospective correction boundary of a Book 1 baseline and the child's second tries after it.
//
// The baseline save opens the boundary under the family's scan lock and proves that the book had no marking, learning
// event, scan receipt or second try at that moment (src/lib/workbook-book1-store.ts and migration
// workbook_book1_baseline). From then on a second try is only a ledger row (public.workbook_second_tries) that names the
// marking row and the result version it corrects; the database takes its time when it is recorded.
//
// What is and is not a second try:
// - A child's written new answer to a question already marked wrong or blank is one: source "child-written-answer".
// - A parent's "Change this mark" is not: it changes the original result (scan_mark_changes), which the history reader
//   already reads as the first answer's adjudication.
// - Maya's final-answer success in a call is not: a call is help, never a corrected answer.
// No cause (careless, conceptual) is read or guessed here.
//
// Pure: rows in, a corrections proof out. No network, database, clock or randomness.
import "server-only";
import { isDeepStrictEqual as same } from "node:util";
import type { ItemIdentity, Observation } from "./scan-observation";
import type { ProgressOriginal } from "./workbook-progress";
import type { HistoryChangeRow, HistoryEventRow, HistoryMarkRow } from "./workbook-progress-history";
import { sourceHash } from "./workbook-progress-hash";

export const SECOND_TRY_ENGINE = "workbook-second-try/1";
export const CORRECTION_BOUNDARY_POLICY = "book1-prospective-ledger/1";

/** One ledger row, as the database stores it. Written only through record_workbook_second_try (#471's seam). */
export interface SecondTryRow {
  id: string;
  baseline_id: string;
  parent_id: string;
  child_id: string;
  workbook_id: string;
  printed_revision: string;
  item_row_id: string;
  page_id: string;
  item_id: string;
  based_on_version: number;
  source: "child-written-answer";
  result: "right" | "wrong" | "blank";
  help: "none" | "math-help" | "unknown";
  evidence_reference: string;
  engine: typeof SECOND_TRY_ENGINE;
  recorded_at: string;
}
/** The boundary and the complete ledger for one baseline, frozen in one read. */
export interface Book1CorrectionSources {
  baselineId: string;
  boundaryAt: string;
  /** What the save counted for the book under the scan lock. All zero, or the save refused. */
  initialActivity: { items: number; changes: number; events: number; receipts: number; secondTries: number };
  /** The ledger's row count in the same read: the rows must be all of them. */
  count: number;
  rows: SecondTryRow[];
}
export type CorrectionRefusal = "boundary-invalid" | "activity-before-boundary" | "cutoff-before-boundary" | "ledger-incomplete"
  | "second-try-unlinked" | "second-try-version-conflict" | "second-try-not-a-correction";
export type CorrectionResult = { ok: false; reason: CorrectionRefusal } | {
  ok: true;
  corrections: { reference: string; completeThrough: number; rows: { identity: ItemIdentity; tries: ProgressOriginal["secondTries"] }[] };
  /** Rows the cutoff does not reach, or for another step's items: kept, not used. */
  held: { reason: "after-cutoff" | "version-after-cutoff" | "other-step" | "undated-page"; id: string }[];
  boundaryAt: number;
};

const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** Postgres keeps microseconds. Round forward, so a time just after the cutoff never counts as before it. */
export function ledgerTime(v: unknown): number {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)) throw Error("invalid-time");
  const fraction = v.match(/\.(\d+)/)?.[1] ?? "";
  const n = Date.parse(v) + (/[1-9]/.test(fraction.slice(3)) ? 1 : 0);
  if (!Number.isSafeInteger(n) || n < 0) throw Error("invalid-time");
  return n;
}
const resolvedMiss = (o: Observation) => (o.result === "wrong" || o.result === "blank")
  && (o.state === "parent-checked" || (o.state === "scored" && o.certainty === "certain"));

/**
 * The second tries of one bound book through the cutoff, version-linked to the canonical original result and item.
 * Refused when the boundary is not proved, when any marking, change or event of the book is older than the boundary,
 * or when a ledger row does not link to a result version that existed, was a resolved miss, and was current when the
 * row was recorded.
 */
export function readBook1Corrections(o: {
  sources: Book1CorrectionSources;
  baselineId: string;
  parentId: string;
  childId: string;
  workbookId: string;
  printedRevision: string;
  cutoff: number;
  selection: { unit: string; skill: string; step: number };
  items: readonly HistoryMarkRow[];
  changes: readonly HistoryChangeRow[];
  events: readonly HistoryEventRow[];
  /** Pages of no day: a second try there is held, as their marks are. */
  undatedPages?: ReadonlySet<string>;
}): CorrectionResult {
  const refuse = (reason: CorrectionRefusal): CorrectionResult => ({ ok: false, reason });
  try {
    const s = o.sources;
    if (!s || s.baselineId !== o.baselineId || !same(s.initialActivity, { items: 0, changes: 0, events: 0, receipts: 0, secondTries: 0 })) return refuse("boundary-invalid");
    const boundary = ledgerTime(s.boundaryAt);
    if (o.cutoff < boundary) return refuse("cutoff-before-boundary");
    // Nothing of the book may be older than the boundary: such activity is not accounted for by the ledger.
    const first = (m: HistoryMarkRow) => {
      const chain = o.changes.filter(c => c.item_id === m.id).sort((a, b) => a.to_version - b.to_version);
      return chain.length ? (chain[0].previous as unknown as HistoryMarkRow).evidence_at : m.evidence_at;
    };
    if (o.items.some(m => ledgerTime(first(m)) < boundary || ledgerTime(m.evidence_at) < boundary)
      || o.changes.some(c => ledgerTime(c.changed_at) < boundary) || o.events.some(e => ledgerTime(e.occurred_at) < boundary)) return refuse("activity-before-boundary");
    if (!Number.isSafeInteger(s.count) || s.count !== s.rows.length || new Set(s.rows.map(r => r.id)).size !== s.rows.length) return refuse("ledger-incomplete");
    const rows = new Map<string, { identity: ItemIdentity; tries: ProgressOriginal["secondTries"][number][] }>();
    const held: Extract<CorrectionResult, { ok: true }>["held"] = [];
    for (const r of s.rows) {
      if (!uuid(r.id) || r.baseline_id !== o.baselineId || r.parent_id !== o.parentId || r.child_id !== o.childId || r.workbook_id !== o.workbookId
        || r.printed_revision !== o.printedRevision || r.engine !== SECOND_TRY_ENGINE) return refuse("second-try-unlinked");
      // Only a child's written answer is a second try. Maya and parent changes never enter this ledger.
      if (r.source !== "child-written-answer" || !["right", "wrong", "blank"].includes(r.result) || !["none", "math-help", "unknown"].includes(r.help)
        || typeof r.evidence_reference !== "string" || !r.evidence_reference.trim()) return refuse("second-try-not-a-correction");
      const mark = o.items.find(m => m.id === r.item_row_id);
      if (!mark || mark.page_id !== r.page_id || mark.item_id !== r.item_id || mark.workbook_id !== r.workbook_id
        || mark.printed_revision !== r.printed_revision || mark.parent_id !== o.parentId || mark.child_id !== o.childId) return refuse("second-try-unlinked");
      const chain = o.changes.filter(c => c.item_id === mark.id).sort((a, b) => a.to_version - b.to_version);
      const versions: { version: number; at: number; observation: Observation }[] = [];
      const start = chain.length ? chain[0].previous as unknown as HistoryMarkRow : mark;
      versions.push({ version: start.result_version, at: ledgerTime(start.evidence_at), observation: start.observation as unknown as Observation });
      for (const c of chain) versions.push({ version: c.to_version, at: ledgerTime(c.changed_at), observation: c.current as unknown as Observation });
      const at = versions.findIndex(v => v.version === r.based_on_version);
      if (at < 0) return refuse("second-try-version-conflict");
      const based = versions[at], next = versions[at + 1], recorded = ledgerTime(r.recorded_at);
      // The row was recorded while its version was the current result, never before the result or after a newer one.
      if (recorded < based.at || (next && recorded >= next.at) || !resolvedMiss(based.observation)) return refuse("second-try-version-conflict");
      const identity = based.observation.identity;
      if (!identity || identity.workbookId !== o.workbookId || identity.printedRevision !== o.printedRevision || identity.pageId !== mark.page_id
        || identity.itemId !== mark.item_id) return refuse("second-try-unlinked");
      if (o.undatedPages?.has(mark.page_id)) { held.push({ reason: "undated-page", id: r.id }); continue; }
      const step = based.observation.teaching?.itemStep;
      if (!step || step.unit !== o.selection.unit || step.skill !== o.selection.skill || step.step !== o.selection.step) { held.push({ reason: "other-step", id: r.id }); continue; }
      if (based.at > o.cutoff) { held.push({ reason: "version-after-cutoff", id: r.id }); continue; }
      if (recorded > o.cutoff) { held.push({ reason: "after-cutoff", id: r.id }); continue; }
      const key = JSON.stringify([identity.workbookId, identity.printedRevision, identity.pageId, identity.itemId]);
      const row = rows.get(key) ?? { identity: { workbookId: identity.workbookId, printedRevision: identity.printedRevision, pageId: identity.pageId, itemId: identity.itemId }, tries: [] };
      row.tries.push({ id: r.id, at: recorded, basedOnResultVersion: r.based_on_version, result: r.result, help: r.help });
      rows.set(key, row);
    }
    const out = [...rows.entries()].sort(([a], [b]) => a < b ? -1 : 1)
      .map(([, r]) => ({ identity: r.identity, tries: r.tries.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)) }));
    return structuredClone({ ok: true as const, boundaryAt: boundary, held: held.sort((a, b) => a.id < b.id ? -1 : 1),
      corrections: { reference: `workbook_second_tries:${o.baselineId}:${sourceHash(JSON.parse(JSON.stringify(out)))}`, completeThrough: o.cutoff, rows: out } });
  } catch { return refuse("ledger-incomplete"); }
}
