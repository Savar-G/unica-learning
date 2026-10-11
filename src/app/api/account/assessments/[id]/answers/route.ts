import { nextQuestion, submitAnswer, testStep } from "@/lib/assessment";
import { loadTest, testAccess } from "@/lib/assessment-store";
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

  const loaded = await loadTest(admin, parent, (await ctx.params).id);
  if ("error" in loaded) return loaded.error;
  const { row, session } = loaded;
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
    return testFail("store_failed", 502);
  }
  // Stage 1 just ended: record the route for the admin view.
  if (!session.route && next.route) {
    const { error: routeError } = await admin.from("assessments").update({ route: next.route }).eq("id", row.id);
    if (routeError) console.error("[test] route save failed", routeError.message);
  }
  return Response.json({ ok: true, step: testStep(next) } satisfies StepResult);
}
