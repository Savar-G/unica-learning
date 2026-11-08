import {
  BC_SKILL_MAP, REPORTED_STRAND, REPORTED_STRAND_NAMES, skillStates,
  type Grade, type Level, type ReportedStrand, type SkillMapGrade, type SkillState, type SkillTestResult, type StandardSkillState,
} from "@/lib/assessment";

// The Progress tab's skill map (#561, spec #544): one tile per BC standard of the working level's grade, plus any standard
// of the current workbook, grouped in the areas those standards report to. No area is left out: the three-area rule for
// Kindergarten to Grade 2 belongs only to the area bars. Each tile has its state and a plain line on why. Pure: no
// network, database or clock.
//
// The states come from the rule (skillStates), from the same inputs the profile rebuild reads, not from the last row of
// the history. The history records what each rebuild saw, and a rebuild runs after a finished test and a learning card
// change, not when a workbook ships; a child with no rebuild since the rule shipped has no rows, and no row means Not
// started. Here a parent reads what the rule says now. Whatever counts or orders changes by time still reads the history.
//
// A panel section with no data is empty, and the page leaves it out. Nothing here says what comes next: the skill map's
// prerequisite links are not a child's next step. A skill in the current workbook says so as a plain fact.

export interface SkillTileView {
  code: string;
  /** The standard's text from the skill map, with a capital letter. */
  name: string;
  /** The grade where BC teaches it: the page marks a grade other than the working level's. */
  grade: SkillMapGrade;
  state: SkillState;
  /** One line on why, in plain words. */
  why: string;
  /** The skills inside the standard, from the skill map. */
  skills: string[];
  /** "This is in Workbook 3." for a skill in the current workbook; null when it is not, or when `why` already says so. */
  workbookLine: string | null;
}

export interface SkillAreaView {
  area: ReportedStrand;
  /** The area's name, as the report names it. */
  name: string;
  tiles: SkillTileView[];
}

export interface SkillMapViewInput {
  firstName: string;
  schoolGrade: Grade;
  /** The working level of the latest finished test with a report; null with none. */
  workingLevel: Level | null;
  tests: readonly SkillTestResult[];
  /** The standards of the latest shipped workbook; empty with none. */
  workbookStandards: readonly string[];
  workbookNumber: number | null;
  /** A time as a day the family reads, in family time. */
  day: (at: string) => string;
}

const AREA_ORDER: readonly ReportedStrand[] = ["number", "fractions", "algebra", "shapes"];

const capital = (text: string) => `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;

/** Where the current workbook has a skill, as a plain fact. */
const inWorkbookLine = (workbookNumber: number | null) => (workbookNumber === null ? "This is in the current workbook." : `This is in Workbook ${workbookNumber}.`);

/**
 * The rule's reason, in plain words. It names the child and never says she or her; no percent and no count. Each line is
 * true in every case of its reason. A tally leaves out the rushed wrong answers the report left out of the score, so a
 * line on it says "counted answers", and no line says what the test asked.
 */
export function skillWhy(s: StandardSkillState, { firstName: name, workbookNumber, day }: Pick<SkillMapViewInput, "firstName" | "workbookNumber" | "day">): string {
  switch (s.reason) {
    case "failed_review":
      return `${name} had mastered this, then made a mistake on it on ${s.evidence === "test" ? "a newer test" : "a marked page"}.`;
    case "secure_on_test":
      return s.state === "mastered"
        ? `${name} got every counted answer on this right on the test${s.evidenceAt ? ` on ${day(s.evidenceAt)}` : ""}.`
        : `${name} got most counted answers on this right on the test, but not every one.`;
    case "held_on_review":
      return `${name} got most of this right on marked pages, and right again on a later review.`;
    case "in_workbook":
      return inWorkbookLine(workbookNumber);
    case "needs_attention_on_test":
      return `${name}'s test showed that this needs more practice.`;
    case "above_school_grade":
      return `This is above ${name}'s school grade, so a mistake here is not a weakness.`;
    case "early_sign_on_test":
      return `There are too few counted answers from ${name}'s test on this to say yet.`;
    case "developing_on_test":
      return `${name} got some counted answers on this right on the test, but not every one.`;
    case "no_evidence":
      return `There is not enough from ${name}'s test to say yet.`;
  }
}

/** The child's map, by area. An area with no tile does not appear; with no level and no workbook, the map is empty. */
export function skillMapView(input: SkillMapViewInput): SkillAreaView[] {
  const { schoolGrade, workingLevel, tests, workbookStandards, workbookNumber } = input;
  const states = skillStates({ schoolGrade, tests, workbookStandards, marks: [] });
  const stateOf = new Map(states.map((s) => [s.standard, s]));
  const inWorkbook = new Set(workbookStandards);
  const shown = BC_SKILL_MAP.standards.filter((s) => inWorkbook.has(s.code) || s.grade === workingLevel);
  return AREA_ORDER.flatMap((area) => {
    const tiles = shown.filter((s) => REPORTED_STRAND[s.strand] === area).map((s): SkillTileView => {
      const state = stateOf.get(s.code)!;
      return {
        code: s.code,
        name: capital(s.text),
        grade: s.grade,
        state: state.state,
        why: skillWhy(state, input),
        skills: s.skills.map((k) => k.text),
        workbookLine: inWorkbook.has(s.code) && state.reason !== "in_workbook" ? inWorkbookLine(workbookNumber) : null,
      };
    });
    return tiles.length > 0 ? [{ area, name: REPORTED_STRAND_NAMES[area], tiles }] : [];
  });
}
