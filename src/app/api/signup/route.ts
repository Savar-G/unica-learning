import { after } from "next/server";
import { DEPOSIT, PLANS } from "@/lib/site";
import { CURRICULA, EMAIL, POSTAL, statusFor, type CurriculumId, type SignupPayload, type SignupResult } from "@/lib/signup";
import { supabase } from "@/lib/supabase";

const SUBJECTS = new Set(["Math", "Reading", "Math + Reading"]);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(request: Request) {
  let body: Partial<SignupPayload>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" } satisfies SignupResult, { status: 400 });
  }

  // Bots fill every field; pretend it worked so they move on.
  if (body.website) return Response.json({ ok: true } satisfies SignupResult);

  const plan = body.plan === "both" ? "both" : body.plan === "one" ? "one" : null;
  const curriculum = typeof body.curriculum === "string" && Object.hasOwn(CURRICULA, body.curriculum) ? (body.curriculum as CurriculumId) : null;
  // The curriculum decides the path: open curricula pay the deposit, the rest join the waitlist.
  const status = curriculum ? statusFor(curriculum) : "waitlist";
  // Passed to Stripe as client_reference_id, so each deposit payment matches this row.
  const ref = status === "reserved" ? crypto.randomUUID() : null;
  const row = {
    status,
    ref,
    name: clip(body.name, 120),
    email: clip(body.email, 200).toLowerCase(),
    postal: clip(body.postal, 7).toUpperCase(),
    plan,
    subject: clip(body.subject, 20),
    grade: Number(body.grade),
    curriculum,
    price: plan ? PLANS[plan].price : 0,
    source: Object.fromEntries(
      Object.entries(body.source ?? {}).slice(0, 12).map(([k, v]) => [k.slice(0, 40), clip(v, 300)]),
    ),
  };

  if (
    row.name.length < 2 ||
    !EMAIL.test(row.email) ||
    !POSTAL.test(row.postal) ||
    !plan ||
    !SUBJECTS.has(row.subject) ||
    !Number.isInteger(row.grade) || row.grade < 1 || row.grade > 7 ||
    !row.curriculum
  ) {
    return Response.json({ ok: false, error: "invalid" } satisfies SignupResult, { status: 400 });
  }

  const { error } = await supabase().from("signups").insert(row);
  if (error) {
    console.error("[signup] insert failed", error.message);
    return Response.json({ ok: false, error: "store_failed" } satisfies SignupResult, { status: 502 });
  }

  const pay = ref ? depositLink(row.email, ref) : null;
  after(() => notify(row, !!pay));
  return Response.json({ ok: true, status, ...(pay && { pay }) } satisfies SignupResult);
}

// STRIPE_DEPOSIT_LINK is a Stripe Payment Link (https://buy.stripe.com/...) that charges DEPOSIT.
// Without it, reserved parents see "we'll email you a payment link" and Savar sends one by hand.
function depositLink(email: string, ref: string): string | null {
  const base = process.env.STRIPE_DEPOSIT_LINK;
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") throw new Error("not https");
    url.searchParams.set("prefilled_email", email);
    url.searchParams.set("client_reference_id", ref);
    return url.toString();
  } catch {
    console.error("[signup] STRIPE_DEPOSIT_LINK is not an https URL");
    return null;
  }
}

// Email Savar about each new signup. Resend's free plan only delivers to the account's own address,
// which is all an alert needs.
async function notify(
  row: { status: string; ref: string | null; name: string; email: string; postal: string; subject: string; grade: number; curriculum: CurriculumId | null; price: number; source: Record<string, string> },
  sentToPay: boolean,
) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!key || !to) return;
  const curriculum = row.curriculum ? CURRICULA[row.curriculum] : "unknown";
  const label =
    row.status === "waitlist"
      ? `Waitlist (${curriculum} curriculum)`
      : sentToPay
        ? `Sent to pay the CAD ${DEPOSIT} deposit`
        : `Reserved, no payment link set: email them one`;
  const lines = [
    `${label}: ${row.name} <${row.email}>`,
    `Plan: ${row.subject}, CAD ${row.price}/month`,
    `Child grade: ${row.grade}`,
    `Postal code: ${row.postal}`,
    `Curriculum: ${curriculum}`,
    ...(row.ref ? [`Stripe client_reference_id: ${row.ref}`] : []),
    `Source: ${Object.entries(row.source).map(([k, v]) => `${k}=${v}`).join(", ") || "direct"}`,
  ];
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Pagewise signups <onboarding@resend.dev>",
        to: [to],
        reply_to: row.email,
        subject: `${row.status === "waitlist" ? "Waitlist" : "New signup"}: ${row.name} (${row.subject}, grade ${row.grade})`,
        text: lines.join("\n"),
      }),
    });
    if (!res.ok) console.error("[signup] notify failed", res.status, await res.text());
  } catch (e) {
    console.error("[signup] notify error", e);
  }
}
