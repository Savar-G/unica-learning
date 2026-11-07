import "server-only";
import { isDeepStrictEqual as same } from "node:util";
import type { ItemIdentity, Observation, HelpState, MarkResult } from "./scan-observation";
import type { ProgressOriginal } from "./workbook-progress";
import type { HistoryChangeRow, HistoryMarkRow } from "./workbook-progress-history";
import { isUuid } from "./workbook-content";
import { sourceHash } from "./workbook-progress-hash";

export const CORRECTION_JOURNAL_ENGINE = "child-written-correction/1;journal-before-attempt/1";
export interface CorrectionAdmission {
  id: string;
  parentId: string;
  childId: string;
  identity: ItemIdentity;
  original: { itemRowId: string; resultVersion: number; observationHash: string; eventId: string };
  admittedAt: number;
}
export interface CorrectionOutcome {
  attemptId: string;
  at: number;
  source: "child-written-answer";
  result: MarkResult;
  help: HelpState;
  evidenceReference: string;
}
export interface Book1CorrectionJournal {
  version: 1;
  engine: typeof CORRECTION_JOURNAL_ENGINE;
  baselineHash: string;
  boundaryAt: number;
  /** Read under the canonical scan lock. Zero was established before any admitted activity. */
  initialActivity: { items: 0; changes: 0; events: 0; attempts: 0 };
  completeThrough: number;
  counts: { admissions: number; outcomes: number };
  admissions: CorrectionAdmission[];
  outcomes: CorrectionOutcome[];
  /** The Book1-only loader checks the complete issued book set. No repeated decision is inferred from a book count. */
  issued: { policy: "book1-initialization-only/1"; completeThrough: number; otherIssuedBooks: 0 };
}
export type JournalResult = { ok: true; reference: string; rows: { identity: ItemIdentity; tries: ProgressOriginal["secondTries"] }[];
  held: CorrectionAdmission[] } | { ok: false; reason: "correction-proof-incomplete" | "correction-version-conflict" | "unexplained-pre-boundary-activity" };
const time = (n: number) => Number.isSafeInteger(n) && n >= 0;
/** PostgreSQL timestamps round forward so a post-cutoff microsecond never enters the cutoff. */
export function journalTime(s: string): number {
  const fraction = s.match(/\.(\d+)/)?.[1] ?? "";
  return Date.parse(s) + (/[1-9]/.test(fraction.slice(3)) ? 1 : 0);
}
export function readBook1CorrectionJournal(o: { journal: Book1CorrectionJournal; baselineHash: string; boundaryAt: number;
  parentId: string; childId: string; workbookId: string; printedRevision: string; cutoff: number;
  items: HistoryMarkRow[]; changes: HistoryChangeRow[] }): JournalResult {
  const refuse = (reason: Extract<JournalResult, { ok: false }>["reason"]): JournalResult => ({ ok: false, reason });
  try {
    const j = o.journal;
    if (j.version !== 1 || j.engine !== CORRECTION_JOURNAL_ENGINE || j.baselineHash !== o.baselineHash || j.boundaryAt !== o.boundaryAt
      || !time(j.boundaryAt) || j.boundaryAt > o.cutoff || j.completeThrough !== o.cutoff
      || !same(j.initialActivity, { items: 0, changes: 0, events: 0, attempts: 0 })
      || j.counts.admissions !== j.admissions.length || j.counts.outcomes !== j.outcomes.length
      || j.issued.policy !== "book1-initialization-only/1" || j.issued.completeThrough !== o.cutoff || j.issued.otherIssuedBooks !== 0)
      return refuse("correction-proof-incomplete");
    if (o.items.some(m => journalTime(m.evidence_at) < j.boundaryAt) || o.changes.some(c => journalTime(c.changed_at) < j.boundaryAt
      || journalTime((c.previous as unknown as HistoryMarkRow).evidence_at) < j.boundaryAt)) return refuse("unexplained-pre-boundary-activity");
    const ids = new Set<string>(), outcomeIds = new Set<string>(), held: CorrectionAdmission[] = [];
    const rows = new Map<string, { identity: ItemIdentity; tries: ProgressOriginal["secondTries"][number][] }>();
    for (const r of j.outcomes) {
      if (!isUuid(r.attemptId) || outcomeIds.has(r.attemptId) || !time(r.at) || r.source !== "child-written-answer"
        || !["right", "wrong", "blank"].includes(r.result) || !["none", "math-help", "unknown"].includes(r.help)
        || typeof r.evidenceReference !== "string" || !r.evidenceReference.trim() || !j.admissions.some(a => a.id === r.attemptId)) return refuse("correction-version-conflict");
      outcomeIds.add(r.attemptId);
    }
    for (const a of j.admissions) {
      if (!isUuid(a.id) || ids.has(a.id) || a.parentId !== o.parentId || a.childId !== o.childId || a.identity.workbookId !== o.workbookId
        || a.identity.printedRevision !== o.printedRevision || !time(a.admittedAt) || a.admittedAt < j.boundaryAt) return refuse("correction-version-conflict");
      ids.add(a.id);
      const mark = o.items.find(m => m.id === a.original.itemRowId);
      if (!mark || mark.parent_id !== o.parentId || mark.child_id !== o.childId || mark.event_id !== a.original.eventId) return refuse("correction-version-conflict");
      const chain = o.changes.filter(c => c.item_id === mark.id).sort((a, b) => a.to_version - b.to_version);
      const versions = [...chain.map(c => c.previous as unknown as HistoryMarkRow), mark];
      const original = versions.find(m => m.result_version === a.original.resultVersion);
      const next = chain.find(c => c.from_version === a.original.resultVersion);
      const observation = original?.observation as unknown as Observation;
      if (!original || sourceHash(original.observation) !== a.original.observationHash || !same(observation.identity, a.identity)
        || journalTime(original.evidence_at) > a.admittedAt || next && journalTime(next.changed_at) <= a.admittedAt
        || !["wrong", "blank"].includes(observation.result!) || !["scored", "parent-checked"].includes(observation.state)
        || observation.state === "scored" && observation.certainty !== "certain") return refuse("correction-version-conflict");
      const result = j.outcomes.find(r => r.attemptId === a.id);
      if (result && result.at < a.admittedAt) return refuse("correction-version-conflict");
      if (a.admittedAt > o.cutoff) { held.push(a); continue; }
      if (!result || result.at > o.cutoff) return refuse("correction-proof-incomplete");
      const key = sourceHash(a.identity), row = rows.get(key) ?? { identity: a.identity, tries: [] };
      row.tries.push({ id: a.id, at: result.at, basedOnResultVersion: a.original.resultVersion, result: result.result, help: result.help });
      rows.set(key, row);
    }
    return structuredClone({ ok: true, reference: `correction-journal:${sourceHash(j)}`,
      rows: [...rows.values()].map(r => ({ ...r, tries: r.tries.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)) })), held });
  } catch { return refuse("correction-proof-incomplete"); }
}
