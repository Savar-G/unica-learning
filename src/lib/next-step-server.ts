import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Province } from "@/lib/assessment";
import type { CardResult, NextStepError, ReportSrc, WaitlistResult } from "@/lib/next-step";
import { REPORT_PLANS, reportPath, type PlanOption } from "@/lib/report-view";
import { CURRICULA } from "@/lib/signup";
import type { PlanId } from "@/lib/site";
import { hasSavedCard, reportCardCustomer, reportCardSetupUrl, stripe, type ReportCardSetup } from "@/lib/stripe";
import { adminClient } from "@/lib/supabase-auth";

// The report's next step (#66), on the server. The routes pass the signed-in parent from the session cookie, never
// from the request body, and every read here is filtered by that parent, so a parent can act only on their own report.
// One row per child in card_setups and in waitlist_joins: a second click updates or finds that row, never a new one.

type Fail = { ok: false; error: NextStepError; status: number };
const fail = (error: NextStepError, status: number): Fail => ({ ok: false, error, status });

/** The report with what the next step needs, read with the secret key for this parent only. */
interface ReportRow {
  id: string;
  child_id: string;
  assessment_id: string;
  cta: string | null;
  assessment: { province: Province; grade: number } | null;
  child: { first_name: string } | null;
}

interface ParentRow {
  name: string;
  email: string;
  postal: string;
}

async function load(admin: SupabaseClient, parentId: string, reportId: string, cta: "card" | "waitlist"): Promise<{ report: ReportRow; parent: ParentRow } | Fail> {
  const [{ data: report, error }, { data: parent, error: parentError }] = await Promise.all([
    admin.from("reports")
      .select("id, child_id, assessment_id, cta:model->>callToAction, assessment:assessments(province, grade), child:children(first_name)")
      .eq("id", reportId).eq("parent_id", parentId).maybeSingle<ReportRow>(),
    admin.from("parents").select("name, email, postal").eq("id", parentId).maybeSingle<ParentRow>(),
  ]);
  if (error || parentError) {
    console.error("[next-step] load failed", error?.message ?? parentError?.message);
    return fail("store_failed", 502);
  }
  if (!report?.assessment || !report.child || !parent) return fail("not_found", 404);
  // The report model decides the path: card for BC, the waitlist for every other province.
  if (report.cta !== cta) return fail("invalid", 409);
  return { report, parent };
}

interface CardRow {
  id: string;
  plan: PlanId;
  stripe_customer_id: string | null;
  card_saved_at: string | null;
}

/**
 * A BC parent chose a plan on the report. Records the choice, then returns Stripe's page to save the card. Without
 * a Stripe key, or when Stripe fails, the choice stays recorded and Savar gets an alert to email a link by hand.
 */
