import { timingSafeEqual } from "node:crypto";
import { monitored } from "@/lib/sentry-cron";
import { runSocialRefresh } from "@/lib/social-store";

export const maxDuration = 240;

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Unavailable", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  // Sentry uses the same dry-run convention as the other scheduled routes.
  if (new URL(request.url).searchParams.get("dry") === "1") return Response.json({ ok: true });
  const result = await runSocialRefresh(new Date());
  if (result.kind === "cooldown") return Response.json({ ok: true, skipped: "cooldown" });
  const failed = result.results.some((row) => row.status === "failed" || row.status === "partial");
  return Response.json({ ok: !failed, channels: result.results }, { status: failed ? 502 : 200 });
}

export const GET = monitored("social-metrics", run);
