import { describe, expect, it } from "vitest";
import type { SkillState, StandardSkillState } from "@/lib/assessment/skill-state";
import { PACIFIC_ZONE, familyZone } from "@/lib/family-time";
import {
  REPEATED_MISTAKE_DAYS, STRUGGLING_BELOW_PERCENT, STRUGGLING_MIN_ANSWERS, STRUGGLING_WINDOW_DAYS, countsAsNeedsHelp, isStruggling, needsHelpStandards, repeatedMistakes, type HelpMark,
} from "@/lib/needs-help";

// The dashboard's Needs help rule (#1025), through the module's public interface. The family is in Pacific time (UTC-7
// in November 2026, src/lib/family-time.ts). "Now" is Thursday 2026-11-12, noon in Vancouver. The 14-day window is
// the family-time days 2026-10-30 to 2026-11-12, today included.
const NOW = Date.parse("2026-11-12T20:00:00Z");
const zone = PACIFIC_ZONE;
const EASTERN = familyZone({ province: "ON" });

const mark = (right: boolean, at: string, standard = "3.3"): HelpMark => ({ standard, right, review: false, at, blank: false });
/** An answer left blank: not right, as the skill state rule reads it, but flagged for this rule. */
const blank = (at: string, standard = "3.3"): HelpMark => ({ ...mark(false, at, standard), blank: true });
/** `rights` as marks, all at noon UTC of one day (the same calendar day in every Canadian zone). */
const on = (day: string, rights: boolean[], standard = "3.3") => rights.map((right) => mark(right, `${day}T19:00:00Z`, standard));
const state = (standard: string, s: SkillState): StandardSkillState => ({ standard, state: s, reason: "in_workbook", evidence: "workbook", evidenceAt: null });

describe("the rule's named numbers", () => {
  it("are the ones Cedric approved on 2026-11-14", () => {
    expect([STRUGGLING_BELOW_PERCENT, STRUGGLING_MIN_ANSWERS, STRUGGLING_WINDOW_DAYS]).toEqual([60, 4, 14]);
  });
});

describe("struggling now: fewer than 60% right on at least 4 marked answers in the last 14 days", () => {
  it("3 answers, all wrong, are too few to say", () => {
    expect(isStruggling(on("2026-11-10", [false, false, false]), NOW, zone)).toBe(false);
  });
  it("4 answers, all wrong, count", () => {
    expect(isStruggling(on("2026-11-10", [false, false, false, false]), NOW, zone)).toBe(true);
  });
  it("exactly 60% right does not count (3 of 5)", () => {
    expect(isStruggling(on("2026-11-10", [true, true, true, false, false]), NOW, zone)).toBe(false);
  });
  it("59% right counts (13 of 22 is 59.09%)", () => {
    const rights = [...Array<boolean>(13).fill(true), ...Array<boolean>(9).fill(false)];
    expect(rights.length).toBe(22);
    expect(isStruggling(on("2026-11-10", rights), NOW, zone)).toBe(true);
  });
  it("one answer under 60% counts, with no rounding (2 of 4 is 50%; 7 of 12 is 58.3%; 3 of 5 is 60%)", () => {
    expect(isStruggling(on("2026-11-10", [true, true, false, false]), NOW, zone)).toBe(true);
    expect(isStruggling(on("2026-11-10", [...Array<boolean>(7).fill(true), ...Array<boolean>(5).fill(false)]), NOW, zone)).toBe(true);
    expect(isStruggling(on("2026-11-10", [true, true, true, false, false]), NOW, zone)).toBe(false);
  });
  it("answers that are mostly right do not count", () => {
    expect(isStruggling(on("2026-11-10", [true, true, true, true, false]), NOW, zone)).toBe(false);
    expect(isStruggling(on("2026-11-10", [true, true, true, true]), NOW, zone)).toBe(false);
  });
  it("counts review items and page items alike, and nothing without marks", () => {
    const mixed = [mark(false, "2026-11-10T19:00:00Z"), { ...mark(false, "2026-11-10T19:00:00Z"), review: true }, mark(false, "2026-11-11T19:00:00Z"), { ...mark(false, "2026-11-11T19:00:00Z"), review: true }];
    expect(isStruggling(mixed, NOW, zone)).toBe(true);
    expect(isStruggling([], NOW, zone)).toBe(false);
  });
  it("a blank answer is neither an answer nor a wrong one: 4 blanks do not count", () => {
    expect(isStruggling([1, 2, 3, 4].map(() => blank("2026-11-10T19:00:00Z")), NOW, zone)).toBe(false);
  });
  it("3 wrong and 1 blank are 3 answers, under 4, so they do not count", () => {
    expect(isStruggling([...on("2026-11-10", [false, false, false]), blank("2026-11-10T19:00:00Z")], NOW, zone)).toBe(false);
  });
  it("4 wrong answers count, with or without blanks beside them", () => {
    expect(isStruggling(on("2026-11-10", [false, false, false, false]), NOW, zone)).toBe(true);
    expect(isStruggling([...on("2026-11-10", [false, false, false, false]), blank("2026-11-10T19:00:00Z"), blank("2026-11-11T19:00:00Z")], NOW, zone)).toBe(true);
  });
  it("blanks do not dilute the percent: 2 right, 2 wrong and many blanks is 50%, struggling; 3 right, 2 wrong and a blank is 60%, not", () => {
    const blanks = [1, 2, 3, 4, 5].map(() => blank("2026-11-10T19:00:00Z"));
    expect(isStruggling([...on("2026-11-10", [true, true, false, false]), ...blanks], NOW, zone)).toBe(true);
    expect(isStruggling([...on("2026-11-10", [true, true, true, false, false]), blank("2026-11-10T19:00:00Z")], NOW, zone)).toBe(false);
  });
  it("ignores a mark with no readable time", () => {
    expect(isStruggling([...on("2026-11-10", [false, false, false]), mark(false, "not a time")], NOW, zone)).toBe(false);
  });
});

