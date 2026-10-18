import type { CurriculumId } from "@/lib/signup";
import type { Certainty } from "./certainty";
import type { Pace } from "./rushing";
import type { FactsResult } from "./facts";
import type { Flag } from "./flags";
import type { MisconceptionId } from "./misconceptions";
import type { Rng } from "./rng";

/** A level on the K-8 scale. 0 is Kindergarten. */
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** School grades the assessment serves. */
export type Grade = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** The parent's province. "other" = another province, or not sure; it is scored against BC (D-083). */
export type Province = CurriculumId;
/** Provinces with their own grade tags. */
export type TaggedProvince = Exclude<Province, "other">;

/** The 6 internal strands (curriculum map, section 2.1). */
export type Strand = "N" | "O" | "F" | "A" | "MG" | "DP";
/** The 4 strands a parent sees on the report. */
export type ReportedStrand = "number" | "fractions" | "algebra" | "shapes";

/**
 * "word-problem" = the math is set in a real-world situation told in sentences; "bare-number" = the numbers, symbols,
 * shapes or figure are given directly (#187). Every bank template has one (bank/wording.ts).
 */
export type Wording = "word-problem" | "bare-number";

/** "choice" = tap one of several answers; "number" = type a number on the number pad. */
export type AnswerFormat = "choice" | "number";

/** The grade where each province teaches the skill. BC is required; the others only where the curriculum map gives them. */
export type ProvinceGrades = { BC: Level } & Partial<Record<Exclude<TaggedProvince, "BC">, Level>>;

/** A wrong answer we expect, and the misconception it shows. */
export interface CodedWrong {
  value: string;
  misconception: MisconceptionId;
}

/** What a template produces from a seeded generator. */
export interface Filled {
  /** The numbers drawn for this question, kept for the record. */
  values: Record<string, number>;
  prompt: string;
  /** Plain words for "read it to me": no symbols the browser voice reads badly. */
  readAloud: string;
  answer: string;
  /** For "choice" these are the other choices. For "number" they are typed answers we recognise. */
  wrong: CodedWrong[];
  /**
   * "choice" only: words for choices the voice would read wrong, by choice ("9:3" -> "9 to 3"). Fractions need none:
   * they read as "a out of b" (readAloudText). The read-aloud text itself never lists the choices: they are shuffled.
   */
  say?: Record<string, string>;
  /** A figure the screen draws beside the words (#79), for example a bar graph to read. */
  figure?: Figure;
}

/** A bar graph: one bar per row, read against a scale from 0 (#79). */
export interface BarFigure {
  kind: "bars";
  bars: { label: string; value: number }[];
}

/** Figures the test screen can draw. */
export type Figure = BarFigure;

/**
 * A question template. Its level on the K-8 scale is the grade where BC teaches it (grades.BC);
 * a child in another tagged province is measured at that province's grade instead.
 */
export interface Template {
  id: string;
  strand: Strand;
  grades: ProvinceGrades;
  format: AnswerFormat;
  /**
   * True when the question suits required shown work on the whiteboard. It means "may be required": the session picks
   * the band's count (5 / 7 / 10) from the flagged questions of each route (#67), not all of them.
   */
  whiteboard: boolean;
  /** BC learning standard, for example "4.5" (curriculum map, section 1). */
  standard: string;
  fill(rng: Rng): Filled;
}

/** A question as the server holds it. The browser never receives `answer` or `wrong` (see toPublicQuestion). */
export interface Question {
  id: string;
  templateId: string;
  /** The question's level for this child's province. */
  level: Level;
  strand: Strand;
  format: AnswerFormat;
  whiteboard: boolean;
  /**
   * A show-your-work question (#67). The session picks the band's count (GradeBand.whiteboardRequired) on every
   * route, from the templates that suit it first. Absent on tests stored before #67. Since D-125 the whiteboard is
   * optional: the mark only ranks the work the report shows first, and the child is never asked for work.
   */
  showWork?: boolean;
  prompt: string;
  readAloud: string;
  /** Shuffled answer choices, only for "choice" questions. */
  choices?: string[];
  /** Words for choices the voice would read wrong (Filled.say). Absent on tests stored before #79. */
  say?: Record<string, string>;
  /** A figure the screen draws (Filled.figure). */
  figure?: Figure;
  values: Record<string, number>;
  answer: string;
  wrong: CodedWrong[];
}

