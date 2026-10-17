// The learner profile (#196, spec #181, D-115): the facts about one finished test that code writes, as structured,
// versioned JSON. It is the contract for the admin profile page and for a later AI workbook generator (#197 adds the AI
// parts, each labelled with its model id). Pure, like the session: the report job passes the stored placement, the
// answers with their questions, and the parent's questionnaire answers. No network, database or clock.
import { BANKS } from "./bank";
import { REPORTED_STRAND, REPORTED_STRAND_NAMES, bandFor } from "./constants";
import { levelCertainty, storedLevelCertainty, strandCertainty, strandStatus, workingLevelOf, type Certainty } from "./certainty";
import { factsStandards, type FactsResult } from "./facts";
import { TOO_FAST_MS, helpLikely, type Flag, type HelpAnswer } from "./flags";
import { RUSH_RUN, paceOf } from "./rushing";
import type { Interest, LearningGoal, LearningStyle, MathFeeling, WeeklyTime } from "@/lib/learning-style";
import { BC_SKILL_MAP } from "./skill-map";
import type { Grade, Level, LevelResult, Placement, Province, Question, ReportedStrand, Route, StrandStatus } from "./types";

/** The version of the profile's JSON. A change that a reader of stored profiles must know about adds one. */
export const PROFILE_SCHEMA_VERSION = 1;

/** The late-test drop: the last third's correct rate this many whole percentage points or more below the first third's. */
export const LATE_DROP_POINTS = 30;
/** The late-test drop is judged only when each third has at least this many questions at the school grade. */
export const LATE_THIRD_MIN = 3;

/** One answer as the profile reads it: the question as the child saw it, the mark, and what the child did on it. */
export interface ProfileAnswer {
  question: Pick<Question, "id" | "templateId" | "level" | "strand" | "prompt" | "answer">;
  /** The child's answer, as stored. */
  response: string;
  correct: boolean;
  /** The known mistake a coded wrong answer matches (a MisconceptionId, as stored); null when it matches none. */
  misconception: string | null;
  /** Thinking time, measured in the browser. */
  timeMs: number;
  /** Shown work (#67): a show-your-work question, a drawing, typed working. Never the drawing or the strokes. */
  work: { required: boolean; drawing: boolean; typed: boolean };
  /** #184: "Read it to me" uses on the question; null when not recorded (a test from before #184). */
  readAloud: number | null;
  /** #184: time away from the tab on the question; null when not recorded. */
  away: { count: number; ms: number } | null;
}

/**
 * The parent's answers on the "Tell us how {child} learns" card (#126, #195), as stored on the child. The free text
 * ("What does {child} find hard in math?") may be passed in but never reaches the profile: it can hold names and
 * contact details, and the copy without names keeps no free text (spec #181).
 */
export interface ProfileLearning {
  styles: readonly LearningStyle[];
  interests: readonly Interest[];
  feeling: MathFeeling | null;
  goal: LearningGoal | null;
  weeklyTime: WeeklyTime | null;
}

/** What the profile is built from. */
export interface ProfileInput {
  /** The stored placement of the finished test. */
  placement: Placement;
  /** Every answer, in test order. */
  answers: readonly ProfileAnswer[];
  /** The child's answer to "Did anyone help?" (#71); null when not asked. */
  help: HelpAnswer | null;
  /** The parent's questionnaire answers when the profile is built; null when the parent gave none. */
  learning: ProfileLearning | null;
}

/** Right answers of questions. */
export interface Tally {
  correct: number;
  total: number;
}

/** One reported area. */
export interface ProfileStrand extends Tally {
  strand: ReportedStrand;
  name: string;
  /** The area's own working level: the highest level with WORKING_LEVEL_PERCENT right among its questions (workingLevelOf). */
  level: Level;
  levelCertainty: Certainty;
  /** The report's status, from the questions at or below the school grade only (`correct` and `total`). */
  status: StrandStatus;
  certainty: Certainty;
}

