import { SUPPORT_EMAIL } from "@/lib/contact";
import { checkContact, contactEmail, type ContactResult } from "@/lib/contact-form";
import { sendEmail } from "@/lib/email-delivery";

// Sends one contact form message to the support address (D-130). Nothing is stored; the email is the record.
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

  const result = await sendEmail({ sender: { to: "savar" }, ...contactEmail(check.message, SUPPORT_EMAIL) });
  if (result.status === "sent") return Response.json({ ok: true } satisfies ContactResult);
  console.error("[contact] email", result.status, result.error);
  return Response.json({ ok: false, error: result.status === "refused" ? "failed" : "unknown" } satisfies ContactResult, { status: 502 });
}
