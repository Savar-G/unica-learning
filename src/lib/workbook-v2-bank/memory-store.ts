// The working copy in memory, with the rules of bank_write_level: a write names the version it read, a sheet id
// belongs to one level, and a write is whole or nothing. Rows go in and come out as copies.
import { draftFromRows } from "./draft";
import type { BankStore, LevelRow, LevelRows, LevelWrite, QuestionRow, RegionPackRow, ScenarioRow, SheetRow, TopicRow, WriteResult } from "./types";

export interface MemoryBankTables {
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

export function memoryBankStore(): MemoryBankStore {
  const tables: MemoryBankTables = { levels: new Map(), topics: new Map(), sheets: new Map(), questions: new Map(), scenarios: new Map(), regionPacks: new Map() };
  let writes = 0;

  const readLevel = async (levelId: string): Promise<LevelRows> => {
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

  const writeLevel = async (write: LevelWrite): Promise<WriteResult> => {
    const id = write.level.id;
    const current = tables.levels.get(id);
    if ((current?.version ?? null) !== write.expected) return { ok: false, problem: `bank level ${id}: it changed since it was read` };
    const taken = write.sheets.filter((sheet) => { const owner = tables.sheets.get(sheet.sheet_id); return owner && owner.level_id !== id; }).map((sheet) => sheet.sheet_id).sort();
    if (taken.length > 0) return { ok: false, problem: `bank level ${id}: the sheet ids ${taken.join(", ")} belong to another level` };
    const version = `v${++writes}`;
    tables.levels.set(id, { row: copy(write.level), version });
    for (const row of write.topics) tables.topics.set(keyOf(row), copy({ ...row, level_id: id }));
    for (const row of write.regionPacks) tables.regionPacks.set(keyOf(row), copy({ ...row, level_id: id }));
    for (const row of write.scenarios) tables.scenarios.set(keyOf(row), copy({ ...row, level_id: id }));
    for (const row of write.questions) tables.questions.set(keyOf(row), copy({ ...row, level_id: id }));
    for (const row of write.sheets) tables.sheets.set(row.sheet_id, copy({ ...row, level_id: id }));
    return { ok: true, version };
  };

  return { tables, readLevel, writeLevel, exportLevelDraft: async (levelId) => draftFromRows(await readLevel(levelId)) };
}
