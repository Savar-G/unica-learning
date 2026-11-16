import { describe, expect, it } from "vitest";
import { PACIFIC_ZONE } from "@/lib/family-time";
import type { SkillState } from "@/lib/assessment/skill-state";
import { firstBatchAt, masteredSince, movedUpBetween, progressSummary, type StateChange } from "@/lib/progress-series";

// The Progress tab's tiles and line (#1004), through the module's public interface. The family is in Pacific time
// (UTC-7 all year since March 2026, src/lib/family-time.ts). 2026-11-09 is a Monday; "now" is Thursday 2026-11-12, noon in Vancouver.
const NOW = Date.parse("2026-11-12T20:00:00Z");
const zone = PACIFIC_ZONE;

const row = (standard: string, state: SkillState, changedAt: string): StateChange => ({ standard, state, changedAt });
const current = (entries: Record<string, SkillState>) => new Map(Object.entries(entries));
const run = (over: Partial<Parameters<typeof progressSummary>[0]> = {}) =>
  progressSummary({ now: NOW, zone, current: new Map(), history: [], startDay: "2026-11-09", ...over });
const values = (points: { label: string; value: number }[]) => points.map((p) => `${p.label}=${p.value}`);

describe("a family with one week of data", () => {
  const summary = run({
    current: current({ "2.4": "mastered", "2.5": "mastered", "3.1": "needs_review", "3.2": "working_on" }),
    history: [
      row("2.5", "working_on", "2026-11-09T18:00:00Z"),
      row("2.4", "mastered", "2026-11-10T18:00:00Z"),
      row("2.5", "mastered", "2026-11-11T18:00:00Z"),
      row("3.1", "needs_review", "2026-11-11T19:00:00Z"),
    ],
  });
  it("counts the skills mastered and needing help now", () => {
    expect(summary.mastered).toBe(2);
    expect(summary.needsHelp).toBe(1);
  });
  it("counts the standards the dashboard rule says need help (#1025), not only the rule's needs_review", () => {
    const withHelp = run({ current: current({ "2.4": "mastered", "3.1": "needs_review", "3.2": "working_on" }), needsHelp: new Set(["3.1", "3.2"]) });
    expect(withHelp.needsHelp).toBe(2);
    // The same states with no rule's set: needs_review alone.
    expect(run({ current: current({ "2.4": "mastered", "3.1": "needs_review", "3.2": "working_on" }) }).needsHelp).toBe(1);
    // A set never changes what is mastered.
    expect(withHelp.mastered).toBe(1);
  });
  it("gives the week a start point, so the line is never a lone dot", () => {
    expect(values(summary.week.points)).toEqual(["Nov 2=0", "Nov 9=2"]);
  });
  it("counts what is new this week and what moved up", () => {
    expect(summary.week.gain).toBe(2);
    // 2.4 and 2.5 went up; 3.1 went from Not started to Needs review, which is down, and 3.2 only entered the book.
    expect(summary.week.movedUp).toBe(2);
  });
});

describe("Moved up", () => {
  const moved = (cur: Record<string, SkillState>, history: StateChange[]) => run({ current: current(cur), history }).week.movedUp;
  it("counts Needs review to Mastered, Working on to Mastered and Not started to Mastered", () => {
    expect(moved({ a: "mastered", b: "mastered", c: "mastered" }, [
      row("a", "needs_review", "2026-11-02T18:00:00Z"), row("b", "working_on", "2026-11-02T18:00:00Z"),
    ])).toBe(3);
  });
  it("never counts a change into Working on, from any state: that is only the skill entering the workbook", () => {
    expect(moved({ a: "working_on" }, [])).toBe(0);
    expect(movedUpBetween("not_started", "working_on")).toBe(false);
    expect(movedUpBetween("needs_review", "working_on")).toBe(false);
    expect(movedUpBetween("needs_review", "not_started")).toBe(true);
    // A Needs review skill the book came back to is not up until it is Mastered.
    expect(moved({ a: "working_on", b: "mastered" }, [row("a", "needs_review", "2026-11-02T18:00:00Z"), row("b", "needs_review", "2026-11-02T18:00:00Z")])).toBe(1);
  });
  it("does not count a skill that fell, or one that ended where it began", () => {
    expect(moved({ a: "working_on", b: "needs_review", c: "mastered" }, [
      row("a", "mastered", "2026-11-02T18:00:00Z"), row("b", "mastered", "2026-11-02T18:00:00Z"),
      // c was Mastered before the week, lost it and earned it back inside the week.
      row("c", "mastered", "2026-11-02T18:00:00Z"), row("c", "needs_review", "2026-11-10T18:00:00Z"), row("c", "mastered", "2026-11-11T18:00:00Z"),
    ])).toBe(0);
  });
  it("reads history rows in any order", () => {
    const history = [row("a", "mastered", "2026-11-11T18:00:00Z"), row("a", "working_on", "2026-11-10T18:00:00Z")];
    expect(run({ current: current({ a: "mastered" }), history }).week.movedUp).toBe(1);
    expect(run({ current: current({ a: "mastered" }), history: [...history].reverse() }).week.movedUp).toBe(1);
  });
});

