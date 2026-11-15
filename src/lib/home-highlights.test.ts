import { describe, expect, it } from "vitest";
import { HIGHLIGHT_MAX, STREAK_MIN, highlights, homeStory, weekLine, type HomeStoryFacts } from "@/lib/home-highlights";

// The Home's "On track this week" line and Highlights (#990), through the module's public interface. Every sentence is
// checked against the facts it was built from, so each can be traced to its data. The week is Leah's, on a Thursday.

const facts = (over: Partial<HomeStoryFacts> = {}): HomeStoryFacts => ({
  name: "Leah", week: { done: 3, due: 3, missed: [], catchingUp: false }, scansThisWeek: 6, newlyMastered: [], repeatedMistake: null, streak: 0, ...over,
});
const line = (over: Partial<HomeStoryFacts> = {}) => { const l = weekLine(facts(over)); return l && `${l.lead} ${l.text}`; };

describe("the line under the Workbook card", () => {
  it("on track: every day behind us is done, and says how many are done", () => {
    expect(line()).toBe("On track this week. 3 days done.");
    expect(line({ week: { done: 1, due: 1, missed: [], catchingUp: false } })).toBe("On track this week. 1 day done.");
  });
  it("on track with new skills: the days done, and the new skills mastered since Monday", () => {
    expect(line({ newlyMastered: ["a", "b", "c"] })).toBe("On track this week. 3 days done, and 3 new skills mastered since Monday.");
    expect(line({ newlyMastered: ["a"] })).toBe("On track this week. 3 days done, and 1 new skill mastered since Monday.");
  });
  it("on track when today's day is done early or on a Monday: done counts even with no day behind us", () => {
    expect(line({ week: { done: 1, due: 0, missed: [], catchingUp: false } })).toBe("On track this week. 1 day done.");
  });
  it("behind: calm words, the days done, and the first open day is ready when the child is", () => {
    expect(line({ week: { done: 2, due: 3, missed: [3], catchingUp: false } })).toBe("A quieter week. 2 days done. Day 3 is ready when Leah is.");
    expect(line({ week: { done: 1, due: 4, missed: [2, 3, 4], catchingUp: false }, newlyMastered: ["a"] })).toBe("A quieter week. 1 day done, and 1 new skill mastered since Monday. Day 2 is ready when Leah is.");
  });
  it("catching up: a day is open but the latest one is done, said without blame", () => {
    expect(line({ week: { done: 2, due: 3, missed: [1], catchingUp: true } })).toBe("Catching up. 2 days done. Day 1 is ready when Leah is.");
  });
  it("no scans this week: nothing scanned yet, and no full day yet when some pages are scanned", () => {
    expect(line({ week: { done: 0, due: 3, missed: [1, 2, 3], catchingUp: false }, scansThisWeek: 0 })).toBe("A quiet week so far. Nothing scanned yet. Day 1 is ready when Leah is.");
    expect(line({ week: { done: 0, due: 2, missed: [1, 2], catchingUp: false }, scansThisWeek: 3 })).toBe("A quiet week so far. No full day done yet. Day 1 is ready when Leah is.");
  });
  it("a quiet week does not claim new skills: that waits for Highlights", () => {
    expect(line({ week: { done: 0, due: 2, missed: [1, 2], catchingUp: false }, scansThisWeek: 0, newlyMastered: ["a"] })).not.toContain("mastered");
  });
  it("says nothing with no week (no book yet, plan ended, no book day this week) or a Monday morning with nothing done", () => {
    expect(line({ week: null })).toBeNull();
    expect(line({ week: { done: 0, due: 0, missed: [], catchingUp: false } })).toBeNull();
  });
  it("never uses a percent, a count of wrong answers or an alarm", () => {
    const all = [
      line(), line({ newlyMastered: ["a"] }), line({ week: { done: 2, due: 3, missed: [3], catchingUp: false } }),
      line({ week: { done: 2, due: 3, missed: [1], catchingUp: true } }), line({ week: { done: 0, due: 3, missed: [1], catchingUp: false }, scansThisWeek: 0 }),
    ].join(" ");
    expect(all).not.toMatch(/%|percent|wrong|missed|behind|late|overdue|should|must|worry|falling/i);
  });
});

describe("Highlights", () => {
  it("a new mastery: one skill is named, in its own words", () => {
    expect(highlights(facts({ newlyMastered: ["multiplying by 10 and 100"] }))).toEqual(["Leah mastered multiplying by 10 and 100 this week."]);
  });
  it("several new masteries: the count, and what mastered means", () => {
    expect(highlights(facts({ newlyMastered: ["a", "b", "c"] }))).toEqual(["Leah mastered 3 skills this week, each right in practice and again in review."]);
  });
  it("a repeated mistake: the skill to watch, with the different days it came up wrong on", () => {
    expect(highlights(facts({ repeatedMistake: { name: "subtracting across a zero", days: 3 } }))).toEqual(["The one to watch is subtracting across a zero: it was tricky on 3 days in the last two weeks."]);
  });
  it("a streak of days done, from the minimum", () => {
    expect(STREAK_MIN).toBe(3);
    expect(highlights(facts({ streak: 4 }))).toEqual(["Leah has done 4 days in a row."]);
    expect(highlights(facts({ streak: STREAK_MIN - 1 }))).toEqual([]);
  });
  it("picks at most two, by a fixed priority: a mastery, then a repeated mistake, then a streak", () => {
    const all = { newlyMastered: ["a", "b"], repeatedMistake: { name: "x", days: 2 }, streak: 5 };
    expect(HIGHLIGHT_MAX).toBe(2);
    expect(highlights(facts(all))).toEqual(["Leah mastered 2 skills this week, each right in practice and again in review.", "The one to watch is x: it was tricky on 2 days in the last two weeks."]);
    expect(highlights(facts({ ...all, newlyMastered: [] }))).toEqual(["The one to watch is x: it was tricky on 2 days in the last two weeks.", "Leah has done 5 days in a row."]);
    expect(highlights(facts({ ...all, repeatedMistake: null }))).toEqual(["Leah mastered 2 skills this week, each right in practice and again in review.", "Leah has done 5 days in a row."]);
  });
  it("nothing to say: no Highlights rather than filler, and no line", () => {
    expect(highlights(facts())).toEqual([]);
    expect(homeStory(facts({ week: null }))).toEqual({ line: null, highlights: [] });
    expect(homeStory(facts({ week: { done: 0, due: 0, missed: [], catchingUp: false } }))).toEqual({ line: null, highlights: [] });
  });
  it("uses no percent, no count of wrong answers and no 'right on N different days'", () => {
    const out = highlights(facts({ newlyMastered: ["a", "b"], repeatedMistake: { name: "x", days: 3 }, streak: 4 })).concat(highlights(facts({ newlyMastered: ["a"], streak: 4 }))).join(" ");
    expect(out).not.toMatch(/%|percent|wrong|different days|score|failed|struggl|behind/i);
  });
  it("the name comes from the facts, so a sibling's sentences name the sibling", () => {
    expect(highlights(facts({ name: "Omar", newlyMastered: ["a"], streak: 3 }))).toEqual(["Omar mastered a this week.", "Omar has done 3 days in a row."]);
  });
});
