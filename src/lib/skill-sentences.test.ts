import { describe, expect, it } from "vitest";
import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import { PACIFIC_ZONE } from "@/lib/family-time";
import type { HelpMark } from "@/lib/needs-help";
import { MISTAKE_FIT, MISTAKE_MIN, STEADY_RUN, skillSentence, type MistakeFact, type SkillSentenceFacts } from "@/lib/skill-sentences";

// The plain sentence under each skill (#989), through the module's public interface. The family is in Pacific time (UTC-7
// in November 2026). "Now" is Thursday 2026-11-12, noon in Vancouver; the mistake window is 2026-10-30 to 2026-11-12.
const NOW = Date.parse("2026-11-12T20:00:00Z");

const mark = (right: boolean, at: string, extra: Partial<HelpMark> = {}): HelpMark => ({ standard: "3.3", right, review: false, at, blank: false, ...extra });
const wrongOn = (n: number, cause: string, day = "2026-11-10"): MistakeFact[] => Array.from({ length: n }, (_, i) => ({ cause, at: `${day}T${String(17 + i).padStart(2, "0")}:00:00Z` }));
/** Marks of one standard in the order given, one a day from 2026-11-01. */
const marks = (...results: ("r" | "w" | "b")[]): HelpMark[] =>
  results.map((r, i) => mark(r === "r", `2026-11-${String(i + 1).padStart(2, "0")}T18:00:00Z`, { blank: r === "b" }));

const facts = (over: Partial<SkillSentenceFacts>): SkillSentenceFacts => ({
  standard: "3.3", group: "learning", state: "working_on", reason: "in_workbook", marks: [], mistakes: [], masteredOn: null, startedOn: null,
  inNextWorkbook: false, now: NOW, zone: PACIFIC_ZONE, ...over,
});
const text = (over: Partial<SkillSentenceFacts>) => skillSentence(facts(over))?.text ?? null;

describe("the named numbers", () => {
  it("are the ones the sentences are written against", () => {
    expect([MISTAKE_MIN, MISTAKE_FIT, STEADY_RUN]).toEqual([2, 80, 3]);
  });
});

describe("Mastered: when it was mastered, nothing about how", () => {
  it("says the date the list shows", () => {
    expect(skillSentence(facts({ group: "mastered", state: "mastered", masteredOn: "Thursday" }))).toEqual({ text: "Mastered Thursday", basis: { kind: "mastered", masteredOn: "Thursday" } });
    expect(text({ group: "mastered", state: "mastered", masteredOn: "Oct 28" })).toBe("Mastered Oct 28");
    expect(text({ group: "mastered", state: "mastered", masteredOn: "today" })).toBe("Mastered today");
  });
  it("says nothing with no recorded date (the starting state has none), and never how it was mastered", () => {
    expect(text({ group: "mastered", state: "mastered", masteredOn: null })).toBeNull();
    // Marks and mistakes change nothing: no "right on its practice pages", no count.
    expect(text({ group: "mastered", state: "mastered", masteredOn: "Tuesday", marks: marks("r", "r", "r", "r", "r"), mistakes: wrongOn(3, "O3") })).toBe("Mastered Tuesday");
  });
});

describe("Learning: how it is going, in words", () => {
  it("says getting steadier after a wrong answer and then a run of right ones, naming the run", () => {
    expect(skillSentence(facts({ marks: marks("w", "r", "r", "r") }))).toEqual({ text: "Getting steadier: right the last 3 times", basis: { kind: "steadier", run: 3 } });
    expect(text({ marks: marks("r", "w", "r", "w", "r", "r", "r", "r") })).toBe("Getting steadier: right the last 4 times");
  });
  it("says right every time so far when all of at least 3 answers are right", () => {
    expect(skillSentence(facts({ marks: marks("r", "r", "r") }))).toEqual({ text: "Right every time so far", basis: { kind: "right_so_far", answers: 3 } });
  });
  it("needs the run: 2 right in a row after a wrong answer is not steadier", () => {
    expect(text({ marks: marks("w", "r", "r") })).toBeNull();
    expect(text({ marks: marks("r", "r", "w", "r", "r") })).toBeNull();
  });
  it("a wrong answer last breaks the run", () => {
    expect(text({ marks: marks("r", "r", "r", "w") })).toBeNull();
  });
  it("reads the marks by time, not by the order they were passed", () => {
    const shuffled = [...marks("w", "r", "r", "r")].reverse();
    expect(text({ marks: shuffled })).toBe("Getting steadier: right the last 3 times");
  });
  it("a blank answer is an unfinished page: it is not wrong and not right, and neither breaks nor adds to a run", () => {
    expect(text({ marks: marks("w", "r", "b", "r", "r") })).toBe("Getting steadier: right the last 3 times");
    expect(text({ marks: marks("b", "b", "b", "b") })).toBeNull();
  });
  it("a mark with no readable time is left out", () => {
    expect(text({ marks: [...marks("w", "r", "r"), mark(true, "later")] })).toBeNull();
  });
  it("with no steady run, says when it started, if a start was recorded", () => {
    expect(skillSentence(facts({ startedOn: "Tuesday" }))).toEqual({ text: "Started Tuesday", basis: { kind: "started", startedOn: "Tuesday" } });
    expect(text({ marks: marks("w", "r"), startedOn: "Oct 29" })).toBe("Started Oct 29");
  });
  it("with nothing to say, says nothing: no marks and no recorded start", () => {
    expect(text({})).toBeNull();
    expect(text({ marks: marks("w", "r") })).toBeNull();
  });
  it("a steady run wins over the start", () => {
    expect(text({ marks: marks("w", "r", "r", "r"), startedOn: "Tuesday" })).toBe("Getting steadier: right the last 3 times");
  });
  it("never says a percent or a count of wrong answers", () => {
    const all = [text({ marks: marks("w", "w", "r", "r", "r") }), text({ marks: marks("r", "r", "r") }), text({ startedOn: "Tuesday" })].join(" ");
    expect(all).not.toMatch(/%|percent|wrong|of the last|out of/i);
  });
});

