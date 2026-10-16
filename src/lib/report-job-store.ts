import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportModel } from "@/lib/assessment";
import type { ParentContact } from "@/lib/report-email";
import { parentUnsubscribed } from "@/lib/reminder-store";
import type { ReviewStore } from "@/lib/work-review";
import { reviewStore } from "@/lib/work-review-store";

// The report job's own reads and writes (#162), outside the report-loading module: the report insert, the stored AI
// reviews and the drawings, the parent's contact details, and the unsubscribe check. The job reads its inputs and the
// view of its emails (#163) through the report-loading module (src/lib/report-loading.ts); these are the rest. With
// the secret key.
// Tests use the in-memory copy in src/lib/report-job-memory.ts.

/** A stored report, as the job reads it back. */
export interface StoredReport {
  id: string;
  model: ReportModel;
  questions: number;
  minutes: number;
}

/** A new report: one per test. */
export interface NewReport {
  assessmentId: string;
  parentId: string;
  childId: string;
  model: ReportModel;
  questions: number;
  minutes: number;
}

/** The job's store. A database error throws; a missing row is null. */
export interface ReportJobStore {
  /** The report stored for the test; null when there is none yet. */
  report(assessmentId: string): Promise<StoredReport | null>;
  /** Stores the report. Null when the test has a report already: a run at the same time stored it first. */
  insertReport(report: NewReport): Promise<StoredReport | null>;
  /**
   * #190: stores the report built again after an extra round finished from the report, in place: the same row, so the
   * report link and the email ledger stay. Two runs at once write the same result.
   */
  updateReport(id: string, rebuilt: Pick<NewReport, "model" | "questions" | "minutes">): Promise<StoredReport>;
  /** The test's stored AI reviews, and its drawings (#68). */
  reviews(assessment: { id: string; parentId: string }): ReviewStore;
  /** The parent's name and email; null when there is no parent row. */
  parent(parentId: string): Promise<ParentContact | null>;
  /** Whether the parent unsubscribed from reminders and emails about our plans (#80). */
  unsubscribed(parentId: string): Promise<boolean>;
}

const REPORT_COLUMNS = "id, model, questions, minutes";

/** The job's store in Supabase, with the secret key. */
export function reportJobStore(admin: SupabaseClient): ReportJobStore {
  return {
    async report(assessmentId) {
      const { data, error } = await admin.from("reports").select(REPORT_COLUMNS).eq("assessment_id", assessmentId).maybeSingle<StoredReport>();
      if (error) throw new Error(`report load: ${error.message}`);
      return data;
    },
    async insertReport(r) {
      const row = { assessment_id: r.assessmentId, parent_id: r.parentId, child_id: r.childId, model: r.model, questions: r.questions, minutes: r.minutes };
      // One report per assessment: a second insert adds nothing and returns no row.
      const { data, error } = await admin.from("reports").upsert(row, { onConflict: "assessment_id", ignoreDuplicates: true }).select(REPORT_COLUMNS).returns<StoredReport[]>();
      if (error) throw new Error(`report insert: ${error.message}`);
      return data?.[0] ?? null;
    },
    async updateReport(id, { model, questions, minutes }) {
      const { data, error } = await admin.from("reports").update({ model, questions, minutes }).eq("id", id).select(REPORT_COLUMNS).single<StoredReport>();
      if (error) throw new Error(`report update: ${error.message}`);
      return data;
    },
    reviews: (assessment) => reviewStore(admin, { id: assessment.id, parent_id: assessment.parentId }),
    async parent(parentId) {
      const { data, error } = await admin.from("parents").select("name, email").eq("id", parentId).maybeSingle<ParentContact>();
      if (error) throw new Error(`parent load: ${error.message}`);
      return data;
    },
    unsubscribed: (parentId) => parentUnsubscribed(admin, parentId),
  };
}
