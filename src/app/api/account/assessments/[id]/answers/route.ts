import { isUuid } from "@/lib/assessment-store";
import { adminClient, parentId, sessionClient } from "@/lib/supabase-auth";
import { ANSWER_BODY_MAX, refusalResponse, testFail, type StepResult } from "@/lib/test-api";
import { answerQuestion } from "@/lib/test-attempt";
import { attemptStore } from "@/lib/test-attempt-server";
import { parseWork } from "@/lib/work-payload";
import { parseAnswerEvents } from "@/lib/answer-events";

// Marks the answer to the current question, stores it with its whiteboard work (#67), and returns the next step.
// The browser learns nothing about whether the answer was right. The test attempt module (src/lib/test-attempt.ts,
// #147) runs the rules and stores the answer; this route reads the request (the size cap, the JSON and the work
// payload) and only translates the result.
export async function POST(request: Request, ctx: RouteContext<"/api/account/assessments/[id]/answers">) {
  const parent = await parentId(await sessionClient());
  if (!parent) return testFail("signed_out", 401);
  const admin = adminClient();
  if (!admin) return testFail("store_failed", 503);

  // A body bigger than any allowed drawing is refused: at once when its length is given, else while it is read.
  const tooBig = () => testFail("work_too_big", 413, { message: "The answer is too big to save." });
  if (Number(request.headers.get("content-length") ?? 0) > ANSWER_BODY_MAX) return tooBig();
  const raw = await readCapped(request, ANSWER_BODY_MAX);
  if (raw === null) return tooBig();
  let body: { questionId?: unknown; response?: unknown; timeMs?: unknown; work?: unknown; events?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return testFail("bad_json", 400);
  }
  const work = parseWork(body.work);
  if (!work.ok) return testFail(work.error, work.error === "work_too_big" ? 413 : 400, { message: work.message });
  // #186: strokes that cannot be stored are left out, and the answer goes on with its drawing.
  if (work.strokesDropped) console.error("[strokes] left out", work.strokesDropped);

  const { id } = await ctx.params;
  if (!isUuid(id)) return testFail("not_found", 404);
  // One clock reading for the whole request: the expiry check and the guarded write use the same time (#72).
  const result = await answerQuestion(attemptStore(admin), parent, id, {
    questionId: typeof body.questionId === "string" ? body.questionId : "",
    response: typeof body.response === "string" ? body.response : "",
    timeMs: Number(body.timeMs),
    work: { png: work.png, text: work.text, strokes: work.strokes },
    // #184: what the child did before Next, bounded. Events that cannot be used never stop the answer.
    events: parseAnswerEvents(body.events),
  }, Date.now());
  if (!result.ok) return refusalResponse(result);
  return Response.json({ ok: true, step: result.step } satisfies StepResult);
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
