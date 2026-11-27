// The working copy in memory, with the rules of bank_write_level: a write names the version it read, a sheet id
// belongs to one level, a revised item never changes without a higher revision (bank_require_new_revision), and a write
// is whole or nothing. Rows go in and come out as copies. Reviews, snapshots and snapshot items are insert only, with
// the rules of bank_freeze_level (memory-snapshots.ts).
import { randomUUID } from "node:crypto";
import { canonicalJson } from "@/lib/workbook-v2/hash";
import { draftFromRows } from "./draft";
import { memorySnapshotStore, type MemorySnapshotTables } from "./memory-snapshots";
import type { BankStore, LevelRow, LevelRows, LevelWrite, QuestionRow, RegionPackRow, ReviewKind, ScenarioRow, SheetRow, TopicRow, WriteResult } from "./types";

export interface MemoryBankTables extends MemorySnapshotTables {
  levels: Map<string, { row: LevelRow; version: string }>;
  topics: Map<string, TopicRow>;
  sheets: Map<string, SheetRow>;
  questions: Map<string, QuestionRow>;
  scenarios: Map<string, ScenarioRow>;
  regionPacks: Map<string, RegionPackRow>;
}

export type MemoryBankStore = BankStore & { tables: MemoryBankTables };

const copy = <T>(value: T): T => structuredClone(value);
const inLevel = <T extends { level_id: string }>(rows: Map<string, T>, levelId: string): T[] => [...rows.values()].filter((row) => row.level_id === levelId).map(copy);
const keyOf = (row: { level_id: string; id: string }) => `${row.level_id}/${row.id}`;

/** Fields an edit may change without a new revision: the state, and the admin-only fields that no snapshot holds. */
const UNREVISED = new Set(["revision", "status", "level_band", "clock_format", "date_format", "grade_names"]);
const revisedFields = (row: object): string => canonicalJson(Object.fromEntries(Object.entries(row).filter(([key]) => !UNREVISED.has(key))));
type Revisable = { level_id: string; revision: number };

export function memoryBankStore({ uuid = randomUUID }: { uuid?: () => string } = {}): MemoryBankStore {
  const tables: MemoryBankTables = {
    levels: new Map(), topics: new Map(), sheets: new Map(), questions: new Map(), scenarios: new Map(), regionPacks: new Map(),
    reviews: [], snapshots: new Map(), snapshotItems: new Map(),
  };
  let writes = 0;

  const rowsOf = (levelId: string): LevelRows => {
    const level = tables.levels.get(levelId);
    return {
      level: level ? copy(level.row) : null,
      version: level?.version ?? null,
      topics: inLevel(tables.topics, levelId),
      sheets: inLevel(tables.sheets, levelId),
      questions: inLevel(tables.questions, levelId),
      scenarios: inLevel(tables.scenarios, levelId),
      regionPacks: inLevel(tables.regionPacks, levelId),
    };
  };
  const readLevel = async (levelId: string): Promise<LevelRows> => rowsOf(levelId);
  const liveRevision = (levelId: string, kind: ReviewKind, key: string): number | null => {
    const row = kind === "sheet" ? tables.sheets.get(key)
      : { question: tables.questions, scenario: tables.scenarios, region_pack: tables.regionPacks }[kind].get(`${levelId}/${key}`);
    return row && row.level_id === levelId && row.status !== "retired" ? row.revision : null;
  };

  /** The revision rule of each revised row: never lower, higher when a field changes, above every review of a new row. */
  const revisionProblems = <T extends Revisable>(kind: string, rows: readonly T[], table: Map<string, T>, keyOfRow: (row: T) => string, itemKey: (row: T) => string): string[] =>
    rows.flatMap((row) => {
      const old = table.get(keyOfRow(row));
      const name = `${kind} "${itemKey(row)}"`;
      if (old && row.revision < old.revision) return [`${name} would go back from revision ${old.revision} to ${row.revision}`];
      if (old && row.revision === old.revision && revisedFields({ ...row, level_id: old.level_id }) !== revisedFields(old)) return [`${name} changes and keeps revision ${row.revision}`];
      const reviewed = old ? 0 : Math.max(0, ...tables.reviews.filter((r) => r.level_id === row.level_id && r.item_kind === kind && r.item_key === itemKey(row)).map((r) => r.revision));
      return row.revision <= reviewed ? [`${name} comes back at revision ${row.revision}, which a review already names`] : [];
    });

  const writeLevel = async (write: LevelWrite): Promise<WriteResult> => {
    const id = write.level.id;
    const current = tables.levels.get(id);
    if ((current?.version ?? null) !== write.expected) return { ok: false, problem: `bank level ${id}: it changed since it was read` };
    const taken = write.sheets.filter((sheet) => { const owner = tables.sheets.get(sheet.sheet_id); return owner && owner.level_id !== id; }).map((sheet) => sheet.sheet_id).sort();
    if (taken.length > 0) return { ok: false, problem: `bank level ${id}: the sheet ids ${taken.join(", ")} belong to another level` };
    const inThis = <T extends { level_id: string }>(rows: readonly T[]): T[] => rows.map((row) => ({ ...row, level_id: id }));
    const unrevised = [
      ...revisionProblems("sheet", inThis(write.sheets), tables.sheets, (row) => row.sheet_id, (row) => row.sheet_id),
      ...revisionProblems("question", inThis(write.questions), tables.questions, keyOf, (row) => row.id),
      ...revisionProblems("scenario", inThis(write.scenarios), tables.scenarios, keyOf, (row) => row.id),
      ...revisionProblems("region_pack", inThis(write.regionPacks), tables.regionPacks, keyOf, (row) => row.id),
    ];
    if (unrevised.length > 0) return { ok: false, problem: `bank level ${id}: an edit needs a new revision: ${unrevised.join("; ")}` };
    const version = `v${++writes}`;
    tables.levels.set(id, { row: copy(write.level), version });
    for (const row of write.topics) tables.topics.set(keyOf(row), copy({ ...row, level_id: id }));
    for (const row of write.regionPacks) tables.regionPacks.set(keyOf(row), copy({ ...row, level_id: id }));
    for (const row of write.scenarios) tables.scenarios.set(keyOf(row), copy({ ...row, level_id: id }));
    for (const row of write.questions) tables.questions.set(keyOf(row), copy({ ...row, level_id: id }));
    for (const row of write.sheets) tables.sheets.set(row.sheet_id, copy({ ...row, level_id: id }));
    return { ok: true, version };
  };

  return {
    tables, readLevel, writeLevel, exportLevelDraft: async (levelId) => draftFromRows(await readLevel(levelId)),
    ...memorySnapshotStore(tables, { rowsOf, versionOf: (levelId) => tables.levels.get(levelId)?.version ?? null, liveRevision }, uuid),
  };
}
