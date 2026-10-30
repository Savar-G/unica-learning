import { after } from "next/server";
import { isUuid } from "@/lib/assessment-store";
import { rebuildChildProfileNow } from "@/lib/child-profile-server";
import { rebuildLatestProfile } from "@/lib/learner-profile";
import { parseLearning, toRow, type LearningError, type LearningResult } from "@/lib/learning-style";
import { parentId, sessionClient } from "@/lib/supabase-auth";

const fail = (error: LearningError, status: number) => Response.json({ ok: false, error } satisfies LearningResult, { status });

// The parent saves how their child likes to learn (#126), from the report or the account. Written with the parent's
// own session: row-level security lets a parent update only these columns, and only on their own children, so another
// family's child id updates nothing. Empty answers clear what was stored. JSON only: a form on another site cannot
// send it with the parent's cookies. #196: the answers are part of the learner profile, and the card is answered after
// the report job built it, so the profile of the child's latest finished test is built again after the response.
// #303: then the child's profile, which reads that test profile and the card answers. Neither rebuild throws.
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("bad_json", 415);
  const db = await sessionClient();
  if (!(await parentId(db))) return fail("signed_out", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("bad_json", 400);
  }
  const child = (body as { child?: unknown } | null)?.child;
  const answers = parseLearning(body);
  if (typeof child !== "string" || !isUuid(child) || !answers) return fail("invalid", 400);

  const { data, error } = await db.from("children")
    .update({ ...toRow(answers), learning_updated_at: new Date().toISOString() })
    .eq("id", child).select("id");
  if (error) return fail("store_failed", 500);
  if (!data?.length) return fail("not_found", 404);
  after(async () => {
    await rebuildLatestProfile(child);
    await rebuildChildProfileNow(child);
  });
  return Response.json({ ok: true } satisfies LearningResult);
}
