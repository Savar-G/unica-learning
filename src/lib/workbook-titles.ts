// A day page's title (D-201, #380): at most 4 words, on one line, naming what every card of the page practises, never
// one card's tool ("Show and read a number to 10 on a ten-frame in stories" named the ten-frame while 2 of its 6 cards
// used one). Code writes every title from the page plan and the curriculum: the AI never does.
//
// - A page of one review kind keeps that kind's name ("Warm-up", "Remember these?", "Challenge", "Level U3 test").
// - A page of stories is "Number stories to 10" (to the largest number its skills reach) up to U12, "Word problems"
//   from U13 or when its skills have no number range.
// - A page that teaches or practises takes the short title of the BC unit (standard) all its skills belong to
//   (UNIT_TITLES); skills of two units of one strand take the strand's title; anything else is
//   "Mixed practice".
// - A page that mixes review with stories or a challenge is "Mixed review".
//
// titleProblem checks the words; the template's fit check (src/lib/workbook-template.ts) also measures the printed
// title and fails a page whose title takes more than one line, so a title that breaks the rule is never printed.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import type { Curriculum } from "@/lib/workbook-curriculum";
import type { PartKind, PlannedPage } from "@/lib/workbook-plan";

/** The most words a page title has. */
export const TITLE_WORDS_MAX = 4;

/** A title's words: runs of letters or digits ("Warm-up" and "U3" are one word each; "·" and ":" are not words). */
export const titleWords = (title: string) => title.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));

/** Why a title may not print, or null: empty, or more than TITLE_WORDS_MAX words. The one-line fit is measured. */
export function titleProblem(title: string): string | null {
  const n = titleWords(title).length;
  if (n === 0) return "the page title is empty";
  if (n > TITLE_WORDS_MAX) return `the page title "${title}" has ${n} words; a title has at most ${TITLE_WORDS_MAX}`;
  return null;
}

