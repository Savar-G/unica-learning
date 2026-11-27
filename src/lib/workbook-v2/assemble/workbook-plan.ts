// A book planned from a level config: the request of `planNextBook` at the config's pace, the day and printed pages of
// each sheet, and the facts that the 4 cover pages print. Workbook 1 is the same for every child who starts at the same
// sheet of a level: the queue, the config and the snapshot decide the sheets, and only the child's id (and so the
// numbers of the questions and the QR texts) differs. Pure, with no decision on a level: the config is data.
import type { Snapshot } from "../bank/snapshot";
import { readLevelConfig, type LevelConfig, type ReadLevelConfig } from "./level-config";
import { COVER_PAGES, dayOf, planNextBook, type BookRequestJson, type NextBookInput } from "./plan-book";
import type { MayaNudge, QueueEntry } from "./position";

export interface WorkbookPlanInput extends Omit<NextBookInput, "pagesPerDay" | "days" | "sheetsCount"> {
  /** The pace and the mastery line of the book, as data. */
  levelConfig: LevelConfig;
}

/** A sheet of the book: its place in the queue, its day from 1, and its printed page numbers (front, back), as `IssuedSheet.pages` wants them. */
export interface WorkbookSheet extends QueueEntry { day: number; pages: [number, number] }

export interface CoverTopic { id: string; code: string; title: string }

export interface DayCoverFact {
  /** The day, from 1. */
  day: number;
  /** The sheets of the day, in the order of the book. */
  sheetIds: string[];
  /** The count of the sheets of the day. */
  sheets: number;
  /**
   * The first and last interior pages of the day. Interior page 1 is the front of the first sheet, the first page after
   * the inside front cover. These are places in the booklet; the page number printed on a sheet is its bank page.
   */
  startPage: number;
  endPage: number;
  /** Every topic of the day, each one time, in the order the day meets them. There is no limit on topics a day. */
  topics: CoverTopic[];
  /** The sheets of the day that are a repeat (attempt 2 or later). */
  repeatCount: number;
}

export interface CoverFacts {
  coverPages: typeof COVER_PAGES;
  /** Two pages for each sheet. */
  interiorPages: number;
  /** Interior and cover pages: a multiple of 4, at most MAX_TOTAL_PAGES. */
  totalPages: number;
  pagesPerDay: number;
  minutesPerPage: number;
  days: DayCoverFact[];
}

export type WorkbookPlan =
  | { ok: true; request: BookRequestJson; sheets: WorkbookSheet[]; coverFacts: CoverFacts; mayaNudges: MayaNudge[]; teamNotices: string[] }
  | { ok: false; problems: string[] };

/** The day and printed pages of each chosen sheet, at the config's pace. */
export function workbookSheets(chosen: readonly QueueEntry[], snapshot: Snapshot, pace: ReadLevelConfig): WorkbookSheet[] {
  return chosen.map((entry, i) => {
    const sheet = snapshot.sheets.get(entry.sheetId);
    if (!sheet) throw new Error(`the sheet "${entry.sheetId}" is not in the snapshot`);
    return { ...entry, day: dayOf(i, pace.pagesPerDay, pace.days), pages: [sheet.firstPage, sheet.firstPage + 1] };
  });
}

/** The facts that the cover prints: its size and, for each day that has sheets, the sheets, pages and topics. */
export function coverFactsOf(sheets: readonly WorkbookSheet[], snapshot: Snapshot, pace: ReadLevelConfig): CoverFacts {
  const days: DayCoverFact[] = [];
  sheets.forEach((planned, i) => {
    const sheet = snapshot.sheets.get(planned.sheetId);
    if (!sheet) throw new Error(`the sheet "${planned.sheetId}" is not in the snapshot`);
    let fact = days.at(-1);
    if (!fact || fact.day !== planned.day) {
      fact = { day: planned.day, sheetIds: [], sheets: 0, startPage: 2 * i + 1, endPage: 2 * i + 2, topics: [], repeatCount: 0 };
      days.push(fact);
    }
    fact.sheetIds.push(planned.sheetId);
    fact.sheets += 1;
    fact.endPage = 2 * i + 2;
    if (planned.attempt > 1) fact.repeatCount += 1;
    const { id, code, title } = sheet.topic;
    if (!fact.topics.some((t) => t.id === id)) fact.topics.push({ id, code, title });
  });
  const interiorPages = 2 * sheets.length;
  return { coverPages: COVER_PAGES, interiorPages, totalPages: interiorPages + COVER_PAGES, pagesPerDay: pace.pagesPerDay, minutesPerPage: pace.minutesPerPage, days };
}

/**
 * The next book at the pace of a level config: the first sheets of the queue (repeats first, then new sheets in the order
 * of the level), `pagesPerDay / 2` a day for the config's days, an even count of at most MAX_SHEETS so that the book with
 * its cover is a multiple of 4 pages and at most MAX_TOTAL_PAGES, with its cover facts. The nudges to Maya and the team
 * notices of the position come with it, for the caller to send; nothing of them is printed.
 */
export function planWorkbook(input: WorkbookPlanInput): WorkbookPlan {
  const read = readLevelConfig(input.levelConfig);
  if (!read.ok) return read;
  const pace = read.config;
  const next = planNextBook({ ...input, pagesPerDay: pace.pagesPerDay, days: pace.days, sheetsCount: undefined });
  if (!next.ok) return next;
  const sheets = workbookSheets(next.sheets, input.snapshot, pace);
  return {
    ok: true, request: next.request, sheets, coverFacts: coverFactsOf(sheets, input.snapshot, pace),
    mayaNudges: input.position.mayaNudges, teamNotices: input.position.teamNotices,
  };
}
