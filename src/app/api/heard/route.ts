import { CHANNELS, UUID, type ChannelId, type HeardPayload } from "@/lib/heard";
import { supabase } from "@/lib/supabase";

// Saves one "how did you hear about us?" answer. The foreign key on ref rejects refs that match no signup.
export async function POST(request: Request) {
  let body: Partial<HeardPayload>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const ref = typeof body.ref === "string" && UUID.test(body.ref) ? body.ref.toLowerCase() : null;
  const channel = typeof body.channel === "string" && Object.hasOwn(CHANNELS, body.channel) ? (body.channel as ChannelId) : null;
  if (!ref || !channel) return Response.json({ ok: false }, { status: 400 });

  const { picks, ask } = CHANNELS[channel];
  const raw = typeof body.detail === "string" ? body.detail.trim().slice(0, 80) : "";
  // A pick must be one we offer; a follow-up without picks takes free text.
  const detail = picks ? (picks.includes(raw) ? raw : null) : ask ? raw || null : null;

  const { error } = await supabase().from("signup_heard").insert({ ref, channel, detail });
  if (error) {
    console.error("[heard] insert failed", error.message);
    return Response.json({ ok: false }, { status: 502 });
  }
  return Response.json({ ok: true });
}
