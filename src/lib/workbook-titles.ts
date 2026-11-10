// A day page's title (D-201, #380): at most 4 words, on one line, naming what every card of the page practises, never
// one card's tool ("Show and read a number to 10 on a ten-frame in stories" named the ten-frame while 2 of its 6 cards
// used one). Code writes every title from the page plan and the curriculum: the AI never does.
//
// - A page of one review kind keeps that kind's name ("Warm-up", "Review", "Challenge", "Level U3 test"). The review
//   kind's page was "Remember these?" until Savar's 2026-11-09 review; the template prints a stored one as "Review".
// - A page of stories is "Number stories to 10" (to the largest number its skills reach) up to U12, "Word problems"
//   from U13 or when its skills have no number range.
// - A page with one skill takes that skill's short title (SKILL_TITLES). A page mixing skills of one BC unit takes
//   the unit title (UNIT_TITLES); skills of two units of one strand take the strand's title; anything else is
//   "Mixed practice".
// - A page that mixes review with stories or a challenge is "Mixed review".
//
// titleProblem checks the words; the template's fit check (src/lib/workbook-template.ts) also measures the printed
// title and fails a page whose title takes more than one line, so a title that breaks the rule is never printed.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import type { Curriculum } from "@/lib/workbook-curriculum";
import type { PartKind, PlannedPage } from "@/lib/workbook-plan";
import { SKILL_TITLES } from "@/lib/workbook-skill-titles";
import { skillTitleProblems } from "@/lib/workbook-skill-title-check";
import { UNIT_TITLES } from "@/lib/workbook-unit-titles";
export { UNIT_TITLES };
export { TITLE_WORDS_MAX, titleWords, titleProblem } from "@/lib/workbook-title-rules";

// A missing, stale or invalid data set stops the book before a title can be printed.
const skillProblems = skillTitleProblems(SKILL_TITLES);
if (skillProblems.length) throw new Error(`Invalid workbook skill titles:\n${skillProblems.join("\n")}`);


/** Each strand's title, when a page's skills come from two units of it. */
const STRAND_TITLES: Readonly<Record<string, string>> = {
  N: "Numbers", O: "Operations", F: "Fractions and decimals", A: "Patterns and equations", MG: "Shapes and measuring", DP: "Data and chance",
};

/** Parts that hold review, tests and fixed pages: a page of only one of them takes its name. */
const REVIEW_TITLES: Partial<Record<PartKind, string>> = {
  "warm-up": "Warm-up", "remember-these": "Review", "already-know-it": "Already know it?", "friday-5": "Friday 5",
  challenge: "Challenge", "show-what-you-know": "Show what you know", "math-in-the-world": "Math in the world",
  "unit-check": "Quick check", "mini-test": "Mini-test", "fix-it": "Fix it",
};
/** Parts with no title of their own: they sit beside a page's teaching (a Spot the error, the Mixed set). */
const BESIDE: ReadonlySet<PartKind> = new Set<PartKind>(["spot-the-error", "mixed-set", "solve-it-two-ways", "fix-it", "in-your-head", "warm-up"]);
const STORIES: ReadonlySet<PartKind> = new Set<PartKind>(["picture-stories", "word-problems"]);
const REVIEW: ReadonlySet<PartKind> = new Set<PartKind>(["remember-these", "friday-5", "challenge", "already-know-it", "unit-check", "mini-test"]);

/** What the page title needs to know of the skills: their unit and largest number. */
export interface TitleSkills {
  /** The unit code of a skill, or null. */
  unit(skill: string): string | null;
  /** The strand of a unit, or null. */
  strand(unit: string): string | null;
  /** The largest whole number a skill's items use at the page's level, or null when it has no number range. */
  max(skill: string): number | null;
}

/** One skill's title, else the title shared by the page's units or strands. */
function skillsTitle(skills: string[], s: TitleSkills): string {
  if (skills.length === 1) {
    const title = SKILL_TITLES[skills[0]];
    if (!title) throw new Error(`Missing workbook skill title: ${skills[0]}`);
    return title;
  }
  const mapped = skills.map((x) => s.unit(x));
  // An unknown skill cannot be dropped to make the remaining skills appear to share a unit.
  if (mapped.some((u) => u === null)) throw new Error("A workbook page has a skill with no unit");
  const units = [...new Set(mapped.filter((u): u is string => !!u))];
  if (units.length === 1 && UNIT_TITLES[units[0]]) return UNIT_TITLES[units[0]];
  const strands = [...new Set(units.map((u) => s.strand(u)))];
  if (units.length > 1 && strands.length === 1 && strands[0] && STRAND_TITLES[strands[0]]) return STRAND_TITLES[strands[0]];
  return "Mixed practice";
}

/** "Number stories to 10" up to U12 when every skill has a number range; else "Word problems". */
function storiesTitle(skills: string[], level: number, s: TitleSkills): string {
  const maxes = skills.map((x) => s.max(x));
  if (level > 12 || maxes.length === 0 || maxes.some((m) => m === null)) return "Word problems";
  return `Number stories to ${Math.max(...(maxes as number[]))}`;
}

/** A day page's title (see the header). */
export function pageTitle(page: Pick<PlannedPage, "type" | "parts">, level: number, s: TitleSkills): string {
  if (page.type === "level-test" || page.parts.some((p) => p.kind === "level-test")) return `Level U${level} test`;
  const parts = page.parts.filter((p) => p.items > 0 || p.kind === "new-idea");
  const kinds = [...new Set(parts.map((p) => p.kind))];
  const skills = (ps: typeof parts) => [...new Set(ps.flatMap((p) => p.skills))];
  // One review kind, or the warm-up with its Fix it and In your head boxes.
  const own = kinds.filter((k) => !BESIDE.has(k) || k === "warm-up");
  if (own.length === 1 && REVIEW_TITLES[own[0]]) return REVIEW_TITLES[own[0]]!;
  if (kinds.length === 1 && REVIEW_TITLES[kinds[0]]) return REVIEW_TITLES[kinds[0]]!;
  if (own.length === 2 && own.includes("remember-these") && own.includes("friday-5")) return "Review and Friday 5";
  if (own.length > 0 && own.every((k) => STORIES.has(k))) return storiesTitle(skills(parts), level, s);
  // Review beside other work: the page mixes what it asks.
  if (own.some((k) => REVIEW.has(k) || k === "show-what-you-know")) return own.length === 1 ? REVIEW_TITLES[own[0]] ?? "Mixed review" : "Mixed review";
  return skillsTitle(skills(parts), s);
}

/** TitleSkills from a curriculum and the page level's number ranges. */
export function curriculumTitleSkills(curriculum: Curriculum, max: (skill: string) => number | null): TitleSkills {
  return {
    unit: (skill) => curriculum.skill(skill)?.unit ?? null,
    strand: (unit) => curriculum.unit(unit)?.strand ?? null,
    max,
  };
}
