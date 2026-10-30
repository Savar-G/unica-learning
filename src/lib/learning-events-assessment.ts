// Learning events from assessment answers (#302, spec #295): each answer of a finished test becomes one event, so the
// learning record holds the assessment's signals before workbooks or calls exist. The key is the answer's id
// ("assessment-answer:<answer id>"), so a second backfill of the same test adds nothing.
//
// The mapping: a right answer is "right"; an empty answer (a skipped or cleared question) is "blank"; any other answer
// is "wrong", with its coded misconception as the mistake. The assessment gives no hints and has no worked steps, so an
// event from it has 0 hints and no stuck step (reading the question aloud is not help). The skill is the template's BC
// standard and its tagged skills. The time is when the server saw the answer (answered_at), else when it was stored
// (answers before #184). A time spent longer than the record keeps is left out (null). Answers of the removed extra
// round (D-145) and of a template no longer in the bank are skipped and named in the result.
// Pure TypeScript: no Next.js, React, network, database or clock. The Supabase reader of a test's answers is in
// src/lib/learning-events-store.ts.
import { BANKS, fromRemovedRound, templateSkills } from "@/lib/assessment";
import { MAX_TIME_MS, type LearningEvents, type NewLearningEvent } from "@/lib/learning-events";

/** An answer of a stored test (public.answers), with the columns the events need. */
export interface AssessmentAnswer {
  id: string;
  questionId: string;
  templateId: string;
  response: string;
  correct: boolean;
  misconception: string | null;
  timeMs: number;
  answeredAt: string | null;
  createdAt: string;
}

/** The test and its family. */
export interface AssessmentOwner {
  assessmentId: string;
  parentId: string;
  childId: string;
}

export interface BackfillResult {
  appended: number;
  alreadyStored: number;
  skipped: { answerId: string; reason: string }[];
}

const TEMPLATES = new Map(Object.values(BANKS).flat().map((t) => [t.id, t]));

/** The event for one answer, or why it has none. */
export function assessmentAnswerEvent(test: AssessmentOwner, answer: AssessmentAnswer): NewLearningEvent | { skip: string } {
  if (fromRemovedRound(answer.questionId)) return { skip: "a question of the removed extra round" };
  const template = TEMPLATES.get(answer.templateId);
  if (!template) return { skip: `template ${answer.templateId} is not in the bank` };
  const result = answer.correct ? "right" : answer.response.trim() === "" ? "blank" : "wrong";
  return {
    key: `assessment-answer:${answer.id}`,
    parentId: test.parentId,
    childId: test.childId,
    source: "assessment",
    question: { source: "assessment", assessmentId: test.assessmentId, questionId: answer.questionId },
    skill: { standard: template.standard, skills: templateSkills(template.id).map((s) => s.id) },
    result,
    stuckStep: null,
    mistake: result === "wrong" ? answer.misconception : null,
    hints: 0,
    timeMs: Number.isInteger(answer.timeMs) && answer.timeMs >= 0 && answer.timeMs <= MAX_TIME_MS ? answer.timeMs : null,
    occurredAt: answer.answeredAt ?? answer.createdAt,
    evidence: { kind: "answer", id: answer.id },
  };
}

/** Appends one event per answer of a finished test. Safe to run again: stored events are found by their key. */
export async function backfillAssessmentEvents(events: LearningEvents, test: AssessmentOwner, answers: readonly AssessmentAnswer[]): Promise<BackfillResult> {
  const done: BackfillResult = { appended: 0, alreadyStored: 0, skipped: [] };
  for (const answer of answers) {
    const event = assessmentAnswerEvent(test, answer);
    if ("skip" in event) {
      done.skipped.push({ answerId: answer.id, reason: event.skip });
      continue;
    }
    const appended = await events.append(event);
    if (appended.ok) done[appended.created ? "appended" : "alreadyStored"] += 1;
    else done.skipped.push({ answerId: answer.id, reason: appended.error === "invalid" ? appended.reason : "a different event is stored under its key" });
  }
  return done;
}