/** Each BC unit's short title: what its skills practise, in at most 4 words (a test checks every unit has one). */
export const UNIT_TITLES: Readonly<Record<string, string>> = {
  // Kindergarten (U1 to U3).
  K1: "Counting to 10", K2: "Ways to make 5", K3: "Number parts to 10", K4: "Repeating patterns", K5: "Adding and taking away",
  K6: "Equal or not", K7: "Comparing sizes", K8: "Shapes and objects", K9: "Picture graphs", K10: "Likely or unlikely",
  K11: "Coins and shopping",
  // Grade 1 (U4 to U6).
  "1.1": "Numbers to 20", "1.2": "Ways to make 10", "1.3": "Adding and subtracting", "1.4": "Repeating patterns",
  "1.5": "Changing amounts", "1.6": "Equal or not", "1.7": "Measuring things", "1.8": "Shapes and objects",
  "1.9": "Graphs", "1.10": "Likely or unlikely", "1.11": "Coins",
  // Grade 2 (U7 to U9).
  "2.1": "Numbers to 100", "2.2": "Benchmarks to 100", "2.3": "Facts to 20", "2.4": "Adding and subtracting",
  "2.5": "Patterns", "2.6": "Changing amounts", "2.7": "Equal or not", "2.8": "Measuring length",
  "2.9": "Shapes and objects", "2.10": "Picture graphs", "2.11": "Likely or unlikely", "2.12": "Coins and saving",
  // Grade 3 (U10 to U12).
  "3.1": "Numbers to 1000", "3.2": "Fractions", "3.3": "Adding and subtracting", "3.4": "Facts to 20",
  "3.5": "Multiplying and dividing", "3.6": "Growing patterns", "3.7": "Pattern rules", "3.8": "Missing numbers",
  "3.9": "Measuring", "3.10": "Time", "3.11": "3D objects", "3.12": "Graphs and tables", "3.13": "Likely or unlikely",
  "3.14": "Money to 100 dollars",
  // Grade 4 (U13 to U15).
  "4.1": "Numbers to 10 000", "4.2": "Decimals", "4.3": "Comparing fractions", "4.4": "Adding and subtracting",
  "4.5": "Multiplying and dividing", "4.6": "Adding decimals", "4.7": "Facts to 20", "4.8": "Times tables",
  "4.9": "Pattern tables", "4.10": "Number relationships", "4.11": "Solving equations", "4.12": "Telling time",
  "4.13": "Polygons", "4.14": "Perimeter", "4.15": "Symmetry", "4.16": "Bar graphs", "4.17": "Probability",
  "4.18": "Making change",
  // Grade 5 (U16 to U18).
  "5.1": "Numbers to a million", "5.2": "Decimals", "5.3": "Equivalent fractions", "5.4": "Benchmarks",
  "5.5": "Adding and subtracting", "5.6": "Multiplying and dividing", "5.7": "Adding decimals", "5.8": "Facts to 20",
  "5.9": "Times tables", "5.10": "Pattern rules", "5.11": "Solving equations", "5.12": "Area",
  "5.13": "Area and perimeter", "5.14": "Time", "5.15": "Prisms and pyramids", "5.16": "Transformations",
  "5.17": "Double bar graphs", "5.18": "Probability", "5.19": "Money and plans",
  // Grade 6 (U19 to U21).
  "6.1": "Small and large numbers", "6.2": "Times tables", "6.3": "Order of operations", "6.4": "Factors and multiples",
  "6.5": "Mixed numbers", "6.6": "Ratios", "6.7": "Percents", "6.8": "Decimals",
  "6.9": "Patterns and graphs", "6.10": "Solving equations", "6.11": "Perimeter", "6.12": "Area of shapes",
  "6.13": "Angles", "6.14": "Volume and capacity", "6.15": "Triangles", "6.16": "Transformations",
  "6.17": "Line graphs", "6.18": "Probability", "6.19": "Budgets",
  // Grade 7 (U22 to U24).
  "7.1": "Times tables", "7.2": "Integers", "7.3": "Decimals", "7.4": "Fractions and percents",
  "7.5": "Linear relations", "7.6": "Two-step equations", "7.7": "Circles", "7.8": "Volume",
  "7.9": "Coordinates", "7.10": "Transformations", "7.11": "Circle graphs", "7.12": "Probability",
  "7.13": "Percents and money",
  // Grade 8 (U25 to U27).
  "8.1": "Squares and cubes", "8.2": "Square roots", "8.3": "Percents", "8.4": "Rates and ratios",
  "8.5": "Fractions", "8.6": "Linear relations", "8.7": "Expressions", "8.8": "Two-step equations",
  "8.9": "Surface area and volume", "8.10": "Pythagorean theorem", "8.11": "Nets and views",
  "8.12": "Mean, median, mode", "8.13": "Probability", "8.14": "Best buys",
  // Grade 9 (U28 to U30).
  "9.1": "Rational numbers", "9.2": "Exponents", "9.3": "Polynomials", "9.4": "Linear relations",
  "9.5": "Solving equations", "9.6": "Scale and proportion", "9.7": "Statistics", "9.8": "Budgets",
};

/** Each strand's title, when a page's skills come from two units of it. */
const STRAND_TITLES: Readonly<Record<string, string>> = {
  N: "Numbers", O: "Operations", F: "Fractions and decimals", A: "Patterns and equations", MG: "Shapes and measuring", DP: "Data and chance",
};

/** Parts that hold review, tests and fixed pages: a page of only one of them takes its name. */
const REVIEW_TITLES: Partial<Record<PartKind, string>> = {
  "warm-up": "Warm-up", "remember-these": "Remember these?", "already-know-it": "Already know it?", "friday-5": "Friday 5",
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

/** The title of a unit's skills, or of a strand's, or "Mixed practice". */
function skillsTitle(skills: string[], s: TitleSkills): string {
  const units = [...new Set(skills.map((x) => s.unit(x)).filter((u): u is string => !!u))];
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
