import "server-only";
import {
  MISCONCEPTIONS,
  type AttemptStatus,
  type ComparisonInput,
  type Grade,
  type HelpAnswer,
  type MisconceptionId,
  type Placement,
  type ProfileAnswer,
  type Province,
  type ReportModel,
  type ShownWork,
  type StoredTest,
} from "@/lib/assessment";
import type { ReportView } from "@/lib/report-view";
import type { ReviewPiece } from "@/lib/work-review";

// The report-loading module (spec #145). Server only. Two operations:
//   - report inputs (#162): everything the report job needs to build the report of one finished test, from one read of
//     the stored test and one read of its answers;
//   - report view (#161): the report view of one stored report, which the report page and the admin report view show.
// One seam: who reads (ReportReader). Each reader has its own access, so each has its own adapter:
//   - the parent's session (src/lib/report-loading-server.ts): row-level security returns only the parent's own
//     reports, and storage signs only the drawings in the parent's folder; it cannot read the stored test or the answers;
//   - the admin's session (same file): the admin read functions, and drawings signed for the admin; never the secret key;
//   - the secret key (same file), for the report job: it reads every row and signs nothing (the email has no drawings);
//   - in memory (src/lib/report-loading-memory.ts), for tests.
// The database row shapes stay in the adapters: callers get the inputs, or the view with the child id and the
// assessment id.

/** A stored report as a reader finds it, with its test and its child. */
export interface ReportRecord {
  id: string;
  assessmentId: string;
  childId: string;
  model: ReportModel;
  /** Questions answered, as stored with the report. */
  questions: number;
  /** Minutes on the questions, as stored with the report. */
  minutes: number;
  /** The test the report is for; null when the reader cannot find it. */
  assessment: { completedAt: string; province: Province } | null;
  /** The child; null when the reader cannot find them. */
  child: { firstName: string } | null;
}

/** A test as a reader finds it, with its stored test (the questions drawn for it, with their right answers). */
export interface AssessmentRecord {
  id: string;
  parentId: string;
  childId: string;
  status: AttemptStatus;
  grade: Grade;
  province: Province;
  /** Null until the test is completed. */
  completedAt: string | null;
  /** The scored result; null until the test is completed. */
  placement: Placement | null;
  /** The child's answer to "Did anyone help?" (#71); null when the test did not ask it. */
  help: HelpAnswer | null;
  test: StoredTest;
}

/** A stored answer to one question of a test, with the work the child showed (#67). */
export interface StoredAnswer {
  /** Its place in the test, from 0. */
  position: number;
  questionId: string;
  /** The child's answer, as stored. */
  response: string;
  correct: boolean;
  /** The known mistake a coded wrong answer matches (a MisconceptionId, as stored); null when it matches none. */
  misconception: string | null;
  /** Time on the question. */
  timeMs: number;
  /** True on a show-your-work question. */
  workRequired: boolean;
  /** The drawing's path in the private bucket; null when the child did not draw. */
  workPath: string | null;
  /** The typed working; null when the child typed none. */
  workText: string | null;
  /** #184: "Read it to me" uses on the question; null when not recorded (an answer from before #184). */
  readAloud: number | null;
  /** #184: time away from the tab on the question; null when not recorded. */
  away: { count: number; ms: number } | null;
}

/** Who reads: the seam. A database error throws; a row the reader cannot see is not an error. */
export interface ReportReader {
  /** The report with its test and its child; null when this reader finds no report with this id. */
  report(id: string): Promise<ReportRecord | null>;
  /** The test with its stored test; null when this reader finds no such test, or may not read its stored test. */
  assessment(id: string): Promise<AssessmentRecord | null>;
  /** The stored answers of the test, in test order; none when this reader may not read them. */
  answers(assessmentId: string): Promise<StoredAnswer[]>;
  /** Short-lived URLs of drawings, by stored path. A path this reader cannot sign is left out. */
  sign(paths: string[]): Promise<Record<string, string>>;
}

/** A finished test, as the report job needs it. */
export interface FinishedAssessment {
  id: string;
  parentId: string;
  childId: string;
  grade: Grade;
  province: Province;
  completedAt: string;
  placement: Placement;
  /** The child's answer to "Did anyone help?" (#71); null when the test did not ask it. */
  help: HelpAnswer | null;
}

