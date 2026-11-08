import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { SCAN_LINK_WINDOW_MS, SCAN_LINKS_PER_HOUR, type ScanLinkStore } from "@/lib/scan-link";

// The scan link store on Supabase, with the secret key: the parent and child reads scoped to the parent, and the
// hourly count in public.scan_link_emails through claim_scan_link_email (migration scan_link_emails), which counts
// under a per-parent lock. The writes after a claim never throw: a failed write leaves the row counted.

export function scanLinkStore(admin: SupabaseClient<Database>): ScanLinkStore {
  const mark = async (id: string, fields: Database["public"]["Tables"]["scan_link_emails"]["Update"]) => {
    const { error } = await admin.from("scan_link_emails").update(fields).eq("id", id);
    if (error) console.error("[scan-link] row update failed", id, error.message);
  };
  return {
    async recipient(parent, child) {
      const [{ data: family, error: parentError }, { data: kid, error: childError }] = await Promise.all([
        admin.from("parents").select("name, email").eq("id", parent).maybeSingle(),
        admin.from("children").select("first_name").eq("id", child).eq("parent_id", parent).maybeSingle(),
      ]);
      if (parentError || childError) throw new Error(`scan link read: ${(parentError ?? childError)?.message}`);
      return family && kid ? { parentName: family.name, email: family.email, childName: kid.first_name } : null;
    },
    async claim(parent, child) {
      const { data, error } = await admin.rpc("claim_scan_link_email", {
        p_parent: parent, p_child: child, p_max: SCAN_LINKS_PER_HOUR, p_window_seconds: SCAN_LINK_WINDOW_MS / 1000,
      });
      if (error) throw new Error(`scan link claim: ${error.message}`);
      return typeof data === "string" ? data : null;
    },
    sent: (id, emailId) => mark(id, { status: "sent", email_id: emailId.slice(0, 100), error: null }),
    refused: (id, error) => mark(id, { status: "failed", error: error.slice(0, 500) }),
    unknown: (id, error) => mark(id, { error: error.slice(0, 500) }),
  };
}
