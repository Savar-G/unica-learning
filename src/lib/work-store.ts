import "server-only";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShownWork, StoredTest } from "@/lib/assessment";
import { workPath } from "@/lib/work-payload";

// The child's whiteboard drawings (#67) in Supabase Storage. The bucket is private (migration add_shown_work): the
// server writes with the secret key; a signed-in parent can read only the files in their own folder, so the report page
// signs short-lived URLs with the parent's own session. There are no public URLs.

export const WORK_BUCKET = "shown-work";
/** A signed image URL on the report page works this long. The page signs new ones each time it loads. */
export const WORK_URL_SECONDS = 10 * 60;

/** Stores one drawing under a new name. Returns its path, or null when the upload failed (logged). */
export async function uploadWork(admin: SupabaseClient, parentId: string, assessmentId: string, questionId: string, png: Buffer): Promise<string | null> {
  const path = workPath(parentId, assessmentId, questionId, randomBytes(6).toString("hex"));
  const { error } = await admin.storage.from(WORK_BUCKET).upload(path, png, { contentType: "image/png", upsert: false, cacheControl: "3600" });
  if (error) {
    console.error("[work] upload failed", error.message);
    return null;
  }
  return path;
}

/** Removes a drawing whose answer was not stored. Best effort: a failure is logged. */
export async function removeWork(admin: SupabaseClient, path: string): Promise<void> {
  const { error } = await admin.storage.from(WORK_BUCKET).remove([path]);
  if (error) console.error("[work] remove failed", error.message);
}

/**
 * Every answer of a test with work on the whiteboard, in test order, read with the secret key: the question, right or
 * not, whether it required work, the drawing's path and the typed working. The report job gives these to the report
 * model; the AI work review (#68) reads the same list and downloads each drawing with
 * `admin.storage.from(WORK_BUCKET).download(image)`.
 */
export async function loadShownWork(admin: SupabaseClient, assessmentId: string): Promise<ShownWork[]> {
  const [test, answers] = await Promise.all([
    admin.from("assessments").select("test").eq("id", assessmentId).single<{ test: StoredTest }>(),
    admin.from("answers")
      .select("question_id, correct, work_required, work_path, work_text")
      .eq("assessment_id", assessmentId)
      .or("work_path.not.is.null,work_text.not.is.null")
      .order("position")
      .returns<{ question_id: string; correct: boolean; work_required: boolean; work_path: string | null; work_text: string | null }[]>(),
  ]);
  if (test.error) throw new Error(`work test load: ${test.error.message}`);
  if (answers.error) throw new Error(`work answers load: ${answers.error.message}`);
  const { stage1, stage2 } = test.data.test;
  const prompts = new Map([...stage1, ...stage2.up, ...stage2.stay, ...stage2.down].map((q) => [q.id, q.prompt]));
  return (answers.data ?? []).map((a) => ({
    questionId: a.question_id,
    prompt: prompts.get(a.question_id) ?? "",
    correct: a.correct,
    required: a.work_required,
    image: a.work_path,
    text: a.work_text,
  }));
}

/**
 * Short-lived URLs for drawings, by path. Sign with the parent's own session client: storage then checks that each
 * file is in their folder. A path that cannot be signed is left out (the report shows the typed work, or nothing).
 */
export async function signWork(client: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await client.storage.from(WORK_BUCKET).createSignedUrls(paths, WORK_URL_SECONDS);
  if (error) {
    console.error("[work] sign failed", error.message);
    return {};
  }
  const urls: Record<string, string> = {};
  for (const item of data) if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
  return urls;
}
