import "server-only";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withFamilyCardOperation, type Province } from "@/lib/assessment";
import { sendEmail } from "@/lib/email-delivery";
import type { CardResult, NextStepError, ReportSrc, WaitlistResult } from "@/lib/next-step";
import { REPORT_PLANS, reportPath, type PlanOption } from "@/lib/report-view";
import { CURRICULA } from "@/lib/signup";
import { priceWithOffer, type PlanId } from "@/lib/site";
import { keepSavedPlan, reportCardCustomer, reportCardSetupUrl, savedCardPlan, stripe, type ReportCardSetup } from "@/lib/stripe";
import { adminClient } from "@/lib/supabase-auth";
import { beginCardOperation, endCardOperation } from "@/lib/family-deletion-store";

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
  const db = adminClient();
  if (!db) return fail("store_failed", 503);
  const token = randomUUID();
  let started = false;
  try {
    return await withFamilyCardOperation({
      async begin() {
        const held = await beginCardOperation(db, parentId, token);
        started = true;
        return held;
      },
      async end() { await endCardOperation(db, token); },
    }, () => startCardHeld(parentId, reportId, plan, src, origin));
  } catch {
    // Keep an uncertain external result fenced until an operator reconciles it. Do not retry it here.
    return started ? { ok: true, state: "later" } : fail("store_failed", 503);
  }
}

async function startCardHeld(parentId: string, reportId: string, plan: PlanId, src: ReportSrc, origin: string): Promise<CardResult | Fail> {
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
  const saved = s && existing.data?.stripe_customer_id ? await savedBefore(s, existing.data.stripe_customer_id) : null;
  if (s && existing.data?.stripe_customer_id && saved) {
    // The plan of the setup that succeeded, not the plan of the last click.
    const savedPlan = await markSaved(admin, existing.data.id, saved.metadata, existing.data.plan);
    await keepSavedPlan(s, existing.data.stripe_customer_id, saved.metadata).catch((e) => console.error("[next-step] customer plan update failed", e instanceof Error ? e.message : e));
    return { ok: true, state: "saved", plan: savedPlan };
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
      // Never return an untracked Checkout. Retention must be able to find and close every open session.
      if (setError) throw new Error("Customer id save failed");
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
    throw e;
  }
}

/** Asks Stripe whether this customer saved a card before. If Stripe cannot say, the parent goes to Checkout. */
async function savedBefore(s: NonNullable<ReturnType<typeof stripe>>, customer: string) {
  try {
    return await savedCardPlan(s, customer);
  } catch (e) {
    console.error("[next-step] saved card check failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** The plan and price in the metadata of a saved setup, or null when the metadata has no plan from the site. */
function planOf(metadata: Record<string, string>): { plan: PlanId; price: number } | null {
  const option = REPORT_PLANS.find((p) => p.plan === metadata.plan);
  return option ? { plan: option.plan, price: Number(metadata.price) || option.price } : null;
}

/** Marks the row saved, on the plan the card was saved for. Returns that plan. */
async function markSaved(admin: SupabaseClient, id: string, metadata: Record<string, string>, fallback: PlanId): Promise<PlanId> {
  const saved = planOf(metadata);
  const { error } = await admin.from("card_setups")
    .update({ card_saved_at: new Date().toISOString(), ...(saved && { plan: saved.plan, price: saved.price }), updated_at: new Date().toISOString() })
    .eq("id", id).is("card_saved_at", null);
  if (error) console.error("[next-step] card saved mark failed", id, error.message);
  return saved?.plan ?? fallback;
}

/**
 * /thank-you confirmed a saved card with Stripe for a Checkout session from the report: marks the child's row on the
 * plan of that session, so the report shows the saved card. The ref and the customer must both match the row. A click
 * on another plan in a second tab cannot leave the row or the customer on a plan the card was not saved for.
 */
export async function recordCardSaved(metadata: Record<string, string>, customer: string | null) {
  const admin = adminClient();
  const ref = metadata.ref ?? "";
  if (!admin || !customer || !/^[0-9a-f-]{36}$/i.test(ref)) return;
  const saved = planOf(metadata);
  const { error } = await admin.from("card_setups")
    .update({ card_saved_at: new Date().toISOString(), ...(saved && { plan: saved.plan, price: saved.price }), updated_at: new Date().toISOString() })
    .eq("id", ref).eq("stripe_customer_id", customer);
  if (error) console.error("[next-step] card saved record failed", ref, error.message);
  const s = stripe();
  if (s) await keepSavedPlan(s, customer, metadata).catch((e) => console.error("[next-step] customer plan update failed", e instanceof Error ? e.message : e));
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
      `Plan: ${option.subject}, ${priceWithOffer(option.price)}`,
      `Child: ${report.child!.first_name}, school grade ${setup.grade}`,
      `Postal code: ${setup.postal}`,
      `Opened from: ${src === "email" ? "the report email" : "the account"}`,
      `Ref (card_setups.id; Stripe metadata ref): ${setup.ref}`,
      `Report: ${origin}${reportPath(report.id)}`,
    ].join("\n"),
  };
}

/**
 * Emails Savar. Uses EMAIL_FROM when it is set, else Resend's test sender (delivered only to the account owner). Sent
 * without a send key (spec #143): a second click on a plan can alert again, as before.
 */
async function alertSavar(email: { subject: string; text: string; replyTo: string }) {
  const to = process.env.SIGNUP_NOTIFY_EMAIL;
  if (!to) return;
  const outcome = await sendEmail({ sender: { to: "savar", testSenderName: "Unica Learning signups" }, to, replyTo: email.replyTo, subject: email.subject, text: email.text });
  if (outcome.status === "sent") console.info("[next-step] alert sent:", email.subject.split(":")[0]);
  else console.error("[next-step] alert failed", outcome.status, outcome.error);
}