describe("the 14-day window", () => {
  it("ignores answers older than 14 days", () => {
    // 2026-10-29 is the 15th day back: out. 4 wrong answers there are no evidence now.
    expect(isStruggling(on("2026-10-29", [false, false, false, false]), NOW, zone)).toBe(false);
  });
  it("counts the 14th day back (2026-10-30) and today", () => {
    expect(isStruggling(on("2026-10-30", [false, false, false, false]), NOW, zone)).toBe(true);
    expect(isStruggling(on("2026-11-12", [false, false, false, false]), NOW, zone)).toBe(true);
  });
  it("leaves the old answers out of the count, not just out of the verdict: 3 recent and 5 old wrong are 3 answers", () => {
    expect(isStruggling([...on("2026-11-11", [false, false, false]), ...on("2026-10-01", [false, false, false, false, false])], NOW, zone)).toBe(false);
  });
  it("answers dated after today are left out", () => {
    expect(isStruggling(on("2026-11-13", [false, false, false, false]), NOW, zone)).toBe(false);
  });
});

describe("a skill that recovers", () => {
  const struggling = on("2026-11-05", [false, false, false, false]);
  it("stops counting once new right answers lift it to 60% or more", () => {
    expect(isStruggling(struggling, NOW, zone)).toBe(true);
    // 4 wrong then 6 right is 6 of 10: exactly 60%, not counted.
    expect(isStruggling([...struggling, ...on("2026-11-11", [true, true, true, true, true, true])], NOW, zone)).toBe(false);
    // 5 right is 5 of 9: 55%, still counted.
    expect(isStruggling([...struggling, ...on("2026-11-11", [true, true, true, true, true])], NOW, zone)).toBe(true);
  });
  it("stops counting when the wrong answers age out of the window, and with too few answers left", () => {
    const old = on("2026-11-05", [false, false, false, false]);
    expect(isStruggling(old, Date.parse("2026-11-18T20:00:00Z"), zone)).toBe(true);
    // 2026-11-05 is the first day of the window on 2026-11-18; one day later it is out.
    expect(isStruggling(old, Date.parse("2026-11-19T20:00:00Z"), zone)).toBe(false);
  });
});