export async function startCard(parentId: string, reportId: string, plan: PlanId, src: ReportSrc, origin: string): Promise<CardResult | Fail> {
  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  const loaded = await load(admin, parentId, reportId, "card");
  if ("ok" in loaded) return loaded;
  const { report, parent } = loaded;
  const option = REPORT_PLANS.find((p) => p.plan === plan);
  if (!option) return fail("invalid", 400);

  const existing = await admin.from("card_setups").select("id, plan, stripe_customer_id, card_saved_at").eq("child_id", report.child_id).maybeSingle<CardRow>();
  if (existing.error) {
    console.error("[next-step] card row load failed", existing.error.message);
    return fail("store_failed", 502);
  }
  // A saved card stays on the plan it was saved for; a second card is never asked for. Stripe is the record: a card
  // saved without a visit to /thank-you is found there, before this click changes the plan.
  if (existing.data?.card_saved_at) return { ok: true, state: "saved", plan: existing.data.plan };
  const s = stripe();
  if (s && existing.data?.stripe_customer_id && (await savedBefore(s, existing.data.stripe_customer_id))) {
    await markSaved(admin, existing.data.id);
    return { ok: true, state: "saved", plan: existing.data.plan };
  }

  const { data: row, error }= await admin.from("card_setups")
    .upsert({ parent_id: parentId, child_id: report.child_id, report_id: report.id, plan, price: option.price, updated_at: new Date().toISOString() }, { onConflict: "child_id" })
    .select("id, plan, stripe_customer_id, card_saved_at").single<CardRow>();
  if (error || !row) {
    console.error("[next-step] card row save failed", error?.message);
    return fail("store_failed", 502);
  }

  const setup: ReportCardSetup = {
    ref: row.id,
    name: parent.name,
    email: parent.email,
    postal: parent.postal,
    plan,
    subject: option.subject,
    price: option.price,
    grade: report.assessment!.grade,
    curriculum: report.assessment!.province,
    parentId,
    childId: report.child_id,
    assessmentId: report.assessment_id,
    reportId: report.id,
    customerId: row.stripe_customer_id,
    origin,
    cancelPath: `${reportPath(report.id)}?card=cancelled#rpt-next`,
  };
  const alert = (reason: string) => after(() => alertSavar(cardAlert(setup, report, option, src, reason, origin)));

  if (!s) {
    alert("STRIPE_SECRET_KEY is not set");
    return { ok: true, state: "later" };
  }
  try {
    const customer = await reportCardCustomer(s, setup);
    if (!row.stripe_customer_id) {
      const { error: setError } = await admin.from("card_setups").update({ stripe_customer_id: customer }).eq("id", row.id).is("stripe_customer_id", null);
      if (setError) console.error("[next-step] customer id save failed", row.id, setError.message);
    }
    const cardUrl = await reportCardSetupUrl(s, customer, setup);
    if (!cardUrl) {
      alert("Stripe returned no Checkout page");
      return { ok: true, state: "later" };
    }
    return { ok: true, state: "stripe", cardUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[next-step] stripe failed", row.id, message);
    alert(`Stripe failed: ${message.slice(0, 200)}`);
    return { ok: true, state: "later" };
  }
}

/** Asks Stripe whether this customer saved a card before. If Stripe cannot say, the parent goes to Checkout. */
async function savedBefore(s: NonNullable<ReturnType<typeof stripe>>, customer: string): Promise<boolean> {
  try {
    return await hasSavedCard(s, customer);
  } catch (e) {
    console.error("[next-step] saved card check failed", e instanceof Error ? e.message : e);
    return false;
  }
}

async function markSaved(admin: SupabaseClient, id: string) {
  const { error } = await admin.from("card_setups").update({ card_saved_at: new Date().toISOString() }).eq("id", id).is("card_saved_at", null);
  if (error) console.error("[next-step] card saved mark failed", id, error.message);
}

/**
 * /thank-you confirmed a saved card with Stripe for a Checkout session from the report: marks the child's row, so the
 * report shows the saved card. The ref and the customer must both match the row.
 */
export async function recordCardSaved(ref: string, customer: string | null) {
  const admin = adminClient();
  if (!admin || !customer || !/^[0-9a-f-]{36}$/i.test(ref)) return;
  const { error } = await admin.from("card_setups").update({ card_saved_at: new Date().toISOString() }).eq("id", ref).eq("stripe_customer_id", customer).is("card_saved_at", null);
  if (error) console.error("[next-step] card saved record failed", ref, error.message);
}

/** A parent outside BC joined the waitlist from the report. One row per child: a second click finds the first. */
export async function joinWaitlist(parentId: string, reportId: string, origin: string): Promise<WaitlistResult | Fail> {
  const admin = adminClient();
  if (!admin) return fail("store_failed", 503);
  const loaded = await load(admin, parentId, reportId, "waitlist");
  if ("ok" in loaded) return loaded;
  const { report, parent } = loaded;
  const province = report.assessment!.province;
  const { data, error } = await admin.from("waitlist_joins")
    .upsert({ parent_id: parentId, child_id: report.child_id, report_id: report.id, province }, { onConflict: "child_id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[next-step] waitlist save failed", error.message);
    return fail("store_failed", 502);
  }
  if (!data?.length) return { ok: true, state: "already" };
  after(() => alertSavar({
    subject: `Waitlist from a report: ${parent.name} (${CURRICULA[province]})`,
    replyTo: parent.email,
    text: [
      `Waitlist (${CURRICULA[province]} curriculum), joined from the report: ${parent.name} <${parent.email}>`,
      `Child: ${report.child!.first_name}, school grade ${report.assessment!.grade}`,
      `Postal code: ${parent.postal}`,
      `Report: ${origin}${reportPath(report.id)}`,
    ].join("\n"),
  }));
  return { ok: true, state: "joined" };
}

function cardAlert(setup: ReportCardSetup, report: ReportRow, option: PlanOption, src: ReportSrc, reason: string, origin: string) {
  return {
    subject: `Card link needed: ${setup.name} (${option.subject}, grade ${setup.grade})`,
    replyTo: setup.email,
    text: [
      `Plan chosen from the report, but ${reason}: email them a link to add a card.`,
      `Parent: ${setup.name} <${setup.email}>`,
      `Plan: ${option.subject}, CAD ${option.price}/month`,
      `Child: ${report.child!.first_name}, school grade ${setup.grade}`,
      `Postal code: ${setup.postal}`,
      `Opened from: ${src === "email" ? "the report email" : "the account"}`,
      `Ref (card_setups.id; Stripe metadata ref): ${setup.ref}`,
      `Report: ${origin}${reportPath(report.id)}`,
    ].join("\n"),
  };
}

/** Emails Savar. Uses EMAIL_FROM when it is set, else Resend's test sender (delivered only to the account owner). */
async function alertSavar(email: { subject: string; text: string; replyTo: string }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!key || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Unica Learning signups <onboarding@resend.dev>", to: [to], reply_to: email.replyTo, subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error("[next-step] alert failed", res.status, (await res.text()).slice(0, 300));
    else console.info("[next-step] alert sent:", email.subject.split(":")[0]);
  } catch (e) {
    console.error("[next-step] alert error", e instanceof Error ? e.message : e);
  }
}