describe("weekly and monthly points, in family time", () => {
  it("dates a row by the family's day: Sunday 23:30 in Vancouver is last week, though it is Monday in UTC", () => {
    const summary = run({
      current: current({ a: "mastered" }),
      history: [row("a", "mastered", "2026-11-09T06:30:00Z")],
    });
    expect(values(summary.week.points)).toEqual(["Nov 2=1", "Nov 9=1"]);
    // It was already Mastered when this week began: nothing is new this week.
    expect(summary.week.gain).toBe(0);
  });
  it("dates a row on the last evening of a month in that month", () => {
    const now = Date.parse("2026-12-15T20:00:00Z");
    const summary = run({
      now, startDay: "2026-11-02",
      current: current({ a: "mastered", b: "mastered" }),
      history: [row("a", "mastered", "2026-12-01T06:30:00Z"), row("b", "mastered", "2026-12-02T18:00:00Z")],
    });
    expect(values(summary.month.points)).toEqual(["Nov=1", "Dec=2"]);
    expect(summary.month.gain).toBe(1);
  });
  it("never has a point per day: weeks go back at most six, labelled with Mondays", () => {
    const summary = run({ startDay: "2026-01-05", current: current({ a: "mastered" }), history: [row("a", "mastered", "2026-03-10T18:00:00Z")] });
    expect(summary.week.points).toHaveLength(6);
    expect(summary.week.points.map((p) => p.label)).toEqual(["Oct 5", "Oct 12", "Oct 19", "Oct 26", "Nov 2", "Nov 9"]);
  });
  it("Month shows the last six months and All time every month since the start, with the year when it spans two", () => {
    const summary = run({ startDay: "2025-01-05", current: current({ a: "mastered" }), history: [row("a", "mastered", "2025-03-10T18:00:00Z")] });
    expect(summary.month.points).toHaveLength(6);
    expect(summary.month.points.at(-1)!.label).toBe("Nov");
    expect(summary.all.points).toHaveLength(23);
    expect(summary.all.points[0].label).toBe("Jan 25");
    expect(summary.all.points[0].value).toBe(0);
    expect(summary.all.points.at(-1)).toEqual({ label: "Nov 26", value: 1 });
  });
  it("the last point is the count now, so it matches the Skills mastered tile", () => {
    const summary = run({ current: current({ a: "mastered", b: "mastered", c: "mastered" }), history: [row("a", "mastered", "2026-11-10T18:00:00Z")] });
    expect(summary.mastered).toBe(3);
    expect(summary.week.points.at(-1)!.value).toBe(3);
    expect(summary.month.points.at(-1)!.value).toBe(3);
    expect(summary.all.points.at(-1)!.value).toBe(3);
  });
});

describe("All time counts from the end of the child's start day", () => {
  it("leaves out skills the starting test already showed", () => {
    const summary = run({
      current: current({ a: "mastered", b: "mastered" }),
      history: [row("a", "mastered", "2026-11-09T20:00:00Z"), row("b", "mastered", "2026-11-10T20:00:00Z")],
    });
    expect(summary.mastered).toBe(2);
    expect(summary.all.gain).toBe(1);
    expect(summary.all.since).toBe("2026-11-09");
  });
});

describe("a family with no marks yet", () => {
  it("has no history and no skills: zeros, and the page shows its empty line instead of the chart", () => {
    const summary = run();
    expect([summary.mastered, summary.needsHelp, summary.week.gain, summary.week.movedUp]).toEqual([0, 0, 0, 0]);
    expect(summary.week.points.every((p) => p.value === 0)).toBe(true);
  });
  it("a child with no start day still gets a line with a start", () => {
    const summary = run({ startDay: null });
    expect(summary.week.points).toHaveLength(2);
    expect(summary.month.points).toHaveLength(2);
  });
});

describe("a period never begins before the child's start", () => {
  it("Month never exceeds All time: the starting test's skills are new in neither", () => {
    // The child started Wednesday 2026-11-11 (this month and this week). Two skills were mastered by the starting test,
    // recorded on the start day; one was mastered since.
    const summary = run({
      startDay: "2026-11-11",
      current: current({ a: "mastered", b: "mastered", c: "mastered" }),
      history: [row("a", "mastered", "2026-11-11T20:00:00Z"), row("b", "mastered", "2026-11-11T20:00:00Z"), row("c", "mastered", "2026-11-12T18:00:00Z")],
    });
    expect(summary.all.gain).toBe(1);
    expect(summary.month.gain).toBe(1);
    expect(summary.week.gain).toBe(1);
    expect(summary.month.gain).toBeLessThanOrEqual(summary.all.gain);
    expect(summary.week.movedUp).toBe(1);
  });
  it("a child who started today has no gain in any period", () => {
    const summary = run({ startDay: "2026-11-12", current: current({ a: "mastered" }), history: [row("a", "mastered", "2026-11-12T18:00:00Z")] });
    expect([summary.week.gain, summary.month.gain, summary.all.gain, summary.week.movedUp]).toEqual([0, 0, 0, 0]);
  });
});