/** One BC standard the test asked, with the scored answers to its templates. */
export interface ProfileStandard extends Tally {
  /** The bank's code, for example "4.5". */
  code: string;
  /** The standard's exact BC text, from the skill map. */
  text: string;
  /** The grade where BC teaches it. */
  grade: Level;
  strand: ReportedStrand;
  /** Taught after the school grade: a wrong answer here is not a weakness (D-084). */
  aboveGrade: boolean;
  /** The area rule (strandStatus) and its certainty (strandCertainty), on this standard's answers. */
  status: StrandStatus;
  certainty: Certainty;
}

/** A standard the child is secure in (STRAND_SECURE_PERCENT right), at any grade. */
export type ProfileStrength = Omit<ProfileStandard, "status">;

/** A wrong answer, as the child gave it. Never the drawing, the strokes or the typed working. */
export interface ProfileWrongAnswer {
  questionId: string;
  templateId: string;
  /** The question as the child saw it. */
  prompt: string;
  /** The child's answer. */
  response: string;
  rightAnswer: string;
  /** The known mistake the answer matches (a MisconceptionId); null when it matches none. */
  misconception: string | null;
}

/** A standard at or below the school grade that is not secure, with every scored wrong answer, in test order. */
export interface ProfileStruggle extends ProfileStandard {
  wrong: ProfileWrongAnswer[];
  /** The misconception ids of the wrong answers, each once, in test order. */
  misconceptions: string[];
}

/**
 * Accuracy late in the test (spec #181): the first third of the answers beside the last third, by place in the test.
 * Only the questions at the school grade count, so a route up or down does not look like a drop or a rise; every
 * answer counts as marked, also a rushed one, because rushing late is part of what this shows. `drop`: the last third
 * is LATE_DROP_POINTS or more below the first; null when either third has fewer than LATE_THIRD_MIN such questions.
 */
export interface Thirds {
  first: Tally;
  last: Tally;
  drop: boolean | null;
}

/** How the child took the test. Admin and generator only: never the parent's report. */
export interface ProfileBehaviour {
  /** Median thinking time per question (browser). */
  medianMs: number | null;
  /** #189: answers under TOO_FAST_MS, and whether more than UNRELIABLE_FAST_PERCENT of the answers were. */
  veryFast: number;
  unreliable: boolean;
  /** Runs of RUSH_RUN or more very fast answers in a row: the test said "Take your time" in each. */
  rushRuns: number;
  /** Very fast wrong answers in such a run, which the placement left out of the score. */
  leftOut: number;
  thirds: Thirds;
  /** Show-your-work questions, those with work, and questions with work the child chose to show (#67). */
  whiteboard: { required: number; requiredWithWork: number; optionalWithWork: number };
  /** #184: of the answers that recorded it, the questions read aloud and the uses; null when none recorded it. */
  readAloud: { recorded: number; questions: number; uses: number } | null;
  /** #184: of the answers that recorded it, the questions with time away, the times away and their total time. */
  away: { recorded: number; questions: number; times: number; ms: number } | null;
  /** #71: the child's answer to "Did anyone help?", the help flags, and whether help is likely (helpLikely). */
  help: { answer: HelpAnswer | null; flags: Flag[]; likely: boolean };
}

/** A BC standard, by its code, text and area. */
export type StandardRef = Pick<ProfileStandard, "code" | "text" | "strand">;

/** What the test does not tell us (spec story 21). */
export interface ProfileUnknowns {
  /** The BC standards of the school grade with no scored answer, in curriculum order. */
  untested: StandardRef[];
  /** Results one more answer could change: the working level, and the areas. */
  earlySigns: { level: boolean; strands: ReportedStrand[] };
  /**
   * What to check next (D-108: "Early sign: workbook 1 checks this"): each struggle that is an early sign, in the
   * struggles' order, then each untested standard of the grade in an early-sign area.
   */
  checkNext: (StandardRef & { reason: "confirm-struggle" | "untested-in-early-sign-area" })[];
}

/** One part the AI wrote (#197), labelled with the id of the model that wrote it. */
export interface AiWritten<T> {
  model: string;
  value: T;
}

/** One part of the workbook 1 plan: its share of the workbook in percent, and the BC standards it works on, by code. */
export interface PlanPart {
  percent: number;
  standards: string[];
}

/** The workbook 1 plan (#197): review, practise and stretch. The three percents add up to 100. */
export interface WorkbookPlan {
  review: PlanPart;
  practise: PlanPart;
  stretch: PlanPart;
}

