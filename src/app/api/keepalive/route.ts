import { timingSafeEqual } from "node:crypto";
import { supabase } from "@/lib/supabase";

// Daily Vercel cron (vercel.json). Supabase pauses free projects after 7 days with no
// database activity; one cheap query a day keeps the signup table reachable.
// Like every cron route: no CRON_SECRET answers 503 (never open), a wrong header 401, compared in constant time.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  const { error } = await supabase().rpc("ping");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 502 });
  return Response.json({ ok: true });
}
