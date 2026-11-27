// The working copy of the bank (architecture spec 9.2): one row per level, topic, sheet, question, scenario and region
// pack, as the tables of migration 20261127191913_bank_working_copy hold them. Both stores (memory and Supabase) keep
// these rows; the import and the export are pure code over them, so the two stores cannot disagree.
import type { Json } from "@/lib/database";

export type JsonObject = { [key: string]: Json | undefined };

/** The states of a level. */
export const BANK_LEVEL_STATUSES = ["draft", "live", "retired"] as const;
export type BankLevelStatus = (typeof BANK_LEVEL_STATUSES)[number];
/** The states of a topic, a sheet, a question, a scenario and a region pack. A removed item is retired, never deleted. */
export const BANK_ITEM_STATUSES = ["draft", "approved", "retired"] as const;
export type BankItemStatus = (typeof BANK_ITEM_STATUSES)[number];
/** The kinds of a sheet. There are no review sheets (2026-11-23). */
export const BANK_SHEET_KINDS = ["example", "practice", "word", "test"] as const;
export type BankSheetKind = (typeof BANK_SHEET_KINDS)[number];

export interface LevelRow {
  id: string;
  display_name: string;
  position: number;
  status: BankLevelStatus;
  /** Level settings. `config.draft` holds the id and format of the draft file the level came from. */
  config: JsonObject;
  basis: JsonObject | null;
  default_region: string | null;
}

export interface TopicRow {
  level_id: string;
  id: string;
  code: string;
  position: number;
  title: string;
  child_title: string | null;
  standards_tags: string[];
  basis: JsonObject | null;
  status: BankItemStatus;
}

/** The notes of a sheet, outside its content: of the sheet, of each side and of each row (by row id). */
export interface SheetBasis {
  sheet?: JsonObject;
  front?: JsonObject;
  back?: JsonObject;
  rows?: { [rowId: string]: JsonObject };
}

/** The rows of the items that have a revision. */
interface Revised {
  revision: number;
  status: BankItemStatus;
}

export interface SheetRow extends Revised {
  sheet_id: string;
  level_id: string;
  topic_id: string;
  /** The place of the sheet in its topic. */
  position: number;
  first_page: number;
  kind: BankSheetKind;
  /** Both sides inline (instruction, template, rows), with no note. */
  content: JsonObject;
  basis: SheetBasis;
}

export interface QuestionRow extends Revised {
  level_id: string;
  id: string;
  position: number;
  scenario_kind: string;
  regions: string[] | null;
  slots: JsonObject;
  unit: string;
  solver: Json;
  difficulty: number;
  phrasings: Json[];
  basis: JsonObject | null;
}

export interface ScenarioRow extends Revised {
  level_id: string;
  id: string;
  position: number;
  interest: string;
  level_band: string | null;
  kind: string;
  /** place, container, thing, verb, unit and quantityLimits. */
  content: JsonObject;
  basis: JsonObject | null;
}

export interface RegionPackRow extends Revised {
  level_id: string;
  id: string;
  position: number;
  units: JsonObject;
  coins: JsonObject;
  spelling: JsonObject;
  clock_format: string | null;
  date_format: string | null;
  grade_names: JsonObject | null;
  basis: JsonObject | null;
}

/** Every row of one level, retired ones too. `version` is what a write must name to show it read the latest rows. */
export interface LevelRows {
  level: LevelRow | null;
  version: string | null;
  topics: TopicRow[];
  sheets: SheetRow[];
  questions: QuestionRow[];
  scenarios: ScenarioRow[];
  regionPacks: RegionPackRow[];
}

/** One write of a level: the level row and only the rows that change. */
export interface LevelWrite {
  expected: string | null;
  level: LevelRow;
  topics: TopicRow[];
  sheets: SheetRow[];
  questions: QuestionRow[];
  scenarios: ScenarioRow[];
  regionPacks: RegionPackRow[];
}

export type WriteResult = { ok: true; version: string } | { ok: false; problem: string };

export interface BankStore {
  /** Every row of the level, read in pages so that no PostgREST row cap cuts it short. */
  readLevel(levelId: string): Promise<LevelRows>;
  /** Writes in one step, or nothing: refuses a stale `expected` and a sheet id that another level owns. */
  writeLevel(write: LevelWrite): Promise<WriteResult>;
  /** The level as a draft, from its rows that are not retired; null when there is no such level. */
  exportLevelDraft(levelId: string): Promise<Record<string, unknown> | null>;
}
