import { supabase } from "@/lib/supabase";

// Daily Vercel cron (vercel.json). Supabase pauses free projects after 7 days with no
// database activity; one cheap query a day keeps the signup table reachable.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { error } = await supabase().rpc("ping");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 502 });
  return Response.json({ ok: true });
}
