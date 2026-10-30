import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { lookupStoredQuestion, type AssessmentQuestionReader } from "@/lib/question-package-assessment";

// The assessment question reader (#298) in Supabase: reads the stored test and its route from public.assessments and
// gives the question as a package through the assessment adapter (src/lib/question-package-assessment.ts). Parents
// have no grant on the stored test column, so the reader needs the secret key (or an admin's session); the caller
// checks that the test belongs to the signed-in family before it reads. Tests use
// src/lib/assessment-questions-memory.ts. No Next.js or React.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assessmentQuestionReader(db: SupabaseClient<Database>): AssessmentQuestionReader {
  return {
    async question(ref) {
      if (!UUID.test(ref.assessmentId)) return { status: "not-found" };
      const { data, error } = await db.from("assessments").select("test, route").eq("id", ref.assessmentId).maybeSingle();
      if (error) throw new Error(`assessment question load: ${error.message}`);
      return lookupStoredQuestion(ref, data);
    },
  };
}