describe("history from before the table began (2026-11-04)", () => {
  // The child started 2026-10-20, but the table's first rows were written by their first rebuild on 2026-11-10.
  const early = { startDay: "2026-10-20" };
  const batch = "2026-11-10T18:00:00Z";
  it("the first batch is the starting state: not a gain and not Moved up, in any period", () => {
    const summary = run({
      ...early,
      current: current({ a: "mastered", b: "mastered", c: "working_on" }),
      history: [row("a", "mastered", batch), row("b", "mastered", batch), row("c", "working_on", batch)],
    });
    expect([summary.week.gain, summary.month.gain, summary.all.gain]).toEqual([0, 0, 0]);
    expect([summary.week.movedUp, summary.month.movedUp, summary.all.movedUp]).toEqual([0, 0, 0]);
    expect(summary.mastered).toBe(2);
  });
  it("a change after the first batch counts", () => {
    const summary = run({
      ...early,
      current: current({ a: "mastered", b: "mastered" }),
      history: [row("a", "mastered", batch), row("b", "working_on", batch), row("b", "mastered", "2026-11-11T18:00:00Z")],
    });
    expect([summary.week.gain, summary.month.gain, summary.all.gain]).toEqual([1, 1, 1]);
    expect(summary.week.movedUp).toBe(1);
  });
  it("finds the first batch: the earliest time, whatever the order, and none without rows", () => {
    expect(firstBatchAt([row("a", "mastered", "2026-11-11T18:00:00Z"), row("b", "mastered", batch)])).toBe(Date.parse(batch));
    expect(firstBatchAt([])).toBeNull();
  });
});

describe("new skills mastered since a day (#990)", () => {
  // 2026-11-09 is Monday; the child started on 2026-11-02, so the starting batch is well before this week.
  const since = (over: Partial<Parameters<typeof masteredSince>[0]> = {}) =>
    masteredSince({ now: NOW, zone, current: new Map(), history: [], startDay: "2026-11-02", since: "2026-11-09", ...over });
  const early = row("3.9", "working_on", "2026-11-03T20:00:00Z");

  it("lists the skills Mastered now that were not Mastered when the week began", () => {
    const history = [early, row("3.1", "mastered", "2026-11-10T20:00:00Z"), row("3.2", "mastered", "2026-11-11T20:00:00Z")];
    expect(since({ current: current({ "3.1": "mastered", "3.2": "mastered", "3.9": "working_on" }), history })).toEqual(["3.1", "3.2"]);
  });
  it("leaves out a skill mastered before Monday, and one that is no longer mastered", () => {
    const history = [early, row("3.1", "mastered", "2026-11-05T20:00:00Z"), row("3.2", "mastered", "2026-11-10T20:00:00Z"), row("3.2", "needs_review", "2026-11-11T20:00:00Z")];
    expect(since({ current: current({ "3.1": "mastered", "3.2": "needs_review" }), history })).toEqual([]);
  });
  it("counts a skill that lost mastery last week and has it again once", () => {
    const history = [early, row("3.1", "mastered", "2026-11-04T20:00:00Z"), row("3.1", "needs_review", "2026-11-06T20:00:00Z"), row("3.1", "mastered", "2026-11-10T20:00:00Z")];
    expect(since({ current: current({ "3.1": "mastered" }), history })).toEqual(["3.1"]);
  });
  it("the starting state is not new: rows in the first batch, and everything on or before the child's start day", () => {
    const first = "2026-11-10T20:00:00Z";
    expect(since({ current: current({ "3.1": "mastered" }), history: [row("3.1", "mastered", first)] })).toEqual([]);
    expect(since({ current: current({ "3.1": "mastered" }), history: [early, row("3.1", "mastered", "2026-11-09T20:00:00Z")], startDay: "2026-11-09" })).toEqual([]);
  });
  it("with no recorded row for a skill, nothing is new: the rule's current state alone could be a skill mastered before the history began", () => {
    expect(since({ current: current({ "3.1": "mastered" }) })).toEqual([]);
    expect(since({ current: current({ "3.1": "mastered" }), history: [early] })).toEqual([]);
  });
  it("counts by the family's week: a row recorded Sunday night in Vancouver is last week's", () => {
    const history = [early, row("3.1", "mastered", "2026-11-09T06:00:00Z")];
    expect(since({ current: current({ "3.1": "mastered" }), history })).toEqual([]);
    expect(since({ current: current({ "3.1": "mastered" }), history: [early, row("3.1", "mastered", "2026-11-09T09:00:00Z")] })).toEqual(["3.1"]);
  });
  it("agrees with the Progress tab's week gain when nothing is lost", () => {
    const history = [early, row("3.1", "mastered", "2026-11-10T20:00:00Z"), row("3.2", "mastered", "2026-11-11T20:00:00Z")];
    const now = current({ "3.1": "mastered", "3.2": "mastered", "3.9": "working_on" });
    expect(since({ current: now, history })).toHaveLength(run({ current: now, history }).week.gain);
  });
});
