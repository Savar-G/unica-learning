// The report-loading module's reader (src/lib/report-loading.ts) in memory, for tests. It keeps the access rules of
// the real readers: a parent reads only their own rows of each table (row-level security) and signs only the drawings
// in their own folder (the bucket's read policy); the admin reads and signs everything. A signed URL names its reader,
// so a test can tell whose session signed it.
import type { Province, ReportModel } from "@/lib/assessment";
import type { ReportReader } from "@/lib/report-loading";

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
/** The columns of public.assessments the report view reads. */
export interface MemoryAssessment {
  id: string;
  parentId: string;
  completedAt: string;
  province: Province;
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
  children?: MemoryChild[];
  drawings?: string[];
}

/**
 * The readers over the tables: one parent's session, or the admin's. `signed` lists every sign call, with the reader
 * and the paths it was asked to sign, so a test can check what was signed.
 */
export function memoryReportReaders({ reports = [], assessments = [], children = [], drawings = [] }: MemoryReportTables) {
  const signed: { reader: string; paths: string[] }[] = [];

  const reader = (who: string, sees: (parentId: string) => boolean): ReportReader => ({
    async report(id) {
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
        assessment: assessment ? { completedAt: assessment.completedAt, province: assessment.province } : null,
        child: child ? { firstName: child.firstName } : null,
      };
    },
    async sign(paths) {
      signed.push({ reader: who, paths: [...paths] });
      const urls = paths.filter((p) => drawings.includes(p) && sees(p.split("/")[0]));
      return Object.fromEntries(urls.map((p) => [p, `memory://${who}/${p}`]));
    },
  });

  return {
    parent: (parentId: string) => reader(parentId, (owner) => owner === parentId),
    admin: () => reader("admin", () => true),
    signed,
  };
}
