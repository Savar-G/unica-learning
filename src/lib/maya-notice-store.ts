import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { NoticeStore } from "@/lib/maya-notice";

// The Maya notice store (src/lib/maya-notice.ts, #529) in Supabase. Any client can read: row-level security gives a
// parent's session only their own rows, and the secret key all. Only the secret key can save
// (public.maya_notice_acceptances, migration add_maya_notice_acceptances). Tests also use src/lib/maya-notice-memory.ts.
export function noticeStore(db: SupabaseClient<Database>): NoticeStore {
  return {
    async read(parentId, version) {
      const { data, error } = await db.from("maya_notice_acceptances").select("parent_id, notice_version, accepted_by, accepted_at")
        .eq("parent_id", parentId).eq("notice_version", version).maybeSingle();
      if (error) throw new Error(`maya notice read: ${error.message}`);
      return data && { parentId: data.parent_id, version: data.notice_version, acceptedBy: data.accepted_by, acceptedAt: data.accepted_at };
    },
    async save({ parentId, version, acceptedBy }) {
      // Insert only: a family that already agreed keeps its first row (unique violation 23505 on the primary key).
      const { error } = await db.from("maya_notice_acceptances").insert({ parent_id: parentId, notice_version: version, accepted_by: acceptedBy });
      if (error && error.code !== "23505") throw new Error(`maya notice save: ${error.message}`);
    },
  };
}
