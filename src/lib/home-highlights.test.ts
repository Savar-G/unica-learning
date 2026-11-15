import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP } from "@/lib/assessment";
import { HIGHLIGHT_MAX, STREAK_MIN, highlights, homeStory, weekLine, type HomeStoryFacts } from "@/lib/home-highlights";
import { SKILL_NAME_FIT, plainSkillName } from "@/lib/skill-name";

// The Home's "On track this week" line and Highlights (#990), through the module's public interface. Every sentence is
// checked against the facts it was built from, so each can be traced to its data. The week is Leah's, on a Thursday.

const facts = (over: Partial<HomeStoryFacts> = {}): HomeStoryFacts => ({
  name: "Leah", week: { done: 3, due: 3, missed: [], catchingUp: false }, scansThisWeek: 6, openDay: null, newlyMastered: [], repeatedMistake: null, streak: 0, ...over,
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
  it("names the earliest open day of the book, the Workbooks tab's orange row, not only this week's first missed day", () => {
    // Day 2 of last week's pages is still open: the line and the orange row say the same day.
    expect(line({ week: { done: 2, due: 3, missed: [8], catchingUp: false }, openDay: 2 })).toBe("A quieter week. 2 days done. Day 2 is ready when Leah is.");
    // With no open day known the week's own earliest missed day is named.
    expect(line({ week: { done: 2, due: 3, missed: [8], catchingUp: false }, openDay: null })).toBe("A quieter week. 2 days done. Day 8 is ready when Leah is.");
    // An on-track week names no day, whatever the book holds.
    expect(line({ openDay: 2 })).toBe("On track this week. 3 days done.");
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
  it("a new mastery: one skill is named, by its plain name", () => {
    expect(highlights(facts({ newlyMastered: ["multiplying by 10 and 100"] }))).toEqual(["Leah mastered multiplying by 10 and 100 this week."]);
  });
  it("several new masteries: the count, with no claim of how they were mastered", () => {
    expect(highlights(facts({ newlyMastered: ["a", "b", "c"] }))).toEqual(["Leah mastered 3 skills this week."]);
    expect(highlights(facts({ newlyMastered: ["a", "b", "c"] })).join(" ")).not.toMatch(/practice|review|each right/i);
  });
  it("a skill name too long for a sentence: the count form for one new skill, and no 'one to watch' sentence", () => {
    const long = plainSkillName(BC_SKILL_MAP.standards.find((s) => s.code === "4.18")!.text);
    expect(long.length).toBeGreaterThan(SKILL_NAME_FIT);
    expect(highlights(facts({ newlyMastered: [long] }))).toEqual(["Leah mastered 1 new skill this week."]);
    expect(highlights(facts({ repeatedMistake: { name: long, days: 3 } }))).toEqual([]);
    // A name right at the limit still goes in the sentence.
    const edge = "x".repeat(SKILL_NAME_FIT);
    expect(highlights(facts({ newlyMastered: [edge] }))).toEqual([`Leah mastered ${edge} this week.`]);
    expect(highlights(facts({ newlyMastered: [`${edge}x`] }))).toEqual(["Leah mastered 1 new skill this week."]);
  });
  it("real skill-map texts: a short plain name goes in the sentence, a long one becomes a count", () => {
    const sentences = BC_SKILL_MAP.standards.map((s) => ({ s, name: plainSkillName(s.text) })).map(({ s, name }) => ({ code: s.code, name, out: highlights(facts({ newlyMastered: [name] }))[0] }));
    for (const { name, out } of sentences) {
      expect(out).toBe(name.length <= SKILL_NAME_FIT ? `Leah mastered ${name} this week.` : "Leah mastered 1 new skill this week.");
      expect(out).not.toMatch(/financial literacy -|\(/);
    }
    // Both forms occur in the real map.
    expect(sentences.some(({ name }) => name.length <= SKILL_NAME_FIT)).toBe(true);
    expect(sentences.some(({ name }) => name.length > SKILL_NAME_FIT)).toBe(true);
  });
  it("a repeated mistake: the skill to watch, with the different workbook days it came up wrong on", () => {
    expect(highlights(facts({ repeatedMistake: { name: "subtracting across a zero", days: 3 } }))).toEqual(["The one to watch is subtracting across a zero: it was tricky on 3 workbook days in the last two weeks."]);
  });
  it("a streak of workbook days done, from the minimum: it says workbook days, not calendar days", () => {
    expect(STREAK_MIN).toBe(3);
    expect(highlights(facts({ streak: 4 }))).toEqual(["Leah has done 4 workbook days in a row."]);
    expect(highlights(facts({ streak: STREAK_MIN - 1 }))).toEqual([]);
  });
  it("picks at most two, by a fixed priority: a mastery, then a repeated mistake, then a streak", () => {
    const all = { newlyMastered: ["a", "b"], repeatedMistake: { name: "x", days: 2 }, streak: 5 };
    expect(HIGHLIGHT_MAX).toBe(2);
    expect(highlights(facts(all))).toEqual(["Leah mastered 2 skills this week.", "The one to watch is x: it was tricky on 2 workbook days in the last two weeks."]);
    expect(highlights(facts({ ...all, newlyMastered: [] }))).toEqual(["The one to watch is x: it was tricky on 2 workbook days in the last two weeks.", "Leah has done 5 workbook days in a row."]);
    expect(highlights(facts({ ...all, repeatedMistake: null }))).toEqual(["Leah mastered 2 skills this week.", "Leah has done 5 workbook days in a row."]);
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
    expect(highlights(facts({ name: "Omar", newlyMastered: ["a"], streak: 3 }))).toEqual(["Omar mastered a this week.", "Omar has done 3 workbook days in a row."]);
  });
});
