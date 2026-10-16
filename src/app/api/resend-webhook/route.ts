import { parseDeliveryEvent, verifySignature } from "@/lib/resend-webhook";
import { adminClient } from "@/lib/supabase-auth";

// Resend's delivery webhook (D-104): delivered, delayed, bounced, marked as spam, failed and suppressed events, for the
// admin email view. Set up in the Resend dashboard (Webhooks) with this URL; its signing secret is RESEND_WEBHOOK_SECRET.
// Resend (through Svix) sends each message again until it gets a 2xx, so a store error answers 500 and the message
// comes back; a message kept before (same svix-id) is kept once. The answer holds no data.

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set");
    return new Response(null, { status: 503 });
  }
  // The signature covers the exact bytes, so the body is read as text before anything parses it.
  const body = await request.text();
  const headers = { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") };
  if (!verifySignature(secret, headers, body, Date.now())) return new Response(null, { status: 401 });

  let event;
  try {
    event = parseDeliveryEvent(body, Date.now());
  } catch {
    return new Response(null, { status: 400 });
  }
  // A type the site does not keep (sent, opened, clicked): taken, so Resend does not send it again.
  if (!event) return new Response(null, { status: 204 });

  const admin = adminClient();
  if (!admin) return new Response(null, { status: 503 });
  const { error } = await admin.from("email_events").upsert(
    { webhook_id: headers.id!.slice(0, 100), email_id: event.emailId, type: event.type, occurred_at: event.occurredAt, detail: event.detail },
    { onConflict: "webhook_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("[resend-webhook] event not kept; Resend sends it again", event.type, error.message);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
