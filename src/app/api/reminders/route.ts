import { timingSafeEqual } from "node:crypto";
import { linkOrigin } from "@/lib/account-server";
import { emailConfigProblem, type MailTransport } from "@/lib/email-delivery";
import { resendTransport } from "@/lib/email-resend";
import { sweepAbandonedCallsNow } from "@/lib/maya-call-sweep-server";
import { dueWeeklyEmails, runWeeklyEmails } from "@/lib/maya-weekly-email";
import { mayaWeeklyStore } from "@/lib/maya-weekly-email-store";
import { reminderMessage, reminderStore } from "@/lib/reminder-store";
import { REMINDER_KINDS, dueReminders, runReminders, type DueReminder } from "@/lib/reminders";
import { newToken } from "@/lib/sign-in-link";
import { adminClient } from "@/lib/supabase-auth";

// The reminder job (#73, D-085). Supabase pg_cron calls it every 15 minutes through pg_net, with
// "Authorization: Bearer <CRON_SECRET>" (the URL and the secret live in Supabase Vault; see
// supabase/migrations/20261011_add_reminder_cron.sql). Vercel cron here runs only once a day, so it cannot.
// After the reminders, the same run sends the weekly Maya emails (#332, src/lib/maya-weekly-email.ts) through the same
// spaced transport. Beside the emails, the same run ends abandoned Maya chats and calls (#528,
// src/lib/maya-call-sweep.ts): it starts no new end after SWEEP_START_MS and stops waiting at SWEEP_TIME_LIMIT_MS, inside
// the cron's 60-second request limit (timeout_milliseconds in migration add_reminder_cron).
// ?dry=1 counts what is due and sends and ends nothing.
// The answer holds counts only, never a parent's details.

export const maxDuration = 60;

/** Resend's free plan takes 2 requests a second; one email every 600 ms stays under it. */
const SEND_GAP_MS = 600;

/** The transport, with a wait of `gapMs` before each send after the first. */
function spaced(transport: MailTransport, gapMs: number): MailTransport {
  let first = true;
  return {
    async send(message) {
      if (!first) await new Promise((r) => setTimeout(r, gapMs));
      first = false;
      return transport.send(message);
    },
  };
}

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const byKind = (due: DueReminder[]) => Object.fromEntries(REMINDER_KINDS.map((kind) => [kind, due.filter((r) => r.kind === kind).length]));

export async function POST(request: Request) {
  // Never open: without a secret the job does not run at all.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[reminders] CRON_SECRET is not set");
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  const admin = adminClient();
  // Stop before anything is claimed: without the email configuration, a run would use up each due reminder's tries.
  const problem = admin ? emailConfigProblem() : "SUPABASE_SECRET_KEY is not set";
  if (!admin || problem) {
    console.error("[reminders]", problem);
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const now = Date.now();
  const store = reminderStore(admin);
  const origin = linkOrigin(request);
  let sweep: Promise<unknown> | null = null;
  try {
    if (new URL(request.url).searchParams.get("dry") === "1") {
      const maya = dueWeeklyEmails(await mayaWeeklyStore(admin).load(now), now).length;
      const abandoned = (await sweepAbandonedCallsNow(admin, { dry: true })).due;
      return Response.json({ ok: true, dry: true, due: byKind(dueReminders(await store.load(now), now)), maya, sweep: abandoned });
    }
    // The sweep runs beside the emails and never fails the run.
    sweep = sweepAbandonedCallsNow(admin, { origin, startedAt: now }).then(
      (r) => {
        if (r.due > 0) console.info("[maya sweep] run", JSON.stringify(r));
        return r;
      },
      (e) => {
        console.error("[maya sweep] run failed", e instanceof Error ? e.message : e);
        return { error: "run_failed" as const };
      },
    );
    const transport = spaced(resendTransport(), SEND_GAP_MS);
    const result = await runReminders(store, now, {
      newToken,
      message: (reminder, token, state) => reminderMessage(reminder, token, state, origin),
      transport,
    });
    if (result.due > 0) console.info("[reminders] run", JSON.stringify(result));
    // A failed Maya run never hides the reminders' result.
    let maya: Awaited<ReturnType<typeof runWeeklyEmails>> | { error: "run_failed" };
    try {
      maya = await runWeeklyEmails(mayaWeeklyStore(admin), now, { origin, newToken, transport });
      if (maya.due > 0) console.info("[maya weekly] run", JSON.stringify(maya));
    } catch (e) {
      console.error("[maya weekly] run failed", e instanceof Error ? e.message : e);
      maya = { error: "run_failed" };
    }
    return Response.json({ ok: true, ...result, maya, sweep: await sweep });
  } catch (e) {
    console.error("[reminders] run failed", e instanceof Error ? e.message : e);
    // The sweep finishes before the answer, so the function is not stopped in the middle of a call's end.
    await sweep;
    return Response.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}
