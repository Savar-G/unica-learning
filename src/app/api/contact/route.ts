import { SUPPORT_EMAIL } from "@/lib/contact";
import { checkContact, contactEmail, type ContactResult } from "@/lib/contact-form";
import { contactLimit } from "@/lib/contact-limit";
import { sendEmail } from "@/lib/email-delivery";
import { adminClient } from "@/lib/supabase-auth";

// Sends one contact form message to the support address (D-130). Nothing of the message is stored; the email is the record.
// A site-wide limit (src/lib/contact-limit.ts, a count of times only) is checked first: at the limit, or when it cannot be
// counted, nothing is sent and the form shows its "could not send, email us" text.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" } satisfies ContactResult, { status: 400 });
  }

  const check = checkContact(body);
  // Bots fill the hidden field or send at once; pretend it worked so they move on.
  if (check.kind === "bot") return Response.json({ ok: true } satisfies ContactResult);
  if (check.kind === "invalid") return Response.json({ ok: false, error: "invalid", fields: check.fields } satisfies ContactResult, { status: 400 });

  try {
    if (!(await contactLimit(adminClient()).claim())) {
      console.error("[contact] site limit reached");
      return Response.json({ ok: false, error: "failed" } satisfies ContactResult, { status: 429 });
    }
  } catch (e) {
    console.error("[contact] limit", e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "failed" } satisfies ContactResult, { status: 503 });
  }

  const result = await sendEmail({ sender: { to: "savar" }, ...contactEmail(check.message, SUPPORT_EMAIL) });
  if (result.status === "sent") return Response.json({ ok: true } satisfies ContactResult);
  console.error("[contact] email", result.status, result.error);
  return Response.json({ ok: false, error: result.status === "refused" ? "failed" : "unknown" } satisfies ContactResult, { status: 502 });
}