describe("Needs help: what goes wrong, then what we do next", () => {
  const help = (over: Partial<SkillSentenceFacts>) => facts({ group: "needs_help", state: "needs_review", reason: "failed_review", ...over });

  it("names a mistake from the misconception table's own text when the same cause was marked on 2 wrong answers lately", () => {
    expect(skillSentence(help({ mistakes: wrongOn(2, "O3") }))).toEqual({
      text: "Forgets to carry when adding.", basis: { kind: "mistake", cause: "O3", times: 2, next: false },
    });
    expect(MISCONCEPTIONS.O3.description).toBe("Forgets to carry when adding");
  });
  it("says Back in the next workbook only when the next workbook really has the skill", () => {
    expect(skillSentence(help({ mistakes: wrongOn(2, "O3"), inNextWorkbook: true }))).toEqual({
      text: "Forgets to carry when adding. Back in the next workbook.", basis: { kind: "mistake", cause: "O3", times: 2, next: true },
    });
    expect(text(help({ mistakes: wrongOn(2, "O3"), inNextWorkbook: false }))).not.toContain("next workbook");
  });
  it("one slip is not a habit: a single wrong answer names no mistake", () => {
    expect(text(help({ mistakes: wrongOn(1, "O3") }))).toBe("Was right before, then slipped on a later answer.");
  });
  it("the same cause twice counts only inside the last 14 days of family time, today included", () => {
    // Window: 2026-10-30 to 2026-11-12 in Vancouver. 2026-10-30T07:00Z is Oct 30 at midnight there; one hour earlier is Oct 29.
    expect(text(help({ mistakes: [{ cause: "O3", at: "2026-10-30T07:00:00Z" }, { cause: "O3", at: "2026-11-12T20:00:00Z" }] }))).toBe("Forgets to carry when adding.");
    expect(text(help({ mistakes: [{ cause: "O3", at: "2026-10-30T06:59:59Z" }, { cause: "O3", at: "2026-11-12T20:00:00Z" }] }))).not.toContain("carry");
    // Dated after today, or with no readable time: left out.
    expect(text(help({ mistakes: [{ cause: "O3", at: "2026-11-13T20:00:00Z" }, { cause: "O3", at: "2026-11-12T20:00:00Z" }] }))).not.toContain("carry");
    expect(text(help({ mistakes: [{ cause: "O3", at: "soon" }, { cause: "O3", at: "2026-11-12T20:00:00Z" }] }))).not.toContain("carry");
  });
  it("names the cause with the most wrong answers, then the most recent, then the lowest id", () => {
    expect(text(help({ mistakes: [...wrongOn(2, "O3"), ...wrongOn(3, "O1")] }))).toBe("Subtracts the smaller digit from the larger in each column.");
    expect(text(help({ mistakes: [...wrongOn(2, "O3", "2026-11-09"), ...wrongOn(2, "O1", "2026-11-11")] }))).toBe("Subtracts the smaller digit from the larger in each column.");
    expect(text(help({ mistakes: [...wrongOn(2, "O3"), ...wrongOn(2, "O1")] }))).toBe("Subtracts the smaller digit from the larger in each column.");
  });
  it("names no cause the table does not know, or whose text is too long for one short line", () => {
    expect(text(help({ mistakes: wrongOn(3, "not-a-cause") }))).toBe("Was right before, then slipped on a later answer.");
    const long = Object.entries(MISCONCEPTIONS).find(([, m]) => m.description.length > MISTAKE_FIT)!;
    expect(text(help({ mistakes: wrongOn(3, long[0]) }))).toBe("Was right before, then slipped on a later answer.");
    // Prototype words are not borrowed: only the table's text appears.
    expect(text(help({ mistakes: wrongOn(2, "O3") }))).not.toContain("tens and hundreds");
  });
  it("an unknown cause does not hide a known one", () => {
    expect(text(help({ mistakes: [...wrongOn(4, "not-a-cause"), ...wrongOn(2, "O3")] }))).toBe("Forgets to carry when adding.");
  });
  it("with no named mistake, says the days it was tricky on, as Highlights does, when it was wrong on 2 or more workbook days", () => {
    const days = [mark(false, "2026-11-09T18:00:00Z", { day: "wb:1" }), mark(false, "2026-11-10T18:00:00Z", { day: "wb:2" }), mark(false, "2026-11-11T18:00:00Z", { day: "wb:3" })];
    expect(skillSentence(help({ marks: days }))).toEqual({ text: "Tricky on 3 workbook days in the last two weeks.", basis: { kind: "tricky_days", days: 3, next: false } });
    expect(text(help({ marks: days, inNextWorkbook: true }))).toBe("Tricky on 3 workbook days in the last two weeks. Back in the next workbook.");
    // One workbook day is not a pattern, however many answers; a blank is not wrong.
    expect(text(help({ marks: [days[0], { ...days[0] }, { ...days[1], day: "wb:1" }] }))).toBe("Was right before, then slipped on a later answer.");
    expect(text(help({ marks: [days[0], { ...days[1], blank: true }] }))).toBe("Was right before, then slipped on a later answer.");
  });
  it("a named mistake comes before the days", () => {
    const days = [mark(false, "2026-11-09T18:00:00Z", { day: "wb:1" }), mark(false, "2026-11-10T18:00:00Z", { day: "wb:2" })];
    expect(text(help({ marks: days, mistakes: wrongOn(2, "O3") }))).toBe("Forgets to carry when adding.");
  });
  it("with nothing named, says what the skill state rule found: was right and slipped, tricky on the test, or struggling now", () => {
    expect(skillSentence(help({}))).toEqual({ text: "Was right before, then slipped on a later answer.", basis: { kind: "failed_review", next: false } });
    expect(skillSentence(help({ reason: "needs_attention_on_test", inNextWorkbook: true }))).toEqual({ text: "Came up tricky on the test. Back in the next workbook.", basis: { kind: "test_weak", next: true } });
    expect(skillSentence(help({ state: "working_on", reason: "in_workbook" }))).toEqual({ text: "Has been tricky on recent pages.", basis: { kind: "struggling", next: false } });
  });
  it("never says a percent or a count of wrong answers", () => {
    const days = [mark(false, "2026-11-09T18:00:00Z", { day: "wb:1" }), mark(false, "2026-11-10T18:00:00Z", { day: "wb:2" })];
    const all = [help({ mistakes: wrongOn(5, "O3"), inNextWorkbook: true }), help({ marks: days }), help({}), help({ reason: "needs_attention_on_test" }), help({ state: "working_on" })]
      .map((f) => skillSentence(f)!.text).join(" ");
    expect(all).not.toMatch(/%|percent|\b[0-9]+ (?:wrong|mistakes|answers|of)\b/i);
    expect(all).not.toMatch(/\b5\b/);
  });
});

