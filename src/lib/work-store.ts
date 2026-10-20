import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";

// The child's whiteboard drawings (#67) in Supabase Storage. The bucket is private (migration add_shown_work): the
// server writes with the secret key; a signed-in parent can read only the files in their own folder, so the report page
// signs short-lived URLs with the parent's own session. There are no public URLs. The answer's drawing is stored and
// removed by the test attempt module's store (src/lib/test-attempt-server.ts, #147). The report job finds the shown
// work through the report-loading module (src/lib/report-loading.ts, #162), and the AI work review (#68) downloads each
// drawing through the job's store (src/lib/work-review-store.ts).

export const WORK_BUCKET = "shown-work";
/** A signed image URL on the report page works this long. The page signs new ones each time it loads. */
export const WORK_URL_SECONDS = 10 * 60;

/**
 * Short-lived URLs for drawings, by path. Sign with the parent's own session client: storage then checks that each
 * file is in their folder. A path that cannot be signed is left out (the report shows the typed work, or nothing).
 */
export async function signWork(client: SupabaseClient<Database>, paths: string[]): Promise<Record<string, string>> {
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
