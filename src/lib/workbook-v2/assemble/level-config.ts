// The pace and the mastery line of a book, as data. The assembler reads only the fields of a config and never asks
// which level it is for: a difference between levels is a different config (scripts/engine-guard.mjs, engine-level-branch).
import { FieldReader } from "../bank/fields";
import { plainCopy } from "../bank/plain";
import type { ResultConfig } from "../results/sheet-results";

/** The days of a book when a config gives none: Monday to Friday, two weeks. */
export const DEFAULT_DAYS = 10;

export interface LevelConfig extends ResultConfig {
  /** Pages a day: an even whole number, 2 or more, so that a day is whole sheets. */
  pagesPerDay: number;
  /** The minutes that one page should take. Printed on the cover plan; it decides nothing in the assembler. */
  minutesPerPage: number;
  /** The days of the book, DEFAULT_DAYS when not given. */
  days?: number;
}

/** A config that was read: every field is there and good. */
export type ReadLevelConfig = Required<LevelConfig>;

/**
 * The Workbook 1 configs confirmed in UNI-167 (2026-11-26), with the mastery line of product spec 7.3 (90% at Levels 1
 * to 6, 80% from Level 7). Each record names the levels it is for by the snapshot's `level.name`. This is data for the
 * caller, which picks the record of a child's level outside the engine; the assembler takes the config alone. Level 1
 * and Calc 1 and 2 have no confirmed pace yet, so they have no record.
 */
export const WORKBOOK_1_PACES: readonly { names: readonly string[]; config: LevelConfig }[] = [
  { names: ["2", "3", "4", "5", "6"], config: { pagesPerDay: 10, minutesPerPage: 2, masteryPercent: 90 } },
  { names: ["7", "8", "9"], config: { pagesPerDay: 8, minutesPerPage: 3, masteryPercent: 80 } },
  { names: ["10"], config: { pagesPerDay: 6, minutesPerPage: 4, masteryPercent: 80 } },
  { names: ["11", "12"], config: { pagesPerDay: 4, minutesPerPage: 6, masteryPercent: 80 } },
];

/**
 * The mastery line of every numeric launch level (product spec 7.3: 90% at Levels 1 to 6, 80% from Level 7). Kept as
 * data alongside WORKBOOK_1_PACES so Level 1 has its mastery line even before its Workbook 1 pace is confirmed.
 */
export const LEVEL_MASTERY_PERCENTS: readonly { names: readonly string[]; masteryPercent: number }[] = [
  { names: ["1", "2", "3", "4", "5", "6"], masteryPercent: 90 },
  { names: ["7", "8", "9", "10", "11", "12"], masteryPercent: 80 },
];

const isWhole = (n: unknown, min: number, max = Number.MAX_SAFE_INTEGER): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= min && n <= max;
const show = (value: unknown): string => {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "symbol") return String(value);
  return JSON.stringify(value) ?? String(value);
};

/** The config with its default days, or every problem in plain words. */
export function readLevelConfig(raw: unknown): { ok: true; config: ReadLevelConfig } | { ok: false; problems: string[] } {
  const plain = plainCopy("The pace config", raw);
  if (!plain.ok) return plain;
  const r = new FieldReader();
  const fields = r.object("The pace config", plain.value, ["pagesPerDay", "minutesPerPage", "masteryPercent"], ["days"]);
  if (!fields) return { ok: false, problems: r.problems };
  const pagesPerDay = fields.pagesPerDay;
  const minutesPerPage = fields.minutesPerPage;
  const masteryPercent = fields.masteryPercent;
  const days = Object.hasOwn(fields, "days") ? fields.days : DEFAULT_DAYS;
  const problems = [...r.problems];
  if (!isWhole(pagesPerDay, 2) || pagesPerDay % 2 !== 0) problems.push(`Pages a day must be an even whole number, 2 or more, not ${show(pagesPerDay)}.`);
  if (typeof minutesPerPage !== "number" || !Number.isFinite(minutesPerPage) || minutesPerPage <= 0) problems.push(`Minutes a page must be a number more than 0, not ${show(minutesPerPage)}.`);
  if (!isWhole(masteryPercent, 1, 100)) problems.push(`The mastery percent must be a whole number from 1 to 100, not ${show(masteryPercent)}.`);
  if (!isWhole(days, 1)) problems.push(`Days must be a whole number, 1 or more, not ${show(days)}.`);
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, config: { pagesPerDay, minutesPerPage, masteryPercent, days } as ReadLevelConfig };
}