/**
 * The AI's interpretation (#197, spec #181, D-117): written from the facts, the skill-map neighbours and the
 * misconception descriptions (profileAiFacts), and kept only after the checks (checkProfileAi). Every part is optional:
 * a part is absent when the AI is off or failed, or when the checks dropped all of it, so the profile keeps its facts.
 * The texts use REPORT_TEXT_NAME for the child. Added within schema version 1: no profile was stored with these parts
 * before #197.
 */
export interface ProfileAi {
  /** The likely cause of each struggle, by standard code: from the misconceptions and the skill-map prerequisites. */
  likelyCauses?: AiWritten<Record<string, string>>;
  /** How to help with each struggle, by standard code. */
  howToHelp?: AiWritten<Record<string, string>>;
  /** The next BC standards, by code: not yet secure, not a struggle, and every prerequisite standard secure. */
  nextChallenge?: AiWritten<string[]>;
  /** The workbook 1 plan: review, practise and stretch, with their proportions. */
  workbookPlan?: AiWritten<WorkbookPlan>;
}

/**
 * The learner profile: everything here except `ai` is written by code from measured facts (spec #181). Never the
 * child's name, the family, the drawings, the strokes, the typed working or any free text.
 */
export interface LearnerProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  /** The test the facts come from. `answered`: every answered question, also the rushed ones left out of the score. */
  test: { grade: Grade; province: Province; route: Route; answered: number };
  level: { working: Level; certainty: Certainty; confidence: Placement["confidence"]; atCeiling: boolean };
  /** Each reported area the placement scored. */
  strands: ProfileStrand[];
  /** Each BC standard the test asked, in curriculum order. A standard whose every answer was left out is not here. */
  standards: ProfileStandard[];
  /** The secure standards, in curriculum order. */
  strengths: ProfileStrength[];
  /** Needs attention first, then developing; each in curriculum order. */
  struggles: ProfileStruggle[];
  /** Fact fluency (#70): accuracy and speed, as the placement stored them. Null when the child had no facts section. */
  facts: FactsResult | null;
  behaviour: ProfileBehaviour;
  /** How the child likes to learn and what interests them (the book mix reads these). Empty when not answered. */
  preferences: { styles: LearningStyle[]; interests: Interest[] };
  /** How the child feels about math, the parent's main goal and the time each week. Null is no answer. */
  parent: { feeling: MathFeeling | null; goal: LearningGoal | null; weeklyTime: WeeklyTime | null };
  unknowns: ProfileUnknowns;
  /** #197: the parts the AI writes, each with its model id. Absent when there are none. */
  ai?: ProfileAi;
}

/** Every bank template, by id: its BC standard. */
const TEMPLATES = new Map(Object.values(BANKS).flat().map((t) => [t.id, t]));
const STANDARDS = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s]));
const standardOf = (a: ProfileAnswer) => TEMPLATES.get(a.question.templateId)?.standard;

/** Curriculum order: by grade, then by the standard's number ("4.9" before "4.10"). */
const curriculumOrder = (a: Pick<ProfileStandard, "code" | "grade">, b: Pick<ProfileStandard, "code" | "grade">) =>
  a.grade - b.grade || Number(a.code.match(/\d+$/)?.[0] ?? 0) - Number(b.code.match(/\d+$/)?.[0] ?? 0) || a.code.localeCompare(b.code);

const SEVERITY: Record<StrandStatus, number> = { "needs-attention": 0, developing: 1, secure: 2 };

const tally = (answers: readonly { correct: boolean }[]): Tally => ({ correct: answers.filter((a) => a.correct).length, total: answers.length });

/** Tallies by level, in level order, for the levels these answers showed. */
function levelsOf(answers: readonly ProfileAnswer[], scored: (a: ProfileAnswer) => boolean): LevelResult[] {
  return [...new Set(answers.map((a) => a.question.level))]
    .sort((a, b) => a - b)
    .map((level) => ({ level, ...tally(answers.filter((a) => a.question.level === level && scored(a))) }));
}