/** Everything the report job needs to build the report of one finished test. */
export interface ReportInputs {
  assessment: FinishedAssessment;
  /** Every answer with work on the whiteboard (#67), in test order. */
  shownWork: ShownWork[];
  /**
   * The shown work as the AI work review (#68) needs it: with the child's answer, the right answer, the question's level
   * and the known mistake a coded wrong answer matches. Built from the same read, only when the AI step asks.
   */
  reviewPieces(): ReviewPiece[];
  /**
   * Every answer as the learner profile (#196) reads it: the question as the child saw it, the mark, the time, whether
   * work was shown (never the work itself), the read-aloud uses and the time away. In test order; built from the same
   * read, only when asked.
   */
  profileAnswers(): ProfileAnswer[];
  /**
   * The comparison input (#101): the comparison read, made only when asked. The job asks only when it builds a new
   * report, so a run that finds the report already stored makes no comparison read.
   */
  comparison(): Promise<ComparisonInput>;
  /** Every marked question, also those above the school grade that the report's areas leave out. */
  questions: number;
  /** Minutes on the questions, from the stored answer times, to the nearest minute; at least 1. */
  minutes: number;
}

/** The comparison read (#101, src/lib/comparison-store.ts): every completed test, for the report of this one. */
export type ComparisonRead = (assessmentId: string) => Promise<ComparisonInput>;

/**
 * The report inputs of one test; null when the reader finds no such test, or the test is not completed or has no
 * placement. Reads the stored test once and its answers once.
 */
export async function loadReportInputs(reader: ReportReader, assessmentId: string, comparison: ComparisonRead): Promise<ReportInputs | null> {
  const a = await reader.assessment(assessmentId);
  if (!a || a.status !== "completed" || !a.completedAt || !a.placement) return null;
  const stored = await reader.answers(a.id);
  // The question map: every question the test could ask, from stage 1, the three stage 2 paths and the extra round (#190).
  const { stage1, stage2, extra = [] } = a.test;
  const questions = new Map([...stage1, ...stage2.up, ...stage2.stay, ...stage2.down, ...extra].map((q) => [q.id, q]));
  // #190: the answers the placement scored. A round started from the report counts only once it is finished.
  const unscored = a.placement.extraRound ? new Set<string>() : new Set(extra.map((q) => q.id));
  const answers = stored.filter((x) => !unscored.has(x.questionId));
  const withWork = answers.filter((x) => x.workPath !== null || x.workText !== null);
  return {
    assessment: {
      id: a.id,
      parentId: a.parentId,
      childId: a.childId,
      grade: a.grade,
      province: a.province,
      completedAt: a.completedAt,
      placement: a.placement,
      help: a.help,
    },
    shownWork: withWork.map((x) => ({
      questionId: x.questionId,
      prompt: questions.get(x.questionId)?.prompt ?? "",
      correct: x.correct,
      required: x.workRequired,
      image: x.workPath,
      text: x.workText,
    })),
    // A piece whose question is not in the stored test is left out.
    reviewPieces: () => withWork.flatMap((x) => {
      const q = questions.get(x.questionId);
      if (!q) return [];
      const misconception = x.misconception ? (MISCONCEPTIONS[x.misconception as MisconceptionId]?.description ?? null) : null;
      return [{
        questionId: x.questionId,
        prompt: q.prompt,
        answer: x.response,
        rightAnswer: q.answer,
        correct: x.correct,
        level: q.level,
        required: x.workRequired,
        misconception,
        image: x.workPath,
        text: x.workText,
      }];
    }),
    // An answer whose question is not in the stored test is left out.
    profileAnswers: () => answers.flatMap((x): ProfileAnswer[] => {
      const q = questions.get(x.questionId);
      if (!q) return [];
      return [{
        question: q,
        response: x.response,
        correct: x.correct,
        misconception: x.misconception,
        timeMs: x.timeMs,
        work: { required: x.workRequired, drawing: x.workPath !== null, typed: x.workText !== null },
        readAloud: x.readAloud,
        away: x.away,
      }];
    }),
    comparison: () => comparison(a.id),
    // Every answered question (#189): the placement's levels leave out rushed wrong answers, so they cannot count them.
    questions: answers.length,
    minutes: Math.max(1, Math.round(answers.reduce((ms, x) => ms + x.timeMs, 0) / 60_000)),
  };
}

/** A report ready to show, with the ids the caller needs next (the child's next step, the admin's test link). */
export interface LoadedReport {
  view: ReportView;
  childId: string;
  assessmentId: string;
}

/**
 * The report view of one report, as this reader may see it; null ("not found") when the reader finds no such report,
 * or finds it without its test or its child. Only the drawings of the report's work are signed.
 */
export async function loadReportView(reader: ReportReader, id: string): Promise<LoadedReport | null> {
  const row = await reader.report(id);
  if (!row?.assessment || !row.child) return null;
  const paths = (row.model.work ?? []).flatMap((w) => (w.image ? [w.image] : []));
  return {
    childId: row.childId,
    assessmentId: row.assessmentId,
    view: {
      id: row.id,
      childName: row.child.firstName,
      province: row.assessment.province,
      completedAt: row.assessment.completedAt,
      questions: row.questions,
      minutes: row.minutes,
      model: row.model,
      workImages: await reader.sign(paths),
    },
  };
}
