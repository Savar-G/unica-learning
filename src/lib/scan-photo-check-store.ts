import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import { decisionClient, type DecisionClient } from "@/lib/decision-client";
import type { AiUsageTag } from "@/lib/ai-usage";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { STRAIGHT_PART, scanPartPath } from "@/lib/scan-crops";
import { scanChecksDecision, type Env } from "@/lib/scan-marking-access";
import { SCAN_BUCKET } from "@/lib/scan-photo-server";
import { PHOTO_CHECK_STALE_SECONDS, PHOTO_CHECK_TIMEOUT_MS, photoCheckView, type PhotoCheckStore, type PhotoCheckView } from "@/lib/scan-photo-check";

/**
 * The photo check's store (#855), on the secret key: every read and write names the family. Who (#856): every family
 * `scanChecksAccess` allows for this photo, asked again at the claim, before the photo is sent and at the finish. The
 * decision goes to the database as it is (p_access): "closed" refuses there whatever the family's membership; "test"
 * (a test family or an admin) is checked again by the database's own membership check; "families" (a running plan in
 * families mode) is checked again on the plan row, under a share lock, in the claim's and the finish's transaction, so a
 * plan that closes after this read makes the write refuse. A failed read is "closed".
 */
export function photoCheckStore(db: SupabaseClient<Database>, scope: { photo: string; env?: Env }): PhotoCheckStore {
  const env = scope.env ?? process.env;
  const decide = (parent: string) => scanChecksDecision(db, parent, env, { photo: scope.photo }).catch(() => ({ open: false, reason: "unavailable" }));
  // The decision, never widened: a closed one is never turned into the database's test check.
  const access = async (parent: string): Promise<"closed" | "test" | "families"> => {
    const d = await decide(parent);
    return !d.open ? "closed" : d.reason === "test_family" ? "test" : "families";
  };
  const own = (photo: string) => { if (photo !== scope.photo) throw new Error("photo check: another photo"); };
  return {
    async eligible(parent) { return (await decide(parent)).open; },
    async claim({ parent, photo, token }) {
      own(photo);
      const { data, error } = await db.rpc("claim_photo_check", { p_parent: parent, p_id: photo, p_token: token, p_stale_seconds: PHOTO_CHECK_STALE_SECONDS, p_access: await access(parent) });
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
      own(photo);
      const { data, error } = await db.rpc("finish_photo_check", { p_parent: parent, p_id: photo, p_token: token, p_result: result as unknown as Json, p_access: await access(parent) });
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
