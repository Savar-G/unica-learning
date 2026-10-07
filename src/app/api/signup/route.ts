import { after } from "next/server";
import { PLANS } from "@/lib/site";
import { EMAIL, POSTAL, type SignupPayload } from "@/lib/signup";
import { supabase } from "@/lib/supabase";

const SUBJECTS = new Set(["Math", "Reading", "Math + Reading"]);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(request: Request) {
  let body: Partial<SignupPayload>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  // Bots fill every field; pretend it worked so they move on.
  if (body.website) return Response.json({ ok: true });

  const plan = body.plan === "both" ? "both" : body.plan === "one" ? "one" : null;
  const row = {
    status: body.status === "waitlist" ? "waitlist" : "reserved",
    name: clip(body.name, 120),
    email: clip(body.email, 200).toLowerCase(),
    postal: clip(body.postal, 7).toUpperCase(),
    plan,
    subject: clip(body.subject, 20),
    grade: Number(body.grade),
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
    !Number.isInteger(row.grade) || row.grade < 1 || row.grade > 7
  ) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const { error } = await supabase().from("signups").insert(row);
  if (error) {
    console.error("[signup] insert failed", error.message);
    return Response.json({ ok: false, error: "store_failed" }, { status: 502 });
  }

  after(() => notify(row));
  return Response.json({ ok: true });
}

// Email Savar about each new signup. Resend's free plan only delivers to the account's own address,
// which is all an alert needs.
async function notify(row: { status: string; name: string; email: string; postal: string; subject: string; grade: number; price: number; source: Record<string, string> }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!key || !to) return;
  const label = row.status === "waitlist" ? "Waitlist (outside area)" : "Reserved";
  const lines = [
    `${label}: ${row.name} <${row.email}>`,
    `Plan: ${row.subject}, CAD ${row.price}/month`,
    `Child grade: ${row.grade}`,
    `Postal code: ${row.postal}`,
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
        subject: `New signup: ${row.name} (${row.subject}, grade ${row.grade})`,
        text: lines.join("\n"),
      }),
    });
    if (!res.ok) console.error("[signup] notify failed", res.status, await res.text());
  } catch (e) {
    console.error("[signup] notify error", e);
  }
}