describe("every sentence", () => {
  it("is one short line: at most one next-workbook clause, no percent sign", () => {
    for (const cause of Object.keys(MISCONCEPTIONS)) {
      const got = skillSentence(facts({ group: "needs_help", state: "needs_review", reason: "failed_review", mistakes: wrongOn(2, cause), inNextWorkbook: true }))!.text;
      expect(got.split("Back in the next workbook.")).toHaveLength(2);
      expect(got).not.toContain("%");
      expect(got.length).toBeLessThanOrEqual(MISTAKE_FIT + " Back in the next workbook.".length + 1);
    }
  });
  it("is traceable: its basis names the facts it was written from", () => {
    expect(skillSentence(facts({ marks: marks("w", "r", "r", "r", "r") }))!.basis).toEqual({ kind: "steadier", run: 4 });
    expect(skillSentence(facts({ group: "needs_help", state: "needs_review", mistakes: wrongOn(3, "F1") }))!.basis).toEqual({ kind: "mistake", cause: "F1", times: 3, next: false });
  });
  it("is the same for the same facts, in any order of the marks and mistakes", () => {
    const m = marks("w", "r", "w", "r", "r", "r");
    const mistakes = [...wrongOn(2, "O3"), ...wrongOn(2, "O1")];
    expect(skillSentence(facts({ marks: [...m].reverse() }))).toEqual(skillSentence(facts({ marks: m })));
    expect(skillSentence(facts({ group: "needs_help", state: "needs_review", mistakes: [...mistakes].reverse() }))).toEqual(skillSentence(facts({ group: "needs_help", state: "needs_review", mistakes })));
  });
});
