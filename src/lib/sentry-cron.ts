// Sentry Cron Monitors (docs/sentry.md): each scheduled job checks in when it starts and when it ends, so Sentry opens
// an issue when a run is missed, fails or runs too long. Only a call with the right CRON_SECRET checks in: a stray or
// refused request never marks a run as done. The monitor's schedule is sent with each check-in, so Sentry creates and
// updates the monitor from this file. The jobs that are not routes (the retention workflow, the Mac workbook worker)
// check in over HTTP (sentryCheckInUrl in src/lib/sentry-options.ts).
import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";

interface Monitor { schedule: string; maxRuntime: number }

/**
 * Every scheduled route, by its monitor slug: its crontab (UTC) and its longest run in minutes. pg_cron (Supabase) and
 * Vercel cron (vercel.json) call these routes; /api/scan-marking has both, so its monitor uses the 15-minute schedule.
 */
export const CRON_MONITORS = {
  reminders: { schedule: "*/15 * * * *", maxRuntime: 2 },
  "next-book-prepare": { schedule: "*/15 * * * *", maxRuntime: 2 },
  "scan-marking": { schedule: "*/15 * * * *", maxRuntime: 4 },
  "scan-cleanup": { schedule: "*/15 * * * *", maxRuntime: 2 },
  "scan-progress": { schedule: "*/15 * * * *", maxRuntime: 2 },
  "workbook-emails": { schedule: "7,22,37,52 * * * *", maxRuntime: 2 },
  keepalive: { schedule: "0 15 * * *", maxRuntime: 2 },
  "social-metrics": { schedule: "0 16 * * *", maxRuntime: 4 },
  "child-deletions": { schedule: "15 15 * * *", maxRuntime: 2 },
} as const satisfies Record<string, Monitor>;
export type CronSlug = keyof typeof CRON_MONITORS;

function cronCall(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The route handler with check-ins around each scheduled call. An answer of 500 or more, or a throw, is a failed run.
 * `?dry=1` calls are not runs and do not check in.
 */
export function monitored(slug: CronSlug, handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response> {
  const monitor = CRON_MONITORS[slug];
  return async (request) => {
    if (!cronCall(request) || new URL(request.url).searchParams.get("dry") === "1") return handler(request);
    const started = Date.now();
    const checkInId = Sentry.captureCheckIn({ monitorSlug: slug, status: "in_progress" }, {
      schedule: { type: "crontab", value: monitor.schedule },
      timezone: "Etc/UTC",
      checkinMargin: 5,
      maxRuntime: monitor.maxRuntime,
      failureIssueThreshold: 2,
      recoveryThreshold: 1,
    });
    const end = (status: "ok" | "error") => {
      Sentry.captureCheckIn({ checkInId, monitorSlug: slug, status, duration: (Date.now() - started) / 1000 });
      // The check-in must leave before the function stops. Outside a request (a test), flush now.
      try { after(() => Sentry.flush(2000)); } catch { void Sentry.flush(2000); }
    };
    try {
      const response = await handler(request);
      end(response.status >= 500 ? "error" : "ok");
      return response;
    } catch (e) {
      end("error");
      throw e;
    }
  };
}
