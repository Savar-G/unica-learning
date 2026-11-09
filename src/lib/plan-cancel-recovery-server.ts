import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { sendEmailOnceInTime, type MailTransport, type ReleasableLedger } from "@/lib/email-delivery";
import { adminClient } from "@/lib/supabase-auth";

/** Cancel's route has a 60-second limit. Ten minutes leaves nine minutes after that limit. Age never closes a Cancel. */
export const CANCEL_CHECK_AGE_MS = 10 * 60_000;
const START_MS = 25_000;
const SEND_MS = 30_000;
const END_MS = 45_000;

function alertLedger(db: SupabaseClient<Database>): ReleasableLedger<string, string> {
  const note = async (id: string, state: string) => {
    const { error } = await db.rpc("note_plan_cancel_alert", { p_id: id, p_state: state });
    if (error) throw new Error("Cancel alert result could not be saved");
  };
  return {
    async claim(id) {
      const { data, error } = await db.rpc("claim_plan_cancel_alert", { p_id: id });
      if (error) throw new Error("Cancel alert could not be claimed");
      return data === true ? id : null;
    },
    sent: id => note(id, "sent"),
    refused: id => note(id, "released"),
    unknown: id => note(id, "unknown"),
    async release(id) { await note(id, "released"); return true; },
  };
}

/** The same durable claim serves the request's immediate alert and the reminder sweep. No parent text enters this message. */
export async function alertOpenCancel(db: SupabaseClient<Database>, operation: string, parent: string, options: {
  origin: string; to: string | null; transport?: MailTransport; inTime?: () => boolean;
}) {
  if (!options.to) { console.error("[plan] cancel alert has no team address", operation); return { status: "not_configured" as const }; }
  return sendEmailOnceInTime(alertLedger(db), operation, {
    sender: { to: "savar" }, to: options.to, subject: "A plan cancellation needs a check",
    text: ["A Cancel is still open. The family cannot change its plan or complete deletion until it is checked.",
      `Operation: ${operation}`, `Open the family: ${options.origin}/admin/parents/${parent}`,
      'Use "Check Stripe and close this cancel" on that page.'].join("\n"),
  }, { transport: options.transport, inTime: options.inTime ?? (() => true) });
}

export async function sweepOpenCancels(db: SupabaseClient<Database>, options: {
  origin: string; to: string | null; transport: MailTransport; startedAt: number; now?: () => number; signal?: AbortSignal;
}) {
  const now = options.now ?? Date.now;
  const inTime = () => !options.signal?.aborted && now() < options.startedAt + SEND_MS;
  const result = { checked: 0, sent: 0, failed: 0, outOfTime: false };
  if (now() >= options.startedAt + START_MS || options.signal?.aborted) return { ...result, outOfTime: true };
  const { data, error } = await db.rpc("due_plan_cancel_alerts", { p_before: new Date(now() - CANCEL_CHECK_AGE_MS).toISOString(), p_limit: 50 });
  if (error) throw new Error("Open cancellations could not be read");
  const transport: MailTransport = { send: (message, sendOptions) => options.transport.send(message, { ...sendOptions, signal: options.signal }) };
  for (const row of data ?? []) {
    if (now() >= options.startedAt + START_MS || !inTime()) { result.outOfTime = true; break; }
    result.checked++;
    try {
      const outcome = await alertOpenCancel(db, row.id, row.parent_id, { ...options, transport, inTime });
      if (outcome.status === "sent") result.sent++;
      else if (outcome.status !== "busy") result.failed++;
    } catch { result.failed++; }
  }
  return result;
}

/** All database calls and sends stop at 45 seconds from the reminder run's start. */
export async function sweepOpenCancelsNow(options: { origin: string; transport: MailTransport; startedAt: number }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, options.startedAt + END_MS - Date.now()));
  try {
    const db = adminClient(controller.signal, { retry: false });
    if (!db) return { error: "not_configured" };
    return await sweepOpenCancels(db, { ...options, to: process.env.SIGNUP_NOTIFY_EMAIL || null, signal: controller.signal });
  } catch {
    console.error("[plan] open cancellation sweep failed");
    return { error: "run_failed" };
  } finally { clearTimeout(timer); }
}