/** A question as the browser receives it: no answer, no coded wrong answers, no drawn numbers. */
export type PublicQuestion = Pick<Question, "id" | "level" | "strand" | "format" | "whiteboard" | "prompt" | "readAloud" | "choices" | "say" | "figure"> & {
  /** A show-your-work question (#67). Since D-125 the screen asks for no work: the whiteboard is optional. */
  showWork: boolean;
};

/**
 * The browser's next screen: a question, numbered from 1, or the end of the test.
 * `breakAfter` is the number of questions before the halfway break (the end of stage 1), for the progress display.
 */
export type TestStep =
  | {
      status: "question";
      question: PublicQuestion;
      number: number;
      total: number;
      breakAfter: number;
      /** #189: the last RUSH_RUN answers were all very fast, so the screen says "Take your time". */
      takeYourTime: boolean;
      /** #190: a question of the extra round: its place in the round, from 1, and the round's length. Absent on main questions. */
      extra?: { number: number; total: number };
      /**
       * #249: the answered questions of the open section, in order, so Back shows them at once. Only the test attempt
       * module adds it (it knows when the test moved past a section); absent when no answer can change.
       */
      answered?: AnsweredQuestion[];
    }
  | {
      status: "complete";
      total: number;
      /**
       * #190: the extra round the child can take or skip now, before "Did anyone help?". Only the test attempt module
       * adds it (it knows whether the child skipped); absent when none is due.
       */
      extraRound?: ExtraRoundOffer;
    };

/** #249: an answered question the child can go back to: its number in the test, the question without its answer, and the child's response. */
export interface AnsweredQuestion {
  number: number;
  question: PublicQuestion;
  response: string;
}

export interface ChildProfile {
  grade: Grade;
  province: Province;
}

/** Which stage 2 form the child gets after stage 1. */
export type Route = "up" | "stay" | "down";

export interface Answer {
  questionId: string;
  response: string;
  /** Time on the question, measured by the caller. */
  timeMs: number;
  correct: boolean;
  /** Set when the response matches a coded wrong answer. */
  misconception: MisconceptionId | null;
}

/** Plain data, so the server can store it and pick it up again. */
export interface Session {
  profile: ChildProfile;
  seed: number;
  stage1: Question[];
  stage2: Record<Route, Question[]>;
  route: Route | null;
  answers: Answer[];
  /**
   * #190: the optional extra round, after the last main question: drawn when the child takes it (startExtraRound), and
   * asked after the routed form. Absent when the child did not take one, and on tests stored before #190.
   */
  extra?: Question[];
}

/**
 * What the server stores when a test starts. Never sent to the browser: it holds the answers. `extra` (#190) is added
 * when the child takes the extra round.
 */
export type StoredTest = Pick<Session, "profile" | "seed" | "stage1" | "stage2" | "extra">;

/** #190: the extra round a child can take now: how many questions, and the early-sign areas they cover, in band order. */
export interface ExtraRoundOffer {
  questions: number;
  strands: ReportedStrand[];
}

export type StrandStatus = "secure" | "developing" | "needs-attention";

export interface StrandResult {
  strand: ReportedStrand;
  status: StrandStatus;
  correct: number;
  total: number;
  /** #189: "clear" when one more answer, right or wrong, would not change the status. Absent in placements stored before #189. */
  certainty?: Certainty;
}

export interface LevelResult {
  level: Level;
  correct: number;
  total: number;
}

export interface Placement {
  grade: Grade;
  province: Province;
  /** The province whose grade tags scored the test. */
  scoredAgainst: TaggedProvince;
  workingLevel: Level;
  /** "low" when no level reached the working-level bar, so the level is an estimate below the lowest level seen. */
  confidence: "normal" | "low";
  /** #189: "clear" when one more answer, right or wrong, would not change the working level. Absent before #189. */
  levelCertainty?: Certainty;
  /** True when the child cleared the highest level the test reached; they may work higher still. */
  atCeiling: boolean;
  route: Route;
  stage1: { correct: number; total: number };
  levels: LevelResult[];
  strands: StrandResult[];
  /** The timed facts section (#70): speed beside accuracy. Null when the child had no facts section. Never changes the working level. */
  facts: FactsResult | null;
  /** Help flags (#71): for Savar's alert and the admin area, never the parent's report. Empty in placements stored before #71. */
  flags: Flag[];
  /** #189: very fast answers, the ones left out of the score, and whether the result may not be reliable. Absent before #189. */
  pace?: Pace;
  /**
   * #190: the extra round the child took, whose answers count in the levels and areas above: how many questions, and
   * the early-sign areas they covered. Absent when the child took none.
   */
  extraRound?: ExtraRoundOffer;
}