describe("the family's time zone", () => {
  it("dates an answer by the family's own day: the same instant is in the window in one zone and out of it in another", () => {
    // 05:00 UTC on 2026-10-30: 22:00 on 2026-10-29 in Vancouver (out), 01:00 on 2026-10-30 in Ontario (in).
    const edge = [false, false, false, false].map(() => mark(false, "2026-10-30T05:00:00Z"));
    expect(isStruggling(edge, NOW, PACIFIC_ZONE)).toBe(false);
    expect(isStruggling(edge, NOW, EASTERN)).toBe(true);
  });
  it("moves today with the family too: an answer late on the family's today is in, even when UTC is already tomorrow", () => {
    // 04:00 UTC on 2026-11-13 is 21:00 on 2026-11-12 in Vancouver: today for them.
    const late = [false, false, false, false].map(() => mark(false, "2026-11-13T04:00:00Z"));
    expect(isStruggling(late, NOW, PACIFIC_ZONE)).toBe(true);
  });
});

describe("what counts as Needs help", () => {
  const wrong = on("2026-11-10", [false, false, false, false]);
  it("a needs_review skill always does, with or without marks", () => {
    expect(countsAsNeedsHelp("needs_review", [], NOW, zone)).toBe(true);
    expect(countsAsNeedsHelp("needs_review", on("2026-11-10", [true, true, true, true]), NOW, zone)).toBe(true);
  });
  it("a Learning skill does only while struggling", () => {
    expect(countsAsNeedsHelp("working_on", wrong, NOW, zone)).toBe(true);
    expect(countsAsNeedsHelp("working_on", on("2026-11-10", [false, false, false]), NOW, zone)).toBe(false);
  });
  it("no other state does: Mastered and Not started keep their state, whatever the marks", () => {
    expect(countsAsNeedsHelp("mastered", wrong, NOW, zone)).toBe(false);
    expect(countsAsNeedsHelp("not_started", wrong, NOW, zone)).toBe(false);
  });
  it("a Learning skill with only blank answers is not struggling, and a blank never turns a skill to Needs help", () => {
    const blanks = [1, 2, 3, 4].map(() => blank("2026-11-10T19:00:00Z"));
    expect(countsAsNeedsHelp("working_on", blanks, NOW, zone)).toBe(false);
    expect([...needsHelpStandards([state("3.3", "working_on")], blanks, NOW, zone)]).toEqual([]);
    expect([...needsHelpStandards([state("3.3", "working_on")], [...blanks, ...on("2026-11-10", [false, false, false, false])], NOW, zone)]).toEqual(["3.3"]);
  });
  it("is read per standard: another standard's wrong answers are not this one's", () => {
    const states = [state("3.3", "working_on"), state("3.4", "working_on"), state("3.5", "needs_review"), state("3.6", "mastered")];
    const marks = [...on("2026-11-10", [false, false, false, false], "3.3"), ...on("2026-11-10", [true, true, true, true], "3.4"), ...on("2026-11-10", [false, false, false, false], "3.6")];
    expect([...needsHelpStandards(states, marks, NOW, zone)]).toEqual(["3.3", "3.5"]);
  });
  it("answers on a standard in several marks lists add up, in any order", () => {
    const states = [state("3.3", "working_on")];
    const marks = [mark(false, "2026-11-11T19:00:00Z"), ...on("2026-11-10", [true], "3.4"), mark(false, "2026-11-09T19:00:00Z"), mark(true, "2026-11-08T19:00:00Z"), mark(false, "2026-11-07T19:00:00Z")];
    expect(needsHelpStandards(states, marks, NOW, zone).has("3.3")).toBe(true);
  });
});

