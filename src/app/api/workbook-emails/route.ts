import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase-auth";
import { emailConfigProblem } from "@/lib/email-delivery";
import { runWorkbookWelcomes } from "@/lib/workbook-email-server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "not_configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  const db = adminClient();
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  if (!db || (!dry && emailConfigProblem())) return Response.json({ error: "not_configured" }, { status: 503 });
  try { return Response.json({ ok: true, dry, ...await runWorkbookWelcomes(db, { dry }) }); }
  catch { return Response.json({ error: "run_failed" }, { status: 502 }); }
}
