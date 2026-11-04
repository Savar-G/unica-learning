/**
 * The young levels' layout and repeat rules, U4 to U9 (D-226, Savar confirmed 2026-11-03; #482 review at db3b1a0).
 * Each rule lives here only, so it changes in one place.
 */

/** The levels the calls cover: U4 to U9 (U1 to U3 are parent-led and keep their own rules). */
export const isYoungLevel = (level: number) => level >= 4 && level <= 9;

/**
 * Solve it two ways sits on the number stories page, where two methods fit best, not on practice-2: there practice-2
 * holds its 8 practice questions beside Spot the error (the larger U4 to U9 boxes left room for 2 to 4).
 */
export const twoWaysOnStoriesPage = (level: number) => isYoungLevel(level);

/**
 * A new idea's practice questions beside its worked example and Spot the error: 2 at U4 to U9 (young children's larger
 * boxes), 3 from U10 (from U19 Cedric's upper band takes three quarters: 2). A page that cannot hold its floor fails
 * and is reported.
 */
export const newIdeaFloor = (level: number) => (isYoungLevel(level) ? 2 : 3);

/**
 * The main book (Days 1 to 10) never repeats a task. Only an extra practice page at U4 to U9, whose levels have few
 * numbers, may ask a task of the book once more, and only when it was first asked this many pages earlier.
 */
export const EXTRA_PRACTICE_REPEAT_PAGES = 40;
export const extraPracticeRepeats = (level: number, extraPractice: boolean, firstPage: number, page: number) =>
  extraPractice && isYoungLevel(level) && page - firstPage >= EXTRA_PRACTICE_REPEAT_PAGES;

/**
 * On the number stories page at U4 to U9, Solve it two ways is one of its stories (a story worked two ways): it counts
 * toward the page's 3 stories.
 */
export const twoWaysCountsAsStory = (level: number, pageType: string) => isYoungLevel(level) && pageType === "word-problems";
