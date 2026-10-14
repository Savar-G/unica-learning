// The report-loading module's reader (src/lib/report-loading.ts) in memory, for tests. It keeps the access rules of
// the real readers: a parent reads only their own rows of each table (row-level security), never the stored test or
// the answers (no grant), and signs only the drawings in their own folder (the bucket's read policy); the admin reads
// and signs everything; the secret key reads everything and signs nothing. A signed URL names its reader, so a test can
// tell whose session signed it. It counts the reads of each table, so a test can check how often each was read.
import type { ReportModel } from "@/lib/assessment";
import type { AssessmentRecord, ReportReader, StoredAnswer } from "@/lib/report-loading";

/** A row of public.reports. */
export interface MemoryReport {
  id: string;
  assessmentId: string;
  parentId: string;
  childId: string;
  model: ReportModel;
  questions: number;
  minutes: number;
}
/** The columns of public.assessments the readers read, with the stored test. */
export type MemoryAssessment = AssessmentRecord;
/** The columns of public.answers the readers read. */
export interface MemoryAnswer extends StoredAnswer {
  assessmentId: string;
}
/** The columns of public.children the report view reads. */
export interface MemoryChild {
  id: string;
  parentId: string;
  firstName: string;
}
/** The tables, and the drawings bucket as its stored paths (`<parent id>/<assessment id>/<file>`). */
export interface MemoryReportTables {
  reports?: MemoryReport[];
  assessments?: MemoryAssessment[];
  answers?: MemoryAnswer[];
  children?: MemoryChild[];
  drawings?: string[];
}

/**
 * The readers over the tables: one parent's session, the admin's, or the secret key. `signed` lists every sign call of
 * a session, with the reader and the paths it was asked to sign, so a test can check what was signed. `reads` counts
 * the reads of each table, by any reader. A table left out is made empty on `tables`, so that other adapters over the
 * same tables (src/lib/report-job-memory.ts) see the same rows.
 */
export function memoryReportReaders(tables: MemoryReportTables) {
  const reports = (tables.reports ??= []);
  const assessments = (tables.assessments ??= []);
  const answers = (tables.answers ??= []);
  const children = (tables.children ??= []);
  const drawings = (tables.drawings ??= []);
  const signed: { reader: string; paths: string[] }[] = [];
  const reads = { reports: 0, assessments: 0, answers: 0 };

  const reader = (who: string, sees: (parentId: string) => boolean, { tests = true, signs = true } = {}): ReportReader => ({
    async report(id) {
      reads.reports++;
      const row = reports.find((r) => r.id === id && sees(r.parentId));
      if (!row) return null;
      const assessment = assessments.find((a) => a.id === row.assessmentId && sees(a.parentId));
      const child = children.find((c) => c.id === row.childId && sees(c.parentId));
      return {
        id: row.id,
        assessmentId: row.assessmentId,
        childId: row.childId,
        model: row.model,
        questions: row.questions,
        minutes: row.minutes,
        // A report's test is always completed.
        assessment: assessment ? { completedAt: assessment.completedAt ?? "", province: assessment.province } : null,
        child: child ? { firstName: child.firstName } : null,
      };
    },
    async assessment(id) {
      reads.assessments++;
      const row = tests ? assessments.find((a) => a.id === id && sees(a.parentId)) : undefined;
      return row ? structuredClone(row) : null;
    },
    async answers(assessmentId) {
      reads.answers++;
      if (!tests) return [];
      return answers
        .filter((a) => a.assessmentId === assessmentId)
        .sort((a, b) => a.position - b.position)
        .map((a): StoredAnswer => ({
          position: a.position,
          questionId: a.questionId,
          response: a.response,
          correct: a.correct,
          misconception: a.misconception,
          timeMs: a.timeMs,
          workRequired: a.workRequired,
          workPath: a.workPath,
          workText: a.workText,
        }));
    },
    async sign(paths) {
      if (!signs) return {};
      signed.push({ reader: who, paths: [...paths] });
      const urls = paths.filter((p) => drawings.includes(p) && sees(p.split("/")[0]));
      return Object.fromEntries(urls.map((p) => [p, `memory://${who}/${p}`]));
    },
  });

  return {
    parent: (parentId: string) => reader(parentId, (owner) => owner === parentId, { tests: false }),
    admin: () => reader("admin", () => true),
    key: () => reader("key", () => true, { signs: false }),
    signed,
    reads,
  };
}
