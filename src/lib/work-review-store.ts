import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MISCONCEPTIONS, type MisconceptionId, type ShownWork, type StoredTest } from "@/lib/assessment";
import type { ReviewPiece, ReviewStore, StoredReview } from "@/lib/work-review";
import { WORK_BUCKET } from "@/lib/work-store";

// The AI work review's data in Supabase (#68), read and written with the secret key by the report job: the pieces of
// shown work with their answers, the stored reviews (table work_reviews, migration add_work_reviews), and the drawings
// in the private bucket. Parents cannot read work_reviews: the report model carries the comments they see.

/**
 * The shown work (loadShownWork) with what the reviewer needs from the stored test and answers: the child's answer, the
 * right answer, the question's level, and the known mistake a coded wrong answer matches.
 */
export async function reviewPieces(admin: SupabaseClient, assessmentId: string, shown: ShownWork[]): Promise<ReviewPiece[]> {
  if (shown.length === 0) return [];
  const [test, answers] = await Promise.all([
    admin.from("assessments").select("test").eq("id", assessmentId).single<{ test: StoredTest }>(),
    admin.from("answers")
      .select("question_id, response, misconception")
      .eq("assessment_id", assessmentId)
      .in("question_id", shown.map((w) => w.questionId))
      .returns<{ question_id: string; response: string; misconception: string | null }[]>(),
  ]);
  if (test.error) throw new Error(`review test load: ${test.error.message}`);
  if (answers.error) throw new Error(`review answers load: ${answers.error.message}`);
  const { stage1, stage2 } = test.data.test;
  const questions = new Map([...stage1, ...stage2.up, ...stage2.stay, ...stage2.down].map((q) => [q.id, q]));
  const given = new Map((answers.data ?? []).map((a) => [a.question_id, a]));
  return shown.flatMap((w) => {
    const q = questions.get(w.questionId);
    const a = given.get(w.questionId);
    if (!q || !a) return [];
    const misconception = a.misconception ? (MISCONCEPTIONS[a.misconception as MisconceptionId]?.description ?? null) : null;
    return [{
      questionId: w.questionId,
      prompt: w.prompt || q.prompt,
      answer: a.response,
      rightAnswer: q.answer,
      correct: w.correct,
      level: q.level,
      required: w.required,
      misconception,
      image: w.image,
      text: w.text,
    }];
  });
}

const COLUMNS = "question_id, error_type, kind, comment, score, confidence, model";
interface Row {
  question_id: string;
  error_type: string;
  kind: StoredReview["kind"];
  comment: string;
  score: number | string;
  confidence: StoredReview["confidence"];
  model: string;
}

/** The reviews of one test in work_reviews, and its drawings in the private bucket. */
export function reviewStore(admin: SupabaseClient, assessment: { id: string; parent_id: string }): ReviewStore {
  return {
    async stored() {
      const { data, error } = await admin.from("work_reviews").select(COLUMNS).eq("assessment_id", assessment.id).returns<Row[]>();
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
