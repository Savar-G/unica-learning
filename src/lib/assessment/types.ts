import type { CurriculumId } from "@/lib/signup";
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
}

/**
 * A question template. Its level on the K-8 scale is the grade where BC teaches it (grades.BC);
 * a child in another tagged province is measured at that province's grade instead.
 */
export interface Template {
  id: string;
  strand: Strand;
  grades: ProvinceGrades;
  format: AnswerFormat;
  /** True when the question suits required shown work on the whiteboard. */
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
   * True when the child must show work on the whiteboard before Next (#67). The session picks the band's count
   * (GradeBand.whiteboardRequired) on every route, from the templates that suit it first. Absent on tests stored
   * before #67: nothing is required there.
   */
  showWork?: boolean;
  prompt: string;
  readAloud: string;
  /** Shuffled answer choices, only for "choice" questions. */
  choices?: string[];
  values: Record<string, number>;
  answer: string;
  wrong: CodedWrong[];
}

/** A question as the browser receives it: no answer, no coded wrong answers, no drawn numbers. */
export type PublicQuestion = Pick<Question, "id" | "level" | "strand" | "format" | "whiteboard" | "prompt" | "readAloud" | "choices"> & {
  /** True when the child must show work on the whiteboard before Next (#67). */
  showWork: boolean;
};

/**
 * The browser's next screen: a question, numbered from 1, or the end of the test.
 * `breakAfter` is the number of questions before the halfway break (the end of stage 1), for the progress display.
 */
export type TestStep =
  | { status: "question"; question: PublicQuestion; number: number; total: number; breakAfter: number }
  | { status: "complete"; total: number };

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
}

/** What the server stores when a test starts. Never sent to the browser: it holds the answers. */
export type StoredTest = Pick<Session, "profile" | "seed" | "stage1" | "stage2">;

export type StrandStatus = "secure" | "developing" | "needs-attention";

export interface StrandResult {
  strand: ReportedStrand;
  status: StrandStatus;
  correct: number;
  total: number;
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
}
