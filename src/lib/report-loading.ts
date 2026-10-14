import "server-only";
import type { Province, ReportModel } from "@/lib/assessment";
import type { ReportView } from "@/lib/report-view";

// The report-loading module (spec #145): one place reads a stored report and makes the report view that the report
// page and the admin report view show (#161). Server only.
// One seam: who reads (ReportReader). Each reader has its own access, so each has its own adapter:
//   - the parent's session (src/lib/report-loading-server.ts): row-level security returns only the parent's own
//     reports, and storage signs only the drawings in the parent's folder;
//   - the admin's session (same file): the admin read functions, and drawings signed for the admin; never the secret key;
//   - in memory (src/lib/report-loading-memory.ts), for tests.
// The database row shapes stay in the adapters: callers get the view, the child id and the assessment id.

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

/** Who reads: the seam. A database error throws; a row the reader cannot see is not an error. */
export interface ReportReader {
  /** The report with its test and its child; null when this reader finds no report with this id. */
  report(id: string): Promise<ReportRecord | null>;
  /** Short-lived URLs of drawings, by stored path. A path this reader cannot sign is left out. */
  sign(paths: string[]): Promise<Record<string, string>>;
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
