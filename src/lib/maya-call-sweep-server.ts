import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { mayaCalls } from "@/lib/maya-call";
import { writeNoteAfterCall } from "@/lib/maya-call-note-server";
import { callSeams } from "@/lib/maya-call-seams";
import { liveCallSource } from "@/lib/maya-call-store";
import { sweepAbandonedCalls, sweepSeams, type SweepResult } from "@/lib/maya-call-sweep";

// The sweep of abandoned Maya chats and calls (#528, src/lib/maya-call-sweep.ts) with the secret key, for the reminder
// job. The parent notes it writes are code only (no AI warm sentence), and Maya's model is never asked.

/** Ends the abandoned calls; `deadline`: no new end starts after it (ms since 1970). `origin`: the safety alert's site. */
export function sweepAbandonedCallsNow(admin: SupabaseClient<Database>, options: { origin?: string; deadline?: number; dry?: boolean } = {}): Promise<SweepResult> {
  const seams = sweepSeams({ ...callSeams(admin, { origin: options.origin }), note: writeNoteAfterCall(admin, { codeOnly: true }) });
  return sweepAbandonedCalls({ calls: mayaCalls(seams), source: liveCallSource(admin), clock: () => Date.now(), deadline: options.deadline, dry: options.dry });
}