/** Each standard the scored answers asked, with its result, in curriculum order. */
function standardsOf(counted: readonly ProfileAnswer[], grade: Grade): ProfileStandard[] {
  return [...new Set(counted.flatMap((a) => standardOf(a) ?? []))].map((code): ProfileStandard => {
    const mine = counted.filter((a) => standardOf(a) === code);
    const known = STANDARDS.get(code);
    const level = known?.grade ?? mine[0].question.level;
    const { correct, total } = tally(mine);
    return {
      code,
      text: known?.text ?? "",
      grade: level,
      strand: REPORTED_STRAND[known?.strand ?? mine[0].question.strand],
      aboveGrade: level > grade,
      correct,
      total,
      status: strandStatus(correct, total),
      certainty: strandCertainty(correct, total),
    };
  }).sort(curriculumOrder);
}

/** The first and the last third of the answers at the school grade (Thirds). */
function thirdsOf(answers: readonly ProfileAnswer[], grade: Grade): Thirds {
  const size = Math.floor(answers.length / 3);
  const atGrade = (part: readonly ProfileAnswer[]) => tally(part.filter((a) => a.question.level === grade));
  const first = atGrade(answers.slice(0, size));
  const last = atGrade(answers.slice(answers.length - size));
  if (first.total < LATE_THIRD_MIN || last.total < LATE_THIRD_MIN) return { first, last, drop: null };
  // first rate - last rate >= LATE_DROP_POINTS percent, in whole numbers.
  return { first, last, drop: 100 * (first.correct * last.total - last.correct * first.total) >= LATE_DROP_POINTS * first.total * last.total };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** How the child took the test (ProfileBehaviour). */
function behaviourOf(input: ProfileInput): ProfileBehaviour {
  const { placement, answers, help } = input;
  const timed = answers.map((a) => ({ questionId: a.question.id, timeMs: a.timeMs, correct: a.correct }));
  const pace = paceOf(timed);
  let rushRuns = 0;
  let run = 0;
  for (const a of [...timed, null]) {
    if (a && a.timeMs < TOO_FAST_MS) run++;
    else {
      if (run >= RUSH_RUN) rushRuns++;
      run = 0;
    }
  }
  const read = answers.flatMap((a) => (a.readAloud === null ? [] : [a.readAloud]));
  const away = answers.flatMap((a) => (a.away === null ? [] : [a.away]));
  const withWork = (a: ProfileAnswer) => a.work.drawing || a.work.typed;
  return {
    medianMs: median(answers.map((a) => a.timeMs)),
    veryFast: pace.veryFast,
    unreliable: pace.unreliable,
    rushRuns,
    leftOut: placement.pace?.leftOut.length ?? 0,
    thirds: thirdsOf(answers, placement.grade),
    whiteboard: {
      required: answers.filter((a) => a.work.required).length,
      requiredWithWork: answers.filter((a) => a.work.required && withWork(a)).length,
      optionalWithWork: answers.filter((a) => !a.work.required && withWork(a)).length,
    },
    readAloud: read.length === 0 ? null : { recorded: read.length, questions: read.filter((n) => n > 0).length, uses: read.reduce((n, x) => n + x, 0) },
    away: away.length === 0 ? null : {
      recorded: away.length,
      questions: away.filter((x) => x.count > 0).length,
      times: away.reduce((n, x) => n + x.count, 0),
      ms: away.reduce((n, x) => n + x.ms, 0),
    },
    help: { answer: help, flags: placement.flags ?? [], likely: helpLikely(placement.flags) },
  };
}

/**
 * The facts of one finished test, or null when the test was not scored against BC: the skill map, the skill tags and
 * the standards are BC's (spec #181 leaves other provinces out).
 */
export function learnerProfile(input: ProfileInput): LearnerProfile | null {
  const { placement, answers, learning } = input;
  if (placement.scoredAgainst !== "BC") return null;
  // A rushed wrong answer the stored placement left out of the score (#189) is not a sign of what the child knows.
  const leftOut = new Set(placement.pace?.leftOut ?? []);
  const scored = (a: ProfileAnswer) => !leftOut.has(a.question.id);
  const counted = answers.filter(scored);

  const strands = bandFor(placement.grade).strands.flatMap((strand): ProfileStrand[] => {
    const result = placement.strands.find((s) => s.strand === strand);
    const mine = answers.filter((a) => REPORTED_STRAND[a.question.strand] === strand);
    if (!result || mine.length === 0) return [];
    const levels = levelsOf(mine, scored);
    return [{
      strand,
      name: REPORTED_STRAND_NAMES[strand],
      level: workingLevelOf(levels),
      levelCertainty: levelCertainty(levels),
      status: result.status,
      correct: result.correct,
      total: result.total,
      certainty: result.certainty ?? strandCertainty(result.correct, result.total),
    }];
  });

  const standards = standardsOf(counted, placement.grade);
  const strengths = standards.filter((s) => s.status === "secure")
    .map(({ code, text, grade, strand, aboveGrade, correct, total, certainty }): ProfileStrength => ({ code, text, grade, strand, aboveGrade, correct, total, certainty }));
  // D-084: never invent a weakness. A standard above the school grade is not a struggle.
  const struggles = standards
    .filter((s) => !s.aboveGrade && s.status !== "secure")
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || curriculumOrder(a, b))
    .map((s): ProfileStruggle => {
      const wrong = counted.filter((a) => !a.correct && standardOf(a) === s.code).map((a) => ({
        questionId: a.question.id,
        templateId: a.question.templateId,
        prompt: a.question.prompt,
        response: a.response,
        rightAnswer: a.question.answer,
        misconception: a.misconception,
      }));
      return { ...s, wrong, misconceptions: [...new Set(wrong.flatMap((w) => w.misconception ?? []))] };
    });

  // A quick facts round that ran tested its facts standards too (#242).
  const tested = new Set([...standards.map((s) => s.code), ...factsStandards(placement.facts?.families ?? [])]);
  const untested = BC_SKILL_MAP.standards
    .filter((s) => s.grade === placement.grade && !tested.has(s.code))
    .map((s): StandardRef => ({ code: s.code, text: s.text, strand: REPORTED_STRAND[s.strand] }))
    .sort((a, b) => curriculumOrder({ ...a, grade: placement.grade }, { ...b, grade: placement.grade }));
  const uncertain = strands.filter((s) => s.certainty === "early-sign").map((s) => s.strand);
  const levelSure = storedLevelCertainty({ confidence: placement.confidence, certainty: placement.levelCertainty }) ?? levelCertainty(placement.levels);
  const ref = ({ code, text, strand }: StandardRef): StandardRef => ({ code, text, strand });

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    test: { grade: placement.grade, province: placement.province, route: placement.route, answered: answers.length },
    level: {
      working: placement.workingLevel,
      certainty: levelSure,
      confidence: placement.confidence,
      atCeiling: placement.atCeiling,
    },
    strands,
    standards,
    strengths,
    struggles,
    facts: placement.facts,
    behaviour: behaviourOf(input),
    // Field by field, so the free text never comes along.
    preferences: { styles: [...(learning?.styles ?? [])], interests: [...(learning?.interests ?? [])] },
    parent: { feeling: learning?.feeling ?? null, goal: learning?.goal ?? null, weeklyTime: learning?.weeklyTime ?? null },
    unknowns: {
      untested,
      earlySigns: { level: levelSure === "early-sign", strands: uncertain },
      checkNext: [
        ...struggles.filter((s) => s.certainty === "early-sign").map((s) => ({ ...ref(s), reason: "confirm-struggle" as const })),
        ...untested.filter((s) => uncertain.includes(s.strand)).map((s) => ({ ...s, reason: "untested-in-early-sign-area" as const })),
      ],
    },
  };
}

/**
 * The parts a profile of this schema version had once and no longer has. Readers drop them from a stored profile; the
 * stored rows are not rewritten. `wordsOrNumbers`: the words-or-numbers finding, removed by D-121 (#238).
 */
const RETIRED_PARTS = ["wordsOrNumbers"] as const;

/**
 * A stored profile (public.learner_profiles.profile) as this version's profile, without its retired parts; null when
 * it is not a profile or was written at another schema version. A reader never guesses at another version's shape: an
 * older profile is built again from the test.
 */
export function storedProfile(value: unknown): LearnerProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if ((value as { schemaVersion?: unknown }).schemaVersion !== PROFILE_SCHEMA_VERSION) return null;
  const profile: Record<string, unknown> = { ...value };
  for (const part of RETIRED_PARTS) delete profile[part];
  return profile as unknown as LearnerProfile;
}
