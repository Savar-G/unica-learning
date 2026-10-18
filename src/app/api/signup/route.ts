import { after } from "next/server";
import { PLANS, priceWithOffer } from "@/lib/site";
import { CURRICULA, EMAIL, POSTAL, clip, cleanSource, statusFor, type CurriculumId, type SignupPayload, type SignupResult } from "@/lib/signup";
import { cardSetupUrl, stripe } from "@/lib/stripe";
import { adminClient } from "@/lib/supabase-auth";

// One plan for now: math (Savar, 2026-10-11).
const SUBJECTS = new Set(["Math"]);

export async function POST(request: Request) {
  let body: Partial<SignupPayload>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" } satisfies SignupResult, { status: 400 });
  }

  // Bots fill every field; pretend it worked so they move on.
  if (body.website) return Response.json({ ok: true } satisfies SignupResult);

  const plan = body.plan === "one" ? "one" : null;
  const curriculum = typeof body.curriculum === "string" && Object.hasOwn(CURRICULA, body.curriculum) ? (body.curriculum as CurriculumId) : null;
  // The curriculum decides the path: open curricula add a card on Stripe, the rest join the waitlist.
  const status = curriculum ? statusFor(curriculum) : "waitlist";
  // Matches this row to its Stripe card (customer metadata, client_reference_id) and to the "how did you hear" answer.
  const ref = crypto.randomUUID();
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
    source: cleanSource(body.source),
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

  const db = adminClient();
  let admitted = false;
  try {
    if (db) {
      const { data, error } = await db.rpc("begin_booking_signup", { payload: row });
      admitted = !error && data === true;
    }
  } catch { /* A lost admission reply never permits a Stripe call. */ }
  if (!admitted) {
    console.error("[signup] admission unavailable");
    return Response.json({ ok: false, error: "store_failed" } satisfies SignupResult, { status: 502 });
  }

  // The row is saved first, so a Stripe failure never loses the signup: the parent is told we will email a link.
  let cardUrl: string | null = null;
  let stripeState: "sent" | "off" | "failed" = "off";
  const s = stripe();
  if (status === "reserved") {
    let invoked = false;
    try {
      if (s && !request.signal.aborted) {
        invoked = true;
        const setup = await cardSetupUrl(s, { ...row, ref, plan, curriculum: row.curriculum, origin: new URL(request.url).origin });
        const { data, error } = await db!.rpc("finish_booking_signup", { booking_ref: ref, customer: setup.customer });
        if (error || data !== true) throw Error("Booking completion unavailable");
        cardUrl = setup.url;
        stripeState = cardUrl ? "sent" : "failed";
      } else {
        // No remote request started. This is the only path that can release a hold without a customer.
        const { data, error } = await db!.rpc("finish_booking_signup", { booking_ref: ref, customer: null });
        if (error || data !== true) throw Error("Booking completion unavailable");
      }
    } catch {
      // Timeout, abort and lost responses can still complete remotely. Keep the durable pending hold.
      console.error("[signup] booking result unavailable", invoked ? "remote-started" : "not-started");
      stripeState = "failed";
    }
  }
  after(() => notify(row, stripeState));
  return Response.json({ ok: true, status, ref, ...(cardUrl && { cardUrl }) } satisfies SignupResult);
}

// Email Savar about each new signup, from EMAIL_FROM.
async function notify(
  row: { status: string; ref: string; name: string; email: string; postal: string; subject: string; grade: number; curriculum: CurriculumId | null; price: number; source: Record<string, string> },
  stripeState: "sent" | "off" | "failed",
) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!key || !to) return;
  // Every email goes from EMAIL_FROM (contact@unicalearning.com, D-132).
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error("[signup] notify skipped: EMAIL_FROM is not set");
    return;
  }
  const curriculum = row.curriculum ? CURRICULA[row.curriculum] : "unknown";
  const label =
    row.status === "waitlist"
      ? `Waitlist (${curriculum} curriculum)`
      : stripeState === "sent"
        ? "Sent to Stripe to add a card (nothing charged)"
        : `Reserved, but ${stripeState === "off" ? "STRIPE_SECRET_KEY is not set" : "Stripe failed"}: email them a link to add a card`;
  const lines = [
    `${label}: ${row.name} <${row.email}>`,
    `Plan: ${row.subject}, ${priceWithOffer(row.price)}`,
    `Child grade: ${row.grade}`,
    `Postal code: ${row.postal}`,
    `Curriculum: ${curriculum}`,
    `Ref (Stripe client_reference_id; signup_heard.ref): ${row.ref}`,
    `Source: ${Object.entries(row.source).map(([k, v]) => `${k}=${v}`).join(", ") || "direct"}`,
  ];
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
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
