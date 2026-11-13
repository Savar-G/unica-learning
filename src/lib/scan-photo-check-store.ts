import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import { decisionClient, type DecisionClient } from "@/lib/decision-client";
import type { AiUsageTag } from "@/lib/ai-usage";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { STRAIGHT_PART, scanPartPath } from "@/lib/scan-crops";
import { markedFamily } from "@/lib/scan-pages-access";
import { SCAN_BUCKET } from "@/lib/scan-photo-server";
import { PHOTO_CHECK_STALE_SECONDS, PHOTO_CHECK_TIMEOUT_MS, photoCheckView, type PhotoCheckStore, type PhotoCheckView } from "@/lib/scan-photo-check";

/** The photo check's store (#855), on the secret key: every read and write names the family. */
export function photoCheckStore(db: SupabaseClient<Database>): PhotoCheckStore {
  return {
    eligible: (parent) => markedFamily(parent, db),
    async claim({ parent, photo, token }) {
      const { data, error } = await db.rpc("claim_photo_check", { p_parent: parent, p_id: photo, p_token: token, p_stale_seconds: PHOTO_CHECK_STALE_SECONDS });
      return !error && data === true;
    },
    async straight({ parent, photo }) {
      const { data, error } = await db.from("scan_calibrations").select("state,lease_token,result").eq("photo_id", photo).eq("parent_id", parent).maybeSingle();
      if (error) throw new Error("photo check: calibration");
      const parts = (data?.result as { parts?: unknown } | null)?.parts;
      if (!data || data.state !== "ready" || !data.lease_token || !Array.isArray(parts) || !parts.includes(STRAIGHT_PART)) return null;
      const file = await db.storage.from(SCAN_BUCKET).download(scanPartPath(parent, photo, data.lease_token, STRAIGHT_PART));
      if (file.error) throw new Error("photo check: straight page");
      return new Uint8Array(await file.data.arrayBuffer());
    },
    async finish({ parent, photo, token, result }) {
      const { data, error } = await db.rpc("finish_photo_check", { p_parent: parent, p_id: photo, p_token: token, p_result: result as unknown as Json });
      return !error && data === true;
    },
  };
}

/** The parent's view of a photo's stored check, or null on a failed read. */
export async function readPhotoCheckView(db: SupabaseClient<Database>, parent: string, photo: string): Promise<PhotoCheckView> {
  const { data, error } = await db.from("scan_photos").select("photo_check").eq("id", photo).eq("parent_id", parent).maybeSingle();
  return error || !data ? null : photoCheckView(data.photo_check);
}

/**
 * The photo check's decision client: one try, within the check's time limit. Null when decisions are off or misconfigured.
 * Development only (ignored in production): PHOTO_CHECK_FAKE=blurry or clear gives a fake model that answers after 1.5 s,
 * for screenshots and browser checks of the preview screen.
 */
export function photoCheckClient(env: Readonly<Record<string, string | undefined>> = process.env, usage?: AiUsageTag): DecisionClient | null {
  const fake = env.NODE_ENV === "production" ? undefined : env.PHOTO_CHECK_FAKE;
  if (fake === "blurry" || fake === "clear") {
    return fakeDecisionClient({ model: "fake/photo-check", usd: null, answer: () => new Promise((resolve) => setTimeout(() => resolve({ blurry: noul(fake === "blurry" ? 0.9 : 0.04) }), 1500)) });
  }
  try { return decisionClient(env, undefined, { maxRetries: 0, timeout: PHOTO_CHECK_TIMEOUT_MS, usage: usage ?? { feature: "photo_check" } }); } catch { return null; }
}
