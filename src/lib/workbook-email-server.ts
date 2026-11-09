import "server-only";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { sendEmailOnce, sendEmailOnceInTime, type DeliveryOutcome, type EmailMessage, type MailTransport, type ReleasableLedger, type SendLedger, type TimedDeliveryOutcome } from "@/lib/email-delivery";
import { PLAN_REMINDER_DAYS } from "@/lib/plan-reminder";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { findSavedCard, recordSavedCard, type SavedCards, type StripeAnswer } from "@/lib/saved-card";
import { savedCards } from "@/lib/saved-card-server";
import { familyProvince, familyZone, formatInZone } from "@/lib/family-time";
import { markingAccess } from "@/lib/scan-marking-access";
import { explanationAvailable } from "@/lib/parent-problem-explanation-ai";
import { planStartEmail, workbookEmail, type WorkbookDelivery, type WorkbookEmailKind, type WorkbookNoticeKind } from "@/lib/workbook-email";

/** The send key of every email in the ledger. */
interface WorkbookEmailKey {
  cardId: string;
  kind: WorkbookEmailKind;
  workbookNumber: number;
  delivery: WorkbookDelivery | null;
}
export interface WorkbookNotice extends WorkbookEmailKey {
  kind: WorkbookNoticeKind;
}
type Claim = { id: string; token: string };

/** The database claims the exact message and dispatch details before any provider call. */
export function workbookEmailLedger(db: SupabaseClient<Database>, message: EmailMessage): SendLedger<WorkbookEmailKey, Claim> {
  async function outcome(c: Claim, fields: Database["public"]["Tables"]["workbook_emails"]["Update"]) {
    try {
      const { error } = await db.from("workbook_emails").update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", c.id).eq("claim_token", c.token).eq("status", "sending");
      if (error) console.error("[workbook email] outcome not recorded; claim remains held", c.id, error.message);
    } catch { console.error("[workbook email] outcome write failed; claim remains held", c.id); }
  }
  return {
    async claim(key) {
      const token = randomUUID();
      const { data, error } = await db.rpc("claim_workbook_email", {
        p_card_setup_id: key.cardId, p_kind: key.kind, p_workbook_number: key.workbookNumber,
        p_delivery: key.delivery ?? {}, p_token: token,
        p_message: { to: message.to, subject: message.subject, text: message.text, html: message.html ?? null },
      });
      if (error) throw Error(error.message);
      const row = data?.[0];
      return row ? { id: row.id, token: row.claim_token } : null;
    },
    sent: (c, emailId) => outcome(c, { status: "sent", sent_at: new Date().toISOString(), email_id: emailId.slice(0, 100), error: null }),
    refused: (c, error) => outcome(c, { status: "failed", error: error.slice(0, 500) }),
    unknown: (c, error) => outcome(c, { status: "unknown", error: error.slice(0, 500) }),
  };
}

/** Recipients come only from the saved card's family, never from an admin request body. */
export async function sendWorkbookNotice(db: SupabaseClient<Database>, key: WorkbookNotice, transport?: MailTransport): Promise<DeliveryOutcome> {
  const { data: card, error } = await db.from("card_setups").select("parent_id, child_id, card_saved_at").eq("id", key.cardId).maybeSingle();
  if (error) throw Error("store_failed");
  if (!card?.card_saved_at) throw Error("card_not_saved");
  const [parent, child] = await Promise.all([
    db.from("parents").select("name, email").eq("id", card.parent_id).maybeSingle(),
    db.from("children").select("first_name").eq("id", card.child_id).eq("parent_id", card.parent_id).maybeSingle(),
  ]);
  if (parent.error || child.error || !parent.data || !child.data) throw Error("store_failed");
  const message: EmailMessage = {
    // The founders sign the welcome after a saved card (D-225); the team signs the dispatch notices.
    sender: key.kind === "welcome" ? { to: "parent", from: "founders" } : { to: "parent" }, to: parent.data.email, replyTo: SUPPORT_EMAIL,
    ...workbookEmail({ parentName: parent.data.name, childName: child.data.first_name, kind: key.kind, workbookNumber: key.workbookNumber, delivery: key.delivery }),
  };
  return sendEmailOnce(workbookEmailLedger(db, message), key, message, { transport });
}

/** The plan start email's send key: the start's own record. */
interface PlanEmailKey { cardId: string; generation: number }

