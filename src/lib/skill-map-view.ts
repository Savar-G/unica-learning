import {
  BC_SKILL_MAP, REPORTED_STRAND, REPORTED_STRAND_NAMES, bandFor, skillStates,
  type BcStandard, type Grade, type Level, type ReportedStrand, type SkillMapGrade, type SkillState, type SkillTestResult, type StandardSkillState,
} from "@/lib/assessment";

// The Progress tab's skill map (#561, spec #544): one tile per BC standard at the child's levels, grouped in the reported
// areas, each with its state and a plain line on why. Pure: no network, database or clock.
//
// The states come from the rule (skillStates), from the same inputs the profile rebuild reads, not from the last row of
// the history. The history records what each rebuild saw, and a rebuild runs after a finished test and a learning card
// change, not when a workbook ships; a child with no rebuild since the rule shipped has no rows, and no row means Not
// started. Here a parent reads what the rule says now. Whatever counts or orders changes by time still reads the history.
//
// A panel section with no data is empty, and the page leaves it out. "next" holds only what code knows: the standards the
// skill map says build on this one (draft edges, reviewed in #194) and that the child has not mastered. Nothing here says
// what the next workbook holds.

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
  /** The standards that build on this one; only for Mastered and Working on. */
  next: string[];
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
const MAX_NEXT = 3;

const capital = (text: string) => `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;

/** The rule's reason, in plain words. It names the child and never says she or her; no percent and no count. */
export function skillWhy(s: StandardSkillState, { firstName: name, workbookNumber, day }: Pick<SkillMapViewInput, "firstName" | "workbookNumber" | "day">): string {
  switch (s.reason) {
    case "failed_review":
      return `${name} had mastered this, then made a mistake on it on ${s.evidence === "test" ? "a newer test" : "a marked page"}.`;
    case "secure_on_test":
      return s.state === "mastered"
        ? `${name} got every question on this right on the test${s.evidenceAt ? ` on ${day(s.evidenceAt)}` : ""}.`
        : `${name} got most questions on this right on the test, but not every one.`;
    case "held_on_review":
      return `${name} got this right on marked pages, and right again on a later review.`;
    case "in_workbook":
      return workbookNumber === null ? "This skill is in the current workbook." : `This skill is in Workbook ${workbookNumber}, ${name}'s current workbook.`;
    case "needs_attention_on_test":
      return `${name}'s test showed that this needs more practice.`;
    case "above_school_grade":
      return `This is above ${name}'s school grade, so a mistake here is not a weakness.`;
    case "early_sign_on_test":
      return "The test asked too few questions on this to say yet.";
    case "developing_on_test":
      return `${name} got some questions on this right on the test, but not every one.`;
    case "no_evidence":
      return workbookNumber === null ? "The test did not ask about this." : `The test did not ask about this, and it is not in Workbook ${workbookNumber}.`;
  }
}

/** The map's standards that build on `code` and are not Mastered: the same strand first, then the nearest grade (the map's order is by grade). */
function nextOf(code: string, states: ReadonlyMap<string, SkillState>): string[] {
  const standard = BC_SKILL_MAP.standards.find((s) => s.code === code);
  const own = new Set(standard?.skills.map((k) => k.id));
  const otherStrand = (s: BcStandard) => (s.strand === standard?.strand ? 0 : 1);
  return BC_SKILL_MAP.standards
    .filter((s) => s.code !== code && states.get(s.code) !== "mastered" && s.skills.some((k) => k.requires.some((r) => own.has(r))))
    .sort((a, b) => otherStrand(a) - otherStrand(b))
    .slice(0, MAX_NEXT)
    .map((s) => capital(s.text));
}

/** The child's map, by area. An area with no tile does not appear; with no level and no workbook, the map is empty. */
export function skillMapView(input: SkillMapViewInput): SkillAreaView[] {
  const { schoolGrade, workingLevel, tests, workbookStandards } = input;
  const states = skillStates({ schoolGrade, tests, workbookStandards, marks: [] });
  const stateOf = new Map(states.map((s) => [s.standard, s]));
  const stateNames = new Map(states.map((s) => [s.standard, s.state]));
  const inWorkbook = new Set(workbookStandards);
  // A band's areas: Kindergarten to Grade 2 report three, with no fractions, also for a child working above Grade 2.
  const reported = new Set(bandFor(schoolGrade).strands);
  const shown = BC_SKILL_MAP.standards.filter((s) => inWorkbook.has(s.code) || (s.grade === workingLevel && reported.has(REPORTED_STRAND[s.strand])));
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
        next: state.state === "mastered" || state.state === "working_on" ? nextOf(s.code, stateNames) : [],
      };
    });
    return tiles.length > 0 ? [{ area, name: REPORTED_STRAND_NAMES[area], tiles }] : [];
  });
}
