import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ReviewStore, StoredReview } from "@/lib/work-review";
import { WORK_BUCKET } from "@/lib/work-store";

// The AI work review's data in Supabase (#68), read and written with the secret key by the report job (through its
// store, src/lib/report-job-store.ts): the stored reviews (table work_reviews, migration add_work_reviews) and the
// drawings in the private bucket. The pieces of shown work come from the report-loading module (src/lib/report-loading.ts,
// #162). Parents cannot read work_reviews: the report model carries the comments they see.

const COLUMNS = "question_id, error_type, kind, comment, score, confidence, model";

/** The reviews of one test in work_reviews, and its drawings in the private bucket. */
export function reviewStore(admin: SupabaseClient<Database>, assessment: { id: string; parent_id: string }): ReviewStore {
  return {
    async stored() {
      const { data, error } = await admin.from("work_reviews").select(COLUMNS).eq("assessment_id", assessment.id)
        // Check constraints limit kind and confidence.
        .overrideTypes<Pick<StoredReview, "kind" | "confidence">[]>();
      if (error) throw new Error(`reviews load: ${error.message}`);
      return (data ?? []).map((r) => ({
        questionId: r.question_id,
        errorType: r.error_type,
        kind: r.kind,
        comment: r.comment,
        // numeric comes back as a string.
        score: Number(r.score),
        confidence: r.confidence,
        model: r.model,
      }));
    },
    async save(reviews) {
      const rows = reviews.map((r) => ({
        assessment_id: assessment.id,
        parent_id: assessment.parent_id,
        question_id: r.questionId,
        error_type: r.errorType,
        kind: r.kind,
        comment: r.comment,
        score: r.score,
        confidence: r.confidence,
        model: r.model,
      }));
      // A run at the same time may have stored the same question: the first review stays.
      const { error } = await admin.from("work_reviews").upsert(rows, { onConflict: "assessment_id,question_id", ignoreDuplicates: true });
      if (error) throw new Error(`reviews insert: ${error.message}`);
    },
    async image(path) {
      const { data, error } = await admin.storage.from(WORK_BUCKET).download(path);
      if (error || !data) {
        console.error("[ai] drawing download failed", path, error?.message);
        return null;
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