/** The record of one plan start as the send ledger of its email (migration plan_start_holds_deletion). Each generation has its own claim. */
function planStartEmailLedger(db: SupabaseClient<Database>, message: EmailMessage): ReleasableLedger<PlanEmailKey, PlanEmailKey & { token: string }> {
  async function outcome(c: PlanEmailKey & { token: string }, status: "sent" | "failed" | "unknown", emailId: string | null, error: string | null) {
    try {
      const { error: failed } = await db.rpc("note_plan_start_email_send", { p_card: c.cardId, p_generation: c.generation, p_token: c.token, p_status: status, p_email_id: emailId, p_error: error });
      if (failed) console.error("[plan start email] outcome not recorded; claim remains held", c.cardId, failed.message);
    } catch { console.error("[plan start email] outcome write failed; claim remains held", c.cardId); }
  }
  return {
    async claim(key) {
      const token = randomUUID();
      const { data, error } = await db.rpc("claim_plan_start_email", {
        p_card: key.cardId, p_generation: key.generation, p_token: token,
        p_message: { to: message.to, subject: message.subject, text: message.text, html: message.html ?? null },
      });
      if (error) throw Error(error.message);
      return data ? { ...key, token } : null;
    },
    sent: (c, emailId) => outcome(c, "sent", emailId, null),
    refused: (c, error) => outcome(c, "failed", null, error),
    unknown: (c, error) => outcome(c, "unknown", null, error),
    async release(c) {
      try {
        const { data, error } = await db.rpc("release_plan_start_email", { p_card: c.cardId, p_generation: c.generation, p_token: c.token });
        if (error) console.error("[plan start email] release failed; claim remains held", c.cardId, error.message);
        return !error && data === true;
      } catch {
        console.error("[plan start email] release failed; claim remains held", c.cardId);
        return false;
      }
    },
  };
}

/** Whether automatic marking is open for this child of this family now. */
export type MarkingRead = (db: SupabaseClient<Database>, parentId: string, childId: string) => Promise<boolean>;
/** The product's own rule (Send, marks and "Explain this problem" open on it), for the card's child. */
const productMarking: MarkingRead = (db, parentId, childId) => markingAccess(db, parentId, process.env, { child: childId });
/** A marking read gets this long. A late, failed or odd answer is closed: the email then promises no marks. */
const MARKING_READ_MS = 3000;

/** Fail closed: only an explicit true, in time, opens step 3's marks. It decides only the words; the email goes either way. */
async function markingOpen(read: MarkingRead, db: SupabaseClient<Database>, parentId: string, childId: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([read(db, parentId, childId), new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), MARKING_READ_MS); })]);
    return answer === true;
  } catch {
    return false;
  } finally { clearTimeout(timer); }
}

/**
 * The confirmation when a free month starts: one per plan start, so a retry cannot send a second copy, and a later start of the same
 * saved card has its own. `inTime`: when it answers false, also after the transport's wait, nothing goes and the claim is given back.
 * Step 3's words follow `marking` for the card's child and `explain` (the explanation feature's own availability rule), read
 * before the claim, so the claim stores the words that are sent. A throw from `explain` counts as no explanation.
 */
export async function sendPlanStartEmail(db: SupabaseClient<Database>, p: { cardId: string; generation: number; price: number; firstChargeAt: string; origin: string }, transport?: MailTransport, inTime: () => boolean = () => true, marking: MarkingRead = productMarking, explain: () => boolean = () => explanationAvailable()): Promise<TimedDeliveryOutcome> {
  const { data: card, error } = await db.from("card_setups").select("parent_id, child_id").eq("id", p.cardId).maybeSingle();
  if (error || !card) throw Error("store_failed");
  const [parent, child] = await Promise.all([
    db.from("parents").select("name, email, postal, time_zone").eq("id", card.parent_id).maybeSingle(),
    db.from("children").select("first_name, province, grade").eq("id", card.child_id).eq("parent_id", card.parent_id).maybeSingle(),
  ]);
  if (parent.error || child.error || !parent.data || !child.data) throw Error("store_failed");
  const zone = familyZone({ timeZone: parent.data.time_zone, postal: parent.data.postal, province: familyProvince([{ id: card.child_id, province: child.data.province }]) });
  const terms = await db.from("plan_starts").select("monthly_cents,first_charge_at,family_terms,trial_end").eq("card_setup_id", p.cardId).eq("generation", p.generation).maybeSingle();
  if (terms.error) throw Error("store_failed");
  if (terms.data?.family_terms && (terms.data.monthly_cents == null || !terms.data.first_charge_at)) throw Error("Plan start terms incomplete");
  const price = terms.data?.monthly_cents == null ? p.price : terms.data.monthly_cents / 100;
  const chargeAt = terms.data?.first_charge_at ?? p.firstChargeAt;
  const free = !terms.data?.family_terms || !!terms.data.trial_end;
  const reminder = !terms.data?.family_terms || !!terms.data.trial_end && Date.parse(terms.data.trial_end) - Date.now() >= PLAN_REMINDER_DAYS * 86400000;
  const firstCharge = formatInZone(chargeAt, zone, { year: "numeric", month: "long", day: "numeric" });
  const marks = await markingOpen(marking, db, card.parent_id, card.child_id);
  let explains = false;
  try { explains = marks && explain() === true; } catch { explains = false; }
  const message: EmailMessage = {
    sender: { to: "parent" }, to: parent.data.email, replyTo: SUPPORT_EMAIL,
    ...planStartEmail({ parentName: parent.data.name, childName: child.data.first_name, grade: child.data.grade, price, firstCharge, marking: marks, explain: explains, ...(terms.data?.family_terms ? { sharedWindow: true, free, reminder } : {}) }),
  };
  return sendEmailOnceInTime(planStartEmailLedger(db, message), { cardId: p.cardId, generation: p.generation }, message, { transport, inTime });
}

