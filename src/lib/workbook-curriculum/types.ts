// Types of the workbook curriculum (#361): levels, units, skills and steps, per curriculum. Pure data.
import type { Strand } from "../assessment/types";
import type { SkillMapGrade } from "../assessment/skill-map";

/** The curricula with a map. Only BC today; other provinces come later as their own maps, never mixed into BC's. */
export type CurriculumKey = "bc";

/** "U1" to "U30". */
export type LevelId = `U${number}`;

export interface Range {
  min: number;
  max: number;
}

export interface CurriculumLevel {
  curriculum: CurriculumKey;
  id: LevelId;
  /** 1 to 30, the number the workbook content stores (`levels` in workbook-content.ts). */
  number: number;
  /** The parent-friendly title. */
  title: string;
  topics: string;
  band: "early" | "middle" | "upper";
  /** Unit codes (BC standard codes) in dependency order, for pairing a main unit with a second unit. */
  units: readonly string[];
  /** Pages a day (D-186): 4 to 6 in U1 to U3, 8 in U4 to U18, 6 in U19 to U30. */
  pagesPerDay: Range;
  lead: "parent-led" | "parent-supported" | "child-led";
  /** The daily time target in minutes: typical, not a limit. */
  dailyMinutes: Range;
  /** About how many minutes one practice page takes. */
  practicePageMinutes: number;
  levelTestMinutes: Range;
  /** The share of pages held for review, Fix it, warm-up, Friday 5 and tests, 0 to 1. */
  reviewShare: number;
  /** The sum of the level's skill pages. */
  skillPages: number;
  /** Planned workbooks for the level (its grade's budget split by page share): an average, not a limit. */
  workbooks: number;
  /** Internal only: the BC school grade (0 is Kindergarten). Never show it to a child or on a page. */
  schoolGrade: SkillMapGrade;
}

/** One BC standard inside a level. */
export interface CurriculumUnit {
  curriculum: CurriculumKey;
  /** The standard code, for example "3.3". */
  code: string;
  /** The standard's official text. */
  text: string;
  strand: Strand;
  level: LevelId;
}

export type Importance = "core" | "standard" | "minor";
export type Delivery = "new-step" | "warm-up" | "activity" | "parent-checked";
export type ResponseType =
  | "write-number"
  | "circle"
  | "match"
  | "colour-or-shade"
  | "draw"
  | "number-line"
  | "fill-table"
  | "show-work"
  | "write-words"
  | "hands-on";
export type Scorable = "yes" | "partly" | "no";

export interface CurriculumSkill {
  curriculum: CurriculumKey;
  /** The BC skill-map id, the stable key, for example "3.3-add-within-1000". */
  id: string;
  text: string;
  level: LevelId;
  /** The unit (standard) code. */
  unit: string;
  /** 1-based place in the level: each skill comes after its prerequisites. */
  order: number;
  /** Builder position code, "U12.3.2" (level, unit, skill). Never for a child or parent; it changes when a unit moves. */
  position: string;
  importance: Importance;
  difficulty: 1 | 2 | 3;
  delivery: Delivery;
  response: ResponseType;
  /** Whether the app can mark it from a scan. */
  scorable: Scorable;
  /** Step pages: 0 for warm-up skills (they live in the daily warm-up), 1 for activity skills. */
  pages: number;
  /** Skill ids a child needs first. */
  requires: readonly string[];
}

/** An expected wrong answer on a step. */
export interface ExpectedMistake {
  answer: string;
  why: string;
  kind: "careless" | "conceptual";
  /** A misconception id, from the assessment's misconceptions.ts where one exists. */
  misconception: string | null;
}

/** A small increase in difficulty inside a skill. Drafted only for Grade 3 (U10 to U12) so far. */
export interface CurriculumStep {
  curriculum: CurriculumKey;
  skill: string;
  /** 1-based. */
  number: number;
  /** Builder position code, "U12.3.2.4". */
  position: string;
  name: string;
  /** What changes from the previous step. */
  change: string;
  /** Number ranges and rules. */
  rules: string;
  example: { problem: string; answer: string };
  /** Can be 0: the steps of a warm-up skill live in the daily warm-up, and an activity skill has one page in all. */
  pages: number;
  /** The one representation the page, the Teaching Assistant and the parent use. */
  representation: string;
  mistakes: readonly ExpectedMistake[];
  spotTheError: { wrong: string; fix: string };
  /** Whether code checked the example's arithmetic, or it has none (a picture or a judgement). */
  arithmetic: "checked" | "none";
}

/** Internal only: a school grade's budgets, which its levels split. */
export interface GradeBudget {
  schoolGrade: SkillMapGrade;
  /** Pages for skills, after the review share. */
  skillPages: number;
  workbooks: number;
}

/** A curriculum as data, as the import script writes it. */
export interface CurriculumData {
  key: CurriculumKey;
  levels: readonly CurriculumLevel[];
  units: readonly CurriculumUnit[];
  skills: readonly CurriculumSkill[];
  steps: readonly CurriculumStep[];
  grades: readonly GradeBudget[];
}
