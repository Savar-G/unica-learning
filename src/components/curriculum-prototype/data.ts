// PROTOTYPE (throwaway, branch site/curriculum-prototype). Shared data for the /curriculum?variant= prototypes.
// Grade bands stay a rough range per group of levels, never next to a single level (curriculum.ts rule).
import { CURRICULUM_GROUPS, type CurriculumGroup } from "@/lib/curriculum";

export interface Band {
  key: "k2" | "35" | "69";
  /** Parent-facing label, grade first. */
  grades: string;
  short: string;
  levels: string;
  /** School grades shown on the grade picker (K = 0). */
  gradeList: number[];
  /** One line on what the band covers, built from its level titles. */
  gist: string;
  /** Three example problems, in the child's handwriting style. Each names the level it comes from. */
  samples: { q: string; from: number }[];
  group: CurriculumGroup;
  color: string;
}

const [g1, g2, g3] = CURRICULUM_GROUPS;

export const BANDS: Band[] = [
  {
    key: "k2", grades: "Kindergarten to Grade 2", short: "K-2", levels: "Levels U1-U9", gradeList: [0, 1, 2],
    gist: "Counting, adding and subtracting to 100, first shapes, measuring and money.",
    samples: [{ q: "3 + ? = 10", from: 4 }, { q: "47 = 4 tens and 7 ones", from: 7 }, { q: "25¢ + 10¢ + 5¢ = ?", from: 9 }],
    group: g1, color: "var(--g1)",
  },
  {
    key: "35", grades: "Grades 3 to 5", short: "3-5", levels: "Levels U10-U18", gradeList: [3, 4, 5],
    gist: "Big numbers, times tables, long multiplying and dividing, fractions and decimals.",
    samples: [{ q: "6 × 7 = ?", from: 13 }, { q: "1/2 = ?/4", from: 17 }, { q: "3.45 + 1.2 = ?", from: 15 }],
    group: g2, color: "var(--g2)",
  },
  {
    key: "69", grades: "Grades 6 to 9", short: "6-9", levels: "Levels U19-U30", gradeList: [6, 7, 8, 9],
    gist: "Ratios and percents, negative numbers, equations, geometry and graphing lines.",
    samples: [{ q: "2x + 3 = 11", from: 24 }, { q: "20% off $40 = ?", from: 21 }, { q: "3² + 4² = ?²", from: 26 }],
    group: g3, color: "var(--g3)",
  },
];

export const ALL_LEVELS = BANDS.flatMap((b) => b.group.levels.map((l) => ({ ...l, band: b })));
export const bandOfLevel = (n: number) => BANDS.find((b) => b.group.levels.some((l) => l.n === n))!;
export const gradeName = (g: number) => (g === 0 ? "Kindergarten" : `Grade ${g}`);

/** Topics across the bands, for the "by topic" variant. Each cell is written from the level points it lists. */
export const TOPICS: { name: string; cells: [string, number[]][] }[] = [
  { name: "Numbers", cells: [
    ["Counting to 20, then tens and ones to 100", [1, 4, 7]],
    ["Numbers to 1000, 10 000, then a million", [10, 13, 16]],
    ["Factors, very big and small numbers, squares, roots and powers", [19, 25, 26, 28]],
  ] },
  { name: "Adding and subtracting", cells: [
    ["Making 5 and 10, facts to 20, then two-digit numbers", [2, 3, 4, 5, 8, 9]],
    ["Three- and four-digit numbers, quick facts to 20", [10, 13]],
    ["Negative numbers and the order of operations", [19, 22]],
  ] },
  { name: "Multiplying and dividing", cells: [
    ["", []],
    ["Equal groups, times tables, then long multiplying and dividing", [11, 13, 14, 16, 17]],
    ["With decimals, negative numbers and fractions", [20, 22, 23, 26]],
  ] },
  { name: "Fractions, decimals and percents", cells: [
    ["", []],
    ["Halves to fourths, fractions worth the same, decimals to thousandths", [12, 14, 15, 17, 18]],
    ["Mixed numbers, ratios, percents and percent change", [20, 21, 22, 26]],
  ] },
  { name: "Patterns and equations", cells: [
    ["Repeating and growing patterns, finding a missing number", [1, 6, 7, 8]],
    ["Pattern rules, number sentences, first equations with a letter", [10, 11, 16, 17]],
    ["One-step to multi-step equations, straight-line graphs, polynomials", [20, 24, 25, 27, 29, 30]],
  ] },
  { name: "Measuring and shapes", cells: [
    ["Longer and heavier, naming shapes, rulers in centimetres", [2, 6, 8, 9]],
    ["Area, perimeter, time, symmetry and 3D objects", [12, 13, 14, 16, 18]],
    ["Angles, circles, volume, right triangles and scale drawings", [19, 20, 21, 23, 24, 26, 27, 28]],
  ] },
  { name: "Graphs and chance", cells: [
    ["Picture graphs and how likely something is", [1, 3, 4, 7]],
    ["Tallies, graphs and simple chance experiments", [10, 11, 15]],
    ["Chance as a fraction, circle graphs, mean and median, misleading graphs", [19, 23, 27, 29]],
  ] },
  { name: "Money", cells: [
    ["Coins, counting to a dollar, spending and saving", [3, 6, 9]],
    ["Money to $100, making change, money to $1000", [11, 15, 18]],
    ["Sale prices, budgets, tax and tips, best buys, simple interest", [21, 24, 27, 29]],
  ] },
];