/** A claim this old stopped with no outcome (the same limit as the dispatch's check of a welcome). The email may have gone. */
const SENDING_STOPPED_MS = 10 * 60 * 1000;

/**
 * After a busy send of a plan start's email: what that generation's claim says. `pending`: another run is still sending it, or a refused
 * send may be claimed again. `sent` and `unknown` are final. Throws when it cannot read.
 */
export async function planStartEmailClaim(db: SupabaseClient<Database>, cardId: string, generation: number, now = Date.now()): Promise<"pending" | "sent" | "unknown"> {
  const state = (status: string | null | undefined, claimedAt: string | null | undefined): "pending" | "sent" | "unknown" => {
    if (status === "sent") return "sent";
    if (status === "unknown" || status === "skipped") return "unknown";
    if (status === "sending" && claimedAt && now - Date.parse(claimedAt) >= SENDING_STOPPED_MS) return "unknown";
    return "pending";
  };
  if (generation > 0) {
    const { data, error } = await db.from("plan_starts").select("email_send_status, email_claimed_at, email_state").eq("card_setup_id", cardId).eq("generation", generation).maybeSingle();
    if (error) throw Error("store_failed");
    if (data?.email_state === "sent" || data?.email_state === "unknown") return data.email_state;
    if (data?.email_send_status) return state(data.email_send_status, data.email_claimed_at);
    if (generation > 1) return "pending";
  }
  // Generation 0 has only the old ledger. Generation 1 also respects a claim sent by an older deployment.
  const { data, error } = await db.from("workbook_emails").select("status, claimed_at").eq("card_setup_id", cardId).eq("kind", "plan_start").eq("workbook_number", 0).maybeSingle();
  if (error) throw Error("store_failed");
  return state(data?.status, data?.claimed_at);
}

export async function sendQueuedWorkbookWelcome(db: SupabaseClient<Database>, cardId: string, transport?: MailTransport) {
  const { data, error } = await db.from("workbook_emails").select("id").eq("card_setup_id", cardId).eq("kind", "welcome")
    .in("status", ["pending", "failed"]).lt("attempts", 3).maybeSingle();
  if (error) throw Error("store_failed");
  if (data) return sendWorkbookNotice(db, { cardId, kind: "welcome", workbookNumber: 0, delivery: null }, transport);
  return null;
}

/** A bounded Stripe read. A late read cannot record a card or send an email after this returns unknown. */
async function boundedCheck(work: Promise<StripeAnswer>): Promise<StripeAnswer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<StripeAnswer>((resolve) => { timer = setTimeout(() => resolve({ state: "unknown" }), 6000); })]);
  } finally { clearTimeout(timer); }
}

/** Recovers a closed Checkout tab and pending welcomes. Old signups are excluded until an admin acts explicitly. */
export async function runWorkbookWelcomes(db: SupabaseClient<Database>, { transport, dry = false, cards: suppliedCards }: { transport?: MailTransport; dry?: boolean; cards?: SavedCards } = {}) {
  const eligible = (head = false) => db.from("workbook_emails")
    .select("card_setup_id, parent:parents!inner(deletion_requested_at)", { count: "exact", head })
    .eq("kind", "welcome").in("status", ["pending", "failed"]).lt("attempts", 3).is("parent.deletion_requested_at", null);
  const pending = await eligible(true);
  if (pending.error) throw Error("store_failed");
  if (dry) return { pending: pending.count ?? 0, checked: 0, sent: 0 };
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const s = stripeKey ? new Stripe(stripeKey, { timeout: 4000, maxNetworkRetries: 0 }) : null;
  const cards = suppliedCards ?? (s ? savedCards(db, s) : null);
  let checked = 0;
  if (cards) {
    const candidates = await db.from("card_setups").select("id, stripe_customer_id, parent:parents!inner(deletion_requested_at)").eq("workbook_welcome_enabled", true)
      .is("card_saved_at", null).not("stripe_customer_id", "is", null).is("parent.deletion_requested_at", null)
      .order("workbook_email_checked_at", { nullsFirst: true }).order("id").limit(2);
    if (candidates.error) throw Error("store_failed");
    for (const row of candidates.data ?? []) {
      const touched = await db.from("card_setups").update({ workbook_email_checked_at: new Date().toISOString() }).eq("id", row.id);
      if (touched.error) continue;
      const answer = await boundedCheck(findSavedCard(row, cards.provider));
      checked++;
      if (answer.state === "saved") await recordSavedCard(answer.evidence, cards);
    }
  }
  const queued = await eligible().order("created_at").order("id").limit(2);
  if (queued.error) throw Error("store_failed");
  let sent = 0;
  for (const [i, row] of (queued.data ?? []).entries()) {
    if (i) await new Promise((resolve) => setTimeout(resolve, 600));
    try {
      const result = await sendQueuedWorkbookWelcome(db, row.card_setup_id, transport);
      if (result?.status === "sent") sent++;
    } catch {
      // A deletion or a transient error for one family must not stop the other notices in this batch.
      console.error("[workbook email] welcome remains queued", row.card_setup_id);
    }
  }
  return { pending: pending.count ?? 0, checked, sent };
}
