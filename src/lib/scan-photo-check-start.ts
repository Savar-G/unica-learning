import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { claimPhotoCheck, runPhotoCheck } from "@/lib/scan-photo-check";
import { photoCheckClient, photoCheckStore } from "@/lib/scan-photo-check-store";

/**
 * The photo check (#855): when the page is ready, claim the check (only with the decision key set) and hand its run to
 * `schedule`. A claim is taken once per photo, so a second start (the preview route and the save route both start it,
 * #915) does nothing. It never throws: the check is optional and any error leaves it as it is.
 */
export async function startPhotoCheck(admin: SupabaseClient<Database>, parent: string, photo: string, schedule: (run: () => Promise<void>) => void | Promise<void>): Promise<void> {
  try {
    const client = photoCheckClient(process.env, { feature: "photo_check", parentId: parent, source: { kind: "scan_photo", id: photo } });
    if (!client) return;
    const store = photoCheckStore(admin, { photo }), token = randomUUID();
    if (!await claimPhotoCheck(store, { parent, photo }, { client, token })) return;
    await schedule(() => runPhotoCheck(store, { parent, photo }, { client, token }).then(() => undefined, () => undefined));
  } catch { /* the check is optional */ }
}
