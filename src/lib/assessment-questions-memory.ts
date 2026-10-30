import type { Route, StoredTest } from "@/lib/assessment";
import { lookupStoredQuestion, type AssessmentQuestionReader } from "@/lib/question-package-assessment";

// The assessment question reader (#298) in memory, for tests: the rows of public.assessments it reads, with the
// stored test and its route. It keeps the database's behaviour: a stored test is JSON, so the reader works on a copy.

/** A row of public.assessments, with only the columns the reader reads. */
export interface MemoryAssessmentRow {
  id: string;
  route: Route | null;
  test: StoredTest;
}

export function memoryAssessmentQuestions(rows: readonly MemoryAssessmentRow[]): AssessmentQuestionReader {
  return {
    async question(ref) {
      const row = rows.find((r) => r.id === ref.assessmentId);
      return lookupStoredQuestion(ref, row ? structuredClone({ test: row.test, route: row.route }) : null);
    },
  };
}
