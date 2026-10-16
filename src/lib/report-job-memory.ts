// The report job's store (src/lib/report-job-store.ts) in memory, for tests (#162). It works on the report-loading
// module's in-memory tables (src/lib/report-loading-memory.ts): a report the job stores is in their reports table, as
// in one database, so the in-memory readers find it (#163). The parents, the unsubscribes and the stored AI reviews are
// its own. It keeps the database's rules: one report per test, and one stored review per question. It counts its reads
// of each table, one for each database request, in the readers' counter (`reads`), so a test sees the job's reads.
import type { ParentContact } from "@/lib/report-email";
import type { ReportJobStore, StoredReport } from "@/lib/report-job-store";
import type { MemoryReport, MemoryReportTables } from "@/lib/report-loading-memory";
import type { StoredReview } from "@/lib/work-review";

/** A row of public.parents. */
export interface MemoryParent extends ParentContact {
  id: string;
}

/** The bytes of every drawing in the bucket. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const stored = ({ id, model, questions, minutes }: MemoryReport): StoredReport => ({ id, model, questions, minutes });

/**
 * The job's store over the tables. `reads`: the read counter of each table, by table name; give the readers' counter
 * (memoryReportReaders().reads) to count the reads of both in one. `parents`: the parent rows. `unsubscribed`: the ids
 * of the parents who unsubscribed. `reviews()` gives the stored AI reviews, and `downloads` lists every drawing the job
 * downloaded, so a test can check them.
 */
export function memoryReportJobStore(
  tables: MemoryReportTables,
  {
    reads = {},
    parents = [],
    unsubscribed = [],
  }: { reads?: Record<string, number>; parents?: MemoryParent[]; unsubscribed?: string[] } = {},
) {
  const reviews: { assessmentId: string; parentId: string; review: StoredReview }[] = [];
  const downloads: string[] = [];
  const count = (table: string) => {
    reads[table] = (reads[table] ?? 0) + 1;
  };

  const store: ReportJobStore = {
    async report(assessmentId) {
      count("reports");
      const row = (tables.reports ?? []).find((r) => r.assessmentId === assessmentId);
      return row ? stored(row) : null;
    },
    async insertReport(r) {
      const reports = (tables.reports ??= []);
      if (reports.some((x) => x.assessmentId === r.assessmentId)) return null;
      // Stored as JSON, as in the database.
      const row: MemoryReport = { id: `report-${reports.length + 1}`, ...r, model: structuredClone(r.model) };
      reports.push(row);
      return stored(row);
    },
    reviews: (assessment) => ({
      async stored() {
        count("work_reviews");
        return reviews.filter((r) => r.assessmentId === assessment.id).map((r) => ({ ...r.review }));
      },
      async save(list) {
        for (const review of list) {
          if (reviews.some((r) => r.assessmentId === assessment.id && r.review.questionId === review.questionId)) continue;
          reviews.push({ assessmentId: assessment.id, parentId: assessment.parentId, review: { ...review } });
        }
      },
      async image(path) {
        downloads.push(path);
        return (tables.drawings ?? []).includes(path) ? PNG : null;
      },
    }),
    async parent(parentId) {
      count("parents");
      const row = parents.find((p) => p.id === parentId);
      return row ? { name: row.name, email: row.email } : null;
    },
    async unsubscribed(parentId) {
      // The unsubscribes are rows of public.email_log.
      count("email_log");
      return unsubscribed.includes(parentId);
    },
  };
  return { store, reviews: () => reviews.map((r) => r.review), downloads, reads };
}
