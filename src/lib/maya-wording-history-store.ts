import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { MAX_WORDINGS, mergeHistory, type WordingHistory, type WordingHistoryStore } from "@/lib/maya";

// The child's wording history (#375, D-196) in Supabase (migration add_maya_wording_history): one row per child in
// public.maya_wording_history, a jsonb object from wording id to the time the child last heard it (ms). Pass a client
// with the secret key: the service role may only read the table and call record_maya_wordings, which merges a call's
// wordings into the row under its lock (each wording keeps its newest time, then only the newest MAX_WORDINGS), so two
// calls of the same child that end together both keep theirs. Parents read nothing; admins read.
// A child that is gone records nothing. A family being deleted is refused (55000) and throws, like every other error:
// the caller decides what a failed write means. Tests use memoryWordingHistoryStore (src/lib/maya/wording-history.ts),
// which keeps the same rules. No Next.js or React.

/** Only finite times: what the database stores and what the session reads. */
const clean = (heard: unknown): WordingHistory => {
  if (typeof heard !== "object" || heard === null || Array.isArray(heard)) return {};
  return Object.fromEntries(Object.entries(heard).filter(([, at]) => typeof at === "number" && Number.isFinite(at)));
};

export function wordingHistoryStore(admin: SupabaseClient<Database>): WordingHistoryStore {
  return {
    async read(childId) {
      const { data, error } = await admin.from("maya_wording_history").select("heard").eq("child_id", childId).maybeSingle();
      if (error) throw new Error(`maya wording history read: ${error.message}`);
      return clean(data?.heard);
    },
    async record(childId, heard) {
      // The newest MAX_WORDINGS of the call, with finite times only (JSON has no other numbers).
      const sent = mergeHistory({}, heard);
      if (Object.keys(sent).length === 0) return;
      const { error } = await admin.rpc("record_maya_wordings", { p_child: childId, p_heard: sent, p_max: MAX_WORDINGS });
      if (error) throw new Error(`maya wording history record: ${error.code ?? ""} ${error.message}`.trim());
    },
  };
}
