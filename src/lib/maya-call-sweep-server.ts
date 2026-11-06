import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { MailTransport } from "@/lib/email-delivery";
import { mayaCalls } from "@/lib/maya-call";
import { writeNoteAfterCall } from "@/lib/maya-call-note-server";
import { callSeams } from "@/lib/maya-call-seams";
import { sweepCallSource } from "@/lib/maya-call-store";
import { SWEEP_START_MS, SWEEP_TIME_LIMIT_MS, sweepAbandonedCalls, sweepSeams, type SweepResult } from "@/lib/maya-call-sweep";

// The sweep of abandoned Maya chats and calls (#528, src/lib/maya-call-sweep.ts) with the secret key, for the reminder
// job. The parent notes it writes are code only (no AI warm sentence), and Maya's model is never asked. The child profile
// rebuild runs as at every call end, so it makes its paid AI call when OPENROUTER_API_KEY is set and the child has events.

/**
 * Ends the abandoned calls and finishes unfinished ones. It starts no new end after SWEEP_START_MS from `startedAt` and
 * answers within SWEEP_TIME_LIMIT_MS. `origin`: the safety alert's site. `transport`: the safety alert's, so it shares the run's send rate.
 */
export function sweepAbandonedCallsNow(admin: SupabaseClient<Database>, options: { origin?: string; startedAt?: number; dry?: boolean; transport?: MailTransport } = {}): Promise<SweepResult> {
  const seams = sweepSeams({ ...callSeams(admin, { origin: options.origin, transport: options.transport }), note: writeNoteAfterCall(admin, { codeOnly: true }) });
  const startedAt = options.startedAt ?? Date.now();
  return sweepAbandonedCalls({
    calls: mayaCalls(seams), source: sweepCallSource(admin), clock: () => Date.now(), dry: options.dry,
    deadline: startedAt + SWEEP_START_MS, timeLimitMs: Math.max(0, startedAt + SWEEP_TIME_LIMIT_MS - Date.now()),
  });
}
