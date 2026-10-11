import { nextQuestion, submitAnswer, testStep, workProblem } from "@/lib/assessment";
import { loadTest, openAnswerWindow, testAccess } from "@/lib/assessment-store";
import { ANSWER_BODY_MAX, ANSWER_MAX, QUESTION_TIME_CAP_MS, testFail, type StepResult } from "@/lib/test-api";
import { parseWork } from "@/lib/work-payload";
import { removeWork, uploadWork } from "@/lib/work-store";

// Marks the answer to the current question with the assessment core, stores it, and returns the next step.
// The browser learns nothing about whether the answer was right.
// #67: the whiteboard work comes with the answer (`work`: a base64 PNG and the typed working). It is checked against
// the size limits and the core's rule (a show-your-work question needs work; grades 1-2 draw only), and the drawing goes
// to private storage before the answer row, which points to it.
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/answers">) {
  const access = await testAccess();
  if ("error" in access) return access.error;
  const { admin, parent } = access;

  // A body bigger than any allowed drawing is refused: at once when its length is given, else while it is read.
  const tooBig = () => testFail("work_too_big", 413, { message: "The answer is too big to save." });
  if (Number(request.headers.get("content-length") ?? 0) > ANSWER_BODY_MAX) return tooBig();
  const raw = await readCapped(request, ANSWER_BODY_MAX);
  if (raw === null) return tooBig();
  let body: { questionId?: unknown; response?: unknown; timeMs?: unknown; work?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return testFail("bad_json", 400);
  }
  const work = parseWork(body.work);
  if (!work.ok) return testFail(work.error, work.error === "work_too_big" ? 413 : 400, { message: work.message });

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
  const problem = workProblem(session, { drawn: work.png !== null, text: work.text });
  if (problem === "work_required") return testFail("work_required", 400, { message: "This question needs work on the whiteboard." });
  if (problem === "typing_off") return testFail("invalid", 400, { message: "Grades 1 and 2 draw their work. Typed working is not taken." });

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
  // The drawing first, under a new name, so the answer row can point to it. If the row is not stored, the file goes.
  const workPath = work.png ? await uploadWork(admin, parent, row.id, q.id, work.png) : null;
  if (work.png && !workPath) {
    await answerWindow.failed();
    return testFail("store_failed", 502);
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
    work_required: q.showWork === true,
    work_path: workPath,
    work_text: work.text || null,
  });
  if (error && workPath) await removeWork(admin, workPath);
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

/** The request body as text, or null as soon as it passes `max` bytes (a body sent without a length is read in parts). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts).toString("utf8");
}
