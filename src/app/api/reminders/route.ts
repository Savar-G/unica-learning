import { timingSafeEqual } from "node:crypto";
import { linkOrigin } from "@/lib/account-server";
import { pilotOn } from "@/lib/pilot";
import { reminderStore, sendReminder } from "@/lib/reminder-store";
import { REMINDER_KINDS, dueReminders, runReminders, type DueReminder } from "@/lib/reminders";
import { newToken } from "@/lib/sign-in-link";
import { adminClient } from "@/lib/supabase-auth";

// The reminder job (#73, D-085). Supabase pg_cron calls it every 15 minutes through pg_net, with
// "Authorization: Bearer <CRON_SECRET>" (the URL and the secret live in Supabase Vault; see
// supabase/migrations/20261011_add_reminder_cron.sql). Vercel cron here runs only once a day, so it cannot.
// Behind the pilot setting: off, it answers 404 and sends nothing. ?dry=1 counts what is due and sends nothing.
// The answer holds counts only, never a parent's details.

export const maxDuration = 60;

/** Resend's free plan takes 2 requests a second; one email every 600 ms stays under it. */
const SEND_GAP_MS = 600;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const byKind = (due: DueReminder[]) => Object.fromEntries(REMINDER_KINDS.map((kind) => [kind, due.filter((r) => r.kind === kind).length]));

export async function POST(request: Request) {
  if (!pilotOn()) return new Response("Not found", { status: 404 });
  // Never open: without a secret the job does not run at all.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[reminders] CRON_SECRET is not set");
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  const admin = adminClient();
  if (!admin || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("[reminders] SUPABASE_SECRET_KEY, RESEND_API_KEY or EMAIL_FROM is not set");
    return Response.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const now = Date.now();
  const store = reminderStore(admin);
  const origin = linkOrigin(request);
  try {
    if (new URL(request.url).searchParams.get("dry") === "1") {
      return Response.json({ ok: true, dry: true, due: byKind(dueReminders(await store.load(now), now)) });
    }
    let first = true;
    const result = await runReminders(store, now, {
      newToken,
      async send(reminder, token, state) {
        if (!first) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
        first = false;
        return sendReminder(reminder, token, state, origin);
      },
    });
    if (result.due > 0) console.info("[reminders] run", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("[reminders] run failed", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: "run_failed" }, { status: 500 });
  }
}