describe("a skill that keeps coming up wrong (#990)", () => {
  const help = new Set(["3.3", "3.4"]);
  /** A wrong answer marked at `at`, on page "Day `bookDay`" of a book (null: a page with no day label). */
  const wrongOn = (at: string, bookDay: number | null, standard = "3.3", book = "book-1"): HelpMark => ({ ...mark(false, at, standard), day: bookDay === null ? null : `${book}:${bookDay}` });
  it("needs a wrong answer on at least 2 different workbook days, marked in the last 14 days", () => {
    expect(REPEATED_MISTAKE_DAYS).toBe(2);
    const marks = [wrongOn("2026-11-10T19:00:00Z", 1), wrongOn("2026-11-10T19:00:00Z", 1), wrongOn("2026-11-11T19:00:00Z", 2)];
    expect(repeatedMistakes(help, marks, NOW, zone)).toEqual([{ standard: "3.3", days: 2, lastAt: Date.parse("2026-11-11T19:00:00Z") }]);
  });
  it("three wrong answers on one workbook day are one day, not a repeat", () => {
    expect(repeatedMistakes(help, [1, 2, 3].map(() => wrongOn("2026-11-10T19:00:00Z", 4)), NOW, zone)).toEqual([]);
  });
  it("counts workbook days, not marking days: one evening's marking that crosses midnight is one day", () => {
    // 11:30 p.m. on 2026-11-10 and 12:30 a.m. on 2026-11-11 in Vancouver: two calendar days of marking, one page's Day 3.
    const evening = [wrongOn("2026-11-11T07:30:00Z", 3), wrongOn("2026-11-11T08:30:00Z", 3)];
    expect(repeatedMistakes(help, evening, NOW, zone)).toEqual([]);
    // The same two marks on two different pages' days are a repeat, whatever the hour.
    expect(repeatedMistakes(help, [wrongOn("2026-11-11T07:30:00Z", 3), wrongOn("2026-11-11T08:30:00Z", 4)], NOW, zone).map((m) => m.days)).toEqual([2]);
  });
  it("counts workbook days when a week of pages is scanned at once: one marking day, three workbook days", () => {
    const together = [1, 2, 3].map((day) => wrongOn("2026-11-11T19:00:00Z", day));
    expect(repeatedMistakes(help, together, NOW, zone).map((m) => m.days)).toEqual([3]);
  });
  it("the same Day number in two books is two workbook days", () => {
    const books = [wrongOn("2026-11-02T19:00:00Z", 2, "3.3", "book-1"), wrongOn("2026-11-11T19:00:00Z", 2, "3.3", "book-2")];
    expect(repeatedMistakes(help, books, NOW, zone).map((m) => m.days)).toEqual([2]);
  });
  it("counts only days, never the answers: right answers, blanks, old marks and pages with no day do not count", () => {
    const marks = [
      { ...mark(true, "2026-11-10T19:00:00Z"), day: "book-1:1" }, { ...blank("2026-11-11T19:00:00Z"), day: "book-1:2" },
      wrongOn("2026-11-12T19:00:00Z", 3), wrongOn("2026-10-20T19:00:00Z", 4), wrongOn("2026-10-20T19:00:00Z", 5),
      wrongOn("2026-11-11T19:00:00Z", null), ...on("2026-11-10", [false]),
    ];
    expect(repeatedMistakes(help, marks, NOW, zone)).toEqual([]);
  });
  it("leaves out a skill that is not in Needs help, a mark after today and a mark with no readable time", () => {
    expect(repeatedMistakes(new Set(["3.4"]), [wrongOn("2026-11-10T19:00:00Z", 1), wrongOn("2026-11-11T19:00:00Z", 2)], NOW, zone)).toEqual([]);
    expect(repeatedMistakes(help, [wrongOn("2026-11-12T19:00:00Z", 1), wrongOn("2026-11-13T19:00:00Z", 2)], NOW, zone)).toEqual([]);
    expect(repeatedMistakes(help, [wrongOn("soon", 1), wrongOn("2026-11-12T19:00:00Z", 2)], NOW, zone)).toEqual([]);
  });
  it("dates a mark's window by the family's own day: a mark in the 14 days counts, 15 days ago does not", () => {
    // 2026-10-30 is the first family-time day of the window.
    expect(repeatedMistakes(help, [wrongOn("2026-10-30T19:00:00Z", 1), wrongOn("2026-11-12T19:00:00Z", 2)], NOW, zone)).toHaveLength(1);
    expect(repeatedMistakes(help, [wrongOn("2026-10-30T06:00:00Z", 1), wrongOn("2026-11-12T19:00:00Z", 2)], NOW, zone)).toEqual([]);
  });
  it("lists the skill with the most days first, then the most recent", () => {
    const marks = [wrongOn("2026-11-08T19:00:00Z", 1, "3.4"), wrongOn("2026-11-09T19:00:00Z", 2, "3.4"), wrongOn("2026-11-10T19:00:00Z", 3, "3.4"), wrongOn("2026-11-11T19:00:00Z", 1, "3.3"), wrongOn("2026-11-12T19:00:00Z", 2, "3.3")];
    expect(repeatedMistakes(help, marks, NOW, zone).map((m) => [m.standard, m.days])).toEqual([["3.4", 3], ["3.3", 2]]);
  });
});
