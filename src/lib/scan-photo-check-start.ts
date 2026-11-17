import "server-only";
import { monitorProduct } from "@/lib/product-monitoring";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { claimPhotoCheck, runPhotoCheck } from "@/lib/scan-photo-check";
import { photoCheckClient, photoCheckStore } from "@/lib/scan-photo-check-store";
import type { AiUsageTag } from "@/lib/ai-usage";
import { isUuid } from "@/lib/workbook-content";

/**
 * The photo check (#855): when the page is ready, claim the check (only with the decision key set) and hand its run to
 * `schedule`. A claim is taken once per photo, so a second start (the preview route and the save route both start it,
 * #915) does nothing. It never throws: the check is optional and any error leaves it as it is.
 */
export async function startPhotoCheck(admin: SupabaseClient<Database>, parent: string, photo: string, schedule: (run: () => Promise<void>) => void | Promise<void>): Promise<void> {
  try {
    const usage: AiUsageTag = { feature: "photo_check", parentId: parent, source: { kind: "scan_photo", id: photo } };
    const client = photoCheckClient(process.env, usage);
    if (!client) return;
    const store = photoCheckStore(admin, { photo }), token = randomUUID();
    if (!await claimPhotoCheck(store, { parent, photo }, { client, token })) return;
    await schedule(async () => {
      try {
        let childId: string | null = null;
        try {
          const owner = await admin.from("scan_photos").select("child_id").eq("id", photo).eq("parent_id", parent)
            .abortSignal(AbortSignal.timeout(3_000)).maybeSingle();
          if (!owner.error && owner.data && isUuid(owner.data.child_id)) childId = owner.data.child_id;
        } catch { /* An unavailable owner stays unknown. The optional photo check retains its admission checks. */ }
        const scopedClient = childId ? photoCheckClient(process.env, { ...usage, childId }) : client;
        if (!scopedClient) return;
        const result = await runPhotoCheck(store, { parent, photo }, { client: scopedClient, token });
        if (result?.state === "unknown" && ["timeout", "malformed", "unavailable"].includes(result.error)) monitorProduct("scan.check_failed", { photoId: photo });
      } catch { monitorProduct("scan.check_failed", { photoId: photo }); }
    });
  } catch { monitorProduct("scan.check_failed", { photoId: photo }); }
}
