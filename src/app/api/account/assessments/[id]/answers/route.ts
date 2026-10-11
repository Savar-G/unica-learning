import { nextQuestion, submitAnswer, testStep } from "@/lib/assessment";
import { loadTest, openAnswerWindow, testAccess } from "@/lib/assessment-store";
import { ANSWER_MAX, QUESTION_TIME_CAP_MS, testFail, type StepResult } from "@/lib/test-api";

// Marks the answer to the current question with the assessment core, stores it, and returns the next step.
// The browser learns nothing about whether the answer was right.
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/answers">) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const { admin, parent } = access;

  let body: { questionId?: unknown; response?: unknown; timeMs?: unknown };
  try {
    body = await request.json();
  } catch {
    return testFail("bad_json", 400);
  }

  // One clock reading for the whole request: the expiry check and the guarded write use the same time (#72).
  const now = Date.now();
  const loaded = await loadTest(admin, parent, (await ctx.params).id, now);
  if ("error" in loaded) return loaded.error;
  const { row, session, attempt } = loaded;
  const q = nextQuestion(session);
  if (row.status !== "in_progress" || !q) return testFail("conflict", 409, { step: testStep(session) });
  // A second tab, or a retried request, answered this question already.
  if (body.questionId !== q.id) return testFail("conflict", 409, { step: testStep(session) });

  const response = typeof body.response === "string" ? body.response.trim() : "";
  const valid = q.format === "choice" ? (q.choices ?? []).includes(response) : response.length > 0 && response.length <= ANSWER_MAX;
  const timeMs = Number(body.timeMs);
  if (!valid || !Number.isFinite(timeMs) || timeMs < 0) return testFail("invalid", 400);

  const next = submitAnswer(session, { questionId: q.id, response, timeMs: Math.min(Math.round(timeMs), QUESTION_TIME_CAP_MS) });
  const marked = next.answers.at(-1)!;
  // #72: the deadline moves to 24 hours from this answer, only if the test is still open now. An answer that arrives
  // after the deadline, or after "Start again" expired the test, stops here and stores nothing.
  let answerWindow;
  try {
    answerWindow = await openAnswerWindow(admin, attempt, now);
  } catch (e) {
    console.error("[test]", e instanceof Error ? e.message : e);
    return testFail("store_failed", 502);
  }
  if (!answerWindow) {
    const fresh = await loadTest(admin, parent, row.id, now);
    return "error" in fresh ? fresh.error : testFail("conflict", 409, { step: testStep(fresh.session) });
  }
  const { error } = await admin.from("answers").insert({
    assessment_id: row.id,
    position: session.answers.length,
    question_id: q.id,
    template_id: q.templateId,
    values: q.values,
    response,
    correct: marked.correct,
    misconception: marked.misconception,
    time_ms: marked.timeMs,
  });
  if (error) {
    // Another request stored this question's answer first. Send the step after it, read fresh, so the screen moves on.
    if (error.code === "23505") {
      const fresh = await loadTest(admin, parent, row.id);
      return "error" in fresh ? fresh.error : testFail("conflict", 409, { step: testStep(fresh.session) });
    }
    console.error("[test] answer save failed", error.message);
    await answerWindow.failed();
    return testFail("store_failed", 502);
  }
  // The answer time is written only once the answer is stored: the reminder emails (#73) count from it.
  await answerWindow.stored();
  // Stage 1 just ended: record the route for the admin view.
  if (!session.route && next.route) {
    const { error: routeError } = await admin.from("assessments").update({ route: next.route }).eq("id", row.id);
    if (routeError) console.error("[test] route save failed", routeError.message);
  }
  return Response.json({ ok: true, step: testStep(next) } satisfies StepResult);
}
